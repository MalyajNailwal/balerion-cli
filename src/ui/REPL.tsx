import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Box, Text, useInput, useApp, useStdout } from 'ink'
import { Prompt } from './Prompt.js'
import { ModelPicker } from './ModelPicker.js'
import { CommandDropdown } from './CommandDropdown.js'
import { Markdown } from './Markdown.js'
import { useAppState } from './App.js'
import { query } from '../core/query.js'
import { buildSystemPrompt } from '../core/context.js'
import { selectModel } from '../providers/router.js'
import { isSlashCommand, executeCommand } from '../core/commands.js'
import { saveSession } from '../state/sessions.js'
import type { CommandContext } from '../core/commands.js'
import type { SpinnerMode } from '../types.js'
import type { Provider } from '../providers/provider.js'

type DisplayItem =
  | { type: 'user'; text: string }
  | { type: 'assistant-text'; text: string }
  | { type: 'tool-call'; name: string; summary: string }
  | { type: 'tool-result'; name: string; result: string; isError?: boolean }
  | { type: 'system'; text: string }

type Props = {
  provider: Provider
  initialPrompt?: string
}

export function REPL({ provider, initialPrompt }: Props) {
  const { state, setState } = useAppState()
  const { exit } = useApp()
  const { stdout } = useStdout()

  const [displayLog, setDisplayLog] = useState<DisplayItem[]>([])
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [spinnerMode, setSpinnerMode] = useState<SpinnerMode>('idle')
  const [spinnerLabel, setSpinnerLabel] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showCommandDropdown, setShowCommandDropdown] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const readFilesRef = useRef(new Set<string>())
  const abortRef = useRef<AbortController | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesRef = useRef<any[]>([])
  const processedInitialPrompt = useRef(false)
  const disabledRef = useRef(false)

  disabledRef.current = showCommandDropdown || showModelPicker

  const isLoading = spinnerMode !== 'idle'

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
        setSpinnerMode('idle')
        setStreamingText(null)
        setIsProcessing(false)
        setDisplayLog(prev => [...prev, { type: 'system', text: 'Cancelled' }])
      } else {
        exit()
      }
      return
    }
    // ESC key — cancel ongoing request
    if (key.escape && isLoading) {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
        setSpinnerMode('idle')
        setStreamingText(null)
        setIsProcessing(false)
        setDisplayLog(prev => [...prev, { type: 'system', text: 'Cancelled' }])
      }
      return
    }
    if (key.ctrl && ch === 'm' && !isLoading && !disabledRef.current) {
      setShowModelPicker(true)
    }
  })

  const handleSubmit = useCallback(async (userInput: string) => {
    if (isProcessing) return

    setShowCommandDropdown(false)
    setCommandFilter('')

    if (isSlashCommand(userInput)) {
      setHistory(prev => [userInput, ...prev])

      const cmdContext: CommandContext = {
        setModel: (model: string) => {
          setState(prev => ({ ...prev, modelOverride: model, currentModel: model }))
        },
        currentModel: state.currentModel,
        clearMessages: () => { messagesRef.current = [] },
        compactMessages: () => { messagesRef.current = messagesRef.current.slice(-4) },
        openModelPicker: () => { setShowModelPicker(true) },
        cwd: state.cwd,
      }

      const result = executeCommand(userInput, cmdContext)

      if (result === '__QUIT__') { exit(); return }

      if (userInput.trim().startsWith('/clear') || userInput.trim().startsWith('/c ') || userInput.trim() === '/c') {
        setDisplayLog([])
      }

      if (result) {
        setDisplayLog(prev => [...prev, { type: 'system', text: result }])
      }
      return
    }

    setIsProcessing(true)
    setHistory(prev => [userInput, ...prev])
    setDisplayLog(prev => [...prev, { type: 'user', text: userInput }])

    const userMessage = { role: 'user' as const, content: userInput }
    messagesRef.current = [...messagesRef.current, userMessage]

    setSpinnerMode('requesting')
    setSpinnerLabel('Thinking')

    const abortController = new AbortController()
    abortRef.current = abortController

    const model = state.modelOverride || selectModel(messagesRef.current, state.config.router)
    setState(prev => ({ ...prev, currentModel: model }))

    let currentAssistantText = ''

    try {
      const gen = query({
        messages: messagesRef.current,
        model,
        provider,
        cwd: state.cwd,
        systemPrompt: buildSystemPrompt(state.cwd),
        maxTurns: state.config.maxTurns,
        readFiles: readFilesRef.current,
        abortSignal: abortController.signal,
      })

      let result = await gen.next()
      while (!result.done) {
        const event = result.value
        switch (event.type) {
          case 'request_start':
            currentAssistantText = ''
            setStreamingText(null)
            setSpinnerMode('requesting')
            setSpinnerLabel('Thinking')
            break
          case 'text_delta':
            currentAssistantText += event.text
            const visible = currentAssistantText.substring(0, currentAssistantText.lastIndexOf('\n') + 1) || null
            setStreamingText(visible)
            setSpinnerMode('responding')
            setSpinnerLabel('')
            break
          case 'tool_use_start':
            setSpinnerMode('tool-input')
            setSpinnerLabel(`${event.name}`)
            break
          case 'message_complete':
            if (currentAssistantText.trim()) {
              setDisplayLog(prev => [...prev, { type: 'assistant-text', text: currentAssistantText }])
            }
            setStreamingText(null)
            currentAssistantText = ''
            break
          case 'tool_executing':
            setSpinnerMode('tool-use')
            setSpinnerLabel(`${event.name} ${toolSummary(event.name, event.input)}`)
            setDisplayLog(prev => [...prev, {
              type: 'tool-call',
              name: event.name,
              summary: toolSummary(event.name, event.input),
            }])
            break
          case 'tool_result_ready':
            setDisplayLog(prev => [...prev, {
              type: 'tool-result',
              name: event.name,
              result: event.result,
              isError: event.isError,
            }])
            setSpinnerMode('requesting')
            setSpinnerLabel('Thinking')
            break
          case 'error':
            setStreamingText(null)
            if (event.error && event.error !== 'aborted') {
              setDisplayLog(prev => [...prev, { type: 'system', text: `Error: ${event.error}` }])
            }
            break
        }
        result = await gen.next()
      }

      if (result.value) {
        messagesRef.current = result.value.messages
      }
    } catch (err: any) {
      let errorMsg = 'Something went wrong'
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        errorMsg = 'Cancelled'
      } else if (err.message?.includes('API key') || err.message?.includes('auth') || err.message?.includes('401')) {
        errorMsg = 'Invalid API key. Run `balerion setup` to configure.'
      } else if (err.message?.includes('429') || err.message?.includes('rate limit')) {
        errorMsg = 'Rate limited. Please wait a moment and try again.'
      } else if (err.message?.includes('network') || err.message?.includes('fetch') || err.message?.includes('ECONNREFUSED')) {
        errorMsg = 'Network error. Check your internet connection.'
      } else if (err.message?.includes('timeout')) {
        errorMsg = 'Request timed out. The model may be overloaded.'
      } else if (err.message) {
        errorMsg = err.message
      }
      if (errorMsg !== 'Cancelled') {
        setDisplayLog(prev => [...prev, { type: 'system', text: `Error: ${errorMsg}` }])
      }
    } finally {
      setSpinnerMode('idle')
      setSpinnerLabel('')
      setStreamingText(null)
      abortRef.current = null
      setIsProcessing(false)
      if (messagesRef.current.length > 0) {
        saveSession(state.sessionId, messagesRef.current, state.cwd)
      }
    }
  }, [state, provider, isProcessing])

  useEffect(() => {
    if (initialPrompt && !processedInitialPrompt.current) {
      processedInitialPrompt.current = true
      handleSubmit(initialPrompt)
    }
  }, [initialPrompt])

  const handleModelSelect = useCallback((model: string) => {
    setState(prev => ({ ...prev, modelOverride: model, currentModel: model }))
    setShowModelPicker(false)
  }, [])

  const handleCommandSelect = useCallback((cmd: string) => {
    setShowCommandDropdown(false)
    setCommandFilter('')
    handleSubmit(`/${cmd}`)
  }, [handleSubmit])

  const handleInputChange = useCallback((input: string) => {
    if (input.startsWith('/') && input.length >= 1) {
      setShowCommandDropdown(true)
      setCommandFilter(input.slice(1))
    } else {
      setShowCommandDropdown(false)
      setCommandFilter('')
    }
  }, [])

  const handlePaste = useCallback((_preview: string, _lineCount: number) => {
    // paste handled inline in Prompt — no system message needed
  }, [])

  const msgCount = messagesRef.current.length
  const showPicker = showModelPicker || showCommandDropdown

  return (
    <Box flexDirection="column">
      {/* Display log — re-renders so /clear works properly */}
      {displayLog.map((item, i) => (
        <DisplayItemView key={i} item={item} terminalWidth={stdout.columns} />
      ))}

      {/* Streaming text */}
      {streamingText && (
        <Box marginBottom={1}>
          <Markdown text={streamingText} terminalWidth={stdout.columns} />
        </Box>
      )}

      {/* Model picker */}
      {showModelPicker && (
        <ModelPicker
          currentModel={state.currentModel}
          onSelect={handleModelSelect}
          onClose={() => setShowModelPicker(false)}
        />
      )}

      {/* Command dropdown */}
      {showCommandDropdown && !showModelPicker && (
        <CommandDropdown
          filter={commandFilter}
          onSelect={handleCommandSelect}
          onClose={() => { setShowCommandDropdown(false); setCommandFilter('') }}
        />
      )}

      {/* Input prompt */}
      {!isLoading && (
        <Prompt
          onSubmit={handleSubmit}
          isLoading={false}
          history={history}
          onInputChange={handleInputChange}
          onPaste={handlePaste}
          disabled={showPicker}
        />
      )}

      {/* Loading spinner replaces prompt — only one spinner shown */}
      {isLoading && (
        <Box flexDirection="column">
          <SpinnerView mode={spinnerMode} label={spinnerLabel} />
          <Text dimColor>  Press ESC to cancel</Text>
        </Box>
      )}

      {/* Inline status */}
      <Box>
        <Text dimColor>{state.currentModel.split('/').pop() || state.currentModel}</Text>
        <Text dimColor> · {state.cwd.split('/').pop() || state.cwd}</Text>
        {msgCount > 0 && <Text dimColor> · {msgCount} msgs</Text>}
      </Box>
    </Box>
  )
}

// === Display Items ===

function DisplayItemView({ item, terminalWidth }: { item: DisplayItem; terminalWidth: number }) {
  // Leave room for borders (2 chars) + padding (2 chars) + prefix (2 chars)
  const maxTextWidth = Math.max(20, terminalWidth - 6)

  switch (item.type) {
    case 'user': {
      // Wrap text to fit in terminal
      const wrappedText = wrapText(item.text, maxTextWidth)
      return (
        <Box marginBottom={1} borderStyle="round" borderColor="green" width={terminalWidth}>
          <Box paddingLeft={1} paddingRight={1} paddingY={0} flexDirection="column" width="100%">
            {wrappedText.map((line, i) => (
              <Box key={i} width="100%">
                {i === 0 && <Text bold color="green">▸ </Text>}
                {i > 0 && <Text bold color="green">  </Text>}
                <Text bold>{line}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }
    case 'assistant-text':
      return (
        <Box marginBottom={1}>
          <Markdown text={item.text} terminalWidth={terminalWidth} />
        </Box>
      )
    case 'tool-call': {
      const safe = ['Read', 'Glob', 'Grep', 'WebFetch'].includes(item.name)
      return (
        <Box marginLeft={1}>
          <Text color={safe ? 'gray' : 'yellow'} bold>{safe ? '○' : '●'} </Text>
          <Text color="cyan" bold>{item.name} </Text>
          <Text dimColor>{item.summary}</Text>
        </Box>
      )
    }
    case 'tool-result': {
      const lines = item.result.split('\n')
      const preview = lines.length > 10
        ? [...lines.slice(0, 8), `  ... ${lines.length - 8} more lines`].join('\n')
        : item.result
      const short = preview.length > 1000 ? preview.slice(0, 1000) + '...' : preview
      return (
        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          {item.isError ? (
            <Text color="yellow">↻ {item.name} failed — model will retry</Text>
          ) : (
            <Text dimColor>{short}</Text>
          )}
        </Box>
      )
    }
    case 'system':
      return (
        <Box marginBottom={1}>
          <Text dimColor>{item.text}</Text>
        </Box>
      )
  }
}

// === Text Wrapping ===

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text]

  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxWidth) {
      currentLine = currentLine ? currentLine + ' ' + word : word
    } else {
      if (currentLine) lines.push(currentLine)
      // If a single word is longer than maxWidth, break it
      if (word.length > maxWidth) {
        let remaining = word
        while (remaining.length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth))
          remaining = remaining.slice(maxWidth)
        }
        currentLine = remaining
      } else {
        currentLine = word
      }
    }
  }

  if (currentLine) lines.push(currentLine)
  return lines
}

// === Spinner ===

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function SpinnerView({ mode, label }: { mode: SpinnerMode; label: string }) {
  const [frame, setFrame] = React.useState(0)

  React.useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 80)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box>
      <Text color="cyan">{FRAMES[frame]} </Text>
      <Text dimColor>{label || mode}</Text>
    </Box>
  )
}

// === Tool Summary ===

function toolSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash': return String(input.description || input.command || '').slice(0, 80)
    case 'Read': return String(input.file_path || '')
    case 'Write': return String(input.file_path || '')
    case 'Edit': return String(input.file_path || '')
    case 'Glob': return String(input.pattern || '')
    case 'Grep': return `${input.pattern || ''}${input.path ? ` in ${input.path}` : ''}`
    case 'WebFetch': return String(input.url || '')
    default: return ''
  }
}
