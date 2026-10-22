// Kästen ("Callouts") und Schnellmarker.
//
// Kästen sind normale Zitate, deren erste Zeile mit einer Kennung beginnt – wie in Obsidian/GitHub:
//   > [!claude]   Ergänzung von Claude (Claude schreibt nur hier, nie in deine Mitschrift)
//   > [!merke]    Merksatz
//   > [!karten]   Karteikarten, eine pro Zeile: Frage :: Antwort
// In der Datei bleibt es lesbares Markdown; der Editor färbt die Kästen nur ein.
//
// Einklappen: Ein Klick auf das Etikett (oder ⌥⌘↩ im Kasten) klappt den Kasten zu – nur die erste
// Zeile bleibt sichtbar. "> [!claude]-" startet eingeklappt (wie in Obsidian). Das Auf- und Zuklappen
// ändert die Datei nicht; kommt der Cursor (Pfeiltasten, Suche) in den versteckten Teil, klappt er auf.
//
// Schnellmarker beim Mitschreiben:
//   ⌘⇧U  ❓  unklar – später mit /aufbereiten klären lassen
//   ⌘⇧L  🙋  Lehrkraft fragen

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
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

/** "[!claude]" am Anfang der ersten Zeile; "-" dahinter = eingeklappt starten */
const KENNUNG = /^\[!([A-Za-z-]+)\]([+-]?)/;

/** Alle Kästen im Dokument: Position, Art, Länge der Kennung, ob eingeklappt gestartet */
function kaesten(doc: PMNode): { pos: number; node: PMNode; art: string; kennung: string; startZu: boolean }[] {
  const liste: { pos: number; node: PMNode; art: string; kennung: string; startZu: boolean }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "blockquote") return !node.isTextblock;
    const erster = node.firstChild;
    const m = erster?.isTextblock ? KENNUNG.exec(erster.textContent) : null;
    if (m) liste.push({ pos, node, art: m[1].toLowerCase(), kennung: m[0], startZu: m[2] === "-" });
    return true;
  });
  return liste;
}

/** Zustand: von Hand auf- oder zugeklappte Kästen (Position → zu?, mitgeführt). Kästen ohne Eintrag
 *  folgen dem "-" in der Kennung. Absolut gespeichert: Wer das "-" löscht oder tippt, klappt nichts um. */
type Zustand = { umgeschaltet: [pos: number, zu: boolean][]; deko: DecorationSet };

function istZu(z: [number, boolean][], k: { pos: number; startZu: boolean }) {
  return z.find(([p]) => p === k.pos)?.[1] ?? k.startZu;
}

function setze(z: [number, boolean][], pos: number, zu: boolean): [number, boolean][] {
  return [...z.filter(([p]) => p !== pos), [pos, zu]];
}

function dekorationen(doc: PMNode, umgeschaltet: [number, boolean][]): DecorationSet {
  const deko: Decoration[] = [];
  for (const k of kaesten(doc)) {
    const zu = istZu(umgeschaltet, k);
    deko.push(Decoration.node(k.pos, k.pos + k.node.nodeSize, { class: `kasten kasten--${k.art}${zu ? " kasten--zu" : ""}` }));
    // Kennung als kleines Etikett darstellen (bleibt editierbarer Text)
    const start = k.pos + 2; // Zitat öffnen + Absatz öffnen
    deko.push(
      Decoration.inline(start, start + k.kennung.length, {
        class: "kasten__kennung",
        "data-name": KASTEN_ARTEN[k.art] ?? k.kennung.slice(2, k.kennung.indexOf("]")),
        title: zu ? "Aufklappen (⌥⌘↩)" : "Zuklappen (⌥⌘↩)",
      }),
    );
  }
  return DecorationSet.create(doc, deko);
}

const kaestenSchluessel = new PluginKey<Zustand>("kaesten");

/** Kasten, in dem `pos` liegt (innerster) */
function kastenBei(state: EditorState, pos: number) {
  const $pos = state.doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== "blockquote") continue;
    const start = $pos.before(d);
    const k = kaesten(state.doc).find((x) => x.pos === start);
    if (k) return k;
  }
  return null;
}

/** Kasten auf-/zuklappen. Beim Zuklappen springt der Cursor in die sichtbare erste Zeile. */
function umschalten(state: EditorState, kastenPos: number): Transaction {
  const tr = state.tr.setMeta(kaestenSchluessel, { umschalten: kastenPos });
  const k = kaesten(state.doc).find((x) => x.pos === kastenPos);
  const z = kaestenSchluessel.getState(state)!.umgeschaltet;
  if (k && !istZu(z, k)) {
    const ersteZeileEnde = kastenPos + 1 + k.node.firstChild!.nodeSize - 1;
    const { from, to } = state.selection;
    // reicht die Auswahl in den Teil, der gleich verschwindet: Cursor in die sichtbare erste Zeile
    if (to > ersteZeileEnde && from < kastenPos + k.node.nodeSize) tr.setSelection(TextSelection.create(tr.doc, ersteZeileEnde));
  }
  return tr;
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
      "Mod-Alt-Enter": () => {
        const k = kastenBei(this.editor.state, this.editor.state.selection.from);
        if (!k) return false;
        this.editor.view.dispatch(umschalten(this.editor.state, k.pos));
        return true;
      },
      "Mod-Shift-u": marker(MARKER_UNKLAR),
      "Mod-Shift-l": marker(MARKER_FRAGEN),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<Zustand>({
        key: kaestenSchluessel,
        state: {
          init: (_, { doc }) => ({ umgeschaltet: [], deko: dekorationen(doc, []) }),
          apply: (tr, alt, _vorher, neu) => {
            let umgeschaltet: [number, boolean][] = alt.umgeschaltet.flatMap(([p, zu]): [number, boolean][] => {
              const r = tr.mapping.mapResult(p, 1);
              return r.deleted ? [] : [[r.pos, zu]];
            });
            const meta = tr.getMeta(kaestenSchluessel) as { umschalten: number } | undefined;
            const liste = tr.docChanged || meta || tr.selectionSet ? kaesten(neu.doc) : [];
            if (tr.docChanged) {
              // Einträge von Stellen, die kein Kasten mehr sind, vergessen
              umgeschaltet = umgeschaltet.filter(([p]) => liste.some((k) => k.pos === p));
            }
            if (meta) {
              const k = liste.find((x) => x.pos === meta.umschalten);
              if (k) umgeschaltet = setze(umgeschaltet, k.pos, !istZu(umgeschaltet, k));
            }
            // Auswahl im versteckten Teil eines zugeklappten Kastens (Pfeiltasten, Sprung aus der Suche): aufklappen
            if (tr.selectionSet || tr.docChanged) {
              const { from, to } = neu.selection;
              for (const k of liste) {
                const ersteZeileEnde = k.pos + 1 + k.node.firstChild!.nodeSize;
                if (to > ersteZeileEnde && from < k.pos + k.node.nodeSize && istZu(umgeschaltet, k)) {
                  umgeschaltet = setze(umgeschaltet, k.pos, false);
                }
              }
            }
            const gleich =
              umgeschaltet.length === alt.umgeschaltet.length &&
              umgeschaltet.every(([p, zu], i) => p === alt.umgeschaltet[i][0] && zu === alt.umgeschaltet[i][1]);
            if (!tr.docChanged && gleich) return alt;
            return { umgeschaltet, deko: dekorationen(neu.doc, umgeschaltet) };
          },
        },
        props: {
          decorations(state) {
            return kaestenSchluessel.getState(state)?.deko;
          },
          // Klick auf das Etikett klappt auf/zu
          handleClick(view, pos, event) {
            if (!(event.target as HTMLElement).closest?.(".kasten__kennung")) return false;
            const k = kastenBei(view.state, pos);
            if (!k) return false;
            view.dispatch(umschalten(view.state, k.pos));
            return true;
          },
        },
      }),
    ];
  },
});
