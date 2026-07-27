// Entity registry, factories, per-frame behaviour and hit tests.
//
// Three families, and each one answers a different question:
//   cls 'gold'  — the currency. MOTEs are picked up by touching them; ORE has
//                 to be shoved into to shake them loose. Never dangerous.
//   cls 'enemy' — worth points, and the only things that can be *defeated*.
//                 Every enemy has a strength, and so does the ball; the bigger
//                 number wins the contact. Some wear a shield with a weak point
//                 in it, which is the only way in.
//   cls 'obs'   — hazards. No strength, no points, no way through. Touching one
//                 costs health, full stop.
//
// ── the visual language ─────────────────────────────────────────────────────
//
//   gold    #ffcf3d  gold. Motes and ore, and nothing else is ever this colour.
//   orange  #ff9633  boost. The boosting ball, the paddle whose shove is up
//                    next, and a shield's weak point — because a weak point is
//                    precisely a place where boost goes.
//   pink    #ff5fa8  an enemy. Beatable, if your number is big enough.
//   red     #ff4a55  an obstacle. Not beatable at any number.
//   steel   #7d8794  shield plating. Inert: it will not hurt you and you cannot
//                    hurt it. It is a wall with a hole in it.
//
// Shape says it a second time: gold is an O, obstacles are an X, and an enemy
// wears its strength as a numeral — the one glyph you actually have to read,
// because the whole enemy interaction is comparing it against the ball's.
//
// The ball says what it is doing with colour alone — orange while a shove is
// pushing it along, ink otherwise — and carries its own strength as a numeral.

export const PALETTE = {
  ink: '#e9ecef',
  boost: '#ff9633',
  gold: '#ffcf3d',
  enemy: '#ff5fa8',
  hazard: '#ff4a55',
  plate: '#7d8794',
};

export const BALL_STATES = ['boost', 'normal'];
export const ballColorFor = (state) => (state === 'boost' ? PALETTE.boost : PALETTE.ink);

// ── gold ────────────────────────────────────────────────────────────────────

export const GOLD = {
  mote: {
    key: 'mote', cls: 'gold', label: 'GOLD MOTE', color: PALETTE.gold,
    gold: 15, r: 9,
    blurb: 'Loose gold. Steer the line across it and it is yours — no boost, no timing, no risk.',
    hint: 'Gold buys upgrades between runs. It is not worth any points.',
  },
  ore: {
    key: 'ore', cls: 'gold', label: 'GOLD ORE', color: PALETTE.gold,
    gold: 0, r: 21, charges: 3, yield: 3,
    blurb: 'A seam of gold locked in rock. A boosted ball cracks a charge out of it and scatters loose motes; a plain ball bounces off nothing and does nothing at all.',
    hint: 'Three charges in a fresh seam. Take turns shoving so the ball arrives orange every pass.',
  },
};

// ── enemies ─────────────────────────────────────────────────────────────────
//
// A contact with an enemy's body is settled by one comparison: ball strength
// against enemy strength. Win it and the enemy dies and pays; lose it and the
// ball takes the damage instead and is thrown back the way it came.
//
// A shield changes how you *reach* the body, not how the fight resolves. It is
// a solid ring with one or two weak points cut into it, and a weak point faces
// one player's end of the phone — so the ball can only come in through it while
// running away from that player, which means that player's lift is the one that
// has to land. A CYCLOPS is the pure case: one weak point, one player's job.
export const ENEMIES = {
  drone: {
    key: 'drone', cls: 'enemy', label: 'DRONE', color: PALETTE.enemy,
    strength: 1, value: 200, r: 15, weak: 0,
    blurb: 'Bare, unshielded and weak. Any ball at all matches its strength at the start of a run, so it dies to a plain pass.',
    hint: 'Watch the numbers. Once a run starts adding strength, even a drone needs a shove behind the ball.',
  },
  cyclops: {
    key: 'cyclops', cls: 'enemy', label: 'CYCLOPS', color: PALETTE.enemy,
    strength: 2, value: 600, r: 22, weak: 1,
    blurb: 'One eye. A steel ring with a single orange weak point cut in it, facing one end of the phone — and the ball can only enter through it while running away from that end.',
    hint: 'Whoever it is facing has to be the one who shoves. The other player just steers and keeps still.',
  },
  janus: {
    key: 'janus', cls: 'enemy', label: 'JANUS', color: PALETTE.enemy,
    strength: 3, value: 1000, r: 25, weak: 2,
    blurb: 'Two faces, one looking at each of you, so either player can be the one to shove it. It is stronger than anything else on the field to make up for the easier opening.',
    hint: 'The easy one to hit and the hard one to beat. Check your strength before you commit.',
  },
};

// ── obstacles ───────────────────────────────────────────────────────────────

export const OBSTACLES = {
  slab: {
    key: 'slab', cls: 'obs', label: 'SLAB', shape: 'rect', color: PALETTE.hazard,
    blurb: 'A long red bar that sits exactly where it landed. It has no strength to beat — it just hurts.',
    hint: 'Pure avoidance. Swing the line around the end of it.',
  },
  shard: {
    key: 'shard', cls: 'obs', label: 'SHARD', shape: 'rect', color: PALETTE.hazard,
    speed: 46,
    blurb: 'A slab the size of a chip, loose on the field. It drifts, bounces off the walls and never stops.',
    hint: 'Small enough to lose track of. Watch where it is heading, not where it is.',
  },
  rotor: {
    key: 'rotor', cls: 'obs', label: 'ROTOR', shape: 'rotor', color: PALETTE.hazard,
    armLen: 44, spin: 1.5,
    blurb: 'A hub with two sweeping arms. The arms are exactly as lethal as the hub.',
    hint: 'Cross behind it, never alongside it.',
  },
};

export const ALL = { ...GOLD, ...ENEMIES, ...OBSTACLES };
export const defOf = (type) => ALL[type];
export const stateColorOf = (e) => e.color;

// ── weak points ─────────────────────────────────────────────────────────────
//
// A weak point is an arc on the shield, centred on the direction of one
// player's paddle. Player A is at the bottom of the screen (larger y), so a
// weak point on side 'a' sits at the bottom of the ring — and a ball coming in
// through it must be travelling away from A, which is dir +1.

export const WEAK_HALF = 0.5;                       // half-width in radians

export const weakAngle = (side) => (side === 'a' ? Math.PI / 2 : -Math.PI / 2);
export const admitsDir = (side) => (side === 'a' ? 1 : -1);

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Which weak point, if any, is the ball entering through right now? Both things
// have to be true at once: it is in the arc, and it is going the way that arc
// faces. Coming at the right hole from the wrong side is just a wall.
export function weakPointAt(e, x, y, dir) {
  if (!e.weak || !e.weak.length) return null;
  const ang = Math.atan2(y - e.y, x - e.x);
  for (const w of e.weak) {
    if (Math.abs(wrap(ang - weakAngle(w.side))) > WEAK_HALF) continue;
    if (Math.sign(dir) !== admitsDir(w.side)) continue;
    return w;
  }
  return null;
}

// The plated spans of a shield: everything the weak points do not cover. Used
// for drawing, and derived from the same table, so the steel cannot end up
// somewhere the rule says there is a hole.
export function shieldSpans(e) {
  const gaps = e.weak
    .map((w) => ({ side: w.side, a0: weakAngle(w.side) - WEAK_HALF, a1: weakAngle(w.side) + WEAK_HALF }))
    .sort((p, q) => p.a0 - q.a0);
  const plate = gaps.map((g, i) => {
    const next = gaps[(i + 1) % gaps.length];
    return [g.a1, next.a0 + (i + 1 === gaps.length ? Math.PI * 2 : 0)];
  });
  return { gaps, plate };
}

// ── contact rules ───────────────────────────────────────────────────────────
//
// `world` is what the ball brings to a contact: where it is, which way it is
// going, whether a shove is behind it and how hard it is hitting.

// 'kill'  — the enemy dies and pays points
// 'hurt'  — the ball takes the damage and is thrown back
// 'block' — the shield turned it away; nobody is any worse off
export function resolveEnemy(e, world) {
  if (e.weak.length) {
    const w = weakPointAt(e, world.x, world.y, world.dir);
    if (!w || !world.boosted) return 'block';
  }
  return world.strength >= e.strength ? 'kill' : 'hurt';
}

// 'crack' — a charge comes out as loose motes
// 'pass'  — nothing happens; ore is never dangerous
export const resolveOre = (world) => (world.boosted ? 'crack' : 'pass');

// A contact that turns the ball round. Blocked by a shield, or beaten by
// something stronger — either way the ball goes back the way it came.
export const reverses = (r) => r === 'block' || r === 'hurt';

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
    weak: [],
    dead: false,
  };
}

function scatter(e, speed, S, diff, rng) {
  const a = rng() * Math.PI * 2;
  const sp = speed * S * (diff.entitySpeed || 1);
  e.vx = Math.cos(a) * sp;
  e.vy = Math.sin(a) * sp;
}

export function makeGold(type, x, y, S, diff, rng = Math.random) {
  const def = GOLD[type];
  const e = base(def, x, y, S);
  e.gold = def.gold;
  if (type === 'ore') {
    e.charges = def.charges + (diff.oreBonus || 0);
    e.chargesMax = e.charges;
    e.yield = def.yield;
    e.ttl = diff.oreTtl || Infinity;
  }
  return e;
}

// A mote shaken out of a seam: it flies off, slows to a stop and expires if
// nobody comes and gets it.
export function makeLooseMote(x, y, S, diff, rng = Math.random) {
  const e = makeGold('mote', x, y, S, diff, rng);
  scatter(e, 70, S, { entitySpeed: 1 }, rng);
  e.damp = 1.9;
  e.spawnT = 0.25;
  e.ttl = 9;
  return e;
}

export function makeEnemy(type, x, y, S, diff, rng = Math.random) {
  const def = ENEMIES[type];
  const e = base(def, x, y, S);
  e.strength = def.strength + (diff.strengthBonus || 0);
  e.value = Math.round(def.value * (diff.valueScale || 1));
  e.ttl = diff.enemyTtl || Infinity;
  e.spawnT = 1.2;
  e.shieldR = e.r + 9 * S;

  // One weak point faces whichever end the dice pick; two face both.
  if (def.weak === 1) e.weak = [{ side: rng() < 0.5 ? 'a' : 'b' }];
  else if (def.weak >= 2) e.weak = [{ side: 'a' }, { side: 'b' }];
  return e;
}

export function makeObstacle(type, x, y, S, diff, rng = Math.random) {
  const def = OBSTACLES[type];
  const e = base(def, x, y, S);
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
      e.horiz = rng() < 0.5;
      const long = 30 * S, thin = 13 * S;
      e.w = e.horiz ? long : thin;
      e.h = e.horiz ? thin : long;
      e.r = Math.max(e.w, e.h) / 2;
      scatter(e, def.speed, S, diff, rng);
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
    if (e.damp) {
      const k = Math.max(0, 1 - e.damp * dt);
      e.vx *= k; e.vy *= k;
    }
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

// Is the ball (a circle) overlapping this entity right now? A shielded enemy is
// tested against its shield, because that is the outer edge you meet first.
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

  const rr = br + (e.weak.length ? e.shieldR : e.r);
  return (x - e.x) ** 2 + (y - e.y) ** 2 < rr * rr;
}
