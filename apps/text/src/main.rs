#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "Text",
    id: "com.zengbot.suite.text",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    size: (820.0, 640.0),
    min_size: (420.0, 300.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
