// Automatische Sicherung von ~/Schule mit Git – jede Version jeder Notiz lässt sich zurückholen,
// auch wenn Claude oder der Nutzer etwas versehentlich gelöscht oder überschrieben hat.
//
// - Beim Start: Git-Archiv anlegen (falls nötig) und sichern, was sich seitdem geändert hat
// - Alle 5 Minuten und beim Beenden: sichern, falls sich etwas geändert hat
// - Pro Notiz: Versionen auflisten, alte Version ansehen, wiederherstellen
//
// Benutzt das git-Programm von macOS (Xcode-Werkzeuge). Ohne git läuft die App normal weiter.

use crate::notizen::{pruefe_name, schreibe_atomar, Ergebnis};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;

/// Immer nur ein Git-Vorgang gleichzeitig (sonst stören sich Timer, Beenden und Wiederherstellen)
static SPERRE: Mutex<()> = Mutex::new(());

const GITIGNORE: &str = "# Von Blockbuch angelegt\n.DS_Store\n*.blockbuch-tmp\n.*.blockbuch-ohnetext\n.claude/settings.local.json\n\n# Programmierprojekte: große, erzeugbare Ordner nicht sichern\nnode_modules/\ntarget/\nbuild/\ndist/\n.venv/\nvenv/\n__pycache__/\n.gradle/\n.idea/\n";
/// Bilder/PDFs ändern sich nicht und lassen sich nicht sinnvoll vergleichen – spart Zeit und Platz
const GITATTRIBUTES: &str = "# Von Blockbuch angelegt\n*.pdf binary -delta\n*.png binary -delta\n*.jpg binary -delta\n*.jpeg binary -delta\n*.heic binary -delta\n*.gif binary -delta\n*.webp binary -delta\n";
/// Größere Dateien werden nicht gesichert (würden das Archiv für immer aufblähen)
const MAX_DATEI_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Serialize, Debug, Clone)]
pub struct Version {
    pub hash: String,
    /// ISO-Zeitpunkt der Sicherung
    pub zeit: String,
    pub nachricht: String,
    /// Pfad der Notiz zu diesem Zeitpunkt (kann sich durch Umbenennen geändert haben)
    pub pfad: String,
}

/// Ist git wirklich nutzbar? (/usr/bin/git gibt es immer – ohne Xcode-Werkzeuge ist es nur ein Platzhalter,
/// der den Installationsdialog öffnet)
pub fn git_verfuegbar() -> Ergebnis<()> {
    let ok = Command::new("xcode-select").arg("-p").output().map(|o| o.status.success()).unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err("Git fehlt – im Terminal „xcode-select --install“ ausführen, dann Blockbuch neu starten.".into())
    }
}

/// git-Aufruf, abgeschottet von den persönlichen Git-Einstellungen des Nutzers: Ein globales
/// „*.pdf ignorieren“, Hooks, LFS-Filter oder Zeilenende-Umwandlungen dürfen die Sicherung nicht verändern.
fn git(root: &Path, args: &[&str]) -> Ergebnis<String> {
    let aus = Command::new("git")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env("GIT_TERMINAL_PROMPT", "0")
        .arg("-C")
        .arg(root)
        // Umlaute in Pfaden nicht als \303\244 ausgeben; keine Hooks; Dateien unverändert speichern
        .args(["-c", "core.quotepath=false", "-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false"])
        .args(args)
        .output()
        .map_err(|_| "Git fehlt – im Terminal „xcode-select --install“ ausführen.".to_string())?;
    if !aus.status.success() {
        // nur die erste Zeile – die Seitenleiste soll lesbar bleiben
        let fehler = String::from_utf8_lossy(&aus.stderr);
        let zeile = fehler.lines().find(|z| !z.trim().is_empty()).unwrap_or("").trim().to_string();
        return Err(format!("git {}: {zeile}", args.first().unwrap_or(&"")));
    }
    Ok(String::from_utf8_lossy(&aus.stdout).into_owned())
}

/// ~/Schule muss selbst das Archiv sein – nicht ein Ordner in einem übergeordneten Git-Archiv
fn ist_eigenes_archiv(root: &Path) -> bool {
    root.join(".git").is_dir()
        && git(root, &["rev-parse", "--show-toplevel"])
            .ok()
            .and_then(|t| Path::new(t.trim()).canonicalize().ok())
            .zip(root.canonicalize().ok())
            .is_some_and(|(a, b)| a == b)
}

/// Nach einem Absturz kann eine alte index.lock liegen bleiben und alle Sicherungen blockieren
fn alte_sperre_entfernen(root: &Path) {
    let lock = root.join(".git/index.lock");
    let alt = fs::metadata(&lock)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|d| d.as_secs() > 10 * 60);
    if alt {
        let _ = fs::remove_file(&lock);
    }
}

/// Was nicht ins Archiv soll: Unterordner mit eigenem Git (Programmierprojekte) und sehr große Dateien
fn ausnahmen(root: &Path) -> (Vec<String>, Vec<String>) {
    let mut projekte = Vec::new();
    let mut gross = Vec::new();
    fn laufen(root: &Path, ordner: &Path, tiefe: u32, projekte: &mut Vec<String>, gross: &mut Vec<String>) {
        let Ok(eintraege) = fs::read_dir(ordner) else { return };
        for e in eintraege.flatten() {
            let pfad = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            let rel = pfad.strip_prefix(root).unwrap_or(&pfad).to_string_lossy().into_owned();
            let Ok(typ) = e.file_type() else { continue };
            if typ.is_dir() {
                if name == ".git" || name == "node_modules" || name == "target" {
                    continue;
                }
                if pfad.join(".git").exists() {
                    projekte.push(rel);
                } else if tiefe < 6 {
                    laufen(root, &pfad, tiefe + 1, projekte, gross);
                }
            } else if e.metadata().map(|m| m.len() > MAX_DATEI_BYTES).unwrap_or(false) {
                gross.push(rel);
            }
        }
    }
    laufen(root, root, 0, &mut projekte, &mut gross);
    (projekte, gross)
}

/// Legt das Git-Archiv an (falls nötig). Eigene Identität nur für dieses Archiv – ändert nichts am Rest des Macs.
pub fn einrichten(root: &Path) -> Ergebnis<()> {
    git_verfuegbar()?;
    let _sperre = SPERRE.lock().unwrap_or_else(|e| e.into_inner());
    einrichten_ohne_sperre(root)
}

fn einrichten_ohne_sperre(root: &Path) -> Ergebnis<()> {
    if !ist_eigenes_archiv(root) {
        git(root, &["init", "-q", "-b", "main"])?;
    }
    // Blockbuch als Autor der automatischen Sicherungen (nur in diesem Archiv)
    git(root, &["config", "user.name", "Blockbuch"])?;
    git(root, &["config", "user.email", "blockbuch@localhost"])?;
    // Eigene Dateien anlegen bzw. aktualisieren, solange sie von Blockbuch stammen
    for (name, inhalt) in [(".gitignore", GITIGNORE), (".gitattributes", GITATTRIBUTES)] {
        let pfad = root.join(name);
        let vorhanden = fs::read_to_string(&pfad).ok();
        if vorhanden.as_deref().is_none_or(|v| v.starts_with("# Von Blockbuch angelegt") && v != inhalt) {
            fs::write(&pfad, inhalt).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Ergebnis einer Sicherung
#[derive(Debug, Default)]
pub struct Gesichert {
    /// Kurz-ID der neuen Sicherung (None = nichts geändert)
    pub id: Option<String>,
    /// Hinweis für die Oberfläche, z. B. ausgelassene Projektordner
    pub hinweis: Option<String>,
}

/// Lesbare Beschreibung der geänderten Dateien, z. B. "LF05: SQL-Joins, Normalformen"
fn beschreibung(namen: &str) -> String {
    let mut teile: Vec<String> = Vec::new();
    for zeile in namen.lines() {
        let pfad = zeile.split('\t').next_back().unwrap_or_default();
        let Some((ordner, datei)) = pfad.split_once('/') else { continue };
        let Some(stamm) = datei.strip_suffix(".md") else { continue };
        if datei.contains('/') {
            continue; // assets/…
        }
        let lf = ordner.split('-').next().unwrap_or(ordner);
        let titel = stamm.get(11..).filter(|_| stamm.len() > 11 && stamm.as_bytes()[10] == b'-').unwrap_or(stamm);
        teile.push(format!("{lf}: {}", titel.replace('-', " ")));
    }
    teile.sort();
    teile.dedup();
    let anzahl = teile.len();
    teile.truncate(4);
    let mut s = teile.join(", ");
    if anzahl > 4 {
        s.push_str(&format!(" und {} weitere", anzahl - 4));
    }
    s
}

/// Sichert alle Änderungen. Fehlt das Archiv (z. B. gelöscht), wird es neu angelegt.
pub fn sichern(root: &Path, grund: &str) -> Ergebnis<Gesichert> {
    git_verfuegbar()?;
    let _sperre = SPERRE.lock().unwrap_or_else(|e| e.into_inner());
    einrichten_ohne_sperre(root)?;
    alte_sperre_entfernen(root);

    let (projekte, gross) = ausnahmen(root);
    let mut args: Vec<String> = vec!["add".into(), "-A".into(), "--".into(), ".".into()];
    for p in projekte.iter().chain(&gross) {
        args.push(format!(":(exclude,literal){p}"));
    }
    git(root, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
    // Schon gesicherte, inzwischen zu große Dateien oder neue Projektordner wieder herausnehmen
    for p in projekte.iter().chain(&gross) {
        let _ = git(root, &["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", &format!(":(literal){p}")]);
    }
    let mut hinweis = Vec::new();
    if !projekte.is_empty() {
        hinweis.push(format!("Ordner mit eigenem Git nicht mitgesichert: {}", projekte.join(", ")));
    }
    if !gross.is_empty() {
        hinweis.push(format!("Dateien über 50 MB nicht mitgesichert: {}", gross.join(", ")));
    }
    let hinweis = (!hinweis.is_empty()).then(|| hinweis.join(" · "));
    let geaendert = git(root, &["diff", "--cached", "--name-status"])?;
    if geaendert.trim().is_empty() {
        return Ok(Gesichert { id: None, hinweis });
    }
    let was = beschreibung(&geaendert);
    let nachricht = if was.is_empty() { grund.to_string() } else { format!("{grund}: {was}") };
    // Globale Einstellungen des Nutzers (Signatur, Hooks) sollen die automatische Sicherung nicht blockieren
    git(root, &["-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", &nachricht])?;
    let id = git(root, &["rev-parse", "--short", "HEAD"])?.trim().to_string();
    Ok(Gesichert { id: Some(id), hinweis })
}

/// Zeitpunkt der letzten Sicherung (ISO), falls es schon eine gibt
pub fn letzte_sicherung(root: &Path) -> Option<String> {
    let _sperre = SPERRE.lock().unwrap_or_else(|e| e.into_inner());
    if !ist_eigenes_archiv(root) {
        return None;
    }
    git(root, &["log", "-1", "--format=%cI"]).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn pruefe_hash(hash: &str) -> Ergebnis<()> {
    if (7..=40).contains(&hash.len()) && hash.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Ungültige Versions-ID.".into())
    }
}

/// Pfad innerhalb von ~/Schule: "<Ordner>/<Datei>.md", ohne Tricks
fn pruefe_pfad(pfad: &str) -> Ergebnis<()> {
    let teile: Vec<&str> = pfad.split('/').collect();
    match teile.as_slice() {
        [ordner, datei] if datei.ends_with(".md") => {
            pruefe_name(ordner)?;
            pruefe_name(datei)
        }
        _ => Err(format!("Ungültiger Pfad: {pfad}")),
    }
}

/// Alle gesicherten Versionen einer Notiz, neueste zuerst (folgt Umbenennungen)
pub fn versionen(root: &Path, ordner: &str, datei: &str) -> Ergebnis<Vec<Version>> {
    let pfad = format!("{ordner}/{datei}");
    pruefe_pfad(&pfad)?;
    if !ist_eigenes_archiv(root) {
        return Ok(Vec::new());
    }
    // noch keine Sicherung überhaupt? Dann gibt es auch keine Versionen
    if git(root, &["rev-parse", "--verify", "-q", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }
    let aus = git(
        root,
        // literal: Dateinamen wie "Notiz [1].md" nicht als Muster deuten
        &["--literal-pathspecs", "log", "--follow", "-n", "500", "--name-only", "--format=%x1e%H%x1f%cI%x1f%s", "--", &pfad],
    )?;
    let mut liste = Vec::new();
    for block in aus.split('\x1e').filter(|b| !b.trim().is_empty()) {
        let mut zeilen = block.lines();
        let kopf: Vec<&str> = zeilen.next().unwrap_or_default().split('\x1f').collect();
        let pfad_damals = zeilen.find(|z| !z.trim().is_empty()).unwrap_or(&pfad).to_string();
        if let [hash, zeit, nachricht] = kopf.as_slice() {
            liste.push(Version {
                hash: hash.to_string(),
                zeit: zeit.to_string(),
                nachricht: nachricht.to_string(),
                pfad: pfad_damals,
            });
        }
    }
    Ok(liste)
}

/// Inhalt einer Notiz in einer bestimmten Version
pub fn version_lesen(root: &Path, hash: &str, pfad: &str) -> Ergebnis<String> {
    pruefe_hash(hash)?;
    pruefe_pfad(pfad)?;
    if !ist_eigenes_archiv(root) {
        return Err("Kein Sicherungsarchiv gefunden.".into());
    }
    git(root, &["show", &format!("{hash}:{pfad}")])
}

/// Alte Version wiederherstellen: erst den jetzigen Stand sichern (bleibt also auch erhalten),
/// dann die alte Version als neuen Stand schreiben und das wiederum sichern.
pub fn wiederherstellen(root: &Path, ordner: &str, datei: &str, hash: &str, pfad_damals: &str) -> Ergebnis<()> {
    let ziel = format!("{ordner}/{datei}");
    pruefe_pfad(&ziel)?;
    let inhalt = version_lesen(root, hash, pfad_damals)?;
    sichern(root, "Vor Wiederherstellung")?;
    schreibe_atomar(&root.join(&ziel), &inhalt, None)?;
    let kurz = &hash[..7.min(hash.len())];
    sichern(root, &format!("Wiederhergestellt (Version {kurz})"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schule() -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Schule");
        fs::create_dir_all(root.join("LF05-Daten")).unwrap();
        einrichten(&root).unwrap();
        (tmp, root)
    }

    #[test]
    fn sichern_nur_bei_aenderungen() {
        let (_t, root) = schule();
        let n = root.join("LF05-Daten/2026-10-08-SQL-Joins.md");
        fs::write(&n, "# SQL-Joins\n\nv1\n").unwrap();
        assert!(sichern(&root, "Automatische Sicherung").unwrap().id.is_some());
        assert!(sichern(&root, "Automatische Sicherung").unwrap().id.is_none(), "nichts geändert");
        let log = git(&root, &["log", "-1", "--format=%s"]).unwrap();
        assert_eq!(log.trim(), "Automatische Sicherung: LF05: SQL Joins");
        // Temp-Dateien und .DS_Store landen nicht im Archiv
        fs::write(root.join("LF05-Daten/.x.md.1.blockbuch-tmp"), "x").unwrap();
        fs::write(root.join(".DS_Store"), "x").unwrap();
        assert!(sichern(&root, "x").unwrap().id.is_none());
    }

    #[test]
    fn projektordner_mit_eigenem_git_blockieren_nicht() {
        let (_t, root) = schule();
        let projekt = root.join("Projekte/Taschenrechner");
        fs::create_dir_all(&projekt).unwrap();
        git(&projekt, &["init", "-q"]).unwrap(); // leeres Repo ohne Commit – blockierte früher "git add"
        fs::write(projekt.join("Main.java"), "class Main {}").unwrap();
        fs::write(root.join("LF05-Daten/2026-10-08-A.md"), "# A\n").unwrap();
        let g = sichern(&root, "s").unwrap();
        assert!(g.id.is_some(), "Notiz trotzdem gesichert");
        assert!(g.hinweis.unwrap().contains("Projekte/Taschenrechner"));
        let dateien = git(&root, &["ls-files"]).unwrap();
        assert!(dateien.contains("LF05-Daten/2026-10-08-A.md") && !dateien.contains("Main.java"));
    }

    #[test]
    fn alte_sperrdatei_und_geloeschtes_archiv() {
        let (_t, root) = schule();
        fs::write(root.join("LF05-Daten/2026-10-08-A.md"), "# A\n").unwrap();
        // liegengebliebene index.lock, 1 Stunde alt
        let lock = root.join(".git/index.lock");
        fs::write(&lock, "").unwrap();
        let alt = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
        fs::File::options().write(true).open(&lock).unwrap().set_modified(alt).unwrap();
        assert!(sichern(&root, "s").unwrap().id.is_some());
        // Archiv gelöscht → wird neu angelegt statt still nicht mehr zu sichern
        fs::remove_dir_all(root.join(".git")).unwrap();
        assert!(sichern(&root, "s").unwrap().id.is_some());
    }

    #[test]
    fn versionen_ansehen_und_wiederherstellen() {
        let (_t, root) = schule();
        let n = root.join("LF05-Daten/2026-10-08-SQL-Joins.md");
        fs::write(&n, "# SQL-Joins\n\nmeine Mitschrift\n").unwrap();
        sichern(&root, "Sicherung").unwrap();
        fs::write(&n, "# SQL-Joins\n\nversehentlich gelöscht\n").unwrap();
        sichern(&root, "Sicherung").unwrap();

        let v = versionen(&root, "LF05-Daten", "2026-10-08-SQL-Joins.md").unwrap();
        assert_eq!(v.len(), 2);
        let alt = &v[1];
        assert!(version_lesen(&root, &alt.hash, &alt.pfad).unwrap().contains("meine Mitschrift"));

        wiederherstellen(&root, "LF05-Daten", "2026-10-08-SQL-Joins.md", &alt.hash, &alt.pfad).unwrap();
        assert!(fs::read_to_string(&n).unwrap().contains("meine Mitschrift"));
        // Der "falsche" Stand ist nicht verloren – er bleibt als Version erhalten
        let v = versionen(&root, "LF05-Daten", "2026-10-08-SQL-Joins.md").unwrap();
        assert_eq!(v.len(), 3);
        assert!(v[0].nachricht.starts_with("Wiederhergestellt"));
    }

    #[test]
    fn versionen_folgen_umbenennung() {
        let (_t, root) = schule();
        fs::write(root.join("LF05-Daten/2026-10-08-Alt.md"), "# Alt\n\nInhalt der Notiz, lang genug für die Erkennung.\n").unwrap();
        sichern(&root, "s").unwrap();
        fs::rename(root.join("LF05-Daten/2026-10-08-Alt.md"), root.join("LF05-Daten/2026-10-08-Neu.md")).unwrap();
        sichern(&root, "s").unwrap();
        let v = versionen(&root, "LF05-Daten", "2026-10-08-Neu.md").unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!(v[1].pfad, "LF05-Daten/2026-10-08-Alt.md");
        assert!(version_lesen(&root, &v[1].hash, &v[1].pfad).unwrap().contains("Inhalt"));
    }

    #[test]
    fn keine_pfad_oder_befehlstricks() {
        let (_t, root) = schule();
        assert!(version_lesen(&root, "HEAD", "LF05-Daten/a.md").is_err());
        assert!(version_lesen(&root, "abcdef1", "../../etc/passwd").is_err());
        assert!(version_lesen(&root, "abcdef1", "LF05-Daten/../../x.md").is_err());
        assert!(version_lesen(&root, "--output=/tmp/x", "LF05-Daten/a.md").is_err());
        assert!(versionen(&root, "LF05-Daten", "--all").is_err());
    }

    #[test]
    fn leeres_archiv_hat_keine_versionen() {
        let (_t, root) = schule();
        assert!(versionen(&root, "LF05-Daten", "2026-10-08-X.md").unwrap().is_empty());
    }
}
