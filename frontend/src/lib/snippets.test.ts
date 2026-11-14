import { describe, expect, it } from 'bun:test'
import { normalizeSnippetBody, snippetCommand } from './snippets'

describe('normalizeSnippetBody', () => {
  it('removes spaces after continuation backslashes and normalizes CRLF', () => {
    expect(normalizeSnippetBody('echo \\ \t\r\n  hello \t\r\n\r\n \t')).toBe('echo \\\n  hello')
  })

  it('preserves indentation, interior whitespace, and blank lines', () => {
    expect(normalizeSnippetBody('  echo "a  b"\n\n\techo done\n')).toBe('  echo "a  b"\n\n\techo done')
  })
})

describe('snippetCommand', () => {
  it('normalizes Windows line endings in continued commands', () => {
    expect(snippetCommand('echo \\\r\n  hello\r\n')).toBe('echo \\\n  hello\n')
  })

  it('preserves trailing whitespace in heredocs and multiline strings on Run', () => {
    const body = 'cat <<\'EOF\'\nfirst line  \nEOF\nprintf "%s" "col1   \ncol2"'
    expect(snippetCommand(body)).toBe(`${body}\n`)
  })
})
