// Two-player input.
//
// The phone lies flat between the players. Whichever half of the screen a
// finger lands on decides which paddle it drives:
//   player A — bottom half, bottom paddle
//   player B — top half, top paddle
//
// Dragging is *relative*: a paddle never teleports to a new touch. That matters
// because the whole boost mechanic is built on lifting and replacing fingers.
//
// Keyboard and mouse fall back to the same model so the prototype is testable
// on a desktop. On a keyboard, *moving is holding*: a direction key counts as a
// finger on the glass and letting go of it lifts, so the line ghosts as soon as
// neither paddle is being driven. That is a testing affordance, not the real
// control scheme — but it means one person can drive both sides with two hands
// and never has to hold a modifier down.

import { CFG } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makePlayer(nx) {
  return {
    nx,             // paddle centre, normalised 0..1 across the screen width
    touching: false,
    boostT: 0,      // seconds of shove left after a lift
    pointerId: null,
    anchorNx: nx,
    anchorX: 0,
    keyLeft: false,
    keyRight: false,
    keyHold: false,
    justReleased: false,
    justPressed: false,
  };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.a = makePlayer(0.5);
    this.b = makePlayer(0.5);
    this.halfN = 0.5 * CFG.paddle.w / CFG.refWidth; // replaced every frame
    this.enabled = false;
    this.boostDur = CFG.boost.dur;
    this.onFirstTouch = null;

    this._bind();
  }

  setBounds(halfWidthPx, screenW) {
    this.halfN = halfWidthPx / screenW;
  }

  reset() {
    for (const p of [this.a, this.b]) {
      p.nx = 0.5; p.anchorNx = 0.5;
      p.touching = false; p.boostT = 0; p.pointerId = null;
      p.keyLeft = p.keyRight = p.keyHold = false;
      p.justReleased = p.justPressed = false;
    }
  }

  // Drop every finger without moving the paddles. Used around pause, where
  // re-centring the paddles would be a nasty surprise on resume.
  clearTouches() {
    for (const p of [this.a, this.b]) {
      p.touching = false;
      p.boostT = 0;
      p.pointerId = null;
      p.keyLeft = p.keyRight = p.keyHold = false;
      p.justReleased = p.justPressed = false;
    }
  }

  // Both fingers off the glass — the PHANTOM condition.
  get handsOff() { return !this.a.touching && !this.b.touching; }

  // +1 shoves the ball toward B (up), -1 toward A (down), 0 cancels.
  get boostDir() {
    return (this.a.boostT > 0 ? 1 : 0) + (this.b.boostT > 0 ? -1 : 0);
  }

  press(p) {
    if (p.touching) return;
    p.touching = true;
    p.justPressed = true;
    if (this.onFirstTouch) this.onFirstTouch();
  }

  release(p) {
    if (!p.touching) return;
    p.touching = false;
    p.boostT = this.boostDur;
    p.justReleased = true;
    p.pointerId = null;
  }

  _playerFor(id) {
    if (this.a.pointerId === id) return this.a;
    if (this.b.pointerId === id) return this.b;
    return null;
  }

  _bind() {
    const c = this.canvas;
    const local = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };

    c.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const q = local(e);
      const p = q.y < q.h / 2 ? this.b : this.a;
      if (p.pointerId !== null) return;   // that side already has a finger down
      p.pointerId = e.pointerId;
      p.anchorNx = p.nx;
      p.anchorX = q.x / q.w;
      this.press(p);
      try { c.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    }, { passive: false });

    c.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const p = this._playerFor(e.pointerId);
      if (!p) return;
      e.preventDefault();
      const q = local(e);
      this._drag(p, q.x / q.w);
    }, { passive: false });

    const up = (e) => {
      const p = this._playerFor(e.pointerId);
      if (!p) return;
      this.release(p);
      try { c.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    const keyMap = {
      KeyA: [this.a, 'keyLeft'], KeyD: [this.a, 'keyRight'], KeyS: [this.a, 'keyHold'],
      KeyJ: [this.b, 'keyLeft'], KeyL: [this.b, 'keyRight'], KeyK: [this.b, 'keyHold'],
    };

    // Key state only; whether that counts as a touch is settled in update(),
    // so a direction key and the hold key go through the same one door.
    window.addEventListener('keydown', (e) => {
      const m = keyMap[e.code];
      if (!m || !this.enabled) return;
      e.preventDefault();
      if (e.repeat) return;
      m[0][m[1]] = true;
    });

    window.addEventListener('keyup', (e) => {
      const m = keyMap[e.code];
      if (!m) return;
      m[0][m[1]] = false;
    });

    window.addEventListener('blur', () => {
      for (const p of [this.a, this.b]) {
        p.keyLeft = p.keyRight = p.keyHold = false;
        this.release(p);
      }
    });
  }

  _drag(p, nx) {
    const lo = this.halfN, hi = 1 - this.halfN;
    const want = p.anchorNx + (nx - p.anchorX);
    const got = clamp(want, lo, hi);
    // Re-anchor at the rails so pushing past the edge doesn't build up slack.
    if (got !== want) { p.anchorNx = got; p.anchorX = nx; }
    p.nx = got;
  }

  update(dt) {
    const lo = this.halfN, hi = 1 - this.halfN;
    for (const p of [this.a, this.b]) {
      if (p.boostT > 0) p.boostT = Math.max(0, p.boostT - dt);

      if (p.pointerId === null) {
        const dir = (p.keyRight ? 1 : 0) - (p.keyLeft ? 1 : 0);
        // Driving the paddle is what puts the finger down. The hold key is
        // there for the one thing moving cannot express: staying put without
        // lifting, which is what the boost rhythm needs.
        const down = dir !== 0 || p.keyHold;
        if (down && !p.touching) this.press(p);
        else if (!down && p.touching) this.release(p);
        if (dir) p.nx = clamp(p.nx + dir * 0.95 * dt, lo, hi);
      }

      p.nx = clamp(p.nx, lo, hi);
    }
  }

  clearEdges() {
    this.a.justReleased = this.a.justPressed = false;
    this.b.justReleased = this.b.justPressed = false;
  }
}
