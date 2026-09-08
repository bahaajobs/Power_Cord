/* Power Cord — web client.
 *
 * Local-first: it talks to the server on the LAN, or to the same server on a
 * VPS when you are away. There is no third-party cloud in the path, which is
 * the entire point of the project (see docs/00-executive-summary.md).
 *
 * The one rule that shapes this file: a toggle is never shown as done until
 * the device has confirmed it. Optimistic updates are reverted if no
 * confirmation arrives, because a user who believes a heater is off when it is
 * on is the failure mode this app exists to avoid.
 */

const CONFIRM_MS = 3500;

/* ------------------------------------------------------------------ icons */

const I = {
  chart: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 16V10M12 16V6M17 16v-4"/></svg>`,
  clock: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2" stroke-linecap="round"/></svg>`,
  bolt: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/></svg>`,
  power: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.6 6.8a8 8 0 1 0 10.8 0"/></svg>`,
  search: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l16 16"/><path d="M9.9 5.7A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4.1M6.5 7.9A16.6 16.6 0 0 0 2 12s3.6 6.5 10 6.5c1 0 1.9-.1 2.7-.4"/></svg>`,
  gear: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>`,
  socket: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="11" r="2.1"/><circle cx="15" cy="11" r="2.1"/></svg>`,
  usb: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20V7"/><circle cx="12" cy="4.5" r="1.8" fill="currentColor"/><path d="M12 14l4-3V8.5M12 16l-4-3v-2"/></svg>`,
  back: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  pencil: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20h4L20 8l-4-4L4 16z"/></svg>`,
  money: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v18M16 7.5c0-1.7-1.8-2.5-4-2.5s-4 .9-4 2.6c0 3.9 8 2 8 5.9 0 1.7-1.8 2.5-4 2.5s-4-.8-4-2.5"/></svg>`,
  trash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>`,
  warn: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>`,
  lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
};

/* ------------------------------------------------------------------ store */

const store = {
  token: localStorage.getItem('pc.token') || '',
  state: null,
  settings: null,
  energy: null,
  schedules: [],
  automations: [],
  route: location.hash || '#/',
  search: '',
  revealIds: new Set(),
  pending: new Map(),   // `${stripId}:${idx}` -> {want, timer}
  energyDays: 7,
  selectedBar: null,
  connected: false,
  ws: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* -------------------------------------------------------------------- api */

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(store.token ? { authorization: `Bearer ${store.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    signOut(false);
    throw new Error('Your session expired. Sign in again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  el('toasts').append(node);
  setTimeout(() => node.remove(), 4200);
}

/* --------------------------------------------------------------- realtime */

function openSocket() {
  if (!store.token) return;
  store.ws?.close();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(store.token)}`);
  store.ws = ws;

  ws.onopen = () => { store.connected = true; render(); };
  ws.onclose = () => {
    store.connected = false;
    render();
    // Reconnect with a fixed short delay: this is a LAN app and the common
    // case is the phone waking from sleep, not a flapping server.
    if (store.token) setTimeout(openSocket, 2500);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type !== 'state') return;

    if (msg.commandFailed) {
      const { stripId, channel, want } = msg.commandFailed;
      clearPending(stripId, channel);
      toast(`The strip did not confirm turning that outlet ${want ? 'on' : 'off'}.`, 'error');
    }
    store.state = msg;
    reconcilePending();
    render();
  };
}

/* ---------------------------------------------- optimistic toggle handling */

const pendKey = (stripId, idx) => `${stripId}:${idx}`;

function clearPending(stripId, idx) {
  const key = pendKey(stripId, idx);
  const p = store.pending.get(key);
  if (p) { clearTimeout(p.timer); store.pending.delete(key); }
}

/** Drop pending marks whose device state now matches what was asked for. */
function reconcilePending() {
  if (!store.state) return;
  for (const [key, p] of [...store.pending]) {
    const [sid, idx] = key.split(':').map(Number);
    const strip = store.state.strips.find((s) => s.id === sid);
    const outlet = strip?.outlets.find((o) => o.idx === idx);
    if (outlet && outlet.on === p.want) clearPending(sid, idx);
  }
}

async function toggleOutlet(stripId, idx, want) {
  const strip = store.state?.strips.find((s) => s.id === stripId);
  const outlet = strip?.outlets.find((o) => o.idx === idx);
  if (!outlet) return;
  if (outlet.locked) { toast(`${outlet.name} is locked.`); return; }

  clearPending(stripId, idx);
  outlet.on = want;                 // optimistic
  store.pending.set(pendKey(stripId, idx), {
    want,
    timer: setTimeout(() => {
      // No confirmation in time — put the switch back where it really is.
      store.pending.delete(pendKey(stripId, idx));
      refreshState().then(render);
      toast('No confirmation from the strip. Showing its actual state.', 'error');
    }, CONFIRM_MS),
  });
  render();

  try {
    await api('POST', `/api/strips/${stripId}/outlets/${idx}`, { on: want });
  } catch (err) {
    clearPending(stripId, idx);
    await refreshState();
    render();
    toast(err.message, 'error');
  }
}

async function setAll(stripId, on) {
  try {
    await api('POST', `/api/strips/${stripId}/all`, { on });
  } catch (err) { toast(err.message, 'error'); }
}

/* ------------------------------------------------------------------ loads */

async function refreshState() {
  try { store.state = await api('GET', '/api/state'); } catch { /* banner covers it */ }
}
async function refreshSettings() { store.settings = await api('GET', '/api/settings'); }
async function refreshEnergy() {
  store.energy = await api('GET', `/api/energy?days=${store.energyDays}`);
}
async function refreshSchedules() { store.schedules = await api('GET', '/api/schedules'); }
async function refreshAutomations() { store.automations = await api('GET', '/api/automations'); }

/* ------------------------------------------------------------------- auth */

async function signIn(username, password) {
  const res = await api('POST', '/api/auth/login', { username, password });
  store.token = res.token;
  localStorage.setItem('pc.token', res.token);
  await boot();
}

function signOut(callServer = true) {
  if (callServer) api('POST', '/api/auth/logout').catch(() => {});
  store.token = '';
  store.state = null;
  localStorage.removeItem('pc.token');
  store.ws?.close();
  store.ws = null;
  location.hash = '#/';
  render();
}

/* ------------------------------------------------------------------ views */

function view() {
  if (!store.token) return loginView();
  const r = store.route;
  if (r.startsWith('#/energy')) return energyView();
  if (r.startsWith('#/schedules')) return schedulesView();
  if (r.startsWith('#/automation')) return automationView();
  if (r.startsWith('#/strip/')) return stripSettingsView(Number(r.split('/')[2]));
  return homeView();
}

function loginView() {
  return `
  <div class="login-wrap">
    <div class="brand">
      <div class="mark">${I.bolt}</div>
      <h1>Power Cord</h1>
      <p>Sign in to your own server. Nothing here talks to a vendor cloud.</p>
    </div>
    <form class="card stack" id="loginForm">
      <label class="field"><span>Username</span>
        <input name="username" autocomplete="username" autocapitalize="none" required value="admin"></label>
      <label class="field"><span>Password</span>
        <input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn solid" type="submit">Sign in</button>
    </form>
  </div>`;
}

function offlineBanner() {
  if (!store.state) return '';
  const parts = [];
  if (!store.connected) parts.push('Not connected to the server — states may be out of date.');
  else if (store.state.mqtt && !store.state.mqtt.connected) parts.push('The server cannot reach the MQTT broker. Strips will not respond.');
  if (!parts.length) return '';
  return `<div class="banner">${I.warn}<span>${esc(parts[0])}</span></div>`;
}

function homeView() {
  const s = store.state;
  if (!s) return `<div class="empty"><p>Loading…</p></div>`;
  const t = s.totals;
  const q = store.search.trim().toLowerCase();
  const strips = q
    ? s.strips.filter((x) =>
        x.name.toLowerCase().includes(q) ||
        x.deviceId.toLowerCase().includes(q) ||
        (x.room || '').toLowerCase().includes(q) ||
        x.outlets.some((o) => o.name.toLowerCase().includes(q)))
    : s.strips;

  return `
  ${offlineBanner()}
  <div class="stack">
    <section class="card hero">
      <div class="hero-label">Total power right now</div>
      <div class="hero-value"><span>${fmt(t.watts)}</span><span class="unit">W</span></div>
      <div class="hero-facts">
        <span><b>${t.stripsOnline}</b> ${t.stripsOnline === 1 ? 'strip' : 'strips'} online</span>
        <span><b>${t.outletsOn}/${t.outletsTotal}</b> outlets on</span>
        <span><b>${t.plansActive}</b> ${t.plansActive === 1 ? 'plan' : 'plans'} active</span>
      </div>
    </section>

    <nav class="quick">
      <button data-go="#/energy"><span class="chip">${I.chart}</span><span class="label">Consumption</span></button>
      <button data-go="#/schedules"><span class="chip">${I.clock}</span><span class="label">Schedules</span></button>
      <button data-go="#/automation"><span class="chip">${I.bolt}</span><span class="label">Power automation</span></button>
      <button class="danger" data-action="all-off"><span class="chip">${I.power}</span><span class="label">All off</span></button>
    </nav>

    <div class="search">${I.search}
      <input id="search" placeholder="Search strips and outlets" value="${esc(store.search)}" autocapitalize="none">
    </div>

    ${strips.length === 0 ? emptyStrips(q) : strips.map(stripCard).join('')}
  </div>
  <button class="fab" data-action="add-strip">${I.plus} Add strip</button>`;
}

function emptyStrips(q) {
  if (q) return `<div class="card empty"><p>Nothing matches “${esc(q)}”.</p></div>`;
  return `<div class="card empty">${I.socket}
    <p>No strips yet. A flashed strip that connects to your broker appears here on
    its own; otherwise add it by its MQTT topic prefix.</p></div>`;
}

function stripCard(s) {
  const revealed = store.revealIds.has(s.id);
  const idText = revealed ? s.deviceId : s.deviceIdMasked;
  const plan = s.planExpires
    ? `Plan ends ${new Date(s.planExpires).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : (s.room ? esc(s.room) : 'Local control · no plan');
  return `
  <section class="card" data-strip="${s.id}">
    <div class="strip-head">
      <span class="dot ${s.online ? 'on' : ''}"></span>
      <span class="strip-id" title="${esc(s.name)}">${esc(idText)}</span>
      <button class="icon-btn" data-action="reveal" data-id="${s.id}"
        aria-label="${revealed ? 'Hide' : 'Show'} full device id">${revealed ? I.eyeOff : I.eye}</button>
      <span class="pill ${s.online ? '' : 'off'}">${s.online ? 'ONLINE' : 'OFFLINE'}</span>
      <span style="flex:1"></span>
      <button class="icon-btn" data-go="#/strip/${s.id}" aria-label="Strip settings">${I.gear}</button>
    </div>
    <div class="strip-meta">
      <span>${plan}</span>
      <span class="watts ${s.watts > 0 ? '' : 'zero'}">${s.hasMetering ? `${fmt(s.watts)} W` : 'no meter'}</span>
    </div>
    <div class="outlets">
      ${s.outlets.filter((o) => !o.isUsb).map((o) => outletTile(s, o)).join('')}
    </div>
    ${s.hasUsb ? usbRow(s) : ''}
    <div class="row-2">
      <button class="btn primary" data-action="all-on" data-id="${s.id}" ${s.online ? '' : 'disabled'}>Turn all on</button>
      <button class="btn" data-action="all-off-strip" data-id="${s.id}" ${s.online ? '' : 'disabled'}>Turn all off</button>
    </div>
  </section>`;
}

function outletTile(s, o) {
  const pending = store.pending.has(pendKey(s.id, o.idx));
  return `
  <button class="outlet ${o.on ? 'on' : ''} ${pending ? 'pending' : ''} ${o.locked ? 'locked' : ''}"
    data-action="toggle" data-id="${s.id}" data-idx="${o.idx}"
    aria-pressed="${o.on}" ${s.online ? '' : 'disabled'}>
    <span class="glyph">${o.icon === 'usb' ? I.usb : I.socket}</span>
    <span class="nm">${esc(o.name)}${o.locked ? ` ${I.lock}` : ''}</span>
    <span class="st">${pending ? 'SWITCHING…' : o.on ? 'ON' : 'OFF'}</span>
  </button>`;
}

function usbRow(s) {
  const usb = s.outlets.find((o) => o.isUsb);
  if (!usb) return '';
  const pending = store.pending.has(pendKey(s.id, usb.idx));
  return `
  <div class="list-item" style="margin-top:14px;border-top:1px solid var(--line-soft);border-bottom:0;padding-bottom:0">
    <div><div class="t">${esc(usb.name)}</div>
      <div class="s">${pending ? 'switching…' : usb.on ? 'powered' : 'off'}</div></div>
    <button class="switch" role="switch" aria-checked="${usb.on}"
      data-action="toggle" data-id="${s.id}" data-idx="${usb.idx}"
      aria-label="${esc(usb.name)}" ${s.online ? '' : 'disabled'}></button>
  </div>`;
}

/* ----------------------------------------------------------------- energy */

function energyView() {
  const e = store.energy;
  const title = 'All strips';
  if (!e) return topbar('Energy', title, true) + `<div class="empty"><p>Loading…</p></div>`;
  const cur = e.currency || '';

  return `
  ${topbar('Energy', title, true, `<button class="sq" data-action="tariff" aria-label="Tariff settings">${I.money}</button>`)}
  <div class="stack">
    <div class="segments" role="tablist">
      ${[7, 30, 90].map((d) => `
        <button role="tab" aria-selected="${store.energyDays === d}" data-action="range" data-days="${d}">${d} days</button>`).join('')}
    </div>

    <section class="card hero">
      <div class="two-up">
        <div>
          <div class="stat-label">Total used</div>
          <div class="stat-value green">${e.totalKwh.toFixed(2)}<span class="unit">kWh</span></div>
        </div>
        <div>
          <div class="stat-label">Estimated cost</div>
          <div class="stat-value">${e.estimatedCost.toFixed(2)}</div>
        </div>
      </div>
      <div class="tariff-line">
        <span>Tariff</span>
        <button data-action="tariff">${e.tariffMode === 'brackets'
          ? 'brackets' : `${e.tariffFlat} ${esc(cur)}/kWh`} ${I.pencil}</button>
      </div>
    </section>

    <section class="card">
      <div class="chart-head"><h2>Daily usage</h2><span class="mono dim">kWh / day</span></div>
      <p class="chart-hint">${store.selectedBar
        ? `${store.selectedBar.day} — ${store.selectedBar.kwh.toFixed(3)} kWh`
        : 'Tap a bar for details'}</p>
      <div class="chart-wrap">${barChart(e)}</div>
    </section>

    <section class="card">
      <div class="chart-head"><h2>By strip</h2><span class="mono dim">last ${e.days} days</span></div>
      ${e.byStrip.length === 0 ? '<div class="empty"><p>No strips yet.</p></div>'
        : e.byStrip.map((r) => `
        <div class="bystrip-row">
          <span class="chip">${I.socket}</span>
          <div style="min-width:0">
            <div class="nm">${esc(r.deviceId)}</div>
            <div class="meter"><i style="width:${r.share}%"></i></div>
          </div>
          <div style="text-align:right">
            <div class="kwh">${r.kwh.toFixed(2)} kWh</div>
            <div class="share">${r.share}%</div>
          </div>
        </div>`).join('')}
    </section>

    <p class="dim" style="font-size:13.5px;padding:0 4px">
      The meter in these strips sits upstream of all four relays, so this is the
      whole strip, never a single outlet. Cost is an estimate for what is
      plugged in here — not your household bill.
    </p>
  </div>`;
}

/**
 * The chart draws to one scale: bar heights, the average line and every label
 * come from the same max, so a bar's height always means what the axis says.
 */
function barChart(e) {
  const data = e.series;
  if (!data.some((d) => d.kwh > 0)) {
    return `<div class="empty"><p>No energy recorded in the last ${e.days} days.<br>
      Strips without a metering chip never record any.</p></div>`;
  }
  const W = 640, H = 260, padL = 8, padR = 8, padT = 26, padB = 30;
  const max = Math.max(...data.map((d) => d.kwh), 0.001);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / data.length;
  const bw = Math.max(6, Math.min(slot * 0.62, 56));
  const avg = e.average || 0;
  const avgY = padT + innerH - (avg / max) * innerH;

  // Label every Nth date so they never collide at 30 and 90 days.
  const step = data.length <= 8 ? 1 : data.length <= 31 ? 5 : 15;

  const bars = data.map((d, i) => {
    const h = d.kwh > 0 ? Math.max(3, (d.kwh / max) * innerH) : 0;
    const x = padL + i * slot + (slot - bw) / 2;
    const y = padT + innerH - h;
    const sel = store.selectedBar?.day === d.day;
    if (h === 0) return '';
    return `<rect class="bar ${sel ? 'sel' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
      width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5"
      data-action="bar" data-day="${d.day}" data-kwh="${d.kwh}"><title>${d.day}: ${d.kwh.toFixed(3)} kWh</title></rect>`;
  }).join('');

  const labels = data.map((d, i) => {
    if (i % step !== 0 && i !== data.length - 1) return '';
    const x = padL + i * slot + slot / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 9}" text-anchor="middle">${d.day.slice(5)}</text>`;
  }).join('');

  return `
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Daily energy use, ${data.length} days, peak ${max.toFixed(2)} kilowatt hours">
    <defs>
      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4BE88C"/><stop offset="100%" stop-color="#1F8E55"/>
      </linearGradient>
    </defs>
    ${bars}
    ${avg > 0 ? avgLine(avg, avgY, padL, padR, W) : ''}
    ${labels}
  </svg>`;
}

/**
 * The average marker sits on a small plate in the card colour, so it stays
 * readable when a tall bar happens to run underneath it.
 */
function avgLine(avg, y, padL, padR, W) {
  const label = `avg ${avg.toFixed(2)}`;
  const w = label.length * 6.4 + 10;
  const x = W - padR - w;
  return `
    <line class="avg" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>
    <rect x="${x.toFixed(1)}" y="${(y - 20).toFixed(1)}" width="${w.toFixed(1)}" height="15"
      rx="4" fill="var(--card)" opacity="0.92"/>
    <text class="avg-label" x="${(W - padR - 5).toFixed(1)}" y="${(y - 9).toFixed(1)}"
      text-anchor="end">${label}</text>`;
}

/* -------------------------------------------------------------- schedules */

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function schedulesView() {
  const list = store.schedules;
  return `
  ${topbar('Timers', 'Schedules', true)}
  <div class="stack">
    <p class="dim" style="font-size:14px;padding:0 4px">
      These run on your server, so they fire whether or not your phone is awake.
      They do not fire while the server is down.
    </p>
    <section class="card">
      ${list.length === 0 ? `<div class="empty">${I.clock}<p>No schedules yet.</p></div>`
        : list.map(scheduleRow).join('')}
    </section>
    <button class="btn solid" data-action="add-schedule">Add a schedule</button>
  </div>`;
}

function scheduleRow(s) {
  const strip = store.state?.strips.find((x) => x.id === s.stripId);
  const target = s.outletIdx == null
    ? 'all outlets'
    : (strip?.outlets.find((o) => o.idx === s.outletIdx)?.name || `outlet ${s.outletIdx}`);
  const when = s.kind === 'countdown'
    ? (s.fireAt > Date.now() ? `in ${Math.max(1, Math.round((s.fireAt - Date.now()) / 60000))} min` : 'fired')
    : `${s.atTime} · ${DAYS.map((d, i) => (s.weekdayMask & (1 << i)) ? d : '·').join('')}`;
  return `
  <div class="list-item">
    <div>
      <div class="t">${esc(strip?.name || 'strip')} — ${esc(target)} ${s.action ? 'on' : 'off'}</div>
      <div class="s">${esc(when)}${s.enabled ? '' : ' · disabled'}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="switch" role="switch" aria-checked="${s.enabled}"
        data-action="toggle-schedule" data-id="${s.id}" aria-label="Enable schedule"></button>
      <button class="icon-btn" data-action="del-schedule" data-id="${s.id}" aria-label="Delete">${I.trash}</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------- automation */

function automationView() {
  const list = store.automations;
  return `
  ${topbar('Rules', 'Power automation', true)}
  <div class="stack">
    <p class="dim" style="font-size:14px;padding:0 4px">
      Rules that watch the meter. They need a strip that actually has a metering
      chip — strips without one never trigger them.
    </p>
    <section class="card">
      ${list.length === 0 ? `<div class="empty">${I.bolt}<p>No rules yet.</p></div>`
        : list.map(automationRow).join('')}
    </section>
    <button class="btn solid" data-action="add-automation">Add a rule</button>
  </div>`;
}

function automationRow(a) {
  const strip = store.state?.strips.find((x) => x.id === a.stripId);
  const desc = a.kind === 'standby'
    ? `Cut when under ${a.thresholdW} W for ${Math.round(a.durationS / 60)} min`
    : `Alarm over ${a.thresholdW} W${a.cut ? ' and cut' : ''}`;
  const warn = strip && !strip.hasMetering ? ' · this strip has no meter' : '';
  return `
  <div class="list-item">
    <div>
      <div class="t">${esc(strip?.name || 'strip')} — ${a.kind === 'standby' ? 'Standby cutoff' : 'Overload'}</div>
      <div class="s">${esc(desc)}${warn}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="switch" role="switch" aria-checked="${a.enabled}"
        data-action="toggle-automation" data-id="${a.id}" aria-label="Enable rule"></button>
      <button class="icon-btn" data-action="del-automation" data-id="${a.id}" aria-label="Delete">${I.trash}</button>
    </div>
  </div>`;
}

/* -------------------------------------------------------- strip settings */

function stripSettingsView(id) {
  const s = store.state?.strips.find((x) => x.id === id);
  if (!s) return topbar('Strip', 'Not found', true) + `<div class="empty"><p>That strip is gone.</p></div>`;
  return `
  ${topbar('Strip', esc(s.name), true)}
  <div class="stack">
    <section class="card">
      <div class="list-item"><div><div class="t">Device id</div>
        <div class="s">${esc(s.deviceId)}</div></div></div>
      <div class="list-item"><div><div class="t">MQTT prefix</div>
        <div class="s">${esc(s.topicPrefix)}</div></div></div>
      <div class="list-item"><div><div class="t">Address</div>
        <div class="s">${esc(s.ip || 'unknown')}${s.rssi ? ` · ${s.rssi} dBm` : ''}</div></div></div>
      <div class="list-item"><div><div class="t">Metering</div>
        <div class="s">${s.hasMetering ? 'reporting' : 'none detected'}</div></div></div>
      <div class="list-item"><div><div class="t">Last seen</div>
        <div class="s">${s.lastSeen ? new Date(s.lastSeen).toLocaleString() : 'never'}</div></div></div>
    </section>

    <section class="card">
      <h2 style="margin:0 0 12px;font-size:19px">Outlets</h2>
      ${s.outlets.map((o) => `
        <div class="list-item">
          <div><div class="t">${esc(o.name)}</div>
            <div class="s">channel ${o.idx}${o.isUsb ? ' · USB rail' : ''}${o.locked ? ' · locked' : ''}</div></div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="icon-btn" data-action="rename-outlet" data-id="${s.id}" data-idx="${o.idx}"
              aria-label="Rename">${I.pencil}</button>
            <button class="switch" role="switch" aria-checked="${o.locked}"
              data-action="lock-outlet" data-id="${s.id}" data-idx="${o.idx}"
              aria-label="Lock ${esc(o.name)}"></button>
          </div>
        </div>`).join('')}
      <p class="dim" style="font-size:13px;margin:12px 0 0">
        Locking blocks this app from switching an outlet — useful for the one
        feeding your router. It does not disable the button on the strip.
      </p>
    </section>

    <button class="btn" data-action="rename-strip" data-id="${s.id}">Rename strip</button>
    <button class="btn" data-action="set-plan" data-id="${s.id}">Set plan expiry</button>
    <button class="btn danger" data-action="remove-strip" data-id="${s.id}">Remove strip</button>
  </div>`;
}

function topbar(eyebrow, title, back, right = '') {
  return `
  <div class="topbar">
    ${back ? `<button class="sq" data-action="back" aria-label="Back">${I.back}</button>` : '<span></span>'}
    <div class="titles">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${title}</h1>
    </div>
    ${right || '<span></span>'}
  </div>`;
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1));

/* ----------------------------------------------------------------- sheets */

function sheet(html) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.append(bg);
  const focusable = bg.querySelector('input, select, button');
  focusable?.focus();
  return bg;
}

function addStripSheet() {
  const bg = sheet(`
    <h2>Add a strip</h2>
    <p class="sub">A flashed strip that reaches your broker registers itself. Add
      one manually when you know its MQTT topic prefix but it has not spoken yet.</p>
    <form id="addStrip">
      <label class="field"><span>Device id (from the rating plate)</span>
        <input name="deviceId" required placeholder="88D039B2588D" autocapitalize="characters"></label>
      <label class="field"><span>MQTT topic prefix (blank = same as device id)</span>
        <input name="topicPrefix" placeholder="88D039B2588D" autocapitalize="none"></label>
      <label class="field"><span>Name</span>
        <input name="name" placeholder="Living room strip"></label>
      <label class="field"><span>Switchable outlets</span>
        <select name="outletCount"><option>4</option><option>2</option><option>3</option>
          <option>5</option><option>6</option><option>8</option></select></label>
      <label class="field inline"><span>Has a switchable USB rail</span>
        <input type="checkbox" name="hasUsb" checked style="width:auto"></label>
      <button class="btn solid" type="submit" style="width:100%">Add strip</button>
    </form>`);

  $('#addStrip', bg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('POST', '/api/strips', {
        deviceId: String(f.get('deviceId')).trim(),
        topicPrefix: String(f.get('topicPrefix')).trim() || undefined,
        name: String(f.get('name')).trim() || undefined,
        outletCount: Number(f.get('outletCount')),
        hasUsb: f.get('hasUsb') === 'on',
      });
      bg.remove();
      await refreshState();
      render();
      toast('Strip added.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function tariffSheet() {
  const s = store.settings;
  if (!s) return;
  const brackets = s.tariff_brackets || [];
  const bg = sheet(`
    <h2>Tariff</h2>
    <p class="sub">Egyptian residential supply is billed in rising brackets, so
      the rate depends on your household's monthly total. Enter that from your
      bill to get the marginal bracket right. Rates change — these are editable
      on purpose.</p>
    <form id="tariffForm">
      <label class="field"><span>Currency</span>
        <input name="currency" value="${esc(s.currency)}"></label>
      <label class="field"><span>Mode</span>
        <select name="tariff_mode">
          <option value="flat" ${s.tariff_mode === 'flat' ? 'selected' : ''}>Single rate</option>
          <option value="brackets" ${s.tariff_mode === 'brackets' ? 'selected' : ''}>Rising brackets</option>
        </select></label>
      <label class="field"><span>Single rate per kWh</span>
        <input name="tariff_flat" type="number" step="0.01" value="${esc(s.tariff_flat)}"></label>
      <label class="field"><span>Household use so far this month (kWh, from your bill)</span>
        <input name="household_mtd_kwh" type="number" step="1" value="${esc(s.household_mtd_kwh)}"></label>
      <div class="field"><span>Brackets (kWh up to → rate). Blank upper limit = top bracket.</span>
        <div id="brackets">${brackets.map((b, i) => `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <input data-b="upTo" data-i="${i}" type="number" placeholder="no limit" value="${b.upTo ?? ''}">
            <input data-b="rate" data-i="${i}" type="number" step="0.01" value="${b.rate}">
          </div>`).join('')}</div>
      </div>
      <button class="btn solid" type="submit" style="width:100%">Save</button>
    </form>`);

  $('#tariffForm', bg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const next = brackets.map((b) => ({ ...b }));
    for (const input of bg.querySelectorAll('#brackets input')) {
      const i = Number(input.dataset.i);
      if (input.dataset.b === 'upTo') next[i].upTo = input.value === '' ? null : Number(input.value);
      else next[i].rate = Number(input.value);
    }
    try {
      await api('PATCH', '/api/settings', {
        currency: f.get('currency'),
        tariff_mode: f.get('tariff_mode'),
        tariff_flat: f.get('tariff_flat'),
        household_mtd_kwh: f.get('household_mtd_kwh'),
        tariff_brackets: next,
      });
      bg.remove();
      await Promise.all([refreshSettings(), refreshEnergy()]);
      render();
      toast('Tariff saved.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function scheduleSheet() {
  const strips = store.state?.strips || [];
  if (!strips.length) { toast('Add a strip first.'); return; }
  let mask = 127;
  const bg = sheet(`
    <h2>New schedule</h2>
    <p class="sub">Runs on the server. Countdown timers are one-shot.</p>
    <form id="schedForm">
      <label class="field"><span>Strip</span>
        <select name="stripId">${strips.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Target</span>
        <select name="outletIdx"><option value="">All outlets</option>
          ${strips[0].outlets.map((o) => `<option value="${o.idx}">${esc(o.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Type</span>
        <select name="kind"><option value="weekly">Weekly</option><option value="countdown">Countdown</option></select></label>
      <label class="field" id="timeField"><span>Time</span>
        <input name="atTime" type="time" value="19:00"></label>
      <label class="field hidden" id="minsField"><span>Minutes from now</span>
        <input name="minutes" type="number" value="30" min="1"></label>
      <div class="field" id="daysField"><span>Days</span>
        <div class="weekdays">${DAYS.map((d, i) => `
          <button type="button" data-day="${i}" aria-pressed="true">${d}</button>`).join('')}</div></div>
      <label class="field"><span>Action</span>
        <select name="action"><option value="0">Turn off</option><option value="1">Turn on</option></select></label>
      <button class="btn solid" type="submit" style="width:100%">Create</button>
    </form>`);

  const form = $('#schedForm', bg);
  form.stripId.addEventListener('change', () => {
    const s = strips.find((x) => x.id === Number(form.stripId.value));
    form.outletIdx.innerHTML = `<option value="">All outlets</option>` +
      s.outlets.map((o) => `<option value="${o.idx}">${esc(o.name)}</option>`).join('');
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
      const now = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!now));
      mask = now ? mask & ~(1 << i) : mask | (1 << i);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const kind = f.get('kind');
    const payload = {
      stripId: Number(f.get('stripId')),
      outletIdx: f.get('outletIdx') === '' ? null : Number(f.get('outletIdx')),
      kind,
      action: f.get('action') === '1',
    };
    if (kind === 'weekly') {
      if (mask === 0) { toast('Pick at least one day.', 'error'); return; }
      payload.atTime = f.get('atTime');
      payload.weekdayMask = mask;
    } else {
      payload.fireAt = Date.now() + Number(f.get('minutes')) * 60_000;
    }
    try {
      await api('POST', '/api/schedules', payload);
      bg.remove();
      await refreshSchedules();
      render();
      toast('Schedule created.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function automationSheet() {
  const strips = store.state?.strips || [];
  if (!strips.length) { toast('Add a strip first.'); return; }
  const bg = sheet(`
    <h2>New rule</h2>
    <p class="sub">Standby cutoff switches a strip off once it has been idle long
      enough. Overload reacts immediately — that is the point of it.</p>
    <form id="autoForm">
      <label class="field"><span>Strip</span>
        <select name="stripId">${strips.map((s) => `
          <option value="${s.id}">${esc(s.name)}${s.hasMetering ? '' : ' (no meter)'}</option>`).join('')}</select></label>
      <label class="field"><span>Rule</span>
        <select name="kind"><option value="standby">Standby cutoff</option>
          <option value="overload">Overload</option></select></label>
      <label class="field"><span>Threshold (W)</span>
        <input name="thresholdW" type="number" value="8" min="1" step="1"></label>
      <label class="field" id="durField"><span>Idle for (minutes)</span>
        <input name="minutes" type="number" value="10" min="1"></label>
      <label class="field inline"><span>Also switch the strip off</span>
        <input type="checkbox" name="cut" checked style="width:auto"></label>
      <button class="btn solid" type="submit" style="width:100%">Create</button>
    </form>`);

  const form = $('#autoForm', bg);
  form.kind.addEventListener('change', () => {
    const standby = form.kind.value === 'standby';
    $('#durField', bg).classList.toggle('hidden', !standby);
    form.thresholdW.value = standby ? '8' : '3000';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      await api('POST', '/api/automations', {
        stripId: Number(f.get('stripId')),
        kind: f.get('kind'),
        thresholdW: Number(f.get('thresholdW')),
        durationS: Number(f.get('minutes') || 10) * 60,
        cut: f.get('cut') === 'on',
      });
      bg.remove();
      await refreshAutomations();
      render();
      toast('Rule created.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function promptSheet({ title, sub, label, value, type = 'text' }, onSave) {
  const bg = sheet(`
    <h2>${esc(title)}</h2>
    ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
    <form id="promptForm">
      <label class="field"><span>${esc(label)}</span>
        <input name="value" type="${type}" value="${esc(value ?? '')}" required></label>
      <button class="btn solid" type="submit" style="width:100%">Save</button>
    </form>`);
  $('#promptForm', bg).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await onSave(new FormData(e.target).get('value'));
      bg.remove();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function confirmSheet({ title, sub, confirmLabel, danger }, onYes) {
  const bg = sheet(`
    <h2>${esc(title)}</h2>
    <p class="sub">${esc(sub)}</p>
    <div class="row-2">
      <button class="btn" data-no>Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(confirmLabel)}</button>
    </div>`);
  bg.querySelector('[data-no]').addEventListener('click', () => bg.remove());
  bg.querySelector('[data-yes]').addEventListener('click', async () => {
    bg.remove();
    try { await onYes(); } catch (err) { toast(err.message, 'error'); }
  });
}

/* ----------------------------------------------------------------- events */

document.addEventListener('click', async (ev) => {
  const target = ev.target.closest('[data-action], [data-go]');
  if (!target) return;

  if (target.dataset.go) { location.hash = target.dataset.go; return; }
  const id = Number(target.dataset.id);
  const idx = Number(target.dataset.idx);

  switch (target.dataset.action) {
    case 'back': history.length > 1 ? history.back() : (location.hash = '#/'); break;

    case 'toggle': {
      const strip = store.state.strips.find((s) => s.id === id);
      const outlet = strip?.outlets.find((o) => o.idx === idx);
      if (outlet) toggleOutlet(id, idx, !outlet.on);
      break;
    }
    case 'all-on': setAll(id, true); break;
    case 'all-off-strip': setAll(id, false); break;

    case 'all-off':
      confirmSheet({
        title: 'Switch everything off?',
        sub: 'Every outlet on every strip, including anything you may be relying on right now.',
        confirmLabel: 'Switch all off', danger: true,
      }, async () => { await api('POST', '/api/all-off'); toast('All outlets switched off.', 'ok'); });
      break;

    case 'reveal':
      store.revealIds.has(id) ? store.revealIds.delete(id) : store.revealIds.add(id);
      render();
      break;

    case 'add-strip': addStripSheet(); break;
    case 'tariff': tariffSheet(); break;
    case 'add-schedule': scheduleSheet(); break;
    case 'add-automation': automationSheet(); break;

    case 'range':
      store.energyDays = Number(target.dataset.days);
      store.selectedBar = null;
      await refreshEnergy();
      render();
      break;

    case 'bar':
      store.selectedBar = { day: target.dataset.day, kwh: Number(target.dataset.kwh) };
      render();
      break;

    case 'toggle-schedule': {
      const s = store.schedules.find((x) => x.id === id);
      await api('PATCH', `/api/schedules/${id}`, { enabled: !s.enabled });
      await refreshSchedules(); render();
      break;
    }
    case 'del-schedule':
      await api('DELETE', `/api/schedules/${id}`);
      await refreshSchedules(); render();
      break;

    case 'toggle-automation': {
      const a = store.automations.find((x) => x.id === id);
      await api('PATCH', `/api/automations/${id}`, { enabled: !a.enabled });
      await refreshAutomations(); render();
      break;
    }
    case 'del-automation':
      await api('DELETE', `/api/automations/${id}`);
      await refreshAutomations(); render();
      break;

    case 'rename-strip': {
      const s = store.state.strips.find((x) => x.id === id);
      promptSheet({ title: 'Rename strip', label: 'Name', value: s.name }, async (v) => {
        await api('PATCH', `/api/strips/${id}`, { name: String(v).trim() });
        await refreshState(); render();
      });
      break;
    }
    case 'set-plan': {
      const s = store.state.strips.find((x) => x.id === id);
      const cur = s.planExpires ? new Date(s.planExpires).toISOString().slice(0, 10) : '';
      promptSheet({
        title: 'Plan expiry',
        sub: 'Optional. Shown on the strip card — useful for tracking a warranty or a service period.',
        label: 'Date', value: cur, type: 'date',
      }, async (v) => {
        await api('PATCH', `/api/strips/${id}`, { planExpires: v ? new Date(v).getTime() : null });
        await refreshState(); render();
      });
      break;
    }
    case 'remove-strip': {
      const s = store.state.strips.find((x) => x.id === id);
      confirmSheet({
        title: `Remove ${s.name}?`,
        sub: 'Its history is deleted too. The strip itself keeps working from its buttons and will re-register if it reconnects.',
        confirmLabel: 'Remove', danger: true,
      }, async () => {
        await api('DELETE', `/api/strips/${id}`);
        location.hash = '#/';
        await refreshState(); render();
      });
      break;
    }
    case 'rename-outlet': {
      const s = store.state.strips.find((x) => x.id === id);
      const o = s.outlets.find((x) => x.idx === idx);
      promptSheet({
        title: 'Rename outlet',
        sub: 'Name it after what is plugged in — that is how people find it.',
        label: 'Name', value: o.name,
      }, async (v) => {
        await api('PATCH', `/api/strips/${id}/outlets/${idx}`, { name: String(v).trim() });
        await refreshState(); render();
      });
      break;
    }
    case 'lock-outlet': {
      const s = store.state.strips.find((x) => x.id === id);
      const o = s.outlets.find((x) => x.idx === idx);
      await api('PATCH', `/api/strips/${id}/outlets/${idx}`, { locked: !o.locked });
      await refreshState(); render();
      break;
    }
    case 'sign-out': signOut(); break;
  }
});

document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'loginForm') return;
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    await signIn(String(f.get('username')), String(f.get('password')));
  } catch (err) { toast(err.message, 'error'); }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'search') return;
  store.search = ev.target.value;
  // Re-render without stealing focus from the field the user is typing in.
  const pos = ev.target.selectionStart;
  lastHtml = '';
  render();
  const next = el('search');
  if (next) { next.focus(); next.setSelectionRange(pos, pos); }
});

window.addEventListener('hashchange', async () => {
  store.route = location.hash || '#/';
  store.selectedBar = null;
  if (store.route.startsWith('#/energy')) { await refreshSettings(); await refreshEnergy(); }
  if (store.route.startsWith('#/schedules')) await refreshSchedules();
  if (store.route.startsWith('#/automation')) await refreshAutomations();
  render();
});

/* ------------------------------------------------------------------ boot */

let lastHtml = '';
let touching = false;
let renderQueued = false;

/**
 * Replacing #app on every telemetry push destroys the DOM a few times a minute.
 * On a phone that loses taps and jumps the scroll position, so: skip the write
 * when nothing changed, hold it while a finger is down, and put the scroll back
 * afterwards.
 */
function render() {
  if (touching) { renderQueued = true; return; }
  const html = view();
  if (html === lastHtml) return;
  lastHtml = html;
  const y = window.scrollY;
  el('app').innerHTML = html;
  if (window.scrollY !== y) window.scrollTo(0, y);
}

for (const ev of ['pointerdown', 'touchstart']) {
  document.addEventListener(ev, () => { touching = true; }, { passive: true });
}
for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) {
  document.addEventListener(ev, () => {
    touching = false;
    if (renderQueued) { renderQueued = false; setTimeout(render, 0); }
  }, { passive: true });
}

async function boot() {
  if (!store.token) { render(); return; }
  try {
    await refreshState();
    await refreshSettings();
    openSocket();
  } catch (err) {
    toast(err.message, 'error');
  }
  render();
  if (store.route.startsWith('#/energy')) { await refreshEnergy(); render(); }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

boot();
