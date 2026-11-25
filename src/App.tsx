import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ordnerAusNamen } from "./lernfelder";
import { Sidebar } from "./components/Sidebar";
import { NoteList } from "./components/NoteList";
import { EditorPane, type EditorHandle } from "./components/EditorPane";
import { Suche } from "./components/Suche";
import { Versionen, zeitAnzeigen } from "./components/Versionen";
import { Hilfe } from "./components/Hilfe";
import { Kartei } from "./karten/Kartei";
import { LkPlaner } from "./lk/LkPlaner";
import { abstandText, heuteText, lksAusText, tageZwischen, type LkDatei } from "./lk/plan";
import { lernstandAusText } from "./karten/planer";
import { faelligAnzeige, faelligJeOrdner, type Faellig } from "./karten/sitzung";
import { Kontextmenue, Rueckfrage, type MenueEintrag } from "./components/Kontextmenue";
import { useStoredState } from "./useStoredState";
import { ASSETS_GEAENDERT } from "./editor/grafikBlock";
import { drucken, type DruckNotiz } from "./druck";
import { api, datumAnzeigen, fehlerText, heute, type Aenderung, type NotizInfo, type SicherungsStand, type Treffer } from "./api";

function App() {
  const [ordnerNamen, setOrdnerNamen] = useState<string[] | null>(null);
  const [aktiverOrdner, setAktiverOrdner] = useStoredState("blockbuch.ordner", "");
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
  const [hilfeOffen, setHilfeOffen] = useState(false);
  const [unterordnerFuer, setUnterordnerFuer] = useState<string | null>(null);
  // Karteikarten: offene Lernsitzung (ordner null = alle) und fällige Karten je Ordner
  const [kartei, setKartei] = useState<{ ordner: string | null; titel: string } | null>(null);
  const [faellig, setFaellig] = useState<Faellig | null>(null);
  // LK-Planer: offen (mit Ordner, für den gleich eine LK eingetragen wird) und die eingetragenen LKs
  const [lkPlaner, setLkPlaner] = useState<{ vorauswahl?: string } | null>(null);
  const [lks, setLks] = useState<LkDatei | null>(null);
  useEffect(() => {
    api.lksLesen().then((t) => setLks(lksAusText(t))).catch(() => {});
  }, []);
  // „heute“ als Zustand: bleibt die App über Mitternacht offen, stimmt „LK in N Tagen“ trotzdem
  const [heuteDatum, setHeuteDatum] = useState(heuteText);
  useEffect(() => {
    const pruefen = () => setHeuteDatum(heuteText());
    const zeit = window.setInterval(pruefen, 60_000);
    window.addEventListener("focus", pruefen);
    return () => {
      window.clearInterval(zeit);
      window.removeEventListener("focus", pruefen);
    };
  }, []);
  const naechsteLk = useMemo(
    () => [...(lks?.lks ?? [])].filter((l) => l.datum >= heuteDatum).sort((a, b) => a.datum.localeCompare(b.datum))[0] ?? null,
    [lks, heuteDatum],
  );
  // nr: jedes Menü neu aufbauen (Untermenü „Verschieben nach …“ an derselben Stelle: Fokus und Position neu)
  const [menue, setMenueZustand] = useState<{ nr: number; x: number; y: number; eintraege: MenueEintrag[] } | null>(null);
  const menueNr = useRef(0);
  const setMenue = (m: { x: number; y: number; eintraege: MenueEintrag[] }) => setMenueZustand({ ...m, nr: ++menueNr.current });
  const [rueckfrage, setRueckfrage] = useState<{ titel: string; text: string; ja: string; onJa: () => void } | null>(null);
  const menueSchliessen = useCallback(() => setMenueZustand(null), []);
  const lkPlanerRef = useRef(lkPlaner);
  lkPlanerRef.current = lkPlaner;
  const karteiRef = useRef(kartei);
  karteiRef.current = kartei;
  const rueckfrageRef = useRef(rueckfrage);
  rueckfrageRef.current = rueckfrage;
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
  const alleOrdner = useMemo(() => [...lernfelder, ...faecher], [lernfelder, faecher]);
  // Ist der gemerkte Unterordner verschwunden (gelöscht, von außen umbenannt): zum Ordner darüber
  const ordner =
    alleOrdner.find((o) => o.name === aktiverOrdner) ??
    alleOrdner.find((o) => o.name === aktiverOrdner.split("/")[0]) ??
    alleOrdner[0];

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

  // Fällige Karteikarten zählen – beim Start, nach dem Lernen und (verzögert) nach Änderungen
  const faelligZaehlen = useCallback(() => {
    Promise.all([api.kartenSammeln(null), api.lernstandLesen()])
      .then(([karten, text]) => setFaellig(faelligJeOrdner(karten, lernstandAusText(text), Date.now())))
      .catch(() => {});
  }, []);
  useEffect(() => {
    faelligZaehlen();
    let zeit = 0;
    let aktiv = true;
    let abmelden: (() => void) | undefined;
    listen("schule-geaendert", () => {
      window.clearTimeout(zeit);
      zeit = window.setTimeout(faelligZaehlen, 3000);
    }).then((f) => (aktiv ? (abmelden = f) : f()));
    // einmal pro Stunde: Karten werden mit der Zeit fällig
    const stuendlich = window.setInterval(faelligZaehlen, 3600_000);
    return () => {
      aktiv = false;
      abmelden?.();
      window.clearTimeout(zeit);
      window.clearInterval(stuendlich);
    };
  }, [faelligZaehlen]);
  /** fällige Karten eines Ordners einschließlich seiner Unterordner */
  const faelligIn = (name: string | null) => (faellig ? faelligAnzeige(faellig, name) : 0);
  const lkPlanerSchliessen = useCallback(() => setLkPlaner(null), []);
  const karteiSchliessen = useCallback(() => {
    setKartei(null);
    faelligZaehlen();
  }, [faelligZaehlen]);

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
      .schuleOeffnen([]) // keine Ordner vorgeben – der Nutzer legt seine Lernfelder/Fächer selbst an
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

  /** Rechtsklick auf eine Notiz */
  function notizMenue(datei: string, x: number, y: number) {
    setAktiveDatei(datei);
    setMenue({
      x,
      y,
      eintraege: [
        { titel: "Umbenennen", kuerzel: "↩", aktion: () => setUmbenennenDatei(datei) },
        {
          titel: "Verschieben nach …",
          aktion: () => verschiebenMenue(datei, x, y),
        },
        { titel: "Drucken / als PDF …", kuerzel: "⌘P", aktion: () => druckeNotizen([{ ordner: ordner!.name, datei }]) },
        { titel: "In den Papierkorb", kuerzel: "⌘⌫", gefaehrlich: true, aktion: () => loeschen(datei) },
      ],
    });
  }

  /** Druckansicht bauen und den Druckdialog öffnen (dort unten links: „Als PDF sichern“) */
  async function druckeNotizen(liste: DruckNotiz[], titel?: { ueberschrift: string; unterzeile: string }) {
    if (liste.length === 0) {
      melde("In diesem Ordner gibt es noch keine Notizen.");
      return;
    }
    setStatusText(liste.length > 1 ? `${liste.length} Notizen werden vorbereitet …` : "Druck wird vorbereitet …");
    try {
      await editorRef.current?.speichernJetzt(); // gedruckt wird, was auf der Platte steht
      await drucken(liste, titel);
    } catch (e) {
      melde(e);
    } finally {
      setStatusText((t) => (t?.endsWith("vorbereitet …") ? null : t));
    }
  }

  /** Ganzer Ordner (mit Unterordnern) als ein Dokument, älteste Notiz zuerst – z. B. als Lernskript */
  async function druckeOrdner(name: string) {
    try {
      const ordnerListe = alleOrdner.filter((o) => o.name === name || o.eltern === name);
      const liste: DruckNotiz[] = [];
      for (const o of ordnerListe) {
        const notizenImOrdner = await api.notizenAuflisten(o.name);
        notizenImOrdner
          .sort((a, b) => a.datum.localeCompare(b.datum) || a.titel.localeCompare(b.titel, "de"))
          .forEach((n) => liste.push({ ordner: o.name, datei: n.datei }));
      }
      const o = alleOrdner.find((x) => x.name === name);
      await druckeNotizen(liste, {
        ueberschrift: o?.titel ?? name,
        unterzeile: `${liste.length === 1 ? "1 Notiz" : `${liste.length} Notizen`} · Stand ${datumAnzeigen(heute())}`,
      });
    } catch (e) {
      melde(e);
    }
  }

  /** Zweites Menü: alle Ordner und Unterordner als Ziel (außer dem eigenen und Claude/Gerettet) */
  function verschiebenMenue(datei: string, x: number, y: number) {
    if (!ordner) return;
    const von = ordner.name;
    const ziele = alleOrdner.filter((o) => o.name !== von && o.name !== "Claude" && o.name !== "Gerettet");
    setMenue({
      x,
      y,
      eintraege: ziele.map((o) => ({
        titel: o.eltern ? `↳ ${o.anzeige}` : o.anzeige,
        aktion: () => verschieben(von, datei, o.name),
      })),
    });
  }

  async function verschieben(von: string, datei: string, ziel: string) {
    try {
      if (aktiveDateiRef.current === datei) await editorRef.current?.speichernJetzt();
      const info = await api.notizVerschieben(von, datei, ziel);
      // In den Zielordner wechseln und die Notiz dort auswählen
      auswahlNachOrdnerwechsel.current = info.datei;
      setAktiverOrdner(ziel);
      const zielAnzeige = alleOrdner.find((o) => o.name === ziel)?.titel ?? ziel;
      setStatusText(`Verschoben nach ${zielAnzeige}`);
      window.setTimeout(() => setStatusText((t) => (t?.startsWith("Verschoben nach") ? null : t)), 2500);
    } catch (e) {
      melde(e);
    }
  }

  async function neuerUnterordner(eltern: string, name: string): Promise<boolean> {
    try {
      const liste = await api.unterordnerErstellen(eltern, name);
      setOrdnerNamen(liste);
      setUnterordnerFuer(null);
      setAktiverOrdner(`${eltern}/${name.trim()}`);
      requestAnimationFrame(fokusSidebar);
      return true;
    } catch (e) {
      melde(e);
      return false;
    }
  }

  /** Rechtsklick auf einen Ordner */
  function ordnerMenue(name: string, x: number, y: number) {
    setMenue({
      x,
      y,
      eintraege: [
        ...(name.includes("/") || name === "Claude" || name === "Gerettet"
          ? []
          : [{ titel: "Neuer Unterordner", aktion: () => setUnterordnerFuer(name) }]),
        ...(name === "Claude" || name === "Gerettet"
          ? []
          : [
              {
                titel: faelligIn(name) ? `Karteikarten lernen (${faelligIn(name)} fällig)` : "Karteikarten lernen",
                aktion: () => setKartei({ ordner: name, titel: alleOrdner.find((o) => o.name === name)?.titel ?? name }),
              },
            ]),
        ...(name === "Claude" || name === "Gerettet" ? [] : [{ titel: "LK eintragen …", aktion: () => setLkPlaner({ vorauswahl: name }) }]),
        { titel: "Ordner als PDF / drucken …", aktion: () => druckeOrdner(name) },
        {
          titel: name.includes("/") ? "Unterordner in den Papierkorb …" : "Ordner in den Papierkorb …",
          gefaehrlich: true,
          gesperrt: name === "Claude" ? "Den Ordner „Claude“ braucht Blockbuch (Anleitung und Profil für Claude)." : undefined,
          aktion: () => ordnerLoeschenFragen(name),
        },
      ],
    });
  }

  async function ordnerLoeschenFragen(name: string) {
    let inhalt: { notizen: number; dateien: number };
    try {
      inhalt = await api.ordnerInhalt(name);
    } catch (e) {
      melde(e);
      return;
    }
    const anzeige = alleOrdner.find((o) => o.name === name)?.anzeige ?? name;
    const { notizen: n, dateien: d } = inhalt;
    const teile = [n > 0 && (n === 1 ? "1 Notiz" : `${n} Notizen`), d > 0 && (d === 1 ? "1 weitere Datei (Bild, PDF …)" : `${d} weitere Dateien (Bilder, PDFs …)`)].filter(Boolean);
    setRueckfrage({
      titel: `„${anzeige}“ in den Papierkorb legen?`,
      text:
        (teile.length ? `Der Ordner mit ${teile.join(" und ")} wandert in den Papierkorb.` : "Der leere Ordner wandert in den Papierkorb.") +
        " Von dort kannst du ihn im Finder wiederherstellen.",
      ja: "In den Papierkorb",
      onJa: async () => {
        // aktuellerOrdnerRef statt `ordner`: Der Rechtsklick hat den Ordner gerade erst gewechselt.
        // Der Dialog bleibt bis zum Ende offen – so tippt niemand in eine Notiz, deren Ordner gleich weg ist.
        // auch offen, wenn gerade einer seiner Unterordner angezeigt wird
        const offen = aktuellerOrdnerRef.current ?? "";
        const istOffen = offen === name || offen.startsWith(`${name}/`);
        try {
          if (istOffen) await editorRef.current?.speichernJetzt();
          const liste = await api.ordnerLoeschen(name);
          setOrdnerNamen(liste);
          // Unterordner gelöscht → zum Ordner darüber, sonst zum ersten Lernfeld
          const eltern = name.includes("/") ? name.split("/")[0] : null;
          if (istOffen) setAktiverOrdner(eltern ?? ordnerAusNamen(liste).lernfelder[0]?.name ?? liste[0] ?? "");
          setRueckfrage(null);
          setStatusText(`„${anzeige}“ liegt im Papierkorb`);
          window.setTimeout(() => setStatusText((t) => (t?.endsWith("liegt im Papierkorb") ? null : t)), 2500);
          requestAnimationFrame(fokusSidebar);
        } catch (e) {
          setRueckfrage(null);
          melde(e);
        }
      },
    });
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
    // Solange eine Rückfrage oder das Lernen offen ist, keine Menübefehle (⌘N, ⌘K …) dahinter ausführen
    if (rueckfrageRef.current || karteiRef.current || lkPlanerRef.current) return;
    if (id === "neue-notiz") neueNotiz();
    if (id === "ordner-leiste") toggleSidebar();
    if (id === "suchen") setSucheOffen(true);
    if (id === "versionen" && aktiveDatei) setVersionenOffen(true);
    if (id === "sichern") jetztSichern();
    if (id === "hilfe") setHilfeOffen(true);
    if (id === "lk-planer") setLkPlaner({});
    if (id === "karten") setKartei(ordner ? { ordner: ordner.name, titel: ordner.titel } : { ordner: null, titel: "alle Ordner" });
    if (id === "drucken" && ordner && aktiveDatei) druckeNotizen([{ ordner: ordner.name, datei: aktiveDatei }]);
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

  // ⌘ß öffnet die Hilfe – die Taste, auf der auf deutschen Tastaturen das „?“ steht (⌘? = ⌘⇧ß geht auch).
  // In der Einfang-Phase, damit der Editor das „ß“ nicht als Text einfügt.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || e.ctrlKey || e.altKey || rueckfrageRef.current) return;
      if (e.key === "?" || e.key === "ß" || e.key === "ẞ") {
        e.preventDefault();
        e.stopPropagation();
        setHilfeOffen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
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
        onMenue={ordnerMenue}
        onHilfe={() => setHilfeOffen(true)}
        unterordnerFuer={unterordnerFuer}
        onNeuerUnterordner={neuerUnterordner}
        onNotizAblegen={(von, datei, ziel) => verschieben(von, datei, ziel)}
        faellig={faelligIn}
        onLernen={() => setKartei({ ordner: null, titel: "alle Ordner" })}
        naechsteLk={naechsteLk ? `LK ${abstandText(tageZwischen(heuteDatum, naechsteLk.datum))}` : null}
        naechsteLkTitel={naechsteLk ? `${naechsteLk.thema || (alleOrdner.find((o) => o.name === naechsteLk.ordner)?.titel ?? naechsteLk.ordner)} am ${naechsteLk.datum.split("-").reverse().join(".")} – LK-Planer öffnen (⇧⌘P)` : "LK-Planer (⇧⌘P)"}
        onLkPlaner={() => setLkPlaner({})}
        onUnterordnerAbbrechen={() => {
          setUnterordnerFuer(null);
          requestAnimationFrame(fokusSidebar);
        }}
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
        onMenue={notizMenue}
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
      {hilfeOffen && <Hilfe onSchliessen={() => setHilfeOffen(false)} />}
      {lkPlaner && (
        <LkPlaner
          ordnerListe={alleOrdner}
          vorauswahl={lkPlaner.vorauswahl}
          onNotizOeffnen={(o, d) => {
            setLkPlaner(null);
            if (o !== ordner?.name) {
              auswahlNachOrdnerwechsel.current = d;
              setAktiverOrdner(o);
            } else {
              setAktiveDatei(d);
            }
          }}
          onKartenLernen={(o, titel) => setKartei({ ordner: o, titel })}
          onGeaendert={setLks}
          onSchliessen={lkPlanerSchliessen}
          onFehler={melde}
        />
      )}
      {kartei && <Kartei ordner={kartei.ordner} onSchliessen={karteiSchliessen} onFehler={melde} />}
      {menue && <Kontextmenue key={menue.nr} x={menue.x} y={menue.y} eintraege={menue.eintraege} onSchliessen={menueSchliessen} />}
      {rueckfrage && (
        <Rueckfrage
          titel={rueckfrage.titel}
          text={rueckfrage.text}
          ja={rueckfrage.ja}
          onJa={rueckfrage.onJa}
          onNein={() => {
            setRueckfrage(null);
            requestAnimationFrame(fokusSidebar);
          }}
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
