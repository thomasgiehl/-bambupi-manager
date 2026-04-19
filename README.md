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
| 🔔 Benachrichtigungen | Browser-Push + Temperatur-Alarm / Browser push + temperature alarm |
| 📟 Event-Log | Live-Ereignisprotokoll / Live event log (last 50 events) |
| 🎨 AMS | RFID-Erkennung + manuelle Zuweisung / RFID detection + manual slot assignment |
| 🧵 Filament-DB | Spulen, Restmenge, Warn-Badge, Bambu Studio Import / Spools, low-warning, BS import |
| 📁 Dateimanager | Upload, Drag & Drop, FTP, SD-Karte / Upload, drag & drop, FTP, SD card |
| 📊 Auto-Kostenanalyse | .3mf-Metadaten → Kosten-Preview (Opt-in) / .3mf metadata → cost preview |
| 💰 Kostenrechner | Filament + Strom + Maschine + Fehldruck + Marge / Full cost breakdown + margin |
| 📜 Druckhistorie | Log + CSV-Export / Print log + CSV export |
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
- ffmpeg für Kamera-Streaming (MJPEG, ~200–500 ms Latenz)
- Bambu CA-Zertifikat für sichere MQTT/FTP-Verbindungen
- Startet den Dienst automatisch beim Systemstart (systemd)

### Option B: Manuelle Installation

```bash
# Repository klonen
git clone https://github.com/thomasgiehl/-bambupi-manager.git
cd bambupi-manager

# Abhängigkeiten installieren
npm install --production

# Konfigurationsdatei anlegen
cp .env.example .env
nano .env
```

Inhalt der `.env` anpassen:

```env
PORT=3000
ELECTRICITY_COST=0.35     # Strompreis in €/kWh
PRINTER_WATT=350           # Verbrauch des Druckers in Watt

# Sicherheit — werden beim ersten Start automatisch generiert falls leer:
ADMIN_USER=admin
ADMIN_PASS=
ENCRYPTION_KEY=
```

Dann als Systemdienst einrichten:

```bash
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
WorkingDirectory=/home/pi/bambupi-manager
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> ⚠️ Passe `User` und `WorkingDirectory` an deinen tatsächlichen Benutzernamen und Installationspfad an!

```bash
sudo systemctl daemon-reload
sudo systemctl enable bambupi
sudo systemctl start bambupi
```

---

## Schritt 3 — Erster Login

Beim ersten Start generiert BambuPi Manager automatisch ein sicheres Passwort und gibt es in der Konsole aus:

```
┌─────────────────────────────────────────────┐
│  ⚠️  Neue Admin-Zugangsdaten generiert:       │
│  User: admin                                 │
│  Pass: a60c6c299988cb6556a4375492cfa784      │
│  → werden in .env gespeichert               │
└─────────────────────────────────────────────┘
```

Das Passwort wird automatisch in der `.env` gespeichert. Beim nächsten Start wird es von dort gelesen.

**Logs ansehen (um Passwort zu finden falls verpasst):**

```bash
sudo journalctl -u bambupi --since today | grep "Pass:"
# oder direkt in .env nachsehen:
grep ADMIN_PASS ~/bambupi-manager/.env
```

Öffne im Browser auf einem Gerät im selben WLAN:

```
http://DEINE_PI_IP:3000
```

Beispiel: `http://192.168.178.50:3000`

Der Browser fragt nach Benutzername und Passwort — gib die generierten Credentials ein.

**Eigenes Passwort setzen:**

```bash
nano ~/bambupi-manager/.env
# ADMIN_PASS=MeinSicheresPasswort eintragen
sudo systemctl restart bambupi
```

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

> 🔐 Der Access Code wird **verschlüsselt** in der Datenbank gespeichert (AES-256-GCM) und niemals über die API zurückgegeben.

---

## Updates installieren

Updates werden **ausschließlich per SSH** eingespielt — kein Update-Button im Browser:

```bash
cd ~/bambupi-manager
git pull
npm install --production
sudo systemctl restart bambupi
```

Das Dashboard zeigt weiterhin an, ob neue Commits verfügbar sind (🔔-Badge im Seitenmenü).

---

## Nützliche Befehle

```bash
# Status prüfen
sudo systemctl status bambupi

# Live-Logs anschauen (mit Pino strukturiert)
sudo journalctl -u bambupi -f

# Neustart
sudo systemctl restart bambupi

# Zugangsdaten anzeigen
grep -E "ADMIN_USER|ADMIN_PASS" ~/bambupi-manager/.env
```

---

## Fehlerbehebung

**Dashboard lädt nicht / Passwort-Dialog erscheint nicht:**
- Prüfe ob der Dienst läuft: `sudo systemctl status bambupi`
- Prüfe ob Port 3000 erreichbar ist: `curl http://localhost:3000`

**Passwort vergessen:**
```bash
grep ADMIN_PASS ~/bambupi-manager/.env
```
Oder neues Passwort setzen: `ADMIN_PASS=NeuesPasswort` in `.env`, dann Dienst neu starten.

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
- Die Kamera läuft über einen persistenten ffmpeg MJPEG-Stream (`/api/stream/mjpeg`)
- Sicherstellen dass `ffmpeg` installiert ist: `sudo apt install -y ffmpeg`
- Latenz ca. 200–500 ms — kein go2rtc oder WebRTC nötig

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
- Installs ffmpeg for low-latency MJPEG camera streaming (~200–500 ms)
- Installs the Bambu CA certificate for verified MQTT/FTP connections
- Sets up the service to auto-start on boot (systemd)

### Option B: Manual Installation

```bash
# Clone the repository
git clone https://github.com/thomasgiehl/-bambupi-manager.git
cd bambupi-manager

# Install dependencies
npm install --production

# Create config file
cp .env.example .env
nano .env
```

Adjust the `.env` file:

```env
PORT=3000
ELECTRICITY_COST=0.35     # Electricity price in €/kWh
PRINTER_WATT=350           # Printer power consumption in watts

# Security — auto-generated on first start if left empty:
ADMIN_USER=admin
ADMIN_PASS=
ENCRYPTION_KEY=
```

Then set up as a system service:

```bash
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
WorkingDirectory=/home/pi/bambupi-manager
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> ⚠️ Adjust `User` and `WorkingDirectory` to match your actual username and installation path!

```bash
sudo systemctl daemon-reload
sudo systemctl enable bambupi
sudo systemctl start bambupi
```

---

## Step 3 — First Login

On first start, BambuPi Manager automatically generates a secure password and prints it to the console:

```
┌─────────────────────────────────────────────┐
│  ⚠️  Neue Admin-Zugangsdaten generiert:       │
│  User: admin                                 │
│  Pass: a60c6c299988cb6556a4375492cfa784      │
│  → werden in .env gespeichert               │
└─────────────────────────────────────────────┘
```

The password is automatically saved to `.env`. On subsequent starts it is read from there.

**View logs to find the password if you missed it:**

```bash
sudo journalctl -u bambupi --since today | grep "Pass:"
# or check .env directly:
grep ADMIN_PASS ~/bambupi-manager/.env
```

Open in a browser on any device on the same network:

```
http://YOUR_PI_IP:3000
```

Example: `http://192.168.178.50:3000`

Your browser will prompt for username and password — enter the generated credentials.

**Set your own password:**

```bash
nano ~/bambupi-manager/.env
# Set ADMIN_PASS=MySecurePassword
sudo systemctl restart bambupi
```

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

> 🔐 The Access Code is **encrypted** in the database (AES-256-GCM) and is never returned by the API.

---

## Installing Updates

Updates are applied **exclusively via SSH** — there is no update button in the browser:

```bash
cd ~/bambupi-manager
git pull
npm install --production
sudo systemctl restart bambupi
```

The dashboard still shows whether new commits are available (🔔 badge in the sidebar).

---

## Useful Commands

```bash
# Check service status
sudo systemctl status bambupi

# Watch live logs (structured via Pino)
sudo journalctl -u bambupi -f

# Restart the service
sudo systemctl restart bambupi

# Show login credentials
grep -E "ADMIN_USER|ADMIN_PASS" ~/bambupi-manager/.env
```

---

## Troubleshooting

**Dashboard won't load / no password prompt:**
- Check if the service is running: `sudo systemctl status bambupi`
- Check if port 3000 is reachable: `curl http://localhost:3000`

**Forgot password:**
```bash
grep ADMIN_PASS ~/bambupi-manager/.env
```
Or set a new password: put `ADMIN_PASS=NewPassword` in `.env`, then restart the service.

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
- The camera uses a persistent ffmpeg MJPEG stream (`/api/stream/mjpeg`)
- Make sure ffmpeg is installed: `sudo apt install -y ffmpeg`
- Latency ~200–500 ms — no go2rtc or WebRTC required

---

---

# 🔒 Sicherheit / Security

## 🇩🇪 Deutsch

BambuPi Manager ist für den Betrieb im Heimnetz konzipiert und enthält mehrere Schutzmaßnahmen für den Einsatz in gemischten Netzwerken (Gäste-WLAN, Smart-TVs, IoT-Geräte).

### Übersicht aller Sicherheitsmaßnahmen

| Maßnahme | Details |
|---|---|
| 🔑 **Basic Auth** | Alle Routen geschützt — Credentials aus `.env`, beim ersten Start automatisch generiert |
| 🔐 **AES-256-GCM Verschlüsselung** | Access Codes verschlüsselt in SQLite gespeichert, Entschlüsselung nur intern bei MQTT/FTP |
| 🌐 **CORS deaktiviert** | `origin: false` — Browser blockiert alle cross-origin Requests |
| 🛡️ **DNS-Rebinding-Schutz** | Host-Header-Whitelist: nur eigene LAN-IPs und localhost erlaubt |
| 📁 **Path-Traversal-Schutz** | Alle Dateinamen durch `validateFilename()`: Basename + Regex-Whitelist + realpath-Check |
| 🚦 **Rate-Limiting** | Global 100 req/min/IP; Upload/gcode/Update-Endpoints: 10 req/min/IP |
| 📤 **Upload-Limits** | Max. 500 MB, nur `.3mf`, `.gcode`, `.stl` — alle anderen Extensions abgelehnt |
| 🔒 **TLS-Verifikation** | MQTT und FTP mit `rejectUnauthorized: true` + Bambu CA-Zertifikat + CN-Prüfung |
| 🗄️ **SQLite-Hardening** | Dateiberechtigungen 0600, WAL-Mode, Foreign Keys erzwungen |
| 🚫 **Kein Remote-Update** | `/api/update/apply` entfernt — Updates nur per SSH |
| 🔏 **Security-Header** | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` |
| 📝 **Generische Fehler** | Interne Details nur ins Log (Pino), nie an den Client |

### Zugangsdaten verwalten

```bash
# Aktuelles Passwort anzeigen
grep ADMIN_PASS ~/bambupi-manager/.env

# Eigenes Passwort setzen
nano ~/bambupi-manager/.env
# → ADMIN_PASS=MeinSicheresPasswort
sudo systemctl restart bambupi
```

### Updates installieren

```bash
cd ~/bambupi-manager
git pull
npm install --production
sudo systemctl restart bambupi
```

### Empfehlung für gemischte Netzwerke: Nginx + TLS

Für maximale Sicherheit (z.B. wenn Gäste-Geräte im selben WLAN sind) empfehlen wir Nginx als Reverse-Proxy mit TLS vorschalten:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

```nginx
# /etc/nginx/sites-available/bambupi
server {
    listen 443 ssl;
    server_name bambupi.local;

    ssl_certificate     /etc/letsencrypt/live/bambupi.local/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bambupi.local/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}

server {
    listen 80;
    server_name bambupi.local;
    return 301 https://$host$request_uri;
}
```

### Was BambuPi Manager **nicht** schützt

- **Physischen Zugriff** auf den Raspberry Pi
- **Netzwerksegmentierung** — das ist Aufgabe deines Routers/Switches
- **Drucker-Firmware** — der Drucker selbst hat keine Authentifizierung im LAN-Modus

---

## 🇬🇧 English

BambuPi Manager is designed for home network use and includes several layers of protection for mixed networks (guest WiFi, smart TVs, IoT devices).

### Security Measures Overview

| Measure | Details |
|---|---|
| 🔑 **Basic Auth** | All routes protected — credentials from `.env`, auto-generated on first start |
| 🔐 **AES-256-GCM Encryption** | Access Codes encrypted at rest in SQLite, decrypted only internally for MQTT/FTP |
| 🌐 **CORS disabled** | `origin: false` — browser blocks all cross-origin requests |
| 🛡️ **DNS-Rebinding protection** | Host header whitelist: only your own LAN IPs and localhost allowed |
| 📁 **Path-Traversal protection** | All filenames validated: basename + regex whitelist + realpath check |
| 🚦 **Rate limiting** | Global 100 req/min/IP; upload/gcode/update endpoints: 10 req/min/IP |
| 📤 **Upload limits** | Max 500 MB, only `.3mf`, `.gcode`, `.stl` — all other extensions rejected with 415 |
| 🔒 **TLS verification** | MQTT and FTP with `rejectUnauthorized: true` + Bambu CA cert + CN validation |
| 🗄️ **SQLite hardening** | File permissions 0600, WAL mode, foreign keys enforced |
| 🚫 **No remote updates** | `/api/update/apply` removed — updates via SSH only |
| 🔏 **Security headers** | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` |
| 📝 **Generic error messages** | Internal details logged only (Pino), never sent to the client |

### Managing Credentials

```bash
# Show current password
grep ADMIN_PASS ~/bambupi-manager/.env

# Set your own password
nano ~/bambupi-manager/.env
# → ADMIN_PASS=MySecurePassword
sudo systemctl restart bambupi
```

### Installing Updates

```bash
cd ~/bambupi-manager
git pull
npm install --production
sudo systemctl restart bambupi
```

### Recommended for Mixed Networks: Nginx + TLS

For maximum security (e.g. if guest devices share your WiFi) we recommend adding Nginx as a reverse proxy with TLS:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

```nginx
# /etc/nginx/sites-available/bambupi
server {
    listen 443 ssl;
    server_name bambupi.local;

    ssl_certificate     /etc/letsencrypt/live/bambupi.local/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bambupi.local/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}

server {
    listen 80;
    server_name bambupi.local;
    return 301 https://$host$request_uri;
}
```

### What BambuPi Manager does **not** protect against

- **Physical access** to the Raspberry Pi
- **Network segmentation** — that is your router/switch's responsibility
- **Printer firmware** — the printer itself has no authentication in LAN mode

---

## 📁 Projektstruktur / Project Structure

```
bambupi-manager/
├── public/
│   └── index.html        # Frontend (UI + JS)
├── certs/
│   └── bambu-ca.crt      # Bambu Lab CA certificate (TLS verification)
├── db/                   # SQLite database (auto-created, 0600 permissions)
├── uploads/              # Uploaded print files (.3mf, .gcode, .stl)
├── scripts/
│   └── (leer / empty)
├── docs/                 # Feature docs + wireframes
├── server.js             # Express + MQTT + security backend
├── install.sh            # One-command installer with integrity checks
├── .env                  # Your config + secrets (not in git)
└── .env.example          # Template with all available options
```

> **Hinweis / Note:** Die Kamera nutzt einen eingebauten MJPEG-Stream via ffmpeg — kein externer Streaming-Server nötig. / The camera uses a built-in MJPEG stream via ffmpeg — no external streaming server required.

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
