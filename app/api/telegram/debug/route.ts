import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

function maskToken(token: string): string {
  if (!token || token.length < 10) return 'invalid-token'
  const start = token.slice(0, 8)
  const end = token.slice(-6)
  return `${start}...${end}`
}

export async function GET(_req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' }, { status: 500 })
    }

    const tokenFingerprint = maskToken(token)

    const [meResp, webhookResp] = await Promise.all([
      axios.get(`https://api.telegram.org/bot${token}/getMe`),
      axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`),
    ])

    return NextResponse.json({
      ok: true,
      token_fingerprint: tokenFingerprint,
      bot: meResp.data?.result || null,
      webhook_info: webhookResp.data?.result || null,
    })
  } catch (error: any) {
    const message = error?.response?.data || error?.message || 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}