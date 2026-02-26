# Dev Dashboard

A local development project dashboard that scans your project directories, auto-detects project types, and gives you quick actions to run, open, and manage everything from one place.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Auto-detection** - Recognizes 20+ project types: React, Next.js, Expo, Vue, Svelte, Python, Go, Rust, Docker, and more
- **Multiple directories** - Scan multiple project folders at once
- **Quick actions** - Run dev servers, build, test, open in your editor, terminal, or file manager
- **Process management** - Start/stop processes with live log streaming and auto port detection
- **Git status** - See branch, uncommitted changes, and last commit at a glance
- **Search & filter** - Find projects by name, type, git status, or running state
- **Configurable** - Choose your editor, port, and project directories from the settings UI
- **Cross-platform** - Works on macOS and Linux
- **Zero build step** - Pure HTML/CSS/JS frontend, no bundler needed

## Quick Start

```bash
git clone https://github.com/yourusername/dev-dashboard.git
cd dev-dashboard
npm install
npm start
```

On first launch, the dashboard opens in your browser and presents a welcome screen where you add your project directories.

## Configuration

Settings are stored in `~/.devdashboard.json` and can be edited through the settings UI (gear icon) or manually:

```json
{
  "projectDirectories": [
    "/Users/you/Projects",
    "/Users/you/work"
  ],
  "port": 4200,
  "editor": "cursor"
}
```

### Options

| Key | Default | Description |
|-----|---------|-------------|
| `projectDirectories` | `[]` | Directories to scan for project folders |
| `port` | `4200` | Port the dashboard runs on |
| `editor` | `cursor` | Editor to open projects in (`cursor`, `vscode`, `zed`, `sublime`, `webstorm`) |

## Supported Project Types

| Type | Detection |
|------|-----------|
| Expo | `app.json` with expo config |
| Next.js | `next` in dependencies |
| React | `react` in dependencies |
| Vue | `vue` in dependencies |
| Svelte | `svelte` in dependencies |
| Vite | `vite` in dependencies |
| Express | `express` in dependencies |
| Node.js | `package.json` present |
| Python | `requirements.txt`, `setup.py`, `pyproject.toml`, or `.py` files |
| Go | `go.mod` |
| Rust | `Cargo.toml` |
| TypeScript | `typescript` in dependencies |
| Docker | `Dockerfile` or `docker-compose.yml` |
| iOS/Xcode | `.xcodeproj` or `Podfile` |
| PHP | `.php` files |
| Ruby | `Gemfile` |
| HTML | `.html` files |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Focus search |
| `Cmd/Ctrl + ,` | Open settings |
| `Escape` | Close panels/modals |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Override the dashboard port |
| `NO_OPEN` | Set to `1` to prevent auto-opening the browser |

## How It Works

The dashboard is a lightweight Express server that:

1. Reads your configured project directories
2. Scans each directory for project folders
3. Detects project types by analyzing `package.json`, config files, and file extensions
4. Provides a REST API that the frontend polls for updates
5. Spawns and manages child processes when you run commands
6. Auto-detects ports from process output for quick browser access

No data leaves your machine. Everything runs locally.

## License

MIT
