import { useEffect, useRef, useState } from "react";
import { api, datumAnzeigen, fehlerText, type Treffer } from "../api";

type Props = {
  ordnerName: (ordner: string) => string;
  onOeffnen: (t: Treffer, woerter: string[]) => void;
  onSchliessen: () => void;
};

/** Suchbegriffe im Ausschnitt hervorheben (einfach, ohne Umlaut-Faltung) */
function hervorheben(text: string, woerter: string[]) {
  const muster = woerter.filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!muster.length) return text;
  const teile = text.split(new RegExp(`(${muster.join("|")})`, "gi"));
  return teile.map((t, i) => (i % 2 === 1 ? <mark key={i}>{t}</mark> : t));
}

export function Suche({ ordnerName, onOeffnen, onSchliessen }: Props) {
  const [anfrage, setAnfrage] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [auswahl, setAuswahl] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const woerter = anfrage.trim().split(/\s+/).filter(Boolean);

  // Suchen (leicht verzögert, damit nicht bei jedem Tastendruck gesucht wird)
  useEffect(() => {
    let abgebrochen = false;
    const t = window.setTimeout(
      () => {
        api
          .suchen(anfrage)
          .then((liste) => {
            if (abgebrochen) return;
            setTreffer(liste);
            setAuswahl(0);
            setFehler(null);
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
    } else if (e.key === "Enter" && treffer[auswahl]) {
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
          placeholder="In allen Notizen und PDFs suchen …"
          aria-label="Suchbegriff"
          aria-controls="suche-ergebnisse"
          aria-activedescendant={treffer[auswahl] ? `treffer-${auswahl}` : undefined}
          value={anfrage}
          onChange={(e) => setAnfrage(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="suche__kopf">{anfrage.trim() ? `${treffer.length} Treffer` : "Zuletzt bearbeitet"}</div>
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
