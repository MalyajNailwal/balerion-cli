import { getTotalCost, formatCostSummary, formatTokenCount } from '../state/costTracker.js'
import { MODEL_PROFILES } from '../config/models.js'

export type CommandContext = {
  setModel: (model: string) => void
  currentModel: string
  clearMessages: () => void
  compactMessages: () => void
  openModelPicker: () => void
  cwd: string
}

export type SlashCommand = {
  name: string
  aliases?: string[]
  description: string
  execute: (args: string, context: CommandContext) => string | null
}

const COMMANDS: SlashCommand[] = [
  {
    name: 'help',
    description: 'List all available commands',
    execute: () => {
      const lines = COMMANDS.map(c => {
        const aliases = c.aliases?.length ? ` (/${c.aliases.join(', /')})` : ''
        return `  /${c.name}${aliases} — ${c.description}`
      })
      return 'Available commands:\n' + lines.join('\n')
    },
  },
  {
    name: 'model',
    aliases: ['m'],
    description: 'Switch model or show all models (free + paid)',
    execute: (args, context) => {
      // No args → open interactive picker
      if (!args.trim()) {
        context.openModelPicker()
        return null
      }

      // Check if user passed a number (index)
      const num = parseInt(args.trim(), 10)
      if (!isNaN(num) && num >= 1 && num <= MODEL_PROFILES.length) {
        const profile = MODEL_PROFILES[num - 1]
        if (profile) {
          context.setModel(profile.id)
          const tag = profile.free ? ' (free)' : ''
          return `Switched to ${profile.id}${tag}`
        }
      }

      // Try matching by ID, partial match, or name
      const modelId = args.trim()
      const profile = MODEL_PROFILES.find(m =>
        m.id === modelId ||
        m.id.endsWith('/' + modelId) ||
        m.name.toLowerCase() === modelId.toLowerCase()
      )
      if (!profile) {
        return `Unknown model: ${modelId}. Type /model to see available models.`
      }
      context.setModel(profile.id)
      const tag = profile.free ? ' (free)' : ''
      return `Switched to ${profile.id}${tag}`
    },
  },
  {
    name: 'clear',
    aliases: ['c'],
    description: 'Clear conversation history',
    execute: (_args, context) => {
      context.clearMessages()
      return null
    },
  },
  {
    name: 'cost',
    description: 'Show session cost breakdown',
    execute: () => {
      return `Session: ${formatCostSummary()} | Tokens: ${formatTokenCount()}`
    },
  },
  {
    name: 'compact',
    description: 'Compact conversation (keep last 4 messages)',
    execute: (_args, context) => {
      context.compactMessages()
      return 'Conversation compacted. Kept last 4 messages.'
    },
  },
  {
    name: 'quit',
    aliases: ['q'],
    description: 'Exit Balerion',
    execute: () => {
      return '__QUIT__'
    },
  },
]

export function isSlashCommand(input: string): boolean {
  return input.startsWith('/') && input.length > 1
}

export function executeCommand(input: string, context: CommandContext): string | null {
  const parts = input.slice(1).split(/\s+/)
  const name = parts[0]?.toLowerCase()
  const args = parts.slice(1).join(' ')

  const cmd = COMMANDS.find(c => c.name === name || c.aliases?.includes(name!))
  if (!cmd) return `Unknown command: /${name}. Type /help for available commands.`
  return cmd.execute(args, context)
}
