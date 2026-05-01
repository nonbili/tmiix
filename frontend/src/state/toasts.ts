import { observable } from '@legendapp/state'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

export const toasts$ = observable({ items: [] as Toast[] })

let nextId = 1
const DEFAULT_TIMEOUT = 4000

export function showToast(kind: ToastKind, message: string, timeoutMs = DEFAULT_TIMEOUT) {
  const id = nextId++
  toasts$.items.set((items) => [...items, { id, kind, message }])
  if (timeoutMs > 0) {
    window.setTimeout(() => dismissToast(id), timeoutMs)
  }
  return id
}

export function dismissToast(id: number) {
  toasts$.items.set((items) => items.filter((toast) => toast.id !== id))
}
