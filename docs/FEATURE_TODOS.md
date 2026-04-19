# 🚀 BambuPi Manager: Best-of-Features Todo-Liste
*Inspiriert von Mainsail, Fluidd, OctoPrint & Printer Farm Apps*

Diese Liste enthält die besten Features anderer Systeme, die für den BambuPi Manager übernommen werden können und mit Bambu Lab Druckern (MQTT/FTP) kompatibel sind.

## 📊 Phase 1: Monitoring & Core UX (In Arbeit / Erledigt)
- [x] **SSE-Verbindungsstatus**: Anzeige ob Live-Daten fließen.
- [x] **Temperatur-Ringbuffer**: Verlauf bleibt bei Reload erhalten.
- [x] **Bambu Studio Import**: Filament-Presets direkt importieren.
- [x] **Erweiterte Druckoptionen**: Timelapse, Leveling etc. vor Start wählen.
- [ ] **Vorheiz-Profile**: 1-Klick Buttons für PLA, PETG, ABS, TPU.
- [ ] **Benachrichtigungen**: Browser-Push bei "Druck fertig" oder "Fehler".

## 🛠️ Phase 2: Erweiterte Kontrolle (Mainsail/Fluidd Style)
- [ ] **G-Code Viewer (3D)**: Client-seitige Visualisierung der aktuellen Datei (z.B. mit gcode-viewer).
- [ ] **Live-Konsole**: Filterbarer MQTT-Log zur Überwachung der Drucker-Kommunikation.
- [ ] **Snapshot-Funktion**: Aktuelles Kamerabild manuell speichern.
- [ ] **Flow Rate & Speed Slider**: Live-Anpassung während des Drucks (M221/M220 via MQTT).
- [ ] **Tailscale/VPN Setup Guide**: Einfacher Fernzugriff ohne Cloud-Zwang.
- [ ] **PWA (Progressive Web App)**: Als App auf dem Homescreen installierbar.

## 🤖 Phase 3: Automatisierung & Farm-Features
- [ ] **Multi-Channel Alerts**: Integration von **Telegram** und **Discord** Webhooks.
- [ ] **Zentrales Event-Log**: Historie der letzten 50 Ereignisse (Druckstarts, Fehler, Filament leer).
- [ ] **Universal Queue (Warteschlange)**: Jobs in eine Queue schieben und dem nächsten freien Drucker zuweisen.
- [ ] **Wartungs-Tracker**: Erinnerung zum Fetten der Achsen / Reinigen der Stangen nach X Betriebsstunden.
- [ ] **Auto-Timelapse Pro**: Frame-genaue Zeitraffer (z.B. Kopf fährt immer in die Ecke) via MQTT-Sync.

## 📈 Phase 4: Analytics & Professional Tracking
- [ ] **Erfolgs-Statistiken**: Heatmap der Drucker-Auslastung und Erfolgsquote pro Material/Drucker.
- [ ] **Kosten-History**: Detaillierter Export der verbrauchten Strom- und Materialkosten pro Monat.
- [ ] **Filament-Bestandsprüfung**: Warnung wenn die Restmenge auf der Spule für den aktuellen Job nicht reicht.
- [ ] **KI-Fehlererkennung (Experimental)**: Lokale Obico-Integration (Spaghetti-Detection) auf dem Pi (Pi 4/5 empfohlen).

## 🎨 Phase 5: Design & UX Polish
- [ ] **Widget-Dashboard**: Drag-and-Drop Anordnung der Dashboard-Elemente.
- [ ] **Dark/Light Mode Toggle**: Manueller Wechsel oder automatischer System-Sync.
- [ ] **Kiosk-Modus**: Optimiertes Vollbild-Layout für Wandtablets.
- [ ] **Multi-User Management**: Admin- und Viewer-Accounts mit verschiedenen Rechten.
