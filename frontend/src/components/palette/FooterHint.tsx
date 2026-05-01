interface FooterHintProps {
  keyLabel: string
  action: string
}

export function FooterHint({ keyLabel, action }: FooterHintProps) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <kbd className="text-foreground-subtle text-[10px] font-mono normal-case tracking-normal px-1.5 py-0.5 rounded border border-border bg-elevated">
        {keyLabel}
      </kbd>
      <span className="text-foreground-subtle text-[10px] tracking-[0.08em] uppercase">{action}</span>
    </span>
  )
}
