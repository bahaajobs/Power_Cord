// Energy accounting.
//
// The metering shunt in these strips sits upstream of every relay, so a reading
// is total consumption for the whole strip, never per outlet (see
// docs/02-hardware-reference.md). Nothing here attributes energy to an outlet,
// and the UI must not either.
//
// Energy is integrated from power readings rather than read from the device's
// cumulative counter: it behaves correctly across firmware restarts, counter
// resets and strips whose firmware reports power but not totals.

import { db, getSetting } from './db.js';
import { config } from './config.js';

const lastReading = new Map(); // stripId -> { ts, watts }

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const lastSampleAt = new Map();

/** Called for every power reading that arrives from a strip. */
export function recordReading(stripId, watts) {
  if (!Number.isFinite(watts) || watts < 0) return;
  const now = Date.now();
  const prev = lastReading.get(stripId);
  lastReading.set(stripId, { ts: now, watts });

  if (prev) {
    // Clamp the gap so a strip that was offline for hours does not book a huge
    // block of energy the moment it reconnects.
    const dtMs = Math.min(now - prev.ts, 5 * 60_000);
    if (dtMs > 0) {
      // Trapezoidal: average of the two readings over the interval.
      const kwh = ((prev.watts + watts) / 2) * (dtMs / 3_600_000) / 1000;
      if (kwh > 0) addDaily(stripId, dayKey(), kwh);
    }
  }

  const since = lastSampleAt.get(stripId) ?? 0;
  if (now - since >= config.sampleIntervalMs) {
    lastSampleAt.set(stripId, now);
    const strip = db.prepare('SELECT volts, amps FROM strips WHERE id = ?').get(stripId);
    db.prepare('INSERT OR REPLACE INTO samples(strip_id,ts,watts,volts,amps) VALUES(?,?,?,?,?)')
      .run(stripId, now, watts, strip?.volts ?? null, strip?.amps ?? null);
  }
}

export function addDaily(stripId, day, kwh) {
  db.prepare(
    `INSERT INTO daily(strip_id,day,kwh) VALUES(?,?,?)
     ON CONFLICT(strip_id,day) DO UPDATE SET kwh = kwh + excluded.kwh`,
  ).run(stripId, day, kwh);
}

export function pruneSamples() {
  const cutoff = Date.now() - config.rawRetentionHours * 3_600_000;
  const info = db.prepare('DELETE FROM samples WHERE ts < ?').run(cutoff);
  return info.changes;
}

/* -------------------------------------------------------------------- cost */

/**
 * Egyptian residential supply is billed in rising brackets, so the marginal
 * rate depends on the household's monthly total — a single price per kWh is
 * wrong by construction. `householdMtd` is what the user copied off their own
 * bill; the strip only meters what is plugged into it, so every figure this
 * returns is an estimate and the UI says so.
 */
export function estimateCost(kwh) {
  const mode = getSetting('tariff_mode');
  if (mode !== 'brackets') {
    return { cost: kwh * Number(getSetting('tariff_flat') || 0), mode: 'flat' };
  }

  let brackets;
  try { brackets = JSON.parse(getSetting('tariff_brackets')); } catch { brackets = []; }
  if (!Array.isArray(brackets) || brackets.length === 0) {
    return { cost: kwh * Number(getSetting('tariff_flat') || 0), mode: 'flat' };
  }

  const start = Number(getSetting('household_mtd_kwh') || 0);
  let remaining = kwh;
  let position = start;
  let cost = 0;

  for (const b of brackets) {
    if (remaining <= 0) break;
    const ceiling = b.upTo === null || b.upTo === undefined ? Infinity : Number(b.upTo);
    if (position >= ceiling) continue;
    const room = ceiling - position;
    const take = Math.min(remaining, room);
    cost += take * Number(b.rate || 0);
    position += take;
    remaining -= take;
  }
  if (remaining > 0) cost += remaining * Number(brackets.at(-1).rate || 0);

  return { cost, mode: 'brackets', marginalFrom: start };
}

/* ------------------------------------------------------------------ report */

export function energyReport(days = 7, stripId = null) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  const fromKey = dayKey(from);

  const where = stripId ? 'AND strip_id = ?' : '';
  const args = stripId ? [fromKey, Number(stripId)] : [fromKey];

  const byDay = db.prepare(
    `SELECT day, SUM(kwh) AS kwh FROM daily WHERE day >= ? ${where} GROUP BY day ORDER BY day`,
  ).all(...args);

  const byStrip = db.prepare(
    `SELECT s.id, s.device_id, s.name, COALESCE(SUM(d.kwh), 0) AS kwh
       FROM strips s LEFT JOIN daily d ON d.strip_id = s.id AND d.day >= ?
      ${stripId ? 'WHERE s.id = ?' : ''}
      GROUP BY s.id ORDER BY kwh DESC`,
  ).all(...args);

  // Fill missing days so the chart has a bar per day rather than a ragged axis.
  const series = [];
  const cursor = new Date(from);
  const map = new Map(byDay.map((r) => [r.day, r.kwh]));
  for (let i = 0; i < days; i++) {
    const key = dayKey(cursor);
    series.push({ day: key, kwh: Math.round((map.get(key) || 0) * 1000) / 1000 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const total = series.reduce((a, d) => a + d.kwh, 0);
  const { cost, mode } = estimateCost(total);
  const nonZero = series.filter((d) => d.kwh > 0);

  return {
    days,
    from: fromKey,
    totalKwh: Math.round(total * 1000) / 1000,
    estimatedCost: Math.round(cost * 100) / 100,
    currency: getSetting('currency'),
    tariffMode: mode,
    tariffFlat: Number(getSetting('tariff_flat') || 0),
    average: nonZero.length ? Math.round((total / nonZero.length) * 1000) / 1000 : 0,
    series,
    byStrip: byStrip.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      name: r.name,
      kwh: Math.round(r.kwh * 1000) / 1000,
      share: total > 0 ? Math.round((r.kwh / total) * 100) : 0,
    })),
  };
}
