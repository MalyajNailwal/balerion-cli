import React, { useState, useRef, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'

const MULTI_LINE_DELIMITERS = ['"""', '```']

type Props = {
  onSubmit: (text: string) => void
  isLoading: boolean
  history: string[]
  onInputChange?: (input: string) => void
  disabled?: boolean
}

export function Prompt({ onSubmit, isLoading, history, onInputChange, disabled }: Props) {
  const [input, setInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [cursor, setCursor] = useState(0)
  const [multiLine, setMultiLine] = useState(false)
  const [multiLineBuffer, setMultiLineBuffer] = useState<string[]>([])
  const [multiLineDelimiter, setMultiLineDelimiter] = useState<string>('')

  // Track disabled via ref to avoid stale closure in useInput
  const disabledRef = useRef(disabled)
  useEffect(() => { disabledRef.current = disabled }, [disabled])

  // CRITICAL FIX: When disabled goes true → false (picker closed), clear stale input
  const wasDisabled = useRef(disabled)
  useEffect(() => {
    if (wasDisabled.current && !disabled) {
      setInput('')
      setCursor(0)
      setHistoryIndex(-1)
      onInputChange?.('')
    }
    wasDisabled.current = disabled
  }, [disabled, onInputChange])

  useInput((ch, key) => {
    if (isLoading) return
    if (disabledRef.current) return

    if (key.return) {
      if (multiLine) {
        const trimmed = input.trim()
        if (MULTI_LINE_DELIMITERS.includes(trimmed) && trimmed === multiLineDelimiter) {
          const fullText = multiLineBuffer.join('\n')
          if (fullText.trim()) {
            onSubmit(fullText)
          }
          setInput('')
          setCursor(0)
          setHistoryIndex(-1)
          setMultiLine(false)
          setMultiLineBuffer([])
          setMultiLineDelimiter('')
          onInputChange?.('')
          return
        }
        setMultiLineBuffer(prev => [...prev, input])
        setInput('')
        setCursor(0)
        return
      }

      const trimmed = input.trim()
      const delimiter = MULTI_LINE_DELIMITERS.find(d => trimmed === d)
      if (delimiter) {
        setMultiLine(true)
        setMultiLineBuffer([])
        setMultiLineDelimiter(delimiter)
        setInput('')
        setCursor(0)
        return
      }

      const text = input.trim()
      if (text) {
        onSubmit(text)
        setInput('')
        setCursor(0)
        setHistoryIndex(-1)
        onInputChange?.('')
      }
      return
    }

    if (key.upArrow) {
      if (multiLine) return
      if (history.length === 0) return
      const nextIndex = Math.min(historyIndex + 1, history.length - 1)
      setHistoryIndex(nextIndex)
      const entry = history[nextIndex]!
      setInput(entry)
      setCursor(entry.length)
      onInputChange?.(entry)
      return
    }

    if (key.downArrow) {
      if (multiLine) return
      if (historyIndex <= 0) {
        setHistoryIndex(-1)
        setInput('')
        setCursor(0)
        onInputChange?.('')
        return
      }
      const nextIndex = historyIndex - 1
      setHistoryIndex(nextIndex)
      const entry = history[nextIndex]!
      setInput(entry)
      setCursor(entry.length)
      onInputChange?.(entry)
      return
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        const newInput = input.slice(0, cursor - 1) + input.slice(cursor)
        setInput(newInput)
        setCursor(c => c - 1)
        onInputChange?.(newInput)
      }
      return
    }

    if (key.leftArrow) {
      setCursor(c => Math.max(0, c - 1))
      return
    }

    if (key.rightArrow) {
      setCursor(c => Math.min(input.length, c + 1))
      return
    }

    if (ch && !key.ctrl && !key.meta) {
      const newInput = input.slice(0, cursor) + ch + input.slice(cursor)
      setInput(newInput)
      setCursor(c => c + 1)
      onInputChange?.(newInput)
    }
  })

  if (isLoading) return null

  const promptChar = multiLine ? '... ' : '❯ '

  return (
    <Box flexDirection="column">
      {multiLine && multiLineBuffer.map((line, i) => (
        <Box key={i}>
          <Text dimColor>{'... '}</Text>
          <Text>{line}</Text>
        </Box>
      ))}
      <Box>
        <Text bold color={multiLine ? 'yellow' : 'green'}>{promptChar}</Text>
        <Text>
          {input.slice(0, cursor)}
          <Text inverse>{input[cursor] || ' '}</Text>
          {input.slice(cursor + 1)}
        </Text>
      </Box>
    </Box>
  )
}
