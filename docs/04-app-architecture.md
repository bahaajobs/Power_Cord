# 04 — Mobile application architecture

## Design constraints, and what they force

| Constraint | Consequence for the design |
| --- | --- |
| Egypt is overwhelmingly Android, with a long tail of low-end devices and older OS versions | Android-first, minSdk 24, keep the APK small and the UI cheap to render. iOS from the same codebase, later. |
| Egyptian residential internet is largely CGNAT — no inbound public IP | Remote access can never rely on port-forwarding. Either an outbound-only broker connection, or LAN-only. |
| Mains-switching hardware in people's homes | The app is never the only way to control the strip. Physical buttons must keep working, and relay state must survive a power cut. |
| The firmware track is not yet decided, and a used batch may be heterogeneous | The transport layer must be swappable, and one app build must handle a fleet of mixed firmware. |
| Users are Arabic-speaking | Arabic and English from day one, with correct RTL layout — not a v2 retrofit. |

## Stack

**Flutter (Dart 3)**. One codebase for Android and iOS, a mature MQTT client
(`mqtt_client`), good mDNS support (`multicast_dns`), and — importantly for a
small team — no need to staff two native platforms.

The alternative worth naming: if the fleet ends up all-ESPHome and the users
are technical, Home Assistant plus its existing app is a zero-development
answer. It is a bad answer for a consumer product in Egypt (it requires the
customer to run a server), but it is a fine answer for internal deployments,
and it is the right thing to use during development.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  UI          Flutter widgets, Material 3, ar/en + RTL        │
├─────────────────────────────────────────────────────────────┤
│  State       Riverpod — one StripController per device       │
├─────────────────────────────────────────────────────────────┤
│  Domain      Strip, Outlet, Schedule, EnergyReading, Tariff  │
│              — firmware-agnostic; no MQTT or DP IDs leak in  │
├─────────────────────────────────────────────────────────────┤
│  Transport   abstract DeviceTransport                        │
│              ├── MqttTransport        (OpenBeken / ESPHome)  │
│              ├── EsphomeRestTransport (HTTP + SSE, LAN only) │
│              └── TuyaLocalTransport   (stock firmware, 6668) │
├─────────────────────────────────────────────────────────────┤
│  Discovery   mDNS + UDP beacon + manual IP entry             │
├─────────────────────────────────────────────────────────────┤
│  Storage     Drift (SQLite) — devices, schedules, energy     │
└─────────────────────────────────────────────────────────────┘
```

The **transport abstraction is the single most important decision in this
document.** It is what lets you start on Track B in week 1, move to Track A in
week 4, and support both in the same fleet forever, without rewriting the app.

```dart
abstract class DeviceTransport {
  Future<void> connect();
  Future<void> disconnect();

  /// Broadcast state; the UI subscribes and never polls.
  Stream<StripState> states();

  Future<void> setOutlet(int index, bool on);
  Future<void> setAll(bool on);

  /// Null when the hardware has no metering chip.
  Stream<EnergyReading>? energy();

  TransportCapabilities get capabilities;
}
```

`TransportCapabilities` is how one app build copes with a heterogeneous batch:
it reports outlet count, whether the USB rail is switchable, whether metering
exists, and whether the firmware supports on-device schedules. The UI renders
from capabilities, so a metering-less strip simply does not show an energy tab
rather than showing zeroes.

### MqttTransport — the primary one

Topics per [`03-firmware-tracks.md`](03-firmware-tracks.md). Subscribe to
`<devname>/+/get` and `<devname>/connected`, publish to `<devname>/<n>/set`.

The MQTT last-will on `<devname>/connected` gives genuine online/offline
detection with no polling — the broker publishes `offline` when the strip's
keepalive lapses. Build the "strip unreachable" UI on that, not on a timeout.

### EsphomeRestTransport — the fallback

ESPHome's web server exposes `/<domain>/<entity>[/<action>]`:

```
GET  /switch/outlet_1              → {"id":"switch-outlet_1","state":"ON","value":true}
POST /switch/outlet_1/turn_on      → 200
POST /switch/outlet_1/toggle       → 200
GET  /events                       → SSE stream of every state change
```

Four-segment URLs are POST-only because the fourth segment is always an action.
The `/events` SSE stream is the push channel; it works only on the LAN, which
is exactly the limitation MQTT exists to solve.

### TuyaLocalTransport — bring-up and stragglers

Implements the Tuya local protocol against TCP 6668 with the device's local
key. There is no mature Dart implementation, so this is either a Dart port of
the `tinytuya` protocol handling (AES-ECB/GCM framing, ~400 lines) or an FFI
binding. Scope it as a spike, and only build it if a meaningful number of units
end up stuck on Track B.

## Connectivity model

**Phase 1 — LAN only.** The phone and the strips are on the same Wi-Fi. Either
an MQTT broker on the LAN (a Raspberry Pi, or an old Android phone running a
broker), or direct HTTP to each strip. Zero infrastructure cost, works in a
single home, and is the right scope for the first release.

**Phase 2 — remote access without port-forwarding.** Because of CGNAT the
strips cannot be reached from outside; both the strip and the phone must make
*outbound* connections to a rendezvous point:

```
   strip ──outbound TLS──►  MQTT broker on a VPS  ◄──outbound TLS── phone
```

A single small VPS running Mosquitto with per-device credentials and TLS
handles hundreds of strips. Each strip gets its own username, password and a
topic ACL restricting it to `<devname>/#`, so a compromised strip cannot see or
control its neighbours. This is the whole back end — there is no reason to
build a REST API service, and every reason not to.

The cost of Phase 2 is that the strip now depends on your server, which is the
exact failure mode that made these devices useless in the first place. Mitigate
it structurally: the firmware keeps its **local** MQTT/HTTP interface enabled
at all times, so a strip whose cloud broker vanishes still works from the app
on the LAN and from its buttons. Write that into the firmware config template,
not into a wishlist.

## Discovery and onboarding

1. **mDNS** — ESPHome advertises `_esphomelib._tcp`; OpenBeken advertises
   `_http._tcp`. Sweep both on the local subnet.
2. **Broker enumeration** — once an MQTT broker is configured, every strip that
   has ever published a retained `connected` message appears automatically.
   This is the main path after the first strip.
3. **Manual IP entry** — always present, because mDNS is unreliable on
   consumer routers with client isolation enabled.

**First-time provisioning** of a freshly flashed strip: the strip boots as an
open AP. The app asks the user to join it (Android can do this programmatically
via `WifiNetworkSuggestion`; iOS requires the user to switch manually in
Settings), posts the home Wi-Fi credentials and broker settings to the strip's
config endpoint, then waits for it to appear on the LAN or the broker. Budget
real design effort here — provisioning is where consumer IoT products lose
users, and a captive-portal handoff on Android is fiddlier than it looks.

## Offline and failure behaviour

| Situation | Behaviour |
| --- | --- |
| Phone has no network | Show last known state, greyed, with a clear "not connected" banner. Never show a stale state as if it were live. |
| Strip offline (LWT fired) | Mark that strip offline; queue no commands. A command issued to an offline strip must fail visibly, not silently. |
| Command sent, no state confirmation within 3 s | Revert the toggle in the UI and surface the failure. Optimistic UI without reconciliation is how users end up believing a heater is off when it is on. |
| Power cut and restore | Relay power-on state is a firmware setting (`off` / `on` / `memory`). Expose it per strip in the app and default it to **off** for safety. |

That third row is a safety property, not a polish item. Treat it as a
requirement.

## Security

- TLS on the MQTT connection, per-device credentials, per-device topic ACLs.
- No shared secret compiled into the app. The app authenticates as the *user*;
  strips authenticate as themselves.
- The strip's local web UI and OTA endpoint must be password-protected before
  deployment — flashed firmware defaults to open, which is fine on a bench and
  unacceptable in a customer's home.
- Never expose the strips' broker to the internet without authentication. An
  open broker controlling mains relays in homes is a genuinely dangerous thing
  to operate.

## Data model

```
Strip     id, name, room, transportType, address, credentialsRef,
          capabilities, firmwareVersion, lastSeen
Outlet    stripId, index, name, icon, state, powerOnBehaviour
Schedule  outletRef, type(daily|weekly|countdown|sunrise|sunset),
          time, weekdayMask, action, enabled
Reading   stripId, timestamp, volts, amps, watts, kwhTotal
Tariff    name, bracketedRates[], currency          # user-editable
```

`Reading` grows without bound if you keep every sample. Store 1-minute samples
for 48 hours, then roll up to hourly for 90 days and daily beyond that, in a
background job. Decide this now — retrofitting downsampling onto a shipped
SQLite schema is unpleasant.
