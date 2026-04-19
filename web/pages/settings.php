<?php
$msg = '';
$msgType = 'success';

$settings = api('/api/settings') ?? [];
$version  = api('/api/version')  ?? [];
$printers = api('/api/printers') ?? [];
$macros   = api('/api/macros') ?? [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {

    if ($_POST['action'] === 'save_settings') {
        api('/api/settings', 'POST', [
            'electricity_cost' => (float)($_POST['electricity_cost'] ?? 0.35),
            'printer_watt'     => (int)  ($_POST['printer_watt']     ?? 350),
            'machine_price'    => (float)($_POST['machine_price']    ?? 700),
            'machine_hours'    => (float)($_POST['machine_hours']    ?? 5000),
            'failure_rate'     => (float)($_POST['failure_rate']     ?? 10),
            'telegram_token'   => $_POST['telegram_token']   ?? '',
            'telegram_chat_id' => $_POST['telegram_chat_id'] ?? '',
            'discord_webhook'  => $_POST['discord_webhook']  ?? '',
            'notify_on_finish' => isset($_POST['notify_on_finish']) ? '1' : '0',
            'notify_on_fail'   => isset($_POST['notify_on_fail'])   ? '1' : '0',
            'notify_on_pause'  => isset($_POST['notify_on_pause'])  ? '1' : '0',
            'spaghetti_detect' => isset($_POST['spaghetti_detect']) ? '1' : '0',
        ]);
        $msg = '✅ Einstellungen gespeichert.';
        $settings = api('/api/settings') ?? []; // Refresh
    }

    if ($_POST['action'] === 'add_macro') {
        api('/api/macros', 'POST', [
            'name'       => $_POST['m_name']   ?? '',
            'icon'       => $_POST['m_icon']   ?? '⚡',
            'gcode'      => $_POST['m_gcode']  ?? '',
            'printer_id' => $_POST['m_printer'] ? (int)$_POST['m_printer'] : null
        ]);
        $msg = '✅ Makro hinzugefügt.';
        $macros = api('/api/macros') ?? []; // Refresh
    }

    if ($_POST['action'] === 'delete_macro') {
        api('/api/macros/' . (int)$_POST['macro_id'], 'DELETE');
        $msg = '✅ Makro gelöscht.';
        $macros = api('/api/macros') ?? []; // Refresh
    }

    if ($_POST['action'] === 'change_password') {
        $r = api('/api/auth/change-password', 'POST', [
            'currentPass' => $_POST['current_pass'] ?? '',
            'newPass'     => $_POST['new_pass']     ?? '',
        ]);
        if ($r['ok'] ?? false) {
            $msg = '✅ Passwort geändert. Bitte neu anmelden.';
        } else {
            $msg = '❌ ' . htmlspecialchars($r['error'] ?? 'Unbekannter Fehler');
            $msgType = 'error';
        }
    }
}

$settings = api('/api/settings') ?? [];
$version  = api('/api/version')  ?? [];
?>

<div style="margin-bottom:20px;"></div>

<?php if ($msg): ?>
<div class="alert <?= $msgType ?>"><?= $msg ?></div>
<?php endif; ?>

<!-- Strom & Kosten -->
<div class="card" style="max-width:500px;">
  <div class="card-title">Strom & Maschinenkosten</div>
  <form method="post">
    <input type="hidden" name="action" value="save_settings">
    <div class="form-row">
      <div class="form-group">
        <label>Strompreis (€/kWh)</label>
        <input type="number" name="electricity_cost" step="0.001"
               value="<?= htmlspecialchars($settings['electricity_cost'] ?? '0.35') ?>">
      </div>
      <div class="form-group">
        <label>Verbrauch (Watt)</label>
        <input type="number" name="printer_watt"
               value="<?= htmlspecialchars($settings['printer_watt'] ?? '350') ?>">
      </div>
    </div>
    <div class="card-title" style="margin-top:12px;">Maschinenkosten (Abschreibung)</div>
    <div class="form-row">
      <div class="form-group">
        <label>Kaufpreis (€)</label>
        <input type="number" id="set-machine-price" name="machine_price"
               value="<?= htmlspecialchars($settings['machine_price'] ?? '700') ?>"
               oninput="updateMachineCostPreview()">
      </div>
      <div class="form-group">
        <label>Lebensdauer (h)</label>
        <input type="number" id="set-machine-hours" name="machine_hours"
               value="<?= htmlspecialchars($settings['machine_hours'] ?? '5000') ?>"
               oninput="updateMachineCostPreview()">
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px;font-family:var(--mono);">
      Maschinenkosten: <span id="machine-cost-preview"><?= number_format(
        (float)($settings['machine_price'] ?? 700) / max(1, (float)($settings['machine_hours'] ?? 5000)),
        4
      ) ?> €/h</span>
    </div>
    <div class="form-group">
      <label>Fehldruck-Rate Standard (%)</label>
      <input type="number" name="failure_rate" min="0" max="100" step="1"
             value="<?= htmlspecialchars($settings['failure_rate'] ?? '10') ?>">
    </div>

    <div class="card-title" style="margin-top:20px;">Messenger & Benachrichtigungen</div>
    <div class="form-group">
      <label>Telegram Bot Token</label>
      <input type="text" name="telegram_token" placeholder="123456:ABC-DEF..."
             value="<?= htmlspecialchars($settings['telegram_token'] ?? '') ?>">
    </div>
    <div class="form-group">
      <label>Telegram Chat ID</label>
      <input type="text" name="telegram_chat_id" placeholder="12345678"
             value="<?= htmlspecialchars($settings['telegram_chat_id'] ?? '') ?>">
    </div>
    <div class="form-group" style="margin-top:12px;">
      <label>Discord Webhook URL</label>
      <input type="text" name="discord_webhook" placeholder="https://discord.com/api/webhooks/..."
             value="<?= htmlspecialchars($settings['discord_webhook'] ?? '') ?>">
    </div>

    <div style="display:flex; gap:15px; margin-top:12px; font-size:12px; color:var(--text2);">
      <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
        <input type="checkbox" name="notify_on_finish" <?= ($settings['notify_on_finish'] ?? '1') === '1' ? 'checked' : '' ?>> Bei Fertigstellung
      </label>
      <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
        <input type="checkbox" name="notify_on_fail" <?= ($settings['notify_on_fail'] ?? '1') === '1' ? 'checked' : '' ?>> Bei Fehlern
      </label>
      <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
        <input type="checkbox" name="notify_on_pause" <?= ($settings['notify_on_pause'] ?? '1') === '1' ? 'checked' : '' ?>> Bei Pause
      </label>
    </div>

    <div class="card-title" style="margin-top:20px;">KI-Funktionen (Experimentell)</div>
    <div class="form-group">
      <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
        <input type="checkbox" name="spaghetti_detect" <?= ($settings['spaghetti_detect'] ?? '0') === '1' ? 'checked' : '' ?>> KI-Fehldruck-Erkennung (Spaghetti Detection)
      </label>
      <p style="font-size:11px; color:var(--text3); margin-top:5px;">
        Erfordert einen Pi 4/5. Analysiert alle 30s den Kamerastream auf Filament-Salat.
      </p>
    </div>

    <button class="btn btn-primary" type="submit" style="margin-top:20px;">Speichern</button>
  </form>
</div>

<!-- Passwort -->
<div class="card" style="max-width:500px;">
  <div class="card-title">Passwort ändern</div>
  <form method="post">
    <input type="hidden" name="action" value="change_password">
    <div class="form-group">
      <label>Aktuelles Passwort</label>
      <input type="password" name="current_pass" autocomplete="current-password">
    </div>
    <div class="form-group">
      <label>Neues Passwort (min. 8 Zeichen)</label>
      <input type="password" name="new_pass" autocomplete="new-password">
    </div>
    <button class="btn btn-primary" type="submit">Ändern</button>
  </form>
</div>

<!-- Filament-DB -->
<div class="card" style="max-width:500px;">
  <div class="card-title">Bambu Studio Filament-Datenbank</div>
  <p style="font-size:12px;color:var(--text3);margin-bottom:12px;">
    Profile werden wöchentlich automatisch aktualisiert. Manuelles Neuladen erzwingt einen Download von GitHub.
  </p>
  <button class="btn btn-secondary" onclick="refreshOrcaDb()">🔄 Jetzt aktualisieren</button>
</div>

<!-- Update -->
<div class="card" style="max-width:500px;">
  <div class="card-title">Software-Update</div>
  <div style="font-size:12px;color:var(--text3);margin-bottom:12px;font-family:var(--mono);">
    Version: <?= htmlspecialchars($version['hash'] ?? '?') ?>
    (<?= htmlspecialchars($version['date'] ?? '—') ?>)
    · Branch: <?= htmlspecialchars($version['branch'] ?? 'main') ?>
  </div>
  <button class="btn btn-secondary" onclick="checkUpdate()">🔍 Auf Updates prüfen</button>
  <div id="update-result" style="margin-top:12px;font-size:12px;"></div>
  <div style="margin-top:12px;font-size:11px;color:var(--text3);">
    Updates per SSH installieren:<br>
    <code style="font-family:var(--mono);color:var(--text2);">cd ~/bambupi && git pull && npm install --production && sudo systemctl restart bambupi</code>
  </div>
</div>

<!-- Makros -->
<div class="card" id="macros" style="max-width:500px;">
  <div class="card-title">Schnell-Aktions-Buttons (Makros)</div>
  <table style="width:100%; margin-bottom:15px;">
    <thead>
      <tr>
        <th>Icon</th>
        <th>Name</th>
        <th>Drucker</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($macros as $m): 
        $pName = 'Alle';
        if ($m['printer_id']) {
          foreach ($printers as $p) { if ($p['id'] == $m['printer_id']) $pName = $p['name']; }
        }
      ?>
      <tr>
        <td style="text-align:center;"><?= htmlspecialchars($m['icon']) ?></td>
        <td><?= htmlspecialchars($m['name']) ?></td>
        <td style="color:var(--text3); font-size:11px;"><?= htmlspecialchars($pName) ?></td>
        <td style="text-align:right;">
          <form method="post" style="display:inline;" onsubmit="return confirm('Wirklich löschen?')">
            <input type="hidden" name="action" value="delete_macro">
            <input type="hidden" name="macro_id" value="<?= $m['id'] ?>">
            <button type="submit" class="btn btn-danger btn-sm" style="padding:4px 8px;">✕</button>
          </form>
        </td>
      </tr>
      <?php endforeach; if (empty($macros)): ?>
      <tr><td colspan="4" style="text-align:center; color:var(--text3); padding:10px;">Keine Makros definiert.</td></tr>
      <?php endif; ?>
    </tbody>
  </table>

  <div style="border-top:1px solid var(--border); padding-top:15px;">
    <div style="font-size:12px; font-weight:600; margin-bottom:10px;">Neues Makro</div>
    <form method="post">
      <input type="hidden" name="action" value="add_macro">
      <div class="form-row">
        <div class="form-group" style="flex:0 0 60px;">
          <label>Icon</label>
          <input type="text" name="m_icon" value="⚡" placeholder="⚡">
        </div>
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="m_name" placeholder="Bett reinigen" required>
        </div>
      </div>
      <div class="form-group">
        <label>G-Code (eine oder mehrere Zeilen)</label>
        <textarea name="m_gcode" rows="2" placeholder="G28 Z&#10;G1 Z50 F3000" required style="resize:vertical;"></textarea>
      </div>
      <div class="form-group">
        <label>Gültig für</label>
        <select name="m_printer">
          <option value="">Alle Drucker</option>
          <?php foreach ($printers as $p): ?>
          <option value="<?= $p['id'] ?>"><?= htmlspecialchars($p['name']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <button class="btn btn-primary" type="submit">Hinzufügen</button>
    </form>
  </div>
</div>

<!-- System -->
<div class="card" style="max-width:500px;">
  <div class="card-title">System</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button class="btn btn-secondary" onclick="location.reload()">🔄 UI neu laden</button>
    <button class="btn btn-danger"    onclick="restartServer()">⚡ Server neu starten</button>
  </div>
</div>

<script>
async function refreshOrcaDb() {
  const btn = event.target;
  btn.disabled = true; btn.textContent = '⏳ Lädt...';
  try {
    const r = await api('/api/filament-db/refresh', 'POST');
    toast(r.ok ? '✅ Datenbank aktualisiert (' + r.brands + ' Hersteller)' : '❌ Fehler', r.ok ? 'success' : 'error');
  } catch (e) { toast('❌ Fehler: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = '🔄 Jetzt aktualisieren';
}

async function checkUpdate() {
  const el = document.getElementById('update-result');
  el.innerHTML = '<span style="color:var(--text3);">⏳ Prüfe...</span>';
  try {
    const r = await api('/api/update/check');
    if (r.error) { el.innerHTML = '<span style="color:var(--red);">❌ ' + r.error + '</span>'; return; }
    if (!r.hasUpdate) {
      el.innerHTML = '<span style="color:var(--green);">✅ Bereits aktuell</span>';
    } else {
      el.innerHTML = '<span style="color:var(--orange);">📦 ' + r.count + ' Update(s) verfügbar:</span><br>'
        + r.commits.map(c => '<span style="font-family:var(--mono);font-size:11px;color:var(--text3);">' + c.date + ' · ' + c.hash + ' · ' + c.subject + '</span>').join('<br>');
    }
  } catch (e) { el.innerHTML = '<span style="color:var(--red);">❌ ' + e.message + '</span>'; }
}

async function restartServer() {
  if (!confirm('Server wirklich neu starten? Die Seite ist kurz nicht erreichbar.')) return;
  await api('/api/system/restart', 'POST');
  toast('🔄 Server startet neu...', 'info');
  setTimeout(() => location.reload(), 4000);
}
</script>
