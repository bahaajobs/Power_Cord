# 05 — Feature specification

Features are grouped by the hardware capability they depend on. Anything in the
**Requires metering** group disappears from the UI when
`TransportCapabilities.hasMetering` is false — which will be the case for a
large fraction of units in a used batch.

---

## Core control — always available

**Per-outlet on/off.** Four toggles, each with a user-assigned name and icon
(fridge, TV, router, heater, …). The icon matters more than it sounds: users
identify outlets by what is plugged in, never by number.

**Master control.** One switch for all four, and a separate control for the USB
rail when it is switchable.

**Physical-button parity.** State changes made at the strip appear in the app
within a second, via the MQTT state topic. The app is a second control surface,
never the authoritative one.

**Power-on behaviour** per strip: after a mains interruption, restore outlets
to `off`, `on`, or their previous state. **Default to `off`.** A heater that
switches itself on after a blackout while nobody is home is the failure mode
this setting exists to prevent.

**Lock / child mode.** Disable the physical buttons on the strip, or disable
app toggles behind a PIN. Useful for outlets feeding a router or a medical
device.

---

## Scheduling — always available

**Countdown timer.** "Off in 30 minutes." The single most-used feature on this
class of device, and it maps directly to a firmware datapoint, so it survives
the phone being off.

**Weekly schedule.** Per outlet, per weekday, on and off times.

**Sunrise / sunset offsets.** Needs the strip's location (city-level is enough)
and correct time. Note that the firmware needs NTP for any of the scheduling to
work — configure an NTP server reachable from Egypt in the firmware template.

**Where schedules run.** Prefer pushing schedules **into the firmware** so they
execute with the phone off and the internet down. Only fall back to
phone-side scheduling for rules the firmware cannot express. This distinction
must be visible to the user: a schedule that only runs when the phone is
awake and connected is a different product promise, and mislabelling it
produces support tickets that read "the light didn't come on".

---

## Energy — requires metering

**Live readings.** Volts, amps, watts for the strip as a whole. Remember the
0.1 unit scaling on the Tuya DPs, and remember that on nearly all of these
strips the shunt is upstream of the relays — so this is *total* strip
consumption, not per-outlet. Label it as such. Do not invent per-outlet
attribution.

**Consumption history.** kWh by hour / day / month, with the downsampling
policy from [`04-app-architecture.md`](04-app-architecture.md).

**Cost in EGP.** Egyptian residential electricity is billed in **rising
brackets** — the marginal rate depends on the household's monthly total, so a
single price-per-kWh figure is wrong by construction. The app should:

- ship a **user-editable bracket table**, not hardcoded rates (the tariff is
  revised roughly annually, and published figures vary between sources — the
  app must not become stale the moment rates move);
- let the user enter their household's month-to-date consumption from their
  bill, so the marginal bracket is right;
- present cost as an estimate, clearly, because the strip only meters what is
  plugged into it.

**Standby-power cutoff.** The original purpose of Korean IoT multi-taps
(대기전력 차단): when total draw stays below a threshold for N minutes, cut the
outlet. Genuinely useful, and a good default demo of why the product exists.

**Overload alarm and auto-cut.** Alarm above a user-set wattage; optionally cut
automatically. Bounded by the plate rating (3520 W typical) and, per
[`02-hardware-reference.md`](02-hardware-reference.md), by the relay contact
rating.

---

## Fleet and convenience

**Multi-strip view.** Rooms, grouping, a single "everything off" action. Assume
from the start that a user has several strips — you have a batch of them.

**Scenes.** Named sets of outlet states across strips ("Away", "Sleep").

**Automation between strips.** Deliberately out of scope for v1. It is a rabbit
hole, and MQTT plus a broker-side rules engine (or Home Assistant) does it
better than an app ever will.

**Notifications.** Overload, strip offline, schedule failed. Push requires a
server component; in a LAN-only Phase 1 these are local notifications only, and
only while the app runs.

**OTA firmware update.** Both OpenBeken and ESPHome accept a firmware upload
over HTTP. Being able to update the fleet from the app is worth building early
— it is what lets you fix a firmware bug across deployed units without
recalling them.

---

## Localisation and accessibility

**Arabic and English, with real RTL.** Mirror the layout, not just the text.
Use `Directionality`, avoid hardcoded `EdgeInsets.only(left:)`, and test with
`flutter run --dart-define=flutter.locale=ar`.

**Arabic-Indic numerals** as a user preference — some users expect ٤٢ and some
expect 42.

**Large tap targets and high contrast.** The primary interaction is a toggle
that must be hittable one-handed, in a hurry, by someone standing over a
misbehaving appliance.

---

## Explicitly out of scope for v1

- Voice assistants (Alexa / Google Home). Adds a cloud dependency and a
  certification path for a feature few users in this market will use at launch.
- Matter support. Attractive in principle — it is the open standard this
  product class is moving to, and there is a Flutter plugin for commissioning
  and control — but the BK7231 modules in these strips are not Matter-capable,
  so it would require replacement hardware. Revisit only if you go down the
  replacement-control-board route in Track C3.
- Per-outlet energy metering. The hardware does not support it. Promising it is
  a lie the UI cannot back up.
