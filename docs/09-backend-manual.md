# 09 — Backend manual: building and running the server

Everything needed to go from a clean machine to a working system. Three stages:
run it on a laptop with simulated hardware, run it at home with real strips, run
it on a VPS so it works from anywhere.

**Requirements:** Node.js **22.5 or newer** (the server uses the built-in SQLite
driver, so there is no native module to compile and it builds on a Raspberry Pi
as easily as on a PC). Docker is optional.

---

## Stage 1 — Run it now, with no hardware

```bash
git clone https://github.com/bahaajobs/Power_Cord.git
cd Power_Cord
npm install
npm run demo
```

`npm run demo` starts three things: a development MQTT broker, the server, and
two virtual strips that speak the same MQTT topics as a real flashed strip.

Open **http://localhost:8080** and sign in as `admin` / `powercord`.

You should see two strips online, four outlets each, a USB rail, and live power
readings. Toggle an outlet and watch the simulator log the relay change. This is
the whole system, minus the mains.

```
npm run demo          broker + server + 2 virtual strips
npm test              20 tests: tariff maths, plus a full end-to-end run
npm start             server only, against a real broker
npm run broker        development broker only
npm run sim           virtual strips only
```

The demo database lives in `data/demo.db`. Delete it to start over.

**The simulator is not a toy.** Its appliances cycle like real ones — a fridge
compressor duty-cycles rather than drawing a flat load — so a standby-cutoff
rule that would misfire on real hardware misfires here, where it costs nothing.

---

## Stage 2 — Run it at home with real strips

### 2.1 Install a real broker

Mosquitto, not the development broker — that one has no authentication, no TLS
and no persistence, and binds to localhost on purpose.

```bash
sudo apt install mosquitto mosquitto-clients

# One account for the server, one per strip.
sudo mosquitto_passwd -c /etc/mosquitto/passwd powercord-server
sudo mosquitto_passwd    /etc/mosquitto/passwd 88D039B2588D    # per strip
```

Copy the config and ACL from this repository:

```bash
sudo cp deploy/mosquitto/mosquitto.conf /etc/mosquitto/conf.d/powercord.conf
sudo cp deploy/mosquitto/acl            /etc/mosquitto/acl
sudo systemctl restart mosquitto
```

Edit `/etc/mosquitto/acl` and add a stanza per strip — the template is in the
file. Each strip may only write to its own prefix and read its own commands, so
a compromised strip cannot switch its neighbours.

Check it works:

```bash
mosquitto_sub -h localhost -u powercord-server -P 'yourpassword' -t '#' -v
```

### 2.2 Point the strips at the broker

In each strip's OpenBeken web UI, under **Config → MQTT**:

| Field | Value |
| --- | --- |
| Host | your broker's LAN IP |
| Port | 1883 |
| Client name | the strip's topic prefix, e.g. `88D039B2588D` |
| User / password | the per-strip account you created |

Use the strip's **MAC address or device id as the client name**. It becomes the
MQTT topic prefix, the ACL username and the identity the server registers — one
stable string everywhere, so there is nothing to reconcile later.

Save and reboot the strip. It should appear in the `mosquitto_sub` output within
a few seconds, publishing `<prefix>/connected` = `online`.

### 2.3 Run the server

```bash
cp .env.example .env
# edit .env: PC_MQTT_URL, PC_MQTT_USERNAME, PC_MQTT_PASSWORD, PC_ADMIN_PASSWORD
set -a && source .env && set +a
npm start
```

Leave `PC_ADMIN_PASSWORD` blank and the server generates one and prints it once
at startup. Read the log — it is not shown again and not stored in readable form.

With `PC_AUTO_DISCOVER=true` (the default) any strip that publishes to the broker
registers itself. Otherwise add strips by hand from the app.

### 2.4 Keep it running

Either systemd:

```bash
sudo useradd -r -s /usr/sbin/nologin powercord
sudo cp -r . /opt/powercord && sudo chown -R powercord: /opt/powercord
sudo cp deploy/powercord.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now powercord
journalctl -u powercord -f
```

or Docker, which brings its own broker:

```bash
cp .env.example .env      # set PC_MQTT_PASSWORD and PC_ADMIN_PASSWORD
docker compose run --rm broker \
  mosquitto_passwd -c -b /mosquitto/config/passwd powercord-server 'yourpassword'
docker compose up -d
docker compose logs -f server
```

---

## Stage 3 — Make it work away from home

Read [`11-remote-access.md`](11-remote-access.md) first — it explains why a
server is needed at all and compares the four options. This section builds
option C, a VPS you own.

### 3.1 The server

Any small VPS. 1 vCPU and 1 GB of RAM handles hundreds of strips; the traffic is
a few hundred bytes per strip every ten seconds.

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
git clone https://github.com/bahaajobs/Power_Cord.git /opt/powercord
cd /opt/powercord && cp .env.example .env
```

### 3.2 TLS for the strips (MQTTS, port 8883)

Plaintext MQTT across the internet means anyone on the path can read your
traffic and publish commands to your relays. Get a certificate for the hostname
your strips will connect to:

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d mqtt.example.com
sudo mkdir -p /opt/powercord/deploy/mosquitto/certs
sudo cp /etc/letsencrypt/live/mqtt.example.com/{fullchain,privkey}.pem \
        /opt/powercord/deploy/mosquitto/certs/
```

Uncomment the TLS listener block in `deploy/mosquitto/mosquitto.conf`, point the
paths at those files, uncomment `- "8883:8883"` in `docker-compose.yml`, and
restart. In each strip's MQTT settings set the host to `mqtt.example.com`, the
port to `8883`, and enable TLS.

Certificates expire. Add a renewal hook that copies the new files and restarts
the broker, or your entire fleet drops off in ninety days.

### 3.3 TLS for the app (HTTPS)

Put Caddy in front — it obtains and renews certificates by itself:

```
# /etc/caddy/Caddyfile
powercord.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy proxies WebSockets without extra configuration, so live updates work. With
nginx you must forward the `Upgrade` and `Connection` headers on `/ws` yourself.

### 3.4 Lock it down

```bash
sudo ufw allow 22,80,443,8883/tcp && sudo ufw enable
```

Then, without exception:

- `PC_AUTO_DISCOVER=false` — on an internet-facing broker, a stranger's device
  must not be able to register itself into your account.
- A separate broker username and ACL stanza per strip.
- A strong `PC_ADMIN_PASSWORD`.
- A password on every strip's own web UI and OTA endpoint. The OTA endpoint
  accepts arbitrary firmware; it is the highest-value target in the system.

### 3.5 Back up

Everything is in one file:

```bash
sqlite3 /var/lib/docker/volumes/powercord_powercord-data/_data/powercord.db \
  ".backup '/backup/powercord-$(date +%F).db'"
```

`.backup` is safe on a live database; copying the file while the server is
writing is not.

---

## The API

Bearer-token authentication. `POST /api/auth/login` returns the token.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `{username, password}` → `{token, expires}` |
| `POST` | `/api/auth/logout` | Revoke the current token |
| `GET` | `/api/health` | Liveness and broker status (unauthenticated) |
| `GET` | `/api/state` | Everything the home screen renders |
| `GET`/`POST` | `/api/strips` | List / register a strip |
| `PATCH`/`DELETE` | `/api/strips/:id` | Rename, set plan expiry / remove |
| `POST` | `/api/strips/:id/outlets/:idx` | `{on: true\|false}` |
| `PATCH` | `/api/strips/:id/outlets/:idx` | `{name, icon, locked}` |
| `POST` | `/api/strips/:id/all` | `{on: true\|false}` |
| `POST` | `/api/all-off` | Every outlet on every strip |
| `POST` | `/api/strips/:id/command` | Raw OpenBeken console command |
| `GET` | `/api/energy?days=7\|30\|90` | Totals, cost, daily series, per-strip split |
| `GET`/`PATCH` | `/api/settings` | Currency, tariff mode, brackets |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/schedules` | Weekly and countdown timers |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/automations` | Standby cutoff, overload |
| `GET` | `/api/events` | Recent event log |
| `WS` | `/ws?token=…` | Live state push |

Status codes are meant literally: `423` means the outlet is locked, `503` means
the strip or broker is unreachable — the request was fine, the device was not.

```bash
TOKEN=$(curl -s localhost:8080/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"admin","password":"powercord"}' | jq -r .token)

curl -s localhost:8080/api/state -H "authorization: Bearer $TOKEN" | jq .totals
curl -s -X POST localhost:8080/api/strips/1/outlets/1 \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"on":true}'
```

---

## MQTT contract

What the server expects a strip to speak. OpenBeken produces this natively;
ESPHome's MQTT client is configured to match in
[`../firmware/esphome/`](../firmware/esphome/).

**From the strip:**

| Topic | Payload |
| --- | --- |
| `<prefix>/connected` | `online` / `offline` — retained last will |
| `<prefix>/<n>/get` | `1` / `0` — relay `n`, published on every change |
| `<prefix>/ip` | `192.168.1.42` |
| `<prefix>/rssi` | `-58` |
| `tele/<prefix>/SENSOR` | `{"ENERGY":{"Power":42.1,"Voltage":221.4,"Current":0.19}}` |

**To the strip:**

| Topic | Payload |
| --- | --- |
| `<prefix>/<n>/set` | `1` / `0` |
| `cmnd/<prefix>/<command>` | Any OpenBeken console command |

The retained last will on `<prefix>/connected` is what makes offline detection
honest — the broker publishes `offline` when the strip's keepalive lapses, with
no polling. A strip that has said nothing for `PC_OFFLINE_AFTER_MS` is marked
offline anyway, in case the will never arrived.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| No strips appear | `mosquitto_sub -t '#' -v` — if nothing arrives, the strips are not reaching the broker. Check the client name, credentials and ACL. |
| Strip shows ONLINE but toggling fails with 503 | The server publishes but nothing confirms. Check the relay channel numbers match the strip's actual pin config. |
| Toggle flips back after ~3 seconds | Working as designed: no confirmation arrived. The relay channel is wrong, or the strip dropped off between command and reply. |
| Energy always 0 | The strip has no metering chip, or `tele/<prefix>/SENSOR` is not being published. Confirm with `mosquitto_sub`. |
| Power reads ~10× wrong | Classic scaling bug. Tuya DP 19/20 are tenths; check the firmware's own calibration with `PowerSet`. |
| `Cannot find module 'node:sqlite'` | Node older than 22.5. `node --version`. |
| Everything works on the LAN, nothing away from home | Expected on option A. See [`11-remote-access.md`](11-remote-access.md). |
| WebSocket fails behind nginx | Forward the `Upgrade` and `Connection` headers on `/ws`, or use Caddy. |
