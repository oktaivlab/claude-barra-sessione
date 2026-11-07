import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Tokens } from '../types'

// ── Stato della sessione (sopravvive ai ricaricamenti della mod) ──────────────
const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const lastRequestAt = atom({ plugin: 'barra-sessione', key: 'lastRequestAt' } as const, null)
const tokens = atom({ plugin: 'barra-sessione', key: 'tokens' } as const, ZERO)
const handoff = atom({ plugin: 'barra-sessione', key: 'handoff' } as const, 'pronto')

const MIN = 60_000
const HOUR = 60 * MIN

const HANDOFF_PROMPT = [
  'Scrivi un messaggio di passaggio di consegne (handoff) per un nuovo agente che riprenderà',
  'questo lavoro senza vedere questa conversazione. In italiano, conciso, in Markdown, con',
  'queste sezioni: Obiettivo; Stato attuale; Decisioni prese (con il perché); Modifiche fatte',
  'e file chiave (percorsi completi); Processi o server in esecuzione; Come verificare (comandi);',
  'Cose rimandate; Domande aperte; Prossimo passo. Ometti le sezioni vuote. Scrivi solo il',
  'messaggio, rivolto al nuovo agente, senza preamboli.',
].join(' ')

// ── Formattazione in italiano ─────────────────────────────────────────────────
const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const virgola = (s: string) => s.replace('.', ',')

function breve(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return virgola((n / 1000).toFixed(n < 10_000 ? 1 : 0)) + 'k'
  return virgola((n / 1_000_000).toFixed(1)) + 'M'
}

function durata(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${m % 60} min`
  return `${Math.floor(h / 24)} g ${h % 24} h`
}

function contoAllaRovescia(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const percento = (p: number) => virgola(String(Math.round(p * 10) / 10)) + '%'
const dollari = (usd: number) => '$' + virgola(usd.toFixed(2))
const totale = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite

// ── Calcolo del riepilogo ─────────────────────────────────────────────────────
type Colore = 'success' | 'warning' | 'error' | undefined

function ttlCache(limits: readonly SessionRateLimit[]) {
  const isAbbonamento = limits.length > 0
  const isOltre = limits.some(l => l.percentUsed >= 100)
  if (isAbbonamento && !isOltre) return { ms: HOUR, perche: 'abbonamento sotto i limiti' }
  return { ms: 5 * MIN, perche: isAbbonamento ? "oltre il limite dell'abbonamento" : 'chiave API' }
}

async function riepilogo($: EngineInterface) {
  const [usage, now, last, t] = await Promise.all([
    $.session.usage(),
    $.clock.now(),
    read($, lastRequestAt),
    read($, tokens),
  ])

  const ttl = ttlCache(usage.rateLimits)
  const restante = last === null ? null : last + ttl.ms - now
  let cacheColore: Colore
  let cacheBreve: string
  let cacheLunga: string
  if (restante === null) {
    cacheBreve = 'Cache —'
    cacheLunga = 'nessuna richiesta al modello ancora'
  } else if (restante <= 0) {
    cacheColore = 'error'
    cacheBreve = 'Cache scaduta'
    cacheLunga = `scaduta da ${durata(-restante)}`
  } else {
    cacheColore = restante <= ttl.ms * 0.2 ? 'warning' : 'success'
    cacheBreve = `Cache ${contoAllaRovescia(restante)}`
    cacheLunga = `scade tra ${contoAllaRovescia(restante)}`
  }

  const { tokens: usati, window, percent } = usage.context
  const contestoBreve =
    usati === undefined
      ? `Contesto —/${breve(window)}`
      : `Contesto ${breve(usati)}/${breve(window)} (${percent ?? 0}%)`
  const contestoLungo =
    usati === undefined
      ? `nessuna misura ancora, finestra di ${migliaia(window)} token`
      : `${migliaia(usati)} / ${migliaia(window)} token (${percent ?? 0}%)`

  const limite = (kind: string, nome: string) => {
    const l = usage.rateLimits.find(x => x.kind === kind)
    if (!l) return null
    const reset = l.resetsAt ? Date.parse(l.resetsAt) - now : NaN
    const quando = Number.isFinite(reset) ? durata(reset) : null
    return {
      breve: `${nome} ${percento(l.percentUsed)}${quando ? ` · rinnovo ${quando}` : ''}`,
      lungo: `${percento(l.percentUsed)} usato${quando ? `, si rinnova tra ${quando}` : ''}`,
    }
  }
  const cinqueOre = limite('five_hour', '5h')
  const settimana = limite('seven_day', 'Sett.')

  const costo = usage.cost ? dollari(usage.cost.usd) : 'n/d'
  const sessioneBreve = `Sessione ${breve(totale(t))} token · ${costo}`

  return {
    cache: { colore: cacheColore, breve: cacheBreve, lungo: cacheLunga, ttl },
    contesto: { breve: contestoBreve, lungo: contestoLungo },
    cinqueOre,
    settimana,
    sessione: { breve: sessioneBreve, tokens: t, costo },
  }
}

async function testoToken($: EngineInterface): Promise<string> {
  const r = await riepilogo($)
  const t = r.sessione.tokens
  const ttlNome = r.cache.ttl.ms === HOUR ? '1 ora' : '5 minuti'
  return [
    'Riepilogo della sessione',
    '',
    `Cache: ${r.cache.lungo} (durata stimata ${ttlNome}: ${r.cache.ttl.perche})`,
    `Contesto: ${r.contesto.lungo}`,
    `Limite 5 ore: ${r.cinqueOre?.lungo ?? 'nessuna lettura (serve un abbonamento e almeno una risposta)'}`,
    `Limite settimanale: ${r.settimana?.lungo ?? 'nessuna lettura (serve un abbonamento e almeno una risposta)'}`,
    `Token della sessione: ${migliaia(totale(t))}`,
    `  input ${migliaia(t.input)} · output ${migliaia(t.output)} · cache letta ${migliaia(t.cacheRead)} · cache scritta ${migliaia(t.cacheWrite)}`,
    `Costo a prezzi API: ${r.sessione.costo}`,
  ].join('\n')
}

// ── Azioni dei pulsanti ───────────────────────────────────────────────────────
async function eseguiHandoff($: EngineInterface) {
  if ((await read($, handoff)) === 'in-corso') return
  await update($, handoff, () => 'in-corso')
  try {
    const r = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!r.isAnswered) {
      $.ui.toast(`Handoff non riuscito (${r.reason}): la chat non è stata pulita`)
      return
    }
    const bozza = `Riprendi il lavoro da questo handoff della sessione precedente:\n\n${r.text.trim()}\n`
    await $.command.run({ command: 'clear' })
    await $.prompt.fill({ text: bozza, mode: 'replace' })
    $.ui.toast('Handoff pronto: il riassunto è nella casella come bozza')
  } catch (err) {
    $.ui.toast(`Handoff non riuscito: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await update($, handoff, () => 'pronto')
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'token',
      description: 'Riepilogo esteso: cache, contesto, limiti, token e costo della sessione',
    })
    // Il conto alla rovescia della cache si aggiorna ogni secondo.
    $.clock.every(1000, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  // Ogni richiesta al modello del thread principale rinnova la cache.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, lastRequestAt, () => now)
    }
    return yield* next(e)
  })

  // Somma i token di ogni turno, sottoagenti compresi.
  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u) {
      await update($, tokens, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cacheRead: t.cacheRead + u.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
      }))
    }
    return next(e)
  })

  // /clear ricomincia la conversazione: si azzerano cache e contatori.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, lastRequestAt, () => null)
      await update($, tokens, () => ZERO)
    }
    return next(e)
  })

  on('command.run', { command: 'token' }, async $ => ({ text: await testoToken($) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Quello che disegnano le altre mod della fascia (es. next-steps) resta sotto la riga.
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const [r, stadio] = await Promise.all([riepilogo($), read($, handoff)])
    const isWorking = e.props.isWorking
    const sep = <Text dimColor>·</Text>

    // Il testo va a capo nella sua colonna a sinistra; il pulsante resta a destra,
    // fuori dal flusso del testo, così sull'app (dove i pulsanti sono più alti di
    // una riga di testo) non copre le righe sopra e sotto. Il pulsante Replay lo
    // disegna già la mod replay-theater nella sua riga: qui non lo ripetiamo.
    return (
      <Box flexDirection="column" rowGap="sm">
        <Box flexDirection="row" alignItems="center" columnGap={2}>
          <Box flexDirection="row" flexWrap="wrap" columnGap={1} flexGrow={1} flexShrink={1}>
            <Text color={r.cache.colore} dimColor={r.cache.colore === undefined}>
              {r.cache.breve}
            </Text>
            {sep}
            <Text>{r.contesto.breve}</Text>
            {sep}
            <Text>{r.cinqueOre?.breve ?? '5h n/d'}</Text>
            {sep}
            <Text>{r.settimana?.breve ?? 'Sett. n/d'}</Text>
            {sep}
            <Text>{r.sessione.breve}</Text>
          </Box>
          <Box flexShrink={0}>
            <Button
              key="handoff"
              label={stadio === 'in-corso' ? 'Handoff…' : 'Handoff'}
              dimColor={isWorking || stadio === 'in-corso'}
              onPress={() => {
                if (isWorking) {
                  $.ui.toast('Aspetta la fine del turno, poi premi Handoff')
                  return
                }
                $.clock.after(1, () => void eseguiHandoff($))
              }}
            />
          </Box>
        </Box>
        {below}
      </Box>
    )
  })
}
