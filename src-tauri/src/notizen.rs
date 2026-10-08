// Kernlogik für Ordner und Notizen in ~/Schule – unabhängig von Tauri, damit sie testbar ist.
// Grundregeln: nie eine fremde Datei überschreiben, nie halbe Dateien hinterlassen,
// Änderungen von außen (Claude) nicht stillschweigend verwerfen.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub type Ergebnis<T> = Result<T, String>;

#[derive(Serialize, Debug)]
pub struct NotizInhalt {
    pub inhalt: String,
    /// Änderungszeit beim Lesen (ms) – beim Speichern mitgeben, um fremde Änderungen zu erkennen
    pub geaendert: u64,
}

/// Fehlertext-Präfix, an dem die Oberfläche einen Konflikt erkennt
pub const KONFLIKT: &str = "KONFLIKT:";

#[derive(Serialize, Debug)]
pub struct NotizInfo {
    pub datei: String,
    pub titel: String,
    pub datum: String,
    pub geaendert: u64,
}

fn fehler(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Nur einfache Namen direkt im Ordner – keine Pfade, nichts Verstecktes, keine Zeilenumbrüche.
pub fn pruefe_name(name: &str) -> Ergebnis<()> {
    if name.trim().is_empty() || name.starts_with('.') || name.contains(['/', '\\', '\0', ':', '\n', '\r']) {
        return Err(format!("Ungültiger Name: „{name}“"));
    }
    Ok(())
}

pub fn ordner_pfad(root: &Path, ordner: &str) -> Ergebnis<PathBuf> {
    pruefe_name(ordner)?;
    let pfad = root.join(ordner);
    if !pfad.is_dir() {
        return Err(format!("Ordner „{ordner}“ gibt es nicht mehr."));
    }
    Ok(pfad)
}

pub fn notiz_pfad(root: &Path, ordner: &str, datei: &str) -> Ergebnis<PathBuf> {
    pruefe_name(datei)?;
    if !datei.ends_with(".md") {
        return Err(format!("„{datei}“ ist keine Notiz."));
    }
    Ok(ordner_pfad(root, ordner)?.join(datei))
}

pub fn ordner_liste(root: &Path) -> Ergebnis<Vec<String>> {
    let mut namen: Vec<String> = fs::read_dir(root)
        .map_err(fehler)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| !n.starts_with('.'))
        .collect();
    namen.sort();
    Ok(namen)
}

/// "Subnetting & VLSM" -> "Subnetting-VLSM", Umlaute werden ausgeschrieben.
pub fn slug(titel: &str) -> String {
    let mut s = String::new();
    for c in titel.trim().chars() {
        match c {
            'ä' => s.push_str("ae"),
            'ö' => s.push_str("oe"),
            'ü' => s.push_str("ue"),
            'Ä' => s.push_str("Ae"),
            'Ö' => s.push_str("Oe"),
            'Ü' => s.push_str("Ue"),
            'ß' => s.push_str("ss"),
            c if c.is_ascii_alphanumeric() => s.push(c),
            _ => {
                if !s.is_empty() && !s.ends_with('-') {
                    s.push('-');
                }
            }
        }
    }
    let s: String = s.trim_end_matches('-').chars().take(60).collect();
    let s = s.trim_end_matches('-').to_string();
    if s.is_empty() {
        "Notiz".into()
    } else {
        s
    }
}

/// Echtes Kalenderdatum im Format YYYY-MM-DD (grob: Monat 1–12, Tag 1–31)
pub fn ist_datum(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let zahl = |r: std::ops::Range<usize>| s[r].parse::<u32>().ok();
    matches!((zahl(0..4), zahl(5..7), zahl(8..10)), (Some(_), Some(1..=12), Some(1..=31)))
}

pub fn hat_datum_praefix(name: &str) -> bool {
    name.len() >= 11 && name.is_char_boundary(10) && ist_datum(&name[..10]) && name.as_bytes()[10] == b'-'
}

/// Freier Dateiname im Ordner: name.md, name-2.md, name-3.md …
fn freier_dateiname(ordner: &Path, basis: &str) -> String {
    let mut name = format!("{basis}.md");
    let mut n = 2;
    while ordner.join(&name).exists() {
        name = format!("{basis}-{n}.md");
        n += 1;
    }
    name
}

/// BOM entfernen und Zeilenenden vereinheitlichen – nur zum Lesen von Metadaten.
fn normalisiert(inhalt: &str) -> String {
    inhalt.trim_start_matches('\u{feff}').replace("\r\n", "\n")
}

/// Teilt (normalisierten) Inhalt in (Frontmatter inkl. Trennlinien, Rest).
fn teile_frontmatter(inhalt: &str) -> (&str, &str) {
    if let Some(rest) = inhalt.strip_prefix("---\n") {
        if let Some(ende) = rest.find("\n---") {
            let nach = &rest[ende + 4..];
            let zeilenende = nach.find('\n').map(|i| i + 1).unwrap_or(nach.len());
            let grenze = 4 + ende + 4 + zeilenende;
            return (&inhalt[..grenze], &inhalt[grenze..]);
        }
    }
    ("", inhalt)
}

/// Index der ersten H1-Zeile – Zeilen in Codeblöcken (``` / ~~~) zählen nicht.
fn erste_h1<'a>(zeilen: impl Iterator<Item = &'a str>) -> Option<usize> {
    let mut im_code: Option<&str> = None;
    for (i, z) in zeilen.enumerate() {
        let t = z.trim_start();
        let zaun = if t.starts_with("```") { Some("```") } else if t.starts_with("~~~") { Some("~~~") } else { None };
        match (im_code, zaun) {
            (None, Some(f)) => im_code = Some(f),
            (Some(offen), Some(f)) if offen == f => im_code = None,
            (None, None) if z.starts_with("# ") || z == "#" => return Some(i),
            _ => {}
        }
    }
    None
}

fn geaendert_ms(pfad: &Path) -> u64 {
    fs::metadata(pfad)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn lies_info(pfad: &Path) -> Ergebnis<NotizInfo> {
    let datei = pfad.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
    let inhalt = normalisiert(&fs::read_to_string(pfad).map_err(fehler)?);
    let (frontmatter, text) = teile_frontmatter(&inhalt);

    let datum = frontmatter
        .lines()
        .find_map(|z| z.strip_prefix("datum:"))
        .map(|d| d.trim().trim_matches(['"', '\'']).to_string())
        .filter(|d| ist_datum(d))
        .or_else(|| hat_datum_praefix(&datei).then(|| datei[..10].to_string()))
        .unwrap_or_default();

    let titel = erste_h1(text.lines())
        .and_then(|i| text.lines().nth(i))
        .map(|z| z.trim_start_matches('#').trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| {
            let stamm = datei.trim_end_matches(".md");
            let stamm = if hat_datum_praefix(stamm) { &stamm[11..] } else { stamm };
            stamm.replace('-', " ")
        });

    Ok(NotizInfo { datei, titel, datum, geaendert: geaendert_ms(pfad) })
}

/// Schreibt erst eine versteckte Temp-Datei und ersetzt dann in einem Schritt.
/// Wer die Datei gleichzeitig liest (Claude), sieht nie einen halben Stand.
/// `erwartet`: Änderungszeit (ms) beim Lesen – hat sich die Datei seitdem geändert, wird abgebrochen.
/// Gibt die Änderungszeit (ms) der geschriebenen Datei zurück – genommen *vor* dem Ersetzen,
/// damit eine Änderung von außen direkt danach nicht für die eigene gehalten wird.
pub fn schreibe_atomar(pfad: &Path, inhalt: &str, erwartet: Option<u64>) -> Ergebnis<u64> {
    let ordner = pfad.parent().ok_or("Ungültiger Pfad")?;
    let name = pfad.file_name().and_then(|n| n.to_str()).ok_or("Ungültiger Pfad")?;
    let tmp = ordner.join(format!(".{name}.{}.blockbuch-tmp", std::process::id()));
    let ergebnis = (|| {
        let mut f = fs::File::create(&tmp).map_err(fehler)?;
        f.write_all(inhalt.as_bytes()).map_err(fehler)?;
        f.sync_all().map_err(fehler)?;
        // rename behält die Änderungszeit bei
        let geschrieben = f
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if let Some(t) = erwartet {
            if !pfad.exists() {
                return Err(format!("{KONFLIKT} Die Notiz gibt es nicht mehr (gelöscht oder umbenannt)."));
            }
            if geaendert_ms(pfad) != t {
                return Err(format!("{KONFLIKT} Die Notiz wurde gerade von außen geändert (z. B. von Claude)."));
            }
        }
        fs::rename(&tmp, pfad).map_err(fehler)?;
        Ok(geschrieben)
    })();
    if ergebnis.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    ergebnis
}

/// Datei umbenennen, ohne je ein vorhandenes Ziel zu überschreiben. Gibt den tatsächlichen Namen zurück.
fn umbenennen_ohne_ueberschreiben(ordner: &Path, alt: &str, basis: &str) -> Ergebnis<String> {
    let wunsch = format!("{basis}.md");
    // Schon passend benannt (auch als basis-2.md usw.): nichts tun
    let hat_nummer = alt
        .strip_prefix(&format!("{basis}-"))
        .and_then(|r| r.strip_suffix(".md"))
        .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()));
    if wunsch == alt || hat_nummer {
        return Ok(alt.to_string());
    }
    // Nur Groß-/Kleinschreibung anders: auf APFS dieselbe Datei – direkt umbenennen
    if wunsch.to_lowercase() == alt.to_lowercase() {
        fs::rename(ordner.join(alt), ordner.join(&wunsch)).map_err(fehler)?;
        return Ok(wunsch);
    }
    for _ in 0..20 {
        let neu = freier_dateiname(ordner, basis);
        // hard_link schlägt fehl, wenn das Ziel existiert – kein Wettlauf möglich
        match fs::hard_link(ordner.join(alt), ordner.join(&neu)) {
            Ok(()) => {
                fs::remove_file(ordner.join(alt)).map_err(fehler)?;
                return Ok(neu);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(fehler(e)),
        }
    }
    Err("Kein freier Dateiname gefunden.".into())
}

/// Anleitung und Befehle für Claude Code: (Pfad relativ zu ~/Schule, Inhalt, bei neuer App-Version aktualisieren?)
/// `ueber-mich.md` gehört dem Nutzer – wird nur einmal angelegt, nie aktualisiert.
const VORLAGEN: &[(&str, &str, bool)] = &[
    ("CLAUDE.md", include_str!("../vorlagen/CLAUDE.md"), true),
    ("ueber-mich.md", include_str!("../vorlagen/ueber-mich.md"), false),
    (".claude/commands/aufbereiten.md", include_str!("../vorlagen/commands/aufbereiten.md"), true),
    (".claude/commands/karten.md", include_str!("../vorlagen/commands/karten.md"), true),
    (".claude/commands/luecken.md", include_str!("../vorlagen/commands/luecken.md"), true),
    (".claude/commands/woche.md", include_str!("../vorlagen/commands/woche.md"), true),
    (".claude/commands/korrigieren.md", include_str!("../vorlagen/commands/korrigieren.md"), true),
    (".claude/commands/grafik.md", include_str!("../vorlagen/commands/grafik.md"), true),
];

/// Hier merkt sich die App, welche Vorlagen-Fassung sie selbst geschrieben hat
const VORLAGEN_PROTOKOLL: &str = ".claude/blockbuch-vorlagen.txt";

/// Stabiler Prüfwert (FNV-1a) – erkennt, ob der Nutzer eine Vorlage verändert hat
fn pruefwert(text: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in text.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// Legt fehlende Vorlagen an und aktualisiert sie bei neuen App-Versionen –
/// aber nur, wenn der Nutzer die Datei seit dem letzten Schreiben nicht selbst geändert hat.
fn vorlagen_anlegen(root: &Path) -> Ergebnis<()> {
    let protokoll_pfad = root.join(VORLAGEN_PROTOKOLL);
    let mut protokoll: std::collections::BTreeMap<String, String> = fs::read_to_string(&protokoll_pfad)
        .unwrap_or_default()
        .lines()
        .filter_map(|z| z.split_once('\t'))
        .map(|(p, h)| (p.to_string(), h.to_string()))
        .collect();

    for (pfad, inhalt, aktualisieren) in VORLAGEN {
        let ziel = root.join(pfad);
        if let Some(ordner) = ziel.parent() {
            fs::create_dir_all(ordner).map_err(fehler)?;
        }
        match fs::read_to_string(&ziel) {
            Err(_) => {
                // fehlt: neu anlegen (create_new – falls sie gerade doch entsteht, nicht überschreiben)
                if let Ok(mut f) = fs::OpenOptions::new().write(true).create_new(true).open(&ziel) {
                    f.write_all(inhalt.as_bytes()).map_err(fehler)?;
                }
            }
            Ok(aktuell) if aktuell == *inhalt => {}
            Ok(_) if !aktualisieren => continue,
            Ok(aktuell) => {
                let unveraendert = protokoll.get(*pfad).is_some_and(|h| *h == pruefwert(&aktuell));
                if !unveraendert {
                    continue; // vom Nutzer angepasst → nie überschreiben
                }
                schreibe_atomar(&ziel, inhalt, None)?;
            }
        }
        protokoll.insert(pfad.to_string(), pruefwert(inhalt));
    }

    let text: String = protokoll.iter().map(|(p, h)| format!("{p}\t{h}\n")).collect();
    fs::write(&protokoll_pfad, text).map_err(fehler)
}

pub fn schule_oeffnen(root: &Path, standard_ordner: &[String]) -> Ergebnis<Vec<String>> {
    fs::create_dir_all(root).map_err(fehler)?;
    for name in standard_ordner {
        pruefe_name(name)?;
        fs::create_dir_all(root.join(name)).map_err(fehler)?;
    }
    vorlagen_anlegen(root)?;
    ordner_liste(root)
}

pub fn ordner_erstellen(root: &Path, name: &str) -> Ergebnis<Vec<String>> {
    let name = name.trim();
    pruefe_name(name)?;
    let vorhanden = ordner_liste(root)?;
    if vorhanden.iter().any(|n| n.to_lowercase() == name.to_lowercase()) {
        return Err(format!("Ordner „{name}“ gibt es schon."));
    }
    fs::create_dir(root.join(name)).map_err(fehler)?;
    ordner_liste(root)
}

pub fn notizen_auflisten(root: &Path, ordner: &str) -> Ergebnis<Vec<NotizInfo>> {
    let pfad = ordner_pfad(root, ordner)?;
    let mut notizen: Vec<NotizInfo> = fs::read_dir(&pfad)
        .map_err(fehler)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "md"))
        .filter(|p| !p.file_name().and_then(|n| n.to_str()).unwrap_or(".").starts_with('.'))
        .filter_map(|p| lies_info(&p).ok())
        .collect();
    // Neueste zuerst: nach Datum, bei gleichem Datum nach letzter Änderung
    notizen.sort_by(|a, b| b.datum.cmp(&a.datum).then(b.geaendert.cmp(&a.geaendert)));
    Ok(notizen)
}

pub fn notiz_lesen(root: &Path, ordner: &str, datei: &str) -> Ergebnis<NotizInhalt> {
    let pfad = notiz_pfad(root, ordner, datei)?;
    let geaendert = geaendert_ms(&pfad);
    let inhalt = fs::read_to_string(&pfad).map_err(fehler)?;
    Ok(NotizInhalt { inhalt, geaendert })
}

/// Speichert den ganzen Inhalt. `erwartet` = Änderungszeit vom letzten Lesen/Speichern;
/// `None` überschreibt bewusst (nur nach Rückfrage beim Konflikt).
pub fn notiz_speichern(root: &Path, ordner: &str, datei: &str, inhalt: &str, erwartet: Option<u64>) -> Ergebnis<u64> {
    let pfad = notiz_pfad(root, ordner, datei)?;
    schreibe_atomar(&pfad, inhalt, erwartet)
}

/// Sichert die eigene Version bei einem Konflikt als neue Datei neben dem Original
/// (z. B. "2026-10-07-Joins-konflikt-1042.md"). Überschreibt nie etwas. Gibt den Dateinamen zurück.
pub fn notiz_konfliktkopie(root: &Path, ordner: &str, datei: &str, inhalt: &str, uhrzeit: &str) -> Ergebnis<String> {
    pruefe_name(datei)?;
    if uhrzeit.len() != 4 || !uhrzeit.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("Ungültige Uhrzeit: {uhrzeit}"));
    }
    pruefe_name(ordner)?;
    // Darf nie scheitern: gibt es den Ordner nicht mehr (z. B. von Claude umbenannt/gelöscht),
    // landet die Kopie in ~/Schule/Gerettet
    let ordner_p = match ordner_pfad(root, ordner) {
        Ok(p) => p,
        Err(_) => {
            let p = root.join("Gerettet");
            fs::create_dir_all(&p).map_err(fehler)?;
            p
        }
    };
    let stamm = datei.trim_end_matches(".md");
    let basis = format!("{stamm}-konflikt-{uhrzeit}");
    for _ in 0..20 {
        let name = freier_dateiname(&ordner_p, &basis);
        match fs::OpenOptions::new().write(true).create_new(true).open(ordner_p.join(&name)) {
            Ok(mut f) => {
                f.write_all(inhalt.as_bytes()).map_err(fehler)?;
                f.sync_all().map_err(fehler)?;
                return Ok(name);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(fehler(e)),
        }
    }
    Err("Kein freier Dateiname gefunden.".into())
}

pub fn notiz_erstellen(root: &Path, ordner: &str, lernfeld: Option<&str>, titel: &str, datum: &str) -> Ergebnis<NotizInfo> {
    let ordner_p = ordner_pfad(root, ordner)?;
    let titel = titel.trim();
    if titel.is_empty() || titel.contains(['\n', '\r']) {
        return Err("Ungültiger Titel.".into());
    }
    if !ist_datum(datum) {
        return Err(format!("Ungültiges Datum: {datum}"));
    }
    if let Some(lf) = lernfeld {
        if !(lf.len() == 4 && lf.starts_with("LF") && lf[2..].chars().all(|c| c.is_ascii_digit())) {
            return Err(format!("Ungültiges Lernfeld: {lf}"));
        }
    }
    let mut inhalt = String::from("---\n");
    if let Some(lf) = lernfeld {
        inhalt.push_str(&format!("lernfeld: {lf}\n"));
    }
    inhalt.push_str(&format!("datum: {datum}\ntags: []\n---\n\n# {titel}\n\n"));

    let basis = format!("{datum}-{}", slug(titel));
    for _ in 0..20 {
        let pfad = ordner_p.join(freier_dateiname(&ordner_p, &basis));
        // create_new: niemals eine vorhandene Datei überschreiben
        match fs::OpenOptions::new().write(true).create_new(true).open(&pfad) {
            Ok(mut f) => {
                f.write_all(inhalt.as_bytes()).map_err(fehler)?;
                return lies_info(&pfad);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(fehler(e)),
        }
    }
    Err("Kein freier Dateiname gefunden.".into())
}

pub fn notiz_umbenennen(root: &Path, ordner: &str, datei: &str, titel: &str) -> Ergebnis<NotizInfo> {
    let titel = titel.trim();
    if titel.is_empty() || titel.contains(['\n', '\r']) {
        return Err("Der Titel darf nicht leer sein.".into());
    }
    let ordner_p = ordner_pfad(root, ordner)?;
    let alt = notiz_pfad(root, ordner, datei)?;
    let gelesen_um = geaendert_ms(&alt);
    let roh = fs::read_to_string(&alt).map_err(fehler)?;

    // Zeilenenden und BOM der Datei beibehalten
    let nl = if roh.contains("\r\n") { "\r\n" } else { "\n" };
    let bom = if roh.starts_with('\u{feff}') { "\u{feff}" } else { "" };
    let inhalt = normalisiert(&roh);
    let (frontmatter, text) = teile_frontmatter(&inhalt);

    let mut zeilen: Vec<String> = text.lines().map(String::from).collect();
    match erste_h1(text.lines()) {
        Some(i) => zeilen[i] = format!("# {titel}"),
        None => {
            zeilen.insert(0, format!("# {titel}"));
            if !frontmatter.is_empty() {
                zeilen.insert(0, String::new());
            }
        }
    }
    let mut neu = format!("{frontmatter}{}", zeilen.join("\n"));
    if inhalt.ends_with('\n') || zeilen.len() == 1 {
        neu.push('\n');
    }
    let neu = format!("{bom}{}", neu.replace('\n', nl));

    schreibe_atomar(&alt, &neu, Some(gelesen_um))?;

    // Dateiname: Datum-Präfix behalten, Rest aus dem neuen Titel
    let info = lies_info(&alt)?;
    let praefix = if hat_datum_praefix(datei) { datei[..10].to_string() } else { info.datum };
    let basis = if praefix.is_empty() { slug(titel) } else { format!("{praefix}-{}", slug(titel)) };
    let neu_name = umbenennen_ohne_ueberschreiben(&ordner_p, datei, &basis)?;
    lies_info(&ordner_p.join(neu_name))
}

/// Dateitypen, die in assets/ abgelegt werden dürfen (Bilder, PDFs, PDF-Text, HTML-Grafiken)
const ASSET_ENDUNGEN: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "pdf", "txt", "html", "htm"];
const ASSET_MAX_BYTES: usize = 100 * 1024 * 1024;

/// Speichert eine eingefügte/abgelegte Datei in <Ordner>/assets/ unter einem freien, lesbaren Namen.
/// Gibt den Pfad relativ zur Notiz zurück, z. B. "assets/Arbeitsblatt-Joins.pdf".
pub fn asset_speichern(root: &Path, ordner: &str, name: &str, inhalt: &[u8]) -> Ergebnis<String> {
    if inhalt.len() > ASSET_MAX_BYTES {
        return Err("Die Datei ist zu groß (höchstens 100 MB).".into());
    }
    let (stamm, endung) = name.rsplit_once('.').unwrap_or((name, ""));
    let endung = endung.to_ascii_lowercase();
    if !ASSET_ENDUNGEN.contains(&endung.as_str()) {
        return Err(format!("Dateityp „.{endung}“ wird nicht unterstützt (Bilder, PDF)."));
    }
    let assets = ordner_pfad(root, ordner)?.join("assets");
    fs::create_dir_all(&assets).map_err(fehler)?;
    let basis = slug(stamm);
    // iPhone-Fotos (HEIC) als JPEG speichern – das können Claude und andere Programme lesen
    let (inhalt, endung) = match endung.as_str() {
        "heic" => (heic_zu_jpeg(inhalt)?, "jpg".to_string()),
        _ => (inhalt.to_vec(), endung),
    };
    for n in 1..1000 {
        let datei = if n == 1 { format!("{basis}.{endung}") } else { format!("{basis}-{n}.{endung}") };
        let pfad = assets.join(&datei);
        match fs::OpenOptions::new().write(true).create_new(true).open(&pfad) {
            Ok(mut f) => {
                // Bei Fehler (z. B. Platte voll) keine halbe Datei liegen lassen
                if let Err(e) = f.write_all(&inhalt).and_then(|_| f.sync_all()) {
                    let _ = fs::remove_file(&pfad);
                    return Err(fehler(e));
                }
                return Ok(format!("assets/{datei}"));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(fehler(e)),
        }
    }
    Err("Kein freier Dateiname gefunden.".into())
}

/// HEIC → JPEG mit dem macOS-Bordwerkzeug `sips`
fn heic_zu_jpeg(heic: &[u8]) -> Ergebnis<Vec<u8>> {
    let tmp = std::env::temp_dir().join(format!("blockbuch-{}-{}", std::process::id(), pruefwert(&format!("{:?}", std::time::SystemTime::now()))));
    fs::create_dir_all(&tmp).map_err(fehler)?;
    let (ein, aus) = (tmp.join("foto.heic"), tmp.join("foto.jpg"));
    let ergebnis = (|| {
        fs::write(&ein, heic).map_err(fehler)?;
        let ok = std::process::Command::new("sips")
            .args(["-s", "format", "jpeg"])
            .arg(&ein)
            .arg("--out")
            .arg(&aus)
            .output()
            .map_err(fehler)?
            .status
            .success();
        if !ok {
            return Err("Das iPhone-Foto (HEIC) konnte nicht umgewandelt werden.".to_string());
        }
        fs::read(&aus).map_err(fehler)
    })();
    let _ = fs::remove_dir_all(&tmp);
    ergebnis
}

/// Echter Pfad einer Datei aus <Ordner>/assets/ – nichts außerhalb (auch nicht über Symlinks)
pub fn asset_pfad(root: &Path, ordner: &str, pfad: &str) -> Ergebnis<PathBuf> {
    let datei = pfad.strip_prefix("assets/").ok_or("Nur Dateien aus assets/ sind erlaubt.")?;
    pruefe_name(datei)?;
    let assets = ordner_pfad(root, ordner)?.join("assets");
    let echt = assets.join(datei).canonicalize().map_err(|_| format!("Datei nicht gefunden: {pfad}"))?;
    if !echt.starts_with(assets.canonicalize().map_err(fehler)?) {
        return Err("Zugriff verweigert.".into());
    }
    Ok(echt)
}

/// Liest eine Datei aus <Ordner>/assets/ (z. B. ein PDF zum Anzeigen)
pub fn asset_lesen(root: &Path, ordner: &str, pfad: &str) -> Ergebnis<Vec<u8>> {
    fs::read(asset_pfad(root, ordner, pfad)?).map_err(fehler)
}

pub fn notiz_loeschen(root: &Path, ordner: &str, datei: &str) -> Ergebnis<()> {
    let pfad = notiz_pfad(root, ordner, datei)?;
    // In den Papierkorb, nicht endgültig – lässt sich im Finder wiederherstellen
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        // Direkt über macOS statt Finder-Fernsteuerung: schneller, keine Automations-Abfrage
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx.delete(pfad).map_err(fehler)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn testordner() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Schule");
        schule_oeffnen(&root, &["LF05-Daten".to_string()]).unwrap();
        (tmp, root)
    }

    #[test]
    fn slug_macht_lesbare_dateinamen() {
        assert_eq!(slug("Subnetting & VLSM"), "Subnetting-VLSM");
        assert_eq!(slug("Größe über alles"), "Groesse-ueber-alles");
        assert_eq!(slug("  ??  "), "Notiz");
    }

    #[test]
    fn datum_wird_geprueft() {
        assert!(ist_datum("2026-10-07"));
        assert!(!ist_datum("2026-99-99"));
        assert!(hat_datum_praefix("2026-10-07-Joins.md"));
        assert!(!hat_datum_praefix("Joins.md"));
    }

    #[test]
    fn unsichere_namen_werden_abgelehnt() {
        for name in ["../geheim", ".git", "", "a/b", "a\nb"] {
            assert!(pruefe_name(name).is_err(), "{name:?}");
        }
        assert!(pruefe_name("LF05-Daten-verwalten").is_ok());
    }

    #[test]
    fn h1_in_codeblock_zaehlt_nicht() {
        let text = "Text\n```bash\n# pakete installieren\n```\n# Echter Titel";
        assert_eq!(erste_h1(text.lines()), Some(4));
        assert_eq!(erste_h1("```\n# nur Code\n```".lines()), None);
    }

    #[test]
    fn erstellen_umbenennen_loeschen() {
        let (_tmp, root) = testordner();
        let n = notiz_erstellen(&root, "LF05-Daten", Some("LF05"), "SQL Joins", "2026-10-07").unwrap();
        assert_eq!(n.datei, "2026-10-07-SQL-Joins.md");
        assert_eq!(n.titel, "SQL Joins");

        let zweite = notiz_erstellen(&root, "LF05-Daten", Some("LF05"), "SQL Joins", "2026-10-07").unwrap();
        assert_eq!(zweite.datei, "2026-10-07-SQL-Joins-2.md");

        // Umbenennen auf einen belegten Namen überschreibt nichts
        let r = notiz_umbenennen(&root, "LF05-Daten", &zweite.datei, "SQL Joins").unwrap();
        assert_eq!(r.datei, "2026-10-07-SQL-Joins-2.md");
        let r = notiz_umbenennen(&root, "LF05-Daten", &r.datei, "Normalformen").unwrap();
        assert_eq!(r.datei, "2026-10-07-Normalformen.md");
        assert_eq!(notizen_auflisten(&root, "LF05-Daten").unwrap().len(), 2);
        let inhalt = notiz_lesen(&root, "LF05-Daten", &r.datei).unwrap().inhalt;
        assert!(inhalt.contains("# Normalformen\n") && inhalt.contains("lernfeld: LF05"));
    }

    #[test]
    fn umbenennen_schuetzt_code_und_zeilenenden() {
        let (_tmp, root) = testordner();
        let pfad = root.join("LF05-Daten/2026-10-07-Skript.md");
        fs::write(&pfad, "---\r\ndatum: 2026-10-07\r\n---\r\n\r\n```bash\r\n# pakete installieren\r\n```\r\n").unwrap();
        let info = lies_info(&pfad).unwrap();
        assert_eq!(info.titel, "Skript");
        assert_eq!(info.datum, "2026-10-07");

        let r = notiz_umbenennen(&root, "LF05-Daten", "2026-10-07-Skript.md", "Setup").unwrap();
        let inhalt = notiz_lesen(&root, "LF05-Daten", &r.datei).unwrap().inhalt;
        assert!(inhalt.contains("# pakete installieren"), "Code-Kommentar muss bleiben");
        assert!(inhalt.contains("# Setup\r\n"), "Titel eingefügt, CRLF erhalten: {inhalt:?}");
        assert!(!inhalt.replace("\r\n", "").contains('\n'), "keine gemischten Zeilenenden");
    }

    #[test]
    fn umbenennen_nur_gross_klein() {
        let (_tmp, root) = testordner();
        let n = notiz_erstellen(&root, "LF05-Daten", None, "joins", "2026-10-07").unwrap();
        let r = notiz_umbenennen(&root, "LF05-Daten", &n.datei, "Joins").unwrap();
        assert_eq!(r.datei, "2026-10-07-Joins.md");
        assert_eq!(notizen_auflisten(&root, "LF05-Daten").unwrap().len(), 1);
    }

    #[test]
    fn atomar_schreiben_erkennt_fremde_aenderung() {
        let (_tmp, root) = testordner();
        let pfad = root.join("LF05-Daten/a.md");
        fs::write(&pfad, "alt").unwrap();
        assert!(schreibe_atomar(&pfad, "neu", Some(1)).unwrap_err().starts_with(KONFLIKT));
        assert_eq!(fs::read_to_string(&pfad).unwrap(), "alt");
        let reste = fs::read_dir(root.join("LF05-Daten")).unwrap().filter(|e| {
            e.as_ref().unwrap().file_name().to_string_lossy().ends_with("blockbuch-tmp")
        });
        assert_eq!(reste.count(), 0, "keine Temp-Dateien übrig");
        schreibe_atomar(&pfad, "neu", None).unwrap();
        assert_eq!(fs::read_to_string(&pfad).unwrap(), "neu");
    }

    #[test]
    fn speichern_mit_konflikterkennung() {
        let (_tmp, root) = testordner();
        let n = notiz_erstellen(&root, "LF05-Daten", None, "Joins", "2026-10-07").unwrap();
        let gelesen = notiz_lesen(&root, "LF05-Daten", &n.datei).unwrap();
        let neu = notiz_speichern(&root, "LF05-Daten", &n.datei, "# Joins\n\nText\n", Some(gelesen.geaendert)).unwrap();

        // Claude ändert die Datei von außen
        std::thread::sleep(std::time::Duration::from_millis(5));
        fs::write(root.join("LF05-Daten").join(&n.datei), "# Joins\n\nVon Claude\n").unwrap();
        let err = notiz_speichern(&root, "LF05-Daten", &n.datei, "# Joins\n\nMein Text\n", Some(neu)).unwrap_err();
        assert!(err.starts_with(KONFLIKT));
        assert!(notiz_lesen(&root, "LF05-Daten", &n.datei).unwrap().inhalt.contains("Von Claude"));

        // Konfliktkopie neben dem Original, nichts überschrieben
        let kopie = notiz_konfliktkopie(&root, "LF05-Daten", &n.datei, "Mein Text", "1042").unwrap();
        assert_eq!(kopie, "2026-10-07-Joins-konflikt-1042.md");
        let kopie2 = notiz_konfliktkopie(&root, "LF05-Daten", &n.datei, "Noch mehr", "1042").unwrap();
        assert_eq!(kopie2, "2026-10-07-Joins-konflikt-1042-2.md");
        assert!(notiz_konfliktkopie(&root, "LF05-Daten", &n.datei, "x", "10:42").is_err());

        // Eigene Änderungszeit stimmt mit der Datei überein
        let t = notiz_speichern(&root, "LF05-Daten", &kopie, "neu", None).unwrap();
        assert_eq!(t, notiz_lesen(&root, "LF05-Daten", &kopie).unwrap().geaendert);

        // Ordner verschwunden: Kopie landet in "Gerettet"
        let g = notiz_konfliktkopie(&root, "Gibt-es-nicht", "2026-10-07-X.md", "Text", "1043").unwrap();
        assert!(root.join("Gerettet").join(&g).exists());

        // Gelöschte Datei wird beim Speichern nicht wieder angelegt
        fs::remove_file(root.join("LF05-Daten").join(&n.datei)).unwrap();
        assert!(notiz_speichern(&root, "LF05-Daten", &n.datei, "x", Some(neu)).is_err());
        assert!(!root.join("LF05-Daten").join(&n.datei).exists());
    }

    #[test]
    fn vorlagen_werden_angelegt_aber_nie_ueberschrieben() {
        let (_tmp, root) = testordner();
        assert!(root.join("CLAUDE.md").exists());
        assert!(root.join(".claude/commands/aufbereiten.md").exists());
        // Vorlagen-Ordner tauchen nicht als Notizordner auf
        assert!(!ordner_liste(&root).unwrap().iter().any(|o| o.starts_with('.')));

        fs::write(root.join("CLAUDE.md"), "eigene Version").unwrap();
        fs::write(root.join("ueber-mich.md"), "mein Profil").unwrap();
        schule_oeffnen(&root, &[]).unwrap();
        assert_eq!(fs::read_to_string(root.join("CLAUDE.md")).unwrap(), "eigene Version");
        assert_eq!(fs::read_to_string(root.join("ueber-mich.md")).unwrap(), "mein Profil");
    }

    #[test]
    fn unveraenderte_alte_vorlage_wird_aktualisiert() {
        let (_tmp, root) = testordner();
        // so, als hätte eine ältere App-Version "alte Fassung" geschrieben und protokolliert
        let befehl = root.join(".claude/commands/karten.md");
        fs::write(&befehl, "alte Fassung").unwrap();
        let protokoll = root.join(VORLAGEN_PROTOKOLL);
        let p = fs::read_to_string(&protokoll).unwrap();
        let p: String = p
            .lines()
            .map(|z| {
                if z.starts_with(".claude/commands/karten.md\t") {
                    format!(".claude/commands/karten.md\t{}\n", pruefwert("alte Fassung"))
                } else {
                    format!("{z}\n")
                }
            })
            .collect();
        fs::write(&protokoll, p).unwrap();

        schule_oeffnen(&root, &[]).unwrap();
        assert!(fs::read_to_string(&befehl).unwrap().contains("Karteikarten"));
    }

    #[test]
    fn assets_speichern_und_lesen() {
        let (_tmp, root) = testordner();
        let p = asset_speichern(&root, "LF05-Daten", "Arbeitsblatt Joins.PDF", b"%PDF-1.4").unwrap();
        assert_eq!(p, "assets/Arbeitsblatt-Joins.pdf");
        let p2 = asset_speichern(&root, "LF05-Daten", "Arbeitsblatt Joins.pdf", b"%PDF-2").unwrap();
        assert_eq!(p2, "assets/Arbeitsblatt-Joins-2.pdf");
        assert_eq!(asset_lesen(&root, "LF05-Daten", &p).unwrap(), b"%PDF-1.4");
        // Tafelbild mit Umlauten
        assert_eq!(asset_speichern(&root, "LF05-Daten", "Tafel Übung.jpeg", b"x").unwrap(), "assets/Tafel-Uebung.jpeg");
        // Nicht erlaubt
        assert!(asset_speichern(&root, "LF05-Daten", "virus.exe", b"x").is_err());
        assert!(asset_speichern(&root, "../x", "a.png", b"x").is_err());
        assert!(asset_lesen(&root, "LF05-Daten", "../2026.md").is_err());
        assert!(asset_lesen(&root, "LF05-Daten", "assets/../../CLAUDE.md").is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn iphone_foto_heic_wird_jpeg() {
        let (tmp, root) = testordner();
        // 1×1-PNG erzeugen und mit sips in HEIC umwandeln (wie ein iPhone-Foto)
        let png: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49,
            0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0, 0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99, 0x3D,
            0x1D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let p = tmp.path().join("a.png");
        fs::write(&p, png).unwrap();
        let heic = tmp.path().join("a.heic");
        let ok = std::process::Command::new("sips")
            .args(["-s", "format", "heic"])
            .arg(&p)
            .arg("--out")
            .arg(&heic)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !ok {
            eprintln!("sips kann kein HEIC erzeugen – Test übersprungen");
            return;
        }
        let pfad = asset_speichern(&root, "LF05-Daten", "IMG_1234.HEIC", &fs::read(&heic).unwrap()).unwrap();
        assert_eq!(pfad, "assets/IMG-1234.jpg");
        let jpg = asset_lesen(&root, "LF05-Daten", &pfad).unwrap();
        assert_eq!(&jpg[..2], &[0xFF, 0xD8], "JPEG-Kennung");
    }

    #[test]
    fn ordner_doppelt_wird_abgelehnt() {
        let (_tmp, root) = testordner();
        ordner_erstellen(&root, "Deutsch").unwrap();
        assert!(ordner_erstellen(&root, "deutsch").is_err());
    }
}
