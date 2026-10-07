import { useCallback, useEffect, useRef } from "react";
import { LERNFELDER } from "./lernfelder";
import { Sidebar } from "./components/Sidebar";
import { NoteList } from "./components/NoteList";
import { EditorPane } from "./components/EditorPane";
import { useStoredState } from "./useStoredState";

function App() {
  const [lernfeldId, setLernfeldId] = useStoredState("blockbuch.lernfeld", LERNFELDER[0].id);
  const [sidebarOffen, setSidebarOffen] = useStoredState("blockbuch.sidebarOffen", true);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const ersterRender = useRef(true);

  const lernfeld = LERNFELDER.find((lf) => lf.id === lernfeldId) ?? LERNFELDER[0];

  const toggleSidebar = useCallback(() => setSidebarOffen((offen) => !offen), [setSidebarOffen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ⌥⌘S wie in Apple Notizen: Ordnerleiste ein-/ausblenden
      if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        if (!e.repeat) toggleSidebar();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  // Fokus nicht verlieren: Beim Einblenden ins aktive Lernfeld, beim Ausblenden auf den Umschalt-Knopf
  useEffect(() => {
    if (ersterRender.current) {
      ersterRender.current = false;
      return;
    }
    if (sidebarOffen) {
      sidebarRef.current?.querySelector<HTMLButtonElement>(".ist-aktiv")?.focus();
    } else {
      const aktiv = document.activeElement;
      if (!aktiv || aktiv === document.body || sidebarRef.current?.contains(aktiv)) {
        toggleRef.current?.focus();
      }
    }
  }, [sidebarOffen]);

  return (
    <div className={`app ${sidebarOffen ? "" : "app--ohne-sidebar"}`}>
      {/* Ausgeblendet statt ausgehängt: Scroll-Position und später geladene Ordner bleiben erhalten */}
      <Sidebar
        ref={sidebarRef}
        hidden={!sidebarOffen}
        lernfelder={LERNFELDER}
        aktivId={lernfeld.id}
        onAuswahl={setLernfeldId}
      />
      <NoteList lernfeld={lernfeld} sidebarOffen={sidebarOffen} onToggleSidebar={toggleSidebar} toggleRef={toggleRef} />
      <EditorPane />
    </div>
  );
}

export default App;
