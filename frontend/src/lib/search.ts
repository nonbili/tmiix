export function sessionMatchesQuery(sessionName: string, query: string): boolean {
  return sessionMatchRank(sessionName, query) !== null
}

export function sessionMatchRank(sessionName: string, query: string): number | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  const haystack = sessionName.toLowerCase()
  if (haystack === needle) return 1

  const segments = haystack.split(/[/:\\\s]+/).filter(Boolean)
  if (segments.includes(needle)) return 2
  if (segments.some((segment) => segment.startsWith(needle))) return 3
  if (haystack.includes(needle)) return 4

  let offset = 0
  for (const char of needle) {
    offset = haystack.indexOf(char, offset)
    if (offset === -1) return null
    offset += 1
  }
  return 5
}
