// Rules tests for the parts of the prototype that are easy to break silently:
// the colour language, ring depletion, the life-loss respawn side and the run
// economy. Pure logic — no DOM, no canvas.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CFG, UPGRADES, upgradeCost, derived, difficulty, emptyUpgrades } from '../src/config.js';
import {
  PALETTE, COOL, SHIELD, COLLECTABLES, OBSTACLES,
  isWarm, isCool, ballColorFor, stateColorOf,
  isLethal, resolveCollectable, shieldBreaks,
  makeCollectable, makeObstacle, hitTest, updateEntity,
} from '../src/entities.js';
import { Game } from '../src/game.js';

const D1 = difficulty(1);

const SHIELDED = ['ward', 'shell', 'vault'];
const PLAIN = ['mote', 'drifter'];

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

// The world a contact sees. There is only one question left in it: is the ball
// boosting? That is the only thing that opens anything.
const WORLDS = [
  { name: 'plain', boosted: false },
  { name: 'boosted', boosted: true },
];

// ── the colour language ─────────────────────────────────────────────────────

test('cool means collectable, red means obstacle, and the sets do not overlap', () => {
  for (const d of Object.values(COLLECTABLES)) {
    assert.ok(isCool(d.color), `${d.key} should be cool`);
    assert.ok(!isWarm(d.color), `${d.key} must not be warm`);
  }
  for (const d of Object.values(OBSTACLES)) {
    assert.ok(isWarm(d.color), `${d.key} should be warm`);
    assert.ok(!isCool(d.color), `${d.key} must not be cool`);
  }
  for (const c of Object.values(COOL)) {
    assert.notEqual(c, PALETTE.hazard);
    assert.notEqual(c, PALETTE.boost);
  }
});

test('every obstacle is the same red, because every obstacle has the same answer', () => {
  for (const d of Object.values(OBSTACLES)) {
    assert.equal(d.color, PALETTE.hazard, `${d.key}`);
    assert.equal(stateColorOf(makeObstacle(d.key, 0, 0, 1, D1)), PALETTE.hazard, `${d.key} live`);
  }
});

test('a collectable hue says only whether it moves', () => {
  for (const d of Object.values(COLLECTABLES)) {
    assert.equal(d.color, d.speed ? COOL.blue : COOL.mint, `${d.key}`);
  }
});

test('orange is one idea: the shield, and the ball that strips it', () => {
  assert.equal(SHIELD.color, PALETTE.boost);
  assert.equal(ballColorFor('boost'), SHIELD.color, 'the ring and the key are the same colour');
});

test('the drifting ball is not a key, and does not look like one', () => {
  assert.equal(ballColorFor('ghost'), PALETTE.drift);
  assert.notEqual(PALETTE.drift, SHIELD.color, 'it must not read as orange');
  assert.ok(!isWarm(PALETTE.drift) && !isCool(PALETTE.drift), 'and it belongs to no family');
  assert.equal(shieldBreaks({ boosted: false }), false, 'drifting strips nothing');
  assert.equal(ballColorFor('normal'), PALETTE.ink, 'and ink strips nothing either');
});

// ── ball state ──────────────────────────────────────────────────────────────
//
// One state at a time, and a shove already under way always wins — the ball
// finishes its boost before it will ever drift.

test('a live shove beats the drift, so a boost always finishes', () => {
  const g = mkGame();
  g.ball.dir = 1;

  g.input.handsOff = true;
  g.input.boostDir = 0;
  assert.equal(g._ballState(), 'ghost', 'nothing pushing and nobody holding');

  // Both hands off, but one player's shove is still running in the ball's
  // direction: it keeps boosting until that dies.
  g.input.boostDir = 1;
  assert.equal(g._ballState(), 'boost');

  // Still running, pushing the other way: not a boost, but not a drift either.
  g.input.boostDir = -1;
  assert.equal(g._ballState(), 'normal', 'the shove has to finish first');
});

test('the ghost drift needs everyone off the glass', () => {
  const g = mkGame();
  g.input.boostDir = 0;
  g.input.handsOff = false;
  assert.equal(g._ballState(), 'normal');
  g.input.handsOff = true;
  assert.equal(g._ballState(), 'ghost');
});

test('a ghosted ball drifts, a boosted one flies, and plain is plain', () => {
  const g = mkGame();
  assert.equal(g._speedMult('normal'), 1);
  assert.equal(g._speedMult('boost'), CFG.boost.mult);
  assert.equal(g._speedMult('ghost'), CFG.ghost.slow);
  assert.ok(CFG.ghost.slow < 1, 'ghosting is slower than normal');
  assert.ok(CFG.boost.mult > 1, 'and boosting is faster');
});

// ── collectables ────────────────────────────────────────────────────────────

test('the collectables are the two plain ones and the 1/2/3-ring variants', () => {
  assert.deepEqual(Object.keys(COLLECTABLES), [...PLAIN, ...SHIELDED]);
  assert.deepEqual(SHIELDED.map((k) => COLLECTABLES[k].hp), [1, 2, 3]);
  for (const k of PLAIN) assert.equal(COLLECTABLES[k].hp, 0, `${k} wears nothing`);
});

test('the shielded variants differ in exactly one thing: how many rings', () => {
  const [a, b, c] = SHIELDED.map((k) => COLLECTABLES[k]);
  for (const d of [a, b, c]) {
    assert.equal(d.color, COOL.mint, `${d.key} is the same piece underneath`);
    assert.equal(d.speed, undefined, `${d.key} sits still`);
  }
  assert.ok(a.value < b.value && b.value < c.value, 'more rings, more points');
});

test('a ring count is the whole story — it never grows with the run', () => {
  for (const key of Object.keys(COLLECTABLES)) {
    for (const run of [1, 5, 20]) {
      const e = makeCollectable(key, 0, 0, 1, difficulty(run));
      assert.equal(e.hpMax, COLLECTABLES[key].hp, `${key} at run ${run}`);
      assert.equal(e.hp, e.hpMax);
    }
  }
});

test('a plain collectable is banked by any touch at all', () => {
  for (const key of PLAIN) {
    for (const w of WORLDS) {
      const g = mkGame();
      const e = makeCollectable(key, 200, 400, 1, D1);
      e.spawnT = 0;
      g.entities.push(e);
      g.ball.state = w.boosted ? 'boost' : 'normal';
      g._collide(e.x, e.y);
      assert.equal(e.dead, true, `${key}, ${w.name}`);
      assert.equal(g.score, e.value, `${key}, ${w.name}`);
    }
  }
});

test('a shielded collectable ignores an unboosted ball entirely', () => {
  for (const key of SHIELDED) {
    const g = mkGame();
    const e = makeCollectable(key, 200, 400, 1, D1);
    e.spawnT = 0;
    g.entities.push(e);
    g.ball.state = 'normal';

    for (let i = 0; i < 5; i++) {
      e.cool = 0;
      assert.equal(g._collide(e.x, e.y), false, `${key} can never end a life`);
    }
    assert.equal(e.hp, e.hpMax, `${key} kept every ring`);
    assert.equal(e.dead, false);
    assert.equal(g.score, 0);
    assert.equal(g.lives, CFG.base.lives, 'and cost nothing');
  }
});

test('a boosted pass strips a ring, and the pass that takes the last one banks it', () => {
  for (const key of SHIELDED) {
    const g = mkGame();
    g.power = 1;
    const e = makeCollectable(key, 200, 400, 1, D1);
    e.spawnT = 0;
    g.entities.push(e);
    g.ball.state = 'boost';

    const rings = e.hpMax;
    for (let i = 1; i <= rings; i++) {
      e.cool = 0;
      g._collide(e.x, e.y);
      const last = i === rings;
      assert.equal(e.hp, rings - i, `${key} after pass ${i}`);
      assert.equal(e.dead, last, `${key} dies only on the last pass`);
      assert.equal(g.score, last ? e.value : 0, `${key} pays only on the last pass`);
    }
  }
});

test('ball power decides how many rings a single pass takes', () => {
  const g = mkGame();
  g.power = 3;
  const e = makeCollectable('vault', 200, 400, 1, D1);
  assert.equal(e.hp, 3);
  g._strip(e);
  assert.equal(e.dead, true, 'a heavy enough ball opens it in one pass');
  assert.equal(g.score, e.value);
});

test('the drifter moves and the mote does not', () => {
  const bounds = { x0: 0, x1: 400, y0: 0, y1: 800 };
  const mote = makeCollectable('mote', 200, 400, 1, D1);
  const drift = makeCollectable('drifter', 200, 400, 1, D1);
  for (let i = 0; i < 30; i++) {
    updateEntity(mote, 1 / 60, bounds);
    updateEntity(drift, 1 / 60, bounds);
  }
  assert.equal(mote.x, 200);
  assert.equal(mote.y, 400);
  assert.ok(Math.hypot(drift.x - 200, drift.y - 400) > 5, 'the moving one should have moved');
  assert.ok(drift.value > mote.value, 'and pay more for the trouble');
});

test('a drifter stays inside the reachable field when it bounces', () => {
  const g = mkGame();
  const b = g.fieldBounds();
  const e = makeCollectable('drifter', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 1, D1);
  for (let i = 0; i < 4000; i++) {
    updateEntity(e, 1 / 60, b);
    assert.ok(e.x >= b.x0 - 0.001 && e.x <= b.x1 + 0.001, 'x stayed in reach');
    assert.ok(e.y >= b.y0 - 0.001 && e.y <= b.y1 + 0.001, 'y stayed in reach');
  }
});

test('the rings are where the points are', () => {
  const plain = Math.max(...PLAIN.map((k) => COLLECTABLES[k].value));
  for (const k of SHIELDED) {
    assert.ok(COLLECTABLES[k].value > plain, `${k} should beat every plain one`);
  }
  assert.ok(COLLECTABLES.vault.value > plain * 4, 'and the deepest one by a long way');
});

test('a shielded piece cannot sit on the field forever and stall the run', () => {
  for (const k of SHIELDED) {
    assert.ok(makeCollectable(k, 0, 0, 1, D1).ttl < Infinity, `${k} expires`);
  }
  for (const k of PLAIN) {
    assert.equal(makeCollectable(k, 0, 0, 1, D1).ttl, Infinity, `${k} waits`);
  }
  // And there is room for a second one alongside, so a run never queues up
  // behind a single set of rings.
  assert.equal(difficulty(1).maxCollectables, 1, 'nothing to wait for yet');
  assert.ok(difficulty(3).maxCollectables > 1, 'once rings are in play, two at a time');
});

// ── obstacles ───────────────────────────────────────────────────────────────

test('every obstacle is lethal on contact, in every state the ball can be in', () => {
  for (const key of Object.keys(OBSTACLES)) {
    const def = OBSTACLES[key];
    assert.equal(def.hp, 0, `${key} wears no shield`);
    assert.equal(def.value, 0, `${key} pays nothing`);
    assert.equal(def.gate, undefined, `${key} has no gate to learn`);

    const e = makeObstacle(key, 0, 0, 1, D1);
    assert.equal(isLethal(e), true, key);
    assert.equal(e.hpMax, 0, `${key} live`);
  }
  for (const key of Object.keys(COLLECTABLES)) {
    assert.equal(isLethal(makeCollectable(key, 0, 0, 1, D1)), false, `${key} can never hurt you`);
  }
});

test('a contact with an obstacle costs a life whatever the ball was doing', () => {
  for (const key of Object.keys(OBSTACLES)) {
    for (const w of WORLDS) {
      const g = mkGame();
      const e = makeObstacle(key, 200, 400, 1, D1);
      e.spawnT = 0;
      g.entities.push(e);
      g.ball.state = w.boosted ? 'boost' : 'normal';
      assert.equal(g._collide(200, 400), true, `${key}, ${w.name}`);
      assert.equal(g.lives, CFG.base.lives - 1, `${key}, ${w.name}`);
      assert.equal(g.score, 0, `${key} pays nothing, ${w.name}`);
    }
  }
});

test('the shard is a slab that got loose', () => {
  const slab = makeObstacle('slab', 200, 400, 1, D1);
  const shard = makeObstacle('shard', 200, 400, 1, D1);

  assert.equal(shard.shape, slab.shape, 'same drawing, so it reads the same');
  assert.equal(shard.color, slab.color, 'same red, same answer');
  assert.ok(Math.max(shard.w, shard.h) < Math.max(slab.w, slab.h), 'but smaller');
  assert.ok(Math.hypot(shard.vx, shard.vy) > 0, 'and it moves');
  assert.equal(Math.hypot(slab.vx, slab.vy), 0, 'where a slab sits still');
});

test('a shard bounces around inside the reachable field', () => {
  const g = mkGame();
  const b = g.fieldBounds();
  const e = makeObstacle('shard', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 1, D1);
  e.ttl = Infinity;
  for (let i = 0; i < 4000; i++) {
    updateEntity(e, 1 / 60, b);
    assert.ok(e.x >= b.x0 - 0.001 && e.x <= b.x1 + 0.001, 'x stayed in reach');
    assert.ok(e.y >= b.y0 - 0.001 && e.y <= b.y1 + 0.001, 'y stayed in reach');
  }
});

// ── geometry ────────────────────────────────────────────────────────────────

test('entities are inert while telegraphing', () => {
  const e = makeCollectable('vault', 100, 100, 1, D1);
  e.spawnT = 1;
  assert.equal(hitTest(e, 100, 100, 8), false);
  e.spawnT = 0;
  assert.equal(hitTest(e, 100, 100, 8), true);
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

// ── boost arithmetic ────────────────────────────────────────────────────────

test('a lift speeds the ball away and never slows it down', () => {
  const g = mkGame();
  const paceOf = () => g._speedMult(g._ballState());
  g.ball.dir = 1;
  g.input.handsOff = false;

  g.input.boostDir = 0;
  assert.equal(paceOf(), 1, 'no lift, normal pace');

  g.input.boostDir = 1;                       // near player lifted, ball heading away
  assert.equal(paceOf(), CFG.boost.mult);

  g.input.boostDir = -1;                      // far player lifted, ball heading at them
  assert.equal(paceOf(), 1, 'a lift must not drag an incoming ball');

  g.ball.dir = -1;                            // ball turns round
  assert.equal(paceOf(), CFG.boost.mult);

  assert.equal(CFG.boost.slow, undefined, 'a lift never slows anything');
});

test('two simultaneous lifts cancel, and the drift takes over', () => {
  const g = mkGame();
  g.input.a.boostT = 0.3;
  g.input.b.boostT = 0.3;
  g.input.boostDir = (g.input.a.boostT > 0 ? 1 : 0) + (g.input.b.boostT > 0 ? -1 : 0);
  assert.equal(g.input.boostDir, 0, 'the two shoves cancel');

  g.input.handsOff = false;
  assert.equal(g._ballState(), 'normal', 'someone still holding: just normal pace');
  g.input.handsOff = true;
  assert.equal(g._ballState(), 'ghost', 'nobody holding and nothing left to run');
});

test('resolveCollectable is the only contact rule left', () => {
  const plain = makeCollectable('mote', 0, 0, 1, D1);
  for (const w of WORLDS) assert.equal(resolveCollectable(plain, w), 'collect', w.name);

  const rings = makeCollectable('shell', 0, 0, 1, D1);
  assert.equal(resolveCollectable(rings, { boosted: false }), 'pass');
  assert.equal(resolveCollectable(rings, { boosted: true }), 'damage');
  rings.hp = 0;
  assert.equal(resolveCollectable(rings, { boosted: false }), 'collect',
    'once the rings are gone it is just a mote again');
});

// ── scoring ─────────────────────────────────────────────────────────────────

test('the multiplier climbs on every bank and resets on a death', () => {
  const g = mkGame();
  const bank = () => g._collect(makeCollectable('mote', 200, 400, 1, D1));
  bank(); assert.equal(g.mult, 2);
  bank(); assert.equal(g.mult, 3);
  const v = COLLECTABLES.mote.value;
  assert.equal(g.score, v + v * 2, 'the multiplier applies at the moment of banking');
  g._loseLife(null);
  assert.equal(g.mult, 1);
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

test('each run teaches exactly one new piece', () => {
  assert.deepEqual(difficulty(1).collectPool, ['mote']);
  assert.deepEqual(difficulty(1).obstaclePool, ['slab']);

  const seen = new Set(['mote', 'slab']);
  for (let n = 2; n <= 7; n++) {
    const d = difficulty(n);
    const fresh = [...d.collectPool, ...d.obstaclePool].filter((k) => !seen.has(k));
    assert.equal(fresh.length, 1, `run ${n} should bring exactly one new piece`);
    seen.add(fresh[0]);
  }
  const last = difficulty(7);
  assert.equal(last.collectPool.length, Object.keys(COLLECTABLES).length, 'every collectable by run 7');
  assert.equal(last.obstaclePool.length, Object.keys(OBSTACLES).length, 'every obstacle by run 7');
  assert.deepEqual(difficulty(12).collectPool, last.collectPool, 'and nothing new after that');
});

test('targets and threat both climb every run', () => {
  for (let n = 1; n < 12; n++) {
    assert.ok(CFG.run.target(n + 1) > CFG.run.target(n), `target ${n}`);
    assert.ok(difficulty(n + 1).maxObstacles >= difficulty(n).maxObstacles);
    assert.ok(difficulty(n + 1).obstacleGap <= difficulty(n).obstacleGap);
    assert.ok(difficulty(n + 1).valueScale > difficulty(n).valueScale);
  }
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
