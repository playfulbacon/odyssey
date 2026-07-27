// Drawing tests, through a recording stand-in for a canvas context.
//
// These exist for one claim in particular: that the ball is drawn as the shield
// it can strip, and that the line stays out of it. That is the sort of
// agreement that rots silently, so it is checked against what render() actually
// emits rather than against the helpers in isolation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { difficulty, emptyUpgrades } from '../src/config.js';
import { GATES, PALETTE, makeObstacle } from '../src/entities.js';
import { Game } from '../src/game.js';
import { render } from '../src/render.js';

const GOLD = GATES.handsOff.color;

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

// A live playground with one obstacle sitting in the middle of the field.
function frameWith(type, aTouch, bTouch, ballState = 'normal') {
  const input = stubInput(aTouch, bTouch);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startPlayground(type);
  g.phase = 'play';
  g.ball.state = ballState;
  g.entities.length = 0;
  const e = makeObstacle(type, 200, 400, 1, difficulty(1));
  e.spawnT = 0;
  g.entities.push(e);

  const { ctx, ops } = recorder();
  render(ctx, g);
  return ops;
}

const frame = (a, b, ballState) => frameWith('phantom', a, b, ballState);
const fills = (ops, color) => ops.filter((o) => o.op === 'fill' && o.fillStyle === color);

// An empty field, so the only things drawn are the furniture: the divider, the
// two line halves, the paddles and the ball. Nothing else can be mistaken for
// the line.
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

const DIVIDER = '#1b1e23';

// Gold dotted strokes: the released line halves and the phantom's ghost shield.
// The X inside the phantom is gold too but deliberately stays solid — dotting
// away the family glyph would cost more legibility than the consistency is
// worth — so the invariant is about the dotted set, not every gold pixel.
const goldDotted = (ops) =>
  ops.filter((o) => o.op === 'stroke' && o.strokeStyle === GOLD && o.dash.length > 0);

test("the phantom's shield is gold and dotted whoever is holding", () => {
  // The shield is the piece's identity, so it never loses its colour — you can
  // always pick a phantom out of the field.
  for (const [a, b] of [[true, true], [true, false], [false, true], [false, false]]) {
    assert.ok(goldDotted(frame(a, b)).length >= 1, `touches ${a}/${b}`);
  }
});

test('the line never changes colour, whoever is holding', () => {
  // On an empty field with a plain ball there is no halo and nothing else to
  // draw, so every stroke on screen belongs to the line or the divider. If any
  // input combination tinted the line, a stranger colour would show up here.
  for (const [a, b] of [[true, true], [true, false], [false, true], [false, false]]) {
    const strokes = bare(a, b).filter((o) => o.op === 'stroke');
    const colors = new Set(strokes.map((o) => o.strokeStyle));
    colors.delete(DIVIDER);
    assert.deepEqual([...colors], [PALETTE.ink], `touches ${a}/${b}`);
  }
});

test('a released half is dotted ink — the report, not the key', () => {
  const one = bare(true, false).filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ink);
  assert.ok(one.some((o) => o.dash.length === 0), 'the held half is solid');
  assert.ok(one.some((o) => o.dash.length > 0), 'the released half is dotted');

  const none = bare(false, false).filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ink);
  assert.ok(none.every((o) => o.dash.length > 0), 'neither held: both halves dotted, still ink');
});

test('a ghosted ball and a ghost shield are drawn the same way', () => {
  // The ball's halo and every layer of the shield: same colour, same dash,
  // same weight, same cap. This is the claim the whole idea rests on — the
  // ball is not *like* the shield it strips, it is drawn as it.
  const ops = goldDotted(frame(false, false, 'ghost'));
  assert.ok(ops.length >= 3, `expected the shield layers and the ball halo, got ${ops.length}`);

  const shapes = new Set(ops.map((o) => `${o.dash.join(',')}|${o.lineWidth}|${o.lineCap}`));
  assert.equal(shapes.size, 1, `they should be one treatment, found ${[...shapes].join('  /  ')}`);
});

test('the ball is filled with the shield it can strip', () => {
  // Empty field again, so the ball is the only thing that could be wearing a
  // shield colour.
  assert.ok(fills(bare(false, false, 'ghost'), GOLD).length >= 1, 'ghosting: gold');
  assert.ok(fills(bare(true, true, 'boost'), PALETTE.ring).length >= 1, 'boosting: violet');

  const plain = bare(true, true, 'normal');
  assert.equal(fills(plain, GOLD).length, 0, 'a plain ball is never gold');
  assert.equal(fills(plain, PALETTE.ring).length, 0, 'nor violet');
  assert.ok(fills(plain, PALETTE.ink).length >= 1, 'it is ink');
});

test('a phantom wears no violet at all — its shield is the only ring it has', () => {
  for (const [a, b] of [[true, true], [false, false]]) {
    const violet = frame(a, b).filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ring);
    assert.equal(violet.length, 0, 'the ghost shield replaced the armour, it did not join it');
  }
});

test('a boost shield stays violet and solid, so the two never blur together', () => {
  const ops = frameWith('brittle', false, false)
    .filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ring);
  assert.ok(ops.length >= 3, 'three layers of boost shield');
  for (const o of ops) assert.equal(o.dash.length, 0, 'a boost shield is never dotted');
});

test('the shield brightens the moment it can actually be stripped', () => {
  const shut = goldDotted(frame(true, false));         // someone still holding
  const open = goldDotted(frame(false, false, 'ghost'));

  const alpha = (ops) => Math.max(...ops.map((o) => o.globalAlpha));
  assert.ok(alpha(open) > alpha(shut), 'hands off should be the brighter state');
  assert.equal(new Set(shut.map((o) => o.globalAlpha.toFixed(3))).size, 1);
});

test('both halves held means two solid ink strokes and no dots on the line', () => {
  const ops = frame(true, true).filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ink);
  assert.ok(ops.length >= 2, 'both halves held');
  for (const o of ops) assert.equal(o.dash.length, 0, 'a held half must be solid');
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
