// MQTT transport for strips running OpenBeken (Tasmota-compatible topics) or
// ESPHome's MQTT client. This is one implementation of the transport contract
// described in docs/04-app-architecture.md; the rest of the server does not
// know MQTT exists.
//
//   <prefix>/connected      online | offline   (retained last will)
//   <prefix>/<n>/get        1 | 0              relay state, published on change
//   <prefix>/<n>/set        1 | 0              relay command
//   <prefix>/ip             192.168.1.42
//   <prefix>/rssi           -58
//   tele/<prefix>/SENSOR    {"ENERGY":{"Power":..,"Voltage":..,"Current":..}}

import mqtt from 'mqtt';
import { config } from './config.js';
import { logger } from './log.js';
import {
  applyState, applyTelemetry, createStrip, getStrip, setNetInfo, setOnline, stripByPrefix,
} from './devices.js';
import { recordEvent } from './db.js';
import { recordReading } from './energy.js';

const log = logger('mqtt');

let client = null;
let onChange = () => {};
const pending = new Map(); // `${stripId}:${channel}` -> {timer, want}

export function connectBridge(changeCallback) {
  onChange = changeCallback;
  client = mqtt.connect(config.mqttUrl, {
    username: config.mqttUsername,
    password: config.mqttPassword,
    clientId: `powercord-server-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5_000,
    will: undefined,
  });

  client.on('connect', () => {
    log.info(`connected to ${config.mqttUrl}`);
    client.subscribe(['+/connected', '+/+/get', '+/ip', '+/rssi', 'tele/+/SENSOR'], (err) => {
      if (err) log.error('subscribe failed:', err.message);
    });
    onChange();
  });

  client.on('reconnect', () => log.warn('reconnecting to broker...'));
  client.on('error', (err) => log.error(err.message));
  client.on('message', (topic, payload) => {
    try {
      handleMessage(topic, payload.toString());
    } catch (err) {
      log.error(`while handling ${topic}:`, err.message);
    }
  });

  return client;
}

export function bridgeStatus() {
  return { connected: !!client?.connected, url: config.mqttUrl };
}

/* --------------------------------------------------------------- inbound */

function ensureStrip(prefix) {
  const existing = stripByPrefix(prefix);
  if (existing) return existing;
  if (!config.autoDiscover) return null;
  return createStrip({
    deviceId: prefix,
    topicPrefix: prefix,
    name: prefix,
    // Capabilities start conservative and are widened by what the strip
    // actually reports. A strip that never sends telemetry never grows an
    // energy tab, which is the correct outcome for hardware with no meter.
    hasMetering: false,
  });
}

function handleMessage(topic, text) {
  const parts = topic.split('/');

  // tele/<prefix>/SENSOR
  if (parts.length === 3 && parts[0] === 'tele' && parts[2] === 'SENSOR') {
    const strip = ensureStrip(parts[1]);
    if (!strip) return;
    let json;
    try { json = JSON.parse(text); } catch { return; }
    const e = json.ENERGY || json.Energy || json;
    const watts = num(e.Power ?? e.power);
    const volts = num(e.Voltage ?? e.voltage);
    const amps = num(e.Current ?? e.current);
    if (watts === undefined && volts === undefined && amps === undefined) return;
    applyTelemetry(strip.id, { watts, volts, amps });
    if (watts !== undefined) recordReading(strip.id, watts);
    onChange();
    return;
  }

  // <prefix>/connected
  if (parts.length === 2 && parts[1] === 'connected') {
    const online = /online|1|true/i.test(text);
    const strip = online ? ensureStrip(parts[0]) : stripByPrefix(parts[0]);
    if (!strip) return;
    if (setOnline(strip.id, online)) {
      log.info(`${strip.device_id} is ${online ? 'online' : 'offline'}`);
      onChange();
    }
    return;
  }

  // <prefix>/ip | <prefix>/rssi
  if (parts.length === 2 && (parts[1] === 'ip' || parts[1] === 'rssi')) {
    const strip = stripByPrefix(parts[0]);
    if (!strip) return;
    setNetInfo(strip.id, parts[1] === 'ip' ? { ip: text } : { rssi: Number(text) });
    return;
  }

  // <prefix>/<channel>/get  — also matches voltage/current/power pseudo-channels
  if (parts.length === 3 && parts[2] === 'get') {
    const strip = stripByPrefix(parts[0]);
    if (!strip) return;
    const channel = parts[1];

    if (channel === 'voltage' || channel === 'current' || channel === 'power') {
      const v = num(text);
      if (v === undefined) return;
      const key = channel === 'voltage' ? 'volts' : channel === 'current' ? 'amps' : 'watts';
      applyTelemetry(strip.id, { [key]: v });
      if (key === 'watts') recordReading(strip.id, v);
      onChange();
      return;
    }

    const idx = Number(channel);
    if (!Number.isInteger(idx)) return;
    const on = /^(1|on|true)$/i.test(text.trim());
    resolvePending(strip.id, idx, on);
    if (applyState(strip.id, idx, on)) onChange();
  }
}

const num = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/* -------------------------------------------------------------- outbound */

/**
 * Publish a relay command and arm the reconciliation timer. A command that goes
 * unconfirmed past the window raises `command.failed` so the UI reverts rather
 * than leaving a user believing a heater is off when it is on.
 */
export function setOutlet(stripId, channel, on) {
  const strip = getStrip(stripId);
  if (!strip) throw new Error('unknown strip');
  if (!client?.connected) throw new Error('broker unreachable');
  if (!strip.online) throw new Error('strip offline');

  const topic = `${strip.topic_prefix}/${channel}/set`;
  client.publish(topic, on ? '1' : '0', { qos: 1 });

  const key = `${stripId}:${channel}`;
  clearTimeout(pending.get(key)?.timer);
  pending.set(key, {
    want: on,
    timer: setTimeout(() => {
      pending.delete(key);
      recordEvent('command.failed', stripId, `channel ${channel} -> ${on ? 'on' : 'off'}`);
      log.warn(`no confirmation for ${topic} within ${config.commandTimeoutMs}ms`);
      onChange({ commandFailed: { stripId, channel, want: on } });
    }, config.commandTimeoutMs),
  });
}

function resolvePending(stripId, channel, on) {
  const key = `${stripId}:${channel}`;
  const p = pending.get(key);
  if (p && p.want === on) {
    clearTimeout(p.timer);
    pending.delete(key);
  }
}

export function setAll(stripId, on) {
  const strip = getStrip(stripId);
  if (!strip) throw new Error('unknown strip');
  for (let i = 1; i <= strip.outlet_count; i++) setOutlet(stripId, i, on);
}

/** Escape hatch for anything the REST surface does not model. */
export function sendCommand(stripId, command, args = '') {
  const strip = getStrip(stripId);
  if (!strip || !client?.connected) throw new Error('unavailable');
  client.publish(`cmnd/${strip.topic_prefix}/${command}`, String(args));
}
