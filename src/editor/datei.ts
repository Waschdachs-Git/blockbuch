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

/** Zerlegt eine Zeile in [Text, Code, Text, Code, …]. Ein Code-Abschnitt beginnt mit n Backticks und
 *  endet erst bei genau n Backticks; maskierte Backticks (\`) außerhalb von Code zählen nicht. */
export function teileInlineCode(zeile: string): string[] {
  const teile: string[] = [];
  let text = "";
  let i = 0;
  while (i < zeile.length) {
    if (zeile[i] === "\\" && zeile[i + 1] === "`") {
      text += "\\`";
      i += 2;
      continue;
    }
    if (zeile[i] !== "`") {
      text += zeile[i++];
      continue;
    }
    let n = 0;
    while (zeile[i + n] === "`") n++;
    // passendes Ende: genau n Backticks
    let j = i + n;
    let ende = -1;
    while (j < zeile.length) {
      if (zeile[j] !== "`") {
        j++;
        continue;
      }
      let m = 0;
      while (zeile[j + m] === "`") m++;
      if (m === n) {
        ende = j;
        break;
      }
      j += m;
    }
    if (ende < 0) {
      // kein Ende: die Backticks sind normaler Text
      text += zeile.slice(i, i + n);
      i += n;
      continue;
    }
    teile.push(text, zeile.slice(i, ende + n));
    text = "";
    i = ende + n;
  }
  teile.push(text);
  return teile;
}

/** Der Editor schreibt <, > und & als HTML-Codes (&lt; …). In Lernnotizen ("x > 5", "C# & Java")
 *  ist das schlecht lesbar – also normale Zeichen, und nur wo Markdown es braucht ein Backslash. */
export function entschaerfeZeile(zeile: string): string {
  // Kasten-Kennung am Zitatanfang ("> [!claude]") – der Editor maskiert die Klammern unnötig
  zeile = zeile.replace(/^(\s*(?:>\s*)+)\\\[!([A-Za-z-]+)\\\]/, "$1[!$2]");
  // Nur ein als Zeichen gemeintes ">" am Zeilenanfang (&gt;) braucht "\>" – echte Zitate ("> ") nicht.
  // Auch nach Listenmarkern ("- ", "1. ", "- [ ] ") wäre ">" sonst ein Zitat.
  zeile = zeile.replace(/^(\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|>\s*)*)&gt;/, "$1\\>");
  // Inline-Code nicht anfassen: Teile mit ungeradem Index sind Code
  return teileInlineCode(zeile)
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
    if (zaun) {
      // Schließt nur ein Zaun aus demselben Zeichen, mindestens so lang, ohne weiteren Text
      const zu = /^\s*(`{3,}|~{3,})\s*$/.exec(zeile);
      if (zu && zu[1][0] === zaun[0] && zu[1].length >= zaun.length) zaun = null;
      aus.push(zeile);
      continue;
    }
    const auf = /^\s*(`{3,}|~{3,})/.exec(zeile);
    if (auf) zaun = auf[1];
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
