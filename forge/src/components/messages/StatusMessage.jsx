export default function StatusMessage({ message }) {
  return (
    <div className="flex justify-center py-0.5 px-4">
      <span className="inline-block text-xs text-default-500 dark:text-zinc-400 bg-default-100 dark:bg-zinc-800/50 px-3 py-1.5 rounded-full text-center break-words max-w-full whitespace-normal">
        {message.content}
      </span>
    </div>
  )
}
