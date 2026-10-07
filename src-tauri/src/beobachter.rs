// Beobachtet ~/Schule und meldet Änderungen an die Oberfläche – z. B. wenn Claude eine Notiz
// schreibt, umbenennt oder löscht. Die Oberfläche liest dann selbst nach, was sich geändert hat.

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

/// Ereignis an die Oberfläche, Inhalt: Liste von `Aenderung`
pub const SCHULE_GEAENDERT: &str = "schule-geaendert";

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Aenderung {
    /// Betroffener Ordner (None = Ordnerliste selbst)
    pub ordner: Option<String>,
    /// Betroffene Notiz im Ordner (None = irgendetwas im Ordner, z. B. assets/)
    pub datei: Option<String>,
}

/// Hält den Beobachter am Leben, solange die App läuft
pub struct Beobachter(#[allow(dead_code)] pub Mutex<Debouncer<RecommendedWatcher>>);

/// Ordnet einen geänderten Pfad ein. `None` = uninteressant (versteckt, Temp-Datei, Datei direkt in ~/Schule).
pub fn einordnen(root: &Path, pfad: &Path) -> Option<Aenderung> {
    let rel = pfad.strip_prefix(root).ok()?;
    let teile: Vec<&str> = rel.components().filter_map(|c| c.as_os_str().to_str()).collect();
    // .git, .DS_Store, eigene Temp-Dateien (.name.md.123.blockbuch-tmp) usw.
    if teile.iter().any(|t| t.starts_with('.')) {
        return None;
    }
    match teile.as_slice() {
        [] => Some(Aenderung { ordner: None, datei: None }),
        // Dateien direkt in ~/Schule (z. B. CLAUDE.md) gehören zu keinem Ordner
        [name] if name.contains('.') && !pfad.is_dir() => None,
        [ordner] => Some(Aenderung { ordner: Some((*ordner).to_string()), datei: None }),
        [ordner, datei] if datei.ends_with(".md") => Some(Aenderung {
            ordner: Some((*ordner).to_string()),
            datei: Some((*datei).to_string()),
        }),
        [ordner, ..] => Some(Aenderung { ordner: Some((*ordner).to_string()), datei: None }),
    }
}

pub fn starten(app: tauri::AppHandle, root: PathBuf) -> Result<Beobachter, String> {
    beobachten(root, move |aenderungen| {
        let _ = app.emit(SCHULE_GEAENDERT, aenderungen);
    })
}

/// Beobachtet `root` und ruft `melden` mit gesammelten Änderungen auf (alle 200 ms höchstens einmal)
fn beobachten(root: PathBuf, melden: impl Fn(Vec<Aenderung>) + Send + 'static) -> Result<Beobachter, String> {
    // macOS meldet echte Pfade (Symlinks aufgelöst, z. B. bei iCloud) – also auch so vergleichen
    let root = root.canonicalize().unwrap_or(root);
    let root_kopie = root.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(200), move |ergebnis: DebounceEventResult| {
        let Ok(ereignisse) = ergebnis else { return };
        let mut aenderungen: Vec<Aenderung> = Vec::new();
        for e in ereignisse {
            if let Some(a) = einordnen(&root_kopie, &e.path) {
                if !aenderungen.contains(&a) {
                    aenderungen.push(a);
                }
            }
        }
        if !aenderungen.is_empty() {
            melden(aenderungen);
        }
    })
    .map_err(|e| e.to_string())?;
    debouncer.watcher().watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    Ok(Beobachter(Mutex::new(debouncer)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a(ordner: Option<&str>, datei: Option<&str>) -> Option<Aenderung> {
        Some(Aenderung { ordner: ordner.map(String::from), datei: datei.map(String::from) })
    }

    #[test]
    fn pfade_werden_richtig_eingeordnet() {
        let root = Path::new("/Users/x/Schule");
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule/LF05/2026-10-07-Joins.md")), a(Some("LF05"), Some("2026-10-07-Joins.md")));
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule/LF05")), a(Some("LF05"), None));
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule/LF05/assets/bild.png")), a(Some("LF05"), None));
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule")), a(None, None));
    }

    #[test]
    fn echte_dateiaenderungen_werden_gemeldet() {
        let tmp = tempfile::tempdir().unwrap();
        // bewusst NICHT kanonisiert (/var/… statt /private/var/…) – beobachten() muss das selbst lösen
        let root = tmp.path().join("Schule");
        std::fs::create_dir_all(root.join("LF05")).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let _b = beobachten(root.clone(), move |a| {
            let _ = tx.send(a);
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(300));

        // wie Claude: Datei schreiben, auch über eine versteckte Temp-Datei
        std::fs::write(root.join("LF05/.x.md.1.blockbuch-tmp"), "tmp").unwrap();
        std::fs::write(root.join("LF05/2026-10-07-Neu.md"), "# Neu").unwrap();

        let mut gesehen = Vec::new();
        let ende = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < ende {
            if let Ok(a) = rx.recv_timeout(Duration::from_millis(200)) {
                gesehen.extend(a);
                if gesehen.iter().any(|a| a.datei.as_deref() == Some("2026-10-07-Neu.md")) {
                    break;
                }
            }
        }
        assert!(
            gesehen.iter().any(|a| a.ordner.as_deref() == Some("LF05") && a.datei.as_deref() == Some("2026-10-07-Neu.md")),
            "Änderung nicht gemeldet: {gesehen:?}"
        );
        assert!(gesehen.iter().all(|a| !a.datei.as_deref().unwrap_or("").contains("blockbuch-tmp")));
    }

    #[test]
    fn unwichtiges_wird_ignoriert() {
        let root = Path::new("/Users/x/Schule");
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule/LF05/.2026-10-07-Joins.md.123.blockbuch-tmp")), None);
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule/.git/index")), None);
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule/LF05/.DS_Store")), None);
        assert_eq!(einordnen(root, Path::new("/Users/x/Schule/CLAUDE.md")), None);
        assert_eq!(einordnen(root, Path::new("/anderswo/datei.md")), None);
    }
}
