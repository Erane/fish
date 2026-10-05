use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetAncestor, GetMessageW, GetWindowRect, PostThreadMessageW, SetWindowsHookExW,
    UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_LBUTTONDOWN,
    WM_QUIT,
};

use crate::desktop::class_is;

static APP: OnceLock<AppHandle> = OnceLock::new();
static ENABLED: AtomicBool = AtomicBool::new(false);
static THREAD: AtomicU32 = AtomicU32::new(0);
static LOGGED: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone, Copy)]
pub struct WallpaperInput {
    pub x: i32,
    pub y: i32,
}

pub fn set_enabled(on: bool) {
    if ENABLED.swap(on, Ordering::AcqRel) && !on {
        let tid = THREAD.load(Ordering::Acquire);
        if tid != 0 {
            unsafe {
                let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
    }
}

pub fn spawn(app: AppHandle) {
    let _ = APP.set(app);
    std::thread::spawn(|| unsafe { pump() });
}

unsafe fn pump() {
    THREAD.store(GetCurrentThreadId(), Ordering::Release);
    loop {
        while !ENABLED.load(Ordering::Acquire) {
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
        match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0) {
            Ok(hook) => {
                let mut msg = MSG::default();
                while ENABLED.load(Ordering::Acquire)
                    && GetMessageW(&mut msg, None, 0, 0).as_bool()
                {}
                let _ = UnhookWindowsHookEx(hook);
            }
            Err(_) => std::thread::sleep(std::time::Duration::from_millis(500)),
        }
    }
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam.0 as u32 == WM_LBUTTONDOWN {
        let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
        if over_empty_desktop(info.pt) {
            if let Some(app) = APP.get() {
                if let Some(input) = click_at(info.pt) {
                    let _ = app.emit("wallpaper-input", input);
                }
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

fn click_at(pt: POINT) -> Option<WallpaperInput> {
    let win = wallpaper_window()?;
    let hwnd = win.hwnd().ok()?;
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
    let dpi = unsafe { GetDpiForWindow(hwnd) };
    if dpi == 0 {
        return None;
    }
    let (x, y) = to_client_css(pt, rect, dpi);
    log_once(pt, rect, dpi, x, y);
    Some(WallpaperInput { x, y })
}

fn wallpaper_window() -> Option<WebviewWindow> {
    let app = APP.get()?;
    app.webview_windows()
        .into_iter()
        .find(|(label, _)| label.starts_with(crate::WALLPAPER))
        .map(|(_, win)| win)
}

fn to_client_css(pt: POINT, win: RECT, dpi: u32) -> (i32, i32) {
    let css = |v: i32| (v as f64 * 96.0 / dpi as f64).round() as i32;
    (css(pt.x - win.left), css(pt.y - win.top))
}

fn log_once(pt: POINT, rect: RECT, dpi: u32, x: i32, y: i32) {
    if LOGGED.swap(true, Ordering::AcqRel) {
        return;
    }
    crate::log(&format!(
        "click: 屏幕=({},{}) 窗口=({},{},{},{}) dpi={dpi} 客户=({x},{y})",
        pt.x, pt.y, rect.left, rect.top, rect.right, rect.bottom
    ));
}

fn over_empty_desktop(pt: POINT) -> bool {
    unsafe {
        let root = GetAncestor(WindowFromPoint(pt), GA_ROOT);
        !root.0.is_null() && (class_is(root, w!("Progman")) || class_is(root, w!("WorkerW")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn css_scales_physical_by_dpi() {
        let win = RECT {
            left: 0,
            top: 0,
            right: 2880,
            bottom: 1620,
        };
        assert_eq!(
            to_client_css(POINT { x: 1440, y: 810 }, win, 144),
            (960, 540)
        );
        assert_eq!(
            to_client_css(POINT { x: 2880, y: 1620 }, win, 144),
            (1920, 1080)
        );
        assert_eq!(to_client_css(POINT { x: 100, y: 200 }, win, 96), (100, 200));
    }

    #[test]
    fn css_offsets_by_window_origin() {
        let win = RECT {
            left: -1920,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        assert_eq!(
            to_client_css(POINT { x: -480, y: 540 }, win, 144),
            (960, 360)
        );
        assert_eq!(to_client_css(POINT { x: -1920, y: 0 }, win, 96), (0, 0));
    }
}
