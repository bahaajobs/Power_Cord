# 12 — Test plan

Two things are being tested and they are not equally ready. The **software** can
be tested today, by anyone, with no hardware. The **hardware path** has never
touched a real strip and cannot be signed off until it has.

Work the stages in order. Each has a stop condition — if a stage fails, the next
one is not meaningful.

---

## Stage A — Software acceptance (ready now, ~30 minutes, no hardware)

Anyone with a laptop can run this. Nothing here can hurt anybody.

```bash
git clone https://github.com/bahaajobs/Power_Cord.git
cd Power_Cord && git checkout claude/korean-power-cord-app-88ip32
npm install
npm test          # expect 20 passing
npm run demo      # then open http://localhost:8080  (admin / powercord)
```

| # | Check | Pass |
| --- | --- | --- |
| A1 | `npm test` reports 20 passing | ☐ |
| A2 | Two strips appear, both ONLINE, four outlets each | ☐ |
| A3 | Tapping an outlet turns it on within a second and it stays on | ☐ |
| A4 | Turn all on → 4/4; All off → every strip goes to 0 | ☐ |
| A5 | Total power tracks what you switch on | ☐ |
| A6 | Consumption: 7/30/90 tabs, tapping a bar shows that day's figure | ☐ |
| A7 | Tariff: switch to brackets, set month-to-date to 900, cost rises | ☐ |
| A8 | Countdown timer for 1 minute fires and switches the outlet | ☐ |
| A9 | Overload rule at a low threshold cuts the strip and logs an event | ☐ |
| A10 | Stop the simulator (Ctrl-C the `sim` process) → strips go OFFLINE, commands refuse | ☐ |
| A11 | Install to home screen on an Android phone on the same Wi-Fi | ☐ |

**A11 needs the phone and laptop on the same network** — use the laptop's LAN IP
(`http://192.168.x.x:8080`), not `localhost`.

**Stop condition:** all of A1–A10 pass. A11 is desirable but not blocking.

---

## Stage A2 — The Android app and direct mode (ready now, needs a phone)

Get the APK from Actions → *Build Android APK* → run → download the artifact
([`14-android-app.md`](14-android-app.md)). Install it, then, with the demo
stack still running on the laptop:

| # | Check | Pass |
| --- | --- | --- |
| A2.1 | The APK installs and opens | ☐ |
| A2.2 | First launch shows the five-step setup guide | ☐ |
| A2.3 | Add a strip by address — for the simulator use the laptop's LAN IP and port 8101 | ☐ |
| A2.4 | **Test connection** reports the outlet count before you save | ☐ |
| A2.5 | The strip shows ONLINE and reads *Local · direct* | ☐ |
| A2.6 | Toggling an outlet switches the simulated strip (watch the laptop's log) | ☐ |
| A2.7 | Add a second strip (port 8102). Both are listed and both poll | ☐ |
| A2.8 | Settings → Language → العربية mirrors the whole layout, right to left | ☐ |
| A2.9 | Arabic shows Arabic-Indic numerals; addresses stay left-to-right | ☐ |
| A2.10 | Switch back to English; the choice survives closing and reopening the app | ☐ |
| A2.11 | Energy screen fills in over a few minutes and survives a restart | ☐ |
| A2.12 | Stop the simulator → strips go OFFLINE and commands are refused | ☐ |
| A2.13 | Kill the laptop's *server* but leave the simulator running → direct mode still works, proving no server is involved | ☐ |

**A2.13 is the point of the whole rewrite.** If it fails, direct mode is not
actually direct.

Then, with real flashed hardware (after Stage B):

| # | Check | Pass |
| --- | --- | --- |
| A2.14 | Scan my network finds the strip without typing an address | ☐ |
| A2.15 | Set a username and password on the strip; the app still works with them entered, and fails clearly without | ☐ |
| A2.16 | Forward a port, set the outside address, turn Wi-Fi off on the phone → control works over mobile data | ☐ |
| A2.17 | Turn Wi-Fi back on → it returns to the local address on its own | ☐ |

Read the security section of [`13-direct-mode.md`](13-direct-mode.md) before
A2.16. A forwarded strip is on the public internet in clear text.

### What Stage A2 has already been verified to do

Driven in a browser against the HTTP simulator, which answers exactly as
OpenBeken does:

- setup wizard → add device → strip online → toggle switches the real device
- a change made *at* the device appears in the app
- two strips added and polled independently
- history written and reconciled from the device's own counters (`source:
  device`, including the after-midnight *Yesterday* correction)
- Arabic: `dir=rtl`, mirrored layout, Arabic-Indic numerals, no horizontal
  overflow, default outlet names following the language
- devices and language survive a restart
- unreachable strip → OFFLINE and an explicit banner
- 9 automated tests over the direct transport, including LAN→remote failover

**The APK builds.** CI produced a 3.4 MB debug APK on the first run, in about
90 seconds. What is *not* verified is the app running on a phone: nobody has
installed it yet. That is Stage A2.1 onwards, and it is the next thing to do.

### What Stage A has already been verified to do

Run in this session, on simulated hardware:

- 20 automated tests, including a suite that boots broker, server and strips and
  drives the real API
- broker killed mid-session → strips marked offline, commands refused with 503,
  and **everything reconnects on its own** when the broker returns
- server restarted → strip names, energy history and issued tokens all survive
- three simultaneous app clients all receive live updates; a bad token is refused
- 360 px phone viewport: no horizontal scroll, all touch targets ≥ 40 px, scroll
  position held across live updates, real taps land

### What Stage A does **not** prove

- Nothing has been tested against a real strip.
- The Docker image has never been built (no Docker daemon in the build
  environment). `docker compose up` is unverified — the Dockerfile's paths and
  dependencies were checked statically only.
- TLS, the VPS deployment and the systemd unit are unverified.
- No iOS device has been tested.

---

## Stage B — Hardware bring-up (NOT ready — this is the gate)

This is Phase 0 from [`06-roadmap.md`](06-roadmap.md) and it has not been done.
Until it is, no schedule for the rest is trustworthy.

> **Read [`07-safety-and-compliance.md`](07-safety-and-compliance.md) first.**
> The strip is unplugged for every step that involves opening it. No step here
> requires probing a live mains circuit.

| # | Step | Pass |
| --- | --- | --- |
| B1 | Photograph and record one unit per [`01-device-identification.md`](01-device-identification.md) steps 1–4 | ☐ |
| B2 | Open one unit; identify the Wi-Fi module, any second MCU, the metering chip | ☐ |
| B3 | Fill in a fingerprint sheet; decide the track | ☐ |
| B4 | Attempt `tuya-cloudcutter` on that unit | ☐ |
| B5 | If OTA fails: back up the stock firmware over UART **before writing anything** | ☐ |
| B6 | Flash OpenBeken | ☐ |
| B7 | With the strip **unplugged**, feed the module 3.3 V and map each relay by ear | ☐ |
| B8 | Configure pin roles; all four relays toggle from the strip's own web UI | ☐ |
| B9 | Point the strip at your broker; it appears in the app on its own | ☐ |
| B10 | Toggle each outlet from the app; confirm with a load, not just the UI | ☐ |
| B11 | If metering: calibrate against a known resistive load and a clamp meter | ☐ |
| B12 | Repeat B1–B3 on a second unit from a different part of the batch | ☐ |

**The decisive result is B4.** If OTA flashing works, a unit takes about ten
minutes. If it does not, every unit must be opened and flashed over UART, which
is roughly four times the work and changes the economics of the whole batch.
That answer takes one afternoon and everything downstream depends on it.

**B12 matters more than it looks.** Used stock is often not homogeneous. Two
units from different parts of the batch that fingerprint differently means two
procedures, not one.

**Stop condition:** B8 and B9 pass — a real relay clicks from the app.

---

## Stage C — Deployment (after B)

| # | Check | Pass |
| --- | --- | --- |
| C1 | `docker compose up -d` brings up broker and server | ☐ |
| C2 | Per-strip broker credentials and ACL stanzas work; a strip cannot reach another's topics | ☐ |
| C3 | Server survives a reboot and comes back with its data | ☐ |
| C4 | On a VPS: MQTTS on 8883 with a real certificate; strip connects | ☐ |
| C5 | HTTPS for the app via Caddy; WebSocket live updates work through it | ☐ |
| C6 | **Kill the VPS. The strip still works from its buttons and its local web UI.** | ☐ |
| C7 | Restore from a `.backup` copy of the database into a clean install | ☐ |

**C6 is the one not to skip.** It is the specific failure that made these strips
useless in the first place, and the only way to know you have not rebuilt it is
to switch your own server off and watch the hardware keep working.

---

## Stage D — Field pilot

Only after a unit has been through the QC bench in
[`07-safety-and-compliance.md`](07-safety-and-compliance.md): earth continuity,
insulation resistance, twenty switching cycles under load, a thirty-minute load
test.

Put **three** units in real homes for two weeks. Watch for: relays that stop
responding, strips that drop off Wi-Fi and do not come back, schedules that
miss, energy figures that drift from a reference meter, anything warm.

Do not scale past three until two weeks have passed without an incident.

---

## Honest summary

| | Status |
| --- | --- |
| Server and app, on simulated hardware | **Ready to test now** |
| Direct mode, multi-strip, Arabic, local history | **Verified in a browser against the simulator** |
| The Android APK | **Builds in CI; never installed on a phone** |
| Resilience: broker loss, server restart, reconnect | **Verified** |
| Phone layout and touch behaviour | **Verified at 360 px, Chromium only** |
| Docker / TLS / VPS deployment | **Written, never run** |
| Anything involving a real strip | **Not started — Stage B is the gate** |
| Selling refurbished units to the public | **Not until Stage D and the compliance advice in doc 07** |
