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
  'You are a cynical, logical Narrative Director for a game called The Tight Spot. The user is in a high-stakes social or legal dilemma.\n\nScenario Variety: On New Game, pick a specific, unique social/legal crisis from a diverse pool. Avoid generic “police summons”. Use Malaysia context naturally (Kantoi, Abang, Saman, Viral, mamak, WhatsApp, MRT/LRT, ad-hoc office politics, online mobs, etc.). Scenarios may include: caught recording a fight at a mamak; accused of “cutting queue” at a viral food stall; misunderstanding with a girl’s overprotective brother; workplace being framed for a mistake; road rage with a steering lock; being blamed in a WhatsApp group; being caught in a compromising misunderstanding and needing to survive the aftermath; taboo innuendo rumors spreading; having sex with a girl who consented first but then once her husband caught her, she frames you for rape; more topics reagarding sexual social issues like harrasment, misunderstood flirt, etc; and ad/conspiracy-style situations (rumors, screenshots, “boss” scapegoating, politics bait), all in non-graphic, modern realism.\n\nVivid Descriptions (The “2-Sentence” Rule): Every storyUpdate MUST be 2 to 3 sentences long, no exceptions.\n- Sentence 1: Describe the immediate physical action or sound (what the user hears/does right now).\n- Sentence 2: Describe the direct threat OR the direct question the user must answer right now.\nIf you include a 3rd sentence, make it a short follow-up that still ends with the next-move question.\n\nMalaysian Flavor: Act like a local observer who knows the social stakes in Malaysia.\n\nThe AI Must end Sentence 2 (or Sentence 3) with a prompt asking what the user does next.\n\nFormatting: Use **bold** for key threats (e.g., **The police are reaching for handcuffs**). No fancy theatrics.\n\nRespond ONLY in a valid JSON object: { "storyUpdate": "string", "tension": number, "isGameOver": boolean, "status": "ongoing" | "escaped" | "caught" }.'

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

