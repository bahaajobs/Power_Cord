// A virtual stock-firmware MTTL / LG U+ strip.
//
// Unlike the re-flashed simulator, this one DIALS OUT: it opens a TCP session
// to the server and speaks the `up:` line protocol, exactly as the real strip
// does after provisioning. That direction is the whole point — nothing has to
// be opened on a home router.
//
//   node sim/mttl-sim.js                    one strip → 127.0.0.1:10086
//   PC_MTTL_SIM_COUNT=3 node sim/mttl-sim.js
//   PC_MTTL_SIM_HOST=1.2.3.4 node sim/mttl-sim.js
//
// It also models what the real device does that a naive implementation would
// miss: per-channel metering, NUL-padded frames, CRLF endings, physical button
// events, and reconnecting after the server goes away.

import { connect } from 'node:net';

const host = process.env.PC_MTTL_SIM_HOST || '127.0.0.1';
const port = Number(process.env.PC_MTTL_SIM_PORT || 10086);
const count = Number(process.env.PC_MTTL_SIM_COUNT || 1);
const model = process.env.PC_MTTL_SIM_MODEL || 'lgutap';
const fw = process.env.PC_MTTL_SIM_FW || '0.1.54-1.0.66';

const APPLIANCES = [
  ['fridge', 120, 0.35], ['TV', 95, 1], ['router', 9, 1], ['fan', 55, 1],
];

function makeStrip(n) {
  const mac = `91C0C4${(0x100000 + n * 0x2f31).toString(16).toUpperCase().slice(-6)}`.slice(0, 12);
  return {
    mac,
    outlets: [1, 2, 3, 4].map((ch) => ({
      ch, on: false, appliance: APPLIANCES[(ch - 1 + n) % APPLIANCES.length],
      phase: Math.random(), wh: Math.floor(Math.random() * 4000),
    })),
    socket: null,
  };
}

const strips = Array.from({ length: count }, (_, i) => makeStrip(i));

const watts = (o) => {
  if (!o.on) return 0;
  const [, steady, duty] = o.appliance;
  const cycling = duty >= 1 ? 1
    : (Math.sin(Date.now() / 90_000 + o.phase * 6.28) > 1 - 2 * duty ? 1 : 0.08);
  return Math.max(0, steady * cycling + (Math.random() - 0.5) * 6);
};

const hex8 = (n) => Math.max(0, Math.floor(n)).toString(16).toUpperCase().padStart(8, '0');

function getinfoFrame(s) {
  // The real firmware emits one segment per channel plus an aggregate at 5,
  // and pads the frame with NUL bytes.
  // PC_MTTL_SIM_FAULT=overload:2 makes channel 2 report an overload, so the
  // path that reacts to the device's own verdict can be tested.
  const [faultKind, faultCh] = (process.env.PC_MTTL_SIM_FAULT || '').split(':');
  const seg = (ch, on, mW, wh, temp) => {
    const over = faultKind === 'overload' && String(ch) === faultCh ? 'yes' : 'none';
    const heat = faultKind === 'overheat' && String(ch) === faultCh ? 'yes' : 'none';
    return `${ch}:3600;${on ? 'on' : 'off'};0;${over};${heat};${Math.round(mW)};${hex8(wh)};${hex8(0)};${hex8(0)};ok;00;${temp}`;
  };
  const parts = s.outlets.map((o) => seg(o.ch, o.on, watts(o) * 1000, o.wh, 28 + Math.round(Math.random() * 3)));
  const totalW = s.outlets.reduce((a, o) => a + watts(o), 0);
  const totalWh = s.outlets.reduce((a, o) => a + o.wh, 0);
  parts.push(seg(5, s.outlets.some((o) => o.on), totalW * 1000, totalWh, 30));
  return `up:getinfo:${parts.join(':')}`;
}

function dial(s) {
  const socket = connect(port, host);
  s.socket = socket;
  let buffer = '';

  socket.on('connect', () => {
    console.log(`[mttl-sim] ${s.mac} connected to ${host}:${port}`);
    send(s, `up:bootinfo:${model};${s.mac};${s.mac};${fw};connect`);
  });

  socket.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    let i;
    while ((i = buffer.search(/\r?\n/)) !== -1) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + (buffer[i] === '\r' ? 2 : 1));
      if (line) handle(s, line);
    }
  });

  socket.on('error', () => {});
  socket.on('close', () => {
    s.socket = null;
    // The real strip re-dials on its own after the server restarts.
    setTimeout(() => dial(s), 2000);
  });
}

function send(s, line) {
  if (!s.socket?.writable) return;
  // Pad with NUL like the firmware does, to prove the parser strips them.
  s.socket.write(`${line}\0\0\r\n`);
}

function handle(s, line) {
  if (/^up:getinfo:all$/i.test(line)) { send(s, getinfoFrame(s)); return; }

  const onoff = /^up:onoff:([1-4]):(on|off)$/i.exec(line);
  if (onoff) {
    const o = s.outlets.find((x) => x.ch === Number(onoff[1]));
    if (!o) return;
    // Real relays take tens of milliseconds and the firmware acknowledges only
    // after they have actually moved.
    setTimeout(() => {
      o.on = onoff[2].toLowerCase() === 'on';
      send(s, `up:onoff:${o.ch}:${o.on ? 'on' : 'off'}`);
      send(s, getinfoFrame(s));
      console.log(`[mttl-sim] ${s.mac} channel ${o.ch} -> ${o.on ? 'ON' : 'off'}`);
    }, 40 + Math.random() * 80);
    return;
  }

  if (/^up:power_report:1:vol$/i.test(line)) {
    send(s, `up:power_report:1:${Math.round((219 + Math.random() * 4) * 1000)}`);
    return;
  }
  if (/^up:query:wifirssi$/i.test(line)) {
    send(s, `up:query:${-45 - Math.floor(Math.random() * 25)}`);
  }
}

for (const s of strips) dial(s);

// Energy accumulates, so the server's history has something real to record.
setInterval(() => {
  for (const s of strips) for (const o of s.outlets) o.wh += (watts(o) * 5) / 3600;
}, 5000);

// Occasionally someone walks over and presses a button.
if (process.env.PC_MTTL_SIM_BUTTONS !== '0') {
  setInterval(() => {
    const s = strips[Math.floor(Math.random() * strips.length)];
    const o = s.outlets[Math.floor(Math.random() * s.outlets.length)];
    o.on = !o.on;
    send(s, `up:event:onoff:${o.ch}:${o.on ? 'on' : 'off'}`);
    console.log(`[mttl-sim] ${s.mac} BUTTON channel ${o.ch} -> ${o.on ? 'ON' : 'off'}`);
  }, Number(process.env.PC_MTTL_SIM_BUTTON_MS || 45_000));
}

// Deterministic master press for tests: one event on channel 0, once.
if (process.env.PC_MTTL_SIM_MASTER_AFTER_MS) {
  setTimeout(() => {
    const s = strips[0];
    const on = !s.outlets.every((o) => o.on);
    for (const o of s.outlets) o.on = on;
    send(s, `up:event:onoff:0:${on ? 'on' : 'off'}`);
    console.log(`[mttl-sim] ${s.mac} MASTER BUTTON -> ${on ? 'ON' : 'off'}`);
  }, Number(process.env.PC_MTTL_SIM_MASTER_AFTER_MS));
}

console.log(`[mttl-sim] ${count} stock-firmware strip(s) dialling ${host}:${port}`);
console.log(`[mttl-sim] MACs: ${strips.map((s) => s.mac).join(', ')}`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { for (const s of strips) s.socket?.destroy(); process.exit(0); });
}
