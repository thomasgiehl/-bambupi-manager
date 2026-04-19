<?php
$printers = api('/api/printers') ?? [];
$selectedId = (int)($_GET['id'] ?? ($printers[0]['id'] ?? 0));
?>

<div style="display:flex; flex-direction:column; height:calc(100vh - 40px); gap:15px;">
  
  <!-- Header / Selector -->
  <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg2); padding:10px 20px; border-radius:12px; border:1px solid var(--border);">
    <div style="display:flex; align-items:center; gap:12px;">
      <div style="font-size:24px;">🖨️</div>
      <div>
        <select id="kiosk-printer-select" onchange="location.href='/?page=kiosk&id='+this.value" style="font-size:18px; font-weight:700; background:none; border:none; color:var(--text1); padding:0; cursor:pointer;">
          <?php foreach ($printers as $p): ?>
          <option value="<?= $p['id'] ?>" <?= $p['id'] == $selectedId ? 'selected' : '' ?>><?= htmlspecialchars($p['name']) ?></option>
          <?php endforeach; ?>
        </select>
        <div id="kiosk-status-text" style="font-size:12px; color:var(--text3); text-transform:uppercase; letter-spacing:1px;">Lade Status...</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div id="kiosk-clock" style="font-size:20px; font-weight:600; font-family:var(--mono);">00:00:00</div>
      <div style="font-size:10px; color:var(--text3);"><?= date('d.m.Y') ?></div>
    </div>
  </div>

  <div style="display:grid; grid-template-columns: 1fr 300px; flex:1; gap:15px; overflow:hidden;">
    
    <!-- Left: Camera & Progress -->
    <div style="display:flex; flex-direction:column; gap:15px;">
      <div class="card" style="flex:1; padding:0; overflow:hidden; position:relative; background:#000;">
        <img id="kiosk-cam" src="/api/stream/mjpeg" style="width:100%; height:100%; object-fit:contain; display:block;">
        <div id="kiosk-layer-badge" style="position:absolute; top:15px; left:15px; background:rgba(0,0,0,0.6); padding:5px 12px; border-radius:20px; font-size:12px; backdrop-filter:blur(4px); display:none;">
           Layer <span id="kiosk-layer-val" style="font-weight:700; color:var(--accent);">0</span> / <span id="kiosk-layer-total">0</span>
        </div>
        <div id="kiosk-eta-badge" style="position:absolute; bottom:15px; right:15px; background:rgba(0,0,0,0.6); padding:8px 15px; border-radius:10px; text-align:right; backdrop-filter:blur(4px); display:none;">
           <div style="font-size:10px; color:var(--text3); text-transform:uppercase;">Fertig um</div>
           <div id="kiosk-eta-val" style="font-size:18px; font-weight:700; color:var(--green);">00:00</div>
        </div>
      </div>
      
      <div class="card" style="padding:15px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-weight:600;">
          <span id="kiosk-file-name">Kein aktiver Druck</span>
          <span id="kiosk-pct-val">0%</span>
        </div>
        <div class="pbar" style="height:12px; background:var(--bg4);"><div id="kiosk-pbar-fill" class="pbar-fill" style="width:0%; transition:width 1s;"></div></div>
      </div>
    </div>

    <!-- Right: Stats & Controls -->
    <div style="display:flex; flex-direction:column; gap:15px;">
      
      <div class="card" style="padding:15px;">
        <div class="card-title" style="font-size:12px; color:var(--text3);">Temperaturen</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
          <div style="background:var(--bg3); padding:10px; border-radius:8px; text-align:center;">
            <div style="font-size:10px; color:var(--text3);">NOZZLE</div>
            <div id="kiosk-temp-nozzle" style="font-size:20px; font-weight:700; font-family:var(--mono);">0°</div>
            <div id="kiosk-target-nozzle" style="font-size:10px; color:var(--text3);">Ziel: 0°</div>
          </div>
          <div style="background:var(--bg3); padding:10px; border-radius:8px; text-align:center;">
            <div style="font-size:10px; color:var(--text3);">BETT</div>
            <div id="kiosk-temp-bed" style="font-size:20px; font-weight:700; font-family:var(--mono);">0°</div>
            <div id="kiosk-target-bed" style="font-size:10px; color:var(--text3);">Ziel: 0°</div>
          </div>
        </div>
      </div>

      <div class="card" style="padding:15px; flex:1;">
         <div class="card-title" style="font-size:12px; color:var(--text3);">Steuerung</div>
         <div style="display:grid; grid-template-columns: 1fr; gap:10px; margin-top:10px;">
            <button class="btn btn-secondary" onclick="api('/api/printers/<?= $selectedId ?>/light', 'POST', {on:true})">💡 Licht an</button>
            <button class="btn btn-secondary" onclick="api('/api/printers/<?= $selectedId ?>/light', 'POST', {on:false})">🌑 Licht aus</button>
            <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border); display:flex; flex-direction:column; gap:10px;">
               <button id="btn-kiosk-pause" class="btn btn-warning" onclick="api('/api/printers/<?= $selectedId ?>/pause', 'POST')" style="display:none;">⏸ Pause</button>
               <button id="btn-kiosk-resume" class="btn btn-success" onclick="api('/api/printers/<?= $selectedId ?>/resume', 'POST')" style="display:none;">▶️ Fortsetzen</button>
               <button id="btn-kiosk-stop" class="btn btn-danger" onclick="if(confirm('Druck wirklich abbrechen?'))api('/api/printers/<?= $selectedId ?>/stop', 'POST')" style="display:none;">⏹ Stopp</button>
            </div>
         </div>
         <div style="margin-top:auto; padding-top:20px; text-align:center;">
           <button class="btn btn-secondary btn-sm" onclick="location.href='/?page=dashboard'">⬅️ Verlassen</button>
         </div>
      </div>

    </div>
  </div>
</div>

<script>
const printerId = <?= $selectedId ?>;

function updateClock() {
  document.getElementById('kiosk-clock').textContent = new Date().toLocaleTimeString('de-DE');
}
setInterval(updateClock, 1000);
updateClock();

document.addEventListener('sseMessage', (e) => {
  const data = e.detail;
  if (data.type === 'status' && data.id === printerId) {
    const s = data.status;
    
    document.getElementById('kiosk-status-text').textContent = s.gcode_state || 'offline';
    document.getElementById('kiosk-status-text').style.color = s.gcode_state === 'RUNNING' ? 'var(--green)' : 'var(--text3)';
    
    document.getElementById('kiosk-temp-nozzle').textContent = Math.round(s.nozzle_temper || 0) + '°';
    document.getElementById('kiosk-target-nozzle').textContent = 'Ziel: ' + Math.round(s.nozzle_target_temper || 0) + '°';
    document.getElementById('kiosk-temp-bed').textContent = Math.round(s.bed_temper || 0) + '°';
    document.getElementById('kiosk-target-bed').textContent = 'Ziel: ' + Math.round(s.bed_target_temper || 0) + '°';
    
    const isPrinting = s.gcode_state === 'RUNNING' || s.gcode_state === 'PAUSE';
    document.getElementById('kiosk-file-name').textContent = isPrinting ? (s.subtask_name || 'Druckt...') : 'Bereit';
    
    const pct = parseInt(s.mc_percent) || 0;
    document.getElementById('kiosk-pct-val').textContent = pct + '%';
    document.getElementById('kiosk-pbar-fill').style.width = pct + '%';
    
    // Layer Info
    if (s.layer_num > 0) {
      document.getElementById('kiosk-layer-badge').style.display = 'block';
      document.getElementById('kiosk-layer-val').textContent = s.layer_num;
      document.getElementById('kiosk-layer-total').textContent = s.total_layer_num || '?';
    } else {
      document.getElementById('kiosk-layer-badge').style.display = 'none';
    }
    
    // ETA
    if (s.mc_remaining_time > 0) {
      document.getElementById('kiosk-eta-badge').style.display = 'block';
      const eta = new Date(Date.now() + s.mc_remaining_time * 60000);
      document.getElementById('kiosk-eta-val').textContent = eta.getHours().toString().padStart(2,'0') + ':' + eta.getMinutes().toString().padStart(2,'0');
    } else {
      document.getElementById('kiosk-eta-badge').style.display = 'none';
    }
    
    // Controls
    document.getElementById('btn-kiosk-pause').style.display = s.gcode_state === 'RUNNING' ? 'block' : 'none';
    document.getElementById('btn-kiosk-resume').style.display = s.gcode_state === 'PAUSE' ? 'block' : 'none';
    document.getElementById('btn-kiosk-stop').style.display = isPrinting ? 'block' : 'none';
  }
});
</script>
