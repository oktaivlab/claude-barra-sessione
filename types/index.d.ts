export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type HandoffStage = 'pronto' | 'in-corso'

declare module 'claude-code' {
  interface PluginState {
    'barra-sessione': {
      lastRequestAt: number | null
      tokens: Tokens
      handoff: HandoffStage
    }
  }
}
