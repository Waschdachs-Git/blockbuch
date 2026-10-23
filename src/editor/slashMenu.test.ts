// @vitest-environment happy-dom
// "/fett" → das danach Getippte ist fett (vorher hob KeineGeerbteFormatierung die Formatierung sofort auf).
import { afterAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";
import { SLASH_EINTRAEGE } from "./slashMenu";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

function mitSlash(titel: string, befehl: string) {
  editor.commands.setContent(`<p>Hallo ${befehl}</p>`, { emitUpdate: false });
  editor.commands.focus("end");
  const bis = editor.state.selection.from;
  const eintrag = SLASH_EINTRAEGE.find((e) => e.titel === titel)!;
  eintrag.aktion(editor, { from: bis - befehl.length, to: bis });
  const { from, to } = editor.state.selection;
  editor.view.dispatch(editor.state.tr.insertText("x", from, to));
  return editor.getHTML();
}

describe("/-Menü: Formatierung", () => {
  it("Fett, Kursiv, Durchgestrichen wirken auf das danach Getippte", () => {
    expect(mitSlash("Fett", "/fett")).toBe("<p>Hallo <strong>x</strong></p>");
    expect(mitSlash("Kursiv", "/kursiv")).toBe("<p>Hallo <em>x</em></p>");
    expect(mitSlash("Durchgestrichen", "/durch")).toBe("<p>Hallo <s>x</s></p>");
  });

  it("die Formatierungs-Einträge stehen hinter Code und Checkliste", () => {
    const titel = SLASH_EINTRAEGE.map((e) => e.titel);
    expect(titel.indexOf("Code")).toBeLessThan(titel.indexOf("Kursiv"));
    expect(titel.indexOf("Checkliste")).toBeLessThan(titel.indexOf("Durchgestrichen"));
  });
});
