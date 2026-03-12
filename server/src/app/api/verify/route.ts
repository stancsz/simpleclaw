import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { platform, openAiBaseUrl, openAiKey, botToken, phoneId, accessToken, appToken, signingSecret } = body

    // 1. Verify OpenAI credentials
    try {
      const openAiUrl = new URL('/v1/models', openAiBaseUrl).toString()
      const openAiRes = await fetch(openAiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
        },
      })

      if (!openAiRes.ok) {
        throw new Error(`OpenAI verification failed: ${openAiRes.status} ${openAiRes.statusText}`)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `LLM API Error: ${message}` }, { status: 400 })
    }

    // 2. Verify Platform credentials
    if (platform === 'discord') {
      try {
        const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
          method: 'GET',
          headers: {
            Authorization: `Bot ${botToken}`,
          },
        })

        if (!discordRes.ok) {
          throw new Error(`Discord verification failed: ${discordRes.status} ${discordRes.statusText}`)
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `Discord API Error: ${message}` }, { status: 400 })
      }
    } else if (platform === 'whatsapp') {
      // Mock verification for WhatsApp
      if (!phoneId || !accessToken) {
        return NextResponse.json({ error: 'WhatsApp requires Phone ID and Access Token' }, { status: 400 })
      }
    } else if (platform === 'slack') {
      // Mock verification for Slack
      if (!appToken || !signingSecret) {
        return NextResponse.json({ error: 'Slack requires App Token and Signing Secret' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}