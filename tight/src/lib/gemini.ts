import { GoogleGenAI } from '@google/genai'

export type NarrativeOutcome = 'escaped' | 'caught' | 'ongoing'

export type NarrativeResponse = {
  storyUpdate: string
  tensionChange: number
  isGameOver: boolean
  outcome: NarrativeOutcome
}

export type ChatTurn = {
  role: 'system' | 'user' | 'narrator'
  text: string
}

const SYSTEM_INSTRUCTION =
  "You are a ruthless Narrative Director. Your goal is to keep the user in a \"Tight Spot\". Every response must end with a prompt for the user's next move. If they escape, the game ends. If they are caught/jailed, the game ends. Otherwise, describe the unfolding chaos."

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null

  // First try: the model already returned JSON.
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // Fall through to “best effort” extraction.
    }
  }

  // Best effort: extract the first {...} block.
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

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function isModelIdNotFound(err: unknown) {
  const msg = getErrorMessage(err)
  return /models\//i.test(msg) && /is not found/i.test(msg)
}

function serializeChatHistory(chatHistory: ChatTurn[]) {
  // Keep this compact but sufficient to preserve world state.
  return chatHistory
    .map((turn) => {
      const role =
        turn.role === 'narrator'
          ? 'Narrator'
          : turn.role === 'user'
            ? 'User'
            : 'System'
      return `${role}: ${turn.text}`
    })
    .join('\n')
}

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    storyUpdate: { type: 'string' },
    tensionChange: { type: 'number' },
    isGameOver: { type: 'boolean' },
    outcome: { type: 'string', enum: ['escaped', 'caught', 'ongoing'] },
  },
  required: ['storyUpdate', 'tensionChange', 'isGameOver', 'outcome'],
} as const

export async function getVerdict(
  chatHistory: ChatTurn[],
  userAction: string,
): Promise<NarrativeResponse> {
  let apiKey = ''
  try {
    apiKey = localStorage.getItem('geminiApiKey')?.trim() ?? ''
  } catch {
    apiKey = ''
  }

  if (!apiKey) {
    throw new Error(
      'Missing Gemini API key. Open Settings at the bottom and paste your key.',
    )
  }

  const ai = new GoogleGenAI({ apiKey })

  const isFirstTurn = !userAction.trim()
  const historyText = serializeChatHistory(chatHistory)

  const prompt = [
    'World state so far (verbatim):',
    historyText || '(empty)',
    '',
    isFirstTurn
      ? 'Generate a highly specific, high-stakes social or legal dilemma (a "Tight Spot") with no easy "correct" answer. The user should feel cornered and escape should require clever, de-escalating, or physically sound logic. Use concrete details and set up what happens next.'
      : '',
    isFirstTurn ? '' : 'User next move:',
    isFirstTurn ? '' : userAction,
    '',
    'Update the narrative based on the user next move (or generate the opening if first turn). If the user\'s action makes things worse, describe escalation and spreading consequences. Keep continuity with the provided world state.',
    '',
    'Return ONLY JSON with the schema:',
    '{ "storyUpdate": string, "tensionChange": number, "isGameOver": boolean, "outcome": "escaped" | "caught" | "ongoing" }',
    'The "storyUpdate" string MUST end with a prompt asking for the user\'s next move.',
  ]
    .filter(Boolean)
    .join('\n')

  const modelCandidates = ['gemini-2.5-flash', 'gemini-2.5-flash-latest']
  let lastErr: unknown = null

  for (const modelId of modelCandidates) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          // thinkingBudget is supported for Gemini 2.5 models.
          thinkingConfig: { thinkingBudget: -1 },
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
        },
      })

      const rawText = response.text ?? ''
      const parsed = extractJsonObject(rawText) as Partial<NarrativeResponse> | null

      if (!parsed || typeof parsed !== 'object') {
        return {
          storyUpdate:
            'The Narrative Director failed to produce a valid update. Try a different action. What will you do next?',
          tensionChange: 0,
          isGameOver: false,
          outcome: 'ongoing',
        }
      }

      const storyUpdate =
        typeof parsed.storyUpdate === 'string' ? parsed.storyUpdate : ''

      const tensionChangeRaw = parsed.tensionChange
      const tensionChange =
        typeof tensionChangeRaw === 'number'
          ? tensionChangeRaw
          : Number(tensionChangeRaw)

      const isGameOver =
        typeof parsed.isGameOver === 'boolean' ? parsed.isGameOver : false

      const outcomeRaw = parsed.outcome
      const outcome =
        outcomeRaw === 'escaped' || outcomeRaw === 'caught' || outcomeRaw === 'ongoing'
          ? outcomeRaw
          : 'ongoing'

      return {
        storyUpdate: storyUpdate || 'What will you do next?',
        tensionChange: Number.isFinite(tensionChange)
          ? clamp(tensionChange, -100, 100)
          : 0,
        isGameOver,
        outcome,
      }
    } catch (err) {
      lastErr = err
      if (isModelIdNotFound(err)) continue
      throw err
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('No Gemini 2.5 Flash model was available.')
}

