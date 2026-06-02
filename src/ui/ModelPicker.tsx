import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { MODEL_PROFILES } from '../config/models.js'

type Props = {
  currentModel: string
  onSelect: (model: string) => void
  onClose: () => void
}

export function ModelPicker({ currentModel, onSelect, onClose }: Props) {
  const [selected, setSelected] = useState(
    Math.max(0, MODEL_PROFILES.findIndex(m => m.id === currentModel))
  )

  // Split into free and paid sections
  const freeModels = MODEL_PROFILES.filter(m => m.free)
  const paidModels = MODEL_PROFILES.filter(m => !m.free)

  // Build flat list for navigation
  const allModels = [...freeModels, ...paidModels]
  const freeCount = freeModels.length

  useInput((ch, key) => {
    if (key.escape) { onClose(); return }
    if (key.return) {
      onSelect(allModels[selected]!.id)
      return
    }
    if (key.upArrow) { setSelected(s => Math.max(0, s - 1)); return }
    if (key.downArrow) { setSelected(s => Math.min(allModels.length - 1, s + 1)); return }
  })

  // Map selected index back to flat list position
  let flatIndex = 0

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">Select Model</Text>
      <Text dimColor>{' '}↑↓ navigate · Enter select · Esc cancel · /model &lt;name&gt;</Text>
      <Text> </Text>

      {/* Free section */}
      {freeCount > 0 && (
        <>
          <Text bold color="green">  Free</Text>
          {freeModels.map((model) => {
            const i = flatIndex++
            const isActive = model.id === currentModel
            const isSelected = i === selected
            return (
              <Box key={model.id}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {isSelected ? '▸ ' : '  '}
                </Text>
                <Text color={isActive ? 'green' : 'white'} bold={isActive}>
                  {model.name}
                </Text>
                <Text color="gray" dimColor>
                  {' '}{model.id}
                </Text>
                {isActive && <Text color="green"> ●</Text>}
              </Box>
            )
          })}
        </>
      )}

      {/* Paid section */}
      {paidModels.length > 0 && (
        <>
          {freeCount > 0 && <Text> </Text>}
          <Text bold color="yellow">  Paid</Text>
          {paidModels.map((model) => {
            const i = flatIndex++
            const isActive = model.id === currentModel
            const isSelected = i === selected
            const cost = model.costPer1kOutput > 0 ? `$${model.costPer1kOutput}/1k` : ''
            return (
              <Box key={model.id}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {isSelected ? '▸ ' : '  '}
                </Text>
                <Text color={isActive ? 'green' : 'white'} bold={isActive}>
                  {model.name}
                </Text>
                <Text color="gray" dimColor>
                  {' '}{model.id}
                </Text>
                {cost && <Text color="gray" dimColor> {cost}</Text>}
                {isActive && <Text color="green"> ●</Text>}
              </Box>
            )
          })}
        </>
      )}
    </Box>
  )
}
