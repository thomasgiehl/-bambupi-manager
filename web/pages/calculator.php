<?php
$filaments = api('/api/filaments') ?? [];
$settings  = api('/api/settings')  ?? [];
?>

<div style="margin-bottom:20px;"></div>

<div class="grid2">
  <!-- Eingaben -->
  <div class="card">
    <div class="card-title">Material & Zeit</div>

    <div class="form-group">
      <label>Filament</label>
      <select id="calc-filament" onchange="calculate()">
        <option value="">— ohne Filament —</option>
        <?php foreach ($filaments as $f): ?>
        <option value="<?= (int)$f['id'] ?>">
          <?= htmlspecialchars($f['brand'] . ' ' . $f['color'] . ' (' . $f['material'] . ')') ?>
          <?= $f['price_per_kg'] ? ' · ' . number_format($f['price_per_kg'], 2) . ' €/kg' : '' ?>
        </option>
        <?php endforeach; ?>
      </select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Gramm verbraucht</label>
        <input type="number" id="calc-grams" placeholder="45" oninput="calculate()">
      </div>
      <div class="form-group">
        <label>Purge / Abfall (g)</label>
        <input type="number" id="calc-purge" placeholder="0" oninput="calculate()">
      </div>
    </div>

    <div class="form-group">
      <label>Druckzeit (Minuten)</label>
      <input type="number" id="calc-duration" placeholder="180" oninput="calculate()">
    </div>

    <div class="card-title" style="margin-top:14px;">Fehldruck-Puffer</div>
    <div class="form-group" style="margin-bottom:4px;">
      <label>Reserve: <span id="calc-failure-val" style="color:var(--accent);font-family:var(--mono);">10%</span></label>
      <input type="range" min="0" max="30" value="10" id="calc-failure"
        oninput="document.getElementById('calc-failure-val').textContent=this.value+'%';calculate()">
    </div>
    <div style="font-size:10px;color:var(--text3);margin-bottom:12px;">
      Materialkosten werden auf mögliche Fehldrucke verteilt
    </div>

    <div class="card-title">Nachbearbeitung (optional)</div>
    <div class="form-row">
      <div class="form-group">
        <label>Zeit (Minuten)</label>
        <input type="number" id="calc-post" placeholder="0" oninput="calculate()">
      </div>
      <div class="form-group">
        <label>Stundensatz (€)</label>
        <input type="number" id="calc-rate" placeholder="15" oninput="calculate()">
      </div>
    </div>

    <div class="card-title">Verkaufspreis (optional)</div>
    <div class="form-group" style="margin-bottom:4px;">
      <label>Gewinnmarge: <span id="calc-margin-val" style="color:var(--accent);font-family:var(--mono);">0%</span></label>
      <input type="range" min="0" max="200" value="0" id="calc-margin"
        oninput="document.getElementById('calc-margin-val').textContent=this.value+'%';calculate()">
    </div>
  </div>

  <!-- Ergebnis -->
  <div>
    <div class="cost-result" id="calc-result" style="display:none;">
      <div class="card-title">Kostenübersicht</div>
      <div class="cost-row"><span class="lbl">🧵 Filament</span>    <span id="r-filament">—</span></div>
      <div class="cost-row"><span class="lbl">⚡ Strom</span>       <span id="r-electricity">—</span></div>
      <div class="cost-row"><span class="lbl">🖨️ Maschine</span>    <span id="r-machine">—</span></div>
      <div class="cost-row" id="r-failure-row"><span class="lbl">⚠️ Fehldruck-Puffer</span><span id="r-failure">—</span></div>
      <div class="cost-row" id="r-post-row">   <span class="lbl">🔧 Nachbearbeitung</span>  <span id="r-post">—</span></div>
      <div style="border-top:1px solid var(--border2);margin:8px 0;"></div>
      <div class="cost-row" style="font-size:16px;font-weight:700;">
        <span class="lbl">💰 Gesamt</span>
        <span id="r-total" style="color:var(--accent);">—</span>
      </div>
      <div class="cost-row" id="r-sell-row" style="display:none;">
        <span class="lbl" style="color:var(--green);">🏷️ Verkaufspreis</span>
        <span id="r-sell" style="color:var(--green);font-weight:700;">—</span>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-title">Einstellungen (aktuell)</div>
      <div class="stat-row"><span class="stat-label">Strompreis</span><span class="mono"><?= htmlspecialchars($settings['electricity_cost'] ?? '0.35') ?> €/kWh</span></div>
      <div class="stat-row"><span class="stat-label">Druckerverbrauch</span><span class="mono"><?= htmlspecialchars($settings['printer_watt'] ?? '350') ?> W</span></div>
      <div class="stat-row"><span class="stat-label">Kaufpreis Drucker</span><span class="mono"><?= htmlspecialchars($settings['machine_price'] ?? '700') ?> €</span></div>
      <div class="stat-row"><span class="stat-label">Lebensdauer</span><span class="mono"><?= htmlspecialchars($settings['machine_hours'] ?? '5000') ?> h</span></div>
      <a href="/?page=settings" class="btn btn-secondary btn-sm" style="margin-top:10px;display:inline-flex;">⚙️ Anpassen</a>
    </div>
  </div>
</div>
