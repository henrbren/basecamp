# Dev Dashboard

Your local projects, one dashboard to rule them all.

A lightweight, self-hosted project dashboard that scans your directories, auto-detects what kind of projects they are, and lets you run, open, and manage them with a single click.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![Express](https://img.shields.io/badge/Express-4.x-lightgrey) ![License](https://img.shields.io/badge/license-MIT-blue) ![Build](https://img.shields.io/badge/build_step-none-orange)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) version 18 or newer
- npm (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/henrikbrendhagen/dev-dashboard.git

# Navigate into the folder
cd dev-dashboard

# Install dependencies
npm install
```

### Start the dashboard

```bash
npm start
```

The dashboard will open automatically in your default browser at [http://localhost:4200](http://localhost:4200).

> **Tip:** Set the environment variable `NO_OPEN=1` to prevent auto-opening the browser, or `PORT=8080` to use a different port.

### First launch

When you start the dashboard for the first time you'll see a **welcome screen**. From here you can:

1. **Type a path** to a directory that contains your projects (e.g. `~/Projects`) and click **Add**
2. **Use auto-detected suggestions** - the dashboard checks common locations like `~/Projects`, `~/Developer`, `~/code`, etc.
3. **Scan your computer** - click "scan your computer" to run the project scanner which walks your filesystem and finds every project automatically

Once you've added at least one directory, click **Get Started** and you're good to go.

---

## Features

### Project detection
Automatically recognizes **20+ project types** by analyzing `package.json`, config files, and file extensions:

| Category | Types |
|----------|-------|
| **JavaScript** | React, Next.js, Vue, Svelte, Vite, Express, Node.js, Electron |
| **Mobile** | Expo, iOS/Xcode, Cordova |
| **Languages** | Python, Go, Rust, Ruby, PHP, TypeScript |
| **Infrastructure** | Docker, Makefile, Shell |
| **Web** | HTML/CSS/JS |

### Quick actions
Every project gets context-aware action buttons:
- **Run** - `npm run dev`, `expo start`, `cargo run`, `python3 main.py`, etc.
- **Open** - launch in your editor (Cursor, VS Code, Zed, Sublime, WebStorm), file manager, or terminal
- **Build & test** - `npm run build`, `go test`, `cargo test`, etc.
- **Setup** - `npm install`, `pip install -r requirements.txt`

### Process management
- Start processes and see **live log output** in a built-in log viewer
- **Auto port detection** - when a dev server prints a port, the dashboard picks it up and gives you an "Open in browser" button
- Stop running processes with one click
- Running processes are shown in the sidebar with their port

### Git overview
See at a glance for every project:
- Current branch
- Number of uncommitted changes
- Last commit message and date
- Whether a remote is configured

### Project scanner
Click the **radar icon** in the sidebar to open the scanner:
- Scans your filesystem starting from your home directory
- Finds directories containing `.git`, `package.json`, `Cargo.toml`, `go.mod`, and other project indicators
- Groups results by parent directory with project counts
- Add discovered directories with one click
- Results are **cached locally** so you can view them again without rescanning
- Configurable scan depth (3-6 levels)

### Search & filter
- **Search** projects by name, type, or description (`Cmd/Ctrl + K`)
- **Filter** by: technology, git status, running state, missing `node_modules`, or source directory
- **Sort** by last modified, name, creation date, or running state
- **Grid or list** view toggle

### Settings
Click the **gear icon** to configure:
- **Project directories** - add or remove folders to scan
- **Editor** - choose between Cursor, VS Code, Zed, Sublime Text, or WebStorm
- **Port** - change the dashboard port (requires restart)

Settings are stored in `~/.devdashboard.json`.

---

## Configuration

### Config file

The config file is created automatically at `~/.devdashboard.json`:

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

| Key | Default | Description |
|-----|---------|-------------|
| `projectDirectories` | `[]` | Directories to scan for project folders |
| `port` | `4200` | Port the dashboard runs on |
| `editor` | `cursor` | Editor to open projects in |

### Supported editors

| Value | Editor |
|-------|--------|
| `cursor` | Cursor |
| `vscode` | Visual Studio Code |
| `zed` | Zed |
| `sublime` | Sublime Text |
| `webstorm` | WebStorm |

### Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | Override the dashboard port (takes precedence over config) |
| `NO_OPEN` | Set to `1` to prevent auto-opening the browser on start |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Focus search |
| `Cmd/Ctrl + ,` | Open settings |
| `Escape` | Close any open panel or modal |

---

## How It Works

```
┌──────────────────────────────────────────────┐
│  Browser (localhost:4200)                     │
│  ┌──────────┐ ┌───────────────────────────┐  │
│  │ Sidebar  │ │ Project Grid / List       │  │
│  │ Filters  │ │ Cards with actions        │  │
│  │ Stats    │ │ Detail panel              │  │
│  │ Running  │ │ Log viewer                │  │
│  └──────────┘ └───────────────────────────┘  │
└───────────────────┬──────────────────────────┘
                    │ REST API
┌───────────────────┴──────────────────────────┐
│  Express Server (server.js)                   │
│  - Scans configured directories               │
│  - Detects project types                      │
│  - Manages child processes                    │
│  - Filesystem scanner                         │
│  - Cross-platform open commands               │
└──────────────────────────────────────────────┘
```

1. The Express server reads your configured project directories
2. Each directory is scanned for subdirectories containing projects
3. Project types are detected by analyzing files (`package.json`, `Cargo.toml`, etc.)
4. The frontend polls the API for project data and process status
5. When you run a command, the server spawns a child process and streams the logs
6. Ports are auto-detected from process output (e.g. `localhost:3000`)

**No data leaves your machine.** Everything runs locally with zero external API calls.

---

## Project Structure

```
dev-dashboard/
├── server.js          # Express server, API, scanner, process management
├── public/
│   └── index.html     # Entire frontend (HTML + CSS + JS, no build step)
├── package.json
├── start.sh           # Helper script for manual startup
├── create-icon.sh     # macOS app icon generator (optional)
├── LICENSE
└── README.md
```

The entire frontend is a single HTML file - no frameworks, no bundler, no build step. Just open and hack.

---

## Running as a background service (optional)

### Using a shell alias

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias dashboard="cd /path/to/dev-dashboard && NO_OPEN=1 node server.js &"
```

### Using the start script

```bash
./start.sh
```

The script automatically finds Node.js (including via nvm), starts the server, and opens the browser.

---

## Troubleshooting

**Dashboard won't start / port in use**
```bash
# Kill any existing process on port 4200
lsof -ti:4200 | xargs kill -9
npm start
```

**Node.js not found**
Make sure Node.js 18+ is installed. If using nvm:
```bash
nvm install 18
nvm use 18
```

**Projects not showing up**
- Make sure you've added the correct parent directory (the folder *containing* your projects, not a project itself)
- Check the settings (gear icon) to verify your directories
- Use the scanner (radar icon) to automatically find project directories

**Git info not showing**
Git must be installed and available in your PATH for branch/status info to appear.

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/something-cool`)
3. Commit your changes
4. Push to the branch (`git push origin feature/something-cool`)
5. Open a Pull Request

---

## Author

Made with &hearts; by [Henrik Brendhagen](https://github.com/henrikbrendhagen)

## License

[MIT](LICENSE)
