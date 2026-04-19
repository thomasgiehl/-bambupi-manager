# BambuPi Projekt Handoff

**Codewort:** `bambupi projekt weiter`

## Aktueller Status (19.04.2026)
Alle geplanten Phasen (1-3) wurden erfolgreich implementiert und auf GitHub gepusht.

### Implementierte Features:
- **Phase 1 (Monitoring)**: HMS Error Translator, Event-Log, ETA-Berechnung, SSE-Live-Updates.
- **Phase 2 (Automatisierung)**: Druck-Warteschlange (Queue), Wartungs-Manager (Tracking der Druckstunden), Messenger-Integration (Telegram & Discord).
- **Phase 3 (Analyse & UI)**: 3D G-Code Vorschau (.3mf & .gcode), Statistik-Dashboard (Charts), Kiosk-Modus für Tablets, KI-Spaghetti-Detection Framework.

### Nächste Schritte / Offene Punkte:
- Verfeinerung der KI-Analyse (echte Bilderkennung statt Framework).
- Backup & Restore Funktion für die Datenbank.
- Multi-User Management (optional).

### Wichtige Dateien:
- `server.js`: Backend-Logik, MQTT, Queue-Worker, KI-Loop.
- `web/assets/live.js`: Frontend-Logik, SSE-Handling, G-Code Rendering.
- `docs/BAMBU_FEASIBILITY.md`: Status der Phasen.
- `README.md` & `docs/FEATURES.md`: Aktuelle Dokumentation.
