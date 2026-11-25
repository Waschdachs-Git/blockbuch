import { describe, expect, it } from "vitest";
import type { Karte } from "../api";
import { bewerten, type Lernstand } from "./planer";
import { istSchwierig, mischen, passt, zahlen, zeilenBauen } from "./gruppen";

const JETZT = new Date(2026, 10, 24, 15, 0).getTime();
const k = (id: string, ordner: string, datei: string, gruppe = ""): Karte => ({ id, frage: id, antwort: "a", ordner, datei, titel: datei.replace(".md", ""), gruppe });
const KARTEN = [
  k("1", "LF5", "A.md", "Protokolle"),
  k("2", "LF5", "A.md", "OSI"),
  k("3", "LF5", "B.md"),
  k("4", "LF5/Unicode", "U.md"),
  k("5", "LF2", "N.md"),
];
const leer: Lernstand = { version: 1, karten: {} };

describe("Übersicht der Karteikarten", () => {
  it("Ordner zugeklappt; aufgeklappt mit Notizen, Unterordnern und Gruppen", () => {
    expect(zeilenBauen(KARTEN, leer, JETZT, new Set(), true).map((z) => z.name)).toEqual(["Alle Karten", "LF2", "LF5"]);
    const offen = new Set(["o|LF5", "n|LF5/A.md", "o|LF5/Unicode"]);
    const zeilen = zeilenBauen(KARTEN, leer, JETZT, offen, false);
    expect(zeilen.map((z) => `${z.tiefe}:${z.name}`)).toEqual(["0:LF2", "0:LF5", "1:A", "2:Protokolle", "2:OSI", "1:B", "1:Unicode", "2:U"]);
    expect(zeilen.find((z) => z.name === "LF5")?.zahlen.gesamt).toBe(4);
    // Notiz mit nur einer (unbenannten) Gruppe: nichts zum Aufklappen
    expect(zeilen.find((z) => z.name === "B")?.klappbar).toBe(false);
  });

  it("Auswahl filtert Ordner (mit Unterordnern), Notiz und Gruppe", () => {
    const ids = (a: Parameters<typeof passt>[1]) => KARTEN.filter((x) => passt(x, a)).map((x) => x.id);
    expect(ids({ art: "ordner", ordner: "LF5" })).toEqual(["1", "2", "3", "4"]);
    expect(ids({ art: "ordner", ordner: "LF5/Unicode" })).toEqual(["4"]);
    expect(ids({ art: "notiz", ordner: "LF5", datei: "A.md" })).toEqual(["1", "2"]);
    expect(ids({ art: "gruppe", ordner: "LF5", datei: "A.md", gruppe: "OSI" })).toEqual(["2"]);
  });

  it("fällig, schwierig, Gesamtzahl", () => {
    const gut = bewerten(undefined, 3, JETZT - 3 * 86_400_000); // seit Tagen fällig
    const vergessen = bewerten(bewerten(undefined, 3, JETZT - 9e8), 1, JETZT - 8e8);
    const morgen = bewerten(undefined, 4, JETZT);
    const l: Lernstand = { version: 1, karten: { "1": gut, "2": vergessen, "3": morgen } };
    expect(zahlen(KARTEN, l, JETZT)).toEqual({ gesamt: 5, faellig: 4, schwierig: 1 });
    expect(istSchwierig(KARTEN[1], l)).toBe(true);
    expect(istSchwierig(KARTEN[2], l)).toBe(false);
    expect(istSchwierig(KARTEN[4], l)).toBe(false); // neu = noch nicht schwierig
  });

  it("mischen behält alle Karten", () => {
    let i = 0;
    const zufall = () => [0.9, 0.1, 0.5, 0.3][i++ % 4];
    const m = mischen([1, 2, 3, 4, 5], zufall);
    expect([...m].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(m).not.toEqual([1, 2, 3, 4, 5]);
  });
});
