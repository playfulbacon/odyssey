// Rules tests for the parts of the prototype that are easy to break silently:
// the colour language, the gate matrix, ring depletion, the life-loss respawn
// side and the run economy. Pure logic — no DOM, no canvas.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CFG, UPGRADES, upgradeCost, derived, difficulty, emptyUpgrades } from '../src/config.js';
import {
  PALETTE, GATES, COOL, SHIELDS, COLLECTABLES, OBSTACLES,
  isWarm, isCool, ballColorFor, lineColorFor, stateColorOf,
  isLethal, resolveObstacle, shieldBreaks,
  makeCollectable, makeObstacle, hitTest, updateEntity,
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

test('the line only turns gold once it is actually ghosted', () => {
  // Held: the line's own ink, ghosted or not.
  assert.equal(lineColorFor(true, false), PALETTE.ink);
  assert.equal(lineColorFor(true, true), PALETTE.ink);
  // Released while the other half is still held: dotted, but still ink. Gold
  // here would claim the phantom was open when it is not.
  assert.equal(lineColorFor(false, false), PALETTE.ink);
  // Released with both halves released: the phantom's own colour, exactly.
  assert.equal(lineColorFor(false, true), OBSTACLES.phantom.color);
  assert.equal(lineColorFor(false, true), SHIELDS.ghost.color);
});

test('a pulsar never changes hue, only its window', () => {
  const e = makeObstacle('pulsar', 100, 100, 1, D1);
  e.armed = true;
  const lit = stateColorOf(e);
  e.armed = false;
  assert.equal(stateColorOf(e), lit, 'the gate does not change, so the hue must not');
  assert.equal(lit, GATES.dark.color);
});

// ── collectables ────────────────────────────────────────────────────────────

test('there are exactly two collectables: the still one and the moving one', () => {
  assert.deepEqual(Object.keys(COLLECTABLES), ['mote', 'drifter']);
  assert.ok(COLLECTABLES.drifter.speed > 0, 'the drifter moves');
  assert.equal(COLLECTABLES.mote.speed, undefined, 'the mote does not');
});

test('no collectable wears a ring, at any depth of run', () => {
  for (const key of Object.keys(COLLECTABLES)) {
    assert.equal(COLLECTABLES[key].shield, undefined, `${key} def`);
    for (const run of [1, 5, 20]) {
      const e = makeCollectable(key, 0, 0, 1, difficulty(run));
      assert.equal(e.shieldMax, undefined, `${key} at run ${run}`);
      assert.equal(e.hpMax, undefined);
    }
  }
  // Armour is now an obstacle-only idea.
  assert.ok(makeObstacle('brittle', 0, 0, 1, D1).hpMax > 0);
});

test('touching a collectable banks it, whatever state the ball is in', () => {
  for (const key of Object.keys(COLLECTABLES)) {
    for (const w of WORLDS) {
      const g = mkGame();
      const e = makeCollectable(key, 200, 400, 1, D1);
      e.spawnT = 0;
      g.entities.push(e);
      g.ball.boosted = w.boosted;
      g.input.handsOff = w.handsOff;
      g._collide(e.x, e.y);
      assert.equal(e.dead, true, `${key}, ${w.name}`);
      assert.equal(g.score, e.value, `${key}, ${w.name}`);
    }
  }
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

test('obstacles pay far more than collectables, because they carry all the risk', () => {
  const best = Math.max(...Object.values(COLLECTABLES).map((d) => d.value));
  for (const d of Object.values(OBSTACLES)) {
    if (d.value) assert.ok(d.value > best * 2, `${d.key} should be worth the risk`);
  }
});

test('run 1 is motes alone; the moving one arrives on run 2', () => {
  assert.deepEqual(difficulty(1).collectPool, ['mote']);
  assert.deepEqual(difficulty(2).collectPool, ['mote', 'drifter']);
  assert.deepEqual(difficulty(9).collectPool, ['mote', 'drifter']);
});

// ── shields ─────────────────────────────────────────────────────────────────
//
// Two kinds, same idea: a shield is stripped by the state it is drawn in. The
// violet one wants the boosted ball; the dotted gold one wants a ghosted line.

test('a shield is broken by exactly the state it is drawn in', () => {
  assert.equal(SHIELDS.boost.color, PALETTE.ring, 'the colour the ball turns while boosting');
  assert.equal(SHIELDS.ghost.color, GATES.handsOff.color, 'the colour a released half of the line turns');

  for (const w of WORLDS) {
    assert.equal(SHIELDS.boost.breaks(w), w.boosted);
    assert.equal(SHIELDS.ghost.breaks(w), w.handsOff);
  }
});

test('every breakable obstacle names a shield, and unbreakable ones name none', () => {
  for (const d of Object.values(OBSTACLES)) {
    if (d.hp) assert.ok(SHIELDS[d.shield], `${d.key} has layers but no shield kind`);
    else assert.equal(d.shield, undefined, `${d.key} has no layers, so it should have no shield`);
  }
});

test('a boost shield only comes off a boosted ball', () => {
  for (const key of ['brittle', 'pulsar']) {
    const e = makeObstacle(key, 0, 0, 1, D1);
    e.armed = false;                       // put the pulsar in its open window
    assert.equal(e.shield, 'boost');
    for (const w of WORLDS) {
      if (isLethal(e, w)) continue;
      assert.equal(resolveObstacle(e, w), w.boosted ? 'damage' : 'pass', `${key}, ${w.name}`);
    }
  }
});

test('a ghost shield only comes off a ghosted line, and asks nothing about boost', () => {
  const e = makeObstacle('phantom', 0, 0, 1, D1);
  assert.equal(e.shield, 'ghost');

  // Someone is holding: lethal, whatever the ball is doing.
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: false }), 'kill');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: false }), 'kill');

  // Both let go: a layer comes off, and boosting is neither needed nor a bonus.
  assert.equal(resolveObstacle(e, { boosted: false, handsOff: true }), 'damage');
  assert.equal(resolveObstacle(e, { boosted: true, handsOff: true }), 'damage');
});

test('the phantom is a shield, not armour behind one', () => {
  const e = makeObstacle('phantom', 0, 0, 1, D1);
  assert.ok(e.hpMax >= 2, 'it takes more than one pass');
  // Whatever strips it is the same thing that makes it safe to touch, so there
  // is never a pass that is safe but useless.
  for (const w of WORLDS) {
    assert.equal(isLethal(e, w), !shieldBreaks(e, w), `phantom, ${w.name}`);
  }
});

test('the pulsar is the one piece whose gate and shield differ', () => {
  const e = makeObstacle('pulsar', 0, 0, 1, D1);
  e.armed = false;
  const w = { boosted: false, handsOff: false };
  assert.equal(isLethal(e, w), false, 'a dark pulsar is safe to touch');
  assert.equal(shieldBreaks(e, w), false, 'but a plain ball still strips nothing');
  assert.equal(resolveObstacle(e, w), 'pass');
});

test("a phantom's shield never grows, however deep the run", () => {
  assert.equal(makeObstacle('phantom', 0, 0, 1, difficulty(1)).hpMax,
               makeObstacle('phantom', 0, 0, 1, difficulty(12)).hpMax);
  assert.ok(makeObstacle('brittle', 0, 0, 1, difficulty(12)).hpMax > OBSTACLES.brittle.hp);
});

test('ball power decides how much shield a single good pass takes', () => {
  const g = mkGame();
  g.power = 3;
  const e = makeObstacle('brittle', 200, 400, 1, D1);
  assert.equal(e.hp, 3);
  g._damageObstacle(e);
  assert.equal(e.dead, true, 'a heavy enough ball ends it in one pass');
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
  const bank = () => g._collect(makeCollectable('mote', 200, 400, 1, D1));
  bank(); assert.equal(g.mult, 2);
  bank(); assert.equal(g.mult, 3);
  const v = COLLECTABLES.mote.value;
  assert.equal(g.score, v + v * 2, 'the multiplier applies at the moment of banking');
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

  const mote = makeCollectable('mote', 0, 0, 1, D1);
  assert.ok(e.value > mote.value * 3, 'risk should pay');
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
