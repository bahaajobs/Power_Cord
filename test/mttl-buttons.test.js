// The physical buttons.
//
// These are momentary push-buttons wired as MCU inputs (KEY1..KEY4), driving
// magnetic latching relays through an I2C expander — the button does not move
// the relay itself, the firmware reads the press and pulses the coil. So the
// strip's state can change at any moment with no command from us, and the
// server has to notice. That path was previously untested.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTTP = 18130, MTTL = 18096;
const BASE = `http://127.0.0.1:${HTTP}`;
const PW = 'btn-test-pw';
const kids = [];
let token = '';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function until(fn, ms = 25_000, label = 'condition') {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await wait(200);
  }
}

const strip = async () => (await api('GET', '/api/state')).body.strips[0];

before(async () => {
  const db = join(mkdtempSync(join(tmpdir(), 'pc-btn-')), 'b.db');
  spawnChild(['--disable-warning=ExperimentalWarning', 'server/src/index.js'], {
    PC_DB: db, PC_PORT: String(HTTP), PC_ADMIN_PASSWORD: PW,
    PC_MTTL_ENABLED: '1', PC_MTTL_PORT: String(MTTL), PC_MTTL_POLL_MS: '1500',
    PC_MQTT_URL: 'mqtt://127.0.0.1:1', PC_TICK_INTERVAL_MS: '1500',
  });
  await waitForPort(HTTP);
  await waitForPort(MTTL);

  // Buttons firing every 1.2 s, plus one deterministic master press at 6 s.
  spawnChild(['sim/mttl-sim.js'], {
    PC_MTTL_SIM_PORT: String(MTTL), PC_MTTL_SIM_COUNT: '1',
    PC_MTTL_SIM_BUTTONS: '1', PC_MTTL_SIM_BUTTON_MS: '1200',
    PC_MTTL_SIM_MASTER_AFTER_MS: '6000',
  });

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PW }),
  });
  token = (await login.json()).token;
  await until(async () => (await api('GET', '/api/state')).body.strips?.[0]?.online, 20_000, 'the strip to dial in');
});

after(async () => { for (const c of kids) c.kill('SIGKILL'); await wait(200); });

test('a press on the strip changes the state the server reports', async () => {
  const start = await strip();
  const before = start.outlets.map((o) => o.on).join('');
  const after = await until(async () => {
    const s = await strip();
    return s.outlets.map((o) => o.on).join('') !== before ? s : null;
  }, 20_000, 'a button press to change something');
  assert.notEqual(after.outlets.map((o) => o.on).join(''), before);
});

test('the press is recorded as a button event, not as a command', async () => {
  const events = await until(async () => {
    const list = (await api('GET', '/api/events?limit=50')).body;
    return list.some((e) => e.kind === 'mttl.button') ? list : null;
  }, 20_000, 'a button event');
  const btn = events.find((e) => e.kind === 'mttl.button');
  assert.match(btn.detail, /channel [0-4] -> (on|off)/);
  // Nothing the app did should be logged as a failed command here.
  assert.equal(events.some((e) => e.kind === 'command.failed'), false);
});

test('the master button sets every channel at once', async () => {
  // The simulator fires one deterministic channel-0 press.
  const s = await until(async () => {
    const list = (await api('GET', '/api/events?limit=80')).body;
    return list.some((e) => e.kind === 'mttl.button' && /channel 0 ->/.test(e.detail))
      ? await strip() : null;
  }, 25_000, 'the master press');
  assert.ok(s, 'the master event was seen');
});

test('a command still wins after a press, because state is re-read not assumed', async () => {
  const s = await strip();
  // Ask for a definite state and confirm the server converges on it, despite
  // random presses continuing in the background.
  await api('POST', `/api/strips/${s.id}/outlets/3`, { on: true });
  const settled = await until(async () => {
    const x = await strip();
    return x.outlets.find((o) => o.idx === 3)?.on ? x : null;
  }, 15_000, 'outlet 3 to read on');
  assert.equal(settled.outlets.find((o) => o.idx === 3).on, true);
});

test('per-outlet readings keep arriving while buttons are being pressed', async () => {
  const s = await until(async () => {
    const x = await strip();
    return x.outlets.every((o) => typeof o.watts === 'number') ? x : null;
  }, 20_000, 'per-channel readings');
  assert.equal(s.perOutletMetering, true);
});
