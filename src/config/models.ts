import type { ModelProfile } from '../types.js'

export const MODEL_PROFILES: ModelProfile[] = [
  // === Free models ===
  {
    id: 'moonshotai/kimi-k2.6:free',
    name: 'Kimi K2.6',
    strengths: ['coding', 'reasoning', 'free'],
    contextWindow: 128000,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    free: true,
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free',
    strengths: ['coding', 'fast', 'free'],
    contextWindow: 128000,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    free: true,
  },

  // === Paid models (sorted by cost, cheapest first) ===
  {
    id: 'qwen/qwen3-coder',
    name: 'Qwen3 Coder',
    strengths: ['coding', 'fast', 'reasoning'],
    contextWindow: 256000,
    costPer1kInput: 0.00016,
    costPer1kOutput: 0.0007,
    free: false,
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    strengths: ['coding', 'fast'],
    contextWindow: 128000,
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00028,
    free: false,
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    strengths: ['coding', 'reasoning'],
    contextWindow: 128000,
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.0022,
    free: false,
  },
  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    strengths: ['coding', 'fast'],
    contextWindow: 1000000,
    costPer1kInput: 0.0005,
    costPer1kOutput: 0.0005,
    free: false,
  },
  {
    id: 'x-ai/grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    strengths: ['coding', 'fast', 'reasoning'],
    contextWindow: 131072,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    free: false,
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    strengths: ['coding', 'reasoning', 'fast'],
    contextWindow: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    free: false,
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    strengths: ['coding', 'reasoning', 'vision'],
    contextWindow: 1000000,
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.01,
    free: false,
  },
]

export function getModelProfile(modelId: string): ModelProfile | undefined {
  return MODEL_PROFILES.find(m => m.id === modelId)
}

export function getFreeModels(): ModelProfile[] {
  return MODEL_PROFILES.filter(m => m.free)
}

export function getPaidModels(): ModelProfile[] {
  return MODEL_PROFILES.filter(m => !m.free)
}
