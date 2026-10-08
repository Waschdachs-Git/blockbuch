// Editor-Konfiguration an einer Stelle – App und Tests benutzen genau dieselbe.
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { SichererCodeBlock } from "./codeBlock";
import { Kaesten } from "./kaesten";
import { BildMitAssets, Dateiablage } from "./dateiablage";

export function editorErweiterungen(): Extensions {
  return [
    // Unterstreichen aus: Markdown kennt es nicht, und "++" würde "C++ und i++" zerstören
    StarterKit.configure({ underline: false, codeBlock: false, link: { openOnClick: false, autolink: true } }),
    SichererCodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    BildMitAssets,
    Dateiablage,
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === "heading" ? "Überschrift" : "Schreib los … oder tippe / für Blöcke"),
    }),
    Markdown.configure({ indentation: { style: "space", size: 2 } }),
    Kaesten,
  ];
}
