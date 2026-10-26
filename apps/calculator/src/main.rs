#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use include_dir::{include_dir, Dir};
use zeng_shell::AppSpec;

static UI: Dir = include_dir!("$CARGO_MANIFEST_DIR/ui");
static SPEC: AppSpec = AppSpec {
    name: "Calc",
    id: "com.zengbot.suite.calculator",
    version: env!("CARGO_PKG_VERSION"),
    ui: &UI,
    // Basic mode size; the page resizes the window per mode via the `window_size` command.
    size: (300.0, 480.0),
    min_size: (300.0, 480.0),
};

fn main() {
    zeng_shell::run(&SPEC);
}
