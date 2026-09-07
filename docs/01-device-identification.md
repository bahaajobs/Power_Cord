# 01 — Device identification protocol

Everything downstream depends on this. Run it on **one** unit, record the
answers in [`../hardware/device-fingerprint-template.md`](../hardware/device-fingerprint-template.md),
then repeat on a second unit from a different part of the batch to confirm the
batch is homogeneous. Mixed batches are common in used stock.

Steps 1–4 need no tools and no disassembly. Step 5 requires opening a case and
is the only step with a mains-safety precondition.

---

## Step 1 — Read the labels (no tools)

Photograph, at high resolution and straight on:

- The **rating plate** on the underside. You are looking for: model number,
  brand, `KC` mark and the certification number next to it, rated voltage /
  current / wattage, and a manufacture date or lot code.
- The **QR code**. Decode it with any phone. It is nearly always a URL to an
  app download or a product page — which names the platform, and therefore
  tells you whether you are carrier-locked or Tuya.
- Any **MAC address** or serial printed on the plate.

Then look up the KC number in the Korean safety certification database
(`safetykorea.kr`) — it returns the certificate holder, i.e. the actual
manufacturer behind the white label, which is usually the fastest route to
finding an existing teardown of the same PCB.

**What you learn:** the brand and platform. If the QR or plate says LG U+, KT,
or SK, you are carrier-locked (Track C). If it says Tuya, Smart Life, or
Tuya-Smart, you are on Track B and can also do Track A.

---

## Step 2 — Observe the pairing behaviour (no tools)

Plug the strip in. Hold the master button for 5–10 seconds until the status LED
blinks rapidly — this is the standard pairing-mode entry for this whole product
class. Then, from a phone, look at the list of visible Wi-Fi networks.

| What you see | What it means |
| --- | --- |
| An SSID like `SmartLife-XXXX`, `A-XXXXXX`, or `TuyaSmart-XXXX` | Tuya firmware, AP pairing mode. Tracks A and B both open. |
| No new SSID, LED blinks anyway | The device is in EZ / SmartConfig mode only. Hold the button again — most units cycle between EZ and AP mode. |
| An SSID with a carrier name or a Korean model string | Carrier firmware. Track C. |
| Nothing at all, no LED change | The Wi-Fi section may be dead, or the button combination differs. Try each button, and try a 15-second hold. |

**What you learn:** whether the radio works at all, and which provisioning
scheme the stock firmware uses.

---

## Step 3 — Watch what it tries to talk to (needs a Wi-Fi AP you control)

Set up any AP you can see DNS logs on — a phone hotspot with a laptop sharing,
an OpenWrt router, or a Raspberry Pi running `hostapd` + `dnsmasq`. Pair the
strip to it using whichever app the QR code pointed at, or just let it join and
watch even if pairing fails.

Then read the DNS query log:

| Domains queried | Verdict |
| --- | --- |
| `*.tuyaeu.com`, `*.tuyacn.com`, `*.tuyaus.com`, `a.tuyaeu.com` | **Tuya.** Confirmed. |
| `*.uplus.co.kr`, `*.lguplus.co.kr` | LG U+ carrier lock. |
| `*.kt.com`, `*.gigagenie.*` | KT carrier lock. |
| `*.sktelecom.com`, `*.sktbsm.com` | SK carrier lock. |
| An NTP pool and nothing else | The firmware may be waiting on provisioning it never received. Inconclusive — go to step 5. |

This step is worth the setup effort: it is the single most reliable
non-invasive answer to "which cloud owns this device".

---

## Step 4 — Scan it on the network (needs the strip joined to your LAN)

With the strip on your LAN, from a laptop:

```bash
# See what it exposes
nmap -Pn -sT -p 1-1024,6668,8886 <strip-ip>

# Tuya devices broadcast a UDP discovery beacon on 6666/6667
python3 -m tinytuya scan
```

An open **TCP 6668** and a UDP beacon on 6666/6667 is conclusive Tuya. The
`tinytuya scan` output also gives you the device ID and the protocol version
(3.1 / 3.3 / 3.4 / 3.5), both of which you need for Track B.

`tools/discover.sh` in this repository wraps the common scans.

---

## Step 5 — Open one unit and read the silicon

> **Unplug the strip from mains and leave it unplugged for 60 seconds before
> opening.** There are charged capacitors on the AC-DC section. Do not
> re-assemble and energise a unit with the case open. See
> [`07-safety-and-compliance.md`](07-safety-and-compliance.md).

Most units in this class are held together by screws under the rubber feet or
under the outlet-face label, sometimes with plastic clips along the seam.

Photograph the PCB on both sides, then record:

**a) The Wi-Fi module** — a small daughterboard with a metal can or a PCB
antenna, with a silkscreen label:

| Silkscreen | Chip | Flashable with |
| --- | --- | --- |
| `CB3S`, `CB2S`, `CB3L`, `CBU`, `CB1S` | Beken **BK7231N** | OpenBeken, ESPHome/LibreTiny |
| `WB3S`, `WB2S`, `WB2L`, `WB3L` | Beken **BK7231T** | OpenBeken, ESPHome/LibreTiny |
| `TYWE3S`, `TYWE1S`, `ESP-12F` | **ESP8266 / ESP8285** | ESPHome, Tasmota |
| `WR3` , `RTL8710BN` | Realtek RTL8710BN | OpenBeken, LibreTiny (SDK-version dependent) |
| `WBR3` | Realtek RTL8720CF | OpenBeken (limited) |

**b) Is there a second MCU?** Look for another IC with a Korean or Chinese part
number sitting between the module and the relays — commonly an 8-bit part
(N76E003, STM8, HT66, CH573). If present, the design is **TuyaMCU**: the Wi-Fi
module is only a radio, and the relays are driven by the second MCU over a
UART. This changes the firmware approach (see
[`03-firmware-tracks.md`](03-firmware-tracks.md), TuyaMCU section) — you do not
get a GPIO map, you get a serial protocol.

**c) The energy-metering chip**, if any — near the mains input, next to a
current shunt (a wide low-value resistor) or a small current transformer:

| Part | Notes |
| --- | --- |
| `BL0937`, `HLW8012` | Pulse-output. Two pins: CF (energy), CF1 (V/I, multiplexed by a SEL pin). Supported by both firmwares. |
| `BL0942` | UART-output. Supported by ESPHome and OpenBeken. |
| `CSE7766` | UART-output. Supported. |
| None | Common on cheaper strips. The strip switches but cannot measure. Drop energy features from scope. |

**d) The relays** — count them. Four relays means each outlet is independent.
Five means the USB rail is switchable too. Note the relay part number and its
printed contact rating (e.g. `10A 250VAC`) — this is the real per-outlet limit
regardless of what the rating plate claims for the strip as a whole.

**e) The USB section** — is it fed from its own small AC-DC module, or from the
main 5 V rail? Is it downstream of a relay (switchable) or wired to permanent
live (always on)? This determines whether "turn off USB" is a feature you can
offer at all.

---

## Decision output

At the end of the protocol you should be able to complete this sentence:

> This unit uses a **\<module\>** carrying a **\<chip\>**, with **\<n\>** relays,
> **\<metering chip or none\>**, **\<with / without\>** a secondary MCU, talking to
> **\<cloud\>**.

Take that to [`03-firmware-tracks.md`](03-firmware-tracks.md) and the track
picks itself.
