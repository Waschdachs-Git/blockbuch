import { expect, it } from "vitest";
import { lernfeldNummer, ordnerAusNamen } from "./lernfelder";

it("erkennt die Lernfeld-Ordner des Nutzers – ohne eigene anzulegen", () => {
  const { lernfelder, faecher } = ordnerAusNamen(["Deutsch", "LF2", "LF1", "LF5-Datenbanken", "Mathe-IT", "LF10"]);
  expect(lernfelder.map((o) => o.name)).toEqual(["LF1", "LF2", "LF5-Datenbanken", "LF10"]);
  expect(lernfelder[0]).toMatchObject({ nummer: "01", anzeige: "Unternehmen & Rolle", lernfeld: { id: "LF01" } });
  expect(lernfelder[2].anzeige).toBe("Datenbanken");
  expect(faecher.map((o) => o.name)).toEqual(["Deutsch", "Mathe-IT"]);
});

it("Lernfeld-Nummern aus Ordnernamen", () => {
  expect(lernfeldNummer("LF5")).toBe(5);
  expect(lernfeldNummer("LF05-Daten-verwalten")).toBe(5);
  expect(lernfeldNummer("lf 3")).toBe(3);
  expect(lernfeldNummer("LF5x")).toBeNull();
  expect(lernfeldNummer("Deutsch")).toBeNull();
});
