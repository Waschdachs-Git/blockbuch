// Bilder und PDFs in Notizen: per Drag & Drop, Einfügen (⌘V – auch Screenshots und Fotos vom iPhone
// über „Von iPhone importieren“) oder über das /-Menü. Die Datei landet in <Ordner>/assets/,
// in der Notiz steht ein Verweis: ![Name](assets/x.png) bzw. ein ```pdf-Block.
import { Extension, type Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { api, fehlerText, heute } from "../api";
import { grafikAdresse, grafikOrdner, notizSitzung } from "./grafikBlock";

const BILD = /^image\/(png|jpe?g|gif|webp|svg\+xml|heic)$/;
const ERLAUBT = /\.(png|jpe?g|gif|webp|svg|heic|pdf)$/i;

export function istAblegbar(datei: File): boolean {
  return BILD.test(datei.type) || datei.type === "application/pdf" || ERLAUBT.test(datei.name);
}

const MAX_BYTES = 100 * 1024 * 1024;

function meldeFehler(e: unknown) {
  window.dispatchEvent(new CustomEvent("blockbuch:fehler", { detail: fehlerText(e) }));
}

/** Kurzer Hinweis unten (z. B. "Wird eingefügt …"); null blendet ihn aus */
function status(text: string | null) {
  window.dispatchEvent(new CustomEvent("blockbuch:status", { detail: text }));
}

/** Sinnvoller Dateiname – eingefügte Screenshots heißen sonst alle "image.png" */
function dateiname(datei: File): string {
  const endung = datei.type === "application/pdf" ? "pdf" : (datei.type.split("/")[1] ?? "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  if (!datei.name || /^image\.\w+$/i.test(datei.name)) {
    const d = new Date();
    const zeit = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    return `Bild-${heute()}-${zeit}.${endung}`;
  }
  return datei.name;
}

/** Dateien speichern und an Position `pos` einfügen (der Reihe nach) */
export async function dateienEinfuegen(editor: Editor, dateien: File[], pos?: number) {
  const ordner = grafikOrdner();
  if (!ordner) return meldeFehler("Bitte zuerst eine Notiz öffnen.");
  if (!editor.isEditable) return meldeFehler("Diese Notiz ist schreibgeschützt.");
  const sitzung = notizSitzung();
  // Position mitwandern lassen, falls sich die Notiz während des Speicherns ändert (Tippen, Claude)
  let ziel = pos ?? editor.state.selection.to;
  const verfolgen = ({ transaction }: { transaction: { mapping: { map: (p: number) => number } } }) => {
    ziel = transaction.mapping.map(ziel);
  };
  editor.on("transaction", verfolgen);
  try {
    for (const datei of dateien.filter(istAblegbar)) {
      if (datei.size > MAX_BYTES) {
        meldeFehler(`„${datei.name}“ ist zu groß (höchstens 100 MB).`);
        continue;
      }
      status(`„${datei.name || "Bild"}“ wird eingefügt …`);
      await einfuegenEine(editor, datei, ordner, sitzung, () => ziel, (p) => (ziel = p));
    }
  } finally {
    editor.off("transaction", verfolgen);
    status(null);
  }
}

async function einfuegenEine(
  editor: Editor,
  datei: File,
  ordner: string,
  sitzung: number,
  ziel: () => number,
  setzeZiel: (p: number) => void,
) {
  try {
    const daten = new Uint8Array(await datei.arrayBuffer());
    const name = dateiname(datei);
    const pfad = await api.assetSpeichern(ordner, name, daten);
    // Inzwischen andere Notiz offen oder schreibgeschützt? Dann nicht einfügen – Datei ist aber gesichert
    if (notizSitzung() !== sitzung || !editor.isEditable) {
      meldeFehler(`Gespeichert als ${ordner}/${pfad}, aber nicht eingefügt (Notiz wurde gewechselt).`);
      return;
    }
    const istPdf = pfad.toLowerCase().endsWith(".pdf");
    const knoten = istPdf
      ? { type: "codeBlock", attrs: { language: "pdf" }, content: [{ type: "text", text: `src: ${pfad}` }] }
      : // eckige Klammern würden das Markdown ![…](…) zerbrechen
        { type: "image", attrs: { src: pfad, alt: name.replace(/\.\w+$/, "").replace(/[[\]]/g, "") } };
    const pos = Math.min(ziel(), editor.state.doc.content.size);
    editor.chain().insertContentAt(pos, knoten).run();
    setzeZiel(editor.state.selection.to);
    // Den PDF-Text (.txt daneben) legt die App selbst an (Rust, PDFKit) – siehe pdftext.rs
  } catch (e) {
    meldeFehler(e);
  }
}

/** Dateiauswahl öffnen (für das /-Menü – auch ohne Maus erreichbar) */
export function dateiAuswaehlen(editor: Editor) {
  const eingabe = document.createElement("input");
  eingabe.type = "file";
  eingabe.multiple = true;
  eingabe.accept = "image/*,application/pdf";
  eingabe.addEventListener("change", () => {
    if (eingabe.files?.length) dateienEinfuegen(editor, [...eingabe.files]);
  });
  eingabe.click();
}

export const Dateiablage = Extension.create({
  name: "dateiablage",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("dateiablage"),
        props: {
          handleDrop: (view, event) => {
            const alle = [...(event.dataTransfer?.files ?? [])];
            const dateien = alle.filter(istAblegbar);
            if (alle.length && !dateien.length) {
              event.preventDefault();
              meldeFehler(`„${alle[0].name}“ wird nicht unterstützt – nur Bilder und PDFs.`);
              return true;
            }
            if (!dateien.length) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            dateienEinfuegen(editor, dateien, pos);
            return true;
          },
          handlePaste: (_view, event) => {
            const dateien = [...(event.clipboardData?.files ?? [])].filter(istAblegbar);
            if (!dateien.length) return false;
            // Excel/Word/Pages legen neben Text oft ein Vorschaubild ab – dann lieber den Text nehmen
            const html = event.clipboardData?.getData("text/html") ?? "";
            const text = event.clipboardData?.getData("text/plain") ?? "";
            if (text.trim() && html.replace(/<img[^>]*>/gi, "").replace(/<[^>]+>/g, "").trim()) return false;
            event.preventDefault();
            dateienEinfuegen(editor, dateien);
            return true;
          },
          // Bilder aus dem Internet (beim Kopieren von Webseiten) kann die App nicht anzeigen – als Link behalten
          transformPastedHTML: (html) =>
            html.replace(/<img\b[^>]*\bsrc=["'](https?:[^"']+)["'][^>]*>/gi, (_m, url: string) => `<a href="${url}">[Bild]</a>`),
        },
      }),
    ];
  },
});

/** Bild, dessen relativer Pfad (assets/…) über grafik:// aus dem Ordner der Notiz geladen wird */
export const BildMitAssets = Image.extend({
  // Pfade mit Leerzeichen/Klammern in <…>, eckige Klammern im alt-Text entfernen – sonst wird
  // das Bild beim nächsten Öffnen zu Text
  renderMarkdown: (node) => {
    const src = String(node.attrs?.src ?? "");
    const alt = String(node.attrs?.alt ?? "").replace(/[[\]]/g, "");
    const title = String(node.attrs?.title ?? "").replace(/"/g, "'");
    const ziel = /[\s()<>]/.test(src) ? `<${src}>` : src;
    return title ? `![${alt}](${ziel} "${title}")` : `![${alt}](${ziel})`;
  },
  addNodeView() {
    return ({ node }) => {
      let aktuell = node;
      const ordner = grafikOrdner();
      const img = document.createElement("img");
      img.className = "bild";
      const setze = () => {
        const src = String(aktuell.attrs.src ?? "");
        img.src = /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : grafikAdresse(ordner, src);
        img.alt = String(aktuell.attrs.alt ?? "");
        img.title = String(aktuell.attrs.title ?? aktuell.attrs.alt ?? "");
      };
      setze();
      return {
        dom: img,
        update: (neu) => {
          if (neu.type !== aktuell.type) return false;
          aktuell = neu;
          setze();
          return true;
        },
      };
    };
  },
});
