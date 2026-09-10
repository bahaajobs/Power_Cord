# 08 — Teardown reference

What is actually inside strips of this class, drawn from published teardowns of
the same PCB families. Every specific pin number here belongs to a *named*
device — none of it is a generic truth, and none of it is a substitute for
opening your own unit and following
[`01-device-identification.md`](01-device-identification.md).

## Schematics

Original drawings, in [`../hardware/schematics/`](../hardware/schematics/):

| Drawing | What it shows |
| --- | --- |
| [`01-mains-topology.svg`](../hardware/schematics/01-mains-topology.svg) | The power path: PE and N unswitched to every outlet, L through one shunt then five relays |
| [`02-relay-driver.svg`](../hardware/schematics/02-relay-driver.svg) | One relay channel: GPIO → base resistor → transistor → coil, flyback diode, contact rating, isolation barrier |
| [`03-metering-front-end.svg`](../hardware/schematics/03-metering-front-end.svg) | BL0937 shunt and divider, the multiplexed CF1 output, why calibration and not frequency is what matters |
| [`04-system-architecture.svg`](../hardware/schematics/04-system-architecture.svg) | Software: strips → broker → server → phone, and where remote access comes from |
| [`05-cb3s-flashing-pinout.svg`](../hardware/schematics/05-cb3s-flashing-pinout.svg) | CB3S / BK7231N module pinout, 3.3V USB-UART wiring, CEN bootloader handshake, and mains isolation |

![Mains topology](../hardware/schematics/01-mains-topology.svg)
![CB3S Pinout & UART Flashing Hookup](../hardware/schematics/05-cb3s-flashing-pinout.svg)

---

## Published teardowns of the same PCB families

These are the reference points for the pin maps below. They are *similar*
hardware, not your hardware.

| Device | Module / chip | Metering | Notes |
| --- | --- | --- | --- |
| Tuya XS-A26 power strip, 4 AC + 4 USB | CB3S / **BK7231N** | none | The closest published match to a 4-outlet + USB strip. PCB marked `YX-B3S1-VER00`. |
| Generic Wi-Fi smart power strip, model **SM-SO301K** (4 outlets + 5 V USB) | CB3S / **BK7231N** | none | Flashed over UART: temporary wires to 3V3, GND, TXD, RXD, CEN shorted to GND during the handshake. |
| **LG U+ MTTL-W01** (4 outlets + 2 USB, Korean IoT 멀티탭) | Custom `40-LGSTAP-MAE2G` / **Realtek RTL8711AF** | Dual 2mΩ shunts per outlet + dedicated ICs | **The exact hardware in hand.** Manufactured by TCL Technoly Huizhou. RTL8711AF (Ameba1 Cortex-M3). Latching relays (FANHAR W35L-2AT-L2 / HFE39 20A). InnoSwitch INN2105K SMPS. Sub-board connected via FFC ribbon cable with I2C (`SDA2`/`SCL2`). |
| Action LSC SmartPlug 3202087 | CB2S / **BK7231N** | **BL0937** | Single socket, but the most completely documented metering pin map in this family. |
| Elworks smart dual socket | CB2S / **BK7231N** | **BL0937** | Two-gang variant of the same design. |
| AOFO smart power strip C733 | CB2S / **BK7231N** | via MCU | **TuyaMCU** — a second MCU owns the relays. This is the expensive branch of the decision tree. |
| Generic 20 A EU smart plug | **BK7231N** | BL0937 | Chip mounted directly on the main PCB, no separate module. Worth knowing this variant exists. |

Sources for all of these are listed in [`sources.md`](sources.md), with a note
on which ones this research could reach directly and which came through search
summaries only.

---

## Detailed Profile: LG U+ MTTL-W01 (Hardware in Hand)

The physical batch of smart power strips in Egypt has been confirmed as the **MTTL-W01**:

- **Model Label**: MTTL-W01 (콘센트 직류전원장치)
- **Carrier / Platform**: LG U+ IoT (IoT 멀티탭)
- **Contract Manufacturer**: TCL Technoly Electronics (Huizhou) Co., Ltd.
- **KC Certification**: HU04139-17002A / MSIP-CMM-TAV-MTTL-W01
- **Power Rating**: 250(220)V~, 60Hz, 16A max (3,520W).
- **Physical Layout**: 4 Schuko/Korean grounded outlets (each with an individual tactile button and dual-color LED), 2 USB charging ports, 1 master power button with LED ring, 1 Wi-Fi indicator LED.

### Internal Board Breakdown
1. **Main Power & Relay Board (`40-LGSTAP-PWI2G`, 1.6mm)**:
   - **Relays**: 4x **FANHAR W35L-2AT-L2 DC5V 20A 250VAC TV-8** (or Hongfa **HFE39-5/2HT-L2**). These are **latching relays** (magnetic latching) which maintain their physical switch state through power losses and only draw power during coil transition pulses.
   - **Switching Logic**: Relays fire sequentially (staggered) on master toggle to avoid drawing high surge current from the internal 5V supply.
   - **Power Supply**: High-reliability offline flyback switcher driven by a Power Integrations **INN2105K** (InnoSwitch-CE).
   - **Energy Metering**: Independent current sensing on all 4 channels using pairs of parallel `2m0` (2 milliohm) surface-mount shunts (1 mΩ effective) feeding individual 16-pin SOIC metering/driver ICs.

2. **Wi-Fi Sub-Board (`40-LGSTAP-MAE2G`, 1.2mm)**:
   - **SoC**: **Realtek RTL8711AF** (Realtek Ameba1 family, 32-bit ARM Cortex-M3 core @ 166 MHz, 1MB ROM, 512KB SRAM, 802.11b/g/n).
   - **Interconnect**: Connects to the main power board via a multi-conductor Flat Flexible Cable (FFC) ribbon cable at connector `XP3`.
   - **Bus Signals**: The FFC exposes `GND1`, `GND2`, `GND3`, `DC3_3`, `VCC_5V`, `PW_IN18_5V`, `KEY3`, `KEY4`, and **`SDA2` / `SCL2` (I2C bus)**.
   - **Test Points on PCB**:
     - **JTAG**: Dedicated pads for `JTAG_TMS1`, `JTAG_CLK1`, `JTAG_TDO1`, `JTAG_TDI1`, `JTAG_TRST1`.
     - **UART**: Labeled pads for `UART_IN`, `UART_OUT`, `UART_LOG_IN1`, `UART_LOG_OUT1`, `VD33`, `GND`.
     - **I2C / LEDs**: Labeled pads for `LED-SCK1`, `LED-SDA1`, `SDA1`, `SCL1`, `KEY1`, `KEY2`, `LED-1`, `LED2`.

3. **USB Daughterboard (`40-LGSTAP-USE2G`)**:
   - Dual Type-A USB jacks delivering 5V/2A total from the main SMPS.

### Firmware & Integration Status
> [!IMPORTANT]
> **SoC Architecture Note**: The SoC is a **Realtek RTL8711AF**, NOT a Beken BK7231 or ESP8285. Standard OpenBeken and ESPHome/LibreTiny builds do not natively target the RTL8711AF (due to Ameba1 RAM and non-XIP architecture).
> 
> Three control pathways exist for this hardware:
> 1. **Local Cloud Impersonation / DNS Interception (No-Flash)**: The stock firmware communicates locally over TCP (port 30300) and attempts to reach LG U+ servers. Redirecting the cloud domain via local DNS allows our server to emulate the carrier backend and command the strip without opening it.
> 2. **Daughterboard Replacement (Hardware Modular Swap)**: Because `40-LGSTAP-MAE2G` attaches via a detachable FFC ribbon cable carrying standard 3.3V power and I2C lines (`SDA2`/`SCL2`), a custom ESP32 or BK7231 daughterboard can be patched into the ribbon cable to drive the motherboard directly.
> 3. **Native Ameba JTAG/UART Development**: Writing firmware using the Realtek Ameba1 SDK flashed via JTAG (`TMS1`/`CLK1`/`TDO1`/`TDI1`) or `UART_LOG`.

---

## Pin maps from named devices

### Tuya XS-A26 — 4 relays + USB rail, no metering

The map that most closely matches the hardware this project targets. In
OpenBeken role terms:

| Pin | Role | Function |
| --- | --- | --- |
| `P7` | `Rel` ch 1 | Outlet 1 |
| `P8` | `Rel` ch 2 | Outlet 2 |
| `P14` | `Rel` ch 3 | Outlet 3 |
| `P9` | `Rel` ch 4 | Outlet 4 |
| `P24` | `Rel` ch 5 | USB rail |
| `P26` | `Btn_Tgl_All` | Master button, toggles everything |
| `P23` | `WifiLED_n` | Status LED, **active low** |

### Action LSC 3202087 — single socket with BL0937

| Pin | Role |
| --- | --- |
| `P8` | Relay |
| `P7` | Button |
| `P6` | LED |
| `P10` | Wi-Fi LED |
| `P11` | BL0937 `SEL` |
| `P24` | BL0937 `CF1` |
| `P26` | BL0937 `CF` |

### Read these two tables together

`P7`, `P8`, `P24` and `P26` appear in both, meaning completely different things.
That is the single most important fact on this page: **a metering strip and a
non-metering strip from the same factory do not share a pin map.** Copying a map
from a teardown that looks like your unit is how people end up driving a
metering input as a relay output.

The verification procedure is in
[`02-hardware-reference.md`](02-hardware-reference.md) and drawn in
[`02-relay-driver.svg`](../hardware/schematics/02-relay-driver.svg): unplug the
strip from mains, feed 3.3 V to the module alone, drive each candidate pin, and
listen for the click. Nothing is at mains potential and it takes ten minutes.

---

## Getting a correct config without guessing

Two tools remove the guesswork entirely, and both are better than any table:

**[UPK2ESPHome](https://upk.libretiny.eu/)** reads the *stock firmware's own*
Tuya configuration blob — the factory's pin map — and emits a matching ESPHome
YAML with relays, buttons, LEDs and the metering chip already wired up. If you
can dump the storage partition from one unit, this is the fastest route to a
correct config for a variant nobody has documented.

**OpenBeken's `tuya-cloudcutter` profile database** carries per-device pin
profiles for hundreds of units. If your unit matches a profile, the flashing
tool applies the right map for you.

For a **TuyaMCU** unit there is no pin map to find. Put OpenBeken into TuyaMCU
debug mode, press each physical button, and read the datapoint IDs out of the
log; then bind them with `linkTuyaMCUOutputToChannel [dpId] [varType]
[channelID]`. You are mapping datapoints to channels, not pins.

---

## OpenBeken commands worth knowing during bring-up

| Command | Use |
| --- | --- |
| `SetPinRole [pin] [role]` | Assign a role — usually easier in the web UI |
| `SetPinChannel [pin] [channel]` | Bind a pin to a channel |
| `SetChannel [ch] [0\|1]` | Drive a channel directly — this is how you hunt for relays |
| `POWER1 ON` / `POWERALL OFF` | Tasmota-style relay control |
| `linkTuyaMCUOutputToChannel [dpId] [type] [ch]` | Bind a TuyaMCU datapoint to a channel |
| `PowerSet [watts]` / `CurrentSet [amps]` | Calibrate metering against a reference meter; persists to flash |

`PowerSet` and `CurrentSet` are the whole calibration story: put a known
resistive load on the strip, measure it with a clamp meter, and tell the
firmware what the true value is. Do this before anyone sees a kWh figure.

---

## Photographs

There are **no third-party teardown photographs in this repository, on purpose.**
Photographs in forum teardowns belong to the people who took them; copying them
into a repository that may be redistributed is a copyright problem, not a
technical one, and the schematics above carry more information per pixel anyway.

What belongs here is photographs of **your** units. The capture protocol, the
naming convention and the manifest are in
[`../hardware/photos/README.md`](../hardware/photos/README.md). Photograph the
first unit you open before you change anything — it is the only record of how it
left the factory, and you will want it when unit 40 does not match unit 1.

### Reference teardown photo galleries (External):
To inspect high-resolution photographs of identical internal PCB layouts without redistributing copyrighted media:
- [Tuya 4AC + 4USB Power Strip (YX-B3S1-VER00) Teardown Gallery on Elektroda](https://www.elektroda.com/rtvforum/topic3908093.html) — Shows PCB component and solder sides, relay groupings, CB3S daughterboard placement, and traces.
- [Tuya SM-SO301K 4-Outlet Smart Strip Teardown & UART Pinouts](https://www.elektroda.com/rtvforum/topic3866123.html) — Shows UART flashing solder points on CB3S, CEN reset line, and internal bus bars.
- [Tuya CB2S / BL0937 Power Metering Teardown on Home Assistant Community](https://community.home-assistant.io/) — Close-ups of the 1 mΩ shunt resistor and BL0937 metering IC package.
- [LibreTiny CB3S Module Datasheet & Dimensions](https://libretiny.eu/) — Detailed pinout, mechanical drawings, and pin pitch.
