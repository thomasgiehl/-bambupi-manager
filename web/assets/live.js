/* BambuPi Manager — live.js
   Handles: SSE, printer commands, temp control, AMS, charts, modals, toasts
*/

// ── Globals ──────────────────────────────────
const tempHistory    = {};
const chartInstances = {};
const prevStates     = {};
const tempAlarmTimers = {};
const tempTrends      = {}; // { printerId: { nozzle: [lastVal, trend], bed: [...] } }
let sseSource        = null;
let sseFallbackTimer = null;
let assignCtx        = { printerId: null, unitIdx: null, slotIdx: null, selectedFilamentId: null };
let tempCtx          = { printerId: null, type: null };
let openAmsDetail    = null;
let filSearchData    = [];

window.tempHistory = tempHistory; // expose for dashboard inline script

// ── Helpers ───────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function rcol(pct) {
  if (pct < 0)  return '#333';
  if (pct > 50) return 'var(--green)';
  if (pct > 20) return 'var(--orange)';
  return 'var(--red)';
}

// ── API helper ────────────────────────────────
async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r.json();
}

function getPrintOptions() {
  return {
    bed_levelling:  document.getElementById('opt-leveling')?.checked ?? true,
    timelapse:      document.getElementById('opt-timelapse')?.checked ?? false,
    flow_cali:      document.getElementById('opt-calibration')?.checked ?? false,
    vibration_cali: document.getElementById('opt-vibration')?.checked ?? true,
    use_ams:        document.getElementById('opt-ams')?.checked ?? true
  };
}

// ── Toast ─────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Modal ─────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

// ── Temperature helpers ───────────────────────
function tempArrow(pid, type, actual, target) {
  if (!tempTrends[pid]) tempTrends[pid] = {};
  const prev = tempTrends[pid][type] || actual;
  tempTrends[pid][type] = actual;

  // Trend bestimmen: 1 = steigend, -1 = fallend, 0 = stabil
  let trend = 0;
  if (actual > prev) trend = 1;
  if (actual < prev) trend = -1;

  // Icons basierend auf Trend UND Ziel
  if (trend === 1) return '<span style="color:var(--orange);font-size:12px;margin-left:2px;font-weight:bold;">↑</span>';
  if (trend === -1) return '<span style="color:var(--accent);font-size:12px;margin-left:2px;font-weight:bold;">↓</span>';
  
  // Wenn stabil, prüfen ob Ziel erreicht
  if (target > 0 && Math.abs(actual - target) <= 2) {
    return '<span style="color:var(--green);font-size:11px;margin-left:2px;">✓</span>';
  }
  
  return '';
}

function tempClass(t) {
  if (t > 150) return 'hot';
  if (t > 50)  return 'warm';
  if (t > 0)   return 'cool';
  return 'off';
}

// ── Temperature alarm (idle printer with hot nozzle) ──
function checkTempAlarm(pid, nozzle, state) {
  const idle = state !== 'RUNNING' && state !== 'PAUSE';
  if (idle && nozzle > 50) {
    if (!tempAlarmTimers[pid]) {
      tempAlarmTimers[pid] = setTimeout(() => {
        sendNotif('🌡️ Düse noch heiß!', 'Nozzle bei ' + nozzle + '°C aber kein aktiver Druck.');
        toast('⚠️ Düse noch heiß (' + nozzle + '°C)!', 'error');
        delete tempAlarmTimers[pid];
      }, 5 * 60 * 1000);
    }
  } else {
    if (tempAlarmTimers[pid]) { clearTimeout(tempAlarmTimers[pid]); delete tempAlarmTimers[pid]; }
  }
}

// ── Browser notifications ─────────────────────
function sendNotif(title, body, sound = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { 
    new Notification(title, { body, icon: '/favicon.ico' }); 
    if (sound) playAlertSound();
  } catch (e) {}
}

function playAlertSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
}

// ── Chart ─────────────────────────────────────
const lastChartUpdate = {};

async function initTempChart(pid) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('temp-chart-' + pid);
  if (!canvas || chartInstances[pid]) return;

  // Wenn noch keine Historie da ist oder sie unvollständig ist, vom Server laden
  if (!tempHistory[pid] || !tempHistory[pid].t || tempHistory[pid].t.length === 0) {
    try {
      const res = await fetch(`/api/printers/${pid}/temp-history`);
      tempHistory[pid] = await res.json();
    } catch (e) {
      tempHistory[pid] = { n: [], b: [], t: [], c: [] };
    }
  }
  
  const h = tempHistory[pid];
  if (!h.c) h.c = (h.n || []).map(() => 0); // Fallback für alte Cache-Daten
  if (!h.n) h.n = [];
  if (!h.b) h.b = [];
  if (!h.t) h.t = [];

  chartInstances[pid] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: h.t,
      datasets: [
        { label: 'Nozzle', data: h.n, borderColor: '#ef5350', backgroundColor: 'rgba(239,83,80,.07)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true },
        { label: 'Bett',   data: h.b, borderColor: '#29b6f6', backgroundColor: 'rgba(41,182,246,.07)',  borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true },
        { label: 'Raum',   data: h.c, borderColor: '#ab47bc', backgroundColor: 'rgba(171,71,188,.07)',  borderWidth: 1.2, pointRadius: 0, tension: 0.4, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: '#9aa5be', font: { size: 9 }, boxWidth: 8, padding: 4 } },
        tooltip: { backgroundColor: 'rgba(13,15,20,.95)', titleColor: '#e2e8f4', bodyColor: '#9aa5be', borderColor: '#252c3f', borderWidth: 1 }
      },
      scales: {
        x: { display: false },
        y: { min: 0, suggestedMax: 220, grid: { color: 'rgba(255,255,255,.03)' }, ticks: { color: '#5a6785', font: { size: 9 }, maxTicksLimit: 4, callback: v => v + '°' } }
      }
    }
  });
}

function updateTempChart(pid, nozzle, bed, chamber) {
  if (!chartInstances[pid]) return;
  
  // Throttle: Max jede Sekunde updaten für Real-Time Gefühl
  const now = Date.now();
  if (lastChartUpdate[pid] && now - lastChartUpdate[pid] < 1000) return;
  lastChartUpdate[pid] = now;

  const h = tempHistory[pid];
  const t = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  h.t.push(t); h.n.push(nozzle); h.b.push(bed); h.c.push(chamber || 0);
  if (h.t.length > 120) { h.t.shift(); h.n.shift(); h.b.shift(); h.c.shift(); }
  
  chartInstances[pid].update('none');
}

// ── Apply printer status to DOM ───────────────
function applyPrinterStatus(p) {
  const s       = p.status || {};
  const nozzle  = s.nozzle_temper || 0;
  const bed     = s.bed_temper || 0;
  const chamber = s.chamber_temper || 0;
  const nTarget = s.nozzle_temper_target || 0;
  const bTarget = s.bed_target_temper || 0;
  const progress  = s.mc_percent || 0;
  const remaining = s.mc_remaining_time || 0;
  const state   = s.gcode_state || 'offline';
  const pid     = p.id;

  // Temperatures
  const nEl = document.getElementById('nv-' + pid);
  const bEl = document.getElementById('bv-' + pid);
  const cEl = document.getElementById('cv-' + pid);
  if (nEl) { nEl.innerHTML = nozzle.toFixed(1) + '°' + tempArrow(pid, 'nozzle', nozzle, nTarget); nEl.className = 'temp-actual ' + tempClass(nozzle); }
  if (bEl) { bEl.innerHTML = bed.toFixed(1) + '°' + tempArrow(pid, 'bed', bed, bTarget);       bEl.className = 'temp-actual ' + tempClass(bed); }
  if (cEl) { cEl.innerHTML = chamber.toFixed(1) + '°' + tempArrow(pid, 'chamber', chamber, 0);   cEl.className = 'temp-actual ' + tempClass(chamber); }

  const ntEl = document.getElementById('nt-' + pid); if (ntEl) ntEl.textContent = '→ ' + nTarget + '°C';
  const btEl = document.getElementById('bt-' + pid); if (btEl) btEl.textContent = '→ ' + bTarget + '°C';

  const nbEl = document.getElementById('nb-' + pid); if (nbEl) nbEl.style.width = Math.min(100, nozzle / 3) + '%';
  const bbEl = document.getElementById('bb-' + pid); if (bbEl) bbEl.style.width = Math.min(100, bed / 1.2) + '%';
  const cbEl = document.getElementById('cb-' + pid); if (cbEl) cbEl.style.width = Math.min(100, chamber) + '%';

  // Progress
  const paEl = document.getElementById('pa-' + pid);
  const idleEl = document.getElementById('idle-' + pid);
  if (paEl)   { paEl.style.display = state === 'RUNNING' ? 'block' : 'none'; }
  if (idleEl) { idleEl.style.display = state !== 'RUNNING' ? 'block' : 'none'; }

  const pfEl = document.getElementById('pf-' + pid); if (pfEl) pfEl.style.width = progress + '%';
  const ppEl = document.getElementById('pp-' + pid); if (ppEl) ppEl.textContent = progress + '%';
  
  const ptEl = document.getElementById('pt-' + pid); 
  if (ptEl) {
    if (state === 'RUNNING' || state === 'PAUSE') {
      const h = Math.floor(remaining / 60);
      const m = remaining % 60;
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m} Min`;
      const finishDate = new Date(Date.now() + remaining * 60000);
      const finishStr = finishDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      ptEl.innerHTML = `<span title="Restzeit">⏱ ${timeStr}</span> <span style="margin-left:8px;color:var(--text3);" title="Fertig um">🏁 ${finishStr}</span>`;
    } else {
      ptEl.textContent = '';
    }
  }

  // Layer info (falls vorhanden)
  const lEl = document.getElementById('layer-' + pid);
  if (lEl) {
    const cur = s.layer_num || 0;
    const tot = s.total_layer_num || 0;
    if (tot > 0) lEl.textContent = `Layer ${cur} / ${tot}`;
    else lEl.textContent = '';
  }

  // Badge
  const bdEl = document.getElementById('badge-' + pid);
  if (bdEl) {
    const dot = '<span style="width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:3px;background:';
    if (state === 'RUNNING') { bdEl.className = 'badge badge-printing'; bdEl.innerHTML = dot + 'var(--green);"></span>DRUCKT'; }
    else if (state === 'offline') { bdEl.className = 'badge badge-offline'; bdEl.innerHTML = dot + 'var(--text3);"></span>OFFLINE'; }
    else { bdEl.className = 'badge badge-ready'; bdEl.innerHTML = dot + 'var(--green);"></span>BEREIT'; }
  }

  // Pause/resume button swap
  const pbPause  = document.getElementById('btn-pause-'  + pid);
  const pbResume = document.getElementById('btn-resume-' + pid);
  const pbRepeat = document.getElementById('btn-repeat-' + pid);
  if (pbPause)  pbPause.style.display  = state === 'RUNNING' ? '' : 'none';
  if (pbResume) pbResume.style.display = state === 'RUNNING' ? 'none' : '';
  if (pbRepeat) pbRepeat.style.display = state === 'RUNNING' ? 'none' : '';

  // Speed buttons
  const spdLvl = s.spd_lvl || 2;
  [1, 2, 3, 4].forEach(lvl => {
    const el = document.getElementById('spd-' + pid + '-' + lvl);
    if (el) el.classList.toggle('active', lvl === spdLvl);
  });

  // Push notification on state change
  const prev = prevStates[pid];
  if (prev === 'RUNNING' && state === 'FINISH')  sendNotif('✅ Druck abgeschlossen!', p.name + (s.subtask_name ? ' · ' + s.subtask_name : ''), true);
  if (prev === 'RUNNING' && state === 'FAILED')  sendNotif('❌ Druck fehlgeschlagen!', p.name + (s.subtask_name ? ' · ' + s.subtask_name : ''), true);
  prevStates[pid] = state;

  checkTempAlarm(pid, nozzle, state);
  updateTempChart(pid, nozzle, bed, chamber);
  window.dispatchEvent(new CustomEvent('sseMessage', { detail: p }));
  updateSSEChip('live');
}

// ── SSE ───────────────────────────────────────
function updateSSEChip(mode) {
  document.querySelectorAll('.sse-chip').forEach(chip => {
    chip.className = 'sse-chip ' + mode;
    chip.textContent = mode === 'live' ? '● Live' : '↻ Polling';
  });
}

function startSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }
  if (sseFallbackTimer) { clearInterval(sseFallbackTimer); sseFallbackTimer = null; }

  try {
    sseSource = new EventSource('/api/events');
    sseSource.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'status') {
          applyPrinterStatus({ id: msg.id, name: msg.name || '', status: msg.status });
        } else if (msg.type === 'event') {
          handleIncomingEvent(msg);
        }
      } catch (_) {}
    };
    sseSource.onopen  = () => updateSSEChip('live');
    sseSource.onerror = () => {
      updateSSEChip('polling');
      sseSource.close(); sseSource = null;
      if (!sseFallbackTimer) {
        sseFallbackTimer = setInterval(() => {
          fetch('/api/printers').then(r => r.json()).then(list => list.forEach(applyPrinterStatus)).catch(() => {});
        }, 3000);
      }
    };
  } catch (_) {
    updateSSEChip('polling');
    sseFallbackTimer = setInterval(() => {
      fetch('/api/printers').then(r => r.json()).then(list => list.forEach(applyPrinterStatus)).catch(() => {});
    }, 3000);
  }
}

// ── Event Log ─────────────────────────────────
const EV_ICONS = { finish: '✅', fail: '❌', start: '▶️', pause: '⏸️', offline: '🔌', info: 'ℹ️', error: '⚠️' };

function handleIncomingEvent(e) {
  const card = document.getElementById('event-log-card');
  const list = document.getElementById('event-log-list');
  if (!card || !list) return;

  card.style.display = 'block';
  const row = document.createElement('div');
  row.className = 'ev-row new-event';
  const time = new Date(e.created_at || Date.now()).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  row.innerHTML = `<span class="ev-icon">${EV_ICONS[e.event_type] || 'ℹ️'}</span>
                   <span class="ev-msg">${esc(e.message)}</span>
                   <span class="ev-time">${esc(time)}</span>`;
  
  list.insertBefore(row, list.firstChild);
  if (list.children.length > 50) list.lastChild.remove();
  
  // Highlight-Effekt entfernen nach 2s
  setTimeout(() => row.classList.remove('new-event'), 2000);
}

async function loadEventLog() {
  try {
    const events = await api('/api/event-log');
    const card = document.getElementById('event-log-card');
    const list = document.getElementById('event-log-list');
    if (!card || !list) return;
    if (!events.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    list.innerHTML = '';
    events.forEach(e => {
      const row = document.createElement('div'); row.className = 'ev-row';
      row.innerHTML = `<span class="ev-icon">${EV_ICONS[e.type] || 'ℹ️'}</span><span class="ev-msg">${esc(e.message)}</span><span class="ev-time">${esc(e.time)}</span>`;
      list.appendChild(row);
    });
  } catch (_) {}
}

async function clearEventLog() {
  await api('/api/event-log/clear', 'POST');
  const list = document.getElementById('event-log-list');
  const card = document.getElementById('event-log-card');
  if (list) list.innerHTML = '';
  if (card) card.style.display = 'none';
}

// ── Printer commands ──────────────────────────
async function printerCmd(pid, action) {
  if (action === 'stop' && !confirm('Druck wirklich abbrechen?')) return;
  await api('/api/printers/' + pid + '/' + action, 'POST');
  toast(action === 'pause' ? '⏸ Pausiert' : action === 'resume' ? '▶️ Fortgesetzt' : '⏹ Abgebrochen');
}

async function repeatPrint(pid) {
  if (!confirm('Letzten Druck wirklich wiederholen?')) return;
  const r = await api('/api/printers/' + pid + '/repeat', 'POST');
  if (r.ok) {
    toast('🚀 Wiederholung gestartet: ' + r.filename);
  } else {
    toast('❌ Fehler: ' + (r.error || 'Druck konnte nicht gestartet werden'), 'error');
  }
}

async function setLight(pid, on) {
  await api('/api/printers/' + pid + '/light', 'POST', { on });
  toast(on ? '💡 Licht an' : '💡 Licht aus');
}

async function setSpeed(pid, level) {
  await api('/api/printers/' + pid + '/speed', 'POST', { level });
  const labels = { 1: 'Stille', 2: 'Normal', 3: 'Sport', 4: 'Turbo' };
  toast('⚡ ' + labels[level]);
  [1, 2, 3, 4].forEach(lvl => {
    const el = document.getElementById('spd-' + pid + '-' + lvl);
    if (el) el.classList.toggle('active', lvl === level);
  });
}

async function homeAxes(pid, axes) {
  await api('/api/printers/' + pid + '/home', 'POST', { axes });
  toast('🏠 Home: ' + (axes === 'all' ? 'Alle Achsen' : axes.toUpperCase()));
}

async function motorsOff(pid) {
  await api('/api/printers/' + pid + '/motors_off', 'POST');
  toast('⚡ Motoren aus');
}

async function runMacro(mid, pid) {
  const r = await api('/api/macros/' + mid + '/run', 'POST', { printer_id: pid });
  if (r.ok) toast('⚡ Makro ausgeführt');
  else toast('❌ Fehler beim Ausführen des Makros', 'error');
}

async function cooldown(pid, target = 'all') {
  const labels = { nozzle: 'Nozzle', bed: 'Bett', all: 'Nozzle & Bett' };
  if (target === 'nozzle' || target === 'all') { const el = document.getElementById('nt-' + pid); if (el) el.textContent = '→ 0°C'; }
  if (target === 'bed'    || target === 'all') { const el = document.getElementById('bt-' + pid); if (el) el.textContent = '→ 0°C'; }
  toast('❄️ Cooldown — ' + labels[target] + ' kühlt ab');
  if (target === 'nozzle' || target === 'all') await api('/api/printers/' + pid + '/temperature', 'POST', { type: 'nozzle', temp: 0 });
  if (target === 'bed'    || target === 'all') await api('/api/printers/' + pid + '/temperature', 'POST', { type: 'bed', temp: 0 });
}

const PREHEAT_PROFILES = {
  PLA:  { nozzle: 220, bed: 60  },
  PETG: { nozzle: 250, bed: 70  },
  ABS:  { nozzle: 270, bed: 100 },
  TPU:  { nozzle: 230, bed: 40  },
};

async function preheat(pid, profile) {
  const p = PREHEAT_PROFILES[profile]; if (!p) return;
  const ntEl = document.getElementById('nt-' + pid); if (ntEl) ntEl.textContent = '→ ' + p.nozzle + '°C';
  const btEl = document.getElementById('bt-' + pid); if (btEl) btEl.textContent = '→ ' + p.bed + '°C';
  toast('🔥 Vorheizen: ' + profile + ' (' + p.nozzle + '° / ' + p.bed + '°)');
  await api('/api/printers/' + pid + '/temperature', 'POST', { type: 'nozzle', temp: p.nozzle });
  await api('/api/printers/' + pid + '/temperature', 'POST', { type: 'bed',    temp: p.bed });
}

async function filamentLoad(pid) {
  await api('/api/printers/' + pid + '/filament_load', 'POST');
  toast('⬇️ Filament wird eingezogen...');
}

async function filamentUnload(pid) {
  await api('/api/printers/' + pid + '/filament_unload', 'POST');
  toast('⬆️ Filament wird ausgeworfen...');
}

async function setFan(pid, percent, type = 'part') {
  await api('/api/printers/' + pid + '/fan', 'POST', { percent, type });
  toast('💨 Lüfter: ' + percent + '%');
}

async function setFlowRate(pid, percent) {
  await api('/api/printers/' + pid + '/gcode', 'POST', { gcode: 'M221 S' + percent });
  toast('💧 Flow Rate: ' + percent + '%');
}

// ── Temperature modal ─────────────────────────
function openTempModal(pid, type, currentVal) {
  tempCtx = { printerId: pid, type };
  document.getElementById('temp-modal-sub').textContent = type === 'nozzle' ? 'Nozzle Temperatur' : 'Bett Temperatur';
  document.getElementById('temp-label').textContent     = type === 'nozzle' ? 'Nozzle (°C)' : 'Bett (°C)';
  document.getElementById('temp-input').value = currentVal || 0;
  openModal('modal-temp');
}

async function sendTemp() {
  const temp = parseInt(document.getElementById('temp-input').value);
  if (isNaN(temp) || temp < 0 || temp > 350) { toast('Ungültige Temperatur!', 'error'); return; }
  const pid  = tempCtx.printerId;
  const type = tempCtx.type;
  if (type === 'nozzle') { const el = document.getElementById('nt-' + pid); if (el) el.textContent = '→ ' + temp + '°C'; }
  if (type === 'bed')    { const el = document.getElementById('bt-' + pid); if (el) el.textContent = '→ ' + temp + '°C'; }
  closeModal('modal-temp');
  toast('🌡️ ' + temp + '°C gesetzt');
  await api('/api/printers/' + pid + '/temperature', 'POST', { type, temp });
}

// ── AMS ───────────────────────────────────────
async function openAmsAssign(pid, ui, si, isEmpty) {
  assignCtx = { printerId: pid, unitIdx: ui, slotIdx: si, selectedFilamentId: null };
  document.getElementById('ams-assign-subtitle').textContent = 'Slot ' + (si + 1) + ' · AMS ' + (ui + 1);
  document.getElementById('btn-clear-slot').style.display = isEmpty ? 'none' : 'inline-flex';
  const filaments = await api('/api/filaments');
  const list = document.getElementById('ams-filament-list');
  if (!filaments.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px 0;">Noch kein Filament angelegt. <a href="/?page=filaments">→ Filamente verwalten</a></div>';
  } else {
    list.innerHTML = filaments.map(f => {
      const rem = f.weight_total - f.weight_used;
      const pct = Math.max(0, Math.round((rem / f.weight_total) * 100));
      return `<div class="fil-option" id="fo-${f.id}" onclick="selectFilamentForSlot(${f.id})">
        <div class="fil-option-dot" style="background:${esc(f.color_hex)};"></div>
        <div>
          <div class="fil-option-name">${esc(f.brand)} ${esc(f.color)}</div>
          <div class="fil-option-sub">${esc(f.material)}${f.temp_nozzle ? ' · ' + f.temp_nozzle + '°C' : ''}</div>
        </div>
        <div class="fil-option-pct">${pct}% · ${Math.round(rem)}g</div>
      </div>`;
    }).join('');
  }
  openModal('modal-ams-assign');
}

function selectFilamentForSlot(id) {
  document.querySelectorAll('.fil-option').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('fo-' + id); if (el) el.classList.add('selected');
  assignCtx.selectedFilamentId = id;
}

async function saveAmsAssign() {
  if (!assignCtx.selectedFilamentId) { toast('Bitte ein Filament wählen!', 'error'); return; }
  await api('/api/ams/' + assignCtx.printerId + '/assign', 'POST', {
    unit_idx: assignCtx.unitIdx, slot_idx: assignCtx.slotIdx, filament_id: assignCtx.selectedFilamentId
  });
  closeModal('modal-ams-assign');
  toast('Slot zugewiesen ✅');
  location.reload();
}

async function clearAmsSlot() {
  await api('/api/ams/' + assignCtx.printerId + '/assign/' + assignCtx.unitIdx + '/' + assignCtx.slotIdx, 'DELETE');
  closeModal('modal-ams-assign');
  toast('Slot geleert');
  location.reload();
}

function toggleAmsDetail(detailId, trayJson, pid, ui, si) {
  document.querySelectorAll('.ams-detail').forEach(d => d.classList.remove('open'));
  if (openAmsDetail === detailId) { openAmsDetail = null; return; }
  openAmsDetail = detailId;
  const panel = document.getElementById(detailId); if (!panel) return;
  let tray;
  try { tray = JSON.parse(trayJson.replace(/&quot;/g, '"')); } catch (_) { return; }
  const src = tray.source === 'rfid'
    ? '<span style="color:var(--green);">● RFID</span>'
    : '<span style="color:var(--accent);">● Manuell</span>';
  panel.innerHTML =
    `<div class="ams-drow"><span class="ams-dk">Quelle</span><span class="ams-dv">${src}</span></div>` +
    `<div class="ams-drow"><span class="ams-dk">Material</span><span class="ams-dv">${esc(tray.type || '—')}</span></div>` +
    `<div class="ams-drow"><span class="ams-dk">Hersteller</span><span class="ams-dv">${esc(tray.brand || '—')}</span></div>` +
    `<div class="ams-drow"><span class="ams-dk">Restmenge</span><span class="ams-dv">${tray.remain >= 0 ? tray.remain + '%' : '—'}</span></div>` +
    `<div class="ams-drow"><span class="ams-dk">Düse</span><span class="ams-dv">${tray.nozzle_min ? tray.nozzle_min + '–' + (tray.nozzle_max || '?') + '°C' : '—'}</span></div>` +
    `<div class="ams-dacts">` +
    `<button class="btn btn-info btn-sm" onclick="openAmsAssign(${pid},${ui},${si},false)">✏️ Ändern</button>` +
    `<button class="btn btn-danger btn-sm" onclick="assignCtx={printerId:${pid},unitIdx:${ui},slotIdx:${si}};clearAmsSlot()">Leeren</button>` +
    `</div>`;
  panel.classList.add('open');
}

// ── Bambu Studio Filament-Import ──────────────
async function openFilamentSearch() {
  const list = document.getElementById('filsearch-list');
  if (!list) return;
  list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px 0;">⏳ Lade Profile...</div>';
  openModal('modal-filament-search');
  document.getElementById('filsearch-input').value = '';
  try {
    const [orca, bambu] = await Promise.all([
      api('/api/filament-db').catch(() => ({})),
      api('/api/filament-db/bambu').catch(() => ({}))
    ]);

    filSearchData = [];
    const merge = (db, source) => {
      for (const [vendor, materials] of Object.entries(db)) {
        for (const [mat, data] of Object.entries(materials)) {
          filSearchData.push({ vendor, material: mat, source, ...data });
        }
      }
    };

    merge(orca, 'OrcaSlicer');
    merge(bambu, 'BambuStudio');

    filSearchData.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.material.localeCompare(b.material));
    renderFilamentSearch(filSearchData);
  } catch (e) {
    list.innerHTML = '<div style="color:var(--red);font-size:13px;">Fehler: ' + esc(e.message) + '</div>';
  }
}

function filterFilamentSearch(q) {
  const lq = q.toLowerCase();
  renderFilamentSearch(filSearchData.filter(f => (f.vendor + ' ' + f.material + ' ' + (f.source||'')).toLowerCase().includes(lq)));
}

function renderFilamentSearch(items) {
  const list = document.getElementById('filsearch-list');
  if (!items.length) { list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0;">Keine Treffer</div>'; return; }
  window._filItems = items.slice(0, 100);
  list.innerHTML = window._filItems.map((f, i) => {
    const n = f.nozzle || f.nozzle_min || 0;
    const srcTag = f.source === 'BambuStudio' ? '<span style="color:var(--accent);font-size:8px;background:rgba(41,182,246,.1);padding:1px 4px;border-radius:4px;margin-left:5px;">LOKAL</span>' : '';
    return `<div onclick="selectFilamentPreset(window._filItems[${i}])"
      style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;cursor:pointer;border:1px solid var(--border);background:var(--bg3);margin-bottom:4px;"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:600;">${esc(f.vendor)}${srcTag} <span style="color:var(--text3)">${esc(f.material)}</span></div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);">🌡️ ${n}°C Nozzle · 🛏️ ${f.bed || 0}°C Bett${f.density ? ' · ' + f.density + 'g/cm³' : ''}</div>
      </div>
      <div style="font-size:10px;color:var(--accent);font-weight:600;">Wählen →</div>
    </div>`;
  }).join('');
}

function selectFilamentPreset(f) {
  closeModal('modal-filament-search');
  document.getElementById('f-brand').value    = f.vendor || '';
  document.getElementById('f-material').value = f.material || '';
  document.getElementById('f-nozzle').value   = f.nozzle || f.nozzle_min || '';
  document.getElementById('f-nozzle-min').value = f.nozzle_min || '';
  document.getElementById('f-nozzle-max').value = f.nozzle_max || '';
  document.getElementById('f-bed').value      = f.bed || '';
  if (f.price) document.getElementById('f-price').value = f.price;
  if (f.dry_temp) document.getElementById('f-dry-temp').value = f.dry_temp;
  openModal('modal-add-filament');
  toast('📥 Profil geladen — bitte Farbe & Gewicht ergänzen');
}

// ── Filament CRUD ─────────────────────────────
function openAddFilament() {
  document.getElementById('fil-modal-title').textContent = 'Filament hinzufügen';
  document.getElementById('f-id').value = '';
  ['f-brand','f-material','f-color','f-location','f-notes','f-pa','f-ka'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['f-weight','f-weight-used'].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'f-weight' ? '1000' : '0'; });
  ['f-price','f-nozzle','f-nozzle-min','f-nozzle-max','f-bed','f-dry-temp','f-dry-time'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const ch = document.getElementById('f-color-hex'); if (ch) ch.value = '#888888';
  openModal('modal-add-filament');
}

function openEditFilament(f) {
  document.getElementById('fil-modal-title').textContent = 'Filament bearbeiten';
  document.getElementById('f-id').value           = f.id;
  document.getElementById('f-brand').value         = f.brand || '';
  document.getElementById('f-material').value      = f.material || '';
  document.getElementById('f-color').value         = f.color || '';
  document.getElementById('f-color-hex').value     = f.color_hex || '#888888';
  document.getElementById('f-weight').value        = f.weight_total || 1000;
  document.getElementById('f-weight-used').value   = f.weight_used || 0;
  document.getElementById('f-price').value         = f.price_per_kg || '';
  document.getElementById('f-nozzle-min').value    = f.temp_nozzle_min || '';
  document.getElementById('f-nozzle-max').value    = f.temp_nozzle_max || '';
  document.getElementById('f-nozzle').value        = f.temp_nozzle || '';
  document.getElementById('f-bed').value           = f.temp_bed || '';
  document.getElementById('f-dry-temp').value      = f.temp_dry || '';
  document.getElementById('f-dry-time').value      = f.time_dry || '';
  document.getElementById('f-pa').value            = f.pa || '';
  document.getElementById('f-ka').value            = f.ka || '';
  document.getElementById('f-location').value      = f.location || '';
  document.getElementById('f-notes').value         = f.notes || '';
  openModal('modal-add-filament');
}

async function saveFilament() {
  const id = document.getElementById('f-id').value;
  const body = {
    brand:          document.getElementById('f-brand').value,
    material:       document.getElementById('f-material').value,
    color:          document.getElementById('f-color').value,
    color_hex:      document.getElementById('f-color-hex').value,
    weight_total:   parseFloat(document.getElementById('f-weight').value) || 1000,
    weight_used:    parseFloat(document.getElementById('f-weight-used').value) || 0,
    price_per_kg:   parseFloat(document.getElementById('f-price').value) || 0,
    temp_nozzle_min: parseInt(document.getElementById('f-nozzle-min').value) || null,
    temp_nozzle_max: parseInt(document.getElementById('f-nozzle-max').value) || null,
    temp_nozzle:    parseInt(document.getElementById('f-nozzle').value) || null,
    temp_bed:       parseInt(document.getElementById('f-bed').value) || null,
    temp_dry:       parseInt(document.getElementById('f-dry-temp').value) || null,
    time_dry:       parseInt(document.getElementById('f-dry-time').value) || null,
    pa:             parseFloat(document.getElementById('f-pa').value) || null,
    ka:             parseFloat(document.getElementById('f-ka').value) || null,
    location:       document.getElementById('f-location').value || null,
    notes:          document.getElementById('f-notes').value || null,
  };
  if (!body.brand || !body.material) { toast('Hersteller und Material erforderlich!', 'error'); return; }
  if (id) {
    await api('/api/filaments/' + id, 'PUT', body);
    toast('✅ Filament aktualisiert');
  } else {
    await api('/api/filaments', 'POST', body);
    toast('✅ Filament hinzugefügt');
  }
  closeModal('modal-add-filament');
  if (typeof loadFilaments === 'function') loadFilaments();
}

async function deleteFilament(id) {
  if (!confirm('Filament wirklich löschen?')) return;
  await api('/api/filaments/' + id, 'DELETE');
  toast('Gelöscht');
  if (typeof loadFilaments === 'function') loadFilaments();
}

// ── Printer CRUD ──────────────────────────────
async function addPrinter() {
  const id        = document.getElementById('p-id').value;
  const name      = document.getElementById('p-name').value.trim();
  const model     = document.getElementById('p-model').value;
  const ip        = document.getElementById('p-ip').value.trim();
  const code      = document.getElementById('p-code').value.trim();
  const serial    = document.getElementById('p-serial').value.trim();
  const timelapse = document.getElementById('p-timelapse').checked;
  
  if (!name || !ip || (id==='' && !code) || !serial) { toast('Alle Felder ausfüllen!', 'error'); return; }
  
  const data = { name, model, ip, serial, timelapse_enabled: timelapse };
  if (code) data.access_code = code;

  if (id) {
    await api('/api/printers/' + id, 'PATCH', data);
    toast('✅ Drucker aktualisiert');
  } else {
    await api('/api/printers', 'POST', data);
    toast('✅ Drucker hinzugefügt');
  }
  
  closeModal('modal-add-printer');
  setTimeout(() => location.reload(), 1200);
}

function editPrinter(p) {
  document.getElementById('p-modal-title').textContent = 'Drucker bearbeiten';
  document.getElementById('p-id').value = p.id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-model').value = p.model;
  document.getElementById('p-ip').value = p.ip;
  document.getElementById('p-code').value = ''; // Bleibt leer wenn keine Änderung
  document.getElementById('p-code').placeholder = '(Unverändert lassen)';
  document.getElementById('p-serial').value = p.serial || '';
  document.getElementById('p-timelapse').checked = p.timelapse_enabled == 1;
  openModal('modal-add-printer');
}

function resetPrinterModal() {
  document.getElementById('p-modal-title').textContent = 'Drucker hinzufügen';
  document.getElementById('p-id').value = '';
  document.getElementById('p-name').value = '';
  document.getElementById('p-model').selectedIndex = 0;
  document.getElementById('p-ip').value = '';
  document.getElementById('p-code').value = '';
  document.getElementById('p-code').placeholder = '12345678';
  document.getElementById('p-serial').value = '';
  document.getElementById('p-timelapse').checked = true;
}

async function deletePrinter(id) {
  if (!confirm('Drucker wirklich löschen?')) return;
  await api('/api/printers/' + id, 'DELETE');
  toast('Gelöscht');
  setTimeout(() => location.reload(), 800);
}

// ── File Manager ──────────────────────────────
let currentFileTab = 'upload';

function switchFileTab(tab) {
  currentFileTab = tab;
  document.querySelectorAll('.file-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.file-tab-content').forEach(el => el.classList.remove('active'));
  const tabEl    = document.querySelector(`.file-tab[data-tab="${tab}"]`);
  const contentEl = document.getElementById('filetab-' + tab);
  if (tabEl)    tabEl.classList.add('active');
  if (contentEl) contentEl.classList.add('active');
  if (tab === 'sdcard')  loadSdFiles();
  if (tab === 'pifiles') loadPiFiles();
}

async function loadSdFiles() {
  const pid = document.getElementById('file-printer-select')?.value;
  const container = document.getElementById('sdcard-files');
  if (!container) return;
  if (!pid) { container.innerHTML = '<div style="color:var(--text3);">Drucker auswählen</div>'; return; }
  container.innerHTML = '<div style="color:var(--text3);">⏳ Lade Dateien vom Drucker...</div>';
  try {
    const result = await api('/api/printers/' + pid + '/files');
    if (result.error) { container.innerHTML = '<div style="color:var(--red);">⚠️ ' + esc(result.error) + '</div>'; return; }
    if (!result.length) { container.innerHTML = '<div style="color:var(--text3);">Keine Dateien gefunden</div>'; return; }
    container.innerHTML = '';
    result.forEach(f => {
      const row = document.createElement('div'); row.className = 'file-row';
      row.innerHTML = `<div style="flex:1"><div class="file-name">${esc(f.name)}</div><div class="file-meta">${fmtSize(f.size || 0)}</div></div>
        <div class="file-actions">
          <button class="btn btn-primary btn-sm" onclick="startSdFile(${pid},'${esc(f.name)}')">▶️ Start</button>
          <button class="btn btn-secondary btn-sm" onclick="enqueueFile(${pid},'${esc(f.name)}')">⏳ Queue</button>
          <button class="btn btn-danger btn-sm"  onclick="deleteSdFile(${pid},'${esc(f.name)}')">🗑</button>
        </div>`;
      container.appendChild(row);
    });
  } catch (e) {
    container.innerHTML = '<div style="color:var(--red);">⚠️ ' + esc(e.message) + '</div>';
  }
}

async function loadPiFiles() {
  const container = document.getElementById('pi-files');
  if (!container) return;
  const pid = document.getElementById('file-printer-select')?.value || '';
  const files = await api('/api/uploads');
  if (!files.length) { container.innerHTML = '<div style="color:var(--text3);">Noch keine Dateien hochgeladen</div>'; return; }
  container.innerHTML = '';
  files.forEach(f => {
    const row = document.createElement('div'); row.className = 'file-row';
    const displayName = f.filename.replace(/^\d+-/, '');
    row.innerHTML = `<div style="flex:1"><div class="file-name">${esc(displayName)}</div><div class="file-meta">${fmtSize(f.size)}</div></div>
      <div class="file-actions">
        <button class="btn btn-secondary btn-sm" onclick="showGcodePreview('${esc(f.filename)}')">👁️</button>
        ${pid ? `<button class="btn btn-primary btn-sm" onclick="printFromPi('${esc(f.filename)}')">▶️ Drucken</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="deletePiFile('${esc(f.filename)}')">🗑</button>
      </div>`;
    container.appendChild(row);
  });
}

async function startSdFile(pid, filename) {
  if (!confirm('Datei "' + filename + '" starten?')) return;
  const options = getPrintOptions();
  await api('/api/printers/' + pid + '/startfile', 'POST', { filename, ...options });
  toast('▶️ Druck gestartet!');
}

async function deleteSdFile(pid, filename) {
  if (!confirm('Löschen?')) return;
  await api('/api/printers/' + pid + '/files/' + encodeURIComponent(filename), 'DELETE');
  toast('Gelöscht');
  loadSdFiles();
}

async function deletePiFile(filename) {
  if (!confirm('Datei löschen?')) return;
  await api('/api/uploads/' + encodeURIComponent(filename), 'DELETE');
  toast('Gelöscht');
  loadPiFiles();
}

async function printFromPi(filename) {
  const pid = document.getElementById('file-printer-select')?.value;
  if (!pid) { toast('Drucker auswählen!', 'error'); return; }
  if (!confirm('Hochladen und starten?')) return;
  const options = getPrintOptions();
  toast('⬆️ Wird hochgeladen...');
  const result = await api('/api/printers/' + pid + '/print', 'POST', { filename, start: true, ...options });
  if (result.ok) toast('✅ ' + result.message); else toast('❌ ' + (result.error || 'Fehler'), 'error');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone')?.classList.remove('drag');
  const files = e.dataTransfer.files;
  if (files.length) uploadFile(files[0]);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) uploadFile(file);
}

async function uploadFile(file) {
  if (!file.name.endsWith('.3mf') && !file.name.endsWith('.gcode')) {
    toast('Nur .3mf und .gcode!', 'error'); return;
  }
  const q = document.getElementById('upload-queue');
  if (q) q.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:12px 0;">⬆️ Lade "${esc(file.name)}" hoch...</div>`;
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await r.json();
    if (data.filename) {
      toast('✅ Hochgeladen!');
      const pid = document.getElementById('file-printer-select')?.value || '';
      if (q) {
        q.innerHTML = '';
        const row = document.createElement('div'); row.className = 'file-row';
        row.innerHTML = `<div style="flex:1"><div class="file-name">${esc(file.name)}</div><div class="file-meta">${fmtSize(file.size)}</div></div>
          <div class="file-actions">
            ${pid ? `<button class="btn btn-primary btn-sm" onclick="printFromPi('${esc(data.filename)}')">▶️ Jetzt drucken</button>` : ''}
          </div>`;
        if (data.metadata) {
          const m = data.metadata;
          const preview = document.createElement('div');
          preview.className = 'upload-preview';
          preview.innerHTML = `<div class="upload-preview-title">📦 Datei-Infos</div>` +
            (m.weight_g  ? `<div style="font-size:12px;color:var(--text2);">⚖️ ${m.weight_g}g · ⏱ ${m.time_formatted || '?'}</div>` : '') +
            (m.printer_model ? `<div style="font-size:11px;color:var(--text3);">Drucker: ${esc(m.printer_model)}</div>` : '');
          row.appendChild(preview);
        }
        q.appendChild(row);
        if (typeof loadPiFiles === 'function') loadPiFiles();
      }
    } else {
      toast('❌ ' + (data.error || 'Upload fehlgeschlagen'), 'error');
    }
  } catch (e) {
    toast('❌ Upload-Fehler: ' + e.message, 'error');
  }
}

// ── History CSV Export ────────────────────────
async function exportCSV() {
  const history = await api('/api/history');
  if (!history.length) { toast('Keine Daten', 'error'); return; }
  const rows = [['Datum', 'Datei', 'Drucker', 'Filament', 'Gramm', 'Dauer (min)', 'Filamentkosten', 'Stromkosten', 'Gesamt']];
  history.forEach(h => rows.push([
    h.finished_at || h.started_at,
    h.filename || '',
    h.printer_name || '',
    (h.brand || '') + ' ' + (h.material || ''),
    h.grams_used || 0,
    h.duration_min || 0,
    (h.filament_cost || 0).toFixed(4),
    (h.electricity_cost || 0).toFixed(4),
    (h.total_cost || 0).toFixed(4),
  ]));
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'druckhistorie.csv';
  a.click();
}

// ── Calculator ────────────────────────────────
async function calculate() {
  const grams     = parseFloat(document.getElementById('calc-grams')?.value) || 0;
  const purge     = parseFloat(document.getElementById('calc-purge')?.value) || 0;
  const duration  = parseFloat(document.getElementById('calc-duration')?.value) || 0;
  const filId     = document.getElementById('calc-filament')?.value || null;
  const failure   = parseFloat(document.getElementById('calc-failure')?.value) || 10;
  const postMin   = parseFloat(document.getElementById('calc-post')?.value) || 0;
  const hourly    = parseFloat(document.getElementById('calc-rate')?.value) || 0;
  const margin    = parseFloat(document.getElementById('calc-margin')?.value) || 0;
  if (!grams && !duration) return;
  try {
    const r = await api('/api/calculate', 'POST', { grams, purge_g: purge, duration_min: duration, filament_id: filId, failure_rate: failure, post_processing_min: postMin, hourly_rate: hourly, margin });
    const fmt = v => v != null ? v.toFixed(2) + ' €' : '—';
    document.getElementById('r-filament').textContent    = fmt(r.filament_cost);
    document.getElementById('r-electricity').textContent = fmt(r.electricity_cost);
    document.getElementById('r-machine').textContent     = fmt(r.machine_cost);
    document.getElementById('r-failure').textContent     = fmt(r.failure_cost);
    document.getElementById('r-post').textContent        = fmt(r.post_cost);
    document.getElementById('r-total').textContent       = fmt(r.total_cost);
    const sellRow = document.getElementById('r-sell-row');
    const sellEl  = document.getElementById('r-sell');
    if (r.selling_price != null) { if (sellRow) sellRow.style.display = 'flex'; if (sellEl) sellEl.textContent = fmt(r.selling_price); }
    else { if (sellRow) sellRow.style.display = 'none'; }
    document.getElementById('calc-result').style.display = 'block';
  } catch (e) { toast('Berechnungsfehler', 'error'); }
}

// ── Settings: machine cost preview ────────────
function updateMachineCostPreview() {
  const price = parseFloat(document.getElementById('set-machine-price')?.value) || 700;
  const hours = parseFloat(document.getElementById('set-machine-hours')?.value) || 5000;
  const el = document.getElementById('machine-cost-preview');
  if (el) el.textContent = (price / hours).toFixed(4) + ' €/h';
}

async function enqueueFile(pid, filename) {
  if (!confirm('Datei "' + filename + '" zur Warteschlange hinzufügen?')) return;
  const options = getPrintOptions();
  const r = await api('/api/queue', 'POST', { printer_id: pid, filename, options });
  if (r.id) toast('⏳ Zur Warteschlange hinzugefügt');
}

// ── G-Code Preview (Phase 3) ──────────────────
async function showGcodePreview(filename) {
  const modal = document.getElementById('modal-gcode-preview');
  const fnameEl = document.getElementById('gcode-preview-filename');
  const loading = document.getElementById('gcode-loading');
  const canvas = document.getElementById('gcode-canvas');
  const statsEl = document.getElementById('gcode-stats');

  if (!modal || !canvas) return;
  fnameEl.textContent = filename;
  loading.style.display = 'flex';
  loading.textContent = '⏳ Lade G-Code...';
  statsEl.textContent = '';
  openModal('modal-gcode-preview');

  try {
    const res = await fetch('/api/uploads/' + encodeURIComponent(filename) + '/gcode');
    if (!res.ok) throw new Error('Download fehlgeschlagen');
    const gcode = await res.text();
    loading.style.display = 'none';

    if (window._gcodePreview) {
      // Re-use or clear is tricky with WebGLPreview in some versions, 
      // often easier to just re-instantiate if simple.
      window._gcodePreview = null;
    }
    
    // GCodePreview uses the canvas dimensions
    const box = canvas.parentElement.getBoundingClientRect();
    canvas.width = box.width;
    canvas.height = box.height;

    window._gcodePreview = GCodePreview.init({
      canvas: canvas,
      buildVolume: {x: 256, y: 256, z: 256},
      initialCameraPosition: [0, 400, 450],
      renderNonHomogeneous: true
    });

    window._gcodePreview.processGCode(gcode);
    statsEl.textContent = `Zeilen: ${gcode.split('\n').length.toLocaleString()} · Typ: ${filename.split('.').pop().toUpperCase()}`;
    
  } catch (e) {
    loading.style.display = 'flex';
    loading.textContent = '❌ Fehler: ' + e.message;
  }
}
