# 🖨️ BambuPi Manager

**[🇩🇪 Deutsch](#-installation-deutsch) | [🇬🇧 English](#-installation-english)**

Ein lokales Web-Dashboard für Bambu Lab 3D-Drucker auf dem Raspberry Pi — ohne Cloud, ohne Bambu Studio, ohne Abo.  
A local web dashboard for Bambu Lab 3D printers on Raspberry Pi — no cloud, no Bambu Studio, no subscription.

> 📋 **Vollständige Feature-Übersicht / Full feature overview:** [docs/FEATURES.md](docs/FEATURES.md)

---

## ✨ Features (Übersicht / Overview)

| Feature | Beschreibung / Description |
|---|---|
| 📊 Live Dashboard | SSE Echtzeit, Temp-Charts, MJPEG-Kamera (~200–500 ms) / SSE real-time, temp charts, MJPEG camera |
| 🌡️ Temperaturkontrolle | Setzen, Vorheizprofile PLA/PETG/ABS/TPU, Cooldown / Set, preheat, cooldown |
| 🎛️ Druckersteuerung | Pause, Stop, Speed, Lüfter, Licht, Flow Rate / Pause, stop, speed, fan, light, flow |
| 📡 SSE + Polling | Push-Updates mit automatischem Fallback / Push updates with auto fallback |
| ⏳ Druck-Warteschlange | Automatische Queue-Verarbeitung mit Bett-Status / Automatic queue with bed status |
| 🛠️ Wartungs-Manager | Trackt echte Druckstunden für Verschleißteile / Tracks actual print hours for maintenance |
| 👁️ 3D Vorschau | G-Code & .3mf Dateien direkt im Browser ansehen / View G-Code & .3mf in 3D |
| 📈 Statistiken | Historie mit Charts zu Material & Auslastung / History with charts for material & usage |
| 🔔 Messenger | Benachrichtigungen via Telegram & Discord / Notifications via Telegram & Discord |
| 🎨 AMS | RFID-Erkennung + manuelle Zuweisung / RFID detection + manual slot assignment |
| 🧵 Filament-DB | Spulen, Restmenge, Warn-Badge, BS Import / Spools, low-warning, BS import |
| 📁 Dateimanager | Upload, Drag & Drop, FTP, SD-Karte / Upload, drag & drop, FTP, SD card |
| 💰 Kostenrechner | Volle Kostenkalkulation inkl. Strom & Maschine / Full cost breakdown |
| ⛶ Kiosk-Modus | Vollbild für Wandtablet / Fullscreen for wall tablet |
| 📲 PWA | Als App installierbar / Installable as home screen app |
| 🖥️ Multi-Drucker | Beliebig viele Drucker / Any number of printers |

---

## 🚀 Neu in dieser Version / New in this version

- **3D G-Code Vorschau**: Betrachte hochgeladene G-Code und .3mf Dateien direkt im Browser in 3D.
- **Druck-Warteschlange**: Füge Dateien zur Schlange hinzu. Sobald der Drucker bereit ist und das Druckbett als leer markiert wurde, startet der nächste Job automatisch.
- **Wartungs-Manager**: Behalte den Überblick über Verschleißteile basierend auf echten Druckstunden.
- **Messenger-Integration**: Erhalte Benachrichtigungen bei fertigen Drucken oder Fehlern direkt via Telegram oder Discord-Webhook.

- **3D G-Code Preview**: View uploaded G-Code and .3mf files directly in 3D in your browser.
- **Print Queue**: Add files to the queue. As soon as the printer is ready and the bed is marked as clear, the next job starts automatically.
- **Maintenance Manager**: Keep track of wear parts based on actual print hours.
- **Messenger Integration**: Receive notifications for finished prints or errors directly via Telegram or Discord webhook.

---

## 🖨️ Unterstützte Drucker / Supported Printers

| Drucker / Printer | AMS | Kamera / Camera | Steuerung / Control |
|---|---|---|---|
| X1C | ✅ | ✅ | ✅ |
| X1E | ✅ | ✅ | ✅ |
| P1S | ✅ | ✅ | ✅ |
| P1P | ✅ | ✅ | ✅ |
| A1 | AMS Lite | ✅ | ✅ |
| A1 Mini | AMS Lite | ✅ | ✅ |

---

# 🇩🇪 Installation (Deutsch)

## Voraussetzungen

### 1. Hardware & OS
- **Raspberry Pi 4 oder 5** (Pi 3 funktioniert, ist aber langsamer)
- Raspberry Pi OS Lite (64-bit empfohlen)
- Drucker im selben Netzwerk wie der Pi

### 2. Am Drucker: LAN-Modus aktivieren
> ⚠️ **Wichtig:** BambuPi Manager kommuniziert direkt über MQTT. Dafür muss der **LAN-Only-Modus** aktiv sein.

1. **Einstellungen** (Zahnrad) → **Netzwerk** → **LAN-Only-Modus** aktivieren.
2. Der Drucker startet neu.
3. Gehe zu **Einstellungen** → **WLAN** und notiere den **Access Code** (8-stellig).
4. Notiere die **Seriennummer** (Geräteinfo) und die **IP-Adresse** (WLAN).

---

## Schritt 1 — Ein-Befehl-Installation

```bash
curl -fsSL https://raw.githubusercontent.com/thomasgiehl/bambupi/main/install.sh | bash
```

Das Skript erledigt alles: Node.js, ffmpeg, Zertifikate und den automatischen Dienststart.

---

## Schritt 2 — Erster Login & Passwort

BambuPi generiert beim ersten Start ein sicheres Passwort. Du findest es in den Logs:
```bash
sudo journalctl -u bambupi -f | grep "Pass:"
```
Öffne `http://[PI-IP]:3000` im Browser und logge dich mit `admin` und dem Passwort ein.

---

## Schritt 3 — Drucker einrichten

1. Klicke auf **Drucker** → **+ Drucker hinzufügen**.
2. **Name**: Frei wählbar (z.B. "Büro X1C").
3. **Modell**: Wähle dein Modell (X1C, P1S etc.).
4. **IP-Adresse**: Die IP aus Schritt 2.
5. **Access Code**: Der 8-stellige Code vom Display.
6. **Seriennummer**: Die SN deines Druckers.
7. Speichern. Der Drucker sollte sofort auf dem Dashboard erscheinen.

---

## Schritt 4 — Benachrichtigungen (Optional)

### Telegram
1. Erstelle einen Bot über den [@BotFather](https://t.me/botfather) und notiere den **API Token**.
2. Sende eine Nachricht an deinen Bot und rufe `https://api.telegram.org/bot<TOKEN>/getUpdates` auf, um deine **Chat ID** zu finden.
3. Trage beides in den **Einstellungen** unter "Messenger" ein.

### Discord
1. Gehe in deinem Discord-Server auf **Kanaleinstellungen** → **Integrationen** → **Webhooks**.
2. Erstelle einen neuen Webhook und kopiere die **Webhook-URL**.
3. Trage die URL in den **Einstellungen** unter "Messenger" ein.

---

# 🇬🇧 Installation (English)

## Prerequisites

### 1. Hardware & OS
- **Raspberry Pi 4 or 5** (Pi 3 works but is slower)
- Raspberry Pi OS Lite (64-bit recommended)
- Printer on the same network as the Pi

### 2. On the Printer: Enable LAN Mode
> ⚠️ **Important:** BambuPi Manager communicates directly via MQTT. **LAN-Only Mode** must be active.

1. **Settings** (gear) → **Network** → Enable **LAN-Only Mode**.
2. The printer will restart.
3. Go to **Settings** → **WiFi** and note the **Access Code** (8 digits).
4. Note the **Serial Number** (Device Info) and **IP Address** (WiFi).

---

## Step 1 — One-Command Installation

```bash
curl -fsSL https://raw.githubusercontent.com/thomasgiehl/bambupi/main/install.sh | bash
```

The script handles everything: Node.js, ffmpeg, certificates, and automatic service start.

---

## Step 2 — First Login & Password

BambuPi generates a secure password on first start. Find it in the logs:
```bash
sudo journalctl -u bambupi -f | grep "Pass:"
```
Open `http://[PI-IP]:3000` in your browser and log in with `admin` and the password.

---

## Step 3 — Add Your Printer

1. Click **Printers** → **+ Add Printer**.
2. **Name**: Any name (e.g., "Lab X1C").
3. **Model**: Select your model (X1C, P1S etc.).
4. **IP Address**: The IP from Step 2.
5. **Access Code**: The 8-digit code from the display.
6. **Serial Number**: Your printer's SN.
7. Save. The printer should appear instantly on the dashboard.

---

## Step 4 — Notifications (Optional)

### Telegram
1. Create a bot via [@BotFather](https://t.me/botfather) and note the **API Token**.
2. Message your bot and check `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your **Chat ID**.
3. Enter both in **Settings** under "Messenger".

### Discord
1. In your Discord server, go to **Channel Settings** → **Integrations** → **Webhooks**.
2. Create a new webhook and copy the **Webhook URL**.
3. Enter the URL in **Settings** under "Messenger".

---

## 🔄 Updates

Apply updates via SSH:
```bash
cd ~/bambupi
git pull
npm install --production
sudo systemctl restart bambupi
```

---

*Last Updated: 2026-04-19*
