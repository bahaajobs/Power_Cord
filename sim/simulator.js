// Virtual multi-tap. Speaks the same MQTT topics as a strip running OpenBeken,
// so the server, the API and the web app can be exercised end to end without
// hardware — and so you can tell a real bug from a wiring problem.
//
//   node sim/simulator.js                       one strip, 4 outlets + USB
//   PC_SIM_COUNT=3 node sim/simulator.js        three strips
//   PC_SIM_METERING=0 node sim/simulator.js     no energy meter, like cheaper units
//
// The load model matters: appliances are not constant loads, and a standby
// cutoff that trips on a fridge between compressor cycles is a bug you want to
// find here rather than in someone's kitchen.

import mqtt from 'mqtt';

const url = process.env.PC_MQTT_URL || 'mqtt://127.0.0.1:1883';
const count = Number(process.env.PC_SIM_COUNT || 1);
const metering = process.env.PC_SIM_METERING !== '0';
const telemetryMs = Number(process.env.PC_SIM_TELEMETRY_MS || 10_000);

// [name, steady watts, duty cycle 0-1, jitter watts]
const APPLIANCES = [
  ['fridge', 120, 0.35, 12],
  ['TV', 95, 1, 8],
  ['router', 9, 1, 1],
  ['fan', 55, 1, 5],
  ['charger', 12, 1, 3],
];

function makeStrip(n) {
  // A stable, plausible-looking device id in the same shape as the real ones.
  const id = `88D039${(0x100000 + n * 0x1d4c3).toString(16).toUpperCase().slice(-6)}`;
  const outlets = [1, 2, 3, 4].map((idx) => ({
    idx, on: false, appliance: APPLIANCES[(idx - 1 + n) % APPLIANCES.length], phase: Math.random(),
  }));
  return { id, prefix: id, outlets, usb: { idx: 5, on: true }, client: null };
}

const strips = Array.from({ length: count }, (_, i) => makeStrip(i));

for (const strip of strips) {
  const client = mqtt.connect(url, {
    clientId: strip.prefix,
    will: { topic: `${strip.prefix}/connected`, payload: 'offline', qos: 1, retain: true },
    reconnectPeriod: 3000,
  });
  strip.client = client;

  client.on('connect', () => {
    console.log(`[sim] ${strip.id} online`);
    client.publish(`${strip.prefix}/connected`, 'online', { qos: 1, retain: true });
    client.publish(`${strip.prefix}/ip`, `192.168.1.${40 + strips.indexOf(strip)}`, { retain: true });
    client.publish(`${strip.prefix}/rssi`, String(-45 - Math.floor(Math.random() * 25)), { retain: true });
    client.subscribe(`${strip.prefix}/+/set`);
    client.subscribe(`cmnd/${strip.prefix}/+`);
    publishAllStates(strip);
  });

  client.on('message', (topic, payload) => {
    const parts = topic.split('/');
    const text = payload.toString().trim();

    if (parts[0] === 'cmnd') {
      if (/^powerAll$/i.test(parts[2])) {
        const on = /^(1|on|true)$/i.test(text);
        for (const o of strip.outlets) o.on = on;
        publishAllStates(strip);
      }
      return;
    }

    const channel = Number(parts[1]);
    if (parts[2] !== 'set' || !Number.isInteger(channel)) return;
    const on = /^(1|on|true)$/i.test(text);

    const target = channel === strip.usb.idx ? strip.usb : strip.outlets.find((o) => o.idx === channel);
    if (!target) return;

    // Real relays take a few tens of milliseconds to close and the firmware
    // confirms only after they have. Keeping that delay here is what makes the
    // app's 3-second reconciliation window meaningful to test.
    setTimeout(() => {
      target.on = on;
      publishState(strip, channel, on);
      console.log(`[sim] ${strip.id} channel ${channel} -> ${on ? 'ON' : 'off'}`);
    }, 40 + Math.random() * 80);
  });

  client.on('error', (err) => console.error(`[sim] ${strip.id}:`, err.message));
}

function publishState(strip, channel, on) {
  strip.client.publish(`${strip.prefix}/${channel}/get`, on ? '1' : '0', { qos: 1, retain: true });
}

function publishAllStates(strip) {
  for (const o of strip.outlets) publishState(strip, o.idx, o.on);
  publishState(strip, strip.usb.idx, strip.usb.on);
}

function stripWatts(strip) {
  let total = 0;
  for (const o of strip.outlets) {
    if (!o.on) continue;
    const [, steady, duty, jitter] = o.appliance;
    // Slow square wave for cycling loads (a fridge compressor), so standby
    // detection has to cope with something other than a flat line.
    const cycling = duty >= 1 ? 1 : (Math.sin(Date.now() / 90_000 + o.phase * 6.28) > 1 - 2 * duty ? 1 : 0.08);
    total += steady * cycling + (Math.random() - 0.5) * jitter;
  }
  if (strip.usb.on) total += 2.5 + Math.random();
  total += 0.6; // the strip's own always-on logic supply
  return Math.max(0, Math.round(total * 10) / 10);
}

if (metering) {
  setInterval(() => {
    for (const strip of strips) {
      if (!strip.client?.connected) continue;
      const watts = stripWatts(strip);
      const volts = Math.round((219 + Math.random() * 4) * 10) / 10;
      const amps = Math.round((watts / volts) * 1000) / 1000;
      strip.client.publish(`tele/${strip.prefix}/SENSOR`, JSON.stringify({
        Time: new Date().toISOString(),
        ENERGY: { Power: watts, Voltage: volts, Current: amps },
      }));
    }
  }, telemetryMs);
  console.log(`[sim] metering on, telemetry every ${telemetryMs / 1000}s`);
} else {
  console.log('[sim] metering off — these strips report no energy data');
}

console.log(`[sim] ${count} virtual strip(s) against ${url}`);
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
