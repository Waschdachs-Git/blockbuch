// @vitest-environment happy-dom
import { afterAll, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";
import { aufraeumen } from "./datei";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());
const md = () => aufraeumen(editor.getMarkdown()).trim();
const taste = (key: string, shiftKey = false) =>
  editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key, shiftKey })));

it("Codeblock ohne Sprache bleibt ohne Sprache (kein ```plaintext)", () => {
  editor.commands.setContent("```\nSELECT 1;\n```", { contentType: "markdown", emitUpdate: false });
  expect(md()).toBe("```\nSELECT 1;\n```");
  editor.commands.setContent("Text", { contentType: "markdown", emitUpdate: false });
  editor.commands.focus("end");
  editor.commands.setCodeBlock();
  expect(md()).toBe("```\nText\n```");
});

it("Tab mit markierten Zeilen rückt ein, statt Text zu löschen", () => {
  editor.commands.setContent("```java\nint a;\nint b;\n```", { contentType: "markdown", emitUpdate: false });
  // beide Zeilen komplett markiert (Inhalt beginnt bei Position 1)
  editor.commands.setTextSelection({ from: 1, to: 14 });
  taste("Tab");
  expect(editor.state.doc.firstChild?.textContent).toBe("    int a;\n    int b;");
  taste("Tab", true);
  expect(editor.state.doc.firstChild?.textContent).toBe("int a;\nint b;");
});

it("Codeblock ohne Sprache wird nicht geraten eingefärbt", () => {
  editor.commands.setContent("```\nSELECT id = 1;\n```", { contentType: "markdown", emitUpdate: false });
  expect(editor.view.dom.querySelectorAll("pre [class^=hljs-]").length).toBe(0);
});

it("Tab in Listen rückt weiterhin den Listenpunkt ein", () => {
  editor.commands.setContent("- a\n- b", { contentType: "markdown", emitUpdate: false });
  // Cursor in "b" (nicht in die leere Schreibzeile unter der Liste)
  let pos = 0;
  editor.state.doc.descendants((n, p) => {
    if (n.isText && n.text === "b") pos = p + 1;
  });
  editor.commands.setTextSelection(pos);
  taste("Tab");
  expect(md()).toBe("- a\n  - b");
});
