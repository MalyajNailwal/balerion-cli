const DEBUG = process.env.BALERION_DEBUG === '1'

export function debug(...args: unknown[]) {
  if (DEBUG) {
    process.stderr.write(`[balerion] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`)
  }
}
