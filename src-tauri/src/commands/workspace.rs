use std::path::Path;
use std::process::Command;

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    let trimmed = path.trim();
    !trimmed.is_empty() && Path::new(trimmed).exists()
}

#[tauri::command]
pub fn open_external(target: String) -> Result<(), String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("打开目标为空".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/c", "start", "", trimmed])
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::path_exists;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn path_exists_returns_false_for_empty_and_missing_paths() {
        assert!(!path_exists(String::new()));
        assert!(!path_exists("   ".to_string()));
        assert!(!path_exists(format!(
            "{}-missing-{}",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        )));
    }

    #[test]
    fn path_exists_returns_true_for_existing_directory() {
        let dir = std::env::temp_dir().join(format!("commanddeck-path-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create test directory");
        assert!(path_exists(dir.to_string_lossy().into_owned()));
        fs::remove_dir_all(dir).expect("remove test directory");
    }
}
