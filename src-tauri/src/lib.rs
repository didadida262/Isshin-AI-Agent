use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

mod workspace;

use workspace::{
    is_excluded_dir_name, is_excluded_relative, is_probably_text, max_read_bytes,
    max_search_file_bytes, relative_display, resolve_work_path, workspace_root,
};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirResult {
    pub path: String,
    pub entries: Vec<DirEntryInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub query: String,
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
}

fn config_path() -> Result<PathBuf, String> {
    let dir = dirs::config_dir().ok_or("无法定位用户配置目录")?;
    let app_dir = dir.join("isshin-ai-agent");
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("config.json"))
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
fn read_work_file(relative_path: String) -> Result<FileReadResult, String> {
    let root = workspace_root()
        .canonicalize()
        .map_err(|e| format!("无法解析工作区: {e}"))?;
    let path = resolve_work_path(&relative_path)?;

    if path.is_dir() {
        return Err("目标是目录，请使用 list_work_dir".into());
    }

    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > max_read_bytes() {
        return Err(format!(
            "文件过大（{} bytes），超过 {} bytes 限制",
            metadata.len(),
            max_read_bytes()
        ));
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let rel = relative_display(&path, &root);

    Ok(FileReadResult {
        filename: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| rel.clone()),
        content,
        path: rel,
    })
}

#[tauri::command]
fn list_work_dir(relative_path: String) -> Result<ListDirResult, String> {
    let root = workspace_root()
        .canonicalize()
        .map_err(|e| format!("无法解析工作区: {e}"))?;
    let path = resolve_work_path(&relative_path)?;

    if !path.is_dir() {
        return Err("目标是文件，请使用 read_work_file".into());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = relative_display(&entry.path(), &root);

        if is_excluded_relative(Path::new(&rel)) {
            continue;
        }

        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        entries.push(DirEntryInfo {
            name,
            path: rel,
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));

    Ok(ListDirResult {
        path: relative_display(&path, &root),
        entries,
    })
}

fn should_skip_entry(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }
    entry
        .path()
        .file_name()
        .map(|name| is_excluded_dir_name(&name.to_string_lossy()))
        .unwrap_or(false)
}

#[tauri::command]
fn search_work_text(query: String, limit: Option<usize>) -> Result<SearchResult, String> {
    let root = workspace_root()
        .canonicalize()
        .map_err(|e| format!("无法解析工作区: {e}"))?;
    let needle = query.trim();
    if needle.is_empty() {
        return Err("搜索关键词不能为空".into());
    }

    let max_matches = limit.unwrap_or(30).min(100);
    let needle_lower = needle.to_lowercase();
    let mut matches = Vec::new();
    let mut truncated = false;

    'walk: for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(should_skip_entry)
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let rel = relative_display(path, &root);
        if is_excluded_relative(Path::new(&rel)) {
            continue;
        }

        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.len() > max_search_file_bytes() {
            continue;
        }

        let bytes = match fs::read(path) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if !is_probably_text(&bytes) {
            continue;
        }

        let content = match String::from_utf8(bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };

        for (idx, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&needle_lower) {
                matches.push(SearchMatch {
                    path: rel.clone(),
                    line: idx + 1,
                    text: line.trim().to_string(),
                });
                if matches.len() >= max_matches {
                    truncated = true;
                    break 'walk;
                }
            }
        }
    }

    Ok(SearchResult {
        query: needle.to_string(),
        matches,
        truncated,
    })
}

/// 兼容旧 Agent 调用
#[tauri::command]
fn read_project_file(filename: String) -> Result<FileReadResult, String> {
    read_work_file(filename)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            read_work_file,
            list_work_dir,
            search_work_text,
            read_project_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
