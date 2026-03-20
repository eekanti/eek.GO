import { createContext, useContext, useReducer } from 'react'

const ChatContext = createContext()

const initialState = {
  activeProject: null,
  messages: [],
  isRunning: false,
  projects: [],
}

function chatReducer(state, action) {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.projects }
    case 'SET_PROJECT': {
      // Detect if pipeline is still running from message history
      const msgs = action.messages || []
      const statusMsgs = msgs.filter(m => m.role === 'status' || m.message_type === 'pipeline_result')
      const lastStatus = statusMsgs[statusMsgs.length - 1]
      let stillRunning = false
      if (lastStatus?.metadata?.event && !['pipeline_complete', 'pipeline_error'].includes(lastStatus.metadata.event)) {
        // Only consider it "running" if the last status was recent (within 15 minutes)
        const statusAge = Date.now() - new Date(lastStatus.created_at).getTime()
        stillRunning = statusAge < 15 * 60 * 1000
      }
      return { ...state, activeProject: action.project, messages: msgs, isRunning: stillRunning }
    }
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] }
    case 'SET_RUNNING':
      return { ...state, isRunning: action.value }
    case 'CLEAR_PROJECT':
      return { ...state, activeProject: null, messages: [], isRunning: false }
    default:
      return state
  }
}

export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(chatReducer, initialState)
  return (
    <ChatContext.Provider value={{ state, dispatch }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) throw new Error('useChat must be used within ChatProvider')
  return context
}
