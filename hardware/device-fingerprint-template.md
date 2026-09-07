# Device fingerprint — <unit label>

Copy this file to `hardware/fingerprint-<unit-id>.md` and fill it in while
running [`../docs/01-device-identification.md`](../docs/01-device-identification.md).
One per distinct hardware variant found in the batch.

## Identity

| Field | Value |
| --- | --- |
| Unit label / batch ID | |
| Brand on housing | |
| Model number | |
| KC certificate number | |
| Certificate holder (from safetykorea.kr) | |
| Rated voltage / current / power | |
| Manufacture date or lot code | |
| MAC address | |
| QR code decodes to | |

## Behaviour (steps 2–4)

| Field | Value |
| --- | --- |
| Pairing-mode entry (button + duration) | |
| AP SSID broadcast in pairing mode | |
| DNS domains queried | |
| Verdict: Tuya / carrier / unknown | |
| TCP 6668 open? | |
| `tinytuya scan` device ID | |
| Tuya protocol version | |

## Internals (step 5)

| Field | Value |
| --- | --- |
| Wi-Fi module silkscreen | |
| Chip (BK7231N/T, ESP8285, RTL8710BN…) | |
| Secondary MCU present? Part number | |
| TuyaMCU design? | |
| Metering chip | |
| Relay count | |
| Relay part number and contact rating | |
| USB rail: switchable / always-on | |
| USB supply: own AC-DC / shared 5 V rail | |
| UART pads accessible? Labelled? | |

## Verified pin map

Fill in only pins you confirmed by driving them at 3.3 V, strip unplugged, and
hearing the relay click. Leave unverified rows blank rather than copying the
reference table.

| Pin | Function | Verified how | Confirmed |
| --- | --- | --- | --- |
| | Relay 1 → outlet 1 | | ☐ |
| | Relay 2 → outlet 2 | | ☐ |
| | Relay 3 → outlet 3 | | ☐ |
| | Relay 4 → outlet 4 | | ☐ |
| | Relay 5 → USB rail | | ☐ |
| | Master button | | ☐ |
| | Outlet buttons 1–4 | | ☐ |
| | Status LED (active low?) | | ☐ |
| | Metering CF | | ☐ |
| | Metering CF1 | | ☐ |
| | Metering SEL | | ☐ |

## Observed Tuya datapoints

From `tools/probe_tuya.py`, correlated with physical relay clicks.

| DP | Type | Observed values | Confirmed meaning |
| --- | --- | --- | --- |
| | | | |

## Flashing outcome

| Field | Value |
| --- | --- |
| `tuya-cloudcutter` succeeded? | |
| If not, failure mode | |
| UART flashing succeeded? | |
| Original firmware backed up to | |
| Firmware installed (name + version) | |
| Time taken, start to working | |

## Track decision

> This unit is **Track ___** because ___.
