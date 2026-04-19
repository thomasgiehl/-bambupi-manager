<div class="page-header">
    <h1>🎬 Timelapses</h1>
    <p>Hier findest du deine automatisch generierten Zeitraffer-Aufnahmen.</p>
</div>

<div class="card">
    <div class="table-responsive">
        <table class="table">
            <thead>
                <tr>
                    <th>Datum</th>
                    <th>Name</th>
                    <th>Größe</th>
                    <th style="text-align:right;">Aktionen</th>
                </tr>
            </thead>
            <tbody id="timelapse-list">
                <tr>
                    <td colspan="4" style="text-align:center;">Lade Zeitraffer...</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>

<script>
async function loadTimelapses() {
    try {
        const res = await fetch('/api/timelapses');
        const files = await res.json();
        
        const tbody = document.getElementById('timelapse-list');
        if (files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Keine Zeitraffer gefunden.</td></tr>';
            return;
        }

        tbody.innerHTML = files.map(f => `
            <tr>
                <td>${new Date(f.mtime).toLocaleString()}</td>
                <td>${f.name}</td>
                <td>${(f.size / 1024 / 1024).toFixed(2)} MB</td>
                <td style="text-align:right;">
                    <a href="/public/timelapses/${f.name}" download class="btn btn-sm btn-primary">⬇️ Download</a>
                    <button onclick="deleteTimelapse('${f.name}')" class="btn btn-sm btn-danger">🗑️ Löschen</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

async function deleteTimelapse(name) {
    if (!confirm('Möchtest du diesen Zeitraffer wirklich löschen?')) return;
    try {
        const res = await fetch(\`/api/timelapses/\${name}\`, { method: 'DELETE' });
        if (res.ok) loadTimelapses();
    } catch (e) {
        console.error(e);
    }
}

loadTimelapses();
</script>