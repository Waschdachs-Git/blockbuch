// Codeblock mit Syntax-Farben (lowlight/highlight.js), Sprachauswahl und Tab-Einrückung.
// Beim Speichern wird ein ausreichend langer Zaun gewählt: Enthält der Code selbst ```
// (z. B. eine Notiz über Markdown), wird mit ```` umschlossen – sonst wäre der Block kaputt.
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import type { Node as PMNode } from "@tiptap/pm/model";

export const lowlight = createLowlight(common);

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

const EINRUECKUNG = "    ";

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
      // Tab rückt im Code ein, statt den Editor zu verlassen
      Tab: () => {
        if (!this.editor.isActive(this.name)) return false;
        return this.editor.commands.insertContent(EINRUECKUNG);
      },
      // ⇧Tab entfernt bis zu 4 Leerzeichen am Anfang der aktuellen Zeile
      "Shift-Tab": () => {
        if (!this.editor.isActive(this.name)) return false;
        const { $from } = this.editor.state.selection;
        const text = $from.parent.textContent;
        const zeilenStart = text.lastIndexOf("\n", $from.parentOffset - 1) + 1;
        const leer = /^ {1,4}/.exec(text.slice(zeilenStart))?.[0].length ?? 0;
        if (leer === 0) return true;
        const start = $from.start() + zeilenStart;
        return this.editor.commands.deleteRange({ from: start, to: start + leer });
      },
    };
  },

  // Sprachauswahl oben rechts im Block (Tastatur: Tab-Taste erreicht sie nicht – Sprache per ```java)
  addNodeView() {
    return ({ node, editor, getPos }) => {
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
        if (sprache && !liste.some(([w]) => w === sprache)) liste.push([sprache, KURZFORMEN[sprache.toLowerCase()] ?? sprache]);
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
        requestAnimationFrame(() => editor.commands.focus(pos + aktuell.nodeSize - 1));
      });

      return {
        dom,
        contentDOM: code,
        update: (neu) => {
          if (neu.type !== aktuell.type) return false;
          if (neu.attrs.language !== aktuell.attrs.language) fuelleAuswahl((neu.attrs.language as string) ?? "");
          aktuell = neu;
          return true;
        },
        stopEvent: (e) => kopf.contains(e.target as Node),
        ignoreMutation: (m) => kopf.contains(m.target),
      };
    };
  },
}).configure({ lowlight, defaultLanguage: null });
