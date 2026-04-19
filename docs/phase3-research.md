# Phase 3 — Research & Implementierungsdetails

> Stand: April 2026 | Grundlage für die nächste Implementierungs-Session

---

## 3.1 Telegram Bot Benachrichtigungen

### Bot erstellen (Voraussetzung)
1. Telegram öffnen → `@BotFather` schreiben
2. `/newbot` → Name wählen → Username wählen (muss auf `bot` enden)
3. BotFather gibt **Token** zurück: `7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
4. Chat-ID ermitteln: Bot anschreiben, dann `https://api.telegram.org/bot{TOKEN}/getUpdates` aufrufen → `result[0].message.chat.id`

### API — kein npm-Paket nötig
Direkter `fetch`-Aufruf reicht. Node.js 18+ hat nativen `fetch`.

```js
async function sendTelegram(message) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'   // erlaubt <b>bold</b>, <i>italic</i>
      })
    });
  } catch (e) {
    console.log('⚠️ Telegram Fehler:', e.message);
  }
}
```

### Einbinden in connectMQTT (server.js, ~Zeile 243)
An den bestehenden State-Change-Block anhängen — direkt nach `addEvent()`:

```js
if (prevState !== newState) {
  if (newState === 'RUNNING')  addEvent('start',  printerName + jobName + ' — Druck gestartet', printerId);
  if (newState === 'FINISH')   addEvent('finish', printerName + jobName + ' — Fertig ✅', printerId);
  if (newState === 'FAILED')   addEvent('fail',   printerName + jobName + ' — Fehlgeschlagen ❌', printerId);
  if (newState === 'PAUSE')    addEvent('pause',  printerName + ' — Pausiert', printerId);

  // NEU: Telegram
  const s = db.prepare("SELECT value FROM settings WHERE key=?").get('telegram_enabled');
  if (s?.value === '1') {
    if (newState === 'FINISH') sendTelegram(`✅ <b>${printerName}</b>\n${jobName.replace(' · ','')}\nDruck fertig!`);
    if (newState === 'FAILED') sendTelegram(`❌ <b>${printerName}</b>\n${jobName.replace(' · ','')}\nDruck fehlgeschlagen!`);
    if (newState === 'PAUSE')  sendTelegram(`⏸ <b>${printerName}</b>\nDruck pausiert`);
  }
}
```

### .env Einträge
```env
TELEGRAM_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789
```

### Settings-Tabelle (bereits vorhanden)
Einfach Keys einfügen — kein Schema-Change nötig:
- `telegram_enabled` → `'0'` / `'1'`
- `telegram_token` → alternativ in DB statt .env (dann UI-konfigurierbar)
- `telegram_chat_id`

### Foto-Snapshot mitschicken (optional, Bonus)
```js
async function sendTelegramPhoto(photoUrl, caption) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
  });
}
// Aufruf: sendTelegramPhoto('http://192.168.178.30:1984/api/frame.jpeg?src=bambu', caption)
```

---

## 3.2 Macro-Buttons (konfigurierbare GCode-Buttons)

### SQLite Tabelle (bereits im Masterplan, jetzt konkret)
```sql
CREATE TABLE IF NOT EXISTS macros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '⚙️',
  gcode TEXT NOT NULL,
  printer_id INTEGER,          -- NULL = gilt für alle Drucker
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Migration in `db.exec()` Block einfügen:
```js
db.exec(`CREATE TABLE IF NOT EXISTS macros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, icon TEXT DEFAULT '⚙️',
  gcode TEXT NOT NULL, printer_id INTEGER, sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`);
```

### Default-Macros (beim ersten Start einfügen)
```js
function seedMacros() {
  const count = db.prepare('SELECT COUNT(*) as n FROM macros').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO macros (name, icon, gcode) VALUES (?,?,?)');
  const defaults = [
    ['Home All',     '🏠', 'G28'],
    ['Cooldown',     '❄️',  'M104 S0\nM140 S0'],
    ['Fan Off',      '🌀', 'M106 S0'],
    ['Fan 100%',     '💨', 'M106 S255'],
    ['Level Bed',    '📐', 'G29'],
    ['Unload AMS',   '⏏️',  'M620 S255 A\nM702'],
    ['PLA Vorheizen','🔥', 'M104 S220\nM140 S65'],
    ['PETG Vorheizen','🔥','M104 S240\nM140 S70'],
    ['ABS Vorheizen', '🔥','M104 S260\nM140 S100'],
    ['LED Ein',      '💡', 'M960 S1'],
    ['LED Aus',      '💡', 'M960 S0'],
  ];
  defaults.forEach(([name, icon, gcode]) => insert.run(name, icon, gcode));
}
seedMacros();
```

### Nützliche GCode-Befehle für Bambu Lab X1C
| Befehl | Funktion |
|--------|----------|
| `G28` | Home All Axes |
| `G29` | Auto Bed Leveling |
| `M104 S{temp}` | Nozzle-Temperatur setzen |
| `M140 S{temp}` | Bett-Temperatur setzen |
| `M106 S{0-255}` | Lüfter-Geschwindigkeit (0=aus, 255=100%) |
| `M221 S{50-150}` | Flow Rate in Prozent |
| `M220 S{50-150}` | Print Speed in Prozent |
| `M960 S1` / `M960 S0` | Chamber LED ein/aus |
| `M620 S255 A` + `M702` | AMS Filament entladen |
| `M104 S0\nM140 S0` | Cooldown (beide Heizer aus) |
| `M600` | Filament-Wechsel (Pause + unload) |

**Hinweis:** Bambu Lab X1C akzeptiert GCode über MQTT `gcode_line` Command. Multi-Line durch `\n` trennen. Die `sendGcode(printerId, gcode)` Funktion existiert bereits in server.js.

### API-Endpoints
```js
// GET /api/macros?printer_id=1
app.get('/api/macros', (req, res) => {
  const pid = req.query.printer_id;
  const rows = db.prepare(
    'SELECT * FROM macros WHERE printer_id IS NULL OR printer_id=? ORDER BY sort_order, id'
  ).all(pid || null);
  res.json(rows);
});

// POST /api/macros
app.post('/api/macros', (req, res) => {
  const { name, icon, gcode, printer_id } = req.body;
  const r = db.prepare('INSERT INTO macros (name,icon,gcode,printer_id) VALUES (?,?,?,?)').run(name, icon || '⚙️', gcode, printer_id || null);
  res.json({ id: r.lastInsertRowid });
});

// DELETE /api/macros/:id
app.delete('/api/macros/:id', (req, res) => {
  db.prepare('DELETE FROM macros WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/macros/:id/run?printer_id=1
app.post('/api/macros/:id/run', (req, res) => {
  const macro = db.prepare('SELECT * FROM macros WHERE id=?').get(req.params.id);
  if (!macro) return res.status(404).json({ error: 'not found' });
  const ok = sendGcode(req.query.printer_id, macro.gcode);
  res.json({ ok });
});
```

### Frontend — Macro-Panel (HTML-Snippet)
```html
<div id="macro-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;"></div>
```

```js
async function loadMacros() {
  const macros = await fetch(`/api/macros?printer_id=${currentPrinterId}`).then(r => r.json());
  document.getElementById('macro-grid').innerHTML = macros.map(m => `
    <button class="macro-btn" onclick="runMacro(${m.id})" title="${m.gcode}">
      <span style="font-size:1.4em">${m.icon}</span>
      <span style="font-size:0.75em;display:block">${m.name}</span>
    </button>
  `).join('');
}

async function runMacro(id) {
  const r = await fetch(`/api/macros/${id}/run?printer_id=${currentPrinterId}`, { method: 'POST' });
  const d = await r.json();
  showToast(d.ok ? 'Macro ausgeführt' : 'Fehler');
}
```

---

## 3.3 Auto-Cooldown Timer

### Konzept
Nach `FINISH`-Event: Timer starten → nach X Minuten `M104 S0\nM140 S0` senden.
Timer wird im Memory gehalten (Map). Bei neuem Druck oder manuellem Abbruch canceln.

### Implementierung in server.js
```js
const cooldownTimers = {};  // { printerId: timeoutId }

function scheduleCooldown(printerId, delayMin) {
  // Alten Timer canceln falls vorhanden
  if (cooldownTimers[printerId]) {
    clearTimeout(cooldownTimers[printerId]);
    delete cooldownTimers[printerId];
  }
  if (!delayMin || delayMin <= 0) return;

  console.log(`⏱️ Cooldown in ${delayMin} Min für Drucker ${printerId}`);
  cooldownTimers[printerId] = setTimeout(() => {
    sendGcode(printerId, 'M104 S0\nM140 S0');
    addEvent('info', 'Auto-Cooldown ausgeführt', printerId);
    delete cooldownTimers[printerId];
    console.log(`❄️ Auto-Cooldown ausgeführt für Drucker ${printerId}`);
  }, delayMin * 60 * 1000);
}
```

### Einbinden nach FINISH-Event (in connectMQTT, nach handlePrintFinished):
```js
if (prevState && prevState !== 'FINISH' && prevState !== 'FAILED' &&
    (newState === 'FINISH' || newState === 'FAILED')) {
  handlePrintFinished(printerId, printerStatus[printerId]);

  // NEU: Auto-Cooldown
  const cooldownSetting = db.prepare("SELECT value FROM settings WHERE key='cooldown_delay_min'").get();
  const delayMin = parseInt(cooldownSetting?.value) || 0;
  if (delayMin > 0) scheduleCooldown(printerId, delayMin);
}

// Timer canceln wenn neuer Druck startet
if (prevState !== 'RUNNING' && newState === 'RUNNING') {
  printStartTimes[printerId] = Date.now();
  // Laufenden Cooldown-Timer abbrechen
  if (cooldownTimers[printerId]) {
    clearTimeout(cooldownTimers[printerId]);
    delete cooldownTimers[printerId];
    addEvent('info', 'Auto-Cooldown abgebrochen (neuer Druck)', printerId);
  }
}
```

### API-Endpoints für Timer-Status
```js
// Aktuellen Cooldown-Status abfragen
app.get('/api/cooldown/:printerId', (req, res) => {
  const pid = parseInt(req.params.printerId);
  const active = !!cooldownTimers[pid];
  res.json({ active });
});

// Cooldown manuell abbrechen
app.delete('/api/cooldown/:printerId', (req, res) => {
  const pid = parseInt(req.params.printerId);
  if (cooldownTimers[pid]) {
    clearTimeout(cooldownTimers[pid]);
    delete cooldownTimers[pid];
    res.json({ ok: true, cancelled: true });
  } else {
    res.json({ ok: true, cancelled: false });
  }
});
```

### Settings-Keys (in bestehende `settings` Tabelle einfügen)
- `cooldown_delay_min` → Default `30` (0 = deaktiviert)

### Frontend — Einstellungs-Zeile
```html
<label>Auto-Cooldown nach Druck
  <input type="number" id="cooldown-delay" min="0" max="120" step="5" value="30">
  <span>Minuten (0 = aus)</span>
</label>
```

```js
// Beim Speichern der Settings:
await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ cooldown_delay_min: document.getElementById('cooldown-delay').value })
});
```

---

## 3.4 Snapshot Button (Kamera-Screenshot)

### go2rtc API — Snapshot Endpoint
go2rtc bietet einen direkten JPEG-Frame-Endpoint (keine zusätzliche Konfiguration nötig):

```
GET http://192.168.178.30:1984/api/frame.jpeg?src={stream_name}
```

Der `src`-Parameter ist der Stream-Name wie er in der go2rtc config definiert ist (z.B. `bambu`, `cam`, `printer` — je nach Setup).

**Alternative URL-Formate (je nach go2rtc-Version):**
```
http://192.168.178.30:1984/api/frame.jpeg?src=bambu
http://192.168.178.30:1984/snapshot?src=bambu         # ältere Versionen
```

go2rtc-Version prüfen: `http://192.168.178.30:1984/api` (gibt JSON mit Endpoints zurück)

### Backend-Endpoint (Proxy-Approach, empfohlen)
Direkter Browser-Zugriff auf go2rtc funktioniert — aber ein Backend-Proxy erlaubt Speichern + Timestamp:

```js
app.get('/api/snapshot/:printerId', async (req, res) => {
  try {
    const streamName = process.env.GO2RTC_STREAM || 'bambu';
    const go2rtcUrl = process.env.GO2RTC_URL || 'http://192.168.178.30:1984';
    const response = await fetch(`${go2rtcUrl}/api/frame.jpeg?src=${streamName}`);
    if (!response.ok) throw new Error(`go2rtc: ${response.status}`);
    const buffer = await response.arrayBuffer();
    const timestamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,-5);
    const filename = `snapshot-${timestamp}.jpg`;
    const filepath = `./streams/${filename}`;
    fs.writeFileSync(filepath, Buffer.from(buffer));
    res.json({ ok: true, url: `/streams/${filename}`, filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

### .env Einträge
```env
GO2RTC_URL=http://192.168.178.30:1984
GO2RTC_STREAM=bambu
```

### Frontend — Snapshot-Button
```html
<button id="snapshot-btn" onclick="takeSnapshot()" title="Screenshot speichern">📸</button>
<a id="snapshot-link" style="display:none" download></a>
```

```js
async function takeSnapshot() {
  const btn = document.getElementById('snapshot-btn');
  btn.disabled = true;
  try {
    const r = await fetch(`/api/snapshot/${currentPrinterId}`);
    const d = await r.json();
    if (d.ok) {
      // Auto-Download
      const link = document.getElementById('snapshot-link');
      link.href = d.url;
      link.download = d.filename;
      link.click();
      showToast('Snapshot gespeichert: ' + d.filename);
    } else {
      showToast('Fehler: ' + d.error, 'error');
    }
  } finally {
    btn.disabled = false;
  }
}
```

### Direkt-Ansatz (ohne Backend, nur Download)
Falls kein Speichern gewünscht — nur Direktlink:
```js
// Öffnet Bild im neuen Tab / Browser-Download
function quickSnapshot() {
  const url = `http://192.168.178.30:1984/api/frame.jpeg?src=bambu&t=${Date.now()}`;
  window.open(url, '_blank');
}
```

---

## 3.5 Filament Restmenge Warnung

### Logik: wann warnen?
Empfehlung: Schwellwert in Gramm (absolut), nicht in Prozent — weil 200g von 1000g vs. 200g von 250g sehr unterschiedlich sind.

**Zwei Schwellwerte sinnvoll:**
- `warn`: z.B. < 200g verbleibend → gelbe Warnung
- `critical`: z.B. < 50g verbleibend → rote Warnung / Badge

### Berechnung
```js
function filamentRemaining(f) {
  return Math.max(0, (f.weight_total || 1000) - (f.weight_used || 0));
}
function filamentWarnLevel(f) {
  const remaining = filamentRemaining(f);
  if (remaining < 50)  return 'critical';  // < 50g
  if (remaining < 200) return 'warn';      // < 200g
  return 'ok';
}
```

### Frontend — Badge auf Filament-Seite
```js
function renderFilamentCard(f) {
  const remaining = Math.max(0, f.weight_total - f.weight_used);
  const pct = Math.min(100, Math.round((f.weight_used / f.weight_total) * 100));
  const warnLevel = filamentWarnLevel(f);
  const badge = warnLevel === 'critical'
    ? `<span class="badge badge-red">⚠️ ${remaining}g</span>`
    : warnLevel === 'warn'
    ? `<span class="badge badge-yellow">⚠️ ${remaining}g</span>`
    : '';
  return `
    <div class="filament-card ${warnLevel !== 'ok' ? 'filament-warn' : ''}">
      <div class="filament-header">
        <span class="swatch" style="background:${f.color_hex}"></span>
        <b>${f.brand} ${f.material}</b>
        ${badge}
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${warnLevel === 'critical' ? 'fill-red' : ''}"
             style="width:${pct}%"></div>
      </div>
      <small>${remaining}g verbleibend von ${f.weight_total}g</small>
    </div>`;
}
```

### Toast beim Dashboard-Load
```js
async function checkFilamentWarnings() {
  const filaments = await fetch('/api/filaments').then(r => r.json());
  const critical = filaments.filter(f => filamentWarnLevel(f) === 'critical');
  const warn     = filaments.filter(f => filamentWarnLevel(f) === 'warn');
  if (critical.length > 0) {
    showToast(`⚠️ ${critical.length} Filament(e) fast leer! (<50g)`, 'error');
  } else if (warn.length > 0) {
    showToast(`⚠️ ${warn.length} Filament(e) haben wenig Rest (<200g)`, 'warn');
  }
}
// Aufruf beim Init: checkFilamentWarnings();
```

### Settings-Keys
- `filament_warn_g` → Default `200`
- `filament_critical_g` → Default `50`

---

## Implementierungs-Reihenfolge (Empfehlung)

| Prio | Feature | Aufwand | Abhängigkeiten |
|------|---------|---------|----------------|
| 1 | Filament-Warnung (3.5) | 30 Min | keine |
| 2 | Macro-Buttons (3.2) | 60 Min | keine |
| 3 | Auto-Cooldown (3.3) | 45 Min | Macro-Infra nützlich |
| 4 | Snapshot-Button (3.4) | 30 Min | go2rtc läuft |
| 5 | Telegram Bot (3.1) | 45 Min | .env Setup |

---

## Checkliste vor Implementierung

- [ ] go2rtc Stream-Name ermitteln: `curl http://192.168.178.30:1984/api/streams`
- [ ] Telegram Token + Chat-ID in .env eintragen
- [ ] `cooldown_delay_min` und `telegram_enabled` in settings-Tabelle einfügen
- [ ] macros-Tabelle Migration in db.exec() Block einfügen
- [ ] Node.js Version prüfen: `node -v` → muss ≥18 für nativen fetch

---

*Generiert als Implementierungsgrundlage für BambuPi Manager Phase 3*
