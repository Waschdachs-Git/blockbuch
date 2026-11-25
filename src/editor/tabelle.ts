// Tabellen mit ziehbaren Spaltenbreiten (Maus an den Spaltenrand). Markdown-Tabellen kennen keine
// Breiten – deshalb steht über einer Tabelle mit eigenen Breiten eine unsichtbare Kommentarzeile:
//
//   <!-- spalten: 160 320 0 -->
//   | Begriff | Erklärung | Beispiel |
//   | ------- | --------- | -------- |
//
// Zahlen = Breite in Pixeln, 0 = automatisch. Ohne gezogene Breiten bleibt die Tabelle reines Markdown.
//
// Genauso für verbundene und farbig markierte Zellen (Namen wie in Excel: Spalte A, B, C …, Zeile 1 =
// Kopfzeile). Der Text einer verbundenen Zelle steht in der Datei in der Zelle oben links, die übrigen
// bleiben dort leer:
//
//   <!-- verbunden: A1:B1 A3:A4 -->
//   <!-- markiert: gelb B2 C2 rot A4 -->
//
// Zeilen und Spalten: Steht der Cursor in einer Tabelle, erscheint darüber eine kleine Leiste
// (+ Zeile, + Spalte, löschen). Tastatur: ⌥⌘↓/↑ Zeile darunter/darüber, ⌥⌘→/← Spalte rechts/links,
// Tab in der letzten Zelle hängt eine Zeile an.
import { Table, TableCell, TableHeader } from "@tiptap/extension-table";
import type { Editor, JSONContent, MarkdownToken } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { CellSelection, splitCellWithType } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import { TABELLEN_KOMMENTAR } from "./datei";

const KOMMENTARE = new RegExp(`^(?:${TABELLEN_KOMMENTAR.source}[ \\t]*\\r?\\n)+`, "i");
const KOMMENTAR_ZEILE = /<!--[ \t]*(spalten|verbunden|markiert):[ \t]*([^\n>]*?)[ \t]*-->/gi;

export const FARBEN = ["gelb", "gruen", "rot", "blau"] as const;
export type Farbe = (typeof FARBEN)[number];
const FARB_NAMEN: Record<Farbe, string> = { gelb: "Gelb", gruen: "Grün", rot: "Rot", blau: "Blau" };

/** Spalte 0 → "A", 26 → "AA" */
function spaltenName(c: number): string {
  let n = "";
  for (let i = c + 1; i > 0; i = Math.floor((i - 1) / 26)) n = String.fromCharCode(65 + ((i - 1) % 26)) + n;
  return n;
}
export const zellName = (r: number, c: number) => `${spaltenName(c)}${r + 1}`;

/** "B2" → [Zeile 1, Spalte 1] */
export function zelleAus(name: string): [number, number] | null {
  const m = /^([A-Z]+)(\d+)$/i.exec(name.trim());
  if (!m || Number(m[2]) < 1) return null;
  const c = [...m[1].toUpperCase()].reduce((s, z) => s * 26 + z.charCodeAt(0) - 64, 0) - 1;
  return [Number(m[2]) - 1, c];
}

type Verbund = { r: number; c: number; rs: number; cs: number };
type Angaben = { breiten: number[]; verbunden: Verbund[]; markiert: [number, number, Farbe][] };

/** Inhalt der Kommentarzeilen lesen – Unverständliches wird übergangen */
export function angabenLesen(kommentare: string): Angaben {
  const a: Angaben = { breiten: [], verbunden: [], markiert: [] };
  for (const [, art, wert] of kommentare.matchAll(KOMMENTAR_ZEILE)) {
    const woerter = wert.trim() ? wert.trim().split(/[\s,;·]+/) : [];
    if (art.toLowerCase() === "spalten") a.breiten = woerter.map((z) => Math.round(parseFloat(z)) || 0);
    else if (art.toLowerCase() === "verbunden") {
      for (const w of woerter) {
        const [von, bis] = w.split(":").map(zelleAus);
        if (!von || !bis) continue;
        const [r, c] = [Math.min(von[0], bis[0]), Math.min(von[1], bis[1])];
        a.verbunden.push({ r, c, rs: Math.abs(bis[0] - von[0]) + 1, cs: Math.abs(bis[1] - von[1]) + 1 });
      }
    } else {
      let farbe: Farbe | null = null;
      for (const w of woerter) {
        const f = w.toLowerCase().replace("ü", "ue") as Farbe;
        if (FARBEN.includes(f)) farbe = f;
        else if (farbe) {
          const z = zelleAus(w);
          if (z) a.markiert.push([z[0], z[1], farbe]);
        }
      }
    }
  }
  return a;
}

const leereZelle = (type: string): JSONContent => ({ type, attrs: {}, content: [{ type: "paragraph" }] });
const hatText = (z: JSONContent | undefined): boolean =>
  !!z?.content?.some((k) => k.type === "text" ? !!k.text?.trim() : k.type !== "paragraph" || hatText(k));

/** Verbundene Zellen für die Datei „aufklappen“: jedes Feld eine eigene Zelle, Text oben links */
function rasterAus(tabelle: JSONContent): { tabelle: JSONContent; verbunden: Verbund[]; markiert: [number, number, Farbe][] } {
  const zeilen = tabelle.content ?? [];
  const raster: (JSONContent | undefined)[][] = zeilen.map(() => []);
  const verbunden: Verbund[] = [];
  const markiert: [number, number, Farbe][] = [];
  zeilen.forEach((zeile, r) => {
    let c = 0;
    for (const zelle of zeile.content ?? []) {
      while (raster[r][c]) c++;
      const cs = Math.max(1, Number(zelle.attrs?.colspan ?? 1));
      const rs = Math.max(1, Math.min(Number(zelle.attrs?.rowspan ?? 1), zeilen.length - r));
      const breiten = (zelle.attrs?.colwidth as number[] | null | undefined) ?? [];
      for (let dr = 0; dr < rs; dr++)
        for (let dc = 0; dc < cs; dc++)
          raster[r + dr][c + dc] =
            dr || dc ? leereZelle(r + dr === 0 ? zelle.type! : "tableCell") : { ...zelle, attrs: { ...zelle.attrs, colspan: 1, rowspan: 1 } };
      // Breiten je Spalte behalten (für breitenAus nicht nötig, aber die Zellen bleiben vollständig)
      for (let dc = 0; dc < cs; dc++) {
        const z = raster[r][c + dc]!;
        z.attrs = { ...z.attrs, colwidth: breiten[dc] ? [breiten[dc]] : null };
      }
      if (cs > 1 || rs > 1) verbunden.push({ r, c, rs, cs });
      const farbe = zelle.attrs?.farbe as Farbe | null | undefined;
      if (farbe && FARBEN.includes(farbe)) markiert.push([r, c, farbe]);
      c += cs;
    }
  });
  const breite = Math.max(0, ...raster.map((z) => z.length));
  const content = zeilen.map((zeile, r) => ({
    ...zeile,
    content: Array.from({ length: breite }, (_, c) => raster[r][c] ?? leereZelle(r === 0 ? "tableHeader" : "tableCell")),
  }));
  return { tabelle: { ...tabelle, content }, verbunden, markiert };
}

/** Angaben aus den Kommentaren auf die (vollständig aufgeklappte) Tabelle anwenden */
function angabenAnwenden(tabelle: JSONContent, a: Angaben) {
  const zeilen = tabelle.content ?? [];
  const zelle = (r: number, c: number) => zeilen[r]?.content?.[c];
  for (const zeile of zeilen) {
    zeile.content?.forEach((z, i) => {
      z.attrs = { ...z.attrs, colwidth: a.breiten[i] > 0 ? [a.breiten[i]] : null };
    });
  }
  for (const [r, c, farbe] of a.markiert) {
    const z = zelle(r, c);
    if (z) z.attrs = { ...z.attrs, farbe };
  }
  const weg = new Set<JSONContent>();
  const belegt = new Set<string>();
  for (const v of [...a.verbunden].sort((x, y) => x.r - y.r || x.c - y.c)) {
    const felder: [number, number][] = [];
    for (let dr = 0; dr < v.rs; dr++) for (let dc = 0; dc < v.cs; dc++) felder.push([v.r + dr, v.c + dc]);
    // nur gültige Bereiche: ganz in der Tabelle, nicht überlappend
    if (felder.length < 2 || felder.some(([r, c]) => !zelle(r, c) || belegt.has(`${r},${c}`))) continue;
    felder.forEach(([r, c]) => belegt.add(`${r},${c}`));
    const start = zelle(v.r, v.c)!;
    const breiten = Array.from({ length: v.cs }, (_, dc) => (zelle(v.r, v.c + dc)?.attrs?.colwidth as number[] | null)?.[0] ?? 0);
    start.attrs = { ...start.attrs, colspan: v.cs, rowspan: v.rs, colwidth: breiten.some((b) => b > 0) ? breiten : null };
    for (const [r, c] of felder.slice(1)) {
      const z = zelle(r, c)!;
      // Text in einer überdeckten Zelle (z. B. von Hand ergänzt) geht nicht verloren
      if (hatText(z)) start.content = [...(start.content ?? []), ...(z.content ?? [])];
      weg.add(z);
    }
  }
  for (const zeile of zeilen) zeile.content = zeile.content?.filter((z) => !weg.has(z));
}

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

type LeistenKnopf = {
  text: string;
  titel: string;
  befehl: (e: Editor) => boolean;
  klasse?: string;
  /** nur zeigen, wenn es gerade geht (z. B. „Verbinden“ nur bei mehreren markierten Zellen) */
  sichtbar?: (e: Editor) => boolean;
};

const mehrereZellen = (e: Editor) => e.state.selection instanceof CellSelection && e.state.selection.ranges.length > 1 && e.can().mergeCells();

/** Trennen: neue Zellen unterhalb der Kopfzeile werden normale Zellen (nicht fett/grau wie die Kopfzelle) */
export function trennen(e: Editor): boolean {
  const { tableCell } = e.state.schema.nodes;
  return splitCellWithType(({ node, row }) => (row === 0 ? node.type : tableCell))(e.state, e.view.dispatch);
}

const KNOEPFE: LeistenKnopf[] = [
  { text: "Verbinden", titel: "Markierte Zellen zu einer verbinden", befehl: (e) => e.chain().focus().mergeCells().run(), klasse: "ist-wichtig", sichtbar: mehrereZellen },
  { text: "Trennen", titel: "Verbundene Zelle wieder teilen", befehl: trennen, sichtbar: (e) => e.can().splitCell() },
  ...FARBEN.map(
    (f): LeistenKnopf => ({
      text: "",
      titel: `${FARB_NAMEN[f]} markieren`,
      befehl: (e) => e.chain().focus().setCellAttribute("farbe", f).run(),
      klasse: `tabellen-leiste__farbe tabellen-leiste__farbe--${f}`,
    }),
  ),
  { text: "⊘", titel: "Markierung entfernen", befehl: (e) => e.chain().focus().setCellAttribute("farbe", null).run(), klasse: "tabellen-leiste__ohne" },
  { text: "+ Zeile", titel: "Zeile darunter einfügen (⌥⌘↓)", befehl: (e) => e.chain().focus().addRowAfter().run(), klasse: "ist-abschnitt" },
  { text: "+ Spalte", titel: "Spalte rechts einfügen (⌥⌘→)", befehl: (e) => e.chain().focus().addColumnAfter().run() },
  { text: "− Zeile", titel: "Diese Zeile löschen", befehl: (e) => e.chain().focus().deleteRow().run(), klasse: "ist-gefaehrlich" },
  { text: "− Spalte", titel: "Diese Spalte löschen", befehl: (e) => e.chain().focus().deleteColumn().run(), klasse: "ist-gefaehrlich" },
  { text: "Tabelle löschen", titel: "Ganze Tabelle löschen (⌘Z holt sie zurück)", befehl: (e) => e.chain().focus().deleteTable().run(), klasse: "ist-gefaehrlich" },
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
      const knoepfe = KNOEPFE.map((k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = k.text;
        b.title = k.titel;
        b.setAttribute("aria-label", k.titel);
        b.tabIndex = -1;
        if (k.klasse) b.className = k.klasse;
        // mousedown verhindern: der Cursor (bzw. die Zellauswahl) bleibt
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => k.befehl(editor));
        leiste.append(b);
        return [k, b] as const;
      });
      view.dom.parentElement?.append(leiste);

      const setzen = () => {
        const pos = editor.isEditable ? tabelleUmCursor(view) : null;
        const dom = pos === null ? null : (view.nodeDOM(pos) as HTMLElement | null);
        if (!dom || !view.hasFocus()) {
          leiste.hidden = true;
          return;
        }
        for (const [k, b] of knoepfe) b.hidden = !!k.sichtbar && !k.sichtbar(editor);
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
      const m = KOMMENTARE.exec(src);
      if (m && basisTokenizer.start && (basisTokenizer.start as (s: string) => number)(src.slice(m[0].length)) === 0) return 0;
      return (basisTokenizer.start as (s: string) => number)(src);
    },
    tokenize(src, tokens, helper) {
      const m = KOMMENTARE.exec(src);
      if (!m) return basisTokenizer.tokenize.call(this, src, tokens, helper);
      const rest = src.slice(m[0].length);
      // Der TipTap-Tokenizer übernimmt nur Sonderfälle (Pipes in Zellen); normale Tabellen liest marked selbst
      const token =
        basisTokenizer.tokenize.call(this, rest, tokens, helper) ??
        ((t) => (t?.type === "table" ? t : undefined))(helper.blockTokens(rest.split(/\r?\n\r?\n/)[0])[0]);
      if (!token) return undefined;
      return { ...token, raw: m[0] + token.raw, angaben: angabenLesen(m[0]) };
    },
  },

  parseMarkdown(token, h) {
    const tabelle = basisParse.call(this, token, h) as JSONContent;
    const angaben = (token as MarkdownToken & { angaben?: Angaben }).angaben;
    if (angaben) angabenAnwenden(tabelle, angaben);
    return tabelle;
  },

  renderMarkdown(node, h, ...rest) {
    const breiten = breitenAus(node as JSONContent);
    const { tabelle, verbunden, markiert } = rasterAus(node as JSONContent);
    const md = (basisRender as (...a: unknown[]) => string).call(this, tabelle, h, ...rest);
    const kopf: string[] = [];
    if (breiten.some((b) => b > 0)) kopf.push(`<!-- spalten: ${breiten.join(" ")} -->`);
    if (verbunden.length)
      kopf.push(`<!-- verbunden: ${verbunden.map((v) => `${zellName(v.r, v.c)}:${zellName(v.r + v.rs - 1, v.c + v.cs - 1)}`).join(" ")} -->`);
    if (markiert.length) {
      const teile = FARBEN.filter((f) => markiert.some((m) => m[2] === f)).map(
        (f) => `${f} ${markiert.filter((m) => m[2] === f).map(([r, c]) => zellName(r, c)).join(" ")}`,
      );
      kopf.push(`<!-- markiert: ${teile.join(" ")} -->`);
    }
    if (!kopf.length) return md;
    return `\n${kopf.join("\n")}${md.startsWith("\n") ? md : `\n${md}`}`;
  },
  // breiterer Greifbereich am Spaltenrand – leichter zu treffen
}).configure({ resizable: true, cellMinWidth: 60, handleWidth: 8 });

/** Farbe einer Zelle (gelb/gruen/rot/blau) – im Editor als data-farbe, in der Datei im Kommentar */
const farbAttribut = {
  farbe: {
    default: null,
    parseHTML: (el: HTMLElement) => (FARBEN as readonly string[]).includes(el.dataset.farbe ?? "") ? el.dataset.farbe : null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.farbe ? { "data-farbe": attrs.farbe } : {}),
  },
};

export const ZelleMitFarbe = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...farbAttribut };
  },
});

export const KopfzelleMitFarbe = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...farbAttribut };
  },
});
