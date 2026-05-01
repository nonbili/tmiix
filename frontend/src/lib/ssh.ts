import { main } from '../../wailsjs/go/models'

export function parseSSHCommand(input: string): main.SSHServer {
  const tokens = splitShellWords(input.trim())
  if (tokens.length === 0) {
    throw new Error('enter an ssh command')
  }
  if (tokens[0] !== 'ssh') {
    throw new Error('command must start with ssh')
  }

  let user = ''
  let port = 0
  let identityFile = ''
  let target = ''

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token) continue
    if (token === '--') {
      target = tokens[i + 1] ?? ''
      break
    }
    if (!token.startsWith('-')) {
      target = token
      break
    }
    if (token === '-p' || token === '-i' || token === '-l' || token === '-F' || token === '-J') {
      const value = tokens[i + 1] ?? ''
      if (!value) throw new Error(`missing value for ${token}`)
      if (token === '-p') {
        const parsedPort = Number(value)
        if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
          throw new Error('invalid ssh port')
        }
        port = parsedPort
      } else if (token === '-i') {
        identityFile = value
      } else if (token === '-l') {
        user = value
      }
      i += 1
      continue
    }
    if (token.startsWith('-p') && token.length > 2) {
      const parsedPort = Number(token.slice(2))
      if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
        throw new Error('invalid ssh port')
      }
      port = parsedPort
      continue
    }
    if (token.startsWith('-l') && token.length > 2) {
      user = token.slice(2)
    }
  }

  if (!target) {
    throw new Error('ssh target is required')
  }

  let host = target
  if (target.includes('@')) {
    const [targetUser, targetHost] = target.split('@', 2)
    if (targetUser) user = targetUser
    host = targetHost
  }
  host = host.trim()
  if (!host) {
    throw new Error('ssh host is required')
  }

  return main.SSHServer.createFrom({
    name: host,
    host,
    user: user.trim(),
    port,
    identityFile: identityFile.trim(),
  })
}

function splitShellWords(input: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quote) {
      if (char === quote) {
        quote = null
      } else if (char === '\\' && quote === '"' && i + 1 < input.length) {
        current += input[i + 1]
        i += 1
      } else {
        current += char
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        out.push(current)
        current = ''
      }
      continue
    }
    if (char === '\\' && i + 1 < input.length) {
      current += input[i + 1]
      i += 1
      continue
    }
    current += char
  }

  if (quote) {
    throw new Error('unterminated quote')
  }
  if (current) out.push(current)
  return out
}
