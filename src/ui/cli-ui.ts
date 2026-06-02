import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { VERSION } from '../version.js'

// ═══════════════════════════════════════════════════════════
// ASCII Art Banner
// ═══════════════════════════════════════════════════════════

export const BANNER = `
  ▄▄▄▄    ▄▄▄       ██▓    ▓█████  ██▀███   ██▓ ▄▄▄       ███▄    █
  ▓█████▄ ▒████▄    ▓██▒    ▓█   ▀ ▓██ ▒ ██▒▓██▒▒████▄     ██ ▀█   █
  ▒██▒ ▄██▒██  ▀█▄  ▒██░    ▒███   ▓██ ░▄█ ▒▒██▒▒██  ▀█▄  ▓██  ▀█ ██▒
  ▒██░█▀  ░██▄▄▄▄██ ▒██░    ▒▓█  ▄ ▒██▀▀█▄  ░██░░██▄▄▄▄██ ▓██▒  ▐▌██▒
  ░▓█  ▀█▓ ▓█   ▓██▒░██████▒░▒████▒░██▓ ▒██▒░██░ ▓█   ▓██▒▒██░   ▓██░
  ░▒▓███▀▒ ▒▒   ▓▒█░░ ▒░▓  ░░░ ▒░ ░░ ▒▓ ░▒▓░░▓   ▒▒   ▓▒█░░ ▒░   ▒ ▒
  ▒░▒   ░   ▒   ▒▒ ░░ ░ ▒  ░ ░ ░  ░  ░▒ ░ ▒░ ▒ ░  ▒   ▒▒ ░░ ░░   ░ ▒░
   ░    ░   ░   ▒     ░ ░      ░     ░░   ░  ▒ ░  ░   ▒      ░   ░ ░
   ░            ░  ░    ░  ░   ░  ░   ░      ░        ░  ░         ░
        ░
`

export const BANNER_SMALL = `
  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃  ▓▓▓▓  B A L E R I O N  ▓▓▓▓  ┃
  ┃  AI Coding Agent for Terminal  ┃
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
`

// ═══════════════════════════════════════════════════════════
// Colors (chalk-free, ANSI escape codes)
// ═══════════════════════════════════════════════════════════

export const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  italic:  '\x1b[3m',
  underline: '\x1b[4m',

  black:   '\x1b[30m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',

  brightRed:    '\x1b[91m',
  brightGreen:  '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan:   '\x1b[96m',

  bgCyan:    '\x1b[46m',
  bgGreen:   '\x1b[42m',
  bgYellow:  '\x1b[43m',
  bgMagenta: '\x1b[45m',
}

// ═══════════════════════════════════════════════════════════
// Step indicators
// ═══════════════════════════════════════════════════════════

export function stepPending(step: number, label: string): string {
  return `  ${c.gray}${c.bold}${step}.${c.reset} ${c.gray}${label}${c.reset}`
}

export function stepActive(step: number, label: string): string {
  return `  ${c.cyan}${c.bold}${step}.${c.reset} ${c.bold}${label}${c.reset}`
}

export function stepDone(step: number, label: string): string {
  return `  ${c.green}${c.bold}${step}.${c.reset} ${c.green}${label} ✓${c.reset}`
}

export function stepError(step: number, label: string, msg: string): string {
  return `  ${c.red}${c.bold}${step}.${c.reset} ${c.red}${label} ✗ ${msg}${c.reset}`
}

// ═══════════════════════════════════════════════════════════
// Boxes & dividers
// ═══════════════════════════════════════════════════════════

export function divider(char = '─', len = 44): string {
  return `  ${c.gray}${char.repeat(len)}${c.reset}`
}

export function box(lines: string[], borderColor = c.cyan): string {
  const maxLen = Math.max(...lines.map(l => stripAnsi(l).length))
  const top = `${borderColor}╭${'─'.repeat(maxLen + 4)}╮${c.reset}`
  const bot = `${borderColor}╰${'─'.repeat(maxLen + 4)}╯${c.reset}`
  const body = lines.map(l => {
    const pad = maxLen - stripAnsi(l).length
    return `${borderColor}│${c.reset}  ${l}${' '.repeat(pad)}  ${borderColor}│${c.reset}`
  })
  return [top, ...body, bot].join('\n')
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// ═══════════════════════════════════════════════════════════
// Animated spinner (for async steps)
// ═══════════════════════════════════════════════════════════

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class Spinner {
  private frame = 0
  private timer: ReturnType<typeof setInterval> | null = null

  start(label: string) {
    process.stdout.write(`\r  ${c.cyan}${SPINNER_FRAMES[0]} ${c.reset}${c.bold}${label}${c.reset}`)
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length
      process.stdout.write(`\r  ${c.cyan}${SPINNER_FRAMES[this.frame]} ${c.reset}${c.bold}${label}${c.reset}`)
    }, 80)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    process.stdout.write('\r' + ' '.repeat(60) + '\r')
  }

  success(label: string) {
    this.stop()
    console.log(`  ${c.green}${c.bold}✓ ${c.reset}${c.bold}${label}${c.reset}`)
  }

  error(label: string) {
    this.stop()
    console.log(`  ${c.red}${c.bold}✗ ${c.reset}${c.bold}${label}${c.reset}`)
  }
}

// ═══════════════════════════════════════════════════════════
// Welcome screen
// ═══════════════════════════════════════════════════════════

export function printWelcome() {
  console.log('')
  console.log(BANNER)
  console.log(`  ${c.gray}v${VERSION} — ${c.bold}BALERION${c.reset}`)
  console.log('')
}

export function printQuickInfo(model: string) {
  const freeModels = ['kimi-k2.6', 'deepseek-chat', 'deepseek-r1']
  const isFree = freeModels.some(f => model.includes(f))

  console.log(`  ${c.gray}Model:${c.reset}  ${c.bold}${model}${c.reset}${isFree ? ` ${c.green}(free)${c.reset}` : ''}`)
  console.log(`  ${c.gray}Dir:${c.reset}   ${process.cwd()}`)
  console.log(`  ${c.gray}Help:${c.reset}  Type ${c.bold}/help${c.reset} for commands`)
  console.log('')
  console.log(divider('─', 44))
  console.log('')
}
