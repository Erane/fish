use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;

use tauri::WebviewWindow;
use windows::core::{w, BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallWindowProcW, EnumWindows, FindWindowExW, FindWindowW, GetAncestor, GetClassNameW,
    GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, IsWindow, IsWindowVisible, SendMessageW,
    SetParent, SetWindowLongPtrW, SetWindowPos, GA_PARENT, GWL_STYLE, GWLP_WNDPROC, HWND_BOTTOM,
    SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    WM_NCCALCSIZE, WS_CAPTION, WS_CHILD, WS_POPUP, WS_THICKFRAME,
};

const SPAWN_WORKER_W: u32 = 0x052C;

static WORKER: AtomicIsize = AtomicIsize::new(0);
static SCREEN: Mutex<Option<VirtualScreen>> = Mutex::new(None);
static SUBCLASSED: AtomicIsize = AtomicIsize::new(0);
static ORIGINAL_PROC: AtomicIsize = AtomicIsize::new(0);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct VirtualScreen {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

pub fn virtual_screen() -> VirtualScreen {
    unsafe {
        VirtualScreen {
            x: GetSystemMetrics(SM_XVIRTUALSCREEN),
            y: GetSystemMetrics(SM_YVIRTUALSCREEN),
            w: GetSystemMetrics(SM_CXVIRTUALSCREEN),
            h: GetSystemMetrics(SM_CYVIRTUALSCREEN),
        }
    }
}

pub fn to_local(x: i32, y: i32, vs: VirtualScreen) -> (i32, i32) {
    (x - vs.x, y - vs.y)
}

pub fn class_is(hwnd: HWND, class: PCWSTR) -> bool {
    let wide = unsafe { class.as_wide() };
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) };
    n > 0 && wide == &buf[..n as usize]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Health {
    Attached,
    Detached,
    Dead,
}

pub fn health(window: &WebviewWindow) -> Health {
    let raw = match window.hwnd() {
        Ok(h) => h.0 as isize,
        Err(_) => return Health::Dead,
    };
    let hwnd = HWND(raw as *mut _);
    if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        return Health::Dead;
    }
    let worker = WORKER.load(Ordering::Acquire);
    if worker == 0 {
        return Health::Detached;
    }
    let parent = unsafe { GetAncestor(hwnd, GA_PARENT) };
    let screen_changed = *SCREEN.lock().unwrap() != Some(virtual_screen());
    if parent.0 as isize == worker && !screen_changed {
        Health::Attached
    } else {
        Health::Detached
    }
}

#[derive(Debug)]
pub enum AttachError {
    NoDesktop,
    NoWorker,
    Native(windows::core::Error),
}

impl std::fmt::Display for AttachError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AttachError::NoDesktop => write!(f, "未找到桌面窗口"),
            AttachError::NoWorker => write!(f, "桌面壁纸层不可用"),
            AttachError::Native(e) => write!(f, "{e}"),
        }
    }
}

pub fn attach(window: &WebviewWindow) -> Result<(), AttachError> {
    let hwnd = window
        .hwnd()
        .map(|h| HWND(h.0 as *mut _))
        .map_err(|_| AttachError::NoDesktop)?;
    let progman =
        unsafe { FindWindowW(w!("Progman"), None) }.map_err(|_| AttachError::NoDesktop)?;
    crate::log(&format!(
        "attach: progman={progman:?} screen={:?} hwnd={hwnd:?}",
        virtual_screen()
    ));
    let mut spawned = false;
    let parent = find_worker().or_else(|| {
        spawned = true;
        crate::log("attach: 无壁纸层，发送 0x052C 派生");
        unsafe {
            SendMessageW(progman, SPAWN_WORKER_W, Some(WPARAM(0)), Some(LPARAM(0)));
        }
        find_worker()
    });
    let parent = match parent {
        Some(w) => {
            crate::log(&format!("attach: 挂载目标 {w:?} 来自派生={spawned}"));
            w
        }
        None => {
            crate::log("attach: 未找到任何壁纸层");
            return Err(AttachError::NoWorker);
        }
    };
    let vs = virtual_screen();
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        SetWindowLongPtrW(
            hwnd,
            GWL_STYLE,
            ((style | WS_CHILD.0) & !(WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0)) as isize,
        );
        SetParent(hwnd, Some(parent)).map_err(|e| {
            crate::log(&format!("attach: SetParent 失败 {e}"));
            AttachError::Native(e)
        })?;
        if SUBCLASSED.load(Ordering::Acquire) != hwnd.0 as isize {
            ORIGINAL_PROC.store(GetWindowLongPtrW(hwnd, GWLP_WNDPROC), Ordering::Release);
            let new_proc = wallpaper_proc
                as unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT
                as usize as isize;
            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, new_proc);
            SUBCLASSED.store(hwnd.0 as isize, Ordering::Release);
        }
        SetWindowPos(hwnd, None, 0, 0, vs.w, vs.h, SWP_NOACTIVATE | SWP_FRAMECHANGED)
            .map_err(|e| {
                crate::log(&format!("attach: SetWindowPos 失败 {e}"));
                AttachError::Native(e)
            })?;
        let mut wr = RECT::default();
        let _ = GetWindowRect(hwnd, &mut wr);
        crate::log(&format!(
            "attach: 窗口=({},{},{},{})",
            wr.left, wr.top, wr.right, wr.bottom
        ));
        if let Ok(web) = FindWindowExW(Some(hwnd), None, w!("WRY_WEBVIEW"), None) {
            if !web.0.is_null() {
                let mut r = RECT::default();
                let _ = GetWindowRect(web, &mut r);
                crate::log(&format!(
                    "attach: webview 修正前=({},{}) {}x{}",
                    r.left,
                    r.top,
                    r.right - r.left,
                    r.bottom - r.top
                ));
                let _ = SetWindowPos(
                    web,
                    None,
                    0,
                    0,
                    vs.w,
                    vs.h,
                    SWP_NOACTIVATE | SWP_NOZORDER | SWP_FRAMECHANGED,
                );
            }
        }
    }
    crate::log(&format!("attach: 已挂载 parent={parent:?}"));
    WORKER.store(parent.0 as isize, Ordering::Release);
    *SCREEN.lock().unwrap() = Some(vs);
    Ok(())
}

unsafe extern "system" fn wallpaper_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_NCCALCSIZE && wparam.0 != 0 {
        return LRESULT(0);
    }
    let prev = ORIGINAL_PROC.load(Ordering::Acquire);
    CallWindowProcW(
        Some(std::mem::transmute::<
            isize,
            unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT,
        >(prev)),
        hwnd,
        msg,
        wparam,
        lparam,
    )
}

pub fn sink(window: &WebviewWindow) {
    let Ok(h) = window.hwnd() else { return };
    let hwnd = HWND(h.0 as *mut _);
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
    }
}

fn find_worker() -> Option<HWND> {
    let workers = worker_windows();
    let host = workers.iter().position(|w| {
        unsafe { FindWindowExW(Some(*w), None, w!("SHELLDLL_DefView"), None) }.is_ok()
    });
    crate::log(&format!(
        "find_worker: 顶层 WorkerW 数={} DefView 宿主={}",
        workers.len(),
        host.map(|i| format!("{:?}", workers[i])).unwrap_or_else(|| "无".into()),
    ));
    if let Some(found) = pick_worker(&workers, host) {
        crate::log("find_worker: 命中经典结构（宿主后继）");
        return Some(found);
    }
    let progman = unsafe { FindWindowW(w!("Progman"), None) }.ok()?;
    let mut after = None;
    loop {
        let child = match unsafe { FindWindowExW(Some(progman), after, w!("WorkerW"), None) } {
            Ok(h) => h,
            Err(_) => break,
        };
        if child.0.is_null() {
            break;
        }
        if unsafe { IsWindowVisible(child) }.as_bool() {
            crate::log("find_worker: 命中 Progman 可见子 WorkerW");
            return Some(child);
        }
        after = Some(child);
    }
    crate::log("find_worker: 无可用壁纸层");
    None
}

unsafe extern "system" fn collect_worker(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<HWND>);
    if class_is(hwnd, w!("WorkerW")) {
        list.push(hwnd);
    }
    BOOL(1)
}

fn worker_windows() -> Vec<HWND> {
    let mut list: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect_worker), LPARAM(&mut list as *mut _ as isize));
    }
    list
}

fn pick_worker(workers: &[HWND], host_index: Option<usize>) -> Option<HWND> {
    match host_index {
        Some(i) => workers.get(i + 1).copied(),
        None => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hwnd(id: usize) -> HWND {
        HWND(id as *mut _)
    }

    #[test]
    fn local_coords_offset_by_virtual_origin() {
        let vs = VirtualScreen {
            x: -1920,
            y: 0,
            w: 3840,
            h: 1080,
        };
        assert_eq!(to_local(-1920, 0, vs), (0, 0));
        assert_eq!(to_local(0, 1079, vs), (1920, 1079));
    }

    #[test]
    fn worker_picks_successor_of_defview_host() {
        let (a, b, c) = (hwnd(1), hwnd(2), hwnd(3));
        assert_eq!(pick_worker(&[a, b, c], Some(0)), Some(b));
        assert_eq!(pick_worker(&[a, b], Some(1)), None);
        assert_eq!(pick_worker(&[a, c], None), None);
        assert_eq!(pick_worker(&[], None), None);
    }
}
