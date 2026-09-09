# 15 — Handoff prompt for another AI

Paste the block below into a new AI session that has the repository available.
It carries the context, the conventions, and the analysis task, so the next
agent starts where this one left off instead of re-deriving decisions or
quietly reversing them.

Two mechanisms, use whichever fits:

- **Claude Code** reads [`../CLAUDE.md`](../CLAUDE.md) automatically at the
  start of every session in this repository. Nothing to paste.
- **Any other AI** — paste the prompt below. It is self-contained.

Keep both current. When a convention changes, change it in `CLAUDE.md` and
mirror it here; when the project's state changes materially (hardware
identified, APK installed, Stage B done), update the *Current state* section so
the next agent is not told something stale.

---

## The prompt

```text
You are joining an in-progress engineering project. Read this brief fully
before touching anything, then do the analysis task at the end.

## The project

A batch of used Korean IoT multi-taps (IoT 멀티탭 — 4-outlet Wi-Fi smart power
strips with 2 USB ports) sits in Egypt, unusable. They are locked to a Korean
cloud service that cannot be reached from Egypt: the carrier platforms (LG U+,
KT, SK) require a Korean mobile identity and are geo-restricted, and no account
can be created from outside. The hardware is fine. The lock is a cloud-account
problem, not a silicon one.

The fix is to re-flash each strip's Wi-Fi module (Beken BK7231N/T, or an
ESP8285) with open firmware — OpenBeken or ESPHome — and control the strips
with our own software. That software exists and is the bulk of this repository.

Repository: bahaajobs/Power_Cord, branch claude/korean-power-cord-app-88ip32.

## What has been built

An Android app (Capacitor-wrapped web app) that talks to each strip DIRECTLY —
no server, no broker, no cloud — over Tasmota's HTTP command endpoint
(GET /cm?cmnd=STATE, /cm?cmnd=POWER1%20ON, /cm?cmnd=STATUS%208), which is what
OpenBeken serves. Features: unlimited strips, per-outlet control, local energy
history, schedules, standby-cutoff and overload rules, English + Arabic with
full RTL, and a five-step first-run setup guide.

An optional Node server (server/) that bridges MQTT to a REST + WebSocket API,
for fleets and for schedules that fire with the app closed.

A device simulator (sim/) that speaks BOTH transports — MQTT like OpenBeken
publishing to a broker, and HTTP /cm like a strip answering directly — so the
whole system is testable with no hardware. `npm run demo` starts a broker, the
server and two simulated strips.

Hardware research in docs/: device identification protocol, firmware tracks,
teardown reference, original schematics (hardware/schematics/, SVG), mains
safety and refurbishment QC, remote-access analysis, build and user manuals,
and a staged test plan.

39 automated tests pass. CI (.github/workflows/android.yml) builds an
installable debug APK on GitHub's runners.

## Current state — what is and is not verified

VERIFIED, against the simulator and in a browser:
- direct-mode control: add a strip by address, toggle outlets, changes made at
  the device appear in the app, multiple strips polled independently
- LAN-to-remote address failover
- local history written and reconciled from the device's own energy counters,
  including the after-midnight correction
- Arabic: dir=rtl, mirrored layout, Arabic-Indic numerals, no horizontal
  overflow, default outlet names following the language
- devices and language surviving a restart
- resilience: broker killed mid-session (strips go offline, commands refused,
  everything reconnects unaided), server restarted (names, history and tokens
  survive), three concurrent clients, bad tokens refused
- phone behaviour at 360 px: touch targets, scroll retention, real taps landing

NOT VERIFIED:
- Nothing in this repository has ever touched a real strip. This is the gate.
- The APK builds in CI but has never been installed or run on a phone.
- TLS, the VPS deployment, the systemd unit and Docker are written but unrun.
- No iOS build.

## Non-negotiables — do not "simplify" these away

1. This is 220 V mains hardware. Every documented procedure assumes the strip
   is UNPLUGGED. No procedure may require probing a live circuit.

2. "Off" is not "isolated". These strips switch the live conductor only;
   neutral stays connected to every outlet at all times. Never write UI text or
   documentation implying a switched-off outlet is safe to touch.

3. A command is never assumed to have worked. The device's reply carries the
   state the relay actually reached; anything unconfirmed within ~3.5 seconds
   is reverted in the UI. A user who believes a heater is off when it is on is
   the failure this design exists to prevent. Optimistic updates without
   reconciliation are a bug, not a performance win.

4. Never promise what the hardware cannot do. The metering shunt sits upstream
   of all four relays, so energy is measured PER STRIP, NEVER PER OUTLET. No
   feature, chart or document may attribute energy to a single outlet.

5. Capabilities are detected, not assumed. A strip gains an energy tab only
   after it has actually reported telemetry. Strips with no meter display
   "no meter", never a zero that reads like a measurement.

6. Relay power-on behaviour defaults to off, because a heater switching itself
   on after a blackout in an empty flat is the hazard.

7. Egyptian electricity is billed in rising brackets, so a single price per kWh
   is wrong by construction. The bracket table stays user-editable; rates are
   never hardcoded as truth.

8. Pin maps and Tuya datapoint IDs are HYPOTHESES, always. They come from
   teardowns of similar hardware, and the same pins mean different things on
   metering and non-metering variants. Never present them as facts about these
   specific units.

9. No third-party copyrighted assets. Teardown photographs belong to whoever
   took them — link, never commit. The schematics in hardware/schematics/ are
   original SVGs; extend those.

## Working method to preserve

- Verify before claiming. Run the thing. If something cannot be tested in your
  environment, say so explicitly rather than implying it works. The repository
  already carries several "written but never run" notes — keep that habit, and
  correct them when something does get verified.
- Report honestly what is unverified, in commit messages and documents both.
- Distinguish a real bug from a test artifact: measure before concluding. One
  apparent UI overlap here turned out to be the test harness racing a
  re-render; the real fix was elsewhere.
- Fix root causes rather than symptoms.
- Comments explain WHY, not what — the reasoning that would otherwise be lost.
- Commit messages carry reasoning, including known gaps.
- Do not open pull requests unless explicitly asked. Work on the designated
  branch.
- Deliver the scope asked for. Flag concerns in a sentence or two, then finish
  the work; do not silently narrow or widen it.

## Localisation rules

English is the default; Arabic is fully supported and mirrors the entire
layout, not just the text. Use CSS logical properties (inset-inline-end, not
right). Numbers render in Arabic-Indic digits.

Three things stay left-to-right in both languages, deliberately: IP addresses
and hostnames, MQTT topics, and the time-series chart — an address reads the
same in every language, and time runs earliest-to-latest regardless.

Default outlet names are stored EMPTY and rendered from the string catalogue so
they follow the interface language; a name the user typed is stored and never
translated. Add strings to both en and ar in web/js/i18n.js.

## Architecture facts — do not re-derive these

- CORS is why the Android app exists. A browser fetching
  http://192.168.1.42/cm is blocked, and the firmware sends no
  Access-Control-Allow-Origin header and never will. Capacitor's native HTTP
  layer is not a browser context and so is not subject to CORS. Direct mode in
  a browser shows every strip offline — expected, not a bug.
- Each device stores two addresses (LAN, and a remote one reached through a
  router port forward) and the transport tries whichever answered last, falling
  back to the other. Leaving the house switches over within one poll.
- Local history reconciles against the strip's own counters: the device's
  "Today" accumulator wins over anything integrated locally, because it kept
  counting while the phone was closed. Integration is the fallback only.
- CGNAT is why remote access needs a rendezvous point: most Egyptian
  residential internet has no public IP, so both sides must connect outbound.
- Schedules in direct mode run on the phone while the app is open. The UI says
  so. Timers that must survive the app closing belong in the strip's firmware.
- A port forward to a strip is supported because it was asked for, and
  docs/13-direct-mode.md is blunt about the cost: it puts a mains relay
  controller on the public internet in clear text. Keep that warning intact.

## Environment gotchas

- Node >= 22.5 (the server uses the built-in node:sqlite; no native modules).
- `pgrep -f` / `pkill -f` patterns can match your own shell command and kill
  your session. Use a bracket class: pgrep -af "sim/[b]roker.js".
- Test scripts must run from the repository root so node_modules resolves.
- Seeding localStorage then navigating by hash does not reload the app's store,
  which reads storage at boot. Force a real navigation in browser tests.
- Run `npx cap sync android` after every web change, or you will build the
  previous version and conclude your change did nothing.
- Some hosts may be blocked by egress policy: dl.google.com (so the Android SDK
  cannot be fetched and the APK cannot be built locally — CI does it),
  elektroda.com, community.home-assistant.io, esphome.io. docs/sources.md
  records which sources were read directly and which came only as search
  summaries.

## Layout

  CLAUDE.md              these conventions, auto-loaded by Claude Code
  docs/                  research, manuals, test plan, this handoff
                         (00-executive-summary … 15-agent-handoff, sources)
  web/                   the app; web/js/ holds the modules
    js/direct.js         HTTP transport to a strip (the heart of direct mode)
    js/engine.js         polling, reconciliation, schedules, rules
    js/history.js        IndexedDB history + reconciliation with the device
    js/store.js          devices, settings, tariff maths
    js/i18n.js           en + ar catalogue, RTL, Arabic-Indic numerals
    js/views.js          render functions
  server/src/            optional MQTT-to-REST server
  sim/                   broker + simulator (MQTT and HTTP)
  test/                  39 tests, including a self-booting integration suite
  android/               Capacitor project; the APK builds from this
  hardware/schematics/   original SVG drawings
  deploy/                Mosquitto config + ACL, systemd unit

## Your task

Analyse this repository and report back. Specifically:

1. Read, in this order: CLAUDE.md, docs/00-executive-summary.md,
   docs/13-direct-mode.md, docs/12-test-plan.md. They carry the reasoning,
   the direct-mode design and what is and is not tested.
2. Assess correctness and risk in web/js/ (especially direct.js, engine.js and
   history.js) and server/src/. Look hardest at anything touching relay state,
   the command-confirmation path, and the energy reconciliation, since those
   are where a defect has physical or misleading consequences.
3. Identify where the code and the documentation disagree. Documentation
   claiming behaviour the code does not have is a defect here, not a nitpick.
4. List what is untested and what would be worth testing next, ranked by the
   cost of being wrong.
5. Flag anything that violates the non-negotiables above.

Report findings with file paths and line references. Do not change code, open
pull requests, or alter the conventions in this brief unless you are explicitly
asked to. If you believe a convention is wrong, say so and explain why — but
leave it in place until a human decides.
```

---

## Keeping this current

Update the *Current state* section when any of these change:

| Event | What to change |
| --- | --- |
| A real strip is identified and flashed | Move Stage B out of "not verified"; record the module, pin map and track by copying [`hardware/device-fingerprint-template.md`](../hardware/device-fingerprint-template.md) to `hardware/fingerprint-<unit>.md` (gitignored by default) |
| The APK is installed and driven on a phone | Move it out of "not verified"; record what broke |
| TLS / VPS / Docker actually run | Same |
| A convention changes | Change `CLAUDE.md` first, then mirror it in the prompt above |

The point of the *Current state* section is that a new agent is never told
something stale and confidently repeats it. That failure is worse than the
agent knowing nothing.
