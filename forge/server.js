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
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://10.0.0.100:1234/v1/chat/completions'
const LM_STUDIO_HOST = process.env.LM_STUDIO_HOST || 'http://10.0.0.100:1234'
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const AGENT_MODEL = process.env.AGENT_MODEL || 'qwen/qwen3.5-9b'

// Track active conversations (project_id → conversation state)
const activeConversations = new Map()

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

  // Skip pipeline_started from n8n — Forge already sends this before triggering the webhook
  if (event === 'pipeline_started') return res.json({ ok: true, skipped: 'duplicate' })

  const statusMessages = {
    pipeline_started: '⚡ Starting pipeline...',
    planning_complete: `🗂️ Planned ${data?.task_count || 0} tasks`,
    task_written: `✍️ Wrote ${data?.task_id || 'task'}: ${(data?.files || []).join(', ')}`,
    review_complete: `✅ Review complete — quality: ${data?.quality || '?'}/100`,
    research_complete: `📚 Fetched docs for ${(data?.libraries_fetched || []).join(', ') || 'libraries'} (${data?.doc_count || 0} docs)`,
    build_check_passed: `✅ Build check passed`,
    playtest_complete: `🎮 Playtest complete — ${data?.screenshots || 0} screenshots, ${data?.observations || 0} observations`,
    build_check_failed: `❌ Build failed: ${data?.error || 'unknown'} (${data?.stage || 'build'})`,
    visual_review_complete: `👁️ Visual review: ${data?.visual_quality || '?'}/100 — ${data?.summary || 'done'}`,
    fix_applied: `🔧 Applied ${data?.fix_count || ''} fix${(data?.fix_count || 0) !== 1 ? 'es' : ''}: ${(data?.files_fixed || []).join(', ') || 'unknown files'}`,
    plan_approval: `📋 Plan ready for review (${data?.task_count || 0} tasks, ${data?.total_files || 0} files)`,
    plan_approved: `✅ Plan ${data?.action === 'edit' ? 'approved with edits' : 'approved'} — continuing...`,
    final_review_complete: `📋 Final review: ${data?.quality || '?'}/100`,
    pipeline_report: data?.report || '📊 Pipeline report generated',
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

// ─── Pipeline status check (queries n8n for actual execution state) ────
app.get('/api/pipeline-status/:projectId', async (req, res) => {
  const { projectId } = req.params
  try {
    // Check if there's a running execution in n8n
    const n8nRes = await fetch(
      `${N8N_URL}/api/v1/executions?workflowId=PNOMGkCjzFGxf52E&status=running&limit=5`,
      { headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY || '' }, signal: AbortSignal.timeout(5000) }
    )
    if (!n8nRes.ok) return res.json({ running: false, source: 'n8n_error' })
    const data = await n8nRes.json()
    const running = (data.data || []).length > 0
    res.json({ running, executions: (data.data || []).length })
  } catch {
    res.json({ running: false, source: 'error' })
  }
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

// ─── Pre-planning conversation with LM Studio ─────────────────────────

const CLARIFY_SYSTEM_PROMPT = `You are a triage assistant for an AI coding pipeline. You decide whether to send the user's request to the build pipeline or ask ONE round of clarifying questions first.

RULE 1 — BE DECISIVE. When in doubt, respond with "READY_TO_BUILD". The pipeline's planner is smarter than you and can handle ambiguity.

RULE 2 — NEVER ask more than 3 questions. NEVER ask a second round. If the user already answered questions, respond with "READY_TO_BUILD".

RULE 3 — Bug reports, error messages, and fix requests ALWAYS get "READY_TO_BUILD". The user is telling you what's wrong — pass it through. Do NOT ask them to describe the error they already described.

RULE 4 — If the user provided reference images, URLs, or specific file names, respond with "READY_TO_BUILD".

RULE 5 — Only ask questions for BRAND NEW projects where the tech stack is genuinely ambiguous (e.g., "build me a website" with zero other context).

RESPONSE FORMAT:
- Almost always: respond with EXACTLY "READY_TO_BUILD" (nothing else)
- Rare exception: 1-3 SHORT questions as a numbered list, ONLY for new projects with genuinely missing critical info`

async function callLMStudio(messages, maxTokens = 2048) {
  const res = await fetch(LM_STUDIO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages,
      temperature: 0.6,
      top_p: 0.85,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`LM Studio ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const msg = data.choices?.[0]?.message || {}
  let content = msg.content || msg.reasoning_content || ''
  // Strip thinking blocks
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (content.includes('</think>')) content = content.split('</think>').pop().trim()
  return content
}

async function ensureAgentLoaded() {
  try {
    const res = await fetch(`${LM_STUDIO_HOST}/api/v1/models`)
    const data = await res.json()
    const loaded = (data.models || []).some(m => m.key === AGENT_MODEL && m.loaded_instances?.length > 0)
    if (!loaded) {
      await fetch(`${LM_STUDIO_HOST}/api/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_API_KEY}` },
        body: JSON.stringify({ model: AGENT_MODEL, context_length: 131072 }),
      })
    }
  } catch (e) {
    console.error('[planner load error]', e.message)
  }
}

// Send a chat message — routes through pre-planning conversation or triggers pipeline
app.post('/api/chat/send', async (req, res) => {
  const { project_id, content, images, reference_url } = req.body
  if (!project_id || !content) return res.status(400).json({ error: 'project_id and content required' })

  ensureProject(project_id, project_id)

  // Save user message
  const metadata = JSON.stringify({ images: images || [], reference_url: reference_url || null })
  const msgResult = db.prepare('INSERT INTO messages (project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)')
    .run(project_id, 'user', content, images?.length ? 'image' : 'text', metadata)
  db.prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?').run(project_id)

  // Return immediately — process async
  res.json({ message_id: msgResult.lastInsertRowid })

  // Check if we're in an active conversation or starting fresh
  const conv = activeConversations.get(project_id)

  if (conv) {
    // User answered questions — always send to pipeline now (max 1 round of Q&A)
    conv.history.push({ role: 'user', content })

    // Build enriched prompt from conversation
    const enrichedPrompt = conv.originalPrompt + '\n\nAdditional context from conversation:\n' +
      conv.history.filter(m => m.role === 'user' && m.content !== conv.originalPrompt)
        .map(m => '- ' + m.content).join('\n')

    activeConversations.delete(project_id)
    db.prepare('INSERT INTO messages (project_id, role, content, message_type) VALUES (?, ?, ?, ?)')
      .run(project_id, 'status', '🚀 Starting build pipeline...', 'status_update')
    broadcast(project_id, 'pipeline_started', { message: '🚀 Starting build pipeline...' })
    triggerPipeline(project_id, enrichedPrompt, conv.images, conv.reference_url)
    return
  }


  // New prompt — start pre-planning conversation
  try {
    await ensureAgentLoaded()

    // Build history with full project context so the agent understands the ongoing project
    const priorMessages = db.prepare(
      'SELECT role, content, message_type, metadata FROM messages WHERE project_id = ? ORDER BY id ASC LIMIT 200'
    ).all(project_id)

    // Summarize project history into the system prompt
    let projectContext = ''
    if (priorMessages.length > 0) {
      const chatHistory = priorMessages
        .filter(m => m.role === 'user' || m.role === 'assistant' || (m.role === 'status' && m.message_type === 'pipeline_result'))
        .map(m => {
          if (m.role === 'user') {
            const meta = m.metadata ? JSON.parse(m.metadata) : {}
            const extras = []
            if (meta.images?.length) extras.push('[attached images]')
            if (meta.reference_url) extras.push(`[ref: ${meta.reference_url}]`)
            return `USER: ${m.content}${extras.length ? ' ' + extras.join(' ') : ''}`
          }
          if (m.message_type === 'pipeline_result') {
            const meta = m.metadata ? JSON.parse(m.metadata) : {}
            return `PIPELINE RESULT: ${meta.tasks_completed || 0} tasks, ${meta.files_written?.length || 0} files written. ${m.content}`
          }
          return `ASSISTANT: ${m.content}`
        })
      projectContext = `\n\nPROJECT HISTORY (this is an ongoing project — the user has already been working on this):\n${chatHistory.join('\n')}`
    }

    const history = [
      { role: 'system', content: CLARIFY_SYSTEM_PROMPT + projectContext },
      { role: 'user', content: content + (images?.length ? '\n\n[User attached reference images]' : '') + (reference_url ? `\n\n[Reference URL: ${reference_url}]` : '') }
    ]

    const reply = await callLMStudio(history)

    if (reply.trim() === 'READY_TO_BUILD' || reply.includes('READY_TO_BUILD')) {
      // No questions needed — fire pipeline immediately
      db.prepare('INSERT INTO messages (project_id, role, content, message_type) VALUES (?, ?, ?, ?)')
        .run(project_id, 'status', '⚡ Starting pipeline...', 'status_update')
      broadcast(project_id, 'pipeline_started', { message: '⚡ Starting pipeline...' })
      triggerPipeline(project_id, content, images, reference_url)
    } else {
      // Agent has questions — start conversation
      history.push({ role: 'assistant', content: reply })
      activeConversations.set(project_id, {
        history,
        originalPrompt: content,
        images: images || [],
        reference_url: reference_url || null,
      })

      db.prepare('INSERT INTO messages (project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)')
        .run(project_id, 'assistant', reply, 'question', JSON.stringify({ phase: 'pre_planning' }))
      broadcast(project_id, 'agent_question', { message: reply, timestamp: new Date().toISOString() })
    }
  } catch (e) {
    console.error('[pre-planning error]', e.message)
    // Fallback: skip conversation, fire pipeline directly
    db.prepare('INSERT INTO messages (project_id, role, content, message_type) VALUES (?, ?, ?, ?)')
      .run(project_id, 'status', '⚡ Starting pipeline...', 'status_update')
    broadcast(project_id, 'pipeline_started', { message: '⚡ Starting pipeline...' })
    triggerPipeline(project_id, content, images, reference_url)
  }
})

// ─── Stitch: generate concept UI ───────────────────────────────────────

const STITCH_API_KEY = process.env.STITCH_API_KEY || ''
const STITCH_URL = 'https://stitch.googleapis.com/mcp'

async function generateConceptUI(prompt, project_id) {
  if (!STITCH_API_KEY) return null

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Goog-Api-Key': STITCH_API_KEY,
    }

    // Create project
    const createRes = await fetch(STITCH_URL, {
      method: 'POST', headers,
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'tools/call', id: Date.now(),
        params: { name: 'create_project', arguments: { title: project_id } }
      }),
      signal: AbortSignal.timeout(15000),
    })
    const createData = await createRes.json()
    const projectText = createData.result?.content?.[0]?.text || ''
    const projectInfo = JSON.parse(projectText)
    const stitchProjectId = projectInfo.name?.replace('projects/', '')
    if (!stitchProjectId) return null

    // Generate screen
    const genRes = await fetch(STITCH_URL, {
      method: 'POST', headers,
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'tools/call', id: Date.now(),
        params: {
          name: 'generate_screen_from_text',
          arguments: {
            projectId: stitchProjectId,
            prompt: prompt.substring(0, 1000),
            deviceType: 'MOBILE',
            modelId: 'GEMINI_3_FLASH',
          }
        }
      }),
      signal: AbortSignal.timeout(60000),
    })
    const genData = await genRes.json()
    const genText = genData.result?.content?.[0]?.text || ''
    const genInfo = JSON.parse(genText)

    // Extract screenshot URL
    const screens = genInfo.outputComponents?.[0]?.design?.screens || []
    const screenshotUrl = screens[0]?.screenshot?.downloadUrl
    if (!screenshotUrl) return null

    // Download screenshot as base64
    const imgRes = await fetch(screenshotUrl + '=s1024', { signal: AbortSignal.timeout(15000) })
    const imgBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(imgBuffer).toString('base64')

    return base64
  } catch (e) {
    console.error('[stitch error]', e.message)
    return null
  }
}

// Helper: save a reference image to the project's references/ folder via file-api
async function saveReferenceImage(project_id, base64Data, filename) {
  try {
    const res = await fetch(`${FILE_API_URL}/projects/${project_id}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${FILE_API_TOKEN}` },
      body: JSON.stringify({ path: `references/${filename}`, content: base64Data, encoding: 'base64' }),
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) console.log(`[ref] Saved references/${filename} for ${project_id}`)
    else console.error(`[ref] Failed to save ${filename}: ${res.status}`)
  } catch (e) {
    console.error(`[ref] Error saving ${filename}:`, e.message)
  }
}

// Generate a descriptive filename from a user message
function slugifyForFilename(message, prefix = 'reference') {
  const words = message.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 5)
  const slug = words.join('_').toLowerCase().substring(0, 40)
  return slug ? `${slug}.png` : `${prefix}_${Date.now()}.png`
}

// Helper: fire the n8n pipeline (with optional Stitch concept generation)
async function triggerPipeline(project_id, message, images, reference_url) {
  // Generate concept UI with Stitch only for brand-new projects with no prior images
  const hasExistingImage = db.prepare(
    "SELECT 1 FROM messages WHERE project_id = ? AND (message_type = 'image' OR content LIKE '%concept UI generated%') LIMIT 1"
  ).get(project_id)
  // Also check if project has reference images on disk
  let hasReferenceFiles = false
  try {
    const refRes = await fetch(`${FILE_API_URL}/projects/${project_id}/references`, {
      headers: { 'Authorization': `Bearer ${FILE_API_TOKEN}` },
      signal: AbortSignal.timeout(5000)
    })
    if (refRes.ok) {
      const refData = await refRes.json()
      hasReferenceFiles = (refData.references || []).length > 0
    }
  } catch {}
  if (!images?.length && !reference_url && !hasExistingImage && !hasReferenceFiles && STITCH_API_KEY) {
    broadcast(project_id, 'stitch_generating', { message: '🎨 Generating concept UI with Stitch...' })
    db.prepare('INSERT INTO messages (project_id, role, content, message_type) VALUES (?, ?, ?, ?)')
      .run(project_id, 'status', '🎨 Generating concept UI with Stitch...', 'status_update')

    const conceptImage = await generateConceptUI(message, project_id)
    if (conceptImage) {
      images = [conceptImage]
      await saveReferenceImage(project_id, conceptImage, 'stitch_concept.png')
      broadcast(project_id, 'stitch_complete', { message: '🎨 Concept UI generated — saved as references/stitch_concept.png' })
      db.prepare('INSERT INTO messages (project_id, role, content, message_type) VALUES (?, ?, ?, ?)')
        .run(project_id, 'status', '🎨 Concept UI generated — saved as references/stitch_concept.png', 'status_update')
    }
  } else if (images?.length) {
    // Save user-uploaded images to project references/ folder
    for (let i = 0; i < images.length; i++) {
      const filename = images.length === 1
        ? slugifyForFilename(message)
        : slugifyForFilename(message).replace('.png', `_${i + 1}.png`)
      await saveReferenceImage(project_id, images[i], filename)
    }
  }

  const webhookBody = {
    message,
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
      if (e.name === 'AbortError') return
      console.error('[webhook error]', e.message)
      db.prepare('INSERT INTO messages (project_id, role, content, message_type) VALUES (?, ?, ?, ?)')
        .run(project_id, 'status', `⚠️ Failed to reach pipeline: ${e.message}`, 'error')
      broadcast(project_id, 'pipeline_error', { error: e.message })
    })
}

// ─── Execution stats ───────────────────────────────────────────────────

const N8N_API_KEY = process.env.N8N_API_KEY || ''

app.get('/api/projects/:id/stats', async (req, res) => {
  const { id } = req.params

  // Get last pipeline_result message for this project
  const resultMsg = db.prepare(
    "SELECT metadata FROM messages WHERE project_id = ? AND message_type = 'pipeline_result' ORDER BY id DESC LIMIT 1"
  ).get(id)

  // Get message counts
  const msgCounts = db.prepare(
    "SELECT message_type, COUNT(*) as count FROM messages WHERE project_id = ? GROUP BY message_type"
  ).all(id)

  // Get last execution ID from n8n if available
  let executionStats = null
  if (N8N_API_KEY) {
    try {
      const N8N = process.env.N8N_URL || 'http://n8n:5678'
      const listRes = await fetch(`${N8N}/api/v1/executions?workflowId=PNOMGkCjzFGxf52E&limit=5`, {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }
      })
      if (listRes.ok) {
        const list = await listRes.json()
        const exec = (list.data || []).find(e => e.status === 'success')
        if (exec) {
          const dataRes = await fetch(`${N8N}/api/v1/executions/${exec.id}?includeData=true`, {
            headers: { 'X-N8N-API-KEY': N8N_API_KEY }
          })
          if (dataRes.ok) {
            const execData = await dataRes.json()
            const rd = execData.data?.resultData?.runData || {}

            // Extract model usage per phase
            const phases = []
            const phaseMap = [
              ['Planner: Call LM Studio', 'Planner', '🗂️'],
              ['CW: Call LM Studio', 'Coder', '✍️'],
              ['P3: Review LLM', 'Reviewer', '✅'],
              ['P4: Fix LLM', 'Fixer', '🔧'],
              ['Final: Review LLM', 'Final Review', '📋'],
            ]
            for (const [node, label, icon] of phaseMap) {
              const runs = rd[node] || []
              if (runs.length > 0) {
                let peakPrompt = 0, peakCompletion = 0, peakTotal = 0, callCount = runs.length
                for (const run of runs) {
                  const out = run.data?.main?.[0]?.[0]
                  if (out) {
                    const u = out.json?.usage || {}
                    const p = u.prompt_tokens || 0
                    const c = u.completion_tokens || 0
                    if (p + c > peakTotal) { peakPrompt = p; peakCompletion = c; peakTotal = p + c }
                  }
                }
                phases.push({ label, icon, calls: callCount, promptTokens: peakPrompt, completionTokens: peakCompletion, totalTokens: peakTotal })
              }
            }

            // Research docs size
            const bi = rd['P2: Build Code Input'] || []
            const lastBi = bi[bi.length - 1]
            const researchChars = lastBi?.data?.main?.[0]?.[0]?.json?.research_docs?.length || 0
            const existingFiles = lastBi?.data?.main?.[0]?.[0]?.json?.existing_files?.length || 0

            executionStats = {
              executionId: exec.id,
              status: exec.status,
              startedAt: exec.startedAt,
              stoppedAt: exec.stoppedAt,
              durationSec: exec.stoppedAt ? Math.round((new Date(exec.stoppedAt) - new Date(exec.startedAt)) / 1000) : null,
              phases,
              researchChars,
              existingFiles,
            }
          }
        }
      }
    } catch {}
  }

  const result = resultMsg?.metadata ? JSON.parse(resultMsg.metadata) : null

  res.json({
    project_id: id,
    lastResult: result,
    messageCounts: Object.fromEntries(msgCounts.map(m => [m.message_type, m.count])),
    execution: executionStats,
  })
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
