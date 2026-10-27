//! AgentFlow desktop shell (Session 1).
//!
//! Intentionally exposes no custom IPC commands and no plugins: no file
//! system, shell, process, or HTTP access. Grants and local steps arrive in M9.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running AgentFlow");
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    fn json(path: &str) -> Value {
        let text = std::fs::read_to_string(format!("{}/{}", env!("CARGO_MANIFEST_DIR"), path))
            .expect("readable config");
        serde_json::from_str(&text).expect("valid json")
    }

    /// B2: the shell grants only the version/name lookups it needs.
    #[test]
    fn capabilities_are_minimal() {
        let cap = json("capabilities/default.json");
        let perms: Vec<&str> = cap["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p.as_str().unwrap())
            .collect();
        assert_eq!(perms, ["core:app:allow-version", "core:app:allow-name"]);
    }

    #[test]
    fn csp_is_set_and_strict() {
        let conf = json("tauri.conf.json");
        let csp = conf["app"]["security"]["csp"].as_str().expect("csp set");
        assert!(csp.contains("default-src 'self'"));
        assert!(csp.contains("script-src 'self'"));
        assert!(!csp.contains("unsafe-eval"));
    }

    #[test]
    fn no_dangerous_plugins_in_manifest() {
        let manifest =
            std::fs::read_to_string(format!("{}/Cargo.toml", env!("CARGO_MANIFEST_DIR"))).unwrap();
        let deps = manifest.split("[dependencies]").nth(1).unwrap();
        for banned in [
            "tauri-plugin-shell",
            "tauri-plugin-fs",
            "tauri-plugin-http",
            "tauri-plugin-process",
        ] {
            assert!(!deps.contains(banned), "{banned} must not be a dependency");
        }
    }
}
