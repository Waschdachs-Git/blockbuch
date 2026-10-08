import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { MARKER_FRAGEN, MARKER_UNKLAR, zaehleMarker } from "../editor/kaesten";
import { setzeGrafikOrdner } from "../editor/grafikBlock";
import { fundstellen } from "../editor/falten";
import { api, fehlerText, istKonflikt } from "../api";
import { aufraeumen, setzeZusammen, wuerdeInhaltVerlieren, zerlege, type NotizDatei } from "../editor/datei";
import { editorErweiterungen } from "../editor/erweiterungen";
import { SLASH_GESCHLOSSEN, SlashMenu, slashErweiterung, type SlashZustand } from "../editor/slashMenu";

const AUTOSAVE_MS = 500;

export type EditorHandle = {
  /** Cursor in den Editor setzen (ans Ende des Textes) */
  fokus: () => void;
  /** Ungespeicherte Änderungen sofort sichern – vor Umbenennen, Löschen und Beenden aufrufen */
  speichernJetzt: () => Promise<void>;
  /** Die offene Notiz wurde auf der Platte geändert (z. B. von Claude) */
  externGeaendert: () => Promise<void>;
  /** Nach dem Öffnen aus der Suche: zur ersten Fundstelle springen und sie markieren.
   *  `nachLaden`: erst nachdem die (gerade gewählte) Notiz geladen ist */
  springeZu: (woerter: string[], nachLaden: boolean) => void;
};

type Props = {
  ref?: Ref<EditorHandle>;
  ordner: string;
  datei: string | null;
  version: number; // erhöht sich, wenn die Notiz neu geladen werden soll
  onGespeichert: () => void;
  onZurueck: () => void;
  onFehler: (e: unknown) => void;
};

type Geoeffnet = {
  ordner: string;
  datei: string;
  teile: NotizDatei;
  geaendert: number; // Änderungszeit (ms) vom letzten Lesen/Speichern
  inhalt: string; // Dateiinhalt vom letzten Lesen/Speichern – erkennt Änderungen auch bei gleicher Zeit
};
type Status = "gespeichert" | "ungespeichert" | "speichert" | "fehler";

export function EditorPane({ ref, ordner, datei, version, onGespeichert, onZurueck, onFehler }: Props) {
  const [slash, setSlash] = useState<SlashZustand>(SLASH_GESCHLOSSEN);
  const [status, setStatus] = useState<Status>("gespeichert");
  const [konflikt, setKonflikt] = useState<string | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  // Notiz enthält etwas, das der Editor nicht darstellen kann → erst nach Bestätigung bearbeitbar
  const [schreibschutz, setSchreibschutz] = useState(false);
  // kurzer Hinweis oben rechts, wenn eine Änderung von außen übernommen wurde
  const [vonAussen, setVonAussen] = useState(false);
  const flaecheRef = useRef<HTMLDivElement>(null);
  const vonAussenTimer = useRef<number | undefined>(undefined);
  // Gestartete, noch nicht abgeschlossene Speichervorgänge (zählt schon beim Aufruf, nicht erst beim Ausführen)
  const ausstehend = useRef(0);

  const geoeffnet = useRef<Geoeffnet | null>(null);
  const geaendert = useRef(false); // ungespeicherte Änderungen im Editor
  const timer = useRef<number | undefined>(undefined);
  const fokusNachLaden = useRef(false);
  const sprungNachLaden = useRef<string[] | null>(null);
  const laufend = useRef<Promise<void>>(Promise.resolve());
  const ladeNr = useRef(0);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  // Callbacks aktuell halten, ohne den Editor neu zu bauen
  const cb = useRef({ onGespeichert, onZurueck, onFehler });
  cb.current = { onGespeichert, onZurueck, onFehler };
  const konfliktRef = useRef(konflikt);
  konfliktRef.current = konflikt;

  const editor = useEditor({
    extensions: [...editorErweiterungen(), slashErweiterung(setSlash)],
    editorProps: {
      attributes: { class: "inhalt", spellcheck: "true", lang: "de", "aria-label": "Notiz-Text" },
      handleKeyDown: (_view, event) => {
        // Esc ohne offenes /-Menü: zurück in die Notizliste
        if (event.key === "Escape" && !slashRef.current.offen) {
          speichern();
          cb.current.onZurueck();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      if (!geoeffnet.current) return;
      geaendert.current = true;
      setStatus("ungespeichert");
      window.clearTimeout(timer.current);
      if (!konfliktRef.current) timer.current = window.setTimeout(() => speichern(), AUTOSAVE_MS);
    },
    onBlur: () => {
      if (!konfliktRef.current) speichern();
    },
  });

  /** Schritt hinten an die Warteschlange hängen. Ein Fehler in einem Schritt wird gemeldet,
   *  blockiert aber nie die folgenden (sonst würde danach nichts mehr gespeichert). */
  function einreihen(schritt: () => Promise<void>): Promise<void> {
    laufend.current = laufend.current.then(schritt).catch((e) => cb.current.onFehler(e));
    return laufend.current;
  }

  /** Eigene Version als Konfliktkopie neben die Notiz legen – getippter Text wird nie still verworfen */
  async function kopieAnlegen(ziel: Geoeffnet, inhalt: string) {
    const d = new Date();
    const uhrzeit = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    try {
      const name = await api.notizKonfliktkopie(ziel.ordner, ziel.datei, inhalt, uhrzeit);
      cb.current.onFehler(`Konflikt bei „${ziel.datei}“: Deine Version wurde als „${name}“ daneben gesichert.`);
      cb.current.onGespeichert();
    } catch (e) {
      cb.current.onFehler(`„${ziel.datei}“: Deine Änderungen konnten nicht gesichert werden: ${fehlerText(e)}`);
    }
  }

  /** Speichert den aktuellen Editor-Inhalt in die geöffnete Datei. Der Text wird sofort
   *  (synchron) gelesen – so landet er auch beim Notizwechsel in der richtigen Datei. */
  function speichern(erzwingen = false): Promise<void> {
    window.clearTimeout(timer.current);
    const ziel = geoeffnet.current;
    if (!editor || !ziel || (!geaendert.current && !erzwingen)) return laufend.current;
    const text = editor.getMarkdown();
    geaendert.current = false;
    setStatus("speichert");

    // Speichervorgänge nacheinander, damit jeder die Änderungszeit des vorigen kennt
    ausstehend.current++;
    return einreihen(async () => {
      try {
        await speichernAusfuehren(ziel, text, erzwingen);
      } finally {
        ausstehend.current--;
      }
    });
  }

  async function speichernAusfuehren(ziel: Geoeffnet, text: string, erzwingen: boolean) {
    {
      let erwartet: number | null = ziel.geaendert;
      if (erzwingen) {
        // Bewusst überschreiben: aktuelles Frontmatter von der Platte übernehmen (z. B. neue Tags von Claude)
        try {
          ziel.teile = zerlege((await api.notizLesen(ziel.ordner, ziel.datei)).inhalt);
        } catch {
          // Datei gibt es nicht mehr – mit bekanntem Frontmatter neu schreiben
        }
        erwartet = null;
      }
      const inhalt = setzeZusammen(ziel.teile, text);
      try {
        ziel.geaendert = await api.notizSpeichern(ziel.ordner, ziel.datei, inhalt, erwartet);
        ziel.inhalt = inhalt;
        if (geoeffnet.current === ziel) {
          setKonflikt(null);
          setStatus(geaendert.current ? "ungespeichert" : "gespeichert");
        }
        cb.current.onGespeichert();
      } catch (e) {
        if (geoeffnet.current === ziel) {
          geaendert.current = true;
          setStatus("fehler");
          if (istKonflikt(e)) setKonflikt(fehlerText(e));
          else cb.current.onFehler(e);
        } else if (istKonflikt(e)) {
          // Notiz ist schon nicht mehr offen: Text als Kopie sichern statt verlieren
          await kopieAnlegen(ziel, inhalt);
        } else {
          cb.current.onFehler(`„${ziel.datei}“ konnte nicht gespeichert werden: ${fehlerText(e)}`);
        }
      }
    }
  }

  /** Inhalt in den Editor setzen, OHNE Eintrag im Rückgängig-Verlauf – sonst holt ⌘Z den alten
   *  Stand (oder die vorige Notiz) zurück und das Autosave überschreibt damit die Datei. */
  function inhaltSetzen(text: string) {
    // Grafiken laden ihre Dateien aus dem assets/-Ordner der offenen Notiz
    if (geoeffnet.current) setzeGrafikOrdner(geoeffnet.current.ordner);
    editor
      ?.chain()
      .command(({ tr }) => {
        tr.setMeta("addToHistory", false);
        return true;
      })
      .setContent(text, { contentType: "markdown", emitUpdate: false })
      .run();
  }

  /** Vor dem Verlassen der Notiz (Wechsel, Umbenennen, Beenden): speichern –
   *  oder bei offenem Konflikt die eigene Version als Kopie sichern. */
  function sichernVorWeggang(): Promise<void> {
    const ziel = geoeffnet.current;
    if (editor && ziel && geaendert.current && konfliktRef.current) {
      const inhalt = setzeZusammen(ziel.teile, editor.getMarkdown());
      geaendert.current = false;
      return einreihen(() => kopieAnlegen(ziel, inhalt));
    }
    return speichern();
  }

  async function laden(o: string, d: string) {
    const nr = ++ladeNr.current;
    editor?.setEditable(false, false); // während des Ladens nichts tippen, was verloren ginge
    const { inhalt, geaendert: zeit } = await api.notizLesen(o, d);
    // Inzwischen eine andere Notiz gewählt? Dann diese Antwort verwerfen
    if (nr !== ladeNr.current || !editor) return;
    const teile = zerlege(inhalt);
    geoeffnet.current = { ordner: o, datei: d, teile, geaendert: zeit, inhalt };
    inhaltSetzen(teile.text);
    const riskant = wuerdeInhaltVerlieren(teile.text, aufraeumen(editor.getMarkdown()));
    setSchreibschutz(riskant);
    editor.setEditable(!riskant, false);
    geaendert.current = false;
    setKonflikt(null);
    setStatus("gespeichert");
    setGeladen(true);
    if (sprungNachLaden.current) {
      const w = sprungNachLaden.current;
      sprungNachLaden.current = null;
      fokusNachLaden.current = false;
      requestAnimationFrame(() => springe(w));
    } else if (fokusNachLaden.current) {
      fokusNachLaden.current = false;
      requestAnimationFrame(() => editor.commands.focus("end"));
    }
  }

  /** Änderung auf der Platte übernehmen. Ohne ungespeicherte Eingaben: neu laden und Cursor/Scroll
   *  behalten. Mit ungespeicherten Eingaben: sofort Konflikt anzeigen (nichts wird überschrieben). */
  function externGeaendert(): Promise<void> {
    // Hinter laufende Speichervorgänge einreihen – so kennen wir die Änderungszeit des eigenen Schreibens
    return einreihen(async () => {
      const ziel = geoeffnet.current;
      if (!editor || !ziel) return;
      let gelesen;
      try {
        gelesen = await api.notizLesen(ziel.ordner, ziel.datei);
      } catch {
        return; // gelöscht/umbenannt: darum kümmert sich die Notizliste (und sichert ggf. als Kopie)
      }
      if (geoeffnet.current !== ziel) return;
      // Unverändert (z. B. unser eigenes Speichern) – am Inhalt erkannt, nicht nur an der Zeit
      if (gelesen.inhalt === ziel.inhalt) {
        ziel.geaendert = gelesen.geaendert;
        return;
      }

      // Ungespeicherte Eingaben oder ein schon gestartetes Speichern: nichts überschreiben → Konflikt
      if (geaendert.current || ausstehend.current > 0) {
        window.clearTimeout(timer.current);
        setStatus("fehler");
        setKonflikt("Die Notiz wurde gerade von außen geändert (z. B. von Claude).");
        return;
      }

      // Übernehmen – Cursor und Scrollposition merken
      const { from, to } = editor.state.selection;
      const scroll = flaecheRef.current?.scrollTop ?? 0;
      const fokus = editor.isFocused;
      const teile = zerlege(gelesen.inhalt);
      ziel.teile = teile;
      ziel.geaendert = gelesen.geaendert;
      ziel.inhalt = gelesen.inhalt;
      inhaltSetzen(teile.text);
      const ende = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, ende), to: Math.min(to, ende) });
      if (fokus) editor.commands.focus(undefined, { scrollIntoView: false });
      if (flaecheRef.current) flaecheRef.current.scrollTop = scroll;

      const riskant = wuerdeInhaltVerlieren(teile.text, aufraeumen(editor.getMarkdown()));
      setSchreibschutz(riskant);
      editor.setEditable(!riskant, false);
      setKonflikt(null);
      setStatus("gespeichert");
      setVonAussen(true);
      window.clearTimeout(vonAussenTimer.current);
      vonAussenTimer.current = window.setTimeout(() => setVonAussen(false), 2500);
    });
  }

  // Notiz wechseln: alte sichern, neue laden
  useEffect(() => {
    if (!editor) return;
    sichernVorWeggang();
    geoeffnet.current = null;
    window.clearTimeout(vonAussenTimer.current);
    setVonAussen(false);
    ladeNr.current++; // laufende Ladevorgänge ungültig machen
    editor.setEditable(false, false);
    setLadeFehler(null);
    setKonflikt(null);
    if (!datei) {
      setGeladen(false);
      return;
    }
    let abgebrochen = false;
    const o = ordner;
    laufend.current
      .then(() => (abgebrochen ? undefined : laden(o, datei)))
      .catch((e) => !abgebrochen && setLadeFehler(fehlerText(e)));
    return () => {
      abgebrochen = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, ordner, datei, version]);

  // Beim Schließen der Ansicht nichts verlieren
  useEffect(() => () => void sichernVorWeggang(), [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Erste Fundstelle eines der Wörter markieren und hinscrollen. Sucht pro Absatz über den ganzen Text
   *  (auch über Formatierungsgrenzen wie **SQL**-Joins) und mit der Umlaut-Regel der Suche. */
  function springe(woerter: string[]) {
    if (!editor) return;
    let ziel: { from: number; to: number } | null = null;
    editor.state.doc.descendants((block, blockPos) => {
      if (ziel) return false;
      if (!block.isTextblock) return true;
      // Text des Absatzes + Dokumentposition jeder UTF-16-Einheit
      let text = "";
      const positionen: number[] = [];
      block.forEach((kind, offset) => {
        if (!kind.isText || !kind.text) return;
        for (let i = 0; i < kind.text.length; i++) positionen.push(blockPos + 1 + offset + i);
        text += kind.text;
      });
      const [erste] = fundstellen(text, woerter);
      if (erste) ziel = { from: positionen[erste[0]], to: positionen[erste[1] - 1] + 1 };
      return false;
    });
    if (ziel) editor.chain().focus().setTextSelection(ziel).scrollIntoView().run();
    else editor.commands.focus("start");
  }

  useImperativeHandle(ref, () => ({
    fokus: () => {
      if (geoeffnet.current) editor?.commands.focus("end");
      else fokusNachLaden.current = true;
    },
    speichernJetzt: () => sichernVorWeggang(),
    externGeaendert,
    springeZu: (woerter, nachLaden) => {
      if (!nachLaden && geoeffnet.current) springe(woerter);
      else sprungNachLaden.current = woerter;
    },
  }));

  // Offene Schnellmarker (❓ unklar, 🙋 Lehrkraft fragen) für die Anzeige oben
  const marker = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? zaehleMarker(e.state.doc) : { unklar: 0, fragen: 0 }),
    equalityFn: (a, b) => a?.unklar === b?.unklar && a?.fragen === b?.fragen,
  });

  const statusText: Record<Status, string> = {
    gespeichert: "Gespeichert",
    ungespeichert: "Nicht gespeichert",
    speichert: "Speichert …",
    fehler: "Nicht gespeichert!",
  };

  return (
    <main className="editor">
      <div className="titelleiste" data-tauri-drag-region>
        {datei && geladen && marker && marker.unklar + marker.fragen > 0 && (
          <span
            className="marker-anzeige"
            title={`Offen: ${marker.unklar}× unklar, ${marker.fragen}× Lehrkraft fragen – mit /aufbereiten in Claude Code klären`}
          >
            {marker.unklar > 0 && `${MARKER_UNKLAR} ${marker.unklar}`}
            {marker.unklar > 0 && marker.fragen > 0 && " · "}
            {marker.fragen > 0 && `${MARKER_FRAGEN} ${marker.fragen}`}
          </span>
        )}
        {datei && geladen && (
          <span className={`speicherstatus speicherstatus--${vonAussen ? "aussen" : status}`} role="status">
            {vonAussen ? "Von außen aktualisiert" : statusText[status]}
          </span>
        )}
      </div>

      {konflikt && (
        <div className="konflikt" role="alert">
          <div>
            <strong>Achtung:</strong> {konflikt} Deine letzten Änderungen sind noch nicht gespeichert.
          </div>
          <div className="konflikt__knoepfe">
            <button onClick={() => datei && laden(ordner, datei).catch(onFehler)}>Version von außen laden</button>
            <button className="primaer" onClick={() => speichern(true)}>
              Meine Version speichern
            </button>
          </div>
        </div>
      )}

      {schreibschutz && datei && geladen && (
        <div className="konflikt" role="alert">
          <div>
            <strong>Nur lesen:</strong> Diese Notiz enthält etwas, das der Editor nicht darstellen kann (z. B. HTML).
            Beim Bearbeiten würde es verloren gehen.
          </div>
          <div className="konflikt__knoepfe">
            <button
              onClick={() => {
                setSchreibschutz(false);
                editor?.setEditable(true, false);
                editor?.commands.focus("end");
              }}
            >
              Trotzdem bearbeiten
            </button>
          </div>
        </div>
      )}

      {ladeFehler ? (
        <div className="leer leer--gross">
          <p>Konnte die Notiz nicht lesen</p>
          <p className="leer__hinweis">{ladeFehler}</p>
        </div>
      ) : !datei ? (
        <div className="leer leer--gross">
          <p>Keine Notiz geöffnet</p>
          <p className="leer__hinweis">Wähle links einen Ordner und eine Notiz – oder ⌘N für eine neue.</p>
        </div>
      ) : null}

      <div className="editor__flaeche" ref={flaecheRef} hidden={!datei || !!ladeFehler || !geladen}>
        <EditorContent editor={editor} />
      </div>
      <SlashMenu zustand={slash} />
    </main>
  );
}
