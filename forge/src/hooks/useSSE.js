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

        if (eventType === 'pipeline_started') {
          dispatch({ type: 'SET_RUNNING', value: true })
        }
        if (eventType === 'pipeline_complete' || eventType === 'pipeline_error') {
          dispatch({ type: 'SET_RUNNING', value: false })
        }

        // Determine message type and role based on event
        let role = 'status'
        let messageType = 'status_update'
        if (eventType === 'pipeline_complete') { role = 'assistant'; messageType = 'pipeline_result' }
        if (eventType === 'plan_approval') { role = 'assistant'; messageType = 'plan_approval' }
        if (eventType === 'agent_question') { role = 'assistant'; messageType = 'question' }

        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: Date.now(),
            role,
            content: data.message || eventType,
            message_type: messageType,
            metadata: data,
            created_at: data.timestamp || new Date().toISOString(),
          }
        })
      } catch {}
    }

    const events = ['pipeline_started', 'planning_complete', 'plan_approval', 'plan_approved', 'agent_question', 'research_complete', 'task_written', 'review_complete', 'fix_applied', 'final_review_complete', 'pipeline_complete', 'pipeline_error']
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
