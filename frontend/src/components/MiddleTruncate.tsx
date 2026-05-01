interface MiddleTruncateProps {
  text: string
  tailLength?: number
  className?: string
  style?: React.CSSProperties
}

export function MiddleTruncate({ text, tailLength = 7, className, style }: MiddleTruncateProps) {
  if (text.length <= tailLength + 3) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    )
  }
  const head = text.slice(0, text.length - tailLength)
  const tail = text.slice(-tailLength)
  return (
    <span className={`flex min-w-0 ${className ?? ''}`} style={style}>
      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{head}</span>
      <span className="whitespace-pre flex-shrink-0">{tail}</span>
    </span>
  )
}
