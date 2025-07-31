"use client";

import * as React from "react";
import {
  BookOpen,
  Bot,
  Command,
  Frame,
  LifeBuoy,
  Map,
  PieChart,
  Send,
  Settings2,
  SquareTerminal,
  Plus,
  FileText,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface NoteMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SidebarState {
  notes: NoteMetadata[];
  last_sync_time: number;
  is_collapsed?: boolean;
  selected_note_id?: string;
}

export function AppSidebar({
  children,
  ...props
}: React.ComponentProps<typeof Sidebar> & { children?: React.ReactNode }) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navigate = useNavigate();
  const currentNoteId = useRouterState({
    select: (state) => {
      const pathname = state.location.pathname;
      const match = pathname.match(/^\/note\/(.+)$/);
      return match ? match[1] : null;
    },
  });

  // Use refs to track state and prevent infinite loops
  const isSavingRef = useRef(false);
  const lastSavedNotesRef = useRef<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedInitialStateRef = useRef(false);

  // Load sidebar state from Tauri backend
  const loadSidebarState =
    useCallback(async (): Promise<SidebarState | null> => {
      try {
        console.log("Loading sidebar state...");
        const state = await invoke<SidebarState | null>("load_sidebar_state");
        console.log("Loaded sidebar state:", state);
        return state;
      } catch (error) {
        console.error("Failed to load sidebar state:", error);
        return null;
      }
    }, []);

  // Save sidebar state to Tauri backend
  const saveSidebarState = useCallback(
    async (state: Partial<SidebarState>) => {
      if (isSavingRef.current) {
        console.log("Already saving, skipping...");
        return;
      }

      try {
        console.log("Saving sidebar state:", state);
        isSavingRef.current = true;
        const currentState = (await loadSidebarState()) || {
          notes: [],
          last_sync_time: 0,
          is_collapsed: false,
          selected_note_id: undefined,
        };
        const newState = { ...currentState, ...state };
        console.log("Combined state to save:", newState);
        await invoke("save_sidebar_state", { state: newState });
        console.log("Sidebar state saved successfully");
      } catch (error) {
        console.error("Failed to save sidebar state:", error);
      } finally {
        isSavingRef.current = false;
      }
    },
    [loadSidebarState]
  );

  // Debounced save function
  const debouncedSave = useCallback(
    (state: Partial<SidebarState>) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        await saveSidebarState(state);
      }, 500); // Reduced to 500ms for more responsive saves
    },
    [saveSidebarState]
  );

  const loadNotes = useCallback(async () => {
    try {
      setIsLoading(true);

      // Try to load from saved state first
      const savedState = await loadSidebarState();
      if (savedState?.notes && savedState.notes.length > 0) {
        setNotes(savedState.notes);
        setIsLoading(false);
      }

      // Always fetch fresh data from backend
      const notesData = await invoke<NoteMetadata[]>("list_notes");
      setNotes(notesData);

      // Save the fresh data to backend
      await saveSidebarState({
        notes: notesData,
        last_sync_time: Date.now(),
        selected_note_id: currentNoteId || undefined,
      });
    } catch (error) {
      console.error("Failed to load notes:", error);
      toast.error("Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  }, [loadSidebarState, saveSidebarState, currentNoteId]);

  // Load initial state from backend
  useEffect(() => {
    const loadInitialState = async () => {
      const savedState = await loadSidebarState();
      if (savedState) {
        if (savedState.is_collapsed !== undefined) {
          setIsCollapsed(savedState.is_collapsed);
        }
        if (savedState.notes && savedState.notes.length > 0) {
          setNotes(savedState.notes);
          setIsLoading(false);
        }
      }
      hasLoadedInitialStateRef.current = true;
    };

    loadInitialState();
  }, [loadSidebarState]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Save state when notes change (with debouncing)
  useEffect(() => {
    if (notes.length > 0 && hasLoadedInitialStateRef.current) {
      const notesString = JSON.stringify(notes);
      if (notesString !== lastSavedNotesRef.current) {
        lastSavedNotesRef.current = notesString;
        debouncedSave({
          notes,
          last_sync_time: Date.now(),
          selected_note_id: currentNoteId || undefined,
        });
      }
    }
  }, [notes, currentNoteId, debouncedSave]);

  // Save collapsed state
  useEffect(() => {
    if (hasLoadedInitialStateRef.current) {
      debouncedSave({ is_collapsed: isCollapsed });
    }
  }, [isCollapsed, debouncedSave]);

  // Listen for note events to refresh the list
  useEffect(() => {
    const handleNoteSaved = () => {
      loadNotes();
    };

    const handleNoteTitleChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { noteId, title } = customEvent.detail;
      setNotes((prevNotes) => {
        const updatedNotes = prevNotes.map((note) =>
          note.id === noteId ? { ...note, title } : note
        );
        // Save the updated notes to backend
        debouncedSave({
          notes: updatedNotes,
          last_sync_time: Date.now(),
        });
        return updatedNotes;
      });
    };

    window.addEventListener("note-saved", handleNoteSaved);
    window.addEventListener("note-title-changed", handleNoteTitleChanged);

    return () => {
      window.removeEventListener("note-saved", handleNoteSaved);
      window.removeEventListener("note-title-changed", handleNoteTitleChanged);
    };
  }, [loadNotes, debouncedSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleCreateNewNote = () => {
    navigate({ to: "/" });
  };

  const handleNoteClick = async (noteId: string) => {
    navigate({ to: "/note/$noteId", params: { noteId } });
    // Save the selected note ID
    debouncedSave({ selected_note_id: noteId });
  };

  const handleDeleteNote = async (noteId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    console.log("Deleting note:", noteId, "Current note:", currentNoteId);

    try {
      await invoke("delete_note", { id: noteId });
      console.log("Note deleted successfully");

      // Update the notes list first
      setNotes((prevNotes) => {
        const updatedNotes = prevNotes.filter((note) => note.id !== noteId);
        // Save the updated notes to backend
        debouncedSave({
          notes: updatedNotes,
          last_sync_time: Date.now(),
        });
        return updatedNotes;
      });

      // If we're currently viewing the deleted note, don't navigate - just let the user stay on the current page
      // The note will be gone from the sidebar, but the current page will remain
      if (currentNoteId === noteId) {
        console.log("Note deleted but staying on current page");
        // Don't navigate - let the user manually navigate if they want
      }

      toast.success("Note deleted");
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast.error("Failed to delete note");
      // Don't throw the error to prevent app restart
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffInHours < 168) {
      // 7 days
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  return (
    <SidebarProvider
      defaultOpen={!isCollapsed}
      open={!isCollapsed}
      onOpenChange={(open) => setIsCollapsed(!open)}
    >
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleCreateNewNote();
                  }}
                >
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <Command className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">Notes</span>
                    <span className="truncate text-xs">
                      Your personal notes
                    </span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-sm font-medium">All Notes</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCreateNewNote}
              className="h-6 w-6 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="px-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">
                  Loading notes...
                </div>
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <div className="text-sm text-muted-foreground">
                  No notes yet
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Create your first note to get started
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {notes.map((note) => {
                  const isActive = currentNoteId === note.id;
                  return (
                    <div
                      key={note.id}
                      className={`group relative rounded-md transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <button
                        onClick={() => handleNoteClick(note.id)}
                        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">
                            {note.title || "Untitled Note"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {formatDate(note.updated_at)}
                          </div>
                        </div>
                      </button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 hover:bg-accent/80 rounded">
                            <span className="sr-only">Open menu</span>
                            <div className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem
                            onClick={(e) => handleDeleteNote(note.id, e)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-4 py-2">
            <div className="text-xs text-muted-foreground">
              {notes.length} note{notes.length !== 1 ? "s" : ""}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                console.log("Testing state save...");
                await saveSidebarState({
                  notes: notes,
                  last_sync_time: Date.now(),
                  is_collapsed: isCollapsed,
                  selected_note_id: currentNoteId || undefined,
                });
                console.log("Testing state load...");
                const loaded = await loadSidebarState();
                console.log("Loaded state:", loaded);
              }}
              className="mt-2 w-full text-xs"
            >
              Test State Save/Load
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      {children}
    </SidebarProvider>
  );
}
