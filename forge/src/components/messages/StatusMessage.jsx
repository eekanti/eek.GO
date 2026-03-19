import { Chip } from '@heroui/react'

export default function StatusMessage({ message }) {
  return (
    <div className="flex justify-center py-0.5">
      <Chip size="sm" variant="flat" color="default" className="text-default-500 dark:text-zinc-400">
        {message.content}
      </Chip>
    </div>
  )
}
