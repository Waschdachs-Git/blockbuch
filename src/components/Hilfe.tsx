// Hilfe-Seite (⌘?, Menü „Hilfe“ oder „?“ unten in der Ordner-Leiste): alles Wichtige zum Nachlesen.
import { useEffect, useRef } from "react";
import { fokusFangen } from "./Kontextmenue";

type Kuerzel = [tasten: string, was: string];

const KUERZEL: [abschnitt: string, Kuerzel[]][] = [
  [
    "Notizen und Ordner",
    [
      ["⌘N", "Neue Notiz im aktuellen Ordner"],
      ["↩ (in der Notizliste)", "Notiz umbenennen"],
      ["⌘⌫ (in der Notizliste)", "Notiz in den Papierkorb"],
      ["Rechtsklick", "Menü für Notiz oder Ordner"],
      ["← → ↑ ↓", "Zwischen Ordnern, Notizen und Text wechseln"],
      ["Esc (im Text)", "Zurück zur Notizliste"],
      ["⌥⌘S", "Ordner-Leiste ein-/ausblenden (Text wird breiter)"],
    ],
  ],
  [
    "Schreiben",
    [
      ["/", "Menü für Überschriften, Listen, Tabellen, Code, Kästen …"],
      ["⌘B / ⌘I / ⌘⇧S", "Fett / Kursiv / Durchgestrichen"],
      ["Tab / Esc", "Wortvorschlag übernehmen / ausblenden"],
      ["⌘⇧U", "❓ – hier habe ich etwas nicht verstanden"],
      ["⌘⇧L", "🙋 – die Lehrkraft fragen"],
      ["⌥⌘↩", "Kasten ein- und ausklappen"],
      ["⌥⌘L (im Codeblock)", "Programmiersprache wählen"],
      ["⌘Z / ⌘⇧Z", "Rückgängig / Wiederholen"],
    ],
  ],
  [
    "Finden und Sichern",
    [
      ["⌘K", "Suchen – auch mit Tippfehlern, in PDFs, mit lf2 oder #tag"],
      ["⌘S", "Sofort sichern"],
      ["⇧⌘H", "Ältere Versionen der Notiz ansehen und zurückholen"],
      ["⌘+ / ⌘− / ⌘0", "Ansicht vergrößern / verkleinern / zurücksetzen"],
      ["⌘?", "Diese Hilfe"],
    ],
  ],
];

const CLAUDE: Kuerzel[] = [
  [
    "/aufbereiten",
    "Mitschrift aufbereiten: ❓ erklären, Lücken füllen – deine Mitschrift bleibt, wie sie ist",
  ],
  ["/karten", "Karteikarten aus einer Notiz"],
  ["/luecken", "Was fehlt noch in einem Lernfeld?"],
  ["/korrigieren", "Übungsaufgaben bewerten wie die IHK"],
  ["/grafik", "Animierte Grafik zu einem Thema bauen"],
  ["/woche", "Wochenrückblick, auch als Text fürs Berichtsheft"],
  [
    "/rechtschreibung",
    "Nur die Rechtschreibung korrigieren – mit Liste der Änderungen",
  ],
];

export function Hilfe({ onSchliessen }: { onSchliessen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const vorherFokus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => ref.current?.focus(), []);
  const schliessen = () => {
    onSchliessen();
    vorherFokus.current?.focus?.();
  };

  return (
    <div className="suche-hintergrund" onMouseDown={schliessen}>
      <div
        ref={ref}
        className="hilfe"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hilfe-titel"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            schliessen();
          }
          fokusFangen(e, ref.current);
        }}
      >
        <div className="hilfe__kopf">
          <h2 id="hilfe-titel">Blockbuch-Hilfe</h2>
          <button
            className="icon-knopf"
            onClick={schliessen}
            aria-label="Hilfe schließen"
          >
            ✕
          </button>
        </div>
        <div className="hilfe__inhalt">
          <section>
            <h3>So funktioniert Blockbuch</h3>
            <p>
              Links stehen deine Ordner (Lernfelder und Fächer), in der Mitte
              die Notizen, rechts schreibst du. Alles wird automatisch
              gespeichert – als normale Textdateien im Ordner{" "}
              <code>~/Schule</code>. Alle 5 Minuten legt Blockbuch eine
              Sicherung an; über <kbd>⇧⌘H</kbd> holst du jede ältere Version
              zurück.
            </p>
          </section>

          {KUERZEL.map(([abschnitt, liste]) => (
            <section key={abschnitt}>
              <h3>{abschnitt}</h3>
              <Tabelle zeilen={liste} />
            </section>
          ))}

          <section>
            <h3>Kästen</h3>
            <p>
              Tippe am Zeilenanfang <code>&gt; </code> und dann eine Kennung –
              oder nimm das <kbd>/</kbd>-Menü:
            </p>
            <Tabelle
              zeilen={[
                ["> [!merke]", "Merksatz"],
                ["> [!tipp]", "Tipp"],
                ["> [!achtung]", "Achtung, typischer Fehler"],
                [
                  "> [!karten]",
                  "Karteikarten, eine pro Zeile: Frage :: Antwort",
                ],
                ["> [!claude]", "Ergänzung von Claude"],
              ]}
            />
            <p>
              Ein <code>-</code> hinter der Kennung (
              <code>&gt; [!claude]-</code>) lässt den Kasten eingeklappt
              starten. Ein Klick auf das farbige Etikett klappt auf und zu.
            </p>
          </section>

          <section>
            <h3>Bilder, PDFs und Grafiken</h3>
            <p>
              Ziehe Bilder oder PDFs in die Notiz oder füge sie mit{" "}
              <kbd>⌘V</kbd> ein – auch Screenshots und Fotos vom iPhone
              (Rechtsklick → „Von iPhone importieren“). Bei PDFs erscheinen die
              Knöpfe, wenn du mit der Maus darüberfährst. Tabellenspalten ziehst
              du am Spaltenrand breiter oder schmaler.
            </p>
          </section>

          <section>
            <h3>Hilfen beim Schreiben</h3>
            <p>
              Falsch geschriebene Wörter werden rot unterstrichen – Rechtsklick
              zeigt Vorschläge. Nach drei Buchstaben schlägt Blockbuch grau ein
              Wort aus deinen Notizen und PDFs vor; <kbd>Tab</kbd> übernimmt es,
              auch wenn du dich vertippt hast. Die Suche (<kbd>⌘K</kbd>) findet
              Wörter auch mit Tippfehlern.
            </p>
          </section>

          <section>
            <h3>Claude</h3>
            <p>
              Öffne in der Claude-App den Code-Tab mit dem Ordner{" "}
              <code>~/Schule</code> (oder dein Projekt) und tippe einen Befehl.
              Was Claude in deine Notizen schreibt, erscheint sofort in
              Blockbuch – in orangen Kästen, deine eigene Mitschrift ändert
              Claude nicht.
            </p>
            <Tabelle zeilen={CLAUDE} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Tabelle({ zeilen }: { zeilen: Kuerzel[] }) {
  return (
    <table className="hilfe__tabelle">
      <tbody>
        {zeilen.map(([tasten, was]) => {
          // "↩ (in der Notizliste)": Taste im Kästchen, Zusatz daneben
          const [taste, zusatz] = tasten.split(/ (?=\()/);
          return (
            <tr key={tasten}>
              <th scope="row">
                <kbd>{taste}</kbd>
                {zusatz && <span className="hilfe__zusatz"> {zusatz}</span>}
              </th>
              <td>{was}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
