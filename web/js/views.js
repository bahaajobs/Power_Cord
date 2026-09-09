/* Render functions. Pure: they read the store and the engine's runtime view
 * and return HTML. All user-visible text goes through t(). */

import { t, tHtml, num, fmtDate, fmtTime, getLang, LANGS } from './i18n.js';
import { I } from './icons.js';
import * as store from './store.js';
import * as engine from './engine.js';
import { canScan } from './discovery.js';
import { isNative } from './net.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A user-typed name wins; otherwise the label follows the interface language. */
export const outletName = (o) =>
  o.name || (o.isUsb ? t('strip.usb') : t('outlet.default', { n: num(o.idx) }));

const maskId = (id) => (!id || id.length <= 5 ? id : id.slice(0, 5) + '*'.repeat(Math.min(id.length - 5, 8)));
const fmtW = (n) => num(Number.isInteger(n) ? n : Number(n).toFixed(1));

export function topbar(eyebrow, title, { back = true, right = '' } = {}) {
  return `
  <div class="topbar">
    ${back ? `<button class="sq" data-action="back" aria-label="${esc(t('act.back'))}">${I.back}</button>` : '<span></span>'}
    <div class="titles">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
    </div>
    ${right || '<span></span>'}
  </div>`;
}

/* ------------------------------------------------------------------ setup */

const SETUP_STEPS = [
  { k: 's1', icon: I.chip },
  { k: 's2', icon: I.wifi },
  { k: 's3', icon: I.home },
  { k: 's4', icon: I.shield },
  { k: 's5', icon: I.plus },
];

export function setupView(step) {
  const total = SETUP_STEPS.length;
  const i = Math.max(0, Math.min(step, total - 1));
  const s = SETUP_STEPS[i];
  const last = i === total - 1;
  return `
  ${topbar(t('setup.eyebrow'), t('setup.title'), { back: i > 0 })}
  <div class="stack">
    <div class="steps" role="progressbar" aria-valuenow="${i + 1}" aria-valuemin="1" aria-valuemax="${total}">
      ${SETUP_STEPS.map((_, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}
    </div>
    <p class="dim mono" style="text-align:center;font-size:12.5px">${esc(t('setup.step', { n: num(i + 1), total: num(total) }))}</p>

    <section class="card">
      <div class="setup-icon">${s.icon}</div>
      <h2 style="margin:14px 0 8px;font-size:21px">${esc(t(`setup.${s.k}.title`))}</h2>
      <p class="muted" style="margin:0">${esc(t(`setup.${s.k}.body`))}</p>
      ${s.k === 's1' ? `<div class="banner" style="margin-top:16px">${I.warn}<span>${esc(t('setup.s1.warn'))}</span></div>` : ''}
    </section>

    <div class="row-2">
      <button class="btn" data-action="setup-skip">${esc(t('act.skip'))}</button>
      <button class="btn solid" data-action="setup-next" data-step="${i}">
        ${esc(last ? t('act.done') : t('act.next'))}
      </button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------- home */

export function homeView({ search = '', reveal = new Set() } = {}) {
  const s = store.get();
  const sum = engine.summary();
  const q = search.trim().toLowerCase();

  const devices = q
    ? s.devices.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        (d.deviceId || '').toLowerCase().includes(q) ||
        (d.room || '').toLowerCase().includes(q) ||
        (d.lanHost || '').toLowerCase().includes(q) ||
        d.outlets.some((o) => o.name.toLowerCase().includes(q)))
    : s.devices;

  return `
  ${banner()}
  <div class="stack">
    <section class="card hero">
      <div class="hero-label">${esc(t('home.totalNow'))}</div>
      <div class="hero-value" dir="ltr"><span>${sum.anyMeter ? fmtW(sum.watts) : '—'}</span><span class="unit">W</span></div>
      <div class="hero-facts">
        <span>${tHtml(sum.stripsOnline === 1 ? 'home.stripOnline' : 'home.stripsOnline',
          { n: `<b>${num(sum.stripsOnline)}</b>` })}</span>
        <span>${tHtml('home.outletsOn',
          { on: `<b>${num(sum.outletsOn)}`, total: `${num(sum.outletsTotal)}</b>` })}</span>
        <span>${tHtml(sum.plansActive === 1 ? 'home.planActive' : 'home.plansActive',
          { n: `<b>${num(sum.plansActive)}</b>` })}</span>
      </div>
    </section>

    <nav class="quick">
      <button data-go="#/energy"><span class="chip">${I.chart}</span><span class="label">${esc(t('quick.consumption'))}</span></button>
      <button data-go="#/schedules"><span class="chip">${I.clock}</span><span class="label">${esc(t('quick.schedules'))}</span></button>
      <button data-go="#/automation"><span class="chip">${I.bolt}</span><span class="label">${esc(t('quick.automation'))}</span></button>
      <button class="danger" data-action="all-off"><span class="chip">${I.power}</span><span class="label">${esc(t('quick.allOff'))}</span></button>
    </nav>

    <div class="search">${I.search}
      <input id="search" placeholder="${esc(t('home.search'))}" value="${esc(search)}" autocapitalize="none">
    </div>

    ${devices.length === 0
      ? `<div class="card empty">${I.socket}<p>${esc(q ? t('home.noMatch', { q }) : t('home.empty'))}</p></div>`
      : devices.map((d) => stripCard(d, reveal)).join('')}
  </div>
  <button class="fab" data-action="add-strip">${I.plus} ${esc(t('home.addStrip'))}</button>`;
}

function banner() {
  const s = store.get();
  if (s.devices.length === 0) return '';
  const anyOnline = s.devices.some((d) => engine.stateOf(d.id).online);
  if (anyOnline) return '';
  return `<div class="banner">${I.warn}<span>${esc(t('err.offline'))}</span></div>`;
}

function stripCard(d, reveal) {
  const rt = engine.stateOf(d.id);
  const shown = reveal.has(d.id);
  const idText = d.deviceId || d.lanHost || d.name;
  const label = shown || !store.get().maskDeviceIds ? idText : maskId(idText);

  const sub = d.planExpires
    ? t('strip.planEnds', { date: fmtDate(d.planExpires) })
    : rt.online
      ? (rt.via === 'remote' ? t('strip.remote') : t('strip.local'))
      : (d.room || t('strip.noPlan'));

  const meter = rt.energy?.watts != null
    ? `<span class="watts ${rt.energy.watts > 0 ? '' : 'zero'}" dir="ltr">${fmtW(rt.energy.watts)} W</span>`
    : `<span class="watts zero">${esc(t('strip.noMeter'))}</span>`;

  return `
  <section class="card" data-strip="${d.id}">
    <div class="strip-head">
      <span class="dot ${rt.online ? 'on' : ''}"></span>
      <span class="strip-id" dir="ltr" title="${esc(d.name)}">${esc(label)}</span>
      <button class="icon-btn" data-action="reveal" data-id="${d.id}"
        aria-label="${esc(shown ? t('strip.hideId') : t('strip.revealId'))}">${shown ? I.eyeOff : I.eye}</button>
      <span class="pill ${rt.online ? '' : 'off'}">${esc(rt.online ? t('strip.online') : t('strip.offline'))}</span>
      <span style="flex:1"></span>
      <button class="icon-btn" data-go="#/strip/${d.id}" aria-label="${esc(t('strip.settings'))}">${I.gear}</button>
    </div>
    <div class="strip-meta"><span>${esc(sub)}</span>${meter}</div>
    <div class="outlets">
      ${d.outlets.filter((o) => !o.isUsb).map((o) => outletTile(d, o, rt)).join('')}
    </div>
    ${d.hasUsb ? usbRow(d, rt) : ''}
    <div class="row-2">
      <button class="btn primary" data-action="all-on" data-id="${d.id}" ${rt.online ? '' : 'disabled'}>${esc(t('strip.allOn'))}</button>
      <button class="btn" data-action="all-off-strip" data-id="${d.id}" ${rt.online ? '' : 'disabled'}>${esc(t('strip.allOff'))}</button>
    </div>
  </section>`;
}

function outletTile(d, o, rt) {
  const on = !!rt.channels?.[o.idx];
  const pend = engine.isPending(d.id, o.idx);
  return `
  <button class="outlet ${on ? 'on' : ''} ${pend ? 'pending' : ''} ${o.locked ? 'locked' : ''}"
    data-action="toggle" data-id="${d.id}" data-idx="${o.idx}"
    aria-pressed="${on}" ${rt.online ? '' : 'disabled'}>
    <span class="glyph">${o.isUsb ? I.usb : I.socket}</span>
    <span class="nm">${esc(outletName(o))}${o.locked ? ` ${I.lock}` : ''}</span>
    <span class="st">${esc(pend ? t('strip.switching') : on ? t('strip.on') : t('strip.stateOff'))}</span>
  </button>`;
}

function usbRow(d, rt) {
  const usb = d.outlets.find((o) => o.isUsb);
  if (!usb) return '';
  const on = !!rt.channels?.[usb.idx];
  const pend = engine.isPending(d.id, usb.idx);
  return `
  <div class="list-item" style="margin-top:14px;border-top:1px solid var(--line-soft);border-bottom:0;padding-bottom:0">
    <div><div class="t">${esc(outletName(usb))}</div>
      <div class="s">${esc(pend ? t('strip.switching') : on ? t('strip.powered') : t('strip.off'))}</div></div>
    <button class="switch" role="switch" aria-checked="${on}"
      data-action="toggle" data-id="${d.id}" data-idx="${usb.idx}"
      aria-label="${esc(outletName(usb))}" ${rt.online ? '' : 'disabled'}></button>
  </div>`;
}

/* ----------------------------------------------------------------- energy */

export function energyView(rep, selected) {
  const s = store.get();
  if (!rep) return topbar(t('energy.eyebrow'), t('energy.title')) + `<div class="empty"><p>…</p></div>`;
  const cost = store.estimateCost(rep.totalKwh);

  return `
  ${topbar(t('energy.eyebrow'), t('energy.title'), {
    right: `<button class="sq" data-action="tariff" aria-label="${esc(t('energy.tariff'))}">${I.money}</button>` })}
  <div class="stack">
    <div class="segments" role="tablist">
      ${[7, 30, 90].map((d) => `
        <button role="tab" aria-selected="${rep.days === d}" data-action="range" data-days="${d}">${esc(t('energy.days', { n: num(d) }))}</button>`).join('')}
    </div>

    <section class="card hero">
      <div class="two-up">
        <div>
          <div class="stat-label">${esc(t('energy.totalUsed'))}</div>
          <div class="stat-value green" dir="ltr">${num(rep.totalKwh, 2)}<span class="unit">kWh</span></div>
        </div>
        <div>
          <div class="stat-label">${esc(t('energy.estCost'))}</div>
          <div class="stat-value" dir="ltr">${num(cost, 2)}</div>
        </div>
      </div>
      <div class="tariff-line">
        <span>${esc(t('energy.tariff'))}</span>
        <button data-action="tariff">${esc(s.tariffMode === 'brackets'
          ? t('tariff.brackets') : `${num(s.tariffFlat)} ${s.currency}/kWh`)} ${I.pencil}</button>
      </div>
      ${rep.lastSync ? `<p class="dim mono" style="font-size:12px;margin:10px 0 0">${esc(t('energy.syncedAt', { time: fmtTime(rep.lastSync) }))}</p>` : ''}
    </section>

    <section class="card">
      <div class="chart-head"><h2>${esc(t('energy.daily'))}</h2><span class="mono dim" dir="ltr">${esc(t('energy.perDay'))}</span></div>
      <p class="chart-hint">${selected
        ? `${esc(selected.day)} — ${num(selected.kwh, 3)} kWh`
        : esc(t('energy.tapBar'))}</p>
      <div class="chart-wrap" dir="ltr">${barChart(rep)}</div>
    </section>

    <section class="card">
      <div class="chart-head"><h2>${esc(t('energy.byStrip'))}</h2><span class="mono dim">${esc(t('energy.lastDays', { n: num(rep.days) }))}</span></div>
      ${rep.byStrip.length === 0 ? `<div class="empty"><p>${esc(t('home.empty'))}</p></div>`
        : rep.byStrip.map((r) => `
        <div class="bystrip-row">
          <span class="chip">${I.socket}</span>
          <div style="min-width:0">
            <div class="nm">${esc(r.name)}</div>
            <div class="meter"><i style="width:${r.share}%"></i></div>
          </div>
          <div style="text-align:end">
            <div class="kwh" dir="ltr">${num(r.kwh, 2)} kWh</div>
            <div class="share">${num(r.share)}%</div>
          </div>
        </div>`).join('')}
    </section>

    <p class="dim" style="font-size:13.5px;padding:0 4px">${esc(t('energy.footnote'))}</p>
  </div>`;
}

/** Time runs left-to-right even in Arabic, so the chart stays LTR. */
function barChart(rep) {
  const data = rep.series;
  if (!data.some((d) => d.kwh > 0)) {
    return `<div class="empty"><p>${esc(t('energy.noneRecorded', { n: num(rep.days) }))}</p></div>`;
  }
  const W = 640, H = 260, padL = 8, padR = 8, padT = 26, padB = 30;
  const max = Math.max(...data.map((d) => d.kwh), 0.001);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const slot = innerW / data.length;
  const bw = Math.max(6, Math.min(slot * 0.62, 56));
  const avg = rep.average || 0;
  const avgY = padT + innerH - (avg / max) * innerH;
  const step = data.length <= 8 ? 1 : data.length <= 31 ? 5 : 15;

  const bars = data.map((d, i) => {
    if (d.kwh <= 0) return '';
    const h = Math.max(3, (d.kwh / max) * innerH);
    const x = padL + i * slot + (slot - bw) / 2;
    return `<rect class="bar" x="${x.toFixed(1)}" y="${(padT + innerH - h).toFixed(1)}"
      width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5"
      data-action="bar" data-day="${d.day}" data-kwh="${d.kwh}"><title>${d.day}: ${d.kwh.toFixed(3)} kWh</title></rect>`;
  }).join('');

  const labels = data.map((d, i) => (i % step !== 0 && i !== data.length - 1) ? '' :
    `<text x="${(padL + i * slot + slot / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle">${d.day.slice(5)}</text>`).join('');

  const label = `avg ${avg.toFixed(2)}`;
  const lw = label.length * 6.4 + 10;

  return `
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="${esc(t('energy.daily'))}">
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4BE88C"/><stop offset="100%" stop-color="#1F8E55"/></linearGradient></defs>
    ${bars}
    ${avg > 0 ? `<line class="avg" x1="${padL}" y1="${avgY.toFixed(1)}" x2="${W - padR}" y2="${avgY.toFixed(1)}"/>
      <rect x="${(W - padR - lw).toFixed(1)}" y="${(avgY - 20).toFixed(1)}" width="${lw.toFixed(1)}" height="15" rx="4" fill="var(--card)" opacity=".92"/>
      <text class="avg-label" x="${W - padR - 5}" y="${(avgY - 9).toFixed(1)}" text-anchor="end">${label}</text>` : ''}
    ${labels}
  </svg>`;
}

/* -------------------------------------------------------------- schedules */

const DAY_LETTERS = () => (getLang() === 'ar'
  ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']
  : ['S', 'M', 'T', 'W', 'T', 'F', 'S']);

export function schedulesView() {
  const list = store.get().schedules;
  return `
  ${topbar(t('sched.eyebrow'), t('sched.title'))}
  <div class="stack">
    <p class="dim" style="font-size:14px;padding:0 4px">${esc(t('sched.runsOnPhone'))}</p>
    <section class="card">
      ${list.length === 0 ? `<div class="empty">${I.clock}<p>${esc(t('sched.none'))}</p></div>`
        : list.map(scheduleRow).join('')}
    </section>
    <button class="btn solid" data-action="add-schedule">${esc(t('sched.add'))}</button>
  </div>`;
}

function scheduleRow(s) {
  const d = store.device(s.deviceId);
  const target = s.outletIdx == null ? t('sched.allOutlets')
    : (() => { const o = d?.outlets.find((x) => x.idx === s.outletIdx); return o ? outletName(o) : `#${s.outletIdx}`; })();
  const when = s.kind === 'countdown'
    ? (s.fireAt > Date.now() ? t('sched.inMin', { n: num(Math.max(1, Math.round((s.fireAt - Date.now()) / 60000))) }) : t('sched.fired'))
    : `${s.atTime} · ${DAY_LETTERS().map((c, i) => (s.weekdayMask & (1 << i)) ? c : '·').join('')}`;
  return `
  <div class="list-item">
    <div>
      <div class="t">${esc(d?.name || '—')} — ${esc(target)} ${esc(s.action ? t('sched.turnOn') : t('sched.turnOff'))}</div>
      <div class="s">${esc(when)}${s.enabled ? '' : ' · ' + esc(t('sched.disabled'))}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="switch" role="switch" aria-checked="${s.enabled}" data-action="toggle-schedule" data-id="${s.id}"></button>
      <button class="icon-btn" data-action="del-schedule" data-id="${s.id}" aria-label="${esc(t('act.delete'))}">${I.trash}</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------- automation */

export function automationView() {
  const list = store.get().automations;
  return `
  ${topbar(t('auto.eyebrow'), t('auto.title'))}
  <div class="stack">
    <p class="dim" style="font-size:14px;padding:0 4px">${esc(t('auto.intro'))}</p>
    <section class="card">
      ${list.length === 0 ? `<div class="empty">${I.bolt}<p>${esc(t('auto.none'))}</p></div>`
        : list.map(automationRow).join('')}
    </section>
    <button class="btn solid" data-action="add-automation">${esc(t('auto.add'))}</button>
  </div>`;
}

function automationRow(a) {
  const d = store.device(a.deviceId);
  const rt = d ? engine.stateOf(d.id) : null;
  const desc = a.kind === 'standby'
    ? t('auto.standbyDesc', { w: num(a.thresholdW), m: num(Math.round((a.durationS || 600) / 60)) })
    : t('auto.overloadDesc', { w: num(a.thresholdW) }) + (a.cut ? t('auto.andCut') : '');
  const warn = rt && rt.online && !rt.energy ? ' · ' + t('auto.needsMeter') : '';
  return `
  <div class="list-item">
    <div>
      <div class="t">${esc(d?.name || '—')} — ${esc(a.kind === 'standby' ? t('auto.standby') : t('auto.overload'))}</div>
      <div class="s">${esc(desc)}${esc(warn)}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="switch" role="switch" aria-checked="${a.enabled}" data-action="toggle-automation" data-id="${a.id}"></button>
      <button class="icon-btn" data-action="del-automation" data-id="${a.id}" aria-label="${esc(t('act.delete'))}">${I.trash}</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------- device settings */

export function deviceView(id) {
  const d = store.device(id);
  if (!d) return topbar('—', '—') + `<div class="empty"><p>—</p></div>`;
  const rt = engine.stateOf(id);
  const row = (k, v) => `<div class="list-item"><div><div class="t">${esc(k)}</div><div class="s" dir="ltr">${esc(v)}</div></div></div>`;

  return `
  ${topbar(t('strip.settings'), d.name)}
  <div class="stack">
    <section class="card">
      ${row(t('ds.deviceId'), d.deviceId || '—')}
      ${row(t('ds.address'), d.lanHost || '—')}
      ${row(t('ds.remote'), d.remoteHost || '—')}
      ${row(t('ds.metering'), rt.energy ? t('ds.reporting') : t('ds.noneDetected'))}
      ${row(t('ds.lastSeen'), rt.lastSeen ? new Date(rt.lastSeen).toLocaleString() : t('ds.never'))}
    </section>

    <section class="card">
      <h2 style="margin:0 0 12px;font-size:19px">${esc(t('ds.outlets'))}</h2>
      ${d.outlets.map((o) => `
        <div class="list-item">
          <div><div class="t">${esc(outletName(o))}</div>
            <div class="s">${esc(t('ds.channel', { n: num(o.idx) }))}${o.isUsb ? ' · ' + esc(t('ds.usbRail')) : ''}${o.locked ? ' · ' + esc(t('ds.locked')) : ''}</div></div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="icon-btn" data-action="rename-outlet" data-id="${d.id}" data-idx="${o.idx}" aria-label="${esc(t('act.rename'))}">${I.pencil}</button>
            <button class="switch" role="switch" aria-checked="${o.locked}" data-action="lock-outlet" data-id="${d.id}" data-idx="${o.idx}"></button>
          </div>
        </div>`).join('')}
      <p class="dim" style="font-size:13px;margin:12px 0 0">${esc(t('ds.lockHelp'))}</p>
    </section>

    <button class="btn" data-action="edit-strip" data-id="${d.id}">${esc(t('ds.renameStrip'))}</button>
    <button class="btn" data-action="set-plan" data-id="${d.id}">${esc(t('ds.setPlan'))}</button>
    <button class="btn danger" data-action="remove-strip" data-id="${d.id}">${esc(t('ds.remove'))}</button>
  </div>`;
}

/* ---------------------------------------------------------- app settings */

export function settingsView(historyDays) {
  const s = store.get();
  return `
  ${topbar(t('settings.about'), t('settings.title'))}
  <div class="stack">
    <section class="card">
      <h2 style="margin:0 0 12px;font-size:19px">${esc(t('settings.language'))}</h2>
      <div class="segments">
        ${LANGS.map((l) => `<button data-action="lang" data-code="${l.code}" aria-selected="${getLang() === l.code}">${esc(l.label)}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2 style="margin:0 0 12px;font-size:19px">${esc(t('settings.mode'))}</h2>
      <div class="segments">
        <button data-action="mode" data-mode="direct" aria-selected="${s.mode === 'direct'}">${esc(t('settings.direct'))}</button>
        <button data-action="mode" data-mode="server" aria-selected="${s.mode === 'server'}">${esc(t('settings.server'))}</button>
      </div>
      <p class="dim" style="font-size:13.5px;margin:12px 0 0">
        ${esc(s.mode === 'direct' ? t('settings.directHelp') : t('settings.serverHelp'))}</p>
      ${s.mode === 'server' ? `
        <label class="field" style="margin-top:14px"><span>${esc(t('settings.serverUrl'))}</span>
          <input id="serverUrl" value="${esc(s.serverUrl)}" dir="ltr" placeholder="http://192.168.1.10:8080"></label>` : ''}
      <label class="field" style="margin-top:14px"><span>${esc(t('settings.poll'))}</span>
        <input id="pollSeconds" type="number" min="2" max="120" value="${esc(s.pollSeconds)}" dir="ltr"></label>
    </section>

    <section class="card">
      <h2 style="margin:0 0 6px;font-size:19px">${esc(t('settings.history'))}</h2>
      <p class="muted mono" style="font-size:13.5px;margin:0 0 14px">${esc(t('settings.historyKept', { n: num(historyDays) }))}</p>
      <div class="row-2">
        <button class="btn" data-action="export-history">${esc(t('settings.exportHistory'))}</button>
        <button class="btn danger" data-action="clear-history">${esc(t('settings.clearHistory'))}</button>
      </div>
    </section>

    <section class="card">
      <button class="btn" data-go="#/setup" style="width:100%">${esc(t('setup.openGuide'))}</button>
      <p class="dim" style="font-size:12.5px;margin:14px 0 0">${esc(t('safety.note'))}</p>
      <p class="dim mono" style="font-size:12px;margin:8px 0 0" dir="ltr">
        Power Cord · ${isNative() ? 'Android' : 'web'} · scan ${canScan() ? 'available' : 'unavailable'}</p>
    </section>
  </div>`;
}
