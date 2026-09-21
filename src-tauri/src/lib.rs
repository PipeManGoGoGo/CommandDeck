mod commands;
mod debug_api;
mod process_scope;
mod state;

use debug_api::DebugApiState;
use state::{PtyState, StorageState};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

fn pty_count(app: &tauri::AppHandle) -> usize {
    app.state::<PtyState>()
        .ptys
        .lock()
        .map(|ptys| ptys.len())
        .unwrap_or(0)
}

fn request_quit(app: &tauri::AppHandle) {
    if pty_count(app) > 0 {
        let _ = app.emit("request-quit-confirm", ());
        return;
    }
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::default())
        .manage(StorageState::default())
        .manage(DebugApiState::default())
        .invoke_handler(tauri::generate_handler![
            commands::storage::read_tools,
            commands::storage::write_tools,
            commands::storage::read_categories,
            commands::storage::write_categories,
            commands::storage::read_settings,
            commands::storage::write_settings,
            commands::pty::create_pty,
            commands::pty::start_pty,
            commands::pty::write_pty,
            commands::pty::resize_pty,
            commands::pty::kill_pty,
            commands::pty::count_ptys,
            commands::pty::list_ptys,
            commands::pty::kill_all_ptys,
            commands::pty::confirm_close,
            commands::resource::get_resource_snapshot,
            commands::workspace::path_exists,
            commands::workspace::open_external,
            commands::icon::convert_icon,
            commands::pack::export_pack,
            commands::pack::extract_pack,
            commands::pack::copy_dir,
            commands::pack::remove_import_temp,
            debug_api::debug_push_state,
            debug_api::debug_api_status,
            debug_api::debug_set_enabled,
        ])
        .menu(|handle| {
            let quit = MenuItem::with_id(handle, "quit", "退出", true, Some("CmdOrCtrl+Q"))?;
            let app_menu = Submenu::with_items(handle, "CommandDeck", true, &[&quit])?;
            let edit_menu = Submenu::with_items(
                handle,
                "编辑",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;
            let window_menu = Submenu::with_items(
                handle,
                "窗口",
                true,
                &[&PredefinedMenuItem::minimize(handle, None)?],
            )?;
            Menu::with_items(handle, &[&app_menu, &edit_menu, &window_menu])
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit" {
                request_quit(app);
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("request-window-close", ());
            }
        })
        .setup(|_app| Ok(()))
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if pty_count(handle) > 0 {
                api.prevent_exit();
                let _ = handle.emit("request-quit-confirm", ());
            }
        }
    });
}
