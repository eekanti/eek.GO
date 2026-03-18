import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import db, { ensureProject } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json({ limit: '100mb' }))

const N8N_URL = process.env.N8N_URL || 'http://n8n:5678'
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/webhook/coding-agent'
const FILE_API_URL = process.env.FILE_API_URL || 'http://file-api:3456'
const FILE_API_TOKEN = process.env.FILE_API_TOKEN || ''

// Serve built React app
app.use(express.static(path.join(__dirname, 'dist')))

// ─── SSE infrastructure ────────────────────────────────────────────────
const sseClients = new Map() // project_id → Set<Response>

function broadcast(projectId, event, data) {
  const clients = sseClients.get(projectId)
  if (!clients || clients.size === 0) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of clients) {
    client.write(payload)
  }
}

app.get('/api/chat/stream/:projectId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const pid = req.params.projectId
  if (!sseClients.has(pid)) sseClients.set(pid, new Set())
  sseClients.get(pid).add(res)

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30000)
  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.get(pid)?.delete(res)
  })
})

// ─── Status callback (called BY n8n workflow nodes) ────────────────────
app.post('/api/status-callback', (req, res) => {
  const { event, project_id, data } = req.body
  if (!project_id) return res.status(400).json({ error: 'project_id required' })

  // Ensure project exists (in case callback arrives before UI creates it)
  ensureProject(project_id, project_id)

  const statusMessages = {
    pipeline_started: '⚡ Starting pipeline...',
    planning_complete: `🗂️ Planned ${data?.task_count || 0} tasks`,
    task_written: `✍️ Wrote ${data?.task_id || 'task'}: ${(data?.files || []).join(', ')}`,
    review_complete: `✅ Review complete — quality: ${data?.quality || '?'}/100`,
    research_complete: `📚 Fetched docs for ${(data?.libraries_fetched || []).join(', ') || 'libraries'} (${data?.doc_count || 0} docs)`,
    fix_applied: `🔧 Applied ${data?.fix_count || ''} fix${(data?.fix_count || 0) !== 1 ? 'es' : ''}: ${(data?.files_fixed || []).join(', ') || 'unknown files'}`,
    plan_approval: `📋 Plan ready for review (${data?.task_count || 0} tasks, ${data?.total_files || 0} files)`,
    plan_approved: `✅ Plan ${data?.action === 'edit' ? 'approved with edits' : 'approved'} — continuing...`,
    final_review_complete: `📋 Final review: ${data?.quality || '?'}/100`,
    pipeline_complete: `🎉 Pipeline finished! ${data?.tasks_completed || 0} tasks, ${data?.files_written?.length || 0} files`,
    pipeline_error: `⚠️ Error: ${data?.error || 'unknown'}`
  }

  const content = statusMessages[event] || event

  // Save as message in chat history
  const messageType = event === 'plan_approval' ? 'plan_approval' : 'status_update'
  const role = event === 'plan_approval' ? 'assistant' : 'status'
  db.prepare('INSERT INTO messages (project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)')
    .run(project_id, role, content, messageType, JSON.stringify({ event, project_id, ...data }))

  // If pipeline complete, also save a rich assistant result message
  if (event === 'pipeline_complete' && data) {
    db.prepare('INSERT INTO messages (project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)')
      .run(project_id, 'assistant', data.summary || 'Build complete', 'pipeline_result', JSON.stringify(data))
    db.prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?').run(project_id)
  }

  if (event === 'pipeline_error' && data) {
    db.prepare('INSERT INTO messages (project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)')
      .run(project_id, 'assistant', data.error || 'Pipeline failed', 'error', JSON.stringify(data))
  }

  // Broadcast to connected SSE clients
  broadcast(project_id, event, { message: content, ...data, timestamp: new Date().toISOString() })

  res.json({ ok: true })
})

// ─── Project routes ────────────────────────────────────────────────────

// Create a new project
app.post('/api/projects', (req, res) => {
  const { id, display_name } = req.body
  if (!id || !display_name) return res.status(400).json({ error: 'id and display_name required' })

  // Sanitize id for use as folder name
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(safeId)
  if (existing) return res.status(409).json({ error: 'Project already exists' })

  db.prepare('INSERT INTO projects (id, display_name) VALUES (?, ?)').run(safeId, display_name)
  res.json({ id: safeId, display_name })
})

// List projects — only from SQLite (user-created projects)
app.get('/api/projects', (_req, res) => {
  try {
    const dbProjects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
    const projects = dbProjects.map(p => {
      const lastMsg = db.prepare('SELECT content, created_at FROM messages WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(p.id)
      return {
        id: p.id,
        display_name: p.display_name,
        created_at: p.created_at,
        updated_at: p.updated_at,
        last_message: lastMsg?.content || null,
        last_activity: lastMsg?.created_at || p.updated_at,
      }
    })
    res.json({ projects })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Delete a project (removes from SQLite only — files on disk are kept)
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Project not found' })
  db.prepare('DELETE FROM messages WHERE project_id = ?').run(id)
  db.prepare('DELETE FROM executions WHERE project_id = ?').run(id)
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  res.json({ ok: true, deleted: id })
})

// ─── Plan approval / resume ────────────────────────────────────────────

// Resume a paused pipeline execution (user approved/rejected the plan)
app.post('/api/plan-respond', async (req, res) => {
  const { execution_id, action, feedback } = req.body
  if (!execution_id || !action) return res.status(400).json({ error: 'execution_id and action required' })

  const N8N_URL = process.env.N8N_URL || 'http://n8n:5678'

  try {
    // Call the n8n Wait node's resume webhook
    // The Wait node listens at: POST /webhook-waiting/{webhookSuffix}
    const resumeUrl = `${N8N_URL}/webhook-waiting/plan-approved`
    const resumeRes = await fetch(resumeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, feedback: feedback || '', execution_id }),
    })
    if (!resumeRes.ok) {
      const text = await resumeRes.text()
      return res.status(502).json({ error: `n8n resume failed: ${resumeRes.status}`, detail: text.slice(0, 200) })
    }
    res.json({ ok: true, action })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Chat routes ───────────────────────────────────────────────────────

// Get messages for a project
app.get('/api/projects/:id/messages', (req, res) => {
  const { id } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 200)
  const before = req.query.before ? parseInt(req.query.before) : null

  let messages
  if (before) {
    messages = db.prepare('SELECT * FROM messages WHERE project_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
      .all(id, before, limit).reverse()
  } else {
    messages = db.prepare('SELECT * FROM messages WHERE project_id = ? ORDER BY id DESC LIMIT ?')
      .all(id, limit).reverse()
  }

  // Parse metadata JSON for each message
  const parsed = messages.map(m => ({
    ...m,
    metadata: m.metadata ? JSON.parse(m.metadata) : null
  }))

  res.json({ messages: parsed })
})

// Send a chat message and trigger the pipeline
app.post('/api/chat/send', async (req, res) => {
  const { project_id, content, images, reference_url } = req.body
  if (!project_id || !content) return res.status(400).json({ error: 'project_id and content required' })

  // Ensure project exists
  ensureProject(project_id, project_id)

  // Save user message
  const metadata = JSON.stringify({ images: images || [], reference_url: reference_url || null })
  const result = db.prepare('INSERT INTO messages (project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)')
    .run(project_id, 'user', content, images?.length ? 'image' : 'text', metadata)

  db.prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?').run(project_id)

  // Trigger n8n webhook (fire-and-forget — status comes via callbacks)
  // Abort after 10s — we don't need the response, all progress comes via SSE callbacks
  const webhookBody = {
    message: content,
    project_id,
    reference_url: reference_url || undefined,
    image_data: images?.[0] || undefined,
  }

  const abortCtrl = new AbortController()
  const abortTimer = setTimeout(() => abortCtrl.abort(), 10000)

  fetch(`${N8N_URL}${WEBHOOK_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookBody),
    signal: abortCtrl.signal,
  })
    .then(() => clearTimeout(abortTimer))
    .catch(e => {
      clearTimeout(abortTimer)
      // Aborted = expected (webhook takes minutes), only log real connection errors
      if (e.name === 'AbortError') return
      console.error('[webhook error]', e.message)
      db.prepare('INSERT INTO messages (project_id, role, content, message_type) VALUES (?, ?, ?, ?)')
        .run(project_id, 'status', `⚠️ Failed to reach pipeline: ${e.message}`, 'error')
      broadcast(project_id, 'pipeline_error', { error: e.message })
    })

  // Return immediately — don't wait for pipeline
  res.json({ message_id: result.lastInsertRowid })
})

// ─── File-API proxy routes ─────────────────────────────────────────────

app.get('/api/project/:id/files', async (req, res) => {
  try {
    const upstream = await fetch(`${FILE_API_URL}/projects/${req.params.id}/files`, {
      headers: { Authorization: `Bearer ${FILE_API_TOKEN}` },
    })
    res.json(await upstream.json())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Preview routes (proxy to file-api) ────────────────────────────────

app.post('/api/project/:id/preview/start', async (req, res) => {
  try {
    const upstream = await fetch(`${FILE_API_URL}/projects/${req.params.id}/preview/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${FILE_API_TOKEN}`, 'Content-Type': 'application/json' },
    })
    const data = await upstream.json()
    if (!upstream.ok) return res.status(upstream.status).json(data)
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/project/:id/preview/stop', async (req, res) => {
  try {
    const upstream = await fetch(`${FILE_API_URL}/projects/${req.params.id}/preview/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${FILE_API_TOKEN}` },
    })
    res.json(await upstream.json())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/preview/status', async (req, res) => {
  try {
    const upstream = await fetch(`${FILE_API_URL}/preview/status`, {
      headers: { Authorization: `Bearer ${FILE_API_TOKEN}` },
    })
    res.json(await upstream.json())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── SPA fallback ──────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

const PORT = process.env.PORT || 3500
app.listen(PORT, () => console.log(`eek-Forge on http://localhost:${PORT}`))
