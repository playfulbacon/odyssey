// All drawing. Minimal palette, thin strokes, no textures.
//
// The visual language is documented at the top of entities.js. In short:
//   O and a cool hue = collectable; X and red = obstacle, and every obstacle is
//   red because every obstacle has the same answer: don't.
//   Orange is a state, not a family: it is every shield, and the boosted ball
//   and trail that strip one.
//   The ball says what it is doing with colour and nothing else — no ring, no
//   dots, no outline. The line says nothing at all: it is a faded dotted rail
//   between the paddles and it never changes.

import { CFG } from './config.js';
import { PALETTE, SHIELD, stateColorOf, ballColorFor } from './entities.js';

const INK = PALETTE.ink;
const ORANGE = PALETTE.boost;
const RED = PALETTE.hazard;
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

// The rail between the paddles: faded ink dots, and that is the only way it is
// ever drawn. It is scenery — it shows you where the ball can go, not what
// anybody is doing.
export function railStroke(ctx, S) {
  ctx.strokeStyle = INK;
  ctx.globalAlpha *= 0.4;
  ctx.lineWidth = 1.6 * S;
  ctx.lineCap = 'round';
  ctx.setLineDash([1.5 * S, 4.5 * S]);
}

// ── the two family glyphs ───────────────────────────────────────────────────

function pathO(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function pathX(ctx, x, y, r) {
  const k = r * 0.72;
  ctx.beginPath();
  ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
  ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
}

// A shield: one arc segment per layer left, in the colour of the ball that
// strips it. Spent layers stay as ghosts of themselves so you can always see
// how deep the piece was.
function segRing(ctx, x, y, r, total, left, S) {
  if (!total) return;
  // save/restore, or the shield's stroke leaks onto the body drawn after it.
  ctx.save();
  ctx.strokeStyle = SHIELD.color;
  ctx.globalAlpha *= 0.95;
  ctx.lineWidth = 2.7 * S;
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);
  const lit = ctx.globalAlpha;
  const gap = total > 1 ? 0.18 : 0;
  const span = TAU / total - gap;
  for (let i = 0; i < total; i++) {
    const a0 = -Math.PI / 2 + i * (TAU / total) + gap / 2;
    ctx.globalAlpha = lit * (i < left ? 1 : 0.13);
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a0 + span);
    ctx.stroke();
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

  drawPaddle(ctx, g, A, g.input.a, +1);
  drawPaddle(ctx, g, B, g.input.b, -1);

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

// The ball is the readout: whichever state it is in is the shield it can strip,
// and it is drawn as that shield's colour.
function ballKeys(g) {
  const state = g.phase === 'play' ? g.ball.state : 'normal';
  return { state, color: ballColorFor(state) };
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

// One stroke, always the same: faded ink dots from paddle to paddle. The line
// is the rail the ball runs on and nothing else — it does not report who is
// holding, and it has no halves. Everything worth knowing is on the ball.
function drawLine(ctx, g, A, B) {
  ctx.save();
  railStroke(ctx, g.S);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
  ctx.stroke();
  ctx.restore();
}

function drawPaddle(ctx, g, P, p, inward) {
  const w = g.paddleW, h = g.paddleH, S = g.S;
  ctx.save();
  ctx.globalAlpha = p.touching ? 1 : 0.5;
  ctx.fillStyle = INK;
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
    // neither of them has to read text meant for the other.
    // Solid means held, dashed means not. No colour needed — violet is spoken
    // for, and this has nothing to do with breaking rings.
    // This is the one place a hold is still reported, because during the ritual
    // it is the only thing either player needs to know. It came off the line.
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

  // Colour alone is the state. No halo, no outline, no dots — if the ball is
  // orange it can strip a shield, and there is nothing else to read.
  ctx.globalAlpha = 1;
  ctx.fillStyle = key.color;
  pathO(ctx, x, y, r);
  ctx.fill();
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

  if (e.cls === 'col') drawCollectable(ctx, g, e);
  else drawObstacle(ctx, g, e);

  // Telegraph: a piece is inert until this collapses onto it. It takes the
  // shape of whatever is landing, so a slab never announces itself as a circle.
  if (e.spawnT > 0) {
    const k = Math.min(1, e.spawnT / 1.2);
    ctx.globalAlpha = 0.5 * (1 - k * 0.4);
    ctx.strokeStyle = stateColorOf(e);
    ctx.lineWidth = 1 * S;
    ctx.setLineDash([3 * S, 4 * S]);
    if (e.shape === 'rect') {
      const pad = 14 * S * k;
      roundRect(ctx, e.x - e.w / 2 - pad, e.y - e.h / 2 - pad, e.w + pad * 2, e.h + pad * 2, 3 * S);
    } else {
      pathO(ctx, e.x, e.y, (e.r || 18 * S) * (1 + k * 1.5));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawCollectable(ctx, g, e) {
  const S = g.S;
  const baseA = ctx.globalAlpha;

  // Shields live here now, and nowhere else. One orange arc per layer left,
  // outside the body — the piece underneath is the same cool O either way,
  // because what is behind the rings is never in doubt.
  segRing(ctx, e.x, e.y, e.r + 3 * S, e.hpMax, e.hp, S);

  ctx.strokeStyle = e.color;
  ctx.fillStyle = e.color;

  const pulse = 1 + Math.sin(e.age * 9) * 0.12;
  pathO(ctx, e.x, e.y, e.r * 0.62 * pulse);
  ctx.fill();

  // The outgoing pulse only plays on a piece you can actually take. Behind a
  // shield it would be an invitation to something that does nothing.
  if (!e.hp) {
    ctx.globalAlpha = baseA * 0.4;
    ctx.lineWidth = 1.2 * S;
    pathO(ctx, e.x, e.y, e.r * (0.7 + ((e.age * 1.6) % 1) * 0.6));
    ctx.stroke();
    ctx.globalAlpha = baseA;
  }

  if (e.vx || e.vy) {
    const m = Math.hypot(e.vx, e.vy) || 1;
    ctx.globalAlpha = baseA * 0.4;
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - (e.vx / m) * e.r * 1.9, e.y - (e.vy / m) * e.r * 1.9);
    ctx.stroke();
    ctx.globalAlpha = baseA;
  }
}

function drawObstacle(ctx, g, e) {
  const S = g.S;
  const baseA = ctx.globalAlpha;
  const col = stateColorOf(e);

  if (e.flare) ctx.globalAlpha = Math.min(1, baseA + e.flare * 0.6);
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
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
      // Repeat the X along the body so a long slab still reads as an obstacle.
      ctx.globalAlpha = baseA;
      ctx.lineWidth = 1.5 * S;
      const along = e.horiz ? e.w : e.h;
      const n = Math.max(1, Math.round(along / (k * 3.4)));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n - 0.5;
        pathX(ctx, e.x + (e.horiz ? f * e.w : 0), e.y + (e.horiz ? 0 : f * e.h), k);
        ctx.stroke();
      }
      // A stub out the back of a moving one, the same tell the drifter wears.
      if (e.vx || e.vy) {
        const m = Math.hypot(e.vx, e.vy) || 1;
        ctx.globalAlpha = baseA * 0.45;
        ctx.lineWidth = 1.5 * S;
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

  text(ctx, endless ? `${g.score}` : `${g.score} / ${g.target}`, 0, -3 * S,
    { size: 13 * S, color: INK, alpha: 0.85, ls: 0.5 });

  text(ctx, `x${g.mult}   ${endless ? 'PLAYGROUND' : fmtTime(g.timeLeft)}`, 0, 9 * S,
    { size: 9 * S, color: DIM, alpha: 0.95, ls: 1.2 });

  if (endless) return;

  const w = 100 * S;
  ctx.save();
  ctx.globalAlpha = 0.22; ctx.fillStyle = INK;
  ctx.fillRect(-w / 2, 14 * S, w, 1.6 * S);
  // Ink, not orange: the HUD is furniture, and orange has a job on the field.
  ctx.globalAlpha = 0.95; ctx.fillStyle = INK;
  ctx.fillRect(-w / 2, 14 * S, w * Math.min(1, g.score / g.target), 1.6 * S);
  ctx.restore();

  const n = g.livesMax, sp = 9 * S;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = i < g.lives ? 0.9 : 0.18;
    ctx.fillStyle = i < g.lives ? RED : INK;
    ctx.beginPath();
    ctx.arc((i - (n - 1) / 2) * sp, -13 * S, 2.3 * S, 0, TAU);
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
