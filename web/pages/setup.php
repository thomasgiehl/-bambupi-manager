<div style="display: flex; justify-content: center; align-items: center; min-height: 80vh;">
    <div class="card" style="max-width: 400px; width: 100%; padding: 30px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: var(--blue); font-size: 24px; margin-bottom: 8px; font-weight: 700;">BambuPi Setup</h1>
            <p style="color: var(--text2); font-size: 14px;">Willkommen! Bitte erstelle deinen Admin-Account für den ersten Login.</p>
        </div>
        
        <form id="setupForm">
            <div class="form-group">
                <label style="display:block; font-size:11px; color:var(--text3); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:6px; font-family:var(--mono);">Benutzername</label>
                <input type="text" id="username" required value="admin" class="form-control" style="width:100%; background:var(--surface2); border:1px solid var(--border); border-radius:5px; padding:10px; color:var(--text);">
            </div>
            <div class="form-group" style="margin-top: 15px;">
                <label style="display:block; font-size:11px; color:var(--text3); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:6px; font-family:var(--mono);">Passwort</label>
                <input type="password" id="password" required placeholder="Sicheres Passwort" class="form-control" style="width:100%; background:var(--surface2); border:1px solid var(--border); border-radius:5px; padding:10px; color:var(--text);">
            </div>
            <div class="form-group" style="margin-top: 15px;">
                <label style="display:block; font-size:11px; color:var(--text3); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:6px; font-family:var(--mono);">Passwort bestätigen</label>
                <input type="password" id="password_confirm" required class="form-control" style="width:100%; background:var(--surface2); border:1px solid var(--border); border-radius:5px; padding:10px; color:var(--text);">
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 20px; padding: 12px; font-weight: 700; background: var(--blue); color: white; border: none; border-radius: 5px; cursor: pointer;">
                Account erstellen
            </button>
            <div id="setupError" style="display: none; margin-top: 15px; color: var(--red); font-size: 12px; text-align: center; padding: 10px; background: rgba(244,67,54,0.1); border: 1px solid var(--red); border-radius: 5px;"></div>
        </form>
    </div>
</div>

<script>
document.getElementById('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('password_confirm').value;
    const errorDiv = document.getElementById('setupError');

    if (password !== confirm) {
        errorDiv.innerText = 'Passwörter stimmen nicht überein';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();
        if (result.ok) {
            alert('Admin Account erfolgreich erstellt! Bitte logge dich nun ein.');
            window.location.href = '/';
        } else {
            errorDiv.innerText = result.error || 'Fehler beim Setup';
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        errorDiv.innerText = 'Verbindung zum Server fehlgeschlagen';
        errorDiv.style.display = 'block';
    }
});
</script>
