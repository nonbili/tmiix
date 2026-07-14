import { describe, expect, it } from 'bun:test'
import { filterCommandItems } from './commandItems'

const item = (label: string, aliases: string[] = [], detail = '') => ({ label, aliases, detail })

describe('filterCommandItems', () => {
  it('ranks an exact label ahead of an earlier substring match', () => {
    const items = [item('Change UI theme', ['light']), item('ig', ['inks'])]

    expect(filterCommandItems(items, 'ig').map(({ label }) => label)).toEqual(['ig', 'Change UI theme'])
  })

  it('ranks exact aliases and prefixes ahead of substring matches', () => {
    const items = [item('Substring', ['bright']), item('Prefix item'), item('Alias item', ['pre'])]

    expect(filterCommandItems(items, 'pre').map(({ label }) => label)).toEqual([
      'Alias item',
      'Prefix item',
    ])
  })

  it('preserves source order for matches with the same rank', () => {
    const items = [item('First', ['light']), item('Second', ['night'])]

    expect(filterCommandItems(items, 'ight')).toEqual(items)
  })
})
