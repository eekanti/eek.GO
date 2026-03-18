import { Chip } from '@heroui/react'

export default function UserMessage({ message }) {
  const metadata = message.metadata || {}
  const images = metadata.images || []
  const refUrl = metadata.reference_url

  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] space-y-2">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        {refUrl && (
          <div className="flex justify-end px-1">
            <Chip size="sm" variant="flat" color="primary" startContent={
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            }>
              {refUrl.length > 30 ? refUrl.slice(0, 30) + '...' : refUrl}
            </Chip>
          </div>
        )}
        {images.length > 0 && (
          <div className="flex gap-2 justify-end px-1">
            {images.map((img, i) => (
              <img key={i} src={`data:image/png;base64,${img}`} alt="Attached" className="w-20 h-20 rounded-xl object-cover border border-default-200 shadow-sm" />
            ))}
          </div>
        )}
        <p className="text-[10px] text-default-400 text-right px-1">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
