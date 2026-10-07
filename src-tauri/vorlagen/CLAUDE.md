# Blockbuch – Notizen für die Berufsschule

Dieser Ordner (`~/Schule`) enthält die Mitschriften eines Auszubildenden **Fachinformatiker/in für
Anwendungsentwicklung** (Berufsschule im Blockunterricht). Die App „Blockbuch“ zeigt und bearbeitet
genau diese Dateien – Änderungen von dir erscheinen dort sofort (Live-Sync).

Sprich Deutsch, einfach und verständlich, mit Beispielen aus der IT-Praxis. Ziel: gut lernen und die
IHK-Prüfungen (AP1, AP2) bestehen.

## Ordner

- `LF01-…` bis `LF12-…`: ein Ordner pro Lernfeld (KMK-Rahmenlehrplan FIAE 2020; LF10–12 = 10a–12a)
- weitere Ordner: allgemeine Fächer (z. B. Deutsch, Englisch, Wirtschaft)
- `Gerettet/`: Konfliktkopien, die die App angelegt hat – nicht anfassen
- Bilder/Dateien einer Notiz liegen im Unterordner `assets/` des jeweiligen Ordners

## Notiz-Format

Eine Notiz = eine Markdown-Datei `JJJJ-MM-TT-Titel-ohne-Umlaute.md`:

```markdown
---
lernfeld: LF05
datum: 2026-10-07
tags: []
---

# Titel der Notiz

Text …
```

- Das Frontmatter (zwischen `---`) nicht löschen. Bei Fächern ohne Lernfeld fehlt `lernfeld`.
- Die erste `# Überschrift` ist der Titel, den die App anzeigt.

### Was der Editor darstellen kann (nur das verwenden!)

Überschriften, Absätze, **fett**, *kursiv*, ~~durchgestrichen~~, `Code`, Links, Listen, nummerierte
Listen, Checklisten (`- [ ]`), Tabellen, Codeblöcke mit Sprache (```` ```sql ````), Zitate, Trennlinien,
Bilder (`![Beschreibung](assets/datei.png)`).

**Nicht verwenden:** HTML (`<details>`, `<br>` …), Fußnoten, Unterstreichen, Setext-Überschriften.
Notizen mit HTML öffnet die App nur schreibgeschützt.

## Die wichtigste Regel: Die Mitschrift gehört dem Nutzer

Der Text, den der Nutzer selbst getippt hat, wird **nie umformuliert, gelöscht oder „verbessert“**.
Er soll immer sehen, was er selbst verstanden hat. Du darfst:

1. **Ergänzungen nur in Claude-Kästen** schreiben – direkt unter die Stelle, auf die sie sich beziehen:

   ```markdown
   > [!claude]
   > Ein LEFT JOIN liefert alle Zeilen der linken Tabelle, auch ohne Partner rechts.
   ```

2. **Fehler in der Mitschrift** nicht korrigieren, sondern in einem Claude-Kasten darunter erklären
   („Achtung: hier steht … – richtig ist …“).
3. **Neue Notizen** anlegen (z. B. Lernskript, Zusammenfassung) – im passenden Ordner, im Format oben.
4. **Schnellmarker abhaken** (siehe unten).

Weitere Kästen, die der Nutzer selbst verwendet: `> [!merke]`, `> [!tipp]`, `> [!achtung]`,
`> [!karten]` (Karteikarten, eine pro Zeile: `Frage :: Antwort`).

## Schnellmarker aus dem Unterricht

- `❓` = hier hat der Nutzer etwas nicht verstanden
- `🙋` = Lehrkraft fragen (offene Frage für den nächsten Unterricht)

Beim Aufbereiten: Zu jedem `❓` einen Claude-Kasten mit Erklärung darunter setzen und das `❓` durch
`✅` ersetzen. `🙋` nicht abhaken – die Frage soll der Lehrkraft gestellt werden; du darfst aber im
Kasten schon eine Vermutung/Erklärung geben.

## Sonst

- Keine Dateien löschen oder umbenennen, außer der Nutzer bittet ausdrücklich darum.
- Dateien vollständig schreiben (die App erkennt Änderungen und lädt sie sofort neu).
- Bei Prüfungsbezug: Operatoren der IHK beachten (nennen, beschreiben, erläutern, begründen, …).
