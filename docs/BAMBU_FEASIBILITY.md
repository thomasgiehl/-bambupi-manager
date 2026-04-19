# 📋 Bambu-Kompatibilitäts-Analyse & Phasenplan

Diese Liste enthält ausschließlich Features, die technisch mit der **Bambu Lab LAN-Schnittstelle (MQTT/FTP)** umsetzbar sind. Features, die Klipper-spezifisch sind oder Root-Zugriff auf die Drucker-Firmware erfordern, wurden ausgeschlossen.

---

## 🟢 Phase 1: Deep Monitoring & Verlässlichkeit (ABGESCHLOSSEN ✅)
*Fokus: Informationen, die der Drucker bereits sendet, besser nutzen.*

1. **HMS Error Code Translator**
   - **Nutzen**: Statt kryptischer Codes (z.B. `0300 0100`) zeigt das Dashboard den echten Fehlertext an.
   - **Bambu-Check**: Die Codes kommen via MQTT, wir brauchen nur eine Mapping-Tabelle.
2. **Erweitertes Event-Log**
   - **Nutzen**: Eine Liste der letzten 50 Ereignisse (Druckstart, Ende, Filament-Ende, HMS-Fehler).
   - **Bambu-Check**: Wird lokal in der SQLite-DB auf dem Pi gespeichert.
3. **Präziser Fortschrittsbalken**
   - **Nutzen**: Kombiniert Layer-Anzeige und Zeit-Anzeige für eine genauere Vorhersage als der Drucker selbst.
   - **Bambu-Check**: Daten liegen via MQTT vor.
4. **Browser-Push & Sound-Alerts**
   - **Nutzen**: Akustisches Signal oder Browser-Tab-Blinken bei "User Action Required" (z.B. Filamentwechsel).

---

## 🟢 Phase 2: Automatisierung & Farm-Management (ABGESCHLOSSEN ✅)
*Fokus: Zeit sparen und mehrere Drucker koordinieren.*

1. **Telegram / Discord Bot**
   - **Nutzen**: Status-Updates und Kamerabilder direkt aufs Handy.
   - **Bambu-Check**: Node.js sendet Webhooks basierend auf MQTT-Events.
2. **Wartungs-Tracker (Maintenance)**
   - **Nutzen**: Zählt die echten Druckstunden und erinnert an: "Achsen fetten" (alle 50h), "Carbon-Stangen reinigen" etc.
   - **Bambu-Check**: Pi trackt die Zeit zwischen `RUNNING` und `FINISH`.
3. **Automatischer Druck-Queue (Warteschlange)**
   - **Nutzen**: Dateien hochladen und "in die Schlange" stellen. Sobald ein Drucker auf `IDLE` geht und das Bett leer ist, startet der nächste Job.
   - **Bambu-Check**: Pi steuert den Start-Zeitpunkt via MQTT/FTP.
4. **Filament-Check (Gewicht)**
   - **Nutzen**: Warnung, wenn die Datei 200g braucht, die Spule in der Datenbank aber nur noch 150g hat.
   - **Bambu-Check**: Abgleich zwischen `.3mf` Metadaten und Filament-DB.

---

## 🔵 Phase 3: Analyse & Visualisierung (Mainsail-Niveau) (ABGESCHLOSSEN ✅)
*Fokus: Profi-Features für Power-User.*

1. **3D G-Code Preview (Client-side)**
   - **Nutzen**: Die hochgeladene Datei vor dem Druck in 3D ansehen (Layer für Layer).
   - **Bambu-Check**: Wir parsen die `.gcode` Datei lokal im Browser des Users.
   - **Einschränkung**: Kein "Live-Mitzeichnen" wie bei Klipper, da Bambu die aktuelle Zeile nicht sendet.
2. **Erfolgs-Statistiken & Heatmaps**
   - **Nutzen**: Welche Drucker haben die meiste Downtime? Welches Filament macht die meisten Probleme?
   - **Bambu-Check**: Auswertung der gespeicherten Druckhistorie.
3. **KI-Spaghetti-Detection (Lokal)**
   - **Nutzen**: Erkennt Fehldrucke automatisch und pausiert den Drucker.
   - **Bambu-Check**: Pi wertet den MJPEG-Stream aus (erfordert Pi 4/5).
4. **Kiosk-Modus (Wandtablet)**
   - **Nutzen**: Ein extrem reduziertes UI, das nur die Kamera und die wichtigsten Statuswerte zeigt.

---

## 🔴 Was NICHT geht (Fake-Features vermeiden)
- **Live-Gcode Manipulation**: Man kann keinen G-Code während des Drucks "einschleusen" oder ändern wie bei OctoPrint.
- **Root-Firmware-Änderungen**: Bambu-Firmware ist geschlossen. Wir können keine neuen Menüpunkte am Drucker-Display erzeugen.
- **Echte Macros**: Wir können keine komplexen Logik-Macros (IF/ELSE) auf dem Drucker speichern, nur einfache G-Code-Sequenzen vom Pi aus senden.
