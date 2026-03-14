use std::thread;
use std::time::Duration;

use tray_icon::{
    menu::{Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem},
    Icon, TrayIcon, TrayIconBuilder,
};
use windows::core::PCWSTR;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, MessageBoxW, PeekMessageW, TranslateMessage, IDOK, MB_ICONWARNING,
    MB_OKCANCEL, MSG, PM_REMOVE,
};

use crate::utils;

const ICON_BYTES: &[u8] = include_bytes!("../icon.ico");

pub struct TrayRuntime {
    quit_id: MenuId,
    _tray: TrayIcon,
}

impl TrayRuntime {
    pub fn build() -> Result<Self, String> {
        let image = image::load_from_memory(ICON_BYTES)
            .map_err(|err| utils::platform_err("icon load failed", err))?
            .into_rgba8();
        let (width, height) = image.dimensions();
        let icon = Icon::from_rgba(image.into_raw(), width, height)
            .map_err(|err| utils::platform_err("icon build failed", err))?;

        let menu = Menu::new();
        let status = MenuItem::new("Polaris 起動中", false, None);
        let quit = MenuItem::new("停止", true, None);
        let quit_id = quit.id().clone();

        menu.append(&status)
            .map_err(|err| utils::platform_err("menu append failed", err))?;
        menu.append(&PredefinedMenuItem::separator())
            .map_err(|err| utils::platform_err("menu append failed", err))?;
        menu.append(&quit)
            .map_err(|err| utils::platform_err("menu append failed", err))?;

        let tray = TrayIconBuilder::new()
            .with_icon(icon)
            .with_tooltip("STELLA RECORD - Polaris")
            .with_menu(Box::new(menu))
            .build()
            .map_err(|err| utils::platform_err("tray build failed", err))?;

        Ok(Self {
            quit_id,
            _tray: tray,
        })
    }

    pub fn run_message_loop(self) {
        let mut message = MSG::default();

        loop {
            if let Ok(event) = MenuEvent::receiver().try_recv() {
                if event.id == self.quit_id && confirm_quit() {
                    break;
                }
            }

            unsafe {
                if PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                    // Intentional: TranslateMessage result does not affect our dispatch path.
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }

            thread::sleep(Duration::from_millis(100));
        }
    }
}

fn confirm_quit() -> bool {
    let text: Vec<u16> = "Polarisを停止すると、以降のログバックアップは行われません。\0"
        .encode_utf16()
        .collect();
    let title: Vec<u16> = "Polaris 停止確認\0".encode_utf16().collect();
    let result = unsafe {
        MessageBoxW(
            None,
            PCWSTR(text.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OKCANCEL | MB_ICONWARNING,
        )
    };
    result == IDOK
}
