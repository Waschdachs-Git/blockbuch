// Rechtsklick-Menü (für Notizen und Ordner) und Rückfrage-Dialog. Beides auch per Tastatur bedienbar:
// ↑↓ wählen, Enter ausführen, Esc schließt und gibt den Fokus zurück.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Tab bleibt im Dialog (sonst landet man in der Notizliste dahinter und z. B. ⌘⌫ löscht dort) */
export function fokusFangen(e: React.KeyboardEvent, behaelter: HTMLElement | null) {
  if (e.key !== "Tab" || !behaelter) return;
  const ziele = [...behaelter.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input, [tabindex]:not([tabindex='-1'])")];
  if (ziele.length === 0) {
    e.preventDefault();
    return;
  }
  const i = ziele.indexOf(document.activeElement as HTMLElement);
  const n = ziele.length;
  e.preventDefault();
  const naechstes = e.shiftKey ? (i <= 0 ? n - 1 : i - 1) : i < 0 || i === n - 1 ? 0 : i + 1;
  ziele[naechstes]?.focus();
}

export type MenueEintrag = {
  titel: string;
  aktion: () => void;
  /** z. B. "↩" oder "⌘⌫" – nur zur Anzeige */
  kuerzel?: string;
  gefaehrlich?: boolean;
  /** ausgegraut, mit Begründung als Tooltip */
  gesperrt?: string;
};

export function Kontextmenue({
  x,
  y,
  eintraege,
  onSchliessen,
}: {
  x: number;
  y: number;
  eintraege: MenueEintrag[];
  onSchliessen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const vorherFokus = useRef(document.activeElement as HTMLElement | null);
  const [pos, setPos] = useState({ x, y });

  // Nicht über den Fensterrand hinaus
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
    // Ohne wählbaren Eintrag (z. B. Claude-Ordner) den Rahmen fokussieren – sonst wirkt Esc nicht
    (ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? ref.current)?.focus();
  }, [x, y]);

  useEffect(() => {
    const zu = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onSchliessen();
    };
    window.addEventListener("mousedown", zu, true);
    window.addEventListener("blur", onSchliessen);
    return () => {
      window.removeEventListener("mousedown", zu, true);
      window.removeEventListener("blur", onSchliessen);
    };
  }, [onSchliessen]);

  function schliessen() {
    onSchliessen();
    vorherFokus.current?.focus?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const knoepfe = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      schliessen();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = knoepfe.length;
      if (n === 0) return;
      knoepfe[i < 0 ? (e.key === "ArrowDown" ? 0 : n - 1) : (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n]?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  }

  return (
    <div
      ref={ref}
      className="kontextmenue"
      role="menu"
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {eintraege.map((m) => (
        <button
          key={m.titel}
          role="menuitem"
          aria-disabled={m.gesperrt ? true : undefined}
          className={`kontextmenue__eintrag ${m.gefaehrlich ? "ist-gefaehrlich" : ""}`}
          disabled={!!m.gesperrt}
          title={m.gesperrt}
          onClick={() => {
            onSchliessen();
            m.aktion();
          }}
        >
          <span>{m.titel}</span>
          {m.kuerzel && <kbd>{m.kuerzel}</kbd>}
        </button>
      ))}
      {/* Begründung für gesperrte Einträge auch ohne Maus lesbar */}
      {eintraege
        .filter((m) => m.gesperrt)
        .map((m) => (
          <p key={`${m.titel}-grund`} className="kontextmenue__grund">
            {m.gesperrt}
          </p>
        ))}
    </div>
  );
}

/** Rückfrage vor etwas Unumkehrbarem. Der Fokus steht auf „Abbrechen“ – Enter allein löscht nichts. */
export function Rueckfrage({
  titel,
  text,
  ja,
  onJa,
  onNein,
}: {
  titel: string;
  text: string;
  ja: string;
  /** Darf ein Promise liefern: Der Dialog bleibt dann offen (Knöpfe gesperrt), bis es fertig ist */
  onJa: () => void | Promise<void>;
  /** Abbrechen – der Aufrufer setzt den Fokus zurück */
  onNein: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const neinRef = useRef<HTMLButtonElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => neinRef.current?.focus(), []);
  const nein = () => {
    if (!laeuft) onNein();
  };
  async function bestaetigen() {
    if (laeuft) return;
    setLaeuft(true);
    try {
      await onJa();
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <div className="suche-hintergrund" onMouseDown={nein}>
      <div
        ref={ref}
        className="rueckfrage"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rueckfrage-titel"
        aria-describedby="rueckfrage-text"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            nein();
          }
          fokusFangen(e, ref.current);
        }}
      >
        <h2 id="rueckfrage-titel">{titel}</h2>
        <p id="rueckfrage-text">{text}</p>
        <div className="rueckfrage__knoepfe">
          <button ref={neinRef} className="knopf" onClick={nein} disabled={laeuft}>
            Abbrechen
          </button>
          <button className="knopf knopf--gefaehrlich" onClick={bestaetigen} disabled={laeuft}>
            {laeuft ? "Einen Moment …" : ja}
          </button>
        </div>
      </div>
    </div>
  );
}
