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
    margin: 62,
    round: 5,
  },

  ball: {
    r: 10,        // big enough to carry its strength as a numeral
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
    delay: 0.55,  // dead time after health runs out before the bar takes input
  },

  hitCool: 0.30,  // per-entity re-hit lockout, and the ball's grace after a bounce
  safeClear: 118, // hazards inside this radius of a respawn are cleared
  multCap: 15,
  maxParticles: 320,

  run: {
    baseTime: 60,
    timeBonusPerSec: 25,
    // Points needed to clear run n. Points come from kills and nowhere else.
    target: (n) => Math.round(1600 * Math.pow(n, 1.32)),
  },

  base: {
    lives: 3,          // how many times the ball can be lost outright
    health: 3,         // hits the ball takes before a life goes
    strength: 1,       // what the ball is worth in a fight, at rest
    boostStrength: 1,  // and what a shove adds to that
  },
};

// ── upgrades ────────────────────────────────────────────────────────────────
//
// Bought with gold, which is a different pile from points: points are the run
// target and come only from kills, gold is the wallet and comes only from
// motes. You cannot spend your way past a target or score your way to an
// upgrade.

export const UPGRADES = [
  {
    id: 'strength', name: 'BOOST STRENGTH', base: 380, growth: 1.95, max: 6,
    desc: 'A shove hits harder. The ball has to match an enemy\'s strength to beat it.',
    show: (l) => `${CFG.base.strength} / ${CFG.base.strength + CFG.base.boostStrength + l} boosting`,
  },
  {
    id: 'health', name: 'BALL HEALTH', base: 260, growth: 1.75, max: 8,
    desc: 'One more hit the ball can take before a life goes.',
    show: (l) => `${CFG.base.health + l} health`,
  },
  {
    id: 'lives', name: 'EXTRA LIFE', base: 480, growth: 1.9, max: 6,
    desc: 'One more life at the start of every run.',
    show: (l) => `${CFG.base.lives + l} lives`,
  },
  {
    id: 'time', name: 'EXTRA TIME', base: 220, growth: 1.7, max: 12,
    desc: '+8 seconds on the run clock.',
    show: (l) => `${CFG.run.baseTime + 8 * l}s`,
  },
];

export const upgradeCost = (u, level) => Math.round(u.base * Math.pow(u.growth, level));

export const derived = (up) => ({
  lives: CFG.base.lives + (up.lives || 0),
  health: CFG.base.health + (up.health || 0),
  strength: CFG.base.strength,
  boostStrength: CFG.base.boostStrength + (up.strength || 0),
  time: CFG.run.baseTime + 8 * (up.time || 0),
});

export const emptyUpgrades = () =>
  UPGRADES.reduce((o, u) => { o[u.id] = 0; return o; }, {});

// ── difficulty curve ────────────────────────────────────────────────────────

// Which pieces are in play, and how nasty they are, on run n.
export function difficulty(run) {
  const r = Math.max(1, run);
  const k = r - 1;

  // Run 1 has to carry all three families at once, because points only come
  // from kills and gold only comes from motes — a run without an enemy has no
  // way to hit its target, and a run without gold pays for nothing. After that
  // it is one new piece per run, alternating between something to take and
  // something to get past.
  const goldPool = ['mote'];
  if (r >= 2) goldPool.push('ore');

  const enemyPool = ['drone'];
  if (r >= 4) enemyPool.push('cyclops');
  if (r >= 6) enemyPool.push('janus');

  const obstaclePool = ['slab'];
  if (r >= 3) obstaclePool.push('shard');
  if (r >= 5) obstaclePool.push('rotor');

  return {
    run: r,
    goldPool,
    enemyPool,
    obstaclePool,

    maxGold: goldPool.length > 1 ? 2 : 1,
    goldGap: 0.35,
    oreBonus: Math.floor(k * 0.3),          // deeper seams later on
    oreTtl: Math.max(14, 22 - k * 0.8),

    // Points come from kills and nowhere else, so how many enemies are on the
    // field *is* the score curve. Keep two around from the very first run or
    // the target is arithmetic the player cannot reach.
    maxEnemies: Math.min(5, 2 + Math.floor(k * 0.5)),
    enemyGap: Math.max(1.4, 3.2 - k * 0.25),
    enemyTtl: Math.max(11, 20 - k * 0.8),
    // The one thing that escalates about a fight: everything gets harder to
    // beat, which is what makes BOOST STRENGTH worth buying.
    strengthBonus: Math.floor(k * 0.34),

    maxObstacles: Math.min(6, 1 + Math.round(k * 0.7)),
    obstacleGap: Math.max(1.5, 4.6 - k * 0.32),
    obstacleTtl: Math.max(9, 18 - k * 0.7),

    ballSpeed: 1 + Math.min(0.55, k * 0.055),
    entitySpeed: 1 + k * 0.11,
    valueScale: 1 + k * 0.26,
  };
}
