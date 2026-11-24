// @vitest-environment happy-dom
// Druckansicht: Kästen aufgeklappt mit Etikett, Grafiken als Hinweis, Bilder aus dem Notiz-Ordner.
import { afterAll, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorErweiterungen } from "./editor/erweiterungen";
import { notizHtml } from "./druck";

// wie in der App unter macOS: grafik://localhost/…
(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  convertFileSrc: (p: string, s: string) => `${s}://localhost/${encodeURIComponent(p)}`,
};
const editor = new Editor({ extensions: editorErweiterungen() });
afterAll(() => editor.destroy());

it("Kästen werden aufgeklappt gedruckt, mit Etikett statt Kennung", async () => {
  const html = await notizHtml(editor, "LF5", "> [!claude]- Erklärung\n>\n> Versteckter Text.\n");
  const kasten = html.querySelector("blockquote")!;
  expect(kasten.classList.contains("kasten--claude")).toBe(true);
  expect(kasten.textContent).not.toContain("[!claude]");
  expect(kasten.querySelector(".druck__etikett")?.textContent).toBe("Claude");
  expect(kasten.textContent).toContain("Versteckter Text.");
});

it("animierte Grafik wird zum Hinweis, Bild zeigt in den assets-Ordner der Notiz", async () => {
  const html = await notizHtml(editor, "LF5/Unicode", "![Tafel](assets/tafel.png)\n\n```grafik\nsrc: assets/join.html\n```\n");
  expect(html.querySelector("pre")).toBeNull();
  expect(html.querySelector(".druck__hinweis")?.textContent).toContain("„join“");
  // Unterordner als eigene Pfadteile, nicht als %2F
  expect(html.querySelector("img")?.getAttribute("src")).toBe("grafik://localhost/LF5/Unicode/assets/tafel.png");
});

it("die App darf drucken (sonst tut ⌘P in Tauri einfach nichts)", async () => {
  const faehigkeiten = (await import("../src-tauri/capabilities/default.json")).default as { permissions: string[] };
  expect(faehigkeiten.permissions).toContain("core:webview:allow-print");
});
