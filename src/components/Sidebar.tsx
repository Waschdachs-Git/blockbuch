import { useRef, useState, type Ref } from "react";
import type { Ordner } from "../lernfelder";

type Props = {
  ref?: Ref<HTMLElement>;
  hidden: boolean;
  lernfelder: Ordner[];
  faecher: Ordner[];
  aktiv: string;
  onAuswahl: (name: string) => void;
  onWeiter: () => void;
  onNeuerOrdner: (name: string) => Promise<boolean>;
  /** Rechtsklick auf einen Ordner */
  onMenue: (name: string, x: number, y: number) => void;
  onHilfe: () => void;
  /** Ordner, unter dem gerade ein Unterordner benannt wird (Eingabefeld) – sonst null */
  unterordnerFuer: string | null;
  onNeuerUnterordner: (eltern: string, name: string) => Promise<boolean>;
  onUnterordnerAbbrechen: () => void;
  /** Hinweis unten, z. B. "Gesichert heute, 10:42" */
  sicherung: string | null;
  /** Zusatzinfo als Tooltip (z. B. nicht mitgesicherte Projektordner) */
  sicherungHinweis: string | null;
};

export function Sidebar({
  ref,
  hidden,
  lernfelder,
  faecher,
  aktiv,
  onAuswahl,
  onWeiter,
  onNeuerOrdner,
  onMenue,
  onHilfe,
  unterordnerFuer,
  onNeuerUnterordner,
  onUnterordnerAbbrechen,
  sicherung,
  sicherungHinweis,
}: Props) {
  const navRef = useRef<HTMLElement | null>(null);
  const [neuerOrdner, setNeuerOrdner] = useState<string | null>(null);
  const legtAn = useRef(false);
  const alle = [...lernfelder, ...faecher];

  function setRefs(el: HTMLElement | null) {
    navRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  }

  // ↑/↓/Pos1/Ende wechseln den Ordner, → oder Enter springt in die Notizliste
  function onKeyDown(e: React.KeyboardEvent) {
    // Nur auf Ordner-Einträgen – nicht auf dem +-Knopf oder im Eingabefeld
    if (!(e.target as HTMLElement).dataset.ordner) return;
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      onWeiter();
      return;
    }
    const index = alle.findIndex((o) => o.name === aktiv);
    const ziel: Record<string, number> = {
      ArrowDown: Math.min(index + 1, alle.length - 1),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: alle.length - 1,
    };
    if (!(e.key in ziel)) return;
    e.preventDefault();
    const neu = alle[ziel[e.key]];
    onAuswahl(neu.name);
    navRef.current?.querySelector<HTMLButtonElement>(`[data-ordner="${CSS.escape(neu.name)}"]`)?.focus();
  }

  async function ordnerAnlegen() {
    if (legtAn.current) return;
    const name = neuerOrdner?.trim();
    if (!name) {
      setNeuerOrdner(null);
      return;
    }
    legtAn.current = true;
    const ok = await onNeuerOrdner(name);
    legtAn.current = false;
    // Bei Fehler bleibt das Feld offen, damit man den Namen korrigieren kann
    if (ok) setNeuerOrdner(null);
  }

  /** Eingabefeld für einen neuen Unterordner – erscheint hinter dem letzten Unterordner von `eltern` */
  function unterordnerEingabe(o: Ordner, liste: Ordner[]) {
    if (!unterordnerFuer) return null;
    const letzter = [...liste].reverse().find((x) => x.name === unterordnerFuer || x.eltern === unterordnerFuer);
    if (letzter?.name !== o.name) return null;
    return (
      <li key={`${unterordnerFuer}/+`}>
        <UnterordnerEingabe eltern={unterordnerFuer} onFertig={onNeuerUnterordner} onAbbrechen={onUnterordnerAbbrechen} />
      </li>
    );
  }

  function eintrag(o: Ordner, _i: number, liste: Ordner[]) {
    const istAktiv = o.name === aktiv;
    return [
      <li key={o.name}>
        <button
          data-ordner={o.name}
          className={`sidebar__eintrag ${o.eltern ? "sidebar__eintrag--unter" : ""} ${istAktiv ? "ist-aktiv" : ""}`}
          aria-current={istAktiv ? "true" : undefined}
          tabIndex={istAktiv ? 0 : -1}
          title={o.titel}
          onClick={() => onAuswahl(o.name)}
          onContextMenu={(e) => {
            e.preventDefault();
            onAuswahl(o.name);
            e.currentTarget.focus();
            onMenue(o.name, e.clientX, e.clientY);
          }}
        >
          <span className="sidebar__nummer sidebar__nummer--ordner" aria-hidden="true">
            <OrdnerIcon />
          </span>
          <span className="sidebar__name">{o.anzeige}</span>
        </button>
      </li>,
      unterordnerEingabe(o, liste),
    ];
  }

  return (
    <nav className="sidebar" aria-label="Ordner" ref={setRefs} hidden={hidden} onKeyDown={onKeyDown}>
      <div className="titelleiste" data-tauri-drag-region />
      <div className="sidebar__scroll">
        <h2 className="sidebar__abschnitt" id="sidebar-lernfelder">
          Lernfelder
        </h2>
        <ul className="sidebar__liste" aria-labelledby="sidebar-lernfelder">
          {lernfelder.map(eintrag)}
          {lernfelder.length === 0 && <li className="sidebar__hinweis">Ordner wie „LF1“, „LF2“ … erscheinen hier – mit + anlegen</li>}
        </ul>

        <div className="sidebar__abschnitt-zeile">
          <h2 className="sidebar__abschnitt" id="sidebar-faecher">
            Fächer
          </h2>
          <button
            className="icon-knopf icon-knopf--klein"
            title="Neuer Ordner"
            aria-label="Neuer Ordner"
            onClick={() => setNeuerOrdner("")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="sidebar__liste" aria-labelledby="sidebar-faecher">
          {faecher.map(eintrag)}
          {neuerOrdner !== null && (
            <li>
              <input
                className="inline-eingabe"
                autoFocus
                placeholder="z. B. Deutsch oder LF6"
                aria-label="Name des neuen Ordners"
                value={neuerOrdner}
                onChange={(e) => setNeuerOrdner(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ordnerAnlegen();
                  if (e.key === "Escape") setNeuerOrdner(null);
                }}
                onBlur={() => setNeuerOrdner(null)}
              />
            </li>
          )}
          {faecher.length === 0 && neuerOrdner === null && (
            <li className="sidebar__hinweis">Deutsch, Englisch, Wirtschaft … mit + anlegen (LF3 usw. landen oben)</li>
          )}
        </ul>
      </div>
      <div className="sidebar__fuss">
        {sicherung && (
          <div className={`sidebar__sicherung ${sicherung.startsWith("⚠") ? "ist-fehler" : ""}`} title={sicherungHinweis ?? "Automatische Sicherung (Git) – ⌘S sichert sofort, ⇧⌘H zeigt Versionen"}>
            {sicherung}
          </div>
        )}
        <button className="sidebar__hilfe" onClick={onHilfe} title="Hilfe (⌘ß)" aria-label="Hilfe">
          ?
        </button>
      </div>
    </nav>
  );
}

function OrdnerIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12">
      <path
        d="M1.5 2.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  );
}

/** Name für einen neuen Unterordner eintippen (Enter legt an, Esc bricht ab) */
function UnterordnerEingabe({
  eltern,
  onFertig,
  onAbbrechen,
}: {
  eltern: string;
  onFertig: (eltern: string, name: string) => Promise<boolean>;
  onAbbrechen: () => void;
}) {
  const [wert, setWert] = useState("");
  const laeuft = useRef(false);
  async function anlegen() {
    if (laeuft.current) return;
    const name = wert.trim();
    if (!name) return onAbbrechen();
    laeuft.current = true;
    await onFertig(eltern, name);
    laeuft.current = false;
  }
  return (
    <input
      className="inline-eingabe inline-eingabe--unter"
      autoFocus
      placeholder="Name des Unterordners"
      aria-label={`Neuer Unterordner in ${eltern}`}
      value={wert}
      onChange={(e) => setWert(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") anlegen();
        if (e.key === "Escape") onAbbrechen();
      }}
      onBlur={() => !laeuft.current && onAbbrechen()}
    />
  );
}
