# BambuPi Manager — Masterplan

> Stand: April 2026 · Analyse basierend auf Mainsail, Fluidd, OctoPrint, KlipperScreen

---

## Aktueller Stand

### Vollständig implementiert
- Dashboard-Cards mit SSE Realtime-Updates
- Temperaturanzeige + Steuerung (Nozzle/Bett/Cooldown) mit Pfeilen
- Temperaturverlauf-Chart (Chart.js, letzte 10 Min)
- Pause / Resume / Stop / Speed-Presets / Fan / Licht
- AMS-Visualisierung + manuelle Slot-Zuweisung
- Filament-Datenbank (CRUD)
- Kostenrechner + Druckverlauf (letzte 100 Jobs)
- FTP-Filemanager (Upload, SD-Card, Löschen, Print starten)
- Thumbnail-Extraktion aus .3mf
- Multi-Printer Support
- Mobile-Layout + Bottom-Navigation + Swipe

### Teilweise / defekt
- Browser-Benachrichtigungen: Funktion da, aber nicht mit Events verdrahtet
- SSE-Abbruch: kein sichtbarer Indikator für den User
- Temperaturverlauf: leert sich bei Reload (kein Server-Ringbuffer)
- Filament-Schnellauswahl: DB vorhanden, kein UI-Dropdown

---

## Roadmap — Phasen

---

### Phase 1 — Bugs & Quick Wins (1–2 Sessions)
*Alles was kaputt oder halb fertig ist, und schnelle Gewinne*

| # | Feature | Warum | Aufwand |
|---|---------|-------|---------|
| 1.1 | **Benachrichtigungen verdrahten** | sendNotif() existiert, muss nur bei FINISH/FAILED aufgerufen werden | XS |
| 1.2 | **SSE-Verbindungsanzeige** | User sieht nicht wenn Realtime abbricht | XS |
| 1.3 | **Vorheiz-Profile** | 1-Klick PLA/PETG/ABS/TPU Buttons → sofort nützlich | S |
| 1.4 | **Wiederholen-Button** | Letzten Druck nochmal starten | S |
| 1.5 | **Bambu Studio Filament-Import** | ~/.config/BambuStudio/ statt externer API | S |
| 1.6 | **Temperaturverlauf Ringbuffer** | Im Server die letzten 600 Werte (10 Min) pro Drucker cachen | M |

---

### Phase 2 — Neue Features (2–3 Sessions)
*Features die in Mainsail/Fluidd Standard sind*

| # | Feature | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 2.1 | **CSV-Export** | Druckverlauf als .csv herunterladen | XS |
| 2.2 | **PWA Manifest** | manifest.json + Service Worker → Homescreen-Install | S |
| 2.3 | **Flow Rate Slider** | M221 Gcode, live während Druck anpassen | S |
| 2.4 | **Snapshot-Button** | Kamerabild als PNG speichern | S |
| 2.5 | **Kamera-Optionen** | Flip, Rotate, Zoom per Einstellung | S |
| 2.6 | **In-App Event-Log** | Letzte 20 Events als Liste (nicht nur Toast) | M |
| 2.7 | **Temperatur-Alarm** | Benachrichtigung wenn Nozzle > X°C idle | M |
| 2.8 | **Vollbild/Kiosk-Modus** | Dashboard ohne Navigation für Wandtablet | S |

---

### Phase 3 — Automatisierung (3–4 Sessions)
*Intelligente Funktionen*

| # | Feature | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 3.1 | **Telegram/Discord Webhook** | Benachrichtigung auf Handy bei Finish/Fehler/Pause | M |
| 3.2 | **Schnell-Aktions-Buttons** | User kann eigene Buttons anlegen (Label + Gcode) | M |
| 3.3 | **Timelapse** | Pro Layer Snapshot via MQTT, nach Druck MP4 via ffmpeg | L |
| 3.4 | **Druckzeit-Statistiken** | Heatmap Druckzeiten, Erfolgs-/Fehlquote, Filament-Verbrauch nach Typ | M |
| 3.5 | **Filament-Schwellwert** | Warnung wenn Restmenge < X Gramm | S |
| 3.6 | **Auto-Cooldown Timer** | Nach Druckende: X Minuten warten, dann kühlen | M |

---

### Phase 4 — Polish & UX (fortlaufend)
*Aussehen & Gefühl auf Mainsail-Niveau bringen*

| # | Feature | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 4.1 | **Dashboard Widget-Reihenfolge** | Drag-and-drop oder Einstellungsseite für Widget-Order | L |
| 4.2 | **Dark/Light Theme Toggle** | Systemtheme-Erkennung + manueller Toggle | S |
| 4.3 | **Einheitenwechsel** | °C/°F, mm/in Toggle | S |
| 4.4 | **Druckkarten-Kompaktmodus** | Kleine Karte (nur Status) wenn viele Drucker | M |
| 4.5 | **Keyboard Shortcuts** | P = Pause, S = Stop, H = Home etc. | S |
| 4.6 | **Onboarding Flow** | Geführtes Setup beim ersten Start (Drucker hinzufügen) | M |

---

## Bambu Studio Integration — Technischer Plan

### Filament-Presets importieren
```
Pfad: ~/.config/BambuStudio/user/<uid>/filament/*.json
Felder: filament_type, filament_colour[0], nozzle_temperature[0],
        bed_temperature[0], filament_vendor, filament_cost
```
→ Neuer API-Endpoint `/api/filament-db/bambu` liest diese JSONs
→ UI: "Aus Bambu Studio importieren" Button in Filament-Seite

### .3mf Metadaten beim Upload
```
adm-zip vorhanden ✓
Metadata/slice_info.config → XML parsen (fast-xml-parser)
  → estimated_weight_g
  → estimated_print_time_s
  → layer_count
  → filament_color per slot
Metadata/thumbnail/plate_1.png → direkt als Vorschau cachen ✓
```
→ Beim Upload automatisch in print_jobs vorbefüllen

---

## Datenbankschema — Geplante Erweiterungen

```sql
-- Neu: Event-Log
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  printer_id INTEGER,
  type TEXT,        -- 'finish','fail','pause','error'
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Neu: Schnell-Aktions-Buttons
CREATE TABLE macros (
  id INTEGER PRIMARY KEY,
  name TEXT,
  icon TEXT,
  gcode TEXT,
  printer_id INTEGER   -- NULL = alle Drucker
);

-- Neu: Timelapse-Jobs
CREATE TABLE timelapses (
  id INTEGER PRIMARY KEY,
  print_job_id INTEGER,
  frame_count INTEGER,
  status TEXT,         -- 'recording','rendering','done'
  file_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Erweiterung: print_jobs
ALTER TABLE print_jobs ADD COLUMN estimated_weight_g REAL;
ALTER TABLE print_jobs ADD COLUMN estimated_time_s INTEGER;
ALTER TABLE print_jobs ADD COLUMN layer_count INTEGER;
ALTER TABLE print_jobs ADD COLUMN thumbnail_path TEXT;
```

---

## UI-Konzept — Neue Seitenstruktur

```
Sidebar (Desktop) / Bottom-Nav (Mobile)
├── 🖨️  Dashboard          ← Printer-Cards + Live-Kamera
├── 📊  Statistiken         ← NEU: Charts, Heatmap, Filament-Verbrauch
├── 📁  Dateien             ← Upload, SD-Card, Pi-Dateien
├── 🧵  Filamente           ← DB + Bambu Studio Import
├── ⏱️  Verlauf             ← Druckjobs + CSV-Export
├── 🎬  Timelapse           ← NEU: Aufnahmen, Galerie
├── ⚙️  Einstellungen       ← Drucker, Kosten, Webhooks, Macros
└── 📟  Events              ← NEU: Live Event-Log
```

---

## Prioritäts-Matrix

```
Aufwand  │ Niedriger Nutzen    │ Hoher Nutzen
─────────┼─────────────────────┼──────────────────────────
Gering   │ Einheitenwechsel    │ ★ Vorheiz-Profile
         │ Kiosk-Modus         │ ★ Benachrichtigungen fix
         │ Theme Toggle        │ ★ CSV-Export
         │                     │ ★ SSE-Indikator
─────────┼─────────────────────┼──────────────────────────
Mittel   │ Drag-Drop Widgets   │ ★ Bambu Studio Import
         │ Keyboard Shortcuts  │ ★ Telegram Webhook
         │                     │ ★ Temperatur-Alarm
         │                     │ ★ Flow Rate Slider
─────────┼─────────────────────┼──────────────────────────
Hoch     │ G-Code Editor       │ ★ Timelapse
         │ Skip-to-Layer       │   Statistik-Heatmap
```

---

## Nächste Session — Empfehlung

**Phase 1 komplett abarbeiten:**
1. Benachrichtigungen verdrahten (sendNotif bei FINISH/FAILED) — 10 Min
2. SSE-Verbindungsanzeige — 10 Min  
3. Vorheiz-Profile Buttons (PLA/PETG/ABS/TPU) — 20 Min
4. Bambu Studio Filament-Import — 30 Min
5. Temperaturverlauf Ringbuffer im Server — 30 Min

→ Danach Phase 2 mit PWA + Telegram Webhook
