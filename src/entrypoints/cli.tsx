// Fast paths — no heavy imports
import { VERSION } from '../version.js'

const args = process.argv.slice(2)

if (args.includes('--version') || args.includes('-v')) {
  console.log(VERSION)
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  balerion — AI Coding Agent

  Usage:
    balerion                         Interactive REPL
    balerion "fix the login bug"     Start with a prompt
    balerion --model <id>            Override model
    balerion setup                   Set up API key (interactive)
    balerion login                   Alias for setup
    balerion logout                  Remove saved credentials
    balerion --resume, -r            Resume last session
    balerion --version               Print version
    balerion --help                  Show this help

  Hotkeys:
    Ctrl+M                          Switch model
    Ctrl+C                          Cancel / Exit
`)
  process.exit(0)
}

// Auth commands — handle before loading heavy deps
if (args[0] === 'setup' || args[0] === 'login') {
  setupFlow().then(() => process.exit(0)).catch(err => {
    console.error(err.message)
    process.exit(1)
  })
} else if (args[0] === 'logout') {
  logoutFlow().catch(err => { console.error(err.message); process.exit(1) })
} else {
  // Parse --model flag
  let modelOverride: string | undefined
  const modelIndex = args.indexOf('--model')
  if (modelIndex !== -1 && args[modelIndex + 1]) {
    modelOverride = args[modelIndex + 1]
    args.splice(modelIndex, 2)
  }

  const resumeSession = args.includes('--resume') || args.includes('-r')
  if (resumeSession) {
    const idx = args.indexOf('--resume')
    if (idx !== -1) args.splice(idx, 1)
    const idx2 = args.indexOf('-r')
    if (idx2 !== -1) args.splice(idx2, 1)
  }

  const initialPrompt = args.join(' ').trim() || undefined
  main(modelOverride, initialPrompt, resumeSession).catch(err => {
    console.error('Fatal error:', err.message)
    process.exit(1)
  })
}

// ═══════════════════════════════════════════════════════════
// Provider definitions
// ═══════════════════════════════════════════════════════════

type ProviderInfo = {
  id: string
  name: string
  description: string
  getKeyUrl: string
  apiBase: string
  validateKey: (key: string) => Promise<boolean>
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access GPT-4o, Claude, Gemini, DeepSeek, Llama & more',
    getKeyUrl: 'https://openrouter.ai/settings/keys',
    apiBase: 'https://openrouter.ai/api',
    validateKey: async (key: string) => {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        })
        return res.ok
      } catch {
        return false
      }
    },
  },
]

// ═══════════════════════════════════════════════════════════
// Setup Flow (balerion setup)
// ═══════════════════════════════════════════════════════════

async function setupFlow() {
  const { createInterface } = await import('node:readline')
  const { writeFileSync, existsSync, readFileSync, mkdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')
  const { exec } = await import('node:child_process')
  const { printWelcome, c, divider, box, Spinner, stepActive, stepDone } = await import('../ui/cli-ui.js')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r))

  printWelcome()

  // Check if already configured
  const rcPath = join(homedir(), '.balerionrc')
  if (existsSync(rcPath)) {
    try {
      const existing = JSON.parse(readFileSync(rcPath, 'utf-8'))
      if (existing.apiKey) {
        console.log(box([
          `${c.green}Balerion is already configured${c.reset}`,
          `Provider: ${existing.provider || 'openrouter'}`,
        ], c.yellow))
        console.log('')
        const answer = await ask(`  Reconfigure? ${c.bold}(y/N)${c.reset}: `)
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log(`\n  ${c.green}Keeping existing config. Run ${c.bold}balerion${c.reset}${c.green} to start.${c.reset}\n`)
          rl.close()
          return
        }
        console.log('')
      }
    } catch {}
  }

  // Step 1: Choose provider
  console.log(stepActive(1, 'Choose your provider'))
  console.log('')
  console.log(`     ${c.cyan}1)${c.reset} ${c.bold}OpenRouter${c.reset}  ${c.gray}— ${PROVIDERS[0].description}${c.reset}`)
  console.log(`     ${c.gray}(more providers coming soon)${c.reset}`)
  console.log('')

  const choice = await ask(`     ${c.bold}Select [1]${c.reset}: `)
  const provider = PROVIDERS[0]! // Always OpenRouter for now

  console.log('')
  console.log(stepDone(1, `Provider: ${provider.name}`))
  console.log('')

  // Step 2: Open browser
  console.log(stepActive(2, 'Getting your API key'))
  console.log('')
  console.log(`     ${c.gray}Opening${c.reset} ${c.bold}${provider.getKeyUrl}${c.reset}`)
  console.log('')

  const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  exec(`${openCmd} "${provider.getKeyUrl}"`)

  // Animated wait while browser opens
  const spinner = new Spinner()
  spinner.start('Waiting for browser...')
  await new Promise(r => setTimeout(r, 2000))
  spinner.success('Browser opened')

  console.log('')
  console.log(box([
    `${c.bold}Steps:${c.reset}`,
    ``,
    `  ${c.cyan}1.${c.reset} Create account on OpenRouter ${c.gray}(if needed)${c.reset}`,
    `  ${c.cyan}2.${c.reset} Go to ${c.bold}Settings → Keys${c.reset}`,
    `  ${c.cyan}3.${c.reset} Create a new API key`,
    `  ${c.cyan}4.${c.reset} Copy the key`,
  ], c.cyan))
  console.log('')

  // Step 3: Paste API key
  console.log(stepActive(3, 'Enter your API key'))
  console.log('')

  let apiKey = ''
  while (!apiKey) {
    const input = await ask(`     ${c.bold}sk-or-v1-...${c.reset} `)
    apiKey = input.trim()

    if (!apiKey) {
      console.log(`     ${c.red}Key cannot be empty. Ctrl+C to cancel.${c.reset}\n`)
      continue
    }

    // Validate
    const vs = new Spinner()
    vs.start('Validating key...')
    const valid = await provider.validateKey(apiKey)
    if (!valid) {
      vs.error('Invalid API key — please try again')
      console.log('')
      apiKey = ''
      continue
    }
    vs.success('Key validated')
  }

  console.log('')

  // Step 4: Save
  console.log(stepActive(4, 'Saving configuration'))
  console.log('')

  let existing: Record<string, unknown> = {}
  try {
    if (existsSync(rcPath)) {
      existing = JSON.parse(readFileSync(rcPath, 'utf-8'))
    }
  } catch {}

  existing.apiKey = apiKey
  existing.apiBase = provider.apiBase
  existing.provider = provider.id

  const balerionDir = join(homedir(), '.balerion')
  if (!existsSync(balerionDir)) mkdirSync(balerionDir, { recursive: true })

  writeFileSync(rcPath, JSON.stringify(existing, null, 2) + '\n')

  console.log(stepDone(4, 'Saved to ~/.balerionrc'))
  console.log('')

  // Done!
  console.log(divider('═', 44))
  console.log('')
  console.log(box([
    `${c.green}${c.bold}  B A L E R I O N   A C T I V A T E D${c.reset}`,
    ``,
    `  Provider: ${c.bold}${provider.name}${c.reset}`,
    `  Config:   ${c.gray}~/.balerionrc${c.reset}`,
    ``,
    `  Run ${c.bold}balerion${c.reset} to start coding.`,
  ], c.green))
  console.log('')

  rl.close()
}

// ═══════════════════════════════════════════════════════════
// Logout
// ═══════════════════════════════════════════════════════════

async function logoutFlow() {
  const { existsSync, unlinkSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')
  const { printWelcome, c, box } = await import('../ui/cli-ui.js')

  printWelcome()

  const rcPath = join(homedir(), '.balerionrc')
  if (existsSync(rcPath)) {
    unlinkSync(rcPath)
    console.log(box([
      `${c.red}${c.bold}Logged out${c.reset}`,
      ``,
      `  Config removed: ${c.gray}~/.balerionrc${c.reset}`,
      `  Run ${c.bold}balerion setup${c.reset} to reconfigure.`,
    ], c.yellow))
    console.log('')
  } else {
    console.log(`  ${c.yellow}Not configured. Run ${c.bold}balerion setup${c.reset}${c.yellow} to get started.${c.reset}\n`)
  }
  process.exit(0)
}

// ═══════════════════════════════════════════════════════════
// Auto-setup: runs when no API key found on launch
// ═══════════════════════════════════════════════════════════

async function autoSetup(): Promise<boolean> {
  const { createInterface } = await import('node:readline')
  const { writeFileSync, existsSync, readFileSync, mkdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')
  const { exec } = await import('node:child_process')
  const { printWelcome, c, divider, box, Spinner, stepActive, stepDone } = await import('../ui/cli-ui.js')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r))

  printWelcome()

  console.log(`  ${c.yellow}${c.bold}No API key found.${c.reset} Let's set things up.\n`)
  console.log(divider())
  console.log('')

  const provider = PROVIDERS[0]!

  // Step 1: Open browser
  console.log(stepActive(1, `Opening ${provider.name}`))
  console.log('')

  const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  exec(`${openCmd} "${provider.getKeyUrl}"`)

  const spinner = new Spinner()
  spinner.start('Launching browser...')
  await new Promise(r => setTimeout(r, 2000))
  spinner.success(`Opened ${provider.getKeyUrl}`)
  console.log('')

  console.log(box([
    `${c.bold}Steps:${c.reset}`,
    ``,
    `  ${c.cyan}1.${c.reset} Create account on OpenRouter ${c.gray}(if needed)${c.reset}`,
    `  ${c.cyan}2.${c.reset} Go to ${c.bold}Settings → Keys${c.reset}`,
    `  ${c.cyan}3.${c.reset} Create a new API key`,
    `  ${c.cyan}4.${c.reset} Copy the key`,
  ], c.cyan))
  console.log('')

  // Step 2: Paste key
  console.log(stepActive(2, 'Paste your API key'))
  console.log('')

  let apiKey = ''
  while (!apiKey) {
    const input = await ask(`     ${c.bold}sk-or-v1-...${c.reset} `)
    apiKey = input.trim()

    if (!apiKey) {
      console.log(`     ${c.red}Key cannot be empty. Ctrl+C to cancel.${c.reset}\n`)
      continue
    }

    const vs = new Spinner()
    vs.start('Validating...')
    const valid = await provider.validateKey(apiKey)
    if (!valid) {
      vs.error('Invalid API key — try again')
      console.log('')
      apiKey = ''
      continue
    }
    vs.success('Key valid')
  }

  console.log('')

  // Step 3: Save & activate
  console.log(stepActive(3, 'Activating Balerion'))
  console.log('')

  const rcPath = join(homedir(), '.balerionrc')
  let existing: Record<string, unknown> = {}
  try {
    if (existsSync(rcPath)) {
      existing = JSON.parse(readFileSync(rcPath, 'utf-8'))
    }
  } catch {}

  existing.apiKey = apiKey
  existing.apiBase = provider.apiBase
  existing.provider = provider.id

  const balerionDir = join(homedir(), '.balerion')
  if (!existsSync(balerionDir)) mkdirSync(balerionDir, { recursive: true })

  writeFileSync(rcPath, JSON.stringify(existing, null, 2) + '\n')

  console.log(stepDone(3, 'Configuration saved'))
  console.log('')
  console.log(divider('═', 44))
  console.log('')

  const activationBox = box([
    `  ${c.green}${c.bold}  B A L E R I O N   A C T I V A T E D${c.reset}`,
    ``,
    `  Provider: ${c.bold}${provider.name}${c.reset}`,
    `  Config:   ${c.gray}~/.balerionrc${c.reset}`,
  ], c.green)
  console.log(activationBox)
  console.log('')

  rl.close()
  return true
}

// ═══════════════════════════════════════════════════════════
// Main REPL
// ═══════════════════════════════════════════════════════════

async function main(modelOverride?: string, initialPrompt?: string, resumeSession?: boolean) {
  const { loadConfig } = await import('../config/config.js')
  const { printWelcome, printQuickInfo } = await import('../ui/cli-ui.js')
  const { Spinner } = await import('../ui/cli-ui.js')

  // Loading config
  const loadSpinner = new Spinner()
  loadSpinner.start('Loading config...')
  let config = loadConfig()

  // No API key → auto setup
  if (!config.apiKey) {
    loadSpinner.stop()
    const success = await autoSetup()
    if (!success) {
      console.log('\n  Setup cancelled. Run `balerion setup` when ready.\n')
      process.exit(1)
    }
    // Reload config after setup
    config = loadConfig()
  }

  loadSpinner.success('Config loaded')

  // Loading tools
  const toolSpinner = new Spinner()
  toolSpinner.start('Loading tools...')
  const { registerAllTools } = await import('../tools/index.js')
  registerAllTools()
  toolSpinner.success('7 tools ready')

  // Loading model
  const modelSpinner = new Spinner()
  modelSpinner.start('Connecting to provider...')
  const { OpenRouterProvider } = await import('../providers/openrouter.js')
  const provider = new OpenRouterProvider(config.apiKey, config.apiBase || undefined)
  modelSpinner.success('Connected')

  const { render } = await import('ink')
  const React = await import('react')
  const { App } = await import('../ui/App.js')
  const { REPL } = await import('../ui/REPL.js')
  const { randomUUID } = await import('node:crypto')
  const { saveSession, loadLatestSession } = await import('../state/sessions.js')

  let restoredMessages: any[] = []
  let sessionId: string = randomUUID()

  if (resumeSession) {
    const restored = loadLatestSession(process.cwd())
    if (restored) {
      restoredMessages = restored.messages
      sessionId = restored.sessionId
    }
  }

  const initialState = {
    config,
    messages: restoredMessages,
    streamingText: null,
    spinnerMode: 'idle' as const,
    currentModel: modelOverride || config.router.default,
    sessionId,
    cwd: process.cwd(),
    readFiles: new Set<string>(),
    modelOverride: modelOverride || null,
  }

  const { saveCosts } = await import('../state/costTracker.js')
  const { getTotalCost, formatCostSummary } = await import('../state/costTracker.js')

  process.on('exit', () => {
    const cost = getTotalCost()
    if (cost > 0) {
      process.stdout.write(`\n${formatCostSummary()}\n`)
    }
    saveCosts(initialState.sessionId)
  })

  // Print welcome banner
  printWelcome()
  printQuickInfo(initialState.currentModel)

  if (resumeSession && restoredMessages.length > 0) {
    console.log(`  Resumed session ${sessionId.slice(0, 8)} (${restoredMessages.length} messages)\n`)
  }

  const { waitUntilExit } = render(
    React.createElement(App, { initialState, children: React.createElement(REPL, { provider, initialPrompt }) })
  )

  await waitUntilExit()
}
