import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

function getBaseUrl(): string | null {
  // Prefer explicit app URL if provided
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.TELEGRAM_WEBHOOK_URL
  if (explicit) return explicit.replace(/\/$/, '')

  // Fallback to Vercel URL, ensure https
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return null
}

export async function GET(_req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'Missing TELEGRAM_BOT_TOKEN' }, { status: 500 })
    }

    const baseUrl = getBaseUrl()
    if (!baseUrl) {
      return NextResponse.json({ error: 'Missing base URL. Set NEXT_PUBLIC_APP_URL or TELEGRAM_WEBHOOK_URL, or rely on VERCEL_URL in production.' }, { status: 500 })
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`

    const { data } = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
      url: webhookUrl
    })

    return NextResponse.json({ ok: true, webhookUrl, telegram: data })
  } catch (error: any) {
    const message = error?.response?.data || error?.message || 'Unknown error'
    return NextResponse.json({ error: 'Failed to set webhook', details: message }, { status: 500 })
  }
}