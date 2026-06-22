use std::path::{Component, Path, PathBuf};

/// Agent 只读沙箱根目录
pub const WORKSPACE_ROOT: &str = "/Users/miles_wang/Desktop/work";

const EXCLUDED_DIR_NAMES: &[&str] = &[
    "node_modules",
    ".git",
    "Library",
    "target",
    "dist",
    ".next",
    ".turbo",
    "build",
    ".cache",
    ".cursor",
    "__pycache__",
    ".venv",
    "venv",
    "Pods",
    ".idea",
    ".vscode",
];

const MAX_READ_BYTES: u64 = 512 * 1024;
const MAX_SEARCH_FILE_BYTES: u64 = 256 * 1024;

pub fn workspace_root() -> PathBuf {
    PathBuf::from(WORKSPACE_ROOT)
}

pub fn is_excluded_dir_name(name: &str) -> bool {
    EXCLUDED_DIR_NAMES.iter().any(|excluded| name == *excluded)
}

pub fn is_excluded_relative(relative: &Path) -> bool {
    relative.components().any(|component| {
        if let Component::Normal(name) = component {
            is_excluded_dir_name(&name.to_string_lossy())
        } else {
            false
        }
    })
}

pub fn resolve_work_path(relative: &str) -> Result<PathBuf, String> {
    let root = workspace_root();
    if !root.exists() {
        return Err(format!("工作区不存在: {}", root.display()));
    }

    let root = root
        .canonicalize()
        .map_err(|e| format!("无法解析工作区路径: {e}"))?;

    let trimmed = relative.trim().trim_start_matches('/');
    let target = if trimmed.is_empty() {
        root.clone()
    } else {
        root.join(trimmed)
    };

    if !target.exists() {
        return Err(format!("路径不存在: {}", target.display()));
    }

    let canonical = target
        .canonicalize()
        .map_err(|e| format!("无法解析路径: {e}"))?;

    if !canonical.starts_with(&root) {
        return Err("路径超出工作区范围".into());
    }

    let rel = canonical
        .strip_prefix(&root)
        .map_err(|_| "路径解析失败".to_string())?;

    if is_excluded_relative(rel) {
        return Err("该路径位于排除目录中".into());
    }

    Ok(canonical)
}

pub fn relative_display(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .map(|p| {
            if p.as_os_str().is_empty() {
                ".".to_string()
            } else {
                p.display().to_string()
            }
        })
        .unwrap_or_else(|_| path.display().to_string())
}

pub fn max_read_bytes() -> u64 {
    MAX_READ_BYTES
}

pub fn max_search_file_bytes() -> u64 {
    MAX_SEARCH_FILE_BYTES
}

pub fn is_probably_text(content: &[u8]) -> bool {
    if content.is_empty() {
        return true;
    }
    if content.iter().take(8000).any(|b| *b == 0) {
        return false;
    }
    true
}
