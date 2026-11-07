import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ADESSO = Date.parse('2026-11-07T12:00:00Z')

const BAND = {
  plugin: 'barra-sessione',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 160,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const USO = {
  startedAt: ADESSO - 3_600_000,
  context: { tokens: 84_210, window: 200_000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-11-07T14:10:00Z' },
    { kind: 'seven_day', percentUsed: 61.5, resetsAt: '2026-11-10T16:00:00Z' },
  ],
  cost: { usd: 3.456 },
}

// Sta al posto di quello che disegnano sotto la riga l'engine e le altre mod (es. next-steps).
const SOTTO = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>next: suggerimenti</Text>
  })

test('la riga mostra cache, contesto, limiti e costo, e lascia vedere ciò che sta sotto', async ($, on) => {
  SOTTO(on)
  on('session.usage', () => ({ value: USO }))
  on('clock.now', () => ({ value: ADESSO }))
  on('state.get', { key: 'lastRequestAt' }, () => ({
    value: { value: ADESSO - 10 * 60_000, version: 1 },
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^Cache/ }))?.text).toBe('Cache 50:00')
    expect((await ui.find({ type: 'Text', text: /^Contesto/ }))?.text).toBe('Contesto 84k/200k (42%)')
    expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toBe('5h 23% · rinnovo 2 h 10 min')
    expect((await ui.find({ type: 'Text', text: /^Sett/ }))?.text).toBe('Sett. 61,5% · rinnovo 3 g 4 h')
    expect((await ui.find({ type: 'Text', text: /^Sessione/ }))?.text).toBe('Sessione 0 token · $3,46')
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    expect(await ui.find({ key: 'replay' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^next:/ })).toBeDefined()
    await ui.unmount()
  }
})

test('in una finestra stretta le voci passano alla forma corta e il pulsante resta', async ($, on) => {
  SOTTO(on)
  on('session.usage', () => ({ value: USO }))
  on('clock.now', () => ({ value: ADESSO }))
  on('state.get', { key: 'lastRequestAt' }, () => ({
    value: { value: ADESSO - 10 * 60_000, version: 1 },
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, bodyColumns: 34 } })
    expect((await ui.find({ type: 'Text', text: /^Cache/ }))?.text).toBe('Cache 50:00')
    expect((await ui.find({ type: 'Text', text: /^Contesto/ }))?.text).toBe('Contesto 42%')
    expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toBe('5h 23% (2h10)')
    expect((await ui.find({ type: 'Text', text: /^Sett/ }))?.text).toBe('Sett. 61,5% (3g4h)')
    expect((await ui.find({ type: 'Text', text: /tok · / }))?.text).toBe('0 tok · $3,46')
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^next:/ })).toBeDefined()
    await ui.unmount()
  }
})

test('con la chiave API la cache dura 5 minuti e diventa rossa', async ($, on) => {
  SOTTO(on)
  on('session.usage', () => ({ value: { ...USO, rateLimits: [] } }))
  on('clock.now', () => ({ value: ADESSO }))
  on('state.get', { key: 'lastRequestAt' }, () => ({
    value: { value: ADESSO - 6 * 60_000, version: 1 },
  }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Cache/ }))?.text).toBe('Cache scaduta')
  expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toBe('5h n/d')
  await ui.unmount()
})
