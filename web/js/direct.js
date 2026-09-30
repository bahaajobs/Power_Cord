/* Direct transport — the app talks to a strip's own web server, with nothing
 * in between. No broker, no server, no cloud.
 *
 * The wire format is Tasmota's HTTP command endpoint, which OpenBeken
 * implements: GET /cm?cmnd=<command>. ESPHome does not speak this, so an
 * ESPHome strip is reached through the server transport instead.
 *
 * Each device carries two addresses. `lanHost` is where it lives on your own
 * Wi-Fi; `remoteHost` is an address that reaches it from outside, which in
 * practice means a port forward in the router. The transport tries whichever
 * worked last, then falls back to the other, so walking out of the house
 * switches over on its own.  */

import { getJson, HttpError } from './net.js';

const norm = (host, fallbackPort = 80) => {
  if (!host) return null;
  let h = String(host).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!h) return null;
  return /:\d+$/.test(h) ? h : `${h}:${fallbackPort}`;
};

function url(host, cmd, device) {
  const auth = device?.user
    ? `user=${encodeURIComponent(device.user)}&password=${encodeURIComponent(device.pass || '')}&`
    : '';
  return `http://${host}/cm?${auth}cmnd=${encodeURIComponent(cmd)}`;
}

/** Endpoints to try, most-likely-first. */
function endpoints(device) {
  const lan = norm(device.lanHost);
  const remote = norm(device.remoteHost);
  const list = [];
  if (device.lastGood === 'remote' && remote) list.push(['remote', remote], ['lan', lan]);
  else list.push(['lan', lan], ['remote', remote]);
  return list.filter(([, h]) => !!h);
}

/**
 * Run a command against a device, trying each endpoint. Returns the parsed
 * reply plus which endpoint answered, so the caller can show "local" or
 * "remote" and remember the winner.
 */
export async function command(device, cmd, { timeoutMs = 4000 } = {}) {
  const tries = endpoints(device);
  if (tries.length === 0) throw new HttpError('no address configured');

  let lastErr;
  for (const [kind, host] of tries) {
    try {
      const data = await getJson(url(host, cmd, device), { timeoutMs });
      // Tasmota answers a bad login with a JSON body rather than a 401.
      if (data && typeof data === 'object' && /invalid|unauthor/i.test(JSON.stringify(data).slice(0, 120))) {
        throw new HttpError('authentication rejected', 401);
      }
      return { data, via: kind, host };
    } catch (err) {
      lastErr = err;
      // A rejected login will be rejected at the other address too.
      if (err.status === 401) break;
    }
  }
  throw lastErr || new HttpError('unreachable');
}

const isOn = (v) => /^(on|1|true)$/i.test(String(v));

/** Poll one device: relay states, and energy when the hardware reports it. */
export async function poll(device, { timeoutMs = 4000 } = {}) {
  const { data: state, via, host } = await command(device, 'STATE', { timeoutMs });

  const channels = {};
  for (const [k, v] of Object.entries(state || {})) {
    const m = /^POWER(\d*)$/i.exec(k);
    if (m) channels[m[1] === '' ? 1 : Number(m[1])] = isOn(v);
  }

  const out = {
    online: true,
    via,
    host,
    channels,
    rssi: state?.Wifi?.RSSI ?? null,
    uptime: state?.Uptime ?? null,
    energy: null,
  };

  // Metering is a separate call, and plenty of these strips have no meter —
  // a failure here is not a failure of the device.
  try {
    const { data: sns } = await command(device, 'STATUS 8', { timeoutMs });
    const e = sns?.StatusSNS?.ENERGY;
    if (e) {
      out.energy = {
        watts: numOr(e.Power),
        volts: numOr(e.Voltage),
        amps: numOr(e.Current),
        // The strip's own accumulators. These are what local history
        // reconciles against, so a phone that was asleep does not lose a day.
        totalKwh: numOr(e.Total),
        todayKwh: numOr(e.Today),
        yesterdayKwh: numOr(e.Yesterday),
      };
    }
  } catch { /* no meter, or the command is unsupported */ }

  return out;
}

const numOr = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export async function setChannel(device, channel, on) {
  const { data } = await command(device, `POWER${channel} ${on ? 'ON' : 'OFF'}`);
  const key = Object.keys(data || {}).find((k) => new RegExp(`^POWER${channel}$`, 'i').test(k))
    || (channel === 1 ? Object.keys(data || {}).find((k) => /^POWER$/i.test(k)) : null);
  // The reply carries the resulting state, so the caller confirms against the
  // device rather than assuming the command took.
  return key ? isOn(data[key]) : null;
}

/** Backlog switches every channel in one request instead of n round trips. */
export async function setAll(device, channels, on) {
  const cmd = `Backlog ${channels.map((c) => `POWER${c} ${on ? 'ON' : 'OFF'}`).join('; ')}`;
  await command(device, cmd, { timeoutMs: 6000 });
}

/**
 * Probe an address during setup or a network scan. Short timeout: a scan
 * fires this at 254 addresses and most of them are not strips.
 */
export async function probe(host, { user, pass, timeoutMs = 1200 } = {}) {
  const device = { lanHost: host, user, pass };
  const { data, via } = await command(device, 'STATE', { timeoutMs });
  const channels = Object.keys(data || {}).filter((k) => /^POWER\d*$/i.test(k));
  if (channels.length === 0) throw new HttpError('answered, but not a switchable device');

  let name = null, firmware = null;
  try {
    const { data: st } = await command(device, 'STATUS 0', { timeoutMs: timeoutMs + 800 });
    name = st?.Status?.DeviceName || st?.Status?.FriendlyName?.[0] || null;
    firmware = st?.StatusFWR?.Version || null;
  } catch { /* optional */ }

  return { host, via, channelCount: channels.length, name, firmware };
}
