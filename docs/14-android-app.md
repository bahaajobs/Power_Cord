# 14 — The Android app: getting the APK

The app ships as an Android APK built from the same web app the server serves.
Capacitor wraps it, which buys one thing that matters: requests to the strips go
through a **native** HTTP layer rather than the WebView, so they are not subject
to CORS. That is what makes direct-to-strip control possible at all.

---

## Getting the APK without installing anything

The build needs the Android SDK. Rather than setting that up, let GitHub do it —
this is already wired up and has been run successfully:

1. Open the repository on GitHub → **Actions**
2. Pick **Build Android APK** in the left sidebar
3. **Run workflow** → choose branch `claude/korean-power-cord-app-88ip32` → **Run**
4. Wait about four minutes
5. Open the finished run → **Artifacts** → download **powercord-debug-apk**
6. Unzip it; inside is `powercord-<commit>.apk`

That APK is signed with Android's debug key, so it installs on a phone without
any signing setup. That is exactly what you want for testing.

### Installing it on a phone

1. Copy the `.apk` to the phone, or download it there directly.
2. Open it. Android will say the app came from an unknown source.
3. Allow installation for the app you used to open it (Files, Chrome…) in the
   prompt, or under **Settings → Apps → Special access → Install unknown apps**.
4. Open **Power Cord**.

On first launch it shows the setup guide. If your strips are already flashed
and on your Wi-Fi, skip to the end and add one by address.

---

## Building it yourself

Needs JDK 21, Node 22, and the Android SDK (command-line tools are enough).

```bash
npm ci
npx cap sync android
cd android
./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

`npx cap sync android` copies `web/` into the Android project. **Run it after
every change to the web app** or you will build the previous version and
conclude, wrongly, that your change did nothing.

For a Play Store build you need your own signing key:

```bash
keytool -genkey -v -keystore powercord.keystore -alias powercord \
        -keyalg RSA -keysize 2048 -validity 10000
```

Then either build locally with `assembleRelease`, or add these repository
secrets and run the workflow — the signed job skips itself when they are absent:

| Secret | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 powercord.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `powercord` |
| `ANDROID_KEY_PASSWORD` | Key password |

Keep the keystore. Losing it means never being able to update the app for
anyone who installed it.

---

## What is in the Android project

| Path | Why it matters |
| --- | --- |
| `capacitor.config.json` | App id `eg.powercord.app`, `webDir: web`, and `CapacitorHttp` enabled — that last one is what routes device requests through native code |
| `android/app/src/main/res/xml/network_security_config.xml` | Permits cleartext HTTP. Without it Android 9+ blocks every request to a strip, because the strips have no certificates |
| `AndroidManifest.xml` | `supportsRtl="true"` for Arabic, plus the cleartext settings |
| `android/variables.gradle` | minSdk 22 (Android 5.1), target 34 |

minSdk 22 covers effectively every Android phone still in use, which matters
for this market.

### The cleartext trade-off, stated plainly

The app permits unencrypted HTTP to any host, because the strips only speak
HTTP and a remote strip is reached through a public hostname rather than a
private IP range. On your own Wi-Fi the exposure is your house. Across the
internet it is everyone in between — which is why
[`13-direct-mode.md`](13-direct-mode.md) recommends a VPN over a bare port
forward, and why a forwarded strip must have a password set.

---

## Language

English by default, Arabic available, switched in **Settings → Language**. The
choice is remembered.

Arabic mirrors the entire layout, not just the text: the manifest sets
`supportsRtl`, and the stylesheet uses logical properties (`inset-inline-end`
rather than `right`) so every control moves to the correct side. Numbers render
in Arabic-Indic digits. Device addresses, MQTT topics and the energy chart stay
left-to-right, because an IP address reads the same in every language and a
time series runs earliest-to-latest regardless.

---

## Known limits of this build

- **Direct mode needs the APK.** In a browser it will show every strip offline;
  that is CORS, not a bug. Browsers can use server mode.
- **Schedules run while the app is open.** No background service yet. For
  timers that survive the app being closed, use the strip's own firmware
  timers, or run the server.
- **Network scanning is Android-only**, for the same CORS reason.
- **No iOS build yet.** Capacitor supports it; nobody has run it.
- **The APK builds, but has never been installed or run on a phone.** CI
  produced a 3.4 MB debug APK in about 90 seconds on the first attempt, so the
  Android project and the workflow are known-good. What nobody has done yet is
  install it and drive it against hardware — the app's behaviour on a real
  device is unverified, and the first person to open it is finding out for the
  first time.
