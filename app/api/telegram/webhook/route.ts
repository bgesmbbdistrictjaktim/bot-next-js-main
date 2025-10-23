import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { createHttpBotClient } from '@/lib/telegramClient'
import { handleStart } from '@/lib/botHandlers/start'
import { handleHelp } from '@/lib/botHandlers/help'
import { checkUserRegistration, handleRegistrationCallback } from '@/lib/botHandlers/registration'
import { showMyOrders } from '@/lib/botHandlers/orders'
import { showProgressMenu } from '@/lib/botHandlers/progress'
import { showEvidenceMenu } from '@/lib/botHandlers/evidence'
import { getUserRole } from '@/lib/botUtils'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

// Photo evidence mapping
const PHOTO_TYPES = [
  { field: 'photo_sn_ont', label: 'Foto SN ONT' },
  { field: 'photo_technician_customer', label: 'Foto Teknisi + Pelanggan' },
  { field: 'photo_customer_house', label: 'Foto Rumah Pelanggan' },
  { field: 'photo_odp_front', label: 'Foto Depan ODP' },
  { field: 'photo_odp_inside', label: 'Foto Dalam ODP' },
  { field: 'photo_label_dc', label: 'Foto Label DC' },
  { field: 'photo_test_result', label: 'Foto Test Redaman' },
]

function getNextMissingPhotoField(evidence: any): { index: number, field: string, label: string } | null {
  for (let i = 0; i < PHOTO_TYPES.length; i++) {
    const { field, label } = PHOTO_TYPES[i]
    if (!evidence || !evidence[field]) {
      return { index: i + 1, field, label }
    }
  }
  return null
}

async function getTelegramFileUrl(token: string, fileId: string): Promise<string> {
  const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } })
  const filePath = data?.result?.file_path
  if (!filePath) throw new Error('Telegram getFile failed')
  return `https://api.telegram.org/file/bot${token}/${filePath}`
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'Missing TELEGRAM_BOT_TOKEN' }, { status: 500 })
    }

    const update = await req.json()
    const chatId: number | undefined = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id
    const text: string | undefined = update?.message?.text || update?.callback_query?.data
    const fromId: number | undefined = update?.message?.from?.id || update?.callback_query?.from?.id
    const telegramId = String(fromId || chatId || '')
    const firstName: string = update?.message?.from?.first_name || update?.callback_query?.from?.first_name || 'User'
    const lastName: string = update?.message?.from?.last_name || update?.callback_query?.from?.last_name || ''

    if (!chatId) {
      return NextResponse.json({ ok: true })
    }

    const client = createHttpBotClient(token)

    // 0) Handle photo messages (reply-based to evidence prompts)
    if (update?.message?.photo?.length) {
      const replyText: string | undefined = update?.message?.reply_to_message?.text
      if (!replyText || !/UPLOAD_FOTO_ORDER\s+(\S+)/.test(replyText)) {
        await (client as any).sendMessage(chatId, '⚠️ Kirim foto sebagai balasan ke pesan instruksi evidence agar bisa diproses.')
        return NextResponse.json({ ok: true })
      }
      const orderId = replyText.match(/UPLOAD_FOTO_ORDER\s+(\S+)/)?.[1]
      if (!orderId) {
        await (client as any).sendMessage(chatId, '❌ Gagal mendeteksi Order ID dari balasan evidence.')
        return NextResponse.json({ ok: true })
      }

      // Get current evidence record
      const { data: evidence } = await supabaseAdmin
        .from('evidence')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle()

      const nextField = getNextMissingPhotoField(evidence)
      if (!nextField) {
        await (client as any).sendMessage(chatId, '✅ Semua 7 foto evidence sudah terupload.')
        // Close order
        await supabaseAdmin.from('orders').update({ status: 'Closed' }).eq('order_id', orderId)
        return NextResponse.json({ ok: true })
      }

      const fileId: string = update.message.photo[update.message.photo.length - 1].file_id
      const fileUrl = await getTelegramFileUrl(token, fileId)
      const fileResp = await axios.get(fileUrl, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(fileResp.data)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${orderId}-Evidence-${nextField.field}-${timestamp}.jpg`

      // Upload to Supabase Storage
      const { data: upload, error: uploadError } = await supabaseAdmin.storage
        .from('evidence-photos')
        .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) {
        await (client as any).sendMessage(chatId, `❌ Gagal upload ${nextField.label}. Coba lagi.`)
        return NextResponse.json({ ok: true })
      }
      const { data: urlData } = supabaseAdmin.storage
        .from('evidence-photos')
        .getPublicUrl(upload.path)

      await supabaseAdmin
        .from('evidence')
        .update({ [nextField.field]: urlData.publicUrl, uploaded_at: new Date().toISOString() })
        .eq('order_id', orderId)

      // Count uploaded
      const { data: updatedEvidence } = await supabaseAdmin
        .from('evidence')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle()
      let uploadedCount = 0
      for (const t of PHOTO_TYPES) if (updatedEvidence && updatedEvidence[t.field]) uploadedCount++

      await (client as any).sendMessage(chatId, `✅ ${nextField.label} Berhasil Disimpan!\n\n📊 Progress: ${uploadedCount}/7 foto\n\n${uploadedCount < 7 ? `Silakan upload foto ke-${uploadedCount + 1}: ${PHOTO_TYPES[uploadedCount].label}` : '🎉 Semua evidence berhasil disimpan!'}`)

      if (uploadedCount >= 7) {
        const { error: closeError } = await supabaseAdmin
          .from('orders')
          .update({ status: 'Closed' })
          .eq('order_id', orderId)
        if (closeError) {
          await (client as any).sendMessage(chatId, '⚠️ Order ditutup tetapi gagal update status.')
        } else {
          await (client as any).sendMessage(chatId, '🎉 Order berhasil diselesaikan dan status diupdate ke "Closed"!')
        }
      }

      return NextResponse.json({ ok: true })
    }

    // 1) route callback_query
    if (update?.callback_query) {
      const data: string = update.callback_query.data
      // Handle registration callbacks first
      await (handleRegistrationCallback as any)(client as any, update.callback_query)

      if (data === 'my_orders') {
        const role = await (getUserRole as any)(telegramId)
        if (!role) {
          await (client as any).sendMessage(chatId, '❌ Anda belum terdaftar. Gunakan /start untuk mendaftar.')
        } else {
          await (showMyOrders as any)(client as any, chatId, telegramId, role)
        }
      } else if (data === 'update_progress') {
        await (showProgressMenu as any)(client as any, chatId, telegramId)
      } else if (data === 'upload_evidence') {
        await (showEvidenceMenu as any)(client as any, chatId, telegramId)
      } else if (data && data.startsWith('tech_stage_progress_')) {
        await (showProgressMenu as any)(client as any, chatId, telegramId)
      } else if (data && data.startsWith('evidence_order_')) {
        const orderId = data.split('_')[2]
        // Fetch order basic info
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('order_id, customer_name, customer_address')
          .eq('order_id', orderId)
          .maybeSingle()
        await (client as any).sendMessage(chatId, `📸 Upload Evidence\n\n🆔 Order ID: ${orderId}\n👤 Customer: ${order?.customer_name || '-'}\n📍 Alamat: ${order?.customer_address || '-'}\n\nMasukkan nama ODP untuk ORDER ${orderId}:`, {
          reply_markup: { force_reply: true }
        })
      }
      return NextResponse.json({ ok: true })
    }

    // 2) Handle replies to ODP/SN prompts
    if (update?.message?.reply_to_message && typeof text === 'string') {
      const replyText: string = update.message.reply_to_message.text || ''
      // ODP
      const odpMatch = replyText.match(/Masukkan nama ODP untuk ORDER\s+(\S+)/)
      if (odpMatch) {
        const orderId = odpMatch[1]
        // Insert or update evidence with ODP
        await supabaseAdmin
          .from('evidence')
          .upsert({ order_id: orderId, odp_name: text }, { onConflict: 'order_id' })
        await (client as any).sendMessage(chatId, `Masukkan SN ONT untuk ORDER ${orderId}:`, {
          reply_markup: { force_reply: true }
        })
        return NextResponse.json({ ok: true })
      }
      // SN ONT
      const snMatch = replyText.match(/Masukkan SN ONT untuk ORDER\s+(\S+)/)
      if (snMatch) {
        const orderId = snMatch[1]
        await supabaseAdmin
          .from('evidence')
          .upsert({ order_id: orderId, ont_sn: text }, { onConflict: 'order_id' })
        await (client as any).sendMessage(chatId, `Silakan kirim 7 foto evidence secara berurutan.\n\n1. Foto SN ONT\n2. Foto Teknisi + Pelanggan\n3. Foto Rumah Pelanggan\n4. Foto Depan ODP\n5. Foto Dalam ODP\n6. Foto Label DC\n7. Foto Test Redaman\n\nPENTING: Kirim setiap foto sebagai balasan (reply) ke pesan ini.\n\nUPLOAD_FOTO_ORDER ${orderId}`)
        return NextResponse.json({ ok: true })
      }
    }

    // 3) Slash commands
    if (text === '/start') {
      await (checkUserRegistration as any)(client as any, chatId, telegramId, firstName, lastName)
    } else if (text === '/help') {
      await handleHelp(client as any, chatId, telegramId)
    } else if (text === '/myorders') {
      const role = await (getUserRole as any)(telegramId)
      if (!role) {
        await (client as any).sendMessage(chatId, '❌ Anda belum terdaftar. Gunakan /start untuk mendaftar.')
      } else {
        await (showMyOrders as any)(client as any, chatId, telegramId, role)
      }
    } else if (text === '/progress') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'Teknisi') {
        await (client as any).sendMessage(chatId, '❌ Hanya Teknisi yang dapat update progress.')
      } else {
        await (showProgressMenu as any)(client as any, chatId, telegramId)
      }
    } else if (text === '/evidence') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'Teknisi') {
        await (client as any).sendMessage(chatId, '❌ Hanya Teknisi yang dapat upload evidence.')
      } else {
        await (showEvidenceMenu as any)(client as any, chatId, telegramId)
      }
    // Reply keyboard texts (non-slash)
    } else if (text === '📋 Order Saya') {
      const role = await (getUserRole as any)(telegramId)
      if (!role) {
        await (client as any).sendMessage(chatId, '❌ Anda belum terdaftar. Gunakan /start untuk mendaftar.')
      } else {
        await (showMyOrders as any)(client as any, chatId, telegramId, role)
      }
    } else if (text === '📝 Update Progress') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'Teknisi') {
        await (client as any).sendMessage(chatId, '❌ Hanya Teknisi yang dapat update progress.')
      } else {
        await (showProgressMenu as any)(client as any, chatId, telegramId)
      }
    } else if (text === '📸 Upload Evidence') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'Teknisi') {
        await (client as any).sendMessage(chatId, '❌ Hanya Teknisi yang dapat upload evidence.')
      } else {
        await (showEvidenceMenu as any)(client as any, chatId, telegramId)
      }
    } else if (text === '❓ Bantuan') {
      await handleHelp(client as any, chatId, telegramId)
    } else if (text === '📋 Buat Order') {
      const role = await (getUserRole as any)(telegramId)
      if (role === 'HD') {
        await (client as any).sendMessage(chatId, 'ℹ️ Fitur "Buat Order" sedang dimigrasikan ke webhook. Gunakan menu lain atau /help sementara ini.')
      } else {
        await (showMyOrders as any)(client as any, chatId, telegramId, role)
      }
    } else if (
      text === '🔍 Cek Order' ||
      text === '📊 Show Order On Progress' ||
      text === '✅ Show Order Completed' ||
      text === '🚀 Update SOD' ||
      text === '🎯 Update E2E' ||
      text === '👥 Assign Teknisi'
    ) {
      await (client as any).sendMessage(chatId, 'ℹ️ Fitur HD ini belum tersedia di webhook dan sedang dalam proses migrasi. Gunakan /help untuk alternatif yang tersedia.')
    } else {
      await (client as any).sendMessage(chatId, 'Perintah tidak dikenali. Gunakan /start atau /help.', {
        parse_mode: 'HTML',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const message = error?.response?.data || error?.message || 'Unknown error'
    return NextResponse.json({ error: 'Webhook handler failed', details: message }, { status: 500 })
  }
}