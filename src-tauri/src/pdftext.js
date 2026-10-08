// Liest den Text eines PDFs mit PDFKit (macOS-Bordmittel, wie die Vorschau-App). Aufruf: osascript -l JavaScript - <pdf>
ObjC.import('PDFKit');
function run(argv) {
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  if (!doc || doc.isNil()) return "FEHLER: kein PDF";
  const teile = [];
  for (let i = 0; i < doc.pageCount; i++) {
    const s = doc.pageAtIndex(i).string;
    teile.push("--- Seite " + (i + 1) + " ---\n" + (s.isNil() ? "" : ObjC.unwrap(s)).trim());
  }
  return teile.join("\n\n") + "\n";
}
