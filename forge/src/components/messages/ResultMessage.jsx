import { useState } from 'react'
import { Card, CardBody, CardHeader, Chip, Divider, Button } from '@heroui/react'

function FileTree({ files }) {
  if (!files?.length) return null
  const tree = {}
  for (const f of files) {
    const name = typeof f === 'string' ? f : f.path || String(f)
    const parts = name.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    if (!tree[dir]) tree[dir] = []
    tree[dir].push(parts[parts.length - 1])
  }
  return (
    <div className="font-mono text-xs space-y-0.5">
      {Object.entries(tree).sort().map(([dir, dirFiles]) => (
        <div key={dir}>
          {dir && <div className="text-default-400 py-0.5">{dir}/</div>}
          {dirFiles.sort().map(f => (
            <div key={f} className="text-default-600 pl-4 py-0.5 flex items-center gap-2">
              <span className="text-default-300">└</span><span>{f}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function SuggestionList({ suggestions, onUseSuggestion }) {
  const [expandedIdx, setExpandedIdx] = useState(null)

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold text-default-500 uppercase tracking-wider">Suggested next steps</p>
      <div className="space-y-2">
        {suggestions.map((s, i) => {
          // Support both { preview, detail } objects and plain strings
          const isStructured = typeof s === 'object' && s.preview
          const preview = isStructured ? s.preview : (s.length > 120 ? s.substring(0, 120) + '...' : s)
          const detail = isStructured ? s.detail : s
          const isExpanded = expandedIdx === i

          return (
            <div key={i} className="bg-primary-50 dark:bg-zinc-800 rounded-xl overflow-hidden border border-primary-100 dark:border-zinc-700 transition-all">
              {/* Preview row — always visible */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-primary-100 dark:hover:bg-zinc-700 transition-colors"
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-primary dark:text-blue-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <span className="text-sm font-medium text-primary-700 dark:text-blue-300 flex-1">{preview}</span>
              </div>

              {/* Expanded detail — shown on click */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="bg-white/60 dark:bg-zinc-900/60 rounded-lg px-3 py-2.5 border border-primary-100 dark:border-zinc-600">
                    <p className="text-xs text-default-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{detail}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onUseSuggestion?.(detail) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-600 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                    Use as next prompt
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PreviewPanel({ projectId }) {
  const [status, setStatus] = useState('idle') // idle, loading, running, error
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)

  const startPreview = async () => {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch(`/api/project/${projectId}/preview/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start')
      setPreviewUrl(data.url)
      setStatus('running')
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  const stopPreview = async () => {
    await fetch(`/api/project/${projectId}/preview/stop`, { method: 'POST' })
    setPreviewUrl(null)
    setStatus('idle')
  }

  if (status === 'idle') {
    return (
      <Button size="sm" color="primary" variant="flat" onPress={startPreview}
        startContent={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
      >
        Build & Preview
      </Button>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-primary">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Installing deps & starting dev server...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-danger">{error}</p>
        <Button size="sm" variant="flat" onPress={startPreview}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-success-600 font-medium">Preview running</span>
          <a href={previewUrl} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">{previewUrl}</a>
        </div>
        <Button size="sm" variant="light" color="danger" onPress={stopPreview}>Stop</Button>
      </div>
      <div className="rounded-lg overflow-hidden border border-default-200 shadow-sm" style={{ height: '400px' }}>
        <iframe src={previewUrl} className="w-full h-full border-0" title="Project Preview" />
      </div>
    </div>
  )
}

function StatusRow({ icon, label, value, color = 'default' }) {
  const colors = {
    success: 'text-success-600 dark:text-emerald-400',
    danger: 'text-danger-600 dark:text-red-400',
    warning: 'text-warning-600 dark:text-amber-400',
    default: 'text-default-600 dark:text-zinc-400'
  }
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-xs text-default-500">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <span className={`text-xs font-medium ${colors[color]}`}>{value}</span>
    </div>
  )
}

function ReportCard({ data }) {
  const quality = data.code_quality || data.quality || 0
  const buildOk = data.build_passed
  const consoleErrors = data.console?.errors || 0
  const pageCrash = data.console?.page_error
  const audits = data.audits || {}
  const postFix = data.post_fix

  const hasAuditIssues = audits.invisible > 0 || audits.broken_links > 0 || audits.broken_images > 0 || audits.contrast_issues > 0

  return (
    <div className="space-y-1 bg-default-100/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
      <p className="text-[10px] font-semibold text-default-400 uppercase tracking-wider pb-1">Pipeline Report</p>
      <StatusRow icon="🔨" label="Build" value={buildOk ? 'Passed' : 'Failed'} color={buildOk ? 'success' : 'danger'} />
      <StatusRow icon="🖥️" label="Console" value={pageCrash ? 'Page Crash' : consoleErrors === 0 ? 'Clean' : `${consoleErrors} errors`} color={pageCrash || consoleErrors > 0 ? 'danger' : 'success'} />
      {quality > 0 && (
        <StatusRow icon="⭐" label="Quality" value={`${quality}/100`} color={quality >= 70 ? 'success' : quality >= 40 ? 'warning' : 'danger'} />
      )}
      {hasAuditIssues && (
        <StatusRow icon="🔍" label="Audits"
          value={[
            audits.invisible > 0 && `${audits.invisible} invisible`,
            audits.broken_links > 0 && `${audits.broken_links} broken links`,
            audits.broken_images > 0 && `${audits.broken_images} broken images`,
            audits.contrast_issues > 0 && `${audits.contrast_issues} contrast`
          ].filter(Boolean).join(', ')}
          color="warning"
        />
      )}
      {audits.content_coverage != null && (
        <StatusRow icon="📄" label="Content" value={`${audits.content_coverage}% coverage`} color={audits.content_coverage >= 80 ? 'success' : 'warning'} />
      )}
      {postFix && (
        <StatusRow icon="🩺" label="Post-fix check"
          value={postFix.ts_passed && postFix.build_passed ? 'Passed' : [!postFix.ts_passed && 'TS errors', !postFix.build_passed && 'build failed'].filter(Boolean).join(', ')}
          color={postFix.ts_passed && postFix.build_passed ? 'success' : 'danger'}
        />
      )}
    </div>
  )
}

export default function ResultMessage({ message, onUseSuggestion }) {
  const [showFiles, setShowFiles] = useState(false)
  const data = message.metadata || {}
  const quality = data.code_quality || data.final_quality || data.quality || 0
  const hasFailed = data.build_passed === false || data.post_fix?.build_passed === false
  const borderClass = hasFailed
    ? 'border-danger-200 dark:border-red-800/50 bg-danger-50/30 dark:bg-red-950/20'
    : 'border-success-200 dark:border-emerald-800/50 bg-success-50/50 dark:bg-emerald-950/30'
  const headerColor = hasFailed
    ? 'text-danger-700 dark:text-red-400'
    : 'text-success-700 dark:text-emerald-400'
  const dotColor = hasFailed ? 'bg-danger' : 'bg-success animate-pulse'

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full">
        <Card shadow="sm" className={`border ${borderClass}`}>
          <CardHeader className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span className={`text-xs font-semibold uppercase tracking-wider ${headerColor}`}>
                {hasFailed ? 'Build Failed' : 'Build Complete'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {data.tasks_completed != null && (
                <Chip size="sm" variant="flat">{data.tasks_completed} tasks</Chip>
              )}
              {data.files_written?.length > 0 && (
                <Chip size="sm" variant="flat">{data.files_written.length} files</Chip>
              )}
              {quality > 0 && (
                <Chip size="sm" variant="flat" color={quality >= 70 ? 'success' : quality >= 40 ? 'warning' : 'danger'}>
                  {quality}/100
                </Chip>
              )}
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="pt-3 space-y-3">
            {/* Report Card */}
            <ReportCard data={data} />

            {data.files_written?.length > 0 && (
              <div>
                <Button size="sm" variant="light" onPress={() => setShowFiles(v => !v)} className="text-default-500 px-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform mr-1 ${showFiles ? 'rotate-90' : ''}`}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                  {showFiles ? 'Hide' : 'Show'} files
                </Button>
                {showFiles && <FileTree files={data.files_written} />}
              </div>
            )}
            {/* Preview */}
            {data.project_id && <PreviewPanel projectId={data.project_id} />}

            {/* Suggestions for next prompt */}
            {data.suggestions?.length > 0 && (
              <SuggestionList suggestions={data.suggestions} onUseSuggestion={onUseSuggestion} />
            )}
            <p className="text-[10px] text-default-400">
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
