import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import type { OnboardingAnswers } from '@/lib/supabase-types'

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
})

export async function estimatePrepMinutes(
  eventTitle: string,
  eventDescription: string,
  onboardingAnswers: OnboardingAnswers
): Promise<number> {
  const prompt = `You are an assistant that classifies calendar events into EXACTLY ONE category and returns a preparation time.

You MUST follow these rules strictly:

1. First, classify the event into ONE of the following categories:
- PROFESSIONAL_LOW
- PROFESSIONAL_HIGH
- SOCIAL
- FITNESS
- ERRANDS
- SPECIAL_EVENT

2. Use the event title and description to choose the SINGLE BEST category.
- Do NOT choose multiple categories.
- Do NOT average across categories.
- If uncertain, choose the closest match.

3. After choosing a category, return the EXACT preparation time associated with that category from the user data below.

4. If the event does NOT clearly fit any category, return 15.

---

CATEGORY DEFINITIONS:

PROFESSIONAL_LOW:
Routine, low-stakes obligations like work meetings, internal calls, or classes.

PROFESSIONAL_HIGH:
High-stakes or evaluative events like interviews, exams, presentations, or networking events.

SOCIAL:
Casual social interactions like hanging out, meals, parties, or dates.

FITNESS:
Physical activities like gym, sports, workouts, or runs.

ERRANDS:
Life admin tasks like grocery shopping, appointments, therapy, or quick chores.

SPECIAL_EVENT:
One-off or high-effort events like weddings, conferences, concerts, or formal events.

---

USER PREPARATION TIMES (in minutes):

PROFESSIONAL_LOW: ${onboardingAnswers.professional_low}
PROFESSIONAL_HIGH: ${onboardingAnswers.professional_high}
SOCIAL: ${onboardingAnswers.social}
FITNESS: ${onboardingAnswers.fitness}
ERRANDS: ${onboardingAnswers.errands}
SPECIAL_EVENT: ${onboardingAnswers.special_event}

DEFAULT: 15

---

EVENT:
Title: "${eventTitle}"
Description: "${eventDescription || 'none'}"

---

OUTPUT FORMAT (STRICT):
Return ONLY a number (integer). No explanation.`

  console.log('[Gemini] onboardingAnswers:', JSON.stringify(onboardingAnswers))
  console.log('[Gemini] prompt:\n', prompt)

  try {
    const { text } = await generateText({
      model: google('gemini-3.1-flash-lite-preview'),
      prompt,
      maxOutputTokens: 10,
    })

    console.log('[Gemini] raw response:', JSON.stringify(text))
    const minutes = parseInt(text.trim(), 10)
    if (isNaN(minutes)) {
      console.error('[Gemini] returned non-integer:', text)
      return -1 // signal to caller to use fallback
    }
    console.log('[Gemini] result:', minutes)
    return Math.max(0, Math.min(minutes, 240))
  } catch (err) {
    console.error('[Gemini] error:', err)
    return -1 // signal to caller to use fallback
  }
}
