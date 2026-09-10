// Exercises the direct transport — the app talking to a strip's own web
// server, with no broker and no server in between — against the HTTP
// simulator, which answers exactly as OpenBeken does.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8791;
const HOST = `127.0.0.1:${PORT}`;

const direct = await import('../web/js/direct.js');
let sim;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForPort(port, timeoutMs = 15_000) {
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

before(async () => {
  sim = spawn(process.execPath, ['sim/simulator.js'], {
    cwd: root,
    env: { ...process.env, PC_SIM_MQTT: '0', PC_SIM_COUNT: '1', PC_SIM_HTTP_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  sim.stdout.on('data', () => {});
  sim.stderr.on('data', () => {});
  await waitForPort(PORT);
});

after(() => { sim?.kill('SIGKILL'); });

const dev = () => ({ lanHost: HOST });

test('a probe identifies a strip and counts its channels', async () => {
  const r = await direct.probe(HOST, { timeoutMs: 4000 });
  assert.equal(r.channelCount, 5);            // 4 outlets + the USB rail
  assert.match(r.firmware || '', /OpenBK/);
  assert.equal(r.via, 'lan');
});

test('polling returns relay states and energy', async () => {
  const s = await direct.poll(dev());
  assert.equal(s.online, true);
  assert.equal(Object.keys(s.channels).length, 5);
  assert.equal(typeof s.channels[1], 'boolean');
  assert.ok(s.energy, 'the simulator reports metering');
  assert.ok(s.energy.volts > 210 && s.energy.volts < 235, `volts ${s.energy.volts}`);
  // The device's own accumulators are what local history reconciles against.
  assert.equal(typeof s.energy.totalKwh, 'number');
  assert.equal(typeof s.energy.todayKwh, 'number');
});

test('setting a channel returns the state the device actually reached', async () => {
  assert.equal(await direct.setChannel(dev(), 1, true), true);
  assert.equal((await direct.poll(dev())).channels[1], true);
  assert.equal(await direct.setChannel(dev(), 1, false), false);
  assert.equal((await direct.poll(dev())).channels[1], false);
});

test('setAll switches every outlet in one request', async () => {
  await direct.setAll(dev(), [1, 2, 3, 4], true);
  const s = await direct.poll(dev());
  for (const c of [1, 2, 3, 4]) assert.equal(s.channels[c], true, `channel ${c}`);
  await direct.setAll(dev(), [1, 2, 3, 4], false);
  const off = await direct.poll(dev());
  for (const c of [1, 2, 3, 4]) assert.equal(off.channels[c], false, `channel ${c}`);
});

test('an unreachable address fails rather than hanging', async () => {
  await assert.rejects(
    () => direct.poll({ lanHost: '127.0.0.1:8799' }, { timeoutMs: 800 }),
    (e) => typeof e.message === 'string',
  );
});

test('a device with no address configured is refused', async () => {
  await assert.rejects(() => direct.command({}, 'STATE'), /no address/);
});

test('the remote address is used when the LAN one does not answer', async () => {
  // This is what walking out of the house looks like: the home address stops
  // answering and the forwarded one takes over, with no user action.
  const s = await direct.poll({ lanHost: '127.0.0.1:8799', remoteHost: HOST }, { timeoutMs: 900 });
  assert.equal(s.online, true);
  assert.equal(s.via, 'remote');
});

test('lastGood puts the previously working address first', async () => {
  const s = await direct.poll({ lanHost: HOST, remoteHost: HOST, lastGood: 'remote' });
  assert.equal(s.via, 'remote');
});

test('host strings are accepted with or without scheme and port', async () => {
  for (const h of [HOST, `http://${HOST}`, `http://${HOST}/`]) {
    const s = await direct.poll({ lanHost: h }, { timeoutMs: 4000 });
    assert.equal(s.online, true, h);
  }
});

test('setAllOutlets preserves locked outlets', async () => {
  if (!globalThis.localStorage) {
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      clear: () => mem.clear(),
    };
  }
  const store = await import('../web/js/store.js');
  const engine = await import('../web/js/engine.js');

  const dev = store.addDevice({ name: 'LockedStrip', lanHost: HOST, outletCount: 4 });
  store.updateOutlet(dev.id, 2, { locked: true });

  // Turn outlet 2 ON first
  await direct.setChannel(dev, 2, true);
  await engine.pollOne(dev);
  assert.equal(engine.stateOf(dev.id).channels[2], true);

  // Turn all off: outlet 2 must remain ON because it is locked
  await engine.setAllOutlets(dev.id, false);
  assert.equal(engine.stateOf(dev.id).channels[2], true);
  assert.equal(engine.stateOf(dev.id).channels[1], false);
  assert.equal(engine.stateOf(dev.id).channels[3], false);
  assert.equal(engine.stateOf(dev.id).channels[4], false);

  store.removeDevice(dev.id);
});

test('setOutlet reverts optimistic state when strip is unreachable', async () => {
  if (!globalThis.localStorage) {
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      clear: () => mem.clear(),
    };
  }
  const store = await import('../web/js/store.js');
  const engine = await import('../web/js/engine.js');

  const unreach = store.addDevice({ name: 'UnreachStrip', lanHost: '127.0.0.1:8799', outletCount: 4 });
  const cur = engine.stateOf(unreach.id);
  cur.channels = { 1: false };

  await assert.rejects(
    () => engine.setOutlet(unreach.id, 1, true),
  );
  // Reverts channel 1 back to false
  assert.equal(engine.stateOf(unreach.id).channels[1], false);

  store.removeDevice(unreach.id);
});

