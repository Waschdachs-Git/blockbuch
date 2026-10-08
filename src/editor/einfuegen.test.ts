// @vitest-environment happy-dom
import { afterAll, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./erweiterungen";
import { siehtAusWieMarkdown } from "./dateiablage";

const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

it("erkennt Markdown aus claude.ai, aber keinen normalen Text", () => {
  expect(siehtAusWieMarkdown("## Primärschlüssel\n\nEin **Primärschlüssel** identifiziert …")).toBe(true);
  expect(siehtAusWieMarkdown("- Punkt eins\n- Punkt zwei")).toBe(true);
  expect(siehtAusWieMarkdown("> [!claude]\n> Erklärung")).toBe(true);
  expect(siehtAusWieMarkdown("| a | b |\n| --- | --- |")).toBe(true);
  expect(siehtAusWieMarkdown("Ganz normaler Satz.")).toBe(false);
  expect(siehtAusWieMarkdown("Zeile eins\nZeile zwei")).toBe(false);
  expect(siehtAusWieMarkdown("5 - 3 = 2")).toBe(false);
});

it("eingefügtes Markdown wird formatiert – inklusive Claude-Kasten", () => {
  editor.commands.setContent("", { emitUpdate: false });
  editor.commands.insertContent("## Primärschlüssel\n\n> [!claude]\n> Ein **Primärschlüssel** ist eindeutig.", {
    contentType: "markdown",
  });
  const typen = editor.getJSON().content?.map((n) => n.type);
  expect(typen).toContain("heading");
  expect(typen).toContain("blockquote");
  expect(editor.view.dom.querySelector("blockquote.kasten--claude")).not.toBeNull();
});
