// Entity registry, factories, per-frame behaviour and hit tests.
//
// Two families, and the split is now absolute:
//   cls 'col' — collectables. Worth points. Some wear a shield you have to
//               boost through first, but none of them can ever hurt you.
//   cls 'obs' — obstacles. Worth nothing, wear nothing, and are lethal on any
//               contact whatsoever. There is no way through one.
//
// Every entity is collided against as a circle except the rect-shaped obstacles
// (SLAB, SHARD) and ROTOR (a hub plus swept arms).
//
// ── the visual language ─────────────────────────────────────────────────────
//
// Shape names the family:
//   O  collectable — bank it
//   X  obstacle    — it will cost you a life
//
// Colour names it a second time, so it reads at a glance without having to pick
// a shape out at speed:
//   cool   collectable. Mint sits still, blue moves. That is all hue means here.
//   red    obstacle. One hue, because there is now only one answer to an
//          obstacle: do not touch it.
//   orange a shield, and the boosted ball that strips it. Orange is not a
//          family — it is a *state*, and it means the same thing wherever it
//          appears: this is the thing boost is for.
//
// The ball is the only thing on the field that changes colour, and colour alone
// is how it says what it is doing — no rings, no dots, no outline:
//   orange  boosting. It is flying, and it strips a shield.
//   violet  drifting, because nobody is holding the glass. Slower, easier to
//           aim with, and it strips nothing.
//   ink     neither.
//
// The line never changes at all. It is a faded dotted rail between the paddles
// and it reports nothing.

export const PALETTE = {
  ink: '#e9ecef',
  // The boosted ball, its trail, and every shield in the game. One colour for
  // one idea: boost is the only key, and this is what it looks like.
  boost: '#ff9633',
  // The drifting ball. Deliberately not warm — it strips nothing, so it must
  // not read as a key.
  drift: '#b98cff',
  // Every obstacle, always.
  hazard: '#ff4a55',
};

// Cool. Identity only: mint is a piece that sits still, blue is one that moves.
export const COOL = {
  mint: '#8ef0d0',
  blue: '#48a8f0',
};

// There is exactly one shield, and one thing that opens it. It is drawn in the
// colour of the ball that strips it, so the ring and the key are the same
// substance — that is the whole rule.
export const SHIELD = {
  color: PALETTE.boost,
  label: 'a boosted ball',
};

export const isWarm = (c) => c === PALETTE.hazard || c === PALETTE.boost;
export const isCool = (c) => Object.values(COOL).includes(c);

// The three states the ball can be in, and the colour each one wears. Only one
// of them is a key: orange strips a shield, and nothing else does.
export const BALL_STATES = ['boost', 'ghost', 'normal'];

export function ballColorFor(state) {
  if (state === 'boost') return PALETTE.boost;
  if (state === 'ghost') return PALETTE.drift;
  return PALETTE.ink;
}

// Does the ball strip a shield in this state? One question, one answer.
export const shieldBreaks = (world) => !!world.boosted;

// ── collectables ────────────────────────────────────────────────────────────
//
// All of the game's points are here. The plain two are tempo — touch and bank.
// The shielded three are the income, and they are the only reason to boost:
// each good pass strips `power` layers, and the pass that takes the last one
// also banks the piece.
//
// The shielded variants differ in exactly one number, so the ring count you can
// see is the whole story. They are worth steeply more than the layer count
// alone would suggest, because standing a line still over one for several
// passes is time spent not dodging.
export const COLLECTABLES = {
  mote: {
    key: 'mote', cls: 'col', label: 'MOTE', color: COOL.mint,
    value: 60, r: 10, hp: 0,
    blurb: 'Sits still and waits. Steer the line across it and it is banked — no rings, no boost, no timing.',
    hint: 'All it asks is that the two of you can put the line where you want it.',
  },
  drifter: {
    key: 'drifter', cls: 'col', label: 'DRIFTER', color: COOL.blue,
    value: 140, r: 10, hp: 0, speed: 52,
    blurb: 'The same mote, wandering — blue because it moves. It bounces off the walls and never stops; the stub on its back points where it has come from.',
    hint: 'Lead it. Park the line where it is going, not where it is — or boost to close the gap.',
  },
  ward: {
    key: 'ward', cls: 'col', label: 'WARD', color: COOL.mint,
    value: 260, r: 13, hp: 1,
    blurb: 'A mote with one orange ring around it. A plain ball passes straight through and does nothing; one boosted pass takes the ring and banks it in the same touch.',
    hint: 'The gentlest thing to practise the lift on — a single well-aimed shove is the whole piece.',
  },
  shell: {
    key: 'shell', cls: 'col', label: 'SHELL', color: COOL.mint,
    value: 520, r: 15, hp: 2,
    blurb: 'The same idea behind two rings. Two boosted passes at power 1, and the second one banks it.',
    hint: 'Take turns lifting, so the ball is orange running in both directions.',
  },
  vault: {
    key: 'vault', cls: 'col', label: 'VAULT', color: COOL.mint,
    value: 900, r: 17, hp: 3,
    blurb: 'Three rings, and the biggest payout on the field. Nothing about it is dangerous — it just takes long enough that whatever else is on the field becomes the problem.',
    hint: 'Worth committing to, but look at what is wandering nearby before you park the line.',
  },
};

// ── obstacles ───────────────────────────────────────────────────────────────
//
// Every obstacle is the same proposition: red, unbreakable, worth nothing, and
// lethal on contact. They carry no shields and no gates — there is nothing to
// learn about them beyond where they are and where they are going.
export const OBSTACLES = {
  slab: {
    key: 'slab', cls: 'obs', label: 'SLAB', shape: 'rect',
    value: 0, hp: 0,
    blurb: 'A long red bar that sits exactly where it landed. Nothing strips it and nothing gets through it.',
    hint: 'Pure avoidance. Swing the line around the end of it.',
  },
  shard: {
    key: 'shard', cls: 'obs', label: 'SHARD', shape: 'rect',
    value: 0, hp: 0, speed: 46,
    blurb: 'A slab the size of a chip, loose on the field. It drifts, bounces off the walls and never stops — same red, same answer, but it comes to you.',
    hint: 'Small enough to lose track of. Watch where it is heading, not where it is.',
  },
  rotor: {
    key: 'rotor', cls: 'obs', label: 'ROTOR', shape: 'rotor',
    value: 0, hp: 0, armLen: 44, spin: 1.5,
    blurb: 'A hub with two sweeping arms. The arms are exactly as lethal as the hub.',
    hint: 'Cross behind it, never alongside it.',
  },
};

// One hue for every obstacle, so it cannot be given a colour that disagrees
// with how it behaves — there is only one behaviour.
for (const d of Object.values(OBSTACLES)) d.color = PALETTE.hazard;

export function stateColorOf(e) {
  return e.cls === 'obs' ? PALETTE.hazard : e.color;
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
    shape: def.shape || 'circle',
    color: def.color,
    x, y,
    r: (def.r || 12) * S,
    vx: 0, vy: 0,
    age: 0,
    spawnT: 1.0,   // telegraph: inert while counting down
    cool: 0,       // re-hit lockout
    ttl: Infinity,
    fade: 0,       // set when expiring, drives the draw-out
    hp: 0, hpMax: 0,
    dead: false,
  };
}

function drift(e, speed, S, diff, rng) {
  const a = rng() * Math.PI * 2;
  const sp = speed * S * diff.entitySpeed;
  e.vx = Math.cos(a) * sp;
  e.vy = Math.sin(a) * sp;
}

export function makeCollectable(type, x, y, S, diff, rng = Math.random) {
  const def = COLLECTABLES[type];
  const e = base(def, x, y, S);
  e.value = Math.round(def.value * diff.valueScale);
  e.hpMax = def.hp || 0;
  e.hp = e.hpMax;

  // A shielded piece cannot be allowed to sit there forever: it is the only
  // collectable on the field while it lives, so a run could otherwise stall
  // behind one the players cannot get to.
  if (e.hpMax) e.ttl = diff.collectTtl;

  if (def.speed) drift(e, def.speed, S, diff, rng);
  return e;
}

export function makeObstacle(type, x, y, S, diff, rng = Math.random) {
  const def = OBSTACLES[type];
  const e = base(def, x, y, S);
  e.value = 0;
  e.ttl = diff.obstacleTtl;
  e.spawnT = 1.2;

  switch (type) {
    case 'slab': {
      e.horiz = rng() < 0.5;
      const long = (58 + rng() * 46) * S;
      const thin = 15 * S;
      e.w = e.horiz ? long : thin;
      e.h = e.horiz ? thin : long;
      e.r = Math.max(e.w, e.h) / 2; // spawn spacing, and the wall-bounce pad
      break;
    }
    case 'shard': {
      // The slab, chipped down and set loose.
      e.horiz = rng() < 0.5;
      const long = 30 * S;
      const thin = 13 * S;
      e.w = e.horiz ? long : thin;
      e.h = e.horiz ? thin : long;
      e.r = Math.max(e.w, e.h) / 2;
      drift(e, def.speed, S, diff, rng);
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

  if (e.shape === 'rect') {
    return circleRect(x, y, br, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
  }

  if (e.shape === 'rotor') {
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

// Every obstacle is lethal, always. Kept as a function because it is the one
// rule the whole warm half of the palette stands on.
export const isLethal = (e) => e.cls === 'obs';

// How a contact with a collectable resolves.
//   'collect' — bank it
//   'damage'  — a layer comes off the shield
//   'pass'    — the ball goes through and nothing happens
//
// A collectable can never hurt you, so there is no fourth answer. An unboosted
// ball simply does not interact with a shielded one.
export function resolveCollectable(e, world) {
  if (e.hp > 0) return shieldBreaks(world) ? 'damage' : 'pass';
  return 'collect';
}
