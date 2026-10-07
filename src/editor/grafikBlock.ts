// Darstellung eines ```grafik-Blocks: lebendige Grafik (HTML von Claude) im abgeschotteten Rahmen.
//
// In der Datei steht nur:
//   ```grafik
//   src: assets/join-animation.html
//   höhe: 400
//   ```
// Die HTML-Datei liegt im assets/-Ordner des Lernfelds und wird über grafik:// geladen (siehe grafik.rs).
//
// Eine Grafik startet erst auf Klick: Ein fehlerhaftes Programm (z. B. Endlosschleife) könnte sonst
// beim Öffnen der Notiz die ganze App einfrieren. Nach einer Änderung der Datei wartet sie wieder.
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

/** Adresse einer Datei für den Rahmen. Schrägstriche bleiben echt (nicht kodiert), damit relative
 *  Verweise in der Grafik (z. B. <img src="bild.png">) im selben assets/-Ordner landen. */
export function grafikAdresse(ordner: string, src: string): string {
  const pfad = src.replace(/^\.?\//, "");
  if (!ordner || !pfad) return "about:blank";
  const basis = convertFileSrc("", "grafik");
  if (/^(grafik|https?):/.test(basis)) {
    const segmente = [ordner, ...pfad.split("/")].map(encodeURIComponent).join("/");
    return basis.replace(/\/?$/, "/") + segmente;
  }
  return convertFileSrc(`${ordner}/${pfad}`, "grafik"); // Browser-Simulation
}

function knopf(text: string, titel: string, aktion: () => void, klasse = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `grafik__knopf ${klasse}`.trim();
  b.textContent = text;
  b.title = titel;
  b.setAttribute("aria-label", titel);
  b.tabIndex = -1;
  b.addEventListener("mousedown", (e) => e.preventDefault()); // Editor behält den Cursor
  b.addEventListener("click", aktion);
  return b;
}

export function grafikNodeView(node: PMNode, editor: Editor, getPos: () => number | undefined): NodeView {
  let aktuell = node;
  const ordner = aktuellerOrdner;
  let laeuft = false;
  let version = 0;
  let geaendertSeitStart = false;

  const dom = document.createElement("div");
  dom.className = "grafik";

  const leiste = document.createElement("div");
  leiste.className = "grafik__leiste";
  leiste.contentEditable = "false";
  const name = document.createElement("span");
  name.className = "grafik__name";

  // Platzhalter, bis die Grafik gestartet wird
  const start = document.createElement("div");
  start.className = "grafik__start";
  start.contentEditable = "false";
  const startKnopf = document.createElement("button");
  startKnopf.type = "button";
  startKnopf.className = "grafik__start-knopf";
  startKnopf.addEventListener("mousedown", (e) => e.preventDefault());
  startKnopf.addEventListener("click", () => starten());
  start.append(startKnopf);

  const rahmen = document.createElement("iframe");
  rahmen.className = "grafik__rahmen";
  // allow-scripts ohne allow-same-origin: eigener, fremder Ursprung – kein Zugriff auf die App
  rahmen.setAttribute("sandbox", "allow-scripts");
  rahmen.setAttribute("referrerpolicy", "no-referrer");
  rahmen.hidden = true;

  const quelle = document.createElement("pre");
  quelle.className = "grafik__quelle";
  const code = document.createElement("code");
  quelle.append(code);
  quelle.hidden = true;

  const escImVollbild = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      vollbild(false);
    }
  };
  const schliessen = knopf("✕ Schließen", "Vollbild schließen", () => vollbild(false), "grafik__schliessen");
  function vollbild(an: boolean) {
    dom.classList.toggle("ist-vollbild", an);
    if (an) {
      document.addEventListener("keydown", escImVollbild, true);
      // Fokus auf "Schließen": Esc wirkt, solange man nicht in die Grafik klickt
      schliessen.focus();
    } else {
      document.removeEventListener("keydown", escImVollbild, true);
      editor.commands.focus();
    }
  }

  function starten() {
    laeuft = true;
    geaendertSeitStart = false;
    version++;
    zeige();
  }

  leiste.append(
    name,
    knopf("⟳", "Grafik neu starten", starten),
    knopf("⛶", "Vollbild", () => {
      if (!laeuft) starten();
      vollbild(!dom.classList.contains("ist-vollbild"));
    }),
    knopf("</>", "Angaben bearbeiten (src, höhe)", () => {
      quelle.hidden = !quelle.hidden;
      automatischOffen = false;
      if (!quelle.hidden) editor.commands.focus();
    }),
    schliessen,
  );
  dom.append(leiste, start, rahmen, quelle);

  let gezeigt = "";
  let letzteSrc: string | null = null;
  function zeige() {
    const { src, hoehe } = grafikAngaben(aktuell.textContent);
    // Andere Datei → wieder auf Klick warten
    if (src !== letzteSrc) {
      letzteSrc = src;
      laeuft = false;
    }
    name.textContent = src ? src.replace(/^assets\//, "") : "Grafik – noch keine Datei (src: assets/…)";
    rahmen.style.height = `${hoehe}px`;
    rahmen.title = `Animierte Grafik ${src}`;

    startKnopf.textContent = geaendertSeitStart ? "⟳ Grafik wurde geändert – neu starten" : "▶ Grafik starten";
    startKnopf.disabled = !src;
    start.hidden = laeuft;
    rahmen.hidden = !laeuft;

    const ziel = laeuft ? grafikAdresse(ordner, src) : "about:blank";
    // ?v=… erzwingt Neuladen (nicht bei blob:/data:-Adressen der Browser-Simulation)
    const url = laeuft && /^(grafik|https?):/.test(ziel) ? `${ziel}?v=${version}` : ziel;
    if (url !== gezeigt) {
      gezeigt = url;
      rahmen.src = url;
    }
    // Ohne Datei die Angaben gleich zeigen, damit man sie eintragen kann
    if (!src) quelle.hidden = false;
  }
  zeige();

  const beiAenderung = (e: Event) => {
    if ((e as CustomEvent<string>).detail !== ordner || !laeuft) return;
    laeuft = false;
    geaendertSeitStart = true;
    zeige();
  };
  window.addEventListener(ASSETS_GEAENDERT, beiAenderung);

  // Gerät der Cursor in den Block (Pfeiltasten, Backspace), die Angaben einblenden –
  // sonst würde man unsichtbar hineintippen
  // (automatisch geöffnet → beim Verlassen wieder schließen; per </> geöffnet → offen lassen)
  let automatischOffen = false;
  const beiAuswahl = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const { from, to } = editor.state.selection;
    const drin = to > pos && from < pos + aktuell.nodeSize;
    if (drin && quelle.hidden) {
      quelle.hidden = false;
      automatischOffen = true;
    } else if (!drin && automatischOffen && grafikAngaben(aktuell.textContent).src) {
      quelle.hidden = true;
      automatischOffen = false;
    }
  };
  editor.on("selectionUpdate", beiAuswahl);

  return {
    dom,
    contentDOM: code,
    update: (neu) => {
      if (neu.type !== aktuell.type || neu.attrs.language !== "grafik") return false;
      aktuell = neu;
      zeige();
      return true;
    },
    stopEvent: (e) => leiste.contains(e.target as Node) || start.contains(e.target as Node) || e.target === rahmen,
    // Nur echte Textänderungen im Angaben-Bereich gehen den Editor etwas an – nicht das Ein-/Ausblenden,
    // die Leiste oder der Rahmen (sonst baut der Editor den Block neu auf)
    ignoreMutation: (m) => {
      if (m.type === "selection") return false;
      return m.type === "attributes" || !code.contains(m.target);
    },
    destroy: () => {
      window.removeEventListener(ASSETS_GEAENDERT, beiAenderung);
      document.removeEventListener("keydown", escImVollbild, true);
      editor.off("selectionUpdate", beiAuswahl);
    },
  };
}
