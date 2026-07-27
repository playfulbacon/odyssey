// The keyboard model, which is deliberately not the touch model.
//
// A finger does two things at once when it comes off the glass: it ends the
// touch and it shoves the ball. On a keyboard those are split across two keys,
// and the split is easy to collapse again by accident — so it is pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Input } from '../src/input.js';

// Input wires itself to the DOM in its constructor. Give it just enough to
// build against, then drive update() directly.
function mkInput() {
  const noop = () => {};
  const canvas = {
    addEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
  };
  const had = 'window' in globalThis;
  const prev = globalThis.window;
  globalThis.window = { addEventListener: noop };
  const input = new Input(canvas);
  if (had) globalThis.window = prev; else delete globalThis.window;
  input.setBounds(44, 400);
  input.enabled = true;
  return input;
}

const step = (input, dt = 1 / 60) => { input.clearEdges(); input.update(dt); };

test('a direction key puts the side down and steers it', () => {
  const i = mkInput();
  const before = i.a.nx;

  i.a.keyRight = true;
  step(i);
  assert.equal(i.a.touching, true, 'moving is holding');
  assert.ok(i.a.nx > before, 'and it actually moves');
});

test('letting go of a direction key ghosts the side but never shoves the ball', () => {
  const i = mkInput();
  i.a.keyRight = true;
  step(i);

  i.a.keyRight = false;
  step(i);
  assert.equal(i.a.touching, false, 'the side lifts, so the line can ghost');
  assert.equal(i.a.boostT, 0, 'but stopping is not a shove');
  assert.equal(i.a.justBoosted, false);
});

test('letting go of the hold key is what shoves', () => {
  const i = mkInput();
  i.a.keyHold = true;
  step(i);
  assert.equal(i.a.touching, true);
  assert.equal(i.a.boostT, 0, 'pressing it does nothing on its own');

  i.a.keyHold = false;
  step(i);
  assert.equal(i.a.touching, false);
  assert.ok(i.a.boostT > 0, 'releasing it shoves');
  assert.equal(i.a.justBoosted, true);
});

test('the hold key shoves even while the paddle is still being steered', () => {
  const i = mkInput();
  i.a.keyRight = true; i.a.keyHold = true;
  step(i);

  i.a.keyHold = false;   // still steering
  step(i);
  assert.ok(i.a.boostT > 0, 'the shove is the hold key, whatever else is going on');
  assert.equal(i.a.touching, true, 'and steering keeps the side down');
});

test('the line ghosts once neither paddle is being driven', () => {
  const i = mkInput();
  i.a.keyRight = true; i.b.keyLeft = true;
  step(i);
  assert.equal(i.handsOff, false, 'both driving');

  i.a.keyRight = false;
  step(i);
  assert.equal(i.handsOff, false, 'one still driving');

  i.b.keyLeft = false;
  step(i);
  assert.equal(i.handsOff, true, 'neither driving');
  assert.equal(i.boostDir, 0, 'and parking both sides launched nothing');
});

test('a real finger still does both at once', () => {
  const i = mkInput();
  i.press(i.a);
  assert.equal(i.a.touching, true);
  i.release(i.a);
  assert.equal(i.a.touching, false);
  assert.ok(i.a.boostT > 0, 'lifting a finger ends the touch and shoves, as it always did');
});

test('a paddle stays inside the rails however long it is driven', () => {
  const i = mkInput();
  i.a.keyRight = true;
  for (let n = 0; n < 600; n++) step(i);
  assert.ok(i.a.nx <= 1 - i.halfN + 1e-9);

  i.a.keyRight = false; i.a.keyLeft = true;
  for (let n = 0; n < 600; n++) step(i);
  assert.ok(i.a.nx >= i.halfN - 1e-9);
});

test('blur drops everything without firing a parting shove', () => {
  const i = mkInput();
  i.a.keyHold = true; i.b.keyRight = true;
  step(i);

  // Same path the blur handler takes.
  for (const p of [i.a, i.b]) {
    p.keyLeft = p.keyRight = p.keyHold = p.heldByKey = false;
    i.release(p, false);
  }
  assert.equal(i.a.touching, false);
  assert.equal(i.b.touching, false);
  assert.equal(i.a.boostT, 0);
  assert.equal(i.b.boostT, 0);
});
