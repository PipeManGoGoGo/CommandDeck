mod commands;
mod process_scope;
mod state;

use state::{PtyState, StorageState};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::default())
        .manage(StorageState::default())
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
            commands::pty::kill_all_ptys,
            commands::pty::confirm_close,
            commands::resource::get_resource_snapshot,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let handle = window.app_handle();
                let pty_state = handle.state::<PtyState>();
                let count = pty_state.ptys.lock().map(|ptys| ptys.len()).unwrap_or(0);
                if count > 0 {
                    api.prevent_close();
                    let _ = handle.emit("request-close-confirm", ());
                }
            }
        })
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
