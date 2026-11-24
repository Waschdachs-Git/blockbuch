// LK-Planer: Leistungskontrollen eintragen (Datum, Ordner, Thema) und den Lernplan bis dahin abhaken.
// Die Termine stehen in Untis – hier trägt man sie einmal ein; gespeichert in ~/Schule/.blockbuch/lks.json
// (mit gesichert, Claude liest sie für /lk).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type NotizInfo } from "../api";
import type { Ordner } from "../lernfelder";
import { fokusFangen } from "../components/Kontextmenue";
import { abstandText, datumLang, heuteText, lksAusText, lksText, planErstellen, plusTage, stoffAbVorschlag, tageZwischen, type Lk, type LkDatei, type Plan, type StoffNotiz } from "./plan";

type Formular = { id: string | null; datum: string; ordner: string; thema: string; ab: string };

export function LkPlaner({
  ordnerListe,
  vorauswahl,
  onNotizOeffnen,
  onKartenLernen,
  onGeaendert,
  onSchliessen,
  onFehler,
}: {
  ordnerListe: Ordner[];
  /** Ordner, für den gleich eine neue LK eingetragen werden soll (Rechtsklick → LK eintragen) */
  vorauswahl?: string;
  onNotizOeffnen: (ordner: string, datei: string) => void;
  onKartenLernen: (ordner: string, titel: string) => void;
  onGeaendert: (datei: LkDatei) => void;
  onSchliessen: () => void;
  onFehler: (e: unknown) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const vorherFokus = useRef(document.activeElement as HTMLElement | null);
  const [daten, setDaten] = useState<LkDatei | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [formular, setFormular] = useState<Formular | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  // Speichern der Reihe nach – nie zwei Schreibvorgänge gleichzeitig (schnelles Abhaken)
  const speichert = useRef<Promise<void>>(Promise.resolve());
  /** Fokus zurück in den Planer (sonst wirkt Esc nicht mehr, wenn das fokussierte Element verschwindet) */
  const fokus = () => requestAnimationFrame(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  });
  const heute = heuteText();
  const ordnerName = (name: string) => ordnerListe.find((o) => o.name === name)?.titel ?? name;
  const ziele = ordnerListe.filter((o) => o.name !== "Claude" && o.name !== "Gerettet");

  const neuesFormular = useCallback(
    (ordner: string, lks: Lk[]): Formular => {
      const datum = plusTage(heuteText(), 7);
      return { id: null, datum, ordner, thema: "", ab: stoffAbVorschlag(lks, ordner, datum) ?? "" };
    },
    [],
  );

  // Laden
  useEffect(() => {
    api
      .lksLesen()
      .then((text) => {
        const d = lksAusText(text);
        setDaten(d);
        const kommende = d.lks.filter((l) => l.datum >= heute).sort((a, b) => a.datum.localeCompare(b.datum));
        if (vorauswahl) setFormular(neuesFormular(vorauswahl, d.lks));
        else if (kommende[0]) setGewaehlt(kommende[0].id);
        else if (d.lks.length === 0 && ziele[0]) setFormular(neuesFormular(ziele[0].name, d.lks));
      })
      .catch((e) => {
        onFehler(e);
        onSchliessen();
      });
    ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lk = daten?.lks.find((l) => l.id === gewaehlt) ?? null;

  // Plan für die gewählte LK: Notizen des Ordners (mit Unterordnern), Karten und ❓ dazu
  useEffect(() => {
    if (!lk) return setPlan(null);
    let aktiv = true;
    const ordner = ordnerListe.filter((o) => o.name === lk.ordner || o.eltern === lk.ordner).map((o) => o.name);
    Promise.all([
      Promise.all(ordner.map((o) => api.notizenAuflisten(o).then((l: NotizInfo[]) => l.map((n): StoffNotiz => ({ ordner: o, datei: n.datei, titel: n.titel, datum: n.datum }))))),
      api.kartenSammeln(lk.ordner),
      api.notizenMit(lk.ordner, "❓"),
    ])
      .then(([listen, karten, fragen]) => {
        if (!aktiv) return;
        const mitKarten = new Set(karten.map((k) => `${k.ordner}/${k.datei}`));
        const mitFragen = new Set(fragen);
        setPlan(planErstellen(lk, listen.flat(), heute, { mitFragen, mitKarten }));
      })
      .catch(onFehler);
    return () => {
      aktiv = false;
    };
  }, [lk, ordnerListe, heute, onFehler]);
  useEffect(() => setLoeschenFrage(false), [gewaehlt]);

  function speichern(neu: LkDatei) {
    setDaten(neu);
    onGeaendert(neu);
    const text = lksText(neu);
    speichert.current = speichert.current.then(() => api.lksSchreiben(text)).catch(onFehler);
  }

  function umschalten(schluessel: string) {
    if (!daten || !lk) return;
    const erledigt = lk.erledigt.includes(schluessel) ? lk.erledigt.filter((s) => s !== schluessel) : [...lk.erledigt, schluessel];
    speichern({ ...daten, lks: daten.lks.map((l) => (l.id === lk.id ? { ...l, erledigt } : l)) });
    fokus();
  }

  function formularSpeichern() {
    if (!daten || !formular || !/^\d{4}-\d{2}-\d{2}$/.test(formular.datum) || !formular.ordner) return;
    const id = formular.id ?? `${formular.datum}-${Date.now().toString(36)}`;
    const alt = daten.lks.find((l) => l.id === id);
    const eintrag: Lk = {
      id,
      datum: formular.datum,
      ordner: formular.ordner,
      thema: formular.thema.trim(),
      ab: formular.ab || undefined,
      // anderer Ordner = anderer Stoff: alte Haken gelten nicht mehr
      erledigt: alt && alt.ordner === formular.ordner ? alt.erledigt : [],
    };
    speichern({ ...daten, lks: [...daten.lks.filter((l) => l.id !== id), eintrag] });
    setFormular(null);
    setGewaehlt(id);
    fokus();
  }

  function loeschen() {
    if (!daten || !lk) return;
    speichern({ ...daten, lks: daten.lks.filter((l) => l.id !== lk.id) });
    setGewaehlt(null);
    fokus();
  }

  const schliessen = () => {
    // laufende Speicherung abwarten, dann schließen
    speichert.current.finally(() => {
      onSchliessen();
      vorherFokus.current?.focus?.();
    });
  };

  const sortiert = useMemo(() => [...(daten?.lks ?? [])].sort((a, b) => a.datum.localeCompare(b.datum)), [daten]);
  const kommende = sortiert.filter((l) => l.datum >= heute);
  const vergangene = sortiert.filter((l) => l.datum < heute).reverse();
  const tagName = (datum: string) => {
    const d = tageZwischen(heute, datum);
    return d === 0 ? "Heute" : d === 1 ? "Morgen" : datumLang(datum);
  };

  function lkKnopf(l: Lk) {
    const tage = tageZwischen(heute, l.datum);
    return (
      <li key={l.id}>
        <button
          className={`lk__eintrag ${l.id === gewaehlt && !formular ? "ist-aktiv" : ""} ${tage < 0 ? "ist-vorbei" : ""}`}
          onClick={() => {
            setFormular(null);
            setGewaehlt(l.id);
          }}
        >
          <span className="lk__eintrag-titel">{l.thema || ordnerName(l.ordner)}</span>
          <span className="lk__eintrag-info">
            {datumLang(l.datum)} · {ordnerName(l.ordner)} · <strong>{abstandText(tage)}</strong>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="suche-hintergrund" onMouseDown={schliessen}>
      <div
        ref={ref}
        className="lk"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lk-titel"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (formular && daten?.lks.length) {
              setFormular(null);
              fokus();
            } else schliessen();
          }
          fokusFangen(e, ref.current);
        }}
      >
        <div className="lk__kopf">
          <h2 id="lk-titel">📅 LK-Planer</h2>
          <button className="icon-knopf" onClick={schliessen} aria-label="LK-Planer schließen">
            ✕
          </button>
        </div>
        <div className="lk__inhalt">
          <nav className="lk__liste" aria-label="Leistungskontrollen">
            <button className="lk__neu" onClick={() => daten && setFormular(neuesFormular(lk?.ordner ?? ziele[0]?.name ?? "", daten.lks))}>
              + LK eintragen
            </button>
            {kommende.length > 0 && <ul>{kommende.map(lkKnopf)}</ul>}
            {vergangene.length > 0 && (
              <details className="lk__vergangen">
                <summary>Vergangene ({vergangene.length})</summary>
                <ul>{vergangene.map(lkKnopf)}</ul>
              </details>
            )}
          </nav>

          <section className="lk__plan">
            {formular ? (
              <form
                className="lk__formular"
                onSubmit={(e) => {
                  e.preventDefault();
                  formularSpeichern();
                }}
              >
                <h3>{formular.id ? "LK bearbeiten" : "Neue LK eintragen"}</h3>
                <p className="lk__hinweis">Den Termin findest du in Untis.</p>
                <label>
                  Datum
                  <input
                    type="date"
                    required
                    value={formular.datum}
                    onChange={(e) =>
                      setFormular({ ...formular, datum: e.target.value, ab: formular.id ? formular.ab : stoffAbVorschlag(daten?.lks ?? [], formular.ordner, e.target.value) ?? "" })
                    }
                    autoFocus
                  />
                </label>
                <label>
                  Lernfeld / Fach
                  <select
                    value={formular.ordner}
                    onChange={(e) =>
                      setFormular({ ...formular, ordner: e.target.value, ab: formular.id ? formular.ab : stoffAbVorschlag(daten?.lks ?? [], e.target.value, formular.datum) ?? "" })
                    }
                  >
                    {/* Ordner gibt es nicht mehr (gelöscht/umbenannt): trotzdem anzeigen, nicht still wechseln */}
                    {formular.ordner && !ziele.some((o) => o.name === formular.ordner) && (
                      <option value={formular.ordner}>{formular.ordner} (nicht mehr vorhanden)</option>
                    )}
                    {ziele.map((o) => (
                      <option key={o.name} value={o.name}>
                        {o.titel}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Thema <span className="lk__optional">(z. B. „Normalformen und SQL“)</span>
                  <input value={formular.thema} onChange={(e) => setFormular({ ...formular, thema: e.target.value })} placeholder="optional" />
                </label>
                <label>
                  Stoff ab <span className="lk__optional">(leer = alle Notizen des Ordners)</span>
                  <input type="date" value={formular.ab} onChange={(e) => setFormular({ ...formular, ab: e.target.value })} />
                </label>
                <div className="lk__knoepfe">
                  {daten && daten.lks.length > 0 && (
                    <button
                      type="button"
                      className="knopf"
                      onClick={() => {
                        setFormular(null);
                        fokus();
                      }}
                    >
                      Abbrechen
                    </button>
                  )}
                  <button type="submit" className="knopf knopf--primaer">
                    Speichern
                  </button>
                </div>
              </form>
            ) : !lk ? (
              <p className="lk__hinweis">{daten ? "Wähle links eine LK oder trag eine neue ein." : "Wird geladen …"}</p>
            ) : (
              <>
                <div className="lk__plan-kopf">
                  <div>
                    <h3>{lk.thema || ordnerName(lk.ordner)}</h3>
                    <p className="lk__hinweis">
                      {datumLang(lk.datum)} · {ordnerName(lk.ordner)} · <strong>{abstandText(tageZwischen(heute, lk.datum))}</strong>
                      {plan && ` · ${plan.stoff.length === 1 ? "1 Notiz" : `${plan.stoff.length} Notizen`} Stoff`}
                    </p>
                  </div>
                  <div className="lk__aktionen">
                    <button className="knopf" onClick={() => onKartenLernen(lk.ordner, ordnerName(lk.ordner))}>
                      🗂 Karten lernen
                    </button>
                    <button
                      className="knopf"
                      onClick={() => setFormular({ id: lk.id, datum: lk.datum, ordner: lk.ordner, thema: lk.thema, ab: lk.ab ?? "" })}
                    >
                      Bearbeiten
                    </button>
                    <button className={`knopf ${loeschenFrage ? "knopf--gefaehrlich" : ""}`} onClick={() => (loeschenFrage ? loeschen() : setLoeschenFrage(true))}>
                      {loeschenFrage ? "Wirklich löschen?" : "Löschen"}
                    </button>
                  </div>
                </div>
                {plan && plan.stoff.length > 0 && (
                  <div className="lk__fortschritt" aria-label="Fortschritt">
                    <div style={{ width: `${Math.round((plan.erledigteNotizen.length / plan.stoff.length) * 100)}%` }} />
                    <span>
                      {plan.erledigteNotizen.length} von {plan.stoff.length} Notizen gelernt
                    </span>
                  </div>
                )}
                {plan?.nochTage !== undefined && plan.nochTage < 0 && <p className="lk__hinweis">Diese LK ist vorbei. Wie lief's? 🙂</p>}
                {plan && plan.stoff.length === 0 && plan.nochTage >= 0 && (
                  <p className="lk__hinweis">In diesem Zeitraum gibt es noch keine Notizen. Prüf „Stoff ab“ unter „Bearbeiten“.</p>
                )}
                <ol className="lk__tage">
                  {/* Tage ohne Aufgaben (wenig Stoff, viel Zeit) weglassen */}
                  {plan?.tage.filter((t) => t.eintraege.length > 0).map((t) => (
                    <li key={t.datum} className={t.datum === heute ? "ist-heute" : ""}>
                      <h4>{tagName(t.datum)}</h4>
                      <ul>
                        {t.eintraege.map((e) => {
                          const fertig = lk.erledigt.includes(e.schluessel);
                          return (
                            <li key={e.schluessel} className={fertig ? "ist-erledigt" : ""}>
                              <label>
                                <input type="checkbox" checked={fertig} onChange={() => umschalten(e.schluessel)} />
                                {e.notiz ? (
                                  <button type="button" className="lk__link" onClick={() => onNotizOeffnen(e.notiz!.ordner, e.notiz!.datei)} title="Notiz öffnen">
                                    {e.text}
                                  </button>
                                ) : e.art === "karten" ? (
                                  <button type="button" className="lk__link" onClick={() => onKartenLernen(lk.ordner, ordnerName(lk.ordner))}>
                                    {e.text}
                                  </button>
                                ) : (
                                  <span>{e.text}</span>
                                )}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
                {plan && plan.erledigteNotizen.length > 0 && (
                  <details className="lk__vergangen">
                    <summary>Schon gelernt ({plan.erledigteNotizen.length})</summary>
                    <ul>
                      {plan.erledigteNotizen.map((n) => (
                        <li key={`${n.ordner}/${n.datei}`} className="ist-erledigt">
                          <label>
                            <input type="checkbox" checked onChange={() => umschalten(`notiz|${n.ordner}/${n.datei}`)} />
                            <span>{n.titel}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
