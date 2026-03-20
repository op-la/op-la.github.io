import { useEffect, useMemo, useRef, useState } from 'react'
import { getVerdict, type Verdict } from './lib/gemini'

type Scenario = {
  id: string
  description: string
}

type LogItem =
  | { id: string; role: 'system'; text: string }
  | { id: string; role: 'user'; text: string }
  | {
      id: string
      role: 'judge'
      verdict: Verdict
      analysis: string
      tension: number
    }

type GameState = {
  scenario: Scenario
  tension: number
  messages: LogItem[]
}

const STARTING_SCENARIOS: Scenario[] = [
  {
    id: 'littering',
    description:
      'You are caught littering outside a convenience store. The clerk looks ready to escalate and someone nearby is filming.',
  },
  {
    id: 'harassment-accused',
    description:
      'You are accused of harassment after a tense exchange. A bystander calls out your behavior and others are starting to gather.',
  },
  {
    id: 'cornered-gang',
    description:
      'You are cornered by a gang in a dim parking lot. They think you disrespected them and are moving closer.',
  },
  {
    id: 'contract-legal',
    description:
      'You realize you may have violated a simple community rule while trying to solve an urgent problem. The staff demand an explanation on the spot.',
  },
]

function pickRandomScenario(): Scenario {
  return STARTING_SCENARIOS[Math.floor(Math.random() * STARTING_SCENARIOS.length)]
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Math.random()).slice(2)
}

function tensionColorClass(tension: number) {
  if (tension < 34) return 'bg-emerald-400'
  if (tension < 67) return 'bg-amber-400'
  return 'bg-rose-500'
}

export default function App() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  const initialGame = useMemo<GameState>(() => {
    const scenario = pickRandomScenario()
    const systemMsg: LogItem = {
      id: newId(),
      role: 'system',
      text: scenario.description,
    }
    return {
      scenario,
      tension: 22,
      messages: [systemMsg],
    }
  }, [])

  const [game, setGame] = useState(initialGame)
  const [action, setAction] = useState('')
  const [isJudging, setIsJudging] = useState(false)

  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem('geminiApiKey') ?? ''
    } catch {
      return ''
    }
  })
  const [showSettings, setShowSettings] = useState(() => apiKey.length === 0)

  useEffect(() => {
    if (!logRef.current) return
    // Keep the latest message in view.
    logRef.current.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [game.messages, isJudging])

  function handleNewGame() {
    const scenario = pickRandomScenario()
    setAction('')
    setIsJudging(false)
    setGame({
      scenario,
      tension: 22,
      messages: [
        { id: newId(), role: 'system' as const, text: scenario.description },
      ],
    })
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function handleSubmit() {
    const trimmed = action.trim()
    if (!trimmed || isJudging) return

    const scenarioText = game.scenario.description
    const userMsg: LogItem = { id: newId(), role: 'user', text: trimmed }

    setIsJudging(true)
    setGame((prev) => ({ ...prev, messages: [...prev.messages, userMsg] }))
    setAction('')

    try {
      const verdict = await getVerdict(scenarioText, trimmed)
      setGame((prev) => ({
        ...prev,
        tension: verdict.tension,
        messages: [
          ...prev.messages,
          {
            id: newId(),
            role: 'judge',
            verdict: verdict.verdict,
            analysis: verdict.analysis,
            tension: verdict.tension,
          },
        ],
      }))
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Judge failed.'
      setGame((prev) => ({
        ...prev,
        messages: [...prev.messages, { id: newId(), role: 'system', text }],
      }))
    } finally {
      setIsJudging(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const tension = game.tension

  return (
    <div className="w-full min-h-[100svh] bg-[#0b0b10] text-[#e5e7eb] flex flex-col items-center">
      <div className="w-full max-w-3xl px-4 py-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xl font-semibold text-[#f3f4f6]">
            The Tight Spot
          </div>
          <button
            type="button"
            onClick={handleNewGame}
            className="px-3 py-2 rounded-lg bg-[#161827] border border-[#242635] text-sm hover:bg-[#1b1c30] transition"
          >
            New Game
          </button>
        </div>

        <div className="bg-[#11121a] border border-[#242635] rounded-lg p-3">
          <div className="flex justify-between text-xs text-[#9ca3af] mb-1">
            <span>Tension</span>
            <span>{Math.round(tension)}%</span>
          </div>
          <div className="h-2 bg-[#2a2b3a] rounded-full overflow-hidden">
            <div
              className={`h-full ${tensionColorClass(tension)}`}
              style={{ width: `${tension}%` }}
            />
          </div>
        </div>

        <div className="flex-1 border border-[#242635] bg-[#0f1017] rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#242635]">
            <div className="text-xs uppercase tracking-widest text-[#9ca3af]">
              Scenario
            </div>
            <div className="mt-1 text-sm text-[#e5e7eb] leading-relaxed">
              {game.scenario.description}
            </div>
          </div>

          <div
            ref={logRef}
            className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3"
          >
            {game.messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] bg-[#15161f] border border-[#242635] rounded-lg px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-[#9ca3af] mb-1">
                        You
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-[#e5e7eb] leading-relaxed">
                        {m.text}
                      </div>
                    </div>
                  </div>
                )
              }

              if (m.role === 'judge') {
                const badge =
                  m.verdict === 'escaped'
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                    : m.verdict === 'worsened'
                      ? 'bg-rose-500/15 border-rose-400/40 text-rose-100'
                      : 'bg-amber-500/15 border-amber-400/40 text-amber-100'

                return (
                  <div key={m.id} className="flex justify-start">
                    <div className="max-w-[85%] bg-[#0c0d14] border border-[#242635] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-[11px] uppercase tracking-widest text-[#9ca3af]">
                          Judge
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[11px] rounded-md border ${badge}`}
                        >
                          {m.verdict.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-[#e5e7eb] leading-relaxed whitespace-pre-wrap">
                        {m.analysis}
                      </div>
                      <div className="mt-2 text-[11px] text-[#9ca3af]">
                        Tension: {Math.round(m.tension)}%
                      </div>
                    </div>
                  </div>
                )
              }

              // system
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="w-full max-w-[90%] bg-[#0c0d14] border border-[#242635] rounded-lg px-3 py-2 text-center">
                    <div className="text-[11px] uppercase tracking-widest text-[#9ca3af] mb-1">
                      System
                    </div>
                    <div className="text-sm text-[#e5e7eb] leading-relaxed whitespace-pre-wrap">
                      {m.text}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-[#242635] p-3 flex flex-col gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSubmit()
              }}
              className="flex gap-2"
            >
              <textarea
                ref={inputRef}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Type your escape attempt..."
                rows={2}
                className="flex-1 bg-[#0b0c12] border border-[#242635] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#aa3bff]/40 resize-none"
              />
              <button
                type="submit"
                disabled={isJudging}
                className="px-3 py-2 rounded-lg bg-[#2b2c44] border border-[#3a3b5c] text-sm hover:bg-[#34354f] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isJudging ? 'Judging...' : 'Send'}
              </button>
            </form>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-[#0b0c12] border border-[#242635] hover:bg-[#101224] transition"
                aria-label="Settings"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[#e5e7eb]"
                >
                  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-1.7 3- .1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.6V22h-3.5v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1-3-1.7.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.6-1H2v-3.5h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 1.7-3 .1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.6V2h3.5v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.8-.3l.1-.1 3 1.7-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.6 1H22v3.5h-.1a1.7 1.7 0 0 0-1.6 1z" />
                </svg>
                <span className="text-xs text-[#9ca3af]">Settings</span>
              </button>

              <div className="text-xs text-[#9ca3af]">
                API key stored in <span className="font-mono">localStorage</span>
              </div>
            </div>

            {showSettings && (
              <div className="flex flex-col gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    const next = e.target.value
                    setApiKey(next)
                    try {
                      localStorage.setItem('geminiApiKey', next)
                    } catch {
                      // Ignore storage failures (private mode, etc.).
                    }
                  }}
                  placeholder="Paste Gemini API key"
                  className="w-full bg-[#0b0c12] border border-[#242635] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#aa3bff]/40"
                />
                <div className="text-[11px] text-[#9ca3af]">
                  Not saved to disk files. Nothing gets pushed to GitHub.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
