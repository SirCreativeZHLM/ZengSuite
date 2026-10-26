#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "People",
    id: "com.zengbot.suite.contacts",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    size: (980.0, 700.0),
    min_size: (640.0, 440.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
