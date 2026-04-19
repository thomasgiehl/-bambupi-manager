<?php
// $p und $status müssen aus dem aufrufenden Scope kommen
$pct   = (int)($status['mc_percent']       ?? 0);
$layer = (int)($status['layer_num']        ?? 0);
$total = (int)($status['total_layer_num']  ?? 0);
$eta   = $status['mc_remaining_time']      ?? null;
$temp  = $status['nozzle_temper']          ?? '--';
$bed   = $status['bed_temper']             ?? '--';
$file  = htmlspecialchars($status['subtask_name'] ?? '—');
?>

<div class="stat-row">
  <span class="stat-label">Datei</span>
  <span class="stat-val"><?= $file ?></span>
</div>

<div class="progress-wrap">
  <div class="progress-bar" style="width:<?= $pct ?>%"></div>
</div>
<div class="progress-label"><?= $pct ?>% · Layer <?= $layer ?>/<?= $total ?></div>

<?php if ($eta): ?>
<div class="stat-row">
  <span class="stat-label">Verbleibend</span>
  <span class="stat-val"><?= round($eta/60, 1) ?> h</span>
</div>
<?php endif; ?>

<div class="stat-row">
  <span class="stat-label">Düse</span>
  <span class="stat-val"><?= $temp ?>°C</span>
</div>
<div class="stat-row">
  <span class="stat-label">Bett</span>
  <span class="stat-val"><?= $bed ?>°C</span>
</div>
