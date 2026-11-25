// PDFs in Notizen (z. B. Arbeitsblätter). In der Datei steht:
//   ```pdf
//   src: assets/Arbeitsblatt-Joins.pdf
//   ```
// Anzeige mit pdf.js (Seiten als Bilder, erst beim Hinscrollen). Den Text als .txt daneben legt die App
// in Rust an (pdftext.rs) – so findet die Suche ihn, und Claude kann ihn schnell lesen.
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import { api, fehlerText } from "../api";
import { grafikAngaben, grafikOrdner } from "./grafikBlock";
import { angabenBearbeiten, angabenOffen } from "./blockAuswahl";

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

export async function oeffnen(daten: Uint8Array) {
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
  // eine Seite auf einmal (ganz sichtbar, blättern mit ‹ ›) – oder alle untereinander
  let alleSeiten = false;
  let seite = 1;
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
  leiste.append(
    name,
    knopf("↗ Vorschau", "In der Mac-App Vorschau öffnen (markieren, unterschreiben)", () => {
      const { src } = grafikAngaben(aktuell.textContent);
      if (src) api.inVorschauOeffnen(ordner, src).catch((e) => meldeFehler(e));
    }),
    // Pfad ändern – nur auf Wunsch (sonst ist die Angabe versteckt, blockAuswahl.ts)
    knopf("</>", "Pfad ändern (src)", () => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      if (angabenOffen(editor.state, pos, aktuell) && grafikAngaben(aktuell.textContent).src) {
        editor.chain().focus().setNodeSelection(pos).run();
        return;
      }
      editor.view.dispatch(angabenBearbeiten(editor.state, pos, aktuell));
      editor.commands.focus();
    }),
  );

  const seiten = document.createElement("div");
  seiten.className = "pdf__seiten";
  seiten.contentEditable = "false";

  // Fenster größer geworden: gezeichnete Seiten schärfer neu zeichnen (sonst sind sie hochgezogen)
  let groesserTimer = 0;
  const groesse = new ResizeObserver(() => {
    window.clearTimeout(groesserTimer);
    groesserTimer = window.setTimeout(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      seiten.querySelectorAll<HTMLCanvasElement>(".pdf__seite[data-gezeichnet]").forEach((c) => {
        if (c.clientWidth * dpr > c.width * 1.1) {
          delete c.dataset.gezeichnet;
          zeichneSeite(c);
        }
      });
    }, 250);
  });
  groesse.observe(seiten);

  // Blättern unter dem PDF (nur bei mehr als einer Seite)
  const blaettern = document.createElement("div");
  blaettern.className = "pdf__blaettern";
  blaettern.contentEditable = "false";
  blaettern.hidden = true;
  const zurueck = knopf("‹", "Vorherige Seite", () => blaettere(-1));
  const weiter = knopf("›", "Nächste Seite", () => blaettere(1));
  const seitenzahl = document.createElement("span");
  seitenzahl.className = "pdf__seitenzahl";
  seitenzahl.setAttribute("aria-live", "polite");
  const alleKnopf = knopf("", "Alle Seiten untereinander zeigen", () => {
    alleSeiten = !alleSeiten;
    seitenAufbauen();
    if (!alleSeiten) dom.scrollIntoView({ block: "nearest" });
  });
  alleKnopf.classList.add("pdf__alle");
  blaettern.append(zurueck, seitenzahl, weiter, alleKnopf);

  function blaettere(um: number) {
    if (!pdf) return;
    const neu = Math.min(pdf.numPages, Math.max(1, seite + um));
    if (neu === seite) return;
    seite = neu;
    seitenAufbauen();
  }

  const quelle = document.createElement("pre");
  quelle.className = "grafik__quelle";
  const code = document.createElement("code");
  quelle.append(code);
  quelle.hidden = true;
  dom.append(leiste, seiten, blaettern, quelle);

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
      const blatt = await pdf.getPage(Number(leinwand.dataset.seite));
      if (!leinwand.isConnected) return;
      const basis = blatt.getViewport({ scale: 1 });
      // Größe kommt aus dem CSS (ganze Seite sichtbar) – erst das Verhältnis setzen, dann messen
      leinwand.style.setProperty("--verhaeltnis", String(basis.width / basis.height));
      leinwand.style.aspectRatio = `${basis.width} / ${basis.height}`;
      const breite = leinwand.clientWidth || seiten.clientWidth || 640;
      // höchstens doppelte Auflösung – sonst braucht ein 50-Seiten-PDF Hunderte MB
      const scale = (breite / basis.width) * Math.min(window.devicePixelRatio || 1, 2);
      const viewport = blatt.getViewport({ scale });
      leinwand.width = viewport.width;
      leinwand.height = viewport.height;
      await blatt.render({ canvas: leinwand, viewport }).promise;
      blatt.cleanup();
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
          c.style.setProperty("--verhaeltnis", String(v.width / v.height));
        });
      })
      .catch(() => {});
    const n = pdf.numPages;
    seite = Math.min(seite, n);
    blaettern.hidden = n <= 1;
    zurueck.hidden = weiter.hidden = seitenzahl.hidden = alleSeiten;
    zurueck.disabled = seite <= 1;
    weiter.disabled = seite >= n;
    seitenzahl.textContent = `Seite ${seite} von ${n}`;
    alleKnopf.textContent = alleSeiten ? "Einzeln blättern" : `Alle ${n} Seiten`;
    beobachter.disconnect();
    const nummern = alleSeiten ? Array.from({ length: n }, (_, i) => i + 1) : [seite];
    const leinwaende = nummern.map((nr) => {
      const c = document.createElement("canvas");
      c.className = "pdf__seite";
      c.dataset.seite = String(nr);
      c.setAttribute("aria-label", `Seite ${nr} von ${n}`);
      beobachter.observe(c);
      return c;
    });
    seiten.replaceChildren(...leinwaende);
  }

  async function laden() {
    const { src } = grafikAngaben(aktuell.textContent);
    name.textContent = src ? `📄 ${src.replace(/^assets\//, "")}` : "PDF – noch keine Datei (src: assets/…)";
    angabenZeigen();
    if (!src) {
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
      seite = 1;
      seitenAufbauen();
    } catch (e) {
      hinweis(`PDF konnte nicht angezeigt werden: ${fehlerText(e)}`);
    }
  }
  laden();

  // Die Angaben (src) sind nur sichtbar, solange noch keine Datei eingetragen ist – sonst wird der
  // Block wie ein Bild als Ganzes markiert (blockAuswahl.ts)
  function angabenZeigen() {
    quelle.hidden = !angabenOffen(editor.state, getPos(), aktuell);
  }
  editor.on("transaction", angabenZeigen);

  return {
    dom,
    contentDOM: code,
    update: (neu) => {
      if (neu.type !== aktuell.type || neu.attrs.language !== "pdf") return false;
      aktuell = neu;
      laden();
      return true;
    },
    stopEvent: (e) => leiste.contains(e.target as Node) || seiten.contains(e.target as Node) || blaettern.contains(e.target as Node),
    ignoreMutation: (m) => {
      if (m.type === "selection") return false;
      return m.type === "attributes" || !code.contains(m.target);
    },
    destroy: () => {
      zerstoert = true;
      beobachter.disconnect();
      groesse.disconnect();
      window.clearTimeout(groesserTimer);
      editor.off("transaction", angabenZeigen);
      pdf?.loadingTask.destroy();
    },
  };
}
