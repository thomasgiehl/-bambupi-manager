const express = require('express');
const Database = require('better-sqlite3');
const mqtt = require('mqtt');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
const os = require('os');
const { execSync } = require('child_process');
let AdmZip; try { AdmZip = require('adm-zip'); } catch(e) { AdmZip = null; }
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/streams', express.static('streams'));
app.use('/uploads', express.static('uploads'));

// ── VERZEICHNISSE SICHERSTELLEN ───────────────
fs.mkdirSync('./db', { recursive: true });
fs.mkdirSync('./uploads', { recursive: true });
fs.mkdirSync('./streams', { recursive: true });
fs.mkdirSync('./cache', { recursive: true });
fs.mkdirSync('./thumbnails', { recursive: true });

// ── MULTER ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ── DATENBANK ─────────────────────────────────
const db = new Database('./db/bambupi.db');
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
`);

// ── MIGRATION: neue Spalten falls DB schon existiert ──
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
  failure_rate: '10'
};
for (const [key, value] of Object.entries(defaultSettings)) {
  const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (!exists) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── SSE ───────────────────────────────────────
const sseClients = new Set();

function broadcastSSE(printerId) {
  if (sseClients.size === 0) return;
  const payload = JSON.stringify({
    type: 'status',
    id: printerId,
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

// ── MQTT ──────────────────────────────────────
let printerStatus = {};
const printStartTimes = {};
const tempBuffers = {};          // { printerId: { n:[], b:[], t:[] } }
const TEMP_BUFFER_MAX = 600;     // ~10 Min bei 1 Update/Sek
const eventLog = [];             // Letzte 50 Events für Event-Log Panel
const EVENT_LOG_MAX = 50;

function addEvent(type, message, printerId = null) {
  eventLog.unshift({
    type,       // 'finish' | 'fail' | 'pause' | 'start' | 'offline' | 'info'
    message,
    printerId,
    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    ts: Date.now()
  });
  if (eventLog.length > EVENT_LOG_MAX) eventLog.pop();
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
    if (!row) return;

    // Gramm berechnen aus filament_used (mm Länge → Gramm)
    const usedMm = parseFloat(printData.filament_used) || 0;
    let grams = 0;
    if (usedMm > 0) {
      const r = (row.diameter || 1.75) / 2 / 10; // mm → cm
      const densityKey = Object.keys(MATERIAL_DENSITY).find(k => (row.material || '').startsWith(k)) || 'PLA';
      grams = Math.round(Math.PI * r * r * (usedMm / 10) * MATERIAL_DENSITY[densityKey] * 10) / 10;
    }

    if (grams > 0) {
      db.prepare('UPDATE filaments SET weight_used = weight_used + ? WHERE id = ?').run(grams, row.filament_id);
    }

    const s = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, parseFloat(r.value)]));
    const filamentCost = (grams / 1000) * (row.price_per_kg || 0);
    const electricityCost = (durationMin / 60) * ((s.printer_watt || 350) / 1000) * (s.electricity_cost || 0.35);
    db.prepare("INSERT INTO print_jobs (printer_id,filament_id,filename,grams_used,duration_min,electricity_cost,filament_cost,total_cost,status,finished_at) VALUES (?,?,?,?,?,?,?,?,'finished',CURRENT_TIMESTAMP)")
      .run(printerId, row.filament_id, printData.subtask_name || '', grams, durationMin, electricityCost, filamentCost, filamentCost + electricityCost);

    console.log(`✅ Auto-Tracking: "${printData.subtask_name || '?'}" — ${grams}g, ${durationMin}min, ${(filamentCost + electricityCost).toFixed(2)}€`);
  } catch (e) {
    console.log('⚠️ Auto-Tracking Fehler:', e.message);
  }
}

function connectMQTT(ip, accessCode, serial, printerId) {
  const client = mqtt.connect(`mqtts://${ip}:8883`, {
    username: 'bblp', password: accessCode,
    rejectUnauthorized: false, reconnectPeriod: 5000
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
        printerStatus[printerId] = { ...data.print, last_update: new Date().toISOString() };
        // Temperatur-Ringbuffer befüllen
        const nozzle = data.print.nozzle_temper || 0;
        const bed    = data.print.bed_temper    || 0;
        if (nozzle > 0 || bed > 0) {
          if (!tempBuffers[printerId]) tempBuffers[printerId] = { n: [], b: [], t: [] };
          const buf = tempBuffers[printerId];
          buf.t.push(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          buf.n.push(Math.round(nozzle * 10) / 10);
          buf.b.push(Math.round(bed    * 10) / 10);
          if (buf.t.length > TEMP_BUFFER_MAX) { buf.t.shift(); buf.n.shift(); buf.b.shift(); }
        }
        broadcastSSE(printerId);
        // Event-Log befüllen bei Zustandswechsel
        const printerName = db.prepare('SELECT name FROM printers WHERE id=?').get(printerId)?.name || 'Drucker';
        const jobName = data.print.subtask_name ? ' · ' + data.print.subtask_name : '';
        if (prevState !== newState) {
          if (newState === 'RUNNING')  addEvent('start',  printerName + jobName + ' — Druck gestartet', printerId);
          if (newState === 'FINISH')   addEvent('finish', printerName + jobName + ' — Fertig ✅', printerId);
          if (newState === 'FAILED')   addEvent('fail',   printerName + jobName + ' — Fehlgeschlagen ❌', printerId);
          if (newState === 'PAUSE')    addEvent('pause',  printerName + ' — Pausiert', printerId);
          if (newState === 'offline')  addEvent('offline',printerName + ' — Verbindung verloren', printerId);
        }
        if (prevState !== 'RUNNING' && newState === 'RUNNING') {
          printStartTimes[printerId] = Date.now();
        }
        if (prevState && prevState !== 'FINISH' && prevState !== 'FAILED' &&
            (newState === 'FINISH' || newState === 'FAILED')) {
          handlePrintFinished(printerId, printerStatus[printerId]);
        }
      }
    } catch (e) {}
  });
  client.on('error', (err) => console.log(`⚠️ MQTT Fehler ${ip}: ${err.message}`));
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

const mqttClients = {};
const savedPrinters = db.prepare('SELECT * FROM printers').all();
savedPrinters.forEach(p => {
  mqttClients[p.id] = connectMQTT(p.ip, p.access_code, p.serial, p.id);
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
app.post('/api/filament-db/refresh', async (req, res) => {
  try {
    if (fs.existsSync(ORCA_CACHE_FILE)) fs.unlinkSync(ORCA_CACHE_FILE);
    await loadOrcaDb();
    res.json({ ok: true, brands: Object.keys(orcaDb).length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── API STATUS ────────────────────────────────
app.get('/api/status', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

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
  const printers = db.prepare('SELECT * FROM printers').all();
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
app.get('/api/event-log', (req, res) => res.json(eventLog));
app.post('/api/event-log/clear', (req, res) => { eventLog.length = 0; res.json({ ok: true }); });

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
  const list = db.prepare('SELECT * FROM printers').all();
  res.json(list.map(p => ({ ...p, status: printerStatus[p.id] || { state: 'offline' } })));
});

app.post('/api/printers', (req, res) => {
  const { name, model, ip, access_code, serial } = req.body;
  const result = db.prepare('INSERT INTO printers (name,model,ip,access_code,serial) VALUES (?,?,?,?,?)')
    .run(name, model || 'X1C', ip, access_code, serial);
  mqttClients[result.lastInsertRowid] = connectMQTT(ip, access_code, serial, result.lastInsertRowid);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/printers/:id', (req, res) => {
  db.prepare('DELETE FROM printers WHERE id = ?').run(req.params.id);
  if (mqttClients[req.params.id]) { mqttClients[req.params.id].end(); delete mqttClients[req.params.id]; }
  res.json({ ok: true });
});

app.get('/api/printers/:id/status', (req, res) => {
  res.json(printerStatus[req.params.id] || { state: 'offline' });
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
  const { id, filename } = req.params;
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
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: printer.access_code, secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
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
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: printer.access_code, secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
    const list = await ftpClient.list('/');
    res.json(list.filter(f => f.name.endsWith('.3mf') || f.name.endsWith('.gcode')).map(f => ({ name: f.name, size: f.size, date: f.rawModifiedAt || null })));
  } catch (e) {
    res.json({ error: 'FTP Fehler: ' + e.message, files: [] });
  } finally { ftpClient.close(); }
});

app.post('/api/printers/:id/print', async (req, res) => {
  const { filename, start } = req.body;
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Drucker nicht gefunden' });
  const localPath = path.join('./uploads', filename);
  if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const ftpClient = new ftp.Client(10000);
  try {
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: printer.access_code, secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
    const remoteName = path.basename(filename);
    await ftpClient.uploadFrom(localPath, '/' + remoteName);
    if (start) {
      sendMQTT(req.params.id, { print: { sequence_id: '0', command: 'project_file', param: 'Metadata/plate_1.gcode', url: `ftp:///` + remoteName, timelapse: false, bed_levelling: true, flow_cali: false, vibration_cali: true, layer_inspect: false, use_ams: false } });
    }
    res.json({ ok: true, message: start ? 'Hochgeladen und gestartet' : 'Hochgeladen' });
  } catch (e) {
    res.status(500).json({ error: 'FTP Fehler: ' + e.message });
  } finally { ftpClient.close(); }
});

app.post('/api/printers/:id/startfile', (req, res) => {
  res.json({ ok: sendMQTT(req.params.id, { print: { sequence_id: '0', command: 'project_file', param: 'Metadata/plate_1.gcode', url: `ftp:///` + req.body.filename, timelapse: false, bed_levelling: true, flow_cali: false, vibration_cali: true, layer_inspect: false, use_ams: false } }) });
});

app.delete('/api/printers/:id/files/:filename', async (req, res) => {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Drucker nicht gefunden' });
  const ftpClient = new ftp.Client(10000);
  try {
    await ftpClient.access({ host: printer.ip, port: 990, user: 'bblp', password: printer.access_code, secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
    await ftpClient.remove('/' + req.params.filename);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally { ftpClient.close(); }
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
    res.status(500).json({ error: 'Verbindung zu GitHub fehlgeschlagen: ' + e.message });
  }
});

app.post('/api/system/restart', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    console.log('🔄 Server-Neustart angefordert...');
    process.exit(0);
  }, 800);
});

app.post('/api/update/apply', (req, res) => {
  try {
    execSync('git pull origin main', { timeout: 30000 });
    execSync('npm install --production', { timeout: 120000 });
    res.json({ ok: true });
    setTimeout(() => {
      console.log('🔄 Update angewendet — Neustart...');
      process.exit(0); // systemd Restart=always startet automatisch neu
    }, 1500);
  } catch(e) {
    res.status(500).json({ error: 'Update fehlgeschlagen: ' + e.message });
  }
});

// ── UPLOAD ────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  res.json({ filename: req.file.filename, originalname: req.file.originalname });
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
app.delete('/api/uploads/:filename', (req, res) => {
  const filePath = path.join('./uploads', req.params.filename);
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
  const filePath = path.join('./uploads', path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.3mf' || !AdmZip) return res.json({ ext, admzip: !!AdmZip, entries: [] });
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries().map(e => ({ name: e.entryName, size: e.header.size }));
    res.json({ entries });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/uploads/:filename/thumbnail', (req, res) => {
  const filePath = path.join('./uploads', path.basename(req.params.filename));
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

// ── SERVER STARTEN ────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BambuPi läuft auf Port ${PORT}`));