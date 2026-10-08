import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { LERNFELDER, ordnerAusNamen } from "./lernfelder";
import { Sidebar } from "./components/Sidebar";
import { NoteList } from "./components/NoteList";
import { EditorPane, type EditorHandle } from "./components/EditorPane";
import { Suche } from "./components/Suche";
import { Versionen, zeitAnzeigen } from "./components/Versionen";
import { useStoredState } from "./useStoredState";
import { ASSETS_GEAENDERT } from "./editor/grafikBlock";
import { api, fehlerText, heute, type Aenderung, type NotizInfo, type SicherungsStand, type Treffer } from "./api";

function App() {
  const [ordnerNamen, setOrdnerNamen] = useState<string[] | null>(null);
  const [aktiverOrdner, setAktiverOrdner] = useStoredState("blockbuch.ordner", LERNFELDER[0].ordner);
  const [sidebarOffen, setSidebarOffen] = useStoredState("blockbuch.sidebarOffen", true);
  const [notizen, setNotizen] = useState<NotizInfo[]>([]);
  const [aktiveDatei, setAktiveDatei] = useState<string | null>(null);
  const [umbenennenDatei, setUmbenennenDatei] = useState<string | null>(null);
  const [notizVersion, setNotizVersion] = useState(0);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [sucheOffen, setSucheOffen] = useState(false);
  const [versionenOffen, setVersionenOffen] = useState(false);
  const [sicherung, setSicherung] = useState<SicherungsStand | null>(null);
  // Notiz, die nach einem Ordnerwechsel (aus der Suche) ausgewählt werden soll
  const auswahlNachOrdnerwechsel = useRef<string | null>(null);

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

  // Änderungen auf der Platte (z. B. durch Claude) live übernehmen.
  // Der Handler steht in einem Ref, damit er immer den aktuellen Zustand sieht.
  const notizenRef = useRef(notizen);
  notizenRef.current = notizen;
  const aktiveDateiRef = useRef(aktiveDatei);
  aktiveDateiRef.current = aktiveDatei;

  const externRef = useRef<(a: Aenderung[]) => void>(() => {});
  externRef.current = (aenderungen) => {
    const ordnerName = aktuellerOrdnerRef.current;
    const gleich = (a: string | null, b: string | null) => (a ?? "").normalize("NFC") === (b ?? "").normalize("NFC");
    // ordner === null: ~/Schule selbst (z. B. Neuabgleich nach git checkout) – dann alles neu prüfen
    const alles = aenderungen.some((a) => a.ordner === null);
    if (alles || aenderungen.some((a) => a.datei === null)) {
      api.ordnerAuflisten().then(setOrdnerNamen).catch(melde);
    }
    const imOrdner = aenderungen.filter((a) => gleich(a.ordner, ordnerName));
    if (ordnerName && (alles || imOrdner.length > 0)) {
      ladeNotizen(ordnerName).catch(melde);
      // Änderungen in assets/ (z. B. Claude überarbeitet eine Grafik): Grafiken neu laden
      if (alles || imOrdner.some((a) => a.datei === null)) {
        window.dispatchEvent(new CustomEvent(ASSETS_GEAENDERT, { detail: ordnerName }));
      }
      if (alles || imOrdner.some((a) => a.datei === null || gleich(a.datei, aktiveDateiRef.current))) {
        editorRef.current?.externGeaendert();
      }
    }
  };

  useEffect(() => {
    let aktiv = true;
    let abmelden: (() => void) | undefined;
    listen<Aenderung[]>("schule-geaendert", (e) => externRef.current(e.payload)).then((f) =>
      aktiv ? (abmelden = f) : f(),
    );
    return () => {
      aktiv = false;
      abmelden?.();
    };
  }, []);

  // Fehler aus dem Editor (z. B. Datei konnte nicht eingefügt werden)
  useEffect(() => {
    const f = (e: Event) => melde((e as CustomEvent<string>).detail);
    const s = (e: Event) => setStatusText((e as CustomEvent<string | null>).detail);
    window.addEventListener("blockbuch:fehler", f);
    window.addEventListener("blockbuch:status", s);
    return () => {
      window.removeEventListener("blockbuch:fehler", f);
      window.removeEventListener("blockbuch:status", s);
    };
  }, [melde]);

  // Stand der automatischen Sicherung (Rust meldet nach jeder Sicherung)
  useEffect(() => {
    let aktiv = true;
    let abmelden: (() => void) | undefined;
    listen<SicherungsStand>("sicherung", (e) => setSicherung(e.payload)).then((f) => (aktiv ? (abmelden = f) : f()));
    return () => {
      aktiv = false;
      abmelden?.();
    };
  }, []);

  /** ⌘S: Eingaben sofort speichern und eine Sicherung anlegen */
  async function jetztSichern() {
    try {
      await editorRef.current?.speichernJetzt();
      await api.jetztSichern();
      setStatusText("Gesichert ✓");
      window.setTimeout(() => setStatusText((t) => (t === "Gesichert ✓" ? null : t)), 1500);
    } catch (e) {
      melde(e);
    }
  }

  // ~/Schule öffnen und Lernfeld-Ordner sicherstellen
  useEffect(() => {
    api
      .schuleOeffnen(LERNFELDER.map((lf) => lf.ordner))
      .then((info) => setOrdnerNamen(info.ordner))
      .catch(melde);
  }, [melde]);

  // Notizliste laden – alle Ladevorgänge nummeriert, nur die neueste Antwort zählt.
  // `auswahl` (z. B. neu angelegte Notiz) wird gemerkt, bis eine Antwort sie anwendet.
  const listenNr = useRef(0);
  const auswahlWunsch = useRef<string | null | undefined>(undefined);
  const ladeNotizen = useCallback(async (name: string, auswahl?: string | null) => {
    const nr = ++listenNr.current;
    if (auswahl !== undefined) auswahlWunsch.current = auswahl;
    const vorher = new Set(notizenRef.current.map((n) => n.datei));
    const liste = await api.notizenAuflisten(name);
    if (nr !== listenNr.current || name !== aktuellerOrdnerRef.current) return liste;
    const wunsch = auswahlWunsch.current;
    auswahlWunsch.current = undefined;
    setNotizen(liste);
    setUmbenennenDatei((d) => (d && liste.some((n) => n.datei === d) ? d : null));
    setAktiveDatei((bisher) => {
      const ziel = wunsch !== undefined ? wunsch : bisher;
      if (ziel && liste.some((n) => n.datei === ziel)) return ziel;
      if (wunsch === undefined && bisher) {
        // Offene Notiz ist verschwunden: genau eine neue Datei → wurde wohl umbenannt (z. B. von Claude)
        const neu = liste.filter((n) => !vorher.has(n.datei));
        if (neu.length === 1) return neu[0].datei;
      }
      return liste[0]?.datei ?? null;
    });
    return liste;
  }, []);

  // Ordnerwechsel: Notizen laden, erste Notiz auswählen
  useEffect(() => {
    if (!ordner) return;
    aktuellerOrdnerRef.current = ordner.name;
    setUmbenennenDatei(null);
    const wunsch = auswahlNachOrdnerwechsel.current;
    auswahlNachOrdnerwechsel.current = null;
    ladeNotizen(ordner.name, wunsch).catch(melde);
  }, [ordner?.name, ladeNotizen, melde]);

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

  /** Treffer aus der Suche öffnen: Ordner + Notiz wählen, dann zur Fundstelle springen */
  function trefferOeffnen(t: Treffer, woerter: string[]) {
    setSucheOffen(false);
    if (!t.datei) {
      // PDF, das in keiner Notiz eingebunden ist → in Vorschau öffnen
      if (t.pdf) api.inVorschauOeffnen(t.ordner, t.pdf).catch(melde);
      return;
    }
    const gleicheNotiz = t.ordner === ordner?.name && t.datei === aktiveDatei;
    if (t.ordner !== ordner?.name) {
      auswahlNachOrdnerwechsel.current = t.datei;
      setAktiverOrdner(t.ordner);
    } else if (!gleicheNotiz) {
      setAktiveDatei(t.datei);
    }
    // Bei PDF-Treffern zum PDF-Block springen, sonst zum Suchbegriff
    const ziel = t.art === "pdf" && t.pdf ? [t.pdf.replace(/^assets\//, "")] : woerter;
    editorRef.current?.springeZu(ziel, !gleicheNotiz);
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

  // Menüpunkte aus der Mac-Menüleiste (⌘N, ⌥⌘S) – wirken auch, wenn eine Grafik den Fokus hat
  const menueRef = useRef<(id: string) => void>(() => {});
  menueRef.current = (id) => {
    if (id === "neue-notiz") neueNotiz();
    if (id === "ordner-leiste") toggleSidebar();
    if (id === "suchen") setSucheOffen(true);
    if (id === "versionen" && aktiveDatei) setVersionenOffen(true);
    if (id === "sichern") jetztSichern();
  };
  useEffect(() => {
    let aktiv = true;
    let abmelden: (() => void) | undefined;
    listen<string>("menue", (e) => menueRef.current(e.payload)).then((f) => (aktiv ? (abmelden = f) : f()));
    return () => {
      aktiv = false;
      abmelden?.();
    };
  }, []);

  // Nur in der Browser-Simulation (ohne Mac-Menü) die Kürzel selbst abfangen
  useEffect(() => {
    if (!("__blockbuchSimulation" in window)) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || e.ctrlKey) return;
      // ⌥⌘S wie in Apple Notizen: Ordnerleiste ein-/ausblenden
      if (e.altKey && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        if (!e.repeat) toggleSidebar();
      }
      // ⌘S: sichern
      if (!e.altKey && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        jetztSichern();
      }
      // ⌘⇧H: Versionen
      if (!e.altKey && e.shiftKey && e.code === "KeyH") {
        e.preventDefault();
        if (aktiveDateiRef.current) setVersionenOffen(true);
      }
      // ⌘K: Suche
      if (!e.altKey && !e.shiftKey && e.code === "KeyK") {
        e.preventDefault();
        setSucheOffen(true);
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
        sicherung={
          sicherung?.fehler
            ? `⚠︎ Sicherung: ${sicherung.fehler}`
            : sicherung?.zeit
              ? `Gesichert ${zeitAnzeigen(sicherung.zeit)}${sicherung.hinweis ? " ⓘ" : ""}`
              : null
        }
        sicherungHinweis={sicherung?.hinweis ?? null}
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
        onVersionen={() => setVersionenOffen(true)}
      />
      {versionenOffen && aktiveDatei && ordner && (
        <Versionen
          ordner={ordner.name}
          datei={aktiveDatei}
          titel={notizen.find((n) => n.datei === aktiveDatei)?.titel ?? aktiveDatei}
          vorWiederherstellen={() => editorRef.current?.speichernJetzt() ?? Promise.resolve()}
          onFehler={melde}
          onSchliessen={() => setVersionenOffen(false)}
        />
      )}
      {sucheOffen && (
        <Suche
          ordnerName={(name) => alleOrdner.find((o) => o.name === name)?.anzeige ?? name}
          onOeffnen={trefferOeffnen}
          onSchliessen={() => setSucheOffen(false)}
        />
      )}
      {statusText && !meldung && (
        <div className="meldung meldung--status" role="status">
          <span>{statusText}</span>
        </div>
      )}
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
