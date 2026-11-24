import { expect, it } from "vitest";
import type { Karte } from "../api";
import { bewerten, type Lernstand } from "./planer";
import { faelligAnzeige, faelligJeOrdner, sitzungErstellen } from "./sitzung";

const JETZT = new Date(2026, 10, 24, 15, 0).getTime();
const karte = (id: string, ordner = "LF5"): Karte => ({ id, frage: id, antwort: "a", ordner, datei: "x.md", titel: "X" });

it("fällige Wiederholungen zuerst (am längsten überfällig vorn), dann neue, ohne Doppelte", () => {
  const lernstand: Lernstand = {
    version: 1,
    karten: {
      alt: { ...bewerten(undefined, 3, JETZT - 10 * 86400_000) },
      sehrAlt: { ...bewerten(undefined, 3, JETZT - 20 * 86400_000) },
      spaeter: { ...bewerten(undefined, 4, JETZT) },
    },
  };
  const karten = [karte("neu1"), karte("alt"), karte("spaeter"), karte("sehrAlt"), karte("neu1"), karte("neu2")];
  expect(sitzungErstellen(karten, lernstand, JETZT).map((k) => k.id)).toEqual(["sehrAlt", "alt", "neu1", "neu2"]);
});

it("höchstens 20 neue Karten pro Lerntag – die Zahlen in der Seitenleiste passen zur Sitzung", () => {
  const karten = Array.from({ length: 60 }, (_, i) => karte(`k${i}`, i < 15 ? "LF5" : "LF5/Unicode"));
  const leer: Lernstand = { version: 1, karten: {} };
  expect(sitzungErstellen(karten, leer, JETZT)).toHaveLength(20);
  const f = faelligJeOrdner(karten, leer, JETZT);
  expect(faelligAnzeige(f, "LF5")).toBe(20);
  expect(faelligAnzeige(f, "LF5/Unicode")).toBe(20);
  expect(faelligAnzeige(f, "LF5/Unicode") + 0).toBeLessThanOrEqual(20);
  expect(faelligAnzeige(f, null)).toBe(20);
  // 15 neue heute schon gelernt → nur noch 5
  const heute: Lernstand = { version: 1, karten: {}, neuHeute: { tag: "2026-11-24", anzahl: 15 } };
  expect(sitzungErstellen(karten, heute, JETZT)).toHaveLength(5);
  expect(faelligAnzeige(faelligJeOrdner(karten, heute, JETZT), null)).toBe(5);
});
