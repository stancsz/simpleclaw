import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]

  // Allow fallback to mock config during local tests using specifically test-management-api-key
  if (token === 'test-management-api-key') {
    return NextResponse.json({
      model: "claude-4.6-opus-managed",
      thinking: { type: "adaptive", effort: "high" },
      inference_geo: "us",
      betas: ["mcp-direct-v1", "context-compaction-v2"],
      managed_mode: true,
      platform: "discord"
    })
  }

  try {
    const supabase = await createClient()

    // Fetch the specific bot config using the token as the ID.
    const { data: bot, error } = await supabase
      .from('bots')
      .select('config, platform')
      .eq('id', token)
      .single()

    if (error || !bot) {
      return NextResponse.json({ error: 'Bot configuration not found' }, { status: 404 })
    }

    return NextResponse.json({
      ...bot.config,
      platform: bot.platform,
      managed_mode: true
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}