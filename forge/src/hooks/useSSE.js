import { useEffect, useRef } from 'react'
import { useChat } from '../context/ChatContext.jsx'

export default function useSSE(projectId) {
  const { dispatch } = useChat()
  const esRef = useRef(null)

  useEffect(() => {
    if (!projectId) return

    const es = new EventSource(`/api/chat/stream/${projectId}`)
    esRef.current = es

    const handleEvent = (e) => {
      try {
        const data = JSON.parse(e.data)
        const eventType = e.type

        if (eventType === 'pipeline_complete' || eventType === 'pipeline_error') {
          dispatch({ type: 'SET_RUNNING', value: false })
        }

        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: Date.now(),
            role: eventType === 'pipeline_complete' ? 'assistant' : 'status',
            content: data.message || eventType,
            message_type: eventType === 'pipeline_complete' ? 'pipeline_result' : 'status_update',
            metadata: data,
            created_at: data.timestamp || new Date().toISOString(),
          }
        })
      } catch {}
    }

    const events = ['pipeline_started', 'planning_complete', 'task_written', 'review_complete', 'fix_applied', 'final_review_complete', 'pipeline_complete', 'pipeline_error']
    events.forEach(evt => es.addEventListener(evt, handleEvent))

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    }

    return () => {
      events.forEach(evt => es.removeEventListener(evt, handleEvent))
      es.close()
      esRef.current = null
    }
  }, [projectId, dispatch])
}
