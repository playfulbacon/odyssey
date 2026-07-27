// All drawing. Minimal palette, thin strokes, no textures.
//
// The visual language is documented at the top of entities.js. In short:
//   gold O = gold; red X = an obstacle; a pink ring with a numeral in it = an
//   enemy, and the numeral is its strength.
//   Orange is boost, wherever it appears: the boosting ball, the paddle whose
//   shove is up next, and a shield's weak point.
//   Steel is shield plating — inert, and the one thing on the field that is
//   neither a threat nor a prize.
//   The ball says what it is doing with colour and nothing else, and carries
//   its own strength as a numeral so the comparison is right there.

import { CFG } from './config.js';
import { PALETTE, shieldSpans, weakAngle, ballColorFor } from './entities.js';

const INK = PALETTE.ink;
const ORANGE = PALETTE.boost;
const RED = PALETTE.hazard;
const GOLD = PALETTE.gold;
const PINK = PALETTE.enemy;
const PLATE = PALETTE.plate;
const DIM = '#6d737b';
const BG = '#08090b';
const TAU = Math.PI * 2;

function text(ctx, str, x, y, o = {}) {
  const size = o.size || 12;
  ctx.save();
  ctx.font = `${o.weight || 400} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.baseline || 'middle';
  ctx.fillStyle = o.color || INK;
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (o.ls != null && 'letterSpacing' in ctx) ctx.letterSpacing = `${o.ls}px`;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const fmtTime = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// The rail between the paddles: faded dots, drawn one at a time because each
// one carries its own colour. This sets everything they share.
export function railStroke(ctx, S) {
  ctx.strokeStyle = INK;
  ctx.globalAlpha *= RAIL_ALPHA;
  ctx.lineWidth = 1.6 * S;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
}

export const RAIL_DOT = 1.5;      // length of one dot, before scale
export const RAIL_GAP = 6;        // dot-to-dot spacing, before scale
const RAIL_ALPHA = 0.4;           // how faint a cold dot is
const RAIL_REACH = 0.34;          // how far down the rail the heat carries

// Heat at `u`, the fraction of the rail away from the hot paddle. Squared, so
// the glow is unmistakably *near* that end rather than a wash over everything.
export function railHeat(u) {
  if (u >= RAIL_REACH) return 0;
  const k = 1 - u / RAIL_REACH;
  return k * k;
}

// Ink → orange, precomputed once so the rail costs no string work per frame.
const chan = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
const mix = (a, b, t) => '#' + [0, 1, 2]
  .map((i) => Math.round(chan(a, i) + (chan(b, i) - chan(a, i)) * t).toString(16).padStart(2, '0'))
  .join('');
const RAIL_RAMP = Array.from({ length: 17 }, (_, i) => mix(INK, ORANGE, i / 16));

// ── the two family glyphs ───────────────────────────────────────────────────

function pathO(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function pathPoly(ctx, x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function pathX(ctx, x, y, r) {
  const k = r * 0.72;
  ctx.beginPath();
  ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
  ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
}

// A shield: steel plating everywhere except the weak points, which are orange
// because orange has meant "boost goes here" all along. Both the plate spans
// and the gaps come out of shieldSpans(), which is the same table the contact
// rule reads — so the hole you can see is exactly the hole that is there.
function drawShield(ctx, e, S) {
  if (!e.weak.length) return;
  const { gaps, plate } = shieldSpans(e);

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);
  const baseA = ctx.globalAlpha;

  ctx.strokeStyle = PLATE;
  ctx.globalAlpha = baseA * 0.9;
  ctx.lineWidth = 4 * S;
  for (const [a0, a1] of plate) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.shieldR, a0, a1);
    ctx.stroke();
  }

  // The gap, drawn as a slightly heavier orange lip on each side of the hole,
  // so the opening reads as a mouth rather than a missing piece.
  ctx.strokeStyle = ORANGE;
  ctx.globalAlpha = baseA;
  ctx.lineWidth = 3 * S;
  for (const gp of gaps) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.shieldR, gp.a0, gp.a1);
    ctx.stroke();

    // A stub pointing out the way in, along the axis the weak point faces.
    const c = weakAngle(gp.side);
    const ux = Math.cos(c), uy = Math.sin(c);
    ctx.globalAlpha = baseA * 0.75;
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.moveTo(e.x + ux * (e.shieldR + 3 * S), e.y + uy * (e.shieldR + 3 * S));
    ctx.lineTo(e.x + ux * (e.shieldR + 9 * S), e.y + uy * (e.shieldR + 9 * S));
    ctx.stroke();
    ctx.globalAlpha = baseA;
  }
  ctx.restore();
}

// ── entry point ─────────────────────────────────────────────────────────────

export function render(ctx, g) {
  const { W, H } = g;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  if (g.mode === 'idle') return;

  // The HUD goes down first so the line and the ball sweep over it.
  drawHud(ctx, g);

  ctx.save();
  if (g.shake > 0.15) {
    ctx.translate((Math.random() - 0.5) * g.shake * 2, (Math.random() - 0.5) * g.shake * 2);
  }

  drawTerritory(ctx, g);

  const A = g.paddleAPos(), B = g.paddleBPos();
  drawLine(ctx, g, A, B);

  for (const e of g.entities) drawEntity(ctx, g, e);

  drawPaddle(ctx, g, A, g.input.a, +1, 'a');
  drawPaddle(ctx, g, B, g.input.b, -1, 'b');

  drawBall(ctx, g, A, B);
  drawParticles(ctx, g);
  drawFloaters(ctx, g);

  ctx.restore();

  if (g.flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, g.flash) * 0.22;
    ctx.fillStyle = g.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// The ball is the readout: orange while a shove is behind it, ink otherwise.
// Its strength rides on it as a numeral, and that number goes up the moment it
// turns orange — the colour and the number say the same thing twice.
function ballKeys(g) {
  const state = g.phase === 'play' ? g.ball.state : 'normal';
  const strength = (g.strength || 0) + (state === 'boost' ? (g.boostStrength || 0) : 0);
  return { state, strength, color: ballColorFor(state) };
}

// ── field furniture ─────────────────────────────────────────────────────────

function drawTerritory(ctx, g) {
  const { W, H, S } = g;
  ctx.save();
  ctx.strokeStyle = '#1b1e23';
  ctx.lineWidth = 1;
  ctx.setLineDash([3 * S, 7 * S]);
  ctx.beginPath();
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.restore();
}

// Faded dots from paddle to paddle. The rail still says nothing about who is
// holding — it has no halves and never will. What it does say is which end the
// ball last came off: orange bleeds a little way down the rail from the hot
// paddle and washes out into ink, pointing the way the ball is running. Only
// one end is ever hot, because the ball can only have left one of them.
function drawLine(ctx, g, A, B) {
  const S = g.S;
  const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
  const dot = RAIL_DOT * S, gap = RAIL_GAP * S;
  const hotAtB = g.lastPaddle === 'b';

  // Centre the run of dots, so the pattern is symmetric end to end and the two
  // paddles are inset alike however long the rail happens to be.
  const n = Math.max(1, Math.floor((len - dot) / gap) + 1);
  const start = (len - ((n - 1) * gap + dot)) / 2;

  ctx.save();
  railStroke(ctx, S);
  for (let i = 0; i < n; i++) {
    const d = start + i * gap;
    // Distance of this dot from the hot end, as a fraction of the whole rail.
    const mid = (d + dot / 2) / len;
    const k = railHeat(hotAtB ? 1 - mid : mid);
    ctx.strokeStyle = RAIL_RAMP[Math.round(k * 16)];
    ctx.globalAlpha = RAIL_ALPHA + (1 - RAIL_ALPHA) * 0.72 * k;
    ctx.beginPath();
    ctx.moveTo(A.x + ux * d, A.y + uy * d);
    ctx.lineTo(A.x + ux * (d + dot), A.y + uy * (d + dot));
    ctx.stroke();
  }
  ctx.restore();
}

function drawPaddle(ctx, g, P, p, inward, side) {
  const w = g.paddleW, h = g.paddleH, S = g.S;
  // The end the ball last came off wears the boost colour, and it is the honest
  // one to wear it: the ball is running away from this player, so theirs is the
  // lift that shoves it. Orange means "your shove is here" — so the moment they
  // spend it the paddle goes dark and the colour moves onto the flare and the
  // ball. It lights again when the shove runs out and another one is available.
  const hot = g.lastPaddle === side && p.boostT <= 0;
  ctx.save();
  ctx.globalAlpha = p.touching ? 1 : 0.5;
  ctx.fillStyle = hot ? ORANGE : INK;
  roundRect(ctx, P.x - w / 2, P.y - h / 2, w, h, CFG.paddle.round * S);
  ctx.fill();

  const y = P.y - inward * (h / 2 + 5 * S);

  // An orange flare while the lift is still shoving, matching the ball.
  if (p.boostT > 0) {
    const k = p.boostT / Math.max(0.001, g.input.boostDur);
    ctx.globalAlpha = k * 0.85;
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 1.6 * S;
    ctx.beginPath();
    ctx.moveTo(P.x - (w / 2) * k, y);
    ctx.lineTo(P.x + (w / 2) * k, y);
    ctx.stroke();
  } else if (g.phase === 'launch') {
    // During the launch ritual each paddle reports its own player's hold, so
    // neither of them has to read text meant for the other. Solid means held,
    // dashed means not — no colour, because orange is spoken for and this has
    // nothing to do with shoving anything.
    //
    // It is the only place in the game where a touch is reported at all.
    ctx.globalAlpha = p.touching ? 0.9 : 0.3;
    ctx.strokeStyle = p.touching ? INK : DIM;
    ctx.lineWidth = 1.6 * S;
    ctx.setLineDash(p.touching ? [] : [3 * S, 4 * S]);
    ctx.beginPath();
    ctx.moveTo(P.x - w / 2, y);
    ctx.lineTo(P.x + w / 2, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawBall(ctx, g, A, B) {
  const S = g.S, r = g.ballR;
  const t = g.ball.t;
  const key = ballKeys(g);
  const x = A.x + (B.x - A.x) * t;
  let y = A.y + (B.y - A.y) * t;

  // While waiting to launch, perch it on top of the paddle rather than inside.
  if (g.phase === 'launch') y += (t >= 0.5 ? 1 : -1) * (g.paddleH / 2 + r * 0.9);

  ctx.save();
  // The trail is drawn in whatever the ball was at the time, so a shove leaves
  // an orange streak hanging in the air behind it — thicker and brighter than
  // the ordinary trail, because that is the moment worth seeing.
  const n = g.ball.trail.length;
  for (let i = 0; i < n; i++) {
    const p = g.ball.trail[i];
    const k = (i + 1) / n;
    ctx.globalAlpha = k * (p.boost ? 0.62 : 0.3);
    ctx.fillStyle = p.c || INK;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * k * (p.boost ? 0.95 : 0.75), 0, TAU);
    ctx.fill();
  }

  // Colour alone is the state — no halo, no outline, no dots. The numeral is a
  // different question: not what the ball is doing, but what it is worth in a
  // fight. Punched out of the fill so it cannot be mistaken for a piece.
  ctx.globalAlpha = 1;
  ctx.fillStyle = key.color;
  pathO(ctx, x, y, r);
  ctx.fill();
  text(ctx, String(key.strength), x, y + 0.5 * S,
    { size: r * 1.25, color: BG, weight: 700 });
  ctx.restore();
}

// ── entities ────────────────────────────────────────────────────────────────

function drawEntity(ctx, g, e) {
  const S = g.S;
  ctx.save();

  let a = 1;
  if (e.spawnT > 0) a *= 0.28;
  if (e.fade) a *= e.fade;
  ctx.globalAlpha = a;

  if (e.cls === 'gold') drawGold(ctx, g, e);
  else if (e.cls === 'enemy') drawEnemy(ctx, g, e);
  else drawObstacle(ctx, g, e);

  // Telegraph: a piece is inert until this collapses onto it. It takes the
  // shape of whatever is landing, so a slab never announces itself as a circle.
  if (e.spawnT > 0) {
    const k = Math.min(1, e.spawnT / 1.2);
    ctx.globalAlpha = 0.5 * (1 - k * 0.4);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 1 * S;
    ctx.setLineDash([3 * S, 4 * S]);
    if (e.shape === 'rect') {
      const pad = 14 * S * k;
      roundRect(ctx, e.x - e.w / 2 - pad, e.y - e.h / 2 - pad, e.w + pad * 2, e.h + pad * 2, 3 * S);
    } else {
      pathO(ctx, e.x, e.y, (e.shieldR || e.r || 18 * S) * (1 + k * 1.5));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// ── gold ────────────────────────────────────────────────────────────────────

function drawGold(ctx, g, e) {
  const S = g.S;
  const baseA = ctx.globalAlpha;
  ctx.strokeStyle = GOLD;
  ctx.fillStyle = GOLD;

  if (e.type === 'ore') {
    // A chunk, not a bead — a seam has to look like something you hit rather
    // than something you sweep up. One notch per charge still in it.
    ctx.globalAlpha = baseA * (0.16 + (e.flare || 0) * 0.3);
    pathPoly(ctx, e.x, e.y, e.r, 6, e.age * 0.25);
    ctx.fill();
    ctx.globalAlpha = baseA * 0.92;
    ctx.lineWidth = 2 * S;
    pathPoly(ctx, e.x, e.y, e.r, 6, e.age * 0.25);
    ctx.stroke();

    const n = e.chargesMax, sp = 6.5 * S;
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = baseA * (i < e.charges ? 1 : 0.16);
      pathO(ctx, e.x + (i - (n - 1) / 2) * sp, e.y, 2.1 * S);
      ctx.fill();
    }
    ctx.globalAlpha = baseA;
    return;
  }

  // A mote: a filled O with a pulse going out, because it is pure invitation.
  const pulse = 1 + Math.sin(e.age * 9) * 0.12;
  pathO(ctx, e.x, e.y, e.r * 0.62 * pulse);
  ctx.fill();
  ctx.globalAlpha = baseA * 0.4;
  ctx.lineWidth = 1.2 * S;
  pathO(ctx, e.x, e.y, e.r * (0.7 + ((e.age * 1.6) % 1) * 0.6));
  ctx.stroke();
  ctx.globalAlpha = baseA;
}

// ── enemies ─────────────────────────────────────────────────────────────────

// A pink ring with its strength written inside it. The numeral is the whole
// point of the piece: you read it, you read the one on the ball, and you know
// whether to shove or stay away.
function drawEnemy(ctx, g, e) {
  const S = g.S;
  const baseA = ctx.globalAlpha;
  if (e.flare) ctx.globalAlpha = Math.min(1, baseA + e.flare * 0.5);

  drawShield(ctx, e, S);

  ctx.strokeStyle = PINK;
  ctx.fillStyle = PINK;
  ctx.globalAlpha = baseA * 0.14;
  pathO(ctx, e.x, e.y, e.r); ctx.fill();
  ctx.globalAlpha = baseA * 0.95;
  ctx.lineWidth = 2 * S;
  pathO(ctx, e.x, e.y, e.r); ctx.stroke();

  text(ctx, String(e.strength), e.x, e.y + 0.5 * S,
    { size: e.r * 1.15, color: PINK, weight: 600 });
  ctx.globalAlpha = baseA;
}

// ── obstacles ───────────────────────────────────────────────────────────────

function drawObstacle(ctx, g, e) {
  const S = g.S;
  const baseA = ctx.globalAlpha;

  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 1.6 * S;

  switch (e.shape) {
    // SLAB and SHARD are the same drawing at two sizes — which is the point.
    // A shard is a chip off a slab, so it has to look like one.
    case 'rect': {
      const x = e.x - e.w / 2, y = e.y - e.h / 2;
      const k = Math.min(e.w, e.h) * 0.34;
      ctx.globalAlpha = baseA * 0.12;
      roundRect(ctx, x, y, e.w, e.h, 2 * S); ctx.fill();
      ctx.globalAlpha = baseA * 0.85;
      roundRect(ctx, x, y, e.w, e.h, 2 * S); ctx.stroke();
      ctx.globalAlpha = baseA;
      ctx.lineWidth = 1.5 * S;
      const along = e.horiz ? e.w : e.h;
      const n = Math.max(1, Math.round(along / (k * 3.4)));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n - 0.5;
        pathX(ctx, e.x + (e.horiz ? f * e.w : 0), e.y + (e.horiz ? 0 : f * e.h), k);
        ctx.stroke();
      }
      // A stub out the back of a moving one, so you can read where it is going.
      if (e.vx || e.vy) {
        const m = Math.hypot(e.vx, e.vy) || 1;
        ctx.globalAlpha = baseA * 0.45;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - (e.vx / m) * e.r * 2.1, e.y - (e.vy / m) * e.r * 2.1);
        ctx.stroke();
      }
      break;
    }

    case 'rotor': {
      ctx.lineCap = 'round';
      ctx.lineWidth = e.thick * 2;
      ctx.globalAlpha = baseA * 0.85;
      for (let i = 0; i < 2; i++) {
        const th = e.angle + i * Math.PI;
        const nx = e.x + Math.cos(th) * e.armLen;
        const ny = e.y + Math.sin(th) * e.armLen;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y); ctx.lineTo(nx, ny);
        ctx.stroke();
        // An X on each tip: the arms are as lethal as the hub.
        ctx.lineWidth = 1.5 * S;
        pathX(ctx, nx, ny, e.thick * 2.1); ctx.stroke();
        ctx.lineWidth = e.thick * 2;
      }
      ctx.lineCap = 'butt';
      ctx.globalAlpha = baseA * 0.16;
      pathO(ctx, e.x, e.y, e.hubR * 2); ctx.fill();
      ctx.globalAlpha = baseA;
      ctx.lineWidth = 1.7 * S;
      pathX(ctx, e.x, e.y, e.hubR * 1.5); ctx.stroke();
      break;
    }
  }
  ctx.globalAlpha = baseA;
}

// ── fx ──────────────────────────────────────────────────────────────────────

function drawParticles(ctx, g) {
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, g) {
  for (const f of g.floaters) {
    text(ctx, f.text, f.x, f.y, { size: 11 * g.S, color: f.color, alpha: f.life / f.max, ls: 0.5 });
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────────
//
// One instance only, standing on the left edge opposite the pause button and
// turned side-on, so it sits square to neither player and upside down for
// neither of them.

function drawHud(ctx, g) {
  const S = g.S;
  ctx.save();
  ctx.translate(24 * S, g.H / 2);
  ctx.rotate(-Math.PI / 2);   // local +x runs up the screen, local +y runs right
  if (g.phase === 'launch') drawLaunchStrip(ctx, g);
  else drawRunStrip(ctx, g);
  ctx.restore();
}

function drawRunStrip(ctx, g) {
  const S = g.S;
  const endless = g.mode === 'playground';

  // Points and gold are two different piles and are never added together, so
  // they are never shown together either. Points sit on the target line; gold
  // sits on its own, in gold.
  text(ctx, endless ? `${g.score}` : `${g.score} / ${g.target}`, 0, -3 * S,
    { size: 13 * S, color: INK, alpha: 0.85, ls: 0.5 });

  text(ctx, `${g.gold}g`, -46 * S, 9 * S,
    { size: 9 * S, color: GOLD, alpha: 0.95, ls: 1, align: 'left' });
  text(ctx, `x${g.mult}`, 0, 9 * S,
    { size: 9 * S, color: DIM, alpha: 0.95, ls: 1.2 });
  text(ctx, endless ? 'PLAYGROUND' : fmtTime(g.timeLeft), 46 * S, 9 * S,
    { size: 9 * S, color: DIM, alpha: 0.95, ls: 1.2, align: 'right' });

  // Health is the ball's, and it is the thing you are about to lose; lives are
  // how many more balls there are after this one. Two rows, never one.
  pips(ctx, g.health, g.healthMax, 18 * S, ORANGE, 6.5 * S, 2 * S);
  if (endless) return;

  const w = 100 * S;
  ctx.save();
  ctx.globalAlpha = 0.22; ctx.fillStyle = INK;
  ctx.fillRect(-w / 2, 25 * S, w, 1.6 * S);
  // Ink, not orange: the HUD is furniture, and orange has a job on the field.
  ctx.globalAlpha = 0.95; ctx.fillStyle = INK;
  ctx.fillRect(-w / 2, 25 * S, w * Math.min(1, g.score / g.target), 1.6 * S);
  ctx.restore();

  pips(ctx, g.lives, g.livesMax, -13 * S, RED, 9 * S, 2.3 * S);
}

// A row of filled-then-hollow dots, centred on the strip.
function pips(ctx, left, total, y, color, sp, r) {
  if (!Number.isFinite(total) || total <= 0) return;
  const n = Math.min(total, 12);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = i < left ? 0.9 : 0.18;
    ctx.fillStyle = i < left ? color : INK;
    ctx.beginPath();
    ctx.arc((i - (n - 1) / 2) * sp, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLaunchStrip(ctx, g) {
  const S = g.S;
  text(ctx, 'BOTH HOLD', 0, -3 * S, { size: 11 * S, color: INK, alpha: 0.9, ls: 2.2 });
  if (g.banner) {
    text(ctx, g.banner, 0, 8 * S, { size: 8 * S, color: RED, alpha: 0.9, ls: 2 });
  }

  const w = 100 * S, k = g.holdT / CFG.launch.hold;
  ctx.save();
  ctx.globalAlpha = 0.22; ctx.fillStyle = INK;
  ctx.fillRect(-w / 2, 14 * S, w, 2.6 * S);
  ctx.globalAlpha = 1; ctx.fillStyle = INK;
  ctx.fillRect(-w / 2, 14 * S, w * k, 2.6 * S);
  ctx.restore();
}
