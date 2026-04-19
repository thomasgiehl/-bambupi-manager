# Recherche: 3D-Druck Kostenrechner

> Erstellt: 2026-04-17 | Autor: Recherche-Agent (Wissensbasis bis Aug 2025)
> Zweck: Feature-Analyse bestehender Tools als Grundlage für den BambuPi Kostenrechner

---

## 1. Gefundene Tools & Projekte

### Web-Applikationen

| Name | URL | Beschreibung |
|------|-----|--------------|
| **3D Printing Cost Calculator** | https://www.3dprintingcostcalculator.com | Einfacher Online-Rechner mit Filament, Strom, Druckerkosten und Marge |
| **MakerOS Pricing Tool** | https://www.makeros.com | Professionelle Plattform für 3D-Druck-Dienstleister; Kalkulation inkl. Overhead, Marge, Nachbearbeitung |
| **Craftcloud Instant Quote** | https://craftcloud3d.com | Automatisches Pricing-Tool für Print-on-Demand; kalkuliert Material + Handling + Marge |
| **Treatstock Calculator** | https://www.treatstock.com | Marktplatz mit eingebautem Preisrechner; Material + Maschine + Arbeitszeit + Marge |
| **3DPrinterOS Cost Estimator** | https://www.3dprinteros.com | Cloud-Plattform für Unternehmen; Kosten pro Druckstunde inkl. Abschreibung |
| **Filament-Rechner.de** | https://www.filament-rechner.de | Deutschsprachiger Rechner; Filament + Strom + Druckerkosten + Fehldruck-Reserve |
| **The 3D Print Calculator** | https://the3dprintcalculator.com | Fokus auf Verkaufspreisberechnung; inkl. Plattformgebühren (Etsy etc.) |
| **Slant3D Pricing** | https://www.slant3d.com | Farm-Betreiber-Tool; Maschinenauslastung, Skalierungskosten |

### Open Source / GitHub

| Projekt | URL | Sprache | Features |
|---------|-----|---------|---------|
| **OrcaSlicer** (Bambu Studio Fork) | https://github.com/SoftFever/OrcaSlicer | C++ | Filamentgewicht, geschätzte Druckzeit, Filamentkosten (konfigurierbarer Preis/kg) |
| **PrusaSlicer** | https://github.com/prusa3d/PrusaSlicer | C++ | Filamentkosten, Druckzeit, Material-Preistabelle pro Filamentprofil |
| **Klipper + Moonraker** | https://github.com/Klipper3d/klipper | Python | Druckzeit-Tracking, kein eingebauter Kostenrechner |
| **Mainsail** | https://github.com/mainsail-crew/mainsail | Vue.js | Zeigt Druckzeit + Filamentverbrauch an; kein Kostenrechner eingebaut |
| **3d-printing-cost-calculator** | https://github.com/topics/3d-printing-cost | JavaScript | Verschiedene Community-Projekte mit unterschiedlichen Ansätzen |
| **print-farm-dashboard** | https://github.com/topics/print-farm | Python/JS | Farm-Management mit Kostentracking |
| **Octoprint-CostEstimation** | https://github.com/kantlivelong/OctoPrint-CostEstimation | Python | OctoPrint-Plugin: Filament + Strom + Druckerkosten live während Druck |

### Slicer-eigene Kostenrechner

#### OrcaSlicer / Bambu Studio
- Filamentkosten: `Gewicht (g) × Preis/kg ÷ 1000`
- Zeigt geschätzte Druckzeit an
- Konfigurierbare Filamentpreise pro Profil
- **Kein** Stromkostenrechner eingebaut
- **Kein** Maschinenkosten-Rechner

#### PrusaSlicer
- Filamentkosten pro Spule konfigurierbar
- Zeigt Materialkosten in der Druckvorschau
- Print-Profile können Preise enthalten
- **Kein** Strom/Maschinen-Rechner

#### Cura (Ultimaker/UltiMaker)
- Kein eingebauter Kostenrechner in der Standard-Version
- Plugin "CostEstimation" von Drittanbietern verfügbar

---

## 2. Feature-Matrix

| Feature | 3DPrint Calc | MakerOS | Craftcloud | Treatstock | OctoPrint Plugin | OrcaSlicer | PrusaSlicer |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Filamentkosten | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stromkosten | ✓ | ✓ | ~ | ~ | ✓ | — | — |
| Maschinenabschreibung | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Wartungskosten | ~ | ✓ | — | ~ | ~ | — | — |
| Arbeitszeit / Rüstzeit | ~ | ✓ | ✓ | ✓ | — | — | — |
| Nachbearbeitung | — | ✓ | ✓ | ✓ | — | — | — |
| Fehldruck-Zuschlag | ✓ | ✓ | ✓ | ~ | ~ | — | — |
| Material-Verlust (Purge, Support) | ~ | ✓ | ~ | ~ | — | — | — |
| Overhead (Miete, Plattform) | — | ✓ | ✓ | ✓ | — | — | — |
| Gewinnmarge | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Verpackung / Versand | — | ✓ | ✓ | ✓ | — | — | — |
| Mehrwertsteuer | ~ | ✓ | ✓ | ~ | — | — | — |
| Slicer-Daten-Import | — | — | ~ | — | ✓ | (intern) | (intern) |
| Preset speichern | — | ✓ | — | ✓ | — | — | — |
| Historientracking | — | ✓ | — | ✓ | — | — | — |

Legende: ✓ = vorhanden, ~ = teilweise/optional, — = nicht vorhanden

---

## 3. Feature-Analyse nach Kategorien

### 3.1 Maschinenkosten (Abschreibung)

**Wie bekannte Tools es machen:**
- Drucker-Kaufpreis ÷ erwartete Lebensdauer in Stunden = Kosten/Stunde
- Typische Werte: Kaufpreis 300-1500 €, Lebensdauer 2000-10.000 Stunden
- Beispiel OctoPrint-Plugin: `(Kaufpreis + Wartungsbudget/Jahr × Jahre) ÷ Gesamtstunden`

**Gängige Formel:**
```
Maschinenkosten = (Kaufpreis + kumulierte Wartung) ÷ Lebensdauer_Stunden × Druckdauer_Stunden
```

**Typische Konfiguration in Tools:**
- Kaufpreis des Druckers: z.B. 700 €
- Erwartete Nutzungsdauer: z.B. 5000 Stunden
- → Kosten/Stunde: 0,14 €/h

---

### 3.2 Fehldruck-Zuschlag

**Wie bekannte Tools es machen:**
- Prozentualer Aufschlag auf alle Materialkosten
- Typischer Wert: 5–20% (je nach Material und Komplexität)
- Manche Tools erlauben materialabhängige Einstellung (TPU = 15%, PLA = 5%)

**Gängige Formel:**
```
Gesamtkosten_mit_Ausfallreserve = Grundkosten × (1 + Fehldruck_Prozent / 100)
```

---

### 3.3 Material-Verlust (Purge, Spülturm, Supports)

**Wie bekannte Tools es machen:**
- Separate Eingabe für Purge-Filament in Gramm
- Oder prozentualer Zuschlag auf das Filamentgewicht (z.B. +10% für Supports)
- Bambu-spezifisch: Spülturm beim Multi-Color-Druck kann erheblich sein (20–100g)

**Gängige Formel:**
```
Effektives_Filament = Druck_Filament_g + Purge_g + (Druck_Filament_g × Support_Prozent / 100)
```

---

### 3.4 Arbeitszeit

**Wie bekannte Tools es machen:**
- Getrennte Eingabe: Vorbereitung (Slicing, Setup) + Nachbearbeitung (Support-Entfernung, Schleifen)
- Stundensatz konfigurierbar (z.B. 15–50 €/h)
- Manche Tools: Standardwerte per Druckart (einfach/mittel/komplex)

**Gängige Formel:**
```
Arbeitskosten = (Vorbereitungszeit_min + Nachbearbeitungszeit_min) / 60 × Stundensatz_€
```

---

### 3.5 Gewinnmarge

**Wie bekannte Tools es machen:**
- Entweder als Prozentsatz auf die Gesamtkosten
- Oder als absoluter Aufschlag
- Professionelle Tools: getrennte Kalkulation für "Selbstkosten" vs. "Verkaufspreis"

**Gängige Formeln:**
```
# Methode 1: Aufschlag auf Kosten
Verkaufspreis = Gesamtkosten × (1 + Marge_Prozent / 100)

# Methode 2: Marge auf Verkaufspreis (Deckungsbeitrag)
Verkaufspreis = Gesamtkosten / (1 - Marge_Prozent / 100)
```

Hinweis: Methode 2 ist die korrektere für Unternehmen (30% Marge auf Verkaufspreis ≠ 30% Aufschlag).

---

### 3.6 Overhead / Plattformgebühren

**Wie bekannte Tools es machen:**
- Fester Overhead-Prozentsatz (z.B. 10% für Strom-Nebenkosten, Verschleiß, Verbrauchsmaterial)
- Plattform-Gebühren: Etsy 6,5%, eBay ~12%, eigener Shop ~0%
- Verpackung: fixer Betrag pro Sendung (z.B. 1,50 €)
- Versand: nach Zone/Gewicht

---

### 3.7 Nachbearbeitung

**Wie bekannte Tools es machen:**
- Kategorien: Support-Entfernung, Schleifen (Stufen), Lackieren, Kleben, Heatset-Inserts
- Meist als Zeitaufwand in Minuten mit Stundensatz
- Manche Tools: Pauschalpreise pro Kategorie

---

### 3.8 Slicer-Daten-Import

**Wie bekannte Tools es machen:**
- OctoPrint-Plugin: Liest G-Code-Kommentare aus (PrusaSlicer/Cura schreiben Gewicht + Zeit in G-Code-Header)
- Einige Web-Tools: manuelle Eingabe der Slicer-Schätzwerte
- G-Code-Header enthält typischerweise:
  ```
  ; filament used [g] = 23.45
  ; estimated printing time = 2h 15m
  ```

**Bambu-spezifisch:** Bambu Studio / OrcaSlicer schreibt ähnliche Metadaten in `.3mf`-Dateien.

---

## 4. Top-Empfehlungen für BambuPi Manager

### Empfehlung 1: Maschinenkosten (Abschreibung)

**Priorität: HOCH** — fehlt bei allen Slicer-internen Tools, sehr nachgefragt

**Umsetzung:**
- Globale Einstellung: "Druckerkosten" (Kaufpreis €, erwartete Lebensdauer h)
- Wird automatisch als €/h berechnet und im Kostenrechner addiert

```
# Globale Einstellung (einmalig):
Maschinenkosten_pro_Stunde = Kaufpreis_€ / Lebensdauer_Stunden

# Im Kostenrechner:
Maschinenkosten = Maschinenkosten_pro_Stunde × Druckdauer_h
```

**UI:** Unter "Einstellungen → Drucker" ein Bereich "Kostenrechner-Profil" mit Kaufpreis + Lebensdauer. Im Kostenrechner als aufklappbare Zeile "Maschinenkosten (0,14 €/h × 3h = 0,42 €)" anzeigen.

---

### Empfehlung 2: Fehldruck-Zuschlag

**Priorität: HOCH** — einfach zu implementieren, großer praktischer Nutzen

**Umsetzung:**
- Globale Einstellung: Fehldruck-Rate in % (Standard: 10%)
- Wird auf die reinen Material+Strom-Kosten aufgeschlagen

```
Fehldruck_Kosten = (Filament_Kosten + Strom_Kosten) × Fehldruck_Rate / 100
Gesamtkosten = Filament + Strom + Maschine + Fehldruck_Kosten
```

**UI:** Schieberegler 0–30% mit Beschriftung "Sicherheitspuffer für Fehldrucke". Tooltip: "Bei 10%: Jeder 10. Druck schlägt fehl und die Materialkosten werden auf alle Drucke verteilt."

---

### Empfehlung 3: Purge/Spülturm-Filament (Bambu-spezifisch!)

**Priorität: HOCH** — besonders relevant für Bambu Lab Multi-Color

**Umsetzung:**
- Zusatzfeld im Kostenrechner: "Purge/Spülturm (g)" — Standard: 0
- Bei Multi-Color-Drucken können das 20–100g zusätzlich sein

```
Effektives_Filament_g = Druck_Filament_g + Purge_g
Filament_Kosten = Effektives_Filament_g × (Preis_pro_kg / 1000)
```

**UI:** Unter dem Filament-Gewicht-Feld ein kleines Zusatzfeld "davon Purge/Abfall (g)" mit Info-Icon. Optional: Checkbox "Multi-Color-Druck" die einen typischen Richtwert vorausfüllt (z.B. 30g).

---

### Empfehlung 4: Arbeitszeit-Kalkulation

**Priorität: MITTEL** — wichtig für alle, die Drucke verkaufen oder Zeit erfassen

**Umsetzung:**
- Zwei Eingabefelder: "Vorbereitung (min)" und "Nachbearbeitung (min)"
- Globaler Stundensatz (z.B. 15 €/h als Standard)
- Sektion ist einklappbar/optional

```
Arbeitskosten = (Vorbereitung_min + Nachbearbeitung_min) / 60 × Stundensatz_€
```

**UI:** Aufklappbarer Bereich "Arbeitszeit (optional)" mit zwei Zahlenfeldern und dem konfigurierten Stundensatz dahinter angezeigt. Ideal: Preset-Buttons "Einfach (5/10 min)", "Mittel (15/30 min)", "Komplex (30/60 min)".

---

### Empfehlung 5: Verkaufspreis-Kalkulation mit Marge

**Priorität: MITTEL** — sehr beliebt bei Makern die auf Etsy/eBay verkaufen

**Umsetzung:**
- Optionaler Bereich "Verkaufspreiskalkulation"
- Eingabe: Gewünschte Marge in % (auf Kosten aufgeschlagen)
- Ausgabe: empfohlener Verkaufspreis

```
Empfohlener_Verkaufspreis = Gesamtkosten × (1 + Marge_Prozent / 100)
```

**UI:** Unter der Kostensumme ein Toggle "Verkaufspreiskalkulation" der einen Schieberegler für Marge (0–200%) einblendet und den resultierenden Verkaufspreis groß darstellt.

---

### Empfehlung 6: Kosten-Aufschlüsselung (Visualisierung)

**Priorität: MITTEL** — kein Rechenfeature, aber großer UX-Gewinn

**Umsetzung:**
- Kuchendiagramm oder gestapelter Balken der Kostenkategorien
- Zeigt visuell: wie viel % ist Filament, Strom, Maschine, Arbeit

**UI:** Kleines Donut-Chart oder Horizontal-Stacked-Bar direkt unter der Ergebniszeile. Nutzt Chart.js (bereits in vielen Dashboard-Projekten vorhanden) oder pure CSS mit Flexbox.

---

### Empfehlung 7: Wartungskosten / Verbrauchsmaterial

**Priorität: NIEDRIG** — nice-to-have für fortgeschrittene Nutzer

**Umsetzung:**
- Globale Einstellung: monatliche Wartungskosten (€/Monat) + monatliche Betriebsstunden
- Ergibt Wartungskosten/Stunde

```
Wartungskosten_pro_Stunde = Wartung_€_pro_Monat / Betriebsstunden_pro_Monat
Wartungskosten = Wartungskosten_pro_Stunde × Druckdauer_h
```

Typische Wartungsitems: Düsen, Druckbett-Beschichtung, PTFE-Schlauch, Schmierung, Druckbett-Folie.

---

### Empfehlung 8: Preset/Vorlagen-System

**Priorität: NIEDRIG** — Komfortfeature

**Umsetzung:**
- Häufige Druckjobs als Vorlage speichern (Name, Filament, typische Parameter)
- Beim nächsten Aufruf: Vorlage laden und nur noch anpassen

---

## 5. Erkenntnisse: Preiskalkulationen für 3D-Druck-Dienstleister

### Typische Kostenstruktur bei Print-on-Demand

| Kostenkategorie | Anteil am Verkaufspreis | Typischer Wert |
|----------------|------------------------|----------------|
| Filament | 15–30% | 0,02–0,05 €/g |
| Strom | 5–10% | 0,05–0,15 €/h |
| Maschinenabschreibung | 10–20% | 0,10–0,25 €/h |
| Wartung/Verschleiß | 5–10% | 0,05–0,15 €/h |
| Arbeitszeit | 20–40% | 15–50 €/h |
| Overhead (Plattform, etc.) | 5–15% | fix oder % |
| Gewinnmarge | 20–50% | auf Gesamtkosten |

### Faustregel für einfachen PLA-Druck (Verkauf)

```
Verkaufspreis ≈ Filamentkosten × 5 bis × 10
```

Beispiel: 20g Filament = 0,40 € Material → Verkaufspreis 2,00 € bis 4,00 € für sehr einfache Objekte.

Bei komplexen Objekten mit Nachbearbeitung:
```
Verkaufspreis ≈ Filamentkosten × 10 bis × 20
```

### Marktplatz-Gebühren die Dienstleister einkalkulieren

| Plattform | Gebühr | Anmerkung |
|-----------|--------|-----------|
| Etsy | ~6,5% Transaktionsgebühr + 0,20€ Einstellgebühr | + Zahlungsgebühren |
| eBay | ~12,35% Verkaufsgebühr | variiert nach Kategorie |
| Amazon Handmade | 15% | fixer Prozentsatz |
| Eigener Shop (Shopify) | 2–3% | Zahlungsanbieter |
| Craftcloud / Treatstock | 20–30% | Plattformanteil |

### Typische Fehldruck-Raten nach Material

| Material | Typische Fehldruck-Rate | Bemerkung |
|----------|------------------------|-----------|
| PLA | 3–8% | Zuverlässigstes Material |
| PETG | 5–12% | Stringing, Haftungsprobleme |
| ABS/ASA | 10–20% | Verzug, Haftung |
| TPU/Flex | 8–15% | Verstopfungen |
| Multi-Color (AMS) | 5–15% | Zusätzlich Purge-Verlust |

---

## 6. Empfohlene Umsetzungsreihenfolge für BambuPi

### Phase A — Sofort umsetzbar (wenig Aufwand, hoher Nutzen)

1. **Fehldruck-Zuschlag** (Prozent-Schieberegler) — 1–2h Entwicklung
2. **Purge/Spülturm-Filament** (zusätzliches Gramm-Feld) — 30min Entwicklung
3. **Maschinenkosten** (Einstellung + Berechnung) — 2–3h Entwicklung

### Phase B — Mittelfristig (mehr UI-Aufwand)

4. **Arbeitszeit-Kalkulation** — 3–4h Entwicklung
5. **Kosten-Visualisierung** (Chart) — 2–3h Entwicklung
6. **Verkaufspreis-Kalkulation** — 2h Entwicklung

### Phase C — Nice-to-have

7. **Wartungskosten** — 2–3h Entwicklung
8. **Preset/Vorlagen** — 4–5h Entwicklung

---

## 7. Erweiterte Kostenformel (Empfehlung)

```python
def calculate_total_cost(
    filament_g: float,
    purge_g: float,
    filament_price_per_kg: float,
    print_hours: float,
    power_watts: float,
    electricity_price_per_kwh: float,
    machine_cost_per_hour: float,
    failure_rate_percent: float,
    prep_minutes: float,
    post_minutes: float,
    hourly_rate: float,
    profit_margin_percent: float = 0
) -> dict:

    # Materialkosten (inkl. Purge/Verlust)
    filament_cost = (filament_g + purge_g) * (filament_price_per_kg / 1000)

    # Stromkosten
    electricity_cost = print_hours * (power_watts / 1000) * electricity_price_per_kwh

    # Maschinenkosten
    machine_cost = print_hours * machine_cost_per_hour

    # Basiskosten
    base_cost = filament_cost + electricity_cost + machine_cost

    # Fehldruck-Zuschlag (nur auf Materialkosten, nicht auf Arbeitszeit)
    failure_cost = base_cost * (failure_rate_percent / 100)

    # Arbeitszeit
    labor_cost = ((prep_minutes + post_minutes) / 60) * hourly_rate

    # Gesamtkosten
    total_cost = base_cost + failure_cost + labor_cost

    # Verkaufspreis (optional)
    selling_price = total_cost * (1 + profit_margin_percent / 100) if profit_margin_percent > 0 else None

    return {
        "filament": round(filament_cost, 4),
        "electricity": round(electricity_cost, 4),
        "machine": round(machine_cost, 4),
        "failure_buffer": round(failure_cost, 4),
        "labor": round(labor_cost, 4),
        "total": round(total_cost, 4),
        "selling_price": round(selling_price, 2) if selling_price else None
    }
```

---

*Quellen: Wissensbasis aus OctoPrint-CostEstimation Plugin (GitHub: kantlivelong/OctoPrint-CostEstimation), OrcaSlicer/Bambu Studio Dokumentation, PrusaSlicer Handbuch, MakerOS Pricing-Dokumentation, Craftcloud/Treatstock Preislogik, Community-Diskussionen auf Reddit r/3Dprinting und r/3dprintingbusiness (Stand: bis Aug 2025)*
