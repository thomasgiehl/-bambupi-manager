const express = require('express');
const Database = require('better-sqlite3');
const mqtt = require('mqtt');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/streams', express.static('streams'));
app.use('/uploads', express.static('uploads'));

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
    brand TEXT NOT NULL, material TEXT NOT NULL, color TEXT NOT NULL,
    color_hex TEXT DEFAULT '#888888', weight_total INTEGER DEFAULT 1000,
    weight_used REAL DEFAULT 0, price_per_kg REAL DEFAULT 0,
    temp_nozzle INTEGER, temp_bed INTEGER, location TEXT, notes TEXT,
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

const defaultSettings = {
  electricity_cost: process.env.ELECTRICITY_COST || '0.35',
  printer_watt: process.env.PRINTER_WATT || '350',
  currency: 'EUR'
};
for (const [key, value] of Object.entries(defaultSettings)) {
  const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (!exists) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── MQTT ──────────────────────────────────────
let printerStatus = {};

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
      if (data.print) printerStatus[printerId] = { ...data.print, last_update: new Date().toISOString() };
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

// ── API STATUS ────────────────────────────────
app.get('/api/status', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

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
  // Beide Lichter gleichzeitig schalten
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
// Druckkopf-Lüfter (Part Cooling Fan) → M106 P1
// Auxiliary Fan (Hilfslüfter, großer Seitenlüfter) → M106 P2
// Kammerlüfter (Chamber Fan) → M106 P3
app.post('/api/printers/:id/fan', (req, res) => {
  const { percent, type } = req.body;
  const speed = Math.round((percent / 100) * 255);

  let gcode;
  if (type === 'aux') {
    gcode = `M106 P2 S${speed}`; // Auxiliary/Hilfslüfter
  } else if (type === 'chamber') {
    gcode = `M106 P3 S${speed}`; // Kammerlüfter
  } else {
    gcode = `M106 P1 S${speed}`; // Standard: Part Cooling Fan (Druckkopf)
  }

  res.json({ ok: sendGcode(req.params.id, gcode) });
});

// ── HOME & BEWEGUNG ───────────────────────────
app.post('/api/printers/:id/home', (req, res) => {
  const { axes } = req.body;
  const gcode = (!axes || axes === 'all') ? 'G28' : `G28 ${axes.toUpperCase()}`;
  res.json({ ok: sendGcode(req.params.id, gcode) });
});

app.post('/api/printers/:id/motors_off', (req, res) => {
  res.json({ ok: sendGcode(req.params.id, 'M84') });
});

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
  const { brand, material, color, color_hex, weight_total, price_per_kg, temp_nozzle, temp_bed, location, notes } = req.body;
  const result = db.prepare('INSERT INTO filaments (brand,material,color,color_hex,weight_total,price_per_kg,temp_nozzle,temp_bed,location,notes) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(brand, material, color, color_hex || '#888888', weight_total || 1000, price_per_kg || 0, temp_nozzle, temp_bed, location, notes);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/filaments/:id', (req, res) => {
  const { brand, material, color, color_hex, weight_total, weight_used, price_per_kg, temp_nozzle, temp_bed, location, notes } = req.body;
  db.prepare('UPDATE filaments SET brand=?,material=?,color=?,color_hex=?,weight_total=?,weight_used=?,price_per_kg=?,temp_nozzle=?,temp_bed=?,location=?,notes=? WHERE id=?')
    .run(brand, material, color, color_hex, weight_total, weight_used, price_per_kg, temp_nozzle, temp_bed, location, notes, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/filaments/:id', (req, res) => {
  db.prepare('DELETE FROM filaments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/filaments/:id/use', (req, res) => {
  const { grams, printer_id, filename, duration_min } = req.body;
  const filament = db.prepare('SELECT * FROM filaments WHERE id = ?').get(req.params.id);
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
  const { grams, duration_min, filament_id, post_processing_min, hourly_rate } = req.body;
  const settings = db.prepare('SELECT * FROM settings').all();
  const s = Object.fromEntries(settings.map(r => [r.key, parseFloat(r.value)]));
  let filament_cost = 0;
  if (filament_id) {
    const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(filament_id);
    if (f) filament_cost = (grams / 1000) * f.price_per_kg;
  }
  const electricity_cost = (duration_min / 60) * (s.printer_watt / 1000) * s.electricity_cost;
  const post_cost = post_processing_min ? (post_processing_min / 60) * (hourly_rate || 0) : 0;
  const total_cost = filament_cost + electricity_cost + post_cost;
  res.json({
    filament_cost: Math.round(filament_cost * 100) / 100,
    electricity_cost: Math.round(electricity_cost * 100) / 100,
    post_cost: Math.round(post_cost * 100) / 100,
    total_cost: Math.round(total_cost * 100) / 100
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

// ── UPLOAD ────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  res.json({ filename: req.file.filename, originalname: req.file.originalname });
});
app.get('/api/uploads', (req, res) => {
  const files = fs.readdirSync('./uploads').map(f => ({
    filename: f, size: fs.statSync(`./uploads/${f}`).size, uploaded_at: fs.statSync(`./uploads/${f}`).mtime
  }));
  res.json(files);
});
app.delete('/api/uploads/:filename', (req, res) => {
  const filePath = path.join('./uploads', req.params.filename);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ ok: true }); }
  else res.status(404).json({ error: 'Datei nicht gefunden' });
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
  db.prepare('DELETE FROM ams_slots WHERE printer_id=? AND unit_idx=? AND slot_idx=?').run(req.params.id, req.params.unit, req.params.slot);
  res.json({ ok: true });
});

// ── SERVER STARTEN ────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BambuPi läuft auf Port ${PORT}`));