import type { Message, StreamEvent, ToolContext, ToolUseContent } from '../types.js'
import type { Provider } from '../providers/provider.js'
import { getTool, toAPITools } from '../tools/registry.js'
import { addUsage } from '../state/costTracker.js'
import { debug } from '../utils/logger.js'
import { shouldCompact, compactMessages } from './conversation.js'
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export type QueryParams = {
  messages: Message[]
  model: string
  provider: Provider
  cwd: string
  systemPrompt: string
  maxTurns?: number
  readFiles: Set<string>
  abortSignal?: AbortSignal
  approveTool?: (tool: ToolUseContent) => Promise<boolean>
}

export type QueryResult = {
  reason: 'completed' | 'max_turns' | 'error' | 'aborted'
  messages: Message[]
}

function isOutsideWorkspace(block: ToolUseContent, cwd: string): boolean {
  if (!['Read', 'Glob', 'Grep'].includes(block.name)) return false
  const paths = block.name === 'Read'
    ? [block.input.file_path]
    : [block.input.path, block.name === 'Glob' ? block.input.pattern : undefined]
  let root: string
  try { root = realpathSync(cwd) } catch { root = resolve(cwd) }
  return paths.some(path => {
    if (typeof path !== 'string') return false
    const requested = resolve(cwd, path)
    let actual: string
    try { actual = realpathSync(requested) } catch { actual = requested }
    const fromRoot = relative(root, actual)
    return fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)
  })
}

export async function* query(params: QueryParams): AsyncGenerator<StreamEvent, QueryResult> {
  const { provider, systemPrompt, maxTurns = 50 } = params
  let messages = [...params.messages]
  let turnCount = 0
  const tools = toAPITools()

  const toolContext: ToolContext = {
    cwd: params.cwd,
    readFiles: params.readFiles,
    abortSignal: params.abortSignal,
  }

  // Prepend system message
  const systemMessage: Message = { role: 'system', content: systemPrompt }

  while (true) {
    turnCount++
    if (turnCount > maxTurns) {
      return { reason: 'max_turns', messages }
    }

    if (shouldCompact(messages)) {
      messages = compactMessages(messages)
      debug('Context compacted')
    }

    if (params.abortSignal?.aborted) {
      return { reason: 'aborted', messages }
    }

    // Stream from provider
    const allMessages = [systemMessage, ...messages]
    const toolUseBlocks: ToolUseContent[] = []
    let assistantMessage: Message | null = null

    try {
      for await (const event of provider.stream(allMessages, params.model, tools, params.abortSignal)) {
        if (params.abortSignal?.aborted) return { reason: 'aborted', messages }
        yield event

        if (event.type === 'tool_use_end') {
          toolUseBlocks.push({
            type: 'tool_use',
            id: event.id,
            name: event.name,
            input: event.input,
          })
        }

        if (event.type === 'message_complete') {
          assistantMessage = event.message
          addUsage(params.model, event.usage)
        }

        if (event.type === 'error') {
          return { reason: event.error === 'aborted' ? 'aborted' : 'error', messages }
        }
      }
    } catch (err) {
      if (params.abortSignal?.aborted) return { reason: 'aborted', messages }
      yield { type: 'error', error: `Provider error: ${err instanceof Error ? err.message : String(err)}` }
      return { reason: 'error', messages }
    }

    if (params.abortSignal?.aborted) return { reason: 'aborted', messages }
    if (!assistantMessage) {
      return { reason: 'error', messages }
    }

    messages.push(assistantMessage)

    // No tool calls — conversation complete
    if (toolUseBlocks.length === 0) {
      return { reason: 'completed', messages }
    }

    // Execute tools
    debug(`Executing ${toolUseBlocks.length} tool(s)`)

    async function executeTool(block: ToolUseContent): Promise<{ block: ToolUseContent; result: string; isError?: boolean }> {
      if (params.abortSignal?.aborted) return { block, result: 'Cancelled', isError: true }
      const tool = getTool(block.name)
      if (!tool) {
        return { block, result: `Unknown tool: ${block.name}`, isError: true }
      }
      // Validate input with Zod schema
      const parsed = tool.inputSchema.safeParse(block.input)
      if (!parsed.success) {
        const errors = parsed.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ')
        return { block, result: `Invalid input: ${errors}`, isError: true }
      }
      try {
        if ((!tool.isReadOnly || block.name === 'WebFetch' || isOutsideWorkspace(block, params.cwd)) && params.approveTool) {
          const approved = await params.approveTool(block)
          if (params.abortSignal?.aborted) return { block, result: 'Cancelled', isError: true }
          if (!approved) return { block, result: 'Tool execution denied by user', isError: true }
        }
        if (params.abortSignal?.aborted) return { block, result: 'Cancelled', isError: true }
        const result = await tool.call(parsed.data, toolContext)
        return { block, result: tool.formatResult(result.data), isError: result.isError }
      } catch (err: any) {
        return { block, result: `Tool error: ${err.message}`, isError: true }
      }
    }

    // Execute all tools and yield live events
    for (let index = 0; index < toolUseBlocks.length; index++) {
      const block = toolUseBlocks[index]!
      if (params.abortSignal?.aborted) {
        for (const pending of toolUseBlocks.slice(index)) {
          messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: pending.id, content: 'Cancelled', is_error: true }] })
        }
        return { reason: 'aborted', messages }
      }
      // Tell the REPL which tool is running
      yield { type: 'tool_executing', name: block.name, input: block.input } as StreamEvent

      const { result, isError } = await executeTool(block)

      // Tell the REPL the result
      yield { type: 'tool_result_ready', name: block.name, result, isError } as StreamEvent

      // Add to message history for the model
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
          is_error: isError,
        }],
      })
    }

    // Loop continues — model will see tool results
  }
}
