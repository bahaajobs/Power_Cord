# Power Cord — running Korean IoT multi-taps in Egypt

Reverse-engineering and mobile-app project for a batch of used **Korean IoT
multi-taps** (IoT 멀티탭 — Wi-Fi smart power strips): 4 individually switched
Schuko outlets, 2 USB-A charging ports, master switch, status LED, KC safety
mark.

## The problem in one paragraph

These strips are sold in Korea locked to a Korean cloud service — either a
carrier smart-home platform (LG U+ IoT@home, KT GiGA IoT, SK) or a Tuya /
Smart Life white-label cloud. The carrier apps require a Korean phone number
and an active Korean subscription to even register an account, and their
servers are geo-restricted. Outside Korea the hardware is electrically fine
and completely inert: the relays work from the physical buttons and nothing
else. That is why a working unit in Egypt has "no software to run it".

The hardware itself is not the problem. Inside almost every strip in this
class is a commodity 2.4 GHz Wi-Fi module (Beken BK7231N/T on a Tuya CB3S /
CBU / WB3S carrier, or an ESP8266/ESP8285 on a TYWE3S), four relays, an
optional energy-metering chip, and a USB charger section. That module can be
re-flashed with open firmware that speaks plain HTTP and MQTT on the local
network — at which point a custom mobile app can drive every function with no
cloud, no Korean account, and no per-device fees.

## What is in this repository

This is a **research and planning** repository. No application code yet — the
plan deliberately front-loads hardware identification, because which of three
firmware tracks you take determines the app's transport layer, and guessing
wrong costs weeks.

| Path | What it is |
| --- | --- |
| [`docs/00-executive-summary.md`](docs/00-executive-summary.md) | The decision, the risks, and what to do first |
| [`docs/01-device-identification.md`](docs/01-device-identification.md) | Step-by-step protocol to find out what you actually have |
| [`docs/02-hardware-reference.md`](docs/02-hardware-reference.md) | Electrical architecture, GPIO maps, Tuya datapoint tables |
| [`docs/03-firmware-tracks.md`](docs/03-firmware-tracks.md) | The three routes to control, with tooling and effort |
| [`docs/04-app-architecture.md`](docs/04-app-architecture.md) | Mobile app design: transports, data model, offline behaviour |
| [`docs/05-feature-spec.md`](docs/05-feature-spec.md) | Screen-by-screen feature specification |
| [`docs/06-roadmap.md`](docs/06-roadmap.md) | Phased plan with exit criteria per phase |
| [`docs/07-safety-and-compliance.md`](docs/07-safety-and-compliance.md) | Mains safety, refurb QC, KC/Egyptian regulatory reality |
| [`docs/sources.md`](docs/sources.md) | Every external source used, with links |
| [`hardware/device-fingerprint-template.md`](hardware/device-fingerprint-template.md) | Fill one per unit type before any code is written |
| [`firmware/esphome/`](firmware/esphome/) | Starter ESPHome configs for both likely chipsets |
| [`tools/`](tools/) | Network discovery and Tuya datapoint probe scripts |

## Published summary

A condensed, shareable version of this plan — the problem, the electrical
architecture, the three routes, the app design and the roadmap — is published at
<https://claude.ai/code/artifact/3cbd0722-eb9d-4782-a16b-624e36bde80e>.
The documents below are the working detail behind it.

## Start here

1. Read [`docs/00-executive-summary.md`](docs/00-executive-summary.md).
2. Run the identification protocol in
   [`docs/01-device-identification.md`](docs/01-device-identification.md) on
   **one** unit and fill in
   [`hardware/device-fingerprint-template.md`](hardware/device-fingerprint-template.md).
3. Only then pick a firmware track and start the app.

> **Mains voltage warning.** These are 220 V devices. Every procedure that
> involves opening a case assumes the strip is unplugged, and no procedure in
> this repository requires probing a live mains circuit. Read
> [`docs/07-safety-and-compliance.md`](docs/07-safety-and-compliance.md)
> before opening anything.
