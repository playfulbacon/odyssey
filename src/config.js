// Central tuning table. Everything that decides how the game *feels* lives here
// so the prototype can be re-balanced without touching the simulation.

export const CFG = {
  // Rendering scale reference. All pixel sizes below assume a 400px-wide screen
  // and are multiplied by S = clamp(width / 400).
  refWidth: 400,
  scaleMin: 0.62,
  scaleMax: 1.9,

  paddle: {
    w: 88,        // fixed: width is not a lever, the line's *angle* is
    h: 11,
    margin: 62,   // distance from the screen edge to the paddle line
    round: 5,
  },

  ball: {
    r: 7.5,
    // Base pace expressed as full traversals of the line per second, so the
    // ball feels the same on any screen size.
    tps: 0.60,
    trail: 14,
  },

  boost: {
    dur: 0.40,    // how long a lift keeps shoving, in seconds
    mult: 2.35,   // ball moving away from the lifter; a lift never slows it down
  },

  launch: {
    hold: 0.9,    // seconds both players must hold
    drain: 1.9,   // how fast the bar empties when someone lets go
    delay: 0.55,  // dead time after a life is lost before the bar accepts input
  },

  hitCool: 0.22,  // per-entity re-hit lockout, so one pass = one hit
  safeClear: 118, // obstacles inside this radius of a respawn are cleared
  multCap: 15,
  maxParticles: 320,

  run: {
    baseTime: 60,
    timeBonusPerSec: 25,
    // Score needed to clear run n.
    target: (n) => Math.round(1400 * Math.pow(n, 1.26)),
  },

  base: {
    lives: 3,
    power: 1,
  },
};

// ── upgrades ────────────────────────────────────────────────────────────────

export const UPGRADES = [
  {
    id: 'lives', name: 'EXTRA LIFE', base: 900, growth: 1.95, max: 6,
    desc: 'One more life at the start of every run.',
    show: (l) => `${CFG.base.lives + l} lives`,
  },
  {
    id: 'power', name: 'BALL POWER', base: 1150, growth: 2.05, max: 8,
    desc: 'Heavier ball. More shield layers stripped per boosted pass.',
    show: (l) => `power ${CFG.base.power + l}`,
  },
  {
    id: 'time', name: 'EXTRA TIME', base: 800, growth: 1.8, max: 12,
    desc: '+8 seconds on the run clock.',
    show: (l) => `${CFG.run.baseTime + 8 * l}s`,
  },
  {
    id: 'boost', name: 'LONG BOOST', base: 760, growth: 1.72, max: 6,
    desc: '+12% boost duration. A longer window in which the ball can strip a shield.',
    show: (l) => `+${l * 12}% boost`,
  },
];

export const upgradeCost = (u, level) => Math.round(u.base * Math.pow(u.growth, level));

export const derived = (up) => ({
  lives: CFG.base.lives + (up.lives || 0),
  power: CFG.base.power + (up.power || 0),
  time: CFG.run.baseTime + 8 * (up.time || 0),
  boostScale: 1 + 0.12 * (up.boost || 0),
});

export const emptyUpgrades = () =>
  UPGRADES.reduce((o, u) => { o[u.id] = 0; return o; }, {});

// ── difficulty curve ────────────────────────────────────────────────────────

// Which pieces are in play, and how nasty they are, on run n.
export function difficulty(run) {
  const r = Math.max(1, run);
  const k = r - 1;

  // All of the points, and all of the escalation, are on the collectable side:
  // the still one, the moving one, then one more shield layer per run. Nothing
  // is ever added to an obstacle, because there is nothing on an obstacle to
  // add to — they only ever get more numerous and faster.
  // Exactly one new piece per run, alternating sides: something new to catch,
  // then something new to dodge. Everything is in play by run 7.
  const collectPool = ['mote'];
  if (r >= 2) collectPool.push('drifter');
  if (r >= 3) collectPool.push('ward');
  if (r >= 5) collectPool.push('shell');
  if (r >= 7) collectPool.push('vault');

  const obstaclePool = ['slab'];
  if (r >= 4) obstaclePool.push('shard');
  if (r >= 6) obstaclePool.push('rotor');

  // A shielded piece takes several passes, so from the run they appear there
  // has to be a second collectable on the field — otherwise the whole run
  // queues up behind one ring.
  const shielded = collectPool.some((t) => t === 'ward' || t === 'shell' || t === 'vault');

  return {
    run: r,
    collectPool,
    obstaclePool,
    maxCollectables: shielded ? 2 : 1,
    collectTtl: Math.max(11, 17 - k * 0.5),          // shielded pieces only
    maxObstacles: Math.min(7, 1 + Math.round(k * 0.8)),
    obstacleGap: Math.max(1.5, 4.6 - k * 0.32),      // seconds between spawns
    obstacleTtl: Math.max(9, 18 - k * 0.7),          // how long one sticks around
    ballSpeed: 1 + Math.min(0.55, k * 0.055),
    entitySpeed: 1 + k * 0.11,
    valueScale: 1 + k * 0.26,
  };
}
