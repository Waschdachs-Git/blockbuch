// @vitest-environment happy-dom
// PDF-/Grafik-Blöcke: Cursor gerät nicht in die versteckten Angaben, Rücktaste hängt keinen Text an.
import { afterAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { editorErweiterungen } from "./erweiterungen";
import { angabenBearbeiten, angabenOffen, blockAuswahlSchluessel } from "./blockAuswahl";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

const MIT_DATEI = "Davor\n\n```grafik\nsrc: assets/join.html\nhöhe: 300\n```\n\nDanach";
const OHNE_DATEI = "Davor\n\n```grafik\nsrc: assets/\n```\n\nDanach";

function laden(md: string) {
  editor.commands.setContent(md, { contentType: "markdown", emitUpdate: false });
}
/** Position des Blocks und erste Position im Absatz "Danach" */
function positionen() {
  let block = -1;
  let danach = -1;
  editor.state.doc.forEach((n, pos) => {
    if (n.type.name === "codeBlock") block = pos;
    if (n.textContent === "Danach") danach = pos + 1;
  });
  return { block, danach };
}
const taste = (key: string) => editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key })));
const tippe = (text: string) => {
  const { from, to } = editor.state.selection;
  return editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, text, () => editor.state.tr.insertText(text, from, to)));
};

describe("PDF-/Grafik-Block als Ganzes", () => {
  it("Cursor im Block (Pfeiltasten, Suche) markiert den ganzen Block", () => {
    laden(MIT_DATEI);
    const { block } = positionen();
    editor.commands.setTextSelection(block + 3);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).from).toBe(block);
  });

  it("ohne Datei bleiben die Angaben bearbeitbar", () => {
    laden(OHNE_DATEI);
    const { block } = positionen();
    editor.commands.setTextSelection(block + 3);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
  });

  it("Rücktaste am Anfang des Absatzes danach markiert den Block, statt Text anzuhängen", () => {
    laden(MIT_DATEI);
    const vorher = editor.getMarkdown();
    editor.commands.setTextSelection(positionen().danach);
    expect(taste("Backspace")).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.getMarkdown()).toBe(vorher);
  });

  it("Entf am Ende des Absatzes davor markiert den Block", () => {
    laden(MIT_DATEI);
    editor.commands.setTextSelection(1 + "Davor".length);
    expect(taste("Delete")).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("Tippen bei markiertem Block löscht ihn nicht", () => {
    laden(MIT_DATEI);
    editor.commands.setNodeSelection(positionen().block);
    expect(tippe("x")).toBe(true);
    expect(editor.getMarkdown()).toContain("src: assets/join.html");
  });

  it("bewusst geöffnete Angaben lassen sich bearbeiten; Verlassen schließt sie wieder", () => {
    laden(MIT_DATEI);
    const { block } = positionen();
    const node = editor.state.doc.nodeAt(block)!;
    editor.view.dispatch(angabenBearbeiten(editor.state, block, node));
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(angabenOffen(editor.state, block, node)).toBe(true);
    editor.commands.setTextSelection(positionen().danach);
    expect(blockAuswahlSchluessel.getState(editor.state)).toBeNull();
  });

  it("Pfad in einen leeren Block tippen geht bis zum Ende (nicht nach dem ersten Buchstaben markiert)", () => {
    laden(OHNE_DATEI);
    const { block } = positionen();
    const node = editor.state.doc.nodeAt(block)!;
    editor.commands.setTextSelection(block + 1 + node.textContent.length);
    for (const z of "join.html") {
      const { from, to } = editor.state.selection;
      expect(editor.state.selection).toBeInstanceOf(TextSelection);
      editor.view.dispatch(editor.state.tr.insertText(z, from, to));
    }
    expect(editor.getMarkdown()).toContain("src: assets/join.html");
    // Verlassen: danach verhält sich der Block wie ein Bild
    editor.commands.setTextSelection(positionen().danach);
    editor.commands.setTextSelection(block + 3);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("Rücktaste/Entf mit Lücken-Cursor am Notizanfang/-ende werfen keinen Fehler", () => {
    laden("| a | b |\n| --- | --- |\n| 1 | 2 |");
    editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(0))));
    expect(() => taste("Backspace")).not.toThrow();
    expect(() => taste("Delete")).not.toThrow();
  });

  it("normale Codeblöcke sind nicht betroffen", () => {
    laden("```sql\nSELECT 1;\n```");
    editor.commands.setTextSelection(3);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
  });
});
