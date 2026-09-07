# 07 — Safety, refurbishment QC, and compliance

This chapter is short and it is not optional. The project takes used mains
switchgear of unknown history and puts it back into service in people's homes.

---

## Working on the hardware

- **Unplug before opening. Wait 60 seconds.** The AC-DC section holds charge.
- **Never energise a unit from mains with the case open**, and never probe a
  live mains circuit to map GPIO pins. Everything in
  [`02-hardware-reference.md`](02-hardware-reference.md) is designed to be
  verified with the strip unplugged and the logic side fed 3.3 V from a bench
  supply — the relays click audibly with no mains present.
- **Never connect a USB-TTL adapter to a mains-powered board.** The module's
  ground may be at mains potential in non-isolated designs, and the other end
  of that adapter is your laptop.
- If you must observe behaviour under mains, use an **isolation transformer**
  and an RCD, and keep one hand in your pocket.
- Do not defeat the earth connection. On these strips PE is bonded straight
  through to all four outlets and is never switched — keep it that way.

## The single-pole switching caveat

These strips switch **live only**. Neutral remains connected to every outlet at
all times. An outlet the app reports as "off" is *not* electrically dead and is
not safe to work on. The app must never use language implying otherwise —
"off" and "isolated" are different claims, and only one of them is true.

---

## Refurbishment QC

Used relays are a wear item; the contacts weld shut after enough switching
cycles under inductive load, and a welded relay is an outlet that cannot be
turned off. Test every unit before it leaves your bench:

| Test | Method | Pass criterion |
| --- | --- | --- |
| Earth continuity | Milliohm meter, plug PE pin to each outlet's earth contact | < 0.1 Ω |
| Insulation resistance | 500 V insulation tester, L+N to PE, **all relays closed** | > 1 MΩ (2 MΩ preferred) |
| Relay function | Switch each relay 20 times under a ~500 W resistive load | Clean make and break every time; no chatter, no sticking |
| Relay leakage when open | Measure voltage at the outlet with the relay open, load connected | No load current flows |
| Load test | 1000 W resistive load per outlet, 30 minutes | No connector warmer than ~50 °C; no smell |
| Metering accuracy | Compare to a clamp meter on a known resistive load | Within 5%, else recalibrate |
| Cord and strain relief | Visual and flex test | No cracking, nicks, or discolouration at the entry |
| Outlet grip | Insert and withdraw a plug | Firm retention; sloppy contacts overheat |

Scrap anything that fails, and scrap the whole unit rather than the outlet —
a strip with three good outlets is a strip that gets used on all four.

Record results against the unit's MAC address so a field failure is traceable
to its test record. This costs almost nothing during Phase 1 and is the only
thing that will help you if a unit ever causes damage.

---

## Frequency, voltage and plug compatibility

Korea and Egypt both use **220 V**, and Korea's plug is the same Schuko family
as Egypt's Type C/F sockets. The strips fit Egyptian outlets and run at correct
voltage with no adapter and no converter.

The only difference is **60 Hz in Korea vs 50 Hz in Egypt**, and for this device
it is close to a non-issue: relays, logic, the switch-mode supply and USB
charging are all frequency-independent. It matters in exactly one place —
energy-metering calibration, which was done on a Korean bench and should be
re-verified against a reference load. See
[`02-hardware-reference.md`](02-hardware-reference.md).

**Grounding is the real compatibility issue, and it is on the Egyptian side.**
The strips have a proper earth. Older Egyptian installations frequently use
ungrounded Type C sockets, in which case the strip's earth pin connects to
nothing and every appliance plugged into it loses its protective earth. This
is a property of the building, not the strip, but it will be the most common
real-world hazard in this deployment, so:

- Ship the strips with clear guidance that they must be used in a grounded
  (Type F / Schuko) socket.
- Consider having the app check and warn — a missing earth is not detectable in
  firmware on this hardware, so this has to be a documentation and packaging
  answer, not a software one.

---

## Certification and legal reality

**The KC mark on these units no longer means anything once you re-flash them.**
KC certification covers a specific product with specific firmware from a
specific manufacturer, sold in Korea. A modified, refurbished unit sold in
Egypt is, in regulatory terms, a new product placed on the market by you.

The practical consequences depend on what you are doing:

- **Self-deployment or internal use** — the QC bench above is what matters.
  Certification is not in play.
- **Selling to consumers in Egypt** — you are the manufacturer of record.
  Get local advice on Egyptian Organization for Standardization (EOS)
  requirements and General Organization for Export and Import Control (GOEIC)
  rules for electrical goods, on what documentation refurbished imports need,
  and on your product-liability exposure. This is a question for a lawyer and a
  test house in Cairo, not for a firmware engineer, and it should be answered
  before Phase 1 rather than after Phase 6.
- **Sold as-is, unmodified** — pointless, since the device does nothing without
  a Korean account, which is the entire premise of this project.

Do not put a KC mark, the original brand, or the original model number on a
modified unit. Relabel honestly.

---

## Security as a safety property

A remote attacker who can switch mains relays in someone's home can start a
fire with a space heater. Treat the security requirements in
[`04-app-architecture.md`](04-app-architecture.md) as safety requirements:

- No unauthenticated MQTT broker, ever, on any network.
- Password-protect the firmware's web UI and OTA endpoint before deployment.
  Freshly flashed OpenBeken and ESPHome are open by default.
- Per-device credentials and topic ACLs, so one compromised strip cannot reach
  another.
- The OTA endpoint is the highest-value target in the whole system — it accepts
  arbitrary firmware. Lock it down first.
