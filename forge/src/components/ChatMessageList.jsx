import { useEffect, useRef } from 'react'
import UserMessage from './messages/UserMessage.jsx'
import StatusMessage from './messages/StatusMessage.jsx'
import ResultMessage from './messages/ResultMessage.jsx'
import ErrorMessage from './messages/ErrorMessage.jsx'

function MessageRenderer({ message, onUseSuggestion }) {
  if (message.role === 'user') return <UserMessage message={message} />
  if (message.role === 'status') return <StatusMessage message={message} />
  if (message.message_type === 'pipeline_result') return <ResultMessage message={message} onUseSuggestion={onUseSuggestion} />
  if (message.message_type === 'error') return <ErrorMessage message={message} />
  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] bg-default-100 rounded-2xl rounded-tl-md px-4 py-3">
        <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
        <p className="text-[10px] text-default-400 mt-1">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

export default function ChatMessageList({ messages, onUseSuggestion }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const userScrolledUp = useRef(false)

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p className="text-default-500 text-sm font-medium">Start a conversation</p>
          <p className="text-default-400 text-xs">Describe what to build, paste images or reference URLs</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      {messages.map((msg) => (
        <MessageRenderer key={msg.id} message={msg} onUseSuggestion={onUseSuggestion} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
