import type { Ref } from "react";
import type { Lernfeld } from "../lernfelder";

type Props = {
  lernfeld: Lernfeld;
  sidebarOffen: boolean;
  onToggleSidebar: () => void;
  toggleRef: Ref<HTMLButtonElement>;
};

export function NoteList({ lernfeld, sidebarOffen, onToggleSidebar, toggleRef }: Props) {
  return (
    <section className="notizliste" aria-label={`Notizen in ${lernfeld.id}`}>
      <div className="titelleiste" data-tauri-drag-region>
        <button
          ref={toggleRef}
          className="icon-knopf"
          onClick={onToggleSidebar}
          title={sidebarOffen ? "Lernfelder ausblenden (⌥⌘S)" : "Lernfelder einblenden (⌥⌘S)"}
          aria-label="Lernfelder-Leiste"
          aria-pressed={sidebarOffen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
          </svg>
        </button>
      </div>
      <header className="notizliste__kopf">
        <div className="notizliste__lf">{lernfeld.id}</div>
        <h1 className="notizliste__titel">{lernfeld.titel}</h1>
      </header>
      <div className="leer">
        <p>Noch keine Notizen.</p>
        <p className="leer__hinweis">Notizen anlegen kommt in Schritt 2.</p>
      </div>
    </section>
  );
}
