import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import { api, fehlerText, istKonflikt } from "../api";
import { aufraeumen, setzeZusammen, wuerdeInhaltVerlieren, zerlege, type NotizDatei } from "../editor/datei";
import { SLASH_GESCHLOSSEN, SlashMenu, slashErweiterung, type SlashZustand } from "../editor/slashMenu";

const AUTOSAVE_MS = 500;

export type EditorHandle = {
  /** Cursor in den Editor setzen (ans Ende des Textes) */
  fokus: () => void;
  /** Ungespeicherte Änderungen sofort schreiben – vor Umbenennen/Löschen aufrufen */
  speichernJetzt: () => Promise<void>;
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

type Geoeffnet = { ordner: string; datei: string; teile: NotizDatei; geaendert: number };
type Status = "gespeichert" | "ungespeichert" | "speichert" | "fehler";

export function EditorPane({ ref, ordner, datei, version, onGespeichert, onZurueck, onFehler }: Props) {
  const [slash, setSlash] = useState<SlashZustand>(SLASH_GESCHLOSSEN);
  const [status, setStatus] = useState<Status>("gespeichert");
  const [konflikt, setKonflikt] = useState<string | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  // Notiz enthält etwas, das der Editor nicht darstellen kann → erst nach Bestätigung bearbeitbar
  const [schreibschutz, setSchreibschutz] = useState(false);

  const geoeffnet = useRef<Geoeffnet | null>(null);
  const geaendert = useRef(false); // ungespeicherte Änderungen im Editor
  const timer = useRef<number | undefined>(undefined);
  const fokusNachLaden = useRef(false);
  const laufend = useRef<Promise<void>>(Promise.resolve());
  const slashRef = useRef(slash);
  slashRef.current = slash;
  // Callbacks aktuell halten, ohne den Editor neu zu bauen
  const cb = useRef({ onGespeichert, onZurueck, onFehler });
  cb.current = { onGespeichert, onZurueck, onFehler };
  const konfliktRef = useRef(konflikt);
  konfliktRef.current = konflikt;

  const editor = useEditor({
    extensions: [
      // Unterstreichen aus: Markdown kennt es nicht, und "++" würde "C++ und i++" zerstören
      StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Image,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Überschrift" : "Schreib los … oder tippe / für Blöcke"),
      }),
      Markdown.configure({ indentation: { style: "space", size: 2 } }),
      slashErweiterung(setSlash),
    ],
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

  /** Speichert den aktuellen Editor-Inhalt in die geöffnete Datei. Der Inhalt wird sofort
   *  (synchron) gelesen – so landet er auch beim Notizwechsel in der richtigen Datei. */
  function speichern(erzwingen = false): Promise<void> {
    window.clearTimeout(timer.current);
    const ziel = geoeffnet.current;
    if (!editor || !ziel || (!geaendert.current && !erzwingen)) return laufend.current;
    const inhalt = setzeZusammen(ziel.teile, editor.getMarkdown());
    geaendert.current = false;
    setStatus("speichert");

    // Speichervorgänge nacheinander, damit jeder die Änderungszeit des vorigen kennt
    laufend.current = laufend.current.then(async () => {
      try {
        ziel.geaendert = await api.notizSpeichern(ziel.ordner, ziel.datei, inhalt, erzwingen ? null : ziel.geaendert);
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
        } else {
          cb.current.onFehler(`„${ziel.datei}“ konnte nicht gespeichert werden: ${fehlerText(e)}`);
        }
      }
    });
    return laufend.current;
  }

  async function laden(o: string, d: string) {
    const { inhalt, geaendert: zeit } = await api.notizLesen(o, d);
    const teile = zerlege(inhalt);
    if (!editor) return;
    geoeffnet.current = { ordner: o, datei: d, teile, geaendert: zeit };
    editor.commands.setContent(teile.text, { contentType: "markdown", emitUpdate: false });
    const riskant = wuerdeInhaltVerlieren(teile.text, aufraeumen(editor.getMarkdown()));
    setSchreibschutz(riskant);
    editor.setEditable(!riskant, false);
    geaendert.current = false;
    setKonflikt(null);
    setStatus("gespeichert");
    setGeladen(true);
    if (fokusNachLaden.current) {
      fokusNachLaden.current = false;
      requestAnimationFrame(() => editor.commands.focus("end"));
    }
  }

  // Notiz wechseln: alte sichern, neue laden
  useEffect(() => {
    if (!editor) return;
    if (geaendert.current && !konfliktRef.current) speichern();
    geoeffnet.current = null;
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
  useEffect(() => () => void speichern(), [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    fokus: () => {
      if (geoeffnet.current) editor?.commands.focus("end");
      else fokusNachLaden.current = true;
    },
    speichernJetzt: () => speichern(),
  }));

  const statusText: Record<Status, string> = {
    gespeichert: "Gespeichert",
    ungespeichert: "Nicht gespeichert",
    speichert: "Speichert …",
    fehler: "Nicht gespeichert!",
  };

  return (
    <main className="editor">
      <div className="titelleiste" data-tauri-drag-region>
        {datei && geladen && (
          <span className={`speicherstatus speicherstatus--${status}`} role="status">
            {statusText[status]}
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

      <div className="editor__flaeche" hidden={!datei || !!ladeFehler || !geladen}>
        <EditorContent editor={editor} />
      </div>
      <SlashMenu zustand={slash} />
    </main>
  );
}
