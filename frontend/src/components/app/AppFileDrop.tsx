import { useEffect } from 'react'
import { EventsOn } from '../../lib/runtime'
import { uploadFilesToTab } from '../../lib/upload'
import { getActiveTab } from '../../state/tabs'
import { showToast } from '../../state/toasts'

async function handleDrop(paths: string[]) {
  if (paths.length === 0) return
  const tab = getActiveTab()
  if (!tab) {
    showToast('warning', 'No active terminal to drop files into')
    return
  }
  await uploadFilesToTab(tab, paths)
}

export function AppFileDrop() {
  useEffect(() => {
    document.body.setAttribute('data-file-drop-target', '')
    const off = EventsOn('files:dropped', (paths: string[]) => {
      void handleDrop(paths)
    })
    return () => {
      off()
      document.body.removeAttribute('data-file-drop-target')
    }
  }, [])

  return null
}
