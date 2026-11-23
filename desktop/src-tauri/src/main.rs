#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use serde::Deserialize;
use serde_json::Value;
use std::{
    env, fs,
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

const RUNTIME_ORIGIN: &str = "http://127.0.0.1:43405";
mod repository_picker;

#[derive(Deserialize)]
struct RuntimeConfig {
    token: String,
    port: u16,
    #[serde(rename = "nodePath")]
    node_path: Option<String>,
    #[serde(rename = "serverPath")]
    server_path: Option<String>,
}

struct RuntimeState {
    startup: Arc<Mutex<()>>,
}

fn config_path() -> Result<PathBuf, String> {
    if let Some(value) = env::var_os("CODEITZ_DESKTOP_CONFIG") {
        return Ok(PathBuf::from(value));
    }
    env::var_os("LOCALAPPDATA")
        .map(|value| {
            PathBuf::from(value)
                .join("CodeitzDesktop")
                .join("runtime.json")
        })
        .ok_or_else(|| "Local runtime configuration is not installed.".to_string())
}

fn read_config() -> Result<RuntimeConfig, String> {
    let content = fs::read(config_path()?).map_err(|_| {
        "Local runtime configuration could not be read. Run the local setup first.".to_string()
    })?;
    let config: RuntimeConfig = serde_json::from_slice(&content)
        .map_err(|_| "Local runtime configuration is invalid.".to_string())?;
    if config.port != 43405 || config.token.len() < 32 {
        return Err("Local runtime configuration failed its port or credential check.".into());
    }
    Ok(config)
}

fn client() -> Result<reqwest::blocking::Client, String> {
    client_with_timeout(15)
}

fn client_with_timeout(seconds: u64) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(seconds))
        .build()
        .map_err(|_| "Local runtime connection could not be prepared.".into())
}

fn allowed_request(method: &str, path: &str) -> bool {
    if method == "GET" {
        return path == "/api/runtime/state"
            || attachment_route(path) == Some("preview")
            || activity_route(path);
    }
    if method != "POST" {
        return false;
    }
    if path == "/api/runtime/memory/list" || path == "/api/runtime/memory/save" {
        return true;
    }
    if attachment_route(path) == Some("remove") {
        return true;
    }
    let verification_parts: Vec<&str> = path.split('/').collect();
    if verification_parts.len() == 7
        && verification_parts[1] == "api"
        && verification_parts[2] == "runtime"
        && verification_parts[3] == "workers"
        && runtime_id(verification_parts[4])
        && verification_parts[5] == "verification"
        && ["prepare", "approve"].contains(&verification_parts[6])
    {
        return true;
    }
    if path == "/api/runtime/conversations"
        || path == "/api/runtime/workers"
        || path == "/api/runtime/apps"
    {
        return true;
    }
    let segments: Vec<&str> = path.split('/').collect();
    if segments.len() != 6 || segments[1] != "api" || segments[2] != "runtime" {
        return false;
    }
    let id = segments[4];
    if id.len() != 36 || !id.bytes().all(|ch| ch.is_ascii_hexdigit() || ch == b'-') {
        return false;
    }
    match (segments[3], segments[5]) {
        ("conversations", "messages")
        | ("conversations", "coworkers")
        | ("conversations", "attachments")
        | ("apps", "inspect")
        | ("workers", "approve")
        | ("workers", "reject")
        | ("workers", "changes")
        | ("workers", "apply")
        | ("operations", "resolve")
        | ("operations", "interrupt") => true,
        _ => false,
    }
}

fn runtime_id(value: &str) -> bool {
    value.len() == 36
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn activity_route(path: &str) -> bool {
    let Some((route, query)) = path.split_once('?') else {
        return false;
    };
    let parts: Vec<&str> = route.split('/').collect();
    if parts.len() != 6
        || parts[1] != "api"
        || parts[2] != "runtime"
        || parts[3] != "operations"
        || !runtime_id(parts[4])
        || parts[5] != "activity"
    {
        return false;
    }
    let mut after = false;
    let mut limit = false;
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            return false;
        };
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return false;
        }
        match key {
            "after" if !after => {
                if value.len() > 19
                    || value
                        .parse::<u64>()
                        .map(|number| number > i64::MAX as u64)
                        .unwrap_or(true)
                {
                    return false;
                }
                after = true;
            }
            "limit" if !limit => {
                if !value
                    .parse::<u32>()
                    .map(|number| (1..=100).contains(&number))
                    .unwrap_or(false)
                {
                    return false;
                }
                limit = true;
            }
            _ => return false,
        }
    }
    after && limit
}

fn attachment_route(path: &str) -> Option<&'static str> {
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 6
        || parts[1] != "api"
        || parts[2] != "runtime"
        || parts[3] != "conversations"
        || !runtime_id(parts[4])
        || parts[5] != "attachments"
    {
        return None;
    }
    match parts.len() {
        6 => Some("stage"),
        7 if runtime_id(parts[6]) => Some("preview"),
        8 if runtime_id(parts[6]) && parts[7] == "remove" => Some("remove"),
        _ => None,
    }
}

fn request_limits(method: &str, path: &str) -> (usize, u64) {
    if method == "POST" && attachment_route(path) == Some("stage") {
        (7 * 1024 * 1024, 60)
    } else {
        (65536, 15)
    }
}

#[tauri::command]
async fn pick_repository() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(repository_picker::pick_repository)
        .await
        .map_err(|_| "Folder selection was interrupted.".to_string())?
}

#[tauri::command]
async fn runtime_request(
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    if !allowed_request(&method, &path) {
        return Err("This runtime action is not permitted.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let config = read_config()?;
        let (body_limit, timeout) = request_limits(&method, &path);
        let request = if method == "GET" {
            client()?.get(format!("{RUNTIME_ORIGIN}{path}"))
        } else {
            let value = body.ok_or("A request body is required.")?;
            if serde_json::to_vec(&value)
                .map_err(|_| "Invalid request body.")?
                .len()
                > body_limit
            {
                return Err("This request is too large.".into());
            }
            client_with_timeout(timeout)?
                .post(format!("{RUNTIME_ORIGIN}{path}"))
                .json(&value)
        };
        let response = request.bearer_auth(config.token).send().map_err(|_| {
            "The local runtime is unavailable. Reconnect to restore its saved state.".to_string()
        })?;
        let status = response.status();
        let value: Value = if attachment_route(&path) == Some("preview") {
            let mut bytes = Vec::new();
            response
                .take(7 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "The attachment preview could not be read.".to_string())?;
            if bytes.len() > 7 * 1024 * 1024 {
                return Err("The attachment preview exceeded its size limit.".into());
            }
            serde_json::from_slice(&bytes).map_err(|_| {
                "The local runtime returned an invalid attachment preview.".to_string()
            })?
        } else {
            response
                .json()
                .map_err(|_| "The local runtime returned an invalid response.".to_string())?
        };
        if !status.is_success() {
            let message = value
                .get("message")
                .or_else(|| value.get("error"))
                .and_then(Value::as_str)
                .unwrap_or("The local runtime rejected this action.");
            return Err(message.to_string());
        }
        Ok(value)
    })
    .await
    .map_err(|_| "Local runtime request was interrupted.".to_string())?
}

#[tauri::command]
async fn ensure_runtime(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let startup = state.startup.clone();
    tauri::async_runtime::spawn_blocking(move || start_runtime(startup))
        .await
        .map_err(|_| "Local runtime startup was interrupted.".to_string())?
}

fn start_runtime(startup: Arc<Mutex<()>>) -> Result<(), String> {
    let _guard = startup
        .lock()
        .map_err(|_| "Local runtime startup is unavailable.".to_string())?;
    let config = read_config()?;
    // A successful authenticated state request identifies our broker, not merely any process on its port.
    let authenticated = || {
        client()
            .ok()
            .and_then(|http| {
                http.get(format!("{RUNTIME_ORIGIN}/api/runtime/state"))
                    .bearer_auth(&config.token)
                    .send()
                    .ok()
            })
            .map(|response| response.status().is_success())
            .unwrap_or(false)
    };
    if authenticated() {
        return Ok(());
    }
    let script = env::var_os("CODEITZ_DESKTOP_SERVER")
        .map(PathBuf::from)
        .or_else(|| config.server_path.as_ref().map(PathBuf::from))
        .ok_or(
            "The runtime launcher is not configured. Use the installed Codeitz Desktop shortcut.",
        )?;
    if !script.is_absolute()
        || !script.is_file()
        || script.file_name().and_then(|name| name.to_str()) != Some("server.mjs")
    {
        return Err("The configured runtime entry is invalid.".into());
    }
    let script = fs::canonicalize(script)
        .map_err(|_| "The configured runtime entry cannot be resolved.".to_string())?;
    let node = env::var_os("CODEITZ_DESKTOP_NODE")
        .or_else(|| config.node_path.as_ref().map(Into::into))
        .unwrap_or_else(|| "node.exe".into());
    let mut command = Command::new(node);
    command
        .arg(&script)
        .env("CODEITZ_DESKTOP_CONFIG", config_path()?)
        .current_dir(script.parent().ok_or("Invalid runtime directory.")?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().map_err(|_| "The local runtime could not start. Check the installed Node.js runtime and local configuration.".to_string())?;
    for _ in 0..40 {
        if authenticated() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("The local runtime did not become ready. Your saved conversations remain in the local database.".into())
}

fn main() {
    tauri::Builder::default()
        .manage(RuntimeState {
            startup: Arc::new(Mutex::new(())),
        })
        .invoke_handler(tauri::generate_handler![
            runtime_request,
            ensure_runtime,
            pick_repository
        ])
        .run(tauri::generate_context!())
        .expect("Codeitz Desktop could not open");
}

#[cfg(test)]
mod tests {
    use super::{allowed_request, request_limits};

    #[test]
    fn activity_replay_and_verification_routes_are_exact_and_bounded() {
        let id = "12345678-1234-1234-1234-123456789abc";
        assert!(allowed_request(
            "GET",
            &format!("/api/runtime/operations/{id}/activity?after=9007199254740993&limit=100")
        ));
        for query in [
            "after=0&limit=101",
            "after=-1&limit=100",
            "after=9223372036854775808&limit=100",
            "after=0&after=1&limit=100",
            "after=0&limit=10&token=secret",
            "after=0",
            "after=0&limit=0",
        ] {
            assert!(!allowed_request(
                "GET",
                &format!("/api/runtime/operations/{id}/activity?{query}")
            ));
        }
        for action in ["prepare", "approve"] {
            let path = format!("/api/runtime/workers/{id}/verification/{action}");
            assert!(allowed_request("POST", &path));
            assert!(!allowed_request("GET", &path));
        }
        assert!(!allowed_request(
            "POST",
            &format!("/api/runtime/workers/{id}/verification/run")
        ));
    }

    #[test]
    fn native_proxy_only_allows_exact_runtime_actions() {
        let id = "12345678-1234-1234-1234-123456789abc";
        assert!(allowed_request("GET", "/api/runtime/state"));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/workers/{id}/approve")
        ));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/conversations/{id}/messages")
        ));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/operations/{id}/resolve")
        ));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/operations/{id}/interrupt")
        ));
        assert!(!allowed_request("POST", "/api/runtime/provider/interrupt"));
        assert!(!allowed_request(
            "DELETE",
            &format!("/api/runtime/operations/{id}/interrupt")
        ));
        assert!(!allowed_request(
            "POST",
            &format!("/api/runtime/operations/{id}/retry")
        ));
        assert!(!allowed_request(
            "POST",
            &format!("/api/runtime/workers/{id}/resolve")
        ));
        assert!(allowed_request("POST", "/api/runtime/apps"));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/apps/{id}/inspect")
        ));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/conversations/{id}/coworkers")
        ));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/workers/{id}/changes")
        ));
        assert!(allowed_request(
            "POST",
            &format!("/api/runtime/workers/{id}/apply")
        ));
        assert!(!allowed_request(
            "POST",
            &format!("/api/runtime/apps/{id}/shell")
        ));
        assert!(!allowed_request(
            "GET",
            &format!("/api/runtime/workers/{id}/apply")
        ));
        for path in [
            "http://evil.test/",
            "/api/runtime/state?token=x",
            "/api/runtime/../shell",
            "/api/runtime/workers/../../approve",
            "/health",
        ] {
            assert!(!allowed_request("POST", path));
        }
        assert!(!allowed_request("DELETE", "/api/runtime/conversations"));
    }

    #[test]
    fn memory_routes_are_exact_post_only() {
        for path in ["/api/runtime/memory/list", "/api/runtime/memory/save"] {
            assert!(allowed_request("POST", path));
            assert!(!allowed_request("GET", path));
            assert!(!allowed_request("DELETE", path));
            assert!(!allowed_request("POST", &format!("{path}?x=1")));
            assert!(!allowed_request("POST", &format!("{path}/extra")));
        }
        for path in ["/api/runtime/memory/shell", "/api/runtime/memory/approve", "/api/runtime/memory"] {
            assert!(!allowed_request("POST", path));
        }
    }

    #[test]
    fn attachment_routes_are_scoped_and_only_staging_has_larger_request_limits() {
        let conversation = "12345678-1234-1234-1234-123456789abc";
        let attachment = "abcdef12-1234-1234-1234-123456789abc";
        let stage = format!("/api/runtime/conversations/{conversation}/attachments");
        let preview = format!("{stage}/{attachment}");
        assert!(allowed_request("POST", &stage));
        assert!(allowed_request("GET", &preview));
        assert!(allowed_request("POST", &format!("{preview}/remove")));
        assert!(!allowed_request("GET", &stage));
        assert!(!allowed_request("POST", &preview));
        assert!(!allowed_request("DELETE", &preview));
        assert!(!allowed_request(
            "GET",
            &format!("{stage}/../../private.json")
        ));
        assert!(!allowed_request(
            "GET",
            &format!("{preview}?path=C:/private")
        ));
        assert_eq!(request_limits("POST", &stage), (7 * 1024 * 1024, 60));
        assert_eq!(
            request_limits(
                "POST",
                &format!("/api/runtime/workers/{conversation}/apply")
            ),
            (65536, 15)
        );
        assert_eq!(request_limits("GET", &preview), (65536, 15));
    }
}
