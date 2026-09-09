# 13 — Direct mode: no server at all

The app talks to each strip's own web server. On your Wi-Fi that is a direct
LAN connection. From outside, it is whatever address your router forwards.
Either way nothing else runs — no broker, no server, no cloud.

Server mode still exists and is still the better answer for a fleet. Direct
mode is the better answer for a household.

---

## How it works

Every strip running OpenBeken serves Tasmota's command endpoint:

```
GET http://192.168.1.42/cm?cmnd=STATE
    → {"POWER1":"ON","POWER2":"OFF","POWER3":"OFF","POWER4":"OFF","Wifi":{...}}

GET http://192.168.1.42/cm?cmnd=POWER1%20OFF
    → {"POWER1":"OFF"}

GET http://192.168.1.42/cm?cmnd=STATUS%208
    → {"StatusSNS":{"ENERGY":{"Total":13.9,"Today":0.4,"Power":42.1,"Voltage":221.4}}}
```

That is the whole protocol. The app polls `STATE` every few seconds, and
`STATUS 8` alongside it when the strip has a meter.

**Commands are confirmed, not assumed.** The reply to `POWER1 OFF` carries the
state the relay actually reached, so the app compares against the device rather
than trusting its own optimism. Nothing confirmed inside three and a half
seconds is rolled back in the UI.

## Two addresses per strip

Each strip stores both:

| Field | Example | Used when |
| --- | --- | --- |
| Address on your Wi-Fi | `192.168.1.42` | You are at home |
| Address from outside | `myhome.ddns.net:8081` | You are not |

The app tries whichever answered last, then falls back to the other. Walking
out of the house switches over on its own within one poll; nothing to press.

Give each strip a **static lease** in your router so its LAN address never
moves. A strip that gets a new address after a power cut is the most common
"it stopped working" in this whole design.

## Why this needs the Android app, not a browser tab

A browser cannot do this, and it is not a limitation that can be worked around.
A page served from one origin fetching `http://192.168.1.42/cm` is a
cross-origin request, and the browser refuses it unless the strip returns an
`Access-Control-Allow-Origin` header. The firmware does not send one and never
will.

The Android build issues these requests through Capacitor's **native** HTTP
layer, which is not a browser context and therefore not subject to CORS at all.
That is the entire reason the app is packaged rather than just hosted.

In a browser, direct mode will show every strip as offline. Use server mode
there, or use the APK.

---

## Reaching a strip from outside: read this part

You asked for a port forward, so here is how, and here is what it costs.

### Setting it up

1. Give the strip a static lease in the router.
2. In the strip's own web page, set a **username and password**. Not optional
   for this — see below.
3. Forward an outside port to the strip: external `8081` → `192.168.1.42:80`.
   Use a high, non-obvious external port; do not use 80.
4. Get a hostname that follows your home IP — most routers have a built-in
   dynamic DNS client (No-IP, DuckDNS, the router vendor's own).
5. In the app, set the strip's outside address to `yourname.ddns.net:8081`.

### What it costs

A forwarded port puts a mains relay controller on the public internet, speaking
**unencrypted HTTP**. Anyone on the path can read the traffic and forge
commands. Anyone scanning the internet — and they all are, constantly — will
find the port within days.

The concrete risk is not embarrassment. Someone who can switch your relays can
switch a heater on in an empty flat.

So, in order of preference:

| | Exposure | Effort |
| --- | --- | --- |
| **A VPN into your home** (WireGuard, Tailscale) | none | one evening |
| **A server with TLS** ([`11-remote-access.md`](11-remote-access.md)) | the server, properly secured | a weekend |
| **A bare port forward** | the strip itself, in clear text | ten minutes |

If you take the third option anyway — which is a legitimate choice for a strip
that switches a fan — then at minimum:

- **Set a username and password on the strip.** A forwarded strip without one
  is controllable by anyone who finds it.
- **Do not forward the strip that feeds anything dangerous.** A heater or a
  water pump does not belong on the far end of a plaintext port.
- **Use a high external port**, and change it if you see unexplained switching.
- **Never forward the strip's firmware-update page.** It accepts arbitrary
  firmware, which turns a compromised relay into a compromised computer on your
  network.

The app supports the port forward because you asked for it. It also supports
the VPN, which needs no forwarding at all and no change to the app: over a VPN,
the strip's LAN address simply works from anywhere.

---

## Where schedules run in direct mode

On the phone, while the app is open.

There is no server, so there is nothing else to run them. The schedules screen
says this rather than implying otherwise, because a timer that silently only
works sometimes is worse than no timer.

Timers that must survive the phone being closed belong in the strip's own
firmware — OpenBeken has its own countdown and schedule commands, and pushing
the app's schedules down into them is the obvious next step.

## Local history

The phone keeps the archive, in IndexedDB. The strips store almost nothing: a
running total, today, and yesterday.

The app **reconciles against the strip's own counters** on every poll rather
than only integrating power readings, which matters more than it sounds. A
phone that was closed all afternoon still gets the correct daily figure the
moment it reconnects, because it takes the strip's `Today` accumulator instead
of the gap it observed. On the first poll after midnight it also reads
`Yesterday` and corrects the previous day.

Integration is the fallback, used only when a strip reports no totals.

Daily figures are kept for about a year; minute samples for two days. Export
the lot from Settings.
