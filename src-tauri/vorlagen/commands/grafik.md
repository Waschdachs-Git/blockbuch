---
description: Animierte, interaktive Grafik zu einem Thema bauen und in die Notiz einfügen
argument-hint: "[Thema, z. B. INNER vs. LEFT JOIN] [optional: Notiz]"
---

Baue eine animierte Lern-Grafik zu: $ARGUMENTS

1. Finde die passende Notiz: die im Argument genannte, sonst die zuletzt geänderte Notiz in diesem
   Ordner (nicht aus `Gerettet/`). Lies sie, damit die Grafik zu den Begriffen und Beispielen passt.
2. Plane kurz (im Chat, 3–5 Zeilen): Was soll man nach der Grafik verstanden haben? Welche Schritte?
3. Schreibe die HTML-Datei nach `<Ordner>/assets/<thema-mit-bindestrichen>.html` – streng nach den
   Regeln im Abschnitt „Animierte Grafiken“ der `CLAUDE.md` (eigenständig, offline, hell/dunkel,
   Abspielen/Pause/Schritt, Erklärtext pro Schritt, ruhiges Tempo).
4. Füge den ```` ```grafik ````-Block mit `src:` und passender `höhe:` in die Notiz ein – nach dem
   Abschnitt, zu dem sie gehört (nie mitten in eine Liste). Mitschrift nicht verändern.
5. Antworte im Chat kurz: wo die Grafik steht und was sie zeigt. Biete an, sie anzupassen
   (Tempo, Beispielwerte, mehr Schritte).
