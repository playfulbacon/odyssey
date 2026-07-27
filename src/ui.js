// DOM overlays: title, help, playground menu, run brief, shop, results, pause.
// The UI never touches the simulation directly — it calls back into App.

import { CFG, UPGRADES, upgradeCost, derived, difficulty } from './config.js';
import { COLLECTABLES, OBSTACLES, SHIELD } from './entities.js';
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
    $('#best-line').textContent = `best — ${meta.best.toLocaleString()}${meta.bestRun ? ` · run ${meta.bestRun}` : ''}`;
    $('#mute-btn').textContent = meta.muted ? 'sound off' : 'sound on';
  }

  // ── playground menu ───────────────────────────────────────────────────────

  buildPlayground() {
    const fill = (host, defs) => {
      host.innerHTML = '';
      for (const d of defs) {
        if (d.hidden) continue;
        const card = el('button', 'card');
        card.type = 'button';
        const glyph = d.cls === 'col' ? 'O' : 'X';
        const pay = d.value ? `${d.value} pts` : 'no points';
        const meta = `${d.hp ? `${d.hp}-ring shield · ` : ''}${pay}`;
        const need = d.cls === 'obs'
          ? 'nothing — every obstacle is lethal on contact'
          : d.hp
            ? `<span style="color:${SHIELD.color}">${SHIELD.label}</span>, once per ring`
            : 'any touch at all';
        card.innerHTML =
          `<div class="row"><span class="nm"><i class="glyph" style="color:${d.color}">${glyph}</i>${d.label}</span>` +
          `<span class="meta">${meta}</span></div>` +
          `<div class="bl">${d.blurb}</div>` +
          `<div class="bl need">${d.cls === 'obs' ? 'gets you through' : 'takes it'} — ${need}</div>` +
          `<div class="bl" style="opacity:.62">${d.hint}</div>`;
        card.addEventListener('click', () => this.app.startPlayground(d.key));
        host.appendChild(card);
      }
    };
    fill($('#pg-collectables'), Object.values(COLLECTABLES));
    fill($('#pg-obstacles'), Object.values(OBSTACLES));
  }

  // ── run brief ─────────────────────────────────────────────────────────────

  showBrief(run, upgrades) {
    const d = derived(upgrades);
    const diff = difficulty(run);
    $('#brief-eyebrow').textContent = `RUN ${run}`;
    $('#brief-title').textContent = `REACH ${CFG.run.target(run).toLocaleString()}`;
    $('#brief-stats').innerHTML =
      stat('TIME', `${d.time}s`) +
      stat('LIVES', d.lives) +
      stat('BALL POWER', d.power) +
      stat('THREAT', `${diff.maxObstacles} max`);

    // Escalation lands on both pools now — a run can bring a new obstacle, a
    // new collectable, or one more ring to boost through — so announce whatever
    // actually turned up rather than assuming it is an obstacle.
    const prev = run > 1 ? difficulty(run - 1) : null;
    const label = (k) => (COLLECTABLES[k] || OBSTACLES[k]).label;
    const pool = [...diff.collectPool, ...diff.obstaclePool];
    const fresh = prev
      ? pool.filter((k) => ![...prev.collectPool, ...prev.obstaclePool].includes(k))
      : [];
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
      stat('SCORED', result.score.toLocaleString(), 'good') +
      stat('TARGET', result.target.toLocaleString()) +
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
      stat('FINAL SCORE', totals.total.toLocaleString(), 'good') +
      stat('BEST EVER', meta.best.toLocaleString()) +
      `<div class="cell wide"><span class="k">LAST RUN</span><span class="v">${result.score.toLocaleString()} / ${result.target.toLocaleString()}</span></div>`;
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
