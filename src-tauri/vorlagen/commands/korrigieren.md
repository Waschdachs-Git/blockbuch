---
description: Antworten auf Übungs-/Prüfungsfragen bewerten wie die IHK (mit Teilpunkten)
argument-hint: "[Notiz mit Aufgaben und Antworten]"
---

Bewerte die Antworten in: $ARGUMENTS

Die Notiz enthält Aufgaben und darunter die Antworten des Nutzers. Bewerte wie eine IHK-Prüfung:

1. Pro Aufgabe: Operator beachten (nennen ≠ erläutern), Punktzahl aus der Aufgabe übernehmen
   (fehlt sie: sinnvoll festlegen und dazuschreiben).
2. Unter jede Antwort einen Kasten (die Antwort selbst nicht ändern):

```markdown
> [!claude]
> **3 / 4 Punkte** – Zwei Vorteile genannt und erläutert. Es fehlt: …
> Musterlösung: …
```

   Teilpunkte nach Operator: *nennen* = 1 Punkt je richtiger Nennung; *beschreiben/erläutern* =
   Nennung plus Erklärung/Begründung; *begründen* = Argument muss zur Aussage passen.
3. Am Ende der Notiz ein Claude-Kasten mit Gesamtpunktzahl, Umrechnung auf 100 Punkte (ganzzahlig
   gerundet), IHK-Note nach Punkteschlüssel (100–92 = 1, 91–81 = 2, 80–67 = 3, 66–50 = 4, 49–30 = 5,
   29–0 = 6) und den 2 wichtigsten Verbesserungstipps.
4. Ergänze im Abschnitt „Lernstand“ in `Claude/ueber-mich.md` eine Zeile (Datum, Thema, Punkte in %,
   größte Schwäche).
5. Antworte im Chat kurz mit dem Ergebnis.
