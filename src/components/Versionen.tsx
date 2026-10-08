import { useEffect, useRef, useState } from "react";
import { api, fehlerText, type Version } from "../api";

type Props = {
  ordner: string;
  datei: string;
  titel: string;
  /** Vor dem Wiederherstellen: ungespeicherte Eingaben sichern */
  vorWiederherstellen: () => Promise<void>;
  onFehler: (e: unknown) => void;
  onSchliessen: () => void;
};

/** "2026-10-08T10:42:00+02:00" → "heute, 10:42" / "gestern, 10:42" / "06.10.2026, 10:42" */
export function zeitAnzeigen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const uhr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const tag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((tag(new Date()) - tag(d)) / 86_400_000);
  if (diff === 0) return `heute, ${uhr}`;
  if (diff === 1) return `gestern, ${uhr}`;
  return `${d.toLocaleDateString("de-DE")}, ${uhr}`;
}

export function Versionen({ ordner, datei, titel, vorWiederherstellen, onFehler, onSchliessen }: Props) {
  const [liste, setListe] = useState<Version[] | null>(null);
  const [auswahl, setAuswahl] = useState(0);
  const [inhalt, setInhalt] = useState<string>("");
  const [frage, setFrage] = useState(false);
  const listeRef = useRef<HTMLUListElement>(null);
  const vorherFokus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  useEffect(() => {
    api
      .versionen(ordner, datei)
      .then((v) => {
        setListe(v);
        // erste Auswahl: die vorletzte Version (die letzte ist meist der aktuelle Stand)
        setAuswahl(v.length > 1 ? 1 : 0);
      })
      .catch((e) => {
        setListe([]);
        onFehler(e);
      });
    return () => {
      const a = document.activeElement;
      if (!a || a === document.body || a.closest(".versionen")) vorherFokus.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordner, datei]);

  const gewaehlt = liste?.[auswahl];
  useEffect(() => {
    if (!gewaehlt) return;
    let abgebrochen = false;
    api
      .versionLesen(gewaehlt.hash, gewaehlt.pfad)
      .then((t) => !abgebrochen && setInhalt(t))
      .catch((e) => !abgebrochen && setInhalt(`Konnte diese Version nicht lesen: ${fehlerText(e)}`));
    listeRef.current?.querySelector(".ist-aktiv")?.scrollIntoView({ block: "nearest" });
    return () => {
      abgebrochen = true;
    };
  }, [gewaehlt]);

  async function wiederherstellen() {
    if (!gewaehlt) return;
    try {
      await vorWiederherstellen();
      await api.versionWiederherstellen(ordner, datei, gewaehlt.hash, gewaehlt.pfad);
      onSchliessen();
    } catch (e) {
      onFehler(e);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (frage) setFrage(false);
      else onSchliessen();
    } else if (e.key === "ArrowDown" && liste) {
      e.preventDefault();
      setAuswahl((a) => Math.min(a + 1, liste.length - 1));
      setFrage(false);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAuswahl((a) => Math.max(a - 1, 0));
      setFrage(false);
    } else if (e.key === "Enter" && gewaehlt && auswahl > 0) {
      e.preventDefault();
      if (frage) wiederherstellen();
      else setFrage(true);
    }
  }

  return (
    <div className="suche-hintergrund" onMouseDown={onSchliessen}>
      <div
        className="versionen"
        role="dialog"
        aria-label={`Versionen von ${titel}`}
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="versionen__kopf">
          <strong>Versionen</strong> · {titel}
        </div>
        <div className="versionen__inhalt">
          <ul className="versionen__liste" role="listbox" aria-label="Gesicherte Versionen" ref={listeRef}>
            {liste === null && <li className="suche__leer">Lade …</li>}
            {liste?.length === 0 && (
              <li className="suche__leer">Noch keine Sicherung dieser Notiz. Blockbuch sichert alle 5 Minuten und mit ⌘S.</li>
            )}
            {liste?.map((v, i) => (
              <li
                key={v.hash}
                role="option"
                aria-selected={i === auswahl}
                className={`versionen__eintrag ${i === auswahl ? "ist-aktiv" : ""}`}
                onClick={() => {
                  setAuswahl(i);
                  setFrage(false);
                }}
              >
                <div className="versionen__zeit">
                  {zeitAnzeigen(v.zeit)}
                  {i === 0 && <span className="versionen__marke">aktuell</span>}
                </div>
                <div className="versionen__nachricht">{v.nachricht}</div>
              </li>
            ))}
          </ul>
          <pre className="versionen__vorschau" aria-label="Inhalt dieser Version">
            {gewaehlt ? inhalt : ""}
          </pre>
        </div>
        <div className="versionen__fuss">
          {frage ? (
            <>
              <span>
                Version von <b>{gewaehlt && zeitAnzeigen(gewaehlt.zeit)}</b> wiederherstellen? Der jetzige Stand bleibt als Version
                erhalten.
              </span>
              <button onClick={() => setFrage(false)}>Abbrechen</button>
              <button className="primaer" onClick={wiederherstellen} autoFocus>
                Wiederherstellen
              </button>
            </>
          ) : (
            <>
              <span className="versionen__hinweis">↑↓ auswählen · Enter wiederherstellen · Esc schließen</span>
              <button className="primaer" disabled={!gewaehlt || auswahl === 0} onClick={() => setFrage(true)}>
                Diese Version wiederherstellen …
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
