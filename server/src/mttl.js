/* MTTL / LG U+ "lgutap" transport — stock firmware, no flashing.
 *
 * This is the second inbound transport, alongside the MQTT bridge. It exists
 * because these strips do not have to be re-flashed at all: the stock firmware
 * stores ONE server address in flash, dials it on TCP 10086, and speaks a
 * plain-text line protocol. Re-pointing that address is a two-line exchange
 * over the strip's own setup access point — no case opened, no UART, no
 * cloudcutter, no voided certification.
 *
 * The strip connects OUT to us. That is the useful part: nothing is opened on
 * the home router, and the same server works on a LAN or a public VPS, which
 * is a better answer to CGNAT than the port forward in docs/13.
 *
 * Protocol credit: the wire format was documented by the `powerk` project
 * (github.com/bahaajobs/powerk, by Ahmed Tohamy), which has no licence file.
 * This is an independent implementation of the protocol — a factual
 * description of how a device communicates — and shares no code with it.
 *
 *   strip → us   up:bootinfo:<model>;<mac>;<mac>;<fw>;connect
 *                up:getinfo:<ch>:<runtime>;<on|off>;<state>;<overload>;
 *                  <overheat>;<mW>;<Wh hex>;<prev hex>;<cfg hex>;<status>;
 *                  <event hex>;<°C>            (repeated per channel)
 *                up:power_report:<ch>:<mV or mA>
 *                up:query:<rssi>
 *                up:event:onoff:<0-4>:on|off   (someone pressed a button)
 *   us → strip   up:getinfo:all
 *                up:onoff:<1-4>:on|off         (there is no channel 0)
 *                up:power_report:1:vol
 *                up:query:wifirssi
 */

import { createServer } from 'node:net';
import { config } from './config.js';
import { logger } from './log.js';
import {
  applyState, applyTelemetry, createStrip, getStrip, setNetInfo, setOnline, stripByPrefix,
} from './devices.js';
import { db, recordEvent } from './db.js';
import { recordReading } from './energy.js';

const log = logger('mttl');

const BOOTINFO = /^up:bootinfo:([^;]+);([0-9A-Fa-f]{12});([0-9A-Fa-f]{12});([^;]+);connect$/;
const GETINFO = new RegExp(
  '([1-5]):(-?\\d+);(on|off);(-?\\d+);([^;:]*);([^;:]*);(-?\\d+);' +
  '([0-9A-Fa-f]{8});([0-9A-Fa-f]{8});([0-9A-Fa-f]{8});([^;:]*);([0-9A-Fa-f]{2});(-?\\d+)',
  'gi',
);
const EVENT = /^up:event:onoff:([0-4]):(on|off)$/i;
const ONOFF_ACK = /^up:onoff:([1-4]):(on|off)$/i;
const POWER_REPORT = /^up:power_report:([1-5]):(-?\d+)$/i;
const QUERY = /^up:query:(-?\d+)$/;

/** Voltage and current share one frame; the firmware distinguishes them by scale. */
const VOLTAGE_FLOOR_MV = 50_000;

const sessions = new Map();   // stripId -> session
let server = null;
let onChange = () => {};
let pollTimer = null;
let pollTick = 0;

export function mttlStatus() {
  return { listening: !!server?.listening, port: config.mttlPort, sessions: sessions.size };
}

/** Parse one `up:getinfo:` frame into per-channel records. */
export function parseGetinfo(line) {
  const out = [];
  GETINFO.lastIndex = 0;
  let m;
  while ((m = GETINFO.exec(line)) !== null) {
    const ch = Number(m[1]);
    if (ch > 4) continue;              // channel 5 is the aggregate, not an outlet
    out.push({
      channel: ch,
      on: m[3].toLowerCase() === 'on',
      watts: Math.round((Number(m[7]) / 1000) * 100) / 100,      // mW → W
      kwh: Math.round((parseInt(m[8], 16) / 1000) * 1000) / 1000, // Wh hex → kWh
      tempC: Number(m[13]),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- server */

export function startMttl(changeCallback) {
  onChange = changeCallback || (() => {});
  if (!config.mttlEnabled) {
    log.info('disabled (set PC_MTTL_ENABLED=1 to accept stock-firmware strips)');
    return null;
  }

  server = createServer((socket) => {
    socket.setKeepAlive(true, 30_000);
    socket.setNoDelay(true);
    const ip = socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown';
    log.info(`connection from ${ip}`);

    let buffer = '';
    let stripId = null;

    socket.on('data', (chunk) => {
      // The firmware pads frames with NUL bytes and terminates with CRLF.
      buffer += chunk.toString('latin1').replace(/\0/g, '');
      if (buffer.length > 64 * 1024) { buffer = ''; socket.destroy(); return; }
      let idx;
      while ((idx = buffer.search(/\r?\n/)) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 2 : 1));
        if (!line) continue;
        try {
          stripId = handleLine(line, ip, socket, stripId);
        } catch (err) {
          log.error(`while handling ${line.slice(0, 80)}:`, err.message);
        }
      }
    });

    const drop = () => {
      if (stripId !== null && sessions.get(stripId)?.socket === socket) {
        sessions.delete(stripId);
        if (setOnline(stripId, false)) onChange();
        log.info(`${getStrip(stripId)?.device_id || stripId} disconnected`);
      }
    };
    socket.on('close', drop);
    socket.on('error', (err) => { log.warn(`socket error from ${ip}: ${err.message}`); drop(); });
  });

  server.on('error', (err) => log.error(`listener: ${err.message}`));
  server.listen(config.mttlPort, '0.0.0.0', () => {
    log.info(`listening on TCP ${config.mttlPort} for stock-firmware strips`);
  });

  pollTimer = setInterval(poll, config.mttlPollMs);
  return server;
}

export function stopMttl() {
  clearInterval(pollTimer);
  for (const s of sessions.values()) s.socket.destroy();
  sessions.clear();
  server?.close();
  server = null;
}

function send(socket, line) {
  if (socket.writable) socket.write(`${line}\r\n`);
}

function handleLine(line, ip, socket, stripId) {
  const boot = BOOTINFO.exec(line);
  if (boot) {
    const [, model, mac, , fw] = boot;
    const id = mac.toUpperCase();
    let strip = stripByPrefix(id);
    if (!strip) {
      strip = createStrip({
        deviceId: id, topicPrefix: id, name: `MTTL ${id.slice(-7)}`,
        outletCount: 4,
        // These strips have no switchable USB rail: channel 5 in the protocol
        // is an aggregate reading, not an outlet.
        hasUsb: false,
        hasMetering: true,
      });
      log.info(`registered ${id} (${model} fw ${fw})`);
    }
    db.prepare("UPDATE strips SET transport = 'mttl', per_outlet_metering = 1, ip = ? WHERE id = ?")
      .run(ip, strip.id);

    // One strip, one session: a reconnect replaces the old socket.
    const previous = sessions.get(strip.id);
    if (previous && previous.socket !== socket) previous.socket.destroy();
    sessions.set(strip.id, { socket, model, fw, ip });

    setOnline(strip.id, true);
    setNetInfo(strip.id, { ip });
    recordEvent('mttl.bootinfo', strip.id, `${model} fw ${fw}`);
    log.info(`${id} online — ${model} fw ${fw}`);

    send(socket, 'up:getinfo:all');
    send(socket, 'up:power_report:1:vol');
    send(socket, 'up:query:wifirssi');
    onChange();
    return strip.id;
  }

  if (stripId === null) {
    // Anything before bootinfo has no device to attribute it to.
    log.warn(`ignoring pre-bootinfo frame: ${line.slice(0, 60)}`);
    return null;
  }

  if (line.startsWith('up:getinfo:')) {
    const rows = parseGetinfo(line);
    if (rows.length === 0) return stripId;
    let changed = false;
    let total = 0;
    const stmt = db.prepare(
      'UPDATE outlets SET power_w = ?, energy_kwh = ?, temp_c = ? WHERE strip_id = ? AND idx = ?',
    );
    for (const r of rows) {
      if (applyState(stripId, r.channel, r.on)) changed = true;
      stmt.run(r.watts, r.kwh, r.tempC, stripId, r.channel);
      total += r.watts;
    }
    applyTelemetry(stripId, { watts: Math.round(total * 100) / 100 });
    recordReading(stripId, total);
    if (changed) onChange(); else onChange();
    return stripId;
  }

  const ack = ONOFF_ACK.exec(line);
  if (ack) {
    if (applyState(stripId, Number(ack[1]), ack[2].toLowerCase() === 'on')) onChange();
    return stripId;
  }

  const ev = EVENT.exec(line);
  if (ev) {
    // Someone pressed a button on the strip itself. Channel 0 is the master.
    const ch = Number(ev[1]);
    const on = ev[2].toLowerCase() === 'on';
    const strip = getStrip(stripId);
    const channels = ch === 0 ? [1, 2, 3, 4].slice(0, strip?.outlet_count ?? 4) : [ch];
    let changed = false;
    for (const c of channels) if (applyState(stripId, c, on)) changed = true;
    recordEvent('mttl.button', stripId, `channel ${ch} -> ${on ? 'on' : 'off'}`);
    if (changed) onChange();
    // Ask for the authoritative picture rather than trusting the event alone.
    send(sessions.get(stripId)?.socket ?? { writable: false }, 'up:getinfo:all');
    return stripId;
  }

  const pr = POWER_REPORT.exec(line);
  if (pr) {
    const raw = Number(pr[2]);
    if (raw >= VOLTAGE_FLOOR_MV) applyTelemetry(stripId, { volts: Math.round(raw / 100) / 10 });
    else applyTelemetry(stripId, { amps: Math.round(raw) / 1000 });
    onChange();
    return stripId;
  }

  const q = QUERY.exec(line);
  if (q) {
    setNetInfo(stripId, { rssi: Number(q[1]) });
    return stripId;
  }

  return stripId;
}

/* -------------------------------------------------------------- commands */

export function setMttlOutlet(stripId, channel, on) {
  const session = sessions.get(Number(stripId));
  if (!session) throw new Error('strip offline');
  if (!Number.isInteger(channel) || channel < 1 || channel > 4) {
    throw new Error('channel must be 1-4');
  }
  send(session.socket, `up:onoff:${channel}:${on ? 'on' : 'off'}`);
}

/** There is no `up:onoff:0` in this protocol — "all" is a loop over channels. */
export function setMttlAll(stripId, on) {
  if (!sessions.has(Number(stripId))) throw new Error('strip offline');
  const strip = getStrip(stripId);
  const count = strip?.outlet_count ?? 4;
  for (let c = 1; c <= count; c++) setMttlOutlet(stripId, c, on);
}

export const isMttl = (stripId) => sessions.has(Number(stripId));

function poll() {
  pollTick++;
  for (const [stripId, session] of sessions) {
    if (!session.socket.writable) continue;
    send(session.socket, 'up:getinfo:all');
    // Voltage, current and signal change slowly; asking every time is noise.
    if (pollTick % 3 === 0) {
      send(session.socket, 'up:power_report:1:vol');
      send(session.socket, 'up:query:wifirssi');
    }
  }
}
