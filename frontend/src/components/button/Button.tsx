interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
}

const variantClasses = {
  primary: 'font-medium bg-accent hover:bg-accent/90 text-background border border-transparent',
  secondary: 'bg-elevated hover:bg-muted border border-border text-foreground hover:text-foreground-strong',
  danger: 'text-term-red hover:bg-term-red/10 border border-transparent',
}

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return (
    <button
      className={`h-7 px-2.5 rounded-[6px] text-xs transition-colors ${variantClasses[variant]} ${className ?? ''}`}
      type="button"
      {...props}
    />
  )
}
