// Tauri-Befehle: dünne Hüllen um notizen.rs. Die Dateien in ~/Schule sind die einzige
// Quelle der Wahrheit – Claude liest und schreibt dieselben Markdown-Dateien direkt.

mod beobachter;
mod grafik;
mod notizen;
mod pdftext;
mod sicherung;
mod suche;
mod wortschatz;

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

/// Erlaubte Ziele: die App selbst, Grafiken (grafik://), leere Rahmen – sonst nichts.
/// `entwicklung`: im Entwicklungsmodus läuft die Oberfläche auf http://localhost:1420.
fn navigation_erlaubt_fuer(url: &tauri::Url, entwicklung: bool) -> bool {
    match url.scheme() {
        "tauri" | "grafik" | "about" | "blob" | "data" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost" | "grafik.localhost") => true,
            Some("localhost") => entwicklung,
            _ => false,
        },
        _ => false,
    }
}

fn navigation_erlaubt(url: &tauri::Url) -> bool {
    navigation_erlaubt_fuer(url, cfg!(dev))
}

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

/// Rohdaten einer Datei (Bild/PDF) speichern – Bytes kommen direkt als Body, Ordner und Name als Header
#[tauri::command]
async fn asset_speichern(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Ergebnis<String> {
    let kopf = |name: &str| -> Ergebnis<String> {
        let wert = request.headers().get(name).and_then(|w| w.to_str().ok()).ok_or(format!("{name} fehlt"))?;
        Ok(percent_encoding::percent_decode_str(wert).decode_utf8_lossy().into_owned())
    };
    let tauri::ipc::InvokeBody::Raw(inhalt) = request.body() else {
        return Err("Erwartet Dateiinhalt als Rohdaten.".into());
    };
    let root = schule_pfad(&app)?;
    let ordner = kopf("ordner")?;
    let pfad = notizen::asset_speichern(&root, &ordner, &kopf("name")?, inhalt)?;
    // PDF: Text im Hintergrund als .txt daneben legen (Suche, Claude)
    if pfad.to_lowercase().ends_with(".pdf") {
        let pdf = root.join(&ordner).join(&pfad);
        std::thread::spawn(move || {
            if let Err(e) = pdftext::txt_erzeugen(&pdf) {
                eprintln!("[blockbuch] {e}");
            }
        });
    }
    Ok(pfad)
}

#[tauri::command]
async fn asset_lesen(app: tauri::AppHandle, ordner: String, pfad: String) -> Ergebnis<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(notizen::asset_lesen(&schule_pfad(&app)?, &ordner, &pfad)?))
}

/// PDF/Bild in der Mac-App „Vorschau“ öffnen (zum Markieren, Unterschreiben, Drucken)
#[tauri::command]
async fn in_vorschau_oeffnen(app: tauri::AppHandle, ordner: String, pfad: String) -> Ergebnis<()> {
    let datei = notizen::asset_pfad(&schule_pfad(&app)?, &ordner, &pfad)?;
    std::process::Command::new("open")
        .arg("-a")
        .arg("Preview")
        .arg(datei)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Wörter aus Notizen und PDFs für die Wortvorschläge beim Tippen
#[tauri::command]
async fn wortschatz(app: tauri::AppHandle) -> Ergebnis<Vec<wortschatz::Wort>> {
    Ok(wortschatz::sammeln(&schule_pfad(&app)?))
}

/// Volltextsuche (leere Anfrage: zuletzt bearbeitete Notizen)
#[tauri::command]
async fn suchen(app: tauri::AppHandle, anfrage: String) -> Ergebnis<Vec<suche::Treffer>> {
    Ok(suche::suchen(&schule_pfad(&app)?, &anfrage, 50))
}

#[tauri::command]
async fn versionen(app: tauri::AppHandle, ordner: String, datei: String) -> Ergebnis<Vec<sicherung::Version>> {
    sicherung::versionen(&schule_pfad(&app)?, &ordner, &datei)
}

#[tauri::command]
async fn version_lesen(app: tauri::AppHandle, hash: String, pfad: String) -> Ergebnis<String> {
    sicherung::version_lesen(&schule_pfad(&app)?, &hash, &pfad)
}

#[tauri::command]
async fn version_wiederherstellen(
    app: tauri::AppHandle,
    ordner: String,
    datei: String,
    hash: String,
    pfad: String,
) -> Ergebnis<()> {
    let root = schule_pfad(&app)?;
    sicherung::wiederherstellen(&root, &ordner, &datei, &hash, &pfad)?;
    melde_sicherung(&app, &root, None, None);
    Ok(())
}

/// Jetzt sichern (⌘S, und vor dem Öffnen der Versionen)
#[tauri::command]
async fn jetzt_sichern(app: tauri::AppHandle) -> Ergebnis<Option<String>> {
    let root = schule_pfad(&app)?;
    let r = sicherung::sichern(&root, "Manuelle Sicherung");
    melde(&app, &root, &r);
    r.map(|g| g.id)
}

fn melde(app: &tauri::AppHandle, root: &std::path::Path, r: &Ergebnis<sicherung::Gesichert>) {
    match r {
        Ok(g) => melde_sicherung(app, root, None, g.hinweis.clone()),
        Err(e) => melde_sicherung(app, root, Some(e.clone()), None),
    }
}

/// Teilt der Oberfläche den Stand der letzten Sicherung mit (Zeit, Fehler, Hinweis)
fn melde_sicherung(app: &tauri::AppHandle, root: &std::path::Path, fehler: Option<String>, hinweis: Option<String>) {
    let zeit = sicherung::letzte_sicherung(root);
    // iCloud verträgt sich nicht mit Git-Archiven (Duplikate, ausgelagerte Dateien)
    let icloud = root
        .canonicalize()
        .is_ok_and(|p| p.to_string_lossy().contains("Mobile Documents"))
        .then(|| "~/Schule liegt in iCloud – das kann das Sicherungsarchiv beschädigen.".to_string());
    let hinweis = [hinweis, icloud].into_iter().flatten().collect::<Vec<_>>().join(" · ");
    let _ = app.emit(
        "sicherung",
        serde_json::json!({ "zeit": zeit, "fehler": fehler, "hinweis": (!hinweis.is_empty()).then_some(hinweis) }),
    );
}

const SICHERUNG_ALLE: Duration = Duration::from_secs(5 * 60);

/// Hintergrund: Archiv einrichten, beim Start und dann alle 5 Minuten sichern
fn sicherung_starten(app: tauri::AppHandle, root: PathBuf) {
    std::thread::spawn(move || {
        if let Err(e) = sicherung::einrichten(&root) {
            eprintln!("[blockbuch] Sicherung nicht verfügbar: {e}");
            melde_sicherung(&app, &root, Some(e), None);
            return;
        }
        let mut grund = "Beim Start";
        loop {
            let r = sicherung::sichern(&root, grund);
            if let Err(e) = &r {
                eprintln!("[blockbuch] Sicherung fehlgeschlagen: {e}");
            }
            melde(&app, &root, &r);
            grund = "Automatische Sicherung";
            std::thread::sleep(SICHERUNG_ALLE);
        }
    });
}

/// Von der Oberfläche aufgerufen, nachdem alles gesichert ist
#[tauri::command]
fn beenden(app: tauri::AppHandle) {
    eprintln!("[blockbuch] Oberfläche hat gesichert – beende");
    // Letzte Sicherung ins Archiv (kurz, nur wenn sich etwas geändert hat)
    if let Ok(root) = schule_pfad(&app) {
        if let Err(e) = sicherung::sichern(&root, "Beim Beenden") {
            eprintln!("[blockbuch] Sicherung beim Beenden fehlgeschlagen: {e}");
        }
    }
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

/// Rechtschreibprüfung beim Tippen (rote Unterstreichung). WebKit liest die Einstellung beim Start aus
/// den App-Einstellungen; in eigenen Apps ist sie anders als in Safari standardmäßig aus.
/// Nur setzen, wenn noch nichts eingestellt ist – eine bewusste Entscheidung bleibt erhalten.
#[cfg(target_os = "macos")]
fn rechtschreibung_einschalten() {
    use objc2_foundation::{NSString, NSUserDefaults};
    let einstellungen = NSUserDefaults::standardUserDefaults();
    let schluessel = NSString::from_str("WebContinuousSpellCheckingEnabled");
    if einstellungen.objectForKey(&schluessel).is_none() {
        einstellungen.setBool_forKey(true, &schluessel);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    rechtschreibung_einschalten();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Navigationsschutz: weder App noch Grafik-Rahmen dürfen zu fremden Seiten wechseln
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigationsschutz")
                .on_navigation(|_webview, url| navigation_erlaubt(url))
                .build(),
        )
        // Animierte Grafiken aus <Ordner>/assets/ – abgeschottet, siehe grafik.rs
        .register_uri_scheme_protocol(grafik::SCHEMA, |ctx, request| match schule_pfad(ctx.app_handle()) {
            Ok(root) => grafik::http_antwort(&root, &request),
            Err(_) => tauri::http::Response::builder().status(500).body(Vec::new()).unwrap_or_default(),
        })
        .invoke_handler(tauri::generate_handler![
            schule_oeffnen,
            ordner_erstellen,
            ordner_auflisten,
            notizen_auflisten,
            notiz_lesen,
            notiz_speichern,
            notiz_konfliktkopie,
            asset_speichern,
            asset_lesen,
            in_vorschau_oeffnen,
            suchen,
            wortschatz,
            versionen,
            version_lesen,
            version_wiederherstellen,
            jetzt_sichern,
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
            if let Err(e) = std::fs::create_dir_all(&root) {
                eprintln!("[blockbuch] ~/Schule konnte nicht angelegt werden: {e}");
            }
            sicherung_starten(h.clone(), root.clone());
            // PDFs ohne .txt (ältere, oder von Claude abgelegt) nachträglich auslesen
            let root_pdf = root.clone();
            std::thread::spawn(move || {
                let n = pdftext::fehlende_erzeugen(&root_pdf);
                if n > 0 {
                    eprintln!("[blockbuch] Text für {n} PDF(s) nachträglich ausgelesen");
                }
            });
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
            // Ablage/Darstellung als echte Menüpunkte: Kürzel wirken auch, wenn eine Grafik den Fokus hat
            let ablage = SubmenuBuilder::new(h, "Ablage")
                .item(&MenuItemBuilder::with_id("neue-notiz", "Neue Notiz").accelerator("CmdOrCtrl+N").build(h)?)
                .item(&MenuItemBuilder::with_id("suchen", "Suchen …").accelerator("CmdOrCtrl+K").build(h)?)
                .separator()
                .item(&MenuItemBuilder::with_id("sichern", "Jetzt sichern").accelerator("CmdOrCtrl+S").build(h)?)
                .item(
                    &MenuItemBuilder::with_id("versionen", "Versionen dieser Notiz …")
                        .accelerator("CmdOrCtrl+Shift+H")
                        .build(h)?,
                )
                .build()?;
            let darstellung = SubmenuBuilder::new(h, "Darstellung")
                .item(
                    &MenuItemBuilder::with_id("ordner-leiste", "Ordner-Leiste ein-/ausblenden")
                        .accelerator("CmdOrCtrl+Alt+S")
                        .build(h)?,
                )
                .build()?;
            let fenster = SubmenuBuilder::new(h, "Fenster").minimize().close_window().build()?;
            app.set_menu(
                MenuBuilder::new(h)
                    .items(&[&app_menue, &ablage, &bearbeiten, &darstellung, &fenster])
                    .build()?,
            )?;
            Ok(())
        })
        .on_menu_event(|app, ereignis| {
            match ereignis.id().as_ref() {
                "beenden" => beenden_anfragen(app),
                // alle anderen Menüpunkte erledigt die Oberfläche
                id => {
                    let _ = app.emit("menue", id);
                }
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

#[cfg(test)]
mod tests {
    use super::navigation_erlaubt_fuer as erlaubt;

    #[test]
    fn navigation_nur_zur_app_und_zu_grafiken() {
        let u = |s: &str| tauri::Url::parse(s).unwrap();
        assert!(erlaubt(&u("tauri://localhost/"), false));
        assert!(erlaubt(&u("grafik://localhost/LF05/assets/a.html"), false));
        assert!(erlaubt(&u("about:blank"), false));
        assert!(erlaubt(&u("http://localhost:1420/"), true));
        assert!(!erlaubt(&u("http://localhost:1420/"), false));
        assert!(!erlaubt(&u("https://boese.example/?daten=geheim"), true));
        assert!(!erlaubt(&u("file:///Users/x/Schule/LF05/notiz.md"), true));
        assert!(!erlaubt(&u("https://localhost.boese.example/"), true));
    }
}
