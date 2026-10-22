// @vitest-environment happy-dom
// Kästen ein-/ausklappen: "> [!claude]-" startet zu, Klick/⌥⌘↩ schaltet um, Cursor im versteckten Teil öffnet.
import { afterAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";
import { aufraeumen } from "./datei";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

function laden(md: string) {
  editor.commands.setContent(md, { contentType: "markdown", emitUpdate: false });
}
const kasten = () => editor.view.dom.querySelector("blockquote.kasten")!;
const istZu = () => kasten().classList.contains("kasten--zu");
/** Position im Text des ersten Kastens (nach dem gesuchten Text) */
function posNach(text: string) {
  let ziel = -1;
  editor.state.doc.descendants((n, pos) => {
    if (ziel < 0 && n.isText && n.text!.includes(text)) ziel = pos + n.text!.indexOf(text) + text.length;
  });
  return ziel;
}
// "Mod" ist auf dem Mac ⌘, sonst Strg (die Testumgebung ist kein Mac)
const mac = /Mac/.test(navigator.platform);
const umschalten = () =>
  editor.view.someProp("handleKeyDown", (f) =>
    f(editor.view, new KeyboardEvent("keydown", { key: "Enter", metaKey: mac, ctrlKey: !mac, altKey: true })),
  );

// Wie Claude es schreiben soll: Titelzeile, Leerzeile im Kasten, dann der Text
const MD = "# Notiz\n\n> [!claude]- Erklärung zur Grafik\n>\n> Erster Absatz.\n>\n> Zweiter Absatz.\n\nDanach.";

describe("Kästen einklappen", () => {
  it("[!claude]- startet eingeklappt, [!claude] offen", () => {
    laden(MD);
    expect(istZu()).toBe(true);
    laden(MD.replace("[!claude]-", "[!claude]"));
    expect(istZu()).toBe(false);
  });

  it("die Datei bleibt beim Laden und Speichern unverändert", () => {
    laden(MD);
    expect(aufraeumen(editor.getMarkdown())).toContain("> [!claude]- Erklärung zur Grafik");
  });

  it("⌥⌘↩ im Kasten klappt auf und zu, ohne die Datei zu ändern", () => {
    laden(MD);
    editor.commands.setTextSelection(posNach("Erklärung"));
    const vorher = editor.getMarkdown();
    umschalten();
    expect(istZu()).toBe(false);
    umschalten();
    expect(istZu()).toBe(true);
    expect(editor.getMarkdown()).toBe(vorher);
  });

  it("Zuklappen setzt den Cursor in die sichtbare erste Zeile", () => {
    laden(MD.replace("[!claude]-", "[!claude]"));
    editor.commands.setTextSelection(posNach("Zweiter"));
    umschalten();
    expect(istZu()).toBe(true);
    expect(editor.state.selection.from).toBeLessThan(posNach("Erster"));
  });

  it("Cursor in den versteckten Teil (z. B. Sprung aus der Suche) klappt auf", () => {
    laden(MD);
    expect(istZu()).toBe(true);
    editor.commands.setTextSelection(posNach("Zweiter"));
    expect(istZu()).toBe(false);
  });

  it("Klappzustand bleibt beim Tippen an anderer Stelle erhalten", () => {
    laden(MD.replace("[!claude]-", "[!claude]"));
    editor.commands.setTextSelection(posNach("Erklärung"));
    umschalten();
    expect(istZu()).toBe(true);
    // davor einfügen verschiebt den Kasten – der Zustand wandert mit
    editor.commands.setTextSelection(posNach("Notiz"));
    editor.commands.insertContent(" mit mehr Titel");
    expect(istZu()).toBe(true);
  });

  it("das '-' löschen oder tippen klappt einen offenen Kasten nicht zu", () => {
    laden(MD);
    editor.commands.setTextSelection(posNach("Zweiter")); // klappt auf
    expect(istZu()).toBe(false);
    const minus = posNach("[!claude]-");
    editor.commands.deleteRange({ from: minus - 1, to: minus });
    expect(istZu()).toBe(false);
    editor.commands.insertContentAt(minus - 1, "-");
    expect(istZu()).toBe(false);
  });

  it("Klick auf das Etikett klappt um", () => {
    laden(MD);
    const etikett = editor.view.dom.querySelector(".kasten__kennung") as HTMLElement;
    const pos = posNach("[!clau");
    editor.view.someProp("handleClick", (f) => f(editor.view, pos, { target: etikett } as unknown as MouseEvent));
    expect(istZu()).toBe(false);
  });

  it("Zuklappen mit Auswahl bis in den versteckten Teil: Auswahl wandert in die erste Zeile", () => {
    laden(MD.replace("[!claude]-", "[!claude]"));
    editor.commands.setTextSelection({ from: posNach("Erklärung"), to: posNach("Zweiter") });
    umschalten();
    expect(istZu()).toBe(true);
    expect(editor.state.selection.to).toBeLessThan(posNach("Erster"));
  });

  it("⌥⌘↩ außerhalb eines Kastens macht nichts", () => {
    laden(MD);
    editor.commands.setTextSelection(posNach("Danach"));
    expect(umschalten()).toBeFalsy();
  });
});
