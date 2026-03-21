import { useEffect, useRef, useState } from 'react'
import { getVerdict, type ChatTurn, type NarrativeOutcome } from './lib/gemini'

type LogItem =
  | { id: string; role: 'user'; text: string }
  | {
      id: string
      role: 'narrator'
      text: string
      tension: number
      tensionChange: number
      outcome?: NarrativeOutcome
    }

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Math.random()).slice(2)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function tensionColorClass(tension: number) {
  if (tension < 34) return 'bg-emerald-400'
  if (tension < 67) return 'bg-amber-400'
  return 'bg-rose-500'
}

export default function App() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  const baseTension = 50

  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem('geminiApiKey') ?? ''
    } catch {
      return ''
    }
  })
  const [showSettings, setShowSettings] = useState(() => apiKey.length === 0)

  const [isGenerating, setIsGenerating] = useState(false)
  const [action, setAction] = useState('')

  const [tension, setTension] = useState(baseTension)
  const [isGameOver, setIsGameOver] = useState(false)
  const [outcome, setOutcome] = useState<NarrativeOutcome | null>(null)

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [log, setLog] = useState<LogItem[]>([])

  useEffect(() => {
    if (!logRef.current) return
    logRef.current.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [log.length, isGenerating])

  async function startNewGame() {
    if (isGenerating) return
    setAction('')
    setIsGameOver(false)
    setOutcome(null)
    setIsGenerating(true)

    const initialTension = baseTension
    const initialChat: ChatTurn[] = [
      { role: 'system', text: `Tension is ${initialTension}%` },
    ]

    try {
      const resp = await getVerdict(initialChat, '')
      const nextTension = clamp(initialTension + resp.tensionChange, 0, 100)

      const resolved =
        nextTension <= 0
          ? 'escaped'
          : resp.outcome === 'escaped' || resp.outcome === 'caught'
            ? resp.outcome
            : null

      const ended =
        nextTension <= 0 ? true : resp.isGameOver && resolved !== null

      setTension(nextTension)
      setIsGameOver(ended)
      setOutcome(resolved)
      setLog([
        {
          id: newId(),
          role: 'narrator',
          text: resp.storyUpdate,
          tension: nextTension,
          tensionChange: resp.tensionChange,
          outcome: resolved ?? undefined,
        },
      ])
      setChatHistory([
        { role: 'narrator', text: resp.storyUpdate },
        { role: 'system', text: `Tension is ${nextTension}%` },
      ])
      requestAnimationFrame(() => inputRef.current?.focus())
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed to start game.'
      setLog([
        {
          id: newId(),
          role: 'narrator',
          text,
          tension: baseTension,
          tensionChange: 0,
        },
      ])
      setChatHistory([{ role: 'system', text: `Tension is ${baseTension}%` }])
      setTension(baseTension)
      setIsGameOver(false)
      setOutcome(null)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSubmit() {
    const trimmed = action.trim()
    if (!trimmed || isGenerating || isGameOver) return

    const currentTension = tension
    setAction('')
    setLog((prev) => [...prev, { id: newId(), role: 'user', text: trimmed }])
    setIsGenerating(true)

    try {
      const resp = await getVerdict(chatHistory, trimmed)
      const nextTension = clamp(currentTension + resp.tensionChange, 0, 100)

      const resolved =
        nextTension <= 0
          ? 'escaped'
          : resp.outcome === 'escaped' || resp.outcome === 'caught'
            ? resp.outcome
            : null
      const ended =
        nextTension <= 0 ? true : resp.isGameOver && resolved !== null

      setTension(nextTension)
      setIsGameOver(ended)
      setOutcome(resolved)

      setLog((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'narrator',
          text: resp.storyUpdate,
          tension: nextTension,
          tensionChange: resp.tensionChange,
          outcome: resolved ?? undefined,
        },
      ])

      setChatHistory((prev) => {
        const base = prev.length > 0 ? prev.slice(0, -1) : prev
        return [
          ...base,
          { role: 'user', text: trimmed },
          { role: 'narrator', text: resp.storyUpdate },
          { role: 'system', text: `Tension is ${nextTension}%` },
        ]
      })
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Narrative failed.'
      setLog((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'narrator',
          text,
          tension: currentTension,
          tensionChange: 0,
        },
      ])
    } finally {
      setIsGenerating(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <div className="w-full min-h-[100svh] bg-[#0b0b10] text-[#e5e7eb] flex flex-col items-center">
      <div className="w-full max-w-3xl px-4 py-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xl font-semibold text-[#f3f4f6]">
            The Tight Spot
          </div>
          <button
            type="button"
            onClick={() => void startNewGame()}
            disabled={isGenerating}
            className="px-3 py-2 rounded-lg bg-[#161827] border border-[#242635] text-sm hover:bg-[#1b1c30] transition disabled:opacity-60 disabled:cursor-not-allowed"
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
              Scenario Log
            </div>
            {isGameOver && outcome && (
              <div className="mt-1 text-sm text-[#e5e7eb] leading-relaxed">
                Game over: {outcome.toUpperCase()}
              </div>
            )}
          </div>

          <div
            ref={logRef}
            className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3"
          >
            {log.length === 0 && (
              <div className="text-sm text-[#9ca3af] py-8 text-center">
                Click <span className="font-semibold text-[#e5e7eb]">New Game</span>{' '}
                to generate a scenario.
              </div>
            )}

            {log.map((m) => {
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

              const badge =
                m.outcome === 'escaped'
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                  : m.outcome === 'caught'
                    ? 'bg-rose-500/15 border-rose-400/40 text-rose-100'
                    : 'bg-amber-500/15 border-amber-400/40 text-amber-100'

              return (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%] bg-[#0c0d14] border border-[#242635] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[11px] uppercase tracking-widest text-[#9ca3af]">
                        Narrative Director
                      </div>
                      {m.outcome ? (
                        <span
                          className={`px-2 py-0.5 text-[11px] rounded-md border ${badge}`}
                        >
                          {m.outcome.toUpperCase()}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] rounded-md border border-[#242635] text-[#9ca3af]">
                          ONGOING
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-[#e5e7eb] leading-relaxed whitespace-pre-wrap">
                      {m.text}
                    </div>
                    <div className="mt-2 text-[11px] text-[#9ca3af]">
                      Tension: {Math.round(m.tension)}% (
                      {m.tensionChange >= 0 ? '+' : ''}
                      {Math.round(m.tensionChange)}%)
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
                placeholder={
                  isGameOver
                    ? 'Game over. Start a new game...'
                    : 'What do you do next? (Type your move)'
                }
                rows={2}
                disabled={isGenerating || isGameOver}
                className="flex-1 bg-[#0b0c12] border border-[#242635] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#aa3bff]/40 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={isGenerating || isGameOver}
                className="px-3 py-2 rounded-lg bg-[#2b2c44] border border-[#3a3b5c] text-sm hover:bg-[#34354f] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Thinking...' : 'Send'}
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
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-1.7 3-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.6V22h-3.5v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1-3-1.7.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.6-1H2v-3.5h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 1.7-3 .1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.6V2h3.5v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.8-.3l.1-.1 3 1.7-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.6 1H22v3.5h-.1a1.7 1.7 0 0 0-1.6 1z" />
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
