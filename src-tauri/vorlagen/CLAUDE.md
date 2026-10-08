# Blockbuch – Notizen für die Berufsschule

Dieser Ordner enthält die Mitschriften eines Auszubildenden **Fachinformatiker/in für
Anwendungsentwicklung** (Berufsschule im Blockunterricht). Die App „Blockbuch“ zeigt und bearbeitet
genau diese Dateien – Änderungen von dir erscheinen dort sofort (Live-Sync).

Sprich Deutsch, einfach und verständlich, mit Beispielen aus der IT-Praxis. Ziel: gut lernen und die
IHK-Prüfungen (AP1, AP2) bestehen.

## Über den Nutzer

@ueber-mich.md

Den Abschnitt „Lernstand“ in `ueber-mich.md` darfst du nach `/luecken` und `/korrigieren` kurz
aktualisieren (Datum, was sitzt, was geübt werden muss). Den Rest der Datei nur auf Wunsch ändern.

## Ordner

- Lernfeld-Ordner: vom Nutzer angelegt, Name beginnt mit `LF` + Nummer (z. B. `LF1`, `LF2`, auch
  `LF5-Datenbanken`). Es gibt nur die Lernfelder, die der Nutzer angelegt hat – keine weiteren anlegen.
  Titel/Inhalte laut KMK-Rahmenlehrplan FIAE 2020 (LF10–12 = 10a–12a).
- weitere Ordner: allgemeine Fächer (z. B. Deutsch, Gemeinschaftskunde, Wirtschaftskunde)
- `Gerettet/`: Konfliktkopien, die die App angelegt hat – nicht anfassen
- `assets/` (in einem Ordner): Bilder/Dateien zu Notizen
- `.claude/`: Befehle für dich – keine Notizen

## Die wichtigste Regel: Die Mitschrift gehört dem Nutzer

Der Text, den der Nutzer selbst getippt hat, wird **nie umformuliert, gelöscht, umsortiert oder
„verbessert“** – auch nicht Rechtschreibung oder Kleinschreibung. Er soll immer sehen, was er selbst
verstanden hat.

- **Ändere Notizen nur durch Einfügen** (Edit-Werkzeug, gezielte Stellen). Schreibe eine vorhandene
  Notiz **nie komplett neu** (kein Write auf vorhandene Notizen, nichts aus dem Gedächtnis nachtippen).
- Erlaubt sind nur: Claude-Kästen einfügen, eigene Claude-Kästen aktualisieren, `❓` → `✅`,
  Karten in einen `[!karten]`-Kasten anhängen, neue Notizen anlegen.
- Fehler in der Mitschrift nicht korrigieren, sondern in einem Claude-Kasten darunter erklären
  („Achtung: … – richtig ist …“).
- Bearbeite keine Notiz, die der Nutzer gerade in der App tippt (frag im Zweifel nach) – sonst entstehen
  Konfliktkopien in `Gerettet/`.

## Kästen

Ergänzungen schreibst du **nur in Claude-Kästen**:

```markdown
> [!claude] Zu 1NF:
> Ein Attribut ist **atomar**, wenn man es nicht sinnvoll weiter zerlegen kann.
>
> - Beispiel: „Hauptstr. 1, 12345 Berlin“ → Straße, Hausnummer, PLZ, Ort
```

- Jede Zeile beginnt mit `> `, Leerzeilen im Kasten als `>`.
- Optionaler Kurztitel in der ersten Zeile hinter `[!claude]` (z. B. `Zu 1NF:`, `Kurz zusammengefasst`).
- Im Kasten erlaubt: Text, **fett**, `Code`, Listen, Codeblöcke. **Keine Tabellen** im Kasten.
- **Platzierung:** direkt **nach dem Block**, auf den er sich bezieht. Steht die Stelle in einer
  **Liste, Tabelle oder einem Codeblock, kommt der Kasten nach dem ganzen Block** – nie mitten hinein
  (sonst zerreißt die Liste). Mehrere Kästen zu einem Block: zu einem Kasten zusammenfassen, Bezug
  jeweils fett voranstellen (`**Zu 1NF:** …`).
- **Eigene Kästen** (`[!claude]`) darfst du später aktualisieren statt doppelt anzulegen.
- Kästen des Nutzers – `> [!merke]`, `> [!tipp]`, `> [!achtung]` – nie ändern.
- `> [!karten]` = Karteikarten, eine pro Zeile `> Frage :: Antwort` (kein `::` in Frage/Antwort,
  Code nur als `Inline`). Neue Karten **an den vorhandenen** Karten-Kasten anhängen. Der Karten-Kasten
  steht immer **am Ende** der Notiz (nach „Kurz zusammengefasst“).

## Bilder und PDFs

Der Nutzer legt Fotos (Tafelbilder, Arbeitsblätter vom iPhone), Screenshots und PDFs per Drag & Drop
oder ⌘V in Notizen ab. Die App speichert sie in `<Ordner>/assets/` und fügt ein:

- Bild: `![Bild-2026-10-08-0759](assets/Bild-2026-10-08-0759.png)`
- PDF:

  ````markdown
  ```pdf
  src: assets/Arbeitsblatt-Joins.pdf
  ```
  ````

  Neben jedem PDF liegt eine `.txt` mit dem herausgelesenen Text (`assets/Arbeitsblatt-Joins.txt`).
  Für einen schnellen Überblick zuerst die `.txt` lesen; für Layout, Tabellen oder gescannte
  Arbeitsblätter das PDF selbst.

Was du damit tun kannst:

- **Tafelbilder/Fotos auswerten**: Bild lesen und den Inhalt als Claude-Kasten unter dem Bild
  abschreiben/strukturieren (Tabellen, Diagramme als Text beschreiben).
- **Arbeitsblätter**: Aufgaben aus dem PDF in die Notiz übernehmen (als Claude-Kasten) oder eine
  Übungsnotiz anlegen. Bilder/PDFs selbst nie löschen oder umbenennen.
- Eigene Bilder darfst du als Datei in `assets/` ablegen (z. B. SVG-Diagramm) und mit `![…](assets/…)`
  einbinden. Dateinamen ohne Leerzeichen, Klammern und Umlaute (z. B. `er-modell-kunde.svg`).

## Animierte Grafiken

Die App kann **lebendige Grafiken** direkt in einer Notiz zeigen – das ist eine Stärke von dir:
Abläufe (JOIN, Subnetting, Sortierverfahren, TCP-Handshake, OSI-Modell, Zustandsautomaten …) als
interaktive Animation erklären.

1. Schreibe eine **eigenständige HTML-Datei** nach `<Ordner der Notiz>/assets/<name>.html`
   (Name klein, mit Bindestrichen, z. B. `assets/tcp-handshake.html`).
2. Füge in die Notiz (nach der passenden Stelle, nie mitten in eine Liste) diesen Block ein:

   ````markdown
   ```grafik
   src: assets/tcp-handshake.html
   höhe: 400
   ```
   ````

Regeln für die HTML-Datei (die App zeigt sie abgeschottet an):

- **Alles in einer Datei**: CSS und JavaScript inline, ohne Bibliotheken (SVG, Canvas,
  CSS-Animationen reichen fast immer). Hilfsdateien (Bilder, ein Skript) nur aus demselben `assets/`-Ordner,
  relativ eingebunden (`<img src="bild.png">`).
- **Kein Netzwerk** – die App blockiert es: keine CDNs, keine Webfonts, kein `fetch`, keine Formulare,
  keine externen Links. Es muss offline im Unterricht funktionieren.
- **Keine Endlosschleifen** und nichts, was viel Rechenzeit braucht: Die Grafik läuft im selben Fenster
  wie der Editor. (Sie startet erst, wenn der Nutzer auf „▶ Grafik starten“ klickt.)
- **Breite 100 %**, die Höhe passt zu `höhe:` (120–2000 px). Auch bei schmaler Breite (~500 px) lesbar.
- **Hell und dunkel**: Farben über CSS-Variablen, dunkle Variante per `@media (prefers-color-scheme: dark)`,
  `body` mit eigener Hintergrundfarbe. Systemschrift (`-apple-system, sans-serif`).
- **Zum Lernen gebaut**: Knöpfe ▶ Abspielen / ❚❚ Pause / Schritt → / ↺; ruhiges Tempo (ca. 1,5–2 s pro
  Schritt); zu jedem Schritt ein kurzer Erklärtext auf Deutsch; Fachbegriffe wie in der Prüfung.
- `prefers-reduced-motion` beachten. Keine automatisch startenden Endlos-Animationen.
- Überarbeiten: einfach die HTML-Datei ändern – die App zeigt „Grafik wurde geändert – neu starten“.

## Schnellmarker aus dem Unterricht

- `❓` = hier hat der Nutzer etwas nicht verstanden → beim Aufbereiten erklären, dann `❓` → `✅`.
  Ist die markierte Aussage falsch, erklärt und korrigiert **ein** Kasten beides („Achtung …“).
- `🙋` = Lehrkraft fragen → bleibt stehen. Im Kasten nur eine kurze Einschätzung; eine Formulierung
  für die Frage nur vorschlagen, wenn die Frage des Nutzers unklar ist.

## Notiz-Format

Eine Notiz = eine Markdown-Datei `JJJJ-MM-TT-Titel.md` im passenden Ordner:

```markdown
---
lernfeld: LF05
datum: 2026-10-07
tags: []
---

# Titel der Notiz

Text …
```

- Frontmatter (zwischen `---`) nie löschen. `lernfeld` steht nur in Lernfeld-Ordnern, immer zweistellig
  (`LF05` für den Ordner `LF5`), bei Fächern weglassen. `datum` im Format `JJJJ-MM-TT` ohne Anführungszeichen.
- Die erste `# Überschrift` ist der Titel, den die App anzeigt.
- **Neue Notizen von dir:** Dateiname mit Datum von heute, Titel ohne Umlaute (ä→ae, ö→oe, ü→ue,
  ß→ss), Wörter mit Bindestrichen, keine Sonderzeichen (z. B. `2026-10-07-Lernskript-Normalisierung.md`).
  Tags: `[lernskript]`, `[zusammenfassung]` oder `[uebung]`. Keine vorhandene Datei überschreiben.

### Was der Editor darstellen kann (nur das verwenden!)

Überschriften (`#`), Absätze, **fett**, *kursiv*, ~~durchgestrichen~~, `Code`, Links, Listen,
nummerierte Listen, Checklisten (`- [ ]`), Tabellen, Codeblöcke mit Sprache (```` ```sql ````),
Zitate/Kästen, Trennlinien, Bilder (`![Beschreibung](assets/datei.png)`), Grafik-Blöcke (```` ```grafik ````),
PDF-Blöcke (```` ```pdf ````).

**Nicht verwenden:** HTML (`<details>`, `<br>` …), Fußnoten, Unterstreichen, `===`-Überschriften.
Notizen mit HTML öffnet die App nur schreibgeschützt.

## Versionen (Git)

`~/Schule` ist ein Git-Archiv. Die App sichert automatisch (beim Start, alle 5 Minuten, beim Beenden,
mit ⌘S). Der Nutzer kann jede Version einer Notiz in der App ansehen und wiederherstellen.

- Lesen ist erlaubt und nützlich: `git log -- <datei>`, `git show <id>:<pfad>`, `git diff`
  (z. B. „Was habe ich letzte Woche zu Normalformen geschrieben?“ oder eine versehentlich gelöschte
  Stelle wiederfinden).
- **Nur lesende Git-Befehle.** Nie: `add`, `commit` (auch nicht `--amend`), `push`, `reset`, `checkout`,
  `switch`, `restore`, `rebase`, `stash`, `clean`, `rm`, `mv`, `gc`, `reflog`, `config`, `branch -d` –
  und kein `git init` in Unterordnern. Das kann Arbeit des Nutzers vernichten oder die automatische
  Sicherung stören. Sicherungen macht nur die App.
  Wenn etwas wiederhergestellt werden soll: den alten Inhalt mit `git show` lesen und wie jede andere
  Änderung per Edit einfügen.

## Sonst

- Keine Dateien löschen oder umbenennen, außer der Nutzer bittet ausdrücklich darum.
- Bei Prüfungsbezug die IHK-Operatoren beachten (nennen, beschreiben, erläutern, begründen, …).
