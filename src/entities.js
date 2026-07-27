// Entity registry, factories, per-frame behaviour and hit tests.
//
// Two families:
//   cls 'col' — collectables. Wear a shield; strip it, then touch the core.
//   cls 'obs' — obstacles. Lethal unless you meet their specific condition.
//
// Every entity is collided against as a circle except SLAB (a rectangle) and
// ROTOR (a hub plus swept arms).
//
// ── the visual language ─────────────────────────────────────────────────────
//
// Shape says which family you are looking at:
//   O  collectable — bank it
//   X  obstacle    — do not touch it unless the colours agree
//
// Colour is never decorative. There are four, and each one names a state:
//   INK     nothing required. The ball at its normal pace is ink.
//   FORCE   requires the boosted ball, which turns FORCE while it is boosting.
//           Also every ring the ball can break: shields and armour alike.
//   GHOST   requires both fingers off the glass, which turns the ball GHOST.
//   HAZARD  lethal right now. The ball is never HAZARD, so it never gets through.
//
// So the rule a player learns once and applies everywhere is: make the ball the
// same colour as the thing you want to go through. That is not a label stuck on
// the mechanic — resolveObstacle() below is literally a colour comparison.

export const PALETTE = {
  ink: '#e9ecef',
  force: '#57e2c0',
  ghost: '#b98cff',
  hazard: '#ff5a5f',
};

// The colour the ball wears in each state, and the only three colours it can
// ever be. HAZARD is deliberately absent: nothing opens a red obstacle.
//
// GHOST outranks FORCE. Letting go with both hands is a deliberate, sustained
// choice, so it should never be masked by a shove that has not faded yet — and
// the boost rhythm a BRITTLE wants keeps one finger down anyway.
export function ballColorFor({ boosted, handsOff }) {
  if (handsOff) return PALETTE.ghost;
  if (boosted) return PALETTE.force;
  return PALETTE.ink;
}

export const COLLECTABLES = {
  orb: {
    key: 'orb', cls: 'col', label: 'ORB', color: PALETTE.ink,
    value: 100, shield: 1, r: 13,
    needs: 'any ball',
    blurb: 'Sits still and waits. Each pass of the ball strips one FORCE ring; when the last one goes the core fills in, and the next touch banks it.',
    hint: 'The plain one. Learn how the line sweeps before anything else.',
  },
  drifter: {
    key: 'drifter', cls: 'col', label: 'DRIFTER', color: PALETTE.ink,
    value: 170, shield: 2, r: 12, speed: 34,
    needs: 'any ball',
    blurb: 'Same O, same FORCE rings — it just will not hold still. The stub on its back points where it has come from.',
    hint: 'Lead it. Park the line where it is going, not where it is.',
  },
  splitter: {
    key: 'splitter', cls: 'col', label: 'SPLITTER', color: PALETTE.ink,
    value: 90, shield: 3, r: 16, shards: 3, shardValue: 70,
    needs: 'any ball',
    blurb: 'A double O — there is more inside. Thick rings, and cracking the core bursts it into three loose shards, each worth banking on its own.',
    hint: 'Do not wander off after it pops — the shards fade.',
  },
  runner: {
    key: 'runner', cls: 'col', label: 'RUNNER', color: PALETTE.ink,
    value: 240, shield: 1, r: 10, speed: 118,
    needs: 'any ball',
    blurb: 'A small O with a thinning arc around it — that arc is its patience. One ring, fat payout, never stops moving.',
    hint: 'A boosted ball covers ground fast enough to catch it.',
  },
  shard: {
    key: 'shard', cls: 'col', label: 'SHARD', color: PALETTE.ink, hidden: true,
    value: 70, shield: 0, r: 6,
  },
};

export const OBSTACLES = {
  slab: {
    key: 'slab', cls: 'obs', label: 'SLAB', color: PALETTE.hazard,
    value: 0, hp: 0,
    needs: 'nothing gets through',
    blurb: 'HAZARD red, with no rings on it — nothing to break and no state that opens it. Move the line around it.',
    hint: 'Pure avoidance. Costs a life every time.',
  },
  brittle: {
    key: 'brittle', cls: 'obs', label: 'BRITTLE', color: PALETTE.force,
    value: 430, hp: 3, r: 20,
    needs: 'a FORCE ball',
    blurb: 'FORCE teal, the same colour the ball turns while it is boosting. Match it and the armour comes off; arrive as any other colour and it kills you. Keep one finger down while you do it — with both of you off, the ball goes GHOST instead.',
    hint: 'Take turns lifting so the ball stays teal in both directions.',
  },
  phantom: {
    key: 'phantom', cls: 'obs', label: 'PHANTOM', color: PALETTE.ghost,
    value: 660, hp: 2, r: 22,
    needs: 'a GHOST ball',
    blurb: 'GHOST violet, the colour the ball turns when nobody is holding. Its outline is dashed until you both let go, then it solidifies and takes damage.',
    hint: 'Aim first — once you both let go, neither paddle moves.',
  },
  pulsar: {
    key: 'pulsar', cls: 'obs', label: 'PULSAR', color: PALETTE.hazard,
    value: 320, hp: 2, r: 19, rDark: 10, period: 2.4, duty: 0.55,
    needs: 'an INK ball, while it is dark',
    blurb: 'The one that changes colour instead of asking you to. Lit it is HAZARD red and wide; dark it drops to INK, and an INK ball — normal pace, at least one finger down — breaks it.',
    hint: 'Watch the flicker just before it lights — that is your warning.',
  },
  rotor: {
    key: 'rotor', cls: 'obs', label: 'ROTOR', color: PALETTE.hazard,
    value: 0, hp: 0, armLen: 44, spin: 1.5,
    needs: 'nothing gets through',
    blurb: 'HAZARD red from hub to arm tip, and the arms sweep. Same rule as the slab, only it comes to you.',
    hint: 'Cross behind it, never alongside it.',
  },
};

// What colour is this piece *right now*? Everything except the pulsar is fixed;
// the pulsar swaps between HAZARD and INK as it breathes.
export function stateColorOf(e) {
  if (e.cls === 'col') return PALETTE.ink;
  if (e.type === 'pulsar') return e.armed ? PALETTE.hazard : PALETTE.ink;
  return e.color;
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
  e.shieldMax = Math.max(0, (def.shield || 0) + (type === 'shard' ? 0 : diff.shieldBonus));
  e.shield = e.shieldMax;
  e.exposed = e.shield <= 0;
  e.value = Math.round(def.value * diff.valueScale);

  if (def.speed) {
    const a = rng() * Math.PI * 2;
    const sp = def.speed * S * diff.entitySpeed;
    e.vx = Math.cos(a) * sp;
    e.vy = Math.sin(a) * sp;
  }
  if (type === 'runner') e.ttl = 9;
  if (type === 'shard') { e.ttl = 6; e.spawnT = 0; }
  return e;
}

export function makeShards(parent, S, diff, rng = Math.random) {
  const def = COLLECTABLES.splitter;
  const out = [];
  for (let i = 0; i < def.shards; i++) {
    const a = (i / def.shards) * Math.PI * 2 + rng() * 0.6;
    const s = makeCollectable('shard', parent.x, parent.y, S, diff, rng);
    const sp = (55 + rng() * 35) * S;
    s.vx = Math.cos(a) * sp;
    s.vy = Math.sin(a) * sp;
    s.value = Math.round(def.shardValue * diff.valueScale);
    out.push(s);
  }
  return out;
}

export function makeObstacle(type, x, y, S, diff, rng = Math.random) {
  const def = OBSTACLES[type];
  const e = base(def, x, y, S);
  e.hpMax = def.hp ? def.hp + diff.armourBonus : 0;
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

  if (e.type === 'shard') {
    e.vx *= Math.pow(0.16, dt);   // shards coast to a stop
    e.vy *= Math.pow(0.16, dt);
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

// How a contact with this obstacle resolves. The lock is the obstacle's colour,
// the key is the ball's — there is no second rule hiding behind this one.
//   'damage' — the ball chews through it
//   'kill'   — the players lose a life
export function resolveObstacle(e, world) {
  return stateColorOf(e) === ballColorFor(world) ? 'damage' : 'kill';
}
