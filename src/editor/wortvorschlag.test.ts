// @vitest-environment happy-dom
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { editorErweiterungen } from "./erweiterungen";
import { abstand, setzeWortschatz, vorschlagFuer, wortvorschlagSchluessel } from "./wortvorschlag";

beforeEach(() =>
  setzeWortschatz([
    { wort: "Primärschlüssel", gewicht: 9 },
    { wort: "Primzahl", gewicht: 2 },
    { wort: "Fremdschlüssel", gewicht: 5 },
    { wort: "IP-Adresse", gewicht: 3 },
    { wort: "Datenbank", gewicht: 4 },
    { wort: "normalisieren", gewicht: 3 },
    { wort: "Schulung", gewicht: 2 },
    { wort: "Tabelle", gewicht: 6 },
    { wort: "Handlungsschritte", gewicht: 3 },
    { wort: "Primerschlusel", gewicht: 1 }, // eigener Tippfehler, nur einmal
  ]),
);

describe("vorschlagFuer", () => {
  it("ergänzt nach 3 Buchstaben das häufigste Wort", () => {
    expect(vorschlagFuer("Pri")).toBe("Primärschlüssel");
    expect(vorschlagFuer("Pr")).toBeNull();
    expect(vorschlagFuer("Primz")).toBe("Primzahl");
  });

  it("Umlaute und Groß-/Kleinschreibung egal", () => {
    expect(vorschlagFuer("primar")).toBe("Primärschlüssel");
    expect(vorschlagFuer("fremd")).toBe("Fremdschlüssel");
    expect(vorschlagFuer("IP-A")).toBe("IP-Adresse");
  });

  it("Satzanfang: kleines Wort wird groß", () => {
    expect(vorschlagFuer("Norm")).toBe("Normalisieren");
    expect(vorschlagFuer("norm")).toBe("normalisieren");
  });

  it("Tippfehler: ähnlich geschriebenes Wort", () => {
    expect(vorschlagFuer("Primer")).toBe("Primärschlüssel");
    expect(vorschlagFuer("Primerschlüsel")).toBe("Primärschlüssel");
    expect(vorschlagFuer("Dtaenb")).toBe("Datenbank"); // vertauschte Buchstaben
    expect(vorschlagFuer("Xyzabc")).toBeNull();
  });

  it("bekannte Wörter werden nicht 'verbessert', zu kurze Ergänzungen nicht gezeigt", () => {
    expect(vorschlagFuer("Schulung")).toBeNull();
    expect(vorschlagFuer("Schulun")).toBeNull(); // nur 1 Buchstabe fehlt
  });

  it("richtig geschriebene kurze Wörter werden nicht 'korrigiert'", () => {
    expect(vorschlagFuer("Tafel")).toBeNull();
    expect(vorschlagFuer("Hund")).toBeNull();
  });

  it("einmalige eigene Tippfehler werden nicht vorgeschlagen", () => {
    expect(vorschlagFuer("Primers")).not.toBe("Primerschlusel");
  });

  it("Ligaturen aus PDFs: ﬁ wird wie fi behandelt", () => {
    setzeWortschatz([{ wort: "Deﬁnition", gewicht: 3 }]);
    expect(vorschlagFuer("Defi")).toBe("Definition");
  });

  it("Wörter der offenen Notiz zählen mit", () => {
    expect(vorschlagFuer("Prim", new Map([["Primzahlzerlegung", 5]]))).toBe("Primzahlzerlegung");
  });

  it("abstand: vertauschte Buchstaben zählen 1", () => {
    expect(abstand("daten", "dtaen")).toBe(1);
    expect(abstand("primer", "primar")).toBe(1);
  });
});

describe("im Editor", () => {
  // Esc-Verhalten wie in EditorPane: ohne Vorschlag geht Esc zurück in die Notizliste
  let zurueck = 0;
  const editor = new Editor({
    extensions: editorErweiterungen(),
    editorProps: {
      handleKeyDown: (view, event) => {
        if (event.key === "Escape" && !wortvorschlagSchluessel.getState(view.state)) {
          zurueck++;
          return true;
        }
        return false;
      },
    },
  });
  afterAll(() => editor.destroy());

  function tippe(text: string) {
    const view = editor.view;
    for (const z of text) {
      const { from, to } = view.state.selection;
      const behandelt = view.someProp("handleTextInput", (f) => f(view, from, to, z, () => view.state.tr.insertText(z, from, to)));
      if (!behandelt) view.dispatch(view.state.tr.insertText(z, from, to));
    }
  }
  const vorschlag = () => wortvorschlagSchluessel.getState(editor.state);
  const taste = (key: string) =>
    editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key })));

  function neu(inhalt = "") {
    editor.commands.setContent(inhalt, { emitUpdate: false });
    editor.commands.focus("end");
  }

  it("Tab übernimmt den Vorschlag", () => {
    neu();
    tippe("Der Pri");
    expect(vorschlag()?.wort).toBe("Primärschlüssel");
    expect(taste("Tab")).toBe(true);
    expect(editor.getText()).toBe("Der Primärschlüssel");
    expect(vorschlag()).toBeNull();
  });

  it("Tab ersetzt einen Tippfehler", () => {
    neu();
    tippe("Der Primer");
    taste("Tab");
    expect(editor.getText()).toBe("Der Primärschlüssel");
  });

  it("Esc blendet nur den Vorschlag aus, erst das zweite Esc verlässt die Notiz", () => {
    neu();
    zurueck = 0;
    tippe("Pri");
    expect(taste("Escape")).toBe(true);
    expect(vorschlag()).toBeNull();
    expect(zurueck).toBe(0);
    taste("Escape");
    expect(zurueck).toBe(1);
  });

  it("nach ⌘Z kommt kein Vorschlag zurück", () => {
    neu();
    tippe("Der Pri");
    // eigener Rückgängig-Schritt für Tab (sonst fasst der Verlauf alles schnell Getippte zusammen)
    editor.view.dispatch(closeHistory(editor.state.tr));
    taste("Tab");
    expect(editor.getText()).toBe("Der Primärschlüssel");
    editor.commands.undo();
    expect(editor.getText()).toContain("Pri");
    expect(vorschlag()).toBeNull();
  });

  it("Löschen einer Auswahl zeigt keinen Vorschlag", () => {
    neu("<p>Daten und noch mehr Text</p>");
    editor.commands.setTextSelection({ from: 6, to: editor.state.doc.content.size - 1 });
    editor.commands.deleteSelection();
    expect(vorschlag()).toBeNull();
  });

  it("kein Vorschlag in Web- und Mail-Adressen", () => {
    neu();
    tippe("www.Dat");
    expect(vorschlag()).toBeNull();
    tippe(" name@Dat");
    expect(vorschlag()).toBeNull();
  });

  it("Vorschlag steht nicht im gespeicherten Text", () => {
    neu();
    tippe("Daten");
    expect(vorschlag()).not.toBeNull();
    expect(editor.getMarkdown()).toBe("Daten");
  });

  it("kein Vorschlag in Code, nach / oder mitten im Wort", () => {
    neu("<pre><code>x</code></pre>");
    editor.commands.setTextSelection(2); // hinter das x im Code-Block (danach folgt ein leerer Absatz)
    tippe(" Pri");
    expect(vorschlag()).toBeNull();
    neu();
    tippe("/Pri");
    expect(vorschlag()).toBeNull();
    neu("<p>ndung</p>");
    editor.commands.setTextSelection(1);
    tippe("Pri");
    expect(vorschlag()).toBeNull();
  });

  it("Cursor bewegen blendet den Vorschlag aus", () => {
    neu();
    tippe("Daten");
    expect(vorschlag()?.wort).toBe("Datenbank");
    editor.commands.setTextSelection(1);
    expect(vorschlag()).toBeNull();
  });

  it("Tab in einer Liste ohne Vorschlag rückt weiter ein (nicht abgefangen)", () => {
    neu("<ul><li><p>a</p></li><li><p>b</p></li></ul>");
    expect(vorschlag()).toBeNull();
    expect(wortvorschlagSchluessel.get(editor.state)?.props.handleKeyDown?.call(
      wortvorschlagSchluessel.get(editor.state)!, editor.view, new KeyboardEvent("keydown", { key: "Tab" }))).toBe(false);
  });
});
