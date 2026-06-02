import { z } from 'zod'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { ToolDef } from './Tool.js'
import type { ToolResult, ToolContext } from '../types.js'

let rgAvailable: boolean | null = null

export function hasRipgrep(): boolean {
  if (rgAvailable !== null) return rgAvailable
  try {
    const proc = spawn('rg', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    proc.on('error', () => { rgAvailable = false })
    proc.on('close', (code) => { rgAvailable = code === 0 })
    // Synchronous check fallback: just return true optimistically
    // The async check will update for next call
    return true
  } catch {
    rgAvailable = false
    return false
  }
}

const inputSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z.string().optional().describe('File or directory to search in (default: cwd)'),
  glob: z.string().optional().describe('Glob filter for files (e.g. "*.ts")'),
})

type Input = z.infer<typeof inputSchema>

export const GrepTool: ToolDef<typeof inputSchema, string> = {
  name: 'Grep',
  description: 'Search file contents using regex. Uses ripgrep (rg) for speed. Returns matching lines with file paths and line numbers.',
  inputSchema,
  isReadOnly: true,
  isConcurrencySafe: true,

  async call(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const searchPath = input.path ? resolve(context.cwd, input.path) : context.cwd

    const args = [
      '--line-number',
      '--no-heading',
      '--color', 'never',
      '--max-count', '100',
    ]
    if (input.glob) {
      args.push('--glob', input.glob)
    }
    args.push(input.pattern, searchPath)

    return new Promise((resolvePromise) => {
      const proc = spawn('rg', args, {
        cwd: context.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          proc.kill('SIGTERM')
          resolvePromise({ data: 'Search timed out after 30 seconds.', isError: true })
        }
      }, 30000)

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

      proc.on('error', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          rgAvailable = false
          resolvePromise({ data: 'ripgrep (rg) not found. Install it: https://github.com/BurntSushi/ripgrep#installation', isError: true })
        }
      })

      proc.on('close', (code) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        if (code === 0) rgAvailable = true
        if (code === 1) {
          // No matches
          resolvePromise({ data: 'No matches found.' })
        } else if (code === 0) {
          if (stdout.length > 30000) {
            stdout = stdout.slice(0, 30000) + '\n... (truncated)'
          }
          resolvePromise({ data: stdout.trimEnd() })
        } else {
          resolvePromise({ data: stderr || 'Grep failed', isError: true })
        }
      })
    })
  },

  formatResult(output: string): string { return output },
  activityDescription(input) {
    return input.pattern ? `Searching: ${input.pattern}` : 'Searching content'
  },
}
