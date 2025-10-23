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
      } else if (data === 'search_order') {
        await (client as any).sendMessage(chatId, '🔍 Masukkan ORDER ID atau No HP pelanggan:', { reply_markup: { force_reply: true } })
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
      const searchMatch = replyText.match(/Masukkan ORDER ID atau No HP pelanggan/i)
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
        await (startCreateOrderFlow as any)(client as any, chatId, telegramId)
      } else {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat membuat order.')
      }
    } else if ((text || '').toLowerCase().includes('cek order')) {
      await (client as any).sendMessage(chatId, '🔍 Masukkan ORDER ID atau No HP pelanggan:', { reply_markup: { force_reply: true } })
    } else if (text === '📊 Show Order On Progress' || (text || '').toLowerCase().includes('show order on progress')) {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('status', 'In Progress')
        .order('updated_at', { ascending: false })
        .limit(10)
      if (!orders || orders.length === 0) {
        await (client as any).sendMessage(chatId, '📊 Tidak ada order In Progress.')
      } else {
        const header = '📊 Order On Progress (Top 10)\n'
        await (client as any).sendMessage(chatId, header)
        for (const order of orders) {
          await (client as any).sendMessage(chatId, `${formatOrderSummary(order)}`, {
            reply_markup: {
              inline_keyboard: [[{ text: '📄 Detail', callback_data: `detail_order_${order.order_id}` }]]
            }
          })
        }
      }
    } else if (text === '✅ Show Order Completed' || (text || '').toLowerCase().includes('show order completed')) {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('*')
        .in('status', ['Completed', 'Closed'])
        .order('updated_at', { ascending: false })
        .limit(10)
      if (!orders || orders.length === 0) {
        await (client as any).sendMessage(chatId, '✅ Belum ada order Completed/Closed terbaru.')
      } else {
        const header = '✅ Order Completed/Closed (Top 10)\n'
        await (client as any).sendMessage(chatId, header)
        for (const order of orders) {
          await (client as any).sendMessage(chatId, `${formatOrderSummary(order)}`, {
            reply_markup: {
              inline_keyboard: [[{ text: '📄 Detail', callback_data: `detail_order_${order.order_id}` }]]
            }
          })
        }
      }
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