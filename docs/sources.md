# Sources

Research current as of September 2026.

## Firmware and flashing

- [tuya-cloudcutter](https://github.com/tuya-cloudcutter/tuya-cloudcutter) —
  OTA exploit tool. Read directly. Source for: supported chipsets (BK7231T/N,
  RTL8710BN, RTL8720CF), the requirement for a second Wi-Fi adapter plus
  Docker and NetworkManager, and the **February 2022 SDK patch** that makes
  later devices unexploitable.
- [OpenBK7231T_App (OpenBeken)](https://github.com/openshwprojects/OpenBK7231T_App) —
  read directly. Source for supported chip families and Tasmota-compatible
  HTTP/MQTT.
- [OpenBeken MQTT topic reference](https://github.com/openshwprojects/OpenBK7231T_App/blob/main/docs/mqttTopics.md) —
  read directly. Source for the exact topic table in `03-firmware-tracks.md`
  (`<dev>/<n>/set`, `<dev>/<n>/get`, `<dev>/connected`, `cmnd/<dev>/<command>`,
  `tele/<dev>/SENSOR`).
- [OpenBeken command reference](https://github.com/openshwprojects/OpenBK7231T_App/blob/main/docs/commands.md)
- [ltchiptool](https://github.com/libretiny-eu/ltchiptool) — UART flashing and
  firmware backup.
- [UPK2ESPHome](https://upk.libretiny.eu/) — generates ESPHome YAML from a
  stock Tuya configuration blob.
- [LibreTiny / ESPHome platform docs](https://esphome.io/components/libretiny/) —
  board string `generic-bk7231n-qfn32-tuya`, supported targets.
- [digiblurDIY: Tuya CloudCutter with ESPHome](https://digiblur.com/2024/12/13/tuya-cloudcutter-with-esphome-bk7231-how-to-guide-home-assistant/) —
  practical no-solder walkthrough.

## Protocol and datapoints

- [tinytuya](https://github.com/jasonacox/tinytuya) — read directly. Source for
  the local-control credential set (device id + local key + IP), protocol
  versions 3.1–3.5, the `wizard` local-key extraction flow, and the outlet
  DPS conventions (switches on DP 1–6, metering on DP 18/19/20).
- [tinytuya DP_Mapping.md](https://github.com/jasonacox/tinytuya/blob/master/DP_Mapping.md)
- [localtuya-device-datapoints](https://github.com/dulfer/localtuya-device-datapoints) —
  community DP lists per device type.
- [ESPHome Web Server API](https://esphome.io/web-api/) — the
  `/<domain>/<entity>/<action>` REST scheme, POST-only 4-segment URLs, and the
  `/events` SSE stream.
- [ESPHome web_server component](https://esphome.io/components/web_server/)

## Hardware teardowns of the same device class

- Elektroda teardown, *[BK7231N] Tuya Smart Power Strip, 4AC + 4USB,
  YX-B3S1-VER00 PCB* — source of the reference GPIO map
  (P7/P8/P14/P9/P24 relays, P26 master button, P23 Wi-Fi LED).
- Elektroda, *[CB2S/BK7231N] TuyaMCU AOFO Smart Power Strip C733* — the
  TuyaMCU two-chip variant described in Track C2.
- Home Assistant community, *Power strip based on Tuya CBU (bk7231n) with power
  metering BL0937*.

> These three were reached through search result summaries only —
> `elektroda.com` and `community.home-assistant.io` are blocked by this
> environment's egress policy, so the GPIO map in
> `02-hardware-reference.md` was **not** verified against the primary pages.
> Treat it as a hypothesis, which is how that document labels it. If you want
> the primary sources, open them from an unrestricted network.

## Korean market context

- [LG U+ 유플러스 멀티탭](https://www.lguplus.com/smart-home/device/IOT1000005) —
  the carrier-locked product this batch may be. 4 outlets individually
  controlled, 2 USB ports, 3,520 W, app control via IoT@home, timers, standby
  cutoff, overload protection, energy monitoring.
- [e4ds news: LG U+ launches app-controlled IoT multi-tap](https://www.e4ds.com/sub_view.asp?idx=5517)
- [Danawa 스마트멀티탭 listings](https://search.danawa.com/dsearch.php?query=%EC%8A%A4%EB%A7%88%ED%8A%B8%EB%A9%80%ED%8B%B0%ED%83%AD) —
  market survey of the product class.
- [디지털포스트: Matter-capable Korean IoT multi-tap](https://www.ilovepc.co.kr/news/articleView.html?idxno=53712) —
  where this product class is heading. Blocked by egress policy; referenced
  from search summary only.

## Electrical compatibility

- [worldstandards.eu — Egypt](https://www.worldstandards.eu/electricity/plug-voltage-by-country/egypt/) —
  220 V, 50 Hz, Type C and Type F.
- [powerplugsockets.world — Egypt](https://powerplugsockets.world/country/egypt/) —
  Type F sockets are grounded and 16 A rated; Type C is ungrounded and limited
  to low-power devices.
- [Korea voltage and plug compatibility](https://www.kr-webmagazine.com/voltage-plug-compatibility-guide-for-electronics-in-korea/) —
  Korea is 220 V / 60 Hz on the same Schuko plug family.

## Egyptian electricity tariff

- [Egypt Independent: 2026 household and commercial electricity rates](https://www.egyptindependent.com/egypts-2026-electricity-prices-the-full-list-of-household-and-commercial-rates-after-latest-updates/)
- [Ases Kahraba: Egypt electricity price per kWh 2026](https://www.aseskahraba.com/en/blog/egypt-electricity-price-per-kwh-2026/)

> Published bracket rates differ between sources and are revised roughly
> annually. This is why `05-feature-spec.md` specifies a **user-editable**
> bracket table rather than hardcoded values — do not bake any of these numbers
> into the app.

## Matter (future direction only)

- [grandcentrix Flutter Matter plugin](https://github.com/GCX-HCI/grandcentrix-flutter-matter-plugin) —
  commissioning and control from Flutter, Android 8.1+ / iOS 16.4+.
- [Google Home Sample App for Matter](https://developers.home.google.com/samples/matter-app)
- [project-chip/connectedhomeip](https://github.com/project-chip/connectedhomeip) —
  the Matter SDK and `chip-tool` controller.

## Mobile stack

- [mqtt_client (Dart/Flutter)](https://pub.dev/packages/mqtt_client)
- [EMQ: using MQTT in Flutter](https://www.emqx.com/en/blog/using-mqtt-in-flutter)
- [Tasmota MQTT documentation](https://tasmota.github.io/docs/MQTT/) — the
  topic conventions OpenBeken mirrors.
