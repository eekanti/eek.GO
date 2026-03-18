import { useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input } from '@heroui/react'

export default function NewProjectDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('')

  const safeId = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate({ id: safeId, display_name: name.trim() })
    setName('')
    onClose()
  }

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }} placement="center">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>New Project</span>
        </ModalHeader>
        <ModalBody>
          <Input
            autoFocus
            label="Project name"
            placeholder="My Awesome App"
            value={name}
            onValueChange={setName}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            variant="bordered"
          />
          {name.trim() && (
            <p className="text-xs text-default-400 font-mono">
              Folder: {safeId}/
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>Cancel</Button>
          <Button color="primary" onPress={handleCreate} isDisabled={!name.trim()}>
            Create Project
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
