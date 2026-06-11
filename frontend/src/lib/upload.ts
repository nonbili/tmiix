import { PickUploadFiles, UploadDroppedFiles } from '../../wailsjs/go/main/App'
import { dismissToast, showToast } from '../state/toasts'
import type { Tab } from '../types'

let inFlight = false

export async function uploadFilesToTab(tab: Tab, paths: string[]) {
  if (paths.length === 0) return
  if (inFlight) {
    showToast('warning', 'A file upload is already in progress')
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
    showToast('error', `File upload failed: ${message}`)
  } finally {
    if (progressToast !== null) dismissToast(progressToast)
    inFlight = false
  }
}

export async function pickAndUploadFiles(tab: Tab) {
  let paths: string[] | null
  try {
    paths = await PickUploadFiles()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showToast('error', `File picker failed: ${message}`)
    return
  }
  await uploadFilesToTab(tab, paths ?? [])
}
