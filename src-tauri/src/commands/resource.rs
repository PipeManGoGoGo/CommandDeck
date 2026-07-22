use crate::state::PtyState;
use serde::Serialize;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::collections::HashMap;
use std::collections::HashSet;
use std::process::Command;
use tauri::State;

#[derive(Debug, Clone)]
struct ProcessInfo {
    pid: u32,
    parent_pid: u32,
    cpu_percent: f32,
    memory_bytes: u64,
    threads: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    system_cpu_percent: f32,
    system_memory_used_bytes: u64,
    system_memory_total_bytes: u64,
    managed_cpu_percent: f32,
    managed_memory_bytes: u64,
    managed_processes: usize,
    managed_threads: usize,
    terminal_instances: usize,
}

#[tauri::command]
pub async fn get_resource_snapshot(state: State<'_, PtyState>) -> Result<ResourceSnapshot, String> {
    let (root_pids, terminal_instances) = {
        let ptys = state
            .ptys
            .lock()
            .map_err(|_| "pty state lock poisoned".to_string())?;
        let roots = ptys
            .values()
            .filter_map(|handle| handle.child.process_id())
            .collect::<HashSet<_>>();
        (roots, ptys.len())
    };

    tauri::async_runtime::spawn_blocking(move || collect_snapshot(root_pids, terminal_instances))
        .await
        .map_err(|error| error.to_string())?
}

fn collect_snapshot(
    root_pids: HashSet<u32>,
    terminal_instances: usize,
) -> Result<ResourceSnapshot, String> {
    let (processes, system_cpu_percent, system_memory_used_bytes, system_memory_total_bytes) =
        collect_platform_metrics()?;
    let managed_ids = descendant_processes(&processes, &root_pids);

    let mut managed_cpu_percent = 0.0;
    let mut managed_memory_bytes = 0u64;
    let mut managed_threads = 0usize;
    for process in processes
        .iter()
        .filter(|process| managed_ids.contains(&process.pid))
    {
        managed_cpu_percent += process.cpu_percent;
        managed_memory_bytes = managed_memory_bytes.saturating_add(process.memory_bytes);
        managed_threads = managed_threads.saturating_add(process.threads);
    }

    Ok(ResourceSnapshot {
        system_cpu_percent: bounded_percent(system_cpu_percent),
        system_memory_used_bytes,
        system_memory_total_bytes,
        managed_cpu_percent: bounded_percent(managed_cpu_percent),
        managed_memory_bytes,
        managed_processes: managed_ids.len(),
        managed_threads,
        terminal_instances,
    })
}

fn descendant_processes(processes: &[ProcessInfo], roots: &HashSet<u32>) -> HashSet<u32> {
    let mut managed = roots.clone();
    loop {
        let before = managed.len();
        for process in processes {
            if managed.contains(&process.parent_pid) {
                managed.insert(process.pid);
            }
        }
        if managed.len() == before {
            break;
        }
    }
    managed.retain(|pid| processes.iter().any(|process| process.pid == *pid));
    managed
}

fn bounded_percent(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(0.0, 100.0)
    } else {
        0.0
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn collect_platform_metrics() -> Result<(Vec<ProcessInfo>, f32, u64, u64), String> {
    let processes = collect_unix_processes()?;
    let cpu_percent = processes.iter().map(|process| process.cpu_percent).sum();
    let (memory_used, memory_total) = collect_unix_memory()?;
    Ok((processes, cpu_percent, memory_used, memory_total))
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn collect_unix_processes() -> Result<Vec<ProcessInfo>, String> {
    #[cfg(target_os = "macos")]
    let fields = "pid=,ppid=,%cpu=,rss=";
    #[cfg(target_os = "linux")]
    let fields = "pid=,ppid=,%cpu=,rss=,nlwp=";

    let output = Command::new("ps")
        .args(["-A", "-o", fields])
        .env("LC_ALL", "C")
        .output()
        .map_err(|error| format!("无法读取进程信息：{error}"))?;
    if !output.status.success() {
        return Err("读取进程信息失败".to_string());
    }

    #[cfg(target_os = "macos")]
    let thread_counts = collect_macos_thread_counts();
    let logical_cpus = std::thread::available_parallelism()
        .map(|count| count.get() as f32)
        .unwrap_or(1.0);

    let mut processes = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let columns = line.split_whitespace().collect::<Vec<_>>();
        #[cfg(target_os = "macos")]
        if columns.len() < 4 {
            continue;
        }
        #[cfg(target_os = "linux")]
        if columns.len() < 5 {
            continue;
        }

        let Some(pid) = columns[0].parse::<u32>().ok() else {
            continue;
        };
        let parent_pid = columns[1].parse::<u32>().unwrap_or(0);
        let raw_cpu = columns[2].parse::<f32>().unwrap_or(0.0);
        let memory_bytes = columns[3].parse::<u64>().unwrap_or(0).saturating_mul(1024);
        #[cfg(target_os = "macos")]
        let threads = thread_counts.get(&pid).copied().unwrap_or(1);
        #[cfg(target_os = "linux")]
        let threads = columns[4].parse::<usize>().unwrap_or(1);

        processes.push(ProcessInfo {
            pid,
            parent_pid,
            cpu_percent: raw_cpu / logical_cpus,
            memory_bytes,
            threads,
        });
    }
    Ok(processes)
}

#[cfg(target_os = "macos")]
fn collect_macos_thread_counts() -> HashMap<u32, usize> {
    let Ok(output) = Command::new("ps")
        .args(["-M", "-A"])
        .env("LC_ALL", "C")
        .output()
    else {
        return HashMap::new();
    };
    let mut counts = HashMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines().skip(1) {
        if let Some(pid) = line
            .split_whitespace()
            .nth(1)
            .and_then(|value| value.parse::<u32>().ok())
        {
            *counts.entry(pid).or_insert(0) += 1;
        }
    }
    counts
}

#[cfg(target_os = "linux")]
fn collect_unix_memory() -> Result<(u64, u64), String> {
    let data = std::fs::read_to_string("/proc/meminfo")
        .map_err(|error| format!("无法读取内存信息：{error}"))?;
    let values = data
        .lines()
        .filter_map(|line| {
            let (name, value) = line.split_once(':')?;
            let kib = value.split_whitespace().next()?.parse::<u64>().ok()?;
            Some((name, kib.saturating_mul(1024)))
        })
        .collect::<HashMap<_, _>>();
    let total = values.get("MemTotal").copied().unwrap_or(0);
    let available = values.get("MemAvailable").copied().unwrap_or(0);
    Ok((total.saturating_sub(available), total))
}

#[cfg(target_os = "macos")]
fn collect_unix_memory() -> Result<(u64, u64), String> {
    let total_output = Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .map_err(|error| format!("无法读取内存总量：{error}"))?;
    let total = String::from_utf8_lossy(&total_output.stdout)
        .trim()
        .parse::<u64>()
        .map_err(|error| format!("内存总量格式无效：{error}"))?;

    let vm_output = Command::new("vm_stat")
        .output()
        .map_err(|error| format!("无法读取内存状态：{error}"))?;
    let text = String::from_utf8_lossy(&vm_output.stdout);
    let page_size = text
        .lines()
        .next()
        .and_then(|line| line.split("page size of ").nth(1))
        .and_then(|value| value.split_whitespace().next())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(4096);
    let pages = text
        .lines()
        .filter_map(|line| {
            let (name, value) = line.split_once(':')?;
            let count = value.trim().trim_end_matches('.').parse::<u64>().ok()?;
            Some((name, count))
        })
        .collect::<HashMap<_, _>>();
    let available_pages = ["Pages free", "Pages inactive", "Pages speculative"]
        .iter()
        .filter_map(|name| pages.get(name))
        .sum::<u64>();
    let available = available_pages.saturating_mul(page_size).min(total);
    Ok((total.saturating_sub(available), total))
}

#[cfg(target_os = "windows")]
fn collect_platform_metrics() -> Result<(Vec<ProcessInfo>, f32, u64, u64), String> {
    let script = r#"
$logical = [Math]::Max(1, [Environment]::ProcessorCount)
$first = @{}
Get-Process -ErrorAction SilentlyContinue | ForEach-Object { if ($null -ne $_.CPU) { $first[$_.Id] = $_.CPU } }
Start-Sleep -Milliseconds 200
$cpu = @{}
Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
  if ($null -ne $_.CPU -and $first.ContainsKey($_.Id)) {
    $cpu[$_.Id] = [Math]::Max(0, ($_.CPU - $first[$_.Id]) / 0.2 / $logical * 100)
  }
}
$os = Get-CimInstance Win32_OperatingSystem
$systemCpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$processes = @(Get-CimInstance Win32_Process | ForEach-Object {
  [pscustomobject]@{
    pid = [uint32]$_.ProcessId
    parentPid = [uint32]$_.ParentProcessId
    cpu = if ($cpu.ContainsKey([int]$_.ProcessId)) { [double]$cpu[[int]$_.ProcessId] } else { 0 }
    memory = [uint64]$_.WorkingSetSize
    threads = [uint32]$_.ThreadCount
  }
})
[pscustomobject]@{
  systemCpu = [double]$systemCpu
  totalMemory = [uint64]$os.TotalVisibleMemorySize * 1024
  availableMemory = [uint64]$os.FreePhysicalMemory * 1024
  processes = $processes
} | ConvertTo-Json -Depth 3 -Compress
"#;
    let output = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ])
        .output()
        .map_err(|error| format!("无法读取资源信息：{error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("资源信息格式无效：{error}"))?;
    let total = value["totalMemory"].as_u64().unwrap_or(0);
    let available = value["availableMemory"].as_u64().unwrap_or(0);
    let processes = value["processes"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|process| ProcessInfo {
            pid: process["pid"].as_u64().unwrap_or(0) as u32,
            parent_pid: process["parentPid"].as_u64().unwrap_or(0) as u32,
            cpu_percent: process["cpu"].as_f64().unwrap_or(0.0) as f32,
            memory_bytes: process["memory"].as_u64().unwrap_or(0),
            threads: process["threads"].as_u64().unwrap_or(0) as usize,
        })
        .collect();
    Ok((
        processes,
        value["systemCpu"].as_f64().unwrap_or(0.0) as f32,
        total.saturating_sub(available),
        total,
    ))
}

#[cfg(test)]
mod tests {
    use super::{collect_snapshot, descendant_processes, ProcessInfo};
    use std::collections::HashSet;

    #[test]
    fn finds_the_complete_managed_process_tree() {
        let processes = vec![
            ProcessInfo {
                pid: 10,
                parent_pid: 1,
                cpu_percent: 0.0,
                memory_bytes: 0,
                threads: 1,
            },
            ProcessInfo {
                pid: 11,
                parent_pid: 10,
                cpu_percent: 0.0,
                memory_bytes: 0,
                threads: 1,
            },
            ProcessInfo {
                pid: 12,
                parent_pid: 11,
                cpu_percent: 0.0,
                memory_bytes: 0,
                threads: 1,
            },
            ProcessInfo {
                pid: 20,
                parent_pid: 1,
                cpu_percent: 0.0,
                memory_bytes: 0,
                threads: 1,
            },
        ];
        let roots = HashSet::from([10]);
        assert_eq!(
            descendant_processes(&processes, &roots),
            HashSet::from([10, 11, 12])
        );
    }

    #[test]
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn collects_live_system_resources() {
        let snapshot = collect_snapshot(HashSet::from([std::process::id()]), 1)
            .expect("collect system resources");
        assert!(snapshot.system_memory_total_bytes > 0);
        assert!(snapshot.system_memory_used_bytes <= snapshot.system_memory_total_bytes);
        assert!((0.0..=100.0).contains(&snapshot.system_cpu_percent));
        assert_eq!(snapshot.terminal_instances, 1);
        assert!(snapshot.managed_processes >= 1);
        assert!(snapshot.managed_threads >= 1);
        assert!(snapshot.managed_memory_bytes > 0);
    }
}
