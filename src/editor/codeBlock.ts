// Codeblock mit Syntax-Farben (lowlight/highlight.js), Sprachauswahl und Tab-Einrückung
// (Tab/⇧Tab rücken ein/aus – auch mehrere markierte Zeilen; eingebaut in TipTap).
// Beim Speichern wird ein ausreichend langer Zaun gewählt: Enthält der Code selbst ```
// (z. B. eine Notiz über Markdown), wird mit ```` umschlossen – sonst wäre der Block kaputt.
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import type { Node as PMNode } from "@tiptap/pm/model";
import { grafikNodeView } from "./grafikBlock";

const basis = createLowlight(common);
/** Ohne bzw. mit unbekannter Sprache nicht raten (falsche Farben, langsam) – einfach als Text */
export const lowlight: typeof basis = { ...basis, highlightAuto: (wert: string) => basis.highlight("plaintext", wert) };

/** Sprachen für die Auswahl – die wichtigsten für Fachinformatiker AE zuerst */
export const SPRACHEN: [wert: string, name: string][] = [
  ["", "Text"],
  ["java", "Java"],
  ["csharp", "C#"],
  ["python", "Python"],
  ["sql", "SQL"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["php", "PHP"],
  ["c", "C"],
  ["cpp", "C++"],
  ["kotlin", "Kotlin"],
  ["bash", "Bash / Shell"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["xml", "XML"],
];

/** Anzeigenamen für gängige Kurzformen (```py, ```js …) – in der Datei bleibt die Kurzform stehen */
const KURZFORMEN: Record<string, string> = {
  py: "Python", js: "JavaScript", ts: "TypeScript", cs: "C#", "c#": "C#", sh: "Bash / Shell",
  shell: "Bash / Shell", kt: "Kotlin", yml: "YAML", "c++": "C++", htm: "HTML", mysql: "SQL", plaintext: "Text",
};

export function zaunFuer(code: string): string {
  const laengste = Math.max(0, ...(code.match(/`+/g) ?? []).map((r) => r.length));
  return "`".repeat(Math.max(3, laengste + 1));
}

export const SichererCodeBlock = CodeBlockLowlight.extend({
  renderMarkdown: (node, h) => {
    const sprache = (node.attrs?.language as string | undefined) || "";
    if (!node.content) return `\`\`\`${sprache}\n\n\`\`\``;
    const code = h.renderChildren(node.content);
    const zaun = zaunFuer(code);
    return [`${zaun}${sprache}`, code, zaun].join("\n");
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      // ⌥⌘L: Sprachauswahl des aktuellen Codeblocks per Tastatur öffnen (Esc führt zurück)
      "Mod-Alt-l": () => {
        if (!this.editor.isActive(this.name)) return false;
        const { $from } = this.editor.state.selection;
        const dom = this.editor.view.nodeDOM($from.before($from.depth));
        const auswahl = dom instanceof HTMLElement ? dom.querySelector("select") : null;
        auswahl?.focus();
        return !!auswahl;
      },
    };
  },

  // Sprachauswahl oben rechts im Block (Tastatur: ⌥⌘L im Codeblock, oder Sprache direkt per ```java)
  addNodeView() {
    return ({ node, editor, getPos }) => {
      // ```grafik zeigt eine lebendige Grafik statt Code
      if (node.attrs.language === "grafik") return grafikNodeView(node, editor, getPos);
      let aktuell: PMNode = node;
      const dom = document.createElement("div");
      dom.className = "codeblock";

      const kopf = document.createElement("div");
      kopf.className = "codeblock__kopf";
      kopf.contentEditable = "false";
      const auswahl = document.createElement("select");
      auswahl.className = "codeblock__sprache";
      auswahl.setAttribute("aria-label", "Programmiersprache");
      auswahl.tabIndex = -1;
      kopf.append(auswahl);

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      pre.append(code);
      dom.append(kopf, pre);

      const fuelleAuswahl = (sprache: string) => {
        const liste = [...SPRACHEN];
        // unbekannte Sprache (z. B. "grafik" oder eine Kurzform) als eigene Option behalten
        if (sprache && !liste.some(([w]) => w === sprache)) liste.push([sprache, KURZFORMEN[sprache.toLowerCase()] ? `${KURZFORMEN[sprache.toLowerCase()]} (${sprache})` : sprache]);
        auswahl.replaceChildren(
          ...liste.map(([wert, name]) => {
            const o = document.createElement("option");
            o.value = wert;
            o.textContent = name;
            return o;
          }),
        );
        auswahl.value = sprache;
        code.className = sprache ? `language-${sprache}` : "";
      };
      fuelleAuswahl((node.attrs.language as string) ?? "");

      auswahl.addEventListener("change", () => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...aktuell.attrs, language: auswahl.value || null });
            return true;
          })
          .run();
        // danach direkt weiterschreiben können (Cursor ans Ende des Codeblocks)
        requestAnimationFrame(() => {
          const p = getPos();
          if (editor.isDestroyed || typeof p !== "number") return;
          editor.commands.focus(p + aktuell.nodeSize - 1);
        });
      });

      auswahl.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        editor.commands.focus();
      });

      return {
        dom,
        contentDOM: code,
        update: (neu) => {
          // Wechsel zu/von "grafik": Darstellung neu aufbauen
          if (neu.type !== aktuell.type || neu.attrs.language === "grafik") return false;
          if (neu.attrs.language !== aktuell.attrs.language) fuelleAuswahl((neu.attrs.language as string) ?? "");
          aktuell = neu;
          return true;
        },
        stopEvent: (e) => kopf.contains(e.target as Node),
        ignoreMutation: (m) => kopf.contains(m.target),
      };
    };
  },
  // defaultLanguage bleibt null – sonst bekäme jeder neue Block "```plaintext" in die Datei.
  // Ohne Sprache greift highlightAuto, und das färbt dank `lowlight` oben einfach als Text.
}).configure({ lowlight, defaultLanguage: null, enableTabIndentation: true, tabSize: 4 });
