// Tauri-Befehle: dünne Hüllen um notizen.rs. Die Dateien in ~/Schule sind die einzige
// Quelle der Wahrheit – Claude liest und schreibt dieselben Markdown-Dateien direkt.

mod notizen;

use notizen::{Ergebnis, NotizInfo, NotizInhalt};
use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize)]
struct SchuleInfo {
    pfad: String,
    ordner: Vec<String>,
}

fn schule_pfad(app: &tauri::AppHandle) -> Ergebnis<PathBuf> {
    Ok(app.path().home_dir().map_err(|e| e.to_string())?.join("Schule"))
}

// async: läuft nicht auf dem Haupt-Thread, die Oberfläche bleibt flüssig
#[tauri::command]
async fn schule_oeffnen(app: tauri::AppHandle, standard_ordner: Vec<String>) -> Ergebnis<SchuleInfo> {
    let root = schule_pfad(&app)?;
    let ordner = notizen::schule_oeffnen(&root, &standard_ordner)?;
    Ok(SchuleInfo { pfad: root.to_string_lossy().into_owned(), ordner })
}

#[tauri::command]
async fn ordner_erstellen(app: tauri::AppHandle, name: String) -> Ergebnis<Vec<String>> {
    notizen::ordner_erstellen(&schule_pfad(&app)?, &name)
}

#[tauri::command]
async fn notizen_auflisten(app: tauri::AppHandle, ordner: String) -> Ergebnis<Vec<NotizInfo>> {
    notizen::notizen_auflisten(&schule_pfad(&app)?, &ordner)
}

#[tauri::command]
async fn notiz_lesen(app: tauri::AppHandle, ordner: String, datei: String) -> Ergebnis<NotizInhalt> {
    notizen::notiz_lesen(&schule_pfad(&app)?, &ordner, &datei)
}

#[tauri::command]
async fn notiz_speichern(
    app: tauri::AppHandle,
    ordner: String,
    datei: String,
    inhalt: String,
    erwartet: Option<u64>,
) -> Ergebnis<u64> {
    notizen::notiz_speichern(&schule_pfad(&app)?, &ordner, &datei, &inhalt, erwartet)
}

#[tauri::command]
async fn notiz_erstellen(
    app: tauri::AppHandle,
    ordner: String,
    lernfeld: Option<String>,
    titel: String,
    datum: String,
) -> Ergebnis<NotizInfo> {
    notizen::notiz_erstellen(&schule_pfad(&app)?, &ordner, lernfeld.as_deref(), &titel, &datum)
}

#[tauri::command]
async fn notiz_umbenennen(app: tauri::AppHandle, ordner: String, datei: String, titel: String) -> Ergebnis<NotizInfo> {
    notizen::notiz_umbenennen(&schule_pfad(&app)?, &ordner, &datei, &titel)
}

#[tauri::command]
async fn notiz_loeschen(app: tauri::AppHandle, ordner: String, datei: String) -> Ergebnis<()> {
    notizen::notiz_loeschen(&schule_pfad(&app)?, &ordner, &datei)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            schule_oeffnen,
            ordner_erstellen,
            notizen_auflisten,
            notiz_lesen,
            notiz_speichern,
            notiz_erstellen,
            notiz_umbenennen,
            notiz_loeschen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
