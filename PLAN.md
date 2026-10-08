# Blockbuch – Plan

Notiz- und Lern-App für den Blockunterricht (Fachinformatiker Anwendungsentwicklung).
Mitschreiben per Tastatur, Claude ist im Unterricht und beim Lernen voll dabei.

## Kernidee

**Das Dateisystem ist die Schnittstelle.** Alle Notizen sind normale Markdown-Dateien in `~/Schule`.
Claude (Claude Code / Desktop, über das Abo) liest und schreibt sie direkt. Die App zeigt Änderungen live an.
Git im Notizen-Ordner macht jede Änderung rückgängig-bar.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| App | Tauri 2 + React + TypeScript |
| Editor | TipTap (ProseMirror), block-basiert, `/`-Menü, tastaturzentriert |
| Speicher | Markdown mit Frontmatter, Assets in `assets/` je Lernfeld |
| Suche | MiniSearch (Phase 1), ggf. später SQLite FTS |
| PDFs | PDF.js zum Anzeigen, Text beim Import als `.txt` daneben |
| Animationen | eigene HTML-Datei in `assets/`, Anzeige im `iframe sandbox="allow-scripts"`, strenge CSP, kein Netzwerk |
| Claude | Phase 1: Claude Code neben der App. Phase 3: Claude-Panel in der App (API-Key) |
| Pfade | Code: `~/Projekte/blockbuch`, Notizen: `~/Schule` |

## Notizen-Ordner

```
~/Schule/
  CLAUDE.md
  LF01-.../ … LF12-.../
    2026-10-06-SQL-Joins.md
    assets/
      join-animation.html
      Arbeitsblatt-Joins.pdf
      Arbeitsblatt-Joins.txt
  .git/
```

## Notiz-Format

````markdown
---
lernfeld: LF05
datum: 2026-10-06
block: 3
tags: [sql, joins]
---
# SQL-Joins

```grafik
src: assets/join-animation.html
höhe: 400
```

```sql
SELECT * FROM kunde k INNER JOIN auftrag a ON k.id = a.kunde_id;
```
````

## Phase 1 – Mitschreiben

| # | Schritt | Fertig, wenn … |
|---|---|---|
| 0 | Setup: Node.js + Rust installieren, Tauri-Projekt anlegen | `npm run tauri dev` öffnet ein Fenster |
| 1 | Grundlayout: Seitenleiste + Editorbereich, Hell/Dunkel | sieht aus wie eine Notizen-App |
| 2 | Seitenleiste: Ordner des Nutzers (LF1, LF2 … oben als Lernfelder, sonst Fächer), Notizen erstellen/umbenennen/löschen (Papierkorb) | Notiz in LF5 anlegbar |
| 3 | Editor: TipTap, Überschriften/Listen/Tabellen, `/`-Menü, Markdown laden/speichern, Autosave | Schreiben, schließen, öffnen – alles da |
| 4 | Live-Sync: Dateiüberwachung, Neu-Laden, keine Konflikte/Überschreibungen | Claude ändert offene Notiz → App zeigt es sofort |
| 5 | Code-Block mit Syntax-Highlighting | `/code` funktioniert |
| 6 | Animations-Block: Sandbox, Höhe einstellbar, Vollbild | Claude-Animation läuft in der Notiz |
| 7 | Bilder & PDFs per Drag & Drop, PDF-Anzeige, Textextraktion | Arbeitsblatt eingefügt, Claude kann es lesen |
| 8 | Suche mit ⌘K | „Normalform“ wird gefunden |
| 9 | Git-Autosicherung + `CLAUDE.md` mit Konventionen | Claude-Änderung zurückholbar |
| 10 | Praxistest: ein echter Blocktag | zufrieden oder Mängelliste |

## Zwischenschritt – Claude-Zusammenarbeit ✅

- `~/Schule/CLAUDE.md`: Regeln für Claude – Mitschrift bleibt unangetastet, Ergänzungen nur in
  `> [!claude]`-Kästen, nur einfügen (nie ganze Datei neu schreiben)
- Befehle für Claude Code in `~/Schule/.claude/commands/`: `/aufbereiten`, `/karten`, `/luecken`,
  `/woche`, `/korrigieren` (Vorlagen in `src-tauri/vorlagen/`, Updates nur wenn unverändert)
- Kästen `[!claude]`, `[!merke]`, `[!karten]`, `[!tipp]`, `[!achtung]`; Schnellmarker ⌘⇧U ❓ / ⌘⇧L 🙋

## Phase 2 – Lernen

- Karteikarten mit Spaced Repetition (FSRS) – Karten stehen als `> [!karten]` direkt in der Notiz
  (`Frage :: Antwort`), Lernstand getrennt; Anki-Export fürs Handy
- Vorschlag: Prüfungsaufgaben im IHK-Format (Operator, Punkte, Erwartungshorizont, `/korrigieren`)
- Vorschlag: „Aus dem Kopf erklären“ (Feynman), Rechentrainer AP1 (Subnetting, Zahlensysteme …),
  ausführbare SQL-Blöcke, Diagramme als Text, Lernziel-Landkarte pro Lernfeld
- Quiz aus Notizen
- **LK-Planer**: LK eintragen → Claude findet Lücken → Tagesplan bis zur LK → passt sich an Quiz-Ergebnisse an → Probe-LK
- Untis-Anbindung für LK-Termine (WebUntis-API; Plan B: Screenshot → Claude)
- Berichtsheft: Wochentext zum Kopieren nach Ausbildungsheft.de
- Export PDF/DOCX (Animationen als Standbild/GIF)

## Phase 3 – Komfort

- Claude-Panel direkt in der App (markieren → erklären / Grafik)
- Prüfungsmodus AP1/AP2
- Tafelbild-Foto: per iPhone (Continuity Camera) einfügen, Claude liest es selbst (statt eigener OCR)
- Karteikarten auf dem Handy (eigene Mini-App oder Anki-Export)
- Verknüpfungen `[[...]]`, Glossar

## Bewusst nicht

- Audioaufnahme im Unterricht (§ 201 StGB, nur mit Einwilligung)
- Seitenlayout wie Word im Editor (Seiten nur beim Export)
