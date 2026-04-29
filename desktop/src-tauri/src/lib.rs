use tauri::{Emitter, Manager};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use std::thread;
use std::time::Duration;

fn position_near_cursor(window: &tauri::WebviewWindow) {
    let cursor_pos = match window.cursor_position() {
        Ok(pos) => pos,
        Err(_) => return,
    };

    let overlay_w = 380.0_f64;
    let overlay_h = 220.0_f64;
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
    }
    let _ = app.global_shortcut().unregister("Escape");
    let _ = app.emit("overlay-hidden", ());
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

    // Simulate Ctrl+C — source app still has focus, so keystrokes go there
    {
        use enigo::{Enigo, Key, Keyboard, Settings, Direction};
        if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
            let _ = enigo.key(Key::Control, Direction::Press);
            let _ = enigo.key(Key::Unicode('c'), Direction::Click);
            let _ = enigo.key(Key::Control, Direction::Release);
        }
    }

    // Wait 150ms per MISTAKES.md
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["Alt+Space"])
                .unwrap()
                .with_handler(|app, _shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    let Some(window) = app.get_webview_window("overlay") else {
                        return;
                    };
                    let is_visible = window.is_visible().unwrap_or(false);

                    if is_visible {
                        hide_overlay(app);
                    } else {
                        let app_handle = app.clone();
                        thread::spawn(move || {
                            // Capture text BEFORE showing overlay (source app still has focus)
                            let captured = capture_selected_text();

                            // Now show overlay
                            if let Some(window) = app_handle.get_webview_window("overlay") {
                                position_near_cursor(&window);
                                let _ = window.show();
                            }

                            // Emit captured text to frontend
                            let _ = app_handle.emit("text-captured", &captured);

                            // Dynamically register Escape so it only captures while overlay is up
                            let app_clone = app_handle.clone();
                            let _ = app_handle.global_shortcut().on_shortcut("Escape", move |_app, _shortcut, event| {
                                if event.state() == ShortcutState::Pressed {
                                    hide_overlay(&app_clone);
                                }
                            });
                        });
                    }
                })
                .build(),
        )
        .setup(|app| {
            let _tray = TrayIconBuilder::new()
                .tooltip("Likho — Alt+Space to rewrite")
                .on_tray_icon_event(|_tray, _event| {})
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Likho");
}
