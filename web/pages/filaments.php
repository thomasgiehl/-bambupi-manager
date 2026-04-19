<?php
$filaments = api('/api/filaments') ?? [];
?>

<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:20px;">
  <button class="btn btn-secondary" onclick="openFilamentSearch()">📥 Bambu Studio</button>
  <button class="btn btn-primary"   onclick="openAddFilament()">+ Manuell</button>
</div>

<?php if (empty($filaments)): ?>
<div class="card" style="text-align:center;padding:40px;color:var(--text3);">
  <div style="font-size:40px;margin-bottom:12px;">🧵</div>
  <p>Noch kein Filament angelegt.</p>
  <p style="margin-top:8px;font-size:12px;">Klicke auf <strong>+ Manuell</strong> oder importiere aus der Bambu Studio Datenbank.</p>
</div>
<?php else: ?>
<div class="fil-grid" id="filament-grid">
<?php foreach ($filaments as $f):
  $used  = (float)($f['weight_used'] ?? 0);
  $total = (float)($f['weight_total'] ?? 1000);
  $rem   = max(0, $total - $used);
  $pct   = $total > 0 ? round(($rem / $total) * 100) : 0;
  $barColor = $pct > 50 ? 'var(--green)' : ($pct > 20 ? 'var(--orange)' : 'var(--red)');
  $fj = htmlspecialchars(json_encode($f), ENT_QUOTES);
?>
  <div class="fil-card">
    <div class="fil-header">
      <div class="fil-dot" style="background:<?= htmlspecialchars($f['color_hex'] ?? '#888') ?>;"></div>
      <div>
        <div class="fil-name"><?= htmlspecialchars($f['brand'] ?? '') ?> <?= htmlspecialchars($f['color'] ?? '') ?></div>
        <div class="fil-sub"><?= htmlspecialchars($f['material'] ?? '') ?><?= $f['temp_nozzle'] ? ' · ' . (int)$f['temp_nozzle'] . '°C' : '' ?></div>
      </div>
    </div>

    <div class="fil-bar">
      <div class="fil-bar-fill" style="width:<?= $pct ?>%;background:<?= $barColor ?>;"></div>
    </div>
    <div class="fil-stats">
      <span><?= $pct ?>% verbleibend</span>
      <span><?= round($rem) ?>g / <?= (int)$total ?>g</span>
    </div>

    <?php if ($f['price_per_kg']): ?>
    <div style="font-size:10px;color:var(--text3);margin-top:5px;font-family:var(--mono);">
      💰 <?= number_format((float)$f['price_per_kg'], 2) ?> €/kg
      <?= $f['temp_bed'] ? ' · 🛏️ ' . (int)$f['temp_bed'] . '°C' : '' ?>
    </div>
    <?php endif; ?>

    <?php if ($f['temp_dry']): ?>
    <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:var(--mono);">
      🔥 Trocknen: <?= (int)$f['temp_dry'] ?>°C<?= $f['time_dry'] ? ' · ' . (int)$f['time_dry'] . 'h' : '' ?>
    </div>
    <?php endif; ?>

    <?php if ($f['pa'] || $f['ka']): ?>
    <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:var(--mono);">
      <?= $f['pa'] ? 'PA: ' . $f['pa'] : '' ?>
      <?= $f['ka'] ? ' · K: ' . $f['ka'] : '' ?>
    </div>
    <?php endif; ?>

    <?php if ($f['location']): ?>
    <div style="font-size:10px;color:var(--text3);margin-top:2px;">📍 <?= htmlspecialchars($f['location']) ?></div>
    <?php endif; ?>

    <div class="fil-actions">
      <button class="btn btn-secondary btn-sm" onclick='openEditFilament(<?= $fj ?>)'>✏️ Bearbeiten</button>
      <button class="btn btn-danger btn-sm"    onclick="deleteFilament(<?= (int)$f['id'] ?>)">🗑 Löschen</button>
    </div>
  </div>
<?php endforeach; ?>
</div>
<?php endif; ?>

<script>
async function loadFilaments() {
  const filaments = await api('/api/filaments');
  location.reload(); // simple reload to re-render PHP view
}
</script>
