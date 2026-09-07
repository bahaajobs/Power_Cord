// Device repository and the shape the UI consumes. Nothing here knows about
// MQTT: the transport calls into `applyState` / `applyTelemetry`, and the API
// calls `snapshot`. Swapping transports (ESPHome REST, Tuya local) means adding
// a new caller, not touching this file.

import { db, recordEvent } from './db.js';
import { config } from './config.js';
import { logger } from './log.js';

const log = logger('devices');

const DEFAULT_OUTLET_NAMES = ['Outlet 1', 'Outlet 2', 'Outlet 3', 'Outlet 4'];

export function listStrips() {
  return db.prepare('SELECT * FROM strips ORDER BY id').all();
}

export function getStrip(id) {
  return db.prepare('SELECT * FROM strips WHERE id = ?').get(Number(id));
}

export function stripByPrefix(prefix) {
  return db.prepare('SELECT * FROM strips WHERE topic_prefix = ?').get(prefix);
}

export function outletsFor(stripId) {
  return db.prepare('SELECT * FROM outlets WHERE strip_id = ? ORDER BY idx').all(stripId);
}

export function createStrip({
  deviceId, topicPrefix, name, room = null,
  outletCount = 4, hasUsb = true, hasMetering = false, usbChannel = 5, planExpires = null,
}) {
  const now = Date.now();
  const prefix = topicPrefix || deviceId;
  const info = db.prepare(
    `INSERT INTO strips(device_id,topic_prefix,name,room,outlet_count,has_usb,has_metering,
                        usb_channel,plan_expires,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
  ).run(deviceId, prefix, name || deviceId, room, outletCount,
        hasUsb ? 1 : 0, hasMetering ? 1 : 0, usbChannel, planExpires, now);

  const stripId = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT INTO outlets(strip_id,idx,name,icon) VALUES(?,?,?,?)');
  for (let i = 1; i <= outletCount; i++) {
    ins.run(stripId, i, DEFAULT_OUTLET_NAMES[i - 1] || `Outlet ${i}`, 'socket');
  }
  if (hasUsb) ins.run(stripId, usbChannel, 'USB ports', 'usb');

  recordEvent('strip.added', stripId, deviceId);
  log.info(`registered strip ${deviceId} (prefix "${prefix}")`);
  return getStrip(stripId);
}

export function deleteStrip(id) {
  db.prepare('DELETE FROM strips WHERE id = ?').run(Number(id));
  recordEvent('strip.removed', null, String(id));
}

const STRIP_FIELDS = {
  name: 'name', room: 'room', planExpires: 'plan_expires',
  hasMetering: 'has_metering', hasUsb: 'has_usb', outletCount: 'outlet_count',
};

export function updateStrip(id, patch) {
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(STRIP_FIELDS)) {
    if (patch[k] === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(typeof patch[k] === 'boolean' ? (patch[k] ? 1 : 0) : patch[k]);
  }
  if (sets.length) {
    db.prepare(`UPDATE strips SET ${sets.join(', ')} WHERE id = ?`).run(...vals, Number(id));
  }
  return getStrip(id);
}

export function updateOutlet(stripId, idx, patch) {
  const sets = [], vals = [];
  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name); }
  if (patch.icon !== undefined) { sets.push('icon = ?'); vals.push(patch.icon); }
  if (patch.locked !== undefined) { sets.push('locked = ?'); vals.push(patch.locked ? 1 : 0); }
  if (sets.length) {
    db.prepare(`UPDATE outlets SET ${sets.join(', ')} WHERE strip_id = ? AND idx = ?`)
      .run(...vals, Number(stripId), Number(idx));
  }
}

/* --------------------------------------------------- inbound device updates */

/** A relay state message arrived. Returns true if the value actually changed. */
export function applyState(stripId, channel, on) {
  const row = db.prepare('SELECT state FROM outlets WHERE strip_id = ? AND idx = ?')
    .get(stripId, channel);
  if (!row) return false;
  const value = on ? 1 : 0;
  db.prepare('UPDATE outlets SET state = ?, updated_at = ? WHERE strip_id = ? AND idx = ?')
    .run(value, Date.now(), stripId, channel);
  return row.state !== value;
}

export function applyTelemetry(stripId, { watts, volts, amps }) {
  const sets = ['last_seen = ?'], vals = [Date.now()];
  if (watts !== undefined) { sets.push('watts = ?'); vals.push(watts); }
  if (volts !== undefined) { sets.push('volts = ?'); vals.push(volts); }
  if (amps !== undefined) { sets.push('amps = ?'); vals.push(amps); }
  db.prepare(`UPDATE strips SET ${sets.join(', ')} WHERE id = ?`).run(...vals, stripId);
  // Seeing metering data is the only proof the hardware has a metering chip.
  if (watts !== undefined) {
    db.prepare('UPDATE strips SET has_metering = 1 WHERE id = ? AND has_metering = 0').run(stripId);
  }
}

export function setOnline(stripId, online) {
  const prev = db.prepare('SELECT online, device_id FROM strips WHERE id = ?').get(stripId);
  db.prepare('UPDATE strips SET online = ?, last_seen = ? WHERE id = ?')
    .run(online ? 1 : 0, Date.now(), stripId);
  if (prev && prev.online !== (online ? 1 : 0)) {
    recordEvent(online ? 'strip.online' : 'strip.offline', stripId, prev.device_id);
    // A strip that dropped off cannot be reporting live power.
    if (!online) db.prepare('UPDATE strips SET watts = 0 WHERE id = ?').run(stripId);
    return true;
  }
  return false;
}

export function setNetInfo(stripId, { ip, rssi }) {
  if (ip !== undefined) db.prepare('UPDATE strips SET ip = ? WHERE id = ?').run(ip, stripId);
  if (rssi !== undefined) db.prepare('UPDATE strips SET rssi = ? WHERE id = ?').run(rssi, stripId);
}

/**
 * Mark strips silent past the grace window as offline. The MQTT last will is
 * the primary signal; this catches the case where it never arrived.
 */
export function reapStale() {
  const cutoff = Date.now() - config.offlineAfterMs;
  const stale = db.prepare(
    'SELECT id FROM strips WHERE online = 1 AND (last_seen IS NULL OR last_seen < ?)',
  ).all(cutoff);
  for (const s of stale) setOnline(s.id, false);
  return stale.length;
}

/* ------------------------------------------------------------- UI snapshot */

function maskDeviceId(id) {
  return id.length <= 5 ? id : id.slice(0, 5) + '*'.repeat(id.length - 5);
}

export function stripView(strip) {
  const outlets = outletsFor(strip.id);
  const switchable = outlets.filter((o) => o.idx <= strip.outlet_count);
  return {
    id: strip.id,
    deviceId: strip.device_id,
    deviceIdMasked: maskDeviceId(strip.device_id),
    topicPrefix: strip.topic_prefix,
    name: strip.name,
    room: strip.room,
    online: !!strip.online,
    lastSeen: strip.last_seen,
    ip: strip.ip,
    rssi: strip.rssi,
    watts: strip.online ? strip.watts : 0,
    volts: strip.volts,
    amps: strip.amps,
    hasMetering: !!strip.has_metering,
    hasUsb: !!strip.has_usb,
    usbChannel: strip.usb_channel,
    outletCount: strip.outlet_count,
    planExpires: strip.plan_expires,
    outletsOn: switchable.filter((o) => o.state).length,
    outlets: outlets.map((o) => ({
      idx: o.idx,
      name: o.name,
      icon: o.icon,
      on: !!o.state,
      locked: !!o.locked,
      isUsb: o.idx > strip.outlet_count,
      updatedAt: o.updated_at,
    })),
  };
}

export function snapshot() {
  const strips = listStrips().map(stripView);
  const activePlans = strips.filter(
    (s) => s.planExpires && s.planExpires > Date.now(),
  ).length;
  return {
    strips,
    totals: {
      watts: Math.round(strips.reduce((a, s) => a + (s.watts || 0), 0) * 10) / 10,
      stripsOnline: strips.filter((s) => s.online).length,
      stripsTotal: strips.length,
      outletsOn: strips.reduce((a, s) => a + s.outletsOn, 0),
      outletsTotal: strips.reduce((a, s) => a + s.outletCount, 0),
      plansActive: activePlans,
    },
    serverTime: Date.now(),
  };
}
