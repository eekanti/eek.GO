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
            <div key={i} className="bg-primary-50 rounded-xl overflow-hidden border border-primary-100 transition-all">
              {/* Preview row — always visible */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-primary-100 transition-colors"
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-primary shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <span className="text-sm font-medium text-primary-700 flex-1">{preview}</span>
              </div>

              {/* Expanded detail — shown on click */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="bg-white/60 rounded-lg px-3 py-2.5 border border-primary-100">
                    <p className="text-xs text-default-600 leading-relaxed whitespace-pre-wrap">{detail}</p>
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

export default function ResultMessage({ message, onUseSuggestion }) {
  const [showFiles, setShowFiles] = useState(false)
  const data = message.metadata || {}

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full">
        <Card shadow="sm" className="border border-success-200 bg-success-50/50">
          <CardHeader className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-semibold text-success-700 uppercase tracking-wider">Build Complete</span>
            </div>
            <div className="flex items-center gap-2">
              {data.tasks_completed != null && (
                <Chip size="sm" variant="flat">{data.tasks_completed} tasks</Chip>
              )}
              {data.files_written?.length > 0 && (
                <Chip size="sm" variant="flat">{data.files_written.length} files</Chip>
              )}
              {(data.final_quality || data.quality) != null && (
                <Chip size="sm" variant="flat" color={(data.final_quality || data.quality) >= 70 ? 'success' : (data.final_quality || data.quality) >= 40 ? 'warning' : 'danger'}>
                  {data.final_quality || data.quality}/100
                </Chip>
              )}
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="pt-3 space-y-3">
            {data.summary && (
              <p className="text-sm text-default-700 leading-relaxed">{data.summary}</p>
            )}
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
