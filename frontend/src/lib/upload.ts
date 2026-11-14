import { PickUploadFiles, UploadDroppedFiles } from '../../bindings/tmiix/app'
import { dismissToast, showToast } from '../state/toasts'
import { requestConfirm } from '../state/ui'
import type { Tab } from '../types'

let inFlight = false

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Runs one upload pass, reporting results via toasts; returns the names of
 * files that already exist at the destination (only when !overwrite). */
async function runUpload(tab: Tab, paths: string[], overwrite: boolean) {
  const progressToast = tab.serverName
    ? showToast('info', `Copying ${paths.length === 1 ? '1 file' : `${paths.length} files`} to ${tab.serverName}…`, 0)
    : null
  try {
    const result = await UploadDroppedFiles(tab.id, tab.kind, tab.sessionName ?? '', paths, overwrite)
    if (!result) throw new Error('No upload result returned')
    const where = tab.serverName ? `${result.dir} on ${tab.serverName}` : result.dir
    if (result.copied.length === 1) {
      showToast('success', `Copied ${result.copied[0]} to ${where}`)
    } else if (result.copied.length > 1) {
      showToast('success', `Copied ${result.copied.length} files to ${where}`)
    }
    for (const skipped of result.skipped) {
      showToast('error', `${skipped.name}: ${skipped.reason}`)
    }
    return { conflicts: result.conflicts ?? [], dir: result.dir }
  } finally {
    if (progressToast !== null) dismissToast(progressToast)
  }
}

export async function uploadFilesToTab(tab: Tab, paths: string[]) {
  if (paths.length === 0) return
  if (inFlight) {
    showToast('warning', 'A file upload is already in progress')
    return
  }
  inFlight = true
  try {
    const { conflicts, dir } = await runUpload(tab, paths, false)
    if (conflicts.length === 0) return

    const where = tab.serverName ? `${dir} on ${tab.serverName}` : dir
    const message =
      conflicts.length === 1
        ? `${conflicts[0]} already exists in ${where}. Overwrite it?`
        : `${conflicts.length} files already exist in ${where}: ${conflicts.join(', ')}. Overwrite them?`
    const ok = await requestConfirm({
      title: 'Overwrite files?',
      message,
      confirmLabel: 'Overwrite',
      destructive: true,
    })
    if (!ok) return

    const retry = paths.filter((p) => conflicts.includes(basename(p)))
    await runUpload(tab, retry, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showToast('error', `File upload failed: ${message}`)
  } finally {
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
