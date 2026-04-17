# 🖨️ BambuPi Manager

**[🇩🇪 Deutsch](#-installation-deutsch) | [🇬🇧 English](#-installation-english)**

Ein lokales Web-Dashboard für Bambu Lab 3D-Drucker auf dem Raspberry Pi — ohne Cloud, ohne Bambu Studio, ohne Abo.  
A local web dashboard for Bambu Lab 3D printers on Raspberry Pi — no cloud, no Bambu Studio, no subscription.

> 📋 **Vollständige Feature-Übersicht / Full feature overview:** [docs/FEATURES.md](docs/FEATURES.md)

---

## ✨ Features (Übersicht / Overview)

| Feature | Beschreibung / Description |
|---|---|
| 📊 Live Dashboard | SSE Echtzeit, Temp-Charts, Kamera / SSE real-time, temp charts, camera |
| 🌡️ Temperaturkontrolle | Setzen, Vorheizprofile PLA/PETG/ABS/TPU, Cooldown / Set, preheat, cooldown |
| 🎛️ Druckersteuerung | Pause, Stop, Speed, Lüfter, Licht, Flow Rate / Pause, stop, speed, fan, light, flow |
| 📡 SSE + Polling | Push-Updates mit automatischem Fallback / Push updates with auto fallback |
| 🔔 Benachrichtigungen | Browser-Push + Temperatur-Alarm / Browser push + temperature alarm |
| 📟 Event-Log | Live-Ereignisprotokoll / Live event log (last 50 events) |
| 🎨 AMS | RFID-Erkennung + manuelle Zuweisung / RFID detection + manual slot assignment |
| 🧵 Filament-DB | Spulen, Restmenge, Warn-Badge, Bambu Studio Import / Spools, low-warning, BS import |
| 📁 Dateimanager | Upload, Drag & Drop, FTP, SD-Karte / Upload, drag & drop, FTP, SD card |
| 📊 Auto-Kostenanalyse | .3mf-Metadaten → Kosten-Preview (Opt-in) / .3mf metadata → cost preview |
| 💰 Kostenrechner | Filament + Strom + Maschine + Fehldruck + Marge / Full cost breakdown + margin |
| 📜 Druckhistorie | Log + CSV-Export / Print log + CSV export |
| 🔄 In-App Updates | Git pull + Neustart per Knopf / One-click git pull + restart |
| ⛶ Kiosk-Modus | Vollbild für Wandtablet / Fullscreen for wall tablet |
| 📲 PWA | Als App installierbar / Installable as home screen app |
| 🖥️ Multi-Drucker | Beliebig viele Drucker / Any number of printers |
| 📱 Mobil | Responsive, Bottom-Nav, Swipe / Responsive, bottom nav, swipe |

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
| H2D | ✅ | ✅ | ✅ |

---

---

# 🇩🇪 Installation (Deutsch)

## Voraussetzungen

### Hardware
- **Raspberry Pi 4** (mindestens 2 GB RAM empfohlen)
- MicroSD Karte (mindestens 16 GB)
- Bambu Lab Drucker im selben WLAN wie der Pi

### Software auf dem Pi
- Raspberry Pi OS Lite 64-bit (oder Desktop)
- Node.js 18 oder neuer
- Git

### Am Drucker: LAN-Modus aktivieren

> ⚠️ **Wichtig:** BambuPi Manager kommuniziert direkt mit dem Drucker über das lokale Netzwerk (MQTT). Dafür muss der **LAN-Only-Modus** aktiviert sein.

**Am Touchscreen des Druckers:**

1. Drücke das **Einstellungen-Symbol** (Zahnrad) auf dem Drucker-Display
2. Gehe zu **Netzwerk** → **LAN-Only-Modus**
3. Aktiviere den Schalter → der Drucker startet neu
4. Nach dem Neustart: Gehe zu **Einstellungen** → **WLAN**
5. Notiere den **Access Code** (8-stelliger Code, z.B. `12345678`)

**Seriennummer finden:**

- Aufkleber auf der Rückseite oder Unterseite des Druckers
- Oder: Touchscreen → **Einstellungen** → **Geräteinformationen** → **Seriennummer**
- Format: `01S00A123456789` (15 Zeichen)

**IP-Adresse des Druckers:**

- Touchscreen → **Einstellungen** → **WLAN** → IP-Adresse steht dort
- Oder: Im Router-Interface nachsehen (Gerätename = Bambu Lab Drucker)

---

## Schritt 1 — Raspberry Pi vorbereiten

SSH-Verbindung zum Pi öffnen oder direkt am Terminal:

```bash
# System updaten
sudo apt update && sudo apt upgrade -y

# Git installieren (falls nicht vorhanden)
sudo apt install -y git
```

---

## Schritt 2 — BambuPi Manager installieren

### Option A: Ein-Befehl-Installation (empfohlen)

```bash
curl -fsSL https://raw.githubusercontent.com/thomasgiehl/-bambupi-manager/main/install.sh | bash
```

Das Skript installiert automatisch:
- Node.js (falls nicht vorhanden)
- Alle Abhängigkeiten
- Startet den Dienst automatisch beim Systemstart (systemd)

### Option B: Manuelle Installation

```bash
# Repository klonen
git clone https://github.com/thomasgiehl/-bambupi-manager.git
cd -bambupi-manager

# Abhängigkeiten installieren
npm install

# Konfigurationsdatei anlegen
cp .env.example .env
nano .env
```

Inhalt der `.env` anpassen:

```env
PORT=3000
ELECTRICITY_COST=0.35    # Strompreis in €/kWh
PRINTER_WATT=350          # Verbrauch des Druckers in Watt
```

Dann als Systemdienst einrichten:

```bash
# Service-Datei anlegen
sudo nano /etc/systemd/system/bambupi.service
```

Inhalt einfügen:

```ini
[Unit]
Description=BambuPi Manager
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/-bambupi-manager
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> ⚠️ Passe `User` und `WorkingDirectory` an deinen tatsächlichen Benutzernamen und Installationspfad an!

```bash
# Dienst aktivieren und starten
sudo systemctl daemon-reload
sudo systemctl enable bambupi
sudo systemctl start bambupi
```

---

## Schritt 3 — Dashboard öffnen

Finde die IP-Adresse deines Pi:

```bash
hostname -I
```

Öffne im Browser auf einem Gerät im selben WLAN:

```
http://DEINE_PI_IP:3000
```

Beispiel: `http://192.168.178.50:3000`

---

## Schritt 4 — Drucker hinzufügen

1. Klicke in der linken Navigation auf **Drucker**
2. Klicke auf **+ Drucker hinzufügen**
3. Fülle das Formular aus:

| Feld | Beispiel | Erklärung |
|---|---|---|
| **Name** | `Mein X1C` | Beliebiger Anzeigename |
| **Modell** | `X1C` | Dein Druckermodell |
| **IP-Adresse** | `192.168.178.46` | IP des Druckers im WLAN |
| **Access Code** | `12345678` | 8-stelliger Code vom Drucker-Display |
| **Seriennummer** | `01S00A123456789` | Aufkleber auf dem Drucker |

4. Klicke auf **Speichern**
5. Das Dashboard wechselt automatisch und zeigt deinen Drucker live an ✅

---

## Nützliche Befehle

```bash
# Status prüfen
sudo systemctl status bambupi

# Live-Logs anschauen
sudo journalctl -u bambupi -f

# Neustart
sudo systemctl restart bambupi

# Update (neuste Version holen)
cd ~/bambupi-manager && git pull && sudo systemctl restart bambupi
```

---

## Fehlerbehebung

**Dashboard lädt nicht:**
- Prüfe ob der Dienst läuft: `sudo systemctl status bambupi`
- Prüfe ob Port 3000 erreichbar ist: `curl http://localhost:3000`

**Drucker zeigt "offline":**
- Ist der LAN-Only-Modus am Drucker aktiviert?
- Sind Pi und Drucker im selben WLAN?
- Stimmt die IP-Adresse? (kann sich nach Router-Neustart ändern → statische IP empfohlen)
- Stimmt der Access Code? (am Drucker unter Einstellungen → WLAN nachsehen)
- Firewall prüfen: Port 8883 (MQTT) muss vom Pi zum Drucker erreichbar sein

**AMS wird nicht erkannt:**
- Der AMS meldet sich erst wenn ein Druck läuft oder nach dem Einschalten
- Bis zu 60 Sekunden warten nach dem Einschalten

**Kamera zeigt nichts:**
- Die Kamera wird über go2rtc eingebunden (separate Installation nötig)
- Ohne go2rtc: Kamerafeld bleibt leer, alle anderen Funktionen funktionieren

---

---

# 🇬🇧 Installation (English)

## Prerequisites

### Hardware
- **Raspberry Pi 4** (minimum 2 GB RAM recommended)
- MicroSD card (minimum 16 GB)
- Bambu Lab printer on the same WiFi network as the Pi

### Software on the Pi
- Raspberry Pi OS Lite 64-bit (or Desktop)
- Node.js 18 or newer
- Git

### On the Printer: Enable LAN Mode

> ⚠️ **Important:** BambuPi Manager communicates directly with your printer over the local network (MQTT). You need to enable **LAN-Only Mode** on the printer.

**On the printer's touchscreen:**

1. Tap the **Settings icon** (gear wheel) on the printer display
2. Go to **Network** → **LAN-Only Mode**
3. Enable the toggle → the printer will restart
4. After restart: Go to **Settings** → **WiFi**
5. Note the **Access Code** (8-digit code, e.g. `12345678`)

**Finding the Serial Number:**

- Sticker on the back or bottom of the printer
- Or: Touchscreen → **Settings** → **Device Info** → **Serial Number**
- Format: `01S00A123456789` (15 characters)

**Finding the Printer's IP Address:**

- Touchscreen → **Settings** → **WiFi** → IP address is shown there
- Or: Check your router's device list (device name = Bambu Lab printer)

---

## Step 1 — Prepare the Raspberry Pi

Open an SSH connection to your Pi or use the terminal directly:

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Git (if not already installed)
sudo apt install -y git
```

---

## Step 2 — Install BambuPi Manager

### Option A: One-Command Install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/thomasgiehl/-bambupi-manager/main/install.sh | bash
```

The script automatically:
- Installs Node.js (if not present)
- Installs all dependencies
- Sets up the service to auto-start on boot (systemd)

### Option B: Manual Installation

```bash
# Clone the repository
git clone https://github.com/thomasgiehl/-bambupi-manager.git
cd -bambupi-manager

# Install dependencies
npm install

# Create config file
cp .env.example .env
nano .env
```

Adjust the `.env` file:

```env
PORT=3000
ELECTRICITY_COST=0.35    # Electricity price in €/kWh
PRINTER_WATT=350          # Printer power consumption in watts
```

Then set up as a system service:

```bash
# Create service file
sudo nano /etc/systemd/system/bambupi.service
```

Paste the following:

```ini
[Unit]
Description=BambuPi Manager
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/-bambupi-manager
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> ⚠️ Adjust `User` and `WorkingDirectory` to match your actual username and installation path!

```bash
# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable bambupi
sudo systemctl start bambupi
```

---

## Step 3 — Open the Dashboard

Find your Pi's IP address:

```bash
hostname -I
```

Open in a browser on any device on the same network:

```
http://YOUR_PI_IP:3000
```

Example: `http://192.168.178.50:3000`

---

## Step 4 — Add Your Printer

1. Click **Drucker** (Printers) in the left navigation
2. Click **+ Drucker hinzufügen** (Add Printer)
3. Fill in the form:

| Field | Example | Description |
|---|---|---|
| **Name** | `My X1C` | Any display name you like |
| **Modell** | `X1C` | Your printer model |
| **IP-Adresse** | `192.168.178.46` | Printer's IP on your network |
| **Access Code** | `12345678` | 8-digit code from the printer display |
| **Seriennummer** | `01S00A123456789` | Sticker on the printer |

4. Click **Speichern** (Save)
5. The dashboard switches and shows your printer live ✅

---

## Useful Commands

```bash
# Check service status
sudo systemctl status bambupi

# Watch live logs
sudo journalctl -u bambupi -f

# Restart the service
sudo systemctl restart bambupi

# Update to latest version
cd ~/bambupi-manager && git pull && sudo systemctl restart bambupi
```

---

## Troubleshooting

**Dashboard won't load:**
- Check if the service is running: `sudo systemctl status bambupi`
- Check if port 3000 is reachable: `curl http://localhost:3000`

**Printer shows "offline":**
- Is LAN-Only Mode enabled on the printer?
- Are the Pi and printer on the same WiFi network?
- Is the IP address correct? (can change after router reboot → static IP recommended)
- Is the Access Code correct? (check on printer under Settings → WiFi)
- Firewall check: port 8883 (MQTT) must be reachable from Pi to printer

**AMS not detected:**
- The AMS only reports after a print starts or after power-on
- Wait up to 60 seconds after turning on

**Camera not showing:**
- The camera is integrated via go2rtc (separate installation required)
- Without go2rtc: camera area stays empty, all other features work fine

---

## 📁 Project Structure

```
bambupi-manager/
├── public/
│   └── index.html     # Frontend (all UI + JS inline)
├── db/                # SQLite database (auto-created)
├── uploads/           # Uploaded print files
├── docs/              # Masterplan + wireframes
├── server.js          # Express + MQTT backend
├── install.sh         # One-command installer
└── .env               # Your config (not in git)
```

---

## 🤝 Contributing

Pull requests are welcome! Please open an issue first for major changes.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📜 License

MIT License — free to use, modify and share.

---

## 🙏 Credits

- Inspired by [Mainsail](https://mainsail.xyz) and [Fluidd](https://fluidd.xyz)
- MQTT protocol documented by the community at [OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI)
- Built with ❤️ for the Bambu Lab community
