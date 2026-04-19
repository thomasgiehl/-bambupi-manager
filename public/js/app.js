let assignCtx = {printerId:null,unitIdx:null,slotIdx:null,selectedFilamentId:null};
let filEditId = null;
let filamentCache = [];
let tempCtx = {printerId:null,type:null};
let openAmsDetail = null;
let currentFileTab = 'upload';
let cachedPrinters = [];
let cachedAms = {};
let dashboardBuilt = false;
const printerHomeFlags = {};
const printerPrevState = {};
const tempHistory = {};
const tempPrev = {};
const chartInstances = {};
const PAGE_TITLES = {dashboard:'DASHBOARD',files:'DATEIMANAGER',printers:'DRUCKER',filaments:'FILAMENTE',history:'HISTORIE',calculator:'RECHNER',settings:'EINSTELLUNGEN'};

// ── STATUS HELPERS ────────────────────────────
const STAGE_NAMES = {0:'Bereit',1:'Bett-Leveling',2:'Bett heizt auf',4:'Filament wechseln',7:'Nozzle heizt auf',8:'Extrusion kalibr.',9:'Bett scannen',14:'Homing',15:'Nozzle reinigen',17:'Druckt',255:'Bereit'};
function stageName(stage){return STAGE_NAMES[stage]||('Phase '+stage);}
function stateBadgeHtml(state){
  if(state==='RUNNING') return '<div class="sdot sdot-green"></div>DRUCKT';
  if(state==='PAUSE')   return '<div class="sdot sdot-orange"></div>PAUSIERT';
  if(state==='FAILED')  return '<div class="sdot sdot-red"></div>FEHLER';
  if(state==='FINISH')  return '<div class="sdot sdot-teal"></div>FERTIG';
  if(state==='offline') return '<div class="sdot sdot-gray"></div>OFFLINE';
  return '<div class="sdot sdot-blue"></div>BEREIT';
}
function stateBadgeClass(state){
  if(state==='RUNNING') return 'print-state-badge psb-printing';
  if(state==='PAUSE')   return 'print-state-badge psb-paused';
  if(state==='FAILED')  return 'print-state-badge psb-failed';
  if(state==='FINISH')  return 'print-state-badge psb-finish';
  if(state==='offline') return 'print-state-badge psb-offline';
  return 'print-state-badge psb-ready';
}

// ── FILAMENT DATENBANK ────────────────────────
// Format: brand -> material -> { nozzle_min, nozzle_max, temp_bed, temp_dry, time_dry, price_per_kg }
const FILAMENT_DB = {
  'Sunlu': {
    'PLA':    {nozzle_min:180,nozzle_max:220,nozzle:200,bed:60, dry_temp:45,dry_time:4, price:18},
    'PLA+':   {nozzle_min:190,nozzle_max:230,nozzle:215,bed:60, dry_temp:45,dry_time:4, price:20},
    'PETG':   {nozzle_min:230,nozzle_max:250,nozzle:240,bed:80, dry_temp:65,dry_time:4, price:22},
    'ABS':    {nozzle_min:230,nozzle_max:260,nozzle:245,bed:100,dry_temp:80,dry_time:4, price:20},
    'ASA':    {nozzle_min:240,nozzle_max:260,nozzle:250,bed:100,dry_temp:80,dry_time:4, price:24},
    'TPU':    {nozzle_min:220,nozzle_max:240,nozzle:230,bed:30, dry_temp:50,dry_time:6, price:26},
    'PLA-CF': {nozzle_min:200,nozzle_max:230,nozzle:220,bed:60, dry_temp:55,dry_time:6, price:35},
  },
  'eSUN': {
    'PLA':    {nozzle_min:190,nozzle_max:220,nozzle:210,bed:60, dry_temp:45,dry_time:4, price:18},
    'PLA+':   {nozzle_min:200,nozzle_max:230,nozzle:220,bed:60, dry_temp:45,dry_time:4, price:22},
    'PETG':   {nozzle_min:230,nozzle_max:250,nozzle:240,bed:75, dry_temp:65,dry_time:4, price:22},
    'ABS':    {nozzle_min:230,nozzle_max:260,nozzle:245,bed:95, dry_temp:80,dry_time:4, price:20},
    'ASA':    {nozzle_min:240,nozzle_max:260,nozzle:250,bed:95, dry_temp:80,dry_time:4, price:24},
    'TPU':    {nozzle_min:220,nozzle_max:240,nozzle:230,bed:30, dry_temp:50,dry_time:6, price:28},
    'HIPS':   {nozzle_min:220,nozzle_max:250,nozzle:235,bed:100,dry_temp:70,dry_time:4, price:20},
    'PVA':    {nozzle_min:190,nozzle_max:220,nozzle:205,bed:60, dry_temp:45,dry_time:8, price:60},
  },
  'Bambu Lab': {
    'Bambu PLA Basic': {nozzle_min:190,nozzle_max:240,nozzle:220,bed:35, dry_temp:45,dry_time:8, price:28},
    'Bambu PETG Basic':{nozzle_min:230,nozzle_max:270,nozzle:255,bed:70, dry_temp:65,dry_time:8, price:28},
    'Bambu ABS':       {nozzle_min:240,nozzle_max:270,nozzle:260,bed:90, dry_temp:80,dry_time:8, price:28},
    'Bambu ASA':       {nozzle_min:240,nozzle_max:270,nozzle:260,bed:90, dry_temp:80,dry_time:8, price:30},
  },
  'Prusament': {
    'PLA':    {nozzle_min:200,nozzle_max:230,nozzle:215,bed:60, dry_temp:45,dry_time:4, price:30},
    'PETG':   {nozzle_min:230,nozzle_max:250,nozzle:240,bed:85, dry_temp:65,dry_time:4, price:32},
    'ASA':    {nozzle_min:240,nozzle_max:260,nozzle:255,bed:100,dry_temp:80,dry_time:4, price:34},
    'PA':     {nozzle_min:250,nozzle_max:275,nozzle:265,bed:90, dry_temp:90,dry_time:12,price:50},
    'PC':     {nozzle_min:275,nozzle_max:310,nozzle:290,bed:110,dry_temp:100,dry_time:12,price:55},
  },
  'Polymaker': {
    'PLA':    {nozzle_min:190,nozzle_max:230,nozzle:210,bed:25, dry_temp:45,dry_time:6, price:25},
    'PLA+':   {nozzle_min:200,nozzle_max:230,nozzle:215,bed:60, dry_temp:45,dry_time:6, price:28},
    'PETG':   {nozzle_min:230,nozzle_max:250,nozzle:240,bed:80, dry_temp:65,dry_time:6, price:28},
    'PA-CF':  {nozzle_min:260,nozzle_max:280,nozzle:270,bed:80, dry_temp:90,dry_time:12,price:65},
    'PC':     {nozzle_min:260,nozzle_max:310,nozzle:285,bed:100,dry_temp:100,dry_time:12,price:50},
  },
  'Fiberlogy': {
    'PLA':    {nozzle_min:200,nozzle_max:235,nozzle:215,bed:50, dry_temp:45,dry_time:4, price:22},
    'PETG':   {nozzle_min:230,nozzle_max:260,nozzle:245,bed:75, dry_temp:65,dry_time:4, price:24},
    'ABS':    {nozzle_min:230,nozzle_max:260,nozzle:245,bed:100,dry_temp:80,dry_time:4, price:22},
    'ASA':    {nozzle_min:235,nozzle_max:265,nozzle:250,bed:100,dry_temp:80,dry_time:4, price:26},
    'PA':     {nozzle_min:240,nozzle_max:270,nozzle:255,bed:70, dry_temp:90,dry_time:12,price:55},
  },
  'Hatchbox': {
    'PLA':    {nozzle_min:180,nozzle_max:210,nozzle:195,bed:60, dry_temp:45,dry_time:4, price:20},
    'PETG':   {nozzle_min:230,nozzle_max:260,nozzle:245,bed:75, dry_temp:65,dry_time:4, price:22},
    'ABS':    {nozzle_min:220,nozzle_max:250,nozzle:235,bed:100,dry_temp:80,dry_time:4, price:20},
    'TPU':    {nozzle_min:210,nozzle_max:240,nozzle:225,bed:30, dry_temp:50,dry_time:6, price:28},
  },
  'Overture': {
    'PLA':    {nozzle_min:190,nozzle_max:220,nozzle:205,bed:60, dry_temp:45,dry_time:4, price:18},
    'PLA+':   {nozzle_min:200,nozzle_max:230,nozzle:215,bed:60, dry_temp:45,dry_time:4, price:20},
    'PETG':   {nozzle_min:230,nozzle_max:250,nozzle:240,bed:75, dry_temp:65,dry_time:4, price:22},
    'TPU':    {nozzle_min:220,nozzle_max:240,nozzle:230,bed:30, dry_temp:50,dry_time:6, price:26},
  },
  'generic': {
    'PLA':    {nozzle_min:180,nozzle_max:220,nozzle:200,bed:60, dry_temp:45,dry_time:4, price:15},
    'PLA+':   {nozzle_min:190,nozzle_max:230,nozzle:215,bed:60, dry_temp:45,dry_time:4, price:18},
    'PETG':   {nozzle_min:230,nozzle_max:250,nozzle:240,bed:80, dry_temp:65,dry_time:4, price:18},
    'ABS':    {nozzle_min:230,nozzle_max:260,nozzle:245,bed:100,dry_temp:80,dry_time:4, price:16},
    'ASA':    {nozzle_min:240,nozzle_max:260,nozzle:250,bed:100,dry_temp:80,dry_time:4, price:20},
    'TPU':    {nozzle_min:220,nozzle_max:240,nozzle:230,bed:30, dry_temp:50,dry_time:6, price:22},
    'PA':     {nozzle_min:250,nozzle_max:280,nozzle:265,bed:80, dry_temp:90,dry_time:12,price:45},
    'PC':     {nozzle_min:270,nozzle_max:310,nozzle:290,bed:110,dry_temp:100,dry_time:12,price:50},
    'PLA-CF': {nozzle_min:200,nozzle_max:230,nozzle:220,bed:60, dry_temp:55,dry_time:6, price:30},
    'PETG-CF':{nozzle_min:240,nozzle_max:260,nozzle:250,bed:80, dry_temp:65,dry_time:6, price:35},
  }
};

// ── DB PICKER LOGIK (OrcaSlicer Live) ─────────
let orcaDbCache = null;

async function dbInit() {
  const brandSel = document.getElementById('db-brand');
  brandSel.innerHTML = '<option value="">Lade...</option>';
  if (!orcaDbCache) {
    orcaDbCache = await api('/api/filament-db');
  }
  const brands = Object.keys(orcaDbCache).sort();
  if (!brands.length) {
    brandSel.innerHTML = '<option value="">Noch keine Daten — Server lädt...</option>';
    return;
  }
  brandSel.innerHTML = '<option value="">— Hersteller —</option>' +
    brands.map(b => `<option value="${b}">${b}</option>`).join('');
  document.getElementById('db-material').innerHTML = '<option value="">— Material —</option>';
  document.getElementById('db-preview').textContent = 'Hersteller und Material wählen';
}

function dbUpdateMaterials() {
  const brand = document.getElementById('db-brand').value;
  const matSel = document.getElementById('db-material');
  if (!brand || !orcaDbCache?.[brand]) {
    matSel.innerHTML = '<option value="">— Material —</option>';
    document.getElementById('db-preview').textContent = 'Hersteller und Material wählen';
    return;
  }
  matSel.innerHTML = '<option value="">— Material —</option>' +
    Object.keys(orcaDbCache[brand]).sort().map(m => `<option value="${m}">${m}</option>`).join('');
  dbUpdatePreview();
}

function dbUpdatePreview() {
  const brand = document.getElementById('db-brand').value;
  const mat   = document.getElementById('db-material').value;
  const prev  = document.getElementById('db-preview');
  const d = orcaDbCache?.[brand]?.[mat];
  if (!d) { prev.textContent = 'Material wählen um Vorschau zu sehen'; return; }
  const parts = [];
  if (d.nozzle_min && d.nozzle_max) parts.push(`Nozzle: ${d.nozzle_min}–${d.nozzle_max}°C (Standard: ${d.nozzle}°C)`);
  else if (d.nozzle) parts.push(`Nozzle: ${d.nozzle}°C`);
  if (d.bed)      parts.push(`Bett: ${d.bed}°C`);
  if (d.dry_temp) parts.push(`Dry: ${d.dry_temp}°C`);
  if (d.price)    parts.push(`~${d.price}€/kg`);
  prev.innerHTML = `<span style="color:var(--text)">${parts.join(' &nbsp;|&nbsp; ')}</span>`;
}

function dbApply() {
  const brand = document.getElementById('db-brand').value;
  const mat   = document.getElementById('db-material').value;
  const d = orcaDbCache?.[brand]?.[mat];
  if (!d) { toast('Bitte Hersteller und Material wählen!', 'error'); return; }
  document.getElementById('f-brand').value = brand;
  // Material ins Dropdown einfügen falls nicht vorhanden
  const matEl = document.getElementById('f-material');
  if (![...matEl.options].find(o => o.value === mat)) {
    const opt = document.createElement('option'); opt.value = mat; opt.text = mat; matEl.add(opt);
  }
  matEl.value = mat;
  if (d.nozzle_min) document.getElementById('f-nozzle-min').value = d.nozzle_min;
  if (d.nozzle_max) document.getElementById('f-nozzle-max').value = d.nozzle_max;
  if (d.nozzle)     document.getElementById('f-nozzle').value     = d.nozzle;
  if (d.bed)        document.getElementById('f-bed').value        = d.bed;
  if (d.dry_temp)   document.getElementById('f-dry-temp').value   = d.dry_temp;
  if (d.price)      document.getElementById('f-price').value      = d.price;
  document.getElementById('f-flow').value   = 100;
  document.getElementById('f-shrink').value = 100;
  toast(`✅ ${brand} ${mat} geladen — Farbe und PA/KA noch eintragen`);
}

// ── BASIS ─────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector('[data-page="' + name + '"]').classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[name] || name;
  if (name === 'dashboard')  { loadStats(); buildDashboard(); }
  if (name === 'printers')   loadPrinters();
  if (name === 'filaments')  loadFilaments();
  if (name === 'history')    loadHistory();
  if (name === 'calculator') loadCalcFilaments();
  if (name === 'settings')   loadSettings();
  if (name === 'files')      initFilePage();
}
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'modal-add-filament') dbInit();
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function toast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}
async function api(url, method='GET', body=null) {
  const opts = {method, headers:{'Content-Type':'application/json'}};
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts); return r.json();
}
function fmtSize(b) { return b>1048576?(b/1048576).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB'; }
function rcol(pct) { if(pct<0)return'#333';if(pct>50)return'var(--green)';if(pct>20)return'var(--orange)';return'var(--red)'; }

// ── CONNECTION CHIP ───────────────────────────
function updateConnectionChip(state) {
  const chip = document.getElementById('connection-chip');
  if (state==='RUNNING') chip.innerHTML='<div class="sdot sdot-green"></div>DRUCKT';
  else if (state==='offline') chip.innerHTML='<div class="sdot sdot-gray"></div>OFFLINE';
  else chip.innerHTML='<div class="sdot sdot-blue"></div>BEREIT';
}

// ── DASHBOARD ─────────────────────────────────
async function buildDashboard() {
  Object.keys(chartInstances).forEach(pid => {
    if(chartInstances[pid]){chartInstances[pid].destroy();delete chartInstances[pid];}
  });
  const printers = await api('/api/printers');
  const container = document.getElementById('dashboard-printers');
  if (!printers.length) {
    container.innerHTML='<div class="card" style="text-align:center;padding:36px;color:var(--text3);">Noch kein Drucker.<br><br><button class="btn btn-primary" onclick="showPage(\'printers\')">+ Hinzufügen</button></div>';
    updateConnectionChip('offline'); return;
  }
  cachedPrinters = printers;
  await Promise.all(printers.map(async p => {
    try { cachedAms[p.id] = await api('/api/ams/' + p.id); } catch(e) { cachedAms[p.id] = null; }
  }));
  container.innerHTML = printers.map(p => buildPrinterCard(p)).join('');
  dashboardBuilt = true;
  updateConnectionChip(printers[0]?.status?.gcode_state || 'offline');
  printers.forEach(p => { initTempChart(p.id); updatePosDisplay(p.id); });
}

async function realtimeUpdate() {
  if (!dashboardBuilt) return;
  const printers = await api('/api/printers');
  const eventLog = await api('/api/event-log');

  printers.forEach(p => {
    const s = p.status || {};
    const nozzle   = s.nozzle_temper || 0;
    const bed      = s.bed_temper || 0;
    const progress = s.mc_percent || 0;
    const remaining= s.mc_remaining_time || 0;
    const state    = s.gcode_state || 'offline';
    const nTarget  = s.nozzle_temper_target || 0;
    const bTarget  = s.bed_target_temper || 0;
    const layer    = s.layer_num || 0;
    const totalLayer= s.total_layer_num || 0;

    // ── Gauges ──
    updateGauge(p.id, 'nozzle', nozzle, nTarget);
    updateGauge(p.id, 'bed', bed, bTarget);

    // ── Print Progress ──
    const pfEl = document.getElementById('cnc-pf-' + p.id); if (pfEl) pfEl.style.width = progress + '%';
    const ppEl = document.getElementById('cnc-pp-' + p.id); if (ppEl) ppEl.textContent = progress + '%';
    const ptEl = document.getElementById('cnc-eta-' + p.id); if (ptEl) ptEl.textContent = (remaining > 0 ? remaining + ' min' : '—');
    const fnEl = document.getElementById('cnc-fn-' + p.id); if (fnEl) fnEl.textContent = s.subtask_name || '—';
    const layEl = document.getElementById('cnc-lay-' + p.id); if (layEl) layEl.textContent = layer + '/' + totalLayer;

    // ── Console / Events ──
    const conEl = document.getElementById('console-' + p.id);
    if (conEl && eventLog) {
      const pEvents = eventLog.filter(e => e.printerId === p.id).slice(0, 10);
      conEl.innerHTML = pEvents.map(e => `
        <div style="margin-bottom: 4px; display: flex; gap: 6px;">
          <span style="color: var(--text3); min-width: 40px;">${e.time}</span>
          <span style="color: ${e.type==='error'?'var(--red)':e.type==='warning'?'var(--orange)':e.type==='success'?'var(--green)':'var(--text2)'}">${e.message}</span>
        </div>
      `).join('') || '<div style="color: var(--text3); font-style: italic;">Keine Events</div>';
    }

    // ── Badge & Speed ──
    const badgeEl = document.getElementById('cnc-badge-' + p.id);
    if (badgeEl) badgeEl.innerHTML = stateBadgeHtml(state);
    
    [1,2,3,4].forEach(l => {
      const el = document.getElementById(`cncspd-${p.id}-${l}`);
      if (el) el.className = 'spd-btn' + (s.spd_lvl === l ? ' active' : '');
    });

    updateConnectionChip(state);
    updateTempChart(p.id, nozzle, bed);
    printerPrevState[p.id] = state;
  });
}

function updateGauge(pid, type, val, target) {
  const path = document.getElementById(`gauge-path-${pid}-${type}`);
  const valEl = document.getElementById(`gauge-val-${pid}-${type}`);
  const tgtEl = document.getElementById(`gauge-tgt-${pid}-${type}`);
  if (!path || !valEl) return;

  const max = type === 'nozzle' ? 300 : 100;
  const pct = Math.min(100, (val / max) * 100);
  const offset = 283 - (283 * pct) / 100;
  
  path.style.strokeDashoffset = offset;
  valEl.textContent = Math.round(val) + '°';
  if (tgtEl) tgtEl.textContent = '→ ' + target + '°C';
  
  // Color feedback
  if (target > 0 && Math.abs(val - target) < 2) {
    path.style.stroke = 'var(--green)';
  } else {
    path.style.stroke = type === 'nozzle' ? 'var(--red)' : 'var(--accent)';
  }
}

function buildPrinterCard(p) {
  const s = p.status || {};
  const state = s.gcode_state || 'offline';
  const ams = cachedAms[p.id];
  const progress = s.mc_percent || 0;

  return `
  <div class="dashboard-container" id="pcard-${p.id}">
    <!-- HEADER -->
    <div class="area-header widget" style="padding: 10px 20px; flex-direction: row; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="logo-mark" style="width: 36px; height: 36px;">🖨️</div>
        <div>
          <div style="font-size: 16px; font-weight: 700;">${p.name}</div>
          <div style="font-size: 10px; color: var(--text3); font-family: var(--mono);">${p.model} · ${p.serial}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div id="cnc-badge-${p.id}">${stateBadgeHtml(state)}</div>
        <div class="status-pill">
          <div class="sdot sdot-green"></div>
          <span>LIVE</span>
        </div>
      </div>
    </div>

    <!-- CAMERA -->
    <div class="area-camera widget" style="padding: 0; overflow: hidden; height: 100%;">
      <div class="widget-header" style="position: absolute; top: 12px; left: 12px; right: 12px; z-index: 10; pointer-events: none;">
        <span class="widget-title" style="background: rgba(0,0,0,0.5); padding: 4px 8px; border-radius: 4px; backdrop-filter: blur(4px);">KAMERA</span>
      </div>
      <div style="position: relative; width: 100%; height: 100%; background: #000; min-height: 320px;">
        <img src="/api/stream/mjpeg" alt="Kamera" style="width: 100%; height: 100%; object-fit: cover; display: block;">
        
        <!-- Camera Overlays -->
        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 16px; pointer-events: none;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
              <div style="font-size: 20px; font-weight: 800; color: var(--green); font-family: var(--mono); line-height: 1;" id="cnc-pp-${p.id}">${progress}%</div>
              <div style="font-size: 10px; color: var(--text2); margin-top: 4px;" id="cnc-fn-${p.id}">${s.subtask_name || '—'}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 10px; color: var(--text2); font-family: var(--mono);">ETA: <span id="cnc-eta-${p.id}">${s.mc_remaining_time || '—'} min</span></div>
              <div style="font-size: 10px; color: var(--text2); font-family: var(--mono);">Layer: <span id="cnc-lay-${p.id}">${s.layer_num || 0}/${s.total_layer_num || 0}</span></div>
            </div>
          </div>
          <div class="vp-pbar" style="margin-top: 8px; height: 3px; background: rgba(255,255,255,0.1);">
            <div class="vp-pbar-fill" id="cnc-pf-${p.id}" style="width: ${progress}%; background: var(--green);"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- AMS -->
    <div class="area-ams widget">
      <div class="widget-header">
        <span class="widget-title">AMS / FILAMENT</span>
      </div>
      ${buildAmsHtml(ams, p.id)}
    </div>

    <!-- STATUS / GAUGES -->
    <div class="area-status widget">
      <div class="widget-header">
        <span class="widget-title">TELEMETRIE</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
        ${buildGaugeHtml(p.id, 'nozzle', 'NOZZLE')}
        ${buildGaugeHtml(p.id, 'bed', 'BED')}
      </div>
      <div style="margin-top: 8px;">
        <div class="fan-ctrl">
          <div class="fan-ctrl-lbl" style="font-size: 9px;"><span>Bauteillüfter</span><span id="fan-val-${p.id}">0%</span></div>
          <input type="range" class="fan-slider" min="0" max="100" value="0" onchange="setFan(${p.id}, parseInt(this.value), 'part')">
        </div>
      </div>
    </div>

    <!-- CONTROLS -->
    <div class="area-controls widget">
      <div class="widget-header">
        <span class="widget-title">STEUERUNG</span>
      </div>
      <div class="cnc-btn-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        ${state === 'RUNNING'
          ? `<button class="cb cb-pause" onclick="printerCmd(${p.id}, 'pause')"><span class="cb-icon">⏸</span><span class="cb-lbl">PAUSE</span></button>`
          : `<button class="cb cb-resume" onclick="printerCmd(${p.id}, 'resume')"><span class="cb-icon">▶</span><span class="cb-lbl">START</span></button>`}
        <button class="cb cb-stop" onclick="printerCmd(${p.id}, 'stop')"><span class="cb-icon">⏹</span><span class="cb-lbl">STOPP</span></button>
        <button class="cb cb-light" onclick="setLight(${p.id}, true)"><span class="cb-icon">💡</span><span class="cb-lbl">LICHT AN</span></button>
        <button class="cb cb-light" onclick="setLight(${p.id}, false)"><span class="cb-icon">🌑</span><span class="cb-lbl">LICHT AUS</span></button>
      </div>
      <div style="margin-top: 12px;">
        <div class="widget-title" style="margin-bottom: 8px; font-size: 9px;">GESCHWINDIGKEIT</div>
        <div class="spd-row" style="display: flex; gap: 4px;">
          <button class="spd-btn ${s.spd_lvl===1?'active':''}" onclick="setSpeed(${p.id},1)">Silent</button>
          <button class="spd-btn ${s.spd_lvl===2?'active':''}" onclick="setSpeed(${p.id},2)">Normal</button>
          <button class="spd-btn ${s.spd_lvl===3?'active':''}" onclick="setSpeed(${p.id},3)">Sport</button>
          <button class="spd-btn ${s.spd_lvl===4?'active':''}" onclick="setSpeed(${p.id},4)">Turbo</button>
        </div>
      </div>
    </div>

    <!-- CONSOLE -->
    <div class="area-console widget" style="min-height: 200px;">
      <div class="widget-header">
        <span class="widget-title">CONSOLE</span>
        <span style="font-size: 9px; color: var(--text3); font-family: var(--mono);">G-CODE LIVE</span>
      </div>
      <div id="console-${p.id}" style="flex: 1; background: rgba(0,0,0,0.3); border-radius: 4px; padding: 8px; font-family: var(--mono); font-size: 11px; color: var(--text2); overflow-y: auto; max-height: 240px; display: flex; flex-direction: column-reverse;">
        <div style="color: var(--text3); font-style: italic;">Warte auf Daten...</div>
      </div>
      <div style="margin-top: 8px; display: flex; gap: 8px;">
        <input type="text" id="console-input-${p.id}" placeholder="G-Code senden..." 
               style="flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 6px 12px; color: var(--text); font-family: var(--mono); font-size: 12px;"
               onkeyup="if(event.key==='Enter') sendGCode(${p.id})">
        <button class="btn btn-primary" style="padding: 4px 12px; font-size: 11px;" onclick="sendGCode(${p.id})">SENDEN</button>
      </div>
    </div>
  </div>
  `;
}

function buildGaugeHtml(pid, type, label) {
  const color = type === 'nozzle' ? 'var(--red)' : 'var(--accent)';
  return `
    <div class="gauge-container" onclick="openTempModal(${pid}, '${type}', 0)" style="cursor: pointer; text-align: center;">
      <div style="position: relative; width: 80px; height: 80px; margin: 0 auto;">
        <svg viewBox="0 0 100 100" style="transform: rotate(-90deg); width: 100%; height: 100%;">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8" />
          <circle id="gauge-path-${pid}-${type}" cx="50" cy="50" r="45" fill="none" stroke="${color}" stroke-width="8" 
            stroke-dasharray="283" stroke-dashoffset="283" style="transition: stroke-dashoffset 0.5s ease; stroke-linecap: round;" />
        </svg>
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div id="gauge-val-${pid}-${type}" style="font-size: 16px; font-weight: 700; font-family: var(--mono); line-height: 1;">0°</div>
          <div style="font-size: 8px; color: var(--text3); margin-top: 2px;">${label}</div>
        </div>
      </div>
      <div id="gauge-tgt-${pid}-${type}" style="font-size: 10px; color: var(--text3); font-family: var(--mono); margin-top: 4px;">→ 0°C</div>
    </div>
  `;
}
            <div class="home-row-cnc">
              <button class="home-btn-cnc" onclick="homeAxes(${p.id},'all')">🏠 ALL</button>
              <button class="home-btn-cnc" onclick="homeAxes(${p.id},'x')">X</button>
              <button class="home-btn-cnc" onclick="homeAxes(${p.id},'y')">Y</button>
              <button class="home-btn-cnc" onclick="homeAxes(${p.id},'z')">Z</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- TEMPERATUR GRAPH -->
  <div class="cnc-panel" style="margin-bottom:4px;">
    <div class="cnc-panel-head">
      <span class="cnc-panel-title">Temperaturverlauf</span>
      <span style="font-size:9px;color:var(--text3);font-family:var(--mono);">letzte 2 Min</span>
    </div>
    <div style="height:110px;padding:6px 8px;">
      <canvas id="temp-chart-${p.id}"></canvas>
    </div>
  </div>

  `;
}

// ── STEUERUNG ─────────────────────────────────
async function printerCmd(pid,action){if(action==='stop'&&!confirm('Druck wirklich abbrechen?'))return;await api('/api/printers/'+pid+'/'+action,'POST');toast(action==='pause'?'⏸ Pausiert':action==='resume'?'▶ Fortgesetzt':'⏹ Abgebrochen');setTimeout(buildDashboard,2000);}
async function setLight(pid,on){await api('/api/printers/'+pid+'/light','POST',{on});toast(on?'💡 Licht an':'💡 Licht aus');}
async function setSpeed(pid,level){await api('/api/printers/'+pid+'/speed','POST',{level});const L={1:'STILLE',2:'NORMAL',3:'SPORT',4:'TURBO'};toast('⚡ '+L[level]);setTimeout(buildDashboard,1500);}
async function homeAxes(pid,axes){
  await api('/api/printers/'+pid+'/home','POST',{axes});
  toast('🏠 HOME: '+(axes==='all'?'ALLE ACHSEN':axes.toUpperCase()));
  if(!axisPos[pid])axisPos[pid]={x:0,y:0,z:0};
  if(axes==='all'){axisPos[pid]={x:0,y:0,z:0,homed:true};}
  else{axisPos[pid][axes]=0;}
  updatePosDisplay(pid);
}
const axisPos={};
async function moveAxis(pid,axis,distance){
  const r=await api('/api/printers/'+pid+'/move','POST',{axis,distance});
  if(r.ok){
    toast(`→ ${axis.toUpperCase()} ${distance>0?'+':''}${distance} mm`);
    if(!axisPos[pid])axisPos[pid]={x:0,y:0,z:0};
    axisPos[pid][axis]=Math.round((axisPos[pid][axis]+distance)*100)/100;
    updatePosDisplay(pid);
  } else toast('Fehler beim Bewegen','error');
}
function updatePosDisplay(pid){
  const pos=axisPos[pid];
  const xEl=document.getElementById('dro-x-'+pid);
  const yEl=document.getElementById('dro-y-'+pid);
  const zEl=document.getElementById('dro-z-'+pid);
  const warn=document.getElementById('pos-warn-'+pid);
  if(!pos||!pos.homed){
    if(xEl){xEl.textContent='---.---';xEl.classList.add('dro-unknown');xEl.classList.remove('dro-homed');}
    if(yEl){yEl.textContent='---.---';yEl.classList.add('dro-unknown');yEl.classList.remove('dro-homed');}
    if(zEl){zEl.textContent='---.---';zEl.classList.add('dro-unknown');zEl.classList.remove('dro-homed');}
    if(warn)warn.style.display='block';return;
  }
  if(xEl){xEl.textContent=pos.x.toFixed(3);xEl.classList.remove('dro-unknown');xEl.classList.add('dro-homed');}
  if(yEl){yEl.textContent=pos.y.toFixed(3);yEl.classList.remove('dro-unknown');yEl.classList.add('dro-homed');}
  if(zEl){zEl.textContent=pos.z.toFixed(3);zEl.classList.remove('dro-unknown');zEl.classList.add('dro-homed');}
  if(warn)warn.style.display='none';
}
function updateHeatStatus(pid,type,actual,target){
  const block=document.getElementById('tb-'+type+'-'+pid);
  const label=document.getElementById('hl-'+type+'-'+pid);
  const bar=document.getElementById(type==='nozzle'?'tro-bar-n-'+pid:'tro-bar-b-'+pid);
  if(!block||!label)return;
  const diff=target-actual;
  const isHeating=target>0&&diff>3;
  const isCooling=target===0&&actual>30;
  const isAtTarget=target>0&&Math.abs(diff)<=3;
  block.classList.remove('heating','temp-ok');
  if(isHeating){
    block.classList.add('heating');label.style.color='var(--orange)';label.textContent='🔥 HEIZT';
    const progress=Math.max(0,Math.min(100,((actual-20)/(target-20))*100));
    if(bar){bar.style.width=progress+'%';bar.style.background='var(--orange)';}
  } else if(isCooling){label.style.color='var(--blue)';label.textContent='❄️ KÜHLT';if(bar){const coolPct=type==='nozzle'?Math.min(100,actual/3):Math.min(100,actual/1.2);bar.style.width=coolPct+'%';bar.style.background='var(--accent)';};
  } else if(isAtTarget){
    block.classList.add('temp-ok');label.style.color='var(--green)';label.textContent='✅ BEREIT';
    if(bar){bar.style.width='100%';bar.style.background='var(--green)';}
  } else {label.style.color='var(--text3)';label.textContent='—';if(bar)bar.style.width='0%';}
}
async function sendGCode(pid) {
  const input = document.getElementById(`console-input-${pid}`);
  if (!input || !input.value.trim()) return;
  const gcode = input.value.trim().toUpperCase();
  input.value = '';
  
  try {
    const res = await api(`/api/printers/${pid}/gcode`, 'POST', { gcode });
    if (res.ok) {
      toast(`G-Code gesendet: ${gcode}`);
    } else {
      toast(`Fehler: ${res.error || 'Unbekannt'}`, 'error');
    }
  } catch (e) {
    toast(`Fehler beim Senden: ${e.message}`, 'error');
  }
}
async function filamentLoad(pid){await api('/api/printers/'+pid+'/filament_load','POST');toast('⬇ Filament wird eingezogen...');}
async function filamentUnload(pid){await api('/api/printers/'+pid+'/filament_unload','POST');toast('⬆ Filament wird ausgeworfen...');}
async function cooldown(pid){
  if(!confirm('Nozzle und Bett auf 0°C setzen?'))return;
  await api('/api/printers/'+pid+'/temperature','POST',{type:'nozzle',temp:0});
  await api('/api/printers/'+pid+'/temperature','POST',{type:'bed',temp:0});
  toast('❄️ Cooldown gestartet — Nozzle & Bett kühlen ab');
}
async function setFan(pid,percent,type='part'){await api('/api/printers/'+pid+'/fan','POST',{percent,type});toast('💨 Lüfter: '+percent+'%');}
function openTempModal(pid,type,currentVal){
  tempCtx={printerId:pid,type};
  document.getElementById('temp-modal-sub').textContent=type==='nozzle'?'Nozzle Temperatur':'Bett Temperatur';
  document.getElementById('temp-label').textContent=type==='nozzle'?'Nozzle (°C)':'Bett (°C)';
  document.getElementById('temp-input').value=currentVal||0;
  const presets=type==='nozzle'
    ?[{n:'AUS',v:0},{n:'PLA',v:215},{n:'PLA+',v:220},{n:'PETG',v:240},{n:'ABS',v:260},{n:'ASA',v:260},{n:'PA',v:270}]
    :[{n:'AUS',v:0},{n:'PLA',v:60},{n:'PLA+',v:65},{n:'PETG',v:80},{n:'ABS',v:100},{n:'ASA',v:100}];
  document.getElementById('temp-presets').innerHTML=presets.map(p=>`<button class="temp-preset-btn" onclick="document.getElementById('temp-input').value=${p.v}">${p.n}<span>${p.v}°</span></button>`).join('');
  openModal('modal-temp');
}
async function sendTemp(){const temp=parseInt(document.getElementById('temp-input').value);if(isNaN(temp)||temp<0||temp>350){toast('Ungültige Temperatur!','error');return;}await api('/api/printers/'+tempCtx.printerId+'/temperature','POST',{type:tempCtx.type,temp});closeModal('modal-temp');toast('🌡 '+temp+'°C gesetzt');}

// ── AMS ───────────────────────────────────────
async function openAmsAssign(pid,ui,si,isEmpty){
  assignCtx={printerId:pid,unitIdx:ui,slotIdx:si,selectedFilamentId:null};
  document.getElementById('ams-assign-subtitle').textContent='Slot '+(si+1)+' · AMS '+(ui+1);
  document.getElementById('btn-clear-slot').style.display=isEmpty?'none':'inline-block';
  const filaments=await api('/api/filaments');
  const list=document.getElementById('ams-filament-list');
  if(!filaments.length){list.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px 0;">Noch kein Filament angelegt.</div>';}
  else{list.innerHTML=filaments.map(f=>{const rem=f.weight_total-f.weight_used;const pct=Math.max(0,Math.round((rem/f.weight_total)*100));return `<div class="fil-option" id="fo-${f.id}" onclick="selectFilamentForSlot(${f.id})"><div class="fil-option-dot" style="background:${f.color_hex};"></div><div><div class="fil-option-name">${f.brand} ${f.color}</div><div class="fil-option-sub">${f.material}${f.temp_nozzle?' · '+f.temp_nozzle+'°C':''}</div></div><div class="fil-option-pct">${pct}% · ${Math.round(rem)}g</div></div>`;}).join('');}
  openModal('modal-ams-assign');
}
function selectFilamentForSlot(id){document.querySelectorAll('.fil-option').forEach(el=>el.classList.remove('selected'));const el=document.getElementById('fo-'+id);if(el)el.classList.add('selected');assignCtx.selectedFilamentId=id;}
async function saveAmsAssign(){if(!assignCtx.selectedFilamentId){toast('Bitte ein Filament wählen!','error');return;}await api('/api/ams/'+assignCtx.printerId+'/assign','POST',{unit_idx:assignCtx.unitIdx,slot_idx:assignCtx.slotIdx,filament_id:assignCtx.selectedFilamentId});closeModal('modal-ams-assign');toast('Slot zugewiesen ✅');buildDashboard();}
async function clearAmsSlot(){await api('/api/ams/'+assignCtx.printerId+'/assign/'+assignCtx.unitIdx+'/'+assignCtx.slotIdx,'DELETE');closeModal('modal-ams-assign');toast('Slot geleert');buildDashboard();}
function toggleAmsDetail(detailId,trayJson,pid,ui,si){
  document.querySelectorAll('.ams-detail').forEach(d=>d.classList.remove('open'));
  if(openAmsDetail===detailId){openAmsDetail=null;return;}
  openAmsDetail=detailId;
  const panel=document.getElementById(detailId);if(!panel)return;
  const tray=JSON.parse(trayJson);
  const src=tray.source==='rfid'?'<span style="color:var(--green)">● RFID</span>':'<span style="color:var(--blue)">● Manuell</span>';
  panel.innerHTML=`<div class="ams-drow"><span class="ams-dk">Quelle</span><span class="ams-dv">${src}</span></div><div class="ams-drow"><span class="ams-dk">Material</span><span class="ams-dv">${tray.type||'—'}</span></div><div class="ams-drow"><span class="ams-dk">Hersteller</span><span class="ams-dv">${tray.brand||'—'}</span></div><div class="ams-drow"><span class="ams-dk">Restmenge</span><span class="ams-dv">${tray.remain>=0?tray.remain+'%':'—'}</span></div><div class="ams-drow"><span class="ams-dk">Düse</span><span class="ams-dv">${tray.nozzle_min?tray.nozzle_min+'–'+(tray.nozzle_max||'?')+'°C':'—'}</span></div><div class="ams-dacts"><button class="btn btn-info btn-sm" onclick="openAmsAssign(${pid},${ui},${si},false)">✏️ Ändern</button><button class="btn btn-danger btn-sm" onclick="assignCtx={printerId:${pid},unitIdx:${ui},slotIdx:${si}};clearAmsSlot()">Leeren</button></div>`;
  panel.classList.add('open');
}
function buildAmsHtml(amsData, pid) {
  if (!amsData || !amsData.units || !amsData.units.length) {
    return `<div style="font-size: 11px; color: var(--text3); padding: 20px; text-align: center; background: rgba(0,0,0,0.1); border-radius: 8px;">KEIN AMS GEFUNDEN</div>`;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 12px;">`;
  amsData.units.forEach((unit, ui) => {
    html += `
      <div class="ams-unit" style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px;">
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text3); margin-bottom: 8px; font-family: var(--mono);">
          <span>AMS ${ui + 1}</span>
          <span>${unit.temp ? unit.temp.toFixed(1) + '°C' : ''} ${unit.humidity ? '· Hum ' + unit.humidity : ''}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
    `;

    unit.trays.forEach((tray, si) => {
      const isActive = ui === amsData.active_unit && si === amsData.active_slot;
      const isEmpty = tray.empty;
      const color = tray.color || 'transparent';
      const type = tray.type || '—';
      
      html += `
        <div class="ams-slot ${isActive ? 'active' : ''} ${isEmpty ? 'empty' : ''}" 
             onclick="openAmsAssign(${pid}, ${ui}, ${si}, ${isEmpty})"
             style="position: relative; aspect-ratio: 1; background: var(--surface2); border: 1px solid ${isActive ? 'var(--green)' : 'var(--border)'}; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s; cursor: pointer;">
          ${isActive ? '<div style="position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; background: var(--green); border-radius: 50%; box-shadow: 0 0 8px var(--green);"></div>' : ''}
          <div style="width: 24px; height: 24px; background: ${color}; border-radius: 4px; border: 2px solid rgba(255,255,255,0.1); margin-bottom: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.3);"></div>
          <div style="font-size: 9px; font-weight: 700; color: var(--text2); font-family: var(--mono);">${type}</div>
          <div style="font-size: 7px; color: var(--text3); margin-top: 2px;">Slot ${si + 1}</div>
          ${!isEmpty && tray.remain >= 0 ? `
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(0,0,0,0.3); border-radius: 0 0 6px 6px; overflow: hidden;">
              <div style="height: 100%; width: ${tray.remain}%; background: ${rcol(tray.remain)};"></div>
            </div>
          ` : ''}
        </div>
      `;
    });

    html += `</div></div>`;
  });

  return html + `</div>`;
}

// ── STATS ─────────────────────────────────────
async function loadStats(){const s=await api('/api/stats');document.getElementById('stat-prints').textContent=s.total_prints;document.getElementById('stat-grams').textContent=s.total_grams+'g';document.getElementById('stat-hours').textContent=s.total_hours+'h';document.getElementById('stat-cost').textContent=s.total_cost.toFixed(2)+'€';}

// ── DATEIMANAGER ──────────────────────────────
async function initFilePage(){try{const printers=await api('/api/printers');const sel=document.getElementById('file-printer-select');sel.innerHTML='<option value="">-- Drucker wählen --</option>'+(Array.isArray(printers)?printers:[]).map(p=>`<option value="${p.id}">${p.name} (${p.model})</option>`).join('');}catch(e){console.error('initFilePage Fehler:',e);}loadPiFiles();}
function switchFileTab(tab){currentFileTab=tab;document.querySelectorAll('.file-tab').forEach((t,i)=>{const tabs=['upload','sdcard','pifiles'];t.classList.toggle('active',tabs[i]===tab);});document.querySelectorAll('.file-tab-content').forEach(c=>c.classList.remove('active'));document.getElementById('filetab-'+tab).classList.add('active');if(tab==='sdcard')loadSdFiles();if(tab==='pifiles')loadPiFiles();}
async function loadFiles(){if(currentFileTab==='sdcard')loadSdFiles();}
async function loadSdFiles(){const pid=document.getElementById('file-printer-select').value;const container=document.getElementById('sdcard-files');if(!pid){container.innerHTML='<div style="color:var(--text3);font-size:13px;">Drucker auswählen</div>';return;}container.innerHTML='<div style="color:var(--text3);font-size:13px;">Lade...</div>';try{const result=await api('/api/printers/'+pid+'/files');if(result.error){container.innerHTML='<div style="color:var(--red);font-size:13px;">⚠️ '+result.error+'</div>';return;}if(!result.length){container.innerHTML='<div style="color:var(--text3);font-size:13px;">Keine Dateien</div>';return;}container.innerHTML=result.map(f=>{const thumbUrl=`/api/printers/${pid}/files/${encodeURIComponent(f.name)}/thumbnail`;return`<div class="file-row"><img class="file-thumb" src="${thumbUrl}" alt="${f.name.endsWith('.3mf')?'3MF':'GCO'}" onerror="this.outerHTML='<div class=\\'file-thumb file-thumb-placeholder\\'>${f.name.endsWith('.3mf')?'3MF':'GCO'}</div>'"><div class="file-info"><div class="file-name">${f.name}</div><div class="file-meta">${fmtSize(f.size||0)}</div></div><div class="file-actions"><button class="btn btn-primary btn-sm" onclick="startSdFile('${pid}','${f.name}')">▶️ Starten</button><button class="btn btn-danger btn-sm" onclick="deleteSdFile('${pid}','${f.name}')">🗑</button></div></div>`;}).join('');}catch(e){container.innerHTML='<div style="color:var(--red);font-size:13px;">⚠️ '+e.message+'</div>';}}
async function loadPiFiles(){const container=document.getElementById('pi-files');let files;try{files=await api('/api/uploads');}catch(e){container.innerHTML='<div style="color:var(--red);font-size:13px;">⚠️ Fehler beim Laden</div>';return;}if(!Array.isArray(files)||!files.length){container.innerHTML='<div style="color:var(--text3);font-size:13px;">Noch keine Dateien</div>';return;}container.innerHTML=files.map(f=>{const dispName=f.filename.replace(/^\d+-/,'');const thumbUrl='/api/uploads/'+encodeURIComponent(f.filename)+'/thumbnail';return`<div class="file-row"><img class="file-thumb" src="${thumbUrl}" alt="" onerror="this.style.display='none'"><div class="file-info"><div class="file-name">${dispName}</div><div class="file-meta">${fmtSize(f.size)} · ${new Date(f.uploaded_at).toLocaleDateString('de-DE')}</div></div><div class="file-actions"><button class="btn btn-primary btn-sm" onclick="printFromPi('${f.filename}')">▶️ Drucken</button><button class="btn btn-danger btn-sm" onclick="deletePiFile('${f.filename}')">🗑</button></div></div>`;}).join('');}
async function startSdFile(pid,filename){if(!confirm('Datei "'+filename+'" starten?'))return;await api('/api/printers/'+pid+'/startfile','POST',{filename});toast('▶️ Druck gestartet!');}
async function deleteSdFile(pid,filename){if(!confirm('Löschen?'))return;await api('/api/printers/'+pid+'/files/'+encodeURIComponent(filename),'DELETE');toast('Gelöscht');loadSdFiles();}
async function deletePiFile(filename){if(!confirm('Datei löschen?'))return;await api('/api/uploads/'+encodeURIComponent(filename),'DELETE');toast('Gelöscht');loadPiFiles();}
async function printFromPi(filename){const pid=document.getElementById('file-printer-select').value;if(!pid){toast('Drucker auswählen!','error');return;}if(!confirm('Hochladen und starten?'))return;toast('⬆️ Wird hochgeladen...');const result=await api('/api/printers/'+pid+'/print','POST',{filename,start:true});if(result.ok)toast('✅ '+result.message);else toast('❌ '+(result.error||'Fehler'),'error');}
function handleDrop(e){e.preventDefault();document.getElementById('upload-zone').classList.remove('drag');const files=e.dataTransfer.files;if(files.length)uploadFile(files[0]);}
function handleFileSelect(e){const file=e.target.files[0];if(file)uploadFile(file);}
async function uploadFile(file){if(!file.name.endsWith('.3mf')&&!file.name.endsWith('.gcode')){toast('Nur .3mf und .gcode!','error');return;}const q=document.getElementById('upload-queue');q.innerHTML=`<div style="color:var(--text3);font-size:13px;padding:10px 0;">⬆️ Lade "${file.name}" hoch...</div>`;const fd=new FormData();fd.append('file',file);try{const r=await fetch('/api/upload',{method:'POST',body:fd});const data=await r.json();if(data.filename){toast('✅ Hochgeladen!');const pid=document.getElementById('file-printer-select').value;q.innerHTML=`<div class="file-row"><div><div class="file-name">${file.name}</div><div class="file-meta">${fmtSize(file.size)}</div></div><div class="file-actions">${pid?`<button class="btn btn-primary btn-sm" onclick="printFromPiDirect('${data.filename}',${pid})">▶️ Jetzt drucken</button>`:''}</div></div>`;}}catch(e){toast('Upload Fehler!','error');q.innerHTML='';}}
async function printFromPiDirect(filename,pid){if(!confirm('Hochladen und starten?'))return;toast('⬆️ Wird hochgeladen...');const result=await api('/api/printers/'+pid+'/print','POST',{filename,start:true});if(result.ok)toast('✅ Gestartet!');else toast('❌ '+result.error,'error');}

// ── DRUCKER ───────────────────────────────────
async function loadPrinters(){const printers=await api('/api/printers');document.getElementById('printers-list').innerHTML=!printers.length?'<div class="card" style="color:var(--text3);">Noch kein Drucker hinzugefügt.</div>':printers.map(p=>`<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:14px;font-weight:600;font-family:var(--mono);">🖨️ ${p.name}</div><div style="font-size:11px;color:var(--text3);margin-top:3px;font-family:var(--mono);">${p.model} · ${p.ip} · ${p.serial}</div></div><button class="btn btn-danger btn-sm" onclick="deletePrinter(${p.id})">Löschen</button></div></div>`).join('');}
async function addPrinter(){const data={name:document.getElementById('p-name').value,model:document.getElementById('p-model').value,ip:document.getElementById('p-ip').value,access_code:document.getElementById('p-code').value,serial:document.getElementById('p-serial').value};if(!data.name||!data.ip||!data.access_code||!data.serial){toast('Bitte alle Felder ausfüllen!','error');return;}await api('/api/printers','POST',data);closeModal('modal-add-printer');toast('Drucker hinzugefügt! ✅');loadPrinters();}
async function deletePrinter(id){if(!confirm('Drucker wirklich löschen?'))return;await api('/api/printers/'+id,'DELETE');toast('Gelöscht');loadPrinters();}

// ── FILAMENTE ─────────────────────────────────
async function loadFilaments(){
  filamentCache=await api('/api/filaments');
  renderFilaments();
}

function filterFilaments(){renderFilaments();}

function setFilChip(el){
  document.querySelectorAll('.fil-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderFilaments();
}

function renderFilaments(){
  const search=(document.getElementById('fil-search')?.value||'').toLowerCase();
  const mat=document.querySelector('.fil-chip.active')?.dataset.mat||'';
  const grid=document.getElementById('filament-grid');
  let list=filamentCache;
  if(mat)list=list.filter(f=>f.material&&f.material.includes(mat));
  if(search)list=list.filter(f=>(f.brand+' '+f.color+' '+f.material).toLowerCase().includes(search));
  if(!list.length){grid.innerHTML='<div class="card" style="color:var(--text3);">'+(filamentCache.length?'Kein Filament gefunden.':'Noch kein Filament hinzugefügt.')+'</div>';return;}
  grid.innerHTML=list.map(f=>{
    const rem=f.weight_total-f.weight_used;
    const pct=Math.max(0,Math.round((rem/f.weight_total)*100));
    const bc=pct>50?'var(--green)':pct>20?'var(--orange)':'var(--red)';
    const tags=[];
    if(f.pa)tags.push(`PA ${f.pa}`);
    if(f.ka)tags.push(`KA ${f.ka}`);
    if(f.flow_rate&&f.flow_rate!==100)tags.push(`Flow ${f.flow_rate}%`);
    if(f.temp_dry)tags.push(`Dry ${f.temp_dry}°C · ${f.time_dry||'?'}h`);
    const nozzleStr=f.temp_nozzle_min&&f.temp_nozzle_max?`${f.temp_nozzle_min}–${f.temp_nozzle_max}°C`:f.temp_nozzle?`${f.temp_nozzle}°C`:null;
    return `<div class="fil-card">
      <div class="fil-accent" style="background:${f.color_hex};"></div>
      <div class="fil-head">
        <div class="fil-swatch" style="background:${f.color_hex};"></div>
        <div class="fil-meta">
          <div class="fil-name">${f.brand}</div>
          <div class="fil-color-name">${f.color}</div>
          <div class="fil-badges">
            <span class="fil-mat-tag">${f.material}</span>
            ${f.diameter&&f.diameter!==1.75?`<span class="fil-size-tag">${f.diameter}mm</span>`:''}
          </div>
        </div>
        <div class="fil-pct" style="color:${bc};">${pct}<span class="fil-pct-unit">%</span></div>
      </div>
      <div class="fil-bar"><div class="fil-bar-fill" style="width:${pct}%;background:${bc};"></div></div>
      <div class="fil-stats">
        <div class="fil-stat"><span class="fil-sv">${Math.round(rem)}g</span><span class="fil-sl">übrig</span></div>
        ${nozzleStr?`<div class="fil-stat"><span class="fil-sv">${nozzleStr}</span><span class="fil-sl">Nozzle</span></div>`:''}
        ${f.temp_bed?`<div class="fil-stat"><span class="fil-sv">${f.temp_bed}°C</span><span class="fil-sl">Bett</span></div>`:''}
        ${f.price_per_kg>0?`<div class="fil-stat"><span class="fil-sv">${f.price_per_kg}€</span><span class="fil-sl">/kg</span></div>`:''}
      </div>
      ${tags.length?`<div class="fil-tags">${tags.map(t=>`<span class="fil-tag has-val">${t}</span>`).join('')}</div>`:''}
      ${f.notes?`<div class="fil-notes">${f.notes}</div>`:''}
      ${f.location?`<div class="fil-loc">📍 ${f.location}</div>`:''}
      <div class="fil-actions">
        <button class="btn btn-info btn-sm" onclick="editFilament(${f.id})">Bearbeiten</button>
        <button class="btn btn-secondary btn-sm" onclick="quickAddGrams(${f.id})">+ Verbrauch</button>
        <button class="btn btn-danger btn-sm" onclick="deleteFilament(${f.id})">Löschen</button>
      </div>
    </div>`;
  }).join('');
}

function openAddFilamentModal(){
  filEditId=null;
  document.getElementById('modal-fil-title').textContent='🧵 Filament hinzufügen';
  document.getElementById('modal-fil-btn').textContent='Hinzufügen';
  ['f-brand','f-color','f-nozzle-min','f-nozzle-max','f-nozzle','f-bed','f-dry-temp','f-dry-time','f-pa','f-ka','f-location','f-notes','f-weight','f-price','f-flow','f-shrink'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('f-material').value='PLA';
  document.getElementById('f-diameter').value='1.75';
  document.getElementById('f-color-hex').value='#0066ff';
  openModal('modal-add-filament');
}

function editFilament(id){
  const f=filamentCache.find(x=>x.id===id);if(!f)return;
  filEditId=id;
  document.getElementById('modal-fil-title').textContent='✏️ Filament bearbeiten';
  document.getElementById('modal-fil-btn').textContent='Speichern';
  document.getElementById('f-brand').value=f.brand||'';
  document.getElementById('f-material').value=f.material||'PLA';
  document.getElementById('f-color').value=f.color||'';
  document.getElementById('f-color-hex').value=f.color_hex||'#0066ff';
  document.getElementById('f-diameter').value=f.diameter||1.75;
  document.getElementById('f-weight').value=f.weight_total||'';
  document.getElementById('f-price').value=f.price_per_kg||'';
  document.getElementById('f-nozzle-min').value=f.temp_nozzle_min||'';
  document.getElementById('f-nozzle-max').value=f.temp_nozzle_max||'';
  document.getElementById('f-nozzle').value=f.temp_nozzle||'';
  document.getElementById('f-bed').value=f.temp_bed||'';
  document.getElementById('f-dry-temp').value=f.temp_dry||'';
  document.getElementById('f-dry-time').value=f.time_dry||'';
  document.getElementById('f-pa').value=f.pa||'';
  document.getElementById('f-ka').value=f.ka||'';
  document.getElementById('f-flow').value=f.flow_rate||'';
  document.getElementById('f-shrink').value=f.shrink_factor||'';
  document.getElementById('f-location').value=f.location||'';
  document.getElementById('f-notes').value=f.notes||'';
  openModal('modal-add-filament');
}

async function saveFilament(){
  const data={
    brand:document.getElementById('f-brand').value,
    material:document.getElementById('f-material').value,
    color:document.getElementById('f-color').value,
    color_hex:document.getElementById('f-color-hex').value,
    diameter:parseFloat(document.getElementById('f-diameter').value)||1.75,
    weight_total:parseInt(document.getElementById('f-weight').value)||1000,
    price_per_kg:parseFloat(document.getElementById('f-price').value)||0,
    temp_nozzle_min:parseInt(document.getElementById('f-nozzle-min').value)||null,
    temp_nozzle_max:parseInt(document.getElementById('f-nozzle-max').value)||null,
    temp_nozzle:parseInt(document.getElementById('f-nozzle').value)||null,
    temp_bed:parseInt(document.getElementById('f-bed').value)||null,
    temp_dry:parseInt(document.getElementById('f-dry-temp').value)||null,
    time_dry:parseInt(document.getElementById('f-dry-time').value)||null,
    pa:parseFloat(document.getElementById('f-pa').value)||null,
    ka:parseFloat(document.getElementById('f-ka').value)||null,
    flow_rate:parseFloat(document.getElementById('f-flow').value)||100,
    shrink_factor:parseFloat(document.getElementById('f-shrink').value)||100,
    location:document.getElementById('f-location').value||null,
    notes:document.getElementById('f-notes').value||null,
  };
  if(!data.brand||!data.color){toast('Hersteller und Farbe sind Pflicht!','error');return;}
  if(filEditId){
    const existing=filamentCache.find(x=>x.id===filEditId);
    data.weight_used=existing?existing.weight_used:0;
    await api('/api/filaments/'+filEditId,'PUT',data);
    toast('Filament gespeichert ✅');
  }else{
    await api('/api/filaments','POST',data);
    toast('Filament hinzugefügt! ✅');
  }
  closeModal('modal-add-filament');
  loadFilaments();
}

async function quickAddGrams(id){
  const f=filamentCache.find(x=>x.id===id);if(!f)return;
  const g=prompt(`Wieviel Gramm von "${f.brand} ${f.color}" verbraucht?`);
  if(!g||isNaN(parseFloat(g))||parseFloat(g)<=0)return;
  await api('/api/filaments/'+id,'PUT',{...f,weight_used:(f.weight_used||0)+parseFloat(g)});
  toast('Verbrauch aktualisiert ✅');
  loadFilaments();
}

async function deleteFilament(id){if(!confirm('Filament wirklich löschen?'))return;await api('/api/filaments/'+id,'DELETE');toast('Gelöscht');loadFilaments();}

// ── HISTORIE ──────────────────────────────────
async function loadHistory(){const list=await api('/api/history');const tbody=document.getElementById('history-table');if(!list.length){tbody.innerHTML='<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:20px;">Noch keine Drucke</td></tr>';return;}tbody.innerHTML=list.map(j=>`<tr><td style="font-family:var(--mono);">${new Date(j.started_at).toLocaleDateString('de-DE')}</td><td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${j.filename||'-'}</td><td>${j.printer_name||'-'}</td><td>${j.color_hex?`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${j.color_hex};margin-right:4px;"></span>`:''}${j.brand?j.brand+' '+j.material:'-'}</td><td style="font-family:var(--mono);">${j.grams_used}g</td><td style="font-family:var(--mono);">${j.duration_min?Math.round(j.duration_min/60*10)/10+'h':'-'}</td><td style="font-family:var(--mono);">${j.total_cost?j.total_cost.toFixed(2)+'€':'-'}</td></tr>`).join('');}

// ── KOSTENRECHNER ─────────────────────────────
async function loadCalcFilaments(){
  const list=await api('/api/filaments');
  document.getElementById('calc-filament').innerHTML='<option value="">-- Filament wählen --</option>'+list.map(f=>`<option value="${f.id}">${f.brand} ${f.color} ${f.material}</option>`).join('');
  try{const s=await api('/api/settings');const fr=parseInt(s.failure_rate)||10;const el=document.getElementById('calc-failure');if(el){el.value=fr;document.getElementById('calc-failure-val').textContent=fr+'%';}}catch(e){}
  try{
    const files=await api('/api/uploads');
    const sel=document.getElementById('calc-file-select');
    if(sel){
      sel.innerHTML='<option value="">— .3mf oder .gcode Datei wählen —</option>'+
        files.filter(f=>f.filename.endsWith('.3mf')||f.filename.endsWith('.gcode'))
          .map(f=>`<option value="${f.filename}">${f.filename.replace(/^\d+-/,'')}</option>`).join('');
    }
  }catch(e){}
}
async function onCalcFileSelect(){
  const sel=document.getElementById('calc-file-select');
  const preview=document.getElementById('calc-file-preview');
  if(!sel||!sel.value){if(preview)preview.style.display='none';return;}
  if(preview)preview.style.display='flex';
  const nameEl=document.getElementById('calc-file-name');
  if(nameEl)nameEl.textContent=sel.value.replace(/^\d+-/,'');
  const wEl=document.getElementById('calc-file-weight');const tEl=document.getElementById('calc-file-time');const mEl=document.getElementById('calc-file-msg');
  if(wEl)wEl.textContent='…';if(tEl)tEl.textContent='…';if(mEl)mEl.textContent='Analysiere…';
  const thumb=document.getElementById('calc-file-thumb');
  if(thumb){thumb.src='/api/uploads/'+encodeURIComponent(sel.value)+'/thumbnail';thumb.style.display='block';thumb.onerror=()=>thumb.style.display='none';}
  try{
    const meta=await api('/api/uploads/'+encodeURIComponent(sel.value)+'/metadata');
    if(meta.error){if(wEl)wEl.textContent='—';if(tEl)tEl.textContent='—';if(mEl)mEl.textContent='⚠ Keine Metadaten gefunden';return;}
    if(wEl)wEl.textContent=(meta.weight_g||0)+'g';
    if(tEl)tEl.textContent=meta.time_formatted||'—';
    if(mEl)mEl.textContent='✓ Werte in Rechner übernommen';
    if(meta.filament_type){const tw=document.getElementById('calc-file-type-wrap');const te=document.getElementById('calc-file-type');if(tw)tw.style.display='';if(te)te.textContent=meta.filament_type;}
    if(meta.weight_g)document.getElementById('calc-grams').value=meta.weight_g;
    if(meta.time_s)document.getElementById('calc-duration').value=Math.round(meta.time_s/60);
    if(meta.filament_type){const opts=document.getElementById('calc-filament').options;for(const o of opts){if(o.text.toLowerCase().includes(meta.filament_type.toLowerCase())){o.selected=true;break;}}}
    calculate();
  }catch(e){if(mEl)mEl.textContent='Fehler beim Laden';}
}
async function calculate(){const grams=parseFloat(document.getElementById('calc-grams').value)||0;const duration=parseFloat(document.getElementById('calc-duration').value)||0;const post=parseFloat(document.getElementById('calc-post').value)||0;const rate=parseFloat(document.getElementById('calc-rate').value)||0;const filament_id=document.getElementById('calc-filament').value;if(!grams&&!duration)return;const result=await api('/api/calculate','POST',{grams,duration_min:duration,filament_id,post_processing_min:post,hourly_rate:rate});document.getElementById('calc-result').style.display='block';document.getElementById('r-filament').textContent=result.filament_cost.toFixed(2)+' €';document.getElementById('r-electricity').textContent=result.electricity_cost.toFixed(2)+' €';document.getElementById('r-post').textContent=result.post_cost.toFixed(2)+' €';document.getElementById('r-total').textContent=result.total_cost.toFixed(2)+' €';}

// ── EINSTELLUNGEN ─────────────────────────────
async function loadSettings(){const s=await api('/api/settings');document.getElementById('set-electricity').value=s.electricity_cost||0.35;document.getElementById('set-watt').value=s.printer_watt||350;}
async function saveSettings(){await api('/api/settings','POST',{electricity_cost:document.getElementById('set-electricity').value,printer_watt:document.getElementById('set-watt').value});toast('Gespeichert ✅');}
async function refreshFilamentDb(){
  const status=document.getElementById('filament-db-status');
  status.textContent='Wird aktualisiert...';
  const r=await api('/api/filament-db/refresh','POST');
  orcaDbCache=null;
  status.textContent=r.ok?`✅ ${r.brands} Hersteller geladen`:'❌ Fehler: '+r.error;
}

// ── TEMPERATUR CHART ──────────────────────────
function initTempChart(pid){
  if(typeof Chart==='undefined')return;
  const canvas=document.getElementById('temp-chart-'+pid);
  if(!canvas||chartInstances[pid])return;
  if(!tempHistory[pid])tempHistory[pid]={n:[],b:[],t:[]};
  chartInstances[pid]=new Chart(canvas.getContext('2d'),{
    type:'line',
    data:{
      labels:tempHistory[pid].t,
      datasets:[
        {label:'Nozzle',data:tempHistory[pid].n,borderColor:'#f44336',backgroundColor:'rgba(244,67,54,0.07)',borderWidth:1.5,pointRadius:0,tension:0.4,fill:true},
        {label:'Bett',data:tempHistory[pid].b,borderColor:'#2196f3',backgroundColor:'rgba(33,150,243,0.07)',borderWidth:1.5,pointRadius:0,tension:0.4,fill:true}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      interaction:{intersect:false,mode:'index'},
      plugins:{
        legend:{labels:{color:'#7a869e',font:{size:10,family:"'JetBrains Mono',monospace"},boxWidth:10,padding:10}},
        tooltip:{backgroundColor:'rgba(8,10,13,0.95)',titleColor:'#dde2f0',bodyColor:'#7a869e',borderColor:'#1e2430',borderWidth:1}
      },
      scales:{
        x:{display:false},
        y:{min:0,grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'#3d4460',font:{size:9},maxTicksLimit:4,callback:v=>v+'°'}}
      }
    }
  });
}
function updateTempChart(pid,nozzle,bed){
  if(!chartInstances[pid])return;
  const h=tempHistory[pid];
  const t=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  h.t.push(t);h.n.push(nozzle);h.b.push(bed);
  if(h.t.length>60){h.t.shift();h.n.shift();h.b.shift();}
  chartInstances[pid].update('none');
}

// ── SYSTEM MONITOR ────────────────────────────
async function loadSystemStats(){
  try{
    const s=await api('/api/system');
    const cpuEl=document.getElementById('smb-cpu');const cpuBar=document.getElementById('smb-cpu-bar');
    const ramEl=document.getElementById('smb-ram');const ramBar=document.getElementById('smb-ram-bar');
    const tempEl=document.getElementById('smb-temp');const uptEl=document.getElementById('smb-uptime');
    if(cpuEl)cpuEl.textContent=s.cpu+'%';if(cpuBar)cpuBar.style.width=s.cpu+'%';
    if(ramEl)ramEl.textContent=s.mem_pct+'%';if(ramBar)ramBar.style.width=s.mem_pct+'%';
    if(tempEl)tempEl.textContent=s.pi_temp?s.pi_temp+'°C':'—';
    if(uptEl){const h=Math.floor(s.uptime_min/60);const m=s.uptime_min%60;uptEl.textContent=h+'h '+String(m).padStart(2,'0')+'m';}
  }catch(e){}
}

// ── PUSH BENACHRICHTIGUNGEN ───────────────────
async function requestNotifPermission(){
  if(!('Notification' in window)){toast('Browser unterstützt keine Benachrichtigungen','error');return;}
  const perm=await Notification.requestPermission();
  const btn=document.getElementById('notif-btn');
  if(perm==='granted'){if(btn)btn.classList.add('active');toast('🔔 Benachrichtigungen aktiviert!');}
  else toast('Benachrichtigungen abgelehnt','error');
}
function sendNotif(title,body){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  try{new Notification(title,{body,icon:'/favicon.ico'});}catch(e){}
}

// ── START ─────────────────────────────────────
if('Notification' in window&&Notification.permission==='granted'){const b=document.getElementById('notif-btn');if(b)b.classList.add('active');}
loadStats();
loadSystemStats();
buildDashboard();
setInterval(()=>{if(document.getElementById('page-dashboard').classList.contains('active'))realtimeUpdate();},1000);
setInterval(()=>{if(document.getElementById('page-dashboard').classList.contains('active'))loadStats();},30000);
setInterval(loadSystemStats,30000);
