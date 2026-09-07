# 03 — The three firmware tracks

Pick using the output of [`01-device-identification.md`](01-device-identification.md).

| | Track A — re-flash | Track B — stock Tuya, local | Track C — carrier-locked |
| --- | --- | --- | --- |
| Precondition | Any BK7231 / ESP8266 module, no hostile secondary MCU | Device is Tuya *and* you can pair it once | Device is LG U+ / KT / SK |
| Cloud needed | None, ever | Once, to extract the local key | N/A — must become Track A |
| Per-unit effort | 10 min (OTA) or 30–45 min (UART) | 5 min | Track A effort + case opening |
| Fragility | Low — you own the firmware | Medium — local key resets on re-pair | — |
| App transport | MQTT + HTTP | Tuya local protocol on TCP 6668 | MQTT + HTTP |
| **Verdict** | **Recommended** | Good as a week-1 proof of life | Forced into A |

---

## Track A — re-flash with open firmware (recommended)

### Which firmware

**OpenBeken (`OpenBK7231T_App`)** is the better fit for this project.
It supports the whole Beken BK7231T/N/M/S/U family plus ESP8266/ESP32, Realtek,
Bouffalo and others from one codebase, and — critically for a mixed batch of
used units — **pin assignments are configured at runtime from the device's own
web UI**, so one firmware binary covers every variant you find. It exposes
Tasmota-compatible MQTT and HTTP.

**ESPHome via LibreTiny** is the alternative. It is more elegant and better
documented, has a first-class REST API and SSE event stream, and integrates
natively with Home Assistant — but it requires compiling a distinct binary per
hardware variant. Use it if the batch turns out to be homogeneous and you want
the nicer API.

Both are viable. The app's transport abstraction (see
[`04-app-architecture.md`](04-app-architecture.md)) is designed so this choice
is reversible.

### Flashing route 1 — over the air, no soldering

[`tuya-cloudcutter`](https://github.com/tuya-cloudcutter/tuya-cloudcutter)
exploits a vulnerability in the stock Tuya SDK to push new firmware over Wi-Fi
with the case closed.

Requirements: a Linux machine, Docker, `NetworkManager`/`nmcli`, sudo, and — the
part people miss — **a second Wi-Fi adapter dedicated to the tool**, because it
has to host an access point while you stay connected via ethernet.

The procedure: the tool scans for the device's pairing-mode AP, connects, runs
the exploit chain to gain code execution, and writes your chosen firmware image
(a `.uf2` or `UG` file from the OpenBeken releases page).

**The limitation that decides your economics:** Tuya patched this in their SDK
in **February 2022**. Units built and shipped with a later SDK are not
exploitable this way. Realtek RTL8710BN devices on SDK 2.0.0 are likewise
immune. Since your stock is used Korean retail hardware of unknown vintage,
**test this on one unit before planning around it.**

### Flashing route 2 — UART, when OTA fails

Open the case, connect a 3.3 V USB-TTL adapter to the module's TX/RX/GND/VCC
pads (they are almost always broken out on the carrier board and often
labelled), and flash with
[`ltchiptool`](https://github.com/libretiny-eu/ltchiptool).

Non-negotiable first step: **read out and save the original firmware image**
before writing anything. It is your only route back, and it also contains the
device's Tuya credentials, which is how you recover a Track B fallback if the
re-flash misbehaves.

Do not power the module from mains while a USB-TTL adapter is attached. Power
it from the adapter's 3.3 V, with the strip unplugged. Some carrier boards
require holding CEN/RST low during the handshake; `ltchiptool` prompts for the
power cycle.

For a batch, build a **pogo-pin jig**: a small board with spring pins matching
the module's pad pattern, so you press the strip's PCB onto the jig rather than
soldering each unit. This is what turns 45 minutes per unit into about 8.

### After flashing

OpenBeken boots into its own AP. Join it, enter your Wi-Fi credentials, then in
the web UI:

1. Assign pin roles (`Rel` channels 1–5, `Btn`, `WifiLED_n`) per
   [`02-hardware-reference.md`](02-hardware-reference.md), verifying each by
   listening for relay clicks.
2. Configure the MQTT broker address, client name and credentials.
3. Save a **backup of the finished configuration** — OpenBeken can export it,
   and that export is your golden image for every remaining unit in the batch.

The local API you now have:

```
# MQTT — command
<devname>/1/set          payload: 1 | 0        # relay 1 on/off
<devname>/5/set          payload: 1 | 0        # USB rail
cmnd/<devname>/<command> payload: <args>       # any of the ~468 console commands

# MQTT — state
<devname>/connected      → "online"            # LWT
<devname>/1/get          → 1 | 0               # relay 1 state, published on change
<devname>/ip             → 192.168.1.42
<devname>/rssi           → -58
<devname>/uptime         → 84213
<devname>/voltage/get    → 221.4
tele/<devname>/SENSOR    → {"ENERGY":{"Power":..,"Current":..,"Total":..}}

# HTTP — Tasmota-compatible JSON, plus the web UI and OTA upload
```

The `<devname>/connected` last-will topic is what the app uses to show a strip
as offline; it is far more reliable than polling.

---

## Track B — keep stock Tuya firmware, control it locally

Worth doing in week 1 even if you intend to re-flash, because it proves the
hardware works end to end in under an hour.

1. Pair the strip with the generic **Smart Life** app from Egypt. This works —
   Tuya is a global platform with no Korean geo-lock.
2. Create a free developer account at `iot.tuya.com`, link your Smart Life
   account by QR, and run `python -m tinytuya wizard`. This returns every
   paired device with its **device ID** and **local key**, written to a
   `devices.json`.
3. From then on, control is entirely on the LAN over TCP 6668:

```python
import tinytuya
d = tinytuya.OutletDevice('DEVICE_ID', 'IP', 'LOCAL_KEY', version=3.3)
print(d.status())          # {'dps': {'1': True, '2': False, '19': 421, ...}}
d.set_status(True,  switch=1)   # outlet 1 on
d.set_status(False, switch=2)   # outlet 2 off
```

**Why this is not the destination:** the local key is issued by the cloud and
**rotates every time the device is re-paired**. Any customer who factory-resets
their strip silently breaks your app until someone re-runs the wizard against a
Tuya developer account. That is not a support burden you want across a large
deployed fleet. It is, however, an excellent bring-up tool and a legitimate
fallback for units that resist re-flashing.

`tools/probe_tuya.py` in this repository automates the scan + DP dump.

---

## Track C — carrier-locked units

There is no software answer. The carrier back-end will not authenticate a
device or a user outside Korea, and no account you can open changes that.
Track C units must be converted to Track A.

Two sub-cases, decided by step 5b of the identification protocol:

**C1 — standard module, no secondary MCU.** Identical to Track A from here.
The carrier firmware is just a different payload on the same BK7231/ESP module;
UART flashing overwrites it. `tuya-cloudcutter` will *not* work (the exploit
targets the Tuya SDK specifically), so plan for the jig.

**C2 — TuyaMCU or a custom two-chip design.** The Wi-Fi module is a modem and a
separate MCU owns the relays, communicating over UART. Re-flashing the module
gets you a radio that cannot switch anything. Options, in order of preference:

1. **Speak the serial protocol.** OpenBeken implements the TuyaMCU protocol and
   can drive the second MCU exactly as the stock firmware did — you map
   *datapoint IDs* to channels instead of GPIO pins. Extract the dpIDs by
   putting OpenBeken in TuyaMCU debug mode and pressing each physical button
   while watching the log.
2. **Bypass the second MCU.** Cut the relay-driver traces and wire the module's
   spare GPIOs directly to the driver transistors. Effective, permanent,
   and only sane for small numbers.
3. **Replace the control board.** Design a drop-in PCB — ESP32-C3 + four relay
   drivers + a BL0942 — that reuses the existing enclosure, outlets, cord and
   relays. At batch scale this can be *cheaper per unit* than skilled rework
   labour, and it gives you identical, documented, warrantable hardware across
   the whole fleet. Cost it properly before dismissing it: if the batch is
   large and the units are C2, this is probably the right answer.

---

## What re-flashing costs you

- **The KC certification no longer applies** to a modified unit. See
  [`07-safety-and-compliance.md`](07-safety-and-compliance.md) — this matters
  if you intend to sell rather than self-deploy.
- **The original app is gone for good.** Not a loss here, since it never worked
  in Egypt.
- **A bricked unit is possible** if flashing is interrupted. UART flashing is
  recoverable; a failed OTA on a device you cannot open easily is not. Always
  take the firmware backup.
