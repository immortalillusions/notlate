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
  const answersText = Object.entries(onboardingAnswers)
    .map(([k, v]) => `${k}: ${v} minutes`)
    .join('\n')

  const prompt = `You are helping someone plan their departure time. Based on the event details and the user's known preparation times, estimate how many minutes they need to prepare before leaving.

User's typical preparation times by activity:
${answersText}

Event title: ${eventTitle}
Event description: ${eventDescription || '(none)'}

Reply with ONLY a single integer representing the number of minutes needed to prepare. No explanation, no units, just the number.`

  try {
    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      prompt,
      maxOutputTokens: 10,
    })

    const minutes = parseInt(text.trim(), 10)
    return isNaN(minutes) ? 15 : Math.max(0, Math.min(minutes, 120))
  } catch {
    return 15
  }
}
