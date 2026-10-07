// @vitest-environment happy-dom
// ⌘Z darf nach dem Laden / nach einer Änderung von außen nicht den alten Stand zurückholen –
// sonst würde das Autosave Claudes Änderung mit dem alten Text überschreiben.
import { afterAll, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

/** So setzt EditorPane Inhalte (inhaltSetzen) */
function setzeOhneVerlauf(text: string) {
  editor
    .chain()
    .command(({ tr }) => {
      tr.setMeta("addToHistory", false);
      return true;
    })
    .setContent(text, { contentType: "markdown", emitUpdate: false })
    .run();
}

it("⌘Z holt nach einer Änderung von außen nicht den alten Stand zurück", () => {
  setzeOhneVerlauf("# Notiz\n\nmein Text");
  editor.commands.focus("end");
  editor.commands.insertContent(" getippt");
  setzeOhneVerlauf("# Notiz\n\nVersion von Claude");
  editor.commands.undo();
  editor.commands.undo();
  expect(editor.getText()).toContain("Version von Claude");
  expect(editor.getText()).not.toContain("getippt");
});

it("⌘Z nach Notizwechsel holt nicht die vorige Notiz zurück", () => {
  setzeOhneVerlauf("# Notiz A\n\nInhalt A");
  editor.commands.focus("end");
  editor.commands.insertContent(" mehr A");
  setzeOhneVerlauf("# Notiz B\n\nInhalt B");
  editor.commands.undo();
  expect(editor.getText()).toContain("Inhalt B");
  expect(editor.getText()).not.toContain("A");
});

it("normales ⌘Z beim Tippen funktioniert weiter", () => {
  setzeOhneVerlauf("Start");
  editor.commands.focus("end");
  editor.commands.insertContent(" neu");
  editor.commands.undo();
  expect(editor.getText()).toBe("Start");
});
