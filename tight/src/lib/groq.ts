import Groq from 'groq-sdk'

export type StoryStatus = 'ongoing' | 'escaped' | 'caught'

export type StoryUpdateResponse = {
  storyUpdate: string
  tension: number
  isGameOver: boolean
  status: StoryStatus
}

export type ChatTurn = {
  role: 'system' | 'user' | 'narrator'
  text: string
}

const SYSTEM_INSTRUCTION =
  'You are a cynical, logical Narrative Director for a game called The Tight Spot. The user is in a high-stakes social or legal dilemma.\n\nRules:\n\nKeep descriptions under 50 words.\n\nUse modern, realistic language (Malaysian context like "Saman" or "PDRM" is encouraged).\n\nBe brutal-only genius moves allow escape.\n\nRespond ONLY in a valid JSON object: { "storyUpdate": "string", "tension": number, "isGameOver": boolean, "status": "ongoing" | "escaped" | "caught" }.'

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // continue to best-effort extraction
    }
  }

  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export async function getStoryUpdate(
  chatHistory: ChatTurn[],
): Promise<StoryUpdateResponse> {
  let apiKey = ''
  try {
    apiKey = localStorage.getItem('groqApiKey')?.trim() ?? ''
  } catch {
    apiKey = ''
  }

  if (!apiKey) {
    throw new Error('Missing Groq API key. Open Settings and paste your key.')
  }

  const client = new Groq({ apiKey, dangerouslyAllowBrowser: true })
  const messages = [
    { role: 'system' as const, content: SYSTEM_INSTRUCTION },
    ...chatHistory.map((turn) => ({
      role: turn.role === 'narrator' ? ('assistant' as const) : turn.role,
      content: turn.text,
    })),
  ]

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages,
  })

  const rawText = completion.choices[0]?.message?.content ?? ''
  const parsed = extractJsonObject(rawText) as Partial<StoryUpdateResponse> | null

  if (!parsed || typeof parsed !== 'object') {
    return {
      storyUpdate:
        'Chaos spikes. People are closing in and your options are shrinking. What do you do next?',
      tension: 70,
      isGameOver: false,
      status: 'ongoing',
    }
  }

  const storyUpdate =
    typeof parsed.storyUpdate === 'string' ? parsed.storyUpdate : ''
  const tensionRaw = parsed.tension
  const tension = typeof tensionRaw === 'number' ? tensionRaw : Number(tensionRaw)
  const isGameOver =
    typeof parsed.isGameOver === 'boolean' ? parsed.isGameOver : false
  const statusRaw = parsed.status
  const status: StoryStatus =
    statusRaw === 'escaped' || statusRaw === 'caught' || statusRaw === 'ongoing'
      ? statusRaw
      : 'ongoing'

  return {
    storyUpdate: storyUpdate || 'Pressure rises. What do you do next?',
    tension: Number.isFinite(tension) ? clamp(tension, 0, 100) : 60,
    isGameOver,
    status,
  }
}

