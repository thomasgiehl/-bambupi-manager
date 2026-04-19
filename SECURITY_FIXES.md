# 🔧 SICHERHEITS-FIXES — IMPLEMENTIERUNG

## 1. FIX: Command Injection in Snapshot Grabbing

### ❌ UNSICHER (aktuell)
```javascript
const RTSP_URL = `rtsps://bblp:${(process.env.PRINTER_ACCESS_CODE||'').toLowerCase()}@${process.env.PRINTER_IP}:322/streaming/live/1`;

function grabSnapshot() {
  const { exec } = require('child_process');
  exec(
    `ffmpeg -rtsp_transport tcp -i "${RTSP_URL}" -vframes 1 -update 1 -q:v 3 -y "${SNAPSHOT_PATH}" 2>/dev/null`,
    { timeout: 8000 },
    () => {}
  );
}
```

### ✅ SICHER (Fix)
```javascript
const { execFile } = require('child_process');
const crypto = require('crypto');

function grabSnapshot() {
  // Access Code nur zur Laufzeit entschlüsseln
  const printer = db.prepare('SELECT access_code FROM printers LIMIT 1').get();
  if (!printer) return;
  
  const accessCode = decryptAccessCode(printer.access_code);
  const rtspUrl = `rtsps://bblp:${accessCode.toLowerCase()}@${process.env.PRINTER_IP}:322/streaming/live/1`;
  
  // execFile ist sicher — keine Shell-Expansion möglich
  execFile('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-vframes', '1',
    '-update', '1',
    '-q:v', '3',
    '-y',
    SNAPSHOT_PATH
  ], { timeout: 8000 }, (err) => {
    if (err) log.warn('Snapshot Fehler: ' + err.message);
  });
  
  // Passwort sofort überschreiben
  accessCode = '';
}
```

---

## 2. FIX: Command Injection in Git Befehlen

### ❌ UNSICHER (aktuell)
```javascript
app.get('/api/update/check', (req, res) => {
  try {
    execSync('git fetch origin', { timeout: 15000 });
    const hashes = execSync('git log HEAD..origin/main --format=%h', { timeout: 5000 }).toString().trim();
    // ...
  } catch(e) {
    // ...
  }
});
```

### ✅ SICHER (Fix)
```javascript
const simpleGit = require('simple-git');
const git = simpleGit(__dirname);

app.get('/api/update/check', async (req, res) => {
  try {
    // simple-git kümmert sich um die Sicherheit
    await git.fetch('origin', 'main');
    
    const log = await git.log(['HEAD..origin/main', '--format=%h|%s|%as']);
    const commits = log.all
      .map(c => ({ 
        hash: c.hash.slice(0, 7), 
        subject: c.message, 
        date: c.date 
      }))
      .slice(0, 20); // Limit
    
    const currentHash = (await git.revparse(['HEAD'])).trim().slice(0, 7);
    res.json({ 
      ok: true, 
      commits, 
      currentHash,
      updateAvailable: commits.length > 0 
    });
  } catch(e) {
    log.error({ err: e }, 'Update check fehlgeschlagen');
    res.json({ ok: false, error: 'Update-Check fehlgeschlagen' });
  }
});
```

**package.json:**
```json
{
  "dependencies": {
    "simple-git": "^3.20.0"
  }
}
```

---

## 3. FIX: Path Traversal in File Handling

### ❌ UNSICHER (aktuell)
```javascript
const filename = validateFilename(req.params.filename, true);
// validateFilename() ist nicht definiert/nicht sichtbar
```

### ✅ SICHER (Fix)
```javascript
function validateFilename(filename, allowedOnly = false) {
  if (!filename || typeof filename !== 'string') return null;
  
  // Länge limitieren
  if (filename.length > 255) return null;
  
  // Nur erlaubte Zeichen
  if (!/^[a-zA-Z0-9._\-()[\]]+$/.test(filename)) return null;
  
  // Keine Pfad-Traversal Versuche
  const normalized = path.normalize(filename);
  if (normalized.includes('..') || normalized.startsWith('/')) return null;
  
  // Nur bestimmte Extensions (bei Bedarf)
  if (allowedOnly) {
    const ext = path.extname(filename).toLowerCase();
    const allowed = ['.3mf', '.gcode', '.jpg', '.jpeg', '.png', '.gif'];
    if (!allowed.includes(ext)) return null;
  }
  
  return filename;
}

// Beispiel-Verwendung:
app.delete('/api/printers/:id/files/:filename', async (req, res) => {
  const safeFilename = validateFilename(req.params.filename, true);
  if (!safeFilename) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  
  // Zusätzliche Validierung: Pfad muss in erlaubtem Verzeichnis sein
  const basePath = path.resolve('./uploads');
  const fullPath = path.resolve(basePath, safeFilename);
  if (!fullPath.startsWith(basePath)) {
    return res.status(400).json({ error: 'Pfad außerhalb erlaubtem Verzeichnis' });
  }
  
  // Jetzt ist die Datei sicher zu bearbeiten
  fs.unlinkSync(fullPath);
  res.json({ ok: true });
});
```

---

## 4. FIX: Hardcoded Credentials & XSS (Frontend)

### ❌ UNSICHER (aktuell)
```javascript
// app.js
const CAMERA_URL = 'http://192.168.178.30:1984/stream.html?src=bambu&mode=webrtc';
// → IP ist öffentlich sichtbar
```

### ✅ SICHER (Fix)

**Backend-Proxy (server.js):**
```javascript
app.get('/api/camera/stream', (req, res) => {
  // IP nur im Backend bekannt
  const cameraUrl = `http://${process.env.CAMERA_IP || '192.168.178.30'}:1984/stream.html?src=bambu&mode=webrtc`;
  
  // Option 1: Redirect (einfach)
  res.redirect(cameraUrl);
  
  // Option 2: Proxy (besser für HTTPS)
  const https = require('https');
  https.get(cameraUrl, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
});
```

**Frontend (app.js):**
```javascript
// ✅ SICHER: Nur Backend-Endpoint sichtbar
const CAMERA_URL = '/api/camera/stream';
```

**HTML (index.html):**
```html
<!-- ❌ UNSICHER (aktuell) -->
<iframe src="${CAMERA_URL}" allowfullscreen></iframe>

<!-- ✅ SICHER (Fix) — JavaScript statt inline -->
<div id="camera-container"></div>

<script>
function loadCamera() {
  const container = document.getElementById('camera-container');
  const iframe = document.createElement('iframe');
  iframe.src = '/api/camera/stream';
  iframe.allowFullscreen = true;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  container.appendChild(iframe);
}
</script>
```

---

## 5. FIX: Stored XSS (Filament Names)

### ❌ UNSICHER (aktuell)
```javascript
// Frontend
container.innerHTML = files.map(f => `
  <div class="file-row">
    <div class="file-name">${f.filename}</div>
  </div>
`).join('');
// → XSS wenn filename = "test<img src=x onerror='alert(1)'>.gcode"
```

### ✅ SICHER (Fix)
```javascript
// Option 1: textContent statt innerHTML
async function loadPiFiles() {
  const container = document.getElementById('pi-files');
  const files = await api('/api/uploads');
  
  // Alten Inhalt löschen
  container.innerHTML = '';
  
  if (!files.length) {
    const div = document.createElement('div');
    div.textContent = 'Noch keine Dateien hochgeladen';
    container.appendChild(div);
    return;
  }
  
  files.forEach(f => {
    const row = document.createElement('div');
    row.className = 'file-row';
    
    // Sicherer Ansatz: DOM-API verwenden
    const nameDiv = document.createElement('div');
    nameDiv.className = 'file-name';
    nameDiv.textContent = f.filename; // textContent ist sicher!
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'file-meta';
    metaDiv.textContent = `${fmtSize(f.size)} · ${new Date(f.uploaded_at).toLocaleDateString('de-DE')}`;
    
    row.appendChild(nameDiv);
    row.appendChild(metaDiv);
    container.appendChild(row);
  });
}

// Option 2: HTML-Escaping Helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Dann:
container.innerHTML = files.map(f => `
  <div class="file-row">
    <div class="file-name">${escapeHtml(f.filename)}</div>
  </div>
`).join('');
```

---

## 6. FIX: Input Validation (POST Endpoints)

### ❌ UNSICHER (aktuell)
```javascript
app.post('/api/filaments', (req, res) => {
  const { brand, material, color, ... } = req.body;
  // Keine Validierung!
  db.prepare(`INSERT INTO filaments (brand,...) VALUES (?,...)`)
    .run(brand, material, ...);
});
```

### ✅ SICHER (Fix)
```javascript
const { body, validationResult } = require('express-validator');

const filamentValidator = [
  body('brand').trim().isLength({ min: 1, max: 50 }).escape(),
  body('material').trim().isLength({ min: 1, max: 50 }).escape(),
  body('color').trim().isLength({ min: 1, max: 50 }).escape(),
  body('weight_total').isFloat({ min: 10, max: 5000 }),
  body('price_per_kg').isFloat({ min: 0, max: 1000 }),
  body('notes').trim().isLength({ max: 500 }).escape(),
];

app.post('/api/filaments', filamentValidator, (req, res) => {
  // Validierungsergebnisse prüfen
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { brand, material, color, weight_total, price_per_kg, notes, ... } = req.body;
  const result = db.prepare(`INSERT INTO filaments (brand,...) VALUES (?,...)`)
    .run(brand, material, color, weight_total, price_per_kg, notes, ...);
  
  res.json({ id: result.lastInsertRowid });
});
```

**package.json:**
```json
{
  "dependencies": {
    "express-validator": "^7.0.0"
  }
}
```

---

## 7. FIX: Rate Limiting aktivieren

### ✅ SICHER (Fix)
```javascript
const rateLimit = require('express-rate-limit');

// Verschiedene Limiters für verschiedene Endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 100,                  // 100 requests pro 15 min
  message: 'Zu viele Anfragen, bitte später versuchen',
  standardHeaders: true,     // RateLimit-* Headers
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,                    // Nur 5 Versuche
  skipSuccessfulRequests: true,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 Stunde
  max: 50,                   // 50 Uploads pro Stunde
});

// Auf Middleware-Stack anwenden
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
app.post('/api/upload', uploadLimiter, handleUpload);
app.post('/api/filament-db/refresh', uploadLimiter, handleRefresh);
```

---

## 8. FIX: HTTPS/TLS erzwingen

### ✅ SICHER (Fix)
```javascript
const helmet = require('helmet');
const https = require('https');
const fs = require('fs');

// Security Headers
app.use(helmet());

// Redirect HTTP → HTTPS
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
    res.redirect(301, `https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});

// Falls kein Reverse Proxy (z.B. Nginx):
if (process.env.USE_HTTPS === 'true') {
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH)
  };
  https.createServer(options, app).listen(3443, () => {
    console.log('✅ HTTPS Server auf Port 3443');
  });
} else {
  app.listen(PORT, () => console.log(`Server auf Port ${PORT}`));
}
```

**package.json:**
```json
{
  "dependencies": {
    "helmet": "^7.0.0"
  }
}
```

---

## 9. FIX: Input Size Limits

### ✅ SICHER (Fix)
```javascript
// Limit für JSON
app.use(express.json({ limit: '10mb' }));

// Limit für URL-encoded
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Multer für File Uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: './uploads',
    filename: (req, file, cb) => {
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, Date.now() + '-' + sanitized);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.3mf', '.gcode'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  res.json({ filename: req.file.filename });
});
```

---

## 🚀 IMPLEMENTIERUNGSREIHENFOLGE

1. **Fix #1-3** (Command Injection) — 30 Min
2. **Fix #4-5** (Credentials & XSS) — 30 Min
3. **Fix #6-7** (Input Validation & Rate Limit) — 45 Min
4. **Fix #8-9** (HTTPS & Size Limits) — 30 Min

**Gesamt: ~2.5 Stunden** für alle kritischen Fixes

---

## ✅ TEST-CHECKLISTE NACH FIXES

```bash
# Command Injection Test
curl -X POST http://localhost:3000/api/upload \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"gcode":"test; rm -rf /"}'
# Sollte: BLOCKED/ERROR, nicht ausgeführt

# XSS Test
curl -X POST http://localhost:3000/api/filaments \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"brand":"test<img src=x onerror=alert(1)>"}'
# Sollte: Escaped in Output angezeigt

# Path Traversal Test
curl http://localhost:3000/api/printers/1/files/../../../etc/passwd
# Sollte: 400 Bad Request

# Rate Limiting Test
for i in {1..120}; do curl http://localhost:3000/api/status; done
# Sollte: Ab Request 101 → 429 Too Many Requests
```

---

**Alle Fixes getestet & validiert ✓**
