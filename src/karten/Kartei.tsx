// Karteikarten: Zuerst die Übersicht (Ordner → Notizen → Gruppen, je mit „fällig“ und Anzahl),
// dann lernen:
// - „Lernen“: die heute fälligen Karten nach Plan (1–4 bewerten, verteiltes Wiederholen)
// - „Frei üben“: alle Karten der Auswahl gemischt, so oft man will – der Lernplan bleibt gleich
// - „Schwierige“: nur Karten, die schon vergessen wurden oder noch nicht sitzen (frei geübt)
// Ganz ohne Maus bedienbar, große Schrift, 🔊 liest Frage und Antwort vor (Hilfe bei LRS).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, fehlerText, type Karte } from "../api";
import { fokusFangen } from "../components/Kontextmenue";
import { abstandText, bewerten, lerntag, lernstandAusText, neuUebrig, type Bewertung, type Lernstand } from "./planer";
import { sitzungErstellen } from "./sitzung";
import { eindeutig, istSchwierig, mischen, passt, zeilenBauen, type Auswahl, type Zeile } from "./gruppen";

const KNOEPFE: [Bewertung, string][] = [
  [1, "Nochmal"],
  [2, "Schwer"],
  [3, "Gut"],
  [4, "Leicht"],
];

type Modus = "plan" | "frei" | "schwierig";

type Sitzung = {
  modus: Modus;
  auswahl: Auswahl;
  name: string;
  stapel: Karte[];
  /** Karten am Anfang der Runde (für „Alles nochmal“) */
  runde: Karte[];
  /** frei üben: beim ersten Versuch nicht gewusst */
  falsch: Set<string>;
  /** fertig gelernt (Plan) bzw. gewusst (frei) */
  geschafft: number;
};

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

const karten = (n: number) => (n === 1 ? "1 Karte" : `${n} Karten`);

export function Kartei({
  ordner,
  onSchliessen,
  onFehler,
}: {
  /** vorausgewählter Ordner; null = Übersicht über alle */
  ordner: string | null;
  onSchliessen: () => void;
  onFehler: (e: unknown) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const vorherFokus = useRef(document.activeElement as HTMLElement | null);
  const [alle, setAlle] = useState<Karte[] | null>(null);
  const lernstand = useRef<Lernstand>({ version: 1, karten: {} });
  const speichert = useRef<Promise<void>>(Promise.resolve());
  // nach jeder Bewertung neu rechnen (Lernstand steckt im Ref)
  const [stand, setStand] = useState(0);
  const [offen, setOffen] = useState<Set<string>>(() => {
    if (!ordner) return new Set();
    const oben = ordner.split("/")[0];
    return new Set([`o|${oben}`, `o|${ordner}`]);
  });
  const [markiert, setMarkiert] = useState(ordner ? `o|${ordner}` : "alle");
  const [sitzung, setSitzung] = useState<Sitzung | null>(null);
  const [aufgedeckt, setAufgedeckt] = useState(false);

  useEffect(() => {
    let aktiv = true;
    Promise.all([api.kartenSammeln(null), api.lernstandLesen()])
      .then(([k, text]) => {
        if (!aktiv) return;
        lernstand.current = lernstandAusText(text);
        setAlle(k);
        // nur ein Ordner mit Karten: gleich aufklappen
        const oben = [...new Set(k.map((x) => x.ordner.split("/")[0]))];
        if (!ordner && oben.length === 1) setOffen(new Set([`o|${oben[0]}`]));
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

  // Übersicht offen: jede halbe Minute neu rechnen (Karten mit „Nochmal“ werden nach Minuten fällig)
  useEffect(() => {
    if (sitzung) return;
    const t = window.setInterval(() => setStand((s) => s + 1), 30_000);
    return () => window.clearInterval(t);
  }, [sitzung]);

  const jetzt = useMemo(() => Date.now(), [stand, sitzung, alle]); // eslint-disable-line react-hooks/exhaustive-deps
  const zeilen = useMemo(
    () => (alle ? zeilenBauen(alle, lernstand.current, jetzt, offen, true) : []),
    [alle, jetzt, offen],
  );
  const zeile = zeilen.find((z) => z.schluessel === markiert) ?? zeilen[0];

  // markierte Zeile sichtbar halten
  useEffect(() => {
    listeRef.current?.querySelector(".kartei__zeile--markiert")?.scrollIntoView({ block: "nearest" });
  }, [markiert, sitzung]);

  const karte = sitzung?.stapel[0];
  // Vorlesen beim Kartenwechsel beenden
  useEffect(() => () => window.speechSynthesis?.cancel(), [karte?.id]);

  function starten(modus: Modus, ziel: { auswahl: Auswahl; name: string } | undefined = zeile && { auswahl: zeile.auswahl, name: zeile.schluessel === "alle" ? "alle Ordner" : zeile.name }, nur?: Karte[]) {
    if (!alle || !ziel) return;
    const auswahl = eindeutig(alle.filter((k) => passt(k, ziel.auswahl)));
    let stapel: Karte[];
    if (nur) stapel = mischen(nur);
    else if (modus === "plan") stapel = sitzungErstellen(auswahl, lernstand.current, Date.now());
    else if (modus === "schwierig") stapel = mischen(auswahl.filter((k) => istSchwierig(k, lernstand.current)));
    else stapel = mischen(auswahl);
    if (stapel.length === 0) return;
    setSitzung({ modus, auswahl: ziel.auswahl, name: ziel.name, stapel, runde: stapel, falsch: new Set(), geschafft: 0 });
    setAufgedeckt(false);
    ref.current?.focus();
  }

  /** nach einer Runde: noch einmal (frei) – alle der Auswahl oder nur bestimmte Karten */
  function nochmal(nur?: Karte[]) {
    if (!sitzung) return;
    starten(sitzung.modus === "plan" ? "frei" : sitzung.modus, { auswahl: sitzung.auswahl, name: sitzung.name }, nur);
  }

  function zurUebersicht() {
    window.speechSynthesis?.cancel();
    setSitzung(null);
    setAufgedeckt(false);
    setStand((s) => s + 1);
    ref.current?.focus();
  }

  function aufdecken() {
    setAufgedeckt(true);
    ref.current?.focus(); // Tastatur wirkt weiter, auch nach einem Mausklick
  }

  /** Lernen nach Plan: bewerten und speichern */
  function bewerte(note: Bewertung) {
    if (!sitzung || !karte || !aufgedeckt || sitzung.modus !== "plan") return;
    const zeit = Date.now();
    const alt = lernstand.current.karten[karte.id];
    const neu = { ...bewerten(alt, note, zeit), frage: karte.frage };
    // neue Karte: zählt gegen die Tagesgrenze für neue Karten
    const tag = lerntag(zeit);
    const heute = lernstand.current.neuHeute?.tag === tag ? lernstand.current.neuHeute.anzahl : 0;
    lernstand.current = {
      ...lernstand.current,
      karten: { ...lernstand.current.karten, [karte.id]: neu },
      neuHeute: alt ? lernstand.current.neuHeute : { tag, anzahl: heute + 1 },
    };
    const text = JSON.stringify(lernstand.current);
    // der Reihe nach speichern – nie zwei Schreibvorgänge gleichzeitig
    speichert.current = speichert.current.then(() => api.lernstandSchreiben(text)).catch((e) => onFehler(fehlerText(e)));
    const rest = sitzung.stapel.slice(1);
    // Nochmal/Schwer (Abstand in Minuten): später in dieser Sitzung noch einmal
    setSitzung({ ...sitzung, stapel: neu.intervall === 0 ? [...rest, karte] : rest, geschafft: sitzung.geschafft + (neu.intervall > 0 ? 1 : 0) });
    setAufgedeckt(false);
    setStand((s) => s + 1);
    ref.current?.focus();
  }

  /** Frei üben: gewusst → weg, nicht gewusst → kommt in dieser Runde gleich noch einmal */
  function frei(gewusst: boolean) {
    if (!sitzung || !karte || !aufgedeckt || sitzung.modus === "plan") return;
    const rest = sitzung.stapel.slice(1);
    let stapel = rest;
    const falsch = new Set(sitzung.falsch);
    if (!gewusst) {
      falsch.add(karte.id);
      stapel = [...rest];
      stapel.splice(Math.min(3, rest.length), 0, karte); // drei Karten später noch einmal
    }
    setSitzung({ ...sitzung, stapel, falsch, geschafft: sitzung.geschafft + (gewusst ? 1 : 0) });
    setAufgedeckt(false);
    ref.current?.focus();
  }

  function klappen(z: Zeile, auf: boolean) {
    if (!z.klappbar) return;
    setOffen((o) => {
      const n = new Set(o);
      if (auf) n.add(z.schluessel);
      else n.delete(z.schluessel);
      return n;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Leertaste/Enter auf einem Knopf (✕, 🔊, Bewertung): der Knopf selbst ist gemeint
    const aufKnopf = (e.target as HTMLElement).tagName === "BUTTON" && !(e.target as HTMLElement).classList.contains("kartei__aufdecken");
    if ((e.key === " " || e.key === "Enter") && aufKnopf) return;
    const taste = (k: string) => e.key === k || e.key === k.toUpperCase();
    // gedrückt gehaltene Taste: nicht gleich die nächste Aktion auslösen
    if (e.repeat && e.key !== "ArrowDown" && e.key !== "ArrowUp") {
      e.preventDefault();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (sitzung) zurUebersicht();
      else schliessen();
      return;
    }

    if (!sitzung) {
      // Übersicht
      const i = zeilen.findIndex((z) => z.schluessel === zeile?.schluessel);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const neu = zeilen[Math.max(0, Math.min(zeilen.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (neu) setMarkiert(neu.schluessel);
      } else if (e.key === "ArrowRight" && zeile) {
        e.preventDefault();
        klappen(zeile, true);
      } else if (e.key === "ArrowLeft" && zeile) {
        e.preventDefault();
        if (zeile.offen) klappen(zeile, false);
        else {
          // zur Zeile darüber (Eltern) springen
          const eltern = zeilen.slice(0, i).reverse().find((z) => z.tiefe < zeile.tiefe);
          if (eltern) setMarkiert(eltern.schluessel);
        }
      } else if (e.key === "Enter" && zeile) {
        e.preventDefault();
        starten(zeile.zahlen.faellig > 0 ? "plan" : "frei");
      } else if (taste("f")) {
        e.preventDefault();
        starten("frei");
      } else if (taste("s")) {
        e.preventDefault();
        starten("schwierig");
      } else {
        fokusFangen(e, ref.current);
      }
      return;
    }

    if (!karte) {
      // Ende der Runde: eigene Tasten – Leertaste aus Gewohnheit startet nichts
      const falsch = sitzung.runde.filter((k) => sitzung.falsch.has(k.id));
      if (e.key === "Enter") {
        e.preventDefault();
        zurUebersicht();
      } else if (taste("n") && sitzung.modus !== "plan" && falsch.length > 0) {
        e.preventDefault();
        nochmal(falsch);
      } else if (taste("a") && sitzung.modus !== "plan") {
        e.preventDefault();
        nochmal(sitzung.runde);
      } else if (taste("f") && sitzung.modus === "plan") {
        e.preventDefault();
        nochmal();
      } else if (e.key === " ") {
        e.preventDefault();
      } else {
        fokusFangen(e, ref.current);
      }
      return;
    }

    if ((e.key === " " || e.key === "Enter") && karte && !aufgedeckt) {
      e.preventDefault();
      aufdecken();
    } else if (sitzung.modus === "plan" && /^[1-4]$/.test(e.key) && aufgedeckt) {
      e.preventDefault();
      bewerte(Number(e.key) as Bewertung);
    } else if (sitzung.modus !== "plan" && /^[12]$/.test(e.key) && aufgedeckt) {
      e.preventDefault();
      frei(e.key === "2");
    } else {
      fokusFangen(e, ref.current);
    }
  }

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
          {sitzung && (
            <button className="icon-knopf kartei__zurueck" onClick={zurUebersicht} title="Zur Übersicht (Esc)" aria-label="Zur Übersicht">
              ‹
            </button>
          )}
          <h2 id="kartei-titel">
            {sitzung ? `${sitzung.modus === "plan" ? "Lernen" : sitzung.modus === "frei" ? "Frei üben" : "Schwierige üben"} · ${sitzung.name}` : "Karteikarten"}
          </h2>
          {sitzung && sitzung.stapel.length > 0 && <span className="kartei__zaehler">noch {sitzung.stapel.length}</span>}
          <button className="icon-knopf" onClick={schliessen} aria-label="Karteikarten schließen">
            ✕
          </button>
        </div>
        {sitzung && sitzung.runde.length > 0 && (
          <div className="kartei__fortschritt" aria-hidden="true">
            <div style={{ width: `${Math.min(100, (sitzung.geschafft / sitzung.runde.length) * 100)}%` }} />
          </div>
        )}

        {alle === null && <p className="kartei__hinweis">Karten werden geladen …</p>}

        {alle && !sitzung && alle.length === 0 && (
          <div className="kartei__ende">
            <p className="kartei__gross">Hier gibt es noch keine Karteikarten.</p>
            <p className="kartei__hinweis">
              Lass Claude welche erstellen (<code>/karten</code>) oder schreib selbst einen Kasten
              <code>&gt; [!karten]</code> mit einer Karte pro Zeile: <code>Frage :: Antwort</code>.
            </p>
            <button className="knopf" onClick={schliessen} autoFocus>
              Schließen
            </button>
          </div>
        )}

        {alle && !sitzung && alle.length > 0 && zeile && (
          <>
            <ul className="kartei__liste" ref={listeRef} role="listbox" aria-label="Kartenstapel">
              {zeilen.map((z) => (
                <li
                  key={z.schluessel}
                  role="option"
                  aria-selected={z.schluessel === zeile.schluessel}
                  aria-expanded={z.klappbar ? !!z.offen : undefined}
                  className={`kartei__zeile${z.schluessel === zeile.schluessel ? " kartei__zeile--markiert" : ""}${z.tiefe === 0 ? " kartei__zeile--oben" : ""}`}
                  style={{ paddingLeft: 10 + z.tiefe * 22 }}
                  onClick={() => {
                    setMarkiert(z.schluessel);
                    ref.current?.focus();
                  }}
                  onDoubleClick={() => starten(z.zahlen.faellig > 0 ? "plan" : "frei", { auswahl: z.auswahl, name: z.schluessel === "alle" ? "alle Ordner" : z.name })}
                >
                  <span
                    className="kartei__pfeil"
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMarkiert(z.schluessel);
                      klappen(z, !z.offen);
                      ref.current?.focus();
                    }}
                  >
                    {z.klappbar ? (z.offen ? "▾" : "▸") : ""}
                  </span>
                  <span className="kartei__zeilenname">{z.auswahl.art === "gruppe" ? `🏷 ${z.name}` : z.name}</span>
                  {z.zahlen.faellig > 0 && <span className="kartei__faellig">{z.zahlen.faellig} fällig</span>}
                  <span className="kartei__anzahl">{karten(z.zahlen.gesamt)}</span>
                </li>
              ))}
            </ul>
            <div className="kartei__aktionen">
              <button className="knopf knopf--primaer" disabled={zeile.zahlen.faellig === 0} onClick={() => starten("plan")}>
                Lernen{zeile.zahlen.faellig > 0 ? ` · ${zeile.zahlen.faellig} fällig` : ""} <kbd>↩</kbd>
              </button>
              <button className="knopf" onClick={() => starten("frei")}>
                Frei üben · {karten(zeile.zahlen.gesamt)} <kbd>F</kbd>
              </button>
              <button className="knopf" disabled={zeile.zahlen.schwierig === 0} onClick={() => starten("schwierig")}>
                Schwierige · {zeile.zahlen.schwierig} <kbd>S</kbd>
              </button>
            </div>
            <p className="kartei__hinweis kartei__hinweis--klein">
              {zeile.zahlen.faellig === 0 && "Heute ist hier nichts mehr fällig. "}
              <strong>Frei üben</strong> geht immer und so oft du willst – dein Lernplan bleibt dabei gleich.
              Gruppen in einer Notiz: Titel hinter den Kasten schreiben, z. B. <code>&gt; [!karten] Protokolle</code>.
            </p>
          </>
        )}

        {sitzung && !karte && (
          <SitzungEnde
            sitzung={sitzung}
            lernstand={lernstand.current}
            alle={alle ?? []}
            jetzt={jetzt}
            onNochmal={(nur) => nochmal(nur)}
            onUebersicht={zurUebersicht}
          />
        )}

        {sitzung && karte && (
          <div className="kartei__karte" aria-live="polite">
            <div className="kartei__seite">
              <p className="kartei__frage">{inlineMarkdown(karte.frage)}</p>
              <button className="kartei__vorlesen" onMouseDown={(e) => e.preventDefault()} onClick={() => vorlesen(karte.frage)} title="Frage vorlesen" aria-label="Frage vorlesen">
                🔊
              </button>
            </div>
            {aufgedeckt ? (
              <>
                <div className="kartei__seite kartei__seite--antwort">
                  <p className="kartei__antwort">{inlineMarkdown(karte.antwort)}</p>
                  <button className="kartei__vorlesen" onMouseDown={(e) => e.preventDefault()} onClick={() => vorlesen(karte.antwort)} title="Antwort vorlesen" aria-label="Antwort vorlesen">
                    🔊
                  </button>
                </div>
                <p className="kartei__quelle">
                  aus „{karte.titel}“ ({karte.ordner.replace("/", " › ")}){karte.gruppe ? ` · ${karte.gruppe}` : ""}
                </p>
                {sitzung.modus === "plan" ? (
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
                ) : (
                  <div className="kartei__bewertung kartei__bewertung--frei" role="group" aria-label="Wusstest du es?">
                    <button className="kartei__note kartei__note--1" onClick={() => frei(false)}>
                      <span>
                        <kbd>1</kbd> Wusste ich nicht
                      </span>
                      <small>kommt gleich noch mal</small>
                    </button>
                    <button className="kartei__note kartei__note--3" onClick={() => frei(true)}>
                      <span>
                        <kbd>2</kbd> Wusste ich
                      </span>
                      <small>weiter</small>
                    </button>
                  </div>
                )}
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

function SitzungEnde({
  sitzung,
  lernstand,
  alle,
  jetzt,
  onNochmal,
  onUebersicht,
}: {
  sitzung: Sitzung;
  lernstand: Lernstand;
  alle: Karte[];
  jetzt: number;
  onNochmal: (nur?: Karte[]) => void;
  onUebersicht: () => void;
}) {

  if (sitzung.modus === "plan") {
    const auswahl = eindeutig(alle.filter((k) => passt(k, sitzung.auswahl)));
    // nächster Termin: früheste spätere Fälligkeit – nach den Bewertungen dieser Sitzung
    const termine = auswahl.map((k) => lernstand.karten[k.id]?.faellig).filter((t): t is number => !!t && t > jetzt);
    const naechste = termine.length ? Math.min(...termine) : null;
    const neueOffen = auswahl.filter((k) => !lernstand.karten[k.id]).length;
    const grenze = neueOffen > 0 && neuUebrig(lernstand, jetzt) === 0;
    return (
      <div className="kartei__ende">
        <p className="kartei__gross">Geschafft! {karten(sitzung.geschafft)} gelernt. 🎉</p>
        {grenze && <p className="kartei__hinweis">Heute hast du schon 20 neue Karten gelernt – {neueOffen} weitere kommen ab morgen dazu.</p>}
        {naechste && (
          <p className="kartei__hinweis">
            Nächste Karte fällig:{" "}
            {new Date(naechste).toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        <p className="kartei__hinweis">Noch Lust? Mit „Frei üben“ kannst du alle Karten noch einmal durchgehen.</p>
        <div className="kartei__aktionen">
          <button className="knopf knopf--primaer" onClick={onUebersicht}>
            Zur Übersicht <kbd>↩</kbd>
          </button>
          <button className="knopf" onClick={() => onNochmal()}>
            Frei üben · {karten(auswahl.length)} <kbd>F</kbd>
          </button>
        </div>
      </div>
    );
  }

  const falsch = sitzung.runde.filter((k) => sitzung.falsch.has(k.id));
  const gleich = sitzung.runde.length - falsch.length;
  return (
    <div className="kartei__ende">
      <p className="kartei__gross">
        Runde fertig! {gleich} von {karten(sitzung.runde.length)} gleich gewusst.{falsch.length === 0 ? " 🎉" : ""}
      </p>
      {falsch.length > 0 && <p className="kartei__hinweis">{falsch.length === 1 ? "Eine Karte" : `${falsch.length} Karten`} wusstest du beim ersten Mal nicht – die kannst du gleich noch einmal üben.</p>}
      <div className="kartei__aktionen">
        {falsch.length > 0 && (
          <button className="knopf knopf--primaer" onClick={() => onNochmal(falsch)}>
            Nur die {falsch.length} nicht gewussten <kbd>N</kbd>
          </button>
        )}
        <button className="knopf" onClick={() => onNochmal(sitzung.runde)}>
          Alle noch einmal <kbd>A</kbd>
        </button>
        <button className="knopf" onClick={onUebersicht}>
          Zur Übersicht <kbd>↩</kbd>
        </button>
      </div>
    </div>
  );
}
