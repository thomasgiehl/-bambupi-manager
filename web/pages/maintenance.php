<?php
$printers = api('/api/printers') ?? [];
?>

<div style="margin-bottom:20px;"></div>

<?php if (empty($printers)): ?>
<div class="card" style="text-align:center;padding:40px;color:var(--text3);">
  <p>Keine Drucker gefunden.</p>
</div>
<?php endif; ?>

<?php foreach ($printers as $p): 
    $pid = (int)$p['id'];
    $printMinutes = (float)($p['total_print_minutes'] ?? 0);
    $printHours = round($printMinutes / 60, 1);
    $tasks = api("/api/printers/$pid/maintenance") ?? [];
    
    // Icons zuordnen
    $icons = [
      'Carbon-Stangen reinigen' => '🧼',
      'Achsen schmieren (X/Y)'  => '🧴',
      'Z-Spindeln fetten'       => '🔩',
      'Hotend-Lüfter prüfen'    => '🌬️'
    ];
?>
<div class="card">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
    <div class="card-title" style="margin:0;">🛠️ Wartung: <?= htmlspecialchars($p['name']) ?></div>
    <div style="font-size:12px; color:var(--text3); font-family:var(--mono); background:var(--bg3); padding:4px 10px; border-radius:15px;">Gesamtlaufzeit: <?= $printHours ?>h</div>
  </div>

  <div class="maintenance-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">
    
    <?php
    foreach ($tasks as $task):
      $name = $task['name'];
      $threshold = (float)$task['threshold_hours'];
      $lastReset = (float)$task['last_reset_hours'];
      $icon = $icons[$name] ?? '🛠️';
      
      $currentDiff = max(0, $printHours - $lastReset);
      $pct = min(100, ($currentDiff / $threshold) * 100);
      $isDue = $pct > 90;
    ?>
    <div style="background:var(--bg3); padding:15px; border-radius:10px; border:1px solid <?= $isDue ? 'var(--orange)' : 'var(--border)' ?>; transition: transform 0.1s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div style="font-size:20px;"><?= $icon ?></div>
        <button class="btn btn-secondary btn-sm" onclick="resetMaintenance(<?= $pid ?>, '<?= addslashes($name) ?>')">Erledigt</button>
      </div>
      <div style="font-weight:600; margin-bottom:4px;"><?= htmlspecialchars($name) ?></div>
      <div style="font-size:11px; color:var(--text3); margin-bottom:8px;">Intervall: <?= $threshold ?>h</div>
      <div class="pbar" style="height:6px; background:var(--bg4);"><div class="pbar-fill" style="width:<?= $pct ?>%; background:<?= $isDue ? 'var(--orange)' : 'var(--green)' ?>;"></div></div>
      <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text3); margin-top:5px; font-family:var(--mono);">
        <span><?= round($currentDiff, 1) ?>h seit Wartung</span>
        <span><?= $threshold ?>h</span>
      </div>
    </div>
    <?php endforeach; ?>

  </div>
</div>
<?php endforeach; ?>

<script>
async function resetMaintenance(pid, name) {
  if (!confirm('Wartung für "' + name + '" als erledigt markieren?')) return;
  const r = await api('/api/printers/' + pid + '/maintenance/reset', 'POST', { name });
  if (r.ok) {
    toast('✅ Wartung zurückgesetzt');
    setTimeout(() => location.reload(), 1000);
  } else {
    toast('❌ Fehler: ' + (r.error || 'Unbekannt'), 'error');
  }
}
</script>
