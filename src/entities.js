// Entity registry, factories, per-frame behaviour and hit tests.
//
// Two families:
//   cls 'col' — collectables. Touch one and it is banked. That is all.
//   cls 'obs' — obstacles. Lethal unless you meet their gate, and the only
//               things in the game that wear armour.
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
// Two colours belong to neither family, and they are the two that carry rules:
//   RING   violet. The boosted ball, and every ring of obstacle armour. A ring
//          means one thing wherever you see it: a boosted ball takes it off.
//          Collectables never wear one — you just touch them.
//   INK    the ball at rest, the paddles, a held half of the line.
//
// And the line itself is the readout for the one state the ball does not wear:
// a half you are not touching turns the PHANTOM's gold, both halves lit means
// the phantom is open. See lineColorFor().

export const PALETTE = {
  ink: '#e9ecef',
  ring: '#b98cff',
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

export const isWarm = (c) => Object.values(GATES).some((g) => g.color === c);
export const isCool = (c) => Object.values(COOL).includes(c);

// The ball wears one thing and one thing only: whether it is currently able to
// break a ring.
export function ballColorFor({ boosted }) {
  return boosted ? PALETTE.ring : PALETTE.ink;
}

// The line is where "nobody is holding this end" is reported, in the colour of
// the obstacle that state opens.
export function lineColorFor(touching) {
  return touching ? PALETTE.ink : GATES.handsOff.color;
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

// `gate` is the whole obstacle. It decides when the thing is lethal, and it
// decides what colour the thing is — see colorOfGate below.
export const OBSTACLES = {
  slab: {
    key: 'slab', cls: 'obs', label: 'SLAB', gate: 'never',
    value: 0, hp: 0,
    blurb: 'Red, and no rings on it — nothing to break and no state that opens it. Move the line around it.',
    hint: 'Pure avoidance. Costs a life every time.',
  },
  rotor: {
    key: 'rotor', cls: 'obs', label: 'ROTOR', gate: 'never',
    value: 0, hp: 0, armLen: 44, spin: 1.5,
    blurb: 'The same red as the slab, because it has the same answer: none. Hub and both sweeping arms are lethal.',
    hint: 'Cross behind it, never alongside it.',
  },
  brittle: {
    key: 'brittle', cls: 'obs', label: 'BRITTLE', gate: 'boosted',
    value: 430, hp: 3, r: 20,
    blurb: 'Orange: only a boosted ball survives the contact, and only a boosted ball takes its armour off. Arrive at normal pace and it costs a life.',
    hint: 'Take turns lifting so the ball is violet in both directions.',
  },
  phantom: {
    key: 'phantom', cls: 'obs', label: 'PHANTOM', gate: 'handsOff',
    value: 700, hp: 1, r: 22, armourGrows: false,
    blurb: 'Gold, the colour your half of the line turns the moment you let go. With both of you off the glass it is harmless — and a boosted ball in that same window destroys it outright.',
    hint: 'Aim first. One of you lifts, then the other, before the shove dies.',
  },
  pulsar: {
    key: 'pulsar', cls: 'obs', label: 'PULSAR', gate: 'dark',
    value: 340, hp: 2, r: 19, rDark: 10, period: 2.4, duty: 0.55,
    blurb: 'Lit and wide it is lethal; dark and small it is inert. Boost through it during a dark window to strip the armour.',
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
  e.hpMax = def.hp ? def.hp + (def.armourGrows === false ? 0 : diff.armourBonus) : 0;
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

// How a contact resolves.
//   'kill'   — the players lose a life
//   'damage' — a ring comes off
//   'pass'   — the ball goes through and nothing happens
//
// Only a boosted ball takes a ring off.
export function resolveObstacle(e, world) {
  if (isLethal(e, world)) return 'kill';
  return world.boosted && e.hp > 0 ? 'damage' : 'pass';
}

