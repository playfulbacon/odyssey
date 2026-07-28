// DOM overlays: title, help, playground menu, run brief, shop, results, pause.
// The UI never touches the simulation directly — it calls back into App.

import { CFG, UPGRADES, upgradeCost, derived, difficulty } from './config.js';
import { GOLD, ENEMIES, OBSTACLES, ALL, PALETTE } from './entities.js';
import { sfx } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const stat = (k, v, tone) =>
  `<div class="cell"><span class="k">${k}</span><span class="v${tone ? ' ' + tone : ''}">${v}</span></div>`;

export class UI {
  constructor(app) {
    this.app = app;
    this.screens = {
      title: $('#screen-title'),
      help: $('#screen-help'),
      playground: $('#screen-playground'),
      brief: $('#screen-brief'),
      shop: $('#screen-shop'),
      result: $('#screen-result'),
      pause: $('#screen-pause'),
    };
    this.pauseBtn = $('#pause-btn');
    this.current = null;

    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      sfx.ui();
      this.act(t.dataset.act, t);
    });

    this.pauseBtn.addEventListener('click', () => { sfx.ui(); this.app.pause(); });

    this.buildPlayground();
  }

  act(a) {
    const app = this.app;
    switch (a) {
      case 'start-run': app.newGame(); break;
      case 'open-playground': this.show('playground'); break;
      case 'open-help': this.show('help'); break;
      case 'back-title': app.toMenu(); break;
      case 'begin-run': app.beginRun(); break;
      case 'next-run': app.nextRun(); break;
      case 'abandon': app.toMenu(); break;
      case 'resume': app.resume(); break;
      case 'quit': app.toMenu(); break;
      case 'toggle-mute': app.toggleMute(); break;
    }
  }

  show(name) {
    for (const k in this.screens) this.screens[k].classList.toggle('active', k === name);
    this.current = name;
    this.pauseBtn.hidden = name !== null;
  }

  hideAll() {
    for (const k in this.screens) this.screens[k].classList.remove('active');
    this.current = null;
    this.pauseBtn.hidden = false;
  }

  // ── title ─────────────────────────────────────────────────────────────────

  refreshTitle(meta) {
    $('#best-line').textContent = meta.bestRun
      ? `best — run ${meta.bestRun} · ${meta.bestGold.toLocaleString()} gold`
      : 'best — no runs cleared yet';
    $('#mute-btn').textContent = meta.muted ? 'sound off' : 'sound on';
  }

  // ── playground menu ───────────────────────────────────────────────────────

  buildPlayground() {
    const fill = (host, defs) => {
      host.innerHTML = '';
      for (const d of defs) {
        const card = el('button', 'card');
        card.type = 'button';

        // Each family is asked a different question, so each card answers a
        // different one. Enemy: how hard is it, how do you get in, what does it
        // drop. Obstacle: nothing, because there is nothing to know.
        let glyph = 'X', meta = '', need = '';
        if (d.cls === 'enemy') {
          glyph = String(d.strength);
          meta = `strength ${d.strength} · ${d.value} pts · ` +
            `<span style="color:${PALETTE.gold}">${d.drop * GOLD.mote.gold}g</span>`;
          need = d.weak === 0
            ? `any contact, with a ball of strength ${d.strength} or better`
            : `<span style="color:${PALETTE.boost}">a boosted ball through the weak point</span>, ` +
              `entering from the ${d.weak === 1 ? 'one end it faces' : 'end each point faces'}`;
        } else {
          meta = 'no points, no way through';
          need = 'nothing. It only ever costs you health.';
        }

        card.innerHTML =
          `<div class="row"><span class="nm"><i class="glyph" style="color:${d.color}">${glyph}</i>${d.label}</span>` +
          `<span class="meta">${meta}</span></div>` +
          `<div class="bl">${d.blurb}</div>` +
          `<div class="bl need">${d.cls === 'obs' ? 'gets you through' : 'opens it'} — ${need}</div>` +
          `<div class="bl" style="opacity:.62">${d.hint}</div>`;
        card.addEventListener('click', () => this.app.startPlayground(d.key));
        host.appendChild(card);
      }
    };
    fill($('#pg-enemies'), Object.values(ENEMIES));
    fill($('#pg-obstacles'), Object.values(OBSTACLES));
  }

  // ── run brief ─────────────────────────────────────────────────────────────

  showBrief(run, upgrades) {
    const d = derived(upgrades);
    const diff = difficulty(run);
    $('#brief-eyebrow').textContent = `RUN ${run}`;
    $('#brief-title').textContent = `${CFG.run.target(run).toLocaleString()} POINTS`;
    $('#brief-stats').innerHTML =
      stat('TIME', `${d.time}s`) +
      stat('LIVES', d.lives) +
      stat('HEALTH', d.health) +
      stat('STRENGTH', `${d.strength} / ${d.strength + d.boostStrength}`);

    // Escalation lands on either side — a new hazard or a new enemy — so
    // announce whatever actually turned up rather than guessing the family.
    const prev = run > 1 ? difficulty(run - 1) : null;
    const label = (k) => ALL[k].label;
    const spread = (x) => [...x.enemyPool, ...x.obstaclePool];
    const pool = spread(diff);
    const fresh = prev ? pool.filter((k) => !spread(prev).includes(k)) : [];
    const known = `In play: ${pool.map(label).join(' · ')}.`;
    $('#brief-note').innerHTML = fresh.length
      ? `<b>NEW:</b> ${fresh.map(label).join(' and ')} joins the field. ${known}`
      : known;
    this.show('brief');
  }

  // ── shop ──────────────────────────────────────────────────────────────────

  showShop(app, result) {
    $('#shop-eyebrow').textContent = `RUN ${result.run} CLEARED`;
    $('#shop-summary').innerHTML =
      stat('POINTS', `${result.score.toLocaleString()} / ${result.target.toLocaleString()}`, 'good') +
      stat('GOLD DUG', `+${result.dug.toLocaleString()}`, 'good') +
      stat('TIME BONUS', `+${result.bonus.toLocaleString()}`, 'good') +
      stat('NEXT TARGET', CFG.run.target(result.run + 1).toLocaleString());
    this.renderShopList(app);
    this.show('shop');
  }

  renderShopList(app) {
    $('#shop-wallet').textContent = app.wallet.toLocaleString();
    const host = $('#shop-list');
    host.innerHTML = '';
    for (const u of UPGRADES) {
      const lvl = app.upgrades[u.id];
      const maxed = lvl >= u.max;
      const cost = upgradeCost(u, lvl);
      const afford = app.wallet >= cost;

      const card = el('button', 'card' + (maxed ? ' maxed' : afford ? ' buyable' : ' broke'));
      card.type = 'button';
      card.disabled = maxed;
      card.innerHTML =
        `<div class="row"><span class="nm">${u.name}</span>` +
        `<span class="meta">${maxed ? 'MAX' : cost.toLocaleString()}</span></div>` +
        `<div class="bl">${u.desc}</div>` +
        `<div class="bl" style="opacity:.62">now: ${u.show(lvl)}${maxed ? '' : ` → ${u.show(lvl + 1)}`} · lvl ${lvl}/${u.max}</div>`;
      card.addEventListener('click', () => {
        if (maxed || !afford) { sfx.crack(); return; }
        app.buy(u.id, cost);
      });
      host.appendChild(card);
    }
  }

  // ── result ────────────────────────────────────────────────────────────────

  showResult(result, meta, totals) {
    $('#result-eyebrow').textContent = 'GAME OVER';
    $('#result-title').textContent = result.reason;
    $('#result-stats').innerHTML =
      stat('RUNS CLEARED', totals.runsCleared) +
      stat('DIED ON', `RUN ${result.run}`, 'bad') +
      stat('GOLD DUG', totals.dug.toLocaleString(), 'good') +
      stat('BEST EVER', `RUN ${meta.bestRun}`) +
      `<div class="cell wide"><span class="k">LAST RUN</span><span class="v">${result.score.toLocaleString()} / ${result.target.toLocaleString()} POINTS</span></div>`;
    this.show('result');
  }

  showPause(g) {
    const endless = g.mode === 'playground';
    $('#pause-stats').innerHTML = endless
      ? stat('MODE', 'PLAYGROUND') + stat('SCORE', g.score.toLocaleString())
      : stat('RUN', g.run) + stat('SCORE', `${g.score.toLocaleString()} / ${g.target.toLocaleString()}`);
    this.show('pause');
  }
}
