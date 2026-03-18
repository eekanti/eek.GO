import { useEffect } from 'react'
import { ChatProvider, useChat } from './context/ChatContext.jsx'
import Sidebar from './components/Sidebar.jsx'
import ChatView from './components/ChatView.jsx'

function AppInner() {
  const { state, dispatch } = useChat()

  const refreshProjects = async () => {
    try {
      const r = await fetch('/api/projects')
      const data = await r.json()
      dispatch({ type: 'SET_PROJECTS', projects: data.projects || [] })
    } catch {}
  }

  useEffect(() => { refreshProjects() }, [])

  const handleSelectProject = async (project) => {
    try {
      const r = await fetch(`/api/projects/${project.id}/messages?limit=100`)
      const data = await r.json()
      dispatch({ type: 'SET_PROJECT', project, messages: data.messages || [] })
    } catch {
      dispatch({ type: 'SET_PROJECT', project, messages: [] })
    }
  }

  const handleCreateProject = async ({ id, display_name }) => {
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, display_name }),
      })
      if (!r.ok) {
        const err = await r.json()
        alert(err.error || 'Failed to create project')
        return
      }
      const project = await r.json()
      await refreshProjects()
      dispatch({ type: 'SET_PROJECT', project: { id: project.id, display_name: project.display_name }, messages: [] })
    } catch (e) {
      alert('Failed to create project: ' + e.message)
    }
  }

  const handleDeleteProject = async (projectId) => {
    if (!confirm('Delete this project chat? Files on disk are kept.')) return
    try {
      await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (state.activeProject?.id === projectId) {
        dispatch({ type: 'CLEAR_PROJECT' })
      }
      await refreshProjects()
    } catch {}
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        projects={state.projects}
        activeId={state.activeProject?.id}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onDelete={handleDeleteProject}
      />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <ChatView />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ChatProvider>
      <AppInner />
    </ChatProvider>
  )
}
