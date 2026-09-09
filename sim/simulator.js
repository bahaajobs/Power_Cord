// Virtual multi-taps. Each one speaks both transports a real flashed strip
// speaks:
//
//   * MQTT, the way OpenBeken publishes to a broker  (server mode)
//   * HTTP /cm?cmnd=..., Tasmota's command endpoint  (direct mode)
//
// so the app can be exercised end to end with no hardware, and a bug can be
// told apart from a wiring problem.
//
//   node sim/simulator.js                     2 strips, HTTP on 8101, 8102
//   PC_SIM_COUNT=5 node sim/simulator.js      five of them
//   PC_SIM_METERING=0 node sim/simulator.js   no meter, like the cheaper units
//
// The load model matters: appliances cycle, so a standby rule that would
// misfire on a real fridge misfires here first, where it costs nothing.

import mqtt from 'mqtt';
import { createServer } from 'node:http';

const url = process.env.PC_MQTT_URL || 'mqtt://127.0.0.1:1883';
const count = Number(process.env.PC_SIM_COUNT || 2);
const metering = process.env.PC_SIM_METERING !== '0';
const telemetryMs = Number(process.env.PC_SIM_TELEMETRY_MS || 10_000);
const httpBase = Number(process.env.PC_SIM_HTTP_PORT || 8101);
const useMqtt = process.env.PC_SIM_MQTT !== '0';
const authUser = process.env.PC_SIM_USER || '';
const authPass = process.env.PC_SIM_PASS || '';

// [name, steady watts, duty cycle, jitter]
const APPLIANCES = [
  ['fridge', 120, 0.35, 12], ['TV', 95, 1, 8], ['router', 9, 1, 1],
  ['fan', 55, 1, 5], ['charger', 12, 1, 3],
];

function makeStrip(n) {
  const id = `88D039${(0x100000 + n * 0x1d4c3).toString(16).toUpperCase().slice(-6)}`;
  return {
    id, prefix: id, httpPort: httpBase + n,
    outlets: [1, 2, 3, 4].map((idx) => ({
      idx, on: false, appliance: APPLIANCES[(idx - 1 + n) % APPLIANCES.length], phase: Math.random(),
    })),
    usb: { idx: 5, on: true },
    energy: { total: Math.round(Math.random() * 40 * 100) / 100, today: 0, yesterday: 0.4 },
    client: null,
  };
}

const strips = Array.from({ length: count }, (_, i) => makeStrip(i));
const chan = (s, i) => (i === s.usb.idx ? s.usb : s.outlets.find((o) => o.idx === i));

function watts(s) {
  let total = 0;
  for (const o of s.outlets) {
    if (!o.on) continue;
    const [, steady, duty, jitter] = o.appliance;
    const cycling = duty >= 1 ? 1
      : (Math.sin(Date.now() / 90_000 + o.phase * 6.28) > 1 - 2 * duty ? 1 : 0.08);
    total += steady * cycling + (Math.random() - 0.5) * jitter;
  }
  if (s.usb.on) total += 2.5 + Math.random();
  return Math.max(0, Math.round((total + 0.6) * 10) / 10);
}

const volts = () => Math.round((219 + Math.random() * 4) * 10) / 10;

/* --------------------------------------------------------------- HTTP */

function stateJson(s) {
  const out = { Time: new Date().toISOString().slice(0, 19), Uptime: '0T01:00:00' };
  for (const o of s.outlets) out[`POWER${o.idx}`] = o.on ? 'ON' : 'OFF';
  out[`POWER${s.usb.idx}`] = s.usb.on ? 'ON' : 'OFF';
  out.Wifi = { AP: 1, SSId: 'sim', RSSI: 62, Signal: -55 };
  return out;
}

function sensorJson(s) {
  if (!metering) return { StatusSNS: { Time: new Date().toISOString().slice(0, 19) } };
  const w = watts(s);
  const v = volts();
  return {
    StatusSNS: {
      Time: new Date().toISOString().slice(0, 19),
      ENERGY: {
        // Accumulators are what the app's local history reconciles against —
        // this is how a phone that was closed all afternoon still gets the
        // right daily figure.
        Total: Math.round(s.energy.total * 1000) / 1000,
        Yesterday: s.energy.yesterday,
        Today: Math.round(s.energy.today * 1000) / 1000,
        Power: w, Voltage: v, Current: Math.round((w / v) * 1000) / 1000,
      },
    },
  };
}

function runCommand(s, raw) {
  const cmd = String(raw || '').trim();

  if (/^backlog/i.test(cmd)) {
    for (const part of cmd.replace(/^backlog\s*/i, '').split(';')) {
      if (part.trim()) runCommand(s, part.trim());
    }
    return {};
  }
  const power = /^POWER(\d*)\s*(ON|OFF|TOGGLE)?$/i.exec(cmd);
  if (power) {
    const idx = power[1] === '' ? 1 : Number(power[1]);
    const target = chan(s, idx);
    if (!target) return { Command: 'Unknown' };
    const verb = (power[2] || '').toUpperCase();
    if (verb === 'ON') target.on = true;
    else if (verb === 'OFF') target.on = false;
    else if (verb === 'TOGGLE') target.on = !target.on;
    return { [`POWER${idx}`]: target.on ? 'ON' : 'OFF' };
  }
  if (/^status\s*8$/i.test(cmd)) return sensorJson(s);
  if (/^status\s*0?$/i.test(cmd)) {
    return {
      Status: { DeviceName: `Sim ${s.id}`, FriendlyName: [`Sim ${s.id}`], Power: 0 },
      StatusFWR: { Version: 'OpenBK7231N_sim' },
      StatusNET: { Mac: s.id, IPAddress: '127.0.0.1' },
      ...sensorJson(s),
    };
  }
  if (/^state$/i.test(cmd)) return stateJson(s);
  return { Command: 'Unknown' };
}

for (const s of strips) {
  createServer((req, res) => {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // The real firmware does NOT send CORS headers — that is exactly why
    // direct control needs the Android app rather than a browser tab. These
    // are here only so the UI can be exercised in a desktop browser.
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    if (u.pathname !== '/cm') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    if (authUser && (u.searchParams.get('user') !== authUser || u.searchParams.get('password') !== authPass)) {
      res.writeHead(401, { 'content-type': 'application/json' })
        .end(JSON.stringify({ WARNING: 'Need user=&password=' }));
      return;
    }

    const body = JSON.stringify(runCommand(s, u.searchParams.get('cmnd')));
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  }).listen(s.httpPort, '127.0.0.1', () => {
    console.log(`[sim] ${s.id} HTTP on http://127.0.0.1:${s.httpPort}/cm`);
  });
}

/* --------------------------------------------------------------- MQTT */

if (useMqtt) {
  for (const s of strips) {
    const client = mqtt.connect(url, {
      clientId: s.prefix,
      will: { topic: `${s.prefix}/connected`, payload: 'offline', qos: 1, retain: true },
      reconnectPeriod: 3000,
    });
    s.client = client;

    client.on('connect', () => {
      console.log(`[sim] ${s.id} MQTT online`);
      client.publish(`${s.prefix}/connected`, 'online', { qos: 1, retain: true });
      client.publish(`${s.prefix}/ip`, `192.168.1.${40 + strips.indexOf(s)}`, { retain: true });
      client.publish(`${s.prefix}/rssi`, String(-45 - Math.floor(Math.random() * 25)), { retain: true });
      client.subscribe(`${s.prefix}/+/set`);
      client.subscribe(`cmnd/${s.prefix}/+`);
      publishAll(s);
    });

    client.on('message', (topic, payload) => {
      const parts = topic.split('/');
      const text = payload.toString().trim();
      if (parts[0] === 'cmnd') {
        if (/^powerAll$/i.test(parts[2])) {
          const on = /^(1|on|true)$/i.test(text);
          for (const o of s.outlets) o.on = on;
          publishAll(s);
        }
        return;
      }
      const c = Number(parts[1]);
      if (parts[2] !== 'set' || !Number.isInteger(c)) return;
      const target = chan(s, c);
      if (!target) return;
      const on = /^(1|on|true)$/i.test(text);
      // Real relays take tens of milliseconds and the firmware confirms only
      // afterwards. Keeping that delay is what makes the app's reconciliation
      // window meaningful to test.
      setTimeout(() => {
        target.on = on;
        pub(s, c, on);
        console.log(`[sim] ${s.id} channel ${c} -> ${on ? 'ON' : 'off'}`);
      }, 40 + Math.random() * 80);
    });

    client.on('error', (err) => console.error(`[sim] ${s.id}:`, err.message));
  }
}

const pub = (s, c, on) => s.client?.publish(`${s.prefix}/${c}/get`, on ? '1' : '0', { qos: 1, retain: true });
function publishAll(s) {
  for (const o of s.outlets) pub(s, o.idx, o.on);
  pub(s, s.usb.idx, s.usb.on);
}

/* ------------------------------------------------------------ telemetry */

if (metering) {
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dtH = (now - last) / 3_600_000;
    last = now;
    for (const s of strips) {
      const w = watts(s);
      const kwh = (w * dtH) / 1000;
      s.energy.total += kwh;
      s.energy.today += kwh;
      if (s.client?.connected) {
        const v = volts();
        s.client.publish(`tele/${s.prefix}/SENSOR`, JSON.stringify({
          Time: new Date().toISOString(),
          ENERGY: { Power: w, Voltage: v, Current: Math.round((w / v) * 1000) / 1000,
                    Total: Math.round(s.energy.total * 1000) / 1000,
                    Today: Math.round(s.energy.today * 1000) / 1000 },
        }));
      }
    }
  }, telemetryMs);
  console.log(`[sim] metering on, telemetry every ${telemetryMs / 1000}s`);
} else {
  console.log('[sim] metering off — these strips report no energy data');
}

console.log(`[sim] ${count} strip(s); direct HTTP ports ${strips.map((s) => s.httpPort).join(', ')}`);
console.log(`[sim] device ids: ${strips.map((s) => s.id).join(', ')}`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const s of strips) {
      s.client?.publish(`${s.prefix}/connected`, 'offline', { qos: 1, retain: true });
      s.client?.end(true);
    }
    setTimeout(() => process.exit(0), 200);
  });
}
