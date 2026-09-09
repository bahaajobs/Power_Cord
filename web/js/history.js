/* Local energy history, kept on the phone.
 *
 * The strips themselves store almost nothing — OpenBeken keeps a running
 * total, today and yesterday, and that is all. So the phone is the archive,
 * and it reconciles against the strip's own counters on every poll rather than
 * only integrating power readings.
 *
 * That distinction matters. Integration alone loses whatever happened while
 * the app was closed. Taking the strip's `Today` figure as authoritative means
 * a phone that was asleep all afternoon still gets the correct daily number
 * the moment it reconnects. */

const DB_NAME = 'powercord';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('samples')) {
        db.createObjectStore('samples', { keyPath: ['deviceId', 'ts'] })
          .createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('daily')) {
        db.createObjectStore('daily', { keyPath: ['deviceId', 'day'] })
          .createIndex('day', 'day');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const tx = async (store, mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try { result = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};

async function getDaily(deviceId, day) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('daily', 'readonly').objectStore('daily').get([deviceId, day]);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const yesterdayKey = () => {
  const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d);
};

const lastSample = new Map();   // deviceId -> {ts, watts}
const lastSaved = new Map();    // deviceId -> ts of last stored sample

/**
 * Fold one poll result into history.
 *
 * `energy.todayKwh` from the strip wins over anything computed locally: it is
 * the device's own accumulator and it kept counting while the phone was away.
 * Only when the strip reports no totals does this integrate power over time.
 */
export async function record(deviceId, energy, sampleEveryMs = 60_000) {
  if (!energy) return;
  const now = Date.now();
  const today = dayKey();

  if (Number.isFinite(energy.todayKwh)) {
    await tx('daily', 'readwrite', (s) => s.put({
      deviceId, day: today, kwh: energy.todayKwh, source: 'device',
      totalKwh: energy.totalKwh ?? null, syncedAt: now,
    }));
    // First poll after midnight: the strip still knows yesterday's total, so
    // take it and correct whatever we had integrated overnight.
    if (Number.isFinite(energy.yesterdayKwh)) {
      const yd = yesterdayKey();
      const existing = await getDaily(deviceId, yd);
      if (!existing || existing.source !== 'device') {
        await tx('daily', 'readwrite', (s) => s.put({
          deviceId, day: yd, kwh: energy.yesterdayKwh, source: 'device', syncedAt: now,
        }));
      }
    }
  } else if (Number.isFinite(energy.watts)) {
    const prev = lastSample.get(deviceId);
    if (prev) {
      // Clamp the gap so a strip that was unreachable for hours does not book
      // a block of energy the instant it comes back.
      const dt = Math.min(now - prev.ts, 5 * 60_000);
      const kwh = ((prev.watts + energy.watts) / 2) * (dt / 3_600_000) / 1000;
      if (kwh > 0) await addDaily(deviceId, today, kwh);
    }
  }

  if (Number.isFinite(energy.watts)) lastSample.set(deviceId, { ts: now, watts: energy.watts });

  const since = lastSaved.get(deviceId) ?? 0;
  if (now - since >= sampleEveryMs && Number.isFinite(energy.watts)) {
    lastSaved.set(deviceId, now);
    await tx('samples', 'readwrite', (s) => s.put({
      deviceId, ts: now, watts: energy.watts, volts: energy.volts ?? null, amps: energy.amps ?? null,
    }));
  }
}

async function addDaily(deviceId, day, kwh) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('daily', 'readwrite');
    const s = t.objectStore('daily');
    const g = s.get([deviceId, day]);
    g.onsuccess = () => {
      const cur = g.result;
      // Never overwrite a figure the strip supplied with an integrated guess.
      if (cur?.source === 'device') { resolve(); return; }
      s.put({ deviceId, day, kwh: (cur?.kwh || 0) + kwh, source: 'integrated', syncedAt: Date.now() });
      resolve();
    };
    g.onerror = () => reject(g.error);
    t.onerror = () => reject(t.error);
  });
}

export async function allDaily() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const c = db.transaction('daily', 'readonly').objectStore('daily').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else resolve(out); };
    c.onerror = () => reject(c.error);
  });
}

/** Series for the energy screen: one entry per day, gaps filled with zero. */
export async function report(days, devices) {
  const rows = await allDaily();
  const known = new Set(devices.map((d) => d.id));
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (days - 1));

  const byDay = new Map();
  const byDevice = new Map();
  let lastSync = 0;

  for (const r of rows) {
    if (!known.has(r.deviceId)) continue;
    if (r.day < dayKey(from)) continue;
    byDay.set(r.day, (byDay.get(r.day) || 0) + r.kwh);
    byDevice.set(r.deviceId, (byDevice.get(r.deviceId) || 0) + r.kwh);
    if (r.syncedAt > lastSync) lastSync = r.syncedAt;
  }

  const series = [];
  const cursor = new Date(from);
  for (let i = 0; i < days; i++) {
    const k = dayKey(cursor);
    series.push({ day: k, kwh: Math.round((byDay.get(k) || 0) * 1000) / 1000 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const total = series.reduce((a, d) => a + d.kwh, 0);
  const nonZero = series.filter((d) => d.kwh > 0);

  return {
    days,
    series,
    totalKwh: Math.round(total * 1000) / 1000,
    average: nonZero.length ? Math.round((total / nonZero.length) * 1000) / 1000 : 0,
    lastSync,
    byStrip: devices.map((d) => {
      const kwh = Math.round((byDevice.get(d.id) || 0) * 1000) / 1000;
      return { id: d.id, name: d.name, deviceId: d.deviceId || d.name, kwh,
               share: total > 0 ? Math.round((kwh / total) * 100) : 0 };
    }).sort((a, b) => b.kwh - a.kwh),
  };
}

export async function prune(keepDays = 400, keepSampleHours = 48) {
  const cutDay = new Date(); cutDay.setDate(cutDay.getDate() - keepDays);
  const cutKey = dayKey(cutDay);
  const cutTs = Date.now() - keepSampleHours * 3_600_000;
  const db = await open();
  await new Promise((resolve) => {
    const t = db.transaction(['daily', 'samples'], 'readwrite');
    const dc = t.objectStore('daily').index('day').openCursor(IDBKeyRange.upperBound(cutKey, true));
    dc.onsuccess = () => { const c = dc.result; if (c) { c.delete(); c.continue(); } };
    const sc = t.objectStore('samples').index('ts').openCursor(IDBKeyRange.upperBound(cutTs, true));
    sc.onsuccess = () => { const c = sc.result; if (c) { c.delete(); c.continue(); } };
    t.oncomplete = resolve;
    t.onerror = resolve;
  });
}

export async function exportAll() {
  return { exportedAt: new Date().toISOString(), daily: await allDaily() };
}

export async function clearAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(['daily', 'samples'], 'readwrite');
    t.objectStore('daily').clear();
    t.objectStore('samples').clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

export async function removeDevice(deviceId) {
  const rows = await allDaily();
  const db = await open();
  return new Promise((resolve) => {
    const t = db.transaction('daily', 'readwrite');
    const s = t.objectStore('daily');
    for (const r of rows) if (r.deviceId === deviceId) s.delete([deviceId, r.day]);
    t.oncomplete = resolve;
    t.onerror = resolve;
  });
}

export async function daysStored() {
  const rows = await allDaily();
  return new Set(rows.map((r) => r.day)).size;
}
