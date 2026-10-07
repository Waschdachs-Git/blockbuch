// Kästen ("Callouts") und Schnellmarker.
//
// Kästen sind normale Zitate, deren erste Zeile mit einer Kennung beginnt – wie in Obsidian/GitHub:
//   > [!claude]   Ergänzung von Claude (Claude schreibt nur hier, nie in deine Mitschrift)
//   > [!merke]    Merksatz
//   > [!karten]   Karteikarten, eine pro Zeile: Frage :: Antwort
// In der Datei bleibt es lesbares Markdown; der Editor färbt die Kästen nur ein.
//
// Schnellmarker beim Mitschreiben:
//   ⌘⇧U  ❓  unklar – später mit /aufbereiten klären lassen
//   ⌘⇧L  🙋  Lehrkraft fragen

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export const MARKER_UNKLAR = "❓";
export const MARKER_FRAGEN = "🙋";

export const KASTEN_ARTEN: Record<string, string> = {
  claude: "Claude",
  merke: "Merke",
  karten: "Karteikarten",
  tipp: "Tipp",
  achtung: "Achtung",
};

const KENNUNG = /^\[!([A-Za-z-]+)\]/;

function dekorationen(doc: PMNode): DecorationSet {
  const deko: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "blockquote") return true;
    const erster = node.firstChild;
    const m = erster?.isTextblock ? KENNUNG.exec(erster.textContent) : null;
    if (m) {
      const art = m[1].toLowerCase();
      deko.push(Decoration.node(pos, pos + node.nodeSize, { class: `kasten kasten--${art}` }));
      // Kennung als kleines Etikett darstellen (bleibt editierbarer Text)
      const start = pos + 2; // Zitat öffnen + Absatz öffnen
      deko.push(
        Decoration.inline(start, start + m[0].length, {
          class: "kasten__kennung",
          "data-name": KASTEN_ARTEN[art] ?? m[1],
        }),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, deko);
}

/** Zählt offene Schnellmarker im Dokument */
export function zaehleMarker(doc: PMNode): { unklar: number; fragen: number } {
  const text = doc.textBetween(0, doc.content.size, "\n", "\n");
  return {
    unklar: text.split(MARKER_UNKLAR).length - 1,
    fragen: text.split(MARKER_FRAGEN).length - 1,
  };
}

export const Kaesten = Extension.create({
  name: "kaesten",

  addKeyboardShortcuts() {
    const marker = (zeichen: string) => () => {
      // Leerzeichen davor, wenn direkt an ein Wort angehängt wird
      const { $from } = this.editor.state.selection;
      const davor = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset);
      return this.editor.commands.insertContent((davor && davor !== " " ? " " : "") + zeichen + " ");
    };
    return {
      "Mod-Shift-u": marker(MARKER_UNKLAR),
      "Mod-Shift-l": marker(MARKER_FRAGEN),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("kaesten"),
        state: {
          init: (_, { doc }) => dekorationen(doc),
          apply: (tr, alt) => (tr.docChanged ? dekorationen(tr.doc) : alt),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
