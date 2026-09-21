use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "__pycache__",
    ".venv",
    ".DS_Store",
];

#[derive(Deserialize)]
pub struct PackSource {
    pub src: String,
    pub dest: String,
}

fn skip_name(name: &str) -> bool {
    SKIP_DIRS.iter().any(|skip| skip.eq_ignore_ascii_case(name))
}

fn safe_rel(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if path.is_absolute() {
        return Err("打包路径必须是相对路径".to_string());
    }
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err("打包路径不合法".to_string()),
        }
    }
    if out.as_os_str().is_empty() {
        return Err("打包路径为空".to_string());
    }
    Ok(out)
}

fn copy_tree(src: &Path, dest: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    if src.is_file() {
        if fs::metadata(src).map(|m| m.len()).unwrap_or(0) > 32 * 1024 * 1024 {
            return Ok(());
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::copy(src, dest).map_err(|error| error.to_string())?;
        return Ok(());
    }
    fs::create_dir_all(dest).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(src).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        if skip_name(&name.to_string_lossy()) {
            continue;
        }
        copy_tree(&entry.path(), &dest.join(name))?;
    }
    Ok(())
}

fn run(cmd: &mut Command) -> Result<(), String> {
    let status = cmd.status().map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("打包命令失败：{status}"))
    }
}

fn zip_dir(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let _ = fs::remove_file(dest);
    #[cfg(target_os = "macos")]
    {
        run(Command::new("ditto").args(["-c", "-k"]).arg(src).arg(dest))
    }
    #[cfg(not(target_os = "macos"))]
    {
        run(Command::new("tar")
            .arg("-a")
            .arg("-cf")
            .arg(dest)
            .arg("-C")
            .arg(src)
            .arg("."))
    }
}

fn unzip_file(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    {
        run(Command::new("ditto").args(["-x", "-k"]).arg(src).arg(dest))
    }
    #[cfg(not(target_os = "macos"))]
    {
        run(Command::new("tar").arg("-xf").arg(src).arg("-C").arg(dest))
    }
}

#[tauri::command]
pub fn export_pack(dest: String, manifest: String, sources: Vec<PackSource>) -> Result<(), String> {
    let dest_path = PathBuf::from(dest.trim());
    if dest_path.as_os_str().is_empty() {
        return Err("导出路径为空".to_string());
    }
    let staging = std::env::temp_dir().join(format!("commanddeck-pack-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    let result = (|| {
        fs::write(staging.join("manifest.json"), manifest).map_err(|error| error.to_string())?;
        for source in sources {
            let src = PathBuf::from(source.src.trim());
            let dest_rel = safe_rel(&source.dest)?;
            copy_tree(&src, &staging.join(dest_rel))?;
        }
        zip_dir(&staging, &dest_path)
    })();
    let _ = fs::remove_dir_all(&staging);
    result
}

#[derive(Serialize)]
pub struct ExtractedPack {
    pub manifest: String,
    pub root: String,
}

#[tauri::command]
pub fn extract_pack(src: String, dest: String) -> Result<ExtractedPack, String> {
    let src_path = PathBuf::from(src.trim());
    let dest_path = PathBuf::from(dest.trim());
    if !src_path.is_file() {
        return Err("找不到工具包文件".to_string());
    }
    if dest_path.as_os_str().is_empty() {
        return Err("解压目录为空".to_string());
    }
    let _ = fs::remove_dir_all(&dest_path);
    if let Err(error) = unzip_file(&src_path, &dest_path) {
        let _ = fs::remove_dir_all(&dest_path);
        return Err(error);
    }
    let direct = dest_path.join("manifest.json");
    if direct.is_file() {
        return Ok(ExtractedPack {
            manifest: fs::read_to_string(direct).map_err(|error| error.to_string())?,
            root: dest_path.to_string_lossy().into_owned(),
        });
    }
    let nested = fs::read_dir(&dest_path)
        .map_err(|error| error.to_string())
        .and_then(|entries| {
            for entry in entries {
                let dir = entry.map_err(|error| error.to_string())?.path();
                let nested = dir.join("manifest.json");
                if nested.is_file() {
                    return Ok(Some(ExtractedPack {
                        manifest: fs::read_to_string(nested).map_err(|error| error.to_string())?,
                        root: dir.to_string_lossy().into_owned(),
                    }));
                }
            }
            Ok(None)
        });
    match nested {
        Ok(Some(pack)) => Ok(pack),
        Ok(None) => {
            let _ = fs::remove_dir_all(&dest_path);
            Err("工具包里没有 manifest.json".to_string())
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&dest_path);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn copy_dir(src: String, dest: String) -> Result<(), String> {
    copy_tree(&PathBuf::from(src.trim()), &PathBuf::from(dest.trim()))
}

#[tauri::command]
pub fn remove_import_temp(path: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if path.file_name().and_then(|n| n.to_str()) != Some(".commanddeck-import") {
        return Err("只能删除导入临时目录".to_string());
    }
    let _ = fs::remove_dir_all(path);
    Ok(())
}
