// A continuation backslash must immediately precede the newline.
export function normalizeSnippetBody(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/[ \t\r]+$/gm, '').replace(/\n+$/, '')
}

export function snippetCommand(body: string): string {
  // Preserve script data (including heredocs) when running without saving.
  const command = body.replace(/\r\n/g, '\n')
  return command.endsWith('\n') ? command : `${command}\n`
}
