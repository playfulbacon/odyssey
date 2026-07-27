// Rules tests for the parts of the prototype that are easy to break silently:
// the colour language, the gate matrix, ring depletion, the life-loss respawn
// side and the run economy. Pure logic — no DOM, no canvas.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CFG, UPGRADES, upgradeCost, derived, difficulty, emptyUpgrades } from '../src/config.js';
import {
  PALETTE, GATES, COOL, COLLECTABLES, OBSTACLES,
  isWarm, isCool, ballColorFor, lineColorFor, stateColorOf,
  isLethal, resolveObstacle, resolveCollectable,
  makeCollectable, makeObstacle, makeShards, hitTest, updateEntity,
} from '../src/entities.js';
import { Game } from '../src/game.js';

const D1 = difficulty(1);

function stubInput() {
  const p = () => ({ nx: 0.5, touching: false, boostT: 0, pointerId: null });
  return {
    a: p(), b: p(),
    boostDir: 0, handsOff: false, boostDur: CFG.boost.dur, enabled: false,
    update() {}, setBounds() {}, reset() {}, clearTouches() {}, clearEdges() {},
  };
}

function mkGame() {
  const g = new Game({}, stubInput(), {});
  g.resize(400, 800, 1);
  g.startRun(1, emptyUpgrades());
  g.phase = 'play';
  return g;
}

const WORLDS = [
  { name: 'plain', boosted: false, handsOff: false },
  { name: 'boosted', boosted: true, handsOff: false },
  { name: 'hands off', boosted: false, handsOff: true },
  { name: 'boosted, hands off', boosted: true, handsOff: true },
];

// ── the colour language ─────────────────────────────────────────────────────

test('cool means collectable, warm means obstacle, and the sets do not overlap', () => {
  for (const d of Object.values(COLLECTABLES)) {
    assert.ok(isCool(d.color), `${d.key} should be cool`);
    assert.ok(!isWarm(d.color), `${d.key} must not be warm`);
  }
  for (const d of Object.values(OBSTACLES)) {
    assert.ok(isWarm(d.color), `${d.key} should be warm`);
    assert.ok(!isCool(d.color), `${d.key} must not be cool`);
  }
  const cool = new Set(Object.values(COOL));
  const warm = new Set(Object.values(GATES).map((g) => g.color));
  for (const c of cool) assert.ok(!warm.has(c), 'a hue cannot be in both families');
});

test('violet and ink belong to neither family — they carry rules, not identity', () => {
  for (const c of [PALETTE.ring, PALETTE.ink]) {
    assert.ok(!isWarm(c) && !isCool(c));
  }
});

test("an obstacle's colour is derived from its gate, so it cannot disagree", () => {
  for (const d of Object.values(OBSTACLES)) {
    assert.equal(d.color, GATES[d.gate].color, `${d.key}`);
  }
  // Same gate, same look. Different gate, different look.
  assert.equal(OBSTACLES.slab.gate, OBSTACLES.rotor.gate);
  assert.equal(OBSTACLES.slab.color, OBSTACLES.rotor.color);
  assert.notEqual(OBSTACLES.brittle.color, OBSTACLES.phantom.color);
  assert.notEqual(OBSTACLES.brittle.color, OBSTACLES.pulsar.color);
  assert.notEqual(OBSTACLES.phantom.color, OBSTACLES.pulsar.color);
});

test('the ball reports one thing: whether it can break a ring', () => {
  assert.equal(ballColorFor({ boosted: true }), PALETTE.ring);
  assert.equal(ballColorFor({ boosted: false }), PALETTE.ink);
  // Hands-off is deliberately *not* on the ball any more — it lives on the line.
  assert.equal(ballColorFor({ boosted: false, handsOff: true }), PALETTE.ink);
});

test('a released half of the line wears the colour of the obstacle it opens', () => {
  assert.equal(lineColorFor(false), OBSTACLES.phantom.color);
  assert.equal(lineColorFor(true), PALETTE.ink);
});

test('a pulsar never changes hue, only its window', () => {
  const e = makeObstacle('pulsar', 100, 100, 1, D1);
  e.armed = true;
  const lit = stateColorOf(e);
  e.armed = false;
  assert.equal(stateColorOf(e), lit, 'the gate does not change, so the hue must not');
  assert.equal(lit, GATES.dark.color);
});

// ── rings ───────────────────────────────────────────────────────────────────

test('the mote has no rings and is banked by any touch at all', () => {
  for (const run of [1, 5, 12]) {
    const e = makeCollectable('mote', 0, 0, 1, difficulty(run));
    assert.equal(e.shieldMax, 0, `run ${run}: the plain one must stay plain`);
    assert.equal(e.exposed, true, 'open from the moment it lands');
    for (const w of WORLDS) {
      assert.equal(resolveCollectable(e, w), 'collect', `run ${run}, ${w.name}`);
    }
  }
  // Everything else does grow rings as the runs go on.
  assert.ok(makeCollectable('orb', 0, 0, 1, difficulty(12)).shieldMax > COLLECTABLES.orb.shield);
});

test('banking a mote needs no boost end to end', () => {
  const g = mkGame();
  const e = makeCollectable('mote', 200, 400, 1, D1);
  e.spawnT = 0;
  g.entities.push(e);
  g.ball.boosted = false;
  g._collide(e.x, e.y);
  assert.equal(e.dead, true);
  assert.equal(g.score, e.value);
});

test('run 1 is motes alone, so the first run never mentions boost', () => {
  assert.deepEqual(difficulty(1).collectPool, ['mote']);
  assert.ok(difficulty(2).collectPool.includes('orb'), 'the ring rule arrives on run 2');
  for (let n = 1; n < 12; n++) {
    assert.ok(difficulty(n + 1).collectPool.length >= difficulty(n).collectPool.length);
  }
});

test('a ring only comes off a boosted ball, on a collectable or an obstacle', () => {
  for (const w of WORLDS) {
    const orb = makeCollectable('orb', 0, 0, 1, D1);
    assert.equal(resolveCollectable(orb, w), w.boosted ? 'damage' : 'pass', `orb, ${w.name}`);

    const brittle = makeObstacle('brittle', 0, 0, 1, D1);
    if (!isLethal(brittle, w)) {
      assert.equal(resolveObstacle(brittle, w), w.boosted ? 'damage' : 'pass', `brittle, ${w.name}`);
    }

    const pulsar = makeObstacle('pulsar', 0, 0, 1, D1);
    pulsar.armed = false;
    assert.equal(resolveObstacle(pulsar, w), w.boosted ? 'damage' : 'pass', `dark pulsar, ${w.name}`);
  }
});

test('an unboosted pass over a shielded collectable does nothing at all', () => {
  const g = mkGame();
  g.power = 1;
  const e = makeCollectable('orb', 200, 400, 1, D1);
  e.shieldMax = 2; e.shield = 2; e.exposed = false; e.spawnT = 0;
  g.entities.push(e);
  g.ball.boosted = false;

  g._collide(e.x, e.y);
  assert.equal(e.shield, 2, 'no free chip for drifting through');
  assert.equal(e.cool, 0, 'and no lockout, so a boost mid-crossing still lands');

  g.ball.boosted = true;
  g._collide(e.x, e.y);
  assert.equal(e.shield, 1);
  assert.ok(e.cool > 0, 'one pass, one ring');
});

test('the last ring exposes the core; banking it needs no boost', () => {
  const g = mkGame();
  g.power = 1;
  const e = makeCollectable('orb', 200, 400, 1, D1);
  e.shieldMax = 2; e.shield = 2; e.exposed = false;

  g._breakShield(e);
  assert.equal(e.exposed, false);
  assert.equal(g.score, 0, 'stripping a ring pays nothing');

  g._breakShield(e);
  assert.equal(e.shield, 0);
  assert.equal(e.exposed, true);
  assert.equal(e.dead, false, 'breaking the shield opens it, it does not bank it');

  assert.equal(resolveCollectable(e, { boosted: false, handsOff: false }), 'collect');
  g._collect(e);
  assert.equal(e.dead, true);
  assert.equal(g.score, e.value);
});

test('ball power decides how many rings a single boosted pass takes', () => {
  const g = mkGame();
  g.power = 3;
  const e = makeCollectable('orb', 200, 400, 1, D1);
  e.shieldMax = 3; e.shield = 3; e.exposed = false;
  g._breakShield(e);
  assert.equal(e.shield, 0);
  assert.equal(e.exposed, true);
});

test('splitter shards come out already open, so no boost is needed to sweep them', () => {
  const parent = makeCollectable('splitter', 200, 400, 1, D1);
  const shards = makeShards(parent, 1, D1);
  assert.equal(shards.length, 3);
  for (const s of shards) {
    assert.equal(s.exposed, true);
    assert.equal(resolveCollectable(s, { boosted: false, handsOff: false }), 'collect');
    assert.ok(s.vx !== 0 || s.vy !== 0, 'shards should scatter');
  }
});

// ── gates ───────────────────────────────────────────────────────────────────

test('red gates are lethal in every state', () => {
  for (const type of ['slab', 'rotor']) {
    const e = makeObstacle(type, 100, 100, 1, D1);
    assert.equal(e.color, GATES.never.color);
    for (const w of WORLDS) {
      assert.equal(resolveObstacle(e, w), 'kill', `${type}, ${w.name}`);
    }
  }
});

test('orange is lethal to anything but a boosted ball', () => {
  const e = makeObstacle('brittle', 100, 100, 1, D1);
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: false }), 'kill');
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: true }), 'kill');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: false }), 'damage');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: true }), 'damage');
});

test('gold is lethal unless both fingers are off, and only then can it be broken', () => {
  const e = makeObstacle('phantom', 100, 100, 1, D1);
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: false }), 'kill');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: false }), 'kill');
  // Safe to coast through with both hands off...
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: true }), 'pass');
  // ...and destroyed by a boost that is still alive in that same window.
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: true }), 'damage');
});

test('a phantom dies to one boosted pass and its armour never grows', () => {
  const e1 = makeObstacle('phantom', 0, 0, 1, difficulty(1));
  const e9 = makeObstacle('phantom', 0, 0, 1, difficulty(9));
  assert.equal(e1.hpMax, 1);
  assert.equal(e9.hpMax, 1, 'the double gate is already the hardest thing in the game');
  assert.ok(makeObstacle('brittle', 0, 0, 1, difficulty(9)).hpMax > OBSTACLES.brittle.hp);
});

test('pink is lethal while lit and breakable while dark', () => {
  const e = makeObstacle('pulsar', 100, 100, 1, D1);
  e.armed = true;
  for (const w of WORLDS) assert.equal(resolveObstacle(e, w), 'kill', `lit pulsar, ${w.name}`);
  e.armed = false;
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: false }), 'pass');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: false }), 'damage');
});

test('pulsar swaps its hit radius with its state', () => {
  const e = makeObstacle('pulsar', 100, 100, 1, D1);
  e.spawnT = 0;
  e.phase = 0;                        // start of the lit window
  updateEntity(e, 0.001, { x0: 0, x1: 400, y0: 0, y1: 800 });
  assert.equal(e.armed, true);
  const lit = e.r;
  e.phase = e.period * e.duty + 0.01; // just gone dark
  updateEntity(e, 0.001, { x0: 0, x1: 400, y0: 0, y1: 800 });
  assert.equal(e.armed, false);
  assert.ok(e.r < lit, 'dark pulsar should be smaller than lit');
});

// ── boost arithmetic ────────────────────────────────────────────────────────

test('a lift speeds the ball away and never slows it down', () => {
  const g = mkGame();
  g.ball.dir = 1;

  g.input.boostDir = 0;
  assert.equal(g._speedMult(), 1, 'no lift, normal pace');

  g.input.boostDir = 1;                       // near player lifted, ball heading away
  assert.equal(g._speedMult(), CFG.boost.mult);

  g.input.boostDir = -1;                      // far player lifted, ball heading at them
  assert.equal(g._speedMult(), 1, 'a lift must not drag an incoming ball');

  g.ball.dir = -1;                            // ball turns round
  assert.equal(g._speedMult(), CFG.boost.mult);

  assert.equal(CFG.boost.slow, undefined, 'the slow-down is gone entirely');
});

test('two simultaneous lifts cancel', () => {
  const g = mkGame();
  g.input.a.boostT = 0.3;
  g.input.b.boostT = 0.3;
  g.input.boostDir = (g.input.a.boostT > 0 ? 1 : 0) + (g.input.b.boostT > 0 ? -1 : 0);
  assert.equal(g.input.boostDir, 0);
  assert.equal(g._speedMult(), 1);
});

// ── geometry ────────────────────────────────────────────────────────────────

test('entities are inert while telegraphing', () => {
  const e = makeObstacle('brittle', 100, 100, 1, D1);
  assert.ok(e.spawnT > 0);
  assert.equal(hitTest(e, 100, 100, 8), false);
  e.spawnT = 0;
  assert.equal(hitTest(e, 100, 100, 8), true);
});

test('slab collides as a rectangle', () => {
  const e = makeObstacle('slab', 200, 400, 1, D1);
  e.spawnT = 0;
  e.horiz = true; e.w = 60; e.h = 16;
  assert.equal(hitTest(e, 200, 400, 8), true);
  assert.equal(hitTest(e, 200 + 29, 400, 8), true);   // inside the long edge
  assert.equal(hitTest(e, 200, 400 + 40, 8), false);  // clear above/below
});

test('a rotor arm is lethal along its whole length, not just at the tip', () => {
  const e = makeObstacle('rotor', 200, 400, 1, D1);
  e.spawnT = 0;
  e.angle = 0;                                        // arms lie on the x axis
  const mid = 200 + e.armLen * 0.5;
  assert.equal(hitTest(e, mid, 400, 6), true, 'mid-arm should hit');
  assert.equal(hitTest(e, 200, 400 + e.armLen, 6), false, 'perpendicular gap should miss');
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

test('the multiplier climbs on every bank and resets on a death', () => {
  const g = mkGame();
  const bank = () => {
    const e = makeCollectable('orb', 200, 400, 1, D1);
    e.shield = 0; e.exposed = true;
    g._collect(e);
  };
  bank(); assert.equal(g.mult, 2);
  bank(); assert.equal(g.mult, 3);
  assert.equal(g.score, 100 + 200, 'the multiplier applies at the moment of banking');
  g._loseLife(null);
  assert.equal(g.mult, 1);
});

test('a breakable obstacle takes several passes and pays more than a collectable', () => {
  const g = mkGame();
  g.power = 1;
  const e = makeObstacle('brittle', 200, 400, 1, D1);
  assert.equal(e.hp, 3);
  g._damageObstacle(e);
  assert.equal(e.hp, 2);
  assert.equal(e.dead, false);
  assert.equal(g.score, 0);
  g._damageObstacle(e);
  g._damageObstacle(e);
  assert.equal(e.dead, true);
  assert.equal(g.score, e.value);

  const orb = makeCollectable('orb', 0, 0, 1, D1);
  assert.ok(e.value > orb.value * 3, 'risk should pay');
});

// ── life loss ───────────────────────────────────────────────────────────────

test('the ball comes back on the paddle it was heading for', () => {
  const g = mkGame();
  g.ball.dir = 1;                       // travelling toward the far paddle
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

test('a death clears whatever was camping the respawn', () => {
  const g = mkGame();
  g.ball.dir = 1;
  const home = g.paddleBPos();
  const near = makeObstacle('slab', home.x, home.y, 1, D1);
  const far = makeObstacle('slab', home.x, home.y + 400, 1, D1);
  g.entities.push(near, far);
  g._loseLife(null);
  assert.equal(near.dead, true);
  assert.equal(far.dead, false);
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

test('playground mode never runs out of lives', () => {
  const g = new Game({}, stubInput(), {});
  g.resize(400, 800, 1);
  g.startPlayground('slab');
  for (let i = 0; i < 10; i++) { g.phase = 'play'; g._loseLife(null); }
  assert.equal(g.lives, Infinity);
  assert.equal(g.active, true);
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

test('targets and threat both climb every run', () => {
  for (let n = 1; n < 12; n++) {
    assert.ok(CFG.run.target(n + 1) > CFG.run.target(n), `target ${n}`);
    assert.ok(difficulty(n + 1).maxObstacles >= difficulty(n).maxObstacles);
    assert.ok(difficulty(n + 1).obstacleGap <= difficulty(n).obstacleGap);
    assert.ok(difficulty(n + 1).valueScale > difficulty(n).valueScale);
  }
  assert.deepEqual(difficulty(1).obstaclePool, ['slab']);
  assert.equal(difficulty(5).obstaclePool.length, 5, 'every obstacle is in play by run 5');
  assert.equal(difficulty(5).collectPool.length, 5, 'and every collectable');
});

test('paddle width is not for sale, because it is not a lever', () => {
  assert.ok(!UPGRADES.some((u) => u.id === 'paddle'), 'no wide-paddle upgrade');
  assert.equal(derived(emptyUpgrades()).paddleScale, undefined);

  // And the width really is constant, whatever anyone has bought.
  const g = mkGame();
  const before = g.paddleW;
  g.startRun(1, { ...emptyUpgrades(), lives: 3, power: 5, time: 4, boost: 6 });
  assert.equal(g.paddleW, before);
});

test('upgrades get dearer and actually change the run', () => {
  for (const u of UPGRADES) {
    assert.ok(upgradeCost(u, 1) > upgradeCost(u, 0));
    assert.ok(upgradeCost(u, 3) > upgradeCost(u, 2));
  }
  const none = derived(emptyUpgrades());
  const kitted = derived({ ...emptyUpgrades(), lives: 2, power: 3, time: 2, boost: 2 });
  assert.equal(kitted.lives, none.lives + 2);
  assert.equal(kitted.power, none.power + 3);
  assert.equal(kitted.time, none.time + 16);
  assert.ok(kitted.boostScale > none.boostScale);
});
