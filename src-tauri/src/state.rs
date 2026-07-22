use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};

pub struct PtyHandle {
    pub writer: Box<dyn std::io::Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send>,
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub start_gate: Arc<(Mutex<bool>, Condvar)>,
}

#[derive(Default)]
pub struct PtyState {
    pub ptys: Mutex<HashMap<String, PtyHandle>>,
}

#[derive(Default)]
pub struct StorageState {
    pub writes: Mutex<()>,
}
