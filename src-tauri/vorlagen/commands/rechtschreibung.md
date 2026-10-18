---
description: Rechtschreibung der Mitschrift korrigieren – nur Schreibweise, nie Inhalt oder Formulierung
argument-hint: "[Notiz oder Ordner, leer = heutige Notizen]"
---

Korrigiere die Rechtschreibung in: $ARGUMENTS
(Ist das leer, nimm alle Notizen, deren `datum` heute ist – in allen Ordnern außer `Gerettet/` und `Claude/`.)

Der Nutzer hat eine **Lese-Rechtschreib-Schwäche (LRS)** und bittet ausdrücklich um diese Korrektur.
Das ist die **einzige Ausnahme** von der Regel „Mitschrift nicht verändern“ in `Claude/CLAUDE.md` –
und sie gilt **nur für die Schreibweise**. Alle anderen Regeln dort gelten weiter.

## Vorher: Sicherung

Die App muss den jetzigen Stand gesichert haben, damit der Nutzer jede Korrektur über die Versionen
(⇧⌘H) zurückholen kann. Prüfe mit `git status --porcelain -- <datei>` (nur lesen!):

- Keine Ausgabe → der Stand ist gesichert, weiter.
- Die Datei ist geändert, oder du kannst Git nicht nutzen → bitte den Nutzer, in Blockbuch **⌘S** zu
  drücken, und warte auf seine Antwort. Erst dann korrigieren.

Tippt der Nutzer die Notiz gerade in der App, frag nach, bevor du sie änderst.

## Was du korrigierst

- Rechtschreibfehler und vertauschte/fehlende Buchstaben („Primerschlüsel“ → „Primärschlüssel“)
- Groß- und Kleinschreibung, Getrennt- und Zusammenschreibung
- das/dass, seid/seit, wieder/wider und ähnliche Verwechslungen
- Zeichensetzung **nur bei eindeutigen Fehlern** (z. B. fehlendes Komma vor „dass“)

## Was du **nie** änderst

- Inhalt, Wortwahl, Satzbau, Reihenfolge – auch keine „schöneren“ Formulierungen
- Stichpunkt-Stil und Abkürzungen (`z. B.`, `bzw.`, `DB`, `PK`) – Notizen dürfen knapp sein
- Fachbegriffe in ihrer üblichen Schreibweise (`Primary Key`, `SELECT`, `IPv4`, `JavaScript`)
- Alles in `Code` und Codeblöcken, ```` ```grafik ````- und ```` ```pdf ````-Blöcke, Frontmatter, Link- und
  Bildpfade, Dateinamen, Zahlen, Formeln, Emojis und Marker (❓ 🙋 ✅)
- Claude-Kästen (`[!claude]`) und den Dateinamen der Notiz
- Inhaltliche Fehler: nicht hier korrigieren, sondern am Ende im Chat erwähnen (→ `/aufbereiten`)

**Unsicher**, ob ein Wort ein Fehler ist (Fachwort, Eigenname, Abkürzung des Lehrers)? Dann **nicht**
ändern, sondern am Ende im Chat nachfragen.

## So gehst du vor

1. Lies die Notiz komplett.
2. Korrigiere mit dem Werkzeug, das **gezielt eine Stelle ersetzt** (Edit, `edit_file`, „str_replace“) –
   Wort für Wort oder Zeile für Zeile. **Nie die ganze Datei neu schreiben.** Der Text in der Datei
   muss bis auf die korrigierten Wörter Zeichen für Zeichen gleich bleiben (Leerzeichen, Zeilenumbrüche,
   `>`, `-`, `|` usw.).
3. Antworte im Chat, kurz und freundlich – **nichts davon in die Notiz schreiben**:
   - welche Notizen, wie viele Korrekturen
   - eine Tabelle `vorher → nachher` (bei sehr vielen: die wichtigsten, Rest zusammengefasst)
   - die Wörter, bei denen du unsicher warst
   - falls ein Fehler **mehrmals** vorkam: höchstens 2 kurze Merkhilfen (z. B. „‚dass‘ mit ss, wenn
     man es nicht durch ‚welches‘ ersetzen kann“). Ermutigend, ohne zu bewerten.
   - der Hinweis: „Rückgängig: in Blockbuch ⇧⌘H → Version von vor der Korrektur“
4. In `Claude/ueber-mich.md` nur dann etwas eintragen, wenn der Nutzer das möchte (vorher fragen).
