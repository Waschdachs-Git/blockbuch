// @vitest-environment happy-dom
// Prüft, dass Notizen beim Öffnen + Speichern im Editor nicht kaputtgehen.
import { afterAll, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";
import { aufraeumen, entschaerfeZeile, setzeZusammen, teileInlineCode, wuerdeInhaltVerlieren, zerlege } from "./datei";
import { zaunFuer } from "./codeBlock";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

/** Markdown laden und so speichern, wie es die App tut */
function rundreise(md: string): string {
  editor.commands.setContent(md, { contentType: "markdown", emitUpdate: false });
  return aufraeumen(editor.getMarkdown()).trim();
}

describe("Rundreise Laden → Speichern", () => {
  const unveraendert = [
    "# Subnetting\n\nEin **Subnetz** teilt ein Netz in *kleinere* Netze.",
    "- Netzanteil\n- Hostanteil\n  - verschachtelt",
    "1. Maske bestimmen\n2. Hosts zählen",
    "- [ ] Übung 1\n- [x] Video",
    "> **Merke:** 2^n − 2 nutzbare Hosts",
    "> Zitat\n>\n> zweiter Absatz",
    "```sql\nSELECT * FROM kunde\n-- # kein Titel\n```",
    "```grafik\nsrc: assets/subnetz.html\nhöhe: 400\n```",
    "Wenn x > 5 und y < 3",
    "a -> b => c",
    "Preis: 5 € & mehr",
    "C# und C++ und i++",
    "Zeile mit `x > 5 && y` Code",
    "```cpp\nif (a < b && c > d) {}\n```",
    "![Bild](assets/x.png)",
    "Text  \nmit Umbruch",
    "> [!claude]\n> Erklärung von Claude.\n> Zweite Zeile.",
    "> [!merke] Kurz\n> **Wichtig**",
    "> [!karten]\n> Was ist ein Join? :: Verknüpfung von Tabellen",
    "Ein Satz ❓ und 🙋 Frage",
  ];
  for (const md of unveraendert) {
    it(`bleibt gleich: ${JSON.stringify(md.slice(0, 40))}`, () => {
      expect(rundreise(md)).toBe(md);
    });
  }

  it("ist stabil – mehrfaches Speichern ändert nichts mehr", () => {
    const md = "#include <stdio.h>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- &gt; x\n\nText mit &nbsp; wörtlich";
    const eins = rundreise(md);
    expect(rundreise(eins)).toBe(eins);
    expect(rundreise(rundreise(eins))).toBe(eins);
  });

  it("schreibt < vor Buchstaben als \\< (sonst wäre es ein HTML-Tag)", () => {
    expect(rundreise("#include <stdio.h>")).toBe("#include \\<stdio.h>");
  });

  it("Codeblock mit ``` im Inhalt bekommt einen längeren Zaun", () => {
    const md = "````markdown\n```js\nlet x = 1;\n```\n````";
    expect(rundreise(md)).toBe(md);
    // ein einziger Codeblock (danach nur die leere Schreibzeile des Editors)
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
    expect(editor.state.doc.firstChild?.textContent).toContain("```js");
  });

  it("> am Anfang eines Listenpunkts bleibt Text, wird kein Zitat", () => {
    const gespeichert = rundreise("- \\> x");
    expect(gespeichert).toBe("- \\> x");
    editor.commands.setContent(gespeichert, { contentType: "markdown", emitUpdate: false });
    // Liste > Listenpunkt > Absatz (kein Zitat)
    const listenpunkt = editor.state.doc.firstChild?.firstChild;
    expect(listenpunkt?.firstChild?.type.name).toBe("paragraph");
  });

  it("leere Zeilen werden nicht zu &nbsp;", () => {
    editor.commands.setContent("<p>a</p><p></p><p></p><p>b</p>", { emitUpdate: false });
    expect(aufraeumen(editor.getMarkdown()).trim()).toBe("a\n\nb");
  });
});

describe("Schutz vor Inhaltsverlust", () => {
  it("erkennt HTML, das der Editor nicht kann", () => {
    const md = "<details><summary>Lösung</summary>42</details>";
    expect(wuerdeInhaltVerlieren(md, rundreise(md))).toBe(true);
  });
  it("schlägt bei normalen Notizen nicht an", () => {
    for (const md of ["E-Mail: a@b.de", "Wenn x > 5", "#include <stdio.h>", "C++ und i++"]) {
      expect(wuerdeInhaltVerlieren(md, rundreise(md)), md).toBe(false);
    }
  });
});

describe("aufraeumen / entschaerfeZeile", () => {
  it("lässt Codeblöcke komplett in Ruhe", () => {
    const code = "```\n&lt;x&gt;\n&nbsp;\n\n\n\n```";
    expect(aufraeumen(code)).toBe(code);
  });
  it("innere ```-Zeile mit Sprache schließt den Block nicht", () => {
    const md = "````\n```js\n&lt;x\n```\n````";
    expect(aufraeumen(md)).toBe(md);
  });
  it("Inline-Code mit maskierten oder doppelten Backticks bleibt unverändert", () => {
    expect(entschaerfeZeile("Text \\` und `&lt;div&gt;`")).toBe("Text \\` und `&lt;div&gt;`");
    expect(entschaerfeZeile("``a`&lt;b``")).toBe("``a`&lt;b``");
    expect(teileInlineCode("a `b` c")).toEqual(["a ", "`b`", " c"]);
  });
  it("> nach Listenmarkern wird maskiert", () => {
    expect(entschaerfeZeile("- &gt; x")).toBe("- \\> x");
    expect(entschaerfeZeile("1. &gt; x")).toBe("1. \\> x");
    expect(entschaerfeZeile("- [ ] &gt; x")).toBe("- [ ] \\> x");
    expect(entschaerfeZeile("> Zitat mit x &gt; 5")).toBe("> Zitat mit x > 5");
  });
  it("zaunFuer wählt einen längeren Zaun als im Code vorkommt", () => {
    expect(zaunFuer("a")).toBe("```");
    expect(zaunFuer("```js")).toBe("````");
  });
});

describe("Datei zerlegen / zusammensetzen", () => {
  it("Frontmatter, CRLF und BOM bleiben erhalten", () => {
    const roh = "﻿---\r\ndatum: 2026-10-07\r\n---\r\n\r\n# Titel\r\n";
    const d = zerlege(roh);
    expect(d.text).toBe("\n# Titel\n");
    expect(setzeZusammen(d, "# Titel")).toBe(roh);
  });
  it("Datei ohne Frontmatter", () => {
    const d = zerlege("# Nur Text\n");
    expect(setzeZusammen(d, "# Nur Text\n\nmehr")).toBe("# Nur Text\n\nmehr\n");
  });
});
