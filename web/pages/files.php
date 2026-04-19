<?php
$printers = api('/api/printers') ?? [];
$settings = api('/api/settings') ?? [];
$autoCost = ($settings['auto_cost_calc'] ?? '0') === '1';
?>

<div class="page-header"><h1>Dateimanager</h1></div>

<div class="form-group" style="max-width:300px;">
  <label>Drucker auswählen</label>
  <select id="file-printer-select" onchange="document.getElementById('filetab-sdcard').dataset.loaded='0';if(document.getElementById('tab-sdcard').classList.contains('active'))loadSdFiles()">
    <option value="">— Drucker wählen —</option>
    <?php foreach ($printers as $p): ?>
    <option value="<?= (int)$p['id'] ?>"><?= htmlspecialchars($p['name']) ?> (<?= htmlspecialchars($p['model']) ?>)</option>
    <?php endforeach; ?>
  </select>
</div>

<div class="file-tabs">
  <div class="file-tab active" data-tab="upload"   onclick="switchFileTab('upload')">⬆️ Hochladen</div>
  <div class="file-tab"       data-tab="sdcard"    onclick="switchFileTab('sdcard')">💾 Auf dem Drucker</div>
  <div class="file-tab"       data-tab="pifiles"   onclick="switchFileTab('pifiles')">🗂️ Pi-Speicher</div>
</div>

<!-- Upload Tab -->
<div id="filetab-upload" class="file-tab-content active">
  <div class="upload-zone" id="upload-zone"
    onclick="document.getElementById('file-input').click()"
    ondragover="event.preventDefault();this.classList.add('drag')"
    ondragleave="this.classList.remove('drag')"
    ondrop="handleDrop(event)">
    <p style="font-size:36px;margin-bottom:10px;">📂</p>
    <p style="font-weight:600;color:var(--text1);margin-bottom:4px;">Datei hier ablegen oder klicken</p>
    <p style="font-size:12px;">.3mf und .gcode Dateien · max. 500 MB</p>
  </div>
  <input type="file" id="file-input" accept=".3mf,.gcode" style="display:none" onchange="handleFileSelect(event)">
  <div id="upload-queue"></div>
</div>

<!-- SD Card Tab -->
<div id="filetab-sdcard" class="file-tab-content">
  <div id="sdcard-files" style="color:var(--text3);font-size:13px;">Drucker auswählen um Dateien zu laden</div>
</div>

<!-- Pi Files Tab -->
<div id="filetab-pifiles" class="file-tab-content">
  <div id="pi-files" style="color:var(--text3);font-size:13px;">Lade...</div>
</div>

<script>
// Load Pi files on page load
document.addEventListener('DOMContentLoaded', () => loadPiFiles());
</script>
