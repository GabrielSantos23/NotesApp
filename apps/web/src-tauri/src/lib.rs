use tauri_plugin_clipboard_manager::{init as clipboard_manager_plugin, ClipboardExt};
use std::time::Duration;
use std::thread;
use serde::Serialize;
use tauri::{Emitter, Manager};
use std::sync::{Arc, Mutex};

#[derive(Clone, Serialize)]
struct ClipboardContent {
    text: String,
    from_app: bool,
}

#[derive(Clone, Serialize)]
struct AppState {
    is_focused: Arc<Mutex<bool>>,
    last_internal_copy: Arc<Mutex<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        is_focused: Arc::new(Mutex::new(false)),
        last_internal_copy: Arc::new(Mutex::new(String::new())),
    };

    tauri::Builder::default()
        .plugin(clipboard_manager_plugin())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(app_state.clone())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state = app.state::<AppState>();
            
            // Clone the state for use in different closures
            let focus_state = state.is_focused.clone();
            let thread_state = AppState {
                is_focused: state.is_focused.clone(),
                last_internal_copy: state.last_internal_copy.clone(),
            };
            
            // Listen for window focus events
            let window = app.get_webview_window("main").unwrap();
            
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Focused(focused) => {
                        if let Ok(mut is_focused) = focus_state.lock() {
                            *is_focused = *focused;
                        }
                    }
                    _ => {}
                }
            });
            
            thread::spawn(move || {
                let mut last_content = String::new();
                
                loop {
                    // Get clipboard content
                    let clipboard_manager = app_handle.clipboard();
                    if let Ok(text) = clipboard_manager.read_text() {
                        // Check if content has changed and is not empty
                        if !text.is_empty() && text != last_content {
                            let is_from_app = {
                                // Check if app is focused
                                let is_focused = thread_state.is_focused.lock()
                                    .map(|f| *f)
                                    .unwrap_or(false);
                                
                                // Check if this matches our last internal copy
                                let matches_internal = thread_state.last_internal_copy.lock()
                                    .map(|last| text == *last)
                                    .unwrap_or(false);
                                
                                is_focused || matches_internal
                            };
                            
                            last_content = text.clone();
                            
                            // Only emit if it's not from the app itself
                            if !is_from_app {
                                println!("📋 Clipboard changed: '{}'", text);
                                
                                // Add a small delay to prevent race conditions with normal paste operations
                                let app_handle_clone = app_handle.clone();
                                let text_clone = text.clone();
                                
                                thread::spawn(move || {
                                    // Wait a bit to let normal paste operations complete
                                    thread::sleep(Duration::from_millis(200));
                                    
                                    let _ = app_handle_clone.emit("clipboard-changed", ClipboardContent {
                                        text: text_clone,
                                        from_app: false,
                                    });
                                });
                            } else {
                                println!("🚫 Internal clipboard content ignored: {}", text);
                            }
                        }
                    }
                    
                    // Wait a bit before checking again
                    thread::sleep(Duration::from_millis(500));
                }
            });
            
            println!("🚀 Tauri app setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![mark_internal_copy])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Command to mark when the app itself copies something
#[tauri::command]
async fn mark_internal_copy(
    text: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if let Ok(mut last_copy) = state.last_internal_copy.lock() {
        *last_copy = text;
    }
    Ok(())
}