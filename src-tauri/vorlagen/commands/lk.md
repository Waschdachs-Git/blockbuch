---
description: Probe-LK zur nächsten Leistungskontrolle schreiben (aus dem LK-Planer in Blockbuch)
argument-hint: "[optional: Lernfeld/Thema, leer = nächste eingetragene LK]"
---

Schreibe eine Probe-LK. Ziel: $ARGUMENTS

1. Lies `.blockbuch/lks.json` (nur lesen, nie ändern). Darin stehen die LKs, die der Nutzer in
   Blockbuch eingetragen hat: `datum`, `ordner` (z. B. `LF5` oder `LF5/Unicode`), `thema`,
   `ab` (Stoff ab diesem Datum; fehlt = alles). Nimm die im Argument genannte LK, sonst die nächste
   ab heute. Gibt es keine: frag kurz nach Lernfeld und Thema.
2. Lies den Stoff: alle Notizen in diesem Ordner **und seinen Unterordnern**, deren `datum` zwischen
   `ab` und dem LK-Datum liegt – mit Claude-Kästen, Karteikarten und den PDF-Texten (`assets/*.txt`).
   Schau in `Claude/ueber-mich.md` (Lernstand) und in `.blockbuch/lernstand.json` (Feld `frage` bei
   Karten mit vielen `fehler`n), was noch nicht sitzt – dazu gezielt Aufgaben stellen.
3. Lege eine **neue** Notiz im LK-Ordner an – nach den Regeln unter „Notiz-Format“ in `Claude/CLAUDE.md`:
   Dateiname `<heute>-Probe-LK-<Thema>.md` (Thema ohne Umlaute und Leerzeichen, z. B.
   `2026-11-30-Probe-LK-Datenbanken.md`; gibt es die Datei schon: `-2` anhängen, nie überschreiben),
   Frontmatter mit `lernfeld` (vom Ordner bzw. Ordner darüber) und `datum`, Tag `[uebung]`.
   - 6–10 Aufgaben wie in einer echten LK an der Berufsschule: IHK-Operatoren (nennen, beschreiben,
     erläutern, berechnen, begründen), Punkte je Aufgabe, insgesamt etwa 45 Minuten.
   - Mischen: Wissensfragen, kleine Rechen-/Code-/SQL-Aufgaben, eine Anwendungsaufgabe mit
     Situationsbeschreibung (wie in der AP).
   - Unter jeder Aufgabe eine Zeile `**Antwort:**` und danach eine leere Zeile zum Hineinschreiben.
   - Ganz unten **ein eingeklappter Kasten** mit allen Lösungen und der Punkteverteilung als **Liste**
     (keine Tabellen im Kasten): `> [!claude]- Lösungen` – dann `>` – dann die Lösungen. So kann der
     Nutzer erst selbst lösen.
4. Antworte im Chat kurz: welche LK, wie viele Aufgaben, welche Themen – und der Tipp: Nach dem
   Lösen `/korrigieren` für die Bewertung.
