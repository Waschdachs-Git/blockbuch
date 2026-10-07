import { useEffect, useRef, useState, type Ref } from "react";
import type { Ordner } from "../lernfelder";
import { datumAnzeigen, type NotizInfo } from "../api";

type Props = {
  ref?: Ref<HTMLElement>;
  ordner: Ordner;
  notizen: NotizInfo[];
  aktiveDatei: string | null;
  umbenennenDatei: string | null;
  sidebarOffen: boolean;
  toggleRef: Ref<HTMLButtonElement>;
  onToggleSidebar: () => void;
  onAuswahl: (datei: string) => void;
  onNeu: () => void;
  onUmbenennenStart: (datei: string) => void;
  onUmbenennen: (datei: string, titel: string) => void;
  onUmbenennenAbbrechen: () => void;
  onLoeschen: (datei: string) => void;
  onZurueck: () => void;
};

export function NoteList(props: Props) {
  const { ordner, notizen, aktiveDatei, umbenennenDatei } = props;
  const listeRef = useRef<HTMLUListElement>(null);

  // Nach dem Umbenennen den Fokus zurück auf die Notiz setzen
  const warUmbenennen = useRef(false);
  useEffect(() => {
    if (warUmbenennen.current && umbenennenDatei === null) {
      listeRef.current?.querySelector<HTMLButtonElement>(".ist-aktiv")?.focus();
    }
    warUmbenennen.current = umbenennenDatei !== null;
  }, [umbenennenDatei, aktiveDatei]);

  function onKeyDown(e: React.KeyboardEvent) {
    const zielEl = e.target as HTMLElement;
    if (zielEl.tagName === "INPUT") return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      props.onZurueck();
      return;
    }
    if (!zielEl.classList.contains("notiz")) return;
    const index = notizen.findIndex((n) => n.datei === aktiveDatei);
    if (index < 0) return;
    if (e.key === "Enter") {
      e.preventDefault();
      props.onUmbenennenStart(notizen[index].datei);
      return;
    }
    if (e.key === "Backspace" && e.metaKey) {
      e.preventDefault();
      props.onLoeschen(notizen[index].datei);
      return;
    }
    const ziel: Record<string, number> = {
      ArrowDown: Math.min(index + 1, notizen.length - 1),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: notizen.length - 1,
    };
    if (!(e.key in ziel)) return;
    e.preventDefault();
    const neu = ziel[e.key];
    props.onAuswahl(notizen[neu].datei);
    listeRef.current?.querySelectorAll<HTMLButtonElement>(".notiz")[neu]?.focus();
  }

  return (
    <section className="notizliste" aria-label={`Notizen in ${ordner.anzeige}`} ref={props.ref} onKeyDown={onKeyDown}>
      <div className="titelleiste" data-tauri-drag-region>
        <button
          ref={props.toggleRef}
          className="icon-knopf"
          onClick={props.onToggleSidebar}
          title={props.sidebarOffen ? "Ordner ausblenden (⌥⌘S)" : "Ordner einblenden (⌥⌘S)"}
          aria-label="Ordner-Leiste"
          aria-pressed={props.sidebarOffen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
          </svg>
        </button>
        <div className="titelleiste__platz" data-tauri-drag-region />
        <button className="icon-knopf neue-notiz" onClick={props.onNeu} title="Neue Notiz (⌘N)" aria-label="Neue Notiz">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <header className="notizliste__kopf">
        <div className="notizliste__lf">{ordner.lernfeld ? `Lernfeld ${ordner.lernfeld.rlp}` : "Fach"}</div>
        <h1 className="notizliste__titel">{ordner.titel}</h1>
      </header>

      {notizen.length === 0 ? (
        <div className="leer">
          <p>Noch keine Notizen.</p>
          <p className="leer__hinweis">Mit ⌘N legst du eine neue an.</p>
        </div>
      ) : (
        <ul className="notizliste__liste" ref={listeRef}>
          {notizen.map((n) => {
            const istAktiv = n.datei === aktiveDatei;
            return (
              <li key={n.datei}>
                {n.datei === umbenennenDatei ? (
                  <TitelEingabe
                    start={n.titel}
                    onFertig={(titel) => props.onUmbenennen(n.datei, titel)}
                    onAbbrechen={props.onUmbenennenAbbrechen}
                  />
                ) : (
                  <button
                    className={`notiz ${istAktiv ? "ist-aktiv" : ""}`}
                    aria-current={istAktiv ? "true" : undefined}
                    tabIndex={istAktiv || (!aktiveDatei && n === notizen[0]) ? 0 : -1}
                    onClick={() => props.onAuswahl(n.datei)}
                    onDoubleClick={() => props.onUmbenennenStart(n.datei)}
                    title="Enter: umbenennen · ⌘⌫: in den Papierkorb"
                  >
                    <span className="notiz__titel">{n.titel}</span>
                    <span className="notiz__datum">{datumAnzeigen(n.datum)}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TitelEingabe({
  start,
  onFertig,
  onAbbrechen,
}: {
  start: string;
  onFertig: (titel: string) => void;
  onAbbrechen: () => void;
}) {
  const [wert, setWert] = useState(start);
  const erledigt = useRef(false);

  function fertig() {
    if (erledigt.current) return;
    erledigt.current = true;
    const titel = wert.trim();
    if (!titel || titel === start) onAbbrechen();
    else onFertig(titel);
  }

  return (
    <input
      className="inline-eingabe inline-eingabe--notiz"
      autoFocus
      onFocus={(e) => e.target.select()}
      aria-label="Titel der Notiz"
      value={wert}
      onChange={(e) => setWert(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") fertig();
        if (e.key === "Escape") {
          erledigt.current = true;
          onAbbrechen();
        }
      }}
      onBlur={fertig}
    />
  );
}
