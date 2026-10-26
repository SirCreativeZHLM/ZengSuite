#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "Look",
    id: "com.zengbot.suite.preview",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    size: (1100.0, 800.0),
    min_size: (640.0, 480.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
