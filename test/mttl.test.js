// Drives the stock-firmware path end to end: a simulated MTTL strip dials our
// server on TCP 10086, registers itself, and is controlled through the same
// REST API the app uses. No flashing, no broker.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTTP = 18120, MTTL = 18086;
const BASE = `http://127.0.0.1:${HTTP}`;
const PW = 'mttl-test-pw';
const kids = [];
let token = '';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { parseGetinfo } = await import('../server/src/mttl.js');

function spawnChild(args, env = {}) {
  const c = spawn(process.execPath, args, {
    cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  c.stdout.on('data', () => {});
  c.stderr.on('data', () => {});
  kids.push(c);
  return c;
}

function waitForPort(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((res, rej) => {
    const go = () => {
      const s = connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); res(); });
      s.once('error', () => {
        s.destroy();
        Date.now() > deadline ? rej(new Error(`port ${port} never opened`)) : setTimeout(go, 120);
      });
    };
    go();
  });
}

const api = async (m, p, b) => {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

async function until(fn, ms = 20_000, label = 'condition') {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await wait(200);
  }
}

before(async () => {
  const db = join(mkdtempSync(join(tmpdir(), 'pc-mttl-')), 'm.db');
  spawnChild(['--disable-warning=ExperimentalWarning', 'server/src/index.js'], {
    PC_DB: db, PC_PORT: String(HTTP), PC_ADMIN_PASSWORD: PW,
    PC_MTTL_ENABLED: '1', PC_MTTL_PORT: String(MTTL), PC_MTTL_POLL_MS: '1000',
    PC_MQTT_URL: 'mqtt://127.0.0.1:1',       // no broker; this path must not need one
    PC_TICK_INTERVAL_MS: '1000',
  });
  await waitForPort(HTTP);
  await waitForPort(MTTL);

  spawnChild(['sim/mttl-sim.js'], {
    PC_MTTL_SIM_PORT: String(MTTL), PC_MTTL_SIM_COUNT: '2', PC_MTTL_SIM_BUTTONS: '0',
  });

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PW }),
  });
  token = (await login.json()).token;

  await until(async () => (await api('GET', '/api/state')).body.strips?.filter((s) => s.online).length === 2,
    20_000, 'both stock-firmware strips to dial in');
});

after(async () => { for (const c of kids) c.kill('SIGKILL'); await wait(200); });

test('parseGetinfo reads per-channel power, energy and temperature', () => {
  const frame = 'up:getinfo:1:3600;on;0;none;none;95000;00000FA0;00000000;00000000;ok;00;29:'
              + '2:3600;off;0;none;none;0;00000000;00000000;00000000;ok;00;27:'
              + '5:3600;on;0;none;none;95000;00000FA0;00000000;00000000;ok;00;30';
  const rows = parseGetinfo(frame);
  assert.equal(rows.length, 2, 'channel 5 is the aggregate and must not become an outlet');
  assert.deepEqual(rows[0], { channel: 1, on: true, watts: 95, kwh: 4, tempC: 29 });
  assert.equal(rows[1].on, false);
  assert.equal(rows[1].watts, 0);
});

test('parseGetinfo tolerates the NUL padding the firmware sends', () => {
  const padded = 'up:getinfo:1:10;on;0;none;none;1000;00000001;00000000;00000000;ok;00;25\0\0'.replace(/\0/g, '');
  assert.equal(parseGetinfo(padded).length, 1);
});

test('a stock-firmware strip registers itself from its bootinfo frame', async () => {
  const { strips } = (await api('GET', '/api/state')).body;
  assert.equal(strips.length, 2);
  for (const s of strips) {
    assert.equal(s.online, true);
    assert.equal(s.transport, 'mttl');
    assert.equal(s.outletCount, 4);
    assert.equal(s.hasUsb, false, 'these strips have no switchable USB rail');
    assert.match(s.deviceId, /^[0-9A-F]{12}$/);
  }
});

test('per-outlet metering is reported, which the re-flashed strips cannot do', async () => {
  const s = await until(async () => {
    const x = (await api('GET', '/api/state')).body.strips[0];
    return x.perOutletMetering && x.outlets.some((o) => o.watts !== null) ? x : null;
  }, 15_000, 'per-outlet readings');
  assert.equal(s.perOutletMetering, true);
  for (const o of s.outlets) {
    assert.equal(typeof o.watts, 'number');
    assert.equal(typeof o.tempC, 'number');
    assert.ok(o.tempC > 10 && o.tempC < 60, `temperature ${o.tempC}`);
  }
});

test('an outlet switches over the strip\'s own TCP session', async () => {
  const id = (await api('GET', '/api/state')).body.strips[0].id;
  assert.equal((await api('POST', `/api/strips/${id}/outlets/1`, { on: true })).status, 200);
  const on = await until(async () => {
    const s = (await api('GET', '/api/state')).body.strips.find((x) => x.id === id);
    return s.outlets.find((o) => o.idx === 1).on ? s : null;
  }, 10_000, 'outlet 1 to confirm on');
  assert.equal(on.outletsOn >= 1, true);

  await api('POST', `/api/strips/${id}/outlets/1`, { on: false });
  await until(async () => {
    const s = (await api('GET', '/api/state')).body.strips.find((x) => x.id === id);
    return s.outlets.find((o) => o.idx === 1).on === false;
  }, 10_000, 'outlet 1 to confirm off');
});

test('turn all on, then all off, without a channel 0 command', async () => {
  const id = (await api('GET', '/api/state')).body.strips[0].id;
  await api('POST', `/api/strips/${id}/all`, { on: true });
  await until(async () => (await api('GET', '/api/state')).body.strips.find((x) => x.id === id).outletsOn === 4,
    10_000, 'all four on');
  await api('POST', '/api/all-off');
  await until(async () => (await api('GET', '/api/state')).body.totals.outletsOn === 0,
    10_000, 'everything off');
});

test('strip-level power is the sum of its channels', async () => {
  const id = (await api('GET', '/api/state')).body.strips[0].id;
  await api('POST', `/api/strips/${id}/all`, { on: true });
  const s = await until(async () => {
    const x = (await api('GET', '/api/state')).body.strips.find((y) => y.id === id);
    return x.watts > 0 ? x : null;
  }, 15_000, 'power to be reported');
  const sum = s.outlets.reduce((a, o) => a + (o.watts || 0), 0);
  assert.ok(Math.abs(s.watts - sum) < 1.5, `strip ${s.watts} W vs channels ${sum} W`);
});

test('the health endpoint reports the MTTL listener', async () => {
  const h = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(h.mttl.listening, true);
  assert.equal(h.mttl.port, MTTL);
  assert.equal(h.mttl.sessions, 2);
});

test('this path needs no MQTT broker at all', async () => {
  const h = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(h.mqtt.connected, false, 'no broker is running, deliberately');
  // ...and the strips still work, which is the point.
  const { totals } = (await api('GET', '/api/state')).body;
  assert.equal(totals.stripsOnline, 2);
});

test('a strip that drops off is marked offline and refuses commands', async () => {
  const before = (await api('GET', '/api/state')).body.strips[0];
  // Kill the simulator; both strips should go offline.
  kids[1].kill('SIGKILL');
  await until(async () => (await api('GET', '/api/state')).body.totals.stripsOnline === 0,
    15_000, 'strips to go offline');
  const res = await api('POST', `/api/strips/${before.id}/outlets/1`, { on: true });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /offline/i);
});
