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
import { render, railHeat, RAIL_DOT } from '../src/render.js';

// Records every stroke and fill with the state that was live at the time.
function recorder() {
  const ops = [];
  let st = { strokeStyle: '#000', fillStyle: '#000', globalAlpha: 1, lineWidth: 1, lineCap: 'butt', dash: [] };
  const stack = [];
  // Geometry too, so a short rail dot can be told apart from a ring around the
  // ball. An arc records three numbers, a line-to two.
  let pts = [];
  const snap = (op) => ops.push({ op, ...st, dash: [...st.dash], pts: pts.map((p) => [...p]) });
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
    beginPath() { pts = []; },
    moveTo(x, y) { pts.push([x, y]); },
    lineTo(x, y) { pts.push([x, y]); },
    rect(x, y) { pts.push([x, y]); },
    roundRect(x, y) { pts.push([x, y]); },
    arc(x, y, r) { pts.push([x, y, r]); },
    fillRect(x, y, w, h) { pts = [[x, y, w, h]]; snap('fill'); },
    fill() { snap('fill'); },
    stroke() { snap('stroke'); },
    fillText() { snap('text'); },
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
function bare(aTouch, bTouch, ballState = 'normal', hot = 'a') {
  const input = stubInput(aTouch, bTouch);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startPlayground('mote');
  g.phase = 'play';
  g.ball.state = ballState;
  g.lastPaddle = hot;
  g.entities.length = 0;
  const { ctx, ops } = recorder();
  render(ctx, g);
  return ops;
}

const arcs = (ops) => ops.filter((o) => o.pts.length === 1 && o.pts[0].length === 3);

// A rail dot: a two-point stroke exactly RAIL_DOT long. At S = 1 nothing else
// on the field is that short.
const spanOf = (o) => Math.hypot(o.pts[1][0] - o.pts[0][0], o.pts[1][1] - o.pts[0][1]);
const isRailDot = (o) =>
  o.op === 'stroke' && o.pts.length === 2 && Math.abs(spanOf(o) - RAIL_DOT) < 1e-6;
const railDots = (ops) => ops.filter(isRailDot);

// The rail and the paddles are furniture and wear orange for their own reasons,
// so every question about a *piece* has to look past them. A piece's body and
// rings are arcs; a paddle is a round-rect; a rail dot is a short line.
const onField = (ops) => ops.filter((o) => !isRailDot(o) && !isPaddleBody(o));
const isPaddleBody = (o) => o.op === 'fill' && o.pts.length === 1 && o.pts[0].length === 2;
const fills = (ops, color) => onField(ops).filter((o) => o.op === 'fill' && o.fillStyle === color);
const strokes = (ops, color) => onField(ops).filter((o) => o.op === 'stroke' && o.strokeStyle === color);
// The ball and its trail are the only round fills on an empty field.
const round = (ops, color) => arcs(ops).filter((o) => o.op === 'fill' && o.fillStyle === color);

// Each dot as a comparable shape, and how far it sits from paddle A.
const dotShape = (o) => `${o.strokeStyle}@${o.globalAlpha.toFixed(4)}`;
const dotY = (o) => o.pts[0][1];

const DIVIDER = '#1b1e23';
const TOUCHES = [[true, true], [true, false], [false, true], [false, false]];

// ── the rail ────────────────────────────────────────────────────────────────

test('the rail is a run of dots, and holding the glass changes none of them', () => {
  // Who is touching has never been the rail's business, and still is not.
  let seen = null;
  for (const [a, b] of TOUCHES) {
    const dots = railDots(bare(a, b));
    assert.ok(dots.length > 10, `touches ${a}/${b}: got ${dots.length} dots`);
    const shape = dots.map(dotShape);
    if (seen) assert.deepEqual(shape, seen, `touches ${a}/${b} drew a different rail`);
    seen = shape;
  }
});

test('the rail runs hot at the end the ball last came off, and cools away from it', () => {
  // Paddle A is at the bottom, so its dots have the larger y.
  const byA = railDots(bare(true, true, 'normal', 'a')).sort((p, q) => dotY(q) - dotY(p));
  const byB = railDots(bare(true, true, 'normal', 'b')).sort((p, q) => dotY(p) - dotY(q));

  for (const [name, dots] of [['a', byA], ['b', byB]]) {
    // Sorted nearest-to-hot-paddle first: orange at the head, ink at the tail.
    assert.equal(dots[0].strokeStyle, PALETTE.boost, `${name}: the nearest dot is fully orange`);
    assert.equal(dots[dots.length - 1].strokeStyle, PALETTE.ink, `${name}: the far end is ink`);
    assert.ok(dots[0].globalAlpha > dots[dots.length - 1].globalAlpha, `${name}: and brighter`);

    // Never brightens again on the way out.
    for (let i = 1; i < dots.length; i++) {
      assert.ok(dots[i].globalAlpha <= dots[i - 1].globalAlpha + 1e-9,
        `${name}: dot ${i} got brighter again`);
    }
    // The heat is a local thing, not a wash over the whole rail.
    const warm = dots.filter((o) => o.strokeStyle !== PALETTE.ink);
    assert.ok(warm.length < dots.length / 2, `${name}: ${warm.length}/${dots.length} dots warm`);
  }

  // The two are mirror images, so neither end is special.
  assert.deepEqual(byA.map(dotShape), byB.map(dotShape), 'a and b should mirror exactly');
});

test('only one end of the rail is ever hot', () => {
  for (const hot of ['a', 'b']) {
    const dots = railDots(bare(true, true, 'normal', hot)).sort((p, q) => dotY(p) - dotY(q));
    const warm = dots.map((o, i) => (o.strokeStyle === PALETTE.ink ? -1 : i)).filter((i) => i >= 0);
    // Every warm dot in one unbroken run, and that run touches one end.
    assert.ok(warm.length >= 2, `${hot}: something should be warm`);
    assert.equal(warm[warm.length - 1] - warm[0], warm.length - 1, `${hot}: one unbroken run`);
    assert.ok(warm[0] === 0 || warm[warm.length - 1] === dots.length - 1,
      `${hot}: the run should start at an end`);
  }
});

test('the heat falls off, reaches zero and stays there', () => {
  assert.equal(railHeat(0), 1, 'full at the paddle');
  assert.ok(railHeat(0.1) < 1 && railHeat(0.1) > 0);
  assert.ok(railHeat(0.2) < railHeat(0.1), 'monotonic');
  assert.equal(railHeat(0.5), 0, 'gone well before the middle');
  assert.equal(railHeat(1), 0);
});

// ── the paddles ─────────────────────────────────────────────────────────────

test('the hot paddle wears the boost colour, and exactly one does', () => {
  for (const hot of ['a', 'b']) {
    const ops = bare(true, true, 'normal', hot);
    // Paddles are the only round-rects on an empty field.
    const bodies = ops.filter((o) => o.op === 'fill' && o.pts.length === 1 && o.pts[0].length === 2);
    assert.equal(bodies.length, 2, `${hot}: two paddles`);
    assert.equal(bodies.filter((o) => o.fillStyle === PALETTE.boost).length, 1, `${hot}: one is orange`);
    assert.equal(bodies.filter((o) => o.fillStyle === PALETTE.ink).length, 1, `${hot}: the other is ink`);
  }
});

test('the hot end is the paddle end, so the rail and the paddle agree', () => {
  for (const hot of ['a', 'b']) {
    const ops = bare(true, true, 'normal', hot);
    const paddle = ops.find((o) => o.op === 'fill' && o.fillStyle === PALETTE.boost && o.pts[0].length === 2);
    const hottest = railDots(ops).sort((p, q) => q.globalAlpha - p.globalAlpha)[0];
    const far = railDots(ops).sort((p, q) => p.globalAlpha - q.globalAlpha)[0];
    assert.ok(Math.abs(hottest.pts[0][1] - paddle.pts[0][1]) < Math.abs(far.pts[0][1] - paddle.pts[0][1]),
      `${hot}: the brightest dot should be the one nearest the orange paddle`);
  }
});

test('nothing is outlined on an empty field, whatever the ball is doing', () => {
  // The rail is strokes now, so the check is about *arcs*: a halo round the
  // ball would be one, and there must not be any.
  for (const [a, b] of TOUCHES) {
    for (const state of ['normal', 'boost', 'ghost']) {
      const outlines = arcs(bare(a, b, state)).filter((o) => o.op === 'stroke');
      assert.deepEqual(outlines.map((o) => o.strokeStyle), [],
        `touches ${a}/${b}, ball ${state}: no halo, no outline`);
    }
  }
});

// ── the ball ────────────────────────────────────────────────────────────────

test('the ball is filled with the state it is in', () => {
  assert.ok(round(bare(true, true, 'boost'), PALETTE.boost).length >= 1, 'boosting: orange');
  assert.ok(round(bare(false, false, 'ghost'), PALETTE.drift).length >= 1, 'drifting: violet');

  const plain = bare(true, true, 'normal');
  assert.equal(round(plain, PALETTE.boost).length, 0, 'a plain ball is never orange');
  assert.equal(round(plain, PALETTE.drift).length, 0, 'nor violet');
  assert.ok(round(plain, PALETTE.ink).length >= 1, 'it is ink');
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

  const hot = round(ops, PALETTE.boost);
  assert.ok(hot.length >= 6, `expected the orange streak, got ${hot.length}`);
  // And it has to be louder than the ordinary trail, or it is not a streak.
  const cool = round(ops, PALETTE.ink).filter((o) => o.globalAlpha < 1);
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
