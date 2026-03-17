import express from 'express'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json({ limit: '10mb' }))

const N8N_URL = process.env.N8N_URL || 'http://n8n:5678'
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/webhook/coding-agent'
const FILE_API_URL = process.env.FILE_API_URL || 'http://file-api:3456'
const FILE_API_TOKEN = process.env.FILE_API_TOKEN || ''
const N8N_API_KEY = process.env.N8N_API_KEY || ''
const MASTER_WORKFLOW_ID = process.env.WF_MASTER_ORCHESTRATOR || ''

// Build stage info from WF_* env vars — no hardcoded workflow IDs
const STAGE_INFO = {}
if (process.env.WF_PROJECT_MEMORY) STAGE_INFO[process.env.WF_PROJECT_MEMORY] = { icon: '🧠', label: 'Project Memory' }
if (process.env.WF_PLANNER) STAGE_INFO[process.env.WF_PLANNER] = { icon: '🗂️', label: 'Planning Tasks' }
if (process.env.WF_TASK_PROCESSOR) STAGE_INFO[process.env.WF_TASK_PROCESSOR] = { icon: '⚙️', label: 'Task Processor' }
if (process.env.WF_CODE_WRITER) STAGE_INFO[process.env.WF_CODE_WRITER] = { icon: '✍️', label: 'Code Writer' }
if (process.env.WF_COMBINED_REVIEWER) STAGE_INFO[process.env.WF_COMBINED_REVIEWER] = { icon: '✅', label: 'Combined Review' }
if (process.env.WF_CHUNK_PROCESSOR) STAGE_INFO[process.env.WF_CHUNK_PROCESSOR] = { icon: '📦', label: 'Chunk Processor' }
if (process.env.WF_RESEARCH_AGENT) STAGE_INFO[process.env.WF_RESEARCH_AGENT] = { icon: '📚', label: 'Research Agent' }

// Serve built React app
app.use(express.static(path.join(__dirname, 'dist')))

// Run a workflow job — triggers n8n immediately then polls for result
app.post('/api/run', async (req, res) => {
  console.log('[run]', new Date().toISOString(), JSON.stringify(req.body))
  const startedAfter = new Date().toISOString()

  // Step 1: Trigger webhook (n8n responds immediately, workflow runs async)
  try {
    const trigger = await fetch(`${N8N_URL}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    if (!trigger.ok) {
      const text = await trigger.text()
      return res.status(502).json({ error: `n8n webhook returned ${trigger.status}`, raw: text.slice(0, 200) })
    }
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Cannot connect to n8n — is it running?' })
    }
    return res.status(500).json({ error: e.message })
  }

  if (!N8N_API_KEY) {
    return res.json({ status: 'started', message: 'Workflow triggered. No API key set — cannot poll for results.' })
  }

  // Step 2: Poll execution API until done
  const POLL_MS = 8000
  const TIMEOUT_MS = 50 * 60 * 1000
  const pollStart = Date.now()
  let executionId = null

  while (Date.now() - pollStart < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_MS))
    try {
      const listRes = await fetch(
        `${N8N_URL}/api/v1/executions?workflowId=${MASTER_WORKFLOW_ID}&limit=5`,
        { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }
      )
      if (!listRes.ok) continue
      const list = await listRes.json()
      const exec = (list.data || []).find(e => e.startedAt >= startedAfter)
      if (!exec) continue
      executionId = exec.id
      if (exec.status === 'running' || exec.status === 'new' || exec.status === 'waiting') continue
      if (exec.status === 'error') {
        return res.status(500).json({ error: 'Workflow execution failed', executionId: exec.id })
      }
      if (exec.status === 'success') {
        // Fetch full data to extract Build Response node output
        const dataRes = await fetch(
          `${N8N_URL}/api/v1/executions/${exec.id}?includeData=true`,
          { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }
        )
        if (!dataRes.ok) return res.json({ status: 'completed', executionId: exec.id })
        const execData = await dataRes.json()
        const runData = execData.data?.resultData?.runData || {}
        const result = runData['Build Response']?.[0]?.data?.main?.[0]?.[0]?.json
        return res.json(result || { status: 'completed', executionId: exec.id })
      }
    } catch (e) {
      console.error('[poll error]', e.message)
    }
  }

  res.status(504).json({ error: 'Workflow timed out after 50 minutes.', executionId })
})

// Real-time execution progress from n8n
app.get('/api/progress', async (req, res) => {
  const { since } = req.query
  if (!since) return res.status(400).json({ error: 'since required' })
  if (!N8N_API_KEY) return res.json({ executions: [] })
  try {
    const upstream = await fetch(`${N8N_URL}/api/v1/executions?limit=50`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    })
    if (!upstream.ok) return res.json({ executions: [] })
    const data = await upstream.json()
    const executions = (data.data || [])
      .filter(e => e.startedAt >= since && STAGE_INFO[e.workflowId])
      .map(e => ({
        id: e.id,
        icon: STAGE_INFO[e.workflowId].icon,
        label: STAGE_INFO[e.workflowId].label,
        status: e.status,
        startedAt: e.startedAt,
        stoppedAt: e.stoppedAt || null,
        durationSec: e.stoppedAt
          ? Math.round((new Date(e.stoppedAt) - new Date(e.startedAt)) / 1000)
          : null,
      }))
    res.json({ executions })
  } catch {
    res.json({ executions: [] })
  }
})

// List projects on disk
app.get('/api/projects', async (req, res) => {
  try {
    const upstream = await fetch(`${FILE_API_URL}/projects`, {
      headers: { Authorization: `Bearer ${FILE_API_TOKEN}` },
    })
    res.json(await upstream.json())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// List files in a project
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

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Forge dashboard on http://localhost:${PORT}`))
