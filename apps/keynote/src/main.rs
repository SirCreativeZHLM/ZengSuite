#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "Keynote",
    id: "com.zengbot.suite.keynote",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    size: (1360.0, 860.0),
    min_size: (900.0, 600.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
