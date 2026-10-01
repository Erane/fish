mod desktop;
mod input;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_single_instance::init as single_instance;

const WALLPAPER: &str = "wallpaper";
const POND: &str = "pond";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Interaction {
    Feed,
    Startle,
    Watch,
}

pub(crate) fn log(msg: &str) {
    use std::sync::Mutex;
    static LAST: Mutex<Option<String>> = Mutex::new(None);
    if LAST.lock().map(|l| l.as_deref() == Some(msg)).unwrap_or(false) {
        return;
    }
    if let Ok(mut last) = LAST.lock() {
        *last = Some(msg.to_string());
    }
    eprintln!("{msg}");
    if let Some(dir) = std::env::var_os("LOCALAPPDATA") {
        let dir = std::path::PathBuf::from(dir).join("zhiyu");
        if std::fs::create_dir_all(&dir).is_ok() {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .append(true)
                .create(true)
                .open(dir.join("shell.log"))
            {
                use std::io::Write;
                let _ = writeln!(f, "[{stamp}] {msg}");
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(single_instance(|app, _, _| {
            if let Some(win) = app.get_webview_window(POND) {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![set_wallpaper_mode])
        .setup(|app| {
            let handle = app.handle().clone();
            ensure_autostart(&handle);
            spawn_wallpaper(&handle);
            input::spawn(handle.clone());
            spawn_guard(handle.clone());
            build_tray(&handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("知鱼外壳启动失败");
}

fn next_wallpaper_label(app: &AppHandle) -> String {
    let mut n = 0u32;
    loop {
        let label = if n == 0 {
            WALLPAPER.to_string()
        } else {
            format!("{WALLPAPER}-{n}")
        };
        if app.get_webview_window(&label).is_none() {
            return label;
        }
        n += 1;
    }
}

fn spawn_wallpaper(app: &AppHandle) -> bool {
    let label = next_wallpaper_label(app);
    log(&format!(
        "创建壁纸窗口 {label} v{}",
        app.package_info().version
    ));
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("知鱼")
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .additional_browser_args(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required",
        )
        .build();
    match built {
        Ok(win) => match desktop::attach(&win) {
            Ok(()) => {
                let _ = win.show();
                desktop::sink(&win);
                true
            }
            Err(err) => {
                log(&format!("壁纸挂载失败，等待桌面壁纸层可用: {err}"));
                false
            }
        },
        Err(err) => {
            log(&format!("壁纸窗口创建失败: {err:?}"));
            false
        }
    }
}

fn refresh_tray(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("zhiyu") {
        let _ = tray.set_visible(false);
        let _ = tray.set_visible(true);
    }
}

fn spawn_guard(app: AppHandle) {
    std::thread::spawn(move || {
        let mut fails = 0u32;
        loop {
            std::thread::sleep(if fails > 4 {
                Duration::from_secs(10)
            } else {
                Duration::from_secs(2)
            });
            let mut dead = Vec::new();
            let mut alive: Option<WebviewWindow> = None;
            for (label, win) in app.webview_windows() {
                if !label.starts_with(WALLPAPER) {
                    continue;
                }
                match desktop::health(&win) {
                    desktop::Health::Dead => dead.push(win),
                    _ => {
                        if alive.is_none() {
                            alive = Some(win);
                        } else {
                            dead.push(win);
                        }
                    }
                }
            }
            match alive {
                Some(win) => {
                    for w in dead {
                        let _ = w.destroy();
                    }
                    match desktop::health(&win) {
                        desktop::Health::Detached => match desktop::attach(&win) {
                            Ok(()) => {
                                fails = 0;
                                let _ = win.show();
                                desktop::sink(&win);
                                refresh_tray(&app);
                            }
                            Err(_) => fails += 1,
                        },
                        _ => fails = 0,
                    }
                }
                None => {
                    for w in dead {
                        let _ = w.destroy();
                    }
                    log("守护: 无存活壁纸窗口，重建");
                    if spawn_wallpaper(&app) {
                        fails = 0;
                        refresh_tray(&app);
                    } else {
                        fails += 1;
                    }
                }
            }
        }
    });
}

fn open_pond(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(POND) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    match WebviewWindowBuilder::new(app, POND, WebviewUrl::App("index.html".into()))
        .title("知鱼")
        .min_inner_size(360.0, 560.0)
        .inner_size(1180.0, 780.0)
        .build()
    {
        Ok(win) => {
            let _ = app.emit("pond-state", true);
            let handle = app.clone();
            win.on_window_event(move |event| {
                if matches!(event, WindowEvent::Destroyed) {
                    let _ = handle.emit("pond-state", false);
                }
            });
        }
        Err(err) => log(&format!("池塘窗口创建失败: {err:?}")),
    }
}

struct TrayMenu {
    feed: CheckMenuItem<tauri::Wry>,
    startle: CheckMenuItem<tauri::Wry>,
    watch: CheckMenuItem<tauri::Wry>,
    auto: CheckMenuItem<tauri::Wry>,
}

impl TrayMenu {
    fn set_mode(&self, mode: Interaction) {
        let _ = self.feed.set_checked(mode == Interaction::Feed);
        let _ = self.startle.set_checked(mode == Interaction::Startle);
        let _ = self.watch.set_checked(mode == Interaction::Watch);
    }
}

fn build_tray(app: &AppHandle) {
    let open = MenuItem::with_id(app, "open", "打开池塘", true, None::<&str>);
    let respawn = MenuItem::with_id(app, "respawn", "重新投放鱼群", true, None::<&str>);
    let mode = Submenu::with_id(app, "mode", "交互模式", true);
    let feed = CheckMenuItem::with_id(app, "mode-feed", "喂鱼", true, true, None::<&str>);
    let startle = CheckMenuItem::with_id(app, "mode-startle", "惊扰", true, false, None::<&str>);
    let watch = CheckMenuItem::with_id(app, "mode-watch", "观鱼", true, false, None::<&str>);
    let auto = CheckMenuItem::with_id(
        app,
        "auto",
        "开机自启",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    );
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>);
    let (Ok(open), Ok(respawn), Ok(mode), Ok(feed), Ok(startle), Ok(watch), Ok(auto), Ok(quit)) =
        (open, respawn, mode, feed, startle, watch, auto, quit)
    else {
        return;
    };
    let _ = mode.append_items(&[&feed, &startle, &watch]);
    let Ok(menu) = Menu::with_items(app, &[&open, &respawn, &mode, &auto, &quit]) else {
        return;
    };
    app.manage(TrayMenu {
        feed,
        startle,
        watch,
        auto,
    });
    let _ = TrayIconBuilder::with_id("zhiyu")
        .icon(app.default_window_icon().expect("图标缺失").clone())
        .tooltip("知鱼 · 池塘壁纸")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => open_pond(app),
            "respawn" => {
                let _ = app.emit("respawn-fish", true);
            }
            "mode-feed" => change_mode(app, Interaction::Feed),
            "mode-startle" => change_mode(app, Interaction::Startle),
            "mode-watch" => change_mode(app, Interaction::Watch),
            "auto" => toggle_autostart(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                open_pond(tray.app_handle());
            }
        })
        .build(app);
}

fn change_mode(app: &AppHandle, mode: Interaction) {
    input::set_enabled(mode != Interaction::Watch);
    if let Some(tray) = app.try_state::<TrayMenu>() {
        tray.set_mode(mode);
    }
    let _ = app.emit("interaction-changed", mode);
}

fn toggle_autostart(app: &AppHandle) {
    let manager = app.autolaunch();
    let on = if manager.is_enabled().unwrap_or(false) {
        let _ = manager.disable();
        false
    } else {
        let _ = manager.enable();
        true
    };
    if let Some(tray) = app.try_state::<TrayMenu>() {
        let _ = tray.auto.set_checked(on);
    }
}

fn ensure_autostart(app: &AppHandle) {
    let manager = app.autolaunch();
    if !manager.is_enabled().unwrap_or(false) {
        let _ = manager.enable();
    }
}

#[tauri::command]
fn set_wallpaper_mode(app: AppHandle, mode: Interaction) {
    change_mode(&app, mode);
}
