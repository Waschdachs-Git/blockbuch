// Fett und kursiv beim Tippen – aber nur, wenn es wirklich so gemeint ist.
//
// 1. Die Standard-Regeln von TipTap machen aus "1024 * 1024 *" ein kursives " 1024 ", weil sie
//    Leerzeichen innerhalb der Sternchen erlauben. Hier gilt die Markdown-Regel: Direkt nach dem
//    öffnenden und direkt vor dem schließenden Zeichen steht kein Leerzeichen. "*kursiv*" und
//    "**fett**" funktionieren weiter, Rechnungen wie "3 * 4 * 5" bleiben normaler Text.
// 2. Löscht man formatierten Text, merkt sich der Editor (wie Word) die Formatierung für das
//    nächste Zeichen. Das stört: Nach dem Löschen eines kursiven Worts ging es kursiv weiter.
//    Jetzt richtet sich das nächste Zeichen nach dem Text links vom Cursor.
import { Extension, markInputRule, markPasteRule } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";

/** Inhalt zwischen den Zeichen: beginnt und endet nicht mit Leerzeichen, enthält das Zeichen nicht */
const innen = (z: string) => `([^${z}\\s](?:[^${z}]*[^${z}\\s])?)`;
const regel = (zeichen: string, z: string, ende: string, flags = "") =>
  new RegExp(`(?:^|\\s)(${zeichen}${innen(z)}${zeichen})${ende}`, flags);

/** Beim Einfügen: "_" mitten im Wort oder Dateinamen (_private_attr, __init__.py) ist keine Formatierung */
const MITTEN_IM_WORT = "(?![\\p{L}\\p{N}_]|\\.[\\p{L}\\p{N}])";

export const KURSIV_STERN = regel("\\*", "*", "$");
export const KURSIV_STRICH = regel("_", "_", "$");
export const FETT_STERN = regel("\\*\\*", "*", "$");
export const FETT_STRICH = regel("__", "_", "$");

export const SicheresKursiv = Italic.extend({
  addInputRules() {
    return [KURSIV_STERN, KURSIV_STRICH].map((find) => markInputRule({ find, type: this.type }));
  },
  addPasteRules() {
    return [regel("\\*", "*", "", "g"), regel("_", "_", MITTEN_IM_WORT, "gu")].map((find) => markPasteRule({ find, type: this.type }));
  },
});

export const SicheresFett = Bold.extend({
  addInputRules() {
    return [FETT_STERN, FETT_STRICH].map((find) => markInputRule({ find, type: this.type }));
  },
  addPasteRules() {
    return [regel("\\*\\*", "*", "", "g"), regel("__", "_", MITTEN_IM_WORT, "gu")].map((find) => markPasteRule({ find, type: this.type }));
  },
});

/** Transaktion, die nur löscht (Rücktaste, Entf, Auswahl löschen) */
function nurGeloescht(tr: Transaction): boolean {
  return tr.docChanged && tr.steps.every((s) => s instanceof ReplaceStep && s.slice.size === 0);
}

export const KeineGeerbteFormatierung = Extension.create({
  name: "keineGeerbteFormatierung",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("keineGeerbteFormatierung"),
        appendTransaction: (transaktionen, _alt, neu) => {
          const letzte = transaktionen[transaktionen.length - 1];
          if (!neu.storedMarks || !nurGeloescht(letzte) || !letzte.storedMarksSet) return null;
          if (letzte.getMeta("composition") != null) return null;
          // Steht rechts vom Cursor noch Text mit dieser Formatierung (erster Buchstabe eines Worts
          // gelöscht), soll der neue Buchstabe sie auch bekommen
          const rechts = neu.selection.$from.nodeAfter;
          if (rechts?.isText && neu.storedMarks.every((m) => m.isInSet(rechts.marks))) return null;
          return neu.tr.setStoredMarks(null).setMeta("addToHistory", false);
        },
      }),
    ];
  },
});
