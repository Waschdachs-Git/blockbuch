# Blockbuch

Notiz- und Lern-App für den **Blockunterricht an der Berufsschule**, gebaut während der Ausbildung zum
Fachinformatiker für Anwendungsentwicklung.

Mitschreiben per Tastatur wie in Word, Ordner pro Lernfeld und Fach wie in Apple Notizen, PDFs und
animierte Grafiken direkt in der Notiz. **Claude** kann alle Notizen lesen und ergänzen, damit sich aus
der Mitschrift später gut lernen lässt.

> Status: Phase 1 (Version 0.1) ist fertig und läuft im Alltag. Karteikarten, LK-Planer und Export
> folgen, siehe [PLAN.md](PLAN.md).

## Idee: Das Dateisystem ist die Schnittstelle

Alle Notizen sind normale **Markdown-Dateien** in `~/Schule`. Es gibt keine Datenbank und kein
eigenes Dateiformat.

```
~/Schule/
  LF1/ … LF5/                       ← Lernfelder (Namen genau so, wie du sie anlegst)
    2026-10-08-Netzwerktopologien.md
    assets/
      netzwerk.html                 ← animierte Grafik
      Arbeitsblatt.pdf
      Arbeitsblatt.txt              ← PDF-Text, damit Claude ihn lesen kann
  Deutsch/  Mathe-IT/  …            ← Fächer
  Claude/
    CLAUDE.md                       ← Regeln für Claude
    ueber-mich.md                   ← dein Profil (wird nie überschrieben)
  .claude/commands/                 ← Befehle wie /aufbereiten, /karten
  .git/                             ← automatische Sicherungen
```

Dadurch kann Claude (Claude Code oder claude.ai-Projekte mit Ordnerfreigabe) direkt mit den Dateien
arbeiten. Blockbuch zeigt Änderungen von außen sofort an.

## Funktionen

**Schreiben**
- Editor mit Überschriften, Listen, Checklisten, Tabellen und Code-Blöcken mit Syntax-Hervorhebung
- `/`-Menü zum Einfügen von Blöcken, alles auch ohne Maus bedienbar
- Kästen: `[!merke]`, `[!tipp]`, `[!achtung]`, `[!karten]` und `[!claude]` für Ergänzungen von Claude
- Schnellmarker im Unterricht: ⇧⌘U ❓ (nicht verstanden) und ⇧⌘L 🙋 (später nachfragen)
- Markdown aus claude.ai einfügen: wird formatiert übernommen

**Dateien**
- Bilder, Screenshots und iPhone-Fotos (HEIC wird automatisch umgewandelt) per Drag & Drop oder ⌘V
- PDFs direkt in der Notiz (pdf.js). Der Text wird im Hintergrund für Claude als `.txt` abgelegt
- Animierte HTML-Grafiken als lebendige Blöcke, z. B. Artefakte aus claude.ai

**Sicher und robust**
- Speichert automatisch und atomar. Bei gleichzeitigen Änderungen (du und Claude) entsteht eine
  Konfliktkopie, es geht nichts verloren
- Git-Sicherung beim Start, alle 5 Minuten, beim Beenden und mit ⌘S, mit Versionsverlauf über ⇧⌘H
- Grafiken laufen in einer Sandbox: kein Netzwerk, kein Zugriff auf die App, Start erst per Klick

**Finden**
- Volltextsuche mit ⌘K, die Umlaute toleriert (`ueber` findet `über`)
- Filter wie `lf2` oder `#tag`, auch die Marker ❓ und 🙋 sind suchbar

## Tastenkürzel

| Kürzel | Aktion |
| --- | --- |
| ⌘N | Neue Notiz |
| ⌘K | Suchen |
| ⌘S | Jetzt sichern |
| ⇧⌘H | Versionen der Notiz |
| ⌥⌘S | Ordner-Leiste ein/aus |
| ⇧⌘U / ⇧⌘L | Marker ❓ / 🙋 |
| ⌥⌘L | Sprache eines Code-Blocks |
| `/` | Block einfügen |
| ← → ↑ ↓ | Zwischen Ordnern, Notizen und Editor wechseln |

## Claude-Befehle

In `~/Schule` legt Blockbuch Vorlagen für Claude an:

| Befehl | Was Claude macht |
| --- | --- |
| `/aufbereiten` | Mitschrift nach dem Unterricht aufbereiten: Marker klären, Lücken füllen. Deine Mitschrift bleibt unverändert |
| `/karten` | Karteikarten aus einer Notiz erstellen (Active Recall) |
| `/luecken` | Wissenslücken in einem Lernfeld finden: Was fehlt in den Notizen? |
| `/korrigieren` | Antworten auf Übungsfragen bewerten wie die IHK, mit Teilpunkten |
| `/woche` | Wochenrückblick: Berichtsheft-Text, offene Fragen, Lernaufträge |
| `/grafik` | Animierte, interaktive Grafik bauen und in die Notiz einfügen |

## Technik

- [Tauri 2](https://tauri.app) (Rust) + React 19 + TypeScript + Vite
- [TipTap 3](https://tiptap.dev) als Editor, Markdown über `@tiptap/markdown`
- [pdf.js](https://mozilla.github.io/pdf.js/) zum Anzeigen, PDFKit (macOS) für die Texterkennung
- Git als Sicherung, `notify` für Live-Änderungen, eigenes `grafik://`-Protokoll mit strenger CSP

Blockbuch läuft derzeit **nur auf macOS**, weil es PDFKit, `sips` und den macOS-Papierkorb nutzt.

## Selbst bauen

Voraussetzungen: macOS, [Node.js](https://nodejs.org) ≥ 20, [Rust](https://rustup.rs) und die
Xcode-Befehlszeilenwerkzeuge (`xcode-select --install`, liefert auch Git für die Sicherungen).

```bash
git clone https://github.com/Waschdachs-Git/blockbuch.git
cd blockbuch
npm install
```

| Befehl | Zweck |
| --- | --- |
| `npm run tauri dev` | Entwicklungsversion mit Live-Neuladen starten |
| `npm run app` | Fertige App bauen und nach `~/Applications` installieren |
| `npm test` | Frontend-Tests (Vitest) |
| `cd src-tauri && cargo test` | Rust-Tests |

Es darf immer nur eine Blockbuch-Instanz laufen (Entwicklung oder App), weil beide `~/Schule`
verwenden.
