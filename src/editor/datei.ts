// Zerlegt eine Notiz-Datei in das, was der Editor anzeigt (Markdown-Text), und das,
// was er unverändert zurückschreiben muss (Frontmatter, Zeilenenden, BOM).

export type NotizDatei = {
  bom: string;
  nl: "\n" | "\r\n";
  frontmatter: string; // inkl. "---"-Zeilen und abschließendem Zeilenumbruch, oder ""
  text: string; // Markdown ohne Frontmatter, mit \n
};

export function zerlege(roh: string): NotizDatei {
  const bom = roh.startsWith("﻿") ? "﻿" : "";
  const nl = roh.includes("\r\n") ? "\r\n" : "\n";
  const inhalt = roh.slice(bom.length).replace(/\r\n/g, "\n");

  const m = /^---\n[\s\S]*?\n---[^\n]*(\n|$)/.exec(inhalt);
  const frontmatter = m ? m[0] : "";
  return { bom, nl, frontmatter, text: inhalt.slice(frontmatter.length) };
}

/** Der Editor schreibt <, > und & als HTML-Codes (&lt; …). In Lernnotizen ("x > 5", "C# & Java")
 *  ist das schlecht lesbar – also normale Zeichen, und nur wo Markdown es braucht ein Backslash. */
function entschaerfeZeile(zeile: string): string {
  // Nur ein als Zeichen gemeintes ">" am Zeilenanfang (&gt;) braucht "\\>" – echte Zitate ("> ") nicht
  zeile = zeile.replace(/^(\s*(?:>\s*)*)&gt;/, "$1\\>");
  // Inline-Code (`…`) nicht anfassen: Teile mit ungeradem Index liegen zwischen Backticks
  return zeile
    .split(/(`+[^`]*`+)/)
    .map((teil, i) => {
      if (i % 2 === 1) return teil;
      return teil
        .replace(/&lt;(?=[A-Za-z/!?])/g, "\\<") // sähe sonst wie ein HTML-Tag aus
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;(?=#?[A-Za-z0-9]+;)/g, "\\&") // sähe sonst wie ein HTML-Code aus
        .replace(/&amp;/g, "&");
    })
    .join("");
}

/** Leere Absätze schreibt der Editor als "&nbsp;" – in der Datei wird daraus eine einfache Leerzeile.
 *  Mehr als eine Leerzeile hintereinander wird zusammengefasst. Codeblöcke bleiben unangetastet. */
export function aufraeumen(text: string): string {
  const aus: string[] = [];
  let zaun: string | null = null;
  for (const zeile of text.split("\n")) {
    const z = zeile.trimStart();
    const f = z.startsWith("```") ? "```" : z.startsWith("~~~") ? "~~~" : null;
    if (zaun) {
      if (f === zaun) zaun = null;
      aus.push(zeile);
      continue;
    }
    if (f) zaun = f;
    const leer = zeile.trim() === "" || zeile.trim() === "&nbsp;";
    if (leer && (aus.length === 0 || aus[aus.length - 1] === "")) continue;
    aus.push(leer ? "" : entschaerfeZeile(zeile));
  }
  return aus.join("\n");
}

export function setzeZusammen(d: NotizDatei, text: string): string {
  const koerper = aufraeumen(text).replace(/\s+$/, "");
  let inhalt = d.frontmatter ? `${d.frontmatter}${d.frontmatter.endsWith("\n") ? "" : "\n"}\n${koerper}\n` : `${koerper}\n`;
  if (d.nl === "\r\n") inhalt = inhalt.replace(/\n/g, "\r\n");
  return d.bom + inhalt;
}

/** Alle Buchstaben und Ziffern eines Textes – zum Vergleich, ob beim Umwandeln Inhalt verloren geht */
function zeichen(text: string): string {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).join("");
}

/** true, wenn der Editor beim Speichern Inhalt verlieren würde (z. B. HTML, unbekannte Syntax).
 *  `zurueck` ist das (aufgeräumte) Markdown, das der Editor nach dem Laden erzeugen würde.
 *  Zusätzliche Zeichen sind ok (z. B. "mailto:" bei E-Mail-Links) – nur fehlende zählen. */
export function wuerdeInhaltVerlieren(original: string, zurueck: string): boolean {
  const a = zeichen(original);
  const b = zeichen(zurueck);
  let j = 0;
  for (const c of a) {
    j = b.indexOf(c, j);
    if (j < 0) return true;
    j += c.length;
  }
  return false;
}
