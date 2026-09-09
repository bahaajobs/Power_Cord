/* The runtime: polls every strip, folds readings into history, and runs
 * schedules and rules.
 *
 * In direct mode there is no server, so this is where the work happens — which
 * has one honest consequence: a schedule only fires while the app is running.
 * The UI says so rather than implying otherwise. Timers that must survive the
 * phone being closed belong in the strip's own firmware. */

import * as store from './store.js';
import * as direct from './direct.js';
import * as history from './history.js';

const runtime = new Map();   // deviceId -> {online, channels, energy, via, lastSeen, error}
const pending = new Map();   // `${deviceId}:${channel}` -> {want, timer}
const listeners = new Set();

let timer = null;
let polling = false;

export const onUpdate = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (extra) => { for (const fn of listeners) fn(extra); };

export const stateOf = (id) => runtime.get(id) || { online: false, channels: {}, energy: null };
export const isPending = (id, ch) => pending.has(`${id}:${ch}`);

export function start() {
  stop();
  const ms = Math.max(2, Number(store.get().pollSeconds) || 5) * 1000;
  tick();
  timer = setInterval(tick, ms);
}

export function stop() { if (timer) clearInterval(timer); timer = null; }

async function tick() {
  if (polling) return;          // a slow network must not stack up polls
  polling = true;
  try {
    const devices = store.get().devices;
    // Concurrent: twenty strips take as long as one, not twenty times as long.
    await Promise.allSettled(devices.map(pollOne));
    runSchedules();
    runAutomations();
    emit();
  } finally {
    polling = false;
  }
}

export async function pollOne(device) {
  try {
    const res = await direct.poll(device, { timeoutMs: 4000 });
    const prev = runtime.get(device.id);
    runtime.set(device.id, {
      online: true, channels: res.channels, energy: res.energy,
      via: res.via, rssi: res.rssi, lastSeen: Date.now(), error: null,
    });
    // Remember which address answered so the next poll tries it first.
    if (device.lastGood !== res.via) store.updateDevice(device.id, { lastGood: res.via });

    for (const [ch, on] of Object.entries(res.channels)) resolvePending(device.id, Number(ch), on);
    if (res.energy) await history.record(device.id, res.energy);
    if (!prev?.online) emit();
  } catch (err) {
    runtime.set(device.id, {
      ...(runtime.get(device.id) || { channels: {}, energy: null }),
      online: false, error: err.message || 'unreachable', lastSeen: runtime.get(device.id)?.lastSeen ?? null,
    });
  }
}

/* ------------------------------------------------------ commands + revert */

/**
 * Switch one outlet. The reply carries the resulting state, so this confirms
 * against the device rather than assuming. If nothing confirms, the optimistic
 * change is rolled back — a user who believes a heater is off when it is on is
 * the failure this exists to prevent.
 */
export async function setOutlet(deviceId, channel, want, { onRevert } = {}) {
  const d = store.device(deviceId);
  if (!d) return;
  const key = `${deviceId}:${channel}`;
  clearPending(deviceId, channel);

  const rt = runtime.get(deviceId) || { channels: {} };
  rt.channels = { ...rt.channels, [channel]: want };
  runtime.set(deviceId, rt);

  pending.set(key, {
    want,
    timer: setTimeout(async () => {
      pending.delete(key);
      await pollOne(d);
      onRevert?.();
      emit();
    }, 3500),
  });
  emit();

  try {
    const confirmed = await direct.setChannel(d, channel, want);
    if (confirmed !== null) {
      const cur = runtime.get(deviceId) || { channels: {} };
      cur.channels = { ...cur.channels, [channel]: confirmed };
      cur.online = true;
      runtime.set(deviceId, cur);
      if (confirmed === want) clearPending(deviceId, channel);
    }
    emit();
  } catch (err) {
    clearPending(deviceId, channel);
    await pollOne(d);
    emit();
    throw err;
  }
}

export async function setAllOutlets(deviceId, on) {
  const d = store.device(deviceId);
  if (!d) return;
  const channels = d.outlets.filter((o) => !o.isUsb).map((o) => o.idx);
  await direct.setAll(d, channels, on);
  await pollOne(d);
  emit();
}

export async function allOffEverywhere() {
  const results = await Promise.allSettled(store.get().devices.map((d) => setAllOutlets(d.id, false)));
  emit();
  return results;
}

function clearPending(deviceId, channel) {
  const key = `${deviceId}:${channel}`;
  const p = pending.get(key);
  if (p) { clearTimeout(p.timer); pending.delete(key); }
}

function resolvePending(deviceId, channel, on) {
  const p = pending.get(`${deviceId}:${channel}`);
  if (p && p.want === on) clearPending(deviceId, channel);
}

/* ------------------------------------------------- schedules & automations */

function runSchedules() {
  const now = Date.now();
  const d = new Date(now);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const todayBit = 1 << d.getDay();

  for (const s of store.get().schedules) {
    if (!s.enabled) continue;

    if (s.kind === 'countdown') {
      if (s.fireAt && s.fireAt <= now) { fire(s); store.updateSchedule(s.id, { enabled: false }); }
      continue;
    }
    if (s.atTime !== hhmm) continue;
    if (!(s.weekdayMask & todayBit)) continue;
    if (s.lastFired && now - s.lastFired < 90_000) continue;   // once per minute, not once per tick
    fire(s);
  }
}

function fire(s) {
  store.updateSchedule(s.id, { lastFired: Date.now() });
  const d = store.device(s.deviceId);
  if (!d) return;
  const run = s.outletIdx == null
    ? setAllOutlets(s.deviceId, !!s.action)
    : setOutlet(s.deviceId, s.outletIdx, !!s.action);
  run.catch(() => { /* the strip is unreachable; the next poll shows the truth */ });
}

function runAutomations() {
  const now = Date.now();
  for (const a of store.get().automations) {
    if (!a.enabled) continue;
    const rt = runtime.get(a.deviceId);
    if (!rt?.online || !rt.energy || !Number.isFinite(rt.energy.watts)) continue;
    const watts = rt.energy.watts;

    if (a.kind === 'standby') {
      // Only after the draw has stayed low for the whole window: a fridge
      // between compressor cycles must not trip this.
      if (watts < a.thresholdW) {
        if (!a.since) store.updateAutomation(a.id, { since: now });
        else if (now - a.since >= (a.durationS || 600) * 1000) {
          store.updateAutomation(a.id, { since: 0 });
          if (a.cut) setAllOutlets(a.deviceId, false).catch(() => {});
          emit({ notice: { kind: 'standby', deviceId: a.deviceId, watts } });
        }
      } else if (a.since) store.updateAutomation(a.id, { since: 0 });
      continue;
    }

    if (a.kind === 'overload') {
      // No averaging window — the point is to get in front of a thermal event.
      if (watts > a.thresholdW) {
        if (!a.since || now - a.since > 60_000) {
          store.updateAutomation(a.id, { since: now });
          if (a.cut) setAllOutlets(a.deviceId, false).catch(() => {});
          emit({ notice: { kind: 'overload', deviceId: a.deviceId, watts } });
        }
      } else if (a.since) store.updateAutomation(a.id, { since: 0 });
    }
  }
}

/* ---------------------------------------------------------------- summary */

export function summary() {
  const devices = store.get().devices;
  let watts = 0, online = 0, on = 0, total = 0, plans = 0, anyMeter = false;
  for (const d of devices) {
    const rt = stateOf(d.id);
    if (rt.online) online++;
    if (rt.online && rt.energy?.watts != null) { watts += rt.energy.watts; anyMeter = true; }
    for (const o of d.outlets) {
      if (o.isUsb) continue;
      total++;
      if (rt.channels?.[o.idx]) on++;
    }
    if (d.planExpires && d.planExpires > Date.now()) plans++;
  }
  return {
    watts: Math.round(watts * 10) / 10,
    stripsOnline: online, stripsTotal: devices.length,
    outletsOn: on, outletsTotal: total, plansActive: plans, anyMeter,
  };
}
