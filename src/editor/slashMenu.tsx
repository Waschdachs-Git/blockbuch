// "/"-Menü: Tippe "/" am Zeilenanfang (oder nach Leerzeichen) und wähle einen Block per Tastatur.
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { exitSuggestion, type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useEffect, useRef } from "react";
import { MARKER_FRAGEN, MARKER_UNKLAR } from "./kaesten";

export type SlashEintrag = {
  titel: string;
  hinweis: string;
  stichworte: string[];
  icon: string;
  aktion: (editor: Editor, range: Range) => void;
};

export const SLASH_EINTRAEGE: SlashEintrag[] = [
  { titel: "Text", hinweis: "Normaler Absatz", stichworte: ["absatz", "text", "p"], icon: "¶",
    aktion: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { titel: "Überschrift 1", hinweis: "# ", stichworte: ["h1", "titel", "ueberschrift", "überschrift"], icon: "H1",
    aktion: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { titel: "Überschrift 2", hinweis: "## ", stichworte: ["h2", "ueberschrift", "überschrift"], icon: "H2",
    aktion: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { titel: "Überschrift 3", hinweis: "### ", stichworte: ["h3", "ueberschrift", "überschrift"], icon: "H3",
    aktion: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { titel: "Aufzählung", hinweis: "- ", stichworte: ["liste", "punkte", "bullet", "ul"], icon: "•",
    aktion: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { titel: "Nummerierte Liste", hinweis: "1. ", stichworte: ["liste", "nummer", "zahlen", "ol"], icon: "1.",
    aktion: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { titel: "Checkliste", hinweis: "[ ] ", stichworte: ["todo", "aufgabe", "check", "haken"], icon: "☑",
    aktion: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { titel: "Tabelle", hinweis: "3 × 3", stichworte: ["tabelle", "table"], icon: "▦",
    aktion: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { titel: "Code", hinweis: "```", stichworte: ["code", "programm", "java", "sql", "python", "csharp"], icon: "</>",
    aktion: (e, r) => e.chain().focus().deleteRange(r).setCodeBlock().run() },
  { titel: "Zitat / Merksatz", hinweis: "> ", stichworte: ["zitat", "merke", "quote", "hinweis"], icon: "❝",
    aktion: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { titel: "Merke-Kasten", hinweis: "> [!merke]", stichworte: ["merke", "kasten", "wichtig"], icon: "!",
    aktion: (e, r) => e.chain().focus().deleteRange(r).insertContent("[!merke] ").toggleBlockquote().run() },
  { titel: "Unklar markieren", hinweis: "⌘⇧U", stichworte: ["unklar", "frage", "verstehe"], icon: MARKER_UNKLAR,
    aktion: (e, r) => e.chain().focus().deleteRange(r).insertContent(`${MARKER_UNKLAR} `).run() },
  { titel: "Lehrkraft fragen", hinweis: "⌘⇧L", stichworte: ["lehrkraft", "lehrer", "fragen"], icon: MARKER_FRAGEN,
    aktion: (e, r) => e.chain().focus().deleteRange(r).insertContent(`${MARKER_FRAGEN} `).run() },
  { titel: "Trennlinie", hinweis: "---", stichworte: ["linie", "trenner", "hr"], icon: "—",
    aktion: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

function filtern(query: string): SlashEintrag[] {
  const q = query.toLowerCase().trim();
  if (!q) return SLASH_EINTRAEGE;
  return SLASH_EINTRAEGE.filter(
    (e) => e.titel.toLowerCase().includes(q) || e.stichworte.some((s) => s.startsWith(q)),
  );
}

/** Zustand des Menüs, den die React-Komponente anzeigt */
export type SlashZustand = {
  offen: boolean;
  eintraege: SlashEintrag[];
  auswahl: number;
  rect: DOMRect | null;
  ausfuehren: (eintrag: SlashEintrag) => void;
};

export const SLASH_GESCHLOSSEN: SlashZustand = { offen: false, eintraege: [], auswahl: 0, rect: null, ausfuehren: () => {} };

/** Die Erweiterung meldet ihren Zustand über `onChange` an die Oberfläche */
export function slashErweiterung(onChange: (z: SlashZustand) => void) {
  return Extension.create({
    name: "slashMenu",
    addProseMirrorPlugins() {
      let zustand = SLASH_GESCHLOSSEN;
      let props: SuggestionProps<SlashEintrag> | null = null;
      const setze = (z: SlashZustand) => {
        zustand = z;
        onChange(z);
      };
      const aus = (p: SuggestionProps<SlashEintrag>, auswahl = 0): SlashZustand => ({
        offen: p.items.length > 0,
        eintraege: p.items,
        auswahl: Math.min(auswahl, Math.max(p.items.length - 1, 0)),
        rect: p.clientRect?.() ?? null,
        ausfuehren: (e) => p.command(e),
      });

      return [
        Suggestion<SlashEintrag>({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          // Nicht in Codeblöcken – dort ist "/" normaler Code
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query }) => filtern(query),
          command: ({ editor, range, props: eintrag }) => eintrag.aktion(editor, range),
          render: () => ({
            onStart: (p) => {
              props = p;
              setze(aus(p));
            },
            onUpdate: (p) => {
              props = p;
              setze(aus(p, 0));
            },
            onKeyDown: ({ event, view }: SuggestionKeyDownProps) => {
              if (!props || !zustand.offen) return false;
              const n = zustand.eintraege.length;
              if (event.key === "ArrowDown") {
                setze({ ...zustand, auswahl: (zustand.auswahl + 1) % n });
                return true;
              }
              if (event.key === "ArrowUp") {
                setze({ ...zustand, auswahl: (zustand.auswahl - 1 + n) % n });
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                props.command(zustand.eintraege[zustand.auswahl]);
                return true;
              }
              if (event.key === "Escape") {
                // Menü wirklich beenden – sonst öffnet es beim nächsten Buchstaben wieder
                exitSuggestion(view);
                setze(SLASH_GESCHLOSSEN);
                return true;
              }
              return false;
            },
            onExit: () => {
              props = null;
              setze(SLASH_GESCHLOSSEN);
            },
          }),
        }),
      ];
    },
  });
}

export function SlashMenu({ zustand }: { zustand: SlashZustand }) {
  const listeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listeRef.current?.querySelector(".ist-aktiv")?.scrollIntoView({ block: "nearest" });
  }, [zustand.auswahl]);

  if (!zustand.offen || !zustand.rect) return null;

  // Unter dem Cursor; wenn unten kein Platz ist, darüber
  const hoehe = Math.min(zustand.eintraege.length * 40 + 12, 320);
  const passtUnten = zustand.rect.bottom + hoehe + 8 < window.innerHeight;
  const stil = {
    left: Math.min(zustand.rect.left, window.innerWidth - 280),
    top: passtUnten ? zustand.rect.bottom + 6 : zustand.rect.top - hoehe - 6,
  };

  return (
    <div className="slash" style={stil} ref={listeRef} role="listbox" aria-label="Block einfügen">
      {zustand.eintraege.map((e, i) => (
        <button
          key={e.titel}
          role="option"
          aria-selected={i === zustand.auswahl}
          className={`slash__eintrag ${i === zustand.auswahl ? "ist-aktiv" : ""}`}
          // mousedown statt click: sonst verliert der Editor vorher den Fokus
          onMouseDown={(ev) => {
            ev.preventDefault();
            zustand.ausfuehren(e);
          }}
        >
          <span className="slash__icon">{e.icon}</span>
          <span className="slash__titel">{e.titel}</span>
          <span className="slash__hinweis">{e.hinweis}</span>
        </button>
      ))}
    </div>
  );
}
