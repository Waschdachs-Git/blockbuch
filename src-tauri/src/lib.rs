// Tauri-Befehle: dünne Hüllen um notizen.rs. Die Dateien in ~/Schule sind die einzige
// Quelle der Wahrheit – Claude liest und schreibt dieselben Markdown-Dateien direkt.

mod beobachter;
mod notizen;

use notizen::{Ergebnis, NotizInfo, NotizInhalt};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

/// Erst wenn die Oberfläche alles gesichert hat (oder die Frist abgelaufen ist), darf die App beenden.
static BEENDEN_ERLAUBT: AtomicBool = AtomicBool::new(false);
/// Ereignis an die Oberfläche: "Bitte jetzt alles sichern, dann `beenden` aufrufen"
const BEENDEN_ANGEFRAGT: &str = "beenden-angefragt";

fn beenden_anfragen(app: &tauri::AppHandle) {
    eprintln!("[blockbuch] Beenden angefragt – Oberfläche sichert");
    let _ = app.emit(BEENDEN_ANGEFRAGT, ());
    // Sicherheitsnetz: hängt die Oberfläche, trotzdem nach 3 s beenden
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        eprintln!("[blockbuch] Frist abgelaufen – beende ohne Rückmeldung der Oberfläche");
        BEENDEN_ERLAUBT.store(true, Ordering::SeqCst);
        app.exit(0);
    });
}

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
async fn ordner_auflisten(app: tauri::AppHandle) -> Ergebnis<Vec<String>> {
    notizen::ordner_liste(&schule_pfad(&app)?)
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
async fn notiz_konfliktkopie(
    app: tauri::AppHandle,
    ordner: String,
    datei: String,
    inhalt: String,
    uhrzeit: String,
) -> Ergebnis<String> {
    notizen::notiz_konfliktkopie(&schule_pfad(&app)?, &ordner, &datei, &inhalt, &uhrzeit)
}

/// Von der Oberfläche aufgerufen, nachdem alles gesichert ist
#[tauri::command]
fn beenden(app: tauri::AppHandle) {
    eprintln!("[blockbuch] Oberfläche hat gesichert – beende");
    BEENDEN_ERLAUBT.store(true, Ordering::SeqCst);
    app.exit(0);
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
            ordner_auflisten,
            notizen_auflisten,
            notiz_lesen,
            notiz_speichern,
            notiz_konfliktkopie,
            beenden,
            notiz_erstellen,
            notiz_umbenennen,
            notiz_loeschen
        ])
        // Eigenes Menü: ⌘Q läuft über "beenden_anfragen" statt macOS direkt beenden zu lassen
        // (das Standard-"Beenden" schließt die App sofort, ohne dass die Oberfläche speichern kann)
        .setup(|app| {
            let h = app.handle();

            // ~/Schule beobachten, damit Änderungen von Claude sofort sichtbar werden
            let root = schule_pfad(h)?;
            std::fs::create_dir_all(&root)?;
            match beobachter::starten(h.clone(), root) {
                Ok(b) => {
                    app.manage(b);
                }
                Err(e) => eprintln!("[blockbuch] Dateiüberwachung konnte nicht starten: {e}"),
            }

            let beenden = MenuItemBuilder::with_id("beenden", "Blockbuch beenden")
                .accelerator("CmdOrCtrl+Q")
                .build(h)?;
            let app_menue = SubmenuBuilder::new(h, "Blockbuch")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .item(&beenden)
                .build()?;
            let bearbeiten = SubmenuBuilder::new(h, "Bearbeiten")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let fenster = SubmenuBuilder::new(h, "Fenster").minimize().close_window().build()?;
            app.set_menu(MenuBuilder::new(h).items(&[&app_menue, &bearbeiten, &fenster]).build()?)?;
            Ok(())
        })
        .on_menu_event(|app, ereignis| {
            if ereignis.id() == "beenden" {
                beenden_anfragen(app);
            }
        })
        // Fenster schließen (roter Knopf, ⌘W): erst sichern lassen
        .on_window_event(|fenster, ereignis| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = ereignis {
                if !BEENDEN_ERLAUBT.load(Ordering::SeqCst) {
                    api.prevent_close();
                    beenden_anfragen(fenster.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // ⌘Q / Beenden aus dem Menü oder Dock: ebenfalls erst sichern lassen
        .run(|app, ereignis| {
            if let tauri::RunEvent::ExitRequested { api, .. } = ereignis {
                if !BEENDEN_ERLAUBT.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    beenden_anfragen(app);
                }
            }
        });
}
