/* Power Cord — app shell.
 *
 * Direct mode is the default: the app talks to each strip's own web server and
 * nothing else runs. On your own Wi-Fi it uses the strip's LAN address; from
 * outside it uses whatever address your router forwards. Both are configured
 * per strip and it fails over between them on its own. */

import { t, num, fmtDate, initLang, setLang, LANGS } from './js/i18n.js';
import { I } from './js/icons.js';
import * as store from './js/store.js';
import * as engine from './js/engine.js';
import * as history from './js/history.js';
import * as views from './js/views.js';
const outletName = views.outletName;
import { probe } from './js/direct.js';
import { canScan, scanSubnet, subnetFrom } from './js/discovery.js';

const esc = views.esc;
const el = (id) => document.getElementById(id);
const $ = (sel, root = document) => root.querySelector(sel);

const ui = {
  route: location.hash || '#/',
  search: '',
  reveal: new Set(),
  energyDays: 7,
  energyReport: null,
  selectedBar: null,
  setupStep: 0,
  historyDays: 0,
};

/* ---------------------------------------------------------------- toasts */

function toast(message, kind = '') {
  const n = document.createElement('div');
  n.className = `toast ${kind}`;
  n.textContent = message;
  el('toasts').append(n);
  setTimeout(() => n.remove(), 4200);
}

/* ---------------------------------------------------------------- render */

let lastHtml = '';
let touching = false;
let queued = false;

/**
 * Replacing #app on every poll destroys the DOM several times a minute, which
 * on a phone loses taps and jumps the scroll. So: skip when nothing changed,
 * hold while a finger is down, and restore the scroll afterwards.
 */
function render() {
  if (touching) { queued = true; return; }
  const html = view();
  if (html === lastHtml) return;
  lastHtml = html;
  const y = window.scrollY;
  el('app').innerHTML = html;
  if (window.scrollY !== y) window.scrollTo(0, y);
}

const invalidate = () => { lastHtml = ''; render(); };

for (const ev of ['pointerdown', 'touchstart']) {
  document.addEventListener(ev, () => { touching = true; }, { passive: true });
}
for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) {
  document.addEventListener(ev, () => {
    touching = false;
    if (queued) { queued = false; setTimeout(render, 0); }
  }, { passive: true });
}

function view() {
  const r = ui.route;
  if (r.startsWith('#/setup')) return views.setupView(ui.setupStep);
  if (r.startsWith('#/energy')) return views.energyView(ui.energyReport, ui.selectedBar);
  if (r.startsWith('#/schedules')) return views.schedulesView();
  if (r.startsWith('#/automation')) return views.automationView();
  if (r.startsWith('#/strip/')) return views.deviceView(r.split('/')[2]);
  if (r.startsWith('#/settings')) return views.settingsView(ui.historyDays);
  return views.homeView({ search: ui.search, reveal: ui.reveal });
}

/* ---------------------------------------------------------------- sheets */

function sheet(html) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.append(bg);
  bg.querySelector('input, select, button')?.focus();
  return bg;
}

function field(label, name, opts = {}) {
  const { type = 'text', value = '', hint = '', dir = '', ph = '' } = opts;
  return `<label class="field"><span>${esc(label)}</span>
    <input name="${name}" type="${type}" value="${esc(value)}" ${dir ? `dir="${dir}"` : ''}
      placeholder="${esc(ph)}" autocapitalize="none" autocomplete="off">
    ${hint ? `<small class="dim">${esc(hint)}</small>` : ''}</label>`;
}

function addDeviceSheet(prefill = {}) {
  const bg = sheet(`
    <h2>${esc(t('add.title'))}</h2>
    ${canScan() ? `<button class="btn primary" style="width:100%;margin-bottom:14px" data-scan>${esc(t('act.scan'))}</button>
      <div id="scanOut" class="dim mono" style="font-size:12.5px;margin-bottom:10px"></div>`
      : `<p class="sub">${esc(t('add.scanNative'))}</p>`}
    <form id="addForm">
      ${field(t('add.name'), 'name', { value: prefill.name || '' })}
      ${field(t('add.lanHost'), 'lanHost', { value: prefill.lanHost || '', dir: 'ltr', ph: '192.168.1.42', hint: t('add.lanHostHint') })}
      ${field(t('add.remoteHost'), 'remoteHost', { value: prefill.remoteHost || '', dir: 'ltr', ph: 'myhome.ddns.net:8081', hint: t('add.remoteHostHint') })}
      ${field(t('add.user'), 'user', { value: prefill.user || '', dir: 'ltr' })}
      ${field(t('add.pass'), 'pass', { type: 'password', value: prefill.pass || '', dir: 'ltr' })}
      <label class="field"><span>${esc(t('add.outlets'))}</span>
        <select name="outletCount">${[4, 1, 2, 3, 5, 6, 8].map((n) =>
          `<option ${Number(prefill.outletCount) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field inline"><span>${esc(t('add.hasUsb'))}</span>
        <input type="checkbox" name="hasUsb" checked style="width:auto"></label>
      <div id="testOut" class="dim" style="font-size:13px;margin-bottom:10px"></div>
      <div class="row-2">
        <button class="btn" type="button" data-test>${esc(t('act.test'))}</button>
        <button class="btn solid" type="submit">${esc(t('act.add'))}</button>
      </div>
    </form>`);

  const form = $('#addForm', bg);
  const readForm = () => Object.fromEntries(new FormData(form));

  $('[data-test]', bg)?.addEventListener('click', async () => {
    const f = readForm();
    const out = $('#testOut', bg);
    if (!f.lanHost && !f.remoteHost) { out.textContent = t('add.unreachable', { err: '—' }); return; }
    out.textContent = t('add.testing');
    try {
      const r = await probe(String(f.lanHost || f.remoteHost), { user: f.user, pass: f.pass, timeoutMs: 5000 });
      out.textContent = t('add.reachable', { n: num(r.channelCount) });
      out.className = 'ok-text';
      if (r.name && !form.name.value) form.name.value = r.name;
    } catch (err) {
      out.className = 'err-text';
      out.textContent = t('add.unreachable', { err: err.message });
    }
  });

  $('[data-scan]', bg)?.addEventListener('click', async () => {
    const out = $('#scanOut', bg);
    const base = subnetFrom(form.lanHost.value) || subnetFrom(store.get().devices[0]?.lanHost) || '192.168.1';
    out.textContent = t('add.scanning', { done: 0, total: 254 });
    try {
      const found = await scanSubnet(base, {
        onProgress: ({ done, total }) => { out.textContent = t('add.scanning', { done: num(done), total: num(total) }); },
      });
      if (found.length === 0) { out.textContent = t('add.scanNone'); return; }
      out.innerHTML = `<div style="margin-bottom:8px">${esc(t('add.scanFound', { n: num(found.length) }))}</div>` +
        found.map((f) => `<button class="btn" style="width:100%;margin-bottom:6px" data-pick="${esc(f.host)}" data-ch="${f.channelCount}" data-nm="${esc(f.name || '')}">${esc(f.name || f.host)} — ${esc(f.host)}</button>`).join('');
      for (const b of out.querySelectorAll('[data-pick]')) {
        b.addEventListener('click', () => {
          form.lanHost.value = b.dataset.pick;
          if (b.dataset.nm) form.name.value = b.dataset.nm;
          const n = Number(b.dataset.ch);
          if (n >= 1) form.outletCount.value = String(Math.max(1, n - 1));
        });
      }
    } catch (err) { out.textContent = err.message; }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm();
    if (!f.lanHost && !f.remoteHost) { toast(t('add.unreachable', { err: '—' }), 'error'); return; }
    const count = Number(f.outletCount) || 4;
    store.addDevice({
      name: f.name || f.lanHost, lanHost: f.lanHost, remoteHost: f.remoteHost,
      user: f.user, pass: f.pass, outletCount: count,
      hasUsb: f.hasUsb === 'on', usbChannel: count + 1, deviceId: f.lanHost,
    });
    bg.remove();
    invalidate();
    toast(t('ok.added'), 'ok');
    engine.start();
  });
}

function tariffSheet() {
  const s = store.get();
  const bg = sheet(`
    <h2>${esc(t('tariff.title'))}</h2>
    <p class="sub">${esc(t('tariff.sub'))}</p>
    <form id="tariffForm">
      ${field(t('tariff.currency'), 'currency', { value: s.currency })}
      <label class="field"><span>${esc(t('tariff.mode'))}</span>
        <select name="tariffMode">
          <option value="flat" ${s.tariffMode === 'flat' ? 'selected' : ''}>${esc(t('tariff.flat'))}</option>
          <option value="brackets" ${s.tariffMode === 'brackets' ? 'selected' : ''}>${esc(t('tariff.brackets'))}</option>
        </select></label>
      ${field(t('tariff.rate'), 'tariffFlat', { type: 'number', value: s.tariffFlat, dir: 'ltr' })}
      ${field(t('tariff.mtd'), 'householdMtdKwh', { type: 'number', value: s.householdMtdKwh, dir: 'ltr' })}
      <div class="field"><span>${esc(t('tariff.bracketsHelp'))}</span>
        <div id="brackets" dir="ltr">${s.tariffBrackets.map((b, i) => `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <input data-b="upTo" data-i="${i}" type="number" placeholder="—" value="${b.upTo ?? ''}">
            <input data-b="rate" data-i="${i}" type="number" step="0.01" value="${b.rate}">
          </div>`).join('')}</div></div>
      <button class="btn solid" type="submit" style="width:100%">${esc(t('act.save'))}</button>
    </form>`);

  $('#tariffForm', bg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const brackets = s.tariffBrackets.map((b) => ({ ...b }));
    for (const inp of bg.querySelectorAll('#brackets input')) {
      const i = Number(inp.dataset.i);
      if (inp.dataset.b === 'upTo') brackets[i].upTo = inp.value === '' ? null : Number(inp.value);
      else brackets[i].rate = Number(inp.value);
    }
    store.set({
      currency: f.currency, tariffMode: f.tariffMode,
      tariffFlat: Number(f.tariffFlat), householdMtdKwh: Number(f.householdMtdKwh),
      tariffBrackets: brackets,
    });
    bg.remove();
    await refreshEnergy();
    invalidate();
    toast(t('ok.saved'), 'ok');
  });
}

function scheduleSheet() {
  const devices = store.get().devices;
  if (!devices.length) { toast(t('home.empty')); return; }
  let mask = 127;
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const bg = sheet(`
    <h2>${esc(t('sched.new'))}</h2>
    <form id="schedForm">
      <label class="field"><span>${esc(t('sched.strip'))}</span>
        <select name="deviceId">${devices.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('sched.target'))}</span>
        <select name="outletIdx"><option value="">${esc(t('sched.allOutlets'))}</option>
          ${devices[0].outlets.map((o) => `<option value="${o.idx}">${esc(outletName(o))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('sched.type'))}</span>
        <select name="kind"><option value="weekly">${esc(t('sched.weekly'))}</option>
          <option value="countdown">${esc(t('sched.countdown'))}</option></select></label>
      <label class="field" id="timeField"><span>${esc(t('sched.time'))}</span>
        <input name="atTime" type="time" value="19:00" dir="ltr"></label>
      <label class="field hidden" id="minsField"><span>${esc(t('sched.minutes'))}</span>
        <input name="minutes" type="number" value="30" min="1" dir="ltr"></label>
      <div class="field" id="daysField"><span>${esc(t('sched.days'))}</span>
        <div class="weekdays" dir="ltr">${letters.map((d, i) => `<button type="button" data-day="${i}" aria-pressed="true">${d}</button>`).join('')}</div></div>
      <label class="field"><span>${esc(t('sched.action'))}</span>
        <select name="action"><option value="0">${esc(t('sched.turnOff'))}</option>
          <option value="1">${esc(t('sched.turnOn'))}</option></select></label>
      <button class="btn solid" type="submit" style="width:100%">${esc(t('act.add'))}</button>
    </form>`);

  const form = $('#schedForm', bg);
  form.deviceId.addEventListener('change', () => {
    const d = store.device(form.deviceId.value);
    form.outletIdx.innerHTML = `<option value="">${esc(t('sched.allOutlets'))}</option>` +
      d.outlets.map((o) => `<option value="${o.idx}">${esc(o.name)}</option>`).join('');
  });
  form.kind.addEventListener('change', () => {
    const weekly = form.kind.value === 'weekly';
    $('#timeField', bg).classList.toggle('hidden', !weekly);
    $('#daysField', bg).classList.toggle('hidden', !weekly);
    $('#minsField', bg).classList.toggle('hidden', weekly);
  });
  for (const b of bg.querySelectorAll('[data-day]')) {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.day);
      const on = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!on));
      mask = on ? mask & ~(1 << i) : mask | (1 << i);
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const item = {
      deviceId: f.deviceId,
      outletIdx: f.outletIdx === '' ? null : Number(f.outletIdx),
      kind: f.kind, action: f.action === '1',
    };
    if (f.kind === 'weekly') {
      if (mask === 0) { toast(t('sched.days'), 'error'); return; }
      item.atTime = f.atTime; item.weekdayMask = mask;
    } else {
      item.fireAt = Date.now() + Number(f.minutes || 30) * 60_000;
    }
    store.addSchedule(item);
    bg.remove(); invalidate(); toast(t('ok.created'), 'ok');
  });
}

function automationSheet() {
  const devices = store.get().devices;
  if (!devices.length) { toast(t('home.empty')); return; }
  const bg = sheet(`
    <h2>${esc(t('auto.new'))}</h2>
    <form id="autoForm">
      <label class="field"><span>${esc(t('sched.strip'))}</span>
        <select name="deviceId">${devices.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('auto.title'))}</span>
        <select name="kind"><option value="standby">${esc(t('auto.standby'))}</option>
          <option value="overload">${esc(t('auto.overload'))}</option></select></label>
      ${field(t('auto.threshold'), 'thresholdW', { type: 'number', value: 8, dir: 'ltr' })}
      <label class="field" id="durField"><span>${esc(t('auto.idleFor'))}</span>
        <input name="minutes" type="number" value="10" min="1" dir="ltr"></label>
      <label class="field inline"><span>${esc(t('auto.alsoCut'))}</span>
        <input type="checkbox" name="cut" checked style="width:auto"></label>
      <button class="btn solid" type="submit" style="width:100%">${esc(t('act.add'))}</button>
    </form>`);

  const form = $('#autoForm', bg);
  form.kind.addEventListener('change', () => {
    const standby = form.kind.value === 'standby';
    $('#durField', bg).classList.toggle('hidden', !standby);
    form.thresholdW.value = standby ? '8' : '3000';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    store.addAutomation({
      deviceId: f.deviceId, kind: f.kind,
      thresholdW: Number(f.thresholdW), durationS: Number(f.minutes || 10) * 60,
      cut: f.cut === 'on',
    });
    bg.remove(); invalidate(); toast(t('ok.created'), 'ok');
  });
}

function promptSheet({ title, sub, label, value, type = 'text' }, onSave) {
  const bg = sheet(`
    <h2>${esc(title)}</h2>
    ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
    <form id="promptForm">
      ${field(label, 'value', { type, value: value ?? '' })}
      <button class="btn solid" type="submit" style="width:100%">${esc(t('act.save'))}</button>
    </form>`);
  $('#promptForm', bg).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await onSave(new FormData(e.target).get('value')); bg.remove(); }
    catch (err) { toast(err.message, 'error'); }
  });
}

function confirmSheet({ title, sub, yes, danger }, onYes) {
  const bg = sheet(`
    <h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p>
    <div class="row-2">
      <button class="btn" data-no>${esc(t('act.cancel'))}</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(yes)}</button>
    </div>`);
  bg.querySelector('[data-no]').addEventListener('click', () => bg.remove());
  bg.querySelector('[data-yes]').addEventListener('click', async () => {
    bg.remove();
    try { await onYes(); } catch (err) { toast(err.message, 'error'); }
  });
}

/* ---------------------------------------------------------------- events */

document.addEventListener('click', async (ev) => {
  const el2 = ev.target.closest('[data-action], [data-go]');
  if (!el2) return;
  if (el2.dataset.go) { location.hash = el2.dataset.go; return; }

  const id = el2.dataset.id;
  const idx = Number(el2.dataset.idx);
  const a = el2.dataset.action;

  try {
    switch (a) {
      case 'back': window.history.length > 1 ? window.history.back() : (location.hash = '#/'); break;

      case 'toggle': {
        const d = store.device(id);
        const o = d?.outlets.find((x) => x.idx === idx);
        if (!o) break;
        if (o.locked) { toast(t('err.locked', { name: outletName(o) })); break; }
        const want = !engine.stateOf(id).channels?.[idx];
        await engine.setOutlet(id, idx, want, { onRevert: () => toast(t('err.noConfirm'), 'error') });
        break;
      }
      case 'all-on': await engine.setAllOutlets(id, true); break;
      case 'all-off-strip': await engine.setAllOutlets(id, false); break;
      case 'all-off':
        confirmSheet({
          title: t('confirm.allOffTitle'), sub: t('confirm.allOffBody'),
          yes: t('confirm.allOffYes'), danger: true,
        }, async () => {
          const results = await engine.allOffEverywhere();
          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            toast(t('err.noConfirm'), 'error');
          } else {
            toast(t('ok.allOff'), 'ok');
          }
        });
        break;

      case 'reveal':
        ui.reveal.has(id) ? ui.reveal.delete(id) : ui.reveal.add(id);
        invalidate(); break;

      case 'add-strip': addDeviceSheet(); break;
      case 'tariff': tariffSheet(); break;
      case 'add-schedule': scheduleSheet(); break;
      case 'add-automation': automationSheet(); break;

      case 'range':
        ui.energyDays = Number(el2.dataset.days);
        ui.selectedBar = null;
        await refreshEnergy(); invalidate(); break;
      case 'bar':
        ui.selectedBar = { day: el2.dataset.day, kwh: Number(el2.dataset.kwh) };
        invalidate(); break;

      case 'toggle-schedule': {
        const s = store.get().schedules.find((x) => x.id === id);
        store.updateSchedule(id, { enabled: !s.enabled }); invalidate(); break;
      }
      case 'del-schedule': store.removeSchedule(id); invalidate(); break;
      case 'toggle-automation': {
        const x = store.get().automations.find((y) => y.id === id);
        store.updateAutomation(id, { enabled: !x.enabled, since: 0 }); invalidate(); break;
      }
      case 'del-automation': store.removeAutomation(id); invalidate(); break;

      case 'edit-strip': {
        const d = store.device(id);
        promptSheet({ title: t('ds.renameStrip'), label: t('add.name'), value: d.name },
          (v) => { store.updateDevice(id, { name: String(v).trim() || d.name }); invalidate(); });
        break;
      }
      case 'set-plan': {
        const d = store.device(id);
        promptSheet({
          title: t('ds.setPlan'), label: t('ds.setPlan'), type: 'date',
          value: d.planExpires ? new Date(d.planExpires).toISOString().slice(0, 10) : '',
        }, (v) => { store.updateDevice(id, { planExpires: v ? new Date(v).getTime() : null }); invalidate(); });
        break;
      }
      case 'remove-strip': {
        const d = store.device(id);
        confirmSheet({
          title: t('ds.removeSure', { name: d.name }), sub: t('ds.removeBody'),
          yes: t('act.delete'), danger: true,
        }, async () => {
          await history.removeDevice(id);
          store.removeDevice(id);
          location.hash = '#/'; invalidate(); toast(t('ok.removed'), 'ok');
        });
        break;
      }
      case 'rename-outlet': {
        const d = store.device(id);
        const o = d.outlets.find((x) => x.idx === idx);
        promptSheet({ title: t('act.rename'), label: t('add.name'), value: outletName(o) },
          (v) => { store.updateOutlet(id, idx, { name: String(v).trim() }); invalidate(); });
        break;
      }
      case 'lock-outlet': {
        const d = store.device(id);
        const o = d.outlets.find((x) => x.idx === idx);
        store.updateOutlet(id, idx, { locked: !o.locked }); invalidate(); break;
      }

      case 'lang':
        setLang(el2.dataset.code);
        store.set({ lang: el2.dataset.code });
        invalidate(); break;

      case 'mode':
        store.set({ mode: el2.dataset.mode });
        invalidate(); break;

      case 'export-history': {
        const data = { app: store.exportAll(), history: await history.exportAll() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `powercord-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case 'clear-history':
        confirmSheet({ title: t('settings.clearHistory'), sub: t('settings.history'), yes: t('act.delete'), danger: true },
          async () => { await history.clearAll(); ui.historyDays = 0; await refreshEnergy(); invalidate(); toast(t('ok.saved'), 'ok'); });
        break;

      case 'setup-next': {
        const step = Number(el2.dataset.step);
        if (step >= 4) { store.set({ setupDone: true }); location.hash = '#/'; addDeviceSheet(); }
        else { ui.setupStep = step + 1; invalidate(); }
        break;
      }
      case 'setup-skip':
        store.set({ setupDone: true }); location.hash = '#/'; invalidate(); break;
    }
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'search') {
    ui.search = ev.target.value;
    const pos = ev.target.selectionStart;
    invalidate();
    const next = el('search');
    if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    return;
  }
  if (ev.target.id === 'pollSeconds') {
    const v = Math.max(2, Math.min(Number(ev.target.value) || 5, 120));
    store.set({ pollSeconds: v });
    engine.start();
    return;
  }
  if (ev.target.id === 'serverUrl') store.set({ serverUrl: ev.target.value.trim() });
});

window.addEventListener('hashchange', async () => {
  ui.route = location.hash || '#/';
  ui.selectedBar = null;
  if (ui.route.startsWith('#/energy')) await refreshEnergy();
  if (ui.route.startsWith('#/settings')) ui.historyDays = await history.daysStored().catch(() => 0);
  if (ui.route.startsWith('#/setup')) ui.setupStep = 0;
  invalidate();
});

/* ------------------------------------------------------------------ boot */

async function refreshEnergy() {
  try {
    ui.energyReport = await history.report(ui.energyDays, store.get().devices);
  } catch { ui.energyReport = null; }
}

engine.onUpdate(async (extra) => {
  if (extra?.notice) {
    const d = store.device(extra.notice.deviceId);
    toast(`${d?.name || ''} — ${extra.notice.kind === 'overload' ? t('auto.overload') : t('auto.standby')}`,
      extra.notice.kind === 'overload' ? 'error' : 'ok');
  }
  render();
  if (ui.route.startsWith('#/energy')) { await refreshEnergy(); render(); }
});

async function boot() {
  store.load();
  const saved = store.get().lang;
  setLang(saved || initLang());

  if (!store.get().setupDone && store.get().devices.length === 0) location.hash = '#/setup';
  ui.route = location.hash || '#/';

  await refreshEnergy();
  invalidate();
  engine.start();

  history.prune().catch(() => {});
  setInterval(() => history.prune().catch(() => {}), 6 * 3600_000);
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

boot();
