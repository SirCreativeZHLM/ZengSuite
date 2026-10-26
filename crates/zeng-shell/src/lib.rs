//! zeng-shell: the native host every ZengSuite app runs inside.
//!
//! One window (tao) + the OS web view (wry: WKWebView / WebView2 / WebKitGTK) that serves the
//! app's embedded `ui/` folder and the shared `kit/` over a private `zeng://` scheme. There is no
//! bundled browser and no Node runtime. Everything the page cannot do itself (file dialogs,
//! reading and writing documents, native menus, app storage) is reached through `zeng.call()`.

use include_dir::Dir;
use rust_embed::RustEmbed;
use serde_json::{json, Value};
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::{Window, WindowBuilder};
use wry::http::{Request, Response};
use wry::{DragDropEvent, WebView, WebViewBuilder};

#[derive(RustEmbed)]
#[folder = "kit/"]
struct Kit;

/// Everything that differs between apps.
pub struct AppSpec {
    /// Display name, e.g. "Pages".
    pub name: &'static str,
    /// Reverse-DNS style id used for the storage folder, e.g. "com.zengbot.suite.pages".
    pub id: &'static str,
    pub version: &'static str,
    /// The app's `ui/` folder, embedded at compile time with `include_dir!`.
    pub ui: &'static Dir<'static>,
    pub size: (f64, f64),
    pub min_size: (f64, f64),
}

enum Ev {
    Msg(String),
    Menu(String),
    Drop(Vec<String>),
    Opened(Vec<String>),
}

struct State {
    spec: &'static AppSpec,
    dirty: bool,
    #[cfg(target_os = "macos")]
    menu: Option<muda::Menu>,
}

pub fn run(spec: &'static AppSpec) {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK's DMA-BUF renderer shows a blank page on some drivers.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    let event_loop = EventLoopBuilder::<Ev>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let window = build_window(spec, &event_loop);

    #[cfg(target_os = "macos")]
    {
        let p = proxy.clone();
        muda::MenuEvent::set_event_handler(Some(move |e: muda::MenuEvent| {
            let _ = p.send_event(Ev::Menu(e.id.0.clone()));
        }));
    }

    let p_ipc = proxy.clone();
    let p_drop = proxy.clone();
    let builder = WebViewBuilder::new()
        .with_custom_protocol("zeng".into(), move |_, req| serve(spec, req))
        .with_ipc_handler(move |req| {
            let _ = p_ipc.send_event(Ev::Msg(req.body().clone()));
        })
        // File drops from the OS arrive as paths; in-page dragging uses pointer events.
        .with_drag_drop_handler(move |ev| {
            if let DragDropEvent::Drop { paths, .. } = ev {
                let list = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
                let _ = p_drop.send_event(Ev::Drop(list));
            }
            true
        })
        .with_navigation_handler(|url| {
            if url.starts_with("zeng:") || url.starts_with("http://zeng.localhost") || url.starts_with("about:blank") {
                true
            } else {
                let _ = open::that(&url);
                false
            }
        })
        .with_new_window_req_handler(|url, _| {
            let _ = open::that(&url);
            wry::NewWindowResponse::Deny
        })
        .with_devtools(cfg!(debug_assertions))
        .with_url(if cfg!(windows) { "http://zeng.localhost/index.html" } else { "zeng://localhost/index.html" });

    #[cfg(target_os = "linux")]
    let view = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        match window.default_vbox() {
            Some(vbox) => builder.build_gtk(vbox),
            None => Err(wry::Error::MessageSender),
        }
        .unwrap_or_else(|e| die(spec, e))
    };
    #[cfg(not(target_os = "linux"))]
    let view = builder.build(&window).unwrap_or_else(|e| die(spec, e));

    let mut state = State {
        spec,
        dirty: false,
        #[cfg(target_os = "macos")]
        menu: None,
    };
    install_default_menu(&mut state);

    // Files passed on the command line open like files handed over by the OS.
    let argv: Vec<String> = std::env::args().skip(1).filter(|a| !a.starts_with('-') && Path::new(a).exists()).collect();
    let mut pending_open = argv;

    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(Ev::Msg(m)) => {
                if let Ok(v) = serde_json::from_str::<Value>(&m) {
                    let id = v["id"].clone();
                    let reply = match handle(&v, &mut state, &window, &view, &proxy) {
                        Ok(data) => json!({"id": id, "ok": true, "data": data}),
                        Err(e) => json!({"id": id, "ok": false, "error": e}),
                    };
                    if !id.is_null() {
                        let _ = view.evaluate_script(&format!("zeng._reply({reply})"));
                    }
                    if v["cmd"] == "ready" && !pending_open.is_empty() {
                        emit(&view, "opened", json!(std::mem::take(&mut pending_open)));
                    }
                }
            }
            Event::UserEvent(Ev::Menu(id)) => emit(&view, "menu", json!(id)),
            Event::UserEvent(Ev::Drop(paths)) => emit(&view, "drop", json!(paths)),
            Event::UserEvent(Ev::Opened(paths)) => emit(&view, "opened", json!(paths)),
            Event::Opened { urls } => {
                let paths: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().into_owned()).collect();
                if !paths.is_empty() {
                    emit(&view, "opened", json!(paths));
                }
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                if state.dirty {
                    // The page owns the "save changes?" sheet and calls `quit` when ready.
                    emit(&view, "close", Value::Null);
                } else {
                    *flow = ControlFlow::Exit;
                }
            }
            Event::WindowEvent { event: WindowEvent::Focused(f), .. } => emit(&view, "focus", json!(f)),
            _ => {}
        }
        if QUIT.load(std::sync::atomic::Ordering::SeqCst) {
            *flow = ControlFlow::Exit;
        }
    });
}

static QUIT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn emit(view: &WebView, name: &str, data: Value) {
    let _ = view.evaluate_script(&format!("zeng._emit({},{})", json!(name), data));
}

fn build_window(spec: &AppSpec, el: &tao::event_loop::EventLoop<Ev>) -> Window {
    let b = WindowBuilder::new()
        .with_title(spec.name)
        .with_inner_size(LogicalSize::new(spec.size.0, spec.size.1))
        .with_min_inner_size(LogicalSize::new(spec.min_size.0, spec.min_size.1));
    #[cfg(target_os = "macos")]
    let b = {
        use tao::platform::macos::WindowBuilderExtMacOS;
        // Content runs under the title bar so the toolbar is the title bar, like a Mac app.
        b.with_titlebar_transparent(true).with_fullsize_content_view(true).with_title_hidden(true)
    };
    b.build(el).unwrap_or_else(|e| die(spec, e))
}

fn die(spec: &AppSpec, e: impl std::fmt::Display) -> ! {
    eprintln!("{} could not start: {e}", spec.name);
    if cfg!(target_os = "linux") {
        eprintln!("{} needs WebKitGTK 4.1 (package libwebkit2gtk-4.1-0) and GTK 3.", spec.name);
    }
    if cfg!(windows) {
        eprintln!("{} needs the Microsoft Edge WebView2 Runtime.", spec.name);
    }
    std::process::exit(1)
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        "wasm" => "application/wasm",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

const CSP: &str = "default-src 'self' zeng: http://zeng.localhost; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; \
img-src 'self' data: blob: zeng: http://zeng.localhost; media-src 'self' blob: data: zeng: http://zeng.localhost; font-src 'self' data:; \
worker-src 'self' blob:; connect-src 'self' data: blob: zeng: http://zeng.localhost; object-src 'none'; base-uri 'self'; frame-src 'self' blob: data:";

fn respond(status: u16, ct: &str, body: Vec<u8>) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header("Content-Type", ct)
        .header("Content-Security-Policy", CSP)
        .header("Cache-Control", "no-store")
        .header("Access-Control-Allow-Origin", "*")
        .body(Cow::Owned(body))
        .unwrap()
}

fn serve(spec: &'static AppSpec, req: Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let uri = req.uri();
    let path = percent_encoding::percent_decode_str(uri.path()).decode_utf8_lossy().into_owned();
    let path = path.trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    if path.split('/').any(|p| p == "..") {
        return respond(400, "text/plain", b"bad path".to_vec());
    }
    // Documents the user chose are streamed straight from disk: /__file?p=<absolute path>
    if path == "__file" {
        let p = uri
            .query()
            .and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("p=")))
            .map(|v| percent_encoding::percent_decode_str(v).decode_utf8_lossy().into_owned());
        return match p.and_then(|p| std::fs::read(&p).ok().map(|b| (p, b))) {
            Some((p, b)) => respond(200, mime(&p), b),
            None => respond(404, "text/plain", b"not found".to_vec()),
        };
    }
    if let Some(rest) = path.strip_prefix("kit/") {
        return match Kit::get(rest) {
            Some(f) => respond(200, mime(rest), f.data.into_owned()),
            None => respond(404, "text/plain", b"not found".to_vec()),
        };
    }
    match spec.ui.get_file(path) {
        Some(f) => respond(200, mime(path), f.contents().to_vec()),
        None => respond(404, "text/plain", b"not found".to_vec()),
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_default()
}

fn store_dir(spec: &AppSpec) -> PathBuf {
    let base = if cfg!(target_os = "macos") {
        home().join("Library/Application Support")
    } else if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home().join("AppData/Roaming"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".config"))
    };
    base.join("ZengSuite").join(spec.id)
}

fn safe_key(k: &str) -> Result<String, String> {
    if k.is_empty() || !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') || k.starts_with('.') {
        return Err("invalid key".into());
    }
    Ok(k.to_string())
}

fn filter_dialog(mut d: rfd::FileDialog, filters: &Value) -> rfd::FileDialog {
    if let Some(list) = filters.as_array() {
        for f in list {
            let exts: Vec<String> = f["exts"].as_array().map(|a| a.iter().filter_map(|e| e.as_str().map(String::from)).collect()).unwrap_or_default();
            if !exts.is_empty() {
                d = d.add_filter(f["name"].as_str().unwrap_or("Files"), &exts);
            }
        }
    }
    d
}

fn file_json(p: &Path) -> Value {
    let meta = std::fs::metadata(p).ok();
    json!({
        "path": p.to_string_lossy(),
        "name": p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        "size": meta.as_ref().map(|m| m.len()).unwrap_or(0),
        "modified": meta.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0),
    })
}

fn handle(v: &Value, st: &mut State, window: &Window, view: &WebView, proxy: &EventLoopProxy<Ev>) -> Result<Value, String> {
    let _ = proxy;
    let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
    match v["cmd"].as_str().unwrap_or("") {
        "ready" | "info" => Ok(json!({
            "name": st.spec.name, "id": st.spec.id, "version": st.spec.version,
            "platform": if cfg!(target_os = "macos") { "mac" } else if cfg!(windows) { "win" } else { "linux" },
            "home": home().to_string_lossy(),
        })),
        "title" => {
            window.set_title(&s("title"));
            Ok(Value::Null)
        }
        "dirty" => {
            st.dirty = v["dirty"].as_bool().unwrap_or(false);
            #[cfg(target_os = "macos")]
            {
                use tao::platform::macos::WindowExtMacOS;
                window.set_is_document_edited(st.dirty);
            }
            Ok(Value::Null)
        }
        "drag" => {
            let _ = window.drag_window();
            Ok(Value::Null)
        }
        "maximize" => {
            window.set_maximized(!window.is_maximized());
            Ok(Value::Null)
        }
        "fullscreen" => {
            let on = v["on"].as_bool().unwrap_or(window.fullscreen().is_none());
            window.set_fullscreen(if on { Some(tao::window::Fullscreen::Borderless(None)) } else { None });
            Ok(json!(on))
        }
        "quit" => {
            QUIT.store(true, std::sync::atomic::Ordering::SeqCst);
            let _ = proxy.send_event(Ev::Opened(vec![]));
            Ok(Value::Null)
        }
        "print" => view.print().map(|_| Value::Null).map_err(|e| e.to_string()),
        "open_url" => open::that(s("url")).map(|_| Value::Null).map_err(|e| e.to_string()),
        "reveal" => {
            let p = PathBuf::from(s("path"));
            let dir = if p.is_dir() { p } else { p.parent().map(|x| x.to_path_buf()).unwrap_or_default() };
            open::that(dir).map(|_| Value::Null).map_err(|e| e.to_string())
        }
        "open_dialog" => {
            let mut d = filter_dialog(rfd::FileDialog::new(), &v["filters"]);
            if let Some(dir) = v["dir"].as_str() {
                d = d.set_directory(dir);
            }
            let picked: Vec<PathBuf> = if v["folder"].as_bool() == Some(true) {
                d.pick_folder().into_iter().collect()
            } else if v["multiple"].as_bool() == Some(true) {
                d.pick_files().unwrap_or_default()
            } else {
                d.pick_file().into_iter().collect()
            };
            Ok(json!(picked.iter().map(|p| file_json(p)).collect::<Vec<_>>()))
        }
        "save_dialog" => {
            let mut d = filter_dialog(rfd::FileDialog::new(), &v["filters"]);
            if let Some(n) = v["name"].as_str() {
                d = d.set_file_name(n);
            }
            if let Some(dir) = v["dir"].as_str() {
                d = d.set_directory(dir);
            }
            Ok(d.save_file().map(|p| file_json(&p)).unwrap_or(Value::Null))
        }
        "stat" => {
            let p = PathBuf::from(s("path"));
            if p.exists() { Ok(file_json(&p)) } else { Ok(Value::Null) }
        }
        "list_dir" => {
            let rd = std::fs::read_dir(s("path")).map_err(|e| e.to_string())?;
            let mut out: Vec<Value> = rd.filter_map(|e| e.ok()).map(|e| {
                let mut j = file_json(&e.path());
                j["dir"] = json!(e.path().is_dir());
                j
            }).collect();
            out.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
            Ok(json!(out))
        }
        "write_file" => {
            let p = PathBuf::from(s("path"));
            let bytes = if let Some(b64) = v["b64"].as_str() {
                use base64::Engine;
                base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?
            } else {
                v["text"].as_str().unwrap_or("").as_bytes().to_vec()
            };
            // Write beside the target first so a crash mid-save never truncates the document.
            let tmp = p.with_extension(format!("{}.zengtmp", p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default()));
            std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
            Ok(file_json(&p))
        }
        "message" => {
            // buttons: ["Save", "Cancel", "Don't Save"] -> index of the pressed one
            let buttons: Vec<String> = v["buttons"].as_array().map(|a| a.iter().filter_map(|b| b.as_str().map(String::from)).collect()).unwrap_or_default();
            let level = match v["level"].as_str() { Some("error") => rfd::MessageLevel::Error, Some("warning") => rfd::MessageLevel::Warning, _ => rfd::MessageLevel::Info };
            let btns = match buttons.len() {
                0 | 1 => rfd::MessageButtons::Ok,
                2 => rfd::MessageButtons::OkCancelCustom(buttons[0].clone(), buttons[1].clone()),
                _ => rfd::MessageButtons::YesNoCancelCustom(buttons[0].clone(), buttons[1].clone(), buttons[2].clone()),
            };
            let r = rfd::MessageDialog::new().set_level(level).set_title(s("title")).set_description(s("detail")).set_buttons(btns).show();
            let idx = match r {
                rfd::MessageDialogResult::Yes | rfd::MessageDialogResult::Ok => 0,
                rfd::MessageDialogResult::No => 1,
                rfd::MessageDialogResult::Cancel => if buttons.len() >= 3 { 2 } else { 1 },
                rfd::MessageDialogResult::Custom(c) => buttons.iter().position(|b| *b == c).unwrap_or(0),
            };
            Ok(json!(idx))
        }
        "store_get" => {
            let k = safe_key(&s("key"))?;
            Ok(std::fs::read_to_string(store_dir(st.spec).join(format!("{k}.json"))).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).unwrap_or(Value::Null))
        }
        "store_set" => {
            let k = safe_key(&s("key"))?;
            let dir = store_dir(st.spec);
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            std::fs::write(dir.join(format!("{k}.json")), v["value"].to_string()).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "menu" => {
            #[cfg(target_os = "macos")]
            install_menu(st, &v["menus"]);
            Ok(Value::Null)
        }
        other => Err(format!("unknown command: {other}")),
    }
}

#[cfg(target_os = "macos")]
fn install_default_menu(st: &mut State) {
    install_menu(st, &Value::Null);
}
#[cfg(not(target_os = "macos"))]
fn install_default_menu(_: &mut State) {}

/// Builds the native macOS menu bar from the page's menu description. Edit/Window/App menus carry
/// the predefined items so copy, paste, undo and window management work like any Mac app.
#[cfg(target_os = "macos")]
fn install_menu(st: &mut State, menus: &Value) {
    use muda::{accelerator::Accelerator, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};

    fn fill(sub: &Submenu, items: &Value) {
        for it in items.as_array().cloned().unwrap_or_default() {
            if it["separator"].as_bool() == Some(true) {
                let _ = sub.append(&PredefinedMenuItem::separator());
                continue;
            }
            let label = it["label"].as_str().unwrap_or("");
            let enabled = it["enabled"].as_bool().unwrap_or(true);
            if let Some(children) = it.get("submenu").filter(|c| c.is_array()) {
                let s = Submenu::new(label, enabled);
                fill(&s, children);
                let _ = sub.append(&s);
                continue;
            }
            let id = it["id"].as_str().unwrap_or(label).to_string();
            let accel = it["accel"].as_str().and_then(|a| a.parse::<Accelerator>().ok());
            if let Some(checked) = it["checked"].as_bool() {
                let _ = sub.append(&CheckMenuItem::with_id(id, label, enabled, checked, accel));
            } else {
                let _ = sub.append(&MenuItem::with_id(id, label, enabled, accel));
            }
        }
    }

    let spec = st.spec;
    let menu = Menu::new();
    let app = Submenu::new(spec.name, true);
    let _ = app.append_items(&[
        &PredefinedMenuItem::about(Some(&format!("About {}", spec.name)), None),
        &PredefinedMenuItem::separator(),
        &PredefinedMenuItem::services(None),
        &PredefinedMenuItem::separator(),
        &PredefinedMenuItem::hide(None),
        &PredefinedMenuItem::hide_others(None),
        &PredefinedMenuItem::show_all(None),
        &PredefinedMenuItem::separator(),
        &PredefinedMenuItem::quit(None),
    ]);
    let _ = menu.append(&app);

    let mut had_edit = false;
    for m in menus.as_array().cloned().unwrap_or_default() {
        let title = m["label"].as_str().unwrap_or("");
        let sub = Submenu::new(title, true);
        if title == "Edit" {
            had_edit = true;
            // The page decides what Undo/Redo do (its own history); clipboard items stay native.
            fill(&sub, &m["items"]);
            let _ = sub.append(&PredefinedMenuItem::separator());
            let _ = sub.append_items(&[&PredefinedMenuItem::cut(None), &PredefinedMenuItem::copy(None), &PredefinedMenuItem::paste(None), &PredefinedMenuItem::select_all(None)]);
        } else {
            fill(&sub, &m["items"]);
        }
        let _ = menu.append(&sub);
    }
    if !had_edit {
        let edit = Submenu::new("Edit", true);
        let _ = edit.append_items(&[&PredefinedMenuItem::undo(None), &PredefinedMenuItem::redo(None), &PredefinedMenuItem::separator(), &PredefinedMenuItem::cut(None), &PredefinedMenuItem::copy(None), &PredefinedMenuItem::paste(None), &PredefinedMenuItem::select_all(None)]);
        let _ = menu.append(&edit);
    }
    let window = Submenu::new("Window", true);
    let _ = window.append_items(&[&PredefinedMenuItem::minimize(None), &PredefinedMenuItem::maximize(None), &PredefinedMenuItem::separator(), &PredefinedMenuItem::fullscreen(None)]);
    let _ = menu.append(&window);
    window.set_as_windows_menu_for_nsapp();
    menu.init_for_nsapp();
    st.menu = Some(menu);
}
