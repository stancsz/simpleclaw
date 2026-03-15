'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/utils/supabase/server'

export async function loginWithMagicLink(formData: FormData) {
  const supabase = await createClient()
  const email = (formData.get('email') as string) || 'admin@local.test'

  if (process.env.LOCAL_MODE === 'true') {
    // In local mode, we just redirect to dashboard as a mock login
    redirect('/dashboard')
    return
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  })

  if (error) {
    redirect('/error')
  }

  // The user should check their email to complete the login
  redirect('/login?status=sent')
}