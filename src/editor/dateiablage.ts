// Bilder und PDFs in Notizen: per Drag & Drop, Einfügen (⌘V – auch Screenshots und Fotos vom iPhone
// über „Von iPhone importieren“) oder über das /-Menü. Die Datei landet in <Ordner>/assets/,
// in der Notiz steht ein Verweis: ![Name](assets/x.png) bzw. ein ```pdf-Block.
import { Extension, type Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { api, fehlerText, heute } from "../api";
import { grafikAdresse, grafikOrdner } from "./grafikBlock";
import { pdfText } from "./pdfBlock";

const BILD = /^image\/(png|jpe?g|gif|webp|svg\+xml|heic)$/;
const ERLAUBT = /\.(png|jpe?g|gif|webp|svg|heic|pdf)$/i;

export function istAblegbar(datei: File): boolean {
  return BILD.test(datei.type) || datei.type === "application/pdf" || ERLAUBT.test(datei.name);
}

function meldeFehler(e: unknown) {
  window.dispatchEvent(new CustomEvent("blockbuch:fehler", { detail: fehlerText(e) }));
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
  for (const datei of dateien.filter(istAblegbar)) {
    try {
      const daten = new Uint8Array(await datei.arrayBuffer());
      const name = dateiname(datei);
      const pfad = await api.assetSpeichern(ordner, name, daten);
      const istPdf = pfad.toLowerCase().endsWith(".pdf");
      const knoten = istPdf
        ? { type: "codeBlock", attrs: { language: "pdf" }, content: [{ type: "text", text: `src: ${pfad}` }] }
        : { type: "image", attrs: { src: pfad, alt: name.replace(/\.\w+$/, "") } };
      const ziel = pos ?? editor.state.selection.to;
      editor.chain().insertContentAt(Math.min(ziel, editor.state.doc.content.size), knoten).run();
      pos = undefined;
      // PDF-Text daneben speichern (für Suche und Claude) – Fehler hier sind nicht schlimm
      if (istPdf) {
        pdfText(daten)
          .then((text) => api.assetSpeichern(ordner, pfad.replace(/^assets\//, "").replace(/\.pdf$/i, ".txt"), new TextEncoder().encode(text)))
          .catch(() => {});
      }
    } catch (e) {
      meldeFehler(e);
    }
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
            const dateien = [...(event.dataTransfer?.files ?? [])].filter(istAblegbar);
            if (!dateien.length) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            dateienEinfuegen(editor, dateien, pos);
            return true;
          },
          handlePaste: (_view, event) => {
            const dateien = [...(event.clipboardData?.files ?? [])].filter(istAblegbar);
            if (!dateien.length) return false;
            event.preventDefault();
            dateienEinfuegen(editor, dateien);
            return true;
          },
        },
      }),
    ];
  },
});

/** Bild, dessen relativer Pfad (assets/…) über grafik:// aus dem Ordner der Notiz geladen wird */
export const BildMitAssets = Image.extend({
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
