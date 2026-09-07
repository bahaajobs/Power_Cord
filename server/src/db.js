import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { logger } from './log.js';

const log = logger('db');
export const db = new DatabaseSync(config.dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,
  salt       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- topic_prefix is the strip's MQTT client name under OpenBeken / ESPHome.
-- It is the only identifier the transport actually uses; device_id is what the
-- user sees on the rating plate.
CREATE TABLE IF NOT EXISTS strips (
  id            INTEGER PRIMARY KEY,
  device_id     TEXT NOT NULL UNIQUE,
  topic_prefix  TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  room          TEXT,
  outlet_count  INTEGER NOT NULL DEFAULT 4,
  has_usb       INTEGER NOT NULL DEFAULT 1,
  has_metering  INTEGER NOT NULL DEFAULT 0,
  usb_channel   INTEGER NOT NULL DEFAULT 5,
  plan_expires  INTEGER,
  online        INTEGER NOT NULL DEFAULT 0,
  last_seen     INTEGER,
  ip            TEXT,
  rssi          INTEGER,
  watts         REAL NOT NULL DEFAULT 0,
  volts         REAL,
  amps          REAL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outlets (
  strip_id   INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'socket',
  state      INTEGER NOT NULL DEFAULT 0,
  locked     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (strip_id, idx)
);

CREATE TABLE IF NOT EXISTS samples (
  strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
  ts       INTEGER NOT NULL,
  watts    REAL NOT NULL,
  volts    REAL,
  amps     REAL,
  PRIMARY KEY (strip_id, ts)
);

CREATE TABLE IF NOT EXISTS daily (
  strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  kwh      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (strip_id, day)
);

-- kind: 'weekly' fires at at_time on the days in weekday_mask (bit 0 = Sunday);
-- 'countdown' fires once at fire_at and is then disabled.
CREATE TABLE IF NOT EXISTS schedules (
  id           INTEGER PRIMARY KEY,
  strip_id     INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
  outlet_idx   INTEGER,
  kind         TEXT NOT NULL,
  at_time      TEXT,
  weekday_mask INTEGER NOT NULL DEFAULT 127,
  fire_at      INTEGER,
  action       INTEGER NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  last_fired   INTEGER,
  created_at   INTEGER NOT NULL
);

-- kind: 'standby' cuts when draw stays under threshold_w for duration_s;
-- 'overload' alarms (and optionally cuts) above threshold_w.
CREATE TABLE IF NOT EXISTS automations (
  id          INTEGER PRIMARY KEY,
  strip_id    INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  threshold_w REAL NOT NULL,
  duration_s  INTEGER NOT NULL DEFAULT 600,
  cut         INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  since       INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY,
  ts       INTEGER NOT NULL,
  strip_id INTEGER,
  kind     TEXT NOT NULL,
  detail   TEXT
);

CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts);
CREATE INDEX IF NOT EXISTS idx_events_ts  ON events(ts);
`);

/* ---------------------------------------------------------------- settings */

const DEFAULT_SETTINGS = {
  // Egyptian residential electricity is billed in rising brackets, so a single
  // rate is wrong by construction. The bracket table is editable for exactly
  // that reason, and because published rates move roughly annually.
  currency: 'EGP',
  tariff_mode: 'flat',            // 'flat' | 'brackets'
  tariff_flat: '1.5',
  tariff_brackets: JSON.stringify([
    { upTo: 50, rate: 0.68 },
    { upTo: 100, rate: 0.95 },
    { upTo: 200, rate: 1.15 },
    { upTo: 350, rate: 1.72 },
    { upTo: 650, rate: 2.18 },
    { upTo: 1000, rate: 2.40 },
    { upTo: null, rate: 2.74 },
  ]),
  // Month-to-date household total from the user's own bill, so the marginal
  // bracket is right. The strip only meters what is plugged into it.
  household_mtd_kwh: '0',
  mask_device_ids: '1',
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

export function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, String(value));
}

/* -------------------------------------------------------------------- auth */

const KEYLEN = 64;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, KEYLEN).toString('hex') };
}

export function verifyPassword(password, salt, hash) {
  const candidate = scryptSync(password, salt, KEYLEN);
  const known = Buffer.from(hash, 'hex');
  return known.length === candidate.length && timingSafeEqual(known, candidate);
}

export function createUser(username, password) {
  const { salt, hash } = hashPassword(password);
  db.prepare('INSERT INTO users(username,salt,hash,created_at) VALUES(?,?,?,?)')
    .run(username, salt, hash, Date.now());
  log.info(`created user "${username}"`);
}

export function userCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

export function issueToken(userId) {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + config.tokenTtlDays * 86_400_000;
  db.prepare('INSERT INTO tokens(token,user_id,expires_at) VALUES(?,?,?)').run(token, userId, expires);
  db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(Date.now());
  return { token, expires };
}

export function userForToken(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.id, u.username, t.expires_at FROM tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token = ?`,
  ).get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username };
}

export function revokeToken(token) {
  db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
}

/* ------------------------------------------------------------------ events */

export function recordEvent(kind, stripId, detail) {
  db.prepare('INSERT INTO events(ts,strip_id,kind,detail) VALUES(?,?,?,?)')
    .run(Date.now(), stripId ?? null, kind, detail ? String(detail) : null);
}

export function seedAdmin() {
  if (userCount() > 0) return null;
  const password = config.adminPassword || randomBytes(9).toString('base64url');
  createUser(config.adminUser, password);
  return config.adminPassword ? null : password;
}
