import { useState } from 'react'
import { Chip } from '@heroui/react'
import { useChat } from '../context/ChatContext.jsx'
import useSSE from '../hooks/useSSE.js'
import ChatMessageList from './ChatMessageList.jsx'
import ChatInput from './ChatInput.jsx'
import { ForgeIcon } from './Sidebar.jsx'

export default function ChatView() {
  const { state, dispatch } = useChat()
  const { activeProject, messages, isRunning } = state
  const [prefill, setPrefill] = useState('')

  useSSE(activeProject?.id)

  const handleSend = async ({ content, images, reference_url }) => {
    if (!activeProject) return

    const tempMsg = {
      id: Date.now(),
      project_id: activeProject.id,
      role: 'user',
      content,
      message_type: images?.length ? 'image' : 'text',
      metadata: { images, reference_url },
      created_at: new Date().toISOString(),
    }
    dispatch({ type: 'ADD_MESSAGE', message: tempMsg })
    dispatch({ type: 'SET_RUNNING', value: true })

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: activeProject.id, content, images, reference_url }),
      })
    } catch (e) {
      dispatch({ type: 'SET_RUNNING', value: false })
      dispatch({
        type: 'ADD_MESSAGE',
        message: { id: Date.now(), role: 'status', content: `Failed to send: ${e.message}`, message_type: 'error', created_at: new Date().toISOString() }
      })
    }
  }

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-default-50">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/20">
            <ForgeIcon size={36} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">eek-Forge</h2>
            <p className="text-default-500 text-sm mt-1">AI-Powered Coding Pipeline</p>
          </div>
          <p className="text-default-400 text-sm max-w-sm leading-relaxed">
            Create a project to start building. Describe what you want, paste reference images or URLs, and watch it come to life.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Project header bar */}
      <div className="border-b border-default-200 bg-default-50/80 backdrop-blur-xl px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{activeProject.display_name}</h2>
          <p className="text-[11px] font-mono text-default-400">{activeProject.id}</p>
        </div>
        {isRunning && (
          <Chip size="sm" color="primary" variant="dot">
            Pipeline running
          </Chip>
        )}
      </div>

      <ChatMessageList messages={messages} onUseSuggestion={(s) => setPrefill(s)} />
      <ChatInput onSend={handleSend} disabled={isRunning} prefill={prefill} onPrefillUsed={() => setPrefill('')} />
    </div>
  )
}
