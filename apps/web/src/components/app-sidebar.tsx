import { Link, useRouter, useLocation } from "@tanstack/react-router";
import {
  HomeIcon,
  FileTextIcon,
  SettingsIcon,
  UserIcon,
  SearchIcon,
  PlusIcon,
  Trash2Icon,
  ClockIcon,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface AppSidebarProps {
  children: React.ReactNode;
}

interface NoteMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function AppSidebar({ children, ...props }: AppSidebarProps) {
  return (
    <SidebarProvider>
      <SidebarContentWithHotkeys children={children} {...props} />
    </SidebarProvider>
  );
}

function SidebarContentWithHotkeys({ children, ...props }: AppSidebarProps) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { open, setOpen } = useSidebar();

  // Get current note ID from the route
  const currentNoteId = location.pathname.startsWith("/note/")
    ? location.pathname.split("/note/")[1]
    : null;

  // Load search query from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem("sidebar-search-state");
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        setSearchQuery(state.searchQuery || "");
      } catch (error) {
        console.error("Failed to load search state:", error);
      }
    }
  }, []); // Empty dependency array - only runs once

  // Save search query state
  const saveSearchState = useCallback(() => {
    const state = {
      searchQuery,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem("sidebar-search-state", JSON.stringify(state));
  }, [searchQuery]);

  // Debounced save for search query
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveSearchState();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, saveSearchState]);

  useEffect(() => {
    loadNotes();
  }, []);

  // Refresh notes when the component becomes visible or when a note is saved
  useEffect(() => {
    const handleFocus = () => {
      loadNotes();
    };

    const handleNoteSaved = () => {
      loadNotes();
    };

    const handleNoteTitleChanged = (event: CustomEvent) => {
      const { noteId, title } = event.detail;
      setNotes((prevNotes) =>
        prevNotes.map((note) =>
          note.id === noteId ? { ...note, title } : note
        )
      );
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("note-saved", handleNoteSaved);
    window.addEventListener(
      "note-title-changed",
      handleNoteTitleChanged as EventListener
    );

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("note-saved", handleNoteSaved);
      window.removeEventListener(
        "note-title-changed",
        handleNoteTitleChanged as EventListener
      );
    };
  }, []); // Removed keyboard shortcut handling since SidebarProvider handles it

  const loadNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      const notesData = await invoke<NoteMetadata[]>("list_notes");
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to load notes:", error);
      toast.error("Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createNewNote = useCallback(async () => {
    try {
      const noteId = await invoke<string>("save_note", {
        title: "Untitled Note",
        content: "",
        links: [],
      });
      toast.success("New note created");
      navigate({ to: "/note/$noteId", params: { noteId } });
      loadNotes(); // Refresh the notes list
    } catch (error) {
      console.error("Failed to create note:", error);
      toast.error("Failed to create note");
    }
  }, [navigate, loadNotes]);

  const deleteNote = useCallback(
    async (noteId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        await invoke("delete_note", { id: noteId });
        toast.success("Note deleted");
        loadNotes(); // Refresh the notes list
      } catch (error) {
        console.error("Failed to delete note:", error);
        toast.error("Failed to delete note");
      }
    },
    [loadNotes]
  );

  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedNote = filteredNotes.find((note) => note.id === currentNoteId);
  const sidebarGroupClass = selectedNote ? "p-0 " : "pr-3";

  return (
    <div className="flex h-screen w-screen">
      <Sidebar variant="inset" {...props} className="p-0 ">
        <SidebarContent className="p-0">
          <div className="flex items-center gap-2  pt-2">
            <Input
              placeholder="Search notes..."
              className="max-w-sm"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
            />
          </div>

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={createNewNote}>
                    <PlusIcon className="size-4" />
                    <span>New Note</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className={sidebarGroupClass}>
            <SidebarGroupLabel>Notes</SidebarGroupLabel>
            <SidebarGroupContent className="">
              {isLoading ? (
                <div className="px-2 py-4 text-sm text-muted-foreground">
                  Loading notes...
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground">
                  {searchQuery ? "No notes found" : "No notes yet"}
                </div>
              ) : (
                <SidebarMenu className="pl-2 py-4">
                  {filteredNotes.map((note) => {
                    const isSelected = currentNoteId === note.id;
                    return (
                      <SidebarMenuItem key={note.id}>
                        <div className="relative group">
                          <SidebarMenuButton
                            onClick={(e) => {
                              // Don't navigate if clicking on the settings button
                              if (
                                e.target !== e.currentTarget &&
                                (e.target as HTMLElement).closest(
                                  "[data-settings-button]"
                                )
                              ) {
                                return;
                              }

                              if (currentNoteId && currentNoteId !== note.id) {
                                window.dispatchEvent(
                                  new CustomEvent("navigate-away", {
                                    detail: { to: `/note/${note.id}` },
                                  })
                                );
                              } else {
                                navigate({
                                  to: "/note/$noteId",
                                  params: { noteId: note.id },
                                });
                              }
                            }}
                            className={
                              isSelected
                                ? "bg-background text-accent-foreground rounded-none py-6 rounded-l-lg hover:bg-transparent relative"
                                : "w-[95%] py-6 px-2 rounded-2xl  mx-2  hover:bg-muted/50 relative"
                            }
                            style={
                              isSelected
                                ? { backgroundColor: "var(--background)" }
                                : undefined
                            }
                          >
                            <FileTextIcon className="size-4" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-sm font-medium flex items-center gap-1">
                                {note.title || "Untitled"}
                                {isSelected && (
                                  <span className="text-xs text-muted-foreground">
                                    *
                                  </span>
                                )}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-settings-button
                                  className={`h-6 w-6 p-0 transition-opacity absolute right-2 top-1/2 -translate-y-1/2 z-20 ${
                                    isSelected
                                      ? "opacity-100"
                                      : "opacity-0 group-hover:opacity-100"
                                  }`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                >
                                  <span className="sr-only">Open menu</span>
                                  <SettingsIcon className="size-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => deleteNote(note.id, e)}
                                  className="text-red-600"
                                >
                                  <Trash2Icon className="size-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuButton>
                          {isSelected && (
                            <>
                              <svg
                                width="40"
                                height="40"
                                viewBox="0 0 100 100"
                                xmlns="http://www.w3.org/2000/svg"
                                className="absolute -top-10 right-0 z-10"
                                style={{ fill: "var(--background)" }}
                              >
                                <path
                                  d="
                                    M 100,100
                                    L 60,100
                                    A 40,40 0 0 0 100,60
                                    Z
                                  "
                                />
                              </svg>
                              <svg
                                width="40"
                                height="40"
                                viewBox="0 0 100 100"
                                xmlns="http://www.w3.org/2000/svg"
                                className="absolute -bottom-10 right-0 z-10"
                                style={{ fill: "var(--background)" }}
                              >
                                <path
                                  d="
                                    M 100,0
                                    L 100,40
                                    A 40,40 0 0 0 60,0
                                    Z
                                  "
                                />
                              </svg>
                            </>
                          )}
                        </div>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 px-4 py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent
                side="right"
                align="center"
                className=" text-secondary"
              >
                Toggle sidebar{" "}
                <span className="ml-2 text-xs text-secondary ">(Ctrl+B)</span>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </SidebarInset>
    </div>
  );
}
