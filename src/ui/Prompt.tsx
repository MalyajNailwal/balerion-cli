import React, { useState, useRef, useEffect } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'

const MULTI_LINE_DELIMITERS = ['"""', '```']
const PASTE_MIN_LINES = 5
const PASTE_MIN_CHARS = 200
const PREVIEW_LINES = 5

const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

type Props = {
  onSubmit: (text: string) => void
  isLoading: boolean
  history: string[]
  onInputChange?: (input: string) => void
  disabled?: boolean
  onPaste?: (preview: string, lineCount: number) => void
}

export function Prompt({ onSubmit, isLoading, history, onInputChange, disabled, onPaste }: Props) {
  const [input, setInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [cursor, setCursor] = useState(0)
  const [multiLine, setMultiLine] = useState(false)
  const [multiLineBuffer, setMultiLineBuffer] = useState<string[]>([])
  const [multiLineDelimiter, setMultiLineDelimiter] = useState<string>('')
  const [pasting, setPasting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const pastedContentRef = useRef<string | null>(null)
  const pasteLineCountRef = useRef(0)
  const pasteBufferRef = useRef('')
  const isPastingRef = useRef(false)
  const badgeLengthRef = useRef(0)
  const pasteTimelineRef = useRef<{ content: string; timer: ReturnType<typeof setTimeout> | null }>({ content: '', timer: null })
  const { stdout } = useStdout()

  const acceptPasteRef = useRef<(content: string) => void>(() => {})

  acceptPasteRef.current = (content: string) => {
    const lineCount = content.split('\n').length
    const charCount = content.length
    pastedContentRef.current = content
    pasteLineCountRef.current = lineCount

    if (lineCount >= PASTE_MIN_LINES || charCount >= PASTE_MIN_CHARS) {
      const badge = `📋 Pasted ${lineCount} line${lineCount !== 1 ? 's' : ''}  [x]`
      badgeLengthRef.current = badge.length
      setShowPreview(false)
      setInput(badge)
      setCursor(badge.length)
      onInputChange?.('')
      onPaste?.(badge, lineCount)
    } else {
      badgeLengthRef.current = 0
      setInput(content)
      setCursor(content.length)
      onInputChange?.(content)
    }
  }

  const clearPasteState = () => {
    pastedContentRef.current = null
    pasteLineCountRef.current = 0
    badgeLengthRef.current = 0
    setShowPreview(false)
    setInput('')
    setCursor(0)
    onInputChange?.('')
  }

  const submit = (text: string) => {
    pastedContentRef.current = null
    pasteLineCountRef.current = 0
    badgeLengthRef.current = 0
    setShowPreview(false)
    setInput('')
    setCursor(0)
    setHistoryIndex(-1)
    onInputChange?.('')
    onSubmit(text)
  }

  const clearPasteTimeline = () => {
    pasteTimelineRef.current.content = ''
    if (pasteTimelineRef.current.timer) {
      clearTimeout(pasteTimelineRef.current.timer)
      pasteTimelineRef.current.timer = null
    }
  }

  const disabledRef = useRef(disabled)
  useEffect(() => { disabledRef.current = disabled }, [disabled])

  const wasDisabled = useRef(disabled)
  useEffect(() => {
    if (wasDisabled.current && !disabled) {
      setInput('')
      setCursor(0)
      setHistoryIndex(-1)
      pastedContentRef.current = null
      pasteLineCountRef.current = 0
      badgeLengthRef.current = 0
      setShowPreview(false)
      onInputChange?.('')
    }
    wasDisabled.current = disabled
  }, [disabled, onInputChange])

  // Bracketed paste mode via raw stdin listener
  useEffect(() => {
    if (!process.stdin || typeof process.stdin.prependListener !== 'function') return

    try {
      stdout.write('\x1b[?2004h')
    } catch {}

    const onStdinData = (data: Buffer) => {
      try {
        const str = data.toString()

        if (str.includes(PASTE_START)) {
          isPastingRef.current = true
          setPasting(true)
          const afterStart = str.slice(str.indexOf(PASTE_START) + PASTE_START.length)
          const endIdx = afterStart.indexOf(PASTE_END)
          if (endIdx !== -1) {
            acceptPasteRef.current(afterStart.slice(0, endIdx))
            setPasting(false)
            setTimeout(() => { isPastingRef.current = false }, 0)
          } else {
            pasteBufferRef.current = afterStart
          }
          return
        }

        if (isPastingRef.current) {
          const endIdx = str.indexOf(PASTE_END)
          if (endIdx !== -1) {
            pasteBufferRef.current += str.slice(0, endIdx)
            acceptPasteRef.current(pasteBufferRef.current)
            pasteBufferRef.current = ''
            setPasting(false)
            setTimeout(() => { isPastingRef.current = false }, 0)
          } else {
            pasteBufferRef.current += str
          }
          return
        }
      } catch {}
    }

    process.stdin.prependListener('data', onStdinData)

    return () => {
      try { stdout.write('\x1b[?2004l') } catch {}
      process.stdin.removeListener('data', onStdinData)
    }
  }, [])

  useInput((ch, key) => {
    if (isLoading) return
    if (disabledRef.current) return
    if (isPastingRef.current) return

    // Escape — clear pasted content
    if (key.escape) {
      clearPasteTimeline()
      if (pastedContentRef.current) {
        clearPasteState()
        return
      }
      return
    }

    // Ctrl+P — toggle preview of pasted first 5 lines
    if (key.ctrl && ch === 'p') {
      clearPasteTimeline()
      if (pastedContentRef.current) {
        setShowPreview(prev => !prev)
      }
      return
    }

    // Enter — submit or multi-line continuation
    if (key.return) {
      clearPasteTimeline()
      if (multiLine) {
        const trimmed = input.trim()
        if (MULTI_LINE_DELIMITERS.includes(trimmed) && trimmed === multiLineDelimiter) {
          const fullText = multiLineBuffer.join('\n')
          if (fullText.trim()) submit(fullText)
          setMultiLine(false)
          setMultiLineBuffer([])
          setMultiLineDelimiter('')
        } else {
          setMultiLineBuffer(prev => [...prev, input])
          setInput('')
          setCursor(0)
        }
        return
      }

      // If pasted content exists, send full paste + any extra text
      if (pastedContentRef.current) {
        const extra = input.slice(badgeLengthRef.current).trim()
        const fullText = extra
          ? `${pastedContentRef.current}\n${extra}`
          : pastedContentRef.current
        submit(fullText)
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

      if (trimmed) submit(trimmed)
      return
    }

    // History up
    if (key.upArrow && !multiLine && history.length > 0 && !pastedContentRef.current) {
      clearPasteTimeline()
      const nextIndex = Math.min(historyIndex + 1, history.length - 1)
      setHistoryIndex(nextIndex)
      const entry = history[nextIndex]!
      setInput(entry)
      setCursor(entry.length)
      pastedContentRef.current = null
      badgeLengthRef.current = 0
      onInputChange?.(entry)
      return
    }

    // History down
    if (key.downArrow && !multiLine && !pastedContentRef.current) {
      clearPasteTimeline()
      if (historyIndex <= 0) {
        setHistoryIndex(-1)
        setInput('')
        setCursor(0)
        pastedContentRef.current = null
        badgeLengthRef.current = 0
        onInputChange?.('')
        return
      }
      const nextIndex = historyIndex - 1
      setHistoryIndex(nextIndex)
      const entry = history[nextIndex]!
      setInput(entry)
      setCursor(entry.length)
      pastedContentRef.current = null
      badgeLengthRef.current = 0
      onInputChange?.(entry)
      return
    }

    // Backspace — clear paste if cursor at badge start, otherwise delete normally
    if (key.backspace || key.delete) {
      clearPasteTimeline()
      if (pastedContentRef.current && cursor <= badgeLengthRef.current) {
        clearPasteState()
        return
      }
      if (cursor > 0) {
        const newInput = input.slice(0, cursor - 1) + input.slice(cursor)
        setInput(newInput)
        setCursor(c => c - 1)
        onInputChange?.(newInput)
      }
      return
    }

    // Cursor left — clamp to badge boundary
    if (key.leftArrow) {
      clearPasteTimeline()
      if (pastedContentRef.current) {
        setCursor(c => Math.max(badgeLengthRef.current, c - 1))
      } else {
        setCursor(c => Math.max(0, c - 1))
      }
      return
    }

    // Cursor right
    if (key.rightArrow) {
      clearPasteTimeline()
      setCursor(c => Math.min(input.length, c + 1))
      return
    }

    // Printable characters
    if (ch && !key.ctrl && !key.meta) {
      // Multi-char paste fallback (terminal without bracketed paste)
      if (ch.length > 1) {
        clearPasteTimeline()
        const lines = ch.split('\n')
        const lineCount = lines.length
        const charCount = ch.length
        if (lineCount >= PASTE_MIN_LINES || charCount >= PASTE_MIN_CHARS) {
          pastedContentRef.current = ch
          pasteLineCountRef.current = lineCount
          const badge = `📋 Pasted ${lineCount} line${lineCount !== 1 ? 's' : ''}  [x]`
          badgeLengthRef.current = badge.length
          setShowPreview(false)
          setInput(badge)
          setCursor(badge.length)
          onInputChange?.('')
          onPaste?.(badge, lineCount)
          return
        }
        const newInput = input.slice(0, cursor) + ch + input.slice(cursor)
        setInput(newInput)
        setCursor(c => c + ch.length)
        onInputChange?.(newInput)
        return
      }

      // Single character — add to paste timing timeline
      pasteTimelineRef.current.content += ch
      if (pasteTimelineRef.current.timer) {
        clearTimeout(pasteTimelineRef.current.timer)
      }
      pasteTimelineRef.current.timer = setTimeout(() => {
        const content = pasteTimelineRef.current.content
        pasteTimelineRef.current.content = ''
        if (content.length >= PASTE_MIN_CHARS || content.split('\n').length >= PASTE_MIN_LINES) {
          const lineCount = content.split('\n').length
          pastedContentRef.current = content
          pasteLineCountRef.current = lineCount
          const badge = `📋 Pasted ${lineCount} line${lineCount !== 1 ? 's' : ''}  [x]`
          badgeLengthRef.current = badge.length
          setShowPreview(false)
          setInput(badge)
          setCursor(badge.length)
          onInputChange?.('')
          onPaste?.(badge, lineCount)
        }
      }, 200)

      const newInput = input.slice(0, cursor) + ch + input.slice(cursor)
      setInput(newInput)
      setCursor(c => c + 1)
      onInputChange?.(newInput)
      return
    }
  })

  if (isLoading) return null

  const promptChar = multiLine ? '... ' : '❯ '

  return (
    <Box flexDirection="column">
      {/* Multi-line buffer lines */}
      {multiLine && multiLineBuffer.map((line, i) => (
        <Box key={i}>
          <Text dimColor>{'... '}</Text>
          <Text>{line}</Text>
        </Box>
      ))}

      {/* Paste preview */}
      {showPreview && pastedContentRef.current && (
        <Box flexDirection="column" marginLeft={5} marginBottom={1}>
          {(() => {
            const previewLines = pastedContentRef.current.split('\n').slice(0, PREVIEW_LINES)
            return previewLines.map((line, i) => (
              <Box key={i}>
                <Text dimColor>│ {line || ' '}</Text>
              </Box>
            ))
          })()}
        </Box>
      )}

      {/* Input line */}
      <Box>
        <Text bold color={pasting ? 'yellow' : multiLine ? 'yellow' : 'green'}>
          {pasting ? '[PASTE] ' : promptChar}
        </Text>
        <Text>
          {input.slice(0, cursor)}
          <Text inverse>{input[cursor] || ' '}</Text>
          {input.slice(cursor + 1)}
        </Text>
      </Box>
    </Box>
  )
}
