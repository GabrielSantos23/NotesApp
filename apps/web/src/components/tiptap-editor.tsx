import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

interface TipTapEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  className?: string;
}

export function TipTapEditor({
  content = "",
  onChange,
  placeholder = "Start writing...",
  className = "",
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none ${className}`,
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Auto-formatting logic
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " ") return;

      const { selection } = editor.state;
      const { $from } = selection;

      // Get the current line content
      const lineStart = $from.start();
      const lineEnd = $from.end();
      const lineContent = editor.state.doc.textBetween(lineStart, lineEnd);

      // Check for code block patterns (```)
      const codeBlockMatch = lineContent.match(/^```\s*(\w*)\s*$/);
      if (codeBlockMatch) {
        event.preventDefault();

        editor
          .chain()
          .focus()
          .deleteRange({ from: lineStart, to: lineEnd })
          .toggleCodeBlock()
          .run();
        return;
      }

      // Check for heading patterns
      const headingMatch = lineContent.match(/^(#{1,6})\s/);
      if (headingMatch) {
        event.preventDefault();
        const level = Math.min(headingMatch[1].length, 6);
        const text = lineContent.slice(headingMatch[1].length).trim();

        editor
          .chain()
          .focus()
          .deleteRange({ from: lineStart, to: lineEnd })
          .setNode("heading", { level })
          .insertContent(text)
          .run();
        return;
      }

      // Check for bullet list patterns
      const bulletMatch = lineContent.match(/^[-*]\s/);
      if (bulletMatch) {
        event.preventDefault();
        const text = lineContent.slice(1).trim();

        editor
          .chain()
          .focus()
          .deleteRange({ from: lineStart, to: lineEnd })
          .toggleBulletList()
          .insertContent(text)
          .run();
        return;
      }

      // Check for ordered list patterns
      const orderedMatch = lineContent.match(/^\d+\.\s/);
      if (orderedMatch) {
        event.preventDefault();
        const text = lineContent.replace(/^\d+\.\s*/, "").trim();

        editor
          .chain()
          .focus()
          .deleteRange({ from: lineStart, to: lineEnd })
          .toggleOrderedList()
          .insertContent(text)
          .run();
        return;
      }

      // Check for blockquote patterns
      const quoteMatch = lineContent.match(/^>\s/);
      if (quoteMatch) {
        event.preventDefault();
        const text = lineContent.slice(1).trim();

        editor
          .chain()
          .focus()
          .deleteRange({ from: lineStart, to: lineEnd })
          .toggleBlockquote()
          .insertContent(text)
          .run();
        return;
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const text = clipboardData.getData("text/plain");
      if (!text) return;

      // Check if the pasted content looks like markdown
      const lines = text.split("\n");
      let hasMarkdown = false;

      // Check for code blocks first
      if (text.includes("```")) {
        hasMarkdown = true;
      } else {
        // Check for other markdown patterns
        for (const line of lines) {
          if (
            line.match(/^(#{1,6})\s/) ||
            line.match(/^[-*]\s/) ||
            line.match(/^\d+\.\s/) ||
            line.match(/^>\s/) ||
            line.match(/^`.*`$/) // inline code
          ) {
            hasMarkdown = true;
            break;
          }
        }
      }

      if (hasMarkdown) {
        event.preventDefault();

        // Process markdown content
        const processedContent: string[] = [];
        let currentBulletList: string[] = [];
        let currentOrderedList: string[] = [];
        let currentBlockquote: string[] = [];
        let currentCodeBlock: string[] = [];
        let inCodeBlock = false;
        let codeBlockLanguage = "";

        const flushLists = () => {
          if (currentBulletList.length > 0) {
            processedContent.push(
              `<ul>${currentBulletList.map((item) => `<li>${item}</li>`).join("")}</ul>`
            );
            currentBulletList = [];
          }
          if (currentOrderedList.length > 0) {
            processedContent.push(
              `<ol>${currentOrderedList.map((item) => `<li>${item}</li>`).join("")}</ol>`
            );
            currentOrderedList = [];
          }
          if (currentBlockquote.length > 0) {
            processedContent.push(
              `<blockquote><p>${currentBlockquote.join(" ")}</p></blockquote>`
            );
            currentBlockquote = [];
          }
        };

        const flushCodeBlock = () => {
          if (currentCodeBlock.length > 0) {
            const codeContent = currentCodeBlock.join("\n");
            processedContent.push(`<pre><code>${codeContent}</code></pre>`);
            currentCodeBlock = [];
            codeBlockLanguage = "";
          }
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmedLine = line.trim();

          // Handle code block boundaries
          if (trimmedLine.startsWith("```")) {
            if (inCodeBlock) {
              // End of code block
              flushCodeBlock();
              inCodeBlock = false;
            } else {
              // Start of code block
              flushLists();
              inCodeBlock = true;
              codeBlockLanguage = trimmedLine.slice(3).trim();
            }
            continue;
          }

          // If we're in a code block, just collect the content
          if (inCodeBlock) {
            currentCodeBlock.push(line);
            continue;
          }

          // Skip empty lines outside of code blocks
          if (!trimmedLine) continue;

          // Process inline code first (before other formatting)
          let processedLine = trimmedLine;
          if (processedLine.includes("`")) {
            processedLine = processedLine.replace(
              /`([^`]+)`/g,
              "<code>$1</code>"
            );
          }

          // Headings
          const headingMatch = processedLine.match(/^(#{1,6})\s(.+)/);
          if (headingMatch) {
            flushLists();
            const level = Math.min(headingMatch[1].length, 6);
            const headingText = headingMatch[2].replace(
              /`([^`]+)`/g,
              "<code>$1</code>"
            );
            processedContent.push(`<h${level}>${headingText}</h${level}>`);
            continue;
          }

          // Bullet lists
          const bulletMatch = processedLine.match(/^[-*]\s(.+)/);
          if (bulletMatch) {
            // Flush other lists but continue bullet list
            if (currentOrderedList.length > 0) {
              processedContent.push(
                `<ol>${currentOrderedList.map((item) => `<li>${item}</li>`).join("")}</ol>`
              );
              currentOrderedList = [];
            }
            if (currentBlockquote.length > 0) {
              processedContent.push(
                `<blockquote><p>${currentBlockquote.join(" ")}</p></blockquote>`
              );
              currentBlockquote = [];
            }
            currentBulletList.push(bulletMatch[1]);
            continue;
          }

          // Ordered lists
          const orderedMatch = processedLine.match(/^\d+\.\s(.+)/);
          if (orderedMatch) {
            // Flush other lists but continue ordered list
            if (currentBulletList.length > 0) {
              processedContent.push(
                `<ul>${currentBulletList.map((item) => `<li>${item}</li>`).join("")}</ul>`
              );
              currentBulletList = [];
            }
            if (currentBlockquote.length > 0) {
              processedContent.push(
                `<blockquote><p>${currentBlockquote.join(" ")}</p></blockquote>`
              );
              currentBlockquote = [];
            }
            currentOrderedList.push(orderedMatch[1]);
            continue;
          }

          // Blockquotes
          const quoteMatch = processedLine.match(/^>\s(.+)/);
          if (quoteMatch) {
            // Flush lists but continue blockquote
            if (currentBulletList.length > 0) {
              processedContent.push(
                `<ul>${currentBulletList.map((item) => `<li>${item}</li>`).join("")}</ul>`
              );
              currentBulletList = [];
            }
            if (currentOrderedList.length > 0) {
              processedContent.push(
                `<ol>${currentOrderedList.map((item) => `<li>${item}</li>`).join("")}</ol>`
              );
              currentOrderedList = [];
            }
            currentBlockquote.push(quoteMatch[1]);
            continue;
          }

          // Regular text
          flushLists();
          processedContent.push(`<p>${processedLine}</p>`);
        }

        // Flush any remaining content
        flushLists();
        flushCodeBlock();

        const html = processedContent.join("");
        editor.commands.insertContent(html);
      }
    };

    // Add event listeners to the editor DOM element
    const editorElement = editor.view.dom;
    editorElement.addEventListener("keydown", handleKeyDown);
    editorElement.addEventListener("paste", handlePaste);

    return () => {
      editorElement.removeEventListener("keydown", handleKeyDown);
      editorElement.removeEventListener("paste", handlePaste);
    };
  }, [editor]);

  // Update content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full">
      <EditorContent
        editor={editor}
        className={`min-h-[200px] w-full p-4 focus:outline-none ${className}`}
      />
    </div>
  );
}
