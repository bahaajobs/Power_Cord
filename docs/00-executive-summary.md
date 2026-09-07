# 00 — Executive summary

## What the device is

From the photograph, the unit is a **Korean IoT multi-tap** (IoT 멀티탭) with:

- 4 × Schuko / CEE 7/3 outlets, each with its own membrane switch and legend
  (1, 2, 3, 4 marked on the housing)
- 1 × master / all-outlets button, and a separate rocker-style button below it
- 2 × USB-A charging ports
- 1 × status LED (small pinhole between the master button and the USB ports)
- "IoT 멀티탭" branding with an IoT logo on the top face
- A KC certification mark and QR code (the QR is almost always an app-download
  or product-registration link, not a device secret)
- A yellow Korean warning label. Labels of this shape on this product class
  read to the effect of *"connect your Wi-Fi router or hub to a different
  outlet"* — because if you switch off the outlet feeding your router, you lose
  the ability to switch it back on remotely. Its presence is a strong signal
  that this is a **Wi-Fi** device, not a Zigbee/Z-Wave device that needs a hub.
- A moulded CEE 7/7 angled plug on a ~1.5–2 m white cable

Korea and Egypt both run **220 V**, and Korea's plug standard is the same
Schuko family Egypt uses (Type C/F). The strip is therefore **physically and
electrically compatible with Egyptian outlets as-is** — the only difference is
50 Hz vs 60 Hz, which does not affect relays or switching and matters only for
energy-metering calibration. See
[`07-safety-and-compliance.md`](07-safety-and-compliance.md).

## Why it does nothing

Devices in this class ship locked to one of two cloud back-ends:

1. **A Korean carrier platform** — LG U+ IoT@home, KT GiGA IoT, SK Smart Home.
   Registration requires a Korean mobile identity and an active subscription;
   the servers are geo-restricted. Unusable in Egypt, permanently. There is no
   account you can create to fix this.
2. **A Tuya / Smart Life white-label cloud.** These *can* still be paired from
   Egypt with the generic Smart Life app, because Tuya is a global platform.
   If your units are Tuya-based, you already have a partial answer today.

Either way, the firmware is a commodity Wi-Fi stack on a commodity module. The
lock is a cloud-account problem, not a silicon problem.

## The recommendation

**Re-flash the Wi-Fi module with open firmware, then build a local-first
Flutter app that talks to it over MQTT and HTTP.**

This is Track A in [`03-firmware-tracks.md`](03-firmware-tracks.md). It gives
you:

- Every function under your control: 4 relays, USB rail, buttons, LED, timers,
  energy metering if the hardware has it
- No cloud dependency, no account, no ongoing per-device cost, no geo-blocking
- A documented, stable local API (Tasmota-compatible MQTT and a REST endpoint)
  that the app can target without reverse-engineering a proprietary protocol
- Firmware you can update over the air from your own app

The two viable open firmwares are **OpenBeken (OpenBK7231T_App)** and
**ESPHome via LibreTiny**; both support the Beken BK7231N/T parts these strips
use, and both expose MQTT. OpenBeken is the more forgiving choice for a mixed
fleet of unknown units because it is configurable at runtime from a web UI
rather than requiring a compile per variant.

## The three risks that actually matter

| Risk | Why it bites | How to kill it early |
| --- | --- | --- |
| **The module is not re-flashable over the air.** Tuya patched the `tuya-cloudcutter` exploit path in their SDK from February 2022; units manufactured after that may need UART flashing, which means opening every single unit and soldering or using pogo pins. | Turns a 10-minute-per-unit job into a 30–45-minute-per-unit job, and changes the economics of a large batch entirely. | Phase 0 spike: try `tuya-cloudcutter` on one unit. The answer arrives in an afternoon. |
| **The units are carrier-locked with a non-Tuya module** (a custom board, or a TuyaMCU design where a separate MCU holds the logic). | Re-flashing the Wi-Fi module gets you a radio with no control over the relays, because the relays hang off the second MCU. | Open one unit and read the silkscreen. If there is a second MCU next to the Wi-Fi module, you are in TuyaMCU territory — still solvable, but the GPIO map is replaced by a serial protocol. |
| **Used mains hardware of unknown history.** Relays wear out, and these were pulled from service for a reason. | A failed-closed relay in a customer's home is a fire and liability problem, not a bug report. | Build the refurb QC bench in [`07-safety-and-compliance.md`](07-safety-and-compliance.md) *before* deploying units, not after. |

## Do this first

Do **not** start the Flutter app yet. The first week is a hardware spike:

1. Run the identification protocol on one unit
   ([`01-device-identification.md`](01-device-identification.md)).
2. Attempt `tuya-cloudcutter` on that unit. If it works, flash OpenBeken and
   get all four relays toggling from a web browser.
3. Publish one MQTT message from a laptop and watch a relay click.

When step 3 works, the app is ordinary Flutter work against a known API, and
the roadmap in [`06-roadmap.md`](06-roadmap.md) becomes reliable. Until step 3
works, any app estimate is fiction.
