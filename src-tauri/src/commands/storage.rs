use crate::state::StorageState;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn read_json(dir: &Path, filename: &str) -> Result<String, String> {
    let path = dir.join(filename);
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

fn write_json(dir: &Path, filename: &str, data: &str) -> Result<(), String> {
    let path = dir.join(filename);
    let temporary_path = dir.join(format!(".{filename}.{}.tmp", Uuid::new_v4()));
    let mut temporary_file = fs::File::create(&temporary_path).map_err(|e| e.to_string())?;
    if let Err(error) = temporary_file
        .write_all(data.as_bytes())
        .and_then(|_| temporary_file.sync_all())
    {
        let _ = fs::remove_file(&temporary_path);
        return Err(error.to_string());
    }
    drop(temporary_file);

    #[cfg(target_os = "windows")]
    if path.exists() {
        if let Err(error) = fs::remove_file(&path) {
            let _ = fs::remove_file(&temporary_path);
            return Err(error.to_string());
        }
    }

    if let Err(error) = fs::rename(&temporary_path, &path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn read_tools(dir: String, state: State<'_, StorageState>) -> Result<String, String> {
    let _guard = state
        .writes
        .lock()
        .map_err(|_| "storage state lock poisoned".to_string())?;
    let path = PathBuf::from(&dir);
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    read_json(&path, "tools.json")
}

#[tauri::command]
pub fn write_tools(
    dir: String,
    data: String,
    state: State<'_, StorageState>,
) -> Result<(), String> {
    let _guard = state
        .writes
        .lock()
        .map_err(|_| "storage state lock poisoned".to_string())?;
    let path = PathBuf::from(&dir);
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    write_json(&path, "tools.json", &data)
}

#[tauri::command]
pub fn read_categories(dir: String, state: State<'_, StorageState>) -> Result<String, String> {
    let _guard = state
        .writes
        .lock()
        .map_err(|_| "storage state lock poisoned".to_string())?;
    let path = PathBuf::from(&dir);
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    read_json(&path, "categories.json")
}

#[tauri::command]
pub fn write_categories(
    dir: String,
    data: String,
    state: State<'_, StorageState>,
) -> Result<(), String> {
    let _guard = state
        .writes
        .lock()
        .map_err(|_| "storage state lock poisoned".to_string())?;
    let path = PathBuf::from(&dir);
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    write_json(&path, "categories.json", &data)
}

#[tauri::command]
pub fn read_settings(app: AppHandle, state: State<'_, StorageState>) -> Result<String, String> {
    let _guard = state
        .writes
        .lock()
        .map_err(|_| "storage state lock poisoned".to_string())?;
    let dir = data_dir(&app)?;
    let path = dir.join("settings.json");
    if !path.exists() {
        // v0.1 originally used a bundle identifier ending in `.app`. Migrate
        // that settings file once so existing workspaces keep opening.
        if let Some(parent) = dir.parent() {
            let legacy_path = parent.join("com.secbox.app").join("settings.json");
            if legacy_path.exists() {
                let data = fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
                write_json(&dir, "settings.json", &data)?;
                return Ok(data);
            }
        }
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_settings(
    app: AppHandle,
    data: String,
    state: State<'_, StorageState>,
) -> Result<(), String> {
    let _guard = state
        .writes
        .lock()
        .map_err(|_| "storage state lock poisoned".to_string())?;
    write_json(&data_dir(&app)?, "settings.json", &data)
}

#[cfg(test)]
mod tests {
    use super::{read_json, write_json};
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn json_write_replaces_existing_data_without_leaving_temp_files() {
        let dir = std::env::temp_dir().join(format!("secbox-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create test directory");

        write_json(&dir, "tools.json", "[1]").expect("write initial data");
        write_json(&dir, "tools.json", "[2]").expect("replace data");

        assert_eq!(read_json(&dir, "tools.json").unwrap(), "[2]");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).expect("remove test directory");
    }
}
