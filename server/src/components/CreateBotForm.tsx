'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { saveBotAction } from '@/app/actions/bot'

export default function CreateBotForm() {
  const [platform, setPlatform] = useState('discord')
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('https://api.openai.com')
  const [openAiKey, setOpenAiKey] = useState('')
  const [botToken, setBotToken] = useState('')
  const [clientId, setClientId] = useState('')
  const [phoneId, setPhoneId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [appToken, setAppToken] = useState('')
  const [signingSecret, setSigningSecret] = useState('')

  const [status, setStatus] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setStatus('Verifying...')

    try {
      // 1. Verify Credentials via API
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          openAiBaseUrl,
          openAiKey,
          botToken,
          clientId,
          phoneId,
          accessToken,
          appToken,
          signingSecret,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Verification failed')
      }

      setStatus('Success! Saving bot...')

      // 2. Save via Server Action
      const botConfig = {
        openAiBaseUrl,
        openAiKey,
        ...(platform === 'discord' ? { botToken, clientId } : {}),
        ...(platform === 'whatsapp' ? { phoneId, accessToken } : {}),
        ...(platform === 'slack' ? { appToken, signingSecret } : {}),
      }

      await saveBotAction(platform, botConfig)

      setStatus('Bot Created Successfully!')

      // Reset form and refresh
      setOpenAiKey('')
      setBotToken('')
      setClientId('')
      setPhoneId('')
      setAccessToken('')
      setAppToken('')
      setSigningSecret('')

      router.refresh()

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus(`Error: ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form className="form-container" onSubmit={handleSubmit}>
      <div className="input-group">
        <label>Platform</label>
        <select
          className="input-field"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="discord">Discord</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="slack">Slack</option>
        </select>
      </div>

      <div className="input-group">
        <label>OpenAI API Base URL</label>
        <input
          className="input-field"
          type="url"
          required
          value={openAiBaseUrl}
          onChange={(e) => setOpenAiBaseUrl(e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>OpenAI API Key</label>
        <input
          className="input-field"
          type="password"
          required
          value={openAiKey}
          onChange={(e) => setOpenAiKey(e.target.value)}
        />
      </div>

      {platform === 'discord' && (
        <>
          <div className="input-group">
            <label>Bot Token</label>
            <input
              className="input-field"
              type="password"
              required
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Client ID</label>
            <input
              className="input-field"
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
        </>
      )}

      {platform === 'whatsapp' && (
        <>
          <div className="input-group">
            <label>Phone Number ID</label>
            <input
              className="input-field"
              type="text"
              required
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Access Token</label>
            <input
              className="input-field"
              type="password"
              required
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>
        </>
      )}

      {platform === 'slack' && (
        <>
          <div className="input-group">
            <label>App Token</label>
            <input
              className="input-field"
              type="password"
              required
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Signing Secret</label>
            <input
              className="input-field"
              type="password"
              required
              value={signingSecret}
              onChange={(e) => setSigningSecret(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="button-group">
        <button
          className="btn-primary"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? 'Verifying...' : 'Verify & Save Bot'}
        </button>
      </div>

      {status && (
        <div className={`status-message ${status.includes('Error') ? 'error' : 'success'}`}>
          {status}
        </div>
      )}
    </form>
  )
}