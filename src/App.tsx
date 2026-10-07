import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { LERNFELDER, ordnerAusNamen } from "./lernfelder";
import { Sidebar } from "./components/Sidebar";
import { NoteList } from "./components/NoteList";
import { EditorPane, type EditorHandle } from "./components/EditorPane";
import { useStoredState } from "./useStoredState";
import { api, fehlerText, heute, type NotizInfo } from "./api";

function App() {
  const [ordnerNamen, setOrdnerNamen] = useState<string[] | null>(null);
  const [aktiverOrdner, setAktiverOrdner] = useStoredState("blockbuch.ordner", LERNFELDER[0].ordner);
  const [sidebarOffen, setSidebarOffen] = useStoredState("blockbuch.sidebarOffen", true);
  const [notizen, setNotizen] = useState<NotizInfo[]>([]);
  const [aktiveDatei, setAktiveDatei] = useState<string | null>(null);
  const [umbenennenDatei, setUmbenennenDatei] = useState<string | null>(null);
  const [notizVersion, setNotizVersion] = useState(0);
  const [meldung, setMeldung] = useState<string | null>(null);

  const sidebarRef = useRef<HTMLElement>(null);
  const listeRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  // Gerade per ⌘N angelegte Notiz: nach dem Benennen direkt in den Text springen
  const neueDatei = useRef<string | null>(null);
  const ersterRender = useRef(true);
  // Aktueller Ordner für asynchrone Antworten: alte Antworten nach Ordnerwechsel verwerfen
  const aktuellerOrdnerRef = useRef<string | null>(null);

  const { lernfelder, faecher } = useMemo(() => ordnerAusNamen(ordnerNamen ?? []), [ordnerNamen]);
  const alleOrdner = [...lernfelder, ...faecher];
  const ordner = alleOrdner.find((o) => o.name === aktiverOrdner) ?? alleOrdner[0];

  const melde = useCallback((e: unknown) => setMeldung(fehlerText(e)), []);

  // ⌘Q, Fenster schließen: Rust fragt erst an, wir sichern, dann wird beendet
  useEffect(() => {
    let aktiv = true;
    let abmelden: (() => void) | undefined;
    listen("beenden-angefragt", async () => {
      try {
        await editorRef.current?.speichernJetzt();
      } finally {
        await api.beenden();
      }
    }).then((f) => (aktiv ? (abmelden = f) : f()));
    return () => {
      aktiv = false;
      abmelden?.();
    };
  }, []);

  // ~/Schule öffnen und Lernfeld-Ordner sicherstellen
  useEffect(() => {
    api
      .schuleOeffnen(LERNFELDER.map((lf) => lf.ordner))
      .then((info) => setOrdnerNamen(info.ordner))
      .catch(melde);
  }, [melde]);

  const ladeNotizen = useCallback(
    async (name: string, auswahl?: string | null) => {
      const liste = await api.notizenAuflisten(name);
      if (name !== aktuellerOrdnerRef.current) return liste;
      setNotizen(liste);
      setAktiveDatei((bisher) => {
        const wunsch = auswahl !== undefined ? auswahl : bisher;
        return liste.some((n) => n.datei === wunsch) ? wunsch! : (liste[0]?.datei ?? null);
      });
      return liste;
    },
    [],
  );

  // Ordnerwechsel: Notizen laden, erste Notiz auswählen
  useEffect(() => {
    if (!ordner) return;
    aktuellerOrdnerRef.current = ordner.name;
    let abgebrochen = false;
    setUmbenennenDatei(null);
    api
      .notizenAuflisten(ordner.name)
      .then((liste) => {
        if (abgebrochen) return;
        setNotizen(liste);
        setAktiveDatei(liste[0]?.datei ?? null);
      })
      .catch(melde);
    return () => {
      abgebrochen = true;
    };
  }, [ordner?.name, melde]);

  const legtNotizAn = useRef(false);
  const neueNotiz = useCallback(async () => {
    // Während ein Titel getippt wird oder eine Notiz gerade entsteht: nicht noch eine anlegen
    if (!ordner || umbenennenDatei !== null || legtNotizAn.current) return;
    legtNotizAn.current = true;
    try {
      const info = await api.notizErstellen(ordner.name, ordner.lernfeld?.id ?? null, "Neue Notiz", heute());
      // Inzwischen Ordner gewechselt? Dann dort nicht in den Umbenennen-Modus gehen
      if (aktuellerOrdnerRef.current !== ordner.name) return;
      await ladeNotizen(ordner.name, info.datei);
      if (aktuellerOrdnerRef.current === ordner.name) {
        neueDatei.current = info.datei;
        setUmbenennenDatei(info.datei);
      }
    } catch (e) {
      melde(e);
    } finally {
      legtNotizAn.current = false;
    }
  }, [ordner, umbenennenDatei, ladeNotizen, melde]);

  async function umbenennen(datei: string, titel: string) {
    if (!ordner) return;
    try {
      // Erst ungespeicherte Änderungen sichern, sonst gehen sie beim Umbenennen verloren
      await editorRef.current?.speichernJetzt();
      const info = await api.notizUmbenennen(ordner.name, datei, titel);
      await ladeNotizen(ordner.name, info.datei);
      setNotizVersion((v) => v + 1);
    } catch (e) {
      melde(e);
    }
    setUmbenennenDatei(null);
    benennenFertig(datei);
  }

  function benennenFertig(datei: string) {
    if (neueDatei.current !== datei) return;
    neueDatei.current = null;
    requestAnimationFrame(() => editorRef.current?.fokus());
  }

  async function loeschen(datei: string) {
    if (!ordner) return;
    const index = notizen.findIndex((n) => n.datei === datei);
    const nachbar = notizen[index + 1]?.datei ?? notizen[index - 1]?.datei ?? null;
    try {
      await editorRef.current?.speichernJetzt();
      await api.notizLoeschen(ordner.name, datei);
      await ladeNotizen(ordner.name, nachbar);
      fokusListe();
    } catch (e) {
      melde(e);
    }
  }

  async function neuerOrdner(name: string): Promise<boolean> {
    try {
      setOrdnerNamen(await api.ordnerErstellen(name));
      setAktiverOrdner(name);
      requestAnimationFrame(fokusSidebar);
      return true;
    } catch (e) {
      melde(e);
      return false;
    }
  }

  function fokusListe() {
    requestAnimationFrame(() => {
      const ziel =
        listeRef.current?.querySelector<HTMLButtonElement>(".notiz.ist-aktiv") ??
        listeRef.current?.querySelector<HTMLButtonElement>(".notiz") ??
        listeRef.current?.querySelector<HTMLButtonElement>(".neue-notiz");
      ziel?.focus();
    });
  }

  function fokusSidebar() {
    if (!sidebarOffen) return;
    sidebarRef.current?.querySelector<HTMLButtonElement>(".sidebar__eintrag.ist-aktiv")?.focus();
  }

  const toggleSidebar = useCallback(() => setSidebarOffen((offen) => !offen), [setSidebarOffen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || e.ctrlKey) return;
      // ⌥⌘S wie in Apple Notizen: Ordnerleiste ein-/ausblenden
      if (e.altKey && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        if (!e.repeat) toggleSidebar();
      }
      // ⌘N: neue Notiz im aktuellen Ordner
      if (!e.altKey && !e.shiftKey && e.code === "KeyN") {
        e.preventDefault();
        if (!e.repeat) neueNotiz();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar, neueNotiz]);

  // Fokus nicht verlieren: Beim Einblenden ins aktive Lernfeld, beim Ausblenden auf den Umschalt-Knopf
  useEffect(() => {
    if (ersterRender.current) {
      ersterRender.current = false;
      return;
    }
    if (sidebarOffen) {
      fokusSidebar();
    } else {
      const aktiv = document.activeElement;
      if (!aktiv || aktiv === document.body || sidebarRef.current?.contains(aktiv)) {
        toggleRef.current?.focus();
      }
    }
  }, [sidebarOffen]);

  if (!ordner) {
    return (
      <div className="laden">
        <div className="titelleiste" data-tauri-drag-region />
        <p>{meldung ? `Fehler: ${meldung}` : "Lade ~/Schule …"}</p>
      </div>
    );
  }

  return (
    <div className={`app ${sidebarOffen ? "" : "app--ohne-sidebar"}`}>
      {/* Ausgeblendet statt ausgehängt: Scroll-Position bleibt erhalten */}
      <Sidebar
        ref={sidebarRef}
        hidden={!sidebarOffen}
        lernfelder={lernfelder}
        faecher={faecher}
        aktiv={ordner.name}
        onAuswahl={setAktiverOrdner}
        onWeiter={fokusListe}
        onNeuerOrdner={neuerOrdner}
      />
      <NoteList
        ref={listeRef}
        ordner={ordner}
        notizen={notizen}
        aktiveDatei={aktiveDatei}
        umbenennenDatei={umbenennenDatei}
        sidebarOffen={sidebarOffen}
        toggleRef={toggleRef}
        onToggleSidebar={toggleSidebar}
        onAuswahl={setAktiveDatei}
        onNeu={neueNotiz}
        onUmbenennenStart={setUmbenennenDatei}
        onUmbenennen={umbenennen}
        onUmbenennenAbbrechen={() => {
          const d = umbenennenDatei;
          setUmbenennenDatei(null);
          if (d) benennenFertig(d);
        }}
        onWeiter={() => editorRef.current?.fokus()}
        onLoeschen={loeschen}
        onZurueck={fokusSidebar}
      />
      <EditorPane
        ref={editorRef}
        ordner={ordner.name}
        datei={aktiveDatei}
        version={notizVersion}
        onGespeichert={() => ladeNotizen(ordner.name).catch(melde)}
        onZurueck={fokusListe}
        onFehler={melde}
      />
      {meldung && (
        <div className="meldung" role="alert">
          <span>{meldung}</span>
          <button className="icon-knopf" onClick={() => setMeldung(null)} aria-label="Meldung schließen">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
