# 10 — User manual: the app

The app is a **PWA** — a web app that installs to the home screen and behaves
like a native one. There is no store listing and no APK to sideload: open the
address, install, done. It works on Android, iOS and desktop from one codebase.

---

## Installing it

**Android (Chrome):** open the server's address, then **⋮ → Add to Home screen**.
The icon appears in the launcher and the app opens without browser chrome.

**iOS (Safari):** open the address, then **Share → Add to Home Screen**. Safari
only offers this from Safari itself, not from Chrome on iOS.

**Desktop:** an install icon appears in the address bar in Chrome and Edge.

You can also just use it in a browser tab. Installing gets you the home-screen
icon, full-screen layout, and a shell that loads instantly.

Signing in stores a token on the device that lasts 30 days by default, so you
are not asked again every time.

---

## The home screen

**Total power right now** is every online strip added together, updated live as
readings arrive — not polled, pushed. Below it: how many strips are online, how
many outlets are on out of the total, and how many strips have an active plan
date.

Under that, four buttons:

| | |
| --- | --- |
| **Consumption** | Energy, cost and history |
| **Schedules** | Timers that run on the server |
| **Power automation** | Rules that watch the meter |
| **All off** | Every outlet on every strip — asks first |

**Search** filters by strip name, room, device id, or the name of anything
plugged in. Type "fridge" and you get the strip it is on.

### A strip card

- A **green dot** and an **ONLINE** pill: the strip is talking to the server.
  Grey and **OFFLINE** means it is not — its buttons still work, but the app
  cannot reach it.
- The **device id**, masked by default. Tap the **eye** to reveal it. It is
  masked because a screenshot of this screen otherwise hands out the identity of
  hardware someone could try to talk to.
- The **gear** opens that strip's settings.
- **Plan ends <date>**, if set. Optional — use it for a warranty or service
  period. Strips with no plan show "Local control · no plan", which is the
  truthful description of a strip that answers only to your own server.
- The **wattage** on the right is the whole strip. If the unit has no metering
  chip it says **no meter** rather than showing a zero that looks like a reading.
- **Four outlet tiles.** Tap to toggle. Green is on.
- The **USB rail**, if the strip has a switchable one.
- **Turn all on / Turn all off** for that strip.

**+ Add strip** registers a unit by hand. Usually unnecessary: a flashed strip
that reaches your broker appears on its own.

### What a toggle actually does

Tap an outlet and it changes immediately, showing **SWITCHING…**. That is
optimistic — the app is showing what you asked for, not what has happened yet.

If the strip does not confirm within about three seconds, **the switch goes back
to where it really is** and you get a message. This is deliberate and it is the
most important behaviour in the app: believing a heater is off when it is on is
the failure worth engineering against.

A strip that is offline refuses commands outright rather than queuing them. A
command that silently applies twenty minutes later, when you have forgotten
about it, is worse than one that fails now.

---

## Consumption

Ranges of **7, 30 or 90 days**.

- **Total used** — kWh across every strip in the range.
- **Estimated cost** — in your currency, using your tariff.
- **Daily usage** — one bar per day. Tap a bar for its exact figure. The dashed
  line is the average across days that used anything.
- **By strip** — which strip used what, with its share.

### Setting the tariff

Tap the **$** button, or the tariff line under the totals.

Egyptian residential electricity is billed in **rising brackets**: the rate
depends on how much the household has used that month, so one price per kWh is
wrong by construction. Two modes:

- **Single rate** — one number. Fine for a rough idea.
- **Rising brackets** — the real shape. Also enter **household use so far this
  month** from your electricity bill, so the app knows which bracket your next
  kWh actually falls in.

The bracket table is editable because published rates are revised roughly
annually and vary between sources. The values shipped are a starting point, not
gospel — put your own bill's numbers in.

### Two limits, stated plainly

**Energy is per strip, never per outlet.** The metering chip sits upstream of
all four relays, so the hardware measures the whole strip and cannot break it
down. The app does not pretend otherwise.

**Cost covers only what is plugged into these strips.** It is not your
electricity bill.

---

## Schedules

Two kinds:

- **Weekly** — a time and a set of days. "Every weekday at 23:30, turn the TV
  off."
- **Countdown** — one-shot. "Off in 30 minutes." It disables itself after firing.

Target a single outlet or all of them.

**These run on the server**, so they fire whether or not your phone is awake or
even in the country. They do **not** fire while the server is down. The app says
so on the screen, because a timer that only works sometimes, without saying
which times, is worse than no timer.

(Pushing schedules down into the firmware, so they survive the server too, is
the Phase 3 upgrade in [`06-roadmap.md`](06-roadmap.md).)

---

## Power automation

Rules that watch the meter. They need a strip that actually has a metering chip;
the rule list marks strips that do not.

**Standby cutoff** — switch the strip off once it has drawn less than a
threshold continuously for a set time. This is 대기전력 차단, the feature these
Korean strips were built around: a TV and its box idling at 12 W all night.

The "continuously" matters. A fridge between compressor cycles looks idle for
minutes at a time; the rule only fires if the draw stays low for the whole
window, so set the window longer than any cycle you care about.

**Overload** — alarm above a threshold, and optionally cut. This one acts
immediately, with no averaging, because the point is to get in front of a
thermal event.

Set the threshold from the **relay** rating, not the plate rating. The strip may
say 3520 W in total, but each relay is typically 10 A — and four relays heating
each other on one board do less than four independent ones would. There is more
on this in [`02-hardware-reference.md`](02-hardware-reference.md).

---

## Strip settings

The gear on a strip card.

- **Device id, MQTT prefix, address, signal, last seen** — what you need when
  something is not connecting.
- **Metering** — whether the strip has ever reported power. Detected, not
  assumed: a strip that never sends telemetry never grows an energy tab.
- **Rename outlets.** Name them after what is plugged in. People look for
  "Fridge", never for "Outlet 1".
- **Lock an outlet.** A locked outlet refuses commands from the app — the one
  feeding your router or a medical device. It does **not** disable the button on
  the strip itself, which is a hardware function and stays available.
- **Rename strip**, **set plan expiry**, **remove strip**. Removing deletes its
  history; the strip itself keeps working and re-registers if it reconnects.

---

## When something is wrong

| What you see | What it means |
| --- | --- |
| Red banner: not connected to the server | The phone cannot reach the server. On the LAN, check Wi-Fi; away from home, see [`11-remote-access.md`](11-remote-access.md). States shown are the last known ones. |
| Red banner: server cannot reach the broker | The server is up but MQTT is down. Nothing will switch until it is back. |
| A strip shows OFFLINE | It has stopped talking to the broker. Its buttons still work. Check its power and Wi-Fi. |
| A toggle flips back | No confirmation arrived. The app is showing the strip's real state, not the one you asked for. |
| "no meter" instead of watts | That unit has no metering chip. Energy features do not apply to it. |
| Cost looks wrong | Check the tariff mode, and whether the household month-to-date figure is set. |

---

## A safety note that belongs in a user manual

**An outlet switched "off" in this app is not electrically dead.** These strips
switch the live conductor only; neutral stays connected to every outlet at all
times. That is normal, legal, and true of the original firmware too — but it
means "off" here means "switched off", not "safe to work on".

Unplug before working on anything.
