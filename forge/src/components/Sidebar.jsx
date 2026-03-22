import { useState } from 'react'
import { Button, Input, Tooltip } from '@heroui/react'
import NewProjectDialog from './NewProjectDialog.jsx'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ForgeIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 3.3 12 6l-2.7-2.7a1 1 0 0 0-1.4 0L5.3 5.9a1 1 0 0 0 0 1.4L8 10l-4 4h4l2 2v4l4-4 2.7 2.7a1 1 0 0 0 1.4 0l2.6-2.6a1 1 0 0 0 0-1.4L18 12l2.7-2.7a1 1 0 0 0 0-1.4l-2.6-2.6"/>
      <path d="m8 10 4 4"/>
    </svg>
  )
}

export { ForgeIcon }

export default function Sidebar({ projects, activeId, onSelect, onCreate, onDelete, isDark, onToggleDark }) {
  const [collapsed, setCollapsed] = useState(false)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? projects.filter(p =>
        p.display_name.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  if (collapsed) {
    return (
      <div className="w-14 flex flex-col items-center py-4 border-r border-default-200 bg-default-50 gap-3">
        <Tooltip content="Expand" placement="right">
          <Button isIconOnly size="sm" variant="light" onPress={() => setCollapsed(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </Button>
        </Tooltip>
        <Tooltip content="New project" placement="right">
          <Button isIconOnly size="sm" variant="light" color="primary" onPress={() => setShowNewDialog(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </Button>
        </Tooltip>
        <NewProjectDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} onCreate={onCreate} />
      </div>
    )
  }

  return (
    <aside className="w-72 flex flex-col border-r border-default-200 bg-default-50 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-default-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white">
            <ForgeIcon size={18} />
          </div>
          <span className="font-semibold text-foreground tracking-tight text-[15px]">eek.FORGE</span>
        </div>
        <Button isIconOnly size="sm" variant="light" onPress={() => setCollapsed(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </Button>
      </div>

      {/* New project */}
      <div className="px-3 pt-3 pb-1">
        <Button
          fullWidth
          variant="bordered"
          size="sm"
          startContent={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>}
          onPress={() => setShowNewDialog(true)}
          className="border-dashed text-default-500 hover:text-primary hover:border-primary"
        >
          New project
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pt-2 pb-1">
        <Input
          size="sm"
          placeholder="Search projects..."
          value={search}
          onValueChange={setSearch}
          classNames={{ inputWrapper: 'bg-default-100 border-default-200' }}
          startContent={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-default-400">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          }
        />
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-default-400 text-xs px-2 py-6 text-center">
            {search ? 'No matches' : 'No projects yet'}
          </p>
        )}
        {filtered.map(p => (
          <div
            key={p.id}
            className={`group relative w-full text-left px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
              p.id === activeId
                ? 'bg-primary-50 border border-primary-200 shadow-sm'
                : 'hover:bg-default-100 border border-transparent'
            }`}
            onClick={() => onSelect(p)}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-medium leading-snug line-clamp-2 ${p.id === activeId ? 'text-primary-700' : 'text-foreground'}`}>
                {p.display_name}
              </p>
              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p.id) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 p-0.5 rounded hover:bg-danger-100 text-default-300 hover:text-danger-500"
                title="Delete project"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[10px] text-default-400 truncate">{p.id}</span>
              {p.last_activity && (
                <span className="text-[10px] text-default-400 shrink-0">{timeAgo(p.last_activity)}</span>
              )}
            </div>
            {p.last_message && (
              <p className="text-[11px] text-default-400 mt-1 line-clamp-1">{p.last_message}</p>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-default-200 flex items-center justify-between">
        <p className="text-[10px] text-default-300 font-mono">eek.FORGE</p>
        <Button isIconOnly size="sm" variant="light" onPress={onToggleDark} title={isDark ? 'Light mode' : 'Dark mode'}>
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </Button>
      </div>

      <NewProjectDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} onCreate={onCreate} />
    </aside>
  )
}
