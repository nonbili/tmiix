import { Application, Browser, Clipboard, Events, Window } from '@wailsio/runtime'

// Keep UI-facing helpers in one place, including v3's event payload unwrapping.
export const Quit = () => Application.Quit()
export const BrowserOpenURL = (url: string) => Browser.OpenURL(url)
export const ClipboardGetText = () => Clipboard.Text()
export const ClipboardSetText = (text: string) => Clipboard.SetText(text)
export const WindowFullscreen = () => Window.Fullscreen()
export const WindowUnfullscreen = () => Window.UnFullscreen()
export const WindowIsFullscreen = () => Window.IsFullscreen()

export function EventsOn<T>(name: string, callback: (data: T) => void): () => void {
  return Events.On(name, event => callback(event.data as T))
}
