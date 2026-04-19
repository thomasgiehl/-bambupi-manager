<?php
$stats    = api('/api/stats') ?? [];
$printers = api('/api/printers') ?? [];
$macros   = api('/api/macros') ?? [];

// AMS-Daten für jeden Drucker vorladen
$amsData = [];
foreach ($printers as $p) {
    $amsData[$p['id']] = api('/api/ams/' . $p['id']) ?? null;
}

function tempClass(float $t): string {
    if ($t > 150) return 'hot';
    if ($t > 50)  return 'warm';
    if ($t > 0)   return 'cool';
    return 'off';
}

function badgeHtml(string $state): string {
    if ($state === 'RUNNING') return '<span class="badge badge-printing" id="badge-__ID__"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;margin-right:3px;"></span>DRUCKT</span>';
    if ($state === 'offline') return '<span class="badge badge-offline"  id="badge-__ID__"><span style="width:6px;height:6px;border-radius:50%;background:var(--text3);display:inline-block;margin-right:3px;"></span>OFFLINE</span>';
    return '<span class="badge badge-ready" id="badge-__ID__"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;margin-right:3px;"></span>BEREIT</span>';
}

function renderAms(array $amsData, int $pid): string {
    if (empty($amsData['units'])) {
        return '<div class="ams-panel"><div class="ams-panel-title">AMS Filament</div><div style="font-size:11px;color:var(--text3);">Keine Daten — noch nicht verbunden</div></div>';
    }
    $html = '<div class="ams-panel"><div class="ams-panel-title">AMS Filament <span style="font-size:9px;color:var(--text3);font-weight:400;">Slot anklicken zum Zuweisen</span></div>';
    foreach ($amsData['units'] as $ui => $unit) {
        $meta = [];
        if (isset($unit['temp']) && $unit['temp'] !== null && $unit['temp'] > -30) $meta[] = number_format($unit['temp'], 1) . '°C';
        if (isset($unit['humidity']) && $unit['humidity'] !== null) $meta[] = 'Feuchtigkeit ' . $unit['humidity'] . '/5';
        if (count($amsData['units']) > 1) {
            $html .= '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;font-family:var(--mono);">AMS ' . ($ui+1) . (count($meta) ? ' · ' . implode(' · ', $meta) : '') . '</div>';
        }
        $html .= '<div class="ams-slots">';
        foreach ($unit['trays'] as $si => $tray) {
            $isActive = ($ui === ($amsData['active_unit'] ?? -1)) && ($si === ($amsData['active_slot'] ?? -1));
            $did = "ams-detail-{$pid}-{$ui}-{$si}";
            if (!empty($tray['empty'])) {
                $html .= '<div class="ams-slot empty" onclick="openAmsAssign(' . $pid . ',' . $ui . ',' . $si . ',true)">'
                       . '<div class="ams-dot" style="background:var(--bg4);"></div>'
                       . '<div class="ams-num">S' . ($si+1) . '</div>'
                       . '<div class="ams-type" style="color:var(--accent);font-size:12px;">+</div></div>';
            } else {
                $rw = max(0, (int)($tray['remain'] ?? 0));
                $isManual = ($tray['source'] ?? '') === 'manual';
                $tj = htmlspecialchars(json_encode($tray), ENT_QUOTES);
                $html .= '<div class="ams-slot' . ($isActive ? ' active' : '') . ($isManual ? ' manual' : '') . '" onclick="toggleAmsDetail(\'' . $did . '\',\'' . $tj . '\',' . $pid . ',' . $ui . ',' . $si . ')">'
                       . ($isActive ? '<div class="ams-active-pip"></div>' : '')
                       . ($isManual ? '<div class="ams-mbadge">M</div>' : '')
                       . '<div class="ams-dot" style="background:' . htmlspecialchars($tray['color'] ?? '#333') . ';"></div>'
                       . '<div class="ams-num">S' . ($si+1) . '</div>'
                       . '<div class="ams-type">' . htmlspecialchars($tray['type'] ?? '?') . '</div>'
                       . '<div class="ams-brand">' . htmlspecialchars($tray['brand'] ?? '') . '</div>'
                       . '<div class="ams-rbar"><div class="ams-rfill" style="width:' . $rw . '%;background:' . ($rw > 50 ? 'var(--green)' : ($rw > 20 ? 'var(--orange)' : 'var(--red)')) . ';"></div></div>'
                       . '</div>';
            }
        }
        $html .= '</div>';
        foreach ($unit['trays'] as $si => $tray) {
            if (empty($tray['empty'])) {
                $html .= '<div class="ams-detail" id="ams-detail-' . $pid . '-' . $ui . '-' . $si . '"></div>';
            }
        }
    }
    return $html . '</div>';
}
?>

<!-- Stats -->
<div class="stats-row">
  <div class="stat-card">
    <div class="stat-icon blue">🖨️</div>
    <div>
      <div class="stat-val"><?= (int)($stats['total_prints'] ?? 0) ?></div>
      <div class="stat-lbl">Drucke gesamt</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon green">⚖️</div>
    <div>
      <div class="stat-val"><?= (int)($stats['total_grams'] ?? 0) ?>g</div>
      <div class="stat-lbl">Gramm verdruckt</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon orange">⏱️</div>
    <div>
      <div class="stat-val"><?= number_format($stats['total_hours'] ?? 0, 1) ?>h</div>
      <div class="stat-lbl">Druckstunden</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon purple">💶</div>
    <div>
      <div class="stat-val"><?= number_format($stats['total_cost'] ?? 0, 2) ?>€</div>
      <div class="stat-lbl">Gesamtkosten</div>
    </div>
  </div>
</div>

<!-- Event Log (Moved to top for better visibility) -->
<div class="card" id="event-log-card" style="display:none; margin-bottom: 16px; padding: 12px 16px;">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
    <div class="card-title" style="margin:0; font-size: 14px;">📟 Live Events</div>
    <div style="display:flex; gap: 8px;">
      <button onclick="loadEventLog()" class="btn btn-secondary btn-sm" title="Aktualisieren">↻</button>
      <button onclick="clearEventLog()" class="btn btn-secondary btn-sm">Leeren</button>
    </div>
  </div>
  <div id="event-log-list" style="max-height: 120px; overflow-y: auto; font-family: var(--mono); font-size: 11px;"></div>
</div>

<?php if (empty($printers)): ?>
<div class="card" style="text-align:center;padding:40px;color:var(--text3);">
  <div style="font-size:40px;margin-bottom:12px;">🖨️</div>
  <p>Noch kein Drucker konfiguriert.</p>
  <a href="/?page=printers" class="btn btn-primary" style="margin-top:14px;display:inline-flex;">+ Drucker hinzufügen</a>
</div>
<?php endif; ?>

<?php foreach ($printers as $p):
  $id     = (int)$p['id'];
  $s      = $p['status'] ?? [];
  $state  = $s['gcode_state'] ?? 'offline';
  $nozzle = (float)($s['nozzle_temper'] ?? 0);
  $bed    = (float)($s['bed_temper'] ?? 0);
  $chamber = (float)($s['chamber_temper'] ?? 0);
  $nTarget = (float)($s['nozzle_temper_target'] ?? 0);
  $bTarget = (float)($s['bed_target_temper'] ?? 0);
  $progress  = (int)($s['mc_percent'] ?? 0);
  $remaining = (int)($s['mc_remaining_time'] ?? 0);
  $speedLevel = (int)($s['spd_lvl'] ?? 2);
  $nc = tempClass($nozzle);
  $bc = tempClass($bed);
  $speeds = [1 => 'Stille', 2 => 'Normal', 3 => 'Sport', 4 => 'Turbo'];
  $badge  = str_replace('__ID__', $id, badgeHtml($state));
  $camUrl = 'http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . ':1984/stream.html?src=bambu&mode=webrtc';
?>
<div class="printer-card" id="pcard-<?= $id ?>">
  <div class="pcard-header">
    <div>
      <div class="pcard-name">🖨️ <?= htmlspecialchars($p['name']) ?> <?= $badge ?></div>
      <div class="pcard-meta"><?= htmlspecialchars($p['model']) ?> · <?= htmlspecialchars($p['ip']) ?></div>
    </div>
  </div>

  <div class="pcard-body">

    <!-- COL 1: Kamera + Fortschritt -->
    <div class="pcard-col">
      <div class="camera-wrap">
        <div class="cam-badge"><div class="cam-dot"></div>LIVE</div>
        <button class="cam-snap" onclick="window.open('/api/printers/<?= $id ?>/snapshot')" title="Snapshot speichern">📸</button>
        <iframe src="<?= htmlspecialchars($camUrl) ?>" allowfullscreen></iframe>
      </div>
      <div class="progress-panel" id="pa-<?= $id ?>" style="<?= $state !== 'RUNNING' ? 'display:none' : '' ?>">
        <div class="progress-top">
          <span class="progress-file"><?= htmlspecialchars($s['subtask_name'] ?? 'Druckt...') ?></span>
          <span class="progress-pct" id="pp-<?= $id ?>"><?= $progress ?>%</span>
        </div>
        <div class="pbar"><div class="pbar-fill" id="pf-<?= $id ?>" style="width:<?= $progress ?>%"></div></div>
        <div class="progress-meta">
          <span id="pt-<?= $id ?>">⏱ <?= $remaining ?> Min verbleibend</span>
          <span id="layer-<?= $id ?>">Schicht <?= (int)($s['layer_num'] ?? 0) ?>/<?= (int)($s['total_layer_num'] ?? 0) ?></span>
        </div>
      </div>
      <?php if ($state !== 'RUNNING'): ?>
      <div class="idle-state" id="idle-<?= $id ?>">
        <div class="idle-icon"><?= $state === 'offline' ? '🔌' : '✅' ?></div>
        <?= $state === 'offline' ? 'Drucker offline' : 'Bereit zum Drucken' ?>
      </div>
      <?php endif; ?>
    </div>

    <!-- COL 2: Temperaturen & Vorheizen -->
    <div class="pcard-col">
      <div class="temp-panel">
        <div class="panel-title">Temperaturen</div>

        <div class="temp-card" onclick="openTempModal(<?= $id ?>,'nozzle',<?= (int)$nozzle ?>)">
          <div class="temp-card-label">🌡️ Nozzle <span class="temp-edit">✏️ setzen</span></div>
          <div class="temp-row">
            <div class="temp-actual <?= $nc ?>" id="nv-<?= $id ?>"><?= number_format($nozzle, 1) ?>°</div>
            <div class="temp-target" id="nt-<?= $id ?>">→ <?= (int)$nTarget ?>°C</div>
          </div>
          <div class="temp-bar">
            <div class="temp-bar-fill nozzle" id="nb-<?= $id ?>" style="width:<?= min(100, $nozzle/3) ?>%"></div>
          </div>
        </div>

        <div class="temp-card" onclick="openTempModal(<?= $id ?>,'bed',<?= (int)$bed ?>)">
          <div class="temp-card-label">🛏️ Bett <span class="temp-edit">✏️ setzen</span></div>
          <div class="temp-row">
            <div class="temp-actual <?= $bc ?>" id="bv-<?= $id ?>"><?= number_format($bed, 1) ?>°</div>
            <div class="temp-target" id="bt-<?= $id ?>">→ <?= (int)$bTarget ?>°C</div>
          </div>
          <div class="temp-bar">
            <div class="temp-bar-fill bed" id="bb-<?= $id ?>" style="width:<?= min(100, $bed/1.2) ?>%"></div>
          </div>
        </div>

        <div class="temp-card" style="cursor:default;">
          <div class="temp-card-label">🏠 Bauraum</div>
          <div class="temp-row">
            <div class="temp-actual <?= tempClass($chamber) ?>" id="cv-<?= $id ?>"><?= number_format($chamber, 1) ?>°</div>
            <div class="temp-target" style="opacity:0;">→ 0°C</div>
          </div>
          <div class="temp-bar">
            <div class="temp-bar-fill chamber" id="cb-<?= $id ?>" style="width:<?= min(100, $chamber) ?>%;"></div>
          </div>
        </div>

        <div class="ctrl-section" style="margin-top:10px;">
          <div class="ctrl-section-title">Vorheizen</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;">
            <button class="preheat-btn" onclick="preheat(<?= $id ?>,'PLA')">PLA<span class="preheat-temps">220°/60°</span></button>
            <button class="preheat-btn" onclick="preheat(<?= $id ?>,'PETG')">PETG<span class="preheat-temps">250°/70°</span></button>
            <button class="preheat-btn" onclick="preheat(<?= $id ?>,'ABS')">ABS<span class="preheat-temps">270°/100°</span></button>
            <button class="preheat-btn" onclick="preheat(<?= $id ?>,'TPU')">TPU<span class="preheat-temps">230°/40°</span></button>
          </div>
        </div>

        <div class="ctrl-section" style="margin-top:12px;">
          <div class="ctrl-section-title">Part Cooling</div>
          <div class="fan-row">
            <div class="fan-row-label"><span>💨 Lüfter</span><span id="fan-val-<?= $id ?>">—%</span></div>
            <input type="range" class="fan-slider" min="0" max="100" value="0"
              oninput="document.getElementById('fan-val-<?= $id ?>').textContent=this.value+'%'"
              onchange="setFan(<?= $id ?>,parseInt(this.value),'part')">
          </div>
        </div>
      </div>
    </div>

    <!-- COL 3: Steuerung -->
    <div class="pcard-col">
      <div class="ctrl-panel">

        <div class="ctrl-section">
          <div class="ctrl-section-title">Druck</div>
          <div class="print-btns">
            <button class="pbtn pbtn-pause" id="btn-pause-<?= $id ?>"
              onclick="printerCmd(<?= $id ?>,'pause')"
              <?= $state !== 'RUNNING' ? 'style="display:none"' : '' ?>>
              <span class="pbtn-icon">⏸</span><span class="pbtn-label">Pause</span>
            </button>
            <button class="pbtn pbtn-resume" id="btn-resume-<?= $id ?>"
              onclick="printerCmd(<?= $id ?>,'resume')"
              <?= $state === 'RUNNING' ? 'style="display:none"' : '' ?>>
              <span class="pbtn-icon">▶️</span><span class="pbtn-label">Fortsetzen</span>
            </button>
            <button class="pbtn pbtn-stop" onclick="printerCmd(<?= $id ?>,'stop')">
              <span class="pbtn-icon">⏹</span><span class="pbtn-label">Stopp</span>
            </button>
            <button class="pbtn pbtn-light" onclick="setLight(<?= $id ?>,true)">
              <span class="pbtn-icon">💡</span><span class="pbtn-label">Licht an</span>
            </button>
            <button class="pbtn pbtn-light" onclick="setLight(<?= $id ?>,false)">
              <span class="pbtn-icon">🌑</span><span class="pbtn-label">Licht aus</span>
            </button>
            <button class="pbtn pbtn-repeat" onclick="repeatPrint(<?= $id ?>)" <?= $state === 'RUNNING' ? 'style="display:none"' : '' ?> id="btn-repeat-<?= $id ?>">
              <span class="pbtn-icon">🔄</span><span class="pbtn-label">Wiederholen</span>
            </button>
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">Geschwindigkeit</div>
          <div class="speed-btns">
            <?php foreach ($speeds as $lvl => $lbl): ?>
            <button class="sbtn<?= $speedLevel === $lvl ? ' active' : '' ?>"
              id="spd-<?= $id ?>-<?= $lvl ?>"
              onclick="setSpeed(<?= $id ?>,<?= $lvl ?>)"><?= $lbl ?></button>
            <?php endforeach; ?>
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">Flow Rate</div>
          <div class="fan-row">
            <div class="fan-row-label"><span>💧 Extrusion</span><span id="flow-val-<?= $id ?>">100%</span></div>
            <input type="range" class="fan-slider" min="50" max="150" value="100"
              oninput="document.getElementById('flow-val-<?= $id ?>').textContent=this.value+'%'"
              onchange="setFlowRate(<?= $id ?>,parseInt(this.value))">
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">Druckkopf & Achsen</div>
          
          <div class="jog-steps">
            <button class="step-btn" onclick="setJogStep(this, 0.1)">0.1</button>
            <button class="step-btn" onclick="setJogStep(this, 1)">1</button>
            <button class="step-btn active" onclick="setJogStep(this, 10)">10</button>
            <button class="step-btn" onclick="setJogStep(this, 50)">50</button>
          </div>

          <div style="display: flex; align-items: center; gap: 15px; justify-content: center; margin-top: 10px;">
            <div class="jog-grid">
              <div></div>
              <button class="jog-btn" onclick="moveAxis(<?= $id ?>, 'Y', currentStep)" title="Y+">▲</button>
              <div></div>
              
              <button class="jog-btn" onclick="moveAxis(<?= $id ?>, 'X', -currentStep)" title="X-">◀</button>
              <button class="jog-btn" onclick="homeAxes(<?= $id ?>, 'all')" title="Home All">🏠</button>
              <button class="jog-btn" onclick="moveAxis(<?= $id ?>, 'X', currentStep)" title="X+">▶</button>
              
              <div></div>
              <button class="jog-btn" onclick="moveAxis(<?= $id ?>, 'Y', -currentStep)" title="Y-">▼</button>
              <div></div>
            </div>

            <div class="z-controls">
              <button class="z-btn" onclick="moveAxis(<?= $id ?>, 'Z', -currentStep)" title="Z Up">
                <span>▲</span>
                <span class="z-btn-label">Z</span>
              </button>
              <button class="z-btn" onclick="moveAxis(<?= $id ?>, 'Z', currentStep)" title="Z Down">
                <span>▼</span>
                <span class="z-btn-label">Z</span>
              </button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px;">
            <button class="hbtn" onclick="motorsOff(<?= $id ?>)">Motoren aus</button>
            <button class="hbtn" onclick="homeAxes(<?= $id ?>, 'z')">Z-Home</button>
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">Filament</div>
          <div class="print-btns">
            <button class="pbtn pbtn-load"   onclick="filamentLoad(<?= $id ?>)"><span class="pbtn-icon">⬇️</span><span class="pbtn-label">Einziehen</span></button>
            <button class="pbtn pbtn-unload" onclick="filamentUnload(<?= $id ?>)"><span class="pbtn-icon">⬆️</span><span class="pbtn-label">Auswerfen</span></button>
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">Cooldown</div>
          <div class="print-btns">
            <button class="pbtn pbtn-cooldown" onclick="cooldown(<?= $id ?>,'nozzle')"><span class="pbtn-icon">❄️</span><span class="pbtn-label">Nozzle</span></button>
            <button class="pbtn pbtn-cooldown" onclick="cooldown(<?= $id ?>,'bed')"><span class="pbtn-icon">🧊</span><span class="pbtn-label">Bett</span></button>
          </div>
          <button class="pbtn pbtn-cooldown btn-wide" style="flex-direction:row;gap:8px;margin-top:6px;" onclick="cooldown(<?= $id ?>,'all')">
            <span class="pbtn-icon" style="font-size:13px;">❄️</span>
            <span class="pbtn-label" style="font-size:10px;">Alles kühlen</span>
          </button>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">Makros</div>
          <div class="macro-btns">
            <?php 
            $pMacros = array_filter($macros, function($m) use ($id) { return $m['printer_id'] == $id || $m['printer_id'] === null; });
            foreach ($pMacros as $m): ?>
              <button class="mbtn" onclick="runMacro(<?= $m['id'] ?>, <?= $id ?>)" title="<?= htmlspecialchars($m['gcode']) ?>">
                <span class="mbtn-icon"><?= htmlspecialchars($m['icon'] ?: '⚡') ?></span>
                <span class="mbtn-label"><?= htmlspecialchars($m['name']) ?></span>
              </button>
            <?php endforeach; ?>
            <button class="mbtn add-macro" onclick="location.href='/?page=settings'">
              <span class="mbtn-icon">+</span>
              <span class="mbtn-label">Neu</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  </div><!-- /.pcard-body -->

  <!-- AMS -->
  <?= renderAms($amsData[$id] ?? [], $id) ?>

  <!-- Temperaturverlauf -->
  <div class="temp-chart-wrap">
    <div class="temp-chart-title">🌡️ Temperaturverlauf <span style="font-size:9px;color:var(--text3);font-weight:400;">letzte 10 Min</span></div>
    <div style="height:90px;"><canvas id="temp-chart-<?= $id ?>"></canvas></div>
  </div>

</div><!-- /.printer-card -->
<?php endforeach; ?>

<script>
// Printer-IDs für JavaScript bereitstellen
window.PRINTER_IDS = <?= json_encode(array_column($printers, 'id')) ?>;
window.CAMERA_URL  = '<?= addslashes($camUrl ?? '') ?>';

// Charts nach Seitenlade initialisieren
document.addEventListener('DOMContentLoaded', () => {
  window.PRINTER_IDS.forEach(pid => {
    initTempChart(pid);
  });
  // Event-Log laden
  loadEventLog();
  // SSE starten
  startSSE();
});
</script>
