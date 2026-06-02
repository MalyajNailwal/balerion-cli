import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Message } from '../types.js'

const SESSIONS_DIR = join(homedir(), '.balerion', 'sessions')
const MAX_SESSIONS = 50

function ensureDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
}

function pruneSessions() {
  try {
    const files = readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: join(SESSIONS_DIR, f),
        mtime: statSync(join(SESSIONS_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => a.mtime - b.mtime)

    while (files.length > MAX_SESSIONS) {
      const oldest = files.shift()!
      try { unlinkSync(oldest.path) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export function saveSession(sessionId: string, messages: Message[], cwd: string) {
  ensureDir()
  const data = { sessionId, cwd, messages, savedAt: new Date().toISOString() }
  writeFileSync(join(SESSIONS_DIR, `${sessionId}.json`), JSON.stringify(data))
  pruneSessions()
}

export function loadLatestSession(cwd: string): { sessionId: string; messages: Message[] } | null {
  ensureDir()
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))

  // Find most recent session for this cwd
  let latest: { sessionId: string; messages: Message[]; savedAt: string } | null = null
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(SESSIONS_DIR, file), 'utf-8'))
      if (data.cwd === cwd && (!latest || data.savedAt > latest.savedAt)) {
        latest = data
      }
    } catch {}
  }

  return latest ? { sessionId: latest.sessionId, messages: latest.messages } : null
}
