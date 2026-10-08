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

const GITIGNORE: &str = "# Von Blockbuch angelegt\n.DS_Store\n*.blockbuch-tmp\n.claude/settings.local.json\n";

#[derive(Serialize, Debug, Clone)]
pub struct Version {
    pub hash: String,
    /// ISO-Zeitpunkt der Sicherung
    pub zeit: String,
    pub nachricht: String,
    /// Pfad der Notiz zu diesem Zeitpunkt (kann sich durch Umbenennen geändert haben)
    pub pfad: String,
}

fn git(root: &Path, args: &[&str]) -> Ergebnis<String> {
    let aus = Command::new("git")
        .arg("-C")
        .arg(root)
        // Umlaute in Pfaden nicht als \303\244 ausgeben
        .args(["-c", "core.quotepath=false"])
        .args(args)
        .output()
        .map_err(|_| "git ist nicht installiert (Xcode-Befehlszeilenwerkzeuge).".to_string())?;
    if !aus.status.success() {
        return Err(format!("git {}: {}", args.first().unwrap_or(&""), String::from_utf8_lossy(&aus.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&aus.stdout).into_owned())
}

/// Legt das Git-Archiv an (falls nötig). Eigene Identität nur für dieses Archiv – ändert nichts am Rest des Macs.
pub fn einrichten(root: &Path) -> Ergebnis<()> {
    let _sperre = SPERRE.lock().unwrap_or_else(|e| e.into_inner());
    if !root.join(".git").exists() {
        git(root, &["init", "-q", "-b", "main"])?;
    }
    // Blockbuch als Autor der automatischen Sicherungen (nur in diesem Archiv)
    git(root, &["config", "user.name", "Blockbuch"])?;
    git(root, &["config", "user.email", "blockbuch@localhost"])?;
    let gitignore = root.join(".gitignore");
    if !gitignore.exists() {
        fs::write(&gitignore, GITIGNORE).map_err(|e| e.to_string())?;
    }
    Ok(())
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

/// Sichert alle Änderungen. Gibt die Kurz-ID der Sicherung zurück – oder None, wenn nichts geändert war.
pub fn sichern(root: &Path, grund: &str) -> Ergebnis<Option<String>> {
    if !root.join(".git").exists() {
        return Ok(None);
    }
    let _sperre = SPERRE.lock().unwrap_or_else(|e| e.into_inner());
    git(root, &["add", "-A"])?;
    let geaendert = git(root, &["diff", "--cached", "--name-status"])?;
    if geaendert.trim().is_empty() {
        return Ok(None);
    }
    let was = beschreibung(&geaendert);
    let nachricht = if was.is_empty() { grund.to_string() } else { format!("{grund}: {was}") };
    // Globale Einstellungen des Nutzers (Signatur, Hooks) sollen die automatische Sicherung nicht blockieren
    git(root, &["-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", &nachricht])?;
    Ok(Some(git(root, &["rev-parse", "--short", "HEAD"])?.trim().to_string()))
}

/// Zeitpunkt der letzten Sicherung (ISO), falls es schon eine gibt
pub fn letzte_sicherung(root: &Path) -> Option<String> {
    let _sperre = SPERRE.lock().unwrap_or_else(|e| e.into_inner());
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
    if !root.join(".git").exists() {
        return Ok(Vec::new());
    }
    // noch keine Sicherung überhaupt? Dann gibt es auch keine Versionen
    if git(root, &["rev-parse", "--verify", "-q", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }
    let aus = git(
        root,
        &["log", "--follow", "-n", "200", "--name-only", "--format=%x1e%H%x1f%cI%x1f%s", "--", &pfad],
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
        assert!(sichern(&root, "Automatische Sicherung").unwrap().is_some());
        assert!(sichern(&root, "Automatische Sicherung").unwrap().is_none(), "nichts geändert");
        let log = git(&root, &["log", "-1", "--format=%s"]).unwrap();
        assert_eq!(log.trim(), "Automatische Sicherung: LF05: SQL Joins");
        // Temp-Dateien und .DS_Store landen nicht im Archiv
        fs::write(root.join("LF05-Daten/.x.md.1.blockbuch-tmp"), "x").unwrap();
        fs::write(root.join(".DS_Store"), "x").unwrap();
        assert!(sichern(&root, "x").unwrap().is_none());
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
