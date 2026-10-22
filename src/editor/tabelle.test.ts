// @vitest-environment happy-dom
// Spaltenbreiten: als Kommentar über der Tabelle gespeichert und beim Öffnen wieder übernommen.
import { afterAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";
import { aufraeumen, wuerdeInhaltVerlieren } from "./datei";

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
});
