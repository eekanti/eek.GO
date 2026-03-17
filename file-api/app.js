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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => console.log(`File API running on port ${PORT}, projects root: ${PROJECTS_ROOT}`));
