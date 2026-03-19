import { useState, useEffect } from 'react'
import { Card, CardBody, Chip, Divider, Progress, Tooltip } from '@heroui/react'

function TokenBar({ label, icon, calls, promptTokens, completionTokens, totalTokens, maxContext = 65536 }) {
  const pct = Math.min(100, (promptTokens / maxContext) * 100)
  const color = pct > 50 ? 'warning' : pct > 25 ? 'primary' : 'success'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{icon}</span>
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          {calls > 1 && <Chip size="sm" variant="flat" className="h-4 text-[9px]">×{calls}</Chip>}
        </div>
        <span className="text-[10px] font-mono text-default-400">{(totalTokens / 1000).toFixed(1)}K</span>
      </div>
      <Progress size="sm" value={pct} color={color} className="h-1.5" />
      <div className="flex justify-between text-[9px] text-default-400">
        <span>{(promptTokens / 1000).toFixed(1)}K in</span>
        <span>{(completionTokens / 1000).toFixed(1)}K out</span>
      </div>
    </div>
  )
}

function StatItem({ label, value, sub }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-foreground tabular-nums">{value}</div>
      <div className="text-[10px] text-default-400 uppercase tracking-wider">{label}</div>
      {sub && <div className="text-[9px] text-default-500">{sub}</div>}
    </div>
  )
}

export default function StatsPanel({ projectId, isOpen, onClose }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !isOpen) return
    setLoading(true)
    fetch(`/api/projects/${projectId}/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId, isOpen])

  if (!isOpen) return null

  const exec = stats?.execution
  const result = stats?.lastResult
  const phases = exec?.phases || []
  const totalTokens = phases.reduce((s, p) => s + p.totalTokens, 0)

  return (
    <aside className="w-72 flex flex-col border-l border-default-200 dark:border-zinc-800 bg-default-50 dark:bg-zinc-950 shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-default-200 dark:border-zinc-800">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Pipeline Stats</span>
        <button onClick={onClose} className="text-default-400 hover:text-foreground transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !exec && (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-default-400 text-center">No execution data yet. Run the pipeline to see stats.</p>
        </div>
      )}

      {!loading && exec && (
        <div className="p-4 space-y-4">
          {/* Overview */}
          <Card shadow="none" className="bg-default-100 dark:bg-zinc-900">
            <CardBody className="py-3">
              <div className="flex justify-around">
                <StatItem label="Quality" value={result?.final_quality || result?.quality || '—'} />
                <StatItem label="Tasks" value={result?.tasks_completed || '—'} />
                <StatItem label="Files" value={result?.files_written?.length || '—'} />
              </div>
            </CardBody>
          </Card>

          {/* Duration */}
          {exec.durationSec && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-default-400">Duration</span>
              <Chip size="sm" variant="flat">
                {exec.durationSec < 60 ? `${exec.durationSec}s` : `${Math.floor(exec.durationSec / 60)}m ${exec.durationSec % 60}s`}
              </Chip>
            </div>
          )}

          <Divider />

          {/* Token Usage by Phase */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Token Usage</span>
              <span className="text-[10px] font-mono text-default-400">{(totalTokens / 1000).toFixed(1)}K total</span>
            </div>
            {phases.map((phase, i) => (
              <TokenBar key={i} {...phase} />
            ))}
          </div>

          <Divider />

          {/* Research */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Research Context</span>
            <div className="grid grid-cols-2 gap-2">
              <Card shadow="none" className="bg-default-100 dark:bg-zinc-900">
                <CardBody className="py-2 px-3">
                  <div className="text-sm font-bold text-foreground tabular-nums">{exec.researchChars ? (exec.researchChars / 1000).toFixed(1) + 'K' : '0'}</div>
                  <div className="text-[9px] text-default-400">Doc chars</div>
                </CardBody>
              </Card>
              <Card shadow="none" className="bg-default-100 dark:bg-zinc-900">
                <CardBody className="py-2 px-3">
                  <div className="text-sm font-bold text-foreground tabular-nums">{exec.existingFiles || 0}</div>
                  <div className="text-[9px] text-default-400">Project files</div>
                </CardBody>
              </Card>
            </div>
          </div>

          <Divider />

          {/* Execution Info */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Execution</span>
            <div className="text-[10px] font-mono text-default-400 space-y-0.5">
              <div>ID: {exec.executionId}</div>
              <div>Status: <span className={exec.status === 'success' ? 'text-success' : 'text-danger'}>{exec.status}</span></div>
              {exec.startedAt && <div>Started: {new Date(exec.startedAt).toLocaleTimeString()}</div>}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
