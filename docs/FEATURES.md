# BambuPi Manager — Feature-Übersicht / Feature Overview

**[🇩🇪 Deutsch](#-funktionsübersicht-deutsch) | [🇬🇧 English](#-feature-overview-english)**

---

# 🇩🇪 Funktionsübersicht (Deutsch)

> Alle Funktionen die bisher in BambuPi Manager implementiert wurden.

---

## 📊 Dashboard & Echtzeit

### Live-Dashboard
Alle Drucker auf einem Blick — Temperaturen, Fortschritt, Status, Kamera — alles in Echtzeit ohne Neuladen der Seite.

| Detail | Beschreibung |
|---|---|
| **Technologie** | Server-Sent Events (SSE) — Push vom Server, kein Polling |
| **Fallback** | Automatisches Polling falls SSE abbricht |
| **Verbindungsanzeige** | Grüner Punkt = Live / Oranger Punkt = Polling |
| **Drucker-Karte** | Status-Badge, Temperaturen mit Pfeilen, Fortschrittsbalken, Kamera (MJPEG, ~200–500 ms) |

![Dashboard](screenshots/dashboard.png)

---

### Temperatur-Anzeige
Nozzle- und Betttemperatur mit farbigen Pfeilen (↑ steigt, ↓ sinkt, ✓ erreicht) und Live-Diagramm.

- **Optimistic UI** — Zieltemperatur erscheint sofort beim Klicken, kein Warten auf Server
- **Chart** — letzten 600 Messpunkte (server-seitig gespeichert, bleibt nach Neuladen erhalten)
- **Temperaturverlauf** wird beim Start aus dem Server-Ringpuffer geladen

---

### Temperatur-Alarm
Wenn die Düse heißer als 50°C ist aber kein Druck läuft, erscheint nach 5 Minuten eine Browser-Benachrichtigung.

---

### In-App Event-Log
Zeigt die letzten 50 Ereignisse (Druck gestartet, fertig, fehlgeschlagen, pausiert, offline) mit Zeitstempel.

![Event Log](screenshots/event-log.png)

---

## 🎛️ Druckersteuerung

### Druck-Steuerung
Direkte Befehle an den Drucker ohne Bambu Studio oder Cloud.

| Funktion | Beschreibung |
|---|---|
| ▶️ Fortsetzen | Pausierten Druck weiterlaufen lassen |
| ⏸️ Pausieren | Druck anhalten |
| ⏹️ Stopp | Druck abbrechen |

---

### Temperatur setzen
Direkteingabe für Nozzle- und Betttemperatur mit sofortiger Anzeige (optimistic UI).

---

### Cooldown
Ein Klick kühlt Nozzle, Bett oder beides auf 0°C herunter — mit sofortiger Anzeige.

---

### Vorheiz-Profile
Vier Schnell-Vorheiz-Buttons mit angezeigten Temperaturen:

| Material | Nozzle | Bett |
|---|---|---|
| PLA | 220°C | 60°C |
| PETG | 250°C | 70°C |
| ABS | 270°C | 100°C |
| TPU | 230°C | 40°C |

![Preheat Buttons](screenshots/preheat.png)

---

### Geschwindigkeits-Presets
Schnelle Umschaltung zwischen Leise / Normal / Sport / Turbo.

---

### Lüfter & Licht
Lüfter-Schieberegler (Part-Lüfter und Aux-Lüfter) sowie Druckraum-Beleuchtung direkt im Dashboard.

---

### Flow Rate
Extrusions-Schieberegler (50–150%) sendet `M221`-Befehl direkt an den Drucker.

---

## 🎨 AMS (Automatic Material System)

- **RFID-Erkennung** — Bambu-Filamente werden automatisch erkannt und angezeigt
- **Manuelle Zuweisung** — Drittanbieter-Filamente können AMS-Slots zugewiesen werden
- **AMS-Visualisierung** — Farbige Darstellung aller Slots mit Füllstand

![AMS](screenshots/ams.png)

---

## 🧵 Filament-Verwaltung

### Filament-Datenbank
Vollständige Spulen-Verwaltung mit:

| Feld | Beschreibung |
|---|---|
| Hersteller, Farbe, Material | Grunddaten |
| Restmenge (g) | Automatisch abgezogen nach jedem Druck |
| Preis/kg | Für Kostenkalkulation |
| Temperaturen | Nozzle, Bett, Trocknung |
| Lagerort, Notizen | Freitext |

### Filament-Restmenge-Warnung
Wenn eine Spule unter 20% Restmenge fällt:
- 🔴 Rotes Badge im Sidebar-Menü zeigt Anzahl leerer Spulen
- ⚠️ Rote Warn-Box direkt auf der Filament-Karte
- Toast beim Dashboard-Start

![Filament Warning](screenshots/filament-warning.png)

### Bambu Studio Import
Filament-Presets direkt aus der Bambu Studio Datenbank importieren — mit Suchfunktion nach Hersteller und Material.

---

## 💰 Kostenrechner

Vollständiger Druckkostenrechner mit mehreren Kostenpositionen:

| Kostenposition | Formel |
|---|---|
| 🧵 Filament | (Gramm + Purge) × Preis/kg ÷ 1000 |
| ⚡ Strom | Stunden × Watt × Strompreis/kWh |
| 🖨️ Maschine | Stunden × (Kaufpreis ÷ Lebensdauer) |
| ⚠️ Fehldruck-Puffer | Basiskosten × Fehldruck-% |
| 🔧 Nachbearbeitung | Minuten × Stundensatz |
| 🏷️ Verkaufspreis | Gesamtkosten × (1 + Marge%) |

- **Purge/Spülturm-Feld** — extra Gramm für AMS Multi-Color-Drucke
- **Fehldruck-Schieberegler** — 0–30% Sicherheitspuffer
- **Kostenverteilungs-Balken** — farbige Aufschlüsselung in % pro Kategorie
- **Marge-Schieberegler** — zeigt Verkaufspreis für Etsy/eBay-Verkäufer

![Cost Calculator](screenshots/calculator.png)

---

## 📁 Dateimanager

### Upload
- Drag & Drop oder Klicken — `.3mf` und `.gcode` Dateien
- Datei wird auf dem Pi gespeichert und kann später zum Drucker übertragen werden

### Automatische Kostenberechnung beim Upload *(Opt-in)*
Toggle im Dateimanager aktiviert die automatische Analyse:

1. `.3mf` wird hochgeladen
2. Server liest `Metadata/slice_info.config` aus dem ZIP
3. Extrahiert: **Gewicht (g)**, **Druckzeit (Sekunden)**, Filamenttyp, Farbe, Multi-Color-Erkennung
4. Zeigt Kosten-Preview direkt unter der hochgeladenen Datei
5. **"Im Rechner öffnen"** füllt den Kostenrechner mit allen Werten vor

![File Upload with Cost Preview](screenshots/upload-cost-preview.png)

### Drucker-Dateimanager (SD-Karte)
Dateien direkt auf dem Drucker anzeigen und starten.

### Pi-Speicher
Bereits hochgeladene Dateien verwalten und zum Drucker übertragen.

---

## 📜 Druckhistorie

- Alle abgeschlossenen Drucke mit Datum, Dauer, Gramm, Kosten
- Filament-Verbrauch wird automatisch von der Spule abgezogen
- **CSV-Export** — als Excel-kompatible Datei herunterladen

![Print History](screenshots/history.png)

---

## 🔔 Benachrichtigungen

- **Browser-Benachrichtigungen** — bei Druck fertig oder fehlgeschlagen
- **Temperatur-Alarm** — Düse >50°C ohne aktiven Druck (nach 5 min)
- **Filament-Warnung** — Toast beim Dashboard-Start wenn Spulen leer

---

## 📱 Mobiles Layout

- **Responsive Design** — funktioniert auf Smartphone und Tablet
- **Bottom-Navigation** — Schnellzugriff auf alle Seiten
- **Hamburger-Menü** — Sidebar auf kleinen Bildschirmen ausklappbar
- **Swipe-Geste** — Sidebar zuziehen durch Wischen

---

## ⛶ Kiosk-Modus

Vollbild-Ansicht ohne Sidebar und Bottom-Navigation — ideal für ein Tablet an der Wand neben dem Drucker. Ein Klick auf den ⛶-Button in der Topbar aktiviert/deaktiviert den Modus.

---

## 📲 Progressive Web App (PWA)

BambuPi Manager kann als App auf dem Homescreen installiert werden:
- **Android**: Browser-Menü → "Zum Startbildschirm hinzufügen"
- **iOS**: Safari → Teilen → "Zum Home-Bildschirm"
- Startet dann ohne Browser-Adressleiste (standalone)

---

## 🔄 Update-System

Updates direkt aus der App heraus einspielen — kein SSH nötig.

**Einstellungen → Software-Update:**
1. **🔍 Prüfen** — vergleicht mit GitHub, zeigt Liste neuer Commits
2. **⬇️ Update installieren** — `git pull` + `npm install`
3. Server startet automatisch neu (systemd), Seite lädt nach 8s neu
4. Rotes Badge im Menü wenn Update verfügbar

---

## ⚙️ Einstellungen

| Einstellung | Beschreibung |
|---|---|
| Strompreis (€/kWh) | Für Kostenrechner |
| Drucker-Verbrauch (W) | Für Kostenrechner |
| Kaufpreis + Lebensdauer | Maschinenkosten-Berechnung (zeigt ct/h) |
| Fehldruck-Standard (%) | Vorbelegung im Kostenrechner |
| Auto-Kostenberechnung | Opt-in für .3mf-Analyse beim Upload |
| UI neu laden | Nur Browser-Reload |
| Server neu starten | Neustart des Node.js-Dienstes (kein SSH nötig) |

---

## 🖥️ Multi-Drucker

Beliebig viele Bambu Lab Drucker gleichzeitig verwalten — jeder mit eigener Karte, eigener MQTT-Verbindung und eigenem Temperatur-Chart.

---

---

# 🇬🇧 Feature Overview (English)

> All features currently implemented in BambuPi Manager.

---

## 📊 Dashboard & Real-Time

### Live Dashboard
All printers at a glance — temperatures, progress, status, camera — all in real-time without page reloads.

| Detail | Description |
|---|---|
| **Technology** | Server-Sent Events (SSE) — server push, no polling |
| **Fallback** | Automatic polling if SSE drops |
| **Connection indicator** | Green dot = Live / Orange dot = Polling |
| **Printer card** | Status badge, temperatures with arrows, progress bar, camera (MJPEG, ~200–500 ms) |

![Dashboard](screenshots/dashboard.png)

---

### Temperature Display
Nozzle and bed temperature with colored arrows (↑ rising, ↓ falling, ✓ reached) and live chart.

- **Optimistic UI** — target temp appears instantly on click, no waiting for server
- **Chart** — last 600 data points (stored server-side, survives page reload)
- **History** loaded from server ring buffer on startup

---

### Temperature Alarm
If the nozzle is above 50°C but no print is running, a browser notification appears after 5 minutes.

---

### In-App Event Log
Shows the last 50 events (print started, finished, failed, paused, offline) with timestamps.

![Event Log](screenshots/event-log.png)

---

## 🎛️ Printer Control

### Print Control
Direct commands to the printer without Bambu Studio or cloud.

| Function | Description |
|---|---|
| ▶️ Resume | Continue a paused print |
| ⏸️ Pause | Pause the current print |
| ⏹️ Stop | Cancel the print |

---

### Set Temperature
Direct input for nozzle and bed temperature with instant display (optimistic UI).

---

### Cooldown
One click cools nozzle, bed, or both to 0°C — with instant display update.

---

### Preheat Profiles
Four quick-preheat buttons with displayed temperatures:

| Material | Nozzle | Bed |
|---|---|---|
| PLA | 220°C | 60°C |
| PETG | 250°C | 70°C |
| ABS | 270°C | 100°C |
| TPU | 230°C | 40°C |

![Preheat Buttons](screenshots/preheat.png)

---

### Speed Presets
Quick switching between Silent / Normal / Sport / Turbo.

---

### Fan & Light
Part fan and aux fan sliders, plus enclosure lighting control — all directly in the dashboard.

---

### Flow Rate
Extrusion rate slider (50–150%) sends `M221` command directly to the printer.

---

## 🎨 AMS (Automatic Material System)

- **RFID detection** — Bambu filaments automatically detected and displayed
- **Manual assignment** — third-party filaments can be assigned to AMS slots
- **AMS visualization** — colored display of all slots with fill level

![AMS](screenshots/ams.png)

---

## 🧵 Filament Management

### Filament Database
Full spool management with:

| Field | Description |
|---|---|
| Brand, color, material | Basic info |
| Remaining weight (g) | Auto-deducted after each print |
| Price per kg | For cost calculation |
| Temperatures | Nozzle, bed, drying |
| Storage location, notes | Free text |

### Low Filament Warning
When a spool drops below 20% remaining:
- 🔴 Red badge in the sidebar shows count of low spools
- ⚠️ Red warning box on the filament card
- Toast notification on dashboard startup

![Filament Warning](screenshots/filament-warning.png)

### Bambu Studio Import
Import filament presets directly from the Bambu Studio database — with search by brand and material.

---

## 💰 Cost Calculator

Full print cost calculator with multiple cost components:

| Cost Component | Formula |
|---|---|
| 🧵 Filament | (grams + purge) × price/kg ÷ 1000 |
| ⚡ Electricity | hours × watts × electricity price/kWh |
| 🖨️ Machine | hours × (purchase price ÷ lifetime hours) |
| ⚠️ Failure buffer | base cost × failure rate % |
| 🔧 Post-processing | minutes × hourly rate |
| 🏷️ Selling price | total cost × (1 + margin %) |

- **Purge/waste field** — extra grams for AMS multi-color prints
- **Failure rate slider** — 0–30% safety buffer
- **Cost breakdown bar** — colored split showing % per category
- **Margin slider** — shows selling price for Etsy/eBay sellers

![Cost Calculator](screenshots/calculator.png)

---

## 📁 File Manager

### Upload
- Drag & Drop or click — `.3mf` and `.gcode` files
- File is stored on the Pi and can be transferred to the printer later

### Automatic Cost Calculation on Upload *(Opt-in)*
Toggle in the file manager enables automatic analysis:

1. `.3mf` is uploaded
2. Server reads `Metadata/slice_info.config` from the ZIP archive
3. Extracts: **weight (g)**, **print time (seconds)**, filament type, color, multi-color detection
4. Shows cost preview directly below the uploaded file
5. **"Open in Calculator"** pre-fills all fields in the cost calculator

![File Upload with Cost Preview](screenshots/upload-cost-preview.png)

### Printer File Manager (SD Card)
Browse and start files directly on the printer.

### Pi Storage
Manage previously uploaded files and transfer them to the printer.

---

## 📜 Print History

- All completed prints with date, duration, grams, costs
- Filament usage is automatically deducted from the spool
- **CSV Export** — download as Excel-compatible file

![Print History](screenshots/history.png)

---

## 🔔 Notifications

- **Browser notifications** — when print finishes or fails
- **Temperature alarm** — nozzle >50°C without active print (after 5 min)
- **Filament warning** — toast on dashboard startup when spools are low

---

## 📱 Mobile Layout

- **Responsive design** — works on smartphone and tablet
- **Bottom navigation** — quick access to all pages
- **Hamburger menu** — collapsible sidebar on small screens
- **Swipe gesture** — close sidebar by swiping

---

## ⛶ Kiosk Mode

Fullscreen view without sidebar and bottom navigation — ideal for a tablet mounted next to the printer. Click the ⛶ button in the topbar to toggle.

---

## 📲 Progressive Web App (PWA)

BambuPi Manager can be installed as an app on your home screen:
- **Android**: Browser menu → "Add to Home Screen"
- **iOS**: Safari → Share → "Add to Home Screen"
- Launches without browser address bar (standalone mode)

---

## 🔄 Update System

Apply updates directly from within the app — no SSH required.

**Settings → Software Update:**
1. **🔍 Check** — compares with GitHub, shows list of new commits
2. **⬇️ Install Update** — `git pull` + `npm install`
3. Server restarts automatically (systemd), page reloads after 8 seconds
4. Red badge in menu when update is available

---

## ⚙️ Settings

| Setting | Description |
|---|---|
| Electricity price (€/kWh) | For cost calculator |
| Printer consumption (W) | For cost calculator |
| Purchase price + lifetime | Machine depreciation (shows ct/h) |
| Default failure rate (%) | Pre-fill for cost calculator |
| Auto cost calculation | Opt-in for .3mf analysis on upload |
| Reload UI | Browser-only reload |
| Restart server | Restart the Node.js service (no SSH needed) |

---

## 🖥️ Multi-Printer

Manage any number of Bambu Lab printers simultaneously — each with its own card, its own MQTT connection, and its own temperature chart.

---

## ⏳ Druck-Warteschlange (Phase 2)

Jobs können nun in eine Warteschlange gestellt werden. Der Server startet den nächsten Druck automatisch, sobald der Drucker bereit ist und das Druckbett als leer markiert wurde.

- **Automatischer Start** — Sobald der Drucker `IDLE` ist und das Bett manuell freigegeben wurde.
- **Bett-Status-Management** — Ein Klick in der Warteschlange markiert das Bett als frei.
- **Druckoptionen** — Jedes Element in der Queue behält seine spezifischen Einstellungen (Bett-Leveling, AMS etc.).

---

## 🛠️ Wartungs-Manager (Phase 2)

Professionelles Tracking von Verschleißteilen basierend auf den echten Druckstunden.

- **Echtzeit-Tracking** — Der Server zählt die Minuten zwischen Druckstart und Ende.
- **Wartungs-Aufgaben** — Standard-Aufgaben wie Achsen schmieren, Carbon-Stangen reinigen etc.
- **Intervall-Visualisierung** — Fortschrittsbalken zeigen an, wie bald die nächste Wartung fällig ist.
- **Wartungs-Historie** — "Erledigt"-Button setzt den Zähler für die jeweilige Aufgabe zurück.

---

## 👁️ 3D G-Code Vorschau (Phase 3)

Betrachte deine G-Code und .3mf Dateien direkt im Browser in 3D.

- **In-Browser Rendering** — Schnelle 3D-Vorschau ohne externe Software.
- **.3mf Unterstützung** — Automatisches Extrahieren des G-Codes aus Bambu Studio Projektdateien.
- **Layer-Analyse** — Sieh dir den Pfad Schicht für Schicht an.

---

## 📈 Erweiterte Statistiken (Phase 3)

Detaillierte Analyse deiner Druckfarm-Auslastung.

- **Drucker-Auslastung** — Donut-Chart zeigt, welcher Drucker am meisten arbeitet.
- **Material-Verbrauch** — Balkendiagramm schlüsselt den Verbrauch nach Materialtyp (PLA, PETG etc.) auf.
- **Gesamtdaten** — Gesamtgewicht, Gesamtstunden und Anzahl der Drucke auf einen Blick.

---

## 🤖 KI-Spaghetti-Detection (Phase 3 - BETA)

Experimentelle Fehldruck-Erkennung durch Analyse des Kamerastreams.

- **Stream-Analyse** — Prüft periodisch den MJPEG-Stream auf Unregelmäßigkeiten.
- **Automatischer Stopp** — Kann bei Erkennung den Druck pausieren (Einstellbar).

---

## ⏳ Print Queue (Phase 2)

Jobs can now be queued. The server automatically starts the next print as soon as the printer is ready and the bed is marked as clear.

- **Automatic Start** — As soon as the printer is `IDLE` and the bed has been manually cleared.
- **Bed Status Management** — One click in the queue marks the bed as free.
- **Print Options** — Each item in the queue retains its specific settings (bed leveling, AMS etc.).

---

## 🛠️ Maintenance Manager (Phase 2)

Professional tracking of wear parts based on actual print hours.

- **Real-Time Tracking** — The server counts the minutes between print start and end.
- **Maintenance Tasks** — Standard tasks like lubricating axes, cleaning carbon rods etc.
- **Interval Visualization** — Progress bars show how soon the next maintenance is due.
- **Maintenance History** — "Done" button resets the counter for the respective task.

---

## 👁️ 3D G-Code Preview (Phase 3)

View your G-Code and .3mf files directly in 3D in your browser.

- **In-Browser Rendering** — Fast 3D preview without external software.
- **.3mf Support** — Automatic extraction of G-Code from Bambu Studio project files.
- **Layer Analysis** — View the path layer by layer.

---

## 📈 Advanced Statistics (Phase 3)

Detailed analysis of your print farm utilization.

- **Printer Utilization** — Donut chart shows which printer is working the most.
- **Material Consumption** — Bar chart breaks down consumption by material type (PLA, PETG etc.).
- **Total Data** — Total weight, total hours, and number of prints at a glance.

---

## 🤖 AI Spaghetti Detection (Phase 3 - BETA)

Experimental failure detection by analyzing the camera stream.

- **Stream Analysis** — Periodically checks the MJPEG stream for irregularities.
- **Automatic Stop** — Can pause the print when a failure is detected (configurable).

---

## 📸 Screenshots hinzufügen / Adding Screenshots

Screenshots können durch folgende Schritte hinzugefügt werden:

1. Dashboard im Browser öffnen (`http://PI-IP:3000`)
2. Screenshot mit dem Browser machen (F12 → ... → Screenshot)
3. Datei unter `docs/screenshots/` speichern mit dem korrekten Namen:

| Dateiname | Inhalt |
|---|---|
| `dashboard.png` | Haupt-Dashboard mit Drucker-Karte |
| `event-log.png` | Event-Log Panel |
| `preheat.png` | Vorheiz-Buttons im Dashboard |
| `ams.png` | AMS-Visualisierung |
| `filament-warning.png` | Filament-Karte mit Warn-Badge |
| `calculator.png` | Kostenrechner-Seite |
| `upload-cost-preview.png` | Upload mit Kosten-Preview |
| `history.png` | Druckhistorie |

---

*Zuletzt aktualisiert: 2026-04-17 | Last updated: 2026-04-17*
