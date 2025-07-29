// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{command, Emitter};
use tauri_plugin_clipboard_manager::{init as clipboard_manager_plugin, ClipboardExt};
use window_vibrancy::{apply_blur, apply_vibrancy, NSVisualEffectMaterial};
use tauri::Manager;

#[derive(Clone, Serialize)]
struct ClipboardContent {
    text: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Note {
    id: String,
    title: String,
    content: String,
    links: Vec<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize)]
struct NoteMetadata {
    id: String,
    title: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn get_notes_dir() -> std::path::PathBuf {
    let app_dir = std::env::current_dir().unwrap().join("notes");
    app_dir.join("notes")
}

fn ensure_notes_dir() -> Result<(), String> {
    let notes_dir = get_notes_dir();
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {}", e))?;
    Ok(())
}

#[command]
fn save_note(title: String, content: String, links: Vec<String>) -> Result<String, String> {
    ensure_notes_dir()?;

    let notes_dir = get_notes_dir();
    let now = Utc::now();
    let id = format!("note_{}", now.timestamp_millis());

    let note = Note {
        id: id.clone(),
        title: title.clone(),
        content,
        links,
        created_at: now,
        updated_at: now,
    };

    let file_path = notes_dir.join(format!("{}.json", id));
    let json = serde_json::to_string_pretty(&note)
        .map_err(|e| format!("Failed to serialize note: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write note file: {}", e))?;

    Ok(id)
}

#[command]
fn update_note(id: String, title: String, content: String, links: Vec<String>) -> Result<(), String> {
    ensure_notes_dir()?;

    let notes_dir = get_notes_dir();
    let file_path = notes_dir.join(format!("{}.json", id));

    if !file_path.exists() {
        return Err("Note not found".to_string());
    }

    // Read existing note to preserve created_at
    let existing_content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read existing note: {}", e))?;
    let existing_note: Note = serde_json::from_str(&existing_content)
        .map_err(|e| format!("Failed to parse existing note: {}", e))?;

    let updated_note = Note {
        id: existing_note.id,
        title,
        content,
        links,
        created_at: existing_note.created_at,
        updated_at: Utc::now(),
    };

    let json = serde_json::to_string_pretty(&updated_note)
        .map_err(|e| format!("Failed to serialize note: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write note file: {}", e))?;

    Ok(())
}

#[command]
fn load_note(id: String) -> Result<Note, String> {
    let notes_dir = get_notes_dir();
    let file_path = notes_dir.join(format!("{}.json", id));

    if !file_path.exists() {
        return Err("Note not found".to_string());
    }

    let content =
        fs::read_to_string(&file_path).map_err(|e| format!("Failed to read note file: {}", e))?;

    let note: Note =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse note: {}", e))?;

    Ok(note)
}

#[command]
fn list_notes() -> Result<Vec<NoteMetadata>, String> {
    ensure_notes_dir()?;

    let notes_dir = get_notes_dir();
    let mut notes = Vec::new();

    if let Ok(entries) = fs::read_dir(notes_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(note) = serde_json::from_str::<Note>(&content) {
                            notes.push(NoteMetadata {
                                id: note.id,
                                title: note.title,
                                created_at: note.created_at,
                                updated_at: note.updated_at,
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort by updated_at descending (most recent first)
    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(notes)
}

#[command]
fn delete_note(id: String) -> Result<(), String> {
    let notes_dir = get_notes_dir();
    let file_path = notes_dir.join(format!("{}.json", id));

    if !file_path.exists() {
        return Err("Note not found".to_string());
    }

    fs::remove_file(&file_path).map_err(|e| format!("Failed to delete note file: {}", e))?;

    Ok(())
}

#[command]
fn open_url(url: String) -> Result<(), String> {
    let result = if cfg!(target_os = "windows") {
        Command::new("cmd").args(&["/C", "start", &url]).output()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(&url).output()
    } else {
        // Linux and other Unix-like systems
        Command::new("xdg-open").arg(&url).output()
    };

    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open URL: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(clipboard_manager_plugin())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_url,
            save_note,
            update_note,
            load_note,
            list_notes,
            delete_note
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "windows")]
            {
                // ARGB: R=18, G=18, B=18, A=125
                apply_blur(&window, Some((18, 18, 18, 125)))
                    .expect("Failed to apply blur on Windows");
            }

            #[cfg(target_os = "macos")]
            {
                apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None)
                    .expect("Failed to apply vibrancy on macOS");
            }

            // Start clipboard monitoring in a separate thread
            thread::spawn(move || {
                let mut last_content = String::new();

                loop {
                    let clipboard_manager = app_handle.clipboard();
                    if let Ok(text) = clipboard_manager.read_text() {
                        if !text.is_empty() && text != last_content {
                            last_content = text.clone();

                            // Emit event to frontend with new clipboard content
                            let _ = app_handle.emit(
                                "clipboard-changed",
                                ClipboardContent {
                                    text: text.clone(),
                                },
                            );
                            println!("Clipboard content changed: {}", text);
                        }
                    }
                    // Wait a bit before checking again
                    thread::sleep(Duration::from_millis(500));
                }
            });

            println!("Tauri app setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}