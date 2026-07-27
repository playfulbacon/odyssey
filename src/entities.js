// Entity registry, factories, per-frame behaviour and hit tests.
//
// Two families:
//   cls 'col' — collectables. Wear a shield; strip it, then touch the core.
//   cls 'obs' — obstacles. Lethal unless you meet their specific condition.
//
// Every entity is collided against as a circle except SLAB (a rectangle) and
// ROTOR (a hub plus swept arms).

export const COLLECTABLES = {
  orb: {
    key: 'orb', cls: 'col', label: 'ORB', color: '#57e2c0',
    value: 100, shield: 1, r: 13,
    blurb: 'Sits still and waits. One shield layer per pass until the core opens up, then touch it to bank it.',
    hint: 'The plain one. Learn how the line sweeps before anything else.',
  },
  drifter: {
    key: 'drifter', cls: 'col', label: 'DRIFTER', color: '#57c0e2',
    value: 170, shield: 2, r: 12, speed: 34,
    blurb: 'Wanders the field and bounces off the walls. Two shield layers.',
    hint: 'Lead it. Park the line where it is going, not where it is.',
  },
  splitter: {
    key: 'splitter', cls: 'col', label: 'SPLITTER', color: '#9ae257',
    value: 90, shield: 3, r: 16, shards: 3, shardValue: 70,
    blurb: 'Thick shield. Crack the core and it bursts into three loose shards, each worth banking on its own.',
    hint: 'Do not wander off after it pops — the shards fade.',
  },
  runner: {
    key: 'runner', cls: 'col', label: 'RUNNER', color: '#e2d257',
    value: 240, shield: 1, r: 10, speed: 118,
    blurb: 'Thin shield, fat payout, never stops moving. Fades out if you take too long.',
    hint: 'A boosted ball covers ground fast enough to catch it.',
  },
  shard: {
    key: 'shard', cls: 'col', label: 'SHARD', color: '#9ae257', hidden: true,
    value: 70, shield: 0, r: 6,
  },
};

export const OBSTACLES = {
  slab: {
    key: 'slab', cls: 'obs', label: 'SLAB', color: '#ff5a5f',
    value: 0, hp: 0, kill: 'always',
    blurb: 'Solid. There is no clever way through a slab — move the line around it.',
    hint: 'Pure avoidance. Costs a life every time.',
  },
  brittle: {
    key: 'brittle', cls: 'obs', label: 'BRITTLE', color: '#ffa63d',
    value: 430, hp: 3, kill: 'unboosted', r: 20,
    blurb: 'Armoured, but a boosted ball bites. Keep boosting through it until the armour is gone. Touch it at normal pace and it kills you.',
    hint: 'Time your lift so the ball is already flying when it arrives.',
  },
  phantom: {
    key: 'phantom', cls: 'obs', label: 'PHANTOM', color: '#b98cff',
    value: 660, hp: 2, kill: 'touched', r: 22,
    blurb: 'Only solid to a ball nobody is holding. Line it up, then both let go and coast through. Any finger on the glass and it kills you.',
    hint: 'Aim first — once you both let go, neither paddle moves.',
  },
  pulsar: {
    key: 'pulsar', cls: 'obs', label: 'PULSAR', color: '#ff7ab8',
    value: 320, hp: 2, kill: 'armed', r: 19, rDark: 10, period: 2.4, duty: 0.55,
    blurb: 'Breathes in and out. Lit and wide, it kills. Dark and small, it takes damage.',
    hint: 'Watch the flicker just before it lights — that is your warning.',
  },
  rotor: {
    key: 'rotor', cls: 'obs', label: 'ROTOR', color: '#ff5a5f',
    value: 0, hp: 0, kill: 'always', armLen: 44, spin: 1.5,
    blurb: 'A hub with two sweeping arms. The whole thing is lethal, arms included.',
    hint: 'Cross behind it, never alongside it.',
  },
};

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
  e.kill = def.kill;
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

// How a contact with this obstacle resolves, given the world state.
//   'damage' — the ball chews through it
//   'kill'   — the players lose a life
//   'pass'   — nothing happens
export function resolveObstacle(e, world) {
  switch (e.kill) {
    case 'always':    return 'kill';
    case 'unboosted': return world.boosted ? 'damage' : 'kill';
    case 'touched':   return world.handsOff ? 'damage' : 'kill';
    case 'armed':     return e.armed ? 'kill' : 'damage';
    default:          return 'pass';
  }
}
