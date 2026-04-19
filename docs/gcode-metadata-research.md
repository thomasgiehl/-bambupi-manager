# G-Code & .3mf Metadaten — Technische Recherche

> Erstellt: 2026-04-17 | Projekt: BambuPi Manager
> Ziel: Automatische Kostenkalkulation aus Datei-Metadaten beim Upload

---

## 1. Bambu Lab G-Code Header

Bambu Studio und OrcaSlicer schreiben am Anfang jeder `.gcode`-Datei einen
umfangreichen Kommentar-Header. Die Datei auf dem Drucker (z.B. `plate_1.gcode`
innerhalb eines `.3mf`-Archivs) enthält alle relevanten Werte.

### 1.1 Exakte Feldnamen (OrcaSlicer / Bambu Studio)

```
; filament used [g] = 23.45
; filament used [mm] = 7823.12
; filament used [cm3] = 9.87
; estimated printing time (normal mode) = 2h 15m 32s
; total layers count = 312
; total filament weight = 23.45
; filament_type = PLA
; filament_colour = #FF5733
; nozzle_temperature = 220
; bed_temperature = 65
; layer_height = 0.2
; initial_layer_height = 0.3
; support_material = 0
; plate_name = Plate 1
; printer_model = Bambu Lab X1C
; nozzle_diameter = 0.4
; bed_shape = 0x0,256x0,256x256,0x256
```

**Wichtig:** Das Feld `;gimage:` (Base64-PNG) kommt direkt nach dem Header und
kann mehrere hundert KB groß sein — der Parser muss nach Zeile 1 mit dem
G-Code-Header die ersten ~100 Zeilen lesen, bevor `;gimage:` beginnt.

### 1.2 Format der Zeitangabe

OrcaSlicer schreibt die Druckzeit in menschenlesbarem Format:

```
; estimated printing time (normal mode) = 2h 15m 32s
```

Mögliche Varianten:
- `2h 15m 32s`
- `1h 5m`
- `45m 12s`
- `30m`
- `1h`

Muss per Regex geparst werden (kein ISO-Format, kein reiner Sekundenwert).

### 1.3 Multi-Material (AMS) Felder

Bei Drucken mit mehreren Filamenten gibt es **pro Slot** separate Zeilen:

```
; filament used [g] = 12.34
; filament used [g] = 8.90
; filament used [g] = 2.21
; total filament weight = 23.45
```

Die Reihenfolge entspricht den AMS-Slots 0, 1, 2, … Das Feld
`total filament weight` oder `; filament used [g]` (letztes Auftreten ist
oft die Summe) enthält das Gesamtgewicht.

**Sicherer**: alle Zeilen `; filament used [g] = X.XX` sammeln und summieren,
oder explizit nach `; total filament weight` suchen.

---

## 2. Bambu .3mf Dateistruktur

`.3mf` ist ein ZIP-Archiv. Bambu Studio / OrcaSlicer legen folgende Struktur an:

```
meinmodell.3mf
├── 3D/
│   └── 3dmodel.model          ← Geometrie (3MF-Standard)
├── Metadata/
│   ├── plate_1.gcode          ← ★ Der eigentliche Druckgcode (wichtigste Datei)
│   ├── slice_info.config      ← ★ Maschinenlesbare Metadaten (XML)
│   ├── model_settings.config  ← Modell-Einstellungen (XML)
│   ├── print_profile.config   ← Druckprofil-Einstellungen (XML)
│   ├── project_settings.config← Projekteinstellungen (XML)
│   ├── plate_1.png            ← ★ Thumbnail (bereits genutzt in BambuPi)
│   ├── plate_1_small.png      ← Kleines Thumbnail
│   └── thumbnail.png          ← Alternatives Thumbnail
├── _rels/
│   └── .rels
└── [Content_Types].xml
```

### 2.1 Metadata/slice_info.config — Hauptquelle für Metadaten

Dies ist die **wichtigste Datei** für automatische Kostenkalkulation.
Sie ist eine XML-Datei mit folgendem Aufbau:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="01.09.05.51"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="printer_model_id" value="Bambu Lab X1C 0.4 nozzle"/>
    <metadata key="nozzle_diameters" value="0.4"/>
    <metadata key="weight" value="23.45"/>
    <metadata key="time" value="8132"/>
    <metadata key="prediction" value="8132"/>
    <metadata key="support_used" value="false"/>
    <metadata key="label_object_enabled" value="false"/>
    <metadata key="outside_bed" value="false"/>
    <filament id="1" type="PLA" color="#FF5733" used_m="7.82" used_g="22.10"/>
    <filament id="2" type="PETG" color="#1A2B3C" used_m="0.45" used_g="1.35"/>
  </plate>
</config>
```

**Exakte Feldnamen in `slice_info.config`:**

| XML-Attribut | Bedeutung | Beispielwert |
|---|---|---|
| `key="weight"` | Gesamtgewicht aller Filamente in Gramm | `"23.45"` |
| `key="time"` | Druckzeit in **Sekunden** | `"8132"` |
| `key="prediction"` | Alternative Zeitangabe in Sekunden | `"8132"` |
| `key="printer_model_id"` | Drucker-Modell + Düsendurchmesser | `"Bambu Lab X1C 0.4 nozzle"` |
| `filament id` | Slot-Nummer (1-basiert) | `"1"` |
| `filament type` | Filamenttyp | `"PLA"` |
| `filament color` | Farbe als Hex | `"#FF5733"` |
| `filament used_m` | Verbrauch in Metern | `"7.82"` |
| `filament used_g` | Verbrauch in Gramm (pro Slot) | `"22.10"` |

**Zeit ist in Sekunden** — kein Parsing nötig, direkt als Integer verwendbar.
**Gewicht ist in Gramm** als Float-String.

### 2.2 Metadata/plate_1.gcode — Fallback-Quelle

Der G-Code selbst ist in der .3mf enthalten und enthält denselben Header
wie eine standalone `.gcode`-Datei. Wenn `slice_info.config` nicht vorhanden
oder nicht parsbar ist, kann man in `plate_1.gcode` die Header-Kommentare lesen
(erste 100 Zeilen reichen).

### 2.3 Metadata/model_settings.config

Enthält Modell-spezifische Einstellungen (Skalierung, Positionierung,
Support-Einstellungen per Objekt). Für Kostenkalkulation weniger relevant,
aber Felder wie `support_type` können auf erhöhten Filamentverbrauch hinweisen.

### 2.4 Thumbnail-Pfade (bereits in BambuPi implementiert)

BambuPi prüft bereits folgende Pfade in dieser Reihenfolge:
- `Metadata/plate_1.png` (Standard OrcaSlicer)
- `Metadata/thumbnail.png`
- `Metadata/cover.png`
- `thumbnail.png`

Das ist korrekt und vollständig.

---

## 3. Konkrete Feldnamen — Zusammenfassung

### Für .3mf (empfohlener Weg)

| Was | Datei | XML-Pfad | Format |
|---|---|---|---|
| **Gesamtgewicht (g)** | `Metadata/slice_info.config` | `plate > metadata[key="weight"]` | Float-String: `"23.45"` |
| **Druckzeit (s)** | `Metadata/slice_info.config` | `plate > metadata[key="time"]` | Integer-String: `"8132"` |
| **Filamenttyp (pro Slot)** | `Metadata/slice_info.config` | `plate > filament[type]` | String: `"PLA"` |
| **Filamentfarbe** | `Metadata/slice_info.config` | `plate > filament[color]` | Hex: `"#FF5733"` |
| **Gewicht pro Slot (g)** | `Metadata/slice_info.config` | `plate > filament[used_g]` | Float-String: `"22.10"` |
| **Druckerprofil** | `Metadata/slice_info.config` | `plate > metadata[key="printer_model_id"]` | String |

### Für G-Code (Fallback)

| Was | Kommentarfeld | Format |
|---|---|---|
| **Gesamtgewicht (g)** | `; total filament weight` oder letztes `; filament used [g]` | Float: `23.45` |
| **Druckzeit** | `; estimated printing time (normal mode)` | String: `2h 15m 32s` |
| **Filamenttyp** | `; filament_type` | String: `PLA` |
| **Layer-Anzahl** | `; total layers count` | Integer: `312` |
| **Nozzle-Temp** | `; nozzle_temperature` | Integer: `220` |
| **Bett-Temp** | `; bed_temperature` | Integer: `65` |
| **Layer-Höhe** | `; layer_height` | Float: `0.2` |

---

## 4. Machbarkeit der Auto-Berechnung

### 4.1 Aus .3mf — Vollständig machbar

| Eingabe | Quelle | Verfügbar? |
|---|---|---|
| Filamentgewicht (g) | `slice_info.config` → `weight` | **Ja, immer** |
| Druckzeit (s) | `slice_info.config` → `time` | **Ja, immer** |
| Filamenttyp | `slice_info.config` → `filament[type]` | **Ja** |
| Filamentfarbe | `slice_info.config` → `filament[color]` | **Ja** |
| Filamentpreis (€/kg) | BambuPi Filament-DB | Muss vom User kommen |
| Strompreis (€/kWh) | BambuPi Settings-Tabelle | Muss konfiguriert sein |
| Druckerleistung (W) | BambuPi Settings-Tabelle | Muss konfiguriert sein |

**Fazit:** Filamentgewicht und Druckzeit sind zu 100% automatisch aus `.3mf`
extrahierbar. Preise müssen aus der BambuPi-Datenbank kommen.

### 4.2 Aus G-Code — Machbar mit Parsing

Standalone `.gcode`-Dateien haben dieselben Informationen im Header,
aber die Zeitangabe ist im Klartext-Format (`2h 15m 32s`) und muss geparst
werden. Das ist kein Problem, aber ein extra Schritt.

### 4.3 Was fehlt noch für vollständige Kalkulation

```
Automatisch aus Datei:           Muss konfiguriert werden:
─────────────────────────        ────────────────────────
✓ Filamentgewicht (g)            • Filamentpreis (€/kg) — aus Filament-DB
✓ Druckzeit (Sekunden)           • Strompreis (€/kWh) — Settings
✓ Filamenttyp                    • Druckerleistung (W) — Settings
✓ Anzahl Filament-Slots          • Maschinenkosten (€/h) — Settings
✓ Multi-Color-Erkennung          • Fehldruck-Rate (%) — Settings
                                 • Stundensatz Arbeit — Settings
```

**Für den Minimal-Use-Case** (nur Filamentkosten):
- Filamentgewicht aus Datei + Preis/kg aus DB = fertig
- Keine weitere Konfiguration nötig wenn der User ein Filament auswählt

---

## 5. Node.js Implementierung

### 5.1 .3mf Metadaten extrahieren

```javascript
// Benötigt: adm-zip (bereits installiert), fast-xml-parser oder einfaches Regex-Parsing
// Empfehlung: fast-xml-parser installieren: npm install fast-xml-parser

const AdmZip = require('adm-zip');

/**
 * Extrahiert Druckmetadaten aus einer .3mf-Datei.
 * Gibt null zurück wenn keine Metadaten gefunden.
 */
function extract3mfMetadata(filePath) {
  try {
    const zip = new AdmZip(filePath);
    
    // Primäre Quelle: slice_info.config
    const sliceInfoEntry = zip.getEntry('Metadata/slice_info.config');
    if (sliceInfoEntry) {
      const xml = sliceInfoEntry.getData().toString('utf8');
      return parseSliceInfoXml(xml);
    }
    
    // Fallback: plate_1.gcode Header lesen
    const gcodeEntry = zip.getEntry('Metadata/plate_1.gcode');
    if (gcodeEntry) {
      // Nur die ersten 8KB lesen (Header ist immer oben)
      const raw = gcodeEntry.getData();
      const head = raw.slice(0, 8192).toString('utf8');
      return parseGcodeHeader(head);
    }
    
    return null;
  } catch (e) {
    console.error('extract3mfMetadata Fehler:', e.message);
    return null;
  }
}

/**
 * Parst Metadata/slice_info.config XML.
 * Verwendet einfaches Regex — kein XML-Parser nötig da Struktur bekannt.
 */
function parseSliceInfoXml(xml) {
  const result = {
    weight_g: null,        // Gesamtgewicht Gramm
    time_s: null,          // Druckzeit Sekunden
    printer_model: null,   // z.B. "Bambu Lab X1C 0.4 nozzle"
    filaments: []          // [{id, type, color, used_g, used_m}]
  };

  // metadata key="weight" value="23.45"
  const weightMatch = xml.match(/key="weight"\s+value="([0-9.]+)"/);
  if (weightMatch) result.weight_g = parseFloat(weightMatch[1]);

  // metadata key="time" value="8132"
  const timeMatch = xml.match(/key="time"\s+value="([0-9]+)"/);
  if (timeMatch) result.time_s = parseInt(timeMatch[1], 10);

  // Fallback: prediction statt time
  if (!result.time_s) {
    const predMatch = xml.match(/key="prediction"\s+value="([0-9]+)"/);
    if (predMatch) result.time_s = parseInt(predMatch[1], 10);
  }

  // printer_model_id
  const printerMatch = xml.match(/key="printer_model_id"\s+value="([^"]+)"/);
  if (printerMatch) result.printer_model = printerMatch[1];

  // filament Einträge: <filament id="1" type="PLA" color="#FF5733" used_m="7.82" used_g="22.10"/>
  const filamentRegex = /<filament\s+id="([^"]+)"\s+type="([^"]+)"\s+color="([^"]+)"\s+used_m="([^"]+)"\s+used_g="([^"]+)"/g;
  let match;
  while ((match = filamentRegex.exec(xml)) !== null) {
    result.filaments.push({
      id: parseInt(match[1]),
      type: match[2],
      color: match[3],
      used_m: parseFloat(match[4]),
      used_g: parseFloat(match[5])
    });
  }

  // Gesamtgewicht aus Einzelfilamenten berechnen falls weight fehlt
  if (!result.weight_g && result.filaments.length > 0) {
    result.weight_g = result.filaments.reduce((sum, f) => sum + f.used_g, 0);
  }

  return result;
}

/**
 * Parst G-Code Header Kommentare (erste ~100 Zeilen).
 * Funktioniert für .gcode-Dateien und als Fallback für plate_1.gcode im .3mf.
 */
function parseGcodeHeader(headText) {
  const result = {
    weight_g: null,
    time_s: null,
    printer_model: null,
    filaments: [],
    // G-Code spezifische Extras:
    layer_count: null,
    layer_height: null,
    nozzle_temp: null,
    bed_temp: null,
    filament_type: null
  };

  const lines = headText.split('\n').slice(0, 200); // erste 200 Zeilen reichen

  // Alle "filament used [g]" Zeilen sammeln (Multi-Material hat mehrere)
  const filamentWeights = [];

  for (const line of lines) {
    if (!line.startsWith(';')) continue; // Nur Kommentare

    // Gesamtgewicht: "; total filament weight = 23.45" oder "; filament used [g] = 23.45"
    let m;

    m = line.match(/;\s*total filament weight\s*=\s*([0-9.]+)/i);
    if (m) { result.weight_g = parseFloat(m[1]); continue; }

    m = line.match(/;\s*filament used \[g\]\s*=\s*([0-9.]+)/i);
    if (m) { filamentWeights.push(parseFloat(m[1])); continue; }

    // Druckzeit: "; estimated printing time (normal mode) = 2h 15m 32s"
    m = line.match(/;\s*estimated printing time.*?=\s*(.+)/i);
    if (m) { result.time_s = parseTimeString(m[1].trim()); continue; }

    // Layer-Anzahl
    m = line.match(/;\s*total layers count\s*=\s*([0-9]+)/i);
    if (m) { result.layer_count = parseInt(m[1]); continue; }

    // Layer-Höhe
    m = line.match(/;\s*layer_height\s*=\s*([0-9.]+)/i);
    if (m) { result.layer_height = parseFloat(m[1]); continue; }

    // Nozzle-Temperatur
    m = line.match(/;\s*nozzle_temperature\s*=\s*([0-9]+)/i);
    if (m) { result.nozzle_temp = parseInt(m[1]); continue; }

    // Bett-Temperatur
    m = line.match(/;\s*bed_temperature\s*=\s*([0-9]+)/i);
    if (m) { result.bed_temp = parseInt(m[1]); continue; }

    // Filamenttyp
    m = line.match(/;\s*filament_type\s*=\s*(.+)/i);
    if (m) { result.filament_type = m[1].trim(); continue; }
  }

  // Wenn kein total_filament_weight gefunden: Einzelwerte summieren
  if (!result.weight_g && filamentWeights.length > 0) {
    result.weight_g = filamentWeights.reduce((a, b) => a + b, 0);
  }

  // Filamente für Multi-Color befüllen (vereinfacht, ohne Farbe)
  if (filamentWeights.length > 1) {
    filamentWeights.forEach((g, i) => {
      result.filaments.push({ id: i + 1, used_g: g, type: result.filament_type || 'Unknown', color: null });
    });
  }

  return result;
}

/**
 * Parst Zeitstrings wie "2h 15m 32s", "45m", "1h 5m", "30s"
 * Gibt Sekunden als Integer zurück.
 */
function parseTimeString(str) {
  let seconds = 0;
  const h = str.match(/(\d+)\s*h/i);
  const m = str.match(/(\d+)\s*m(?!s)/i); // "m" aber nicht "ms"
  const s = str.match(/(\d+)\s*s/i);
  if (h) seconds += parseInt(h[1]) * 3600;
  if (m) seconds += parseInt(m[1]) * 60;
  if (s) seconds += parseInt(s[1]);
  return seconds || null;
}
```

### 5.2 Für beliebige Upload-Datei (.3mf oder .gcode)

```javascript
/**
 * Universelle Metadaten-Extraktion für .3mf und .gcode.
 * Gibt Objekt mit weight_g, time_s, filaments zurück oder null.
 */
function extractPrintMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.3mf') {
    return extract3mfMetadata(filePath);
  }
  
  if (ext === '.gcode') {
    try {
      // Nur die ersten 16KB lesen (Header ist immer oben, vor dem ;gimage: Block)
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(16384);
      const bytesRead = fs.readSync(fd, buf, 0, 16384, 0);
      fs.closeSync(fd);
      const head = buf.toString('utf8', 0, bytesRead);
      return parseGcodeHeader(head);
    } catch (e) {
      console.error('extractPrintMetadata gcode Fehler:', e.message);
      return null;
    }
  }
  
  return null;
}
```

### 5.3 Integration in den Upload-Endpoint

```javascript
// In server.js — Multer Upload-Handler erweitern:
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  
  const filePath = req.file.path;
  
  // Metadaten extrahieren
  const meta = extractPrintMetadata(filePath);
  
  // Thumbnail extrahieren (bereits vorhanden)
  // const thumb = extractThumbnail(filePath);
  
  res.json({
    ok: true,
    filename: req.file.filename,
    size: req.file.size,
    metadata: meta ? {
      weight_g: meta.weight_g,                    // z.B. 23.45
      time_s: meta.time_s,                        // z.B. 8132
      time_formatted: meta.time_s               // z.B. "2h 15m 32s"
        ? formatSeconds(meta.time_s) : null,
      filament_count: meta.filaments.length,      // 1 = single, >1 = multi-color
      filaments: meta.filaments,                  // [{id,type,color,used_g}]
      printer_model: meta.printer_model
    } : null
  });
});

/**
 * Hilfsfunktion: Sekunden in lesbare Zeitangabe
 */
function formatSeconds(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec}s`);
  return parts.join(' ');
}
```

### 5.4 Kostenkalkulation mit extrahierten Werten

```javascript
/**
 * Berechnet Druckkosten aus Datei-Metadaten + DB-Werten.
 * 
 * @param {Object} meta         - Ausgabe von extractPrintMetadata()
 * @param {Object} filament     - Filament-Objekt aus BambuPi-DB (price_per_kg, ...)
 * @param {Object} settings     - Einstellungen { electricity_price, printer_watts, machine_cost_per_h }
 */
function calculateCostsFromMetadata(meta, filament, settings) {
  if (!meta || !meta.weight_g) return null;
  
  const weight_g = meta.weight_g;
  const time_h   = meta.time_s ? meta.time_s / 3600 : 0;
  
  // Filamentkosten (Pflicht)
  const price_per_kg  = filament?.price_per_kg || 0;
  const filament_cost = weight_g * (price_per_kg / 1000);
  
  // Stromkosten (optional, aus Settings)
  const watts    = settings?.printer_watts || 300;      // Bambu X1C ~200-350W
  const kwh_price = settings?.electricity_price || 0.30; // €/kWh Deutschland ~0.30
  const electricity_cost = time_h * (watts / 1000) * kwh_price;
  
  // Maschinenkosten (optional, aus Settings)
  const machine_per_h = settings?.machine_cost_per_h || 0;
  const machine_cost  = time_h * machine_per_h;
  
  return {
    weight_g:         Math.round(weight_g * 100) / 100,
    time_h:           Math.round(time_h * 100) / 100,
    filament_cost:    Math.round(filament_cost * 100) / 100,
    electricity_cost: Math.round(electricity_cost * 100) / 100,
    machine_cost:     Math.round(machine_cost * 100) / 100,
    total:            Math.round((filament_cost + electricity_cost + machine_cost) * 100) / 100
  };
}
```

---

## 6. Edge Cases & Kompatibilitätshinweise

### 6.1 Attribut-Reihenfolge in slice_info.config

Bambu Studio schreibt `key` vor `value`. OrcaSlicer-Builds können die
Reihenfolge variieren. Das Regex `key="weight"\s+value="..."` fängt den
Standardfall ab. Sicherer mit einem echten XML-Parser:

```javascript
// Mit fast-xml-parser (npm install fast-xml-parser):
const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const parsed = parser.parse(xml);
const plates = parsed.config?.plate;
const plateArr = Array.isArray(plates) ? plates : [plates];
const metaArr = plateArr[0]?.metadata;
// metaArr ist Array von { '@_key': 'weight', '@_value': '23.45' }
```

### 6.2 Mehrere Plates

Ein .3mf-Projekt kann mehrere Plates enthalten:

```xml
<plate>
  <metadata key="index" value="1"/>
  ...
</plate>
<plate>
  <metadata key="index" value="2"/>
  ...
</plate>
```

Beim Parsen: **Plate mit `index=1` verwenden** oder alle summieren.

### 6.3 Ältere Bambu Studio Versionen

Versionen vor ca. 1.7 hatten noch kein `slice_info.config` in dieser Form.
In dem Fall immer auf `plate_1.gcode` Header als Fallback ausweichen.

### 6.4 time vs. prediction

Beide Felder enthalten die Druckzeit in Sekunden. `time` ist der bevorzugte
Wert. `prediction` ist ein Schätzwert der Firmware. In den meisten Fällen
sind beide identisch.

### 6.5 G-Code mit Multi-Color und AMS

OrcaSlicer schreibt für Multi-Color-Drucke mehrere `; filament used [g]`
Zeilen. Die **letzte** Zeile ist jedoch nicht immer die Summe — es gibt
separat `; total filament weight`. Deshalb: alle Einzelwerte summieren
wenn kein `total filament weight` gefunden wird.

---

## 7. Fazit

### Lohnt es sich?

**Ja, eindeutig.** Der Aufwand ist überschaubar:

| Schritt | Aufwand | Nutzen |
|---|---|---|
| `slice_info.config` Parser | ~1h | Gewicht + Zeit aus jedem .3mf |
| G-Code Header Parser | ~30min | Fallback für .gcode-Dateien |
| Upload-Endpoint erweitern | ~30min | Metadaten beim Upload zurückgeben |
| Frontend: Vorausfüllen | ~1h | UX-Gewinn, kein manuelles Tippen |
| DB: Felder speichern | ~15min | Bereits in Masterplan geplant |

**Gesamtaufwand: ca. 3–4 Stunden**

### Was danach noch manuell eingegeben werden muss

1. **Filamentauswahl** — welches Filament aus der DB wurde verwendet?
   (Kann per Typerkennung aus `filament[type]` vorgeschlagen werden)
2. **Purge/Spülturm-Gramm** — bei Multi-Color-Druck extra Eingabe
3. **Fehldruck-Reserve** — globale Einstellung

### Empfohlene Umsetzung

1. `extractPrintMetadata()` in `server.js` einbauen (Code aus Abschnitt 5.2)
2. Upload-Endpoint gibt `metadata`-Objekt zurück
3. Frontend: bei `.3mf`-Upload Felder im Kostenrechner vorausfüllen
4. DB-Migration: `estimated_weight_g`, `estimated_time_s`, `layer_count`
   (bereits im Masterplan unter "Datenbankschema Erweiterungen" geplant)
5. Filamentvorschlag: wenn `filament_type` aus Datei = Material in DB,
   ersten Treffer vorschlagen

---

*Recherche-Grundlage: OrcaSlicer Quellcode (SoftFever/OrcaSlicer, src/libslic3r/GCode.cpp,
SliceInfoConfig.cpp), Bambu Lab .3mf Format-Dokumentation, OpenBambuAPI Community
(Doridian/OpenBambuAPI), eigene Analyse der Dateistruktur. Stand: Wissensbasis bis Aug 2025.*
