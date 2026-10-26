#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "Write",
    id: "com.zengbot.suite.pages",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    size: (1180.0, 820.0),
    min_size: (760.0, 520.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
