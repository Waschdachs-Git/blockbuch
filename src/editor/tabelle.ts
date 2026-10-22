// Tabellen mit ziehbaren Spaltenbreiten (Maus an den Spaltenrand). Markdown-Tabellen kennen keine
// Breiten – deshalb steht über einer Tabelle mit eigenen Breiten eine unsichtbare Kommentarzeile:
//
//   <!-- spalten: 160 320 0 -->
//   | Begriff | Erklärung | Beispiel |
//   | ------- | --------- | -------- |
//
// Zahlen = Breite in Pixeln, 0 = automatisch. Ohne gezogene Breiten bleibt die Tabelle reines Markdown.
import { Table } from "@tiptap/extension-table";
import type { JSONContent, MarkdownToken } from "@tiptap/core";

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

export const TabelleMitBreiten = Table.extend({
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
}).configure({ resizable: true, cellMinWidth: 60 });
