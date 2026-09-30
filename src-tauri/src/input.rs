use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::core::w;
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetAncestor, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL,
    WM_LBUTTONDOWN, WM_QUIT,
};

use crate::desktop::{class_is, to_local, virtual_screen};

static APP: OnceLock<AppHandle> = OnceLock::new();
static ENABLED: AtomicBool = AtomicBool::new(false);
static THREAD: AtomicU32 = AtomicU32::new(0);

#[derive(Serialize, Clone, Copy)]
pub struct WallpaperInput {
    pub x: i32,
    pub y: i32,
}

pub fn enabled() -> bool {
    ENABLED.load(Ordering::Acquire)
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
                let (x, y) = to_local(info.pt.x, info.pt.y, virtual_screen());
                let _ = app.emit("wallpaper-input", WallpaperInput { x, y });
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

fn over_empty_desktop(pt: POINT) -> bool {
    unsafe {
        let root = GetAncestor(WindowFromPoint(pt), GA_ROOT);
        !root.0.is_null() && (class_is(root, w!("Progman")) || class_is(root, w!("WorkerW")))
    }
}
