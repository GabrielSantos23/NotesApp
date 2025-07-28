import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Link } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { TipTapEditor } from "@/components/tiptap-editor";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("https://www.google.com");
  const [hasLink, setHasLink] = useState(true);
  const [content, setContent] = useState("");

  const handleLinkChange = (value: string) => {
    // Basic URL validation
    const urlPattern = /^https?:\/\/.+/;
    if (value === "" || urlPattern.test(value)) {
      setLink(value);
      setHasLink(value !== "");
    }
  };

  const handleTitleChange = (value: string) => {
    // Limit title to 100 characters
    if (value.length <= 100) {
      setTitle(value);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-full w-full container p-4 sm:p-8 lg:p-20">
        <div className="flex h-full w-full flex-col">
          {/* Title */}
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="text-4xl font-bold border-none shadow-none focus-visible:ring-0 p-0 h-auto bg-transparent !h-auto !text-4xl !font-bold !border-none !shadow-none !focus-visible:ring-0 !p-0 !bg-transparent"
            placeholder="Title"
            maxLength={100}
          />

          {/* Link */}
          <div className="flex items-center gap-2 mt-3 w-full">
            <div className="w-full flex items-center gap-2 text-muted-foreground group">
              <Link className="size-4" />
              <Input
                value={link}
                onChange={(e) => handleLinkChange(e.target.value)}
                className="text-sm border-none shadow-none focus-visible:ring-0 p-0 h-auto !bg-transparent group-hover:text-primary transition-colors duration-300 ease-in-out"
                placeholder="Enter URL..."
                type="url"
              />
            </div>
            {hasLink && (
              <ExternalLink className="size-4 text-muted-foreground group cursor-pointer" />
            )}
          </div>

          {/* Content */}
          <div className="mt-8 flex-1 min-h-0">
            <TipTapEditor
              content={content}
              onChange={setContent}
              placeholder="Start writing your notes... Use # for headings, - for lists, > for quotes"
              className="min-h-[500px] text-lg leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
