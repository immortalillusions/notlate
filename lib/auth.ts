import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { supabase } from '@/lib/supabase'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ account, profile }) {
      if (!profile?.sub || !profile?.email) return false

      const { error } = await supabase.from('users').upsert(
        {
          google_id: profile.sub,
          email: profile.email,
          access_token: account?.access_token ?? null,
          refresh_token: account?.refresh_token ?? null,
        },
        { onConflict: 'google_id', ignoreDuplicates: false }
      )

      if (error) {
        console.error('Failed to upsert user on sign in:', error)
        return false
      }

      return true
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.googleId = profile.sub
      }
      return token
    },

    async session({ session, token }) {
      if (token.googleId) {
        const { data: user } = await supabase
          .from('users')
          .select('id, onboarding_complete')
          .eq('google_id', token.googleId as string)
          .single()

        if (user) {
          session.user.id = user.id
          // @ts-expect-error — extending session type
          session.user.onboardingComplete = user.onboarding_complete
        }
      }
      return session
    },
  },
})
