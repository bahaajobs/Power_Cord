// The tariff maths now lives in the app, because in direct mode there is no
// server. Same rules as before: rising brackets, and the marginal rate depends
// on the household's month-to-date total.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The store persists to localStorage, which Node does not have.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const store = await import('../web/js/store.js');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('a single rate multiplies straight through', () => {
  store.set({ tariffMode: 'flat', tariffFlat: 1.5 });
  assert.ok(near(store.estimateCost(10), 15));
});

test('brackets bill the first band when the household starts at zero', () => {
  store.set({ tariffMode: 'brackets', householdMtdKwh: 0 });
  assert.ok(near(store.estimateCost(40), 40 * 0.68));
});

test('brackets step across a boundary', () => {
  store.set({ tariffMode: 'brackets', householdMtdKwh: 0 });
  assert.ok(near(store.estimateCost(60), 50 * 0.68 + 10 * 0.95));
});

test('the marginal rate follows the household month-to-date total', () => {
  store.set({ tariffMode: 'brackets', householdMtdKwh: 0 });
  const cheap = store.estimateCost(10);
  store.set({ householdMtdKwh: 900 });
  const dear = store.estimateCost(10);
  assert.ok(dear > cheap, `${dear} should exceed ${cheap}`);
  assert.ok(near(dear, 10 * 2.40));
});

test('past the top bracket the top rate continues', () => {
  store.set({ tariffMode: 'brackets', householdMtdKwh: 1200 });
  assert.ok(near(store.estimateCost(100), 100 * 2.74));
});

test('adding a device gives it outlets and a USB channel', () => {
  const d = store.addDevice({ name: 'Test', lanHost: '192.168.1.42', outletCount: 4, hasUsb: true });
  assert.equal(d.outlets.length, 5);
  assert.equal(d.usbChannel, 5);
  assert.ok(d.outlets.find((o) => o.isUsb));
  // Default names are left empty so they follow the interface language.
  assert.equal(d.outlets[0].name, '');
});

test('outlet count is clamped, and nonsense falls back to four', () => {
  assert.equal(store.addDevice({ lanHost: 'a', outletCount: 99 }).outlets.length, 13);   // 12 + USB
  assert.equal(store.addDevice({ lanHost: 'b', outletCount: 0 }).outletCount, 4);
  assert.equal(store.addDevice({ lanHost: 'c', outletCount: 'abc' }).outletCount, 4);
  assert.equal(store.addDevice({ lanHost: 'd', outletCount: 2.7 }).outletCount, 2);
});

test('there is no limit on how many strips can be added', () => {
  const before = store.get().devices.length;
  for (let i = 0; i < 40; i++) store.addDevice({ name: `S${i}`, lanHost: `10.0.0.${i}` });
  assert.equal(store.get().devices.length, before + 40);
});

test('removing a device takes its schedules and rules with it', () => {
  const d = store.addDevice({ name: 'Doomed', lanHost: '10.9.9.9' });
  store.addSchedule({ deviceId: d.id, kind: 'weekly', atTime: '19:00', weekdayMask: 127, action: true });
  store.addAutomation({ deviceId: d.id, kind: 'overload', thresholdW: 3000 });
  store.removeDevice(d.id);
  assert.equal(store.get().schedules.filter((s) => s.deviceId === d.id).length, 0);
  assert.equal(store.get().automations.filter((a) => a.deviceId === d.id).length, 0);
});

test('state survives a reload from storage', () => {
  const d = store.addDevice({ name: 'Persisted', lanHost: '10.1.1.1' });
  store.load();
  assert.ok(store.get().devices.find((x) => x.id === d.id));
});
