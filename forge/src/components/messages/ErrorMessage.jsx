import { Card, CardBody } from '@heroui/react'

export default function ErrorMessage({ message }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[70%]">
        <Card shadow="sm" className="border border-danger-200 bg-danger-50/50">
          <CardBody className="py-3">
            <p className="text-sm text-danger-700">{message.content}</p>
            <p className="text-[10px] text-default-400 mt-1">
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
