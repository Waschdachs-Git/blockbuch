import { describe, expect, it } from "vitest";
import { abstandText, bewerten, istFaellig, lerntag, lernstandAusText } from "./planer";

const JETZT = new Date(2026, 10, 24, 15, 0).getTime();
const TAG = 24 * 3600 * 1000;

describe("Wiederholungsabstände", () => {
  it("neue Karte: Nochmal/Schwer in Minuten, Gut morgen, Leicht in 3 Tagen", () => {
    expect(abstandText(undefined, 1, JETZT)).toBe("1 Min.");
    expect(abstandText(undefined, 2, JETZT)).toBe("5 Min.");
    expect(abstandText(undefined, 3, JETZT)).toBe("1 Tag");
    expect(abstandText(undefined, 4, JETZT)).toBe("3 Tage");
  });

  it("immer wieder „Gut“: die Abstände wachsen (1, 3, ~8, ~20 Tage …)", () => {
    let s = bewerten(undefined, 3, JETZT);
    const abstaende = [s.intervall];
    for (let i = 0; i < 4; i++) {
      s = bewerten(s, 3, s.faellig);
      abstaende.push(s.intervall);
    }
    expect(abstaende).toEqual([1, 3, 8, 20, 50]);
  });

  it("vergessen: zurück in die Lernphase, Leichtigkeit sinkt, Fehler zählt", () => {
    let s = bewerten(undefined, 3, JETZT);
    s = bewerten(s, 3, s.faellig);
    const vergessen = bewerten(s, 1, s.faellig);
    expect(vergessen.intervall).toBe(0);
    expect(vergessen.fehler).toBe(1);
    expect(vergessen.leichtigkeit).toBeCloseTo(2.3);
    expect(bewerten(vergessen, 3, vergessen.faellig).intervall).toBe(1);
  });

  it("Tagesabstände sind ab Tagesbeginn fällig – am Morgen schon, nicht erst um 15 Uhr", () => {
    const s = bewerten(undefined, 3, JETZT);
    const morgenFrueh = new Date(2026, 10, 25, 7, 0).getTime();
    expect(istFaellig(s, morgenFrueh)).toBe(true);
    expect(istFaellig(s, JETZT + 60_000)).toBe(false);
    expect(istFaellig(undefined, JETZT)).toBe(true);
  });

  it("Abstand höchstens ein Jahr", () => {
    let s = bewerten(undefined, 4, JETZT);
    for (let i = 0; i < 12; i++) s = bewerten(s, 4, s.faellig);
    expect(s.intervall).toBeLessThanOrEqual(365);
    expect(s.faellig - JETZT).toBeGreaterThan(TAG);
  });

  it("kaputter Lernstand → Fehler (wird nicht überschrieben), kaputte Einträge werden übergangen", () => {
    expect(() => lernstandAusText("kaputt")).toThrow();
    const l = lernstandAusText('{"karten":{"a":{"faellig":1,"intervall":0,"leichtigkeit":2.5,"wiederholungen":0,"fehler":0},"b":{"faellig":"x"}}}');
    expect(Object.keys(l.karten)).toEqual(["a"]);
  });

  it("Lerntag beginnt um 4 Uhr: „Gut“ um 23:55 ist nicht 5 Minuten später fällig", () => {
    const spaet = new Date(2026, 10, 24, 23, 55).getTime();
    const s = bewerten(undefined, 3, spaet);
    expect(new Date(s.faellig)).toEqual(new Date(2026, 10, 25, 4, 0));
    expect(lerntag(new Date(2026, 10, 25, 2, 0).getTime())).toBe("2026-11-24");
  });

  it("Zeitumstellung verschiebt nichts: 1 Tag bleibt 1 Kalendertag", () => {
    // Nacht der Umstellung auf Sommerzeit (29.3.2026) und auf Winterzeit (25.10.2026)
    for (const [j, m, t] of [[2026, 2, 28], [2026, 9, 24]]) {
      const s = bewerten(undefined, 3, new Date(j, m, t, 23, 30).getTime());
      expect(new Date(s.faellig)).toEqual(new Date(j, m, t + 1, 4, 0));
    }
  });
});
