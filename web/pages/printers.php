<?php $printers = api('/api/printers') ?? []; ?>

<div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
  <button class="btn btn-primary" onclick="resetPrinterModal(); openModal('modal-add-printer')">+ Hinzufügen</button>
</div>

<?php if (empty($printers)): ?>
<div class="card" style="text-align:center;padding:40px;color:var(--text3);">
  <div style="font-size:40px;margin-bottom:12px;">🖨️</div>
  <p>Noch kein Drucker konfiguriert.</p>
  <button class="btn btn-primary" onclick="resetPrinterModal(); openModal('modal-add-printer')" style="margin-top:14px;">+ Drucker hinzufügen</button>
</div>
<?php else: ?>
<?php foreach ($printers as $p):
  $s     = $p['status'] ?? [];
  $state = $s['gcode_state'] ?? 'offline';
?>
<div class="card">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="font-size:32px;">🖨️</div>
      <div>
        <div style="font-size:15px;font-weight:600;"><?= htmlspecialchars($p['name']) ?></div>
        <div style="font-size:12px;color:var(--text3);font-family:var(--mono);margin-top:2px;">
          <?= htmlspecialchars($p['model']) ?> · <?= htmlspecialchars($p['ip']) ?>
        </div>
        <?php
          $stateLabel = ['RUNNING'=>'🟢 Druckt','FINISH'=>'✅ Fertig','FAILED'=>'❌ Fehlgeschlagen','PAUSE'=>'⏸ Pausiert','offline'=>'⚫ Offline'];
        ?>
        <div style="font-size:11px;margin-top:4px;">
          <?= $stateLabel[$state] ?? '⚪ ' . htmlspecialchars($state) ?>
          <?php if ($state === 'RUNNING' && isset($s['subtask_name'])): ?>
          — <span style="color:var(--text2);"><?= htmlspecialchars($s['subtask_name']) ?></span>
          <?php endif; ?>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary btn-sm" onclick="editPrinter(<?= htmlspecialchars(json_encode($p)) ?>)">⚙️ Bearbeiten</button>
      <button class="btn btn-danger btn-sm" onclick="deletePrinter(<?= (int)$p['id'] ?>)">🗑 Löschen</button>
    </div>
  </div>

  <?php if ($state === 'RUNNING'): ?>
  <div style="margin-top:12px;">
    <div class="progress-wrap">
      <div class="progress-bar" style="width:<?= (int)($s['mc_percent'] ?? 0) ?>%"></div>
    </div>
    <div class="progress-label">
      <?= (int)($s['mc_percent'] ?? 0) ?>%
      <?= isset($s['mc_remaining_time']) ? ' · ⏱ ' . (int)$s['mc_remaining_time'] . ' Min verbleibend' : '' ?>
    </div>
  </div>
  <?php endif; ?>

  <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
    <div style="font-size:12px;color:var(--text3);">
      🌡️ Nozzle: <span style="color:var(--text1);font-family:var(--mono);"><?= number_format((float)($s['nozzle_temper'] ?? 0), 1) ?>°C</span>
    </div>
    <div style="font-size:12px;color:var(--text3);">
      🛏️ Bett: <span style="color:var(--text1);font-family:var(--mono);"><?= number_format((float)($s['bed_temper'] ?? 0), 1) ?>°C</span>
    </div>
    <div style="font-size:12px;color:var(--text3);">
      📅 Hinzugefügt: <span style="color:var(--text2);"><?= htmlspecialchars(substr($p['added_at'] ?? '', 0, 10)) ?></span>
    </div>
  </div>
</div>
<?php endforeach; ?>
<?php endif; ?>
