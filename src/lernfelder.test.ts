import { expect, it } from "vitest";
import { lernfeldNummer, ordnerAusNamen } from "./lernfelder";

it("zeigt die Ordner genau mit dem Namen des Nutzers – ohne eigene Titel", () => {
  const { lernfelder, faecher } = ordnerAusNamen(["Deutsch", "LF2", "LF1", "LF5", "Mathe-IT", "LF10", "LF3-Netzwerke"]);
  expect(lernfelder.map((o) => o.anzeige)).toEqual(["LF1", "LF2", "LF3-Netzwerke", "LF5", "LF10"]);
  expect(lernfelder.every((o) => o.titel === o.name)).toBe(true);
  expect(lernfelder[0].lernfeld).toEqual({ id: "LF01", nr: 1 });
  expect(faecher.map((o) => o.anzeige)).toEqual(["Deutsch", "Mathe-IT"]);
});

it("Lernfeld-Nummern aus Ordnernamen", () => {
  expect(lernfeldNummer("LF5")).toBe(5);
  expect(lernfeldNummer("LF05-Daten-verwalten")).toBe(5);
  expect(lernfeldNummer("lf 3")).toBe(3);
  expect(lernfeldNummer("LF5x")).toBeNull();
  expect(lernfeldNummer("Deutsch")).toBeNull();
});

it("Unterordner stehen eingerückt direkt unter ihrem Ordner und erben das Lernfeld", () => {
  const { lernfelder, faecher } = ordnerAusNamen(["LF5", "LF5/Unicode", "LF5/Speicher", "LF1", "Deutsch", "Deutsch/Gedichte"]);
  expect(lernfelder.map((o) => o.name)).toEqual(["LF1", "LF5", "LF5/Speicher", "LF5/Unicode"]);
  const unicode = lernfelder[3];
  expect(unicode).toMatchObject({ anzeige: "Unicode", titel: "LF5 › Unicode", eltern: "LF5", lernfeld: { id: "LF05", nr: 5 } });
  expect(faecher.map((o) => o.anzeige)).toEqual(["Deutsch", "Gedichte"]);
  expect(faecher[1].lernfeld).toBeUndefined();
});
