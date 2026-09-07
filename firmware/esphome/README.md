# ESPHome starter configurations

Two templates, one per likely chipset. **Both contain pin assignments that are
hypotheses, marked `# VERIFY`.** Do not flash either until you have completed
step 5 of [`../../docs/01-device-identification.md`](../../docs/01-device-identification.md)
and confirmed the pins on your hardware — a wrong pin map at best does nothing
and at worst drives a pin that is wired to something else.

These are provided for the ESPHome/LibreTiny route. If you take the OpenBeken
route (recommended in [`../../docs/03-firmware-tracks.md`](../../docs/03-firmware-tracks.md)),
you do not need these: OpenBeken is configured at runtime from its web UI, and
your golden artifact is a configuration export rather than a YAML file.

## Building

```bash
pip install esphome
esphome compile multitap-bk7231n.yaml     # BK7231N via LibreTiny
esphome compile multitap-esp8266.yaml     # ESP8285 / TYWE3S
```

Flash the resulting image with `tuya-cloudcutter` (OTA) or `ltchiptool` (UART).

`secrets.yaml` is not committed. Create it alongside these files:

```yaml
wifi_ssid: "..."
wifi_password: "..."
ota_password: "..."
ap_password: "..."
mqtt_broker: "192.168.1.10"
mqtt_username: "..."
mqtt_password: "..."
```

## Generating a config for an unknown unit

[UPK2ESPHome](https://upk.libretiny.eu/) reads the stock firmware's Tuya
configuration blob and generates a matching ESPHome YAML — relays, buttons,
LEDs and metering chip included. If you can extract the storage partition from
a unit, this is far more reliable than guessing pins, and it is the fastest way
to a correct config for a variant nobody has documented.
