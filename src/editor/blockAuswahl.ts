// PDF- und Grafik-Blöcke verhalten sich wie ein Bild: Der Cursor gerät nicht hinein, sondern der Block
// wird als Ganzes markiert (Pfeiltasten, Rücktaste, Entf). Die Angaben (src, höhe) sind unsichtbar und
// nur bearbeitbar, wenn man sie bewusst öffnet (Grafik: Knopf </>) oder noch keine Datei eingetragen ist.
//
// Vorher konnte man mit dem Cursor unbemerkt in die versteckten Angaben tippen, und Rücktaste am
// Anfang des Absatzes danach hängte den Text an die Angaben an.
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { grafikAngaben } from "./grafikBlock";

export const BLOCK_SPRACHEN = ["grafik", "pdf"];

export function istDateiBlock(node: PMNode | null | undefined): node is PMNode {
  return !!node && node.type.name === "codeBlock" && BLOCK_SPRACHEN.includes(node.attrs.language as string);
}

/** Block, dessen Angaben gerade bearbeitet werden (Position) – sonst null */
export const blockAuswahlSchluessel = new PluginKey<number | null>("blockAuswahl");

/** Darf man die Angaben dieses Blocks gerade sehen und bearbeiten? */
export function angabenOffen(state: EditorState, pos: number | undefined, node: PMNode): boolean {
  if (!grafikAngaben(node.textContent).src) return true; // noch keine Datei → eintragen lassen
  return typeof pos === "number" && blockAuswahlSchluessel.getState(state) === pos;
}

/** Angaben eines Blocks zum Bearbeiten öffnen (Cursor ans Ende der Angaben) */
export function angabenBearbeiten(state: EditorState, pos: number, node: PMNode) {
  const tr = state.tr.setMeta(blockAuswahlSchluessel, pos);
  return tr.setSelection(TextSelection.create(tr.doc, pos + node.nodeSize - 1));
}

/** Block, in dem die Auswahl liegt (Text-Cursor im Block) */
function blockUmCursor(state: EditorState): { pos: number; node: PMNode } | null {
  const { $from, $to } = state.selection;
  if (state.selection instanceof NodeSelection || !$from.sameParent($to)) return null;
  const node = $from.parent;
  return istDateiBlock(node) ? { pos: $from.before(), node } : null;
}

export function blockAuswahlPlugin() {
  return new Plugin<number | null>({
    key: blockAuswahlSchluessel,
    state: {
      init: () => null,
      apply: (tr, alt, _vorher, neu) => {
        const meta = tr.getMeta(blockAuswahlSchluessel) as number | null | undefined;
        if (meta !== undefined) return meta;
        const block = blockUmCursor(neu);
        if (!block) return null; // Bearbeiten endet, sobald der Cursor den Block verlässt
        if (alt !== null) {
          const gemappt = tr.mapping.mapResult(alt, 1);
          if (!gemappt.deleted && gemappt.pos === block.pos) return block.pos;
        }
        // Wer gerade in einem Block ohne Datei tippt, darf weitertippen – auch wenn src jetzt nicht mehr
        // leer ist ("src: assets/j" → "src: assets/join.html")
        const vorherBlock = blockUmCursor(_vorher);
        if (vorherBlock && !grafikAngaben(vorherBlock.node.textContent).src && tr.mapping.map(vorherBlock.pos, 1) === block.pos) {
          return block.pos;
        }
        return null;
      },
    },
    // Cursor im Block (Pfeiltasten, Klick, Suche) → ganzen Block markieren
    appendTransaction: (_trs, _alt, neu) => {
      const block = blockUmCursor(neu);
      if (!block || angabenOffen(neu, block.pos, block.node)) return null;
      return neu.tr.setSelection(NodeSelection.create(neu.doc, block.pos));
    },
    props: {
      handleKeyDown(view, event) {
        const { state } = view;
        const sel = state.selection;
        // Rücktaste am Absatzanfang direkt nach dem Block / Entf am Absatzende davor: Block markieren
        // (zweites Drücken löscht ihn) – statt den Absatz an die versteckten Angaben anzuhängen
        if ((event.key === "Backspace" || event.key === "Delete") && sel.empty && sel instanceof TextSelection) {
          const $c = sel.$from;
          // leerer Absatz: normales Verhalten (Absatz verschwindet, danach ist der Block markiert)
          if ($c.depth === 0 || $c.parent.content.size === 0) return false;
          const zurueck = event.key === "Backspace";
          if (zurueck ? $c.parentOffset !== 0 : $c.parentOffset !== $c.parent.content.size) return false;
          const grenze = zurueck ? $c.before() : $c.after();
          const $g = state.doc.resolve(grenze);
          const nachbar = zurueck ? $g.nodeBefore : $g.nodeAfter;
          if (!istDateiBlock(nachbar)) return false;
          const pos = zurueck ? grenze - nachbar.nodeSize : grenze;
          view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView());
          return true;
        }
        return false;
      },
      // Tippen bei markiertem Block ersetzt ihn nicht (sonst verschwindet ein PDF durch einen Tastendruck)
      handleTextInput(view) {
        const sel = view.state.selection;
        return sel instanceof NodeSelection && istDateiBlock(sel.node);
      },
    },
  });
}
