# 10 — User Manual: Setup and Daily Operation

A complete guide to bringing up, configuring, and operating your refurbished Korean IoT multi-taps with the **Power Cord** Android app in **Direct Mode**.

---

## 1. Safety First (Read Before Touching Hardware)

> [!CAUTION]
> **220 V Mains Voltage is Lethal.**
> 1. **Always unplug the strip from the mains wall socket** before inspecting, opening, or connecting wires to the board.
> 2. **"Off" is NOT "Isolated":** These power strips switch the **Live conductor only**. The Neutral conductor remains permanently connected to every outlet at all times. **Never assume a switched-off outlet is safe to touch.** Always pull the mains plug before touching appliance wiring or plugs.
> 3. **Never test UART connections with mains plugged in.** Flash and test modules on bench power (3.3 V DC from your USB adapter) with the mains cord disconnected.

---

## 2. System Overview: Direct Mode

The default and recommended way to run your strips is **Direct Mode**:
- **No cloud vendor:** The strip does not connect to Korean carrier platforms (LG U+, KT, SK) or Tuya cloud.
- **No mandatory server or broker:** Your Android phone talks directly to the strip's local web server over standard HTTP commands (`/cm?cmnd=...`).
- **Low latency & local control:** Outlet switches, status updates, schedules, and energy monitoring happen directly over your home Wi-Fi.

---

## 3. Step 1: Initial Hardware & Firmware Bring-Up

Before the strip can be controlled by the app, its Wi-Fi module must be flashed with open firmware (**OpenBeken**).

### A. Flashing OpenBeken
1. **Try OTA first (Over-The-Air, ~10 minutes):**
   - Use [`tuya-cloudcutter`](https://github.com/tuya-cloudcutter/tuya-cloudcutter) on a Linux laptop with a secondary Wi-Fi adapter.
   - Put the strip into Tuya pairing mode (hold the master button for 5 seconds until the Wi-Fi LED blinks rapidly).
   - If successful, OpenBeken is installed without opening the casing.
2. **If OTA fails (UART Flash on Bench, ~30 minutes):**
   - **UNPLUG THE STRIP FROM MAINS.**
   - Open the case (remove rubber feet on base to access casing screws).
   - Connect a 3.3V USB-to-UART adapter to the CB3S module following schematic [`hardware/schematics/05-cb3s-flashing-pinout.svg`](../hardware/schematics/05-cb3s-flashing-pinout.svg):
     - **3V3** → 3.3V on adapter (*NEVER connect 5V*)
     - **GND** → Ground on adapter
     - **RX1 (P10)** → TXD on adapter
     - **TX1 (P11)** → RXD on adapter
   - Use `ltchiptool` or `BK7231 GUI Flash Tool`. When flashing starts, momentarily tap the **CEN** pin to **GND** to reset the chip into bootloader mode.
   - Backup the factory stock firmware before writing `OpenBK7231N_...bin`.

### B. Connect the Strip to Home Wi-Fi
1. After flashing, the strip reboots and creates an open Wi-Fi access point: `OpenBK7231N_XXXXXX`.
2. Connect your phone or laptop to this network and open your browser to **`http://192.168.4.1`**.
3. Go to **Config → Configure WiFi**, enter your home Wi-Fi SSID and password, and click **Save**.
4. The strip will connect to your home Wi-Fi.

### C. Set a Static DHCP Lease in Your Router (Crucial)
1. Log into your home Wi-Fi router's admin page.
2. Locate the strip in the connected client list (look for its MAC address or `OpenBK7231N`).
3. **Assign it a static/reserved IP address** (e.g., `192.168.1.42`).
   > *Tip:* If the router reassigns a new dynamic IP to the strip after a power cut, the app will lose connection until updated. A static lease prevents this permanently.

### D. Set a Strip Username and Password
1. Open the strip's web interface at its new static IP (`http://192.168.1.42`).
2. Go to **Config → Web App / HTTP Auth**.
3. Set a secure **Username** and **Password** and click **Save**.

---

## 4. Step 2: Installing the Android App (APK)

Because web browsers enforce CORS (Cross-Origin Resource Sharing), a standard browser tab cannot make direct HTTP requests to the strip's local web server. The Android app uses Capacitor's native HTTP layer to bypass CORS and communicate with your strips.

### Installing the APK:
1. **Locate the APK file:**
   - Pre-built debug APK in your repository:
     [`android/app/build/outputs/apk/debug/app-debug.apk`](../android/app/build/outputs/apk/debug/app-debug.apk)
   - Or download the latest `powercord-debug-apk` from your GitHub Actions workflow artifacts.
2. **Transfer to your Android phone:**
   - Copy via USB cable, Google Drive, WhatsApp, Telegram, or local network file share.
3. **Install:**
   - Tap the `.apk` file on your phone.
   - When prompted that the APK is from an unknown source, allow installation (or go to **Settings → Apps → Special app access → Install unknown apps**).
   - Open **Power Cord**.

---

## 5. Step 3: First-Run Onboarding & Adding Strips

When you open the app for the first time, you are greeted by the **5-Step Setup Guide**:
1. **Welcome & Safety Notice:** Confirms 220V Schuko compatibility and safety warnings.
2. **Wi-Fi Connectivity:** Guidance on strip Wi-Fi connection.
3. **Static IP Reservation:** Instructions to assign a reserved router lease.
4. **Credential Setup:** Reminder to set a password on the strip.
5. **Add Your Strip:** Launches the strip registration dialog.

### Option A: Automatic Subnet Scan (Android Only)
1. Tap **Scan my network**.
2. The app sweeps your local `/24` subnet (e.g. `192.168.1.1` to `192.168.1.254`) in batches.
3. Any device answering Tasmota's command endpoint appears with its name and detected channel count.
4. Tap the discovered strip to auto-fill its address.

### Option B: Manual Addition
1. Tap **+ Add strip** on the home screen.
2. Fill in the fields:
   - **Name:** A friendly label (e.g. `Living Room TV Strip` or `Office Desk`).
   - **Address (LAN):** The strip's static IP and port, e.g. `192.168.1.42` or `192.168.1.42:80`.
   - **Remote Address (Optional):** Your dynamic DNS host or forwarded router port, e.g. `myhome.ddns.net:8081` (see Section 7).
   - **Username & Password:** The credentials configured on the strip in Step 1D.
   - **Outlets:** Number of AC outlets (typically `4`).
   - **Has USB rail:** Checked if the strip has a switchable 5V USB charging rail.
3. Tap **Test connection**. If credentials and IP are correct, the app will report the reachable channels in green.
4. Tap **Add**. Your strip will appear on the home screen marked **ONLINE**.

---

## 6. Step 4: Daily Operation

### Home Dashboard
- **Total Power Right Now:** Live combined wattage of all online metering strips.
- **Summary Counters:** Number of online strips, active outlets, and active warranty/service plans.
- **Search Bar:** Real-time filter by strip name, room, device ID, or appliance name.

### Controlling Outlets
- **Toggle Outlets:** Tap any individual outlet tile (1, 2, 3, 4) to toggle its relay.
- **USB Rail:** Toggle the 5V USB charging rail using the switch below the main outlet grid.
- **Turn All On / Turn All Off:** Batch commands to switch all AC outlets on a strip simultaneously.
- **Global All Off:** Tap the red **All off** button in the top navigation bar to turn off every outlet on every strip across your entire home.

### Locking Outlets (Crucial for Routers & Freezers)
To prevent accidentally cutting power to critical appliances (like your home Wi-Fi router, fridge, or alarm):
1. Tap the **Gear icon (⚙)** on the strip card to open **Strip Settings**.
2. Scroll to **Outlets**.
3. Toggle the lock switch next to the outlet (e.g. `Outlet 1 - Wi-Fi Router`).
4. **Result:**
   - A lock icon appears on the outlet tile on the home screen.
   - Tapping the locked tile in the app will refuse the command and display a warning toast: *"Outlet is locked"*.

### Understanding State & Confirmation
- **`SWITCHING…` Badge:** When you tap an outlet, the UI displays `SWITCHING…`. The app does not assume success. It waits for the strip's hardware relay to confirm its new state.
- **Rollback on Failure:** If the strip fails to reply within ~3.5 seconds (e.g. Wi-Fi dropped or strip was unplugged), the app reverts the switch to its true hardware state and displays an error message.
- **Connection Badges:**
  - `Local · direct`: Controlled over your home Wi-Fi.
  - `Remote · direct`: Controlled via port forwarding or external address.
  - `OFFLINE`: Strip is unreachable; physical buttons on the strip continue to work normally.

---

## 7. Step 5: Energy Monitoring & Egyptian Tariff Setup

Strips equipped with a metering chip (BL0937 or HLW8012) display real-time wattage on their card and record historical energy data.

> [!NOTE]
> **Single Shunt Metering:** The current-sensing shunt sits upstream of all relays. The strip measures **total energy for the entire strip**, never per outlet. The app will never claim an individual outlet consumed a specific kWh figure.

### Energy Dashboard
Tap the **Consumption** icon in the quick navigation bar:
- **Ranges:** Switch between **7 Days**, **30 Days**, or **90 Days**.
- **Daily Usage Bar Chart:** Interactive bars showing kWh per day. Tap any bar to see the exact date and consumption.
- **By Strip Breakdown:** View which power strips accounted for what percentage of total household smart-plug usage.

### Setting Up the Egyptian Electricity Tariff
Egyptian residential electricity is billed in **rising consumption brackets** (slides). A single flat rate per kWh is mathematically incorrect because marginal rates increase as monthly consumption climbs.

1. On the Energy screen, tap the **Tariff icon (pencil or currency sign)**.
2. Select **Mode:**
   - **Rising Brackets (Recommended):** Reflects the official Egyptian residential tariff structure.
   - **Single Rate:** A flat price per kWh (e.g. `1.50 EGP`).
3. Enter your **Household use so far this month (MTD kWh)** directly from your utility bill or prepaid card meter. This ensures the app calculates the cost of smart-plug power at your current marginal bracket rate.
4. **Editable Brackets Table:**
   - Rates can be edited directly when the utility company updates prices annually.
   - Default brackets:
     - 0 – 50 kWh: 0.68 EGP/kWh
     - 51 – 100 kWh: 0.95 EGP/kWh
     - 101 – 200 kWh: 1.15 EGP/kWh
     - 201 – 350 kWh: 1.72 EGP/kWh
     - 351 – 650 kWh: 2.18 EGP/kWh
     - 651 – 1000 kWh: 2.40 EGP/kWh
     - Above 1000 kWh: 2.74 EGP/kWh
5. Tap **Save**. Estimated costs update instantly.

---

## 8. Step 6: Schedules & Automations

### A. Schedules
Tap **Schedules** in the quick nav:
- **Weekly Schedule:** Choose a target strip and outlet, set a time (`HH:MM`), select active days (Sun–Sat), and set the action (`Turn On` or `Turn Off`).
- **Countdown Timer:** Turn an outlet off automatically after a set duration (e.g., *"Turn off charger in 45 minutes"*).
- *Notice:* In Direct Mode, schedules run inside the mobile app and trigger while the phone is active.

### B. Power Automations
Tap **Power Automation** in the quick nav to create energy-driven rules:
1. **Standby Cutoff (대기전력 차단):**
   - Ideal for TV setups, audio systems, and computer desks.
   - If total load drops below a threshold (e.g. `10 W`) continuously for a set period (e.g. `15 minutes`), the strip automatically switches off to eliminate vampire phantom power.
   - *Fridge Protection:* The duration window prevents false triggers during normal appliance cycling (e.g. a refrigerator compressor idling).
2. **Overload Cutoff:**
   - Safety rule to prevent overheating or tripping circuit breakers.
   - If total load exceeds a safety threshold (e.g. `3000 W`), the strip instantly cuts power and triggers an alert.

---

## 9. Step 7: Remote Access Outside the Home

To control your strips when you leave your home Wi-Fi:

### Method 1: Home VPN (Recommended & Most Secure)
- Install **WireGuard** or **Tailscale** on your home network (e.g. on a home server, Raspberry Pi, or supported router).
- Connect your Android phone to the VPN when away from home.
- **Benefit:** Direct access to the strip's LAN IP (`192.168.1.42`) with full end-to-end encryption. No ports forwarded to the public internet.

### Method 2: Router Port Forwarding
If you do not have a home VPN:
1. In your home router, forward a high outside port to the strip's LAN port:
   - External Port: `8081` → Internal IP: `192.168.1.42` Port: `80`.
2. Configure a Dynamic DNS hostname (e.g. `myhome.ddns.net`).
3. In the Power Cord app, edit the strip settings and set **Remote Address** to `myhome.ddns.net:8081`.
4. **Automatic Failover:** When on home Wi-Fi, the app uses `lanHost`. When on mobile data, it automatically switches to `remoteHost` within one poll.

> [!WARNING]
> **Plaintext HTTP Warning:** A forwarded port exposes a mains relay controller to the internet over cleartext HTTP. You **MUST** have a strong password set on the strip. Never forward a strip that controls high-hazard loads like heaters.

---

## 10. Language & RTL Support

Power Cord includes complete native support for **Arabic (العربية)** and **English**:
1. Open **Settings** (top right gear).
2. Tap **العربية**.
3. The entire interface mirrors right-to-left (RTL), displaying Arabic-Indic numerals and localized outlet names.
4. IP addresses, hostnames, and time-series charts stay left-to-right (LTR) for universal technical clarity.
5. Your language choice is permanently preserved across app restarts.
