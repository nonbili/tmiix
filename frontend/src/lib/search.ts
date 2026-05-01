export function sessionMatchesQuery(sessionName: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = sessionName.toLowerCase()
  if (haystack.includes(needle)) return true
  let offset = 0
  for (const char of needle) {
    offset = haystack.indexOf(char, offset)
    if (offset === -1) return false
    offset += 1
  }
  return true
}
