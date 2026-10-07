import { useEffect, useState } from "react";
import { api, fehlerText } from "../api";

type Props = {
  ordner: string;
  datei: string | null;
  version: number; // erhöht sich, wenn die Notiz neu geladen werden soll
};

// Vorläufig: zeigt den Dateiinhalt als Text. Der echte Editor (TipTap) kommt in Schritt 3.
export function EditorPane({ ordner, datei, version }: Props) {
  const [inhalt, setInhalt] = useState<string | null>(null);
  // Fehler getrennt vom Inhalt halten – sonst würde Autosave (Schritt 3) die Meldung in die Datei schreiben
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setFehler(null);
    if (!datei) {
      setInhalt(null);
      return;
    }
    let abgebrochen = false;
    api
      .notizLesen(ordner, datei)
      .then((text) => !abgebrochen && setInhalt(text))
      .catch((e) => {
        if (abgebrochen) return;
        setInhalt(null);
        setFehler(fehlerText(e));
      });
    return () => {
      abgebrochen = true;
    };
  }, [ordner, datei, version]);

  return (
    <main className="editor">
      <div className="titelleiste" data-tauri-drag-region />
      {fehler ? (
        <div className="leer leer--gross">
          <p>Konnte die Notiz nicht lesen</p>
          <p className="leer__hinweis">{fehler}</p>
        </div>
      ) : datei && inhalt !== null ? (
        <div className="vorschau">
          <div className="vorschau__datei">
            {ordner}/{datei}
          </div>
          <pre className="vorschau__text">{inhalt}</pre>
        </div>
      ) : (
        <div className="leer leer--gross">
          <p>Keine Notiz geöffnet</p>
          <p className="leer__hinweis">Wähle links einen Ordner und eine Notiz – oder ⌘N für eine neue.</p>
        </div>
      )}
    </main>
  );
}
