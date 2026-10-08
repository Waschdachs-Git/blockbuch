import { useEffect, useRef, useState } from "react";
import { api, datumAnzeigen, fehlerText, type Treffer } from "../api";
import { fundstellen } from "../editor/falten";

type Props = {
  ordnerName: (ordner: string) => string;
  onOeffnen: (t: Treffer, woerter: string[]) => void;
  onSchliessen: () => void;
};

/** Suchbegriffe hervorheben – mit derselben Umlaut-Regel wie die Suche ("groesse" markiert "Größe") */
function hervorheben(text: string, woerter: string[]) {
  const teile: React.ReactNode[] = [];
  let ab = 0;
  fundstellen(text, woerter).forEach(([s, e], i) => {
    teile.push(text.slice(ab, s), <mark key={i}>{text.slice(s, e)}</mark>);
    ab = e;
  });
  teile.push(text.slice(ab));
  return teile;
}

/** Suchwörter ohne Filter (lf5, #tag) – für Hervorhebung und Sprung */
function suchwoerter(anfrage: string): string[] {
  return anfrage
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^lf\d{1,2}$/i.test(w) && !w.startsWith("#"));
}

export function Suche({ ordnerName, onOeffnen, onSchliessen }: Props) {
  const [anfrage, setAnfrage] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [auswahl, setAuswahl] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const woerter = suchwoerter(anfrage);
  const [laedt, setLaedt] = useState(false);
  // Fokus beim Schließen dorthin zurück, wo er vorher war (z. B. Cursor im Editor)
  const vorherFokus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useEffect(
    () => () => {
      // nur zurücksetzen, wenn der Fokus "verloren" ist – nicht, wenn der Sprung ihn schon in den Editor gesetzt hat
      // (beim Aufräumen steht das Suchfeld evtl. noch im DOM – dann gilt der Fokus auch als verloren)
      const a = document.activeElement;
      if (!a || a === document.body || a.closest(".suche")) vorherFokus.current?.focus?.();
    },
    [],
  );

  // Suchen (leicht verzögert, damit nicht bei jedem Tastendruck gesucht wird)
  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    const t = window.setTimeout(
      () => {
        api
          .suchen(anfrage)
          .then((liste) => {
            if (abgebrochen) return;
            setTreffer(liste);
            setAuswahl(0);
            setFehler(null);
            setLaedt(false);
          })
          .catch((e) => !abgebrochen && setFehler(fehlerText(e)));
      },
      anfrage ? 120 : 0,
    );
    return () => {
      abgebrochen = true;
      window.clearTimeout(t);
    };
  }, [anfrage]);

  useEffect(() => {
    listeRef.current?.querySelector(".ist-aktiv")?.scrollIntoView({ block: "nearest" });
  }, [auswahl]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onSchliessen();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setAuswahl((a) => Math.min(a + 1, treffer.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAuswahl((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && treffer[auswahl] && !laedt) {
      e.preventDefault();
      onOeffnen(treffer[auswahl], woerter);
    }
  }

  return (
    <div className="suche-hintergrund" onMouseDown={onSchliessen}>
      <div className="suche" role="dialog" aria-label="Suchen" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="suche__eingabe"
          autoFocus
          placeholder="Suchen … (lf5 = nur Lernfeld 5, #sql = Tag, ❓ = offene Fragen)"
          aria-label="Suchbegriff"
          role="combobox"
          aria-expanded={treffer.length > 0}
          aria-autocomplete="list"
          aria-controls="suche-ergebnisse"
          aria-activedescendant={treffer[auswahl] ? `treffer-${auswahl}` : undefined}
          value={anfrage}
          onChange={(e) => setAnfrage(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="suche__kopf" aria-live="polite">
          {woerter.length ? `${treffer.length} Treffer` : "Zuletzt bearbeitet"}
        </div>
        {fehler && <p className="suche__leer">Fehler: {fehler}</p>}
        {!fehler && anfrage.trim() && treffer.length === 0 && <p className="suche__leer">Nichts gefunden.</p>}
        <ul className="suche__liste" id="suche-ergebnisse" role="listbox" ref={listeRef}>
          {treffer.map((t, i) => (
            <li
              key={`${t.ordner}/${t.datei}/${t.pdf}`}
              id={`treffer-${i}`}
              role="option"
              aria-selected={i === auswahl}
              className={`suche__treffer ${i === auswahl ? "ist-aktiv" : ""}`}
              onMouseEnter={() => setAuswahl(i)}
              onClick={() => onOeffnen(t, woerter)}
            >
              <div className="suche__zeile">
                <span className="suche__titel">
                  {t.art === "pdf" ? "📄 " : ""}
                  {hervorheben(t.titel, woerter)}
                </span>
                <span className="suche__ort">
                  {ordnerName(t.ordner)}
                  {t.datum ? ` · ${datumAnzeigen(t.datum)}` : ""}
                </span>
              </div>
              {t.ausschnitt && <div className="suche__ausschnitt">{hervorheben(t.ausschnitt, woerter)}</div>}
            </li>
          ))}
        </ul>
        <div className="suche__fuss">↑↓ auswählen · Enter öffnen · Esc schließen</div>
      </div>
    </div>
  );
}
