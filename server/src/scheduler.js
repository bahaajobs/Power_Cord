// Server-side schedules and power automations.
//
// These run here so they still fire when the phone is asleep. They do NOT
// survive the server being down — the firmware's own countdown timers do, and
// pushing schedules into firmware is the Phase 3 upgrade described in
// docs/06-roadmap.md. Until then the UI labels where a rule runs, because a
// rule that only fires while the server is up is a different promise.

import { db, recordEvent } from './db.js';
import { getStrip, listStrips } from './devices.js';
import { setAll, setOutlet } from './bridge.js';
import { logger } from './log.js';

const log = logger('sched');

export function listSchedules(stripId = null) {
  const sql = stripId
    ? 'SELECT * FROM schedules WHERE strip_id = ? ORDER BY id'
    : 'SELECT * FROM schedules ORDER BY id';
  return (stripId ? db.prepare(sql).all(Number(stripId)) : db.prepare(sql).all()).map(view);
}

const view = (r) => ({
  id: r.id,
  stripId: r.strip_id,
  outletIdx: r.outlet_idx,
  kind: r.kind,
  atTime: r.at_time,
  weekdayMask: r.weekday_mask,
  fireAt: r.fire_at,
  action: !!r.action,
  enabled: !!r.enabled,
  lastFired: r.last_fired,
});

export function createSchedule({
  stripId, outletIdx = null, kind, atTime = null, weekdayMask = 127, fireAt = null, action,
}) {
  if (!getStrip(stripId)) throw new Error('unknown strip');
  if (kind !== 'weekly' && kind !== 'countdown') throw new Error('kind must be weekly or countdown');
  if (kind === 'weekly' && !/^\d{2}:\d{2}$/.test(atTime || '')) throw new Error('atTime must be HH:MM');
  if (kind === 'countdown' && !Number.isFinite(Number(fireAt))) throw new Error('fireAt required');

  const info = db.prepare(
    `INSERT INTO schedules(strip_id,outlet_idx,kind,at_time,weekday_mask,fire_at,action,created_at)
     VALUES(?,?,?,?,?,?,?,?)`,
  ).run(Number(stripId), outletIdx === null ? null : Number(outletIdx), kind,
        atTime, Number(weekdayMask), fireAt === null ? null : Number(fireAt),
        action ? 1 : 0, Date.now());
  return view(db.prepare('SELECT * FROM schedules WHERE id = ?').get(Number(info.lastInsertRowid)));
}

export function updateSchedule(id, patch) {
  if (patch.enabled !== undefined) {
    db.prepare('UPDATE schedules SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, Number(id));
  }
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(Number(id));
  return row ? view(row) : null;
}

export function deleteSchedule(id) {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(Number(id));
}

/* ------------------------------------------------------------ automations */

const autoView = (r) => ({
  id: r.id,
  stripId: r.strip_id,
  kind: r.kind,
  thresholdW: r.threshold_w,
  durationS: r.duration_s,
  cut: !!r.cut,
  enabled: !!r.enabled,
  since: r.since,
});

export function listAutomations(stripId = null) {
  const rows = stripId
    ? db.prepare('SELECT * FROM automations WHERE strip_id = ? ORDER BY id').all(Number(stripId))
    : db.prepare('SELECT * FROM automations ORDER BY id').all();
  return rows.map(autoView);
}

export function createAutomation({ stripId, kind, thresholdW, durationS = 600, cut = false }) {
  if (!getStrip(stripId)) throw new Error('unknown strip');
  if (kind !== 'standby' && kind !== 'overload') throw new Error('kind must be standby or overload');
  const info = db.prepare(
    'INSERT INTO automations(strip_id,kind,threshold_w,duration_s,cut,created_at) VALUES(?,?,?,?,?,?)',
  ).run(Number(stripId), kind, Number(thresholdW), Number(durationS), cut ? 1 : 0, Date.now());
  return autoView(db.prepare('SELECT * FROM automations WHERE id = ?').get(Number(info.lastInsertRowid)));
}

export function updateAutomation(id, patch) {
  if (patch.enabled !== undefined) {
    db.prepare('UPDATE automations SET enabled = ?, since = NULL WHERE id = ?')
      .run(patch.enabled ? 1 : 0, Number(id));
  }
  if (patch.thresholdW !== undefined) {
    db.prepare('UPDATE automations SET threshold_w = ? WHERE id = ?')
      .run(Number(patch.thresholdW), Number(id));
  }
  const row = db.prepare('SELECT * FROM automations WHERE id = ?').get(Number(id));
  return row ? autoView(row) : null;
}

export function deleteAutomation(id) {
  db.prepare('DELETE FROM automations WHERE id = ?').run(Number(id));
}

/* ------------------------------------------------------------------- tick */

function fire(schedule) {
  const action = !!schedule.action;
  try {
    if (schedule.outlet_idx === null) setAll(schedule.strip_id, action);
    else setOutlet(schedule.strip_id, schedule.outlet_idx, action);
    recordEvent('schedule.fired', schedule.strip_id, `#${schedule.id} -> ${action ? 'on' : 'off'}`);
    log.info(`schedule #${schedule.id} fired -> ${action ? 'on' : 'off'}`);
  } catch (err) {
    // A schedule that could not be delivered is a visible failure, not a
    // silent no-op — the user needs to know the appliance did not switch.
    recordEvent('schedule.failed', schedule.strip_id, `#${schedule.id}: ${err.message}`);
    log.warn(`schedule #${schedule.id} failed: ${err.message}`);
  }
  db.prepare('UPDATE schedules SET last_fired = ? WHERE id = ?').run(Date.now(), schedule.id);
}

export function tick(onChange = () => {}) {
  const now = Date.now();
  const d = new Date(now);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const todayBit = 1 << d.getDay();
  let changed = false;

  for (const s of db.prepare('SELECT * FROM schedules WHERE enabled = 1').all()) {
    if (s.kind === 'countdown') {
      if (s.fire_at && s.fire_at <= now) {
        fire(s);
        db.prepare('UPDATE schedules SET enabled = 0 WHERE id = ?').run(s.id);
        changed = true;
      }
      continue;
    }
    if (s.at_time !== hhmm) continue;
    if (!(s.weekday_mask & todayBit)) continue;
    // Guard against firing twice inside the same minute across ticks.
    if (s.last_fired && now - s.last_fired < 90_000) continue;
    fire(s);
    changed = true;
  }

  changed = runAutomations(now) || changed;
  if (changed) onChange();
  return changed;
}

function runAutomations(now) {
  let changed = false;
  const strips = new Map(listStrips().map((s) => [s.id, s]));

  for (const a of db.prepare('SELECT * FROM automations WHERE enabled = 1').all()) {
    const strip = strips.get(a.strip_id);
    if (!strip || !strip.online || !strip.has_metering) continue;
    const watts = strip.watts || 0;

    if (a.kind === 'standby') {
      // Cut only once the draw has stayed under the threshold for the whole
      // window — a fridge between compressor cycles must not trip it.
      if (watts < a.threshold_w) {
        if (!a.since) {
          db.prepare('UPDATE automations SET since = ? WHERE id = ?').run(now, a.id);
        } else if (now - a.since >= a.duration_s * 1000) {
          if (a.cut) {
            try { setAll(a.strip_id, false); changed = true; } catch { /* reported below */ }
          }
          recordEvent('automation.standby', a.strip_id, `${watts} W for ${a.duration_s}s`);
          log.info(`standby cutoff on strip ${a.strip_id} (${watts} W)`);
          db.prepare('UPDATE automations SET since = NULL WHERE id = ?').run(a.id);
        }
      } else if (a.since) {
        db.prepare('UPDATE automations SET since = NULL WHERE id = ?').run(a.id);
      }
      continue;
    }

    if (a.kind === 'overload') {
      if (watts > a.threshold_w) {
        // Overload is acted on immediately; there is no averaging window,
        // because the point is to get in front of a thermal event.
        if (!a.since || now - a.since > 60_000) {
          db.prepare('UPDATE automations SET since = ? WHERE id = ?').run(now, a.id);
          recordEvent('automation.overload', a.strip_id, `${watts} W over ${a.threshold_w} W`);
          log.warn(`OVERLOAD on strip ${a.strip_id}: ${watts} W`);
          if (a.cut) {
            try { setAll(a.strip_id, false); changed = true; } catch { /* reported above */ }
          }
        }
      } else if (a.since) {
        db.prepare('UPDATE automations SET since = NULL WHERE id = ?').run(a.id);
      }
    }
  }
  return changed;
}
