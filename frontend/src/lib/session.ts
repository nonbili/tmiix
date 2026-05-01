export const TAB_COLORS = [
  '#3fb950', // Green
  '#f85149', // Red
  '#2f81f7', // Blue
  '#d29922', // Gold
  '#db61a2', // Pink
  '#a371f7', // Purple
  '#ffa657', // Orange
  '#00d1b2', // Teal
  '#79c0ff', // Sky Blue
  '#facc15', // Yellow
  '#ecadff', // Lavender
] as const

export const remoteKey = (serverName: string, sessionName: string) => `${serverName}\u0000${sessionName}`
