import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PC_DB = join(mkdtempSync(join(tmpdir(), 'pc-')), 'test.db');

const { setSetting } = await import('../server/src/db.js');
const { estimateCost, dayKey } = await import('../server/src/energy.js');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('flat tariff multiplies straight through', () => {
  setSetting('tariff_mode', 'flat');
  setSetting('tariff_flat', '1.5');
  assert.ok(near(estimateCost(10).cost, 15));
  assert.equal(estimateCost(10).mode, 'flat');
});

test('bracket tariff bills the first bracket when the household starts at zero', () => {
  setSetting('tariff_mode', 'brackets');
  setSetting('household_mtd_kwh', '0');
  // 40 kWh sits entirely inside the 0-50 bracket at 0.68.
  assert.ok(near(estimateCost(40).cost, 40 * 0.68));
});

test('bracket tariff steps across a boundary', () => {
  setSetting('tariff_mode', 'brackets');
  setSetting('household_mtd_kwh', '0');
  // 60 kWh = 50 at 0.68 + 10 at 0.95.
  assert.ok(near(estimateCost(60).cost, 50 * 0.68 + 10 * 0.95));
});

test('the marginal rate follows the household month-to-date total', () => {
  setSetting('tariff_mode', 'brackets');
  setSetting('household_mtd_kwh', '0');
  const cheap = estimateCost(10).cost;
  setSetting('household_mtd_kwh', '900');
  const dear = estimateCost(10).cost;
  // Same 10 kWh costs more for a household already deep into the brackets.
  // This is the whole reason a single price-per-kWh figure is wrong.
  assert.ok(dear > cheap, `expected ${dear} > ${cheap}`);
  assert.ok(near(dear, 10 * 2.40));
});

test('consumption past the top bracket keeps the top rate', () => {
  setSetting('tariff_mode', 'brackets');
  setSetting('household_mtd_kwh', '1200');
  assert.ok(near(estimateCost(100).cost, 100 * 2.74));
});

test('a malformed bracket table falls back to the flat rate rather than throwing', () => {
  setSetting('tariff_mode', 'brackets');
  setSetting('tariff_brackets', 'not json');
  setSetting('tariff_flat', '2');
  const r = estimateCost(5);
  assert.equal(r.mode, 'flat');
  assert.ok(near(r.cost, 10));
});

test('dayKey is local-time and zero padded', () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dayKey(new Date(2026, 11, 31)), '2026-12-31');
});
