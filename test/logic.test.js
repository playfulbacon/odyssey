// Rules tests for the parts of the prototype that are easy to break silently:
// the obstacle resolution matrix, boost arithmetic, shield/armour depletion and
// the life-loss respawn side. Pure logic — no DOM, no canvas.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CFG, UPGRADES, upgradeCost, derived, difficulty, emptyUpgrades } from '../src/config.js';
import {
  makeCollectable, makeObstacle, makeShards, hitTest, resolveObstacle, updateEntity,
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
  const input = stubInput();
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startRun(1, emptyUpgrades());
  g.phase = 'play';
  return g;
}

// ── obstacle resolution matrix ──────────────────────────────────────────────

test('slab and rotor are lethal in every state', () => {
  for (const type of ['slab', 'rotor']) {
    const e = makeObstacle(type, 100, 100, 1, D1);
    for (const boosted of [false, true]) {
      for (const handsOff of [false, true]) {
        assert.equal(resolveObstacle(e, { boosted, handsOff }), 'kill', `${type} ${boosted} ${handsOff}`);
      }
    }
  }
});

test('brittle only takes damage from a boosted ball', () => {
  const e = makeObstacle('brittle', 100, 100, 1, D1);
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: false }), 'damage');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: true }), 'damage');
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: true }), 'kill');
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: false }), 'kill');
});

test('phantom only takes damage with both fingers off the glass', () => {
  const e = makeObstacle('phantom', 100, 100, 1, D1);
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: true }), 'damage');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: true }), 'damage');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: false }), 'kill');
});

test('pulsar kills while lit and breaks while dark', () => {
  const e = makeObstacle('pulsar', 100, 100, 1, D1);
  e.armed = true;
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: false }), 'kill');
  e.armed = false;
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: false }), 'damage');
});

test('pulsar swaps its hit radius with its state', () => {
  const e = makeObstacle('pulsar', 100, 100, 1, D1);
  e.spawnT = 0;
  e.phase = 0;                       // start of the lit window
  updateEntity(e, 0.001, { x0: 0, x1: 400, y0: 0, y1: 800 });
  assert.equal(e.armed, true);
  const lit = e.r;
  e.phase = e.period * e.duty + 0.01; // just gone dark
  updateEntity(e, 0.001, { x0: 0, x1: 400, y0: 0, y1: 800 });
  assert.equal(e.armed, false);
  assert.ok(e.r < lit, 'dark pulsar should be smaller than lit');
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

// ── boost arithmetic ────────────────────────────────────────────────────────

test('a lift speeds the ball away and drags it back', () => {
  const g = mkGame();
  g.ball.dir = 1;

  g.input.boostDir = 0;
  assert.equal(g._speedMult(), 1, 'no lift, normal pace');

  g.input.boostDir = 1;                       // near player lifted, ball heading away
  assert.equal(g._speedMult(), CFG.boost.mult);

  g.input.boostDir = -1;                      // far player lifted, ball heading at them
  assert.equal(g._speedMult(), CFG.boost.slow);

  g.ball.dir = -1;                            // ball turns round
  assert.equal(g._speedMult(), CFG.boost.mult);
});

test('two simultaneous lifts cancel', () => {
  const g = mkGame();
  g.input.a.boostT = 0.3;
  g.input.b.boostT = 0.3;
  // boostDir on the real Input is (+1 for a) + (-1 for b)
  g.input.boostDir = (g.input.a.boostT > 0 ? 1 : 0) + (g.input.b.boostT > 0 ? -1 : 0);
  assert.equal(g.input.boostDir, 0);
  assert.equal(g._speedMult(), 1);
});

// ── shields ─────────────────────────────────────────────────────────────────

test('a shield must be stripped before the core can be banked', () => {
  const g = mkGame();
  g.power = 1;
  const e = makeCollectable('orb', 200, 400, 1, difficulty(3)); // shieldBonus 0 at r3? no: 0.9 -> 0
  e.shieldMax = 3; e.shield = 3; e.exposed = false; e.spawnT = 0;
  g.entities.push(e);

  g._hitCollectable(e);
  assert.equal(e.shield, 2);
  assert.equal(e.exposed, false);
  assert.equal(g.score, 0, 'stripping a shield pays nothing');

  g._hitCollectable(e);
  g._hitCollectable(e);
  assert.equal(e.shield, 0);
  assert.equal(e.exposed, true);
  assert.equal(e.dead, false, 'breaking the shield exposes the core, it does not bank it');

  g._hitCollectable(e);
  assert.equal(e.dead, true);
  assert.equal(g.score, e.value);
});

test('ball power decides how fast a shield comes down', () => {
  const g = mkGame();
  g.power = 3;
  const e = makeCollectable('orb', 200, 400, 1, D1);
  e.shieldMax = 3; e.shield = 3; e.exposed = false;
  g._hitCollectable(e);
  assert.equal(e.shield, 0);
  assert.equal(e.exposed, true);
});

test('the multiplier climbs on every bank and resets on a death', () => {
  const g = mkGame();
  const bank = () => {
    const e = makeCollectable('orb', 200, 400, 1, D1);
    e.shield = 0; e.exposed = true;
    g._hitCollectable(e);
  };
  bank(); assert.equal(g.mult, 2);
  bank(); assert.equal(g.mult, 3);
  assert.equal(g.score, 100 + 200, 'the multiplier applies at the moment of banking');
  g._loseLife(null);
  assert.equal(g.mult, 1);
});

test('a splitter bursts into shards that are already open', () => {
  const parent = makeCollectable('splitter', 200, 400, 1, D1);
  const shards = makeShards(parent, 1, D1);
  assert.equal(shards.length, 3);
  for (const s of shards) {
    assert.equal(s.exposed, true);
    assert.equal(s.spawnT, 0);
    assert.ok(s.vx !== 0 || s.vy !== 0, 'shards should scatter');
  }
});

// ── armour ──────────────────────────────────────────────────────────────────

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
  g.phase = 'play';
  for (let i = 0; i < CFG.base.lives; i++) { g.phase = 'play'; g._loseLife(null); }
  assert.ok(finished);
  assert.equal(finished.cleared, false);
  assert.equal(finished.reason, 'NO LIVES LEFT');
});

test('playground mode never runs out of lives', () => {
  const g = new Game({}, stubInput(), {});
  g.resize(400, 800, 1);
  g.startPlayground('slab');
  g.phase = 'play';
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
  assert.equal(difficulty(5).obstaclePool.length, 5, 'everything is in play by run 5');
});

test('upgrades get dearer and actually change the run', () => {
  for (const u of UPGRADES) {
    assert.ok(upgradeCost(u, 1) > upgradeCost(u, 0));
    assert.ok(upgradeCost(u, 3) > upgradeCost(u, 2));
  }
  const none = derived(emptyUpgrades());
  const kitted = derived({ ...emptyUpgrades(), lives: 2, power: 3, time: 2, paddle: 2, boost: 2 });
  assert.equal(kitted.lives, none.lives + 2);
  assert.equal(kitted.power, none.power + 3);
  assert.equal(kitted.time, none.time + 16);
  assert.ok(kitted.paddleScale > none.paddleScale);
  assert.ok(kitted.boostScale > none.boostScale);
});

// ── field ───────────────────────────────────────────────────────────────────

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
