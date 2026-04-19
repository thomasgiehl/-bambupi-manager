<?php $history = api('/api/history') ?? []; ?>

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px; margin-bottom:20px;">
  <div class="card" style="text-align:center; padding:15px;">
    <div style="font-size:11px; color:var(--text3); text-transform:uppercase;">Drucke gesamt</div>
    <div id="stat-total-prints" style="font-size:24px; font-weight:700; color:var(--accent);">—</div>
  </div>
  <div class="card" style="text-align:center; padding:15px;">
    <div style="font-size:11px; color:var(--text3); text-transform:uppercase;">Materialverbrauch</div>
    <div id="stat-total-grams" style="font-size:24px; font-weight:700; color:var(--green);">—</div>
  </div>
  <div class="card" style="text-align:center; padding:15px;">
    <div style="font-size:11px; color:var(--text3); text-transform:uppercase;">Druckzeit gesamt</div>
    <div id="stat-total-hours" style="font-size:24px; font-weight:700; color:var(--orange);">—</div>
  </div>
</div>

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:20px; margin-bottom:20px;">
  <div class="card">
    <div class="card-title" style="font-size:14px;">Auslastung nach Drucker</div>
    <div style="height:200px;"><canvas id="chart-printer-usage"></canvas></div>
  </div>
  <div class="card">
    <div class="card-title" style="font-size:14px;">Materialverbrauch nach Typ</div>
    <div style="height:200px;"><canvas id="chart-material-usage"></canvas></div>
  </div>
</div>

<div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
  <button class="btn btn-secondary" onclick="exportCSV()">📥 CSV Export</button>
</div>

<div class="card" style="overflow-x:auto;">
  <?php if (empty($history)): ?>
  <p style="color:var(--text3);text-align:center;padding:30px;">Noch kein Druckverlauf vorhanden.</p>
  <?php else: ?>
  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Datei</th>
        <th>Drucker</th>
        <th>Filament</th>
        <th>Gramm</th>
        <th>Dauer</th>
        <th>Kosten</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($history as $h):
        $date = substr($h['finished_at'] ?? $h['started_at'] ?? '', 0, 16);
        $grams = number_format((float)($h['grams_used'] ?? 0), 1);
        $dur   = (int)($h['duration_min'] ?? 0);
        $cost  = (float)($h['total_cost'] ?? 0);
        $filHex = $h['color_hex'] ?? '#888888';
      ?>
      <tr>
        <td class="mono" style="white-space:nowrap;"><?= htmlspecialchars($date) ?></td>
        <td><?= htmlspecialchars($h['filename'] ?? '—') ?></td>
        <td style="color:var(--text3);"><?= htmlspecialchars($h['printer_name'] ?? '—') ?></td>
        <td>
          <?php if ($h['brand']): ?>
          <span style="display:inline-flex;align-items:center;gap:5px;">
            <span style="width:10px;height:10px;border-radius:50%;background:<?= htmlspecialchars($filHex) ?>;display:inline-block;flex-shrink:0;"></span>
            <?= htmlspecialchars($h['brand'] . ' ' . ($h['material'] ?? '')) ?>
          </span>
          <?php else: ?>
          <span style="color:var(--text3);">—</span>
          <?php endif; ?>
        </td>
        <td class="mono"><?= $grams ?>g</td>
        <td class="mono"><?= $dur >= 60 ? floor($dur/60).'h '.($dur%60).'m' : $dur.'m' ?></td>
        <td class="mono"><?= $cost > 0 ? number_format($cost, 2) . ' €' : '—' ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <div style="font-size:11px;color:var(--text3);margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
    <?= count($history) ?> Einträge · max. 100 angezeigt
  </div>
  <?php endif; ?>
</div>

<script>
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const s = await api('/api/history/stats');
    document.getElementById('stat-total-prints').textContent = s.total_prints;
    document.getElementById('stat-total-grams').textContent = (s.total_grams / 1000).toFixed(1) + ' kg';
    document.getElementById('stat-total-hours').textContent = s.total_hours + ' h';

    // Printer Chart
    if (s.by_printer.length) {
      new Chart(document.getElementById('chart-printer-usage'), {
        type: 'doughnut',
        data: {
          labels: s.by_printer.map(p => p.name),
          datasets: [{
            data: s.by_printer.map(p => p.count),
            backgroundColor: ['#29b6f6', '#66bb6a', '#ffa726', '#ef5350', '#ab47bc'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#fff', font: { size: 10 } } } }
        }
      });
    }

    // Material Chart
    if (s.by_material.length) {
      new Chart(document.getElementById('chart-material-usage'), {
        type: 'bar',
        data: {
          labels: s.by_material.map(m => m.material),
          datasets: [{
            label: 'Gramm',
            data: s.by_material.map(m => m.grams),
            backgroundColor: '#66bb6a',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { 
            x: { ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: '#222' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  } catch(e) {}
});
</script>
