import { useState, useRef, useEffect } from 'react'
import { Button, Chip, Textarea } from '@heroui/react'

export default function ChatInput({ onSend, disabled, prefill, onPrefillUsed }) {
  const [text, setText] = useState('')
  const [images, setImages] = useState([])
  const [refUrl, setRefUrl] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => {
    if (prefill) {
      setText(prefill)
      onPrefillUsed?.()
      textareaRef.current?.focus()
    }
  }, [prefill])

  const handleSend = () => {
    if (!text.trim() && images.length === 0) return
    onSend({
      content: text.trim(),
      images: images.length > 0 ? images : undefined,
      reference_url: refUrl || undefined,
    })
    setText('')
    setImages([])
    setRefUrl('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        const reader = new FileReader()
        reader.onload = () => setImages(prev => [...prev, reader.result.split(',')[1]])
        reader.readAsDataURL(file)
        return
      }
    }
    const pastedText = e.clipboardData.getData('text')
    if (pastedText && /^https?:\/\/\S+$/.test(pastedText.trim()) && !refUrl) {
      setRefUrl(pastedText.trim())
    }
  }

  return (
    <div className="border-t border-default-200 bg-default-50/80 backdrop-blur-xl px-4 py-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img src={`data:image/png;base64,${img}`} alt="Attached" className="w-14 h-14 rounded-xl object-cover border border-default-200 shadow-sm" />
              <button
                onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Reference URL */}
      {refUrl && (
        <div className="mb-2">
          <Chip
            size="sm"
            variant="flat"
            color="primary"
            onClose={() => setRefUrl('')}
            startContent={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            }
          >
            {refUrl.length > 50 ? refUrl.slice(0, 50) + '...' : refUrl}
          </Chip>
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={text}
          onValueChange={setText}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? 'Pipeline running...' : 'Describe what to build...'}
          isDisabled={disabled}
          minRows={1}
          maxRows={6}
          variant="bordered"
          classNames={{
            inputWrapper: 'bg-white border-default-200 shadow-sm',
            input: 'text-sm',
          }}
        />
        <Button
          isIconOnly
          color="primary"
          radius="lg"
          size="lg"
          onPress={handleSend}
          isDisabled={disabled || (!text.trim() && images.length === 0)}
          className="shrink-0 shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </Button>
      </div>
      <p className="text-[10px] text-default-400 mt-1.5 px-1">
        {disabled ? 'Waiting for pipeline...' : 'Enter to send · Shift+Enter for newline · Paste images or URLs'}
      </p>
    </div>
  )
}
