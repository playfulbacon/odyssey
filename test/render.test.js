// Drawing tests, through a recording stand-in for a canvas context.
//
// These exist for two claims in particular: that the ball says what it is doing
// with colour and nothing else, and that the line says nothing at all. That is
// the sort of agreement that rots silently, so it is checked against what
// render() actually emits rather than against the helpers in isolation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { difficulty, emptyUpgrades } from '../src/config.js';
import { PALETTE, SHIELD, makeCollectable, makeObstacle } from '../src/entities.js';
import { Game } from '../src/game.js';
import { render } from '../src/render.js';

// Records every stroke and fill with the state that was live at the time.
function recorder() {
  const ops = [];
  let st = { strokeStyle: '#000', fillStyle: '#000', globalAlpha: 1, lineWidth: 1, lineCap: 'butt', dash: [] };
  const stack = [];
  const ctx = {
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get lineCap() { return st.lineCap; }, set lineCap(v) { st.lineCap = v; },
    font: '', textAlign: '', textBaseline: '', letterSpacing: '',
    save() { stack.push({ ...st, dash: [...st.dash] }); },
    restore() { if (stack.length) st = stack.pop(); },
    setLineDash(d) { st.dash = [...d]; },
    translate() {}, rotate() {}, clip() {},
    beginPath() {}, moveTo() {}, lineTo() {}, rect() {}, roundRect() {}, arc() {},
    fillRect() { ops.push({ op: 'fill', ...st, dash: [...st.dash] }); },
    fill() { ops.push({ op: 'fill', ...st, dash: [...st.dash] }); },
    stroke() { ops.push({ op: 'stroke', ...st, dash: [...st.dash] }); },
    fillText() { ops.push({ op: 'text', ...st, dash: [...st.dash] }); },
    measureText() { return { width: 10 }; },
  };
  return { ctx, ops };
}

function stubInput(aTouch, bTouch) {
  const p = (t) => ({ nx: 0.5, touching: t, boostT: 0, pointerId: null, keyLeft: false, keyRight: false, keyHold: false });
  return {
    a: p(aTouch), b: p(bTouch),
    boostDir: 0, boostDur: 0.4, enabled: true,
    get handsOff() { return !this.a.touching && !this.b.touching; },
    update() {}, setBounds() {}, reset() {}, clearTouches() {}, clearEdges() {},
  };
}

// A live playground with one piece sitting in the middle of the field.
function frameWith(type, aTouch, bTouch, ballState = 'normal') {
  const input = stubInput(aTouch, bTouch);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startPlayground(type);
  g.phase = 'play';
  g.ball.state = ballState;
  g.entities.length = 0;
  const make = type in { slab: 1, shard: 1, rotor: 1 } ? makeObstacle : makeCollectable;
  const e = make(type, 200, 400, 1, difficulty(1));
  e.spawnT = 0;
  g.entities.push(e);

  const { ctx, ops } = recorder();
  render(ctx, g);
  return ops;
}

// An empty field, so the only things drawn are the furniture: the divider, the
// line, the paddles and the ball. Nothing else can be mistaken for the line.
function bare(aTouch, bTouch, ballState = 'normal') {
  const input = stubInput(aTouch, bTouch);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startPlayground('mote');
  g.phase = 'play';
  g.ball.state = ballState;
  g.entities.length = 0;
  const { ctx, ops } = recorder();
  render(ctx, g);
  return ops;
}

const fills = (ops, color) => ops.filter((o) => o.op === 'fill' && o.fillStyle === color);
const strokes = (ops, color) => ops.filter((o) => o.op === 'stroke' && o.strokeStyle === color);

const DIVIDER = '#1b1e23';
const TOUCHES = [[true, true], [true, false], [false, true], [false, false]];

// ── the line ────────────────────────────────────────────────────────────────

test('the line is faded dotted ink, and holding the glass changes nothing', () => {
  // On an empty field there is nothing else to stroke, so every stroke on
  // screen belongs to the line or the divider.
  let seen = null;
  for (const [a, b] of TOUCHES) {
    const line = strokes(bare(a, b), PALETTE.ink);
    assert.ok(line.length >= 1, `touches ${a}/${b}`);
    for (const o of line) assert.ok(o.dash.length > 0, `touches ${a}/${b}: always dotted`);

    // Same colour, same dash, same weight, same alpha, every time.
    const shape = [...new Set(line.map((o) => `${o.dash.join(',')}|${o.lineWidth}|${o.globalAlpha.toFixed(3)}`))];
    assert.equal(shape.length, 1, `touches ${a}/${b}: one treatment, got ${shape.join(' / ')}`);
    if (seen) assert.deepEqual(shape, seen, `touches ${a}/${b} drew a different line`);
    seen = shape;
  }
});

test('nothing but ink is ever stroked on an empty field', () => {
  for (const [a, b] of TOUCHES) {
    for (const state of ['normal', 'boost', 'ghost']) {
      const colors = new Set(bare(a, b, state)
        .filter((o) => o.op === 'stroke')
        .map((o) => o.strokeStyle));
      colors.delete(DIVIDER);
      colors.delete(PALETTE.ink);
      assert.deepEqual([...colors], [], `touches ${a}/${b}, ball ${state}: no halo, no outline`);
    }
  }
});

// ── the ball ────────────────────────────────────────────────────────────────

test('colour alone is the ball state — no ring, no dots, no outline', () => {
  // Empty field, so the ball is the only thing that could be wearing one.
  for (const state of ['boost', 'ghost', 'normal']) {
    const ops = bare(false, false, state);
    assert.equal(strokes(ops, PALETTE.boost).length, 0, `${state}: no orange outline`);
    assert.equal(strokes(ops, PALETTE.drift).length, 0, `${state}: no violet outline`);
  }
});

test('the ball is filled with the state it is in', () => {
  assert.ok(fills(bare(true, true, 'boost'), PALETTE.boost).length >= 1, 'boosting: orange');
  assert.ok(fills(bare(false, false, 'ghost'), PALETTE.drift).length >= 1, 'drifting: violet');

  const plain = bare(true, true, 'normal');
  assert.equal(fills(plain, PALETTE.boost).length, 0, 'a plain ball is never orange');
  assert.equal(fills(plain, PALETTE.drift).length, 0, 'nor violet');
  assert.ok(fills(plain, PALETTE.ink).length >= 1, 'it is ink');
});

test('a boosting ball leaves an orange trail behind it', () => {
  const g = new Game({}, stubInput(true, true), {});
  g.resize(400, 800, 1);
  g.startPlayground('mote');
  g.phase = 'play';
  g.entities.length = 0;

  // Lay down a streak the way _stepBall does, then a plain tail behind it.
  for (let i = 0; i < 6; i++) g.ball.trail.push({ x: 200, y: 300 + i, c: PALETTE.ink, boost: false });
  for (let i = 0; i < 6; i++) g.ball.trail.push({ x: 200, y: 400 + i, c: PALETTE.boost, boost: true });
  g.ball.state = 'boost';

  const { ctx, ops } = recorder();
  render(ctx, g);

  const hot = fills(ops, PALETTE.boost);
  assert.ok(hot.length >= 6, `expected the orange streak, got ${hot.length}`);
  // And it has to be louder than the ordinary trail, or it is not a streak.
  const cool = fills(ops, PALETTE.ink).filter((o) => o.globalAlpha < 1);
  assert.ok(cool.length, 'the plain part of the trail was drawn too');
  assert.ok(Math.max(...hot.map((o) => o.globalAlpha)) > Math.max(...cool.map((o) => o.globalAlpha)),
    'the boost streak should be brighter than the plain one');
});

// ── shields ─────────────────────────────────────────────────────────────────

test('a shield is orange and solid, wherever it appears', () => {
  for (const [type, rings] of [['ward', 1], ['shell', 2], ['vault', 3]]) {
    const ops = strokes(frameWith(type, true, true), SHIELD.color);
    assert.equal(ops.length, rings, `${type} draws one arc per ring`);
    for (const o of ops) assert.equal(o.dash.length, 0, `${type}: a shield is never dotted`);
  }
});

test('the shield is drawn in exactly the colour of the ball that strips it', () => {
  const ring = strokes(frameWith('shell', true, true), SHIELD.color);
  const ball = fills(bare(true, true, 'boost'), PALETTE.boost);
  assert.ok(ring.length && ball.length, 'both were drawn');
  assert.equal(ring[0].strokeStyle, ball[0].fillStyle, 'ring and key are the same substance');
});

test('spent rings stay on screen, dimmed, so the depth is always readable', () => {
  const input = stubInput(true, true);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startPlayground('vault');
  g.phase = 'play';
  g.entities.length = 0;
  const e = makeCollectable('vault', 200, 400, 1, difficulty(1));
  e.spawnT = 0;
  e.hp = 1;                       // two of three already stripped
  g.entities.push(e);

  const { ctx, ops } = recorder();
  render(ctx, g);
  const arcs = strokes(ops, SHIELD.color);
  assert.equal(arcs.length, 3, 'all three arcs are still drawn');
  const bright = arcs.filter((o) => o.globalAlpha > 0.5);
  assert.equal(bright.length, 1, 'but only the ring that is left is lit');
});

test('an obstacle wears no shield colour at all', () => {
  for (const type of ['slab', 'shard', 'rotor']) {
    const ops = frameWith(type, true, true);
    assert.equal(strokes(ops, SHIELD.color).length, 0, `${type} has nothing to strip`);
    assert.equal(fills(ops, SHIELD.color).length, 0, type);
    assert.ok(strokes(ops, PALETTE.hazard).length >= 1, `${type} is red`);
  }
});

test('a plain collectable wears no rings', () => {
  for (const type of ['mote', 'drifter']) {
    assert.equal(strokes(frameWith(type, true, true), SHIELD.color).length, 0, type);
  }
});

test('the run HUD renders without touching anything undefined', () => {
  const input = stubInput(true, true);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startRun(3, emptyUpgrades());
  g.phase = 'play';
  const { ctx, ops } = recorder();
  render(ctx, g);
  assert.ok(ops.some((o) => o.op === 'text'), 'the HUD should have drawn something');
});
