use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::PtyState;

pub const BIND: &str = "127.0.0.1:19527";

#[derive(Default)]
pub struct DebugApiState {
    pub snapshot: Mutex<String>,
    pub enabled: AtomicBool,
    pub serving: AtomicBool,
}

#[tauri::command]
pub fn debug_push_state(json: String, state: State<'_, DebugApiState>) -> Result<(), String> {
    *state
        .snapshot
        .lock()
        .map_err(|_| "debug snapshot lock poisoned".to_string())? = json;
    Ok(())
}

#[tauri::command]
pub fn debug_api_status(state: State<'_, DebugApiState>) -> bool {
    state.enabled.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn debug_set_enabled(
    enabled: bool,
    app: AppHandle,
    state: State<'_, DebugApiState>,
) -> Result<bool, String> {
    state.enabled.store(enabled, Ordering::SeqCst);
    if enabled {
        start_if_needed(app);
    } else {
        let _ = TcpStream::connect_timeout(&BIND.parse().unwrap(), Duration::from_millis(300));
    }
    Ok(enabled)
}

pub fn start_if_needed(app: AppHandle) {
    if app
        .state::<DebugApiState>()
        .serving
        .swap(true, Ordering::SeqCst)
    {
        return;
    }
    thread::spawn(move || {
        let listener = match TcpListener::bind(BIND) {
            Ok(listener) => listener,
            Err(error) => {
                app.state::<DebugApiState>()
                    .serving
                    .store(false, Ordering::SeqCst);
                eprintln!("CommandDeck MCP bind failed: {error}");
                return;
            }
        };
        loop {
            if !app.state::<DebugApiState>().enabled.load(Ordering::SeqCst) {
                break;
            }
            match listener.accept() {
                Ok((stream, _)) => {
                    if !app.state::<DebugApiState>().enabled.load(Ordering::SeqCst) {
                        break;
                    }
                    let app = app.clone();
                    thread::spawn(move || {
                        if let Err(error) = handle_client(stream, &app) {
                            eprintln!("CommandDeck MCP: {error}");
                        }
                    });
                }
                Err(error) => {
                    eprintln!("CommandDeck MCP accept: {error}");
                    break;
                }
            }
        }
        app.state::<DebugApiState>()
            .serving
            .store(false, Ordering::SeqCst);
    });
}

fn handle_client(mut stream: TcpStream, app: &AppHandle) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let mut buf = vec![0u8; 65536];
    let n = stream.read(&mut buf).map_err(|error| error.to_string())?;
    if n == 0 {
        return Ok(());
    }
    let req = String::from_utf8_lossy(&buf[..n]);
    let (method, path, body) = parse_http(&req)?;

    let (status, payload) = match (method.as_str(), path.as_str()) {
        ("GET", "/health") => (
            200,
            json!({ "ok": true, "service": "commanddeck-debug", "bind": BIND }),
        ),
        ("GET", "/state") => (200, current_state(app)),
        ("POST", "/action") => {
            let action: Value =
                serde_json::from_str(&body).map_err(|error| format!("invalid json: {error}"))?;
            app.emit("debug-action", action)
                .map_err(|error| error.to_string())?;
            (202, json!({ "ok": true }))
        }
        _ => (404, json!({ "error": "not found" })),
    };

    let body = payload.to_string();
    let resp = format!(
        "HTTP/1.1 {status} OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(resp.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn current_state(app: &AppHandle) -> Value {
    let snapshot = app
        .state::<DebugApiState>()
        .snapshot
        .lock()
        .ok()
        .map(|guard| guard.clone())
        .unwrap_or_default();
    let mut value = serde_json::from_str(&snapshot).unwrap_or_else(|_| json!({}));
    let pty_count = app
        .state::<PtyState>()
        .ptys
        .lock()
        .map(|ptys| ptys.len())
        .unwrap_or(0);
    if let Some(obj) = value.as_object_mut() {
        obj.insert("ptyCount".into(), json!(pty_count));
    }
    value
}

fn parse_http(req: &str) -> Result<(String, String, String), String> {
    let header_end = req.find("\r\n\r\n").ok_or("incomplete http request")?;
    let head = &req[..header_end];
    let body = &req[header_end + 4..];
    let mut lines = head.split("\r\n");
    let request_line = lines.next().ok_or("missing request line")?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_string();
    let path = parts.next().unwrap_or("/").to_string();
    let mut content_length = 0usize;
    for line in lines {
        let lower = line.to_ascii_lowercase();
        if let Some(value) = lower.strip_prefix("content-length:") {
            content_length = value.trim().parse().unwrap_or(0);
        }
    }
    let body = if content_length > 0 {
        body.chars().take(content_length).collect()
    } else {
        body.to_string()
    };
    Ok((method, path, body))
}
