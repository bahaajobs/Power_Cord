// Boots the whole stack — broker, server, two virtual strips — against a
// throwaway database and drives it through the API. This is the test that
// proves a clean checkout actually works; the unit tests only prove the maths.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BROKER_PORT = 18831;
const HTTP_PORT = 18099;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const PASSWORD = 'integration-test-pw';

const children = [];
let token = '';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnChild(args, env = {}) {
  const c = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  c.stdout.on('data', () => {});
  c.stderr.on('data', (d) => {
    const s = d.toString();
    if (/error|Error/.test(s)) process.stderr.write(`[child] ${s}`);
  });
  children.push(c);
  return c;
}

function waitForPort(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      const s = connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolvePromise(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() > deadline) reject(new Error(`port ${port} never opened`));
        else setTimeout(attempt, 120);
      });
    };
    attempt();
  });
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

/** Poll until `fn()` returns truthy, so tests never depend on a fixed sleep. */
async function until(fn, timeoutMs = 15_000, label = 'condition') {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await wait(150);
  }
}

const stateOf = async (id) =>
  (await api('GET', '/api/state')).body.strips.find((s) => s.id === id);

before(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'pc-int-')), 'test.db');

  spawnChild(['sim/broker.js'], { PC_BROKER_PORT: String(BROKER_PORT) });
  await waitForPort(BROKER_PORT);

  spawnChild(['--disable-warning=ExperimentalWarning', 'server/src/index.js'], {
    PC_DB: dbPath,
    PC_PORT: String(HTTP_PORT),
    PC_ADMIN_PASSWORD: PASSWORD,
    PC_MQTT_URL: `mqtt://127.0.0.1:${BROKER_PORT}`,
    PC_TICK_INTERVAL_MS: '1000',
    PC_SAMPLE_INTERVAL_MS: '500',
  });
  await waitForPort(HTTP_PORT);

  spawnChild(['sim/simulator.js'], {
    PC_MQTT_URL: `mqtt://127.0.0.1:${BROKER_PORT}`,
    PC_SIM_COUNT: '2',
    PC_SIM_TELEMETRY_MS: '700',
  });

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PASSWORD }),
  });
  token = (await login.json()).token;
  assert.ok(token, 'login should return a token');

  await until(
    async () => (await api('GET', '/api/state')).body.strips.filter((s) => s.online).length === 2,
    20_000, 'both simulated strips to come online',
  );
});

after(async () => {
  for (const c of children) c.kill('SIGKILL');
  await wait(200);
});

test('strips are discovered from their MQTT last-will topic', async () => {
  const { strips, totals } = (await api('GET', '/api/state')).body;
  assert.equal(strips.length, 2);
  assert.equal(totals.stripsOnline, 2);
  // 4 switchable outlets plus the USB rail.
  assert.equal(strips[0].outlets.length, 5);
  assert.equal(strips[0].outletCount, 4);
});

test('device ids are masked for display but kept intact underneath', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  assert.match(s.deviceIdMasked, /^.{5}\*+$/);
  assert.equal(s.deviceIdMasked.length, s.deviceId.length);
  assert.notEqual(s.deviceIdMasked, s.deviceId);
});

test('an outlet switches and the change comes back from the device', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  assert.equal((await api('POST', `/api/strips/${s.id}/outlets/1`, { on: true })).status, 200);
  const after = await until(async () => {
    const cur = await stateOf(s.id);
    return cur.outlets.find((o) => o.idx === 1).on ? cur : null;
  }, 5000, 'outlet 1 to report on');
  assert.equal(after.outletsOn, 1);
});

test('turn all on then all off', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  await api('POST', `/api/strips/${s.id}/all`, { on: true });
  await until(async () => (await stateOf(s.id)).outletsOn === 4, 5000, 'all four on');
  await api('POST', '/api/all-off');
  await until(
    async () => (await api('GET', '/api/state')).body.totals.outletsOn === 0,
    5000, 'every outlet off',
  );
});

test('a locked outlet refuses commands', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  await api('PATCH', `/api/strips/${s.id}/outlets/2`, { locked: true, name: 'Router' });
  const res = await api('POST', `/api/strips/${s.id}/outlets/2`, { on: true });
  assert.equal(res.status, 423);
  await api('PATCH', `/api/strips/${s.id}/outlets/2`, { locked: false });
});

test('metering is detected from telemetry, not assumed', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  await api('POST', `/api/strips/${s.id}/all`, { on: true });
  const cur = await until(async () => {
    const x = await stateOf(s.id);
    return x.hasMetering && x.watts > 0 ? x : null;
  }, 10_000, 'power telemetry');
  assert.ok(cur.volts > 210 && cur.volts < 235, `volts ${cur.volts}`);
  assert.ok(cur.amps > 0);
});

test('the energy report always returns one bar per day in the range', async () => {
  for (const days of [7, 30, 90]) {
    const r = (await api('GET', `/api/energy?days=${days}`)).body;
    assert.equal(r.series.length, days);
    assert.equal(r.byStrip.length, 2);
  }
  assert.equal((await api('GET', '/api/energy?days=5')).status, 400);
});

test('unauthenticated requests are rejected', async () => {
  assert.equal((await fetch(`${BASE}/api/state`)).status, 401);
  const bad = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  assert.equal(bad.status, 401);
});

test('malformed requests are rejected with 4xx, never a 500', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  assert.equal((await api('POST', `/api/strips/${s.id}/outlets/1`, { on: 'yes' })).status, 400);
  assert.equal((await api('POST', `/api/strips/${s.id}/outlets/99`, { on: true })).status, 404);
  assert.equal((await api('POST', '/api/strips/9999/all', { on: true })).status, 404);
  assert.equal((await api('POST', '/api/strips', { deviceId: s.deviceId })).status, 409);
  assert.equal((await api('POST', '/api/strips', { deviceId: 'X1', outletCount: 99 })).status, 400);
  assert.equal((await api('PATCH', '/api/settings', { nope: 1 })).status, 400);
});

test('a countdown fires once and then disables itself', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  await api('POST', `/api/strips/${s.id}/outlets/3`, { on: true });
  await until(async () => (await stateOf(s.id)).outlets.find((o) => o.idx === 3).on,
    5000, 'outlet 3 on');

  const created = await api('POST', '/api/schedules', {
    stripId: s.id, outletIdx: 3, kind: 'countdown', fireAt: Date.now() + 1200, action: false,
  });
  assert.equal(created.status, 200);

  await until(async () => (await stateOf(s.id)).outlets.find((o) => o.idx === 3).on === false,
    10_000, 'the countdown to switch outlet 3 off');
  const after = (await api('GET', '/api/schedules')).body.find((x) => x.id === created.body.id);
  assert.equal(after.enabled, false);
});

test('schedule input is validated', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  assert.equal((await api('POST', '/api/schedules', { stripId: s.id, kind: 'nope', action: true })).status, 400);
  assert.equal((await api('POST', '/api/schedules', { stripId: s.id, kind: 'weekly', atTime: '9am', action: true })).status, 400);
  assert.equal((await api('POST', '/api/schedules', { stripId: 9999, kind: 'weekly', atTime: '09:00', action: true })).status, 400);
});

test('an overload automation cuts the strip and records the event', async () => {
  const s = (await api('GET', '/api/state')).body.strips[0];
  await api('POST', `/api/strips/${s.id}/all`, { on: true });
  await until(async () => (await stateOf(s.id)).watts > 5, 10_000, 'load above threshold');

  const auto = await api('POST', '/api/automations', {
    stripId: s.id, kind: 'overload', thresholdW: 5, cut: true,
  });
  assert.equal(auto.status, 200);

  await until(async () => (await stateOf(s.id)).outletsOn === 0, 10_000, 'the overload cut');
  const events = (await api('GET', '/api/events?limit=30')).body;
  assert.ok(events.some((e) => e.kind === 'automation.overload'));
  await api('DELETE', `/api/automations/${auto.body.id}`);
});

test('static files are served and path traversal is refused', async () => {
  const page = await fetch(`${BASE}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const escape = await fetch(`${BASE}/../../../etc/passwd`);
  const text = await escape.text();
  assert.ok(!text.includes('root:x:'), 'must not serve files outside the web root');
});
