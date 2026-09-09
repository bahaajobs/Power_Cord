/* Everything the app remembers, kept on the phone.
 *
 * Devices, per-outlet names, schedules, rules and tariff all live here. In
 * direct mode this is the only database there is — losing it loses your setup,
 * which is why `exportAll` exists. */

const KEY = 'pc.state.v1';

const DEFAULTS = {
  lang: 'en',
  mode: 'direct',                 // 'direct' | 'server'
  serverUrl: '',
  serverToken: '',
  pollSeconds: 5,
  maskDeviceIds: true,
  setupDone: false,
  currency: 'EGP',
  tariffMode: 'flat',
  tariffFlat: 1.5,
  householdMtdKwh: 0,
  tariffBrackets: [
    { upTo: 50, rate: 0.68 }, { upTo: 100, rate: 0.95 }, { upTo: 200, rate: 1.15 },
    { upTo: 350, rate: 1.72 }, { upTo: 650, rate: 2.18 }, { upTo: 1000, rate: 2.40 },
    { upTo: null, rate: 2.74 },
  ],
  devices: [],
  schedules: [],
  automations: [],
};

let state = structuredClone(DEFAULTS);
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
  } catch { /* corrupt or unavailable — defaults stand */ }
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  for (const fn of listeners) fn(state);
}

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const get = () => state;

export function set(patch) { Object.assign(state, patch); save(); }

/* ---------------------------------------------------------------- devices */

const uid = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * There is no cap on how many strips you can add. Polling is per-device and
 * runs concurrently, so the practical limit is your Wi-Fi, not the app.
 */
export function addDevice(d) {
  // Anything unusable falls back to four, the common case, rather than to
  // whatever `|| 4` happens to do with a zero.
  const requested = Number(d.outletCount);
  const outletCount = Number.isFinite(requested) && requested >= 1
    ? Math.min(Math.floor(requested), 12)
    : 4;
  const device = {
    id: uid(),
    name: d.name || d.lanHost || 'Strip',
    deviceId: d.deviceId || '',
    lanHost: d.lanHost || '',
    remoteHost: d.remoteHost || '',
    user: d.user || '',
    pass: d.pass || '',
    outletCount,
    hasUsb: d.hasUsb !== false,
    usbChannel: Number(d.usbChannel) || outletCount + 1,
    planExpires: d.planExpires || null,
    room: d.room || '',
    // Default names are left empty on purpose: they are rendered from the
    // string catalogue, so they follow the interface language. A name the
    // user typed is stored and never translated.
    outlets: Array.from({ length: outletCount }, (_, i) => ({
      idx: i + 1, name: '', locked: false,
    })),
    lastGood: null,
    createdAt: Date.now(),
  };
  if (device.hasUsb) device.outlets.push({ idx: device.usbChannel, name: '', locked: false, isUsb: true });
  state.devices.push(device);
  save();
  return device;
}

export const device = (id) => state.devices.find((d) => d.id === id) || null;

export function updateDevice(id, patch) {
  const d = device(id);
  if (!d) return null;
  Object.assign(d, patch);
  save();
  return d;
}

export function updateOutlet(deviceId, idx, patch) {
  const d = device(deviceId);
  const o = d?.outlets.find((x) => x.idx === Number(idx));
  if (o) { Object.assign(o, patch); save(); }
  return o;
}

export function removeDevice(id) {
  state.devices = state.devices.filter((d) => d.id !== id);
  state.schedules = state.schedules.filter((s) => s.deviceId !== id);
  state.automations = state.automations.filter((a) => a.deviceId !== id);
  save();
}

/* ------------------------------------------------- schedules & automations */

export function addSchedule(s) {
  const item = { id: uid(), enabled: true, createdAt: Date.now(), lastFired: 0, ...s };
  state.schedules.push(item); save(); return item;
}
export function updateSchedule(id, patch) {
  const s = state.schedules.find((x) => x.id === id);
  if (s) { Object.assign(s, patch); save(); }
  return s;
}
export function removeSchedule(id) {
  state.schedules = state.schedules.filter((s) => s.id !== id); save();
}

export function addAutomation(a) {
  const item = { id: uid(), enabled: true, since: 0, createdAt: Date.now(), ...a };
  state.automations.push(item); save(); return item;
}
export function updateAutomation(id, patch) {
  const a = state.automations.find((x) => x.id === id);
  if (a) { Object.assign(a, patch); save(); }
  return a;
}
export function removeAutomation(id) {
  state.automations = state.automations.filter((a) => a.id !== id); save();
}

/* ------------------------------------------------------------------ cost */

/**
 * Egyptian residential supply is billed in rising brackets, so the marginal
 * rate depends on the household's month-to-date total — a single price per
 * kWh is wrong by construction. The table is editable because published rates
 * are revised roughly annually.
 */
export function estimateCost(kwh) {
  if (state.tariffMode !== 'brackets') return kwh * Number(state.tariffFlat || 0);
  const brackets = Array.isArray(state.tariffBrackets) ? state.tariffBrackets : [];
  if (brackets.length === 0) return kwh * Number(state.tariffFlat || 0);

  let position = Number(state.householdMtdKwh || 0);
  let remaining = kwh;
  let cost = 0;
  for (const b of brackets) {
    if (remaining <= 0) break;
    const ceiling = b.upTo == null ? Infinity : Number(b.upTo);
    if (position >= ceiling) continue;
    const take = Math.min(remaining, ceiling - position);
    cost += take * Number(b.rate || 0);
    position += take;
    remaining -= take;
  }
  if (remaining > 0) cost += remaining * Number(brackets.at(-1).rate || 0);
  return cost;
}

export function exportAll() {
  return { exportedAt: new Date().toISOString(), state };
}
