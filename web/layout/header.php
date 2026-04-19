<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($pageTitle ?? 'BambuPi') ?> — BambuPi</title>
  <link rel="stylesheet" href="/assets/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <script src="https://unpkg.com/gcode-preview@0.3.0/dist/gcode-preview.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  </script>
</head>
<body class="<?= ($page==='kiosk') ? 'kiosk-mode' : '' ?>">

<?php if ($page !== 'kiosk' && $page !== 'setup'): ?>
<nav class="sidebar">
  <div class="sidebar-logo">🖨️ BambuPi Manager</div>
  <div class="nav-section">Übersicht</div>
  <a href="/?page=dashboard"   class="<?= ($page==='dashboard')   ? 'active':'' ?>">📊 Dashboard</a>
  <a href="/?page=printers"    class="<?= ($page==='printers')    ? 'active':'' ?>">🖨️ Drucker</a>
  <a href="/?page=analytics"   class="<?= ($page==='analytics')   ? 'active':'' ?>">📈 Statistiken</a>
  <div class="nav-section">Materialien</div>
  <a href="/?page=filaments"   class="<?= ($page==='filaments')   ? 'active':'' ?>">🧵 Filamente</a>
  <div class="nav-section">Dateien & Daten</div>
  <a href="/?page=files"       class="<?= ($page==='files')       ? 'active':'' ?>">📂 Dateien</a>
  <a href="/?page=queue"       class="<?= ($page==='queue')       ? 'active':'' ?>">⏳ Warteschlange</a>
  <a href="/?page=history"     class="<?= ($page==='history')     ? 'active':'' ?>">📋 Historie</a>
  <a href="/?page=timelapse"   class="<?= ($page==='timelapse')   ? 'active':'' ?>">🎬 Timelapses</a>
  <a href="/?page=calculator"  class="<?= ($page==='calculator')  ? 'active':'' ?>">💰 Kostenrechner</a>
  <div class="nav-section">System</div>
  <a href="/?page=maintenance" class="<?= ($page==='maintenance') ? 'active':'' ?>">🛠️ Wartung</a>
  <a href="/?page=settings"    class="<?= ($page==='settings')    ? 'active':'' ?>">⚙️ Einstellungen</a>
  <a href="/?page=kiosk"       class="<?= ($page==='kiosk')       ? 'active':'' ?>">📺 Kiosk Modus</a>
  <div style="margin-top:auto; padding:15px; border-top:1px solid var(--border);">
    <button onclick="toggleDarkMode()" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center; gap:8px;">
      <span id="dark-mode-icon">🌙</span> <span id="dark-mode-text">Dark Mode</span>
    </button>
  </div>
</nav>
<?php endif; ?>

<script>
  function updateDarkModeUI() {
    const isDark = document.body.classList.contains('dark-mode');
    const icon = document.getElementById('dark-mode-icon');
    const text = document.getElementById('dark-mode-text');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (text) text.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }
  function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? '1' : '0');
    updateDarkModeUI();
  }
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark-mode');
  } else if (localStorage.getItem('darkMode') === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('dark-mode');
  }
  document.addEventListener('DOMContentLoaded', updateDarkModeUI);
</script>

<main class="content">

<!-- ── Global Header ── -->
<?php if ($page !== 'kiosk' && $page !== 'setup'): ?>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
  <h1 style="font-size:20px;font-weight:700;"><?= htmlspecialchars($pageTitle ?? 'BambuPi') ?></h1>
  <div class="sse-chip">● Live</div>
</div>
<?php endif; ?>

<!-- ── Toast ── -->
<div id="toast" class="toast"></div>

<!-- ── Modal: Temperatur setzen ── -->
<div id="modal-temp" class="modal-backdrop">
  <div class="modal-box">
    <div class="modal-title">Temperatur setzen</div>
    <div class="modal-sub" id="temp-modal-sub">Nozzle Temperatur</div>
    <div class="form-group">
      <label id="temp-label">Temperatur (°C)</label>
      <input type="number" id="temp-input" placeholder="0" min="0" max="350"
             onkeydown="if(event.key==='Enter')sendTemp()">
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('modal-temp')">Abbrechen</button>
      <button class="btn btn-primary" onclick="sendTemp()">Setzen</button>
    </div>
  </div>
</div>

<!-- ── Modal: AMS Slot zuweisen ── -->
<div id="modal-ams-assign" class="modal-backdrop">
  <div class="modal-box">
    <div class="modal-title">Filament zuweisen</div>
    <div class="modal-sub" id="ams-assign-subtitle">Slot 1 · AMS 1</div>
    <div id="ams-filament-list" style="max-height:280px;overflow-y:auto;"></div>
    <div class="modal-footer">
      <button id="btn-clear-slot" class="btn btn-danger" onclick="clearAmsSlot()" style="margin-right:auto;display:none;">Slot leeren</button>
      <button class="btn btn-secondary" onclick="closeModal('modal-ams-assign')">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveAmsAssign()">Zuweisen</button>
    </div>
  </div>
</div>

<!-- ── Modal: Bambu Studio Import ── -->
<div id="modal-filament-search" class="modal-backdrop">
  <div class="modal-box wide">
    <div class="modal-title">Bambu Studio Profil-Import</div>
    <div class="search-input-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="filsearch-input" placeholder="Hersteller oder Material suchen..."
             oninput="filterFilamentSearch(this.value)"
             style="padding-left:30px;">
    </div>
    <div id="filsearch-list"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('modal-filament-search')">Schließen</button>
    </div>
  </div>
</div>

<!-- ── Modal: Drucker hinzufügen ── -->
<div id="modal-add-printer" class="modal-backdrop">
  <div class="modal-box">
    <div class="modal-title" id="p-modal-title">Drucker hinzufügen</div>
    <input type="hidden" id="p-id">
    <div class="form-group"><label>Name</label><input type="text" id="p-name" placeholder="Mein X1C"></div>
    <div class="form-row">
      <div class="form-group"><label>Modell</label>
        <select id="p-model">
          <option>X1C</option><option>X1E</option><option>P1P</option>
          <option>P1S</option><option>A1</option><option>A1 Mini</option>
        </select>
      </div>
      <div class="form-group"><label>IP-Adresse</label><input type="text" id="p-ip" placeholder="192.168.1.10"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Access Code</label><input type="text" id="p-code" placeholder="12345678"></div>
      <div class="form-group"><label>Seriennummer</label><input type="text" id="p-serial" placeholder="XXXXXXXXX"></div>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="p-timelapse" checked> Zeitraffer (Timelapse) aktivieren
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('modal-add-printer')">Abbrechen</button>
      <button class="btn btn-primary" onclick="addPrinter()">Hinzufügen</button>
    </div>
  </div>
</div>

<!-- ── Modal: Filament hinzufügen/bearbeiten ── -->
<div id="modal-add-filament" class="modal-backdrop">
  <div class="modal-box wide">
    <div class="modal-title" id="fil-modal-title">Filament hinzufügen</div>
    <input type="hidden" id="f-id">
    <div class="form-row">
      <div class="form-group"><label>Hersteller</label><input type="text" id="f-brand" placeholder="Bambu Lab"></div>
      <div class="form-group"><label>Material</label><input type="text" id="f-material" placeholder="PLA"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Farbe (Name)</label><input type="text" id="f-color" placeholder="Weiß"></div>
      <div class="form-group"><label>Farbe (Hex)</label><input type="color" id="f-color-hex" value="#888888" style="width:100%;height:36px;"></div>
    </div>
    <div class="form-row3">
      <div class="form-group"><label>Gewicht gesamt (g)</label><input type="number" id="f-weight" placeholder="1000" value="1000"></div>
      <div class="form-group"><label>Verbraucht (g)</label><input type="number" id="f-weight-used" placeholder="0" value="0"></div>
      <div class="form-group"><label>Preis (€/kg)</label><input type="number" id="f-price" placeholder="25" step="0.01"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Nozzle min (°C)</label><input type="number" id="f-nozzle-min" placeholder="190"></div>
      <div class="form-group"><label>Nozzle max (°C)</label><input type="number" id="f-nozzle-max" placeholder="230"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Nozzle ideal (°C)</label><input type="number" id="f-nozzle" placeholder="215"></div>
      <div class="form-group"><label>Bett (°C)</label><input type="number" id="f-bed" placeholder="60"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Trocknen (°C)</label><input type="number" id="f-dry-temp" placeholder="45"></div>
      <div class="form-group"><label>Trocknen (h)</label><input type="number" id="f-dry-time" placeholder="4"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>PA</label><input type="number" id="f-pa" placeholder="0.04" step="0.001"></div>
      <div class="form-group"><label>K-Faktor</label><input type="number" id="f-ka" placeholder="0.02" step="0.001"></div>
    </div>
    <div class="form-group"><label>Lagerort</label><input type="text" id="f-location" placeholder="Regal A1"></div>
    <div class="form-group"><label>Notizen</label><textarea id="f-notes" rows="2" style="resize:vertical;"></textarea></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('modal-add-filament')">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveFilament()">Speichern</button>
    </div>
  </div>
</div>

<!-- ── Modal: G-Code Preview ── -->
<div id="modal-gcode-preview" class="modal-backdrop">
  <div class="modal-box wide">
    <div class="modal-title">G-Code Vorschau</div>
    <div class="modal-sub" id="gcode-preview-filename">...</div>
    <div id="gcode-preview-container" style="background:#000; border-radius:8px; width:100%; height:450px; overflow:hidden; position:relative;">
      <canvas id="gcode-canvas" style="width:100%; height:100%;"></canvas>
      <div id="gcode-loading" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); color:#fff; font-size:14px;">⏳ Lade Vorschau...</div>
    </div>
    <div class="modal-footer">
      <div id="gcode-stats" style="flex:1; font-size:11px; color:var(--text3); font-family:var(--mono);"></div>
      <button class="btn btn-secondary" onclick="closeModal('modal-gcode-preview')">Schließen</button>
    </div>
  </div>
</div>
