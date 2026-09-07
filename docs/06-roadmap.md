# 06 — Roadmap

Each phase has an **exit criterion**: a specific observable thing that must be
true before the next phase starts. The phases are ordered so that the riskiest
unknowns are resolved before any expensive work depends on them.

Durations assume one hardware-capable engineer and one Flutter engineer, and
they are estimates that only become reliable after Phase 0.

---

## Phase 0 — Hardware truth (3–5 days)

Nothing else starts until this finishes.

- Run [`01-device-identification.md`](01-device-identification.md) on two units
  from different parts of the batch.
- Complete a device fingerprint for each.
- Attempt `tuya-cloudcutter` on one unit.
- If OTA fails: attach a USB-TTL adapter, back up the original firmware, flash
  OpenBeken over UART.
- Map the GPIO pins by driving them at 3.3 V with the strip unplugged and
  listening for relay clicks.

**Exit criterion:** all four relays toggle from the OpenBeken web UI, and one
MQTT publish from a laptop makes a relay click.

**If the exit criterion fails**, stop and re-plan. The likely causes are a
TuyaMCU design (go to Track C2) or a patched, unexploitable module with
inaccessible test pads (cost the replacement control board, Track C3). Either
way the app plan survives; only the firmware track changes.

---

## Phase 1 — Batch process (1 week, parallel with Phase 2)

- Build the pogo-pin flashing jig if UART flashing is required.
- Produce a golden OpenBeken configuration export and a written per-unit
  procedure.
- Flash and label 10 units. Measure the real per-unit time.
- Stand up the refurb QC bench from
  [`07-safety-and-compliance.md`](07-safety-and-compliance.md) and run all 10
  through it.

**Exit criterion:** 10 units flashed, QC-passed, and reporting to a broker,
with a documented per-unit time and a known scrap rate.

The scrap rate is the number that determines whether this batch is a business
or a hobby. Measure it honestly on the first 10.

---

## Phase 2 — App skeleton (2 weeks)

- Flutter project, Riverpod, Drift, ar/en localisation with RTL from commit one.
- `DeviceTransport` abstraction and `MqttTransport`.
- mDNS + broker discovery, manual IP entry.
- Device list and a control screen: four toggles, master, online/offline state.
- Optimistic toggles **with reconciliation and revert** — the safety property
  from [`04-app-architecture.md`](04-app-architecture.md), built in from the
  start rather than added later.

**Exit criterion:** a phone on the same Wi-Fi toggles any outlet on any of the
10 units, and a button press on the strip updates the app within a second.

---

## Phase 3 — The features people actually asked for (3 weeks)

- Outlet naming and icons; rooms and grouping.
- Countdown timers and weekly schedules, **pushed into firmware**.
- Energy screen, gated on `hasMetering`: live readings, history with
  downsampling, editable EGP bracket table.
- Standby cutoff and overload alarm.
- Power-on-behaviour setting, defaulting to `off`.
- Scenes.

**Exit criterion:** a schedule set in the app fires correctly with the phone
switched off, and energy readings match a clamp meter within 5% on a known
resistive load.

---

## Phase 4 — Provisioning and fleet (2 weeks)

- SoftAP onboarding wizard for a freshly flashed strip.
- OTA firmware update from the app.
- Multi-strip fleet view, "all off".
- Local notifications for overload and offline.

**Exit criterion:** someone who has never seen the product takes a flashed
strip out of a box and has it controlling an appliance in under five minutes,
without help.

That criterion is the one worth defending. It is the difference between a
product and a project.

---

## Phase 5 — Remote access (2 weeks, optional)

- VPS with Mosquitto, TLS, per-device credentials and topic ACLs.
- Provisioning of per-device credentials during onboarding.
- Push notifications.
- Verified fallback: LAN control keeps working when the broker is unreachable.

**Exit criterion:** control from mobile data with the phone off the home Wi-Fi,
and full LAN control still working with the VPS deliberately powered down.

Do not skip the second half of that criterion. The whole reason this project
exists is that someone shipped a device that stopped working when its server
became unreachable.

---

## Phase 6 — Release

- iOS build, Play Store listing, Arabic store copy.
- Crash reporting, an opt-in diagnostics export.
- A written support runbook: how to re-provision, how to factory reset, how to
  re-flash a unit that will not connect.

---

## Sequencing note

Phases 1 and 2 run in parallel — the hardware work and the app work do not
block each other once Phase 0 has fixed the API. Phase 3 needs flashed units
from Phase 1, so keep the batch process ahead of the app.

Total to a usable internal release: **roughly 8–9 weeks** after Phase 0, for two
engineers. To a public consumer release with remote access: **12–14 weeks**.
