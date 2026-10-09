// Wortvorschläge beim Tippen (Hilfe bei LRS und für lange Fachbegriffe): Nach 3 Buchstaben erscheint
// grau das wahrscheinlichste Wort aus den eigenen Notizen und PDFs – Tab übernimmt es, Esc blendet aus.
//
// Quellen: der Wortschatz aus ~/Schule (Rust, wortschatz.rs – Wörter aus PDFs zählen mehr) und die
// Wörter der offenen Notiz. Gibt es kein Wort mit diesem Anfang, wird auch ein ähnlich geschriebenes
// gesucht ("Primer" → "Primärschlüssel"): Tab ersetzt dann das angefangene Wort.
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { ReplaceStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { api } from "../api";

const MIN_PRAEFIX = 3;
/** Nur längere Wörter werden vorgeschlagen – kürzere gelten aber als "bekannt" (keine Korrektur) */
const MIN_WORT = 6;
/** Ein Wort muss mindestens zweimal vorkommen (oder in einem PDF stehen) – ein einmaliger
 *  Tippfehler in den eigenen Notizen wird so nicht vorgeschlagen */
const MIN_GEWICHT = 2;
/** Wörter der offenen Notiz zählen beim Auswählen doppelt – sie passen am besten zum Thema */
const NOTIZ_GEWICHT = 2;
/** Korrektur ähnlicher Wörter erst ab so vielen Buchstaben – sonst wird aus "Tafel" "Tabelle" */
const MIN_KORREKTUR = 6;

type Eintrag = { wort: string; gefaltet: string; gewicht: number };
type Kandidat = Eintrag & { anzahl: number };
export type Vorschlag = { von: number; bis: number; wort: string };

/** Vergleichsform: klein, ohne Umlaute – "Primär" und "primar" gelten als gleicher Anfang */
export function falte(w: string): string {
  return w.normalize("NFKC").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
}

let wortschatz: Eintrag[] = [];
let zuletztGeladen = 0;

export function setzeWortschatz(liste: { wort: string; gewicht: number }[]) {
  // NFKC: PDF-Texte enthalten manchmal Ligaturen ("ﬁ") oder zerlegte Umlaute
  wortschatz = liste.map((w) => {
    const wort = w.wort.normalize("NFKC");
    return { wort, gefaltet: falte(wort), gewicht: w.gewicht };
  });
}

/** Wortschatz aus ~/Schule neu einlesen (höchstens alle 30 s – z. B. beim Öffnen einer Notiz) */
export function wortschatzLaden() {
  if (Date.now() - zuletztGeladen < 30_000) return;
  zuletztGeladen = Date.now();
  api.wortschatz().then(setzeWortschatz, () => (zuletztGeladen = 0));
}

const WORT = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

/** Wörter der Notiz (ohne Code) mit Anzahl – pro Absatz als Ganzes, damit teils fett
 *  geschriebene Wörter nicht in Stücke zerfallen */
function notizWoerter(doc: PMNode): Map<string, number> {
  const anzahl = new Map<string, number>();
  doc.descendants((knoten) => {
    if (knoten.type.spec.code) return false;
    if (!knoten.isTextblock) return true;
    let text = "";
    knoten.forEach((kind) => {
      text += kind.isText && !kind.marks.some((m) => m.type.spec.code) ? kind.text : " ";
    });
    for (const [w] of text.matchAll(WORT)) {
      const wort = w.normalize("NFKC");
      if (/^\p{L}/u.test(wort) && [...wort].length >= MIN_PRAEFIX) anzahl.set(wort, (anzahl.get(wort) ?? 0) + 1);
    }
    return false;
  });
  return anzahl;
}

/** Tippfehler-Abstand (Einfügen, Löschen, Ersetzen, zwei Buchstaben vertauscht) */
export function abstand(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + kosten);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Bestes Wort für den angefangenen Wortanfang – oder null */
export function vorschlagFuer(praefix: string, notiz: Map<string, number> = new Map()): string | null {
  if ([...praefix].length < MIN_PRAEFIX) return null;
  const p = falte(praefix);
  // Gewicht je Wort: Wortschatz aus ~/Schule plus Vorkommen in der offenen Notiz
  // (gewicht = Rangfolge, anzahl = wie oft wirklich gesehen – für die Mindesthäufigkeit)
  const gewichte = new Map<string, Kandidat>();
  const dazu = (wort: string, gefaltet: string, gewicht: number, anzahl: number) => {
    const e = gewichte.get(wort);
    if (e) {
      e.gewicht += gewicht;
      e.anzahl += anzahl;
    } else gewichte.set(wort, { wort, gefaltet, gewicht, anzahl });
  };
  for (const k of wortschatz) if (k.gefaltet[0] === p[0]) dazu(k.wort, k.gefaltet, k.gewicht, k.gewicht);
  for (const [wort, n] of notiz) {
    const g = falte(wort);
    if (g[0] === p[0]) dazu(wort, g, n * NOTIZ_GEWICHT, n);
  }
  const kandidaten = [...gewichte.values()].filter((k) => k.anzahl >= MIN_GEWICHT);

  // 1. Wörter mit genau diesem Anfang
  const punkte = new Map<string, number>();
  let bekannt = false;
  for (const k of kandidaten) {
    if (!k.gefaltet.startsWith(p)) continue;
    bekannt = true;
    if (k.gefaltet.length >= p.length + 2 && [...k.wort].length >= MIN_WORT) punkte.set(k.wort, k.gewicht);
  }
  if (punkte.size) return anpassen(bestes(punkte), praefix);
  // Das Wort gibt es so schon (nur kürzer als ein Vorschlag lohnt) – nicht "verbessern"
  if (bekannt || p.length < MIN_KORREKTUR) return null;

  // 2. Ähnlich geschriebene Wörter (gleicher erster Buchstabe)
  const erlaubt = p.length >= 9 ? 2 : 1;
  let bester: { wort: string; d: number; gewicht: number } | null = null;
  for (const k of kandidaten) {
    if (k.gefaltet.length < p.length || [...k.wort].length < MIN_WORT) continue;
    let d = Infinity;
    for (const laenge of [p.length - 1, p.length, p.length + 1]) d = Math.min(d, abstand(p, k.gefaltet.slice(0, laenge)));
    if (d > erlaubt) continue;
    if (!bester || d < bester.d || (d === bester.d && k.gewicht > bester.gewicht)) bester = { wort: k.wort, d, gewicht: k.gewicht };
  }
  return bester ? anpassen(bester.wort, praefix) : null;
}

function bestes(punkte: Map<string, number>): string {
  let wahl = "";
  let max = -1;
  for (const [wort, p] of punkte) {
    if (p > max || (p === max && wort.length < wahl.length)) [wahl, max] = [wort, p];
  }
  return wahl;
}

/** Großschreibung am Satzanfang übernehmen ("Daten…" → "Datenbank", auch wenn nur "datenbank" bekannt ist) */
function anpassen(wort: string, praefix: string): string {
  const erstes = praefix[0];
  if (erstes !== erstes.toLowerCase() && wort[0] === wort[0].toLowerCase()) return wort[0].toUpperCase() + wort.slice(1);
  return wort;
}

/** Vorschlag an der Cursor-Position – nur am Ende eines Worts, nicht in Code, nicht nach / oder # */
export function vorschlagImEditor(state: EditorState): Vorschlag | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $pos = selection.$from;
  const block = $pos.parent;
  if (!block.isTextblock || block.type.spec.code) return null;
  if ($pos.marks().some((m) => m.type.spec.code)) return null;
  const start = Math.max(0, $pos.parentOffset - 60);
  const vorher = block.textBetween(start, $pos.parentOffset, undefined, "\ufffc");
  const danach = block.textBetween($pos.parentOffset, Math.min(block.content.size, $pos.parentOffset + 1), undefined, "\ufffc");
  if (/^[\p{L}\p{N}]/u.test(danach)) return null;
  // nicht nach / (Menü), # (Tag), \ _ und nicht in Adressen (www.…, name@…, https:…)
  const treffer = /(^|[^\p{L}\p{N}/#\\_.@:-])(\p{L}[\p{L}\p{N}]*(?:-[\p{L}\p{N}]+)*-?)$/u.exec(vorher);
  // kein Treffer, oder sehr langes Wort, dessen Anfang abgeschnitten ist
  if (!treffer || (treffer.index === 0 && start > 0)) return null;
  const praefix = treffer[2];
  // Das gerade getippte Wort selbst zählt nicht mit (sonst gilt "Primer" als bekanntes Wort)
  const notiz = notizWoerter(state.doc);
  const selbst = notiz.get(praefix.normalize("NFKC"));
  if (selbst === 1) notiz.delete(praefix);
  else if (selbst) notiz.set(praefix, selbst - 1);
  const wort = vorschlagFuer(praefix, notiz);
  if (!wort || wort === praefix) return null;
  return { von: $pos.pos - praefix.length, bis: $pos.pos, wort };
}

/** Nur nach Tippen oder Löschen einzelner Zeichen – nicht nach Einfügen, Laden, Rückgängig
 *  oder dem Löschen einer ganzen Auswahl */
function istTippen(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta("paste") || tr.getMeta("uiEvent") || tr.getMeta("addToHistory") === false) return false;
  if (isHistoryTransaction(tr)) return false;
  return tr.steps.every((s) => {
    if (!(s instanceof ReplaceStep)) return false;
    const { from, to, slice } = s as unknown as { from: number; to: number; slice: { size: number } };
    return slice.size > 0 ? slice.size <= 4 : to - from <= 1;
  });
}

export const wortvorschlagSchluessel = new PluginKey<Vorschlag | null>("wortvorschlag");

export const Wortvorschlag = Extension.create({
  name: "wortvorschlag",
  // vor den Tastenkürzeln von Listen/Tabellen, damit Tab zuerst den Vorschlag übernimmt
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin<Vorschlag | null>({
        key: wortvorschlagSchluessel,
        state: {
          init: () => null,
          apply: (tr, alt, _alterZustand, neu) => {
            if (tr.getMeta(wortvorschlagSchluessel) === "aus") return null;
            if (istTippen(tr)) return vorschlagImEditor(neu);
            return tr.docChanged || tr.selectionSet ? null : alt;
          },
        },
        props: {
          decorations(state) {
            const v = wortvorschlagSchluessel.getState(state);
            if (!v) return null;
            const angefangen = state.doc.textBetween(v.von, v.bis);
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                v.bis,
                () => {
                  const el = document.createElement("span");
                  el.className = "wortvorschlag";
                  el.setAttribute("aria-hidden", "true");
                  // Passt der Anfang genau: Rest grau anhängen. Sonst (Tippfehler): ganzes Wort zeigen
                  el.textContent = v.wort.startsWith(angefangen) ? v.wort.slice(angefangen.length) : ` → ${v.wort}`;
                  const taste = document.createElement("span");
                  taste.className = "wortvorschlag__taste";
                  taste.textContent = "Tab";
                  el.append(taste);
                  return el;
                },
                { side: 1, key: `${v.von}:${v.wort}`, ignoreSelection: true },
              ),
            ]);
          },
          handleKeyDown(view, event) {
            const v = wortvorschlagSchluessel.getState(view.state);
            if (!v || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return false;
            if (event.key === "Tab" && !event.shiftKey) {
              view.dispatch(view.state.tr.insertText(v.wort, v.von, v.bis).setMeta(wortvorschlagSchluessel, "aus"));
              return true;
            }
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(wortvorschlagSchluessel, "aus"));
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
