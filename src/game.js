// The simulation.
//
// The ball does not fly around the screen — it runs back and forth along the
// line strung between the two paddles, parameterised by t in [0,1] where t=0 is
// player A's paddle (bottom) and t=1 is player B's (top). Moving a paddle swings
// the whole line, and that is how you aim.

import { CFG, difficulty, derived } from './config.js';
import {
  PALETTE, ENEMIES, OBSTACLES, defOf,
  makeLooseMote, makeEnemy, makeObstacle,
  updateEntity, hitTest, resolveEnemy, reverses, ballColorFor,
} from './entities.js';
import { sfx } from './audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

export class Game {
  constructor(canvas, input, hooks = {}) {
    this.canvas = canvas;
    this.input = input;
    this.hooks = hooks;

    this.W = 400; this.H = 800; this.S = 1;
    this.mode = 'idle';        // 'run' | 'playground' | 'idle'
    this.phase = 'idle';       // 'launch' | 'play' | 'idle'
    this.paused = false;
    this.active = false;

    this.entities = [];
    this.particles = [];
    this.floaters = [];
    this.ball = { t: 0, dir: 1, state: 'normal', trail: [], x: 0, y: 0 };
    this.lastPaddle = 'a';     // which end the ball last came off — 'a' or 'b'
    this.shake = 0;
    this.flash = 0;
    this.flashColor = PALETTE.hazard;
    this.banner = null;
  }

  resize(w, h, s) { this.W = w; this.H = h; this.S = s; }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  startRun(run, upgrades) {
    const d = derived(upgrades);
    this.mode = 'run';
    this.run = run;
    this.diff = difficulty(run);
    this.strength = d.strength;
    this.boostStrength = d.boostStrength;
    this.healthMax = d.health;
    this.livesMax = d.lives;
    this.lives = d.lives;
    this.timeLeft = d.time;
    this.timeMax = d.time;
    this.target = CFG.run.target(run);
    this.input.boostDur = CFG.boost.dur;
    this._begin();
  }

  // One page per piece: only that piece spawns, so a mechanic can be met on its
  // own. Gold turns up on the enemy pages the same way it does anywhere else —
  // by falling out of something you killed.
  startPlayground(type) {
    const def = defOf(type);
    this.mode = 'playground';
    this.run = 1;
    this.pgType = type;
    const d = difficulty(1);
    this.diff = d;

    d.enemyPool = def.cls === 'enemy' ? [type] : [];
    d.obstaclePool = def.cls === 'obs' ? [type] : [];
    d.maxEnemies = def.cls === 'enemy' ? 2 : 0;
    d.maxObstacles = def.cls === 'obs' ? 3 : 0;
    d.enemyGap = 2.2;
    d.obstacleGap = 2.4;
    d.enemyTtl = 26;
    d.obstacleTtl = 22;

    // A sandbox has to be able to beat the thing it is teaching. At base stats
    // a JANUS is deliberately out of reach — that is what BOOST STRENGTH is
    // for — so the playground hands you enough to match the strongest piece in
    // the game and lets you get on with learning the shape of it.
    this.strength = CFG.base.strength;
    this.boostStrength = Math.max(...Object.values(ENEMIES).map((e) => e.strength));
    this.healthMax = Infinity;
    this.livesMax = Infinity;
    this.lives = Infinity;
    this.timeLeft = Infinity;
    this.target = Infinity;
    this.input.boostDur = CFG.boost.dur;
    this._begin();
  }

  _begin() {
    this.score = 0;      // points, from kills only
    this.gold = 0;       // the wallet, from motes only
    this.mult = 1;
    this.health = this.healthMax;
    this.entities = [];
    this.particles = [];
    this.floaters = [];
    this.obstacleTimer = this.mode === 'playground' ? 0.6 : 2.2;
    this.enemyTimer = this.mode === 'playground' ? 0.5 : 1.4;
    this.shake = 0;
    this.flash = 0;
    this.banner = null;
    this.active = true;
    this.paused = false;
    this.input.reset();
    this.input.enabled = true;
    this._armLaunch(0, 0);
  }

  stop() {
    this.active = false;
    this.phase = 'idle';
    this.mode = 'idle';
    this.input.enabled = false;
  }

  // Park the ball on a paddle and wait for both players to hold.
  _armLaunch(t, delay) {
    this.phase = 'launch';
    this.ball.t = t;
    this.ball.dir = t >= 0.5 ? -1 : 1;   // it always sets off away from its paddle
    // It has not bounced off anything yet, but it is sitting on a paddle and is
    // about to leave it — same thing, so that end is already hot.
    this.lastPaddle = t >= 0.5 ? 'b' : 'a';
    this.ball.state = 'normal';
    this.ball.trail.length = 0;
    this.holdT = 0;
    this.launchDelay = delay;
  }

  // ── geometry ──────────────────────────────────────────────────────────────

  get paddleW() { return CFG.paddle.w * this.S; }
  get paddleH() { return CFG.paddle.h * this.S; }
  get ballR() { return CFG.ball.r * this.S; }
  get margin() { return CFG.paddle.margin * this.S; }

  paddleAPos() { return { x: this.input.a.nx * this.W, y: this.H - this.margin }; }
  paddleBPos() { return { x: this.input.b.nx * this.W, y: this.margin }; }

  ballPos(A, B) {
    const t = this.ball.t;
    return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
  }

  // The playable envelope. A paddle centre can only reach [hw, W-hw], so every
  // point on the line does too — anything spawned outside that band would be
  // impossible to touch.
  fieldBounds() {
    const hw = this.paddleW / 2;
    const pad = 34 * this.S;
    return {
      x0: hw, x1: this.W - hw,
      y0: this.margin + pad,
      y1: this.H - this.margin - pad,
    };
  }

  // ── main update ───────────────────────────────────────────────────────────

  update(dt) {
    if (!this.active || this.paused) return;
    dt = Math.min(dt, 1 / 30);

    this.input.update(dt);
    this.input.setBounds(this.paddleW / 2, this.W);

    if (this.input.a.justBoosted || this.input.b.justBoosted) sfx.boost();

    // Keep the ball's screen position current even while parked, so spawn
    // spacing has something honest to measure against.
    const bp = this.ballPos(this.paddleAPos(), this.paddleBPos());
    this.ball.x = bp.x; this.ball.y = bp.y;

    const bounds = this.fieldBounds();
    for (const e of this.entities) updateEntity(e, dt, bounds);

    if (this.phase === 'launch') this._updateLaunch(dt);
    else if (this.phase === 'play') this._updatePlay(dt);

    this._sweep();
    this._updateFx(dt);
    this.input.clearEdges();
  }

  _updateLaunch(dt) {
    if (this.launchDelay > 0) { this.launchDelay -= dt; return; }

    const both = this.input.a.touching && this.input.b.touching;
    if (both) {
      const before = this.holdT;
      this.holdT = Math.min(CFG.launch.hold, this.holdT + dt);
      if (Math.floor(this.holdT * 12) !== Math.floor(before * 12)) sfx.charge();
      if (this.holdT >= CFG.launch.hold) {
        this.phase = 'play';
        this.banner = null;
        sfx.launch();
      }
    } else {
      this.holdT = Math.max(0, this.holdT - dt * CFG.launch.drain);
    }
  }

  _updatePlay(dt) {
    if (this.mode === 'run') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        return this._finish(false, 'OUT OF TIME');
      }
    }

    this._stepBall(dt);
    if (this.phase !== 'play') return;   // a life was lost mid-step

    this._director(dt);

    if (this.mode === 'run' && this.score >= this.target) {
      this._finish(true, 'TARGET MET');
    }
  }

  // What state is the ball in? One question: is something shoving it the way it
  // is already going? A lift shoves the ball away from the lifter and does
  // nothing at all to a ball coming the other way, and two lifts cancel.
  //
  // Nothing else is consulted. Whose fingers are where does not come into it —
  // when it is your turn to shove, your lift shoves, full stop.
  _ballState() {
    const nd = this.input.boostDir;
    if (nd !== 0) return Math.sign(this.ball.dir) === nd ? 'boost' : 'normal';
    return 'normal';
  }

  _speedMult(state) {
    return state === 'boost' ? CFG.boost.mult : 1;
  }

  _stepBall(dt) {
    const A = this.paddleAPos(), B = this.paddleBPos();
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const basePx = CFG.ball.tps * (this.H - 2 * this.margin) * this.diff.ballSpeed;

    const worst = basePx * (this.input.boostDir !== 0 ? CFG.boost.mult : 1);
    const steps = clamp(Math.ceil((worst * dt) / (this.ballR * 0.6)), 1, 40);
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.ball.state = this._ballState();
      const m = this._speedMult(this.ball.state);
      this.ball.t += this.ball.dir * ((basePx * m * sdt) / len);

      if (this.ball.t <= 0) {
        this.ball.t = -this.ball.t;
        this.ball.dir = 1;
        this._paddleHit(A, 'a');
      } else if (this.ball.t >= 1) {
        this.ball.t = 2 - this.ball.t;
        this.ball.dir = -1;
        this._paddleHit(B, 'b');
      }

      const p = this.ballPos(A, B);
      this.ball.x = p.x; this.ball.y = p.y;
      if (this._collide(p.x, p.y)) return;
    }

    // The trail remembers the state, so a shove leaves a thick orange streak
    // hanging behind it and an ordinary pass leaves a thin ink one.
    this.ball.trail.push({
      x: this.ball.x, y: this.ball.y,
      c: ballColorFor(this.ball.state),
      boost: this.ball.state === 'boost',
    });
    if (this.ball.trail.length > CFG.ball.trail) this.ball.trail.shift();
  }

  // The paddle the ball just came off is the "hot" end, and it stays hot until
  // the ball reaches the other one — only ever one at a time. It is exactly the
  // paddle whose player can boost right now, because the ball is running away
  // from them, which is why it wears the boost colour.
  _paddleHit(P, side) {
    this.lastPaddle = side;
    sfx.paddle();
    this.shake = Math.max(this.shake, 1.4 * this.S);
    const up = P.y > this.H / 2 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      this._spark(P.x + rand(-14, 14) * this.S, P.y, rand(-40, 40) * this.S, up * rand(30, 110) * this.S, '#e9ecef', 0.25);
    }
  }

  // ── collision ─────────────────────────────────────────────────────────────

  // What the ball brings to a contact. Its strength is its own, plus whatever a
  // shove is adding at this instant — which is why the number on the ball goes
  // up the moment it turns orange.
  _ballWorld(x, y) {
    const boosted = this.ball.state === 'boost';
    return {
      x, y,
      dir: this.ball.dir,
      boosted,
      strength: this.strength + (boosted ? this.boostStrength : 0),
    };
  }

  // Returns true if the ball has been re-armed and the step must stop.
  _collide(x, y) {
    const br = this.ballR;
    const world = this._ballWorld(x, y);

    for (const e of this.entities) {
      if (e.dead || e.cool > 0 || e.spawnT > 0) continue;
      if (!hitTest(e, x, y, br)) continue;

      const r = this._resolve(e, world);

      // Anything that turns the ball round does it here, in one place, so a
      // block and a beating bounce identically.
      if (reverses(r)) {
        this.ball.dir = -this.ball.dir;
        e.cool = CFG.hitCool;
        if (r === 'hurt' && this._hurt(e)) return true;
        return false;      // one bounce per contact; stop looking
      }
      if (r !== 'pass') e.cool = CFG.hitCool;
    }
    return false;
  }

  _resolve(e, world) {
    if (e.cls === 'obs') return 'hurt';           // no strength, no way through

    if (e.cls === 'enemy') {
      const r = resolveEnemy(e, world);
      if (r === 'kill') this._kill(e);
      else if (r === 'block') this._clang(e, world);
      return r;
    }

    this._bank(e);
    return 'take';
  }

  // ── gold ──────────────────────────────────────────────────────────────────

  _bank(e) {
    e.dead = true;
    this.gold += e.gold;
    this._float(e.x, e.y, `+${e.gold}`, e.color);
    this._burst(e.x, e.y, e.color, 12, 140);
    sfx.collect(1);
    this.shake = Math.max(this.shake, 1.6 * this.S);
  }

  // ── enemies ───────────────────────────────────────────────────────────────

  _kill(e) {
    e.dead = true;
    const gain = Math.round(e.value * this.mult);
    this.score += gain;
    this._float(e.x, e.y, `+${gain}`, e.color);
    this._burst(e.x, e.y, e.color, 26, 220);
    this._drop(e);
    sfx.destroy();
    this.mult = Math.min(CFG.multCap, this.mult + 1);
    this.shake = Math.max(this.shake, 5 * this.S);
    this.flash = 0.3;
    this.flashColor = e.color;
  }

  // The gold an enemy was carrying, thrown out where it stood. Points are
  // already banked by this stage; the gold still has to be swept up before it
  // fades, so a kill is only half paid until somebody goes back for it.
  _drop(e) {
    const n = e.drop || 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(0, 1);
      const d = e.r * 0.45;
      this.entities.push(makeLooseMote(
        e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, this.S, this.diff));
    }
  }

  // Turned away by the plating, or by arriving at the weak point the wrong way.
  // Nobody is any worse off; it just costs you the pass.
  _clang(e, world) {
    e.flare = 0.6;
    this._burst(e.x, e.y, PALETTE.plate, 6, 110);
    sfx.paddle();
    this.shake = Math.max(this.shake, 2 * this.S);
  }

  // ── damage ────────────────────────────────────────────────────────────────

  // Returns true if that was the last of the ball's health.
  _hurt(e) {
    this.mult = 1;
    this._burst(this.ball.x, this.ball.y, PALETTE.hazard, 16, 200);
    this.shake = Math.max(this.shake, 7 * this.S);
    this.flash = 0.45;
    this.flashColor = PALETTE.hazard;
    sfx.crack();

    if (this.health === Infinity) return false;
    this.health -= 1;
    this._float(this.ball.x, this.ball.y, '-1', PALETTE.hazard);
    if (this.health > 0) return false;

    this._loseLife(e);
    return true;
  }

  // Health is gone, so the ball itself is gone. That costs a life and puts
  // everything back on a paddle for another hold.
  _loseLife(e) {
    sfx.die();
    this._burst(this.ball.x, this.ball.y, PALETTE.hazard, 30, 260);
    this.shake = 12 * this.S;
    this.flash = 0.7;
    this.flashColor = PALETTE.hazard;
    this.mult = 1;
    this.health = this.healthMax;

    if (this.mode === 'run') {
      this.lives -= 1;
      if (this.lives <= 0) { this._finish(false, 'NO LIVES LEFT'); return; }
    }

    // The ball comes back on the paddle it was heading for.
    const t = this.ball.dir > 0 ? 1 : 0;
    const A = this.paddleAPos(), B = this.paddleBPos();
    const home = t === 1 ? B : A;

    // Anything camped on the respawn gets swept away so it isn't a free death.
    const rr = CFG.safeClear * this.S;
    for (const o of this.entities) {
      if (o.cls !== 'gold' && Math.hypot(o.x - home.x, o.y - home.y) < rr) {
        o.dead = true;
        this._burst(o.x, o.y, o.color, 6, 90);
      }
    }

    this.banner = 'LIFE LOST';
    this._armLaunch(t, CFG.launch.delay);
  }

  // ── spawning ──────────────────────────────────────────────────────────────

  _director(dt) {
    const live = this.entities.filter((e) => !e.dead);
    const d = this.diff;

    // Nothing spawns gold. It reaches the field one way only — out of an enemy
    // that just died — so the director has two families to think about, not
    // three.
    this._feed(dt, 'enemyTimer',
      d.enemyPool.length > 0 && live.filter((e) => e.cls === 'enemy').length < d.maxEnemies,
      d.enemyGap, () => this._spawnFrom(d.enemyPool, makeEnemy, ENEMIES, 100));

    this._feed(dt, 'obstacleTimer',
      d.obstaclePool.length > 0 && live.filter((e) => e.cls === 'obs').length < d.maxObstacles,
      d.obstacleGap, () => this._spawnFrom(d.obstaclePool, makeObstacle, OBSTACLES, 90));
  }

  // One spawn clock, three families. When the field is full the timer just
  // holds, so nothing queues up and dumps all at once when a slot frees.
  _feed(dt, key, room, gap, spawn) {
    if (!room) { this[key] = Math.min(this[key], gap * 0.5); return; }
    this[key] -= dt;
    if (this[key] > 0) return;
    spawn();
    this[key] = gap * rand(0.8, 1.25);
  }

  _spawnFrom(pool, make, defs, clear) {
    if (!pool.length) return;
    const type = pool[Math.floor(Math.random() * pool.length)];
    const def = defs[type];
    const guess = (def.r || def.armLen || 30) * this.S;
    const spot = this._freeSpot(guess, clear);
    if (!spot) return;
    this.entities.push(make(type, spot.x, spot.y, this.S, this.diff));
  }

  // Find somewhere that isn't on top of the ball, a paddle or another entity.
  _freeSpot(r, ballClear) {
    const b = this.fieldBounds();
    const clear = ballClear * this.S;
    for (let i = 0; i < 30; i++) {
      const x = rand(b.x0 + r, b.x1 - r);
      const y = rand(b.y0 + r, b.y1 - r);
      if (Math.hypot(x - this.ball.x, y - this.ball.y) < clear) continue;
      let ok = true;
      for (const e of this.entities) {
        if (e.dead) continue;
        if (Math.hypot(x - e.x, y - e.y) < r + e.r + 16 * this.S) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return null;
  }

  _sweep() {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (this.entities[i].dead) this.entities.splice(i, 1);
    }
  }

  // ── run resolution ────────────────────────────────────────────────────────

  _finish(cleared, reason) {
    this.phase = 'idle';
    this.active = false;
    this.input.enabled = false;
    // The bonus lands in the wallet, not on the scoreboard. Points have already
    // done their one job by this point.
    const dug = this.gold;
    const bonus = cleared ? Math.round(this.timeLeft * CFG.run.timeBonusGold) : 0;
    if (cleared) { this.gold += bonus; sfx.clear(); } else sfx.over();
    this.hooks.onFinish?.({
      cleared, reason, run: this.run,
      score: this.score, target: this.target,
      gold: this.gold, dug, bonus,
      timeLeft: this.timeLeft,
      livesLeft: this.lives,
    });
  }

  // ── effects ───────────────────────────────────────────────────────────────

  _spark(x, y, vx, vy, color, life) {
    if (this.particles.length > CFG.maxParticles) return;
    this.particles.push({ x, y, vx, vy, color, life, max: life, size: rand(1, 2.4) * this.S });
  }

  _burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * this.S * rand(0.25, 1);
      this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.25, 0.6));
    }
  }

  _float(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 0.95, max: 0.95 });
  }

  _updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.12, dt); p.vy *= Math.pow(0.12, dt);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
      f.y -= 26 * this.S * dt;
    }
    for (const e of this.entities) if (e.flare) e.flare = Math.max(0, e.flare - dt * 3.5);
    this.shake *= Math.pow(0.02, dt);
    this.flash = Math.max(0, this.flash - dt * 2.4);
  }
}
