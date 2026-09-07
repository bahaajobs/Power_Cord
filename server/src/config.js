// Configuration is entirely environment-driven so the same build runs on a
// laptop, a Raspberry Pi at home, or a VPS. Where you run it is what decides
// whether you get remote access — see docs/11-remote-access.md.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve bundled paths against this file, not the working directory, so the
// server behaves the same whether it is started from the repo root, from a
// systemd unit, or from inside a container.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  // HTTP + WebSocket
  host: process.env.PC_HOST || '0.0.0.0',
  port: num(process.env.PC_PORT, 8080),

  // MQTT broker the strips also connect to
  mqttUrl: process.env.PC_MQTT_URL || 'mqtt://127.0.0.1:1883',
  mqttUsername: process.env.PC_MQTT_USERNAME || undefined,
  mqttPassword: process.env.PC_MQTT_PASSWORD || undefined,
  // Strips whose topic prefix matches are auto-registered on first sight.
  autoDiscover: bool(process.env.PC_AUTO_DISCOVER, true),

  // Storage
  dbPath: process.env.PC_DB
    ? resolve(process.env.PC_DB)
    : resolve(repoRoot, 'data/powercord.db'),

  // Auth. PC_ADMIN_PASSWORD seeds the first user on an empty database.
  adminUser: process.env.PC_ADMIN_USER || 'admin',
  adminPassword: process.env.PC_ADMIN_PASSWORD || '',
  tokenTtlDays: num(process.env.PC_TOKEN_TTL_DAYS, 30),

  // Behaviour
  sampleIntervalMs: num(process.env.PC_SAMPLE_INTERVAL_MS, 60_000),
  tickIntervalMs: num(process.env.PC_TICK_INTERVAL_MS, 15_000),
  // A command with no confirming state message inside this window is reverted
  // in the UI. This is a safety property, not a nicety — see docs/04.
  commandTimeoutMs: num(process.env.PC_COMMAND_TIMEOUT_MS, 3_000),
  // A strip that has said nothing for this long is treated as offline even if
  // its last-will never arrived.
  offlineAfterMs: num(process.env.PC_OFFLINE_AFTER_MS, 150_000),

  // Raw sample retention; daily rollups are kept forever.
  rawRetentionHours: num(process.env.PC_RAW_RETENTION_HOURS, 48),

  webRoot: process.env.PC_WEB_ROOT
    ? resolve(process.env.PC_WEB_ROOT)
    : resolve(repoRoot, 'web'),
};

const dir = dirname(config.dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
