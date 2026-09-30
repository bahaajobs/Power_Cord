# 16 — Stock firmware: running the strips without flashing

**The strips may not need re-flashing at all.** If they are LG U+ / Jinheung
MTTL-class units, their stock firmware already speaks a plain protocol to a
server address stored in flash — and that address can be rewritten in two lines
over the strip's own setup access point.

This removes the whole Stage B gate in
[`12-test-plan.md`](12-test-plan.md): no case opened, no UART, no pogo-pin jig,
no `tuya-cloudcutter`, no certification voided, no scrap risk. It is strictly
better than Track A **if the device matches**.

> Protocol credit: the wire format was documented by the
> [`powerk`](https://github.com/bahaajobs/powerk) project (Ahmed Tohamy). That
> repository has no licence file, so it is all-rights-reserved; `server/src/mttl.js`
> here is an independent implementation of the protocol — a factual description
> of how a device communicates — and shares no code with it.

---

## First: is this actually your device?

**Confirmed, by teardown.** The physical units in Egypt are **MTTL-W01**, LG U+
branded, made by TCL, KC id `HU04139-17002A`, MAC prefix `88:D0:39`. The full
measured profile is in
[`17-mttl-w01-protocol-and-cloud-bypass.md`](17-mttl-w01-protocol-and-cloud-bypass.md).

Two things that earlier looked like open questions are now settled:

- **The USB ports are not switchable.** They hang off the main 5 V rail on their
  own sub-board, so there is no relay to control. Treating these strips as
  4 outlets with no USB channel — which is what this transport does — is
  correct, not a limitation.
- **The Wi-Fi SoC is a Realtek RTL8711AF**, not a Beken BK7231. OpenBeken,
  Tasmota and ESPHome/LibreTiny do not support it, so the flashing tracks in
  [`03-firmware-tracks.md`](03-firmware-tracks.md) are **not available on this
  device**. Not flashing is no longer merely preferable; it is the only
  practical route short of a JTAG port and the legacy Ameba1 SDK.

The test is cheap and needs no tools:

1. Hold the strip's main button ~10 s until the LED blinks fast.
2. Look for a Wi-Fi network named `TONLY_TAP_XXXXXXX` (password
   `LGU_XXXXXXX` — the same 7 characters).
3. Join it and run the provisioner (below).

If the strip answers `up:ip:ip_ok`, the server-provisioning route below works.
If the setup network appears but that command is refused, use the DNS route in
[`17-mttl-w01-protocol-and-cloud-bypass.md`](17-mttl-w01-protocol-and-cloud-bypass.md)
instead — same server, different way of pointing the strip at it.

Do this on **one** unit before planning anything around it.

### Two ways to point the strip at your server

| | How | Needs |
| --- | --- | --- |
| **Provisioning** (this document) | Write your server's IP into the strip over its setup AP | The strip to accept `up:ip:` |
| **DNS redirection** ([doc 17](17-mttl-w01-protocol-and-cloud-bypass.md)) | Leave the strip paired as-is; point its hardcoded cloud domain at your server | Control of the router's DNS, or a Pi-hole |

The DNS route needs no setup-mode dance and works on a strip already paired
with the stock app. The provisioning route needs no router change. Both end at
the same place: the strip holds a TCP session to a server you run.

**The port differs between the two accounts** — `10086` after provisioning,
`30300` for the DNS route — and that may be a firmware-revision difference or
an artefact of how each was observed. `PC_MTTL_PORT` exists precisely so you can
serve whichever your unit actually dials; watch the server log and use the one
that connects.

---

## How it works

The strip stores exactly **one** server address and dials it on TCP 10086.

```
   strip  ──── dials out ────►  your server :10086
                                     │
   phone  ──── HTTPS/WS ───────►  same server :8080
```

The strip connects **outbound**, which is the useful part: nothing is opened on
the home router, and the same server works on a LAN or a public VPS. That is a
better answer to CGNAT than the port forward in
[`13-direct-mode.md`](13-direct-mode.md).

The trade-off, stated plainly: **direct phone-to-strip control is impossible on
stock firmware.** The strip talks only to its one provisioned server. So it is
either

- **stock firmware** — no flashing, but a server must always be running, or
- **re-flashed** — no server at all, but every unit must be opened or exploited.

The server can be a Raspberry Pi in the house. It does not have to be a VPS.

---

## Operating it

### 1. Start the server

```bash
npm install
PC_MTTL_ENABLED=1 npm start
```

`PC_MTTL_ENABLED` is off by default because it opens a listener that accepts
unauthenticated device connections — appropriate only once you actually have
such a strip.

Give the machine a **fixed IP or a DHCP reservation**. The strip remembers the
address it was given; if the address moves, the strip is lost and must be
provisioned again.

### 2. Point the strip at it

With the strip in setup mode and your machine joined to `TONLY_TAP_*`:

```bash
node tools/provision-mttl.js --ip 192.168.1.14 --ssid "YOURWIFI" --password "YOURPW"
```

```
  up:ip:ip_ok
  up:connect:connect_ok
```

Then rejoin your normal network. Within seconds:

```
[mttl] registered 91C0C4100000 (lgutap fw 0.1.54-1.0.66)
[mttl] 91C0C4100000 online — lgutap fw 0.1.54-1.0.66
```

The provisioner refuses an SSID or password containing `:` or a newline,
because the protocol is colon-delimited and line-terminated and would silently
truncate them — leaving you debugging a strip that never connects. It also
validates `--ip` rather than passing an unchecked string into the device's
command protocol.

### 3. Use the app

Open the app, then **Settings → Connection → Through a server**, enter the
server address, sign in, and the strips appear. Everything else works as before:
Arabic, schedules, history, standby cutoff, overload, bracket tariffs.

---

## Two hardware facts that change the product

**Per-outlet metering is real.** The teardown found independent current sensing
on all four channels — dual 2 mΩ shunts in parallel per channel, with its own
metering IC beside each relay. The protocol reports power, energy **and
temperature for every channel**. Re-flashed strips have a single shunt upstream
of all four relays and can only measure the strip as a whole.

This is a real exception to non-negotiable #4 in
[`../CLAUDE.md`](../CLAUDE.md), and it is handled the way #5 requires — by
detection, not assumption. A strip reports `perOutletMetering: true` only when
it actually delivers per-channel readings; the rule still holds for every strip
that does not.

**The buttons are momentary, and the firmware is in the middle.** Each outlet's
tactile button is an MCU *input* (`KEY1`..`KEY4` — two of them reach the Wi-Fi
board over the FFC ribbon), not a switch wired to the relay. The firmware reads
the press and pulses the latching coil, most likely through the `SDA2`/`SCL2`
I2C bus on the same ribbon.

Three consequences that shape the software:

- **The strip's state changes with no command from us, at any moment.** The
  server never assumes; it takes `up:event:onoff:` as a hint and immediately
  asks `up:getinfo:all` for the truth. An event says what changed; getinfo says
  what is true.
- **A "lock" can never block the physical button.** Blocking it would have to
  happen in firmware, between the KEY input and the relay pulse — and that is
  stock firmware we do not control. The app's lock stops *the app* switching an
  outlet, which is what the UI says in both languages, and nothing more.
- **Toggling everything is staggered by the device**, so the relays fire
  sequentially rather than loading the small DC supply at once. Our "all"
  command is a loop over channels anyway, since the protocol has no
  `up:onoff:0`.

**The relays are magnetic latching, and that is a safety fact.** They hold their
contact state mechanically, need only a ~10–20 ms pulse to toggle, and draw no
coil current at rest. The consequence: **an outlet that was on comes back on
after a power cut**, and no software setting can change that. Non-negotiable #6
in [`../CLAUDE.md`](../CLAUDE.md) — relays default to off after a blackout —
cannot be honoured on this hardware. Say so plainly rather than implying the app
protects against it.

---

## Testing it without hardware

```bash
PC_MTTL_ENABLED=1 npm start     # terminal 1
npm run mttl-sim                # terminal 2 — strips dial in
```

The simulator models what a naive implementation would miss: per-channel
metering, NUL-padded frames, CRLF endings, physical button events, relay
confirmation latency, and re-dialling after the server restarts.

`npm test` covers this path end to end — a simulated strip dialling in,
registering from its bootinfo frame, and being driven through the same REST API
the app uses, **with no MQTT broker running at all**.

---

## Protocol reference

| Direction | Frame |
| --- | --- |
| strip → server | `up:bootinfo:<model>;<mac>;<mac>;<fw>;connect` |
| strip → server | `up:getinfo:<ch>:<runtime>;<on\|off>;<state>;<overload>;<overheat>;<mW>;<Wh hex>;<prev hex>;<cfg hex>;<status>;<event hex>;<°C>` per channel |
| strip → server | `up:power_report:<ch>:<mV≥50000 or mA>` |
| strip → server | `up:query:<rssi>` |
| strip → server | `up:event:onoff:<0-4>:on\|off` — a button was pressed; 0 is master |
| server → strip | `up:getinfo:all`, `up:onoff:<1-4>:on\|off`, `up:power_report:1:vol`, `up:query:wifirssi` |
| setup AP `192.168.1.1:30300` | `up:ip:<ip>` → `up:ip:ip_ok`; `up:connect:<ssid>:<pw>` → `up:connect:connect_ok` |

Channel **5 is an aggregate, not an outlet**. There is no `up:onoff:0` — "all"
is a loop over channels 1–4. Frames are NUL-padded. The port is fixed at 10086
by the firmware and cannot be changed.

---

## Security

The listener on 10086 accepts any device that connects and trusts the MAC in its
bootinfo frame. There is no device authentication in this protocol — none was
designed in.

Consequences, if the server is on a public VPS:

- Anyone who finds port 10086 can register a **fake** strip. They cannot switch
  your real outlets (commands only ever travel server → strip over that strip's
  own session), but they can clutter your device list and your history.
- Keep the **web port** private — that is the one that switches outlets. Use a
  VPN or a TLS reverse proxy, as in [`11-remote-access.md`](11-remote-access.md).
- Turn `PC_MTTL_ENABLED` off when you are not using it.

On a home LAN none of this matters much. On a VPS it does.
