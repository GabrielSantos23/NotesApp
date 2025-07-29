import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Link, AlertCircle, Globe } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { TipTapEditor } from "@/components/tiptap-editor";
import {
  isValidUrl,
  normalizeUrl,
  parseUrls,
  joinUrls,
  addUrlToUrls,
  extractDomain,
  getFaviconUrl,
} from "@/lib/url-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Function to decode HTML entities
function decodeHTMLEntities(text: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

// Function to check if there are actual unsaved changes
function hasActualChanges(
  currentTitle: string,
  currentContent: string,
  currentLink: string,
  originalNote: Note | null
): boolean {
  if (!originalNote) {
    // For new notes, only consider changes if there's actual content
    return (
      currentTitle.trim() !== "" ||
      currentContent.trim() !== "" ||
      currentLink.trim() !== ""
    );
  }

  // For existing notes, check if any field has changed
  const titleChanged = currentTitle !== originalNote.title;
  const contentChanged = currentContent !== originalNote.content;
  const linkChanged = currentLink !== joinUrls(originalNote.links);

  return titleChanged || contentChanged || linkChanged;
}

interface Note {
  id: string;
  title: string;
  content: string;
  links: string[];
  created_at: string;
  updated_at: string;
}

export const Route = createFileRoute("/note/$noteId")({
  component: NoteComponent,
});

function NoteComponent() {
  const { noteId } = Route.useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [hasLink, setHasLink] = useState(false);
  const [content, setContent] = useState("");
  const [newPastedContent, setNewPastedContent] = useState<string | null>(null);
  const [clipboardMonitoring, setClipboardMonitoring] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [isEditingUrls, setIsEditingUrls] = useState(false);
  const [invalidUrlWarning, setInvalidUrlWarning] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null
  );

  const linkRef = useRef(link);
  const lastProcessedClipboardRef = useRef<string>("");
  const clipboardProcessingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs to avoid dependency changes
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const noteRef = useRef(note);

  const urls = parseUrls(link);

  useEffect(() => {
    linkRef.current = link;
  }, [link]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    loadNote();
  }, [noteId]);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setLink(joinUrls(note.links));
      setHasLink(note.links.length > 0);
      setIsLoading(false);
    }
  }, [note]);

  useEffect(() => {
    if (invalidUrlWarning) {
      const timer = setTimeout(() => {
        setInvalidUrlWarning(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [invalidUrlWarning]);

  const loadNote = async () => {
    try {
      const noteData = await invoke<Note>("load_note", { id: noteId });
      setNote(noteData);
    } catch (error) {
      console.error("Failed to load note:", error);
      // Don't show error toast for non-existent notes, just set loading to false
      // This allows creating new notes
      setIsLoading(false);
    }
  };

  // Handle navigation with unsaved changes
  const handleNavigation = useCallback(
    (to: string) => {
      if (hasUnsavedChanges) {
        setPendingNavigation(to);
        setShowUnsavedDialog(true);
      } else {
        // Use replaceState to avoid page refresh
        window.history.replaceState(null, "", to);
      }
    },
    [hasUnsavedChanges]
  );

  const handleSaveAndNavigate = useCallback(async () => {
    setShowUnsavedDialog(false);
    await saveNote();
    if (pendingNavigation) {
      // Use replaceState to avoid page refresh
      window.history.replaceState(null, "", pendingNavigation);
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  const handleDiscardAndNavigate = useCallback(() => {
    setShowUnsavedDialog(false);
    setHasUnsavedChanges(false);
    if (pendingNavigation) {
      // Use replaceState to avoid page refresh
      window.history.replaceState(null, "", pendingNavigation);
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  const handleCancelNavigation = useCallback(() => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  }, []);

  const saveNote = useCallback(async () => {
    const currentTitle = titleRef.current;
    const currentContent = contentRef.current;
    const currentNote = noteRef.current;
    const currentLink = linkRef.current;

    if (!currentTitle.trim() && !currentContent.trim()) return;

    setIsSaving(true);

    try {
      const urls = parseUrls(currentLink);
      const noteTitle = currentTitle.trim() || "Untitled Note";

      if (currentNote) {
        // Update existing note
        await invoke("update_note", {
          id: noteId,
          title: noteTitle,
          content: currentContent,
          links: urls,
        });
      } else {
        // Create new note if it doesn't exist
        const newNoteId = await invoke<string>("save_note", {
          title: noteTitle,
          content: currentContent,
          links: urls,
        });

        // Update the note state instead of navigating
        if (newNoteId !== noteId) {
          // Update the current note with the new data
          const updatedNote: Note = {
            id: newNoteId,
            title: noteTitle,
            content: currentContent,
            links: urls,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setNote(updatedNote);
          // Update the URL without navigation
          window.history.replaceState(null, "", `/note/${newNoteId}`);
        }
      }
      setHasUnsavedChanges(false);
      toast.success("Note saved");

      // Notify sidebar to refresh notes list
      window.dispatchEvent(new CustomEvent("note-saved"));
    } catch (error) {
      console.error("Failed to save note:", error);
      toast.error("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [noteId]);

  // Handle Ctrl+S keyboard shortcut and navigation events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        saveNote();
      }
    };

    const handleNavigateAway = (event: CustomEvent) => {
      const { to } = event.detail;
      handleNavigation(to);
    };

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener(
      "navigate-away",
      handleNavigateAway as EventListener
    );

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(
        "navigate-away",
        handleNavigateAway as EventListener
      );
    };
  }, [saveNote, handleNavigation]);

  useEffect(() => {
    async function setupClipboardMonitoring() {
      try {
        const unlisten = await listen("clipboard-changed", (event) => {
          const payload = event.payload as {
            text: string;
            from_app: boolean;
          };

          if (!payload || !payload.text || !payload.text.trim()) {
            return;
          }
          if (payload.from_app) {
            return;
          }

          const clipboardText = payload.text.trim();

          if (clipboardProcessingTimeoutRef.current) {
            clearTimeout(clipboardProcessingTimeoutRef.current);
          }

          clipboardProcessingTimeoutRef.current = setTimeout(() => {
            if (lastProcessedClipboardRef.current === clipboardText) {
              return;
            }

            const isUrl = isValidUrl(clipboardText);

            if (isUrl) {
              const currentLinkValue = linkRef.current;
              const currentUrls = parseUrls(currentLinkValue);
              const normalizedUrl = normalizeUrl(clipboardText);

              if (!currentUrls.includes(normalizedUrl)) {
                const newUrls = addUrlToUrls(currentUrls, normalizedUrl);
                const newLinkString = joinUrls(newUrls);
                setLink(newLinkString);
                setHasLink(true);
                lastProcessedClipboardRef.current = clipboardText;
              }
            } else {
              // Decode HTML entities in clipboard text
              const decodedText = decodeHTMLEntities(clipboardText);
              setNewPastedContent(decodedText);
              lastProcessedClipboardRef.current = clipboardText;
            }
          }, 100);
        });
        setClipboardMonitoring(true);
        setClipboardError(null);

        return () => {
          unlisten();
          if (clipboardProcessingTimeoutRef.current) {
            clearTimeout(clipboardProcessingTimeoutRef.current);
          }
        };
      } catch (error) {
        console.error("Failed to setup clipboard monitoring:", error);
        setClipboardMonitoring(false);
        setClipboardError(
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    setupClipboardMonitoring();
  }, []);

  const handleLinkChange = (value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue === "") {
      setLink("");
      setHasLink(false);
      setInvalidUrlWarning(null);

      // Check if there are actual changes using the comprehensive function
      const hasChanges = hasActualChanges(title, content, "", note);
      setHasUnsavedChanges(hasChanges);
      return;
    }
    const parsedUrls = parseUrls(trimmedValue);
    const invalidUrls = parsedUrls.filter((url) => !isValidUrl(url));
    if (invalidUrls.length === 0) {
      setLink(value);
      setHasLink(true);
      setInvalidUrlWarning(null);

      // Check if there are actual changes using the comprehensive function
      const hasChanges = hasActualChanges(title, content, value, note);
      setHasUnsavedChanges(hasChanges);
    } else {
      setInvalidUrlWarning(`Invalid URL detected: ${invalidUrls.join(", ")}`);
    }
  };

  const handleTitleChange = (value: string) => {
    if (value.length <= 100) {
      setTitle(value);

      // Check if there are actual changes using the comprehensive function
      const hasChanges = hasActualChanges(value, content, link, note);
      setHasUnsavedChanges(hasChanges);

      // Update note title in sidebar immediately
      if (note) {
        const updatedNote = { ...note, title: value };
        setNote(updatedNote);
        // Notify sidebar to update the note title
        window.dispatchEvent(
          new CustomEvent("note-title-changed", {
            detail: { noteId: note.id, title: value },
          })
        );
      }
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);

    // Check if there are actual changes using the comprehensive function
    const hasChanges = hasActualChanges(title, value, link, note);
    setHasUnsavedChanges(hasChanges);
  };

  const ClickableUrl = ({
    url,
    onClick,
  }: {
    url: string;
    onClick: () => void;
  }) => {
    const domain = extractDomain(url);
    const faviconUrl = getFaviconUrl(url);

    return (
      <button
        type="button"
        className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors text-sm"
        onClick={onClick}
      >
        <img
          src={faviconUrl}
          alt={`${domain} favicon`}
          className="w-4 h-4 rounded-sm"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.nextElementSibling?.classList.remove("hidden");
          }}
        />
        <Globe className="w-4 h-4 hidden" />
        <span className="truncate max-w-[200px]">{domain}</span>
        <ExternalLink className="w-3 h-3" />
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-lg">Loading note...</div>
      </div>
    );
  }

  // If note doesn't exist, show a message that this is a new note
  if (!note) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full w-full container p-4 sm:p-8 lg:p-20">
          <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <Input
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="text-4xl font-bold border-none shadow-none focus-visible:ring-0 p-0 h-auto bg-transparent !h-auto !text-4xl !font-bold !border-none !shadow-none !focus-visible:ring-0 !p-0 !bg-transparent"
                  placeholder="Title"
                  maxLength={100}
                />
              </div>
              <div className="flex items-center gap-2 ml-4">
                {hasUnsavedChanges && (
                  <span className="text-sm text-muted-foreground">*</span>
                )}
                {isSaving && (
                  <div className="text-sm text-muted-foreground">Saving...</div>
                )}
                <button
                  onClick={saveNote}
                  disabled={isSaving}
                  className="text-sm text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  Save (Ctrl+S)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 w-full">
              <div className="w-full flex items-center gap-2 text-muted-foreground">
                <Link className="size-4" />
                <div className="flex-1 flex flex-wrap gap-2 items-center min-h-[40px] p-2">
                  {urls.length > 0 && !isEditingUrls ? (
                    <>
                      {urls.map((url, index) => (
                        <ClickableUrl
                          key={index}
                          url={url}
                          onClick={() => {
                            invoke("open_url", { url: url }).catch(() => {
                              window.open(url, "_blank", "noopener,noreferrer");
                            });
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setIsEditingUrls(true)}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded"
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={link}
                        onChange={(e) => handleLinkChange(e.target.value)}
                        className="text-sm border-none shadow-none focus-visible:ring-0 p-0 h-auto !bg-transparent transition-colors duration-300 ease-in-out flex-1"
                        placeholder="Paste a link or click 'Edit' to add one..."
                        type="url"
                        readOnly={!isEditingUrls && urls.length > 0}
                        onFocus={() => setIsEditingUrls(true)}
                        onBlur={() => {
                          if (urls.length > 0) {
                            setIsEditingUrls(false);
                          }
                        }}
                      />
                      {isEditingUrls && (
                        <button
                          type="button"
                          onClick={() => setIsEditingUrls(false)}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded"
                        >
                          Done
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {invalidUrlWarning && (
                  <div className="flex items-center gap-2 mt-1 text-sm text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    <span>{invalidUrlWarning}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 flex-1 min-h-0">
              <TipTapEditor
                content={content}
                onChange={handleContentChange}
                pastedContent={newPastedContent}
                onPasteProcessed={() => setNewPastedContent(null)}
                placeholder="Start writing your notes..."
                className="min-h-[500px] text-lg leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full w-full container p-4 sm:p-8 lg:p-20">
          <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <Input
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="text-4xl font-bold border-none shadow-none focus-visible:ring-0 p-0 h-auto bg-transparent !h-auto !text-4xl !font-bold !border-none !shadow-none !focus-visible:ring-0 !p-0 !bg-transparent"
                  placeholder="Title"
                  maxLength={100}
                />
              </div>
              <div className="flex items-center gap-2 ml-4">
                {hasUnsavedChanges && (
                  <span className="text-sm text-muted-foreground">*</span>
                )}
                {isSaving && (
                  <div className="text-sm text-muted-foreground">Saving...</div>
                )}
                <button
                  onClick={saveNote}
                  disabled={isSaving}
                  className="text-sm text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  Save (Ctrl+S)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 w-full">
              <div className="w-full flex items-center gap-2 text-muted-foreground">
                <Link className="size-4" />
                <div className="flex-1 flex flex-wrap gap-2 items-center min-h-[40px] p-2">
                  {urls.length > 0 && !isEditingUrls ? (
                    <>
                      {urls.map((url, index) => (
                        <ClickableUrl
                          key={index}
                          url={url}
                          onClick={() => {
                            invoke("open_url", { url: url }).catch(() => {
                              window.open(url, "_blank", "noopener,noreferrer");
                            });
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setIsEditingUrls(true)}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded"
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={link}
                        onChange={(e) => handleLinkChange(e.target.value)}
                        className="text-sm border-none shadow-none focus-visible:ring-0 p-0 h-auto !bg-transparent transition-colors duration-300 ease-in-out flex-1"
                        placeholder="Paste a link or click 'Edit' to add one..."
                        type="url"
                        readOnly={!isEditingUrls && urls.length > 0}
                        onFocus={() => setIsEditingUrls(true)}
                        onBlur={() => {
                          if (urls.length > 0) {
                            setIsEditingUrls(false);
                          }
                        }}
                      />
                      {isEditingUrls && (
                        <button
                          type="button"
                          onClick={() => setIsEditingUrls(false)}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded"
                        >
                          Done
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {invalidUrlWarning && (
                  <div className="flex items-center gap-2 mt-1 text-sm text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    <span>{invalidUrlWarning}</span>
                  </div>
                )}
              </div>
              {hasLink && urls.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      className="group p-0 m-0 bg-transparent border-none flex items-center gap-2"
                      onClick={() => {
                        if (urls[0]) {
                          invoke("open_url", { url: urls[0] }).catch(() => {
                            window.open(
                              urls[0],
                              "_blank",
                              "noopener,noreferrer"
                            );
                          });
                        }
                      }}
                    >
                      <img
                        src={getFaviconUrl(urls[0])}
                        alt={`${extractDomain(urls[0])} favicon`}
                        className="w-4 h-4 rounded-sm"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden"
                          );
                        }}
                      />
                      <Globe className="w-4 h-4 hidden" />
                      <span className="text-sm text-muted-foreground truncate max-w-[150px] sm:max-w-[200px] group-hover:text-primary transition-colors">
                        {extractDomain(urls[0])}
                      </span>
                      <ExternalLink className="size-4 text-muted-foreground cursor-pointer transition-colors flex-shrink-0 group-hover:text-primary" />
                    </button>
                  </div>

                  {urls.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-center w-6 h-6 rounded-md bg-muted hover:bg-accent transition-colors flex-shrink-0">
                          <span className="text-xs font-medium">
                            +{urls.length - 1}
                          </span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-64 max-h-64 overflow-y-auto"
                      >
                        {urls.slice(1).map((url, index) => (
                          <DropdownMenuItem
                            key={index}
                            onClick={() => {
                              invoke("open_url", { url: url }).catch(() => {
                                window.open(
                                  url,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              });
                            }}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <img
                              src={getFaviconUrl(url)}
                              alt={`${extractDomain(url)} favicon`}
                              className="w-4 h-4 rounded-sm flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                            <Globe className="w-4 h-4 hidden flex-shrink-0" />
                            <span className="truncate flex-1 text-xs">
                              {extractDomain(url)}
                            </span>
                            <ExternalLink className="size-3 flex-shrink-0" />
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 flex-1 min-h-0">
              <TipTapEditor
                content={content}
                onChange={handleContentChange}
                pastedContent={newPastedContent}
                onPasteProcessed={() => setNewPastedContent(null)}
                placeholder="Start writing your notes..."
                className="min-h-[500px] text-lg leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Alert Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in your note. Do you want to save them
              before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelNavigation}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardAndNavigate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
            <AlertDialogAction onClick={handleSaveAndNavigate}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
