import { db, allSettings, getSetting, issueToken, revokeToken, setSetting, userForToken, verifyPassword } from './db.js';
import {
  createStrip, deleteStrip, getStrip, snapshot, stripView, updateOutlet, updateStrip,
} from './devices.js';
import { bridgeStatus, sendCommand, setAll, setOutlet } from './bridge.js';
import { energyReport } from './energy.js';
import {
  createAutomation, createSchedule, deleteAutomation, deleteSchedule,
  listAutomations, listSchedules, updateAutomation, updateSchedule,
} from './scheduler.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new HttpError(400, msg); };

/** Routes are `[method, pattern, handler, {public?}]`; `:name` captures a segment. */
const routes = [];
const on = (method, pattern, handler, opts = {}) =>
  routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, ...opts });

/* ------------------------------------------------------------------- auth */

on('POST', '/api/auth/login', ({ body }) => {
  const { username, password } = body || {};
  if (!username || !password) bad('username and password are required');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username));
  // Same message either way so the endpoint does not confirm which usernames exist.
  if (!user || !verifyPassword(String(password), user.salt, user.hash)) {
    throw new HttpError(401, 'incorrect username or password');
  }
  const { token, expires } = issueToken(user.id);
  return { token, expires, username: user.username };
}, { public: true });

on('POST', '/api/auth/logout', ({ token }) => { revokeToken(token); return { ok: true }; });

on('GET', '/api/me', ({ user }) => ({ username: user.username }));

on('GET', '/api/health', () => ({
  ok: true, mqtt: bridgeStatus(), time: Date.now(),
}), { public: true });

/* ----------------------------------------------------------------- strips */

on('GET', '/api/state', () => ({ ...snapshot(), mqtt: bridgeStatus() }));

on('GET', '/api/strips', () => snapshot().strips);

on('POST', '/api/strips', ({ body }) => {
  const deviceId = String(body?.deviceId || '').trim();
  if (!deviceId) bad('deviceId is required');
  if (db.prepare('SELECT 1 FROM strips WHERE device_id = ?').get(deviceId)) {
    throw new HttpError(409, 'a strip with that device id already exists');
  }
  const prefix = String(body.topicPrefix || deviceId).trim();
  if (db.prepare('SELECT 1 FROM strips WHERE topic_prefix = ?').get(prefix)) {
    throw new HttpError(409, 'that MQTT topic prefix is already in use');
  }
  const count = Number(body.outletCount ?? 4);
  if (!Number.isInteger(count) || count < 1 || count > 8) bad('outletCount must be 1-8');
  return stripView(createStrip({
    deviceId,
    topicPrefix: prefix,
    name: body.name || deviceId,
    room: body.room || null,
    outletCount: count,
    hasUsb: body.hasUsb !== false,
    hasMetering: !!body.hasMetering,
    usbChannel: Number(body.usbChannel ?? 5),
    planExpires: body.planExpires ? Number(body.planExpires) : null,
  }));
});

on('PATCH', '/api/strips/:id', ({ params, body }) => {
  if (!getStrip(params.id)) throw new HttpError(404, 'no such strip');
  return stripView(updateStrip(params.id, body || {}));
});

on('DELETE', '/api/strips/:id', ({ params }) => {
  if (!getStrip(params.id)) throw new HttpError(404, 'no such strip');
  deleteStrip(params.id);
  return { ok: true };
});

on('POST', '/api/strips/:id/outlets/:idx', ({ params, body }) => {
  const strip = getStrip(params.id);
  if (!strip) throw new HttpError(404, 'no such strip');
  const idx = Number(params.idx);
  const outlet = db.prepare('SELECT * FROM outlets WHERE strip_id = ? AND idx = ?').get(strip.id, idx);
  if (!outlet) throw new HttpError(404, 'no such outlet');
  if (outlet.locked) throw new HttpError(423, `${outlet.name} is locked`);
  if (typeof body?.on !== 'boolean') bad('body must be {"on": true|false}');
  try {
    setOutlet(strip.id, idx, body.on);
  } catch (err) {
    // 503 rather than 500: the request was fine, the device was not reachable.
    throw new HttpError(503, err.message);
  }
  return { ok: true, pending: true };
});

on('PATCH', '/api/strips/:id/outlets/:idx', ({ params, body }) => {
  if (!getStrip(params.id)) throw new HttpError(404, 'no such strip');
  updateOutlet(params.id, params.idx, body || {});
  return stripView(getStrip(params.id));
});

on('POST', '/api/strips/:id/all', ({ params, body }) => {
  const strip = getStrip(params.id);
  if (!strip) throw new HttpError(404, 'no such strip');
  if (typeof body?.on !== 'boolean') bad('body must be {"on": true|false}');
  try { setAll(strip.id, body.on); } catch (err) { throw new HttpError(503, err.message); }
  return { ok: true };
});

on('POST', '/api/all-off', () => {
  const results = [];
  for (const s of snapshot().strips) {
    try { setAll(s.id, false); results.push({ id: s.id, ok: true }); }
    catch (err) { results.push({ id: s.id, ok: false, error: err.message }); }
  }
  return { results };
});

on('POST', '/api/strips/:id/command', ({ params, body }) => {
  if (!getStrip(params.id)) throw new HttpError(404, 'no such strip');
  if (!body?.command) bad('command is required');
  try { sendCommand(params.id, body.command, body.args ?? ''); }
  catch (err) { throw new HttpError(503, err.message); }
  return { ok: true };
});

/* ----------------------------------------------------------------- energy */

on('GET', '/api/energy', ({ query }) => {
  const days = Number(query.days ?? 7);
  if (![7, 30, 90].includes(days)) bad('days must be 7, 30 or 90');
  return energyReport(days, query.stripId ? Number(query.stripId) : null);
});

/* --------------------------------------------------------------- settings */

const WRITABLE_SETTINGS = new Set([
  'currency', 'tariff_mode', 'tariff_flat', 'tariff_brackets',
  'household_mtd_kwh', 'mask_device_ids',
]);

on('GET', '/api/settings', () => {
  const s = allSettings();
  return { ...s, tariff_brackets: JSON.parse(s.tariff_brackets) };
});

on('PATCH', '/api/settings', ({ body }) => {
  for (const [k, v] of Object.entries(body || {})) {
    if (!WRITABLE_SETTINGS.has(k)) bad(`unknown setting "${k}"`);
    if (k === 'tariff_mode' && !['flat', 'brackets'].includes(v)) bad('tariff_mode must be flat or brackets');
    setSetting(k, k === 'tariff_brackets' ? JSON.stringify(v) : v);
  }
  const s = allSettings();
  return { ...s, tariff_brackets: JSON.parse(s.tariff_brackets) };
});

/* -------------------------------------------------- schedules, automations */

on('GET', '/api/schedules', ({ query }) => listSchedules(query.stripId ?? null));
on('POST', '/api/schedules', ({ body }) => {
  try { return createSchedule(body || {}); } catch (e) { throw new HttpError(400, e.message); }
});
on('PATCH', '/api/schedules/:id', ({ params, body }) => updateSchedule(params.id, body || {}));
on('DELETE', '/api/schedules/:id', ({ params }) => { deleteSchedule(params.id); return { ok: true }; });

on('GET', '/api/automations', ({ query }) => listAutomations(query.stripId ?? null));
on('POST', '/api/automations', ({ body }) => {
  try { return createAutomation(body || {}); } catch (e) { throw new HttpError(400, e.message); }
});
on('PATCH', '/api/automations/:id', ({ params, body }) => updateAutomation(params.id, body || {}));
on('DELETE', '/api/automations/:id', ({ params }) => { deleteAutomation(params.id); return { ok: true }; });

on('GET', '/api/events', ({ query }) => {
  const limit = Math.min(Number(query.limit ?? 50), 500);
  return db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);
});

/* ---------------------------------------------------------------- matcher */

function match(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      const p = r.parts[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(parts[i]);
      else if (p !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

export function tokenFrom(req, url) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return url.searchParams.get('token') || null;
}

export async function handleApi(req, res, url, readBody) {
  const found = match(req.method, url.pathname);
  if (!found) return false;

  const send = (status, payload) => {
    const text = JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
    return true;
  };

  try {
    const token = tokenFrom(req, url);
    let user = null;
    if (!found.route.public) {
      user = userForToken(token);
      if (!user) return send(401, { error: 'authentication required' });
    }
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody() : null;
    const query = Object.fromEntries(url.searchParams);
    const result = await found.route.handler({ params: found.params, body, query, user, token, req });
    return send(200, result === undefined ? { ok: true } : result);
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { error: err.message });
    console.error('unhandled API error:', err);
    return send(500, { error: 'internal error' });
  }
}

export { HttpError };
