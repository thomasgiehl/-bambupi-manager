<?php
$queue = api('/api/queue') ?? [];
$printers = api('/api/printers') ?? [];
$printerNames = [];
foreach($printers as $p) $printerNames[$p['id']] = $p['name'];
?>

<div style="margin-bottom:20px;"></div>

<div class="card">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
    <div class="card-title" style="margin:0;">⏳ Druck-Warteschlange</div>
    <div style="font-size:12px; color:var(--text3);">Jobs werden gestartet, wenn der Drucker IDLE und das Bett frei ist.</div>
  </div>

  <?php if (empty($queue)): ?>
  <div style="text-align:center; padding:40px; color:var(--text3);">
    <div style="font-size:30px; margin-bottom:10px;">📭</div>
    Die Warteschlange ist leer.
  </div>
  <?php else: ?>
  <div class="queue-list" style="display:flex; flex-direction:column; gap:10px;">
    <?php foreach ($queue as $job): 
        $statusClass = '';
        if ($job['status'] === 'printing') $statusClass = 'color:var(--green);';
        if ($job['status'] === 'failed')   $statusClass = 'color:var(--red);';
    ?>
    <div class="file-row" style="background:var(--bg3); padding:15px; border-radius:10px;">
      <div style="flex:1;">
        <div style="font-weight:600;"><?= htmlspecialchars($job['filename']) ?></div>
        <div style="font-size:11px; color:var(--text3); margin-top:4px;">
          Drucker: <?= htmlspecialchars($printerNames[$job['printer_id']] ?? 'Unbekannt') ?> · 
          Hinzugefügt: <?= date('d.m. H:i', strtotime($job['added_at'])) ?>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700; font-size:12px; margin-bottom:8px; text-transform:uppercase; <?= $statusClass ?>">
          <?= $job['status'] === 'pending' ? '⏳ Wartet' : ($job['status'] === 'printing' ? '▶️ Druckt' : $job['status']) ?>
        </div>
        <div class="file-actions">
          <button class="btn btn-danger btn-sm" onclick="deleteQueueJob(<?= $job['id'] ?>)">🗑</button>
        </div>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>

<div class="card" style="margin-top:20px;">
  <div class="card-title">Steuerung</div>
  <p style="font-size:12px; color:var(--text2); margin-bottom:15px;">
    Bambu Lab Drucker erkennen nicht automatisch, ob das Druckbett leer ist. 
    Klicke auf "Bett leer", um den nächsten Job aus der Warteschlange für diesen Drucker freizugeben.
  </p>
  <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
    <?php foreach ($printers as $p): ?>
    <button class="btn btn-secondary" style="justify-content:center; gap:8px;" onclick="clearBed(<?= $p['id'] ?>, '<?= addslashes($p['name']) ?>')">
      🧹 Bett leer (<?= htmlspecialchars($p['name']) ?>)
    </button>
    <?php endforeach; ?>
  </div>
</div>

<script>
async function deleteQueueJob(id) {
  if (!confirm('Job aus Warteschlange entfernen?')) return;
  const r = await api('/api/queue/' + id, 'DELETE');
  if (r.ok) location.reload();
}

async function clearBed(pid, name) {
  const r = await api('/api/printers/' + pid + '/clear-bed', 'POST');
  if (r.ok) {
    toast('✅ Bett für ' + name + ' als leer markiert.');
    setTimeout(() => location.reload(), 1000);
  }
}
</script>
