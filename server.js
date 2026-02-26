const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync, exec, spawn } = require('child_process');
const os = require('os');

const app = express();

// ─── Configuration ────────────────────────────────────────────────────

const CONFIG_PATH = path.join(os.homedir(), '.devdashboard.json');

const DEFAULT_CONFIG = {
  projectDirectories: [],
  port: 4200,
  editor: 'cursor',
};

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  config = cfg;
  return cfg;
}

let config = loadConfig();
const PORT = parseInt(process.env.PORT || config.port) || 4200;

// ─── Platform helpers ─────────────────────────────────────────────────

const PLATFORM = process.platform;

function openPath(target) {
  if (PLATFORM === 'darwin') return `open "${target}"`;
  if (PLATFORM === 'win32') return `start "" "${target}"`;
  return `xdg-open "${target}"`;
}

function editorCommand(projectPath) {
  const editor = config.editor || 'cursor';
  const q = `"${projectPath}"`;
  const commands = {
    cursor:   PLATFORM === 'darwin' ? `open -a "Cursor" ${q}` : `cursor ${q}`,
    vscode:   PLATFORM === 'darwin' ? `open -a "Visual Studio Code" ${q}` : `code ${q}`,
    sublime:  PLATFORM === 'darwin' ? `open -a "Sublime Text" ${q}` : `subl ${q}`,
    webstorm: PLATFORM === 'darwin' ? `open -a "WebStorm" ${q}` : `webstorm ${q}`,
    zed:      PLATFORM === 'darwin' ? `open -a "Zed" ${q}` : `zed ${q}`,
  };
  return commands[editor] || `${editor} ${q}`;
}

function terminalCommand(projectPath) {
  const q = `"${projectPath}"`;
  if (PLATFORM === 'darwin') return `open -a Terminal ${q}`;
  if (PLATFORM === 'win32') return `start cmd /K "cd /d ${q}"`;
  return `x-terminal-emulator --working-directory=${q} 2>/dev/null || gnome-terminal --working-directory=${q} 2>/dev/null || xterm -e "cd ${q} && bash"`;
}

function fileManagerCommand(projectPath) {
  const q = `"${projectPath}"`;
  if (PLATFORM === 'darwin') return `open ${q}`;
  if (PLATFORM === 'win32') return `explorer ${q}`;
  return `xdg-open ${q}`;
}

// ─── Environment ──────────────────────────────────────────────────────

function getEnvPath() {
  const extra = [];
  const nvmDir = path.join(os.homedir(), '.nvm/versions/node');
  if (fs.existsSync(nvmDir)) {
    try {
      const versions = fs.readdirSync(nvmDir).sort().reverse();
      if (versions.length) extra.push(path.join(nvmDir, versions[0], 'bin'));
    } catch {}
  }
  const fnmDir = path.join(os.homedir(), '.fnm/aliases/default/bin');
  if (fs.existsSync(fnmDir)) extra.push(fnmDir);

  for (const p of ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin']) {
    if (fs.existsSync(p)) extra.push(p);
  }
  return extra.join(':');
}

const shellEnv = {
  ...process.env,
  PATH: getEnvPath() + ':' + (process.env.PATH || ''),
  HOME: os.homedir(),
};

const runningProcesses = new Map();
let processIdCounter = 0;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Project detection ────────────────────────────────────────────────

function detectProjectType(dirPath, files) {
  const hasFile = (name) => files.includes(name);
  const types = [];

  if (hasFile('app.json')) {
    try {
      const appJson = JSON.parse(fs.readFileSync(path.join(dirPath, 'app.json'), 'utf8'));
      if (appJson.expo) types.push('expo');
    } catch {}
  }

  if (hasFile('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['next']) types.push('nextjs');
      if (allDeps['react'] && !types.includes('nextjs') && !types.includes('expo')) types.push('react');
      if (allDeps['vue']) types.push('vue');
      if (allDeps['express']) types.push('express');
      if (allDeps['vite']) types.push('vite');
      if (allDeps['svelte']) types.push('svelte');
      if (allDeps['electron']) types.push('electron');
      if (allDeps['typescript'] || allDeps['ts-node']) types.push('typescript');
      if (!types.length) types.push('node');
    } catch {}
  }

  if (hasFile('requirements.txt') || hasFile('setup.py') || hasFile('pyproject.toml')) types.push('python');
  if (files.some(f => f.endsWith('.py')) && !types.includes('python')) types.push('python');
  if (hasFile('Podfile') || files.some(f => f.endsWith('.xcodeproj'))) types.push('ios');
  if (files.some(f => f.endsWith('.xcodeproj'))) types.push('xcode');
  if (hasFile('Gemfile')) types.push('ruby');
  if (hasFile('Dockerfile') || hasFile('docker-compose.yml')) types.push('docker');
  if (hasFile('Makefile')) types.push('makefile');
  if (hasFile('go.mod')) types.push('go');
  if (hasFile('Cargo.toml')) types.push('rust');

  const hasHtml = files.some(f => f.endsWith('.html'));
  if (hasHtml && !types.length) types.push('html');
  if (hasFile('config.xml') && hasFile('build.json')) types.push('cordova');
  if (files.some(f => f.endsWith('.php'))) types.push('php');
  if (files.some(f => f.endsWith('.sh'))) types.push('shell');

  if (!types.length) types.push('other');
  return types;
}

function getScripts(dirPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf8'));
    return pkg.scripts || {};
  } catch { return {}; }
}

function getAvailableActions(types, files, dirPath) {
  const actions = [];
  const scripts = getScripts(dirPath);
  const hasNodeModules = files.includes('node_modules');
  const hasPackageJson = files.includes('package.json');
  const hasHtml = files.some(f => f.endsWith('.html'));
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  actions.push({ id: 'editor', label: 'Open in Editor', icon: 'zap', category: 'open' });
  actions.push({ id: 'finder', label: 'Open in File Manager', icon: 'folder', category: 'open' });
  actions.push({ id: 'terminal', label: 'Open Terminal', icon: 'terminal', category: 'open' });

  if (hasPackageJson && !hasNodeModules) {
    actions.push({ id: 'npm-install', label: 'npm install', icon: 'download', category: 'setup', priority: true });
  }

  if (types.includes('expo')) {
    actions.push({ id: 'expo-start', label: 'Expo Start', icon: 'play', category: 'run', command: 'npx expo start', priority: true });
    actions.push({ id: 'expo-ios', label: 'Expo iOS', icon: 'phone', category: 'run', command: 'npx expo start --ios' });
    actions.push({ id: 'expo-android', label: 'Expo Android', icon: 'phone', category: 'run', command: 'npx expo start --android' });
    actions.push({ id: 'expo-web', label: 'Expo Web', icon: 'globe', category: 'run', command: 'npx expo start --web' });
  }

  if (types.includes('nextjs')) {
    if (scripts.dev) actions.push({ id: 'next-dev', label: 'Next Dev', icon: 'play', category: 'run', command: 'npm run dev', priority: true });
    if (scripts.build) actions.push({ id: 'next-build', label: 'Next Build', icon: 'package', category: 'build', command: 'npm run build' });
    if (scripts.start) actions.push({ id: 'next-start', label: 'Next Start', icon: 'play', category: 'run', command: 'npm start' });
  }

  if (types.includes('vite') || (types.includes('react') && scripts.dev)) {
    if (scripts.dev) actions.push({ id: 'dev', label: 'Dev Server', icon: 'play', category: 'run', command: 'npm run dev', priority: true });
    if (scripts.build) actions.push({ id: 'build', label: 'Build', icon: 'package', category: 'build', command: 'npm run build' });
    if (scripts.preview) actions.push({ id: 'preview', label: 'Preview Build', icon: 'eye', category: 'run', command: 'npm run preview' });
  }

  if (types.includes('express') || (types.includes('node') && (scripts.start || scripts.dev))) {
    if (scripts.dev) actions.push({ id: 'dev', label: 'Dev Server', icon: 'play', category: 'run', command: 'npm run dev', priority: true });
    else if (scripts.start) actions.push({ id: 'start', label: 'Start Server', icon: 'play', category: 'run', command: 'npm start', priority: true });
    if (files.includes('server.js') && !scripts.start && !scripts.dev) {
      actions.push({ id: 'run-server', label: 'node server.js', icon: 'play', category: 'run', command: 'node server.js', priority: true });
    }
    if (files.includes('index.js') && !scripts.start && !scripts.dev && !files.includes('server.js')) {
      actions.push({ id: 'run-index', label: 'node index.js', icon: 'play', category: 'run', command: 'node index.js', priority: true });
    }
  }

  if (hasPackageJson && !actions.some(a => a.category === 'run')) {
    if (scripts.start) actions.push({ id: 'start', label: 'npm start', icon: 'play', category: 'run', command: 'npm start', priority: true });
    if (scripts.dev) actions.push({ id: 'dev', label: 'npm run dev', icon: 'play', category: 'run', command: 'npm run dev', priority: true });
  }
  if (scripts.test) actions.push({ id: 'test', label: 'Run Tests', icon: 'check', category: 'test', command: 'npm test' });
  if (scripts.lint) actions.push({ id: 'lint', label: 'Lint', icon: 'check', category: 'test', command: 'npm run lint' });

  if (types.includes('python')) {
    const mainPy = files.find(f => f === 'main.py' || f === 'app.py' || f === 'index.py');
    if (mainPy) {
      actions.push({ id: 'python-run', label: `python3 ${mainPy}`, icon: 'play', category: 'run', command: `python3 ${mainPy}`, priority: true });
    }
    if (files.includes('requirements.txt')) {
      actions.push({ id: 'pip-install', label: 'pip install -r requirements.txt', icon: 'download', category: 'setup', command: 'pip3 install -r requirements.txt' });
    }
  }

  if (types.includes('go')) {
    actions.push({ id: 'go-run', label: 'go run .', icon: 'play', category: 'run', command: 'go run .', priority: true });
    actions.push({ id: 'go-build', label: 'go build', icon: 'package', category: 'build', command: 'go build ./...' });
    actions.push({ id: 'go-test', label: 'go test', icon: 'check', category: 'test', command: 'go test ./...' });
  }

  if (types.includes('rust')) {
    actions.push({ id: 'cargo-run', label: 'cargo run', icon: 'play', category: 'run', command: 'cargo run', priority: true });
    actions.push({ id: 'cargo-build', label: 'cargo build', icon: 'package', category: 'build', command: 'cargo build' });
    actions.push({ id: 'cargo-test', label: 'cargo test', icon: 'check', category: 'test', command: 'cargo test' });
  }

  if (hasHtml) {
    const mainHtml = files.includes('index.html') ? 'index.html' : htmlFiles[0];
    actions.push({ id: 'preview-html', label: `Preview ${mainHtml}`, icon: 'eye', category: 'preview', htmlFile: mainHtml, priority: types.includes('html') });
    actions.push({ id: 'serve-html', label: 'Start local server', icon: 'globe', category: 'run', command: 'npx serve -l 3000 .', priority: types.includes('html') });
  }

  if (types.includes('docker')) {
    if (files.includes('docker-compose.yml') || files.includes('docker-compose.yaml')) {
      actions.push({ id: 'docker-up', label: 'Docker Compose Up', icon: 'play', category: 'run', command: 'docker compose up' });
      actions.push({ id: 'docker-down', label: 'Docker Compose Down', icon: 'square', category: 'run', command: 'docker compose down' });
    } else {
      actions.push({ id: 'docker-build', label: 'Docker Build', icon: 'package', category: 'build', command: 'docker build -t $(basename $(pwd)) .' });
    }
  }

  if (types.includes('xcode')) {
    const xcProj = files.find(f => f.endsWith('.xcodeproj'));
    if (xcProj) actions.push({ id: 'xcode', label: 'Open in Xcode', icon: 'code', category: 'open', xcProject: xcProj });
  }

  if (hasPackageJson) {
    const coveredScripts = new Set(['start', 'dev', 'build', 'test', 'lint', 'preview']);
    for (const [name, cmd] of Object.entries(scripts)) {
      if (!coveredScripts.has(name) && !name.startsWith('pre') && !name.startsWith('post')) {
        actions.push({ id: `script-${name}`, label: `npm run ${name}`, icon: 'terminal', category: 'script', command: `npm run ${name}` });
      }
    }
  }

  return actions;
}

function getGitInfo(dirPath) {
  const gitDir = path.join(dirPath, '.git');
  if (!fs.existsSync(gitDir)) return null;
  const info = { hasGit: true };
  const opts = { cwd: dirPath, timeout: 3000, env: shellEnv };
  try { info.branch = execSync('git rev-parse --abbrev-ref HEAD', opts).toString().trim(); } catch { info.branch = 'unknown'; }
  try {
    const status = execSync('git status --porcelain', opts).toString().trim();
    info.dirty = status.length > 0;
    info.changedFiles = status ? status.split('\n').length : 0;
  } catch { info.dirty = false; info.changedFiles = 0; }
  try {
    info.lastCommit = execSync('git log -1 --format="%s"', opts).toString().trim();
    info.lastCommitDate = execSync('git log -1 --format="%ci"', opts).toString().trim();
  } catch {}
  try {
    const remotes = execSync('git remote -v', opts).toString().trim();
    info.hasRemote = remotes.length > 0;
    if (info.hasRemote) { const m = remotes.match(/origin\s+(.+?)\s+\(fetch\)/); info.remoteUrl = m ? m[1] : null; }
  } catch { info.hasRemote = false; }
  return info;
}

function getProjectSize(dirPath) {
  try {
    let sz = 0;
    for (const e of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (['node_modules', '.git', 'venv', '__pycache__', '.next', 'dist', 'build'].includes(e.name)) continue;
      try { if (e.isFile()) sz += fs.statSync(path.join(dirPath, e.name)).size; } catch {}
    }
    return sz;
  } catch { return 0; }
}

// ─── API: Settings ────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(config);
});

app.put('/api/settings', (req, res) => {
  const newConfig = { ...config, ...req.body };
  if (newConfig.projectDirectories && !Array.isArray(newConfig.projectDirectories)) {
    return res.status(400).json({ error: 'projectDirectories must be an array' });
  }
  if (newConfig.port && (isNaN(newConfig.port) || newConfig.port < 1 || newConfig.port > 65535)) {
    return res.status(400).json({ error: 'Invalid port number' });
  }
  saveConfig(newConfig);
  res.json(newConfig);
});

app.post('/api/settings/add-directory', (req, res) => {
  const { directory } = req.body;
  if (!directory) return res.status(400).json({ error: 'Directory path required' });
  const resolved = path.resolve(directory.replace(/^~/, os.homedir()));
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: `Directory not found: ${resolved}` });
  if (!fs.statSync(resolved).isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });
  if (config.projectDirectories.includes(resolved)) return res.json(config);
  config.projectDirectories.push(resolved);
  saveConfig(config);
  res.json(config);
});

app.post('/api/settings/remove-directory', (req, res) => {
  const { directory } = req.body;
  config.projectDirectories = config.projectDirectories.filter(d => d !== directory);
  saveConfig(config);
  res.json(config);
});

app.get('/api/settings/suggest-directories', (req, res) => {
  const home = os.homedir();
  const candidates = [
    'Projects', 'projects', 'Developer', 'developer', 'dev', 'Dev',
    'code', 'Code', 'workspace', 'Workspace', 'repos', 'Repos',
    'src', 'Sites', 'www', 'Local dev',
  ];
  const found = [];
  for (const name of candidates) {
    const full = path.join(home, name);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        const entries = fs.readdirSync(full, { withFileTypes: true });
        const dirCount = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).length;
        if (dirCount > 0) found.push({ path: full, name: `~/${name}`, count: dirCount });
      }
    } catch {}
  }
  res.json(found);
});

// ─── API: Projects ────────────────────────────────────────────────────

const appDir = path.resolve(__dirname);

app.get('/api/projects', (req, res) => {
  try {
    const dirs = config.projectDirectories;
    if (!dirs.length) return res.json([]);

    const projects = [];
    const seenPaths = new Set();

    for (const parentDir of dirs) {
      if (!fs.existsSync(parentDir)) continue;
      let entries;
      try { entries = fs.readdirSync(parentDir, { withFileTypes: true }); } catch { continue; }

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const dirPath = path.join(parentDir, entry.name);
        if (seenPaths.has(dirPath) || dirPath === appDir) continue;
        seenPaths.add(dirPath);

        let files;
        try { files = fs.readdirSync(dirPath); } catch { continue; }
        const stat = fs.statSync(dirPath);
        const types = detectProjectType(dirPath, files);
        const git = getGitInfo(dirPath);
        const actions = getAvailableActions(types, files, dirPath);

        let description = '';
        if (files.includes('package.json')) {
          try { description = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf8')).description || ''; } catch {}
        }
        let readmeSnippet = '';
        const rm = files.find(f => f.toLowerCase() === 'readme.md');
        if (rm) { try { readmeSnippet = fs.readFileSync(path.join(dirPath, rm), 'utf8').substring(0, 200).replace(/[#\n\r]/g, ' ').trim(); } catch {} }

        const runningHere = [];
        for (const [id, p] of runningProcesses) {
          if (p.projectPath === dirPath) runningHere.push({ id, command: p.command, port: p.port, startedAt: p.startedAt });
        }

        projects.push({
          name: entry.name, path: dirPath, parentDir, types, git, actions,
          files: files.filter(f => !f.startsWith('.')).slice(0, 30),
          fileCount: files.filter(f => !f.startsWith('.')).length,
          hasNodeModules: files.includes('node_modules'),
          hasPackageJson: files.includes('package.json'),
          scripts: getScripts(dirPath),
          description, readmeSnippet,
          lastModified: stat.mtime, created: stat.birthtime,
          size: getProjectSize(dirPath),
          running: runningHere,
        });
      }
    }
    projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    res.json(projects);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: Open things ─────────────────────────────────────────────────

app.post('/api/open-editor', (req, res) => {
  exec(editorCommand(req.body.projectPath), (e) => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

app.post('/api/open-cursor', (req, res) => {
  exec(editorCommand(req.body.projectPath), (e) => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

app.post('/api/open-finder', (req, res) => {
  exec(fileManagerCommand(req.body.projectPath), (e) => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

app.post('/api/open-terminal', (req, res) => {
  exec(terminalCommand(req.body.projectPath), (e) => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

app.post('/api/open-browser', (req, res) => {
  exec(openPath(req.body.url), (e) => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

app.post('/api/open-xcode', (req, res) => {
  const { projectPath, xcProject } = req.body;
  exec(openPath(path.join(projectPath, xcProject)), (e) => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

app.post('/api/open-html', (req, res) => {
  const { projectPath, htmlFile } = req.body;
  exec(openPath(path.join(projectPath, htmlFile || 'index.html')), (e) => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

// ─── API: Run processes ───────────────────────────────────────────────

app.post('/api/run', (req, res) => {
  const { projectPath, command, name } = req.body;
  if (!projectPath || !command) return res.status(400).json({ error: 'Missing projectPath or command' });

  const id = ++processIdCounter;
  const logs = [];
  const maxLogs = 500;

  const proc = spawn('bash', ['-c', command], {
    cwd: projectPath,
    env: shellEnv,
    detached: false,
  });

  const entry = {
    proc, name: name || command, projectPath, command,
    port: null, logs, startedAt: new Date().toISOString(), pid: proc.pid,
  };

  const addLog = (data, stream) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line) continue;
      if (logs.length >= maxLogs) logs.shift();
      logs.push({ time: Date.now(), text: line, stream });
      const portMatch = line.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i)
        || line.match(/port\s+(\d{4,5})/i)
        || line.match(/running (?:on|at)\s+.*?:(\d{4,5})/i);
      if (portMatch && !entry.port) entry.port = parseInt(portMatch[1]);
    }
  };

  proc.stdout.on('data', (d) => addLog(d, 'stdout'));
  proc.stderr.on('data', (d) => addLog(d, 'stderr'));
  proc.on('close', (code) => {
    logs.push({ time: Date.now(), text: `Process exited with code ${code}`, stream: 'system' });
    entry.exitCode = code;
    entry.endedAt = new Date().toISOString();
  });
  proc.on('error', (err) => {
    logs.push({ time: Date.now(), text: `Error: ${err.message}`, stream: 'system' });
  });

  runningProcesses.set(id, entry);
  res.json({ ok: true, processId: id, pid: proc.pid });
});

app.post('/api/npm-install', (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'No path' });

  const id = ++processIdCounter;
  const logs = [];
  const proc = spawn('npm', ['install'], { cwd: projectPath, env: shellEnv });
  const entry = { proc, name: 'npm install', projectPath, command: 'npm install', port: null, logs, startedAt: new Date().toISOString(), pid: proc.pid };

  proc.stdout.on('data', (d) => { for (const l of d.toString().split('\n')) if (l) logs.push({ time: Date.now(), text: l, stream: 'stdout' }); });
  proc.stderr.on('data', (d) => { for (const l of d.toString().split('\n')) if (l) logs.push({ time: Date.now(), text: l, stream: 'stderr' }); });
  proc.on('close', (code) => { entry.exitCode = code; entry.endedAt = new Date().toISOString(); logs.push({ time: Date.now(), text: `npm install finished (code ${code})`, stream: 'system' }); });

  runningProcesses.set(id, entry);
  res.json({ ok: true, processId: id });
});

app.get('/api/processes', (req, res) => {
  const result = [];
  for (const [id, p] of runningProcesses) {
    result.push({
      id, name: p.name, projectPath: p.projectPath, projectName: path.basename(p.projectPath),
      command: p.command, port: p.port, pid: p.pid,
      startedAt: p.startedAt, endedAt: p.endedAt || null,
      exitCode: p.exitCode !== undefined ? p.exitCode : null,
      alive: !p.proc.killed && p.exitCode === undefined,
      logCount: p.logs.length,
    });
  }
  res.json(result);
});

app.get('/api/processes/:id/logs', (req, res) => {
  const entry = runningProcesses.get(parseInt(req.params.id));
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const since = parseInt(req.query.since) || 0;
  const logs = entry.logs.filter(l => l.time > since);
  res.json({
    logs,
    alive: !entry.proc.killed && entry.exitCode === undefined,
    port: entry.port,
    exitCode: entry.exitCode !== undefined ? entry.exitCode : null,
  });
});

app.post('/api/processes/:id/stop', (req, res) => {
  const entry = runningProcesses.get(parseInt(req.params.id));
  if (!entry) return res.status(404).json({ error: 'Not found' });
  try {
    process.kill(-entry.proc.pid, 'SIGTERM');
  } catch {
    try { entry.proc.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => {
    try { entry.proc.kill('SIGKILL'); } catch {}
  }, 3000);
  res.json({ ok: true });
});

app.delete('/api/processes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const entry = runningProcesses.get(id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  try { entry.proc.kill('SIGKILL'); } catch {}
  runningProcesses.delete(id);
  res.json({ ok: true });
});

// ─── API: Git, Create, Delete ─────────────────────────────────────────

app.post('/api/git-init', (req, res) => {
  try { execSync('git init', { cwd: req.body.projectPath, env: shellEnv }); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/create-project', (req, res) => {
  const { name, template, parentDirectory } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const targetDir = parentDirectory || config.projectDirectories[0];
  if (!targetDir) return res.status(400).json({ error: 'No project directory configured' });
  const dirPath = path.join(targetDir, name);
  if (fs.existsSync(dirPath)) return res.status(409).json({ error: 'Already exists' });
  fs.mkdirSync(dirPath, { recursive: true });
  if (template === 'html') {
    fs.writeFileSync(path.join(dirPath, 'index.html'), `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>${name}</h1>\n  <script src="script.js"></script>\n</body>\n</html>`);
    fs.writeFileSync(path.join(dirPath, 'style.css'), '* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui, sans-serif; }\n');
    fs.writeFileSync(path.join(dirPath, 'script.js'), `// ${name}\n`);
  } else if (template === 'node') {
    fs.writeFileSync(path.join(dirPath, 'package.json'), JSON.stringify({ name: name.toLowerCase().replace(/\s/g, '-'), version: '1.0.0', main: 'index.js' }, null, 2));
    fs.writeFileSync(path.join(dirPath, 'index.js'), `// ${name}\n`);
  } else if (template === 'python') {
    fs.writeFileSync(path.join(dirPath, 'main.py'), `# ${name}\n`);
    fs.writeFileSync(path.join(dirPath, 'requirements.txt'), '');
  }
  if (req.body.initGit) { try { execSync('git init', { cwd: dirPath, env: shellEnv }); } catch {} }
  res.json({ ok: true, path: dirPath });
});

app.delete('/api/projects/:name', (req, res) => {
  const name = req.params.name;
  for (const parentDir of config.projectDirectories) {
    const dirPath = path.join(parentDir, name);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return res.json({ ok: true });
    }
  }
  res.status(404).json({ error: 'Not found' });
});

// ─── API: Scanner ─────────────────────────────────────────────────────

const SCAN_CACHE_PATH = path.join(os.homedir(), '.devdashboard-scan.json');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'venv', '__pycache__', '.cache', '.npm', '.nvm',
  '.cargo', '.rustup', '.local', '.Trash', '.gradle', '.m2', '.cocoapods',
  'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'Downloads',
  'dist', 'build', '.next', '.expo', '.svn', 'vendor', 'target',
  'Pods', 'DerivedData', 'xcuserdata', '.docker', '.kube', '.oh-my-zsh',
  '.vscode', '.cursor', 'snap', '.android', '.java', 'go', '.gem',
]);

const PROJECT_INDICATORS = [
  '.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
  'setup.py', 'Gemfile', 'build.gradle', 'pom.xml', 'CMakeLists.txt',
  'Dockerfile', 'docker-compose.yml', 'requirements.txt',
];

let scanState = {
  running: false, scannedDirs: 0, foundProjects: [],
  currentDir: '', startedAt: null, cancelled: false,
};

function startScan(roots, maxDepth) {
  if (scanState.running) return false;
  scanState = {
    running: true, scannedDirs: 0, foundProjects: [],
    currentDir: '', startedAt: Date.now(), cancelled: false,
  };

  const queue = roots.map(r => ({ dir: path.resolve(r.replace(/^~/, os.homedir())), depth: 0 }));

  function processBatch() {
    if (scanState.cancelled || queue.length === 0) {
      scanState.running = false;
      try {
        fs.writeFileSync(SCAN_CACHE_PATH, JSON.stringify({
          timestamp: Date.now(),
          projects: scanState.foundProjects,
          groups: groupScanResults(scanState.foundProjects),
        }, null, 2));
      } catch {}
      return;
    }

    let processed = 0;
    while (queue.length > 0 && processed < 200) {
      const { dir, depth } = queue.shift();
      processed++;
      if (depth > maxDepth) continue;

      const dirName = path.basename(dir);
      if (SKIP_DIRS.has(dirName)) continue;

      scanState.scannedDirs++;
      scanState.currentDir = dir;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const names = entries.map(e => e.name);

        const indicators = PROJECT_INDICATORS.filter(f => names.includes(f));
        if (names.some(n => n.endsWith('.xcodeproj'))) indicators.push('.xcodeproj');

        if (indicators.length > 0) {
          scanState.foundProjects.push({
            path: dir, name: path.basename(dir),
            parentDir: path.dirname(dir), indicators,
          });
          continue;
        }

        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
      } catch {}
    }

    setImmediate(processBatch);
  }

  setImmediate(processBatch);
  return true;
}

function groupScanResults(projects) {
  const groups = {};
  for (const p of projects) {
    if (!groups[p.parentDir]) groups[p.parentDir] = [];
    groups[p.parentDir].push(p);
  }
  const homeRe = new RegExp(`^${os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return Object.entries(groups)
    .map(([dir, projs]) => ({
      directory: dir,
      displayName: dir.replace(homeRe, '~'),
      count: projs.length,
      projects: projs.map(p => p.name).sort(),
      alreadyAdded: config.projectDirectories.includes(dir),
    }))
    .sort((a, b) => b.count - a.count);
}

app.post('/api/scan/start', (req, res) => {
  const roots = req.body.roots || [os.homedir()];
  const maxDepth = Math.min(parseInt(req.body.maxDepth) || 5, 8);
  const started = startScan(roots, maxDepth);
  res.json({ started, alreadyRunning: !started });
});

app.get('/api/scan/status', (req, res) => {
  const homeRe = new RegExp(`^${os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  res.json({
    running: scanState.running,
    scannedDirs: scanState.scannedDirs,
    foundCount: scanState.foundProjects.length,
    currentDir: scanState.currentDir.replace(homeRe, '~'),
    elapsed: scanState.startedAt ? Date.now() - scanState.startedAt : 0,
    groups: groupScanResults(scanState.foundProjects).slice(0, 100),
  });
});

app.post('/api/scan/stop', (req, res) => {
  scanState.cancelled = true;
  res.json({ ok: true });
});

app.get('/api/scan/cached', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SCAN_CACHE_PATH, 'utf8'));
    data.groups = data.groups.map(g => ({
      ...g,
      alreadyAdded: config.projectDirectories.includes(g.directory),
    }));
    res.json(data);
  } catch { res.json(null); }
});

// ─── Start ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Dev Dashboard running at http://localhost:${PORT}\n`);
  console.log(`  Config: ${CONFIG_PATH}`);
  console.log(`  Directories: ${config.projectDirectories.length ? config.projectDirectories.join(', ') : '(none configured)'}\n`);
  if (!process.env.NO_OPEN) {
    (async () => { try { (await import('open')).default(`http://localhost:${PORT}`); } catch {} })();
  }
});
