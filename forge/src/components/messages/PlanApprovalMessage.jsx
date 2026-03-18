import { useState } from 'react'
import { Card, CardBody, CardHeader, Button, Chip, Divider, Textarea } from '@heroui/react'

export default function PlanApprovalMessage({ message, onRespond }) {
  const [responded, setResponded] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)

  const data = message.metadata || {}
  const tasks = data.tasks || []
  const executionId = data.execution_id

  const handleAction = async (action) => {
    setLoading(true)
    try {
      await fetch('/api/plan-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_id: executionId,
          action,
          feedback: action === 'edit' ? feedback : undefined,
        }),
      })
      setResponded(true)
    } catch (e) {
      console.error('Failed to respond:', e)
    }
    setLoading(false)
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] w-full">
        <Card shadow="sm" className="border border-primary-200 bg-primary-50/30">
          <CardHeader className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <span className="text-sm font-semibold text-primary-700">Plan Review</span>
            </div>
            <div className="flex items-center gap-2">
              <Chip size="sm" variant="flat">{tasks.length} tasks</Chip>
              <Chip size="sm" variant="flat">{data.total_files || 0} files</Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="space-y-3 pt-3">
            {/* Task list */}
            <div className="space-y-2">
              {tasks.map((task, i) => (
                <div key={task.task_id} className="bg-white/60 rounded-lg px-3 py-2.5 border border-primary-100">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-primary-400 mt-0.5 shrink-0">{task.task_id}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 leading-relaxed">{task.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(task.files || []).map((f, j) => (
                          <Chip key={j} size="sm" variant="flat" className="text-[10px]">{f}</Chip>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Edit feedback area */}
            {showEdit && !responded && (
              <div className="space-y-2">
                <Textarea
                  value={feedback}
                  onValueChange={setFeedback}
                  placeholder="Describe changes to the plan... (e.g., 'Add a task for dark mode', 'Remove the API task, keep it frontend only')"
                  minRows={2}
                  maxRows={4}
                  variant="bordered"
                  classNames={{ inputWrapper: 'bg-white' }}
                />
              </div>
            )}

            {/* Action buttons */}
            {!responded ? (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  color="primary"
                  size="sm"
                  onPress={() => handleAction('approve')}
                  isLoading={loading}
                  startContent={!loading && <span>✓</span>}
                >
                  Approve & Build
                </Button>
                {!showEdit ? (
                  <Button
                    variant="bordered"
                    size="sm"
                    onPress={() => setShowEdit(true)}
                    startContent={<span>✎</span>}
                  >
                    Edit Plan
                  </Button>
                ) : (
                  <Button
                    color="warning"
                    variant="flat"
                    size="sm"
                    onPress={() => handleAction('edit')}
                    isLoading={loading}
                    isDisabled={!feedback.trim()}
                    startContent={!loading && <span>✎</span>}
                  >
                    Approve with Edits
                  </Button>
                )}
                <Button
                  color="danger"
                  variant="light"
                  size="sm"
                  onPress={() => handleAction('reject')}
                  isLoading={loading}
                >
                  Reject
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-success-600">
                <span>✓</span>
                <span>Plan approved — pipeline continuing...</span>
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
