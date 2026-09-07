# 02 — Hardware reference

Reference material for the *class* of device. Nothing here is a substitute for
the fingerprint of your actual unit — treat every pin number as a hypothesis to
verify, not a fact.

---

## Electrical architecture

Every Wi-Fi multi-tap in this class is built the same way:

```
  mains inlet (CEE 7/7, L / N / PE)
        │
        ├── PE ────────────────────────────────► earth pins of all 4 outlets
        │                                        (never switched)
        │
        ├── N  ────────────────────────────────► neutral of all 4 outlets
        │                                        (usually common, unswitched)
        │
        └── L  ──┬── [ metering shunt ] ─────┬── relay 1 ──► outlet 1 live
                 │   (BL0937 / HLW8012)      ├── relay 2 ──► outlet 2 live
                 │                           ├── relay 3 ──► outlet 3 live
                 │                           ├── relay 4 ──► outlet 4 live
                 │                           └── relay 5 ──► USB charger  (optional)
                 │
                 └── [ AC-DC converter ] ──► +5 V ──► [ LDO ] ──► +3.3 V
                                               │                    │
                                               │                    ├─► Wi-Fi module
                                               │                    └─► metering IC
                                               └─► relay coils (via ULN2003 or
                                                   discrete NPN + flyback diode)

  Wi-Fi module GPIO ──► relay drivers  (active high, typical)
                   ◄── 5 × momentary buttons (active low, internal pull-up)
                   ──► status LED(s)   (often active low)
                   ◄── CF / CF1 pulse inputs from metering IC
                   ──► SEL pin of metering IC (multiplexes CF1 between V and I)
```

Two consequences worth internalising before writing app code:

1. **Only live is switched.** Neutral stays connected to every outlet at all
   times. A "switched off" outlet is not electrically dead — it is
   single-pole isolated. This is normal and legal, and it is why the app must
   never present "off" as "safe to touch".
2. **Metering is usually on the shared upstream shunt**, before the relays.
   That means the strip measures *total* consumption for all four outlets, not
   per-outlet consumption. Per-outlet energy figures are almost always
   inferred, not measured. Do not design a UI that promises per-outlet
   wattage until step 5 of the identification protocol proves there are four
   shunts, which there almost certainly are not.

---

## Beken BK7231N/T — typical GPIO map

Community configurations for 4-outlet + USB strips on a Tuya CB3S/CBU module
converge on roughly this map. **Verify every line before trusting it.**

| Pin | Function | OpenBeken role string |
| --- | --- | --- |
| P7 | Relay 1 → outlet 1 | `Rel` channel 1 |
| P8 | Relay 2 → outlet 2 | `Rel` channel 2 |
| P14 | Relay 3 → outlet 3 | `Rel` channel 3 |
| P9 | Relay 4 → outlet 4 | `Rel` channel 4 |
| P24 | Relay 5 → USB rail | `Rel` channel 5 |
| P26 | Master button (toggles all) | `Btn_Tgl_All` |
| P23 | Wi-Fi status LED, active low | `WifiLED_n` |
| P6 / P10 / P11 / P12 | Per-outlet buttons (when present) | `Btn` channel *n* |
| P8 / P7 / P26 | BL0937 `CF`, `CF1`, `SEL` (when metering present) | `BL0937*` |

Note the collision: the same pin numbers appear for relays and for metering in
different variants. That is not a typo in this table — it is the reason you
must verify. A strip with metering has a different relay map from one without.

### How to verify safely

With the case open and the strip **unplugged from mains**, power the logic side
alone: feed 3.3 V to the module's VCC/GND pads from a bench supply or a USB-TTL
adapter. The relays will click audibly when their coils are driven even with no
mains present, and no part of the board is at mains potential. Then, from the
OpenBeken web console or `ltchiptool`, drive each candidate pin and note which
relay clicks. Ten minutes, zero risk.

---

## Tuya datapoint (DP) map — for stock firmware

If you keep the stock Tuya firmware (Track B), the device is controlled by
writing **datapoints** over the local protocol on TCP 6668. The conventional
map for a 4-outlet metering strip:

| DP | Type | Meaning |
| --- | --- | --- |
| 1 | bool | Socket 1 on/off |
| 2 | bool | Socket 2 on/off |
| 3 | bool | Socket 3 on/off |
| 4 | bool | Socket 4 on/off |
| 5 | bool | USB rail on/off (sometimes DP 7) |
| 9 | int | Socket 1 countdown timer, seconds remaining |
| 10 | int | Socket 2 countdown |
| 11 | int | Socket 3 countdown |
| 12 | int | Socket 4 countdown |
| 13 | int | USB countdown |
| 17 | int | Accumulated energy, 0.01 kWh units (`add_ele`) |
| 18 | int | Current, mA |
| 19 | int | Active power, 0.1 W units — **divide by 10** |
| 20 | int | Voltage, 0.1 V units — **divide by 10** |
| 21 | int | Test bit |
| 22 | int | Current calibration coefficient |
| 23 | int | Voltage calibration coefficient |
| 24 | int | Power calibration coefficient |
| 25 | int | Energy calibration coefficient |
| 38 | enum | Relay power-on behaviour: `off` / `on` / `memory` |
| 41 | string | Cycle (repeat) timing schedule |
| 42 | string | Random timing schedule |
| 43 | string | Inching / momentary-pulse config |

The scaling on DP 19 and 20 is the classic bug in first implementations: a
reading of `2201` on DP 20 is 220.1 V, not 2201 V.

**Do not trust this table for your units either.** Dump the real map with
`tools/probe_tuya.py`, which reads every DP the device will admit to and prints
the values so you can correlate them with physical relay clicks.

---

## Energy metering and the 50 Hz question

Korea runs 220 V / 60 Hz; Egypt runs 220 V / 50 Hz. For this device:

- **Relays, logic, Wi-Fi, USB charging: entirely unaffected.** Nothing in the
  control path is frequency-dependent, and the AC-DC converter is a switcher
  with a wide input range.
- **Energy metering: affected only through calibration.** BL0937/HLW8012 parts
  output a pulse train whose frequency is proportional to power, and the
  conversion constant depends on the external shunt and divider, not on mains
  frequency. In practice readings stay valid, but the factory calibration was
  performed at 60 Hz on a Korean bench and the units are used, so **calibrate
  against a known reference load before you show anyone a kWh number**. A
  1000 W resistive heater and a clamp meter is enough.
- If the app ever displays mains frequency, it will read ~50 Hz in Egypt. That
  is correct, not a fault.

---

## Ratings

The plate wattage (3520 W is standard for this class — 16 A × 220 V) is the
*sum* limit for the strip. The per-outlet limit is the relay contact rating,
typically 10 A / 250 VAC printed on the relay can, and in practice lower still
because four relays sharing one PCB and one 16 A cord will heat each other.

For the app, this means the overload-protection feature should enforce **two**
thresholds: a total-strip threshold near the plate rating, and a conservative
per-outlet threshold — and per-outlet can only be enforced if per-outlet
metering exists, which it usually does not. Where it does not, the honest
feature is a total-load alarm plus a user-configurable auto-cutoff.
