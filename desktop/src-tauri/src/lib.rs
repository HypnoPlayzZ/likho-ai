use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, ShortcutState};
use std::thread;
use std::time::Duration;

fn position_near_cursor(window: &tauri::WebviewWindow) {
    let cursor_pos = match window.cursor_position() {
        Ok(pos) => pos,
        Err(_) => return,
    };

    let overlay_w = 440.0_f64;
    let overlay_h = 320.0_f64;
    let mut x = cursor_pos.x + 10.0;
    let mut y = cursor_pos.y + 10.0;

    // Clamp to monitor bounds (per MISTAKES.md: don't trust cursor_position on multi-monitor)
    if let Ok(monitors) = window.available_monitors() {
        for monitor in monitors {
            let pos = monitor.position();
            let size = monitor.size();
            let mx = pos.x as f64;
            let my = pos.y as f64;
            let mw = size.width as f64;
            let mh = size.height as f64;

            if cursor_pos.x >= mx && cursor_pos.x < mx + mw
                && cursor_pos.y >= my && cursor_pos.y < my + mh
            {
                if x + overlay_w > mx + mw {
                    x = cursor_pos.x - overlay_w - 10.0;
                }
                if y + overlay_h > my + mh {
                    y = cursor_pos.y - overlay_h - 10.0;
                }
                if x < mx { x = mx; }
                if y < my { y = my; }
                break;
            }
        }
    }

    let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
}

fn hide_overlay(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.hide();
        let _ = window.emit("overlay-hidden", ());
    }
    // Defer unregister to a separate thread. The global-shortcut plugin holds
    // an internal Mutex for the entire duration of any handler invocation, and
    // unregister() tries to take the same Mutex — calling it inline deadlocks
    // the UI thread (Windows reports it as AppHangB1).
    let app_handle = app.clone();
    thread::spawn(move || {
        let _ = app_handle.global_shortcut().unregister("Escape");
    });
}

/// Capture selected text from any Windows app using the clipboard method.
/// See SKILLS.md "Pattern: Selected Text Capture (Clipboard Method)"
/// and MISTAKES.md "Don't simulate Ctrl+C on a global hotkey thread"
///
/// Flow:
/// 1. Save current clipboard content
/// 2. Clear clipboard (so we can detect empty selection)
/// 3. Simulate Ctrl+C to copy selected text
/// 4. Wait 150ms (per MISTAKES.md — Ctrl+C can get swallowed without delay)
/// 5. Read clipboard — if non-empty, that's the selection
/// 6. If empty: restore original clipboard content
/// 7. If captured: leave captured text on clipboard (natural Ctrl+C behavior)
fn capture_selected_text() -> String {
    // Save current clipboard content
    let prev_clipboard = arboard::Clipboard::new()
        .and_then(|mut c| c.get_text())
        .unwrap_or_default();

    // Clear clipboard so we can distinguish "no selection" from "same text already on clipboard"
    if let Ok(mut c) = arboard::Clipboard::new() {
        let _ = c.clear();
    }

    // Wait briefly so the user can release Alt before we send Ctrl+C.
    // Alt+Space is the trigger, so when the handler fires the physical Alt
    // key is almost always still held — sending Ctrl+C while Alt is down
    // becomes Ctrl+Alt+C and never copies anything.
    thread::sleep(Duration::from_millis(80));

    // Simulate Ctrl+C — source app still has focus, so keystrokes go there.
    // Use VK_C (0x43) instead of Key::Unicode('c'): the latter can fall back
    // to KEYEVENTF_UNICODE injection on some Windows configs, which sends a
    // WM_CHAR-style event that doesn't trigger Ctrl+C accelerators.
    {
        use enigo::{Enigo, Key, Keyboard, Settings, Direction};
        if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
            // Force-release Alt as a safety net in case the user is still holding it.
            let _ = enigo.key(Key::Alt, Direction::Release);
            let _ = enigo.key(Key::Control, Direction::Press);
            let _ = enigo.key(Key::Other(0x43), Direction::Click); // VK_C
            let _ = enigo.key(Key::Control, Direction::Release);
        }
    }

    // Wait 150ms per MISTAKES.md — clipboard write is async after Ctrl+C.
    thread::sleep(Duration::from_millis(150));

    // Read captured text
    let captured = arboard::Clipboard::new()
        .and_then(|mut c| c.get_text())
        .unwrap_or_default();

    if captured.is_empty() {
        // Nothing was selected — restore original clipboard so user doesn't lose it
        if !prev_clipboard.is_empty() {
            if let Ok(mut c) = arboard::Clipboard::new() {
                let _ = c.set_text(&prev_clipboard);
            }
        }
    }
    // If text was captured, leave it on clipboard — the user effectively just Ctrl+C'd

    captured
}

/// Day 5: paste a chosen rewrite back into the source app, replacing the
/// originally-selected text.
///
/// Flow:
/// 1. Hide the overlay so the source app gets keyboard focus back.
/// 2. Save the current clipboard so we can restore it after paste — per
///    SKILLS.md "Pattern: Selected Text Capture (Clipboard Method)".
/// 3. Write the new text to the clipboard.
/// 4. Simulate Ctrl+V into the source app. Source still has the original
///    selection highlighted, so Ctrl+V replaces it.
/// 5. After 500ms (paste settled) restore the previous clipboard in a
///    spawned thread, so the user's clipboard isn't permanently overwritten.
#[tauri::command]
fn replace_selection(app: tauri::AppHandle, new_text: String) -> Result<(), String> {
    // Hide overlay first — this returns focus to the source app, which is
    // where Ctrl+V needs to be received.
    hide_overlay(&app);

    // Save current clipboard so we can restore it after paste.
    let prev_clipboard = arboard::Clipboard::new()
        .and_then(|mut c| c.get_text())
        .unwrap_or_default();

    // Give the OS a moment to transfer focus from the overlay back to the
    // source app. Without this, Ctrl+V can fire before focus has landed.
    thread::sleep(Duration::from_millis(100));

    // Put the chosen rewrite on the clipboard.
    match arboard::Clipboard::new().and_then(|mut c| c.set_text(new_text.clone())) {
        Ok(_) => {}
        Err(e) => return Err(format!("clipboard set failed: {e}")),
    }

    // Brief pause so the clipboard write is durable before paste reads it.
    thread::sleep(Duration::from_millis(50));

    // Simulate Ctrl+V into the source app. VK_V (0x56) — same reasoning as
    // VK_C in capture_selected_text: Key::Unicode('v') can fall back to
    // KEYEVENTF_UNICODE which doesn't fire Ctrl+V accelerators reliably.
    {
        use enigo::{Direction, Enigo, Key, Keyboard, Settings};
        if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
            // Defensive: in case Alt is held for any reason. Replace is invoked
            // from a mouse click in the overlay, so this should be a no-op.
            let _ = enigo.key(Key::Alt, Direction::Release);
            let _ = enigo.key(Key::Control, Direction::Press);
            let _ = enigo.key(Key::Other(0x56), Direction::Click); // VK_V
            let _ = enigo.key(Key::Control, Direction::Release);
        }
    }

    // Restore the previous clipboard after the paste has had time to land.
    // Spawned so the command returns immediately — JS doesn't need to wait.
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(500));
        if !prev_clipboard.is_empty() {
            if let Ok(mut c) = arboard::Clipboard::new() {
                let _ = c.set_text(prev_clipboard);
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![replace_selection])
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["Alt+Space"])
                .unwrap()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    // The plugin invokes this global handler for EVERY registered
                    // shortcut, including Escape. Without this guard, an Escape press
                    // would hide the overlay (via the per-shortcut handler) and then
                    // immediately re-show it here. Only act on Alt+Space.
                    if shortcut.key != Code::Space {
                        return;
                    }

                    let Some(window) = app.get_webview_window("overlay") else {
                        return;
                    };
                    let is_visible = window.is_visible().unwrap_or(false);

                    if is_visible {
                        hide_overlay(app);
                    } else {
                        // Show overlay immediately (source app keeps focus — no set_focus call)
                        position_near_cursor(&window);
                        let _ = window.show();
                        // Tell JS the overlay just appeared so the fade-in
                        // animation can re-trigger via a key bump. React
                        // doesn't unmount on hide, so without this we'd only
                        // see the animation on the very first open.
                        let _ = window.emit("overlay-shown", ());

                        // Register Escape while overlay is visible.
                        // Must run on a separate thread — see deadlock note in hide_overlay.
                        let app_clone = app.clone();
                        thread::spawn(move || {
                            let cb_handle = app_clone.clone();
                            let _ = app_clone.global_shortcut().on_shortcut("Escape", move |_app, _shortcut, event| {
                                if event.state() == ShortcutState::Pressed {
                                    hide_overlay(&cb_handle);
                                }
                            });
                        });

                        // Capture selected text in background thread
                        // (overlay is visible but source app still has focus, so Ctrl+C goes there)
                        let app_handle = app.clone();
                        thread::spawn(move || {
                            let captured = capture_selected_text();
                            // Emit on the overlay window directly. app.emit() broadcast
                            // does not reliably reach a hidden-then-shown webview's
                            // listeners on Tauri 2 + Windows; window.emit() does.
                            if let Some(window) = app_handle.get_webview_window("overlay") {
                                let _ = window.emit("text-captured", &captured);
                            }
                        });
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Tray menu: version, Sign in (paid users), Check for updates, Quit.
            // Sign in opens the overlay with a state that prompts for the
            // email used at payment so paid customers can unlock unlimited
            // rewrites without first hitting the demo gate.
            let version = env!("CARGO_PKG_VERSION");
            let version_label = format!("Likho v{}", version);
            let version_item = MenuItem::with_id(
                app, "version", &version_label, false, None::<&str>,
            )?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let signin_item = MenuItem::with_id(
                app, "signin", "Sign in (Founding / Pro)", true, None::<&str>,
            )?;
            let check_item = MenuItem::with_id(
                app, "check_updates", "Check for updates…", true, None::<&str>,
            )?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(
                app, "quit", "Quit Likho", true, None::<&str>,
            )?;
            let menu = Menu::with_items(
                app,
                &[
                    &version_item,
                    &sep1,
                    &signin_item,
                    &check_item,
                    &sep2,
                    &quit_item,
                ],
            )?;

            let _tray = TrayIconBuilder::new()
                .tooltip(&format!("Likho v{} — Alt+Space to rewrite", version))
                .menu(&menu)
                .on_menu_event(|app_handle, event| match event.id.as_ref() {
                    "check_updates" => {
                        if let Some(w) = app_handle.get_webview_window("overlay") {
                            let _ = w.emit("tray:check-updates", ());
                        }
                    }
                    "signin" => {
                        // Show the overlay near the cursor and tell JS to
                        // jump into the sign-in state — bypasses the
                        // "must hit demo gate first" path.
                        if let Some(window) = app_handle.get_webview_window("overlay") {
                            position_near_cursor(&window);
                            let _ = window.show();
                            let _ = window.emit("overlay-shown", ());
                            let _ = window.emit("tray:signin", ());
                        }
                    }
                    "quit" => app_handle.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|_tray, _event| {})
                .build(app)?;

            // v0.1.5: removed window-level acrylic. The overlay window is
            // now fully transparent; the dark-glass look is provided by a
            // bg-black/30 backdrop-blur card in App.tsx, which only covers
            // the visible content rectangle. The 8px gutter around that
            // card is true alpha-transparency — desktop crisp through.
            // Result: floating glass card on the desktop, not a blur over
            // the whole rectangle.

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Likho");
}
