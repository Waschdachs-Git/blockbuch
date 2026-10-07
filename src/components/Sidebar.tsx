import { useRef, type Ref } from "react";
import type { Lernfeld } from "../lernfelder";

type Props = {
  ref?: Ref<HTMLElement>;
  hidden: boolean;
  lernfelder: Lernfeld[];
  aktivId: string;
  onAuswahl: (id: string) => void;
};

export function Sidebar({ ref, hidden, lernfelder, aktivId, onAuswahl }: Props) {
  const listeRef = useRef<HTMLUListElement>(null);

  // ↑/↓/Pos1/Ende wechseln das Lernfeld, damit alles ohne Maus geht
  function onKeyDown(e: React.KeyboardEvent) {
    const index = lernfelder.findIndex((lf) => lf.id === aktivId);
    const ziel: Record<string, number> = {
      ArrowDown: Math.min(index + 1, lernfelder.length - 1),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: lernfelder.length - 1,
    };
    if (!(e.key in ziel)) return;
    e.preventDefault();
    const neu = ziel[e.key];
    onAuswahl(lernfelder[neu].id);
    listeRef.current?.querySelectorAll<HTMLButtonElement>("button")[neu]?.focus();
  }

  return (
    <nav className="sidebar" aria-labelledby="sidebar-titel" ref={ref} hidden={hidden}>
      <div className="titelleiste" data-tauri-drag-region />
      <h2 className="sidebar__abschnitt" id="sidebar-titel">
        Lernfelder
      </h2>
      <ul className="sidebar__liste" ref={listeRef} onKeyDown={onKeyDown}>
        {lernfelder.map((lf) => (
          <li key={lf.id}>
            <button
              className={`sidebar__eintrag ${lf.id === aktivId ? "ist-aktiv" : ""}`}
              aria-current={lf.id === aktivId ? "true" : undefined}
              tabIndex={lf.id === aktivId ? 0 : -1}
              title={`Lernfeld ${lf.rlp}: ${lf.titel}`}
              onClick={() => onAuswahl(lf.id)}
            >
              <span className="sidebar__nummer">{lf.id.slice(2)}</span>
              <span className="sidebar__name">{lf.kurz}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
