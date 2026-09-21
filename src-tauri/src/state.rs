use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use crate::process_scope::ProcessScope;

pub struct ChildState {
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    pub root_state: RootProcessState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RootProcessState {
    Running,
    TerminatedObserved,
    Reaped,
}

impl RootProcessState {
    pub fn terminated_observed(&self) -> bool {
        matches!(self, Self::TerminatedObserved | Self::Reaped)
    }

    pub fn reaped(&self) -> bool {
        *self == Self::Reaped
    }

    pub fn observe_terminated(&mut self) {
        if *self == Self::Running {
            *self = Self::TerminatedObserved;
        }
    }

    pub fn mark_reaped(&mut self) -> Result<(), String> {
        if *self == Self::Running {
            return Err("PTY 根进程尚未确认终止，拒绝标记为已回收".to_string());
        }
        *self = Self::Reaped;
        Ok(())
    }
}

#[derive(Default)]
pub struct PtyStartGate {
    started: Mutex<bool>,
    ready: Condvar,
}

impl PtyStartGate {
    pub fn wait(&self) -> Result<(), String> {
        let mut started = self
            .started
            .lock()
            .map_err(|_| "pty start gate lock poisoned".to_string())?;
        while !*started {
            started = self
                .ready
                .wait(started)
                .map_err(|_| "pty start gate lock poisoned".to_string())?;
        }
        Ok(())
    }

    pub fn release(&self) -> Result<(), String> {
        let mut started = self
            .started
            .lock()
            .map_err(|_| "pty start gate lock poisoned".to_string())?;
        *started = true;
        self.ready.notify_all();
        Ok(())
    }
}

pub const SCROLLBACK_CAP: usize = 2 * 1024 * 1024;

#[derive(Default)]
pub struct PtyOutputBuf {
    pub seq: u64,
    pub bytes: Vec<u8>,
}

impl PtyOutputBuf {
    pub fn push(&mut self, data: &[u8]) -> u64 {
        self.seq += 1;
        self.bytes.extend_from_slice(data);
        if self.bytes.len() > SCROLLBACK_CAP {
            let overflow = self.bytes.len() - SCROLLBACK_CAP;
            self.bytes.drain(..overflow);
        }
        self.seq
    }
}

pub struct PtySession {
    pub writer: Mutex<Option<Box<dyn std::io::Write + Send>>>,
    pub child: Mutex<ChildState>,
    pub root_pid: u32,
    pub master: Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>,
    pub process_scope: Mutex<ProcessScope>,
    pub start_gate: Arc<PtyStartGate>,
    pub cleanup_lock: Mutex<()>,
    pub process_terminated: AtomicBool,
    pub reader_done: Arc<(Mutex<bool>, Condvar)>,
    pub finalized: AtomicBool,
    pub exit_emitted: AtomicBool,
    pub tool_id: String,
    pub command_id: String,
    pub command_label: String,
    pub command: String,
    pub num: u32,
    pub scrollback: Mutex<PtyOutputBuf>,
}

impl PtySession {
    pub fn owned_process_ids(&self) -> Result<Vec<u32>, String> {
        self.process_scope
            .lock()
            .map_err(|_| "pty process scope lock poisoned".to_string())?
            .active_process_ids()
    }

    pub fn process_terminated(&self) -> bool {
        self.process_terminated.load(Ordering::Acquire)
    }
}

#[derive(Default)]
pub struct PtyState {
    pub ptys: Mutex<HashMap<String, Arc<PtySession>>>,
}

#[derive(Default)]
pub struct StorageState {
    pub writes: Mutex<()>,
}
