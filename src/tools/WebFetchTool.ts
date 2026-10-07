import { z } from 'zod'
import type { ToolDef } from './Tool.js'
import type { ToolResult, ToolContext } from '../types.js'
import { VERSION } from '../version.js'

const inputSchema = z.object({
  url: z.string().describe('URL to fetch'),
  headers: z.record(z.string(), z.string()).optional().describe('Optional HTTP headers'),
})

type Input = z.infer<typeof inputSchema>
type Output = { status: number; body: string; headers: Record<string, string> }

export const WebFetchTool: ToolDef<typeof inputSchema, Output> = {
  name: 'WebFetch',
  description: 'Fetch a URL and return the response body. Useful for reading documentation or API responses.',
  inputSchema,
  isReadOnly: true,
  isConcurrencySafe: true,

  async call(input: Input, context: ToolContext): Promise<ToolResult<Output>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const onAbort = () => controller.abort()
    context.abortSignal?.addEventListener('abort', onAbort, { once: true })
    if (context.abortSignal?.aborted) onAbort()
    try {
      const res = await fetch(input.url, {
        headers: {
          'User-Agent': `Balerion/${VERSION}`,
          ...(input.headers ?? {}),
        },
        signal: controller.signal,
      })

      let body = await res.text()
      if (body.length > 50000) {
        body = body.slice(0, 50000) + '\n... (truncated)'
      }

      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((v, k) => { responseHeaders[k] = v })

      return {
        data: { status: res.status, body, headers: responseHeaders },
        isError: !res.ok,
      }
    } catch (err: any) {
      return {
        data: { status: 0, body: `Fetch error: ${err.message}`, headers: {} },
        isError: true,
      }
    } finally {
      clearTimeout(timeout)
      context.abortSignal?.removeEventListener('abort', onAbort)
    }
  },

  formatResult(output: Output): string {
    return `Status: ${output.status}\n\n${output.body}`
  },

  activityDescription(input) {
    return input.url ? `Fetching ${input.url}` : 'Fetching URL'
  },
}
