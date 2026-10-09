// @vitest-environment happy-dom
// Praxistest 08.10.: "1024 * 1024 * 1024" wurde kursiv, und nach dem Löschen von kursivem Text
// ging es kursiv weiter.
import { afterAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { editorErweiterungen } from "./erweiterungen";
import { FETT_STERN, KURSIV_STERN, KURSIV_STRICH } from "./formatierung";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

/** Zeichen für Zeichen tippen – so wie die Tastatur (löst die Eingaberegeln aus) */
function tippe(text: string) {
  const view = editor.view;
  for (const z of text) {
    const { from, to } = view.state.selection;
    const behandelt = view.someProp("handleTextInput", (f) => f(view, from, to, z, () => view.state.tr.insertText(z, from, to)));
    if (!behandelt) view.dispatch(view.state.tr.insertText(z, from, to));
  }
}

function neu() {
  editor.commands.setContent("", { emitUpdate: false });
  editor.commands.focus("end");
}

describe("Eingaberegeln", () => {
  it("Rechnungen mit * bleiben normaler Text", () => {
    expect("1024 * 1024 *").not.toMatch(KURSIV_STERN);
    expect("a * b *").not.toMatch(KURSIV_STERN);
    expect("x _ y _").not.toMatch(KURSIV_STRICH);
    expect("2 ** 3 **").not.toMatch(FETT_STERN);
  });

  it("*kursiv* und **fett** funktionieren weiter", () => {
    expect("ein *Wort*").toMatch(KURSIV_STERN);
    expect("*zwei Wörter*").toMatch(KURSIV_STERN);
    expect("*a*").toMatch(KURSIV_STERN);
    expect("ganz **fett**").toMatch(FETT_STERN);
  });

  it("im Editor: 1024 * 1024 * 1024 bleibt unformatiert", () => {
    neu();
    tippe("1024 * 1024 * 1024 Ende");
    expect(editor.getHTML()).toBe("<p>1024 * 1024 * 1024 Ende</p>");
  });

  it("im Editor: *kursiv* und **fett** werden formatiert", () => {
    neu();
    tippe("ein *Wort* und **fett** x");
    expect(editor.getHTML()).toBe("<p>ein <em>Wort</em> und <strong>fett</strong> x</p>");
  });

  it("Markdown-Datei: Sternchen in Rechnungen bleiben beim Speichern erhalten", () => {
    neu();
    tippe("3 * 4 * 5");
    expect(editor.getMarkdown().trim()).toBe("3 \\* 4 \\* 5");
    editor.commands.setContent(editor.getMarkdown(), { contentType: "markdown", emitUpdate: false });
    expect(editor.getHTML()).toBe("<p>3 * 4 * 5</p>");
  });

  it("Unterstriche: _x_ und __x__ formatieren, snake_case bleibt", () => {
    neu();
    tippe("_x_ __y__ snake_case_name z");
    expect(editor.getHTML()).toBe("<p><em>x</em> <strong>y</strong> snake_case_name z</p>");
  });

  it("**fett** am Zeilenanfang wird nicht kursiv", () => {
    neu();
    tippe("**fett** x");
    expect(editor.getHTML()).toBe("<p><strong>fett</strong> x</p>");
  });
});

describe("Nach dem Löschen", () => {
  it("geht es nach dem Löschen eines kursiven Worts normal weiter", () => {
    editor.commands.setContent("<p>normal <em>kursiv</em></p>", { emitUpdate: false });
    const ende = editor.state.doc.content.size - 1;
    const start = ende - "kursiv".length;
    // So löscht der Browser per Rücktaste: ProseMirror übernimmt die Formatierung des Gelöschten
    const italic = editor.schema.marks.italic.create();
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, ende)).delete(start, ende);
    tr.ensureMarks([italic]);
    editor.view.dispatch(tr);
    tippe("weiter");
    expect(editor.getHTML()).toBe("<p>normal weiter</p>");
  });

  it("markierten kursiven Text löschen: danach normal", () => {
    editor.commands.setContent("<p>normal <em>kursiv</em></p>", { emitUpdate: false });
    const ende = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection({ from: ende - "kursiv".length, to: ende });
    editor.commands.deleteSelection();
    tippe("weiter");
    expect(editor.getHTML()).toBe("<p>normal weiter</p>");
  });

  it("Tippfehler am Ende eines kursiven Worts korrigieren: bleibt kursiv", () => {
    editor.commands.setContent("<p>normal <em>kursix</em></p>", { emitUpdate: false });
    const ende = editor.state.doc.content.size - 1;
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, ende)).delete(ende - 1, ende);
    tr.ensureMarks([editor.schema.marks.italic.create()]);
    editor.view.dispatch(tr);
    tippe("v");
    expect(editor.getHTML()).toBe("<p>normal <em>kursiv</em></p>");
  });

  it("ersten Buchstaben eines kursiven Worts neu tippen: bleibt kursiv", () => {
    editor.commands.setContent("<p>normal <em>kursiv</em></p>", { emitUpdate: false });
    const start = editor.state.doc.content.size - 1 - "kursiv".length;
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start + 1)).delete(start, start + 1);
    tr.ensureMarks([editor.schema.marks.italic.create()]);
    editor.view.dispatch(tr);
    tippe("K");
    expect(editor.getHTML()).toBe("<p>normal <em>Kursiv</em></p>");
  });

  it("⌘I vor dem Tippen wirkt weiterhin", () => {
    neu();
    tippe("a ");
    editor.commands.toggleItalic();
    tippe("b");
    expect(editor.getHTML()).toBe("<p>a <em>b</em></p>");
  });
});

describe("Einfügen", () => {
  function einfuegen(text: string) {
    neu();
    const ereignis = { clipboardData: { getData: (typ: string) => (typ === "text/plain" ? text : "") } };
    editor.view.pasteText(text, ereignis as unknown as ClipboardEvent);
    return editor.getHTML();
  }

  it("Rechnungen und Bezeichner bleiben unformatiert", () => {
    expect(einfuegen("2 * 3 * 4")).toBe("<p>2 * 3 * 4</p>");
    expect(einfuegen("my_var_name")).toBe("<p>my_var_name</p>");
    expect(einfuegen("call _private_attr now")).toBe("<p>call _private_attr now</p>");
    expect(einfuegen("x __init__.py")).toBe("<p>x __init__.py</p>");
  });

  it("**fett** und *kursiv* werden formatiert", () => {
    expect(einfuegen("**f** und *k* und _u_.")).toBe("<p><strong>f</strong> und <em>k</em> und <em>u</em>.</p>");
  });
});
