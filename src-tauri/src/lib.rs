use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub base_url: String,
    pub api_key: String,
    pub models: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub filename: String,
    pub content: String,
    pub path: String,
}

fn config_path() -> Result<PathBuf, String> {
    let dir = dirs::config_dir().ok_or("无法定位用户配置目录")?;
    let app_dir = dir.join("isshin-ai-agent");
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("config.json"))
}

fn project_root() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
fn load_config() -> Result<AppConfig, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    let path = config_path()?;
    let data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_project_file(filename: String) -> Result<FileReadResult, String> {
    let allowed = ["package.json", ".gitignore"];
    if !allowed.contains(&filename.as_str()) {
        return Err(format!("不允许读取的文件: {filename}"));
    }

    let root = project_root();
    let file_path = root.join(&filename);

    if !file_path.exists() {
        return Err(format!("文件不存在: {}", file_path.display()));
    }

    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    Ok(FileReadResult {
        filename: filename.clone(),
        content,
        path: file_path.display().to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            read_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
