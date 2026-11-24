// Hilfe-Seite (⌘ß bzw. ⌘?, Menü „Hilfe“ oder „?“ unten in der Ordner-Leiste): alles Wichtige zum Nachlesen.
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
      ["Rechtsklick", "Notiz: umbenennen, verschieben, drucken, löschen · Ordner: Unterordner, als PDF, löschen"],
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
      ["⌘P", "Notiz drucken oder als PDF sichern (im Druckdialog unten links)"],
      ["⇧⌘K", "Karteikarten des Ordners lernen"],
      ["⇧⌘H", "Ältere Versionen der Notiz ansehen und zurückholen"],
      ["⌘+ / ⌘− / ⌘0", "Ansicht vergrößern / verkleinern / zurücksetzen"],
      ["⌘ß", "Diese Hilfe (die Taste mit dem „?“)"],
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
              <kbd>⌘V</kbd> ein – auch Screenshots. Fotos vom iPhone (Tafelbild):
              Auf dem iPhone das Foto öffnen, „Kopieren“ tippen, dann am Mac{" "}
              <kbd>⌘V</kbd> (geht mit derselben Apple-ID automatisch) – oder per
              AirDrop schicken und hineinziehen. Bei PDFs erscheinen die Knöpfe,
              wenn du mit der Maus darüberfährst.
            </p>
          </section>

          <section>
            <h3>Karteikarten</h3>
            <p>
              Karten stehen in einem Kasten <code>&gt; [!karten]</code>, eine pro Zeile:{" "}
              <code>Frage :: Antwort</code> – Claude legt sie mit <code>/karten</code> an. Lernen: ⇧⌘K,
              Rechtsklick auf einen Ordner oder „🗂 Lernen“ unten links. Die Zahl neben einem Ordner zeigt,
              wie viele Karten heute dran sind.
            </p>
            <Tabelle
              zeilen={[
                ["Leertaste", "Antwort zeigen"],
                ["1 / 2 / 3 / 4", "Nochmal / Schwer / Gut / Leicht – was du gut kannst, kommt seltener"],
                ["🔊", "Frage oder Antwort vorlesen"],
                ["Esc", "Lernen beenden (der Fortschritt ist gespeichert)"],
              ]}
            />
          </section>

          <section>
            <h3>Unterordner und Export</h3>
            <p>
              Rechtsklick auf einen Ordner → „Neuer Unterordner“, z. B. LF5 → Unicode. Notizen bringst du
              per Rechtsklick → „Verschieben nach …“ dorthin – Bilder und PDFs kommen mit.
              „Ordner als PDF / drucken …“ macht aus allen Notizen eines Ordners (mit Unterordnern) ein
              Dokument mit Deckblatt, älteste zuerst – praktisch als Lernskript vor einer LK.
            </p>
          </section>

          <section>
            <h3>Tabellen</h3>
            <p>
              Steht der Cursor in einer Tabelle, erscheint darüber eine kleine
              Leiste: Zeilen und Spalten einfügen oder löschen. Tab springt zur
              nächsten Zelle – in der letzten Zelle entsteht eine neue Zeile.
              Spalten ziehst du am Spaltenrand breiter oder schmaler.
            </p>
            <Tabelle
              zeilen={[
                ["⌥⌘↓ / ⌥⌘↑", "Zeile darunter / darüber einfügen"],
                ["⌥⌘→ / ⌥⌘←", "Spalte rechts / links einfügen"],
                ["Tab / ⇧Tab", "Nächste / vorige Zelle"],
              ]}
            />
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
