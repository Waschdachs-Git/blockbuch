// Drucken und „Als PDF sichern“ (über den Druckdialog von macOS): eine Notiz oder ein ganzer Ordner
// als sauberes Dokument – schwarz auf weiß, Kästen aufgeklappt, PDF-Arbeitsblätter als Seiten,
// animierte Grafiken als Hinweis. Die Druckansicht ist ein eigenes, auf dem Bildschirm unsichtbares
// Element (#druckansicht); beim Drucken blendet styles.css die App aus und nur sie ein.
import { Editor } from "@tiptap/core";
import { api, datumAnzeigen } from "./api";
import { zerlege } from "./editor/datei";
import { editorErweiterungen } from "./editor/erweiterungen";
import { grafikAdresse, grafikAngaben } from "./editor/grafikBlock";
import { KASTEN_ARTEN } from "./editor/kaesten";
import { oeffnen } from "./editor/pdfBlock";

export type DruckNotiz = { ordner: string; datei: string };

/** Höchstens so viele Seiten je PDF – ein dickes Skript soll den Druck nicht minutenlang aufhalten */
const MAX_PDF_SEITEN = 40;
/** Breite der PDF-Seitenbilder in Pixeln – scharf genug für A4, ohne viel Speicher */
const PDF_BREITE = 1000;

let laeuft = false;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, klasse?: string, text?: string) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** PDF-Seiten als Bilder (für den Druck müssen sie fertig gezeichnet sein) */
async function pdfSeiten(ordner: string, src: string): Promise<HTMLElement> {
  const huelle = element("div", "druck__pdf");
  let pdf: Awaited<ReturnType<typeof oeffnen>> | null = null;
  try {
    pdf = await oeffnen(await api.assetLesen(ordner, src));
    const anzahl = Math.min(pdf.numPages, MAX_PDF_SEITEN);
    for (let n = 1; n <= anzahl; n++) {
      const seite = await pdf.getPage(n);
      const basis = seite.getViewport({ scale: 1 });
      const viewport = seite.getViewport({ scale: PDF_BREITE / basis.width });
      const leinwand = document.createElement("canvas");
      leinwand.width = viewport.width;
      leinwand.height = viewport.height;
      await seite.render({ canvas: leinwand, viewport }).promise;
      const bild = element("img", "druck__pdf-seite");
      bild.src = leinwand.toDataURL("image/jpeg", 0.8);
      leinwand.width = leinwand.height = 0; // Speicher der Leinwand gleich freigeben
      bild.alt = `Seite ${n}`;
      huelle.append(bild);
      seite.cleanup();
    }
    if (pdf.numPages > anzahl) huelle.append(element("p", "druck__hinweis", `… und ${pdf.numPages - anzahl} weitere Seiten`));
  } catch {
    huelle.append(element("p", "druck__hinweis", `📄 ${src.replace(/^assets\//, "")} (konnte nicht eingefügt werden)`));
  } finally {
    await pdf?.loadingTask.destroy();
  }
  return huelle;
}

/** Notiz-Markdown → druckfertiges HTML (gleicher Editor wie in der App, aber ohne Bildschirm-Extras) */
export async function notizHtml(editor: Editor, ordner: string, markdown: string): Promise<HTMLElement> {
  editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
  const huelle = element("article", "druck__notiz inhalt");
  huelle.innerHTML = editor.getHTML();

  // Bilder aus <Ordner>/assets/
  for (const img of huelle.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) img.src = grafikAdresse(ordner, src);
    img.className = "bild";
  }
  // PDF- und Grafik-Blöcke (in der Datei Codeblöcke mit src: …)
  for (const code of huelle.querySelectorAll("pre > code")) {
    const pre = code.parentElement!;
    const sprache = /language-(\w+)/.exec(code.className)?.[1];
    const { src } = grafikAngaben(code.textContent ?? "");
    if (sprache === "pdf") {
      pre.replaceWith(src ? await pdfSeiten(ordner, src) : element("p", "druck__hinweis", "📄 PDF ohne Datei"));
    } else if (sprache === "grafik") {
      const name = src.replace(/^assets\//, "").replace(/\.html?$/i, "") || "ohne Datei";
      pre.replaceWith(element("p", "druck__hinweis", `✦ Animierte Grafik „${name}“ – in Blockbuch ansehen`));
    }
  }
  // Kästen: Kennung ([!claude], [!merke]- …) als Etikett, immer aufgeklappt
  for (const zitat of huelle.querySelectorAll("blockquote")) {
    const erster = zitat.firstElementChild;
    const text = erster?.firstChild;
    const m = text?.nodeType === Node.TEXT_NODE ? /^\[!([A-Za-z-]+)\][+-]?\s*/.exec(text.textContent ?? "") : null;
    if (!m || !text) continue;
    const art = m[1].toLowerCase();
    zitat.classList.add("kasten", `kasten--${art}`);
    text.textContent = (text.textContent ?? "").slice(m[0].length);
    erster!.prepend(element("span", "druck__etikett", KASTEN_ARTEN[art] ?? m[1]), " ");
  }
  return huelle;
}

/** Wartet, bis alle Bilder geladen sind (höchstens 8 s) */
function bilderGeladen(wurzel: HTMLElement): Promise<void> {
  const offen = [...wurzel.querySelectorAll("img")].filter((i) => !i.complete);
  const alle = Promise.all(offen.map((i) => new Promise<void>((ok) => {
    i.addEventListener("load", () => ok(), { once: true });
    i.addEventListener("error", () => ok(), { once: true });
  })));
  return Promise.race([alle.then(() => {}), new Promise<void>((ok) => setTimeout(ok, 8000))]);
}

/**
 * Druckansicht aufbauen und den Druckdialog öffnen. `titel`: Deckblatt (bei mehreren Notizen).
 * Notizen werden in der übergebenen Reihenfolge gedruckt, jede auf einer neuen Seite.
 */
export async function drucken(notizen: DruckNotiz[], titel?: { ueberschrift: string; unterzeile: string }) {
  // Zweimal ⌘P hintereinander: nicht zwei Druckansichten ineinander bauen
  if (laeuft) return;
  laeuft = true;
  try {
    await druckenIntern(notizen, titel);
  } finally {
    laeuft = false;
  }
}

async function druckenIntern(notizen: DruckNotiz[], titel?: { ueberschrift: string; unterzeile: string }) {
  let wurzel = document.getElementById("druckansicht");
  if (!wurzel) {
    wurzel = element("div");
    wurzel.id = "druckansicht";
    document.body.append(wurzel);
  }
  wurzel.replaceChildren();
  const editor = new Editor({ extensions: editorErweiterungen() });
  try {
    if (titel) {
      const deckblatt = element("section", "druck__deckblatt");
      deckblatt.append(element("h1", undefined, titel.ueberschrift), element("p", undefined, titel.unterzeile));
      wurzel.append(deckblatt);
    }
    let vorherOrdner = "";
    for (const n of notizen) {
      const { inhalt } = await api.notizLesen(n.ordner, n.datei);
      const { text, frontmatter } = zerlege(inhalt);
      const abschnitt = element("section", "druck__abschnitt");
      // Bei Ordnern mit Unterordnern: Zwischentitel, sobald ein neuer Unterordner beginnt
      if (titel && n.ordner !== vorherOrdner && n.ordner.includes("/")) {
        abschnitt.append(element("p", "druck__unterordner", n.ordner.split("/").slice(1).join(" › ")));
      }
      vorherOrdner = n.ordner;
      const datum = /^datum:\s*(\d{4}-\d{2}-\d{2})/m.exec(frontmatter)?.[1] ?? /^(\d{4}-\d{2}-\d{2})-/.exec(n.datei)?.[1];
      if (datum) abschnitt.append(element("p", "druck__datum", datumAnzeigen(datum)));
      abschnitt.append(await notizHtml(editor, n.ordner, text));
      wurzel.append(abschnitt);
    }
  } finally {
    editor.destroy();
  }
  await bilderGeladen(wurzel);
  // ein Bild aufbauen lassen, dann drucken (macOS-Druckdialog mit „Als PDF sichern“)
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  // In Tauri ruft window.print() den Druckdialog über einen Befehl auf (Promise) – Fehler melden
  await (window.print() as unknown as Promise<void> | undefined);
  // Nach dem Druck die (große) Druckansicht wieder freigeben
  const w = wurzel;
  window.addEventListener("afterprint", () => w.replaceChildren(), { once: true });
}
