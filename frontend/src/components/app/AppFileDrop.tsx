import { useEffect } from 'react'
import { OnFileDrop, OnFileDropOff } from '../../../wailsjs/runtime/runtime'
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
    OnFileDrop((_x, _y, paths) => {
      void handleDrop(paths)
    }, true)
    return () => OnFileDropOff()
  }, [])

  return null
}
