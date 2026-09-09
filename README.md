# Power Cord — running Korean IoT multi-taps in Egypt

Reverse-engineering, firmware notes, and a working control system for a batch of
used **Korean IoT multi-taps** (IoT 멀티탭 — Wi-Fi smart power strips): 4
individually switched Schuko outlets, 2 USB-A ports, master switch, KC mark.

Sold in Korea locked to a cloud you cannot reach from Egypt. The hardware is
fine; the lock is a cloud-account problem, not a silicon one. Re-flash the Wi-Fi
module with open firmware and everything in this repository takes over.

## The app

An installable **Android app** that talks to each strip **directly** — no
server, no broker, no cloud. On your Wi-Fi it uses the strip's LAN address;
from outside, an address your router forwards. It fails over between them on
its own.

**Getting the APK:** [Actions → Build Android APK](https://github.com/bahaajobs/Power_Cord/actions/workflows/android.yml)
→ open the latest run → download the **powercord-debug-apk** artifact. It
installs directly on a phone. Details in
[`docs/14-android-app.md`](docs/14-android-app.md).

English and Arabic with full RTL, unlimited strips, local history that syncs
with each strip's own energy counters, and a first-time setup guide built in.

A server is still available for fleets and for background schedules
([`docs/09-backend-manual.md`](docs/09-backend-manual.md)), but it is optional.

```bash
git clone https://github.com/bahaajobs/Power_Cord.git
cd Power_Cord && npm install && npm run demo
```

Open **http://localhost:8080** — that runs a broker, the server and two
simulated strips, which also expose the same HTTP endpoints a real flashed
strip does, so direct mode can be exercised with no hardware.

**Published pages:** the [research and plan](https://claude.ai/code/artifact/3cbd0722-eb9d-4782-a16b-624e36bde80e),
and the [build-and-use manual](https://claude.ai/code/artifact/77a5406d-e0ae-46ae-bd7a-064703f90e56).

## What is here

**Working software.** A Node.js server that bridges MQTT to a REST + WebSocket
API, and an installable web app: live power, per-outlet control, schedules,
standby cutoff and overload rules, energy history with Egyptian bracket tariffs.
20 tests, including an end-to-end run against simulated hardware.

**Hardware research.** An identification protocol, original schematics, teardown
references for the PCB families these strips use, and the mains-safety and
refurbishment work that comes with putting used switchgear back into homes.

| | |
| --- | --- |
| [`docs/00-executive-summary.md`](docs/00-executive-summary.md) | The decision, the risks, what to do first |
| [`docs/01-device-identification.md`](docs/01-device-identification.md) | Find out what you actually have, before writing code |
| [`docs/02-hardware-reference.md`](docs/02-hardware-reference.md) | Electrical architecture, GPIO maps, Tuya datapoints |
| [`docs/03-firmware-tracks.md`](docs/03-firmware-tracks.md) | Three routes to control, with tooling and effort |
| [`docs/04-app-architecture.md`](docs/04-app-architecture.md) | Transport abstraction, offline behaviour, data model |
| [`docs/05-feature-spec.md`](docs/05-feature-spec.md) | Feature specification |
| [`docs/06-roadmap.md`](docs/06-roadmap.md) | Phased plan with exit criteria |
| [`docs/07-safety-and-compliance.md`](docs/07-safety-and-compliance.md) | Mains safety, refurb QC, KC/EOS reality |
| [`docs/08-teardown.md`](docs/08-teardown.md) | Teardown reference and schematics |
| **[`docs/09-backend-manual.md`](docs/09-backend-manual.md)** | **Build and run the server — laptop, home, VPS** |
| **[`docs/10-user-manual.md`](docs/10-user-manual.md)** | **Using the app** |
| **[`docs/11-remote-access.md`](docs/11-remote-access.md)** | **Do you need a server to use it away from home?** |
| **[`docs/12-test-plan.md`](docs/12-test-plan.md)** | **What can be tested now, and what is gated on hardware** |
| **[`docs/13-direct-mode.md`](docs/13-direct-mode.md)** | **No-server control, port forwarding, and what it costs** |
| **[`docs/14-android-app.md`](docs/14-android-app.md)** | **Getting and building the APK** |
| [`docs/15-agent-handoff.md`](docs/15-agent-handoff.md) | Brief for handing this project to another AI |
| [`docs/sources.md`](docs/sources.md) | Every external source, with links |

| Code | |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Working conventions — read before changing anything |
| [`server/`](server/) | Node 22 server: MQTT bridge, REST + WebSocket API, SQLite, scheduler |
| [`web/`](web/) | The app: direct + server transports, bilingual, local history |
| [`android/`](android/) | Capacitor Android project — the APK is built from this |
| [`sim/`](sim/) | Development broker and virtual strips, so the stack runs with no hardware |
| [`test/`](test/) | Unit tests plus a self-booting end-to-end suite |
| [`firmware/esphome/`](firmware/esphome/) | Starter configs for both likely chipsets |
| [`hardware/schematics/`](hardware/schematics/) | Original drawings: mains topology, relay drive, metering, architecture |
| [`hardware/photos/`](hardware/photos/) | Capture protocol for photographing your own units |
| [`deploy/`](deploy/) | Mosquitto config and ACL, systemd unit |
| [`tools/`](tools/) | Network discovery and Tuya datapoint probe |

## Do you need a server to use this away from home?

Yes — one small server you own, not a vendor cloud. Egyptian residential internet
is largely CGNAT, so neither port forwarding nor dynamic DNS can reach a strip
from outside; both the strip and the phone have to make **outbound** connections
to a common point.

The good news is that it is the same server either way. Run it on a Raspberry Pi
and you have LAN control; run the identical thing on a $4/month VPS and it works
from anywhere. [`docs/11-remote-access.md`](docs/11-remote-access.md) compares
the four options and [`docs/09-backend-manual.md`](docs/09-backend-manual.md)
builds the recommended one.

Crucially, the strips keep their own local web UI, so a strip whose server
vanishes still works from its buttons and on the LAN. Losing a vendor's server
is exactly what made these strips useless in the first place.

## Where to start with the hardware

1. Read [`docs/00-executive-summary.md`](docs/00-executive-summary.md).
2. Run the protocol in [`docs/01-device-identification.md`](docs/01-device-identification.md)
   on **one** unit and fill in
   [`hardware/device-fingerprint-template.md`](hardware/device-fingerprint-template.md).
3. Pick a firmware track from [`docs/03-firmware-tracks.md`](docs/03-firmware-tracks.md).
4. Flash one strip, point it at your broker, and it appears in the app.

Every pin number and datapoint id in these documents comes from teardowns of
similar hardware. They are hypotheses to verify against your units, and they are
labelled that way throughout.

> **Mains voltage.** These are 220 V devices. Every procedure here assumes the
> strip is unplugged, and none requires probing a live circuit. Read
> [`docs/07-safety-and-compliance.md`](docs/07-safety-and-compliance.md) before
> opening anything.
>
> An outlet switched "off" is **not** electrically dead — these strips switch
> live only, and neutral stays connected.
