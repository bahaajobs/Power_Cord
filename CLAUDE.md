# Power Cord — working conventions

Read this before changing anything. It is the accumulated reasoning behind the
repository, not a style guide. Where a rule below looks fussy, it is because
breaking it already caused a problem or would put someone at risk.

## What this project is

A batch of used **Korean IoT multi-taps** (IoT 멀티탭 — 4-outlet Wi-Fi power
strips) sits in Egypt, inert. They are locked to a Korean cloud that cannot be
reached from here. The hardware is fine; the lock is a cloud-account problem,
not a silicon one. The fix is to re-flash the Wi-Fi module with open firmware
(OpenBeken or ESPHome) and drive the strips from our own software.

Two ways to drive them, both supported:

- **Direct mode (default).** The Android app talks to each strip's own web
  server over Tasmota's `/cm?cmnd=` HTTP endpoint. No server, no broker, no
  cloud.
- **Server mode (optional).** A Node server bridges MQTT to a REST/WebSocket
  API. Better for a fleet, and the only way schedules fire with the app closed.

## Non-negotiables

These are safety and honesty properties. Do not "simplify" them away.

1. **This is 220 V mains hardware.** Every documented procedure assumes the
   strip is unplugged. No procedure may require probing a live circuit. GPIO
   verification is done by feeding the module 3.3 V with the strip unplugged and
   listening for relay clicks.

2. **"Off" is not "isolated."** These strips switch the live conductor only;
   neutral stays connected to every outlet. Never write UI text or docs that
   imply a switched-off outlet is safe to touch.

3. **A command is never assumed to have worked.** The device's reply carries the
   state the relay actually reached. Anything unconfirmed within ~3.5 s reverts
   in the UI. A user who believes a heater is off when it is on is the failure
   this whole design exists to prevent. Optimistic-without-reconciliation is a
   bug, not a performance win.

4. **Never promise what the hardware cannot do.** The metering shunt sits
   upstream of all four relays, so energy is measured **per strip, never per
   outlet**. No feature, chart or doc may attribute energy to an outlet.

5. **Capabilities are detected, not assumed.** A strip only gains an energy tab
   after it has actually reported telemetry. Strips with no meter show
   "no meter", never a zero that reads like a measurement.

6. **Relay power-on behaviour defaults to `off`.** A heater that switches itself
   on after a blackout, in an empty flat, is the reason.

7. **Egyptian electricity is billed in rising brackets.** A single price per kWh
   is wrong by construction. The bracket table stays user-editable and rates are
   never hardcoded as truth — they are revised roughly annually and sources
   disagree.

8. **Pin maps and datapoint IDs are hypotheses, always.** Everything in
   `docs/02-hardware-reference.md` and `docs/08-teardown.md` comes from teardowns of *similar* hardware. The same
   pins mean different things on metering and non-metering variants. Label them
   as hypotheses; never as facts about the user's units.

9. **No third-party copyrighted assets.** Teardown photographs belong to whoever
   took them. Link to them; do not commit them. Schematics in
   `hardware/schematics/` are original SVGs — extend those instead.

## How to work here

**Verify before claiming.** Run the thing. If a claim cannot be tested in the
current environment, say so explicitly rather than implying it works. This
repository already contains several "written but never run" notes; keep that
habit and correct them when something does get verified.

**Distinguish a real bug from a test artifact.** Measure before concluding. A
UI automation failure is not automatically a UI bug — one apparent z-index
overlap here turned out to be the test harness racing a re-render, and the real
fix was elsewhere.

**Fix root causes.** `Number(0) || 4` silently turning an outlet count of zero
into four is the kind of thing to fix properly, not paper over at the call site.

**Comments explain why, not what.** The code says what it does. Comments carry
the reasoning that would otherwise be lost — why energy is integrated rather
than read from a counter, why cleartext HTTP is permitted, why the chart stays
LTR in Arabic.

**Commit messages carry reasoning**, including what remains unverified.

**Do not open pull requests unless asked.** Work on the designated branch.

## Localisation

English is the default; Arabic is fully supported. Arabic mirrors the entire
layout, not just the text — use CSS logical properties (`inset-inline-end`, not
`right`). Numbers render in Arabic-Indic digits.

Three things deliberately stay left-to-right in both languages: IP addresses and
hostnames, MQTT topics, and the time-series chart. An address reads the same in
every language, and time runs earliest-to-latest regardless.

Default outlet names are stored **empty** and rendered from the string
catalogue, so they follow the interface language. A name the user typed is
stored and never translated. Add strings to both `en` and `ar` in
`web/js/i18n.js`; a missing Arabic key falls back to English, never to a blank.

## Architecture facts worth not re-deriving

- **CORS is why the Android app exists.** A browser fetching
  `http://192.168.1.42/cm` is blocked, and the firmware sends no
  `Access-Control-Allow-Origin` header and never will. Capacitor's native HTTP
  layer is not a browser context, so it is not subject to CORS. Direct mode in a
  browser will show every strip offline; that is expected, not a bug.
- **Each device stores two addresses** — LAN and a remote one reached through a
  port forward — and the transport tries whichever answered last, falling back
  to the other. Leaving the house switches over within one poll.
- **Local history reconciles against the strip's own counters.** The strip's
  `Today` accumulator wins over anything integrated locally, because it kept
  counting while the phone was closed. On the first poll after midnight the app
  also reads `Yesterday` and corrects it. Integration is the fallback only.
- **CGNAT is why remote access needs a rendezvous point.** Egyptian residential
  internet mostly has no public IP, so port forwarding cannot work for everyone
  and both sides must connect outbound.
- **Schedules in direct mode run on the phone, while the app is open.** The UI
  says so. Do not imply otherwise; timers that must survive the app closing
  belong in the strip's firmware.

## Environment gotchas

- **Node ≥ 22.5** — the server uses the built-in `node:sqlite`, so there is no
  native module to compile.
- **`pgrep -f` / `pkill -f` can match the agent's own shell command** and kill
  the session. Use a bracket class: `pgrep -af "sim/[b]roker.js"`.
- **Test scripts must run from the repository root** so `node_modules` resolves.
- **Seeding `localStorage` then navigating by hash does not reload the store** —
  the app reads storage at boot. Force a real navigation in browser tests.
- **Some hosts are blocked by egress policy** in the development sandbox:
  `dl.google.com` (so the Android SDK cannot be fetched and the APK cannot be
  built locally — CI does it), `elektroda.com`, `community.home-assistant.io`,
  `esphome.io`. `docs/sources.md` records which sources were read directly and
  which came through search summaries only.

## Commands

```bash
npm install
npm run demo    # broker + server + 2 simulated strips → http://localhost:8080
npm test        # 39 tests
npm start       # server only, against a real broker
npx cap sync android && (cd android && ./gradlew assembleDebug)
```

The simulator speaks **both** transports — MQTT like OpenBeken publishing to a
broker, and HTTP `/cm` like a strip answering directly — so both modes are
testable with no hardware. Its appliances duty-cycle like real ones, so a
standby rule that would misfire on a fridge misfires here first.

**Run `npx cap sync android` after every web change** or you will build the
previous version and conclude your change did nothing.

## The gate

Nothing in this repository has touched a real strip. `docs/12-test-plan.md`
Stage B is the gate, and its decisive item is whether `tuya-cloudcutter` can
flash a unit over the air: if yes, ~10 minutes per strip; if no, every case gets
opened for UART flashing, roughly four times the work. Every schedule downstream
depends on that one answer.
