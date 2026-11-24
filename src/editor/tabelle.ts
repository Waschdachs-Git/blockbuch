// Tabellen mit ziehbaren Spaltenbreiten (Maus an den Spaltenrand). Markdown-Tabellen kennen keine
// Breiten – deshalb steht über einer Tabelle mit eigenen Breiten eine unsichtbare Kommentarzeile:
//
//   <!-- spalten: 160 320 0 -->
//   | Begriff | Erklärung | Beispiel |
//   | ------- | --------- | -------- |
//
// Zahlen = Breite in Pixeln, 0 = automatisch. Ohne gezogene Breiten bleibt die Tabelle reines Markdown.
//
// Zeilen und Spalten: Steht der Cursor in einer Tabelle, erscheint darüber eine kleine Leiste
// (+ Zeile, + Spalte, löschen). Tastatur: ⌥⌘↓/↑ Zeile darunter/darüber, ⌥⌘→/← Spalte rechts/links,
// Tab in der letzten Zelle hängt eine Zeile an.
import { Table } from "@tiptap/extension-table";
import type { Editor, JSONContent, MarkdownToken } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const KOMMENTAR = /^<!--[ \t]*spalten:[ \t]*([\d. \t]*?)[ \t]*-->[ \t]*\r?\n/i;

type Tokenizer = NonNullable<typeof Table.config.markdownTokenizer>;
const basisTokenizer = Table.config.markdownTokenizer as Tokenizer;
const basisParse = Table.config.parseMarkdown!;
const basisRender = Table.config.renderMarkdown!;

/** Breiten der Spalten aus der ersten Zeile (colwidth je Zelle, auch bei verbundenen Zellen) */
function breitenAus(tabelle: JSONContent): number[] {
  const ersteZeile = tabelle.content?.[0]?.content ?? [];
  return ersteZeile.flatMap((zelle) => {
    const spannweite = Number(zelle.attrs?.colspan ?? 1);
    const breiten = (zelle.attrs?.colwidth as number[] | null | undefined) ?? [];
    return Array.from({ length: spannweite }, (_, i) => Math.round(breiten[i] ?? 0) || 0);
  });
}

/** Position der Tabelle, in der der Cursor steht – sonst null */
function tabelleUmCursor(view: EditorView): number | null {
  const { $from } = view.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return $from.before(d);
  return null;
}

type LeistenKnopf = [text: string, titel: string, befehl: (e: Editor) => boolean, gefaehrlich?: boolean];

const KNOEPFE: LeistenKnopf[] = [
  ["+ Zeile", "Zeile darunter einfügen (⌥⌘↓)", (e) => e.chain().focus().addRowAfter().run()],
  ["+ Spalte", "Spalte rechts einfügen (⌥⌘→)", (e) => e.chain().focus().addColumnAfter().run()],
  ["− Zeile", "Diese Zeile löschen", (e) => e.chain().focus().deleteRow().run(), true],
  ["− Spalte", "Diese Spalte löschen", (e) => e.chain().focus().deleteColumn().run(), true],
  ["Tabelle löschen", "Ganze Tabelle löschen (⌘Z holt sie zurück)", (e) => e.chain().focus().deleteTable().run(), true],
];

/** Kleine Leiste über der Tabelle, in der der Cursor steht */
function tabellenLeiste(editor: Editor) {
  return new Plugin({
    key: new PluginKey("tabellenLeiste"),
    view(view) {
      const leiste = document.createElement("div");
      leiste.className = "tabellen-leiste";
      leiste.setAttribute("role", "toolbar");
      leiste.setAttribute("aria-label", "Tabelle bearbeiten");
      leiste.hidden = true;
      for (const [text, titel, befehl, gefaehrlich] of KNOEPFE) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = titel;
        b.tabIndex = -1;
        if (gefaehrlich) b.className = "ist-gefaehrlich";
        // mousedown verhindern: der Cursor bleibt in der Zelle
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => befehl(editor));
        leiste.append(b);
      }
      view.dom.parentElement?.append(leiste);

      const setzen = () => {
        const pos = editor.isEditable ? tabelleUmCursor(view) : null;
        const dom = pos === null ? null : (view.nodeDOM(pos) as HTMLElement | null);
        if (!dom || !view.hasFocus()) {
          leiste.hidden = true;
          return;
        }
        // erst sichtbar machen – ausgeblendete Elemente haben kein offsetParent
        leiste.hidden = false;
        const basis = leiste.offsetParent as HTMLElement | null;
        if (!basis) return;
        const t = dom.getBoundingClientRect();
        const b = basis.getBoundingClientRect();
        const hoehe = leiste.offsetHeight;
        const tabelleOben = t.top - b.top + basis.scrollTop;
        const tabelleUnten = t.bottom - b.top + basis.scrollTop;
        // Am liebsten über der Tabelle. Ist dort kein Platz (Tabelle ganz oben in der Notiz) oder ist der
        // Tabellenanfang weggescrollt: oben rechts im sichtbaren Teil der Tabelle – nie außerhalb des Bilds
        const sichtbarOben = basis.scrollTop + 4;
        const oben = Math.min(Math.max(tabelleOben - hoehe - 4, sichtbarOben), tabelleUnten - hoehe);
        leiste.style.top = `${Math.max(0, oben)}px`;
        leiste.style.left = `${Math.max(0, t.right - b.left + basis.scrollLeft - leiste.offsetWidth)}px`;
      };
      const beiFokus = () => requestAnimationFrame(setzen);
      view.dom.addEventListener("focus", beiFokus);
      view.dom.addEventListener("blur", beiFokus);
      // Beim Scrollen mitwandern (der scrollende Bereich ist das offsetParent der Leiste)
      let scrollBereich: HTMLElement | null = null;
      const beiScroll = () => {
        if (!leiste.hidden) setzen();
      };
      requestAnimationFrame(() => {
        leiste.hidden = false;
        scrollBereich = leiste.offsetParent as HTMLElement | null;
        leiste.hidden = true;
        scrollBereich?.addEventListener("scroll", beiScroll, { passive: true });
        setzen();
      });
      return {
        update: setzen,
        destroy: () => {
          view.dom.removeEventListener("focus", beiFokus);
          view.dom.removeEventListener("blur", beiFokus);
          scrollBereich?.removeEventListener("scroll", beiScroll);
          leiste.remove();
        },
      };
    },
  });
}

export const TabelleMitBreiten = Table.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Alt-ArrowDown": () => this.editor.commands.addRowAfter(),
      "Mod-Alt-ArrowUp": () => this.editor.commands.addRowBefore(),
      "Mod-Alt-ArrowRight": () => this.editor.commands.addColumnAfter(),
      "Mod-Alt-ArrowLeft": () => this.editor.commands.addColumnBefore(),
    };
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), tabellenLeiste(this.editor)];
  },

  markdownTokenizer: {
    ...basisTokenizer,
    start: (src: string) => {
      const m = KOMMENTAR.exec(src);
      if (m && basisTokenizer.start && (basisTokenizer.start as (s: string) => number)(src.slice(m[0].length)) === 0) return 0;
      return (basisTokenizer.start as (s: string) => number)(src);
    },
    tokenize(src, tokens, helper) {
      const m = KOMMENTAR.exec(src);
      if (!m) return basisTokenizer.tokenize.call(this, src, tokens, helper);
      const rest = src.slice(m[0].length);
      // Der TipTap-Tokenizer übernimmt nur Sonderfälle (Pipes in Zellen); normale Tabellen liest marked selbst
      const token =
        basisTokenizer.tokenize.call(this, rest, tokens, helper) ??
        ((t) => (t?.type === "table" ? t : undefined))(helper.blockTokens(rest.split(/\r?\n\r?\n/)[0])[0]);
      if (!token) return undefined;
      const breiten = m[1].trim() ? m[1].trim().split(/\s+/).map((z) => Math.round(parseFloat(z)) || 0) : [];
      return { ...token, raw: m[0] + token.raw, breiten };
    },
  },

  parseMarkdown(token, h) {
    const tabelle = basisParse.call(this, token, h) as JSONContent;
    const breiten = (token as MarkdownToken & { breiten?: number[] }).breiten;
    if (breiten?.some((b) => b > 0)) {
      for (const zeile of tabelle.content ?? []) {
        zeile.content?.forEach((zelle, i) => {
          zelle.attrs = { ...zelle.attrs, colwidth: breiten[i] > 0 ? [breiten[i]] : null };
        });
      }
    }
    return tabelle;
  },

  renderMarkdown(node, h, ...rest) {
    const md = (basisRender as (...a: unknown[]) => string).call(this, node, h, ...rest);
    const breiten = breitenAus(node as JSONContent);
    if (!breiten.some((b) => b > 0)) return md;
    return `\n<!-- spalten: ${breiten.join(" ")} -->${md.startsWith("\n") ? md : `\n${md}`}`;
  },
  // breiterer Greifbereich am Spaltenrand – leichter zu treffen
}).configure({ resizable: true, cellMinWidth: 60, handleWidth: 8 });
