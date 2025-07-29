# Notes_V2

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Tauri** - Build native desktop applications
- **Turborepo** - Optimized monorepo build system

## Notes App Features

- **Note Management** - Create, edit, and delete notes
- **Auto-save** - Notes are automatically saved as you type
- **URL Management** - Automatically capture and manage URLs from clipboard
- **Search** - Search through all your notes
- **Rich Text Editor** - Powered by TipTap for rich text editing
- **Desktop App** - Native desktop application with Tauri
- **Clipboard Integration** - Automatically detect and handle clipboard content

## Getting Started

First, install the dependencies:

```bash
bun install
```

Then, run the development server:

```bash
bun dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.

For the desktop app:

```bash
cd apps/web
bun desktop:dev
```

## Project Structure

```
Notes_V2/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   │   ├── src/
│   │   │   ├── routes/     # File-based routing
│   │   │   ├── components/ # UI components
│   │   │   └── src-tauri/  # Tauri backend (Rust)
```

## Available Scripts

- `bun dev`: Start all applications in development mode
- `bun build`: Build all applications
- `bun dev:web`: Start only the web application
- `bun check-types`: Check TypeScript types across all apps
- `cd apps/web && bun desktop:dev`: Start Tauri desktop app in development
- `cd apps/web && bun desktop:build`: Build Tauri desktop app

## Notes App Usage

1. **Creating Notes**: Click "New Note" in the sidebar or start typing on the home page
2. **Editing Notes**: Click on any note in the sidebar to open it for editing
3. **Auto-save**: Notes are automatically saved as you type
4. **URL Management**: Paste URLs and they'll be automatically captured
5. **Search**: Use the search bar in the sidebar to find notes
6. **Deleting Notes**: Use the dropdown menu on each note to delete it

## Data Storage

Notes are stored locally in JSON files in the application's data directory. Each note contains:

- Title
- Content (rich text)
- Links (URLs)
- Creation and modification timestamps
