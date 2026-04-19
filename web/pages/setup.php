<div style="display: flex; justify-content: center; align-items: center; min-height: 80vh;">
    <div class="card" style="max-width: 400px; width: 100%; padding: 30px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: var(--blue); font-size: 24px; margin-bottom: 8px;">BambuPi Setup</h1>
            <p style="color: var(--text2); font-size: 14px;">Willkommen! Bitte erstelle einen Admin-Account.</p>
        </div>
        
        <form id="setupForm">
            <div class="form-group">
                <label>Benutzername</label>
                <input type="text" id="username" required value="admin" class="form-control">
            </div>
            <div class="form-group">
                <label>Passwort</label>
                <input type="password" id="password" required placeholder="Sicheres Passwort" class="form-control">
            </div>
            <div class="form-group">
                <label>Passwort bestätigen</label>
                <input type="password" id="password_confirm" required class="form-control">
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px; padding: 12px;">
                Account erstellen
            </button>
            <div id="setupError" class="alert alert-danger" style="display: none; margin-top: 15px;"></div>
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
            alert('Admin Account erfolgreich erstellt!');
            window.location.href = '/';
        } else {
            errorDiv.innerText = result.error || 'Fehler beim Setup';
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        errorDiv.innerText = 'Verbindung zum Backend fehlgeschlagen (Port 3000)';
        errorDiv.style.display = 'block';
    }
});
</script>
