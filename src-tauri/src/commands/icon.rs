#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use uuid::Uuid;

#[tauri::command]
pub fn convert_icon(bytes: Vec<u8>, filename: String) -> Result<Vec<u8>, String> {
    if bytes.len() > 12 * 1024 * 1024 {
        return Err("图标不能超过 12 MB".into());
    }

    #[cfg(target_os = "macos")]
    {
        convert_with_sips(&bytes, &filename)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = filename;
        Err("当前系统无法转换 ICNS，请改用 PNG / JPEG / WebP".into())
    }
}

#[cfg(target_os = "macos")]
fn convert_with_sips(bytes: &[u8], filename: &str) -> Result<Vec<u8>, String> {
    let ext = PathBuf::from(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("icns")
        .to_ascii_lowercase();
    let ext = match ext.as_str() {
        "icns" | "icn" | "ico" | "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tif"
        | "tiff" => ext,
        _ => "icns".into(),
    };

    let id = Uuid::new_v4();
    let dir = std::env::temp_dir();
    let input = dir.join(format!("commanddeck-icon-{id}.{ext}"));
    let output = dir.join(format!("commanddeck-icon-{id}.png"));
    fs::write(&input, bytes).map_err(|e| format!("无法写入临时图标：{e}"))?;

    let status = Command::new("sips")
        .args(["-Z", "256", "-s", "format", "png"])
        .arg(&input)
        .arg("--out")
        .arg(&output)
        .status()
        .map_err(|e| format!("无法调用系统图标转换：{e}"))?;

    let png = if status.success() {
        fs::read(&output).ok()
    } else {
        None
    };

    let _ = fs::remove_file(&input);
    let _ = fs::remove_file(&output);

    png.filter(|data| data.len() > 24)
        .ok_or_else(|| "系统无法转换此图标，请改用 PNG".into())
}
