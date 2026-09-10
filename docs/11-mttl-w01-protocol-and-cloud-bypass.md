# 11 — MTTL-W01 Protocol, Hardware Teardown & Cloud Bypass Reference

This document records the exact physical hardware profile, reverse-engineered networking protocols, pairing procedures, and local cloud-bypass architectures for the **LG U+ / TCL MTTL-W01** smart multi-tap (IoT 멀티탭).

---

## 1. Physical Device & Label Confirmation

From physical units in Egypt:
- **Product Name**: 콘센트 (직류전원장치) / Socket (DC Power Supply Unit)
- **Model Name**: **MTTL-W01**
- **Brand / Carrier**: **LG U+** (*IoT 멀티탭*)
- **Contract Manufacturer**: **TCL Technoly Electronics (Huizhou) Co., Ltd. / 중국**
- **KC Certification ID**: `HU04139-17002A`
- **Identification Code**: `MSIP-CMM-TAV-MTTL-W01`
- **Electrical Ratings**: 250(220)V~, 60Hz, Max **16A (3,520W)**
- **MAC Address Prefix**: `88:D0:39:...` (Registered to TCL Technoly Electronics / Realtek)
- **Physical Controls & Indicators**:
  - 4x Schuko/Korean grounded outlets, each with an independent tactile push-button and dual-color LED (Red/Green).
  - 2x USB Type-A charging ports (5V/2A combined).
  - 1x Master ON/OFF power button with illuminated green indicator ring.
  - 1x Wi-Fi status LED (Amber/Red when searching/unconnected, Green/Blue when connected).
  - 1x Standby auto cut-off indicator label (`대기전력자동차단용`).

---

## 2. Internal Hardware Teardown Analysis

The MTTL-W01 consists of three modular PCBs connected by ribbon cabling:

### A. Main Power & Relay Board (`40-LGSTAP-PWI2G`, 1.6 mm FR-4)
- **Relays**: 4x **FANHAR W35L-2AT-L2 DC5V 20A 250VAC TV-8** (or Hongfa **HFE39-5/2HT-L2**).
  - **Magnetic Latching Mechanism**: Unlike conventional relays that require continuous coil energization, latching relays only require a brief (~10–20 ms) pulse to toggle. They retain their physical contact state across power outages and draw zero quiescent coil current when stationary.
  - **Staggered Switching**: To prevent overwhelming the low-voltage DC power supply, relays trigger sequentially with a hardware/firmware delay when toggling all channels.
- **Power Supply**: High-efficiency offline flyback SMPS driven by a Power Integrations **INN2105K** (InnoSwitch-CE with integrated 650V MOSFET and FluxLink feedback).
- **Energy Metering**:
  - Independent current sensing across all 4 outlet channels.
  - Sensing element: Dual `2m0` (2 mΩ) precision shunt resistors in parallel on each channel, creating an effective **1.0 mΩ** resistance path.
  - Signal conditioning: Individual 16-pin SOIC metering/driver ICs (`U5`, `U7`, etc.) adjacent to each channel relay.

### B. Wi-Fi Controller Sub-Board (`40-LGSTAP-MAE2G`, 1.2 mm FR-4)
- **Microcontroller / SoC**: **Realtek RTL8711AF** (`RTL8711AF 15609P1 G123M1`).
  - Architecture: 32-bit ARM Cortex-M3 core @ 166 MHz, 1MB ROM, 512KB SRAM, integrated 802.11b/g/n 2.4GHz radio.
- **Interconnect**: Connects to the main power board via a 14-pin Flat Flexible Cable (FFC) ribbon cable at connector `XP3`.
  - Pinout: `GND1`, `GND2`, `GND3`, `DC3_3`, `VCC_5V`, `PW_IN18_5V`, `KEY3`, `KEY4`, and **`SDA2` / `SCL2` (I2C bus)**.
- **Onboard Test Points & Headers**:
  - **JTAG**: `JTAG_TMS1`, `JTAG_CLK1`, `JTAG_TDO1`, `JTAG_TDI1`, `JTAG_TRST1`.
  - **UART**: `UART_IN`, `UART_OUT`, `UART_LOG_IN1`, `UART_LOG_OUT1`, `VD33`, `GND`.
  - **I2C / LEDs**: `LED-SCK1`, `LED-SDA1`, `KEY1`, `KEY2`, `LED-1`, `LED2`.

### C. USB Sub-Board (`40-LGSTAP-USE2G`)
- Dual USB-A ports powered from the main 5V rail.

---

## 3. Firmware Realities & Flashing Feasibility

> [!IMPORTANT]
> **OpenBeken & ESPHome/LibreTiny Status**:
> The RTL8711AF belongs to the original Realtek Ameba1 family. OpenBeken, Tasmota, and LibreTiny **do not support the RTL8711AF** because it lacks the Execute-In-Place (XIP) flash and RAM architecture targeted by modern multi-platform IoT firmware engines.
> 
> Direct flashing with open firmware would require writing custom C code using the legacy Realtek Ameba1 SDK over JTAG (`TMS1`/`CLK1`/`TDO1`/`TDI1`).
> 
> Therefore, the optimal path is **local cloud impersonation (no flashing, no disassembly)** or a **modular daughterboard swap**.

---

## 4. Reverse-Engineered Network Protocol & The "Voltra" Root Cause

### A. The 10-Second AP Pairing Flow
1. **Activation**: Press and hold the master power button on the strip for **10 seconds** until the green power LED ring flashes rapidly.
2. **Setup AP Broadcast**: The strip boots into SoftAP mode, broadcasting an unencrypted SSID named:
   ```text
   TONLY_Tap_XXXXX
   ```
   *(where `XXXXX` corresponds to the last characters of its MAC address or S/N)*.
3. **Provisioning**: A client (phone app) connects to `TONLY_Tap_XXXXX` (gateway `192.168.1.1` or `192.168.4.1`) and transmits a payload containing the target home Wi-Fi SSID and WPA2 passphrase.
4. **Reboot**: The strip saves credentials to NVRAM, disables the setup AP, and connects to the home Wi-Fi router.

### B. The Cloud Connection Loop & Root Cause of the "Waiting" Freeze
Once connected to the local Wi-Fi router:
1. The strip receives a local IP address via DHCP.
2. The stock firmware immediately issues a DNS query to resolve its hardcoded Korean cloud domain (LG U+ / TCL backend).
3. **The Freeze**:
   - Under standard internet DNS (e.g. Google `8.8.8.8` or Egyptian ISP DNS), the Korean domain either fails to resolve, is geo-blocked, or routes to non-functional carrier endpoints.
   - The strip sits in an infinite reconnect loop, its Wi-Fi LED remaining red/amber.
   - Any app polling the backend for strip registration reports: *"Waiting for strip to come online"*.
4. **How Ommeq / Voltra Works**:
   - Ommeq runs a cloud redirect server at `5.182.18.10`.
   - Their setup guide mandates setting the router's **Primary DNS** to `5.182.18.10`.
   - On port 53, `5.182.18.10` intercepts the strip's Korean domain DNS query and answers with `5.182.18.10`.
   - The strip connects via TCP (typically port 30300) to `5.182.18.10`. The server acknowledges the handshake, transitions the strip to **Online**, and relays on/off commands.

---

## 5. How to Bring the Strip Online

### Method A: Immediate Verification via Router DNS (Using Voltra)
To get the strip working immediately with the commercial app:
1. Access your home router admin panel (usually `http://192.168.1.1`).
2. Navigate to **DHCP / DNS Settings**.
3. Set **Primary DNS Server**: `5.182.18.10`.
4. Set **Secondary DNS Server**: `8.8.8.8`.
5. Save settings and power cycle the MTTL-W01.
6. The strip's Wi-Fi LED will turn solid green/blue, and the app will show the strip **Online**.

---

### Method B: Self-Hosted Local Bridge (100% Private, Zero External Dependencies)

To run entirely locally without relying on Ommeq's external server:

```
[ MTTL-W01 Strip ]
       │
       │ (1) DNS query: hardcoded LG U+ cloud domain
       ▼
[ Local Router / Pi-hole / DNSMasq ] ──> Points domain to Local Node Server IP
       │
       │ (2) Outbound TCP connect (Port 30300)
       ▼
[ Power Cord Local Server (`server/src/`) ]
       │
       │ (3) Emulates carrier handshake, relays, & metering
       ▼
[ Power Cord Android App (Direct LAN control) ]
```

1. **DNS Redirection**:
   In your router's `/etc/hosts` or Pi-hole / AdGuard Home / router DNS, add a wildcard or domain override pointing the LG U+ / TONLY cloud domain to your local server IP (e.g. `192.168.1.100`).
2. **Local TCP Bridge (`server/src/`)**:
   Our local Node.js daemon listens on TCP port 30300, completes the initial greeting handshake, and exposes:
   - WebSocket / REST endpoints for relay switching (`OUTLET_1_ON`, etc.).
   - Periodic telemetry ingest for live wattage and accumulated kWh.
3. **Power Cord Android App**:
   The Power Cord app connects to the local bridge directly over LAN, giving you:
   - Zero internet dependency.
   - Real-time Egyptian 7-bracket sliding scale energy billing.
   - Outlet locking (`o.locked`) for critical loads.
   - Automatic overload cut-offs.

---

## 6. Alternative: Hardware Modular Swap (ESP32 Daughterboard)

For units where complete open firmware (ESPHome / Tasmota) is strictly required:
1. Disconnect the flat flexible ribbon cable `XP3` from the Realtek `40-LGSTAP-MAE2G` board.
2. Solder or crimp an adapter from the ribbon pins to an **ESP32-WROOM-32** or **ESP8266**:
   - `GND` → Ground
   - `DC3_3` → 3.3V VCC
   - `SDA2` → ESP GPIO (I2C SDA)
   - `SCL2` → ESP GPIO (I2C SCL)
   - `KEY1..KEY4` → ESP GPIOs (Tactile push-button inputs)
3. Flash the ESP module with ESPHome using an I2C relay expander configuration.
