interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  size?: number | string
}

export function IconButton({ icon, className, size = 20, ...props }: IconButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center bg-transparent border-0 cursor-pointer transition-all duration-[120ms] flex-shrink-0 ${className}`}
      style={{ width: size, height: size, ...props.style }}
      type="button"
      {...props}
    >
      {icon}
    </button>
  )
}
