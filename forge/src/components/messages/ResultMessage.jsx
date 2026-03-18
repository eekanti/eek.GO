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
            {/* Suggestions for next prompt */}
            {data.suggestions?.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-default-500 uppercase tracking-wider">Suggested next steps</p>
                <div className="space-y-1.5">
                  {data.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 bg-primary-50 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-primary-100 hover:shadow-sm transition-all group"
                      onClick={() => onUseSuggestion?.(s)}
                      title="Click to use as next prompt"
                    >
                      <span className="text-primary text-xs mt-0.5 shrink-0">→</span>
                      <span className="text-sm text-primary-700 leading-relaxed flex-1">{s}</span>
                      <span className="text-[10px] text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 whitespace-nowrap">use →</span>
                    </div>
                  ))}
                </div>
              </div>
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
