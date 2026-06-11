import { useEffect } from 'react'
import { UploadDroppedFiles } from '../../../wailsjs/go/main/App'
import { OnFileDrop, OnFileDropOff } from '../../../wailsjs/runtime/runtime'
import { getActiveTab } from '../../state/tabs'
import { dismissToast, showToast } from '../../state/toasts'

let inFlight = false

async function handleDrop(paths: string[]) {
  if (paths.length === 0) return
  const tab = getActiveTab()
  if (!tab) {
    showToast('warning', 'No active terminal to drop files into')
    return
  }
  if (inFlight) {
    showToast('warning', 'A file drop is already in progress')
    return
  }
  inFlight = true
  const progressToast = tab.serverName
    ? showToast('info', `Copying ${paths.length === 1 ? '1 file' : `${paths.length} files`} to ${tab.serverName}…`, 0)
    : null
  try {
    const result = await UploadDroppedFiles(tab.id, tab.kind, tab.sessionName ?? '', paths)
    const where = tab.serverName ? `${result.dir} on ${tab.serverName}` : result.dir
    if (result.copied.length === 1) {
      showToast('success', `Copied ${result.copied[0]} to ${where}`)
    } else if (result.copied.length > 1) {
      showToast('success', `Copied ${result.copied.length} files to ${where}`)
    }
    for (const skipped of result.skipped) {
      showToast('error', `${skipped.name}: ${skipped.reason}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showToast('error', `File drop failed: ${message}`)
  } finally {
    if (progressToast !== null) dismissToast(progressToast)
    inFlight = false
  }
}

export function AppFileDrop() {
  useEffect(() => {
    OnFileDrop((_x, _y, paths) => {
      void handleDrop(paths)
    }, true)
    return () => OnFileDropOff()
  }, [])

  return null
}
