// Nur für die Entwicklung im normalen Browser (ohne Tauri): simuliert die Rust-Befehle
// mit einem Dateisystem im Speicher. Wird in der echten App nie geladen.

import { falten } from "../editor/falten";

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
const zeiten: Record<string, number> = {};

// Ereignisse (listen/emit) nachbilden
const rueckrufe = new Map<number, (x: unknown) => void>();
const zuhoerer: { event: string; handler: number }[] = [];
let naechsteId = 1;
function transformCallback(cb: (x: unknown) => void) {
  const id = naechsteId++;
  rueckrufe.set(id, cb);
  return id;
}
function emit(event: string, payload: unknown) {
  for (const z of zuhoerer.filter((z) => z.event === event)) rueckrufe.get(z.handler)?.({ event, payload, id: z.handler });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invoke(cmd: string, a: any, optionen?: { headers?: Record<string, string> }): Promise<unknown> {
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
        .filter(([d]) => d.endsWith(".md") && !d.includes("/"))
        .map(([d, c]) => info(d, c))
        .sort((x, y) => y.datum.localeCompare(x.datum));
    case "notiz_lesen":
      if (fs[a.ordner]?.[a.datei] === undefined) throw `Datei „${a.datei}“ gibt es nicht.`;
      return { inhalt: fs[a.ordner][a.datei], geaendert: zeiten[`${a.ordner}/${a.datei}`] ?? 1 };
    case "notiz_speichern": {
      const k = `${a.ordner}/${a.datei}`;
      if (a.erwartet !== null && (fs[a.ordner][a.datei] === undefined || (zeiten[k] ?? 1) !== a.erwartet))
        throw "KONFLIKT: Die Notiz wurde gerade von außen geändert (z. B. von Claude).";
      fs[a.ordner][a.datei] = a.inhalt;
      zeiten[k] = Date.now();
      // wie der echte Beobachter: auch eigene Schreibvorgänge werden gemeldet
      setTimeout(() => emit("schule-geaendert", [{ ordner: a.ordner, datei: a.datei }]), 200);
      return zeiten[k];
    }
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
    case "notiz_konfliktkopie": {
      const d = frei(a.ordner, `${a.datei.replace(/\.md$/, "")}-konflikt-${a.uhrzeit}`);
      fs[a.ordner][d] = a.inhalt;
      return d;
    }
    case "beenden":
      console.info("[Simulation] App würde jetzt beenden");
      return null;
    case "plugin:event|listen":
      zuhoerer.push({ event: a.event, handler: a.handler });
      return a.handler;
    case "plugin:event|unlisten":
      return null;
    case "ordner_auflisten":
      return ordner();
    case "asset_speichern": {
      // Rohdaten → data:-URL im Speicher (Schlüssel "assets/<name>")
      const ordnerName = decodeURIComponent(optionen?.headers?.ordner ?? "");
      const name = decodeURIComponent(optionen?.headers?.name ?? "datei");
      const [stamm, endung] = [name.replace(/\.[^.]+$/, ""), (name.split(".").pop() ?? "").toLowerCase()];
      let pfad = `assets/${slug(stamm)}.${endung}`;
      for (let i = 2; fs[ordnerName][pfad]; i++) pfad = `assets/${slug(stamm)}-${i}.${endung}`;
      const bytes = a as Uint8Array;
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      const typ = endung === "pdf" ? "application/pdf" : endung === "txt" ? "text/plain" : `image/${endung === "jpg" ? "jpeg" : endung}`;
      fs[ordnerName][pfad] = `data:${typ};base64,${btoa(bin)}`;
      return pfad;
    }
    case "asset_lesen": {
      const d = fs[a.ordner]?.[a.pfad];
      if (!d) throw `Datei nicht gefunden: ${a.pfad}`;
      const bin = atob(d.split(",")[1]);
      return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
    }
    case "in_vorschau_oeffnen":
      console.info("[Simulation] würde in Vorschau öffnen:", a.pfad);
      return null;
    case "suchen": {
      // einfache Nachbildung der Rust-Suche (ohne Umlaut-Faltung)
      const woerter = falten(String(a.anfrage)).split(/\s+/).filter((w) => w && !/^lf\d+$/.test(w) && !w.startsWith("#"));
      const treffer = [];
      for (const [o, dateien] of Object.entries(fs)) {
        for (const [d, inhalt] of Object.entries(dateien)) {
          if (!d.endsWith(".md") || d.includes("/")) continue;
          const t = falten(inhalt);
          if (!woerter.every((w) => t.includes(w))) continue;
          const zeile = inhalt.split("\n").find((z) => !z.startsWith("# ") && woerter.some((w) => falten(z).includes(w))) ?? "";
          const i = info(d, inhalt);
          treffer.push({ ordner: o, datei: d, titel: i.titel, datum: i.datum, ausschnitt: zeile.replace(/^[#>\-\s]+/, ""), art: "notiz", pdf: null });
        }
      }
      return treffer.slice(0, 50);
    }
    case "notiz_loeschen":
      delete fs[a.ordner][a.datei];
      return null;
  }
  throw `Unbekannter Befehl: ${cmd}`;
}

// @ts-expect-error – interne Tauri-Schnittstelle, die @tauri-apps/api aufruft
window.__TAURI_INTERNALS__ = {
  invoke,
  transformCallback,
  // grafik://-Dateien: in der Simulation als Blob-URL aus dem Speicher (Schlüssel "assets/…" im Ordner)
  convertFileSrc: (pfad: string) => {
    const [ordner, ...rest] = pfad.split("/");
    const inhalt = fs[ordner]?.[rest.join("/")];
    if (inhalt?.startsWith("data:")) return inhalt; // Bilder/PDFs
    return inhalt === undefined
      ? "data:text/html,<p style='font:14px sans-serif;color:%23888'>Grafik nicht gefunden</p>"
      : URL.createObjectURL(new Blob([inhalt], { type: "text/html" }));
  },
};
// für listen()/unlisten() aus @tauri-apps/api/event
(window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
// Kennzeichen: läuft in der Browser-Simulation (App fängt dann ⌘N/⌥⌘S selbst ab, es gibt kein Mac-Menü)
(window as unknown as Record<string, unknown>).__blockbuchSimulation = true;
// Für Tests im Browser einsehbar
// @ts-expect-error – Debug-Zugriff
window.__blockbuchFs = fs;
// Simuliert eine Änderung von außen (wie durch Claude)
// @ts-expect-error – Debug-Zugriff
window.__aendereVonAussen = (o: string, d: string, inhalt: string, melden = true) => {
  fs[o][d] = inhalt;
  zeiten[`${o}/${d}`] = Date.now() + 1;
  if (melden) setTimeout(() => emit("schule-geaendert", [{ ordner: o, datei: d }]), 200);
};
// Simuliert Umbenennen/Löschen von außen
// @ts-expect-error – Debug-Zugriff
window.__benenneUmVonAussen = (o: string, alt: string, neu: string) => {
  fs[o][neu] = fs[o][alt];
  delete fs[o][alt];
  setTimeout(() => emit("schule-geaendert", [{ ordner: o, datei: alt }, { ordner: o, datei: neu }]), 200);
};
// @ts-expect-error – Debug-Zugriff
window.__loescheVonAussen = (o: string, d: string) => {
  delete fs[o][d];
  setTimeout(() => emit("schule-geaendert", [{ ordner: o, datei: d }]), 200);
};
export {};
