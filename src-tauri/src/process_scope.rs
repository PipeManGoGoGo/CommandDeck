use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(25);

#[cfg(unix)]
const SIGNAL_STAGES: &[(i32, Duration)] = &[
    (libc::SIGHUP, Duration::from_millis(150)),
    (libc::SIGTERM, Duration::from_millis(300)),
    (libc::SIGKILL, Duration::from_millis(600)),
];

pub struct ProcessScope {
    #[cfg(unix)]
    root_pid: i32,
    #[cfg(unix)]
    session_id: i32,
    #[cfg(unix)]
    unix_state: UnixScopeState,
    #[cfg(windows)]
    windows: WindowsJob,
}

impl ProcessScope {
    #[cfg(unix)]
    pub fn attach(
        root_pid: u32,
        _raw_process_handle: Option<*mut std::ffi::c_void>,
    ) -> Result<Self, String> {
        let root_pid_i32 = i32::try_from(root_pid).map_err(|_| "pty root pid is invalid")?;
        let session_id = unsafe { libc::getsid(root_pid_i32) };
        if session_id == -1 {
            return Err(format!(
                "无法读取 PTY 根进程 session：{}",
                std::io::Error::last_os_error()
            ));
        }
        if session_id != root_pid_i32 {
            return Err(format!(
                "PTY 根进程未成为独立 session leader（pid={root_pid}, sid={session_id}）"
            ));
        }
        Ok(Self {
            root_pid: root_pid_i32,
            session_id,
            unix_state: UnixScopeState::Anchored,
        })
    }

    #[cfg(windows)]
    pub fn attach(
        _root_pid: u32,
        raw_process_handle: Option<*mut std::ffi::c_void>,
    ) -> Result<Self, String> {
        let process_handle = raw_process_handle.ok_or("PTY 根进程缺少 Windows process handle")?;
        Ok(Self {
            windows: WindowsJob::create_and_assign(process_handle)?,
        })
    }

    #[cfg(unix)]
    pub fn active_process_ids(&self) -> Result<Vec<u32>, String> {
        if self.unix_state == UnixScopeState::Cleaned {
            return Ok(Vec::new());
        }
        Ok(self
            .session_processes()?
            .into_iter()
            .map(|process| process.pid)
            .collect())
    }

    #[cfg(windows)]
    pub fn active_process_ids(&self) -> Result<Vec<u32>, String> {
        self.windows.active_process_ids()
    }

    #[cfg(unix)]
    pub fn terminate(&mut self) -> Result<(), String> {
        self.terminate_unix_with(&mut send_process_group_signal)
    }

    #[cfg(unix)]
    fn terminate_unix_with<F>(&mut self, signaler: &mut F) -> Result<(), String>
    where
        F: FnMut(i32, i32) -> Result<(), String>,
    {
        if self.unix_state == UnixScopeState::Cleaned {
            return Ok(());
        }
        for (signal, timeout) in SIGNAL_STAGES {
            let processes = self.session_processes()?;
            if processes.is_empty() {
                self.unix_state = UnixScopeState::Cleaned;
                return Ok(());
            }
            self.signal_process_groups(&processes, *signal, signaler)?;
            if self.wait_for_empty_session(*timeout)? {
                self.unix_state = UnixScopeState::Cleaned;
                return Ok(());
            }
        }

        let remaining = self.session_processes()?;
        if remaining.is_empty() {
            self.unix_state = UnixScopeState::Cleaned;
            Ok(())
        } else {
            Err(format!(
                "PTY session {} 清理后仍有 {} 个活动进程",
                self.session_id,
                remaining.len()
            ))
        }
    }

    #[cfg(unix)]
    fn observe_anchor(&self) -> Result<UnixAnchorObservation, String> {
        let mut info = std::mem::MaybeUninit::<libc::siginfo_t>::zeroed();
        let wait_result = unsafe {
            libc::waitid(
                libc::P_PID,
                self.root_pid as libc::id_t,
                info.as_mut_ptr(),
                libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
            )
        };
        if wait_result == -1 {
            let error = std::io::Error::last_os_error();
            return if error.raw_os_error() == Some(libc::ECHILD) {
                Ok(UnixAnchorObservation::Missing)
            } else {
                Err(format!("无法验证 PTY 根进程 child 锚点：{error}"))
            };
        }
        let info = unsafe { info.assume_init() };
        if unsafe { info.si_pid() } != 0 {
            // On macOS getsid(2) returns ESRCH for a zombie. waitid with
            // WNOWAIT still proves this exact PID is our unreaped child, and
            // attach already proved that it was the session leader.
            return Ok(UnixAnchorObservation::Matches);
        }

        let observed_session = unsafe { libc::getsid(self.root_pid) };
        if observed_session == -1 {
            let error = std::io::Error::last_os_error();
            return if error.raw_os_error() == Some(libc::ESRCH) {
                Ok(UnixAnchorObservation::Missing)
            } else {
                Err(format!("无法验证 PTY session 所有权锚点：{error}"))
            };
        }
        if observed_session == self.session_id {
            Ok(UnixAnchorObservation::Matches)
        } else {
            Ok(UnixAnchorObservation::Mismatched(observed_session))
        }
    }

    #[cfg(unix)]
    fn session_processes(&self) -> Result<Vec<UnixProcess>, String> {
        validate_anchor(self.root_pid, self.session_id, self.observe_anchor()?)?;
        let processes = read_process_table()?;
        select_session_processes(
            &processes,
            self.root_pid,
            self.session_id,
            self.observe_anchor()?,
            |pid| {
                let Ok(pid) = i32::try_from(pid) else {
                    return None;
                };
                let session_id = unsafe { libc::getsid(pid) };
                (session_id != -1).then_some(session_id)
            },
        )
    }

    #[cfg(unix)]
    fn signal_process_groups<F>(
        &self,
        processes: &[UnixProcess],
        signal: i32,
        signaler: &mut F,
    ) -> Result<(), String>
    where
        F: FnMut(i32, i32) -> Result<(), String>,
    {
        let groups = processes
            .iter()
            .filter_map(|process| {
                (process.process_group_id > 0).then_some(process.process_group_id)
            })
            .collect::<std::collections::BTreeSet<_>>();

        for process_group_id in groups {
            // Re-scan and revalidate the unreaped session-leader anchor before
            // every signal. If the anchor is gone or changed, fail closed.
            if !self
                .session_processes()?
                .iter()
                .any(|process| process.process_group_id == process_group_id)
            {
                continue;
            }
            signaler(process_group_id, signal)?;
        }
        Ok(())
    }

    #[cfg(unix)]
    fn wait_for_empty_session(&self, timeout: Duration) -> Result<bool, String> {
        let deadline = Instant::now() + timeout;
        loop {
            if self.session_processes()?.is_empty() {
                return Ok(true);
            }
            if Instant::now() >= deadline {
                return Ok(false);
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    }

    #[cfg(windows)]
    pub fn terminate(&mut self) -> Result<(), String> {
        self.windows.close_and_wait()
    }
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UnixScopeState {
    Anchored,
    Cleaned,
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UnixAnchorObservation {
    Matches,
    Missing,
    Mismatched(i32),
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct UnixProcess {
    pid: u32,
    parent_pid: u32,
    process_group_id: i32,
    state: char,
}

#[cfg(unix)]
fn parse_process_line(line: &str) -> Option<UnixProcess> {
    let mut columns = line.split_whitespace();
    let pid = columns.next()?.parse().ok()?;
    let parent_pid = columns.next()?.parse().ok()?;
    let process_group_id = columns.next()?.parse().ok()?;
    let state = columns.next()?.chars().next()?;
    Some(UnixProcess {
        pid,
        parent_pid,
        process_group_id,
        state,
    })
}

#[cfg(unix)]
fn read_process_table() -> Result<Vec<UnixProcess>, String> {
    let output = std::process::Command::new("ps")
        .args(["-A", "-o", "pid=,ppid=,pgid=,stat="])
        .env("LC_ALL", "C")
        .output()
        .map_err(|error| format!("无法读取进程表：{error}"))?;
    if !output.status.success() {
        return Err(format!(
            "读取进程表失败：{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_process_line)
        .collect())
}

#[cfg(unix)]
fn validate_anchor(
    root_pid: i32,
    session_id: i32,
    observation: UnixAnchorObservation,
) -> Result<(), String> {
    match observation {
        UnixAnchorObservation::Matches => Ok(()),
        UnixAnchorObservation::Missing => Err(format!(
            "PTY session 所有权锚点已丢失（root pid={root_pid}, sid={session_id}）；拒绝按数字 SID 查询或发送信号"
        )),
        UnixAnchorObservation::Mismatched(observed_session) => Err(format!(
            "PTY session 所有权锚点不匹配（root pid={root_pid}, expected sid={session_id}, observed sid={observed_session}）；拒绝按数字 SID 查询或发送信号"
        )),
    }
}

#[cfg(unix)]
fn select_session_processes<F>(
    processes: &[UnixProcess],
    root_pid: i32,
    session_id: i32,
    anchor: UnixAnchorObservation,
    mut session_of: F,
) -> Result<Vec<UnixProcess>, String>
where
    F: FnMut(u32) -> Option<i32>,
{
    validate_anchor(root_pid, session_id, anchor)?;
    Ok(processes
        .iter()
        .copied()
        .filter(|process| process.state != 'Z')
        .filter(|process| session_of(process.pid) == Some(session_id))
        .collect())
}

#[cfg(unix)]
fn send_process_group_signal(process_group_id: i32, signal: i32) -> Result<(), String> {
    let result = unsafe { libc::kill(-process_group_id, signal) };
    if result == -1 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() != Some(libc::ESRCH) {
            return Err(format!(
                "向 PTY 进程组 {process_group_id} 发送信号 {signal} 失败：{error}"
            ));
        }
    }
    Ok(())
}

#[cfg(windows)]
struct WindowsHandle(std::os::windows::io::OwnedHandle);

#[cfg(windows)]
impl WindowsHandle {
    fn from_raw(raw: windows_sys::Win32::Foundation::HANDLE) -> Self {
        use std::os::windows::io::FromRawHandle;

        // SAFETY: `raw` was returned by CreateJobObjectW, is non-null, and
        // ownership is transferred exactly once into this wrapper.
        Self(unsafe { std::os::windows::io::OwnedHandle::from_raw_handle(raw.cast()) })
    }

    fn raw(&self) -> windows_sys::Win32::Foundation::HANDLE {
        use std::os::windows::io::AsRawHandle;

        self.0.as_raw_handle().cast()
    }
}

#[cfg(any(windows, test))]
const JOB_PROCESS_ID_LIST_HEADER_SIZE: usize = std::mem::size_of::<u32>() * 2;

/// Backing storage for JOBOBJECT_BASIC_PROCESS_ID_LIST's flexible array.
///
/// The Windows structure ends in `ULONG_PTR ProcessIdList[1]`, so byte
/// storage is not sufficiently aligned. A `Vec<usize>` provides the required
/// ULONG_PTR alignment on both 32-bit and 64-bit Windows.
#[cfg(any(windows, test))]
struct JobProcessIdBuffer {
    storage: Vec<usize>,
    byte_len: u32,
    process_capacity: usize,
}

#[cfg(any(windows, test))]
#[derive(Debug, PartialEq, Eq)]
enum ParsedJobProcessIds {
    Complete(Vec<u32>),
    Incomplete { assigned: usize, listed: usize },
}

#[cfg(any(windows, test))]
impl JobProcessIdBuffer {
    fn new(process_capacity: usize) -> Result<Self, String> {
        let word_size = std::mem::size_of::<usize>();
        if !JOB_PROCESS_ID_LIST_HEADER_SIZE.is_multiple_of(word_size) {
            return Err("当前平台不支持 Windows Job Object 进程列表布局".to_string());
        }
        let process_bytes = process_capacity
            .checked_mul(word_size)
            .ok_or("Windows Job Object 进程列表大小溢出")?;
        let byte_len = JOB_PROCESS_ID_LIST_HEADER_SIZE
            .checked_add(process_bytes)
            .ok_or("Windows Job Object 进程列表大小溢出")?;
        let byte_len =
            u32::try_from(byte_len).map_err(|_| "Windows Job Object 进程列表超过 API 大小限制")?;
        let word_len = (byte_len as usize).div_ceil(word_size);
        let mut storage = Vec::new();
        storage
            .try_reserve_exact(word_len)
            .map_err(|error| format!("无法分配 Windows Job Object 进程列表：{error}"))?;
        storage.resize(word_len, 0);

        Ok(Self {
            storage,
            byte_len,
            process_capacity,
        })
    }

    fn counts(&self) -> (usize, usize) {
        // SAFETY: `storage` is initialized, and `byte_len` never exceeds its
        // allocation. Reading an initialized integer allocation as bytes is
        // valid; the copy below also avoids imposing u32 alignment on it.
        let bytes = unsafe {
            std::slice::from_raw_parts(self.storage.as_ptr().cast::<u8>(), self.byte_len as usize)
        };
        let assigned = u32::from_ne_bytes(bytes[0..4].try_into().expect("fixed header size"));
        let listed = u32::from_ne_bytes(bytes[4..8].try_into().expect("fixed header size"));
        (assigned as usize, listed as usize)
    }

    fn parse_process_ids(&self) -> Result<ParsedJobProcessIds, String> {
        let (assigned, listed) = self.counts();
        if listed > assigned {
            return Err(format!(
                "Windows Job Object 返回无效进程计数（assigned={assigned}, listed={listed}）"
            ));
        }
        if listed > self.process_capacity {
            return Err(format!(
                "Windows Job Object 返回的进程数 {listed} 超过缓冲区容量 {}",
                self.process_capacity
            ));
        }
        if assigned > listed {
            return Ok(ParsedJobProcessIds::Incomplete { assigned, listed });
        }

        let first_process_word = JOB_PROCESS_ID_LIST_HEADER_SIZE / std::mem::size_of::<usize>();
        let end = first_process_word
            .checked_add(listed)
            .ok_or("Windows Job Object 进程列表边界溢出")?;
        let raw_ids = self
            .storage
            .get(first_process_word..end)
            .ok_or("Windows Job Object 进程列表越界")?;
        let process_ids = raw_ids
            .iter()
            .map(|pid| {
                u32::try_from(*pid)
                    .map_err(|_| format!("Windows Job Object 返回无效 process id：{pid}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ParsedJobProcessIds::Complete(process_ids))
    }

    #[cfg(windows)]
    fn as_mut_ptr(&mut self) -> *mut std::ffi::c_void {
        self.storage.as_mut_ptr().cast()
    }

    #[cfg(windows)]
    fn byte_len(&self) -> u32 {
        self.byte_len
    }

    #[cfg(windows)]
    fn assigned_processes(&self) -> usize {
        self.counts().0
    }
}

#[cfg(any(windows, test))]
fn expanded_job_process_capacity(current: usize, assigned: usize) -> Result<usize, String> {
    let doubled = current
        .checked_mul(2)
        .ok_or("Windows Job Object 进程列表容量溢出")?;
    Ok(assigned.max(doubled))
}

#[cfg(windows)]
struct WindowsJob {
    job: Option<WindowsHandle>,
}

#[cfg(windows)]
impl WindowsJob {
    fn create_and_assign(process_handle: *mut std::ffi::c_void) -> Result<Self, String> {
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        let raw_job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if raw_job.is_null() {
            return Err(format!(
                "创建 Windows Job Object 失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        let job = WindowsHandle::from_raw(raw_job);
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job.raw(),
                JobObjectExtendedLimitInformation,
                std::ptr::addr_of!(limits).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
        };
        if configured == 0 {
            return Err(format!(
                "配置 Windows Job Object 失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        let assigned = unsafe { AssignProcessToJobObject(job.raw(), process_handle) };
        if assigned == 0 {
            return Err(format!(
                "将 PTY 根进程加入 Windows Job Object 失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(Self { job: Some(job) })
    }

    fn query_job_process_ids(job: &WindowsHandle) -> Result<Vec<u32>, String> {
        use windows_sys::Win32::Foundation::ERROR_MORE_DATA;
        use windows_sys::Win32::System::JobObjects::{
            JobObjectBasicProcessIdList, QueryInformationJobObject,
        };

        let mut capacity = 16usize;
        loop {
            let mut buffer = JobProcessIdBuffer::new(capacity)?;
            let ok = unsafe {
                QueryInformationJobObject(
                    job.raw(),
                    JobObjectBasicProcessIdList,
                    buffer.as_mut_ptr(),
                    buffer.byte_len(),
                    std::ptr::null_mut(),
                )
            };
            if ok != 0 {
                match buffer.parse_process_ids()? {
                    ParsedJobProcessIds::Complete(process_ids) => return Ok(process_ids),
                    ParsedJobProcessIds::Incomplete { assigned, .. } => {
                        capacity = expanded_job_process_capacity(capacity, assigned)?;
                        continue;
                    }
                }
            }
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() == Some(ERROR_MORE_DATA as i32) {
                capacity = expanded_job_process_capacity(capacity, buffer.assigned_processes())?;
                continue;
            }
            return Err(format!("读取 Windows Job Object 进程失败：{error}"));
        }
    }

    fn active_process_ids(&self) -> Result<Vec<u32>, String> {
        if let Some(job) = &self.job {
            return Self::query_job_process_ids(job);
        }
        Ok(Vec::new())
    }

    fn close_and_wait(&mut self) -> Result<(), String> {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;

        let Some(job) = self.job.as_ref() else {
            return Ok(());
        };
        if unsafe { TerminateJobObject(job.raw(), 1) } == 0 {
            return Err(format!(
                "终止 Windows Job Object 失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let active = Self::query_job_process_ids(job)?;
            if active.is_empty() {
                // Normal cleanup uses explicit termination so the Job remains
                // queryable until empty. KILL_ON_JOB_CLOSE is still the RAII
                // fallback if ProcessScope is dropped on any other path.
                drop(self.job.take());
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(format!(
                    "关闭 Windows Job Object 后仍有 {} 个活动进程",
                    active.len()
                ));
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        expanded_job_process_capacity, JobProcessIdBuffer, ParsedJobProcessIds,
        JOB_PROCESS_ID_LIST_HEADER_SIZE,
    };
    #[cfg(unix)]
    use super::{
        parse_process_line, select_session_processes, ProcessScope, UnixAnchorObservation,
        UnixScopeState,
    };
    #[cfg(unix)]
    use std::os::unix::process::CommandExt;

    fn write_job_process_list_header(buffer: &mut JobProcessIdBuffer, assigned: u32, listed: u32) {
        // SAFETY: JobProcessIdBuffer always reserves the fixed eight-byte
        // header, and Vec<usize> is at least u32-aligned on supported targets.
        let header =
            unsafe { std::slice::from_raw_parts_mut(buffer.storage.as_mut_ptr().cast::<u32>(), 2) };
        header[0] = assigned;
        header[1] = listed;
    }

    #[test]
    fn job_process_id_buffer_is_aligned_and_decodes_checked_ids() {
        let mut buffer = JobProcessIdBuffer::new(3).expect("allocate process list");
        assert_eq!(
            buffer.storage.as_ptr() as usize % std::mem::align_of::<usize>(),
            0
        );
        assert_eq!(JOB_PROCESS_ID_LIST_HEADER_SIZE, 8);

        write_job_process_list_header(&mut buffer, 3, 3);
        let first_process_word = JOB_PROCESS_ID_LIST_HEADER_SIZE / std::mem::size_of::<usize>();
        buffer.storage[first_process_word..first_process_word + 3].copy_from_slice(&[17, 23, 42]);

        assert_eq!(
            buffer.parse_process_ids().unwrap(),
            ParsedJobProcessIds::Complete(vec![17, 23, 42])
        );
    }

    #[test]
    fn job_process_id_buffer_rejects_inconsistent_counts() {
        let mut buffer = JobProcessIdBuffer::new(1).expect("allocate process list");

        write_job_process_list_header(&mut buffer, 1, 2);
        assert!(buffer
            .parse_process_ids()
            .unwrap_err()
            .contains("无效进程计数"));

        write_job_process_list_header(&mut buffer, 2, 2);
        assert!(buffer
            .parse_process_ids()
            .unwrap_err()
            .contains("超过缓冲区容量"));
    }

    #[test]
    fn incomplete_job_process_id_list_requests_growth() {
        let mut buffer = JobProcessIdBuffer::new(1).expect("allocate process list");
        write_job_process_list_header(&mut buffer, 2, 1);

        assert_eq!(
            buffer.parse_process_ids().unwrap(),
            ParsedJobProcessIds::Incomplete {
                assigned: 2,
                listed: 1,
            }
        );
        assert_eq!(expanded_job_process_capacity(1, 2).unwrap(), 2);
        assert_eq!(expanded_job_process_capacity(16, 40).unwrap(), 40);
    }

    #[test]
    fn job_process_id_buffer_rejects_size_overflow() {
        assert!(JobProcessIdBuffer::new(usize::MAX).is_err());
        assert!(expanded_job_process_capacity(usize::MAX, usize::MAX).is_err());
    }

    #[test]
    #[cfg(unix)]
    fn parses_process_table_rows_and_excludes_zombies() {
        let current_pid = std::process::id();
        let current_session = unsafe { libc::getsid(0) };
        let active = parse_process_line(&format!("{current_pid} 1 {current_pid} S+")).unwrap();
        let zombie = parse_process_line(&format!("{current_pid} 1 {current_pid} Z+")).unwrap();

        let selected = select_session_processes(
            &[active, zombie],
            current_pid as i32,
            current_session,
            UnixAnchorObservation::Matches,
            |_| Some(current_session),
        )
        .unwrap();
        assert_eq!(selected, vec![active]);
    }

    #[test]
    #[cfg(unix)]
    fn excludes_processes_outside_the_owned_session() {
        let current_pid = std::process::id();
        let current_session = unsafe { libc::getsid(0) };
        let foreign_session = current_session.saturating_add(1);
        let current = parse_process_line(&format!("{current_pid} 1 {current_pid} S")).unwrap();
        assert!(select_session_processes(
            &[current],
            current_pid as i32,
            current_session,
            UnixAnchorObservation::Matches,
            |_| Some(foreign_session),
        )
        .unwrap()
        .is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn forged_numeric_session_is_rejected_when_anchor_is_missing() {
        let forged = parse_process_line("4242 1 4242 S").unwrap();
        let error = select_session_processes(
            &[forged],
            4242,
            4242,
            UnixAnchorObservation::Missing,
            |_| Some(4242),
        )
        .unwrap_err();
        assert!(error.contains("所有权锚点已丢失"));
    }

    #[test]
    #[cfg(unix)]
    fn terminates_an_isolated_session_and_is_idempotent() {
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "sleep 30 & wait"]);
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(())
                }
            });
        }
        let mut child = command.spawn().expect("spawn isolated session");
        let mut scope = ProcessScope::attach(child.id(), None).expect("attach isolated session");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
        while scope.active_process_ids().unwrap().len() < 2 && std::time::Instant::now() < deadline
        {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(scope.active_process_ids().unwrap().len() >= 2);

        scope.terminate().expect("terminate isolated session");
        scope.terminate().expect("repeat termination");
        child.wait().expect("reap isolated session root");
        assert!(scope.active_process_ids().unwrap().is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn failed_cleanup_keeps_anchor_for_a_safe_retry() {
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "sleep 30 & wait"]);
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(())
                }
            });
        }
        let mut child = command.spawn().expect("spawn isolated session");
        let mut scope = ProcessScope::attach(child.id(), None).expect("attach isolated session");

        let mut signal_attempts = 0;
        let error = scope
            .terminate_unix_with(&mut |_, _| {
                signal_attempts += 1;
                Err("injected signal failure".to_string())
            })
            .unwrap_err();
        assert!(error.contains("injected signal failure"));
        assert_eq!(signal_attempts, 1);
        assert_eq!(scope.unix_state, UnixScopeState::Anchored);
        assert!(!scope.active_process_ids().unwrap().is_empty());

        scope.terminate().expect("retry anchored cleanup");
        child.wait().expect("reap isolated session root");
        assert_eq!(scope.unix_state, UnixScopeState::Cleaned);
        assert!(scope.active_process_ids().unwrap().is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn natural_root_exit_keeps_zombie_anchor_while_descendant_lives() {
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "sleep 30 & exit 0"]);
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(())
                }
            });
        }
        let mut child = command.spawn().expect("spawn isolated session");
        let root_pid = child.id();
        let mut scope = ProcessScope::attach(root_pid, None).expect("attach isolated session");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            let mut info = std::mem::MaybeUninit::<libc::siginfo_t>::zeroed();
            let result = unsafe {
                libc::waitid(
                    libc::P_PID,
                    root_pid as libc::id_t,
                    info.as_mut_ptr(),
                    libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
                )
            };
            assert_eq!(
                result,
                0,
                "waitid failed: {}",
                std::io::Error::last_os_error()
            );
            let info = unsafe { info.assume_init() };
            if unsafe { info.si_pid() } != 0 {
                break;
            }
            assert!(std::time::Instant::now() < deadline, "root did not exit");
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        let active = scope.active_process_ids().unwrap();
        assert!(!active.is_empty());
        assert!(!active.contains(&root_pid));

        scope.terminate().expect("terminate surviving descendant");
        child.wait().expect("reap anchored root");
        assert!(scope.active_process_ids().unwrap().is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn reaped_anchor_fails_closed_without_signals() {
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
        let mut child = command.spawn().expect("spawn short isolated session");
        let mut scope = ProcessScope::attach(child.id(), None).expect("attach isolated session");
        child.wait().expect("reap root unexpectedly");

        assert!(scope
            .active_process_ids()
            .unwrap_err()
            .contains("所有权锚点已丢失"));
        let mut signal_attempts = 0;
        let error = scope
            .terminate_unix_with(&mut |_, _| {
                signal_attempts += 1;
                Ok(())
            })
            .unwrap_err();
        assert!(error.contains("所有权锚点已丢失"));
        assert_eq!(signal_attempts, 0);
        assert_eq!(scope.unix_state, UnixScopeState::Anchored);
    }
}
