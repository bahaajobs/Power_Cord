/* Server transport — the app talking to a Power Cord server instead of to a
 * strip directly.
 *
 * This is what stock-firmware strips need. They only ever speak to the one
 * server address written into their flash, so the phone cannot reach them
 * directly at all; the server holds the strips' TCP sessions and the app is a
 * client of its API. Re-flashed strips can use either mode.
 *
 * The device list comes FROM the server here, unlike direct mode where it
 * lives on the phone. Nothing is written into the local device store, so
 * switching modes never disturbs a direct-mode setup.
 */

import { getJson, HttpError } from './net.js';

let base = '';
let token = '';

const trim = (u) => String(u || '').trim().replace(/\/+$/, '');

export function configure(url, authToken) {
  base = trim(url);
  if (base && !/^https?:\/\//i.test(base)) base = `http://${base}`;
  token = authToken || '';
}

export const isConfigured = () => !!base;

async function call(method, path, body) {
  if (!base) throw new HttpError('no server address configured');
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((err) => { throw new HttpError(err.message || 'unreachable'); });

  if (res.status === 401) throw new HttpError('sign in to the server again', 401);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(data.error || `HTTP ${res.status}`, res.status);
  return data;
}

export async function login(username, password) {
  const r = await call('POST', '/api/auth/login', { username, password });
  token = r.token;
  return r;
}

/** Reachability check for the settings screen. */
export async function test() {
  const h = await getJson(`${base}/api/health`, { timeoutMs: 5000 });
  return {
    ok: !!h.ok,
    mqtt: !!h.mqtt?.connected,
    mttl: h.mttl?.listening ? h.mttl.sessions : null,
  };
}

/**
 * One poll returns every strip the server knows about, already shaped the way
 * the UI wants it — so a fleet of twenty costs one request, not twenty.
 */
export async function pollAll() {
  const state = await call('GET', '/api/state');
  return (state.strips || []).map((s) => ({
    device: {
      id: `srv:${s.id}`,
      serverId: s.id,
      name: s.name,
      deviceId: s.deviceId,
      room: s.room || '',
      outletCount: s.outletCount,
      hasUsb: s.hasUsb,
      usbChannel: s.usbChannel,
      planExpires: s.planExpires,
      transport: s.transport || 'mqtt',
      outlets: s.outlets.map((o) => ({
        idx: o.idx, name: o.name, locked: o.locked, isUsb: o.isUsb,
      })),
    },
    state: {
      online: s.online,
      via: 'server',
      channels: Object.fromEntries(s.outlets.map((o) => [o.idx, o.on])),
      rssi: s.rssi,
      lastSeen: s.lastSeen,
      // Stock-firmware strips meter every channel; re-flashed ones cannot.
      perOutletMetering: !!s.perOutletMetering,
      outletWatts: Object.fromEntries(s.outlets.map((o) => [o.idx, o.watts ?? null])),
      outletTempC: Object.fromEntries(s.outlets.map((o) => [o.idx, o.tempC ?? null])),
      energy: s.hasMetering
        ? { watts: s.watts, volts: s.volts, amps: s.amps, totalKwh: null, todayKwh: null }
        : null,
    },
  }));
}

export const setChannel = (serverId, channel, on) =>
  call('POST', `/api/strips/${serverId}/outlets/${channel}`, { on }).then(() => null);

export const setAll = (serverId, on) =>
  call('POST', `/api/strips/${serverId}/all`, { on });

export const allOff = () => call('POST', '/api/all-off');
