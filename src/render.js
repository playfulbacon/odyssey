// All drawing. Minimal palette, thin strokes, no textures.
//
// The HUD and every in-game prompt is drawn twice around the middle of the
// screen — once for each player — with the far copy rotated 180°, because the
// two of them are sitting on opposite sides of the phone.

import { CFG } from './config.js';

const INK = '#e9ecef';
const DIM = '#6d737b';
const BG = '#08090b';

function alpha(ctx, a, fn) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  fn();
  ctx.globalAlpha = prev;
}

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

// ── entry point ─────────────────────────────────────────────────────────────

export function render(ctx, g) {
  const { W, H, S } = g;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  if (g.mode === 'idle') return;

  // HUD goes down first so the line and the ball sweep over the top of it
  // rather than fighting it for the middle of the screen.
  drawFaces(ctx, g);

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
    alpha(ctx, Math.min(1, g.flash) * 0.22, () => {
      ctx.fillStyle = g.flashColor;
      ctx.fillRect(0, 0, W, H);
    });
  }
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
  ctx.setLineDash([]);
  ctx.restore();
}

// The line is drawn as two halves so each player can see, at a glance, whether
// their own finger is on the glass.
function drawLine(ctx, g, A, B) {
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const seg = (P, Q, on) => {
    ctx.save();
    ctx.globalAlpha = on ? 0.92 : 0.2;
    ctx.strokeStyle = on ? INK : '#9aa1aa';
    ctx.lineWidth = (on ? 1.4 : 1) * g.S;
    ctx.beginPath();
    ctx.moveTo(P.x, P.y); ctx.lineTo(Q.x, Q.y);
    ctx.stroke();
    ctx.restore();
  };
  seg(A, M, g.input.a.touching);
  seg(M, B, g.input.b.touching);
}

function drawPaddle(ctx, g, P, p, inward) {
  const w = g.paddleW, h = g.paddleH, S = g.S;
  ctx.save();
  ctx.globalAlpha = p.touching ? 1 : 0.42;
  ctx.fillStyle = INK;
  roundRect(ctx, P.x - w / 2, P.y - h / 2, w, h, CFG.paddle.round * S);
  ctx.fill();

  // A short flare while the lift is still shoving.
  if (p.boostT > 0) {
    const k = p.boostT / Math.max(0.001, g.input.boostDur);
    ctx.globalAlpha = k * 0.8;
    ctx.strokeStyle = '#57e2c0';
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    const y = P.y + inward * -1 * (h / 2 + 5 * S);
    ctx.moveTo(P.x - w / 2 * k, y);
    ctx.lineTo(P.x + w / 2 * k, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx, g, A, B) {
  const S = g.S, r = g.ballR;
  const t = g.ball.t;
  let x = A.x + (B.x - A.x) * t;
  let y = A.y + (B.y - A.y) * t;

  // While waiting to launch, perch it on top of the paddle rather than inside.
  if (g.phase === 'launch') y += (t >= 0.5 ? 1 : -1) * (g.paddleH / 2 + r * 0.9);

  ctx.save();
  const n = g.ball.trail.length;
  for (let i = 0; i < n; i++) {
    const p = g.ball.trail[i];
    const k = (i + 1) / n;
    ctx.globalAlpha = k * 0.3;
    ctx.fillStyle = p.b ? '#57e2c0' : INK;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * k * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = g.ball.boosted ? '#57e2c0' : INK;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  if (g.ball.boosted) {
    ctx.strokeStyle = '#57e2c0';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    ctx.arc(x, y, r + 4 * S, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Both hands off — the state the PHANTOM wants. Mark it on the ball.
  if (g.input.handsOff && g.phase === 'play') {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#b98cff';
    ctx.lineWidth = 1 * S;
    ctx.setLineDash([2 * S, 3 * S]);
    ctx.beginPath();
    ctx.arc(x, y, r + 7 * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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

  // Telegraph ring: a piece is inert until this collapses onto it.
  if (e.spawnT > 0) {
    const k = Math.min(1, e.spawnT / 1.2);
    ctx.globalAlpha = 0.5 * (1 - k * 0.4);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 1 * S;
    ctx.setLineDash([3 * S, 4 * S]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.r || 18 * S) * (1 + k * 1.5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawShield(ctx, g, e) {
  if (!e.shieldMax) return;
  const S = g.S;
  const n = e.shieldMax;
  const gap = 0.16;
  const span = (Math.PI * 2) / n - gap;
  const baseA = ctx.globalAlpha;
  ctx.lineWidth = 2.4 * S;
  ctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / n) + gap / 2;
    ctx.globalAlpha = baseA * (i < e.shield ? 0.95 : 0.13);
    ctx.strokeStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, a0, a0 + span);
    ctx.stroke();
  }
  ctx.globalAlpha = baseA;
}

function poly(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function drawCollectable(ctx, g, e) {
  const S = g.S;
  const baseA = ctx.globalAlpha;
  drawShield(ctx, g, e);
  ctx.globalAlpha = baseA;

  const cr = e.r * 0.44;
  ctx.strokeStyle = e.color;
  ctx.fillStyle = e.color;
  ctx.lineWidth = 1.4 * S;

  const shape = (r) => {
    if (e.type === 'splitter') poly(ctx, e.x, e.y, r, 6, Math.PI / 6);
    else if (e.type === 'runner') poly(ctx, e.x, e.y, r * 1.15, 4, Math.PI / 4);
    else { ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); }
  };

  if (e.exposed) {
    const pulse = 1 + Math.sin(e.age * 9) * 0.12;
    shape(cr * pulse);
    ctx.fill();
    ctx.globalAlpha = baseA * 0.35;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (0.6 + ((e.age * 1.6) % 1) * 0.6), 0, Math.PI * 2);
    ctx.stroke();
  } else {
    shape(cr);
    ctx.stroke();
  }

  if (e.type === 'drifter' && (e.vx || e.vy)) {
    const m = Math.hypot(e.vx, e.vy) || 1;
    ctx.globalAlpha = baseA * 0.3;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - (e.vx / m) * e.r * 1.7, e.y - (e.vy / m) * e.r * 1.7);
    ctx.stroke();
  }
}

function drawObstacle(ctx, g, e) {
  const S = g.S;
  const baseA = ctx.globalAlpha;
  ctx.strokeStyle = e.color;
  ctx.fillStyle = e.color;
  ctx.lineWidth = 1.5 * S;

  if (e.flare) ctx.globalAlpha = Math.min(1, baseA + e.flare * 0.6);

  switch (e.type) {
    case 'slab': {
      const x = e.x - e.w / 2, y = e.y - e.h / 2;
      ctx.globalAlpha = baseA * 0.14;
      roundRect(ctx, x, y, e.w, e.h, 2 * S); ctx.fill();
      ctx.globalAlpha = baseA * 0.9;
      roundRect(ctx, x, y, e.w, e.h, 2 * S); ctx.stroke();
      ctx.globalAlpha = baseA * 0.35;
      ctx.lineWidth = 1 * S;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, e.w, e.h); ctx.clip();
      for (let i = -e.h; i < e.w + e.h; i += 7 * S) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + e.h);
        ctx.lineTo(x + i + e.h, y);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'brittle': {
      drawArmour(ctx, g, e);
      ctx.globalAlpha = baseA * 0.16;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = baseA;
      ctx.lineWidth = 1.4 * S;
      const k = e.r * 0.34;
      ctx.beginPath();
      ctx.moveTo(e.x - k, e.y - k); ctx.lineTo(e.x + k, e.y + k);
      ctx.moveTo(e.x + k, e.y - k); ctx.lineTo(e.x - k, e.y + k);
      ctx.stroke();
      break;
    }

    case 'phantom': {
      const open = g.input.handsOff && g.phase === 'play';
      drawArmour(ctx, g, e);
      ctx.globalAlpha = baseA * (open ? 0.3 : 0.08);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = baseA * (open ? 1 : 0.5);
      ctx.setLineDash(open ? [] : [3 * S, 4 * S]);
      ctx.lineWidth = 1.4 * S;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }

    case 'pulsar': {
      drawArmour(ctx, g, e, e.rBig + 5 * S);
      const flick = e.warn && Math.floor(e.age * 18) % 2 === 0;
      if (e.armed || flick) {
        ctx.globalAlpha = baseA * 0.28;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.rBig, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = baseA;
        ctx.lineWidth = 1.8 * S;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.rBig, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = baseA * 0.55;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.rSmall, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = baseA * 0.22;
        ctx.setLineDash([2 * S, 5 * S]);
        ctx.lineWidth = 1 * S;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.rBig, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
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
        ctx.beginPath();
        ctx.arc(nx, ny, e.thick * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(e.x, e.y, e.hubR, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'butt';
      break;
    }
  }
  ctx.globalAlpha = baseA;
}

// Segmented ring showing how much armour is left on a breakable obstacle.
function drawArmour(ctx, g, e, radius) {
  if (!e.hpMax) return;
  const S = g.S;
  const r = radius || e.r;
  const n = e.hpMax;
  const gap = 0.2;
  const span = (Math.PI * 2) / n - gap;
  const baseA = ctx.globalAlpha;
  ctx.lineWidth = 2.6 * S;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / n) + gap / 2;
    ctx.globalAlpha = baseA * (i < e.hp ? 0.95 : 0.12);
    ctx.strokeStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, a0, a0 + span);
    ctx.stroke();
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
    const k = f.life / f.max;
    // Drawn both ways up so neither player has to read it upside down.
    text(ctx, f.text, f.x, f.y, { size: 11 * g.S, color: f.color, alpha: k, ls: 0.5 });
    ctx.save();
    ctx.translate(f.x, f.y + 14 * g.S);
    ctx.rotate(Math.PI);
    text(ctx, f.text, 0, 0, { size: 11 * g.S, color: f.color, alpha: k * 0.45, ls: 0.5 });
    ctx.restore();
  }
}

// ── HUD, drawn once per player ──────────────────────────────────────────────

function drawFaces(ctx, g) {
  const S = g.S;
  const gap = 7 * S;
  const paint = (who) => (g.phase === 'launch' ? drawLaunchFace(ctx, g, who) : drawHudFace(ctx, g));

  ctx.save();
  ctx.translate(g.W / 2, g.H / 2 + gap);
  paint('a');
  ctx.restore();

  ctx.save();
  ctx.translate(g.W / 2, g.H / 2 - gap);
  ctx.rotate(Math.PI);
  paint('b');
  ctx.restore();
}

function drawHudFace(ctx, g) {
  const S = g.S;
  const endless = g.mode === 'playground';

  const head = endless ? `${g.score}` : `${g.score} / ${g.target}`;
  text(ctx, head, 0, 12 * S, { size: 13 * S, color: INK, alpha: 0.7, ls: 0.5 });

  const bits = [`x${g.mult}`, endless ? 'PLAYGROUND' : fmtTime(g.timeLeft)];
  text(ctx, bits.join('   '), 0, 26 * S, { size: 9 * S, color: DIM, alpha: 0.85, ls: 1.2 });

  // score progress
  if (!endless) {
    const w = 110 * S, y = 33 * S;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = INK;
    ctx.fillRect(-w / 2, y, w, 1.5 * S);
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#57e2c0';
    ctx.fillRect(-w / 2, y, w * Math.min(1, g.score / g.target), 1.5 * S);
    ctx.restore();

    // lives
    const n = g.livesMax, r = 2.2 * S, sp = 9 * S;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc((i - (n - 1) / 2) * sp, 42 * S, r, 0, Math.PI * 2);
      ctx.globalAlpha = i < g.lives ? 0.9 : 0.2;
      ctx.fillStyle = i < g.lives ? '#ff5a5f' : INK;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawLaunchFace(ctx, g, who) {
  const S = g.S;
  if (g.banner) {
    text(ctx, g.banner, 0, 4 * S, { size: 9 * S, color: '#ff5a5f', alpha: 0.9, ls: 2.4 });
  }
  text(ctx, 'BOTH HOLD', 0, 20 * S, { size: 13 * S, color: INK, alpha: 0.9, ls: 2.4 });

  const w = 120 * S, y = 30 * S, h = 3 * S;
  const k = g.holdT / CFG.launch.hold;
  ctx.save();
  ctx.globalAlpha = 0.22; ctx.fillStyle = INK;
  ctx.fillRect(-w / 2, y, w, h);
  ctx.globalAlpha = 1; ctx.fillStyle = '#57e2c0';
  ctx.fillRect(-w / 2, y, w * k, h);
  ctx.restore();

  // Which side is still missing.
  const mark = (x, on, label) => {
    ctx.save();
    ctx.globalAlpha = on ? 0.9 : 0.25;
    ctx.fillStyle = on ? '#57e2c0' : INK;
    ctx.beginPath();
    ctx.arc(x, 41 * S, 2.6 * S, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, label, x + 9 * S, 41 * S, { size: 7.5 * S, color: on ? '#57e2c0' : DIM, align: 'left', ls: 1 });
    ctx.restore();
  };
  // "NEAR" is always whoever is reading this copy of the prompt.
  const me = g.input[who];
  const them = g.input[who === 'a' ? 'b' : 'a'];
  mark(-30 * S, me.touching, 'YOU');
  mark(14 * S, them.touching, 'THEM');
}
