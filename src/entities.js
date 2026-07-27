// Entity registry, factories, per-frame behaviour and hit tests.
//
// Two families:
//   cls 'col' — collectables. Touch one and it is banked. That is all.
//   cls 'obs' — obstacles. Lethal unless you meet their gate, and the only
//               things in the game that wear a shield.
//
// Every entity is collided against as a circle except SLAB (a rectangle) and
// ROTOR (a hub plus swept arms).
//
// ── the visual language ─────────────────────────────────────────────────────
//
// Shape names the family:
//   O  collectable — bank it
//   X  obstacle    — it will cost you a life
//
// Temperature names the family a second time, so it reads at a glance and does
// not depend on picking out a shape at speed:
//   cool  collectable. Hue is identity only — a MOTE is not "more mint" than a
//         DRIFTER is blue, they are just the still one and the moving one.
//   warm  obstacle. Hue is *not* identity: it names the gate, the one thing
//         that gets you past it. Two obstacles with the same gate share a hue.
//
// Every breakable obstacle wears a shield, and the shield says what opens it —
// see SHIELDS. There are two kinds and they look nothing alike:
//   boost shield  violet, solid. Stripped by a boosted ball.
//   ghost shield  gold, dotted. Stripped by a ghosted ball — one drifting with
//                 nobody holding the glass.
//
// The ball is the only thing that carries a state, and it wears it: violet
// while it is boosting, gold while it is ghosting, ink otherwise. So the ball's
// colour is always the shield it can strip, and nothing else on the field
// changes colour to say so — the line stays ink throughout.

export const PALETTE = {
  ink: '#e9ecef',
  ring: '#b98cff',   // the boosted ball, and the shield only it can strip
};

// Warm. The key is the gate an obstacle carries, so an obstacle cannot be given
// a colour that disagrees with how it actually opens — the colour is derived.
export const GATES = {
  never:    { color: '#ff4a55', label: 'nothing gets through' },
  boosted:  { color: '#ff9633', label: 'a boosted ball' },
  handsOff: { color: '#ffcf3d', label: 'both fingers off the glass' },
  dark:     { color: '#ff5fa8', label: 'its dark window' },
};

// Cool. Identity only.
export const COOL = {
  mint: '#8ef0d0',
  blue: '#48a8f0',
};

// The two shields. A shield is broken by the state it is drawn in: violet is
// the boosted ball, dotted gold is a line nobody is holding.
export const SHIELDS = {
  boost: {
    key: 'boost', color: PALETTE.ring, dotted: false,
    label: 'a boosted ball',
    breaks: (w) => !!w.boosted,
  },
  ghost: {
    key: 'ghost', color: GATES.handsOff.color, dotted: true,
    label: 'a ghosted ball — drifting, nobody holding',
    breaks: (w) => !!w.ghosted,
  },
};

export const isWarm = (c) => Object.values(GATES).some((g) => g.color === c);
export const isCool = (c) => Object.values(COOL).includes(c);

// The three states the ball can be in, and the colour each one wears. A state
// is exactly the shield it can strip, so the ball's colour is a live readout of
// what it is currently able to break.
export const BALL_STATES = ['boost', 'ghost', 'normal'];

export function ballColorFor(state) {
  if (state === 'boost') return SHIELDS.boost.color;
  if (state === 'ghost') return SHIELDS.ghost.color;
  return PALETTE.ink;
}

// Collectables carry no rings and no conditions. Touch one and it is banked.
// All of the game's depth is on the obstacle side, which is also where all of
// the points are — a collectable is tempo and multiplier fuel, not income.
export const COLLECTABLES = {
  mote: {
    key: 'mote', cls: 'col', label: 'MOTE', color: COOL.mint,
    value: 60, r: 10,
    blurb: 'Sits still and waits. Steer the line across it and it is banked — no rings, no boost, no timing.',
    hint: 'All it asks is that the two of you can put the line where you want it.',
  },
  drifter: {
    key: 'drifter', cls: 'col', label: 'DRIFTER', color: COOL.blue,
    value: 140, r: 10, speed: 52,
    blurb: 'The same mote, wandering. It bounces off the walls and never stops; the stub on its back points where it has come from.',
    hint: 'Lead it. Park the line where it is going, not where it is — or boost to close the gap.',
  },
};

// An obstacle is two things: a `gate`, which decides when it is lethal and
// therefore what colour it wears, and a `shield`, which decides what strips a
// layer. For BRITTLE and PHANTOM those are the same condition — if it is safe
// to touch, the touch counts. The PULSAR is the one that separates them: a
// timing gate over a boost shield.
export const OBSTACLES = {
  slab: {
    key: 'slab', cls: 'obs', label: 'SLAB', gate: 'never',
    value: 0, hp: 0,
    blurb: 'Red, and no shield on it — nothing to strip and no state that opens it. Move the line around it.',
    hint: 'Pure avoidance. Costs a life every time.',
  },
  rotor: {
    key: 'rotor', cls: 'obs', label: 'ROTOR', gate: 'never',
    value: 0, hp: 0, armLen: 44, spin: 1.5,
    blurb: 'The same red as the slab, because it has the same answer: none. Hub and both sweeping arms are lethal.',
    hint: 'Cross behind it, never alongside it.',
  },
  brittle: {
    key: 'brittle', cls: 'obs', label: 'BRITTLE', gate: 'boosted', shield: 'boost',
    value: 430, hp: 3, r: 20,
    blurb: 'Orange, behind a violet boost shield. Only a boosted ball survives the contact and only a boosted ball strips a layer; arrive at normal pace and it costs a life.',
    hint: 'Take turns lifting so the ball is violet in both directions.',
  },
  phantom: {
    key: 'phantom', cls: 'obs', label: 'PHANTOM', gate: 'handsOff', shield: 'ghost',
    value: 700, hp: 2, r: 22, shieldGrows: false,
    blurb: 'The same shield idea with a different key: dotted gold instead of violet, stripped by a ghosted ball instead of a boosted one. Let go together and the ball slows to a drift and turns gold to match — that is when a pass strips a layer. A finger on the glass and it costs a life.',
    hint: 'Aim first, then let go. Any shove still running has to finish before the drift starts.',
  },
  pulsar: {
    key: 'pulsar', cls: 'obs', label: 'PULSAR', gate: 'dark', shield: 'boost',
    value: 340, hp: 2, r: 19, rDark: 10, period: 2.4, duty: 0.55,
    blurb: 'A boost shield behind a timing window. Lit and wide it is lethal; dark and small it is inert, and that is when a boosted pass strips a layer.',
    hint: 'Watch the flicker just before it lights — that is your warning.',
  },
};

export const colorOfGate = (gate) => GATES[gate].color;
for (const d of Object.values(OBSTACLES)) d.color = colorOfGate(d.gate);

// What colour is this piece wearing? Fixed for everything — the pulsar changes
// brightness and size as it breathes, never its hue, because its gate never
// changes either.
export function stateColorOf(e) {
  return e.cls === 'obs' ? colorOfGate(e.gate) : e.color;
}

export const ALL = { ...COLLECTABLES, ...OBSTACLES };
export const defOf = (type) => ALL[type];

// ── factories ───────────────────────────────────────────────────────────────

let nextId = 1;

function base(def, x, y, S) {
  return {
    id: nextId++,
    type: def.key,
    cls: def.cls,
    color: def.color,
    x, y,
    r: (def.r || 12) * S,
    vx: 0, vy: 0,
    age: 0,
    spawnT: 1.0,   // telegraph: inert while counting down
    cool: 0,       // re-hit lockout
    ttl: Infinity,
    fade: 0,       // set when expiring, drives the draw-out
    dead: false,
  };
}

export function makeCollectable(type, x, y, S, diff, rng = Math.random) {
  const def = COLLECTABLES[type];
  const e = base(def, x, y, S);
  e.value = Math.round(def.value * diff.valueScale);

  if (def.speed) {
    const a = rng() * Math.PI * 2;
    const sp = def.speed * S * diff.entitySpeed;
    e.vx = Math.cos(a) * sp;
    e.vy = Math.sin(a) * sp;
  }
  return e;
}

export function makeObstacle(type, x, y, S, diff, rng = Math.random) {
  const def = OBSTACLES[type];
  const e = base(def, x, y, S);
  e.gate = def.gate;
  e.shield = def.shield || null;
  e.hpMax = def.hp ? def.hp + (def.shieldGrows === false ? 0 : diff.shieldBonus) : 0;
  e.hp = e.hpMax;
  e.value = Math.round(def.value * diff.valueScale);
  e.ttl = diff.obstacleTtl;
  e.spawnT = 1.2;

  switch (type) {
    case 'slab': {
      e.horiz = rng() < 0.5;
      const long = (58 + rng() * 46) * S;
      const thin = 15 * S;
      e.w = e.horiz ? long : thin;
      e.h = e.horiz ? thin : long;
      e.r = Math.max(e.w, e.h) / 2; // used only for spawn spacing
      break;
    }
    case 'rotor': {
      e.armLen = def.armLen * S;
      e.thick = 3.5 * S;
      e.hubR = 7 * S;
      e.angle = rng() * Math.PI * 2;
      e.spin = def.spin * diff.entitySpeed * (rng() < 0.5 ? -1 : 1);
      e.r = e.armLen;
      break;
    }
    case 'pulsar': {
      e.period = def.period / diff.entitySpeed;
      e.duty = def.duty;
      e.phase = rng() * e.period;
      e.rBig = def.r * S;
      e.rSmall = def.rDark * S;
      e.armed = false;
      e.r = e.rBig;
      break;
    }
    case 'phantom': {
      const a = rng() * Math.PI * 2;
      const sp = 16 * S * diff.entitySpeed;
      e.vx = Math.cos(a) * sp;
      e.vy = Math.sin(a) * sp;
      break;
    }
  }
  return e;
}

// ── per-frame behaviour ─────────────────────────────────────────────────────

export function updateEntity(e, dt, bounds) {
  e.age += dt;
  if (e.spawnT > 0) e.spawnT = Math.max(0, e.spawnT - dt);
  if (e.cool > 0) e.cool = Math.max(0, e.cool - dt);

  if (e.vx || e.vy) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const pad = e.r;
    if (e.x < bounds.x0 + pad) { e.x = bounds.x0 + pad; e.vx = Math.abs(e.vx); }
    if (e.x > bounds.x1 - pad) { e.x = bounds.x1 - pad; e.vx = -Math.abs(e.vx); }
    if (e.y < bounds.y0 + pad) { e.y = bounds.y0 + pad; e.vy = Math.abs(e.vy); }
    if (e.y > bounds.y1 - pad) { e.y = bounds.y1 - pad; e.vy = -Math.abs(e.vy); }
  }

  if (e.type === 'rotor') e.angle += e.spin * dt;

  if (e.type === 'pulsar') {
    e.phase = (e.phase + dt) % e.period;
    const lit = e.phase < e.period * e.duty;
    e.warn = !lit && (e.period - e.phase) < 0.4;
    e.armed = lit;
    e.r = lit ? e.rBig : e.rSmall;
  }

  if (e.ttl !== Infinity) {
    e.ttl -= dt;
    if (e.ttl <= 0.9) e.fade = Math.max(0, e.ttl / 0.9);
    if (e.ttl <= 0) { e.dead = true; e.expired = true; }
  }
}

// ── geometry ────────────────────────────────────────────────────────────────

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

// Is the ball (a circle) overlapping this entity right now?
export function hitTest(e, x, y, br) {
  if (e.dead || e.spawnT > 0) return false;

  if (e.type === 'slab') {
    return circleRect(x, y, br, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
  }

  if (e.type === 'rotor') {
    for (let i = 0; i < 2; i++) {
      const th = e.angle + i * Math.PI;
      const nx = e.x + Math.cos(th) * e.armLen;
      const ny = e.y + Math.sin(th) * e.armLen;
      if (segDist(x, y, e.x, e.y, nx, ny) < br + e.thick) return true;
    }
    return Math.hypot(x - e.x, y - e.y) < br + e.hubR;
  }

  const rr = br + e.r;
  return (x - e.x) ** 2 + (y - e.y) ** 2 < rr * rr;
}

// Is this obstacle lethal to touch right now? Exactly one condition per gate,
// and the gate is what picks the colour it is wearing.
export function isLethal(e, world) {
  switch (e.gate) {
    case 'never':    return true;
    case 'boosted':  return !world.boosted;
    case 'handsOff': return !world.handsOff;
    case 'dark':     return !!e.armed;
    default:         return false;
  }
}

// Does this pass strip a layer? Each shield is broken by the state it is drawn
// in, so the picture is the rule.
export function shieldBreaks(e, world) {
  const s = SHIELDS[e.shield];
  return !!s && s.breaks(world);
}

// How a contact resolves.
//   'kill'   — the players lose a life
//   'damage' — a layer comes off the shield
//   'pass'   — the ball goes through and nothing happens
export function resolveObstacle(e, world) {
  if (isLethal(e, world)) return 'kill';
  return e.hp > 0 && shieldBreaks(e, world) ? 'damage' : 'pass';
}

