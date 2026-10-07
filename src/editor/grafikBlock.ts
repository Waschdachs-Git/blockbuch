// Darstellung eines ```grafik-Blocks: lebendige Grafik (HTML von Claude) im abgeschotteten Rahmen.
//
// In der Datei steht nur:
//   ```grafik
//   src: assets/join-animation.html
//   höhe: 400
//   ```
// Die HTML-Datei liegt im assets/-Ordner des Lernfelds und wird über grafik:// geladen (siehe grafik.rs).
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";

/** Ordner der gerade offenen Notiz – setzt EditorPane vor dem Laden */
let aktuellerOrdner = "";
export function setzeGrafikOrdner(ordner: string) {
  aktuellerOrdner = ordner;
}

/** Ereignis, wenn sich Dateien in assets/ ändern (z. B. Claude hat die Grafik überarbeitet) */
export const ASSETS_GEAENDERT = "blockbuch:assets-geaendert";

export type GrafikAngaben = { src: string; hoehe: number };

export function grafikAngaben(text: string): GrafikAngaben {
  const wert = (namen: string[]) =>
    text
      .split("\n")
      .map((z) => /^\s*([\wäöüÄÖÜ]+)\s*:\s*(.*)$/.exec(z))
      .find((m) => m && namen.includes(m[1].toLowerCase()))?.[2]
      .trim() ?? "";
  const hoehe = parseInt(wert(["höhe", "hoehe", "height"]), 10);
  const src = wert(["src", "datei"]);
  // "assets/" ohne Dateinamen zählt als "noch keine Datei"
  return { src: src.endsWith("/") ? "" : src, hoehe: Number.isFinite(hoehe) ? Math.min(Math.max(hoehe, 120), 2000) : 360 };
}

function knopf(text: string, titel: string, aktion: () => void) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "grafik__knopf";
  b.textContent = text;
  b.title = titel;
  b.setAttribute("aria-label", titel);
  b.tabIndex = -1;
  b.addEventListener("mousedown", (e) => e.preventDefault()); // Editor behält den Cursor
  b.addEventListener("click", aktion);
  return b;
}

export function grafikNodeView(node: PMNode, editor: Editor): NodeView {
  let aktuell = node;
  const ordner = aktuellerOrdner;
  let version = 0;

  const dom = document.createElement("div");
  dom.className = "grafik";

  const leiste = document.createElement("div");
  leiste.className = "grafik__leiste";
  leiste.contentEditable = "false";
  const name = document.createElement("span");
  name.className = "grafik__name";

  const rahmen = document.createElement("iframe");
  rahmen.className = "grafik__rahmen";
  // allow-scripts ohne allow-same-origin: eigener, fremder Ursprung – kein Zugriff auf die App
  rahmen.setAttribute("sandbox", "allow-scripts");
  rahmen.setAttribute("loading", "lazy");
  rahmen.setAttribute("referrerpolicy", "no-referrer");

  const quelle = document.createElement("pre");
  quelle.className = "grafik__quelle";
  const code = document.createElement("code");
  quelle.append(code);
  quelle.hidden = true;

  const schliessenVollbild = () => {
    dom.classList.remove("ist-vollbild");
    document.removeEventListener("keydown", escImVollbild, true);
  };
  const escImVollbild = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      schliessenVollbild();
    }
  };

  const neuLaden = () => {
    version++;
    zeige();
  };

  leiste.append(
    name,
    knopf("⟳", "Grafik neu laden", neuLaden),
    knopf("⛶", "Vollbild (Esc beendet)", () => {
      if (dom.classList.toggle("ist-vollbild")) document.addEventListener("keydown", escImVollbild, true);
      else schliessenVollbild();
    }),
    knopf("</>", "Angaben bearbeiten (src, höhe)", () => {
      quelle.hidden = !quelle.hidden;
      if (!quelle.hidden) editor.commands.focus();
    }),
  );
  dom.append(leiste, rahmen, quelle);

  let gezeigt = "";
  function zeige() {
    const { src, hoehe } = grafikAngaben(aktuell.textContent);
    name.textContent = src ? src.replace(/^assets\//, "") : "Grafik – noch keine Datei (src: assets/…)";
    rahmen.style.height = `${hoehe}px`;
    rahmen.title = `Animierte Grafik ${src}`;
    const pfad = src.replace(/^\.?\//, "");
    const basis = pfad && ordner ? convertFileSrc(`${ordner}/${pfad}`, "grafik") : "about:blank";
    // ?v=… erzwingt Neuladen nach Änderungen (nicht bei blob:/data:-Adressen der Browser-Simulation)
    const url = /^(grafik|https?):/.test(basis) ? `${basis}?v=${version}` : basis;
    if (url !== gezeigt) {
      gezeigt = url;
      rahmen.src = url;
    }
    // Ohne Datei die Angaben gleich zeigen, damit man sie eintragen kann
    if (!src) quelle.hidden = false;
  }
  zeige();

  const beiAenderung = (e: Event) => {
    if ((e as CustomEvent<string>).detail === ordner) neuLaden();
  };
  window.addEventListener(ASSETS_GEAENDERT, beiAenderung);

  return {
    dom,
    contentDOM: code,
    update: (neu) => {
      if (neu.type !== aktuell.type || neu.attrs.language !== "grafik") return false;
      aktuell = neu;
      zeige();
      return true;
    },
    stopEvent: (e) => leiste.contains(e.target as Node) || e.target === rahmen,
    // Nur echte Textänderungen im Angaben-Bereich gehen den Editor etwas an – nicht das Ein-/Ausblenden,
    // die Leiste oder der Rahmen (sonst baut der Editor den Block neu auf)
    ignoreMutation: (m) => {
      if (m.type === "selection") return false;
      return m.type === "attributes" || !code.contains(m.target);
    },
    destroy: () => {
      window.removeEventListener(ASSETS_GEAENDERT, beiAenderung);
      document.removeEventListener("keydown", escImVollbild, true);
    },
  };
}
