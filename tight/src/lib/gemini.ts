import { GoogleGenerativeAI } from '@google/generative-ai'

export type Verdict = 'escaped' | 'failed' | 'worsened'

export type VerdictResponse = {
  verdict: Verdict
  analysis: string
  tension: number
}

const SYSTEM_INSTRUCTION =
  'You are a cynical, logical judge of social and legal consequences. The user is in a "Tight Spot" (e.g., caught littering, accused of harassment, cornered by a gang). If their escape attempt is logically weak or socially unacceptable, punish them. Only clever, de-escalating, or physically sound logic allows escape. Respond in JSON: { "verdict": "escaped" | "failed" | "worsened", "analysis": "string", "tension": number }'

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

function isModelNotFoundError(err: unknown) {
  const msg = String(err)
  // The error you reported is a 404 with "models/<id> is not found".
  return msg.includes('404') && msg.includes('models/') && /not found/i.test(msg)
}

export async function getVerdict(
  scenario: string,
  userAction: string,
): Promise<VerdictResponse> {
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

  const genAI = new GoogleGenerativeAI(apiKey)
  const prompt = [
    'Scenario:',
    scenario,
    '',
    'User escape attempt:',
    userAction,
    '',
    'Return ONLY valid JSON that matches the required schema.',
  ].join('\n')

  const modelCandidates = [
    // Prefer the “latest” variant first; your earlier error shows plain `gemini-1.5-flash` is not available.
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-8b-latest',
  ]

  let lastErr: unknown = null
  for (const modelId of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: SYSTEM_INSTRUCTION,
      })

      const result = await model.generateContent(prompt)
      const rawText = result.response.text()

      const parsed = extractJsonObject(rawText) as
        | Partial<VerdictResponse>
        | null
      if (!parsed || typeof parsed !== 'object') {
        return {
          verdict: 'failed',
          analysis:
            'The judge returned an unreadable response. Provide a clearer action attempt.',
          tension: 60,
        }
      }

      const verdictCandidateRaw = (parsed as { verdict?: unknown }).verdict
      const verdictCandidate =
        typeof verdictCandidateRaw === 'string'
          ? verdictCandidateRaw.toLowerCase().trim()
          : ''
      const verdictValues: Verdict[] = ['escaped', 'failed', 'worsened']
      const verdict = verdictValues.includes(verdictCandidate as Verdict)
        ? (verdictCandidate as Verdict)
        : 'failed'

      const analysisCandidate = (parsed as { analysis?: unknown }).analysis
      const analysis =
        typeof analysisCandidate === 'string' ? analysisCandidate : ''

      const tensionCandidate = (parsed as { tension?: unknown }).tension
      const tensionNum =
        typeof tensionCandidate === 'number'
          ? tensionCandidate
          : Number(tensionCandidate)

      return {
        verdict,
        analysis: analysis || 'No analysis returned by the judge.',
        tension: Number.isFinite(tensionNum) ? clamp(tensionNum, 0, 100) : 50,
      }
    } catch (err) {
      lastErr = err
      if (isModelNotFoundError(err)) continue
      // For other errors (auth, quota, network), fail fast.
      throw err
    }
  }

  // If we got here, none of the candidates worked.
  throw lastErr instanceof Error
    ? lastErr
    : new Error('No Gemini 1.5 Flash model was available.')
}

