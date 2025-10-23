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
import { showOrderSelectionForStageAssignment, showStageAssignmentMenu, showTechnicianSelectionForStage, assignTechnicianToStage, showTechnicianSelectionForAllStages, assignTechnicianToAllStages } from '@/lib/botHandlers/assignment'
import { startCreateOrderFlow, handleCreateOrderReply, showDirectAssignmentTechnicians, assignTechnicianDirectly } from '@/lib/botHandlers/createOrder'
import { getReplyMenuKeyboard } from '@/lib/botMenus'

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

function formatOrderSummary(order: any) {
  const statusEmojiMap: Record<string, string> = {
    'Pending': '⏳',
    'In Progress': '🔄',
    'On Hold': '⏸️',
    'Completed': '✅',
    'Closed': '🔒'
  }
  const statusEmoji = statusEmojiMap[order.status] || '❓'
  const lines = [
    `🆔 Order: ${order.order_id || order.id}`,
    `👤 ${order.customer_name || '-'}`,
    `📞 ${order.contact || '-'}`,
    `📍 ${order.customer_address || '-'}`,
    `⚙️ Layanan: ${order.service_type || '-'}`,
    `📌 STO: ${order.sto || '-'}`,
    `📈 Status: ${statusEmoji} ${order.status}`,
  ]
  return lines.join('\n')
}

function formatWIB(dateIso?: string) {
  if (!dateIso) return 'Belum diset'
  try {
    const d = new Date(dateIso)
    const parts = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d)
    const get = (t: string) => parts.find(p => p.type === t)?.value || ''
    const day = get('day')
    const month = get('month')
    const year = get('year')
    const hour = get('hour')
    const minute = get('minute')
    const second = get('second')
    return `${day} ${month} ${year} ${hour}:${minute}:${second} WIB`
  } catch {
    return dateIso || '-'
  }
}

// Formatter detail sesuai format "Cek Order"
function formatOrderDetail(order: any, evidence?: any, createdByName?: string, assignedTechName?: string, assignedAtIso?: string, assignedTechRole?: string) {
  const lines: string[] = []
  lines.push('📋 DETAIL LENGKAP ORDER')
  lines.push('')
  lines.push(`🆔 Order ID: ${order.order_id || order.id}`)
  lines.push(`⏳ Status: ${order.status || '-'}`)
  lines.push(`📅 Dibuat: ${formatWIB(order.created_at)}`)
  lines.push(`👤 Dibuat oleh: ${createdByName || '-'}`)
  lines.push(`📝 Terakhir Update: ${formatWIB(order.updated_at)}`)
  lines.push('')
  lines.push('👤 INFORMASI CUSTOMER')
  lines.push(`• Nama: ${order.customer_name || '-'}`)
  lines.push(`• Alamat: ${order.customer_address || '-'}`)
  lines.push(`• Kontak: ${order.contact || '-'}`)
  lines.push(`• STO: ${order.sto || '-'}`)
  lines.push('')
  lines.push('🔧 INFORMASI LAYANAN')
  lines.push(`• Jenis Transaksi: ${order.transaction_type || '-'}`)
  lines.push(`• Jenis Layanan: ${order.service_type || '-'}`)
  lines.push('')
  lines.push('👨‍🔧 TEKNISI ASSIGNED')
  if (assignedTechName) {
    lines.push(`• Nama: ${assignedTechName}`)
    lines.push(`• Role: ${assignedTechRole || 'Teknisi'}`)
    lines.push(`• Assigned pada: ${formatWIB(assignedAtIso || order.updated_at)}`)
  } else {
    lines.push('• Belum di-assign')
  }
  lines.push('')
  lines.push('⏰ TIMELINE PEKERJAAN')
  lines.push(`• SOD Time: ${order.sod_time ? formatWIB(order.sod_time) : 'Belum diset'}`)
  lines.push(`• E2E Time: ${order.e2e_time ? formatWIB(order.e2e_time) : 'Belum diset'}`)
  lines.push(`• LME PT2 Start: ${order.lme_pt2_start ? formatWIB(order.lme_pt2_start) : 'Belum diset'}`)
  lines.push(`• LME PT2 End: ${order.lme_pt2_end ? formatWIB(order.lme_pt2_end) : 'Belum diset'}`)

  // Tambahan ringkas evidence jika ingin ditampilkan (opsional)
  if (evidence) {
    const count = ['photo_sn_ont','photo_technician_customer','photo_customer_house','photo_odp_front','photo_odp_inside','photo_label_dc','photo_test_result'].filter(k => evidence[k]).length
    if (count > 0) {
      lines.push('')
      lines.push(`📸 Evidence: ${count}/7 foto`)
    }
  }
  return lines.join('\n')
}

// Simple in-memory dedupe for dev to prevent double-processing
const processedUpdateIds = new Set<number>()
// Guard to throttle progress messages per chat
const progressSpamGuard = new Map<number, number>()

// Session create order (inline flow)
const createOrderSessions = new Map<number, { type: 'create_order', step: string, data: any }>()

const STO_OPTIONS = ['CBB','CWA','GAN','JTN','KLD','KRG','PKD','PGB','KLG','PGG','PSR','RMG','PGN','BIN','CPE','JAG','KLL','KBY','KMG','TBE','NAS']
const TRANSACTION_OPTIONS = ['Disconnect','Modify','New install existing','New install jl','New install','PDA']
const SERVICE_OPTIONS = ['Astinet','Metro','Vpn Ip','Ip Transit','Siptrunk']

function chunkKeyboard(items: string[], prefix: string, perRow = 3) {
  const keyboard: any[] = []
  for (let i = 0; i < items.length; i += perRow) {
    const row: any[] = []
    for (let j = i; j < Math.min(i + perRow, items.length); j++) {
      row.push({ text: items[j], callback_data: `${prefix}${items[j]}` })
    }
    keyboard.push(row)
  }
  return keyboard
}

function getStoKeyboard() { return { inline_keyboard: chunkKeyboard(STO_OPTIONS, 'sto_') } }
function getTransactionKeyboard() { return { inline_keyboard: chunkKeyboard(TRANSACTION_OPTIONS, 'transaction_') } }
function getServiceKeyboard() { return { inline_keyboard: chunkKeyboard(SERVICE_OPTIONS, 'service_') } }

function nowJakartaIso() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '.000Z'
}

async function handleCreateOrderTextInput(client: any, chatId: number, telegramId: string, text: string) {
  const session = createOrderSessions.get(chatId)
  if (!session || session.type !== 'create_order') return false
  const t = (text || '').trim()
  if (!t) return false

  if (session.step === 'order_id') {
    const { data: exist } = await supabaseAdmin.from('orders').select('order_id').eq('order_id', t).maybeSingle()
    if (exist) {
      await client.sendMessage(chatId, '❌ Order ID sudah ada.\n\n🆔 Silakan masukkan Order ID yang berbeda:')
      return true
    }
    session.data.order_id = t
    session.step = 'customer_name'
    await client.sendMessage(chatId, `✅ Order ID: ${t}\n\n1️⃣ Nama Pelanggan:`)
    return true
  }
  if (session.step === 'customer_name') {
    session.data.customer_name = t
    session.step = 'customer_address'
    await client.sendMessage(chatId, `✅ Nama pelanggan: ${t}\n\n2️⃣ Alamat Pelanggan:`)
    return true
  }
  if (session.step === 'customer_address') {
    session.data.customer_address = t
    session.step = 'customer_contact'
    await client.sendMessage(chatId, `✅ Alamat pelanggan: ${t}\n\n3️⃣ Kontak Pelanggan:`)
    return true
  }
  if (session.step === 'customer_contact') {
    session.data.contact = t
    session.step = 'sto'
    await client.sendMessage(chatId, '✅ Kontak pelanggan: ' + t + '\n\n4️⃣ Pilih STO:', { reply_markup: getStoKeyboard() })
    return true
  }
  return false
}

async function sendOrderCreatedSuccess(client: any, chatId: number, payload: any, techName: string) {
  const message = '✅ Order Berhasil Dibuat!\n\n' +
    `🆔 Order ID: ${payload.order_id}\n` +
    `👤 Pelanggan: ${payload.customer_name}\n` +
    `📍 Alamat: ${payload.customer_address}\n` +
    `📞 Kontak: ${payload.contact}\n` +
    `🏢 STO: ${payload.sto}\n` +
    `📦 Type Transaksi: ${payload.transaction_type}\n` +
    `🔧 Jenis Layanan: ${payload.service_type}\n` +
    `👷 Teknisi: ${techName}\n` +
    `📌 Status: Pending`
  await client.sendMessage(chatId, message)
}


export async function POST(req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'Missing TELEGRAM_BOT_TOKEN' }, { status: 500 })
    }

    const update = await req.json()
    const updateId: number | undefined = update?.update_id

    // Deduplicate the same update id (dev mode may double invoke)
    if (typeof updateId === 'number') {
      if (processedUpdateIds.has(updateId)) {
        return NextResponse.json({ ok: true })
      }
      // keep set small
      if (processedUpdateIds.size > 200) processedUpdateIds.clear()
      processedUpdateIds.add(updateId)
    }

    const chatId: number | undefined = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id
    const text: string | undefined = update?.message?.text || update?.callback_query?.data
    const fromId: number | undefined = update?.message?.from?.id || update?.callback_query?.from?.id
    const telegramId = String(fromId || chatId || '')
    const firstName: string = update?.message?.from?.first_name || update?.callback_query?.from?.first_name || 'User'
    const lastName: string = update?.message?.from?.last_name || update?.callback_query?.from?.last_name || ''

    // Ignore messages sent by the bot itself to prevent loops
    const isFromBot = update?.message?.from?.is_bot === true

    if (!chatId || isFromBot) {
      return NextResponse.json({ ok: true })
    }

    // Ignore stale updates (Telegram may retry old updates when webhook failed)
    const nowSec = Math.floor(Date.now() / 1000)
    const msgDate: number | undefined = update?.message?.date || update?.callback_query?.message?.date
    const isCallback = !!update?.callback_query
    if (typeof msgDate === 'number') {
      const age = nowSec - msgDate
      // Hanya drop untuk pesan biasa yang sudah sangat lama (>5 menit).
      // Untuk callback, jangan drop — karena pengguna bisa klik tombol lama.
      if (!isCallback && age > 300) {
        return NextResponse.json({ ok: true, dropped: 'stale_message' })
      }
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
        await (client as any).sendMessage(chatId, '❌ Gagal mengupload foto evidence.')
        return NextResponse.json({ ok: true })
      }

      // Save URL to evidence table
      const { data: publicUrlData } = supabaseAdmin.storage.from('evidence-photos').getPublicUrl(filename)
      const updatePayload: any = {}
      updatePayload[nextField.field] = publicUrlData.publicUrl
      await supabaseAdmin
        .from('evidence')
        .upsert({ order_id: orderId, ...updatePayload }, { onConflict: 'order_id' })

      await (client as any).sendMessage(chatId, `✅ ${nextField.label} berhasil diupload (${nextField.index}/7).`)
      await (client as any).sendMessage(chatId, `👆 Balas pesan instruksi evidence dengan foto berikutnya.`)
      return NextResponse.json({ ok: true })
    }

    // 1) route callback_query
    if (update?.callback_query) {
      const data: string = update.callback_query.data
      // Handle registration callbacks first
      await (handleRegistrationCallback as any)(client as any, update.callback_query)

      if (data === 'create_order') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat membuat order.')
        } else {
          // Mulai flow create order inline berbasis sesi
          createOrderSessions.set(chatId, { type: 'create_order', step: 'order_id', data: {} })
          await (client as any).sendMessage(chatId, '📋 Membuat Order Baru\n\n🆔 Silakan masukkan Order ID:', { parse_mode: 'HTML' })
        }
      } else if (data === 'my_orders') {
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
      } else if (data === 'search_order') {
        await (client as any).sendMessage(
          chatId,
          `🔍 Cek Detail Order\n\nSilakan masukkan Order ID yang ingin Anda cari:\n\n📝 Format: Ketik order ID (contoh: ORD-001)\n💡  Pastikan Order ID yang dimasukkan benar`,
          { reply_markup: { force_reply: true } }
        )
      } else if (data && data.startsWith('view_order_')) {
        const orderId = data.replace('view_order_', '')
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('order_id', orderId).maybeSingle()
        if (!order) {
          await (client as any).sendMessage(chatId, `❌ Order ${orderId} tidak ditemukan.`)
        } else {
          const { data: evidence } = await supabaseAdmin.from('evidence').select('*').eq('order_id', orderId).maybeSingle()
          let createdByName: string | undefined
          if (order.created_by) {
            const { data: creator } = await supabaseAdmin.from('users').select('name').eq('id', order.created_by).maybeSingle()
            createdByName = creator?.name
          }
          let assignedTechName: string | undefined
          let assignedTechRole: string | undefined
          let assignedAtIso: string | undefined
          if (order.assigned_technician) {
            const { data: tech } = await supabaseAdmin.from('users').select('name, role').eq('id', order.assigned_technician).maybeSingle()
            assignedTechName = tech?.name
            assignedTechRole = tech?.role || 'Teknisi'
            assignedAtIso = order.updated_at
          }
          await (client as any).sendMessage(chatId, `${formatOrderDetail(order, evidence, createdByName, assignedTechName, assignedAtIso, assignedTechRole)}`)


        }
      } else if (data && data.startsWith('detail_order_')) {
        const orderId = data.replace('detail_order_', '')
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('order_id', orderId).maybeSingle()
        const { data: evidence } = await supabaseAdmin.from('evidence').select('*').eq('order_id', orderId).maybeSingle()
        if (!order) {
          await (client as any).sendMessage(chatId, `❌ Order ${orderId} tidak ditemukan.`)
        } else {
          let createdByName: string | undefined
          if (order.created_by) {
            const { data: creator } = await supabaseAdmin.from('users').select('name').eq('id', order.created_by).maybeSingle()
            createdByName = creator?.name
          }
          let assignedTechName: string | undefined
          let assignedTechRole: string | undefined
          let assignedAtIso: string | undefined
          if (order.assigned_technician) {
            const { data: tech } = await supabaseAdmin.from('users').select('name, role').eq('id', order.assigned_technician).maybeSingle()
            assignedTechName = tech?.name
            assignedTechRole = tech?.role || 'Teknisi'
            assignedAtIso = order.updated_at
          }

          await (client as any).sendMessage(chatId, `${formatOrderDetail(order, evidence, createdByName, assignedTechName, assignedAtIso, assignedTechRole)}`)
          const role = await (getUserRole as any)(telegramId)
          const menuRole = role === 'HD' ? 'HD' : (role || 'Teknisi')
          await (client as any).sendMessage(chatId, 'Pilih menu:', (getReplyMenuKeyboard as any)(menuRole))
        }
      } else if (data && data.startsWith('refresh_order_')) {
        const orderId = data.replace('refresh_order_', '')
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('order_id', orderId).maybeSingle()
        if (!order) {
          await (client as any).sendMessage(chatId, `❌ Order ${orderId} tidak ditemukan.`)
        } else {
          await (client as any).sendMessage(chatId, `🔄 Data terbaru:\n\n${formatOrderSummary(order)}`)
        }
      } else if (data === 'back_to_hd_menu') {
        await handleStart(client as any, chatId, telegramId)
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
      } else if (data === 'assign_technician_stage') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat melakukan assignment.')
        } else {
          await (showOrderSelectionForStageAssignment as any)(client as any, chatId, telegramId)
        }
      } else if (data && data.startsWith('stage_assign_order_')) {
        const token = data.replace('stage_assign_order_', '')
        // Prefer treating token as order_id; if not found, fallback to index-based lookup
        let resolvedOrderId = token
        const { data: foundOrder } = await supabaseAdmin.from('orders').select('order_id').eq('order_id', token).maybeSingle()
        if (!foundOrder) {
          const { data: activeOrders } = await supabaseAdmin
            .from('orders')
            .select('order_id')
            .in('status', ['Pending', 'In Progress', 'On Hold'])
            .order('created_at', { ascending: false })
          const idx = Number(token)
          if (activeOrders && Number.isInteger(idx) && idx >= 0 && idx < activeOrders.length) {
            resolvedOrderId = activeOrders[idx].order_id
          }
        }
        await (showStageAssignmentMenu as any)(client as any, chatId, telegramId, resolvedOrderId)
      } else if (data && (data.startsWith('assign_stage_') || data.startsWith('reassign_stage_'))) {
        const parts = data.split('_') // e.g. assign_stage_<orderId>_<stage>
        const orderId = parts[2]
        const stage = parts.slice(3).join('_')
        await (showTechnicianSelectionForStage as any)(client as any, chatId, telegramId, orderId, stage)
      } else if (data && data.startsWith('select_tech_for_stage_')) {
        const payload = data.replace('select_tech_for_stage_', '')
        const segs = payload.split('_')
        const oid = segs[0]
        const stg = segs.slice(1, segs.length - 1).join('_')
        const techId = segs[segs.length - 1]
        await (assignTechnicianToStage as any)(client as any, chatId, telegramId, oid, stg, techId)
      } else if (data && data.startsWith('assign_all_same_')) {
        const orderId = data.replace('assign_all_same_', '')
        await (showTechnicianSelectionForAllStages as any)(client as any, chatId, telegramId, orderId)
      } else if (data && data.startsWith('assign_all_tech_')) {
        const payload = data.replace('assign_all_tech_', '')
        const [oid, techId] = payload.split('_')
        await (assignTechnicianToAllStages as any)(client as any, chatId, telegramId, oid, techId)
      } else if (data === 'back_to_assignment_list') {
        await (showOrderSelectionForStageAssignment as any)(client as any, chatId, telegramId)
      } else if (data && data.startsWith('direct_assign_')) {
        const orderId = data.replace('direct_assign_', '')
        await (showDirectAssignmentTechnicians as any)(client as any, chatId, telegramId, orderId)
      } else if (data && data.startsWith('select_direct_tech_')) {
        const payload = data.replace('select_direct_tech_', '')
        const [orderId, userId] = payload.split('_')
        await (assignTechnicianDirectly as any)(client as any, chatId, telegramId, orderId, userId)
      } else if (data && data.startsWith('completed_month_')) {
        const parts = data.split('_')
        const month = Number(parts[2])
        const year = Number(parts[3])
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 0, 23, 59, 59)

        const { data: orders, error } = await supabaseAdmin
          .from('orders')
          .select('*')
          .not('e2e_timestamp', 'is', null)
          .gte('e2e_timestamp', startDate.toISOString())
          .lte('e2e_timestamp', endDate.toISOString())
          .order('order_id', { ascending: true })

        const monthName = startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
        if (error) {
          await (client as any).sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.')
        } else if (!orders || orders.length === 0) {
          await (client as any).sendMessage(chatId, `✅ ORDER COMPLETED - ${monthName}\n\nTidak ada order yang completed pada bulan ini.`)
        } else {
          let message = `✅ ORDER COMPLETED - ${monthName}\n\n`
          message += `Total: ${orders.length} order completed\n\n`

          for (let i = 0; i < orders.length; i++) {
            const order = orders[i]
            const completedDate = formatWIB(order.e2e_timestamp)
            const createdDate = formatWIB(order.created_at)
            const sodDate = order.sod_timestamp ? formatWIB(order.sod_timestamp) : ''

            message += `${i + 1}.📋 ${order.order_id}/${order.customer_name}\n`
            message += `Status: ✅ Completed\n`
            message += `STO: ${order.sto || ''}\n`
            message += `Type: ${order.transaction_type || ''}\n`
            message += `Layanan: ${order.service_type || ''}\n`
            message += `Dibuat: ${createdDate}\n`
            message += `SOD: ${sodDate}\n`
            message += `E2E: ${completedDate}\n\n`
          }

          const keyboard = [[{ text: '🔙 Kembali ke Menu Bulan', callback_data: 'back_to_completed_menu' }]]

          if (message.length > 4000) {
            const lines = message.split('\n')
            let buf = ''
            for (let idx = 0; idx < lines.length; idx++) {
              const line = lines[idx]
              if ((buf + line + '\n').length > 3500) {
                await (client as any).sendMessage(chatId, buf, { parse_mode: 'Markdown' })
                buf = ''
              }
              buf += line + '\n'
            }
            await (client as any).sendMessage(chatId, buf.trim(), { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } })
          } else {
            await (client as any).sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } })
          }
        }
      } else if (data === 'back_to_completed_menu') {
        const currentDate = new Date()
        const currentMonth = currentDate.getMonth() + 1
        const currentYear = currentDate.getFullYear()

        let message = '✅ ORDER COMPLETED\n\n'
        message += 'Pilih bulan untuk melihat order yang sudah completed:\n\n'

        const keyboard: any[] = []
        for (let i = 0; i < 2; i++) {
          const d = new Date(currentYear, currentMonth - 1 - i, 1)
          const month = d.getMonth() + 1
          const year = d.getFullYear()
          const monthName = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
          keyboard.push([{ text: `📅 ${monthName}`, callback_data: `completed_month_${month.toString().padStart(2, '0')}_${year}` }])
        }
        keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_to_main' }])
        await (client as any).sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } })
      } else if (data && data.startsWith('sto_')) {
        const sto = data.replace('sto_', '')
        const session = createOrderSessions.get(chatId)
        if (session && session.type === 'create_order') {
          session.data.sto = sto
          session.step = 'transaction'
          await (client as any).sendMessage(chatId, `✅ STO: ${sto}\n\n5️⃣ Pilih Type Transaksi:`, { reply_markup: getTransactionKeyboard() })
        }
      } else if (data && data.startsWith('transaction_')) {
        const trx = data.replace('transaction_', '')
        const session = createOrderSessions.get(chatId)
        if (session && session.type === 'create_order') {
          session.data.transaction_type = trx
          session.step = 'service'
          await (client as any).sendMessage(chatId, `✅ Type Transaksi: ${trx}\n\n6️⃣ Pilih Jenis Layanan:`, { reply_markup: getServiceKeyboard() })
        }
      } else if (data && data.startsWith('service_')) {
        const service = data.replace('service_', '')
        const session = createOrderSessions.get(chatId)
        if (session && session.type === 'create_order') {
          session.data.service_type = service
          session.step = 'assign_technician'
          // Ambil teknisi berdasarkan STO (jika ada mapping), fallback semua teknisi
          const { data: mappings } = await supabaseAdmin
            .from('technician_sto')
            .select('user_id')
            .eq('sto', session.data.sto)
          let technicians: any[] = []
          if (mappings && mappings.length) {
            const ids = mappings.map(m => m.user_id).filter(Boolean)
            const { data: stoTechs } = await supabaseAdmin
              .from('users')
              .select('id, name')
              .eq('role', 'Teknisi')
              .in('id', ids)
              .order('name')
            technicians = stoTechs || []
          }
          if (!technicians || technicians.length === 0) {
            const { data: allTechs } = await supabaseAdmin
              .from('users')
              .select('id, name')
              .eq('role', 'Teknisi')
              .order('name')
            technicians = allTechs || []
          }
          if (!technicians || technicians.length === 0) {
            await (client as any).sendMessage(chatId, 'ℹ️ Belum ada teknisi terdaftar.')
          } else {
            const keyboard: any[] = technicians.map(t => [{ text: `👷 ${t.name}`, callback_data: `assign_tech_${t.id}` }])
            await (client as any).sendMessage(chatId, '🧑‍🔧 Pilih Teknisi yang akan ditugaskan:', { reply_markup: { inline_keyboard: keyboard } })
          }
        }
      } else if (data && data.startsWith('assign_tech_')) {
        const techId = data.replace('assign_tech_', '')
        const session = createOrderSessions.get(chatId)
        if (session && session.type === 'create_order') {
          // Dapatkan user HD untuk created_by
          const { data: creator } = await supabaseAdmin
            .from('users').select('id, name').eq('telegram_id', String(telegramId)).maybeSingle()
          const createdById = creator?.id
          if (!createdById) {
            await (client as any).sendMessage(chatId, '❌ Anda belum terdaftar sebagai user.')
          } else {
            const payload: any = {
              order_id: session.data.order_id,
              customer_name: session.data.customer_name,
              customer_address: session.data.customer_address,
              contact: session.data.contact,
              sto: session.data.sto,
              transaction_type: session.data.transaction_type,
              service_type: session.data.service_type,
              created_by: createdById,
              assigned_technician: techId,
              status: 'Pending',
              technician_assigned_at: nowJakartaIso(),
            }
            const { data: inserted, error: insertError } = await supabaseAdmin
              .from('orders')
              .insert(payload)
              .select('*')
              .maybeSingle()
            if (insertError || !inserted) {
              const reasonParts = [] as string[]
              if (insertError?.message) reasonParts.push(insertError.message)
              if ((insertError as any)?.details) reasonParts.push((insertError as any).details)
              if ((insertError as any)?.hint) reasonParts.push((insertError as any).hint)
              if ((insertError as any)?.code) reasonParts.push(`code=${(insertError as any).code}`)
              const reasonText = reasonParts.length ? reasonParts.join(' | ') : 'Tidak diketahui'
              await (client as any).sendMessage(
                chatId,
                `❌ Gagal membuat order.\n\nAlasan: ${reasonText}\n\nSilakan pilih teknisi lain atau ulangi proses.`,
                { parse_mode: 'Markdown' }
              )
              // Tetap pertahankan sesi agar pengguna bisa coba lagi memilih teknisi
            } else {
              // Ambil nama teknisi dan telegram id untuk notifikasi
              const { data: tech } = await supabaseAdmin
                .from('users').select('name, telegram_id').eq('id', techId).maybeSingle()
              const techName = tech?.name || '-' 
              await sendOrderCreatedSuccess(client as any, chatId, payload, techName)
              // Notifikasi teknisi
              if (tech?.telegram_id) {
                const notif = '📢 Order baru ditugaskan kepada Anda\n\n' +
                  `🆔 ${payload.order_id} - ${payload.customer_name}\n` +
                  `📍 ${payload.customer_address}\n` +
                  `🏢 STO: ${payload.sto}\n` +
                  `📦 ${payload.transaction_type} | ${payload.service_type}`
                await (client as any).sendMessage(Number(tech.telegram_id), notif)
              }
              createOrderSessions.delete(chatId)
            }
          }
        }
      } else if (data === 'back_to_main') {
        await handleStart(client as any, chatId, telegramId)
      }
      return NextResponse.json({ ok: true })
    }

    // 2) Handle replies to ODP/SN prompts dan pencarian order
    if (update?.message?.reply_to_message && typeof text === 'string') {
      const replyText: string = update.message.reply_to_message.text || ''

      // Create Order flow replies
      const handledCreate = await (handleCreateOrderReply as any)(client as any, chatId, telegramId, replyText, text)
      if (handledCreate) {
        return NextResponse.json({ ok: true })
      }

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
      // Pencarian Order
      const searchMatch = replyText.match(/(Masukkan ORDER ID atau No HP pelanggan|Cek Detail Order)/i)
      if (searchMatch) {
        const q = text.trim()
        const { data: results } = await supabaseAdmin
          .from('orders')
          .select('*')
          .or(`order_id.eq.${q},contact.ilike.%${q}%,customer_name.ilike.%${q}%`)
          .order('updated_at', { ascending: false })
          .limit(5)
        if (!results || results.length === 0) {
          await (client as any).sendMessage(chatId, '❌ Tidak ada order yang cocok.')
        } else {
          for (const order of results) {
            const { data: evidence } = await supabaseAdmin.from('evidence').select('*').eq('order_id', order.order_id).maybeSingle()
            let createdByName: string | undefined
            if (order.created_by) {
              const { data: creator } = await supabaseAdmin.from('users').select('name').eq('id', order.created_by).maybeSingle()
              createdByName = creator?.name
            }
            let assignedTechName: string | undefined
            let assignedTechRole: string | undefined
            let assignedAtIso: string | undefined
            if (order.assigned_technician) {
              const { data: tech } = await supabaseAdmin.from('users').select('name, role').eq('id', order.assigned_technician).maybeSingle()
              assignedTechName = tech?.name
              assignedTechRole = tech?.role || 'Teknisi'
              assignedAtIso = order.updated_at
            }
            await (client as any).sendMessage(chatId, `${formatOrderDetail(order, evidence, createdByName, assignedTechName, assignedAtIso, assignedTechRole)}`)
          const role = await (getUserRole as any)(telegramId)
          const menuRole = role === 'HD' ? 'HD' : (role || 'Teknisi')
          await (client as any).sendMessage(chatId, 'Pilih menu:', (getReplyMenuKeyboard as any)(menuRole))
          }
        }
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
    } else if (createOrderSessions.has(chatId) && typeof text === 'string') {
      // Tangani input teks bertahap untuk create order inline
      const _handled = await handleCreateOrderTextInput(client as any, chatId, telegramId, text)
      if (_handled) {
        return NextResponse.json({ ok: true })
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
        createOrderSessions.set(chatId, { type: 'create_order', step: 'order_id', data: {} })
        await (client as any).sendMessage(chatId, '📋 Membuat Order Baru\n\n🆔 Silakan masukkan Order ID:', { parse_mode: 'HTML' })
      } else {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat membuat order.')
      }
    } else if ((text || '').toLowerCase().includes('cek order')) {
      await (client as any).sendMessage(
        chatId,
        `🔍 Cek Detail Order\n\nSilakan masukkan Order ID yang ingin Anda cari:\n\n📝 Format: Ketik order ID (contoh: ORD-001)\n💡  Pastikan Order ID yang dimasukkan benar`,
        { reply_markup: { force_reply: true } }
      )
    } else if (text === '📊 Show Order On Progress') {
      // Role must be HD
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'HD') {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat melihat order on progress.')
        return NextResponse.json({ ok: true })
      }
      // Throttle per chat: ignore if sent within last 60s
      const last = progressSpamGuard.get(chatId)
      if (last && (nowSec - last) < 60) {
        return NextResponse.json({ ok: true, dropped: 'progress_throttled' })
      }
      progressSpamGuard.set(chatId, nowSec)

      const { data: orders, error } = await supabaseAdmin
        .from('orders')
        .select('*')
        .is('e2e_timestamp', null)
        .order('order_id', { ascending: true })

      if (error) {
        await (client as any).sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order on progress.')
      } else if (!orders || orders.length === 0) {
        await (client as any).sendMessage(chatId,
          '📊 ORDER ON PROGRESS\n\n' +
          'Tidak ada order yang sedang dalam progress.\n\n' +
          '✅ Semua order sudah completed.'
        )
      } else {
        let message = '📊 ORDER ON PROGRESS\n\n'
        message += `Total: ${orders.length} order sedang dalam progress\n\n`

        const statusEmojiMap: Record<string, string> = {
          'Pending': '⏳',
          'In Progress': '🔄',
          'On Hold': '⏸️',
          'Completed': '✅',
          'Closed': '🔒'
        }

        for (let i = 0; i < orders.length; i++) {
          const order = orders[i]
          const statusEmoji = statusEmojiMap[order.status] || '⚪'
          const createdDate = formatWIB(order.created_at)
          const sodDate = order.sod_timestamp ? formatWIB(order.sod_timestamp) : ''

          message += `${i + 1}. ${order.order_id}/${order.customer_name}\n`
          message += `Status: ${statusEmoji} ${order.status}\n`
          message += `STO: ${order.sto || ''}\n`
          message += `Type: ${order.transaction_type || ''}\n`
          message += `Layanan: ${order.service_type || ''}\n`
          message += `Dibuat: ${createdDate}\n`
          message += `SOD: ${sodDate}\n\n`
        }

        if (message.length > 4000) {
          // Simple split by chunks while respecting newlines
          let start = 0
          const chunkSize = 3500
          while (start < message.length) {
            const end = Math.min(start + chunkSize, message.length)
            // try to split at the last newline within the chunk
            let splitPos = message.lastIndexOf('\n', end)
            if (splitPos <= start) splitPos = end
            await (client as any).sendMessage(chatId, message.slice(start, splitPos))
            start = splitPos
          }
        } else {
          await (client as any).sendMessage(chatId, message)
        }
      }
    } else if (text === '✅ Show Order Completed') {
      // Mirror bot.js: show month picker first
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'HD') {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat melihat order completed.')
        return NextResponse.json({ ok: true })
      }
      const currentDate = new Date()
      const currentMonth = currentDate.getMonth() + 1
      const currentYear = currentDate.getFullYear()

      let message = '✅ ORDER COMPLETED\n\n'
      message += 'Pilih bulan untuk melihat order yang sudah completed:\n\n'

      const keyboard: any[] = []
      for (let i = 0; i < 2; i++) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1)
        const month = d.getMonth() + 1
        const year = d.getFullYear()
        const monthName = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
        keyboard.push([{ text: `📅 ${monthName}`, callback_data: `completed_month_${month.toString().padStart(2, '0')}_${year}` }])
      }
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_to_main' }])

      await (client as any).sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } })
    } else if (text === '👥 Assign Teknisi') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'HD') {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat melakukan assignment.')
      } else {
        await (showOrderSelectionForStageAssignment as any)(client as any, chatId, telegramId)
      }
    } else if (text === '🚀 Update SOD' || text === '🎯 Update E2E') {
      await (client as any).sendMessage(chatId, 'ℹ️ Fitur ini sedang dimigrasikan. Akan segera tersedia.')
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