import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

type CommandDef = {
  name: string
  aliases: string[]
  description: string
}

const ALL_COMMANDS: CommandDef[] = [
  { name: 'help',    aliases: [],    description: 'List all available commands' },
  { name: 'model',   aliases: ['m'], description: 'Switch model (free + paid)' },
  { name: 'clear',   aliases: ['c'], description: 'Clear conversation history' },
  { name: 'cost',    aliases: [],    description: 'Show session cost breakdown' },
  { name: 'compact', aliases: [],    description: 'Compact conversation (keep last 4)' },
  { name: 'quit',    aliases: ['q'], description: 'Exit Balerion' },
]

type Props = {
  filter: string
  onSelect: (cmd: string) => void
  onClose: () => void
}

export function CommandDropdown({ filter, onSelect, onClose }: Props) {
  // Filter commands based on what user typed after /
  const query = filter.toLowerCase()
  const filtered = ALL_COMMANDS.filter(cmd =>
    cmd.name.startsWith(query) || cmd.aliases.some(a => a.startsWith(query))
  )

  const [selected, setSelected] = useState(0)

  // Reset selection when filter changes
  React.useEffect(() => {
    setSelected(0)
  }, [filter])

  useInput((ch, key) => {
    if (key.escape) { onClose(); return }
    if (key.return) {
      if (filtered[selected]) {
        onSelect(filtered[selected]!.name)
      }
      return
    }
    if (key.upArrow) { setSelected(s => Math.max(0, s - 1)); return }
    if (key.downArrow) { setSelected(s => Math.min(filtered.length - 1, s + 1)); return }
  })

  if (filtered.length === 0) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>No matching commands</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
      <Text bold color="green">Commands</Text>
      <Text dimColor>{' '}↑↓ select · Enter confirm · Esc cancel</Text>
      <Text> </Text>
      {filtered.map((cmd, i) => {
        const isSelected = i === selected
        const aliasStr = cmd.aliases.length > 0 ? ` /${cmd.aliases.join(', /')}` : ''
        return (
          <Box key={cmd.name}>
            <Text color={isSelected ? 'green' : 'white'} bold={isSelected}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text bold color={isSelected ? 'green' : 'white'}>
              /{cmd.name}
            </Text>
            <Text color="gray" dimColor>
              {aliasStr} — {cmd.description}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
