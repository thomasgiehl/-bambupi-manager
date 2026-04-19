<?php 
$stats = api('/api/history/stats') ?? [];
$analytics = api('/api/analytics') ?? [];
?>

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px; margin-bottom:20px;">
  <div class="card" style="text-align:center; padding:15px;">
    <div style="font-size:11px; color:var(--text3); text-transform:uppercase;">Drucke gesamt</div>
    <div style="font-size:24px; font-weight:700; color:var(--accent);"><?= $stats['total_prints'] ?? 0 ?></div>
  </div>
  <div class="card" style="text-align:center; padding:15px;">
    <div style="font-size:11px; color:var(--text3); text-transform:uppercase;">Materialverbrauch</div>
    <div style="font-size:24px; font-weight:700; color:var(--green);"><?= number_format(($stats['total_grams'] ?? 0)/1000, 1) ?> kg</div>
  </div>
  <div class="card" style="text-align:center; padding:15px;">
    <div style="font-size:11px; color:var(--text3); text-transform:uppercase;">Druckzeit gesamt</div>
    <div style="font-size:24px; font-weight:700; color:var(--orange);"><?= $stats['total_hours'] ?? 0 ?> h</div>
  </div>
</div>

<div class="card" style="margin-bottom:20px;">
  <div class="card-title">Aktivität (Letzte 30 Tage)</div>
  <div style="height:250px;"><canvas id="chart-daily-activity"></canvas></div>
</div>

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap:20px; margin-bottom:20px;">
  <div class="card">
    <div class="card-title">Materialverteilung (Gramm)</div>
    <div style="height:250px;"><canvas id="chart-material-dist"></canvas></div>
  </div>
  <div class="card">
    <div class="card-title">Drucker-Auslastung (Minuten)</div>
    <div style="height:250px;"><canvas id="chart-printer-dist"></canvas></div>
  </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const data = <?= json_encode($analytics) ?>;
  
  // Daily Activity
  new Chart(document.getElementById('chart-daily-activity'), {
    type: 'line',
    data: {
      labels: data.dailyVolume.map(d => d.date),
      datasets: [{
        label: 'Gramm',
        data: data.dailyVolume.map(d => d.grams),
        borderColor: '#29b6f6',
        backgroundColor: 'rgba(41,182,246,0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // Material Dist
  new Chart(document.getElementById('chart-material-dist'), {
    type: 'doughnut',
    data: {
      labels: data.materialStats.map(m => m.material),
      datasets: [{
        data: data.materialStats.map(m => m.grams),
        backgroundColor: ['#29b6f6', '#66bb6a', '#ffa726', '#ef5350', '#ab47bc'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#888', font: { size: 10 } } } }
    }
  });

  // Printer Dist
  new Chart(document.getElementById('chart-printer-dist'), {
    type: 'bar',
    data: {
      labels: data.printerStats.map(p => p.name),
      datasets: [{
        label: 'Minuten',
        data: data.printerStats.map(p => p.minutes),
        backgroundColor: '#ffa726',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: { legend: { display: false } }
    }
  });
});
</script>
