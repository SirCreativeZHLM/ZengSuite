#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "Numbers",
    id: "com.zengbot.suite.numbers",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    size: (1280.0, 820.0),
    min_size: (760.0, 520.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
