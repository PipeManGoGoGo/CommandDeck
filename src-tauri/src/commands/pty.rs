use crate::state::{PtyHandle, PtyState};
use portable_pty::{CommandBuilder, PtySize};
use std::sync::{Arc, Condvar, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[tauri::command]
pub fn create_pty(
    command: String,
    cwd: Option<String>,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<String, String> {
    let pty_pair = portable_pty::native_pty_system()
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut command_builder = CommandBuilder::new("powershell.exe");
        command_builder.arg("-NoLogo");
        command_builder.arg("-NoExit");
        command_builder.arg("-ExecutionPolicy");
        command_builder.arg("Bypass");
        command_builder.arg("-Command");
        command_builder.arg(command);
        command_builder
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut command_builder = CommandBuilder::new(&shell);
        command_builder.arg("-lc");
        command_builder.arg(format!("{}; exec \"$SHELL\" -l", command));
        command_builder
    };

    cmd.env("TERM", "xterm-256color");
    #[cfg(not(target_os = "windows"))]
    {
        // Preserve the user's locale. Only provide a UTF-8 fallback when unset.
        if std::env::var_os("LANG").is_none() {
            cmd.env("LANG", "en_US.UTF-8");
        }
    }
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    let reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    let writer = pty_pair.master.take_writer().map_err(|e| e.to_string())?;

    let pty_id = Uuid::new_v4().to_string();
    let start_gate = Arc::new((Mutex::new(false), Condvar::new()));

    let master: Box<dyn portable_pty::MasterPty + Send> = pty_pair.master;

    state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?
        .insert(
            pty_id.clone(),
            PtyHandle {
                writer,
                child,
                master,
                start_gate: Arc::clone(&start_gate),
            },
        );

    let event_name = format!("pty_output_{}", pty_id);
    let exit_event = format!("pty_exit_{}", pty_id);
    let cleanup_pty_id = pty_id.clone();
    std::thread::spawn(move || {
        let (started, ready) = &*start_gate;
        let mut started = match started.lock() {
            Ok(started) => started,
            Err(_) => return,
        };
        while !*started {
            started = match ready.wait(started) {
                Ok(started) => started,
                Err(_) => return,
            };
        }
        drop(started);

        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match std::io::Read::read(&mut reader, &mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    let _ = app.emit(&event_name, &data);
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(&exit_event, &());
        // A naturally exited process must not keep the app in a false
        // "running" state or trigger an unnecessary close confirmation.
        let state = app.state::<PtyState>();
        if let Ok(mut ptys) = state.ptys.lock() {
            ptys.remove(&cleanup_pty_id);
        };
    });

    Ok(pty_id)
}

#[tauri::command]
pub fn start_pty(pty_id: String, state: State<'_, PtyState>) -> Result<(), String> {
    let ptys = state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?;
    let handle = ptys.get(&pty_id).ok_or("pty not found")?;
    release_reader(handle);
    Ok(())
}

fn release_reader(handle: &PtyHandle) {
    let (started, ready) = &*handle.start_gate;
    if let Ok(mut started) = started.lock() {
        *started = true;
        ready.notify_all();
    }
}

#[tauri::command]
pub fn write_pty(pty_id: String, data: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut ptys = state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?;
    let handle = ptys.get_mut(&pty_id).ok_or("pty not found")?;

    let bytes = data.as_bytes();
    let mut written = 0usize;
    while written < bytes.len() {
        match handle.writer.write(&bytes[written..]) {
            Ok(n) => written += n,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    handle.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_pty(
    pty_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let ptys = state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?;
    let handle = ptys.get(&pty_id).ok_or("pty not found")?;
    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kill_pty(pty_id: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut ptys = state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?;
    let mut handle = ptys.remove(&pty_id).ok_or("pty not found")?;
    release_reader(&handle);
    handle.child.kill().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn count_ptys(state: State<'_, PtyState>) -> Result<usize, String> {
    let ptys = state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?;
    Ok(ptys.len())
}

#[tauri::command]
pub fn kill_all_ptys(state: State<'_, PtyState>) -> Result<(), String> {
    let mut ptys = state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?;
    for (_, mut handle) in ptys.drain() {
        release_reader(&handle);
        let _ = handle.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn confirm_close(state: State<'_, PtyState>, app: AppHandle) -> Result<(), String> {
    let mut ptys = state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?;
    for (_, mut handle) in ptys.drain() {
        release_reader(&handle);
        let _ = handle.child.kill();
    }
    drop(ptys);
    let window = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    window.destroy().map_err(|e| e.to_string())?;
    Ok(())
}
