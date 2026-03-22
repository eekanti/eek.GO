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
    const { path: filePath, content, encoding } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'path and content required' });
    const { full } = safePath(req.params.id, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (encoding === 'base64') {
      const buf = Buffer.from(content, 'base64');
      fs.writeFileSync(full, buf);
      res.json({ success: true, path: filePath, bytes: buf.length });
    } else {
      fs.writeFileSync(full, content, 'utf8');
      res.json({ success: true, path: filePath, bytes: Buffer.byteLength(content) });
    }
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

// ─── Reference images: list all images in references/ as base64 ─────────
app.get('/projects/:id/references', (req, res) => {
  try {
    const projectDir = path.join(PROJECTS_ROOT, req.params.id, 'references');
    if (!fs.existsSync(projectDir)) return res.json({ references: [] });
    const files = fs.readdirSync(projectDir).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
    const references = files.map(f => ({
      filename: f,
      base64: fs.readFileSync(path.join(projectDir, f)).toString('base64'),
    }));
    res.json({ references });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Build check: npm install + build, return errors ───────────────────
app.post('/projects/:id/build-check', (req, res) => {
  try {
    const { base } = safePath(req.params.id);
    if (!fs.existsSync(base)) return res.status(404).json({ error: 'Project not found' });
    if (!fs.existsSync(path.join(base, 'package.json'))) {
      return res.json({ success: false, error: 'No package.json', output: '' });
    }

    // npm install
    try {
      execSync('npm install --no-audit --no-fund 2>&1', { cwd: base, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    } catch (e) {
      return res.json({ success: false, stage: 'install', error: 'npm install failed', output: (e.stderr || e.stdout || e.message).slice(0, 2000) });
    }

    // Try build
    try {
      const output = execSync('npx vite build 2>&1', { cwd: base, encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
      return res.json({ success: true, output: output.slice(0, 1000) });
    } catch (e) {
      const output = (e.stderr || e.stdout || e.message);
      return res.json({ success: false, stage: 'build', error: 'Build failed', output: output.slice(0, 3000) });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Console check: start dev server, capture browser console errors ────
const CONSOLE_CHECK_PORT = 4001; // separate port so it doesn't conflict with user preview

app.post('/projects/:id/console-check', async (req, res) => {
  const { base } = safePath(req.params.id);
  if (!fs.existsSync(base)) return res.status(404).json({ success: false, error: 'Project not found' });
  if (!fs.existsSync(path.join(base, 'package.json'))) {
    return res.json({ success: false, error: 'No package.json', errors: [], warnings: [] });
  }

  const { spawn } = require('child_process');
  let devProcess = null;
  let browser = null;

  try {
    // Kill anything on the console check port
    try { execSync(`kill $(lsof -ti:${CONSOLE_CHECK_PORT}) 2>/dev/null || true`, { stdio: 'pipe', timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 500));

    // Start dev server (npm install already done by build-check)
    const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
    if (!pkg.scripts?.dev) {
      return res.json({ success: false, error: 'No dev script', errors: [], warnings: [] });
    }

    let cmd = 'npx', args;
    if (fs.existsSync(path.join(base, 'node_modules', '.bin', 'vite'))) {
      args = ['vite', '--host', '0.0.0.0', '--port', String(CONSOLE_CHECK_PORT)];
    } else if (fs.existsSync(path.join(base, 'node_modules', '.bin', 'next'))) {
      args = ['next', 'dev', '-H', '0.0.0.0', '-p', String(CONSOLE_CHECK_PORT)];
    } else {
      cmd = 'npm'; args = ['run', 'dev'];
    }

    devProcess = spawn(cmd, args, {
      cwd: base,
      env: { ...process.env, PORT: String(CONSOLE_CHECK_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    // Wait for server ready (poll up to 15s)
    let ready = false;
    const http = require('http');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        await new Promise((resolve, reject) => {
          const req = http.get(`http://localhost:${CONSOLE_CHECK_PORT}`, r => { r.resume(); resolve(); });
          req.on('error', reject);
          req.setTimeout(1000, () => { req.destroy(); reject(); });
        });
        ready = true;
        break;
      } catch {}
    }

    if (!ready) {
      return res.json({ success: false, error: 'Dev server failed to start', errors: [], warnings: [] });
    }

    // Launch Playwright and capture console
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const errors = [];
    const warnings = [];
    let pageError = null;

    // Attach listeners BEFORE navigation
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text().substring(0, 500);
      if (type === 'error') errors.push({ type: 'error', message: text });
      else if (type === 'warning') warnings.push({ type: 'warning', message: text });
    });

    page.on('pageerror', error => {
      pageError = pageError || error.message.substring(0, 500);
      errors.push({ type: 'uncaught', message: error.message.substring(0, 500) });
    });

    // Navigate and wait for page to hydrate
    await page.goto(`http://localhost:${CONSOLE_CHECK_PORT}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(4000); // let React effects + animations run

    // Take screenshot for visual review — full page to catch below-fold issues
    const screenshotBuf = await page.screenshot({ fullPage: true, type: 'png' });
    const screenshot_b64 = screenshotBuf.toString('base64');

    // DOM visibility audit — check if elements are stuck at opacity: 0
    const visibilityAudit = await page.evaluate(() => {
      const selectors = ['section', 'main > div', '[class*="card"]', '[class*="badge"]', '[class*="step"]', '[class*="timeline"]', '[class*="feature"]', '[class*="hero"]', '[class*="cta"]'];
      const invisible = [];
      const total = { sections: 0, visible: 0, hidden: 0 };

      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const opacity = parseFloat(style.opacity);
          const isHidden = opacity < 0.1 || rect.height < 5 || style.display === 'none' || style.visibility === 'hidden';

          total.sections++;
          if (isHidden && rect.height > 0) {
            total.hidden++;
            const id = el.id || el.className?.toString().substring(0, 40) || el.tagName;
            invisible.push({ selector: id, opacity: opacity.toFixed(2), height: Math.round(rect.height) });
          } else {
            total.visible++;
          }
        }
      }

      return { invisible: invisible.slice(0, 15), total };
    });

    // ── AUDIT: Broken links ──
    const linkAudit = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const broken = [];
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) {
          const target = document.querySelector(href);
          if (!target) broken.push({ href, reason: 'anchor target not found' });
        }
      }
      return { total: links.length, broken };
    });

    // ── AUDIT: Broken images ──
    const imageAudit = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const broken = [];
      for (const img of imgs) {
        if (!img.complete || img.naturalWidth === 0) {
          broken.push({ src: img.src || img.getAttribute('src') || '?', alt: img.alt || '' });
        }
      }
      return { total: imgs.length, broken };
    });

    // ── AUDIT: Color contrast (simplified WCAG check) ──
    const contrastAudit = await page.evaluate(() => {
      function luminance(r, g, b) {
        const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      }
      function parseColor(str) {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
      }
      const failures = [];
      const textEls = document.querySelectorAll('h1, h2, h3, h4, p, span, a, button, li');
      for (const el of Array.from(textEls).slice(0, 50)) {
        const style = window.getComputedStyle(el);
        const fg = parseColor(style.color);
        const bg = parseColor(style.backgroundColor);
        if (fg && bg && parseFloat(style.opacity) > 0.5) {
          const l1 = luminance(...fg);
          const l2 = luminance(...bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (ratio < 3.0) {
            const text = (el.textContent || '').substring(0, 30).trim();
            if (text) failures.push({ element: el.tagName + (el.className ? '.' + el.className.toString().split(' ')[0] : ''), ratio: ratio.toFixed(1), text });
          }
        }
      }
      return { checked: Math.min(textEls.length, 50), failures: failures.slice(0, 5) };
    });

    // ── AUDIT: Interactive elements blocked by overlays ──
    const interactiveAudit = await page.evaluate(() => {
      const blocked = [];
      const clickables = document.querySelectorAll('a, button, [role="button"]');
      for (const el of Array.from(clickables).slice(0, 30)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.closest('a, button, [role="button"]')) {
          blocked.push({ element: el.tagName + ' "' + (el.textContent || '').substring(0, 20).trim() + '"', blockedBy: topEl.tagName + (topEl.className ? '.' + topEl.className.toString().split(' ')[0] : '') });
        }
      }
      return { checked: Math.min(clickables.length, 30), blocked: blocked.slice(0, 5) };
    });

    // ── AUDIT: Content area coverage (vertical range dedup) ──
    const contentAudit = await page.evaluate(() => {
      const totalHeight = document.body.scrollHeight;
      const scrollY = window.scrollY;
      const ranges = [];

      const els = document.querySelectorAll('h1, h2, h3, h4, p, span, a, button, li, img, svg, div');
      for (const el of Array.from(els).slice(0, 200)) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const absTop = rect.top + scrollY;
        const absBottom = absTop + rect.height;
        if (parseFloat(style.opacity) > 0.3 && rect.height > 8 && rect.height < 600 && rect.width > 20) {
          ranges.push([Math.round(absTop), Math.round(absBottom)]);
        }
      }

      // Merge overlapping ranges
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const [start, end] of ranges) {
        if (merged.length > 0 && start <= merged[merged.length - 1][1]) {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
        } else {
          merged.push([start, end]);
        }
      }

      const visibleContentHeight = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
      const coverage = totalHeight > 0 ? Math.round((visibleContentHeight / totalHeight) * 100) : 0;
      return { totalHeight, visibleContentHeight, coveragePercent: Math.min(coverage, 100) };
    });

    // ── AUDIT: Responsive layout (check for horizontal overflow at mobile) ──
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    const responsiveAudit = await page.evaluate(() => {
      const hasOverflow = document.body.scrollWidth > window.innerWidth;
      const overflowElements = [];
      if (hasOverflow) {
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth + 5) {
            overflowElements.push(el.tagName + (el.className ? '.' + el.className.toString().split(' ')[0] : ''));
          }
        });
      }
      return { mobileWidth: 375, hasOverflow, overflowElements: [...new Set(overflowElements)].slice(0, 5) };
    });
    await page.setViewportSize({ width: 1280, height: 800 }); // restore

    // ── AUDIT: Missing alt text on images ──
    const altTextAudit = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const missing = imgs.filter(img => !img.alt || img.alt.trim() === '').map(img => img.src || '?');
      return { total: imgs.length, missingAlt: missing.slice(0, 5) };
    });

    // ── AUDIT: Empty sections (heading with no content children) ──
    const emptySectionAudit = await page.evaluate(() => {
      const empty = [];
      document.querySelectorAll('section').forEach(sec => {
        const heading = sec.querySelector('h1, h2, h3');
        if (heading) {
          const visibleChildren = Array.from(sec.querySelectorAll('div, p, a, img, ul, li')).filter(el => {
            const style = window.getComputedStyle(el);
            return parseFloat(style.opacity) > 0.3 && el.getBoundingClientRect().height > 10 && el.textContent?.trim();
          });
          if (visibleChildren.length < 3) {
            empty.push({ heading: heading.textContent?.trim().substring(0, 40) || '?', visibleCount: visibleChildren.length });
          }
        }
      });
      return { empty };
    });

    // ── AUDIT: Performance markers ──
    const perfAudit = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: perf ? Math.round(perf.domContentLoadedEventEnd) : null,
        loadComplete: perf ? Math.round(perf.loadEventEnd) : null,
        domElements: document.querySelectorAll('*').length,
      };
    });

    await browser.close();
    browser = null;

    // ── Compile all audit errors ──
    const auditErrors = [];

    // Visibility
    if (visibilityAudit.total.hidden > 3) {
      auditErrors.push({
        type: 'visibility',
        message: `${visibilityAudit.total.hidden} of ${visibilityAudit.total.sections} elements are invisible (opacity < 0.1). Elements stuck at opacity 0: ${visibilityAudit.invisible.slice(0, 5).map(e => e.selector).join(', ')}`
      });
    }

    // Broken links
    if (linkAudit.broken.length > 0) {
      auditErrors.push({
        type: 'broken_links',
        message: `${linkAudit.broken.length} broken links: ${linkAudit.broken.slice(0, 3).map(l => l.href + ' (' + l.reason + ')').join(', ')}`
      });
    }

    // Broken images
    if (imageAudit.broken.length > 0) {
      auditErrors.push({
        type: 'broken_images',
        message: `${imageAudit.broken.length} broken images: ${imageAudit.broken.slice(0, 3).map(i => i.src).join(', ')}`
      });
    }

    // Contrast failures
    if (contrastAudit.failures.length > 0) {
      warnings.push({
        type: 'contrast',
        message: `${contrastAudit.failures.length} elements fail WCAG contrast: ${contrastAudit.failures.slice(0, 3).map(f => f.element + ' ratio=' + f.ratio).join(', ')}`
      });
    }

    // Blocked interactive elements
    if (interactiveAudit.blocked.length > 0) {
      auditErrors.push({
        type: 'blocked_elements',
        message: `${interactiveAudit.blocked.length} clickable elements blocked by overlays: ${interactiveAudit.blocked.slice(0, 3).map(b => b.element + ' blocked by ' + b.blockedBy).join(', ')}`
      });
    }

    // Low content coverage
    if (contentAudit.coveragePercent < 15) {
      auditErrors.push({
        type: 'low_content',
        message: `Only ${contentAudit.coveragePercent}% of page height has visible content (${contentAudit.visibleContentHeight}px of ${contentAudit.totalHeight}px). Most sections appear empty.`
      });
    }

    // Mobile overflow
    if (responsiveAudit.hasOverflow) {
      warnings.push({
        type: 'responsive',
        message: `Horizontal overflow at 375px mobile width. Overflowing: ${responsiveAudit.overflowElements.join(', ')}`
      });
    }

    // Missing alt text
    if (altTextAudit.missingAlt.length > 0) {
      warnings.push({
        type: 'accessibility',
        message: `${altTextAudit.missingAlt.length} images missing alt text`
      });
    }

    // Empty sections
    if (emptySectionAudit.empty.length > 0) {
      for (const sec of emptySectionAudit.empty) {
        auditErrors.push({
          type: 'empty_section',
          message: `Section "${sec.heading}" has heading but only ${sec.visibleCount} visible content elements — appears empty`
        });
      }
    }

    res.json({
      success: true,
      screenshot_b64,
      errors: [...errors, ...auditErrors].slice(0, 20),
      warnings: warnings.slice(0, 15),
      page_error: pageError,
      error_count: errors.length + auditErrors.length,
      warning_count: warnings.length,
      audits: {
        visibility: visibilityAudit,
        links: linkAudit,
        images: imageAudit,
        contrast: contrastAudit,
        interactive: interactiveAudit,
        content: contentAudit,
        responsive: responsiveAudit,
        altText: altTextAudit,
        emptySections: emptySectionAudit,
        performance: perfAudit,
      },
    });
  } catch (e) {
    res.json({ success: false, error: e.message, errors: [], warnings: [] });
  } finally {
    if (browser) try { await browser.close(); } catch {}
    if (devProcess) {
      try { process.kill(-devProcess.pid, 'SIGTERM'); } catch {}
      try { execSync(`kill $(lsof -ti:${CONSOLE_CHECK_PORT}) 2>/dev/null || true`, { stdio: 'pipe', timeout: 3000 }); } catch {}
    }
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
