// @vitest-environment happy-dom
// Spaltenbreiten: als Kommentar über der Tabelle gespeichert und beim Öffnen wieder übernommen.
import { afterAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";
import { aufraeumen, wuerdeInhaltVerlieren } from "./datei";
import { CellSelection } from "@tiptap/pm/tables";
import { angabenLesen, trennen, zellName, zelleAus } from "./tabelle";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

function laden(md: string) {
  editor.commands.setContent(md, { contentType: "markdown", emitUpdate: false });
}
const speichern = () => aufraeumen(editor.getMarkdown());
function breiten(): (number[] | null)[] {
  const tabelle = editor.state.doc.firstChild!.type.name === "table" ? editor.state.doc.firstChild! : editor.state.doc.child(1);
  const zellen: (number[] | null)[] = [];
  tabelle.firstChild!.forEach((z) => zellen.push(z.attrs.colwidth));
  return zellen;
}

const OHNE = "| Begriff | Erklärung |\n| --- | --- |\n| PK | Primärschlüssel |";
const MIT = "<!-- spalten: 160 0 -->\n" + OHNE;

describe("Tabellen mit Spaltenbreiten", () => {
  it("Tabelle ohne Breiten bleibt reines Markdown", () => {
    laden(OHNE);
    expect(breiten()).toEqual([null, null]);
    expect(speichern()).not.toContain("<!--");
  });

  it("Breiten aus dem Kommentar werden übernommen und wieder gespeichert", () => {
    laden(MIT);
    expect(breiten()).toEqual([[160], null]);
    const md = speichern();
    expect(md).toMatch(/^<!-- spalten: 160 0 -->\n\| Begriff/);
    expect(wuerdeInhaltVerlieren(MIT, md)).toBe(false);
  });

  it("gezogene Breite wird gespeichert", () => {
    laden(OHNE);
    // so speichert das Ziehen am Spaltenrand die Breite (columnResizing setzt colwidth)
    const tr = editor.state.tr;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === "tableHeader" || n.type.name === "tableCell") {
        if (n.textContent === "Erklärung" || n.textContent === "Primärschlüssel") tr.setNodeMarkup(pos, undefined, { ...n.attrs, colwidth: [240] });
      }
    });
    editor.view.dispatch(tr);
    expect(speichern()).toMatch(/^<!-- spalten: 0 240 -->\n/);
  });

  it("ungewöhnliche Kommentare öffnen die Notiz nicht schreibgeschützt", () => {
    for (const md of [
      "<!-- spalten: 0 0 -->\n" + OHNE, // alle automatisch
      "<!-- spalten: 160 0 0 -->\n" + OHNE, // mehr Zahlen als Spalten
      "<!-- Spalten: 160.5 0 -->\n" + OHNE, // Großbuchstabe, Kommazahl
      "Text\n\n<!-- spalten: 160 0 -->\n\nkeine Tabelle", // Tabelle gelöscht
    ]) {
      laden(md);
      expect(wuerdeInhaltVerlieren(md, speichern()), md).toBe(false);
    }
    laden("<!-- Spalten: 160.5 0 -->\n" + OHNE);
    expect(breiten()).toEqual([[161], null]);
  });

  it("Text vor und nach der Tabelle bleibt erhalten, Kommentar kommt nicht in den Text", () => {
    const md = `Davor\n\n${MIT}\n\nDanach`;
    laden(md);
    expect(editor.getText()).not.toContain("spalten");
    const zurueck = speichern();
    expect(zurueck).toContain("Davor");
    expect(zurueck).toContain("<!-- spalten: 160 0 -->\n| Begriff");
    expect(zurueck).toContain("Danach");
    expect(wuerdeInhaltVerlieren(md, zurueck)).toBe(false);
  });

  it("⌥⌘↓ / ⌥⌘→ fügen Zeile und Spalte ein", () => {
    laden(OHNE);
    editor.commands.setTextSelection(4); // in der ersten Zelle
    const mac = /Mac/.test(navigator.platform);
    const taste = (key: string) =>
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key, metaKey: mac, ctrlKey: !mac, altKey: true })));
    expect(taste("ArrowDown")).toBe(true);
    expect(taste("ArrowRight")).toBe(true);
    const tabelle = editor.state.doc.firstChild!;
    expect(tabelle.childCount).toBe(3); // Kopf + neue Zeile + PK
    expect(tabelle.firstChild!.childCount).toBe(3);
  });

  it("Spalte löschen passt die gespeicherten Breiten an", () => {
    laden("<!-- spalten: 160 240 -->\n" + OHNE);
    editor.commands.setTextSelection(4);
    editor.commands.deleteColumn();
    expect(speichern()).toMatch(/^<!-- spalten: 240 -->\n\| Erklärung/);
  });
});

const DREI = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";

/** Zellen der Tabelle als "Text/colspanxrowspan/farbe" je Zeile */
function zellen(): string[][] {
  const tabelle = editor.state.doc.firstChild!;
  const out: string[][] = [];
  tabelle.forEach((zeile) => {
    const z: string[] = [];
    zeile.forEach((zelle) => z.push(`${zelle.textContent}/${zelle.attrs.colspan}x${zelle.attrs.rowspan}${zelle.attrs.farbe ? `/${zelle.attrs.farbe}` : ""}`));
    out.push(z);
  });
  return out;
}

/** Zellen von a bis b (Text) markieren, wie mit der Maus gezogen */
function markiere(a: string, b: string) {
  const pos: Record<string, number> = {};
  editor.state.doc.descendants((n, p) => {
    if (n.type.name === "tableCell" || n.type.name === "tableHeader") pos[n.textContent] = p;
  });
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, pos[a], pos[b])));
}

describe("Verbundene und markierte Zellen", () => {
  it("Zellnamen wie in Excel", () => {
    expect([zellName(0, 0), zellName(2, 1), zellName(0, 26)]).toEqual(["A1", "B3", "AA1"]);
    expect(zelleAus("b3")).toEqual([2, 1]);
    expect(zelleAus("AA1")).toEqual([0, 26]);
    expect(zelleAus("A0")).toBeNull();
    const a = angabenLesen("<!-- verbunden: B3:A2 X -->\n<!-- markiert: Grün A1, rot B2 C3 quatsch -->\n");
    expect(a.verbunden).toEqual([{ r: 1, c: 0, rs: 2, cs: 2 }]);
    expect(a.markiert).toEqual([[0, 0, "gruen"], [1, 1, "rot"], [2, 2, "rot"]]);
  });

  it("Verbinden und Färben werden als Kommentar gespeichert und wieder geladen", () => {
    laden(DREI);
    markiere("1", "2");
    expect(editor.commands.mergeCells()).toBe(true);
    markiere("A", "B");
    editor.commands.setCellAttribute("farbe", "gelb");
    markiere("6", "6");
    editor.commands.setCellAttribute("farbe", "rot");
    const md = speichern();
    expect(md).toContain("<!-- verbunden: A2:B2 -->\n<!-- markiert: gelb A1 B1 rot C3 -->\n| A");
    // in der Datei: Text oben links, die überdeckte Zelle leer
    expect(md).toMatch(/\| 1<br>2 \|\s+\|\s*3\s*\|/);
    expect(wuerdeInhaltVerlieren(DREI, md)).toBe(false);
    laden(md);
    expect(zellen()).toEqual([["A/1x1/gelb", "B/1x1/gelb", "C/1x1"], ["12/2x1", "3/1x1"], ["4/1x1", "5/1x1", "6/1x1/rot"]]);
    expect(speichern()).toBe(md);
  });

  it("über Zeilen verbunden; Trennen entfernt den Kommentar", () => {
    laden(DREI);
    markiere("2", "5");
    editor.commands.mergeCells();
    const md = speichern();
    expect(md).toContain("<!-- verbunden: B2:B3 -->");
    laden(md);
    expect(zellen()[1]).toEqual(["1/1x1", "25/1x2", "3/1x1"]);
    expect(zellen()[2]).toEqual(["4/1x1", "6/1x1"]);
    markiere("25", "25");
    expect(editor.commands.splitCell()).toBe(true);
    expect(speichern()).not.toContain("verbunden");
  });

  it("kaputte Angaben: Tabelle bleibt heil, Text in überdeckten Zellen geht nicht verloren", () => {
    const md = "<!-- verbunden: A2:C2 B2:B3 Z9:Z10 -->\n<!-- markiert: gelb A1 Q7 -->\n" + DREI;
    laden(md);
    // A2:C2 gilt (Text der überdeckten Zellen wandert hinein), B2:B3 überlappt → übergangen
    expect(zellen()[1]).toEqual(["123/3x1"]);
    expect(zellen()[2]).toEqual(["4/1x1", "5/1x1", "6/1x1"]);
    expect(wuerdeInhaltVerlieren(md, speichern())).toBe(false);
  });

  it("ganze Zeilen verbinden (Zeile darunter bleibt leer) übersteht Speichern und Laden", () => {
    laden("| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |");
    markiere("1", "4");
    editor.commands.mergeCells();
    const md = speichern();
    expect(md).toContain("<!-- verbunden: A2:B3 -->");
    laden(md);
    expect(zellen()).toEqual([["A/1x1", "B/1x1"], ["1234/2x2"], []]);
    expect(speichern()).toBe(md);
  });

  it("eigener Kommentar „markiert: …“ ist keine Tabellenangabe – Notiz bleibt geschützt", () => {
    const md = "Absatz\n\n<!-- markiert: noch Quellen prüfen -->\n\nWeiter";
    laden(md);
    expect(wuerdeInhaltVerlieren(md, speichern())).toBe(true);
    // auch direkt über einer Tabelle: wird nicht als Angabe gelesen
    const md2 = "<!-- markiert: noch Quellen prüfen -->\n" + DREI;
    laden(md2);
    expect(wuerdeInhaltVerlieren(md2, speichern())).toBe(true);
  });

  it("Trennen einer Kopfzelle, die in den Text reicht: unten wird es eine normale Zelle", () => {
    laden("<!-- verbunden: A1:A2 -->\n" + DREI);
    markiere("A1", "A1");
    expect(trennen(editor)).toBe(true);
    const arten: string[] = [];
    editor.state.doc.firstChild!.child(1).forEach((z) => arten.push(z.type.name));
    expect(arten).toEqual(["tableCell", "tableCell", "tableCell"]);
    expect(editor.state.doc.firstChild!.child(0).firstChild!.type.name).toBe("tableHeader");
  });

  it("Spaltenbreiten und Verbinden zusammen", () => {
    laden("<!-- spalten: 100 200 0 -->\n<!-- verbunden: A1:B1 -->\n" + DREI);
    expect(zellen()[0]).toEqual(["AB/2x1", "C/1x1"]);
    expect(editor.state.doc.firstChild!.firstChild!.firstChild!.attrs.colwidth).toEqual([100, 200]);
    expect(speichern()).toMatch(/^<!-- spalten: 100 200 0 -->\n<!-- verbunden: A1:B1 -->\n\| A<br>B \|/);
  });
});
