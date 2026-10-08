// Kopiert Zusatzdateien von pdf.js nach public/pdfjs/ (Decoder für gescannte PDFs, Schriften, Zeichensätze).
// Läuft automatisch vor `npm run dev` und `npm run build`.
import { cpSync, mkdirSync } from "node:fs";

const ziel = "public/pdfjs";
mkdirSync(ziel, { recursive: true });
for (const ordner of ["wasm", "standard_fonts", "cmaps", "iccs"]) {
  cpSync(`node_modules/pdfjs-dist/${ordner}`, `${ziel}/${ordner}`, { recursive: true });
}
