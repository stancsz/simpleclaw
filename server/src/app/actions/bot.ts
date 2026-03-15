'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveBotAction(platform: string, config: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { error } = await supabase.from('bots').insert({
    user_id: user.id,
    name: `${platform} bot`,
    platform,
    config,
    status: 'active',
  })

  if (error) {
    throw error
  }

  revalidatePath('/dashboard')
  return { success: true }
}
