<?php $history = api('/api/history') ?? []; ?>

<div class="page-header">
  <h1>Druckhistorie</h1>
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
