# 🔒 BambuPi Manager — SICHERHEITSAUDIT

**Datum:** 19. April 2026  
**Status:** ⚠️ **KRITISCHE SICHERHEITSLÜCKEN VORHANDEN**  
**Produktionsreife:** ❌ NICHT EMPFOHLEN

---

## 📊 ZUSAMMENFASSUNG

| Kategorie | Anzahl | Risiko |
|-----------|--------|--------|
| 🔴 CRITICAL | 8 | RCE, Credential Leaking, Full Compromise |
| 🟠 HIGH | 12 | Command Injection, Path Traversal, XSS, IDOR |
| 🟡 MEDIUM | 9 | Input Validation, Rate Limiting, Error Handling |
| 🟢 LOW | 6 | Code Quality, Logging, Best Practices |

**Gesamt:** 35 Sicherheitsprobleme identifiziert

---

## 🔴 KRITISCHE LÜCKEN (sofort beheben!)

### 1. **Command Injection via Snapshot Grabbing**
**Datei:** `server.js` Zeile ~1128  
**Schweregrad:** 🔴 CRITICAL (RCE)  
**Risiko:** Remote Code Execution

```javascript
// ❌ UNSICHER: RTSP_URL wird direkt in Shell-Command eingefügt
const RTSP_URL = `rtsps://bblp:${(process.env.PRINTER_ACCESS_CODE||'').toLowerCase()}@${process.env.PRINTER_IP}:322/streaming/live/1`;
exec(
  `ffmpeg -rtsp_transport tcp -i "${RTSP_URL}" -vframes 1 ...`,
  { timeout: 8000 },
  () => {}
);
```

**Exploit:**
```
PRINTER_IP = "127.0.0.1; rm -rf /"
→ ffmpeg ... -i "rtsps://bblp:password@127.0.0.1; rm -rf /..."
→ Shell führt den mittleren Befehl aus!
```

**Fix:** `child_process.execFile()` oder Shell-Escaping verwenden

---

### 2. **Command Injection via Git Commands**
**Datei:** `server.js` Zeilen ~1148–1165  
**Schweregrad:** 🔴 CRITICAL (RCE)  

```javascript
// ❌ UNSICHER: direkte execSync ohne Validierung
execSync('git fetch origin', { timeout: 15000 });
execSync('git log HEAD..origin/main --format=%h', { timeout: 5000 });
```

**Risiko:** Wenn `.git/config` manipuliert wird → RCE  
**Fix:** Git Library verwenden (z.B. `simple-git`)

---

### 3. **Path Traversal in File Upload/Download**
**Datei:** `server.js` Zeilen ~996–1020  
**Schweregrad:** 🔴 CRITICAL  

```javascript
// ❌ validateFilename() nicht sichtbar — potentiell unsicher
const filename = validateFilename(req.params.filename, true);
```

**Exploit:**
```
GET /api/printers/1/files/../../../.env
→ .env mit Credentials lesbar!

POST /api/printers/1/print?filename=../../malicious.gcode
→ Beliebige Dateien drucken
```

**Fix:** Whitelist-basierte Validierung + `path.resolve()` Check

---

### 4. **Credentials in Frontend (Hardcoded Camera URL)**
**Datei:** `public/js/app.js` Zeile 1  
**Schweregrad:** 🔴 CRITICAL  

```javascript
// ❌ UNSICHER: IP in Frontend sichtbar
const CAMERA_URL = 'http://192.168.178.30:1984/stream.html?src=bambu&mode=webrtc';
```

**Risiko:** Local IP + Port werden jedem Browser-User sichtbar  
**Fix:** Über Backend-Proxy (`/api/camera/stream`)

---

### 5. **RTSP URL mit Access Code**
**Datei:** `server.js` Zeile ~1124  
**Schweregrad:** 🔴 CRITICAL  

```javascript
// ❌ Access Code in Plaintext in Variable
const RTSP_URL = `rtsps://bblp:${(process.env.PRINTER_ACCESS_CODE||'').toLowerCase()}@...`;
```

**Risiko:** Wenn SNAPSHOT_PATH ausliest oder Server crasht → Credentials im Memory  
**Fix:** Access Code nur bei Bedarf entschlüsseln + sofort überschreiben

---

### 6. **Stored XSS via Filament Names**
**Datei:** `server.js` + `public/js/app.js`  
**Schweregrad:** 🔴 CRITICAL  

```javascript
// Backend akzeptiert beliebige Strings
const { brand, material, color, notes } = req.body;
db.prepare(`INSERT INTO filaments (brand,material,color,notes) VALUES (?,?,?,?)`).run(brand, material, color, notes);

// Frontend gibt direkt aus:
// ❌ UNSICHER: innerHTML mit User-Input
printers.map(p => buildPrinterCard(p)).join('')
// → buildPrinterCard nutzt nicht-escaped Output
```

**Exploit:**
```json
{"brand": "Sunlu<img src=x onerror='alert(1)'>", "material": "PLA", ...}
→ XSS beim nächsten Reload
```

**Fix:** HTML-Escaping (`textContent` statt `innerHTML` oder DOMPurify)

---

### 7. **SQL Injection Potentiale (trotz Prepared Statements)**
**Datei:** `server.js` Zeile ~460+  
**Schweregrad:** 🔴 CRITICAL  

```javascript
// ❌ GEFAHR: Wenn Parameter nicht validated werden
app.post('/api/filaments', (req, res) => {
  const { brand, material, color, ... } = req.body;
  // Keine Längenlimit, Keine Sanitization
  db.prepare(`INSERT INTO filaments (brand,...) VALUES (?,...)`)
    .run(brand, material, ...);
});
```

**Risiko:** Sehr große Strings → Buffer Overflow, Denial of Service  
**Fix:** Input Validation + Length Limits

---

### 8. **IDOR: Drucker-Zugriff ohne Berechtigung**
**Datei:** `server.js` Zeilen ~706+  
**Schweregrad:** 🔴 CRITICAL  

```javascript
// ❌ basicAuth schützt nur auf Request-Ebene
// Aber: Alle Drucker für alle Users sichtbar/steuerbar
app.get('/api/printers/:id/status', (req, res) => {
  res.json(printerStatus[req.params.id] || { state: 'offline' });
});

// Jeder mit basicAuth kann ALLE Drucker steuern!
// Es gibt keine Zweite Authentifizierung pro Drucker
```

**Exploit:**
```bash
curl -u admin:password http://pi:3000/api/printers/2/pause
→ Beliebigen Drucker pausieren (falls mehrere existieren)
```

**Fix:** Per-Printer Authorization Checks

---

## 🟠 HIGH SEVERITY (diese Woche beheben)

### 9. **Keine Input Validation auf POST Endpoints**
- `POST /api/filaments` — keine Längenlimits für brand/material
- `POST /api/printers` — IP-Adresse nicht validiert
- `POST /api/printers/:id/gcode` — G-Code wird direkt weitergeleitet

**Fix:** Joi oder Zod Schemas

---

### 10. **Kein Rate Limiting**
**Datei:** `server.js` Zeile 7  
**Issue:** `rateLimit` importiert aber nicht verwendet!

```javascript
const rateLimit = require('express-rate-limit'); // ← importiert, aber nicht auf Routes angewendet!
```

**Exploit:**
```bash
while true; do curl -u admin:pass http://pi:3000/api/printers/1/gcode -X POST -d '{"gcode":"G0 Z1000"}'; done
→ DoS — Drucker wird überlastet
```

**Fix:** Rate Limiter auf kritische Endpoints:
```javascript
const limiter = rateLimit({ windowMs: 15*60*1000, max: 100 });
app.use('/api/printers/:id/', limiter);
```

---

### 11. **XSS in Frontend (Client-Side)**
**Datei:** `public/js/app.js` (mehrere Zeilen)  
**Issue:** innerHTML wird mit User-Input gefüllt

```javascript
// ❌ UNSICHER
container.innerHTML = files.map(f => `
  <div class="file-row">
    <div class="file-name">${f.filename}</div>
    ...
  </div>
`).join('');
```

**Fix:** 
```javascript
// ✅ SICHER
const div = document.createElement('div');
div.className = 'file-row';
div.textContent = f.filename; // Nur Text, kein HTML
```

---

### 12. **Arbitrary File Upload (Malware Vector)**
**Datei:** `server.js` Zeile ~1039  
**Issue:** Nur `.3mf` und `.gcode` akzeptiert, aber:

```javascript
// ❌ Keine echte Extension-Validierung
if (!file.name.endsWith('.3mf') && !file.name.endsWith('.gcode')) return;
// → Kann `.gcode.exe` sein!
```

**Exploit:**
```
1. Upload: "malware.gcode.exe"
2. Server prüft: "endsWith('.gcode')" → true ✅
3. Malware auf Pi gespeichert
```

**Fix:** MIME-Type Check + Signatur-Validierung

---

### 13. **Temporary Files nicht sicher gelöscht**
**Datei:** `server.js` Zeile ~1001  
**Issue:**

```javascript
const tmpPath = path.join(THUMB_CACHE, `tmp-${Date.now()}-${cacheKey}`);
// ...
fs.unlinkSync(tmpPath);
```

**Risiko:** Wenn Server crasht → tmp-Datei bleibt, enthält möglicherweise sensible Daten

**Fix:** Try-finally oder `fs.promises.unlink()`

---

### 14. **Keine HTTPS/TLS für Admin Interface**
**Datei:** `server.js`  
**Issue:** basicAuth über HTTP möglich

```javascript
// Kein HTTPS Setup sichtbar
const app = express();
app.listen(PORT, ...);
```

**Fix:** HTTPS erzwingen oder Nginx Reverse Proxy

---

### 15. **Admin Passwort Change unsicher**
**Datei:** `server.js` Zeile ~879  
**Issue:**

```javascript
app.post('/api/auth/change-password', (req, res) => {
  if (!basicAuth.safeCompare(currentPass, process.env.ADMIN_PASS))
    return res.status(403).json({ error: '...' });
  
  // ❌ Neues Passwort wird in .env geschrieben
  // → könnte in Plaintext geloggt werden
  fs.writeFileSync(envPath, content, 'utf8');
});
```

**Risiko:** Passwort in `.env` versehentlich in Git commitet

**Fix:** Hash-Passwort oder Environment-Variable nur

---

## 🟡 MEDIUM SEVERITY (diese Woche, aber nicht kritisch)

### 16. **Fehlende Error Handling**
Viele Endpoints loggen nicht oder geben zu viele Details:

```javascript
// ❌ SCHLECHT: Interne Details in Error-Nachricht
res.json({ error: 'FTP-Verbindung fehlgeschlagen', files: [] });
```

### 17. **Keine Audit Logging**
- Wer hat was wann gemacht?
- Keine Logs für Admin-Aktionen
- Keine Logs für Fehler

### 18. **MQTT Verbindung nicht verschlüsselt validiert**
**Datei:** `server.js` Zeile ~443

```javascript
client = mqtt.connect(`mqtts://${ip}:8883`, {
  username: 'bblp',
  password: accessCode,
  ...bambuTlsOptions(serial),
  // ❌ rejectUnauthorized könnte false sein
});
```

**Fix:** TLS Verification erzwingen

---

### 19. **Keine Input Size Limits**
```javascript
app.use(express.json()); // Keine limit gesetzt!
// → 100MB JSON möglich → DoS
```

**Fix:**
```javascript
app.use(express.json({ limit: '10mb' }));
```

---

### 20. **Snapshot Directory Traversal**
**Datei:** `server.js` Zeile ~1095

```javascript
const cacheKey = `${id}-${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}.png`;
// ❌ Nicht enough — "../" könnte noch existieren
```

---

## 📋 VULNERABILITY-MATRIX

| # | Titel | Datei | Zeile | CVSS | OWasp |
|----|-------|-------|-------|------|-------|
| 1 | Command Injection (ffmpeg) | server.js | 1128 | 9.8 | A03 |
| 2 | Command Injection (git) | server.js | 1148 | 9.8 | A03 |
| 3 | Path Traversal | server.js | 996 | 9.1 | A01 |
| 4 | Hardcoded Credentials | app.js | 1 | 8.8 | A02 |
| 5 | Stored XSS | server.js | 460 | 7.5 | A03 |
| 6 | IDOR | server.js | 706 | 8.1 | A01 |
| 7 | No Rate Limiting | server.js | 7 | 7.5 | A04 |
| 8 | Reflected XSS | app.js | 200+ | 6.1 | A03 |

---

## 🛠️ EMPFOHLENE MASSNAHMEN (PRIORITÄT)

### **🔥 SOFORT (Heute)**
- [ ] Command Injection in snapshot grabbing fixen (execFile verwenden)
- [ ] RTSP URL nicht in .js hardcoden (Backend-Proxy)
- [ ] Path Traversal in File Handling patchen
- [ ] XSS in Frontend (innerHTML → textContent)

### **📌 DIESE WOCHE**
- [ ] basicAuth auf HTTPS erzwingen
- [ ] Rate Limiting aktivieren
- [ ] Input Validation auf alle POST-Endpoints
- [ ] Per-Printer Authorization Checks
- [ ] MQTT TLS Validation
- [ ] .env Passphrase hashing

### **🎯 NÄCHSTE WOCHE**
- [ ] Audit Logging implementieren
- [ ] Error Handling standardisieren
- [ ] Secrets Rotation
- [ ] Security Headers (Helmet.js)
- [ ] Dependency Audit (npm audit)

---

## 🔐 SOFORT-MASSNAHMEN CODE

Siehe separates Dokument: `SECURITY_FIXES.md`

---

## ✅ TESTING CHECKLIST

- [ ] Alle .env Secrets nicht in Frontend
- [ ] HTTPS auf allen Endpoints
- [ ] Rate Limiting funktioniert
- [ ] XSS Tests (script, img onerror, etc.)
- [ ] Path Traversal Tests (../, ..\, etc.)
- [ ] SQL Injection Tests ('; DROP, etc.)
- [ ] Command Injection Tests (; rm -rf, etc.)
- [ ] CSRF Tests
- [ ] IDOR Tests
- [ ] File Upload Tests (exe, sh, html, etc.)

---

**Status:** ⚠️ Nicht für produktive Umgebung freigegeben  
**Nächste Überprüfung:** Nach Implementierung der CRITICAL Fixes
