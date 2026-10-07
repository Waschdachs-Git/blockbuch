# Blockbuch – Notizen für die Berufsschule

Dieser Ordner enthält die Mitschriften eines Auszubildenden **Fachinformatiker/in für
Anwendungsentwicklung** (Berufsschule im Blockunterricht). Die App „Blockbuch“ zeigt und bearbeitet
genau diese Dateien – Änderungen von dir erscheinen dort sofort (Live-Sync).

Sprich Deutsch, einfach und verständlich, mit Beispielen aus der IT-Praxis. Ziel: gut lernen und die
IHK-Prüfungen (AP1, AP2) bestehen.

## Ordner

- `LF01-…` bis `LF12-…`: ein Ordner pro Lernfeld (KMK-Rahmenlehrplan FIAE 2020; LF10–12 = 10a–12a)
- weitere Ordner: allgemeine Fächer (z. B. Deutsch, Englisch, Wirtschaft)
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

- Frontmatter (zwischen `---`) nie löschen. `lernfeld` steht nur in Lernfeld-Ordnern (`LF05` aus dem
  Ordnernamen `LF05-…`), bei Fächern weglassen. `datum` im Format `JJJJ-MM-TT` ohne Anführungszeichen.
- Die erste `# Überschrift` ist der Titel, den die App anzeigt.
- **Neue Notizen von dir:** Dateiname mit Datum von heute, Titel ohne Umlaute (ä→ae, ö→oe, ü→ue,
  ß→ss), Wörter mit Bindestrichen, keine Sonderzeichen (z. B. `2026-10-07-Lernskript-Normalisierung.md`).
  Tags: `[lernskript]`, `[zusammenfassung]` oder `[uebung]`. Keine vorhandene Datei überschreiben.

### Was der Editor darstellen kann (nur das verwenden!)

Überschriften (`#`), Absätze, **fett**, *kursiv*, ~~durchgestrichen~~, `Code`, Links, Listen,
nummerierte Listen, Checklisten (`- [ ]`), Tabellen, Codeblöcke mit Sprache (```` ```sql ````),
Zitate/Kästen, Trennlinien, Bilder (`![Beschreibung](assets/datei.png)`).

**Nicht verwenden:** HTML (`<details>`, `<br>` …), Fußnoten, Unterstreichen, `===`-Überschriften.
Notizen mit HTML öffnet die App nur schreibgeschützt.

## Sonst

- Keine Dateien löschen oder umbenennen, außer der Nutzer bittet ausdrücklich darum.
- Bei Prüfungsbezug die IHK-Operatoren beachten (nennen, beschreiben, erläutern, begründen, …).
