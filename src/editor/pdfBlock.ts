// PDFs in Notizen (z. B. Arbeitsblätter). In der Datei steht:
//   ```pdf
//   src: assets/Arbeitsblatt-Joins.pdf
//   ```
// Anzeige mit pdf.js (Seiten als Bilder, erst beim Hinscrollen). Beim Einfügen wird zusätzlich der Text
// als .txt daneben gespeichert – so findet die Suche ihn, und Claude kann ihn schnell lesen.
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import { api, fehlerText } from "../api";
import { grafikAngaben, grafikOrdner } from "./grafikBlock";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsLaden: Promise<PdfJs> | null = null;

/** pdf.js erst laden, wenn wirklich ein PDF angezeigt wird (große Bibliothek) */
function pdfjs(): Promise<PdfJs> {
  pdfjsLaden ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return pdfjsLaden;
}

async function oeffnen(daten: Uint8Array) {
  const lib = await pdfjs();
  return lib.getDocument({
    data: daten,
    // Decoder für gescannte PDFs (JBIG2/JPEG 2000), Standardschriften, Zeichensätze – siehe scripts/pdfjs-kopieren.mjs
    wasmUrl: "/pdfjs/wasm/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    iccUrl: "/pdfjs/iccs/",
  }).promise;
}

/** Gesamter Text eines PDFs (Seiten durch Leerzeilen getrennt) */
export async function pdfText(daten: Uint8Array): Promise<string> {
  const pdf = await oeffnen(daten);
  try {
    const seiten: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const inhalt = await (await pdf.getPage(i)).getTextContent();
      const text = inhalt.items
        .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : ""))
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      seiten.push(`--- Seite ${i} ---\n${text}`);
    }
    return seiten.join("\n\n") + "\n";
  } finally {
    await pdf.loadingTask.destroy();
  }
}

function knopf(text: string, titel: string, aktion: () => void) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "grafik__knopf";
  b.textContent = text;
  b.title = titel;
  b.setAttribute("aria-label", titel);
  b.tabIndex = -1;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", aktion);
  return b;
}

export function pdfNodeView(node: PMNode, editor: Editor, getPos: () => number | undefined): NodeView {
  let aktuell = node;
  const ordner = grafikOrdner();
  let alleSeiten = false;
  let geladenFuer = "";
  let pdf: Awaited<ReturnType<typeof oeffnen>> | null = null;
  let zerstoert = false;
  const beobachter = new IntersectionObserver((eintraege) => {
    for (const e of eintraege) if (e.isIntersecting) zeichneSeite(e.target as HTMLCanvasElement);
  });

  const dom = document.createElement("div");
  dom.className = "grafik pdf";
  const leiste = document.createElement("div");
  leiste.className = "grafik__leiste";
  leiste.contentEditable = "false";
  const name = document.createElement("span");
  name.className = "grafik__name";
  const seitenKnopf = knopf("", "Alle Seiten zeigen", () => {
    alleSeiten = !alleSeiten;
    seitenAufbauen();
  });
  leiste.append(
    name,
    seitenKnopf,
    knopf("↗ Vorschau", "In der Mac-App Vorschau öffnen (markieren, unterschreiben)", () => {
      const { src } = grafikAngaben(aktuell.textContent);
      if (src) api.inVorschauOeffnen(ordner, src).catch((e) => meldeFehler(e));
    }),
    knopf("</>", "Angaben bearbeiten (src)", () => {
      quelle.hidden = !quelle.hidden;
    }),
  );

  const seiten = document.createElement("div");
  seiten.className = "pdf__seiten";
  seiten.contentEditable = "false";

  const quelle = document.createElement("pre");
  quelle.className = "grafik__quelle";
  const code = document.createElement("code");
  quelle.append(code);
  quelle.hidden = true;
  dom.append(leiste, seiten, quelle);

  function meldeFehler(e: unknown) {
    window.dispatchEvent(new CustomEvent("blockbuch:fehler", { detail: fehlerText(e) }));
  }

  function hinweis(text: string) {
    seiten.replaceChildren(Object.assign(document.createElement("p"), { className: "pdf__hinweis", textContent: text }));
  }

  async function zeichneSeite(leinwand: HTMLCanvasElement) {
    if (!pdf || leinwand.dataset.gezeichnet) return;
    leinwand.dataset.gezeichnet = "1";
    beobachter.unobserve(leinwand);
    try {
      const seite = await pdf.getPage(Number(leinwand.dataset.seite));
      const breite = seiten.clientWidth || 640;
      const basis = seite.getViewport({ scale: 1 });
      // höchstens doppelte Auflösung – sonst braucht ein 50-Seiten-PDF Hunderte MB
      const scale = (breite / basis.width) * Math.min(window.devicePixelRatio || 1, 2);
      const viewport = seite.getViewport({ scale });
      leinwand.width = viewport.width;
      leinwand.height = viewport.height;
      leinwand.style.aspectRatio = `${basis.width} / ${basis.height}`;
      await seite.render({ canvas: leinwand, viewport }).promise;
      seite.cleanup();
    } catch (e) {
      leinwand.dataset.fehler = fehlerText(e);
    }
  }

  function seitenAufbauen() {
    if (!pdf) return;
    const dok = pdf;
    // Seitenverhältnis von Seite 1 für alle Platzhalter (Querformat-PDFs!), bis jede Seite gezeichnet ist
    dok
      .getPage(1)
      .then((s) => {
        const v = s.getViewport({ scale: 1 });
        seiten.querySelectorAll<HTMLCanvasElement>(".pdf__seite:not([data-gezeichnet])").forEach((c) => {
          c.style.aspectRatio = `${v.width} / ${v.height}`;
        });
      })
      .catch(() => {});
    const anzahl = alleSeiten ? pdf.numPages : 1;
    seitenKnopf.textContent = pdf.numPages > 1 ? (alleSeiten ? "Nur Seite 1" : `Alle ${pdf.numPages} Seiten`) : "1 Seite";
    seitenKnopf.disabled = pdf.numPages <= 1;
    beobachter.disconnect();
    const leinwaende = Array.from({ length: anzahl }, (_, i) => {
      const c = document.createElement("canvas");
      c.className = "pdf__seite";
      c.dataset.seite = String(i + 1);
      c.setAttribute("aria-label", `Seite ${i + 1}`);
      beobachter.observe(c);
      return c;
    });
    seiten.replaceChildren(...leinwaende);
  }

  async function laden() {
    const { src } = grafikAngaben(aktuell.textContent);
    name.textContent = src ? `📄 ${src.replace(/^assets\//, "")}` : "PDF – noch keine Datei (src: assets/…)";
    if (!src) {
      quelle.hidden = false;
      hinweis("Trage bei src den Pfad zum PDF ein.");
      return;
    }
    if (src === geladenFuer || !ordner) return;
    geladenFuer = src;
    hinweis("PDF wird geladen …");
    try {
      const daten = await api.assetLesen(ordner, src);
      if (geladenFuer !== src || zerstoert) return;
      await pdf?.loadingTask.destroy();
      const neu = await oeffnen(daten);
      // Inzwischen geschlossen oder andere Datei? Dann gleich wieder freigeben (jedes PDF hat einen Worker)
      if (zerstoert || geladenFuer !== src) {
        await neu.loadingTask.destroy();
        return;
      }
      pdf = neu;
      seitenAufbauen();
    } catch (e) {
      hinweis(`PDF konnte nicht angezeigt werden: ${fehlerText(e)}`);
    }
  }
  laden();

  // Cursor im Block → Angaben zeigen (sonst tippt man unsichtbar hinein)
  const beiAuswahl = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const { from, to } = editor.state.selection;
    if (to > pos && from < pos + aktuell.nodeSize) quelle.hidden = false;
  };
  editor.on("selectionUpdate", beiAuswahl);

  return {
    dom,
    contentDOM: code,
    update: (neu) => {
      if (neu.type !== aktuell.type || neu.attrs.language !== "pdf") return false;
      aktuell = neu;
      laden();
      return true;
    },
    stopEvent: (e) => leiste.contains(e.target as Node) || seiten.contains(e.target as Node),
    ignoreMutation: (m) => {
      if (m.type === "selection") return false;
      return m.type === "attributes" || !code.contains(m.target);
    },
    destroy: () => {
      zerstoert = true;
      beobachter.disconnect();
      editor.off("selectionUpdate", beiAuswahl);
      pdf?.loadingTask.destroy();
    },
  };
}
