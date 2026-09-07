#!/usr/bin/env bash
# Find multi-taps on the local network, whatever firmware they run.
#
# Used in step 4 of docs/01-device-identification.md, and afterwards to locate
# flashed units during Phase 1 batch work.
#
# Usage:  ./discover.sh [subnet]      e.g. ./discover.sh 192.168.1.0/24
# Subnet defaults to the network of the default route.

set -uo pipefail

SUBNET="${1:-}"

if [[ -z "$SUBNET" ]]; then
  if command -v ip >/dev/null 2>&1; then
    SUBNET=$(ip -o -f inet addr show scope global | awk 'NR==1{print $4}')
  fi
fi

if [[ -z "$SUBNET" ]]; then
  echo "Could not determine the local subnet. Pass it explicitly:" >&2
  echo "  $0 192.168.1.0/24" >&2
  exit 1
fi

have() { command -v "$1" >/dev/null 2>&1; }

echo "=== Subnet: $SUBNET ==="
echo

echo "--- mDNS: ESPHome devices (_esphomelib._tcp) ---"
if have avahi-browse; then
  timeout 8 avahi-browse -rtp _esphomelib._tcp 2>/dev/null | grep '^=' || echo "  none found"
elif have dns-sd; then
  timeout 8 dns-sd -B _esphomelib._tcp || true
else
  echo "  skipped: install avahi-utils (Linux) or use dns-sd (macOS)"
fi
echo

echo "--- mDNS: web UIs (_http._tcp) — OpenBeken advertises here ---"
if have avahi-browse; then
  timeout 8 avahi-browse -rtp _http._tcp 2>/dev/null | grep '^=' || echo "  none found"
else
  echo "  skipped: install avahi-utils"
fi
echo

echo "--- Tuya stock firmware: UDP beacon + TCP 6668 ---"
if have python3 && python3 -c "import tinytuya" 2>/dev/null; then
  timeout 20 python3 -m tinytuya scan || true
else
  echo "  skipped: pip install tinytuya"
fi
echo

echo "--- Port sweep: 80 (web UI), 6668 (Tuya local), 8886 (Tuya alt) ---"
if have nmap; then
  nmap -Pn -sT -p 80,6668,8886 --open "$SUBNET" 2>/dev/null \
    | grep -E '^(Nmap scan report|[0-9]+/tcp)' || echo "  none found"
else
  echo "  skipped: install nmap"
fi
echo

echo "Record findings in hardware/fingerprint-<unit-id>.md."
echo "An open 6668 plus a UDP beacon means stock Tuya firmware (Track B)."
echo "An open 80 with an ESPHome or OpenBeken page means the unit is flashed."
