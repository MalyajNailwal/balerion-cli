import type { Message } from '../types.js'
import { estimateMessagesTokens } from '../utils/tokens.js'

const MAX_CONTEXT_TOKENS = 100000
const MAX_SUMMARY_CHARS = 12000

export function shouldCompact(messages: Message[]): boolean {
  return estimateMessagesTokens(messages) > MAX_CONTEXT_TOKENS
}

function isUserPrompt(message: Message | undefined): boolean {
  return message?.role === 'user' && typeof message.content === 'string'
}

function describeMessage(message: Message): string {
  if (typeof message.content === 'string') {
    return `${message.role}: ${message.content.slice(0, 600)}`
  }
  const parts = message.content.map(block => {
    if (block.type === 'text') return block.text.slice(0, 400)
    if (block.type === 'tool_use') return `called ${block.name} ${JSON.stringify(block.input).slice(0, 300)}`
    return `tool result${block.is_error ? ' (error)' : ''}: ${block.content.slice(0, 250)}`
  })
  return `${message.role}: ${parts.join(' | ')}`
}

export function compactMessages(messages: Message[], recentCount = 6): Message[] {
  if (messages.length < 3) return messages

  // Keep complete recent turns so a tool result never loses its assistant call.
  let recentStart = Math.max(1, messages.length - recentCount)
  while (recentStart > 1 && !isUserPrompt(messages[recentStart])) recentStart--
  if (!isUserPrompt(messages[recentStart])) return messages

  const middle = messages.slice(1, recentStart)
  if (middle.length === 0) return messages

  const extracts: string[] = []
  let remaining = MAX_SUMMARY_CHARS
  for (let index = middle.length - 1; index >= 0 && remaining > 0; index--) {
    const line = describeMessage(middle[index]!)
    const kept = line.slice(0, remaining)
    extracts.unshift(kept)
    remaining -= kept.length + 1
  }

  const summary: Message = {
    role: 'user',
    content: `[Earlier conversation, condensed from ${middle.length} messages:\n${extracts.join('\n')}\n]`,
  }
  return [messages[0]!, summary, ...messages.slice(recentStart)]
}
