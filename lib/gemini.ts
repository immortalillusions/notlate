import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import type { OnboardingAnswers } from '@/lib/supabase-types'

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
})

const ACTIVITY_LABELS: Record<keyof OnboardingAnswers, string> = {
  meeting: 'work meeting / professional appointment',
  hangout: 'casual hangout / hanging out with friends',
  date: 'date / romantic outing',
  rock_climbing: 'rock climbing',
  exercise: 'gym / workout / exercise',
  running: 'running / jogging',
  food: 'going out to eat / restaurant / dinner',
}

export async function estimatePrepMinutes(
  eventTitle: string,
  eventDescription: string,
  onboardingAnswers: OnboardingAnswers
): Promise<number> {
  const answerLines = (Object.keys(onboardingAnswers) as (keyof OnboardingAnswers)[])
    .map((k) => `- ${ACTIVITY_LABELS[k]}: ${onboardingAnswers[k]} minutes`)
    .join('\n')

  const prompt = `The user has pre-set their exact preparation time for each activity type. Your job is to match the event to the closest activity category and return that EXACT number — do not estimate, do not average, do not reason independently.

User's preparation times:
${answerLines}

Event title: "${eventTitle}"
Event description: "${eventDescription || 'none'}"

Which activity category above best matches this event? Return ONLY that category's preparation time as a single integer. Nothing else.`

  try {
    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      prompt,
      maxOutputTokens: 10,
    })

    const minutes = parseInt(text.trim(), 10)
    if (isNaN(minutes)) {
      console.error('Gemini returned non-integer:', text)
      return -1 // signal to caller to use fallback
    }
    return Math.max(0, Math.min(minutes, 240))
  } catch (err) {
    console.error('Gemini error:', err)
    return -1 // signal to caller to use fallback
  }
}
