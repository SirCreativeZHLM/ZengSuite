#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "Notes",
    id: "com.zengbot.suite.notes",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    size: (1120.0, 760.0),
    min_size: (700.0, 480.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
