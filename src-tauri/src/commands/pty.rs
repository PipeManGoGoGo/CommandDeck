use crate::process_scope::ProcessScope;
use crate::state::{ChildState, PtySession, PtyStartGate, PtyState, RootProcessState};
use portable_pty::{CommandBuilder, PtySize};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const ROOT_EXIT_TIMEOUT: Duration = Duration::from_secs(2);
const READER_DRAIN_TIMEOUT: Duration = Duration::from_secs(2);
const ROOT_WATCH_INTERVAL: Duration = Duration::from_millis(50);

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
        .map_err(|error| error.to_string())?;

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
    if std::env::var_os("LANG").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    let reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let mut child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|error| error.to_string())?;
    let Some(root_pid) = child.process_id() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("PTY 根进程没有 process id".to_string());
    };

    #[cfg(windows)]
    let raw_process_handle = child.as_raw_handle();
    #[cfg(not(windows))]
    let raw_process_handle = None;

    let process_scope = match ProcessScope::attach(root_pid, raw_process_handle) {
        Ok(scope) => scope,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    let pty_id = Uuid::new_v4().to_string();
    let start_gate = Arc::new(PtyStartGate::default());
    let reader_done = Arc::new((Mutex::new(false), Condvar::new()));
    let session = Arc::new(PtySession {
        writer: Mutex::new(Some(writer)),
        child: Mutex::new(ChildState {
            child,
            root_state: RootProcessState::Running,
        }),
        root_pid,
        master: Mutex::new(Some(pty_pair.master)),
        process_scope: Mutex::new(process_scope),
        start_gate: Arc::clone(&start_gate),
        cleanup_lock: Mutex::new(()),
        process_terminated: false.into(),
        reader_done: Arc::clone(&reader_done),
        finalized: false.into(),
        exit_emitted: false.into(),
    });

    let inserted = state
        .ptys
        .lock()
        .map(|mut ptys| ptys.insert(pty_id.clone(), Arc::clone(&session)))
        .map_err(|_| "pty state lock poisoned".to_string());
    if let Err(error) = inserted {
        let _ = session.start_gate.release();
        let terminate_result = session
            .process_scope
            .lock()
            .map_err(|_| "pty process scope lock poisoned".to_string())?
            .terminate();
        if terminate_result.is_ok() {
            session.process_terminated.store(true, Ordering::Release);
            let _ = wait_for_root_exit_and_reap(&session);
        }
        return Err(error);
    }

    spawn_reader(
        app.clone(),
        pty_id.clone(),
        Arc::clone(&session),
        reader,
        reader_done,
    );
    spawn_root_watcher(app, pty_id.clone(), session);

    Ok(pty_id)
}

fn spawn_reader(
    app: AppHandle,
    pty_id: String,
    session: Arc<PtySession>,
    mut reader: Box<dyn std::io::Read + Send>,
    reader_done: Arc<(Mutex<bool>, Condvar)>,
) {
    std::thread::spawn(move || {
        if let Err(error) = session.start_gate.wait() {
            mark_reader_done(&reader_done);
            emit_cleanup_error(&app, &pty_id, error);
            return;
        }

        let event_name = format!("pty_output_{pty_id}");
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let _ = app.emit(&event_name, &buffer[..count]);
                }
                Err(_) => break,
            }
        }

        drop(reader);
        mark_reader_done(&reader_done);
        if let Err(error) = finalize_session(&app, &pty_id, &session) {
            emit_cleanup_error(&app, &pty_id, error);
        }
    });
}

fn mark_reader_done(reader_done: &Arc<(Mutex<bool>, Condvar)>) {
    let (done, ready) = &**reader_done;
    if let Ok(mut done) = done.lock() {
        *done = true;
        ready.notify_all();
    }
}

fn spawn_root_watcher(app: AppHandle, pty_id: String, session: Arc<PtySession>) {
    std::thread::spawn(move || {
        if let Err(error) = session.start_gate.wait() {
            emit_cleanup_error(&app, &pty_id, error);
            return;
        }

        loop {
            match poll_root_terminated(&session) {
                Ok(true) => {
                    if let Err(error) = finalize_session(&app, &pty_id, &session) {
                        emit_cleanup_error(&app, &pty_id, error);
                    }
                    return;
                }
                Ok(false) => std::thread::sleep(ROOT_WATCH_INTERVAL),
                Err(error) => {
                    emit_cleanup_error(&app, &pty_id, error);
                    return;
                }
            }
        }
    });
}

fn emit_cleanup_error(app: &AppHandle, pty_id: &str, error: String) {
    let _ = app.emit(&format!("pty_cleanup_error_{pty_id}"), error);
}

fn poll_root_terminated(session: &PtySession) -> Result<bool, String> {
    let mut child = session
        .child
        .lock()
        .map_err(|_| "pty child lock poisoned".to_string())?;
    if child.root_state.terminated_observed() {
        return Ok(true);
    }

    #[cfg(unix)]
    let terminated = observe_root_exit_without_reaping(session.root_pid)?;
    #[cfg(windows)]
    let terminated = child
        .child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_some();

    if terminated {
        child.root_state.observe_terminated();
    }
    Ok(terminated)
}

#[cfg(unix)]
fn observe_root_exit_without_reaping(root_pid: u32) -> Result<bool, String> {
    let mut info = std::mem::MaybeUninit::<libc::siginfo_t>::zeroed();
    let result = unsafe {
        libc::waitid(
            libc::P_PID,
            root_pid as libc::id_t,
            info.as_mut_ptr(),
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    if result == -1 {
        return Err(format!(
            "无法无回收地观察 PTY 根进程 {root_pid}：{}",
            std::io::Error::last_os_error()
        ));
    }
    let info = unsafe { info.assume_init() };
    Ok(unsafe { info.si_pid() } != 0)
}

fn wait_for_root_exit_and_reap(session: &PtySession) -> Result<(), String> {
    let deadline = Instant::now() + ROOT_EXIT_TIMEOUT;
    loop {
        if poll_root_terminated(session)? {
            break;
        }
        if Instant::now() >= deadline {
            return Err("PTY 根进程未能在限定时间内终止；所有权锚点保持未回收".to_string());
        }
        std::thread::sleep(ROOT_WATCH_INTERVAL);
    }

    let mut child = session
        .child
        .lock()
        .map_err(|_| "pty child lock poisoned".to_string())?;
    if child.root_state.reaped() {
        return Ok(());
    }
    if !child.root_state.terminated_observed() {
        return Err("PTY 根进程尚未确认终止，拒绝 wait/reap".to_string());
    }
    child.child.wait().map_err(|error| error.to_string())?;
    child.root_state.mark_reaped()
}

fn wait_for_reader(session: &PtySession) -> Result<(), String> {
    let (done, ready) = &*session.reader_done;
    let done = done
        .lock()
        .map_err(|_| "pty reader state lock poisoned".to_string())?;
    if *done {
        return Ok(());
    }
    let (done, _) = ready
        .wait_timeout_while(done, READER_DRAIN_TIMEOUT, |done| !*done)
        .map_err(|_| "pty reader state lock poisoned".to_string())?;
    if *done {
        Ok(())
    } else {
        Err(format!(
            "PTY 进程已清理，但输出 reader 在 {} ms 内未结束",
            READER_DRAIN_TIMEOUT.as_millis()
        ))
    }
}

fn take_and_drop<T>(slot: &Mutex<Option<T>>, lock_error: &str) -> Result<(), String> {
    let handle = slot.lock().map_err(|_| lock_error.to_string())?.take();
    drop(handle);
    Ok(())
}

fn close_io_handles(session: &PtySession) -> Result<(), String> {
    let writer_result = take_and_drop(&session.writer, "pty writer lock poisoned");
    let master_result = take_and_drop(&session.master, "pty master lock poisoned");
    match (writer_result, master_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(error), Ok(())) | (Ok(()), Err(error)) => Err(error),
        (Err(writer_error), Err(master_error)) => Err(format!(
            "关闭 PTY writer 和 master 失败：{writer_error}；{master_error}"
        )),
    }
}

fn cleanup_session(session: &PtySession) -> Result<(), String> {
    {
        let _cleanup = session
            .cleanup_lock
            .lock()
            .map_err(|_| "pty cleanup lock poisoned".to_string())?;
        let mut failures = Vec::new();
        if let Err(error) = session.start_gate.release() {
            failures.push(error);
        }

        if !session.process_terminated() {
            let terminate_result = match session.process_scope.lock() {
                Ok(mut process_scope) => process_scope.terminate(),
                Err(_) => Err("pty process scope lock poisoned".to_string()),
            };
            match terminate_result {
                Ok(()) => session.process_terminated.store(true, Ordering::Release),
                Err(error) => failures.push(error),
            }
        }

        // Never reap the Unix session leader until ProcessScope has proved
        // that the anchored session is empty. A failed termination keeps the
        // zombie/PID anchor intact so a later cleanup can retry safely.
        if session.process_terminated() {
            if let Err(error) = wait_for_root_exit_and_reap(session) {
                failures.push(error);
            }
        }

        if let Err(error) = close_io_handles(session) {
            failures.push(error);
        }

        if !failures.is_empty() {
            return Err(failures.join("；"));
        }
    }

    wait_for_reader(session)
}

fn finalize_session(
    app: &AppHandle,
    pty_id: &str,
    session: &Arc<PtySession>,
) -> Result<(), String> {
    cleanup_session(session)?;

    if claim_once(&session.finalized) {
        let state = app.state::<PtyState>();
        let mut ptys = match state.ptys.lock() {
            Ok(ptys) => ptys,
            Err(_) => return Err("pty state lock poisoned".to_string()),
        };
        if ptys
            .get(pty_id)
            .is_some_and(|current| Arc::ptr_eq(current, session))
        {
            ptys.remove(pty_id);
        }
        drop(ptys);

        if claim_once(&session.exit_emitted) {
            let _ = app.emit(&format!("pty_exit_{pty_id}"), ());
        }
    }
    Ok(())
}

fn claim_once(flag: &std::sync::atomic::AtomicBool) -> bool {
    flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}

fn get_session(state: &PtyState, pty_id: &str) -> Result<Option<Arc<PtySession>>, String> {
    Ok(state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?
        .get(pty_id)
        .cloned())
}

#[tauri::command]
pub fn start_pty(pty_id: String, state: State<'_, PtyState>) -> Result<(), String> {
    if let Some(session) = get_session(&state, &pty_id)? {
        session.start_gate.release()?;
    }
    Ok(())
}

#[tauri::command]
pub fn write_pty(pty_id: String, data: String, state: State<'_, PtyState>) -> Result<(), String> {
    let session = get_session(&state, &pty_id)?.ok_or("pty not found")?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "pty writer lock poisoned".to_string())?;
    let writer = writer.as_mut().ok_or("pty writer is closed")?;
    let bytes = data.as_bytes();
    let mut written = 0usize;
    while written < bytes.len() {
        match writer.write(&bytes[written..]) {
            Ok(0) => return Err("PTY writer closed before all data was written".to_string()),
            Ok(count) => written += count,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(1));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resize_pty(
    pty_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let session = get_session(&state, &pty_id)?.ok_or("pty not found")?;
    let master = session
        .master
        .lock()
        .map_err(|_| "pty master lock poisoned".to_string())?;
    let result = master
        .as_ref()
        .ok_or("pty master is closed")?
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string());
    result
}

#[tauri::command]
pub fn kill_pty(pty_id: String, state: State<'_, PtyState>, app: AppHandle) -> Result<(), String> {
    let Some(session) = get_session(&state, &pty_id)? else {
        return Ok(());
    };
    finalize_session(&app, &pty_id, &session)
}

#[tauri::command]
pub fn count_ptys(state: State<'_, PtyState>) -> Result<usize, String> {
    Ok(state
        .ptys
        .lock()
        .map_err(|_| "pty state lock poisoned".to_string())?
        .len())
}

fn cleanup_all_sessions(state: &PtyState, app: &AppHandle) -> Result<(), String> {
    for _ in 0..8 {
        let sessions = state
            .ptys
            .lock()
            .map_err(|_| "pty state lock poisoned".to_string())?
            .iter()
            .map(|(id, session)| (id.clone(), Arc::clone(session)))
            .collect::<Vec<_>>();
        if sessions.is_empty() {
            return Ok(());
        }

        let mut failures = Vec::new();
        for (pty_id, session) in sessions {
            if let Err(error) = finalize_session(app, &pty_id, &session) {
                failures.push(format!("{pty_id}: {error}"));
            }
        }
        if !failures.is_empty() {
            return Err(format!("部分终端清理失败：{}", failures.join("；")));
        }
    }
    Err("终端清理期间仍有新会话创建，请重试".to_string())
}

#[tauri::command]
pub fn kill_all_ptys(state: State<'_, PtyState>, app: AppHandle) -> Result<(), String> {
    cleanup_all_sessions(&state, &app)
}

#[tauri::command]
pub fn confirm_close(state: State<'_, PtyState>, app: AppHandle) -> Result<(), String> {
    cleanup_all_sessions(&state, &app)?;
    let window = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    window.destroy().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::observe_root_exit_without_reaping;
    use super::{claim_once, take_and_drop, PtyStartGate, PtyState, RootProcessState};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::Duration;
    #[cfg(unix)]
    use std::{os::unix::process::CommandExt, time::Instant};

    struct DropProbe(Arc<AtomicUsize>);

    impl Drop for DropProbe {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn empty_state_cleanup_is_idempotent() {
        let state = PtyState::default();
        assert_eq!(state.ptys.lock().unwrap().len(), 0);
        assert_eq!(state.ptys.lock().unwrap().len(), 0);
    }

    #[test]
    fn root_watcher_gate_waits_for_explicit_start() {
        let gate = Arc::new(PtyStartGate::default());
        let (waiting_tx, waiting_rx) = mpsc::channel();
        let (started_tx, started_rx) = mpsc::channel();
        let waiter_gate = Arc::clone(&gate);
        let waiter = std::thread::spawn(move || {
            waiting_tx.send(()).unwrap();
            waiter_gate.wait().unwrap();
            started_tx.send(()).unwrap();
        });

        waiting_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(started_rx.recv_timeout(Duration::from_millis(50)).is_err());
        gate.release().unwrap();
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        waiter.join().unwrap();
    }

    #[test]
    fn closing_an_io_handle_is_immediate_and_idempotent() {
        let drops = Arc::new(AtomicUsize::new(0));
        let slot = Mutex::new(Some(DropProbe(Arc::clone(&drops))));

        take_and_drop(&slot, "lock poisoned").unwrap();
        assert_eq!(drops.load(Ordering::SeqCst), 1);
        assert!(slot.lock().unwrap().is_none());

        take_and_drop(&slot, "lock poisoned").unwrap();
        assert_eq!(drops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn root_and_event_states_are_monotonic_and_idempotent() {
        let mut running = RootProcessState::Running;
        assert!(running.mark_reaped().is_err());
        assert_eq!(running, RootProcessState::Running);

        let mut root = RootProcessState::Running;
        root.observe_terminated();
        root.observe_terminated();
        assert_eq!(root, RootProcessState::TerminatedObserved);
        root.mark_reaped().unwrap();
        root.observe_terminated();
        root.mark_reaped().unwrap();
        assert_eq!(root, RootProcessState::Reaped);

        let event_claimed = AtomicBool::new(false);
        assert!(claim_once(&event_claimed));
        assert!(!claim_once(&event_claimed));
        assert!(event_claimed.load(Ordering::Acquire));
    }

    #[test]
    #[cfg(unix)]
    fn unix_root_exit_observation_does_not_reap_anchor() {
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "exit 0"]);
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(())
                }
            });
        }
        let mut child = command.spawn().expect("spawn isolated root");
        let root_pid = child.id();
        let deadline = Instant::now() + Duration::from_secs(2);
        while !observe_root_exit_without_reaping(root_pid).unwrap() {
            assert!(Instant::now() < deadline, "root did not exit");
            std::thread::sleep(Duration::from_millis(20));
        }

        assert!(observe_root_exit_without_reaping(root_pid).unwrap());
        child.wait().expect("explicitly reap root");
    }
}
