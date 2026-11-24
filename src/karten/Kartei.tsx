// Karteikarten lernen: Frage → Leertaste → Antwort → 1–4 bewerten. Ganz ohne Maus bedienbar,
// große Schrift, 🔊 liest Frage und Antwort vor (Hilfe bei LRS).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, fehlerText, type Karte } from "../api";
import { fokusFangen } from "../components/Kontextmenue";
import { abstandText, bewerten, lerntag, lernstandAusText, neuUebrig, type Bewertung, type Lernstand } from "./planer";
import { sitzungErstellen } from "./sitzung";

const KNOEPFE: [Bewertung, string][] = [
  [1, "Nochmal"],
  [2, "Schwer"],
  [3, "Gut"],
  [4, "Leicht"],
];

/** **fett**, *kursiv* und `Code` in Fragen/Antworten – ohne HTML einzuschleusen */
export function inlineMarkdown(text: string): ReactNode[] {
  // *kursiv* nur, wenn außen kein Buchstabe/keine Ziffer steht – "2*3*4" bleibt eine Rechnung
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|(?<![\p{L}\p{N}*])\*[^*\s](?:[^*]*[^*\s])?\*(?![\p{L}\p{N}*]))/gu).map((teil, i) => {
    if (/^`[^`]+`$/.test(teil)) return <code key={i}>{teil.slice(1, -1)}</code>;
    if (/^\*\*[^*]+\*\*$/.test(teil)) return <strong key={i}>{teil.slice(2, -2)}</strong>;
    if (/^\*[^*\s](?:[^*]*[^*\s])?\*$/.test(teil)) return <em key={i}>{teil.slice(1, -1)}</em>;
    return teil;
  });
}

function vorlesen(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const s = new SpeechSynthesisUtterance(text.replace(/[`*]/g, ""));
  s.lang = "de-DE";
  s.rate = 0.95;
  window.speechSynthesis.speak(s);
}

export function Kartei({
  ordner,
  titel,
  onSchliessen,
  onFehler,
}: {
  /** null = alle Ordner */
  ordner: string | null;
  titel: string;
  onSchliessen: () => void;
  onFehler: (e: unknown) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const vorherFokus = useRef(document.activeElement as HTMLElement | null);
  const [stapel, setStapel] = useState<Karte[] | null>(null);
  const [anzahlKarten, setAnzahlKarten] = useState(0);
  const [aufgedeckt, setAufgedeckt] = useState(false);
  const [geschafft, setGeschafft] = useState(0);
  const lernstand = useRef<Lernstand>({ version: 1, karten: {} });
  const alleKarten = useRef<Karte[]>([]);
  const speichert = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let aktiv = true;
    Promise.all([api.kartenSammeln(ordner), api.lernstandLesen()])
      .then(([karten, text]) => {
        if (!aktiv) return;
        lernstand.current = lernstandAusText(text);
        alleKarten.current = karten;
        setAnzahlKarten(karten.length);
        setStapel(sitzungErstellen(karten, lernstand.current, Date.now()));
      })
      .catch((e) => {
        onFehler(e);
        onSchliessen();
      });
    ref.current?.focus();
    return () => {
      aktiv = false;
      window.speechSynthesis?.cancel();
    };
  }, [ordner, onFehler, onSchliessen]);

  const schliessen = useCallback(() => {
    // offene Speicherung abwarten, dann schließen
    speichert.current.finally(() => {
      onSchliessen();
      vorherFokus.current?.focus?.();
    });
  }, [onSchliessen]);

  const karte = stapel?.[0];
  // Vorlesen beim Kartenwechsel beenden
  useEffect(() => () => window.speechSynthesis?.cancel(), [karte?.id]);

  function aufdecken() {
    setAufgedeckt(true);
    ref.current?.focus(); // Tastatur wirkt weiter, auch nach einem Mausklick
  }

  function bewerte(note: Bewertung) {
    if (!karte || !aufgedeckt || !stapel) return;
    const jetzt = Date.now();
    const alt = lernstand.current.karten[karte.id];
    const neu = { ...bewerten(alt, note, jetzt), frage: karte.frage };
    // neue Karte: zählt gegen die Tagesgrenze für neue Karten
    const tag = lerntag(jetzt);
    const heute = lernstand.current.neuHeute?.tag === tag ? lernstand.current.neuHeute.anzahl : 0;
    lernstand.current = {
      ...lernstand.current,
      karten: { ...lernstand.current.karten, [karte.id]: neu },
      neuHeute: alt ? lernstand.current.neuHeute : { tag, anzahl: heute + 1 },
    };
    const text = JSON.stringify(lernstand.current);
    // der Reihe nach speichern – nie zwei Schreibvorgänge gleichzeitig
    speichert.current = speichert.current.then(() => api.lernstandSchreiben(text)).catch((e) => onFehler(fehlerText(e)));
    const rest = stapel.slice(1);
    // Nochmal/Schwer (Abstand in Minuten): später in dieser Sitzung noch einmal
    setStapel(neu.intervall === 0 ? [...rest, karte] : rest);
    if (neu.intervall > 0) setGeschafft((g) => g + 1);
    setAufgedeckt(false);
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Leertaste/Enter auf einem Knopf (✕, 🔊, Bewertung): der Knopf selbst ist gemeint
    const aufKnopf = (e.target as HTMLElement).tagName === "BUTTON" && !(e.target as HTMLElement).classList.contains("kartei__aufdecken");
    if ((e.key === " " || e.key === "Enter") && aufKnopf) return;
    if (e.key === "Escape") {
      e.preventDefault();
      schliessen();
    } else if ((e.key === " " || e.key === "Enter") && karte && !aufgedeckt) {
      e.preventDefault();
      aufdecken();
    } else if (/^[1-4]$/.test(e.key) && aufgedeckt) {
      e.preventDefault();
      bewerte(Number(e.key) as Bewertung);
    } else {
      fokusFangen(e, ref.current);
    }
  }

  const jetzt = Date.now();
  // nächster Termin (für „Fertig“): früheste spätere Fälligkeit – nach den Bewertungen dieser Sitzung
  const termine = stapel?.length === 0 ? alleKarten.current.map((k) => lernstand.current.karten[k.id]?.faellig).filter((t): t is number => !!t && t > jetzt) : [];
  const naechste = termine.length ? Math.min(...termine) : null;
  // neue Karten, die wegen der Tagesgrenze erst ab morgen drankommen
  const neueOffen = stapel?.length === 0 ? new Set(alleKarten.current.filter((k) => !lernstand.current.karten[k.id]).map((k) => k.id)).size : 0;
  const grenzeErreicht = neueOffen > 0 && neuUebrig(lernstand.current, jetzt) === 0;
  return (
    <div className="suche-hintergrund" onMouseDown={schliessen}>
      <div
        ref={ref}
        className="kartei"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kartei-titel"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="kartei__kopf">
          <h2 id="kartei-titel">Karteikarten · {titel}</h2>
          {stapel && stapel.length > 0 && <span className="kartei__zaehler">noch {stapel.length}</span>}
          <button className="icon-knopf" onClick={schliessen} aria-label="Lernen beenden">
            ✕
          </button>
        </div>

        {stapel === null && <p className="kartei__hinweis">Karten werden geladen …</p>}

        {stapel && stapel.length === 0 && (
          <div className="kartei__ende">
            {anzahlKarten === 0 ? (
              <>
                <p className="kartei__gross">Hier gibt es noch keine Karteikarten.</p>
                <p className="kartei__hinweis">
                  Lass Claude welche erstellen (<code>/karten</code>) oder schreib selbst einen Kasten
                  <code>&gt; [!karten]</code> mit einer Karte pro Zeile: <code>Frage :: Antwort</code>.
                </p>
              </>
            ) : (
              <>
                <p className="kartei__gross">{geschafft > 0 ? `Geschafft! ${geschafft} ${geschafft === 1 ? "Karte" : "Karten"} gelernt. 🎉` : "Für heute ist alles erledigt. 🎉"}</p>
                {grenzeErreicht && (
                  <p className="kartei__hinweis">
                    Heute hast du schon 20 neue Karten gelernt – {neueOffen} weitere kommen ab morgen dazu.
                  </p>
                )}
                {naechste && <p className="kartei__hinweis">Nächste Karte fällig: {new Date(naechste).toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>}
              </>
            )}
            <button className="knopf" onClick={schliessen} autoFocus>
              Schließen
            </button>
          </div>
        )}

        {karte && (
          <div className="kartei__karte" aria-live="polite">
            <div className="kartei__seite">
              <p className="kartei__frage">{inlineMarkdown(karte.frage)}</p>
              <button className="kartei__vorlesen" onClick={() => vorlesen(karte.frage)} title="Frage vorlesen" aria-label="Frage vorlesen">
                🔊
              </button>
            </div>
            {aufgedeckt ? (
              <>
                <div className="kartei__seite kartei__seite--antwort">
                  <p className="kartei__antwort">{inlineMarkdown(karte.antwort)}</p>
                  <button className="kartei__vorlesen" onClick={() => vorlesen(karte.antwort)} title="Antwort vorlesen" aria-label="Antwort vorlesen">
                    🔊
                  </button>
                </div>
                <p className="kartei__quelle">aus „{karte.titel}“ ({karte.ordner.replace("/", " › ")})</p>
                <div className="kartei__bewertung" role="group" aria-label="Wie gut wusstest du es?">
                  {KNOEPFE.map(([note, name]) => (
                    <button key={note} className={`kartei__note kartei__note--${note}`} onClick={() => bewerte(note)}>
                      <span>
                        <kbd>{note}</kbd> {name}
                      </span>
                      <small>{abstandText(lernstand.current.karten[karte.id], note, jetzt)}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button className="kartei__aufdecken" onClick={aufdecken}>
                Antwort zeigen <kbd>Leertaste</kbd>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
