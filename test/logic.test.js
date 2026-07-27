// Rules tests for the parts of the prototype that are easy to break silently:
// the colour language, the strength comparison, the directional weak point, the
// two resources and the health/lives split. Pure logic — no DOM, no canvas.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CFG, UPGRADES, upgradeCost, derived, difficulty, emptyUpgrades } from '../src/config.js';
import {
  PALETTE, GOLD, ENEMIES, OBSTACLES, ALL, BALL_STATES, ballColorFor,
  WEAK_HALF, weakAngle, admitsDir, weakPointAt, shieldSpans,
  resolveEnemy, resolveOre, reverses,
  makeGold, makeLooseMote, makeEnemy, makeObstacle, hitTest, updateEntity,
} from '../src/entities.js';
import { Game } from '../src/game.js';

const D1 = difficulty(1);

function stubInput() {
  const p = () => ({ nx: 0.5, touching: false, boostT: 0, pointerId: null });
  return {
    a: p(), b: p(),
    boostDir: 0, boostDur: CFG.boost.dur, enabled: false,
    update() {}, setBounds() {}, reset() {}, clearTouches() {}, clearEdges() {},
  };
}

function mkGame(run = 1) {
  const g = new Game({}, stubInput(), {});
  g.resize(400, 800, 1);
  g.startRun(run, emptyUpgrades());
  g.phase = 'play';
  return g;
}

// Drop a piece on the field, already live, and run the ball into it.
function put(g, e, opts = {}) {
  e.spawnT = 0;
  e.x = 200; e.y = 400;
  g.entities.push(e);
  if (opts.boost) g.ball.state = 'boost';
  if (opts.dir) g.ball.dir = opts.dir;
  return e;
}

// ── the colour language ─────────────────────────────────────────────────────

test('every family has one hue and no two families share it', () => {
  for (const d of Object.values(GOLD)) assert.equal(d.color, PALETTE.gold, d.key);
  for (const d of Object.values(ENEMIES)) assert.equal(d.color, PALETTE.enemy, d.key);
  for (const d of Object.values(OBSTACLES)) assert.equal(d.color, PALETTE.hazard, d.key);

  const hues = [PALETTE.gold, PALETTE.enemy, PALETTE.hazard, PALETTE.boost, PALETTE.plate, PALETTE.ink];
  assert.equal(new Set(hues).size, hues.length, 'no hue does two jobs');
});

test('orange is boost and boost alone, wherever it turns up', () => {
  assert.equal(ballColorFor('boost'), PALETTE.boost);
  assert.deepEqual(BALL_STATES, ['boost', 'normal']);
  assert.equal(ballColorFor('normal'), PALETTE.ink);
  // Nothing that sits on the field is ever orange — orange is a state, and the
  // only static thing wearing it is a weak point, which is a hole, not a piece.
  for (const d of Object.values(ALL)) assert.notEqual(d.color, PALETTE.boost, d.key);
});

// ── two resources ───────────────────────────────────────────────────────────

test('gold and points are separate piles that never feed each other', () => {
  const g = mkGame();
  put(g, makeGold('mote', 0, 0, 1, D1));
  g._collide(200, 400);
  assert.ok(g.gold > 0, 'a mote pays gold');
  assert.equal(g.score, 0, 'and no points at all');

  const g2 = mkGame();
  put(g2, makeEnemy('drone', 0, 0, 1, D1));
  g2._collide(200, 400);
  assert.ok(g2.score > 0, 'a kill pays points');
  assert.equal(g2.gold, 0, 'and no gold at all');
});

test('the run target is points, and gold is what the shop takes', () => {
  const g = mkGame();
  g.gold = 999999;
  g._updatePlay(0.001);
  assert.equal(g.active, true, 'gold cannot clear a run');
  g.score = g.target;
  g._updatePlay(0.001);
  assert.equal(g.active, false, 'points can');
});

// ── gold ────────────────────────────────────────────────────────────────────

test('a mote is taken by any touch; ore needs a shove', () => {
  const plain = mkGame();
  const ore = put(plain, makeGold('ore', 0, 0, 1, D1));
  const charges = ore.charges;
  plain._collide(200, 400);
  assert.equal(ore.charges, charges, 'a plain ball does nothing to a seam');
  assert.equal(ore.dead, false);

  const boosted = mkGame();
  const ore2 = put(boosted, makeGold('ore', 0, 0, 1, D1), { boost: true });
  boosted._collide(200, 400);
  assert.equal(ore2.charges, charges - 1, 'a shove takes a charge');
});

test('cracking a charge scatters loose motes worth real gold', () => {
  const g = mkGame();
  const ore = put(g, makeGold('ore', 0, 0, 1, D1), { boost: true });
  g._collide(200, 400);

  const loose = g.entities.filter((e) => e.type === 'mote');
  assert.equal(loose.length, ore.yield, 'one charge, one scatter');
  for (const m of loose) {
    assert.ok(m.gold > 0, 'and every one is worth taking');
    assert.ok(Math.hypot(m.vx, m.vy) > 0, 'they fly out');
    assert.ok(m.ttl < Infinity, 'and fade if nobody comes for them');
  }
});

test('a seam runs dry after exactly its charges', () => {
  const g = mkGame();
  const ore = put(g, makeGold('ore', 0, 0, 1, D1), { boost: true });
  const n = ore.charges;
  for (let i = 0; i < n; i++) { ore.cool = 0; g._collide(200, 400); }
  assert.equal(ore.charges, 0);
  assert.equal(ore.dead, true);
});

test('gold never turns the ball round and never costs health', () => {
  for (const type of Object.keys(GOLD)) {
    for (const boost of [false, true]) {
      const g = mkGame();
      put(g, makeGold(type, 0, 0, 1, D1), { boost });
      const dir = g.ball.dir, hp = g.health;
      g._collide(200, 400);
      assert.equal(g.ball.dir, dir, `${type} boosted=${boost}: kept its heading`);
      assert.equal(g.health, hp, `${type} boosted=${boost}: kept its health`);
    }
  }
});

// ── strength ────────────────────────────────────────────────────────────────

test('the ball is worth more while a shove is behind it', () => {
  const g = mkGame();
  assert.equal(g._ballWorld(0, 0).strength, CFG.base.strength);
  g.ball.state = 'boost';
  assert.equal(g._ballWorld(0, 0).strength, CFG.base.strength + CFG.base.boostStrength);
});

test('the bigger number wins the contact, and a tie goes to the ball', () => {
  const e = makeEnemy('drone', 0, 0, 1, D1);
  const at = (strength) => resolveEnemy(e, { x: 0, y: 0, dir: 1, boosted: true, strength });
  assert.equal(at(e.strength - 1), 'hurt', 'weaker loses');
  assert.equal(at(e.strength), 'kill', 'equal is enough');
  assert.equal(at(e.strength + 1), 'kill', 'and stronger certainly is');
});

test('losing a fight costs health and turns the ball round', () => {
  const g = mkGame();
  const e = put(g, makeEnemy('drone', 0, 0, 1, D1));
  e.strength = 99;
  const dir = g.ball.dir;
  g._collide(200, 400);
  assert.equal(g.health, g.healthMax - 1, 'a point of health');
  assert.equal(g.ball.dir, -dir, 'and thrown back');
  assert.equal(e.dead, false, 'the enemy is still standing');
  assert.equal(g.score, 0);
});

test('winning a fight pays points and lets the ball through', () => {
  const g = mkGame();
  const e = put(g, makeEnemy('drone', 0, 0, 1, D1));
  const dir = g.ball.dir;
  g._collide(200, 400);
  assert.equal(e.dead, true);
  assert.equal(g.score, e.value);
  assert.equal(g.ball.dir, dir, 'a kill is punched straight through');
  assert.equal(g.health, g.healthMax);
});

test('deeper runs make everything harder to beat, which is the whole curve', () => {
  const early = makeEnemy('drone', 0, 0, 1, difficulty(1)).strength;
  const late = makeEnemy('drone', 0, 0, 1, difficulty(9)).strength;
  assert.ok(late > early, 'a drone that died to a plain ball will not later on');
  for (let n = 1; n < 12; n++) {
    assert.ok(difficulty(n + 1).strengthBonus >= difficulty(n).strengthBonus);
  }
});

// ── weak points ─────────────────────────────────────────────────────────────

test('a weak point faces one end, and only admits a ball running away from it', () => {
  // Player A is at the bottom (larger y), so its weak point sits at the bottom
  // of the ring and takes a ball travelling up — which is dir +1.
  assert.equal(weakAngle('a'), Math.PI / 2);
  assert.equal(weakAngle('b'), -Math.PI / 2);
  assert.equal(admitsDir('a'), 1);
  assert.equal(admitsDir('b'), -1);

  const e = makeEnemy('cyclops', 0, 0, 1, D1);
  e.weak = [{ side: 'a' }];
  const below = { x: 0, y: e.shieldR };      // on the bottom of the ring
  const above = { x: 0, y: -e.shieldR };

  assert.ok(weakPointAt(e, below.x, below.y, 1), 'right hole, right way');
  assert.equal(weakPointAt(e, below.x, below.y, -1), null, 'right hole, wrong way');
  assert.equal(weakPointAt(e, above.x, above.y, 1), null, 'wrong hole');
  assert.equal(weakPointAt(e, above.x, above.y, -1), null, 'still wrong hole');
});

test('the hole is a hole and the rest is a wall, all the way round', () => {
  const e = makeEnemy('cyclops', 0, 0, 1, D1);
  e.weak = [{ side: 'a' }];
  const R = e.shieldR;
  for (let i = 0; i < 72; i++) {
    const ang = (i / 72) * Math.PI * 2 - Math.PI;
    const x = Math.cos(ang) * R, y = Math.sin(ang) * R;
    const inArc = Math.abs(Math.atan2(Math.sin(ang - Math.PI / 2), Math.cos(ang - Math.PI / 2))) <= WEAK_HALF;
    assert.equal(!!weakPointAt(e, x, y, 1), inArc, `angle ${ang.toFixed(2)}`);
  }
});

test('a shielded enemy is a wall until you come in the right way, boosting', () => {
  const e = makeEnemy('cyclops', 0, 0, 1, D1);
  e.weak = [{ side: 'a' }];
  const R = e.shieldR;
  const strong = 99;

  const at = (y, dir, boosted) => resolveEnemy(e, { x: 0, y, dir, boosted, strength: strong });
  assert.equal(at(R, 1, true), 'kill', 'through the hole, boosting, strong enough');
  assert.equal(at(R, 1, false), 'block', 'through the hole but not boosting');
  assert.equal(at(R, -1, true), 'block', 'the hole, from the wrong side');
  assert.equal(at(-R, 1, true), 'block', 'the plating');
});

test('a block is free — it turns the ball round and costs nothing', () => {
  const g = mkGame();
  const e = put(g, makeEnemy('cyclops', 0, 0, 1, D1));
  e.weak = [{ side: 'b' }];
  g.ball.dir = 1;                       // heading for the plated side
  g._collide(200, 400 + e.shieldR);
  assert.equal(g.ball.dir, -1, 'turned round');
  assert.equal(g.health, g.healthMax, 'but unharmed');
  assert.equal(e.dead, false);
  assert.equal(g.score, 0);
});

test('a cyclops has one weak point and a janus has one for each player', () => {
  assert.equal(ENEMIES.drone.weak, 0);
  assert.equal(ENEMIES.cyclops.weak, 1);
  assert.equal(ENEMIES.janus.weak, 2);

  const cy = makeEnemy('cyclops', 0, 0, 1, D1);
  assert.equal(cy.weak.length, 1, 'one player has to be the one to shove');

  const ja = makeEnemy('janus', 0, 0, 1, D1);
  assert.deepEqual(ja.weak.map((w) => w.side).sort(), ['a', 'b'], 'either player can');
  assert.ok(ENEMIES.janus.strength > ENEMIES.cyclops.strength, 'and it costs more to beat');
});

test('a cyclops faces one way or the other, never neither', () => {
  const sides = new Set();
  for (let i = 0; i < 60; i++) sides.add(makeEnemy('cyclops', 0, 0, 1, D1).weak[0].side);
  assert.deepEqual([...sides].sort(), ['a', 'b'], 'both come up');
});

test('the steel is drawn exactly where the rule says there is no hole', () => {
  for (const type of ['cyclops', 'janus']) {
    const e = makeEnemy(type, 0, 0, 1, D1);
    const { gaps, plate } = shieldSpans(e);
    assert.equal(gaps.length, e.weak.length);

    const covered = plate.reduce((sum, [a0, a1]) => sum + (a1 - a0), 0);
    const open = gaps.length * WEAK_HALF * 2;
    assert.ok(Math.abs(covered + open - Math.PI * 2) < 1e-9,
      `${type}: plate and holes should account for the whole ring`);
  }
});

// ── obstacles ───────────────────────────────────────────────────────────────

test('an obstacle costs health whatever the ball is doing', () => {
  for (const type of Object.keys(OBSTACLES)) {
    for (const boost of [false, true]) {
      const g = mkGame();
      const e = makeObstacle(type, 200, 400, 1, D1);
      e.spawnT = 0;
      g.entities.push(e);
      if (boost) g.ball.state = 'boost';
      const dir = g.ball.dir;
      g._collide(200, 400);
      assert.equal(g.health, g.healthMax - 1, `${type} boosted=${boost}`);
      assert.equal(g.ball.dir, -dir, `${type} throws the ball back`);
      assert.equal(g.score, 0, `${type} pays nothing`);
      assert.equal(e.dead, false, `${type} cannot be destroyed`);
    }
  }
});

// ── health and lives ────────────────────────────────────────────────────────

test('health goes one at a time, and only the last one costs a life', () => {
  const g = mkGame();
  const lives = g.lives;
  for (let i = 1; i < g.healthMax; i++) {
    g.phase = 'play';
    const e = makeObstacle('slab', 200, 400, 1, D1);
    e.spawnT = 0; e.w = 40; e.h = 40; g.entities.push(e);
    g._collide(200, 400);
    assert.equal(g.health, g.healthMax - i);
    assert.equal(g.lives, lives, 'still the same ball');
    assert.equal(g.phase, 'play', 'and still running');
  }

  g.phase = 'play';
  const last = makeObstacle('slab', 200, 400, 1, D1);
  last.spawnT = 0; last.w = 40; last.h = 40; g.entities.push(last);
  g._collide(200, 400);
  assert.equal(g.lives, lives - 1, 'the last point of health costs a life');
  assert.equal(g.health, g.healthMax, 'and the new ball comes back full');
  assert.equal(g.phase, 'launch', 'everything stops for another hold');
});

test('the ball comes back on the paddle it was heading for', () => {
  const g = mkGame();
  g.ball.dir = 1;
  g._loseLife(null);
  assert.equal(g.ball.t, 1, 'respawns on the far paddle');
  assert.equal(g.ball.dir, -1, 'and sets off away from it');
  assert.equal(g.phase, 'launch');

  g.phase = 'play';
  g.ball.dir = -1;
  g._loseLife(null);
  assert.equal(g.ball.t, 0);
  assert.equal(g.ball.dir, 1);
});

test('a death clears whatever was camping the respawn, but not the gold', () => {
  const g = mkGame();
  g.ball.dir = 1;
  const home = g.paddleBPos();
  const near = makeObstacle('slab', home.x, home.y, 1, D1);
  const far = makeObstacle('slab', home.x, home.y + 400, 1, D1);
  const loot = makeGold('mote', home.x, home.y, 1, D1);
  g.entities.push(near, far, loot);
  g._loseLife(null);
  assert.equal(near.dead, true, 'a hazard on the respawn is swept');
  assert.equal(far.dead, false);
  assert.equal(loot.dead, false, 'gold is not a threat, so it stays');
});

test('a run ends when the lives run out', () => {
  let finished = null;
  const g = new Game({}, stubInput(), { onFinish: (r) => { finished = r; } });
  g.resize(400, 800, 1);
  g.startRun(1, emptyUpgrades());
  for (let i = 0; i < CFG.base.lives; i++) { g.phase = 'play'; g._loseLife(null); }
  assert.ok(finished);
  assert.equal(finished.cleared, false);
  assert.equal(finished.reason, 'NO LIVES LEFT');
});

test('playground mode never runs out of health or lives', () => {
  const g = new Game({}, stubInput(), {});
  g.resize(400, 800, 1);
  g.startPlayground('slab');
  for (let i = 0; i < 10; i++) {
    g.phase = 'play';
    const e = makeObstacle('slab', 200, 400, 1, D1);
    e.spawnT = 0; e.w = 40; e.h = 40; g.entities.push(e);
    g._collide(200, 400);
  }
  assert.equal(g.lives, Infinity);
  assert.equal(g.health, Infinity);
  assert.equal(g.active, true);
});

// ── ball state ──────────────────────────────────────────────────────────────

test('a lift shoves whether or not anyone else is holding', () => {
  const g = mkGame();
  g.ball.dir = 1;
  g.input.boostDir = 1;
  assert.equal(g._ballState(), 'boost');
  g.input.boostDir = -1;
  assert.equal(g._ballState(), 'normal', 'a lift never drags an incoming ball');
  g.input.boostDir = 0;
  assert.equal(g._ballState(), 'normal');
});

test('a boosted ball flies, and nothing slows it down', () => {
  const g = mkGame();
  assert.equal(g._speedMult('normal'), 1);
  assert.equal(g._speedMult('boost'), CFG.boost.mult);
  assert.equal(CFG.boost.slow, undefined);
  assert.equal(CFG.ghost, undefined);
});

test('reverses() is the one place a bounce is decided', () => {
  assert.equal(reverses('block'), true);
  assert.equal(reverses('hurt'), true);
  assert.equal(reverses('kill'), false);
  assert.equal(reverses('crack'), false);
  assert.equal(reverses('take'), false);
  assert.equal(reverses('pass'), false);
});

test('ore only ever answers one question', () => {
  assert.equal(resolveOre({ boosted: true }), 'crack');
  assert.equal(resolveOre({ boosted: false }), 'pass');
});

// ── geometry ────────────────────────────────────────────────────────────────

test('entities are inert while telegraphing', () => {
  const e = makeEnemy('drone', 100, 100, 1, D1);
  assert.ok(e.spawnT > 0);
  assert.equal(hitTest(e, 100, 100, 8), false);
  e.spawnT = 0;
  assert.equal(hitTest(e, 100, 100, 8), true);
});

test('a shielded enemy is met at its shield, not its body', () => {
  const bare = makeEnemy('drone', 200, 400, 1, D1);
  const shut = makeEnemy('cyclops', 200, 400, 1, D1);
  bare.spawnT = 0; shut.spawnT = 0;
  assert.ok(shut.shieldR > shut.r, 'the ring stands off the body');
  assert.equal(hitTest(shut, 200 + shut.r + 2, 400, 1), true, 'contact happens at the ring');
  assert.equal(hitTest(bare, 200 + bare.r + 6, 400, 1), false, 'an unshielded one has no ring');
});

test('the rect-shaped obstacles collide as rectangles', () => {
  for (const key of ['slab', 'shard']) {
    const e = makeObstacle(key, 200, 400, 1, D1);
    e.spawnT = 0;
    e.horiz = true; e.w = 60; e.h = 16;
    assert.equal(hitTest(e, 200, 400, 8), true, key);
    assert.equal(hitTest(e, 200 + 29, 400, 8), true, `${key} inside the long edge`);
    assert.equal(hitTest(e, 200, 400 + 40, 8), false, `${key} clear above`);
  }
});

test('a rotor arm is lethal along its whole length, not just at the tip', () => {
  const e = makeObstacle('rotor', 200, 400, 1, D1);
  e.spawnT = 0;
  e.angle = 0;
  const mid = 200 + e.armLen * 0.5;
  assert.equal(hitTest(e, mid, 400, 6), true, 'mid-arm should hit');
  assert.equal(hitTest(e, 200, 400 + e.armLen, 6), false, 'perpendicular gap should miss');
});

test('everything that moves stays inside the reachable field', () => {
  const g = mkGame();
  const b = g.fieldBounds();
  const mid = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  const movers = [
    makeObstacle('shard', mid.x, mid.y, 1, D1),
    makeLooseMote(mid.x, mid.y, 1, D1),
  ];
  for (const e of movers) {
    e.ttl = Infinity; e.damp = 0;
    for (let i = 0; i < 3000; i++) {
      updateEntity(e, 1 / 60, b);
      assert.ok(e.x >= b.x0 - 0.001 && e.x <= b.x1 + 0.001, `${e.type} x stayed in reach`);
      assert.ok(e.y >= b.y0 - 0.001 && e.y <= b.y1 + 0.001, `${e.type} y stayed in reach`);
    }
  }
});

test('nothing spawns where the line cannot reach it', () => {
  const g = mkGame();
  const b = g.fieldBounds();
  const hw = g.paddleW / 2;
  assert.ok(b.x0 >= hw - 0.001, 'left edge is inside paddle reach');
  assert.ok(b.x1 <= g.W - hw + 0.001, 'right edge is inside paddle reach');
  assert.ok(b.y0 > g.margin && b.y1 < g.H - g.margin, 'clear of both paddle rows');

  for (let i = 0; i < 200; i++) {
    const spot = g._freeSpot(12, 60);
    if (!spot) continue;
    assert.ok(spot.x >= b.x0 && spot.x <= b.x1);
    assert.ok(spot.y >= b.y0 && spot.y <= b.y1);
  }
});

// ── scoring ─────────────────────────────────────────────────────────────────

test('the multiplier climbs on every kill and resets on damage', () => {
  const g = mkGame();
  const kill = () => g._kill(makeEnemy('drone', 200, 400, 1, D1));
  kill(); assert.equal(g.mult, 2);
  kill(); assert.equal(g.mult, 3);
  const v = makeEnemy('drone', 0, 0, 1, D1).value;
  assert.equal(g.score, v + v * 2, 'the multiplier applies at the moment of the kill');
  g._hurt(null);
  assert.equal(g.mult, 1);
});

// ── run economy ─────────────────────────────────────────────────────────────

test('clearing a run banks a time bonus', () => {
  let finished = null;
  const g = new Game({}, stubInput(), { onFinish: (r) => { finished = r; } });
  g.resize(400, 800, 1);
  g.startRun(1, emptyUpgrades());
  g.score = g.target;
  g.timeLeft = 10;
  g._finish(true, 'TARGET MET');
  assert.equal(finished.cleared, true);
  assert.equal(finished.bonus, 10 * CFG.run.timeBonusPerSec);
  assert.equal(g.score, g.target + finished.bonus);
});

test('run 1 carries all three families, because it has to', () => {
  const d = difficulty(1);
  assert.ok(d.goldPool.length, 'something to dig, or nothing pays for upgrades');
  assert.ok(d.enemyPool.length, 'something to kill, or the target is unreachable');
  assert.ok(d.obstaclePool.length, 'something to dodge, or there is no game');
});

test('after run 1 it is exactly one new piece per run', () => {
  const spread = (d) => [...d.goldPool, ...d.enemyPool, ...d.obstaclePool];
  const seen = new Set(spread(difficulty(1)));
  for (let n = 2; n <= 6; n++) {
    const fresh = spread(difficulty(n)).filter((k) => !seen.has(k));
    assert.equal(fresh.length, 1, `run ${n} should bring exactly one new piece`);
    seen.add(fresh[0]);
  }
  assert.equal(seen.size, Object.keys(ALL).length, 'everything is in play by run 6');
  assert.deepEqual(spread(difficulty(12)), spread(difficulty(6)), 'and nothing new after that');
});

test('targets and threat both climb every run', () => {
  for (let n = 1; n < 12; n++) {
    assert.ok(CFG.run.target(n + 1) > CFG.run.target(n), `target ${n}`);
    assert.ok(difficulty(n + 1).maxObstacles >= difficulty(n).maxObstacles);
    assert.ok(difficulty(n + 1).maxEnemies >= difficulty(n).maxEnemies);
    assert.ok(difficulty(n + 1).enemyGap <= difficulty(n).enemyGap);
    assert.ok(difficulty(n + 1).valueScale > difficulty(n).valueScale);
  }
});

test('the shop sells exactly the four levers, and each one moves', () => {
  assert.deepEqual(UPGRADES.map((u) => u.id).sort(), ['health', 'lives', 'strength', 'time']);
  for (const u of UPGRADES) {
    assert.ok(upgradeCost(u, 1) > upgradeCost(u, 0));
    assert.ok(upgradeCost(u, 3) > upgradeCost(u, 2));
  }
  const none = derived(emptyUpgrades());
  const kitted = derived({ ...emptyUpgrades(), lives: 2, health: 3, strength: 2, time: 2 });
  assert.equal(kitted.lives, none.lives + 2);
  assert.equal(kitted.health, none.health + 3);
  assert.equal(kitted.boostStrength, none.boostStrength + 2);
  assert.equal(kitted.time, none.time + 16);
  assert.equal(kitted.strength, none.strength, 'the resting strength is not for sale');
});

test('paddle width is not for sale, because it is not a lever', () => {
  assert.ok(!UPGRADES.some((u) => u.id === 'paddle'));
  const g = mkGame();
  const before = g.paddleW;
  g.startRun(1, { ...emptyUpgrades(), lives: 3, health: 5, strength: 4, time: 4 });
  assert.equal(g.paddleW, before);
});

test('buying boost strength really does beat a stronger enemy', () => {
  const weak = mkGame();
  weak.ball.state = 'boost';
  const e1 = put(weak, makeEnemy('janus', 0, 0, 1, D1), { boost: true });
  e1.weak = [{ side: 'a' }];
  weak.ball.dir = 1;
  weak._collide(200, 400 + e1.shieldR);
  assert.equal(e1.dead, false, 'a base ball cannot beat a janus');

  const strong = new Game({}, stubInput(), {});
  strong.resize(400, 800, 1);
  strong.startRun(1, { ...emptyUpgrades(), strength: 2 });
  strong.phase = 'play';
  strong.ball.state = 'boost';
  const e2 = put(strong, makeEnemy('janus', 0, 0, 1, D1), { boost: true });
  e2.weak = [{ side: 'a' }];
  strong.ball.dir = 1;
  strong._collide(200, 400 + e2.shieldR);
  assert.equal(e2.dead, true, 'two levels of boost strength does');
});
