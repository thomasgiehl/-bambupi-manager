const express = require('express');
const Database = require('better-sqlite3');
const mqtt = require('mqtt');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
const os = require('os');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const basicAuth = require('express-basic-auth');
const cookieParser = require('cookie-parser');
let AdmZip; try { AdmZip = require('adm-zip'); } catch(e) { AdmZip = null; }
require('dotenv').config();

// ── LOGGER (Pino) ─────────────────────────────
const pino = require('pino');
const log = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined
});

// Interne Fehlerdetails loggen, generische Meldung an Client senden.
function serverError(res, err, clientMsg = 'Interner Serverfehler') {
  log.error({ err }, clientMsg);
  res.status(500).json({ error: clientMsg });
}

// ── DATENBANK ─────────────────────────────────
const DB_PATH = './db/bambupi.db';
const db = new Database(DB_PATH);

// WAL-Mode: bessere Lese-/Schreib-Parallelität, atomare Commits
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 0600: nur der Service-User darf lesen/schreiben
try {
  if (fs.existsSync(DB_PATH)) fs.chmodSync(DB_PATH, 0o600);
} catch(e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS filaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    material TEXT NOT NULL,
    color TEXT NOT NULL,
    color_hex TEXT DEFAULT '#888888',
    diameter REAL DEFAULT 1.75,
    weight_total INTEGER DEFAULT 1000,
    weight_used REAL DEFAULT 0,
    price_per_kg REAL DEFAULT 0,
    temp_nozzle_min INTEGER,
    temp_nozzle_max INTEGER,
    temp_nozzle INTEGER,
    temp_bed INTEGER,
    temp_dry INTEGER,
    time_dry INTEGER,
    pa REAL,
    ka REAL,
    flow_rate REAL DEFAULT 100,
    shrink_factor REAL DEFAULT 100,
    location TEXT,
    notes TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS printers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, model TEXT DEFAULT 'X1C', ip TEXT NOT NULL,
    access_code TEXT NOT NULL, serial TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id INTEGER REFERENCES printers(id),
    filament_id INTEGER REFERENCES filaments(id),
    filename TEXT, grams_used REAL DEFAULT 0, duration_min INTEGER DEFAULT 0,
    electricity_cost REAL DEFAULT 0, filament_cost REAL DEFAULT 0,
    total_cost REAL DEFAULT 0, status TEXT DEFAULT 'running',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS ams_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id INTEGER NOT NULL, unit_idx INTEGER NOT NULL DEFAULT 0,
    slot_idx INTEGER NOT NULL, filament_id INTEGER REFERENCES filaments(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(printer_id, unit_idx, slot_idx)
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id INTEGER REFERENCES printers(id),
    type TEXT NOT NULL, -- 'info', 'warning', 'error', 'success'
    message TEXT NOT NULL,
    hms_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id INTEGER REFERENCES printers(id),
    name TEXT NOT NULL,
    threshold_hours INTEGER NOT NULL,
    last_reset_hours REAL DEFAULT 0,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS print_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id INTEGER REFERENCES printers(id),
    filename TEXT NOT NULL,
    options TEXT, -- JSON string
    status TEXT DEFAULT 'pending', -- 'pending', 'printing', 'completed', 'failed'
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS macros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '⚡',
    gcode TEXT NOT NULL,
    printer_id INTEGER REFERENCES printers(id) -- NULL = alle Drucker
  );
  CREATE TABLE IF NOT EXISTS timelapses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id INTEGER REFERENCES printers(id),
    filename TEXT NOT NULL,
    frame_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'recording', -- 'recording', 'rendering', 'done'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    expires_at DATETIME NOT NULL
  );
`);

// ── MIGRATION: neue Spalten falls DB schon existiert ──
const printCols = db.prepare("PRAGMA table_info(printers)").all().map(c => c.name);
if (!printCols.includes('total_print_minutes')) {
  db.prepare('ALTER TABLE printers ADD COLUMN total_print_minutes REAL DEFAULT 0').run();
}
if (!printCols.includes('timelapse_enabled')) {
  db.prepare('ALTER TABLE printers ADD COLUMN timelapse_enabled INTEGER DEFAULT 0').run();
}

const filCols = db.prepare("PRAGMA table_info(filaments)").all().map(c => c.name);
const newCols = [
  ['diameter', 'REAL DEFAULT 1.75'],
  ['temp_nozzle_min', 'INTEGER'],
  ['temp_nozzle_max', 'INTEGER'],
  ['temp_dry', 'INTEGER'],
  ['time_dry', 'INTEGER'],
  ['pa', 'REAL'],
  ['ka', 'REAL'],
  ['flow_rate', 'REAL DEFAULT 100'],
  ['shrink_factor', 'REAL DEFAULT 100'],
];
newCols.forEach(([col, type]) => {
  if (!filCols.includes(col)) {
    db.prepare(`ALTER TABLE filaments ADD COLUMN ${col} ${type}`).run();
    console.log(`✅ Spalte hinzugefügt: ${col}`);
  }
});

const defaultSettings = {
  electricity_cost: process.env.ELECTRICITY_COST || '0.35',
  printer_watt: process.env.PRINTER_WATT || '350',
  currency: 'EUR',
  machine_price: '700',
  machine_hours: '5000',
  failure_rate: '10',
  auto_cost_calc: '0',
  stay_logged_in: '1',
  telegram_token: '',
  telegram_chat_id: '',
  discord_webhook: '',
  notify_on_finish: '1',
  notify_on_fail: '1',
  notify_on_pause: '1'
};
for (const [key, value] of Object.entries(defaultSettings)) {
  const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (!exists) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function hasAdmin() {
  const user = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  return !!user;
}

// Bootstrap initial admin if ADMIN_PASS is set but no user exists
if (!hasAdmin() && process.env.ADMIN_PASS) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASS, 10);
  db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run('admin', hash);
  log.info('Initialer Admin-Account (admin) aus ADMIN_PASS erstellt.');
}

const app = express();
app.set('trust proxy', 1);
app.use(cookieParser());

// ── AUTH MIDDLEWARE ───────────────────────────
app.use((req, res, next) => {
  const adminExists = hasAdmin();
  
  // Setup-Flow
  if (!adminExists) {
    if (req.path === '/api/setup' || req.path === '/setup.html') return next();
    return res.redirect('/setup.html');
  }

  // Token-basierte Auth via Cookie (für "Angemeldet bleiben")
  const authToken = req.cookies.auth_token;
  if (authToken) {
    const session = db.prepare('SELECT user_id FROM auth_tokens WHERE token = ? AND expires_at > DATETIME("now")').get(authToken);
    if (session) {
      req.user_id = session.user_id;
      return next();
    }
  }

  // Fallback: Basic Auth (für API oder Erstanmeldung)
  return basicAuth({
    authorizer: (username, password) => {
      const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username);
      if (!user) return false;
      const match = bcrypt.compareSync(password, user.password_hash);
      if (match) {
        // Erfolgreich eingeloggt: Token generieren
        const stayLoggedIn = db.prepare('SELECT value FROM settings WHERE key = "stay_logged_in"').get()?.value === '1';
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = stayLoggedIn ? '30 days' : '1 day';
        db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, DATETIME("now", ?))').run(token, user.id, expiry);
        
        // Cookie setzen
        const maxAge = stayLoggedIn ? 30 * 24 * 60 * 60 * 1000 : undefined; // persistent vs session cookie
        res.cookie('auth_token', token, { 
          maxAge, 
          httpOnly: true, 
          sameSite: 'strict',
          path: '/'
        });
      }
      return match;
    },
    challenge: true,
    realm: 'BambuPi Manager'
  })(req, res, next);
});

// JSON Parser für POST Requests
app.use(express.json());

// ── SETUP ENDPOINTS ───────────────────────────
app.get('/api/setup/status', (req, res) => {
  res.json({ setup_required: !hasAdmin() });
});

app.post('/api/setup', (req, res) => {
  if (hasAdmin()) return res.status(403).json({ error: 'Setup bereits abgeschlossen' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username und Passwort erforderlich' });
  
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(username, hash);
    log.info({ username }, 'Admin Account erstellt');
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'Fehler beim Erstellen des Admin Accounts');
  }
});

// ── CORS ──────────────────────────────────────
// origin: false → kein Access-Control-Allow-Origin Header → Browser blockt
// cross-origin Requests. Verhindert CSRF von fremden Tabs/Seiten.
app.use(cors({ origin: false }));

// ── DNS-REBINDING-SCHUTZ ──────────────────────
// Erlaubte Hosts: localhost, 127.0.0.1 und die eigene LAN-IP(s).
// Blockiert Angriffe, bei denen ein fremder DNS-Name auf die Pi-IP zeigt.
function getAllowedHosts() {
  const PORT = process.env.PORT || 3000;
  const hosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

  // Alle IPv4-Adressen des Pi (LAN + Tailscale etc.)
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4') {
        hosts.add(`${iface.address}:${PORT}`);
      }
    }
  }

  // Hostname-Varianten (z. B. raspberrypi.local)
  const hn = os.hostname();
  hosts.add(`${hn}:${PORT}`);
  hosts.add(`${hn}.local:${PORT}`);

  // Optionaler Extra-Host aus .env (ALLOWED_HOST=meinpi.zuhause.de:3000)
  if (process.env.ALLOWED_HOST) hosts.add(process.env.ALLOWED_HOST);

  return hosts;
}
const allowedHosts = getAllowedHosts();
console.log('✅ Erlaubte Hosts:', [...allowedHosts].join(', '));

app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (!allowedHosts.has(host)) {
    return res.status(400).send('Bad Request: Host nicht erlaubt');
  }
  next();
});

app.use(express.json());

// ── SECURITY HEADERS ──────────────────────────
// frame-src dynamisch: alle Pi-IPs auf go2rtc-Port 1984 erlauben
const GO2RTC_PORT = process.env.GO2RTC_PORT || 1984;
const go2rtcFrameSrc = [...allowedHosts]
  .map(h => `http://${h.split(':')[0]}:${GO2RTC_PORT}`)
  .join(' ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://go2rtc.org https://unpkg.com; img-src 'self' data: blob: https://go2rtc.org; connect-src 'self' wss: ws:; style-src 'self' 'unsafe-inline' https://go2rtc.org; font-src 'self'; frame-src 'self' ${go2rtcFrameSrc}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ── RATE-LIMITING ─────────────────────────────
// Global: 100 Requests/Minute pro IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen — bitte warte eine Minute.' }
});
app.use('/api', globalLimiter);

// Strikt: 10 Requests/Minute — Upload, gcode-Push, Update-Check
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate-Limit erreicht — max. 10 Anfragen pro Minute.' }
});
app.use('/api/upload', strictLimiter);
app.use('/api/printers/:id/gcode', strictLimiter);
app.use('/api/update', strictLimiter);

app.use(express.static('public'));
app.use('/streams', express.static('streams'));
app.use('/uploads', express.static('uploads'));


// ── VERZEICHNISSE SICHERSTELLEN ───────────────
fs.mkdirSync('./db', { recursive: true });
fs.mkdirSync('./uploads', { recursive: true });
fs.mkdirSync('./streams', { recursive: true });
fs.mkdirSync('./cache', { recursive: true });
fs.mkdirSync('./thumbnails', { recursive: true });
fs.mkdirSync('./public/timelapses', { recursive: true });

// ── TLS / BAMBU CA ────────────────────────────
// BBL CA-Zertifikat aus ./certs/bambu-ca.crt laden.
// Ohne CA-Datei: Fallback auf rejectUnauthorized:false mit Warnung.
const BAMBU_CA_PATH = path.resolve(__dirname, 'certs/bambu-ca.crt');
let bambuCA = null;
try {
  bambuCA = fs.readFileSync(BAMBU_CA_PATH);
  console.log('🔒 Bambu CA geladen — TLS-Verifikation aktiv');
} catch (_) {
  console.warn('⚠️  certs/bambu-ca.crt nicht gefunden — TLS ohne CA-Verifikation (unsicher)');
}

// Gibt TLS-Optionen für MQTT und FTP zurück.
// checkServerIdentity: Bambu-Drucker nutzen ihre Seriennummer als CN, nicht die IP.
function bambuTlsOptions(serial) {
  if (!bambuCA) return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    ca: [bambuCA],
    checkServerIdentity: (host, cert) => {
      const cn = cert.subject?.CN;
      if (cn !== serial) return new Error(`TLS CN-Mismatch: erwartet ${serial}, bekommen ${cn}`);
      // CN stimmt → Zertifikat durch CA bereits verifiziert
    }
  };
}

// ── PATH-TRAVERSAL-SCHUTZ ─────────────────────
const UPLOAD_DIR = fs.realpathSync('./uploads');
const FILENAME_RE = /^[A-Za-z0-9._-]+\.(3mf|gcode|stl)$/i;

// Gibt den sicheren absoluten Pfad zurück oder null bei ungültigem Namen.
// Für FTP-Pfade (remote=true) reicht Basename + Regex; kein realpath nötig.
function validateFilename(filename, remote = false) {
  const base = path.basename(filename);
  if (!FILENAME_RE.test(base)) return null;
  if (remote) return base;
  const resolved = path.resolve(UPLOAD_DIR, base);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) return null;
  return resolved;
}

// ── MULTER ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const UPLOAD_ALLOWED_EXT = /\.(3mf|gcode|stl)$/i;
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if (UPLOAD_ALLOWED_EXT.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Nur .3mf, .gcode und .stl erlaubt'), { code: 'INVALID_TYPE' }));
    }
  }
});

// ── AES-256-GCM VERSCHLÜSSELUNG ──────────────
// access_code wird verschlüsselt in der DB gespeichert.
// Entschlüsselung nur intern beim MQTT/FTP-Connect.
const ENC_PREFIX = 'enc:';

function getEncryptionKey() {
  if (!process.env.ENCRYPTION_KEY) {
    const key = crypto.randomBytes(32).toString('hex');
    process.env.ENCRYPTION_KEY = key;
    const envPath = path.resolve(__dirname, '.env');
    let envContent = '';
    try { envContent = fs.readFileSync(envPath, 'utf8'); } catch (_) {}
    const re = /^ENCRYPTION_KEY=.*$/m;
    const line = `ENCRYPTION_KEY=${key}`;
    envContent = re.test(envContent) ? envContent.replace(re, line) : envContent + (envContent.endsWith('\n') ? '' : '\n') + line + '\n';
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('🔑 ENCRYPTION_KEY generiert und in .env gespeichert.');
  }
  return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
}

function encryptAccessCode(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ENC_PREFIX + iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + ct.toString('hex');
}

function decryptAccessCode(stored) {
  if (!stored || !stored.startsWith(ENC_PREFIX)) return stored; // Klartext-Fallback während Migration
  const parts = stored.slice(ENC_PREFIX.length).split(':');
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}

// ── MIGRATION: access_codes verschlüsseln ─────
(function migrateAccessCodes() {
  const rows = db.prepare('SELECT id, access_code FROM printers').all();
  let migrated = 0;
  for (const row of rows) {
    if (row.access_code && !row.access_code.startsWith(ENC_PREFIX)) {
      db.prepare('UPDATE printers SET access_code = ? WHERE id = ?')
        .run(encryptAccessCode(row.access_code), row.id);
      migrated++;
    }
  }
  if (migrated > 0) console.log(`🔐 ${migrated} access_code(s) verschlüsselt.`);
})();

// ── SSE ───────────────────────────────────────
const sseClients = new Set();
const printerNameCache = {};

function broadcastSSE(printerId) {
  if (sseClients.size === 0) return;
  if (!printerNameCache[printerId]) {
    const p = db.prepare('SELECT name FROM printers WHERE id = ?').get(printerId);
    if (p) printerNameCache[printerId] = p.name;
  }
  const payload = JSON.stringify({
    type: 'status',
    id: printerId,
    name: printerNameCache[printerId] || '',
    status: printerStatus[printerId] || { gcode_state: 'offline' }
  });
  const chunk = `data: ${payload}\n\n`;
  for (const res of sseClients) {
    try { res.write(chunk); } catch(e) { sseClients.delete(res); }
  }
}

// Heartbeat — verhindert Timeout bei inaktiver Verbindung
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': ping\n\n'); } catch(e) { sseClients.delete(res); }
  }
}, 25000);

// ── SETUP ENDPOINTS ───────────────────────────
app.get('/api/setup/status', (req, res) => {
  res.json({ setup_required: !hasAdmin() });
});

app.post('/api/setup', (req, res) => {
  if (hasAdmin()) return res.status(403).json({ error: 'Setup bereits abgeschlossen' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username und Passwort erforderlich' });
  
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(username, hash);
    log.info({ username }, 'Admin Account erstellt');
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err, 'Fehler beim Erstellen des Admin Accounts');
  }
});

// ── MACROS ────────────────────────────────────
app.get('/api/macros', (req, res) => {
  res.json(db.prepare('SELECT * FROM macros ORDER BY name ASC').all());
});

app.post('/api/macros', (req, res) => {
  const { name, icon, gcode, printer_id } = req.body;
  if (!name || !gcode) return res.status(400).json({ error: 'Name und G-Code erforderlich' });
  const result = db.prepare('INSERT INTO macros (name, icon, gcode, printer_id) VALUES (?, ?, ?, ?)')
    .run(name, icon || '⚡', gcode, printer_id || null);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/macros/:id', (req, res) => {
  db.prepare('DELETE FROM macros WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/macros/:id/run', (req, res) => {
  const macro = db.prepare('SELECT * FROM macros WHERE id = ?').get(req.params.id);
  if (!macro) return res.status(404).json({ error: 'Makro nicht gefunden' });
  
  const targetPrinterId = req.body.printer_id || macro.printer_id;
  if (!targetPrinterId) return res.status(400).json({ error: 'Kein Drucker ausgewählt' });
  
  const ok = sendGcode(targetPrinterId, macro.gcode);
  res.json({ ok });
});

// ── MQTT ──────────────────────────────────────
let printerStatus = {};
const printStartTimes = {};
const printerLastLayer = {};
let tempBuffers = {};          // { printerId: { n:[], b:[], t:[] } }
const TEMP_BUFFER_MAX = 600;     // ~10 Min bei 1 Update/Sek
const TEMP_CACHE_FILE = './cache/temp_history.json';

// Lade Temperaturverlauf aus Cache
try {
  if (fs.existsSync(TEMP_CACHE_FILE)) {
    tempBuffers = JSON.parse(fs.readFileSync(TEMP_CACHE_FILE, 'utf8'));
    console.log('📈 Temperaturverlauf aus Cache geladen');
  }
} catch (e) { console.log('⚠️ Fehler beim Laden des Temp-Caches:', e.message); }

// Periodisch speichern (alle 5 Min)
setInterval(() => {
  try {
    fs.mkdirSync('./cache', { recursive: true });
    fs.writeFileSync(TEMP_CACHE_FILE, JSON.stringify(tempBuffers));
  } catch (e) {}
}, 5 * 60 * 1000);

const eventLog = [];             // Letzte 50 Events für Event-Log Panel
const EVENT_LOG_MAX = 50;

// ── HMS ERROR MAPPING ─────────────────────────
const HMS_CODES = {
  '03000100': 'Bett-Heizung Fehler (Sensor)',
  '03000200': 'Bett-Heizung Fehler (Heizung)',
  '03000300': 'Bett-Heizung Fehler (Überhitzung)',
  '05000100': 'Nozzle-Heizung Fehler (Sensor)',
  '05000200': 'Nozzle-Heizung Fehler (Heizung)',
  '12000100': 'Lüfter Fehler (Teilekühler)',
  '12000200': 'Lüfter Fehler (Hotend)',
  '12000300': 'Lüfter Fehler (Gehäuse)',
  '12000400': 'Lüfter Fehler (MC-Board)',
  '12000500': 'Lüfter Fehler (Filter)',
  '0C000100': 'AMS Fehler (Einzug)',
  '0C000200': 'AMS Fehler (Auswurf)',
  '0C000300': 'AMS Fehler (Verstopfung)',
  '13000100': 'HMS Fehler (Lidar/Laser)',
  '13000200': 'HMS Fehler (Bett scannen)',
  '1b000100': 'HMS Fehler (Motor/Achse)',
  '1b000200': 'HMS Fehler (Homing)'
};

function translateHMS(code) {
  if (!code) return null;
  // Code formatieren: 0300 0100 -> 03000100
  const clean = code.toString().replace(/\s/g, '').toLowerCase();
  return HMS_CODES[clean] || `Unbekannter Fehler (${code})`;
}

// ── EXTERNAL NOTIFICATIONS ───────────────────
async function sendExternalNotif(title, message) {
  const s = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value]));
  const text = `🔔 *${title}*\n${message}`;

  // Telegram
  if (s.telegram_token && s.telegram_chat_id) {
    try {
      await fetch(`https://api.telegram.org/bot${s.telegram_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: s.telegram_chat_id, text, parse_mode: 'Markdown' })
      });
    } catch (e) { log.error({ err: e }, 'Telegram Notif failed'); }
  }

  // Discord
  if (s.discord_webhook) {
    try {
      await fetch(s.discord_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `**${title}**\n${message}` })
      });
    } catch (e) { log.error({ err: e }, 'Discord Notif failed'); }
  }
}

function sendNotif(title, message, forceExternal = false) {
  // Immer via SSE für Browser-Push (via Frontend-Logik)
  const payload = JSON.stringify({ type: 'notification', title, message });
  const chunk = `data: ${payload}\n\n`;
  for (const res of sseClients) {
    try { res.write(chunk); } catch(e) { sseClients.delete(res); }
  }
  
  if (forceExternal) {
    sendExternalNotif(title, message);
  }
}

// ── SETTINGS HELPERS ──────────────────────────
function getSetting(key, def = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : def;
}

function addEvent(type, message, printerId = null, hmsCode = null) {
  // In-Memory Liste für schnellen Abruf (optional, wir nutzen jetzt DB)
  eventLog.unshift({
    type,       // 'finish' | 'fail' | 'pause' | 'start' | 'offline' | 'info'
    message,
    printerId,
    hmsCode,
    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    ts: Date.now()
  });
  if (eventLog.length > EVENT_LOG_MAX) eventLog.pop();

  // In Datenbank persistieren
  try {
    db.prepare('INSERT INTO events (printer_id, type, message, hms_code) VALUES (?, ?, ?, ?)').run(printerId, type, message, hmsCode);
  } catch (e) { log.error({ err: e }, 'DB Event Logging'); }

  // Sofort via SSE an alle Clients pushen
  const payload = JSON.stringify({ type: 'event', printer_id: printerId, event_type: type, message, hms_code: hmsCode, created_at: new Date().toISOString() });
  const chunk = `data: ${payload}\n\n`;
  for (const res of sseClients) {
    try { res.write(chunk); } catch(e) { sseClients.delete(res); }
  }

  // Externe Benachrichtigungen
  const s = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value]));
  if (type === 'finish' && s.notify_on_finish === '1') sendExternalNotif('Druck fertig ✅', message);
  if (type === 'fail'   && s.notify_on_fail === '1')   sendExternalNotif('Druckfehler ❌', message);
  if (type === 'pause'  && s.notify_on_pause === '1')  sendExternalNotif('Druck pausiert ⏸', message);
  if (type === 'error')                                sendExternalNotif('Systemfehler ⚠️', message);
}

const MATERIAL_DENSITY = {
  'PLA-CF': 1.30, 'PETG-CF': 1.30, 'PA-CF': 1.20,
  'PLA': 1.24, 'PETG': 1.27, 'ABS': 1.04, 'ASA': 1.07,
  'TPU': 1.21, 'TPE': 1.20, 'PA': 1.14, 'PC': 1.20,
  'PVA': 1.23, 'HIPS': 1.07
};

function handlePrintFinished(printerId, printData) {
  try {
    const durationMin = printStartTimes[printerId]
      ? Math.round((Date.now() - printStartTimes[printerId]) / 60000) : 0;
    delete printStartTimes[printerId];

    if (durationMin > 0) {
      db.prepare('UPDATE printers SET total_print_minutes = total_print_minutes + ? WHERE id = ?').run(durationMin, printerId);
    }

    // Aktiven AMS-Slot bestimmen (tray_now: 0-15, 255=extern)
    const trayNow = parseInt(printData?.ams?.tray_now);
    let row = null;
    if (!isNaN(trayNow) && trayNow !== 255) {
      row = db.prepare(
        'SELECT a.filament_id, f.material, f.price_per_kg, f.diameter FROM ams_slots a JOIN filaments f ON a.filament_id=f.id WHERE a.printer_id=? AND a.unit_idx=? AND a.slot_idx=?'
      ).get(printerId, Math.floor(trayNow / 4), trayNow % 4);
    }
    // Fallback: erster zugewiesener Slot
    if (!row) {
      row = db.prepare(
        'SELECT a.filament_id, f.material, f.price_per_kg, f.diameter FROM ams_slots a JOIN filaments f ON a.filament_id=f.id WHERE a.printer_id=? ORDER BY a.unit_idx, a.slot_idx LIMIT 1'
      ).get(printerId);
    }
    // Gramm berechnen aus filament_used — Bambu meldet in Metern (z.B. 16.8 für ~50g PLA)
    const usedM = parseFloat(printData.filament_used) || 0;
    let grams = 0;
    const diameter = row?.diameter || 1.75;
    if (usedM > 0) {
      const r = diameter / 2 / 10; // mm → cm
      const densityKey = Object.keys(MATERIAL_DENSITY).find(k => (row?.material || '').startsWith(k)) || 'PLA';
      grams = Math.round(Math.PI * r * r * (usedM * 100) * MATERIAL_DENSITY[densityKey] * 10) / 10;
    }

    if (row && grams > 0) {
      db.prepare('UPDATE filaments SET weight_used = weight_used + ? WHERE id = ?').run(grams, row.filament_id);
    }

    const s = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, parseFloat(r.value)]));
    const filamentCost = row ? (grams / 1000) * (row.price_per_kg || 0) : 0;
    const electricityCost = (durationMin / 60) * ((s.printer_watt || 350) / 1000) * (s.electricity_cost || 0.35);
    db.prepare("INSERT INTO print_jobs (printer_id,filament_id,filename,grams_used,duration_min,electricity_cost,filament_cost,total_cost,status,finished_at) VALUES (?,?,?,?,?,?,?,?,'finished',CURRENT_TIMESTAMP)")
      .run(printerId, row?.filament_id || null, printData.subtask_name || '', grams, durationMin, electricityCost, filamentCost, filamentCost + electricityCost);

    console.log(`✅ Auto-Tracking: "${printData.subtask_name || '?'}" — ${grams}g, ${durationMin}min, ${(filamentCost + electricityCost).toFixed(2)}€`);
  } catch (e) {
    console.log('⚠️ Auto-Tracking Fehler:', e.message);
  }
}

// ── TIMELAPSE ─────────────────────────────────
async function captureTimelapseFrame(printerId, subtask) {
  const dir = `./timelapses/${printerId}/${subtask}`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const frames = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).length;
    const response = await fetch('http://localhost:1984/api/frame.jpeg?src=bambu');
    if (!response.ok) return;
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(`${dir}/frame_${String(frames).padStart(5, '0')}.jpg`, Buffer.from(buffer));
  } catch (e) { log.warn('Timelapse frame failed', e.message); }
}

function renderTimelapse(printerId, subtask) {
  const dir = `./timelapses/${printerId}/${subtask}`;
  const outFile = `./public/timelapses/${printerId}_${subtask}_${Date.now()}.mp4`;
  fs.mkdirSync('./public/timelapses', { recursive: true });
  
  const cmd = `ffmpeg -y -framerate 15 -i ${dir}/frame_%05d.jpg -c:v libx264 -pix_fmt yuv420p ${outFile}`;
  spawn('sh', ['-c', cmd]).on('exit', () => {
    db.prepare('INSERT INTO timelapses (printer_id, filename, status) VALUES (?, ?, ?)')
      .run(printerId, path.basename(outFile), 'done');
    log.info(`Timelapse rendered: ${outFile}`);
    // Optional: aufräumen
    // fs.rmSync(dir, { recursive: true, force: true });
  });
}

function connectMQTT(ip, accessCode, serial, printerId) {
  const client = mqtt.connect(`mqtts://${ip}:8883`, {
    username: 'bblp', password: accessCode,
    ...bambuTlsOptions(serial),
    reconnectPeriod: 5000
  });
  client.on('connect', () => {
    console.log(`✅ MQTT verbunden: ${ip}`);
    client.subscribe(`device/${serial}/report`);
  });
  client.on('message', (topic, msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.print) {
        const prevState = printerStatus[printerId]?.gcode_state;
        const newState = data.print.gcode_state;
        
        // Normalisierung: Kammer-Temperatur sicherstellen
        if (data.print.info?.temp !== undefined && data.print.chamber_temper === undefined) {
          data.print.chamber_temper = data.print.info.temp;
        }

        printerStatus[printerId] = { ...(printerStatus[printerId] || {}), ...data.print, last_update: new Date().toISOString() };
        // Temperatur-Ringbuffer befüllen
        const nozzle  = data.print.nozzle_temper || 0;
        const bed     = data.print.bed_temper    || 0;
        // Kammer-Temperatur: chamber_temper (X1) oder info.temp (P1/A1)
        const chamber = data.print.chamber_temper ?? data.print.info?.temp ?? 0;
        
        if (nozzle > 0 || bed > 0 || chamber > 0) {
          if (!tempBuffers[printerId]) tempBuffers[printerId] = { n: [], b: [], t: [], c: [] };
          const buf = tempBuffers[printerId];
          buf.t.push(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          buf.n.push(Math.round(nozzle * 10) / 10);
          buf.b.push(Math.round(bed    * 10) / 10);
          buf.c.push(Math.round(chamber * 10) / 10);
          if (buf.t.length > TEMP_BUFFER_MAX) {
            buf.t.shift(); buf.n.shift(); buf.b.shift(); buf.c.shift();
          }
        }
        broadcastSSE(printerId);
        // Event-Log befüllen bei Zustandswechsel
        const printerName = db.prepare('SELECT name FROM printers WHERE id=?').get(printerId)?.name || 'Drucker';
        const jobName = data.print.subtask_name ? ' · ' + data.print.subtask_name : '';
        const currentLayer = data.print.layer_num || 0;

        // Timelapse Frame Capture
        const printer = db.prepare('SELECT timelapse_enabled FROM printers WHERE id = ?').get(printerId);
        if (printer?.timelapse_enabled && newState === 'RUNNING' && currentLayer !== printerLastLayer[printerId]) {
          printerLastLayer[printerId] = currentLayer;
          captureTimelapseFrame(printerId, data.print.subtask_name || 'print');
        }

        if (prevState !== newState) {
          if (newState === 'RUNNING')  addEvent('start',  printerName + jobName + ' — Druck gestartet', printerId);
          if (newState === 'FINISH') {
            addEvent('finish', printerName + jobName + ' — Fertig ✅', printerId);
            if (getSetting('notify_on_finish') === '1') sendNotif('✅ Druck abgeschlossen', `${printerName}${jobName}`, false);
            if (printer?.timelapse_enabled) renderTimelapse(printerId, data.print.subtask_name || 'print');
          }
          if (newState === 'FAILED') {
            addEvent('fail',   printerName + jobName + ' — Fehlgeschlagen ❌', printerId);
            if (getSetting('notify_on_fail') === '1') sendNotif('❌ Druck fehlgeschlagen', `${printerName}${jobName}`, false);
          }
          if (newState === 'PAUSE') {
            addEvent('pause',  printerName + ' — Pausiert', printerId);
            if (getSetting('notify_on_pause') === '1') sendNotif('⏸ Druck pausiert', `${printerName}`, false);
          }
          if (newState === 'offline')  addEvent('offline',printerName + ' — Verbindung verloren', printerId);
        }
        if (prevState !== 'RUNNING' && newState === 'RUNNING') {
          printStartTimes[printerId] = Date.now();
        }
        if (prevState && prevState !== 'FINISH' && prevState !== 'FAILED' &&
            (newState === 'FINISH' || newState === 'FAILED')) {
          handlePrintFinished(printerId, printerStatus[printerId]);
        }

        // HMS Fehlerüberwachung
        if (data.print.hms && Array.isArray(data.print.hms)) {
          data.print.hms.forEach(h => {
            const code = h.attr?.toString(16).toUpperCase().padStart(8, '0') || h.code;
            if (code && code !== '00000000') {
              const translated = translateHMS(code);
              // Nur loggen wenn es neu ist oder sich geändert hat (Vermeidung von Spam)
              const lastHMS = printerStatus[printerId]?.last_hms_code;
              if (lastHMS !== code) {
                addEvent('error', `⚠️ HMS: ${translated}`, printerId, code);
                printerStatus[printerId].last_hms_code = code;
                // Benachrichtigung senden
                sendNotif(`Drucker-Fehler (${printerName})`, translated);
              }
            }
          });
        }
      }
    } catch (e) {}
  });
  client.on('error', (err) => log.warn({ err, ip }, 'MQTT Fehler'));
  return client;
}

function sendMQTT(printerId, payload) {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId);
  if (!printer) return false;
  const client = mqttClients[printerId];
  if (!client) return false;
  client.publish(`device/${printer.serial}/request`, JSON.stringify(payload), { qos: 1 });
  return true;
}

function sendGcode(printerId, gcode) {
  return sendMQTT(printerId, { print: { sequence_id: '0', command: 'gcode_line', param: gcode + '\n' } });
}

function startPrintOnBambu(printerId, filename, options = {}) {
  const { timelapse, bed_levelling, flow_cali, vibration_cali, use_ams } = options;
  
  // Filament-Gewichts-Check
  try {
    const filePath = validateFilename(filename);
    if (filePath && fs.existsSync(filePath)) {
      const meta = extractPrintMetadata(filePath);
      if (meta && meta.weight_g) {
        const status = printerStatus[printerId];
        const trayNow = parseInt(status?.ams?.tray_now);
        let filament = null;
        if (!isNaN(trayNow) && trayNow !== 255) {
          filament = db.prepare('SELECT f.* FROM ams_slots a JOIN filaments f ON a.filament_id=f.id WHERE a.printer_id=? AND a.unit_idx=? AND a.slot_idx=?')
            .get(printerId, Math.floor(trayNow / 4), trayNow % 4);
        } else {
          filament = db.prepare('SELECT f.* FROM ams_slots a JOIN filaments f ON a.filament_id=f.id WHERE a.printer_id=? ORDER BY a.unit_idx, a.slot_idx LIMIT 1')
            .get(printerId);
        }
        
        if (filament) {
          const available = filament.weight_total - filament.weight_used;
          if (available < meta.weight_g) {
            addEvent('warning', `⚠️ Filament-Warnung: "${filament.brand} ${filament.material}" reicht evtl. nicht (verfügbar: ${Math.round(available)}g, benötigt: ${Math.round(meta.weight_g)}g)`, printerId);
          }
        }
      }
    }
  } catch (e) { log.warn({ err: e }, 'Filament weight check failed'); }

  return sendMQTT(printerId, {
    print: {
      sequence_id: '0',
      command: 'project_file',
      param: 'Metadata/plate_1.gcode',
      url: `ftp:///` + filename,
      timelapse: !!timelapse,
      bed_levelling: bed_levelling !== false,
      flow_cali: !!flow_cali,
      vibration_cali: vibration_cali !== false,
      layer_inspect: true,
      use_ams: use_ams !== false
    }
  });
}

const mqttClients = {};
const printerBedCleared = {}; // { printerId: boolean }

// ── QUEUE WORKER ──────────────────────────────
setInterval(() => {
  const pendingJobs = db.prepare("SELECT * FROM print_queue WHERE status = 'pending' ORDER BY added_at ASC").all();
  if (pendingJobs.length === 0) return;

  pendingJobs.forEach(job => {
    const status = printerStatus[job.printer_id];
    // Wenn der Drucker IDLE ist UND das Bett als leer markiert wurde
    if (status && status.gcode_state === 'IDLE' && printerBedCleared[job.printer_id]) {
      try {
        const options = JSON.parse(job.options || '{}');
        const ok = startPrintOnBambu(job.printer_id, job.filename, options);
        if (ok) {
          db.prepare("UPDATE print_queue SET status = 'printing' WHERE id = ?").run(job.id);
          printerBedCleared[job.printer_id] = false; // Zurücksetzen nach Start
          addEvent('info', `Queue: Job "${job.filename}" auf Drucker gestartet`, job.printer_id);
        }
      } catch (e) {
        log.error({ err: e, job }, 'Queue Worker failed to start job');
        db.prepare("UPDATE print_queue SET status = 'failed' WHERE id = ?").run(job.id);
      }
    }
  });
}, 10000); // Alle 10 Sekunden prüfen

function initMaintenanceTasks(printerId) {
  const defaults = [
    ['Carbon-Stangen reinigen', 50],
    ['Achsen schmieren (X/Y)', 100],
    ['Z-Spindeln fetten', 200],
    ['Hotend-Lüfter prüfen', 300]
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO maintenance_tasks (printer_id, name, threshold_hours) VALUES (?, ?, ?)');
  defaults.forEach(([name, hours]) => stmt.run(printerId, name, hours));
}

// ── AI SPAGHETTI DETECTION (EXPERIMENTELL) ───
setInterval(async () => {
  try {
    const settings = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value]));
    if (settings.spaghetti_detect !== '1') return;

    for (const [pid, status] of Object.entries(printerStatus)) {
      if (status && status.gcode_state === 'RUNNING') {
        log.info({ pid }, 'KI-Check: Analysiere Stream auf Fehldrucke...');
        // In einer echten Implementierung würde hier ein Frame an ein Modell gesendet werden.
        // Da wir lokal auf dem Pi sind, simulieren wir hier die Bereitschaft des Frameworks.
        // placeholder for future: analyzeFrame(pid);
      }
    }
  } catch (e) {}
}, 45000);

const savedPrinters = db.prepare('SELECT * FROM printers').all();
savedPrinters.forEach(p => {
  mqttClients[p.id] = connectMQTT(p.ip, decryptAccessCode(p.access_code), p.serial, p.id);
  initMaintenanceTasks(p.id);
});

// ── ORCA FILAMENT DATABASE ────────────────────
const https = require('https');
const ORCA_CACHE_FILE = './cache/orca_filaments.json';
const ORCA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
let orcaDb = {};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'BambuPi-Manager/1.0' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    const req = https.get(url, { headers }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return resolve(httpsGet(res.headers.location));
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchParallel(urls, size = 10) {
  const results = [];
  for (let i = 0; i < urls.length; i += size) {
    const batch = await Promise.allSettled(urls.slice(i, i + size).map(u => httpsGet(u)));
    results.push(...batch);
  }
  return results;
}

function parseOrcaProfile(profile, brandFallback) {
  const g = arr => Array.isArray(arr) ? arr[0] : arr;
  const vendor = g(profile.filament_vendor) || brandFallback;
  const material = g(profile.filament_type);
  if (!vendor || !material) return null;
  return {
    vendor, material,
    nozzle:     parseInt(g(profile.nozzle_temperature)) || null,
    nozzle_min: parseInt(g(profile.nozzle_temperature_range_low)) || null,
    nozzle_max: parseInt(g(profile.nozzle_temperature_range_high)) || null,
    bed:        parseInt(g(profile.hot_plate_temp)) || parseInt(g(profile.textured_plate_temp)) || parseInt(g(profile.cool_plate_temp)) || null,
    density:    parseFloat(g(profile.filament_density)) || null,
    price:      parseFloat(g(profile.filament_cost)) || null,
    dry_temp:   parseInt(g(profile.temperature_vitrification)) || null,
  };
}

async function fetchProfilesFromRepo(repo, branch, db) {
  const brandFolders = await httpsGet(`https://api.github.com/repos/${repo}/contents/resources/profiles`);
  if (!Array.isArray(brandFolders)) throw new Error(`GitHub API Fehler (${repo}): ` + (brandFolders.message || ''));
  for (const folder of brandFolders.filter(f => f.type === 'dir')) {
    try {
      const files = await httpsGet(`https://api.github.com/repos/${repo}/contents/resources/profiles/${encodeURIComponent(folder.name)}/filament`);
      if (!Array.isArray(files)) continue;
      const baseFiles = files.filter(f => f.type === 'file' && f.name.endsWith('.json') && (f.name.includes('@base') || !f.name.includes('@')));
      const urls = baseFiles.map(f => `https://raw.githubusercontent.com/${repo}/${branch}/resources/profiles/${encodeURIComponent(folder.name)}/filament/${encodeURIComponent(f.name)}`);
      const results = await fetchParallel(urls, 10);
      results.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const p = parseOrcaProfile(r.value, folder.name);
        if (!p) return;
        if (!db[p.vendor]) db[p.vendor] = {};
        if (!db[p.vendor][p.material]) db[p.vendor][p.material] = p; // kein Überschreiben
      });
    } catch(e) {}
  }
}

async function buildOrcaDb() {
  const db = {};
  const repos = [
    { repo: 'bambulab/BambuStudio', branch: 'master', name: 'Bambu Studio' },
  ];
  for (const { repo, branch, name } of repos) {
    try {
      console.log(`🌐 Lade Filament-Profile von ${name}...`);
      await fetchProfilesFromRepo(repo, branch, db);
      console.log(`✅ ${name} geladen (jetzt ${Object.keys(db).length} Hersteller)`);
    } catch(e) {
      console.log(`⚠️ ${name} Fehler: ${e.message}`);
    }
  }
  return db;
}

async function loadOrcaDb() {
  try {
    if (fs.existsSync(ORCA_CACHE_FILE)) {
      const age = Date.now() - fs.statSync(ORCA_CACHE_FILE).mtimeMs;
      if (age < ORCA_CACHE_TTL) {
        orcaDb = JSON.parse(fs.readFileSync(ORCA_CACHE_FILE, 'utf8'));
        mergeExtraVendors(orcaDb);
        console.log(`📦 OrcaSlicer DB aus Cache (${Object.keys(orcaDb).length} Hersteller)`);
        return;
      }
    }
  } catch(e) {}
  try {
    orcaDb = await buildOrcaDb();
    mergeExtraVendors(orcaDb);
    fs.mkdirSync('./cache', { recursive: true });
    fs.writeFileSync(ORCA_CACHE_FILE, JSON.stringify(orcaDb));
    console.log(`✅ OrcaSlicer DB: ${Object.keys(orcaDb).length} Hersteller geladen`);
  } catch(e) {
    console.log('⚠️ OrcaSlicer DB Fehler:', e.message);
  }
}
// Hersteller die nicht in GitHub-Repos sind → feste Einträge
const EXTRA_VENDORS = {
  'Sunlu': {
    'PLA':      { vendor:'Sunlu', material:'PLA',      nozzle:215, nozzle_min:200, nozzle_max:230, bed:60,  density:1.24, price:18, dry_temp:45 },
    'PLA+':     { vendor:'Sunlu', material:'PLA+',     nozzle:215, nozzle_min:200, nozzle_max:230, bed:60,  density:1.24, price:20, dry_temp:45 },
    'PETG':     { vendor:'Sunlu', material:'PETG',     nozzle:225, nozzle_min:220, nozzle_max:235, bed:65,  density:1.27, price:22, dry_temp:55 },
    'ABS':      { vendor:'Sunlu', material:'ABS',      nozzle:255, nozzle_min:250, nozzle_max:260, bed:90,  density:1.04, price:20, dry_temp:80 },
    'ASA':      { vendor:'Sunlu', material:'ASA',      nozzle:250, nozzle_min:245, nozzle_max:255, bed:90,  density:1.07, price:24, dry_temp:80 },
    'TPU':      { vendor:'Sunlu', material:'TPU',      nozzle:225, nozzle_min:210, nozzle_max:240, bed:40,  density:1.21, price:26, dry_temp:50 },
    'PLA-CF':   { vendor:'Sunlu', material:'PLA-CF',   nozzle:220, nozzle_min:215, nozzle_max:225, bed:60,  density:1.30, price:28, dry_temp:55 },
    'PETG-CF':  { vendor:'Sunlu', material:'PETG-CF',  nozzle:230, nozzle_min:220, nozzle_max:240, bed:65,  density:1.30, price:30, dry_temp:65 },
    'PA6':      { vendor:'Sunlu', material:'PA6',      nozzle:265, nozzle_min:260, nozzle_max:270, bed:90,  density:1.14, price:32, dry_temp:80 },
    'PA6-CF':   { vendor:'Sunlu', material:'PA6-CF',   nozzle:275, nozzle_min:270, nozzle_max:280, bed:100, density:1.20, price:45, dry_temp:80 },
  },
};

function mergeExtraVendors(db) {
  for (const [vendor, materials] of Object.entries(EXTRA_VENDORS)) {
    if (!db[vendor]) db[vendor] = {};
    for (const [mat, data] of Object.entries(materials)) {
      if (!db[vendor][mat]) db[vendor][mat] = data;
    }
  }
}

loadOrcaDb().catch(() => {});
setInterval(() => loadOrcaDb().catch(() => {}), ORCA_CACHE_TTL);

app.get('/api/filament-db', (req, res) => res.json(orcaDb));

// Bambu Studio Filament-Import (lokal)
app.get('/api/filament-db/bambu', (req, res) => {
  try {
    const home = os.homedir();
    const configPath = path.join(home, '.config', 'BambuStudio', 'user');
    if (!fs.existsSync(configPath)) return res.json({});

    const results = {};
    const uids = fs.readdirSync(configPath).filter(f => fs.statSync(path.join(configPath, f)).isDirectory());

    for (const uid of uids) {
      const filPath = path.join(configPath, uid, 'filament');
      if (!fs.existsSync(filPath)) continue;

      const files = fs.readdirSync(filPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(filPath, file), 'utf8'));
          const vendor = content.filament_vendor || 'Bambu Studio';
          const mat = content.filament_type || 'Unknown';

          if (!results[vendor]) results[vendor] = {};
          results[vendor][mat] = {
            vendor,
            material: mat,
            nozzle: parseInt(Array.isArray(content.nozzle_temperature) ? content.nozzle_temperature[0] : content.nozzle_temperature) || null,
            bed: parseInt(Array.isArray(content.bed_temperature) ? content.bed_temperature[0] : content.bed_temperature) || null,
            price: parseFloat(content.filament_cost) || null,
            // Weitere Felder falls nötig
          };
        } catch (e) {}
      }
    }
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/filament-db/refresh', async (req, res) => {
  try {
    if (fs.existsSync(ORCA_CACHE_FILE)) fs.unlinkSync(ORCA_CACHE_FILE);
    await loadOrcaDb();
    res.json({ ok: true, brands: Object.keys(orcaDb).length });
  } catch(e) { log.error({ err: e }, 'OrcaDB reload'); res.json({ ok: false, error: 'Reload fehlgeschlagen' }); }
});

// ── API STATUS ────────────────────────────────
app.get('/api/status', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.post('/api/queue/clear-bed', (req, res) => {
  const { printer_id } = req.body;
  if (!printer_id) return res.status(400).json({ error: 'printer_id missing' });
  printerBedCleared[printer_id] = true;
  addEvent('info', 'Druckbett als leer markiert', printer_id);
  res.json({ ok: true });
});

// ── SERVER-SENT EVENTS ────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: kein buffering
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));

  // Sofort aktuellen Status senden
  const printers = db.prepare('SELECT id, name, model, ip FROM printers').all();
  printers.forEach(p => {
    const payload = JSON.stringify({
      type: 'status',
      id: p.id,
      name: p.name,
      model: p.model,
      ip: p.ip,
      status: printerStatus[p.id] || { gcode_state: 'offline' }
    });
    res.write(`data: ${payload}\n\n`);
  });
});

// ── TEMPERATUR-HISTORIE (Server-Ringbuffer) ───
app.get('/api/printers/:id/temp-history', (req, res) => {
  res.json(tempBuffers[req.params.id] || { n: [], b: [], t: [] });
});

// ── EVENT-LOG ─────────────────────────────────
// ── EVENT LOG ─────────────────────────────────
app.get('/api/event-log', (req, res) => {
  // Letzte 50 Events aus der Datenbank laden
  const rows = db.prepare(`
    SELECT e.*, p.name as printer_name 
    FROM events e 
    LEFT JOIN printers p ON e.printer_id = p.id 
    ORDER BY e.created_at DESC LIMIT 50
  `).all();
  
  // Formatieren für das Frontend (Kompatibilität mit altem In-Memory Log)
  const formatted = rows.map(r => ({
    id: r.id,
    type: r.type,
    message: r.message,
    hmsCode: r.hms_code,
    printerId: r.printer_id,
    printerName: r.printer_name,
    time: new Date(r.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    ts: new Date(r.created_at).getTime()
  }));
  res.json(formatted);
});

app.post('/api/event-log/clear', (req, res) => {
  db.prepare('DELETE FROM events').run();
  eventLog.length = 0;
  res.json({ ok: true });
});

// ── SYSTEM MONITOR ────────────────────────────
app.get('/api/system', (req, res) => {
  const load = os.loadavg()[0];
  const cpuPct = Math.min(100, Math.round((load / os.cpus().length) * 100));
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
  let piTemp = null;
  try { piTemp = (parseInt(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8')) / 1000).toFixed(1); } catch(e) {}
  res.json({
    cpu: cpuPct,
    mem_pct: usedMemPct,
    mem_total_mb: Math.round(totalMem / 1048576),
    mem_free_mb: Math.round(freeMem / 1048576),
    pi_temp: piTemp,
    uptime_min: Math.round(os.uptime() / 60)
  });
});

// ── DRUCKER ───────────────────────────────────
app.get('/api/printers', (req, res) => {
  const list = db.prepare('SELECT id, name, model, ip, added_at, timelapse_enabled, total_print_minutes FROM printers').all();
  res.json(list.map(p => ({ ...p, status: printerStatus[p.id] || { state: 'offline' } })));
});

app.post('/api/printers', (req, res) => {
  const { name, model, ip, access_code, serial, timelapse_enabled } = req.body;
  const result = db.prepare('INSERT INTO printers (name,model,ip,access_code,serial,timelapse_enabled) VALUES (?,?,?,?,?,?)')
    .run(name, model || 'X1C', ip, encryptAccessCode(access_code), serial, timelapse_enabled ? 1 : 0);
  const pid = result.lastInsertRowid;
  mqttClients[pid] = connectMQTT(ip, access_code, serial, pid);
  initMaintenanceTasks(pid);
  res.json({ id: pid });
});

app.patch('/api/printers/:id', (req, res) => {
  const { name, model, ip, access_code, serial, timelapse_enabled } = req.body;
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Drucker nicht gefunden' });

  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name=?'); params.push(name); }
  if (model !== undefined) { sets.push('model=?'); params.push(model); }
  if (ip !== undefined) { sets.push('ip=?'); params.push(ip); }
  if (serial !== undefined) { sets.push('serial=?'); params.push(serial); }
  if (timelapse_enabled !== undefined) { sets.push('timelapse_enabled=?'); params.push(timelapse_enabled ? 1 : 0); }
  if (access_code) { sets.push('access_code=?'); params.push(encryptAccessCode(access_code)); }

  if (sets.length > 0) {
    params.push(req.params.id);
    db.prepare(`UPDATE printers SET ${sets.join(',')} WHERE id = ?`).run(...params);
    
    // MQTT neu verbinden falls IP/Code/Serial geändert
    if (ip || access_code || serial) {
      if (mqttClients[req.params.id]) mqttClients[req.params.id].end();
      const updated = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
      mqttClients[req.params.id] = connectMQTT(updated.ip, decryptAccessCode(updated.access_code), updated.serial, req.params.id);
    }
  }
  res.json({ ok: true });
});

app.delete('/api/printers/:id', (req, res) => {
  db.prepare('DELETE FROM printers WHERE id = ?').run(req.params.id);
  if (mqttClients[req.params.id]) { mqttClients[req.params.id].end(); delete mqttClients[req.params.id]; }
  res.json({ ok: true });
});

app.get('/api/printers/:id/status', (req, res) => {
  res.json(printerStatus[req.params.id] || { state: 'offline' });
});

app.get('/api/printers/:id/maintenance', (req, res) => {
  const tasks = db.prepare('SELECT * FROM maintenance_tasks WHERE printer_id = ?').all(req.params.id);
  res.json(tasks);
});

app.post('/api/printers/:id/maintenance/reset', (req, res) => {
  const { name } = req.body;
  const printer = db.prepare('SELECT total_print_minutes FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Drucker nicht gefunden' });
  
  const currentHours = printer.total_print_minutes / 60;
  db.prepare('UPDATE maintenance_tasks SET last_reset_hours = ? WHERE printer_id = ? AND name = ?')
    .run(currentHours, req.params.id, name);
    
  addEvent('info', `Wartung "${name}" erledigt`, req.params.id);
  res.json({ ok: true });
});

// ── DRUCKERSTEUERUNG ──────────────────────────
app.post('/api/printers/:id/pause', (req, res) => {
  res.json({ ok: sendMQTT(req.params.id, { print: { sequence_id: '0', command: 'pause' } }) });
});
app.post('/api/printers/:id/resume', (req, res) => {
  res.json({ ok: sendMQTT(req.params.id, { print: { sequence_id: '0', command: 'resume' } }) });
});
app.post('/api/printers/:id/stop', (req, res) => {
  res.json({ ok: sendMQTT(req.params.id, { print: { sequence_id: '0', command: 'stop' } }) });
});

app.post('/api/printers/:id/light', (req, res) => {
  const { on, node } = req.body;
  const nodes = node ? [node] : ['chamber_light', 'work_light'];
  let ok = false;
  nodes.forEach(ledNode => {
    ok = sendMQTT(req.params.id, {
      system: {
        sequence_id: String(Date.now()),
        command: 'ledctrl',
        led_node: ledNode,
        led_mode: on ? 'on' : 'off',
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 0,
        interval_time: 0
      }
    });
  });
  res.json({ ok });
});

app.post('/api/printers/:id/speed', (req, res) => {
  res.json({ ok: sendMQTT(req.params.id, { print: { sequence_id: '0', command: 'print_speed', param: String(req.body.level) } }) });
});

app.post('/api/printers/:id/temperature', (req, res) => {
  const { type, temp } = req.body;
  const gcode = type === 'nozzle' ? `M104 S${temp}` : `M140 S${temp}`;
  res.json({ ok: sendGcode(req.params.id, gcode) });
});

// ── LÜFTER ────────────────────────────────────
app.post('/api/printers/:id/fan', (req, res) => {
  const { percent, type } = req.body;
  const speed = Math.round((percent / 100) * 255);
  let gcode;
  if (type === 'aux') gcode = `M106 P2 S${speed}`;
  else if (type === 'chamber') gcode = `M106 P3 S${speed}`;
  else gcode = `M106 P1 S${speed}`;
  res.json({ ok: sendGcode(req.params.id, gcode) });
});

// ── GCODE KONSOLE ─────────────────────────────
app.post('/api/printers/:id/gcode', (req, res) => {
  const { gcode } = req.body;
  if (!gcode || typeof gcode !== 'string') return res.status(400).json({ error: 'gcode erforderlich' });
  const lines = gcode.trim().split('\n').map(l => l.trim()).filter(Boolean);
  let ok = false;
  for (const line of lines) ok = sendGcode(req.params.id, line);
  res.json({ ok });
});

// ── HOME ──────────────────────────────────────
app.post('/api/printers/:id/home', (req, res) => {
  const { axes } = req.body;
  const gcode = (!axes || axes === 'all') ? 'G28' : `G28 ${axes.toUpperCase()}`;
  res.json({ ok: sendGcode(req.params.id, gcode) });
});

// ── ACHSEN BEWEGEN ────────────────────────────
app.post('/api/printers/:id/move', (req, res) => {
  const { axis, distance } = req.body;
  if (!axis || distance === undefined) return res.status(400).json({ error: 'axis und distance erforderlich' });
  const ax = axis.toUpperCase();
  if (!['X', 'Y', 'Z'].includes(ax)) return res.status(400).json({ error: 'axis muss X, Y oder Z sein' });
  const dist = parseFloat(distance);
  if (isNaN(dist) || dist === 0) return res.status(400).json({ error: 'distance muss ungleich 0 sein' });
  const feedrate = ax === 'Z' ? 600 : 3000;
  const gcode = `G91\nG0 ${ax}${dist > 0 ? '+' : ''}${dist} F${feedrate}\nG90`;
  res.json({ ok: sendGcode(req.params.id, gcode) });
});

// ── MOTOREN AUS ───────────────────────────────
app.post('/api/printers/:id/motors_off', (req, res) => {
  res.json({ ok: sendGcode(req.params.id, 'M84') });
});

// ── FILAMENT LOAD/UNLOAD ──────────────────────
app.post('/api/printers/:id/filament_load', (req, res) => {
  const ok1 = sendGcode(req.params.id, 'M104 S220');
  const ok2 = sendMQTT(req.params.id, {
    print: { sequence_id: '0', command: 'ams_change_filament', target: 255, curr_temp: 220, tar_temp: 220 }
  });
  res.json({ ok: ok1 || ok2 });
});

app.post('/api/printers/:id/filament_unload', (req, res) => {
  res.json({ ok: sendGcode(req.params.id, 'M702') });
});

// ── DATEIMANAGER ──────────────────────────────
const THUMB_CACHE = './thumbnails';
if (!fs.existsSync(THUMB_CACHE)) fs.mkdirSync(THUMB_CACHE, { recursive: true });

app.get('/api/printers/:id/files/:filename/thumbnail', async (req, res) => {
  const { id } = req.params;
  const filename = validateFilename(req.params.filename, true);
  if (!filename) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  const cacheKey = `${id}-${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}.png`;
  const cachePath = path.join(THUMB_CACHE, cacheKey);

  // Serve from cache if available
  if (fs.existsSync(cachePath)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(fs.readFileSync(cachePath));
  }

  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(id);
  if (!printer) return res.status(404).end();

  const tmpPath = path.join(THUMB_CACHE, `tmp-${Date.now()}-${cacheKey}`);
  const ftpClient = new ftp.Client(30000);
  try {
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: decryptAccessCode(printer.access_code), secure: 'implicit', secureOptions: bambuTlsOptions(printer.serial) });
    await ftpClient.downloadTo(tmpPath, '/' + filename);
    ftpClient.close();

    const thumb = extractThumbnail(tmpPath);
    fs.unlinkSync(tmpPath);
    if (!thumb) return res.status(404).end();

    fs.writeFileSync(cachePath, thumb);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(thumb);
  } catch(e) {
    try { ftpClient.close(); } catch(_) {}
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    res.status(500).end();
  }
});

app.get('/api/printers/:id/files', async (req, res) => {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Drucker nicht gefunden' });
  const ftpClient = new ftp.Client(10000);
  try {
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: decryptAccessCode(printer.access_code), secure: 'implicit', secureOptions: bambuTlsOptions(printer.serial) });
    const list = await ftpClient.list('/');
    res.json(list.filter(f => f.name.endsWith('.3mf') || f.name.endsWith('.gcode')).map(f => ({ name: f.name, size: f.size, date: f.rawModifiedAt || null })));
  } catch (e) {
    log.error({ err: e }, 'FTP Dateiliste');
    res.json({ error: 'FTP-Verbindung fehlgeschlagen', files: [] });
  } finally { ftpClient.close(); }
});

app.post('/api/printers/:id/print', async (req, res) => {
  const { start, timelapse, bed_levelling, flow_cali, vibration_cali, use_ams } = req.body;
  const localPath = validateFilename(req.body.filename);
  if (!localPath) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Drucker nicht gefunden' });
  if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const ftpClient = new ftp.Client(10000);
  try {
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: decryptAccessCode(printer.access_code), secure: 'implicit', secureOptions: bambuTlsOptions(printer.serial) });
    const remoteName = path.basename(localPath);
    await ftpClient.uploadFrom(localPath, '/' + remoteName);
    if (start) {
      startPrintOnBambu(req.params.id, remoteName, { timelapse, bed_levelling, flow_cali, vibration_cali, use_ams });
    }
    res.json({ ok: true, message: start ? 'Hochgeladen und gestartet' : 'Hochgeladen' });
  } catch (e) {
    log.error({ err: e }, 'FTP Upload/Print');
    res.status(500).json({ error: 'FTP-Übertragung fehlgeschlagen' });
  } finally { ftpClient.close(); }
});

app.post('/api/printers/:id/startfile', (req, res) => {
  const { filename, timelapse, bed_levelling, flow_cali, vibration_cali, use_ams } = req.body;
  res.json({
    ok: startPrintOnBambu(req.params.id, filename, { timelapse, bed_levelling, flow_cali, vibration_cali, use_ams })
  });
});

app.post('/api/printers/:id/repeat', (req, res) => {
  const lastJob = db.prepare('SELECT * FROM print_jobs WHERE printer_id = ? ORDER BY started_at DESC LIMIT 1').get(req.params.id);
  if (!lastJob) return res.status(404).json({ error: 'Kein vorheriger Druckjob gefunden' });
  
  // Wir nehmen an, die Datei ist noch auf der SD-Karte
  const ok = startPrintOnBambu(req.params.id, lastJob.filename, {
    timelapse: true,
    bed_levelling: true,
    flow_cali: true,
    vibration_cali: true,
    use_ams: true
  });
  
  res.json({ ok, filename: lastJob.filename });
});

app.delete('/api/printers/:id/files/:filename', async (req, res) => {
  const safeFilename = validateFilename(req.params.filename, true);
  if (!safeFilename) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Drucker nicht gefunden' });
  const ftpClient = new ftp.Client(10000);
  try {
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: decryptAccessCode(printer.access_code), secure: 'implicit', secureOptions: bambuTlsOptions(printer.serial) });
    await ftpClient.remove('/' + safeFilename);
    res.json({ ok: true });
  } catch (e) {
    log.error({ err: e }, 'FTP Delete');
    res.status(500).json({ error: 'FTP-Löschen fehlgeschlagen' });
  } finally { ftpClient.close(); }
});

app.get('/api/queue', (req, res) => {
  const jobs = db.prepare('SELECT * FROM print_queue ORDER BY added_at ASC').all();
  res.json(jobs.map(j => ({ ...j, options: JSON.parse(j.options || '{}') })));
});

app.post('/api/queue', (req, res) => {
  const { printer_id, filename, options } = req.body;
  if (!printer_id || !filename) return res.status(400).json({ error: 'Fehlende Daten' });
  const result = db.prepare('INSERT INTO print_queue (printer_id, filename, options) VALUES (?, ?, ?)')
    .run(printer_id, filename, JSON.stringify(options || {}));
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/queue/:id', (req, res) => {
  db.prepare('DELETE FROM print_queue WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/printers/:id/clear-bed', (req, res) => {
  printerBedCleared[req.params.id] = true;
  res.json({ ok: true });
});

app.get('/api/printers/:id/snapshot', async (req, res) => {
  // Snapshot von go2rtc holen
  try {
    const response = await fetch('http://localhost:1984/api/frame.jpeg?src=bambu');
    if (!response.ok) throw new Error('go2rtc frame failed');
    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="snapshot_${req.params.id}_${Date.now()}.jpg"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: 'Kamera-Snapshot fehlgeschlagen' });
  }
});

// ── TIMELAPSES ────────────────────────────────
app.get('/api/timelapses', (req, res) => {
  const dir = './public/timelapses';
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.mp4'))
    .map(f => {
      const stats = fs.statSync(path.join(dir, f));
      return { name: f, size: stats.size, mtime: stats.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  res.json(files);
});

app.delete('/api/timelapses/:name', (req, res) => {
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  const filePath = path.join('./public/timelapses', name);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      db.prepare('DELETE FROM timelapses WHERE filename = ?').run(name);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Datei nicht gefunden' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── FILAMENTE ─────────────────────────────────
app.get('/api/filaments', (req, res) => res.json(db.prepare('SELECT * FROM filaments ORDER BY id DESC').all()));

app.post('/api/filaments', (req, res) => {
  const {
    brand, material, color, color_hex, diameter,
    weight_total, price_per_kg,
    temp_nozzle_min, temp_nozzle_max, temp_nozzle, temp_bed,
    temp_dry, time_dry, pa, ka, flow_rate, shrink_factor,
    location, notes
  } = req.body;
  const result = db.prepare(`
    INSERT INTO filaments
      (brand,material,color,color_hex,diameter,weight_total,price_per_kg,
       temp_nozzle_min,temp_nozzle_max,temp_nozzle,temp_bed,
       temp_dry,time_dry,pa,ka,flow_rate,shrink_factor,location,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    brand, material, color, color_hex || '#888888',
    diameter || 1.75, weight_total || 1000, price_per_kg || 0,
    temp_nozzle_min || null, temp_nozzle_max || null,
    temp_nozzle || null, temp_bed || null,
    temp_dry || null, time_dry || null,
    pa || null, ka || null,
    flow_rate || 100, shrink_factor || 100,
    location || null, notes || null
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/filaments/:id', (req, res) => {
  const {
    brand, material, color, color_hex, diameter,
    weight_total, weight_used, price_per_kg,
    temp_nozzle_min, temp_nozzle_max, temp_nozzle, temp_bed,
    temp_dry, time_dry, pa, ka, flow_rate, shrink_factor,
    location, notes
  } = req.body;
  db.prepare(`
    UPDATE filaments SET
      brand=?,material=?,color=?,color_hex=?,diameter=?,
      weight_total=?,weight_used=?,price_per_kg=?,
      temp_nozzle_min=?,temp_nozzle_max=?,temp_nozzle=?,temp_bed=?,
      temp_dry=?,time_dry=?,pa=?,ka=?,flow_rate=?,shrink_factor=?,
      location=?,notes=?
    WHERE id=?
  `).run(
    brand, material, color, color_hex, diameter || 1.75,
    weight_total, weight_used || 0, price_per_kg,
    temp_nozzle_min || null, temp_nozzle_max || null,
    temp_nozzle || null, temp_bed || null,
    temp_dry || null, time_dry || null,
    pa || null, ka || null,
    flow_rate || 100, shrink_factor || 100,
    location || null, notes || null,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/filaments/:id', (req, res) => {
  db.prepare('DELETE FROM filaments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/filaments/:id/use', (req, res) => {
  const { grams, printer_id, filename, duration_min } = req.body;
  const filament = db.prepare('SELECT * FROM filaments WHERE id = ?').get(req.params.id);
  if (!filament) return res.status(404).json({ error: 'Filament nicht gefunden' });
  const settings = db.prepare('SELECT * FROM settings').all();
  const s = Object.fromEntries(settings.map(r => [r.key, parseFloat(r.value)]));
  const filament_cost = (grams / 1000) * filament.price_per_kg;
  const electricity_cost = (duration_min / 60) * (s.printer_watt / 1000) * s.electricity_cost;
  const total_cost = filament_cost + electricity_cost;
  db.prepare('UPDATE filaments SET weight_used = weight_used + ? WHERE id = ?').run(grams, req.params.id);
  const result = db.prepare("INSERT INTO print_jobs (printer_id,filament_id,filename,grams_used,duration_min,electricity_cost,filament_cost,total_cost,status,finished_at) VALUES (?,?,?,?,?,?,?,?,'finished',CURRENT_TIMESTAMP)")
    .run(printer_id, req.params.id, filename, grams, duration_min, electricity_cost, filament_cost, total_cost);
  res.json({ id: result.lastInsertRowid, total_cost, filament_cost, electricity_cost });
});

// ── HISTORY ───────────────────────────────────
app.get('/api/history', (req, res) => {
  res.json(db.prepare('SELECT p.*,f.brand,f.material,f.color,f.color_hex,pr.name as printer_name FROM print_jobs p LEFT JOIN filaments f ON p.filament_id=f.id LEFT JOIN printers pr ON p.printer_id=pr.id ORDER BY p.started_at DESC LIMIT 100').all());
});

app.get('/api/history/stats', (req, res) => {
  try {
    const stats = {
      total_prints: db.prepare('SELECT COUNT(*) as count FROM print_jobs WHERE status="finished"').get().count,
      total_grams: Math.round(db.prepare('SELECT SUM(grams_used) as sum FROM print_jobs WHERE status="finished"').get().sum || 0),
      total_hours: Math.round((db.prepare('SELECT SUM(duration_min) as sum FROM print_jobs WHERE status="finished"').get().sum || 0) / 60),
      by_printer: db.prepare(`
        SELECT pr.name, COUNT(*) as count 
        FROM print_jobs p 
        JOIN printers pr ON p.printer_id = pr.id 
        WHERE p.status="finished" 
        GROUP BY pr.name
      `).all(),
      by_material: db.prepare(`
        SELECT f.material, SUM(p.grams_used) as grams 
        FROM print_jobs p 
        JOIN filaments f ON p.filament_id = f.id 
        WHERE p.status="finished" 
        GROUP BY f.material
      `).all()
    };
    res.json(stats);
  } catch (e) { log.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/analytics', (req, res) => {
  try {
    const dailyVolume = db.prepare(`
      SELECT date(started_at) as date, SUM(grams_used) as grams, COUNT(*) as count
      FROM print_jobs
      WHERE started_at > date('now', '-30 days')
      GROUP BY date(started_at)
      ORDER BY date ASC
    `).all();

    const materialStats = db.prepare(`
      SELECT f.material, SUM(p.grams_used) as grams
      FROM print_jobs p
      JOIN filaments f ON p.filament_id = f.id
      WHERE p.status = 'finished'
      GROUP BY f.material
    `).all();

    const printerStats = db.prepare(`
      SELECT pr.name, SUM(p.duration_min) as minutes
      FROM print_jobs p
      JOIN printers pr ON p.printer_id = pr.id
      WHERE p.status = 'finished'
      GROUP BY pr.id
    `).all();

    res.json({ dailyVolume, materialStats, printerStats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── KOSTENRECHNER ─────────────────────────────
app.post('/api/calculate', (req, res) => {
  const { grams, purge_g, duration_min, filament_id, failure_rate, post_processing_min, hourly_rate, margin } = req.body;
  const settings = db.prepare('SELECT * FROM settings').all();
  const s = Object.fromEntries(settings.map(r => [r.key, parseFloat(r.value)]));

  // Filamentkosten (Druck + Purge)
  let price_per_kg = 0;
  if (filament_id) {
    const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(filament_id);
    if (f) price_per_kg = f.price_per_kg || 0;
  }
  const total_g = (parseFloat(grams) || 0) + (parseFloat(purge_g) || 0);
  const filament_cost = (total_g / 1000) * price_per_kg;

  // Stromkosten
  const hours = (parseFloat(duration_min) || 0) / 60;
  const electricity_cost = hours * (s.printer_watt / 1000) * s.electricity_cost;

  // Maschinenkosten (Abschreibung)
  const machine_cost_per_h = (s.machine_price || 700) / (s.machine_hours || 5000);
  const machine_cost = hours * machine_cost_per_h;

  // Basis ohne Arbeitszeit
  const base_cost = filament_cost + electricity_cost + machine_cost;

  // Fehldruck-Zuschlag
  const fr = parseFloat(failure_rate) >= 0 ? parseFloat(failure_rate) : (s.failure_rate || 10);
  const failure_cost = base_cost * (fr / 100);

  // Nachbearbeitung / Arbeitszeit
  const post_cost = post_processing_min ? (parseFloat(post_processing_min) / 60) * (parseFloat(hourly_rate) || 0) : 0;

  const total_cost = base_cost + failure_cost + post_cost;

  // Verkaufspreis (optional)
  const margin_pct = parseFloat(margin) || 0;
  const selling_price = margin_pct > 0 ? total_cost * (1 + margin_pct / 100) : null;

  const round = v => Math.round(v * 10000) / 10000;
  res.json({
    filament_cost: round(filament_cost),
    electricity_cost: round(electricity_cost),
    machine_cost: round(machine_cost),
    failure_cost: round(failure_cost),
    post_cost: round(post_cost),
    total_cost: round(total_cost),
    selling_price: selling_price ? round(selling_price) : null,
    machine_cost_per_h: round(machine_cost_per_h)
  });
});

// ── EINSTELLUNGEN ─────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json(Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value])));
});
app.post('/api/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body))
    db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, String(value));
  res.json({ ok: true });
});

// ── PASSWORT ÄNDERN ────────────────────────────
app.post('/api/auth/change-password', (req, res) => {
  const { currentPass, newPass } = req.body || {};
  if (!currentPass || !newPass) return res.status(400).json({ error: 'Fehlende Felder' });

  // Admin-User finden (wir nehmen an, es gibt nur einen Admin in diesem einfachen Setup)
  const user = db.prepare('SELECT id, password_hash FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (!user || !bcrypt.compareSync(currentPass, user.password_hash)) {
    return res.status(403).json({ error: 'Aktuelles Passwort falsch' });
  }

  if (newPass.length < 8) return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });

  const newHash = bcrypt.hashSync(newPass, 10);
  
  try {
    // In DB speichern
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    
    // Fallback: Auch in .env speichern (optional, für Rückwärtskompatibilität)
    process.env.ADMIN_PASS = newPass;
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/^ADMIN_PASS=.*$/m, `ADMIN_PASS="${newPass.replace(/"/g, '\\"')}"`);
      fs.writeFileSync(envPath, content, 'utf8');
    }
  } catch (e) {
    return serverError(res, e, 'Passwort konnte nicht gespeichert werden');
  }
  
  log.info('Admin-Passwort geändert');
  res.json({ ok: true });
});

// ── KAMERA MJPEG-STREAM ────────────────────────────
// Ein persistenter ffmpeg-Prozess hält die RTSPS-Verbindung offen und
// liefert kontinuierlich JPEG-Frames — kein erneuter TLS-Handshake pro Frame.
// Latenz: ~200-500 ms statt 3+ Sekunden beim alten Snapshot-Polling.
const RTSP_URL = `rtsps://bblp:${(process.env.PRINTER_ACCESS_CODE||'').toLowerCase()}@${process.env.PRINTER_IP}:322/streaming/live/1`;

let mjpegClients = new Set();
let streamProc = null;
let streamBuf = Buffer.alloc(0);

function startMjpegStream() {
  if (streamProc) return;
  streamProc = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-i', RTSP_URL,
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', '5',
    '-r', '10',
    '-vf', 'scale=640:-2',
    'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  streamProc.stdout.on('data', (chunk) => {
    streamBuf = Buffer.concat([streamBuf, chunk]);
    while (true) {
      const start = streamBuf.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]));
      if (start === -1) { streamBuf = Buffer.alloc(0); break; }
      let end = -1;
      for (let i = start + 2; i < streamBuf.length - 1; i++) {
        if (streamBuf[i] === 0xFF && streamBuf[i + 1] === 0xD9) { end = i + 2; break; }
      }
      if (end === -1) break;
      const frame = streamBuf.slice(start, end);
      streamBuf = streamBuf.slice(end);
      const header = Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
      const data = Buffer.concat([header, frame, Buffer.from('\r\n')]);
      for (const client of mjpegClients) {
        try { client.write(data); } catch { mjpegClients.delete(client); }
      }
    }
  });

  streamProc.on('close', () => {
    streamProc = null;
    streamBuf = Buffer.alloc(0);
    if (mjpegClients.size > 0) setTimeout(startMjpegStream, 3000);
  });

  streamProc.on('error', () => { streamProc = null; });
}

function stopMjpegStream() {
  if (streamProc) { streamProc.kill('SIGTERM'); streamProc = null; }
}

app.get('/api/stream/mjpeg', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  mjpegClients.add(res);
  startMjpegStream();
  req.on('close', () => {
    mjpegClients.delete(res);
    if (mjpegClients.size === 0) stopMjpegStream();
  });
});

// ── UPDATE SYSTEM ──────────────────────────────
app.get('/api/version', (req, res) => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { timeout: 5000 }).toString().trim();
    const date = execSync('git log -1 --format=%ci HEAD', { timeout: 5000 }).toString().trim().slice(0, 10);
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { timeout: 5000 }).toString().trim();
    res.json({ hash, date, branch });
  } catch(e) {
    res.json({ hash: 'unbekannt', date: '-', branch: 'main' });
  }
});

app.get('/api/update/check', (req, res) => {
  try {
    execSync('git fetch origin', { timeout: 15000 });
    const hashes  = execSync('git log HEAD..origin/main --format=%h',  { timeout: 5000 }).toString().trim();
    const subjects = execSync('git log HEAD..origin/main --format=%s',  { timeout: 5000 }).toString().trim();
    const dates    = execSync('git log HEAD..origin/main --format=%as', { timeout: 5000 }).toString().trim();
    const hArr = hashes   ? hashes.split('\n')   : [];
    const sArr = subjects ? subjects.split('\n') : [];
    const dArr = dates    ? dates.split('\n')    : [];
    const commits = hArr.filter(Boolean).map((hash, i) => ({
      hash, subject: sArr[i] || '', date: dArr[i] || ''
    }));
    const currentHash = execSync('git rev-parse --short HEAD', { timeout: 5000 }).toString().trim();
    res.json({ hasUpdate: commits.length > 0, commits, currentHash, count: commits.length });
  } catch(e) {
    log.error({ err: e }, 'GitHub Update-Check');
    res.status(500).json({ error: 'Update-Check fehlgeschlagen' });
  }
});

app.post('/api/system/restart', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    console.log('🔄 Server-Neustart angefordert...');
    process.exit(0);
  }, 800);
});

// /api/update/apply entfernt — Updates nur per SSH:
// cd ~/bambupi && git pull && npm install --production && sudo systemctl restart bambupi

// ── PRINT-METADATEN EXTRAKTION ────────────────
function parseTimeString(str) {
  let s = 0;
  const h = str.match(/(\d+)\s*h/i); const m = str.match(/(\d+)\s*m(?!s)/i); const sec = str.match(/(\d+)\s*s/i);
  if (h) s += parseInt(h[1]) * 3600; if (m) s += parseInt(m[1]) * 60; if (sec) s += parseInt(sec[1]);
  return s || null;
}
function formatSeconds(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return [h > 0 ? h + 'h' : '', m > 0 ? m + 'm' : ''].filter(Boolean).join(' ') || '< 1m';
}
function parseSliceInfoXml(xml) {
  const r = { weight_g: null, time_s: null, printer_model: null, filaments: [] };
  const wm = xml.match(/key="weight"\s+value="([0-9.]+)"/);     if (wm) r.weight_g = parseFloat(wm[1]);
  const tm = xml.match(/key="time"\s+value="([0-9]+)"/);        if (tm) r.time_s = parseInt(tm[1]);
  if (!r.time_s) { const pm = xml.match(/key="prediction"\s+value="([0-9]+)"/); if (pm) r.time_s = parseInt(pm[1]); }
  const prmm = xml.match(/key="printer_model_id"\s+value="([^"]+)"/); if (prmm) r.printer_model = prmm[1];
  const fRe = /<filament[^>]+id="([^"]+)"[^>]+type="([^"]+)"[^>]+color="([^"]+)"[^>]+used_m="([^"]+)"[^>]+used_g="([^"]+)"/g;
  let fm; while ((fm = fRe.exec(xml)) !== null) r.filaments.push({ id: parseInt(fm[1]), type: fm[2], color: fm[3], used_m: parseFloat(fm[4]), used_g: parseFloat(fm[5]) });
  if (!r.weight_g && r.filaments.length) r.weight_g = r.filaments.reduce((s, f) => s + f.used_g, 0);
  return r;
}
function parseGcodeHeader(text) {
  const r = { weight_g: null, time_s: null, filaments: [], filament_type: null };
  const weights = [];
  for (const line of text.split('\n').slice(0, 200)) {
    if (!line.startsWith(';')) continue;
    let m;
    m = line.match(/;\s*total filament weight\s*=\s*([0-9.]+)/i); if (m) { r.weight_g = parseFloat(m[1]); continue; }
    m = line.match(/;\s*filament used \[g\]\s*=\s*([0-9.]+)/i);   if (m) { weights.push(parseFloat(m[1])); continue; }
    m = line.match(/;\s*estimated printing time.*?=\s*(.+)/i);     if (m) { r.time_s = parseTimeString(m[1].trim()); continue; }
    m = line.match(/;\s*filament_type\s*=\s*(.+)/i);               if (m) { r.filament_type = m[1].trim(); continue; }
  }
  if (!r.weight_g && weights.length) r.weight_g = weights.reduce((a, b) => a + b, 0);
  return r;
}
function extractPrintMetadata(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.3mf' && AdmZip) {
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry('Metadata/slice_info.config');
      if (entry) return parseSliceInfoXml(entry.getData().toString('utf8'));
      const gc = zip.getEntry('Metadata/plate_1.gcode');
      if (gc) return parseGcodeHeader(gc.getData().slice(0, 8192).toString('utf8'));
    }
    if (ext === '.gcode') {
      const fd = fs.openSync(filePath, 'r'); const buf = Buffer.alloc(16384);
      const n = fs.readSync(fd, buf, 0, 16384, 0); fs.closeSync(fd);
      return parseGcodeHeader(buf.toString('utf8', 0, n));
    }
  } catch (e) { log.warn({ err: e }, 'extractPrintMetadata'); }
  return null;
}

// ── UPLOAD ────────────────────────────────────
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Datei zu groß (max. 500 MB)' });
    if (err?.code === 'INVALID_TYPE')    return res.status(415).json({ error: 'Nur .3mf, .gcode und .stl erlaubt' });
    if (err) return res.status(400).json({ error: 'Upload fehlgeschlagen' });
    if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
    const meta = extractPrintMetadata(req.file.path);
    res.json({
      filename: req.file.filename,
      originalname: req.file.originalname,
      metadata: meta ? {
        weight_g: meta.weight_g,
        time_s: meta.time_s,
        time_formatted: meta.time_s ? formatSeconds(meta.time_s) : null,
        filament_type: meta.filament_type || (meta.filaments[0] ? meta.filaments[0].type : null),
        filament_color: meta.filaments[0] ? meta.filaments[0].color : null,
        multi_color: meta.filaments.length > 1,
        filament_count: meta.filaments.length,
        printer_model: meta.printer_model || null
      } : null
    });
  });
});
app.get('/api/uploads', (req, res) => {
  if (!fs.existsSync('./uploads')) return res.json([]);
  const files = fs.readdirSync('./uploads')
    .filter(f => !f.startsWith('.'))
    .map(f => ({
      filename: f, size: fs.statSync(`./uploads/${f}`).size, uploaded_at: fs.statSync(`./uploads/${f}`).mtime
    }));
  res.json(files);
});
app.get('/api/uploads/:filename/gcode', (req, res) => {
  const filePath = validateFilename(req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.gcode') return res.sendFile(filePath);
  
  if (ext === '.3mf' && AdmZip) {
    try {
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry('Metadata/plate_1.gcode');
      if (entry) {
        res.setHeader('Content-Type', 'text/plain');
        return res.send(entry.getData().toString('utf8'));
      }
    } catch (e) {}
  }
  
  res.status(400).json({ error: 'G-Code konnte nicht extrahiert werden' });
});

app.get('/api/uploads/:filename/content', (req, res) => {
  const filePath = validateFilename(req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  res.sendFile(filePath);
});

app.delete('/api/uploads/:filename', (req, res) => {
  const filePath = validateFilename(req.params.filename);
  if (!filePath) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ ok: true }); }
  else res.status(404).json({ error: 'Datei nicht gefunden' });
});

// ── THUMBNAIL EXTRAKTION ──────────────────────
function extractThumbnail(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.3mf') {
      if (!AdmZip) return null;
      const zip = new AdmZip(filePath);
      for (const p of ['Metadata/plate_1.png','Metadata/thumbnail.png','Metadata/cover.png','thumbnail.png']) {
        const entry = zip.getEntry(p);
        if (entry) return entry.getData();
      }
      // try any png in Metadata/
      const meta = zip.getEntries().find(e => e.entryName.startsWith('Metadata/') && e.entryName.endsWith('.png'));
      if (meta) return meta.getData();
      return null;
    }
    if (ext === '.gcode') {
      // Read first 200KB — thumbnails are always near the top
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(200000);
      const bytesRead = fs.readSync(fd, buf, 0, 200000, 0);
      fs.closeSync(fd);
      const head = buf.toString('utf8', 0, bytesRead);

      // Bambu Studio format: ;gimage:<base64> (single long line)
      const gimageIdx = head.indexOf(';gimage:');
      if (gimageIdx !== -1) {
        const lineEnd = head.indexOf('\n', gimageIdx);
        const b64 = (lineEnd === -1 ? head.substring(gimageIdx + 8) : head.substring(gimageIdx + 8, lineEnd)).trim();
        if (b64.length > 100) return Buffer.from(b64, 'base64');
      }

      // PrusaSlicer / SuperSlicer format: ; thumbnail begin WxH size\n; base64\n; thumbnail end
      const match = head.match(/;\s*thumbnail begin [^\n]+\n([\s\S]*?);\s*thumbnail end/);
      if (match) {
        const b64 = match[1].replace(/^;\s*/mg, '').replace(/\n/g, '');
        if (b64.length > 100) return Buffer.from(b64, 'base64');
      }
      return null;
    }
  } catch(e) { return null; }
  return null;
}

app.get('/api/uploads/:filename/debug', (req, res) => {
  const filePath = validateFilename(req.params.filename);
  if (!filePath) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.3mf' || !AdmZip) return res.json({ ext, admzip: !!AdmZip, entries: [] });
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries().map(e => ({ name: e.entryName, size: e.header.size }));
    res.json({ entries });
  } catch(e) { return serverError(res, e, 'Debug-Extraktion fehlgeschlagen'); }
});

app.get('/api/uploads/:filename/metadata', (req, res) => {
  const filePath = validateFilename(req.params.filename);
  if (!filePath) return res.status(400).json({ error: 'Ungültiger Dateiname' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const meta = extractPrintMetadata(filePath);
  if (!meta || (!meta.weight_g && !meta.time_s)) return res.json({ error: 'Keine Metadaten gefunden' });
  res.json({
    weight_g: meta.weight_g,
    time_s: meta.time_s,
    time_formatted: meta.time_s ? formatSeconds(meta.time_s) : null,
    filament_type: meta.filament_type || (meta.filaments?.[0]?.type || null),
    filament_color: meta.filaments?.[0]?.color || null,
    filaments: meta.filaments || []
  });
});

app.get('/api/uploads/:filename/thumbnail', (req, res) => {
  const filePath = validateFilename(req.params.filename);
  if (!filePath) return res.status(400).end();
  if (!fs.existsSync(filePath)) return res.status(404).end();
  const thumb = extractThumbnail(filePath);
  if (!thumb) return res.status(404).end();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(thumb);
});

// ── STATISTIKEN ───────────────────────────────
app.get('/api/stats', (req, res) => {
  res.json({
    total_prints: db.prepare('SELECT COUNT(*) as c FROM print_jobs').get().c,
    total_grams: Math.round(db.prepare('SELECT SUM(grams_used) as s FROM print_jobs').get().s || 0),
    total_cost: Math.round((db.prepare('SELECT SUM(total_cost) as s FROM print_jobs').get().s || 0) * 100) / 100,
    total_hours: Math.round((db.prepare('SELECT SUM(duration_min) as s FROM print_jobs').get().s || 0) / 60 * 10) / 10,
    filament_count: db.prepare('SELECT COUNT(*) as c FROM filaments').get().c
  });
});

// ── AMS ───────────────────────────────────────
app.get('/api/ams/:id', (req, res) => {
  const printerId = req.params.id;
  const status = printerStatus[printerId];
  const amsRaw = status?.ams;
  const manualSlots = db.prepare('SELECT a.*,f.brand,f.material,f.color,f.color_hex,f.temp_nozzle,f.temp_bed,f.weight_total,f.weight_used FROM ams_slots a LEFT JOIN filaments f ON a.filament_id=f.id WHERE a.printer_id=?').all(printerId);
  const manualMap = {};
  manualSlots.forEach(s => { manualMap[`${s.unit_idx}-${s.slot_idx}`] = s; });

  if (!amsRaw || !amsRaw.ams) {
    return res.json({ units: [{ id: 0, humidity: null, temp: null, trays: [0,1,2,3].map(slotIdx => {
      const manual = manualMap[`0-${slotIdx}`];
      if (manual && manual.filament_id) {
        const pct = Math.round(((manual.weight_total - manual.weight_used) / manual.weight_total) * 100);
        return { slot: slotIdx, empty: false, source: 'manual', color: manual.color_hex, type: manual.material, brand: manual.brand, remain: pct, nozzle_min: manual.temp_nozzle, nozzle_max: null, drying_temp: null, drying_time: null };
      }
      return { slot: slotIdx, empty: true, source: 'manual' };
    })}], active_unit: null, active_slot: null });
  }

  const trayNow = parseInt(amsRaw.tray_now ?? 255);
  const activeUnit = trayNow !== 255 ? Math.floor(trayNow / 4) : null;
  const activeSlot = trayNow !== 255 ? trayNow % 4 : null;
  const units = amsRaw.ams.map((unit, unitIdx) => ({
    id: unitIdx,
    humidity: unit.humidity ? parseInt(unit.humidity) : null,
    temp: unit.temp ? parseFloat(unit.temp) : null,
    trays: (unit.tray || []).map((tray, slotIdx) => {
      const hasRfid = tray.tray_type && tray.tray_type !== '' && tray.tag_uid && tray.tag_uid !== '0000000000000000';
      if (hasRfid) return { slot: slotIdx, empty: false, source: 'rfid', color: tray.tray_color ? '#' + tray.tray_color.slice(0, 6) : null, type: tray.tray_type || null, brand: tray.tray_sub_brands || tray.tray_id_name || 'Bambu', remain: tray.remain !== undefined ? parseInt(tray.remain) : -1, nozzle_min: tray.nozzle_temp_min ? parseInt(tray.nozzle_temp_min) : null, nozzle_max: tray.nozzle_temp_max ? parseInt(tray.nozzle_temp_max) : null, drying_temp: tray.drying_temp ? parseInt(tray.drying_temp) : null, drying_time: tray.drying_time ? parseInt(tray.drying_time) : null };
      const manual = manualMap[`${unitIdx}-${slotIdx}`];
      if (manual && manual.filament_id) {
        const pct = Math.round(((manual.weight_total - manual.weight_used) / manual.weight_total) * 100);
        return { slot: slotIdx, empty: false, source: 'manual', color: manual.color_hex, type: manual.material, brand: manual.brand, remain: Math.max(0, pct), nozzle_min: manual.temp_nozzle, nozzle_max: null, drying_temp: null, drying_time: null };
      }
      return { slot: slotIdx, empty: true, source: 'none', color: null, type: null, brand: null, remain: -1, nozzle_min: null, nozzle_max: null, drying_temp: null, drying_time: null };
    })
  }));
  res.json({ units, active_unit: activeUnit, active_slot: activeSlot });
});

app.post('/api/ams/:id/assign', (req, res) => {
  const { unit_idx, slot_idx, filament_id } = req.body;
  db.prepare('INSERT INTO ams_slots (printer_id,unit_idx,slot_idx,filament_id,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(printer_id,unit_idx,slot_idx) DO UPDATE SET filament_id=excluded.filament_id,updated_at=CURRENT_TIMESTAMP')
    .run(req.params.id, unit_idx ?? 0, slot_idx, filament_id || null);
  res.json({ ok: true });
});

app.delete('/api/ams/:id/assign/:unit/:slot', (req, res) => {
  db.prepare('DELETE FROM ams_slots WHERE printer_id=? AND unit_idx=? AND slot_idx=?').run(req.params.id, parseInt(req.params.unit), parseInt(req.params.slot));
  res.json({ ok: true });
});

// ── GLOBALER FEHLER-HANDLER ───────────────────
// Fängt alle unbehandelten Express-Fehler — Details nur ins Log, nie an Client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error({ err, method: req.method, url: req.url }, 'Unbehandelter Fehler');
  if (res.headersSent) return;
  res.status(500).json({ error: 'Interner Serverfehler' });
});

// ── SERVER STARTEN ────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => log.info(`BambuPi läuft auf Port ${PORT}`));