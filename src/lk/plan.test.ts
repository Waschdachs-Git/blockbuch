import { describe, expect, it } from "vitest";
import { abstandText, lksAusText, lksText, planErstellen, plusTage, stoffAbVorschlag, tageZwischen, type Lk, type StoffNotiz } from "./plan";

const notiz = (datei: string, datum: string, ordner = "LF5"): StoffNotiz => ({ ordner, datei: `${datum}-${datei}.md`, titel: datei, datum });
const lk = (teil: Partial<Lk> = {}): Lk => ({ id: "1", datum: "2026-12-04", ordner: "LF5", thema: "Datenbanken", erledigt: [], ...teil });
const leer = { mitFragen: new Set<string>(), mitKarten: new Set<string>() };

describe("LK-Planer", () => {
  it("verteilt den Stoff ältere zuerst auf die Tage, letzter Tag = Wiederholung", () => {
    const notizen = [notiz("C", "2026-11-20"), notiz("A", "2026-11-02"), notiz("B", "2026-11-10"), notiz("D", "2026-11-24")];
    const plan = planErstellen(lk(), notizen, "2026-11-30", leer);
    expect(plan.nochTage).toBe(4);
    expect(plan.tage.map((t) => t.datum)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"]);
    const notizenJeTag = plan.tage.map((t) => t.eintraege.filter((e) => e.art === "notiz").map((e) => e.text));
    expect(notizenJeTag).toEqual([["A", "B"], ["C"], ["D"], []]);
    expect(plan.tage[3].eintraege.map((e) => e.art)).toEqual(["probe", "wiederholung"]);
  });

  it("Stoff ab: nur Notizen seit der letzten LK und bis zum LK-Tag", () => {
    const notizen = [notiz("alt", "2026-10-01"), notiz("neu", "2026-11-15"), notiz("danach", "2026-12-10")];
    const plan = planErstellen(lk({ ab: "2026-11-01" }), notizen, "2026-12-01", leer);
    expect(plan.stoff.map((n) => n.titel)).toEqual(["neu"]);
    expect(stoffAbVorschlag([lk({ id: "a", datum: "2026-10-20" }), lk({ id: "b", datum: "2026-11-05" })], "LF5", "2026-12-04")).toBe("2026-11-06");
    expect(stoffAbVorschlag([lk({ datum: "2026-10-20", ordner: "LF2" })], "LF5", "2026-12-04")).toBeUndefined();
  });

  it("Erledigtes fällt heraus, der Rest wird neu verteilt; Karten jeden Tag, Hinweise am ersten Tag", () => {
    const notizen = [notiz("A", "2026-11-02"), notiz("B", "2026-11-10"), notiz("C", "2026-11-20")];
    const pfad = (n: StoffNotiz) => `${n.ordner}/${n.datei}`;
    const plan = planErstellen(lk({ erledigt: [`notiz|${pfad(notizen[0])}`] }), notizen, "2026-12-02", {
      mitFragen: new Set([pfad(notizen[1])]),
      mitKarten: new Set([pfad(notizen[2])]),
    });
    expect(plan.erledigteNotizen.map((n) => n.titel)).toEqual(["A"]);
    expect(plan.tage[0].eintraege.map((e) => e.art)).toEqual(["fragen", "karten-erstellen", "notiz", "notiz", "karten"]);
    expect(plan.tage[0].eintraege[1].text).toContain("2 Notizen");
    expect(plan.tage[1].eintraege.map((e) => e.art)).toEqual(["probe", "wiederholung", "karten"]);
  });

  it("LK heute: nur auffrischen; LK vorbei: kein Plan", () => {
    expect(planErstellen(lk(), [], "2026-12-04", leer).tage[0].eintraege[0].art).toBe("wiederholung");
    expect(planErstellen(lk(), [], "2026-12-05", leer).tage).toEqual([]);
  });

  it("ein Tag vor der LK: Stoff und Wiederholung am selben Tag", () => {
    const plan = planErstellen(lk(), [notiz("A", "2026-11-02")], "2026-12-03", leer);
    expect(plan.tage).toHaveLength(1);
    expect(plan.tage[0].eintraege.map((e) => e.art)).toEqual(["karten-erstellen", "notiz", "probe", "wiederholung"]);
  });

  it("Datumsrechnung über die Zeitumstellung, Abstandstexte, kaputte Datei", () => {
    expect(plusTage("2026-10-24", 2)).toBe("2026-10-26");
    expect(tageZwischen("2026-03-28", "2026-03-30")).toBe(2);
    expect([0, 1, -1, 5, -3].map(abstandText)).toEqual(["heute", "morgen", "gestern", "in 5 Tagen", "vor 3 Tagen"]);
    expect(() => lksAusText("kaputt")).toThrow();
    const d = lksAusText('{"lks":[{"id":"1","datum":"2026-12-04","ordner":"LF5"},{"id":"2","datum":"2026-12-4"}]}');
    expect(d.lks).toHaveLength(1);
    // unverständliche Einträge gehen beim Speichern nicht verloren
    expect(JSON.parse(lksText(d)).lks).toHaveLength(2);
  });

  it("LK-Tag hat einen eigenen Haken; Probe-LKs zählen nicht als Stoff", () => {
    const vortag = lk({ erledigt: ["wiederholung"] });
    expect(planErstellen(vortag, [], "2026-12-04", leer).tage[0].eintraege[0].schluessel).toBe("auffrischen");
    const plan = planErstellen(lk(), [notiz("A", "2026-11-20"), notiz("Probe-LK-Datenbanken", "2026-11-28")], "2026-11-30", leer);
    expect(plan.stoff.map((n) => n.titel)).toEqual(["A"]);
    expect(plan.tage[plan.tage.length - 1].eintraege[0].text).toContain("/lk Datenbanken");
  });
});
