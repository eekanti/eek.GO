const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || '/projects';
const API_TOKEN = process.env.FILE_API_TOKEN;

// Auth middleware
app.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${API_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Resolve and validate path stays within projects root
function safePath(projectId, filePath = '') {
  const base = path.resolve(PROJECTS_ROOT, projectId);
  const full = path.resolve(base, filePath);
  if (!full.startsWith(base)) throw new Error('Path traversal detected');
  return { base, full };
}

// GET /projects/:id/files — list all files as a tree
app.get('/projects/:id/files', (req, res) => {
  try {
    const { base } = safePath(req.params.id);
    if (!fs.existsSync(base)) return res.json({ files: [] });

    const result = execSync(`find ${base} -type f | sort`, { encoding: 'utf8' });
    const files = result.trim().split('\n').filter(Boolean).map(f => f.replace(base + '/', ''));
    res.json({ project_id: req.params.id, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /projects/:id/file?path=src/server.ts — read a file
app.get('/projects/:id/file', (req, res) => {
  try {
    const { full } = safePath(req.params.id, req.query.path || '');
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
    const content = fs.readFileSync(full, 'utf8');
    res.json({ path: req.query.path, content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /projects/:id/file — write/create a file
app.post('/projects/:id/file', (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'path and content required' });
    const { full } = safePath(req.params.id, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    res.json({ success: true, path: filePath, bytes: Buffer.byteLength(content) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /projects/:id/file — replace lines start-end with new content
app.patch('/projects/:id/file', (req, res) => {
  try {
    const { path: filePath, content, start_line, end_line } = req.body;
    if (!filePath) return res.status(400).json({ error: 'path required' });
    const { full } = safePath(req.params.id, filePath);

    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });

    // Full replace if no line range given
    if (start_line === undefined || end_line === undefined) {
      fs.writeFileSync(full, content, 'utf8');
      return res.json({ success: true, path: filePath, mode: 'full_replace' });
    }

    // Line-range replace
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    const newLines = content.split('\n');
    lines.splice(start_line - 1, end_line - start_line + 1, ...newLines);
    fs.writeFileSync(full, lines.join('\n'), 'utf8');
    res.json({ success: true, path: filePath, mode: 'line_replace', lines_replaced: end_line - start_line + 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /projects/:id/file?path=src/old.ts — delete a file
app.delete('/projects/:id/file', (req, res) => {
  try {
    const { full } = safePath(req.params.id, req.query.path || '');
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
    fs.unlinkSync(full);
    res.json({ success: true, path: req.query.path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /projects/:id/search?q=keyword — grep across project files
app.get('/projects/:id/search', (req, res) => {
  try {
    const { base } = safePath(req.params.id);
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q required' });
    if (!fs.existsSync(base)) return res.json({ matches: [] });

    const escaped = q.replace(/'/g, "'\\''");
    const result = execSync(`grep -rn '${escaped}' ${base} 2>/dev/null || true`, { encoding: 'utf8' });
    const matches = result.trim().split('\n').filter(Boolean).map(line => {
      const [file, lineNum, ...rest] = line.split(':');
      return { file: file.replace(base + '/', ''), line: parseInt(lineNum), match: rest.join(':').trim() };
    });
    res.json({ query: q, matches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /projects/:id/files-content — read all files with content in one call
app.get('/projects/:id/files-content', (req, res) => {
  try {
    const { base } = safePath(req.params.id);
    if (!fs.existsSync(base)) return res.json({ project_id: req.params.id, files: [] });

    const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv']);
    const MAX_FILE_SIZE = 50 * 1024;
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        try {
          const stat = fs.statSync(full);
          if (stat.size > MAX_FILE_SIZE) continue;
          files.push({ path: full.replace(base + '/', ''), content: fs.readFileSync(full, 'utf8') });
        } catch {}
      }
    };
    walk(base);
    res.json({ project_id: req.params.id, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /projects/:id/files-batch — write multiple files at once
app.post('/projects/:id/files-batch', (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'files array required' });
    const results = [];
    for (const file of files) {
      const { path: filePath, content } = file;
      if (!filePath || content === undefined) { results.push({ path: filePath, error: 'path and content required' }); continue; }
      const { full } = safePath(req.params.id, filePath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
      results.push({ path: filePath, bytes: Buffer.byteLength(content), success: true });
    }
    res.json({ project_id: req.params.id, files_written: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /projects — list all projects
app.get('/projects', (req, res) => {
  try {
    const dirs = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    res.json({ projects: dirs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /scrape — screenshot + CSS tokens + DOM summary of a URL
app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  let browser;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Screenshot as base64
    const screenshotBuf = await page.screenshot({ fullPage: false, type: 'png' });
    const screenshot_b64 = screenshotBuf.toString('base64');

    // Computed CSS tokens
    const css_tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const colors = new Set(), fonts = new Set(), spacing = new Set();
      const css_vars = {};
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.style) {
              ['color', 'background-color', 'border-color'].forEach(p => {
                const v = rule.style.getPropertyValue(p); if (v) colors.add(v);
              });
              const ff = rule.style.getPropertyValue('font-family'); if (ff) fonts.add(ff);
              ['margin', 'padding', 'gap', 'border-radius'].forEach(p => {
                const v = rule.style.getPropertyValue(p); if (v) spacing.add(v);
              });
            }
          }
        } catch (e) {}
      }
      for (const prop of style) {
        if (prop.startsWith('--')) css_vars[prop] = style.getPropertyValue(prop).trim();
      }
      return {
        colors: [...colors].slice(0, 30),
        fonts: [...fonts].slice(0, 10),
        spacing: [...spacing].slice(0, 20),
        css_vars
      };
    });

    // DOM summary — tag + class + text snippet
    const dom_summary = await page.evaluate(() => {
      const nodes = [];
      const walk = (el, depth) => {
        if (depth > 4 || nodes.length > 80) return;
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().replace(/\s+/g, '.') : '';
        const text = el.childNodes.length === 1 && el.firstChild.nodeType === 3
          ? el.firstChild.textContent.trim().slice(0, 60) : '';
        nodes.push('  '.repeat(depth) + el.tagName.toLowerCase() + cls + (text ? ` "${text}"` : ''));
        for (const child of el.children) walk(child, depth + 1);
      };
      walk(document.body, 0);
      return nodes.join('\n');
    });

    res.json({ screenshot_b64, css_tokens, dom_summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ─── Preview: build & run projects ─────────────────────────────────────
const PREVIEW_PORT = parseInt(process.env.PREVIEW_PORT) || 4000;
let activePreview = null; // { projectId, process, port }

function killPreview() {
  if (!activePreview?.process) return;
  const pid = activePreview.process.pid;
  try {
    // Kill the entire process group (catches child processes like esbuild)
    process.kill(-pid, 'SIGTERM');
  } catch {
    try { activePreview.process.kill('SIGTERM'); } catch {}
  }
  // Also force-kill anything on the preview port
  try {
    execSync(`kill $(lsof -ti:${PREVIEW_PORT}) 2>/dev/null || true`, { stdio: 'pipe', timeout: 5000 });
  } catch {}
  // Wait a moment then force kill if still alive
  setTimeout(() => {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try {
      execSync(`kill -9 $(lsof -ti:${PREVIEW_PORT}) 2>/dev/null || true`, { stdio: 'pipe', timeout: 5000 });
    } catch {}
  }, 1000);
  activePreview = null;
}

// POST /projects/:id/preview/start — npm install + dev server
app.post('/projects/:id/preview/start', async (req, res) => {
  try {
    const { base } = safePath(req.params.id);
    if (!fs.existsSync(base)) return res.status(404).json({ error: 'Project not found' });
    if (!fs.existsSync(path.join(base, 'package.json'))) {
      return res.status(400).json({ error: 'No package.json — project cannot be built' });
    }

    // Kill existing preview — entire process tree
    killPreview();
    await new Promise(r => setTimeout(r, 1500)); // wait for port to free

    // npm install
    try {
      execSync('npm install --no-audit --no-fund', { cwd: base, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    } catch (e) {
      return res.status(500).json({ error: 'npm install failed', detail: (e.stderr || e.message).slice(0, 500) });
    }

    // Detect the dev command and framework
    const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
    const scripts = pkg.scripts || {};

    // Start dev server
    const { spawn } = require('child_process');
    let cmd, args;
    if (scripts.dev) {
      cmd = 'npx';
      if (fs.existsSync(path.join(base, 'node_modules', '.bin', 'vite'))) {
        args = ['vite', '--host', '0.0.0.0', '--port', String(PREVIEW_PORT)];
      } else if (fs.existsSync(path.join(base, 'node_modules', '.bin', 'next'))) {
        args = ['next', 'dev', '-H', '0.0.0.0', '-p', String(PREVIEW_PORT)];
      } else {
        cmd = 'npm';
        args = ['run', 'dev'];
      }
    } else {
      return res.status(400).json({ error: 'No dev script in package.json' });
    }

    const child = spawn(cmd, args, {
      cwd: base,
      env: { ...process.env, PORT: String(PREVIEW_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // creates a process group so we can kill all children
    });

    let output = '';
    child.stdout.on('data', d => output += d.toString());
    child.stderr.on('data', d => output += d.toString());

    activePreview = { projectId: req.params.id, process: child, port: PREVIEW_PORT };

    child.on('exit', () => {
      if (activePreview?.projectId === req.params.id) activePreview = null;
    });

    // Wait for server to be ready (poll for up to 15s)
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const http = require('http');
        await new Promise((resolve, reject) => {
          const req = http.get(`http://localhost:${PREVIEW_PORT}`, r => { r.resume(); resolve(); });
          req.on('error', reject);
          req.setTimeout(1000, () => { req.destroy(); reject(); });
        });
        ready = true;
        break;
      } catch {}
    }

    if (!ready) {
      child.kill('SIGTERM');
      activePreview = null;
      return res.status(500).json({ error: 'Dev server failed to start', output: output.slice(0, 1000) });
    }

    res.json({ status: 'running', project_id: req.params.id, port: PREVIEW_PORT, url: `http://10.0.0.100:${PREVIEW_PORT}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /projects/:id/preview/stop — kill dev server
app.post('/projects/:id/preview/stop', (req, res) => {
  if (!activePreview || activePreview.projectId !== req.params.id) {
    return res.json({ status: 'not_running' });
  }
  killPreview();
  res.json({ status: 'stopped' });
});

// GET /preview/status — check if a preview is running
app.get('/preview/status', (req, res) => {
  if (activePreview) {
    res.json({ status: 'running', project_id: activePreview.projectId, port: activePreview.port, url: `http://10.0.0.100:${activePreview.port}` });
  } else {
    res.json({ status: 'stopped' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => console.log(`File API running on port ${PORT}, projects root: ${PROJECTS_ROOT}`));
