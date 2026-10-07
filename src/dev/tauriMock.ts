// Nur für die Entwicklung im normalen Browser (ohne Tauri): simuliert die Rust-Befehle
// mit einem Dateisystem im Speicher. Wird in der echten App nie geladen.

type Fs = Record<string, Record<string, string>>;

const fs: Fs = {
  "LF05-Daten-verwalten": {
    "2026-10-06-SQL-Joins.md": "---\nlernfeld: LF05\ndatum: 2026-10-06\ntags: []\n---\n\n# SQL-Joins\n\n- INNER JOIN\n",
  },
};

const slug = (t: string) =>
  t
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "Notiz";

const info = (datei: string, c: string) => ({
  datei,
  titel: /^# (.*)$/m.exec(c)?.[1] ?? datei,
  datum: /^datum: (.*)$/m.exec(c)?.[1] ?? "",
  geaendert: Date.now(),
});

const frei = (o: string, basis: string) => {
  let n = `${basis}.md`;
  for (let i = 2; fs[o][n]; i++) n = `${basis}-${i}.md`;
  return n;
};

const ordner = () => Object.keys(fs).sort();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invoke(cmd: string, a: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 20)); // etwas Verzögerung wie bei echter IPC
  switch (cmd) {
    case "schule_oeffnen":
      for (const o of a.standardOrdner) fs[o] ??= {};
      return { pfad: "~/Schule (Simulation)", ordner: ordner() };
    case "ordner_erstellen":
      if (ordner().some((k) => k.toLowerCase() === a.name.toLowerCase())) throw `Ordner „${a.name}“ gibt es schon.`;
      fs[a.name] = {};
      return ordner();
    case "notizen_auflisten":
      return Object.entries(fs[a.ordner] ?? {})
        .map(([d, c]) => info(d, c))
        .sort((x, y) => y.datum.localeCompare(x.datum));
    case "notiz_lesen":
      return fs[a.ordner][a.datei];
    case "notiz_erstellen": {
      const d = frei(a.ordner, `${a.datum}-${slug(a.titel)}`);
      fs[a.ordner][d] = `---\n${a.lernfeld ? `lernfeld: ${a.lernfeld}\n` : ""}datum: ${a.datum}\ntags: []\n---\n\n# ${a.titel}\n\n`;
      return info(d, fs[a.ordner][d]);
    }
    case "notiz_umbenennen": {
      const c = fs[a.ordner][a.datei].replace(/^# .*$/m, `# ${a.titel}`);
      delete fs[a.ordner][a.datei];
      const d = frei(a.ordner, `${a.datei.slice(0, 10)}-${slug(a.titel)}`);
      fs[a.ordner][d] = c;
      return info(d, c);
    }
    case "notiz_loeschen":
      delete fs[a.ordner][a.datei];
      return null;
  }
  throw `Unbekannter Befehl: ${cmd}`;
}

// @ts-expect-error – interne Tauri-Schnittstelle, die @tauri-apps/api aufruft
window.__TAURI_INTERNALS__ = { invoke, transformCallback: () => 0 };
// Für Tests im Browser einsehbar
// @ts-expect-error – Debug-Zugriff
window.__blockbuchFs = fs;
export {};
