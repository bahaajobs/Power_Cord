# Photographs

Photographs of **your** units go here. This directory ships empty apart from
this file and the manifest template.

## Why there are no teardown photos from the internet here

Photographs in published teardowns are the property of the people who took them.
Copying them into this repository would be a licensing problem rather than a
technical one, and the original schematics in
[`../schematics/`](../schematics/) carry more usable information than a photo of
someone else's board. Links to the external teardowns are in
[`../../docs/08-teardown.md`](../../docs/08-teardown.md) — read them there.

## Capture protocol

Do this on the **first** unit you open, before changing anything. It is the only
record of how the unit left the factory, and you will want it when unit 40 does
not match unit 1.

> Mains safety: the strip is unplugged for every step. See
> [`../../docs/07-safety-and-compliance.md`](../../docs/07-safety-and-compliance.md).

Shoot straight on, filling the frame, with diffuse light — a sheet of paper over
a desk lamp beats a phone flash, which blows out the silkscreen you are trying
to read. Hold the phone parallel to the board, not at an angle.

| # | Shot | What it must resolve |
| --- | --- | --- |
| 1 | Whole strip, top | Layout, button legends, LED position |
| 2 | Rating plate, straight on | Model, KC number, ratings, lot code — every character legible |
| 3 | QR code | Sharp enough to decode |
| 4 | Plug and cord entry | Strain relief condition, moulding marks |
| 5 | PCB, component side, whole board | Overall layout before you touch anything |
| 6 | PCB, solder side, whole board | Track routing, especially around the relays |
| 7 | Wi-Fi module, close | Silkscreen part number — the single most important photo |
| 8 | Any second MCU, close | Part number. Decides TuyaMCU vs plain GPIO |
| 9 | Metering area, close | Shunt, divider resistors, BL0937/HLW8012 marking |
| 10 | One relay, close | Part number and printed contact rating |
| 11 | UART pads / test points | Whether they are broken out and labelled |
| 12 | Anything unexpected | Rework, scorching, corrosion, a bodge wire |

Shots 7, 8 and 9 answer which firmware track the unit is on. If you take only
three, take those.

## Naming

```
<unit-id>-<nn>-<subject>.jpg

pc001-02-rating-plate.jpg
pc001-07-module-cb3s.jpg
pc001-08-second-mcu-none.jpg
```

`<unit-id>` matches the unit's fingerprint sheet
(`hardware/fingerprint-<unit-id>.md`), so a photo can always be traced to its
measurements and its QC record.

## Manifest

Record what each photo shows in `manifest.csv`, so someone reading the repo in a
year can find the one photo they need without opening forty files:

```csv
unit_id,file,subject,finding
pc001,pc001-07-module-cb3s.jpg,Wi-Fi module,CB3S / BK7231N confirmed
pc001,pc001-08-second-mcu-none.jpg,MCU area,no second MCU — plain GPIO, Track A
pc001,pc001-09-metering.jpg,Metering,BL0937 + 1 mOhm shunt present
```

A `.gitignore` in this directory keeps large image files out of git by default.
If you want them versioned, either commit them deliberately with `git add -f`, or
use Git LFS — a few hundred phone photos will otherwise make the repository
unpleasant to clone.
