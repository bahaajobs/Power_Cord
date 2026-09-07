#!/usr/bin/env python3
"""Probe a stock-firmware Tuya multi-tap and dump its datapoints.

Use this during step 4 of docs/01-device-identification.md, and to fill in the
"Observed Tuya datapoints" table of the device fingerprint.

The reference DP table in docs/02 is a convention, not a guarantee. This script
exists so you can replace convention with observation: run it in --watch mode,
press each button on the strip, and record which DP changes.

Requires:  pip install tinytuya
Needs:     device id, local key and IP  (see docs/03, Track B, for how to get
           the local key via `python -m tinytuya wizard`)

Examples:
    ./probe_tuya.py --scan
    ./probe_tuya.py --id bfa1... --key 5f3c... --ip 192.168.1.42
    ./probe_tuya.py --id bfa1... --key 5f3c... --ip 192.168.1.42 --watch
    ./probe_tuya.py --id bfa1... --key 5f3c... --ip 192.168.1.42 --set 1=true
"""

import argparse
import json
import sys
import time

try:
    import tinytuya
except ImportError:
    sys.exit("tinytuya is not installed.  pip install tinytuya")


# Conventional meanings, used only to annotate output. Never trust these over
# what you observe. See docs/02-hardware-reference.md.
KNOWN_DPS = {
    "1": "socket 1 on/off",
    "2": "socket 2 on/off",
    "3": "socket 3 on/off",
    "4": "socket 4 on/off",
    "5": "USB rail on/off",
    "7": "USB rail on/off (alt)",
    "9": "socket 1 countdown (s)",
    "10": "socket 2 countdown (s)",
    "11": "socket 3 countdown (s)",
    "12": "socket 4 countdown (s)",
    "13": "USB countdown (s)",
    "17": "energy total (0.01 kWh)",
    "18": "current (mA)",
    "19": "power (0.1 W)",
    "20": "voltage (0.1 V)",
    "21": "test bit",
    "22": "current calibration",
    "23": "voltage calibration",
    "24": "power calibration",
    "25": "energy calibration",
    "38": "power-on behaviour (off/on/memory)",
    "41": "cycle timing",
    "42": "random timing",
    "43": "inching / pulse config",
}

# DPs whose raw value is scaled by 10. Getting this wrong is the classic first
# bug: 2201 on DP 20 is 220.1 V, not 2201 V.
SCALED_BY_10 = {"19", "20"}


def annotate(dps: dict) -> list[str]:
    lines = []
    for dp in sorted(dps, key=lambda k: int(k) if k.isdigit() else 999):
        value = dps[dp]
        label = KNOWN_DPS.get(dp, "unknown — observe and record")
        extra = ""
        if dp in SCALED_BY_10 and isinstance(value, (int, float)):
            extra = f"  → {value / 10:g}"
        lines.append(f"  DP {dp:>3}  {str(value):<12}{extra:<12}  {label}")
    return lines


def scan() -> None:
    print("Scanning the local network for Tuya devices...\n")
    print("An open TCP 6668 plus a UDP beacon on 6666/6667 is conclusive Tuya.")
    print("Record the device id and protocol version in the fingerprint.\n")
    tinytuya.scan()


def connect(args) -> "tinytuya.OutletDevice":
    d = tinytuya.OutletDevice(args.id, args.ip, args.key)
    d.set_version(args.version)
    d.set_socketPersistent(True)
    return d


def dump(d) -> dict:
    status = d.status()
    if not isinstance(status, dict) or "dps" not in status:
        print(f"Unexpected response: {status!r}", file=sys.stderr)
        print(
            "\nCommon causes: wrong local key (it rotates on every re-pair), "
            "wrong protocol version (try --version 3.1/3.3/3.4/3.5), or the "
            "device is still bound to the cloud and refusing local control.",
            file=sys.stderr,
        )
        return {}
    return status["dps"]


def watch(d, interval: float) -> None:
    print("Watching for datapoint changes. Press each button on the strip in")
    print("turn and note which DP moves. Ctrl-C to stop.\n")
    previous: dict = {}
    while True:
        dps = dump(d)
        if dps and dps != previous:
            changed = {k: v for k, v in dps.items() if previous.get(k) != v}
            stamp = time.strftime("%H:%M:%S")
            if previous:
                print(f"[{stamp}] changed:")
                for line in annotate(changed):
                    print(line)
            else:
                print(f"[{stamp}] initial state:")
                for line in annotate(dps):
                    print(line)
            print()
            previous = dps
        time.sleep(interval)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--scan", action="store_true", help="scan the LAN and exit")
    p.add_argument("--id", help="device id")
    p.add_argument("--key", help="local key")
    p.add_argument("--ip", help="device IP address")
    p.add_argument("--version", type=float, default=3.3,
                   help="Tuya protocol version (3.1/3.2/3.3/3.4/3.5)")
    p.add_argument("--watch", action="store_true",
                   help="poll continuously and print datapoints as they change")
    p.add_argument("--interval", type=float, default=1.0,
                   help="poll interval in seconds for --watch")
    p.add_argument("--set", metavar="DP=VALUE", action="append", default=[],
                   help="set a datapoint, e.g. --set 1=true  (repeatable)")
    p.add_argument("--json", action="store_true", help="raw JSON output")
    args = p.parse_args()

    if args.scan:
        scan()
        return 0

    if not (args.id and args.key and args.ip):
        p.error("--id, --key and --ip are required unless --scan is given")

    d = connect(args)

    for assignment in args.set:
        if "=" not in assignment:
            p.error(f"--set expects DP=VALUE, got {assignment!r}")
        dp, raw = assignment.split("=", 1)
        if raw.lower() in ("true", "on", "1"):
            value: object = True
        elif raw.lower() in ("false", "off", "0"):
            value = False
        elif raw.lstrip("-").isdigit():
            value = int(raw)
        else:
            value = raw
        print(f"Setting DP {dp} = {value!r}")
        d.set_value(dp, value)
        time.sleep(0.5)

    if args.watch:
        try:
            watch(d, args.interval)
        except KeyboardInterrupt:
            print("\nStopped.")
        return 0

    dps = dump(d)
    if not dps:
        return 1
    if args.json:
        print(json.dumps(dps, indent=2))
    else:
        print(f"Datapoints reported by {args.id} at {args.ip}:\n")
        for line in annotate(dps):
            print(line)
        print("\nCopy the confirmed rows into the fingerprint sheet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
