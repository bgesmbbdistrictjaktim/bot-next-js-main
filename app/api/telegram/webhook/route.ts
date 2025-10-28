import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { createHttpBotClient } from '@/lib/telegramClient'
import { handleStart } from '@/lib/botHandlers/start'
import { handleHelp } from '@/lib/botHandlers/help'
import { checkUserRegistration, handleRegistrationCallback } from '@/lib/botHandlers/registration'
import { showWelcomeMessage } from '@/lib/botHandlers/welcome'
import { showMyOrders } from '@/lib/botHandlers/orders'
import { showProgressMenu } from '@/lib/botHandlers/progress'
import { showEvidenceMenu } from '@/lib/botHandlers/evidence'
import { getUserRole, getStatusEmoji, getProgressStatusEmoji, formatAssignmentSimple, sortOrdersNewestFirst } from '@/lib/botUtils'
import { supabaseAdmin } from '@/lib/supabase'
import { showOrderSelectionForStageAssignment, showStageAssignmentMenu, showTechnicianSelectionForStage, assignTechnicianToStage, showTechnicianSelectionForAllStages, assignTechnicianToAllStages } from '@/lib/botHandlers/assignment'
import { startCreateOrderFlow, handleCreateOrderReply, showDirectAssignmentTechnicians, assignTechnicianDirectly } from '@/lib/botHandlers/createOrder'
import { getReplyMenuKeyboard } from '@/lib/botMenus'
import { uploadPhotoToSupabase, downloadPhotoFromTelegram } from '@/lib/fileStorage'

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

// Formatter detail sesuai format contoh pengguna, lengkap dengan TTI, progress, assignment, dan evidence
async function formatOrderDetail(order: any, evidence?: any, createdByName?: string, assignedTechName?: string, assignedAtIso?: string, assignedTechRole?: string) {
  const lines: string[] = []
  lines.push('📋 DETAIL LENGKAP ORDER')
  lines.push('')
  lines.push(`🆔 Order ID: ${order.order_id || order.id}`)
  lines.push(`🔒 Status: ${order.status || '-'}`)
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
  lines.push(`• SOD Time: ${order.sod_timestamp ? formatWIB(order.sod_timestamp) : 'Belum diset'}`)
  lines.push(`• E2E Time: ${order.e2e_timestamp ? formatWIB(order.e2e_timestamp) : 'Belum diset'}`)
  lines.push(`• LME PT2 Start: ${order.lme_pt2_start ? formatWIB(order.lme_pt2_start) : 'Belum diset'}`)
  lines.push(`• LME PT2 End: ${order.lme_pt2_end ? formatWIB(order.lme_pt2_end) : 'Belum diset'}`)
  lines.push('')
  // 🎯 TTI COMPLY
  lines.push('🎯 TTI COMPLY')
  // Derive TTI status & actual duration when E2E exists, even if DB fields haven't updated yet
  const hasE2E = !!order.e2e_timestamp
  let ttiStatus = order.tti_comply_status || ''
  let ttiActualDuration = order.tti_comply_actual_duration || ''
  if (hasE2E && order.sod_timestamp) {
    try {
      const sodIso = String(order.sod_timestamp).replace(' ', 'T')
      const e2eIso = String(order.e2e_timestamp).replace(' ', 'T')
      const sodTime = new Date(sodIso)
      const e2eTime = new Date(e2eIso)
      const durationHours = (e2eTime.getTime() - sodTime.getTime()) / 36e5
      const computedStatus = durationHours <= 72 ? 'Comply' : 'Not Comply'
      const readable = formatReadableDuration(durationHours)
      const e2eDate = e2eTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
      const computedDuration = `${readable} (${e2eDate})`
      if (!ttiStatus || ttiStatus === 'In Progress') ttiStatus = computedStatus
      if (!ttiActualDuration || ttiActualDuration === '-') ttiActualDuration = computedDuration
    } catch {}
  }
  lines.push(`• Deadline: ${order.tti_comply_deadline ? formatWIB(order.tti_comply_deadline) : '-'}`)
  lines.push(`• Status: ${ttiStatus || (hasE2E ? 'Comply' : (order.tti_comply_status || '-'))}`)
  lines.push(`• Durasi Aktual: ${ttiActualDuration || (hasE2E ? '-' : (order.tti_comply_actual_duration || '-'))}`)
  lines.push('')
  // 📈 INFORMASI TRACK PROGRESS
  const { data: progress } = await supabaseAdmin
    .from('progress_new')
    .select('*')
    .eq('order_id', order.order_id)
    .maybeSingle()
  lines.push('INFORMASI TRACK PROGRESS')
  const stageLine = (label: string, data?: any) => {
    const st = data?.status
    const emoji = getProgressStatusEmoji(st || '')
    const time = data?.timestamp ? formatIndonesianDateTime(data.timestamp) : undefined
    const tech = data?.technician
    const note = data?.note
    let line = `• ${label}: ${emoji} ${st || '-'}`
    if (note) { line += ` (${note})` }
    if (time && tech) { line += ` - ${time} - ${tech}` }
    else if (time) { line += ` - ${time}` }
    else if (tech) { line += ` - ${tech}` }
    return line
  }
  lines.push(stageLine('Survey Jaringan', progress?.survey_jaringan))
  lines.push(stageLine('Penarikan Kabel', progress?.penarikan_kabel))
  lines.push(stageLine('Instalasi ONT', progress?.instalasi_ont))
  lines.push(stageLine('P2P', progress?.p2p))
  lines.push('')
  // 👥 ASSIGNMENT TEKNISI PER STAGE
  lines.push('👥 ASSIGNMENT TEKNISI PER STAGE')
  const { data: assignments } = await supabaseAdmin
    .from('order_stage_assignments')
    .select('stage, status, assigned_at, users!assigned_technician(name)')
    .eq('order_id', order.order_id)
  const assignmentMap: Record<string, any> = {}
  ;(assignments || []).forEach(a => { assignmentMap[a.stage] = a })
  const stageMapLabels: Record<string, string> = {
    Survey: 'Survey',
    Penarikan: 'Penarikan',
    P2P: 'P2P',
    Instalasi: 'Instalasi',
    Evidence: 'Evidence',
  }
  const stagesOrder = ['Survey', 'Penarikan', 'Instalasi', 'P2P', 'Evidence']
  for (const stg of stagesOrder) {
    const a = assignmentMap[stg]
    if (a && a.users?.name) {
      const statusText = a.status || 'assigned'
      lines.push(`• ${stageMapLabels[stg]}: ${statusText} - ${a.users.name}`)
    } else {
      lines.push(`• ${stageMapLabels[stg]}: Belum di-assign`)
    }
  }
  lines.push('')
  // 📸 EVIDENCE UPLOADED
  lines.push('📸 EVIDENCE UPLOADED')
  if (evidence) {
    lines.push(`• ODP Name: ${evidence.odp_name || '-'}`)
    lines.push(`• ONT SN: ${evidence.ont_sn || '-'}`)
    const totalPhotos = ['photo_sn_ont','photo_technician_customer','photo_customer_house','photo_odp_front','photo_odp_inside','photo_label_dc','photo_test_result'].filter(k => (evidence as any)[k]).length
    lines.push(`• Foto terupload: ${totalPhotos}/7`)
    lines.push(`• Upload terakhir: ${formatWIB(evidence.updated_at || order.updated_at)}`)
  } else {
    lines.push('• Belum ada evidence')
  }
  return lines.join('\n')
}

// Simple in-memory dedupe for dev to prevent double-processing
const processedUpdateIds = new Set<number>()
// Guard to throttle progress messages per chat
const progressSpamGuard = new Map<number, number>()

// Session create order (inline flow)
const createOrderSessions = new Map<number, { type: 'create_order', step: string, data: any }>()
const progressUpdateSessions = new Map<number, { type: 'update_progress', orderId: string, stage: 'penarikan_kabel' | 'p2p' | 'instalasi_ont' }>()
const evidenceUploadSessions = new Map<number, { type: 'upload_evidence', orderId: string, waitingInput?: 'odp_name' | 'ont_sn', nextIndex?: number, processedPhotoIds?: Set<string>, processing?: boolean }>()
// Session for registration custom name input
const registrationNameSessions = new Map<number, { role: 'HD' | 'Teknisi' }>()

const STO_OPTIONS = ['CBB','CWA','GAN','JTN','KLD','KRG','PKD','PGB','KLG','PGG','PSR','RMG','PGN','BIN','CPE','JAG','KLL','KBY','KMG','TBE','NAS']
const TRANSACTION_OPTIONS = ['Disconnect','Modify','New install existing','New install jt','New install','PDA']
const SERVICE_OPTIONS = ['Astinet','Metro','Vpn Ip','Ip Transit','Siptrunk']

// Canonical mapping to satisfy DB check constraint orders_service_type_check
const SERVICE_CANONICAL_MAP: Record<string, string> = {
  Astinet: 'Astinet',
  Metro: 'metro',
  'Vpn Ip': 'vpn ip',
  'Ip Transit': 'ip transit',
  Siptrunk: 'siptrunk',
}
function normalizeServiceType(val: string): string {
  const t = (val || '').trim()
  return SERVICE_CANONICAL_MAP[t] ?? t
}

// Canonical mapping for transaction_type to satisfy DB check constraint
const TRANSACTION_CANONICAL_MAP: Record<string, string> = {
  Disconnect: 'Disconnect',
  Modify: 'modify',
  'New install existing': 'new install existing',
  'New install jt': 'new install jt',
  'New install': 'new install',
  PDA: 'PDA',
}
function normalizeTransactionType(val: string): string {
  const t = (val || '').trim()
  return TRANSACTION_CANONICAL_MAP[t] ?? t.toLowerCase()
}

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
      let orderId: string | undefined = replyText?.match(/UPLOAD_FOTO_ORDER\s+(\S+)/)?.[1]
      // Fallback ke sesi evidence jika bukan reply
      if (!orderId) {
        const evSess = evidenceUploadSessions.get(chatId)
        if (evSess && evSess.type === 'upload_evidence') {
          orderId = evSess.orderId
        }
      }
      if (!orderId) {
        await (client as any).sendMessage(chatId, '⚠️ Kirim foto sebagai balasan ke pesan instruksi evidence agar bisa diproses. Jika tetap gagal, ulangi dari menu 📸 Upload Evidence untuk mendapatkan ulang instruksi.')
        return NextResponse.json({ ok: true })
      }

      // Get current evidence record
      const { data: evidence } = await supabaseAdmin
        .from('evidence')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle()

      const sess = evidenceUploadSessions.get(chatId)

      // Guard: jika sedang memproses, minta tunggu
      if (sess?.processing) {
        await (client as any).sendMessage(chatId, '⏳ Sedang memproses foto sebelumnya. Kirim foto berikutnya setelah pesan sukses muncul.')
        return NextResponse.json({ ok: true })
      }

      // Dedup berdasarkan file_unique_id — beri umpan balik agar tidak terkesan "diam"
      const uniqueId: string | undefined = update.message.photo[update.message.photo.length - 1]?.file_unique_id
      if (uniqueId && sess?.processedPhotoIds?.has(uniqueId)) {
        if (sess) {
          sess.processing = false
          evidenceUploadSessions.set(chatId, sess)
        }
        await (client as any).sendMessage(chatId, '⚠️ Foto yang sama terdeteksi (duplikat). Silakan kirim foto berikutnya sesuai urutan.')
        return NextResponse.json({ ok: true })
      }

      // Tentukan field berikutnya: gunakan pointer sesi jika ada, kalau tidak dari DB
      let nextField = null as null | { index: number, field: string, label: string }
      if (sess?.nextIndex && sess.nextIndex >= 1 && sess.nextIndex <= PHOTO_TYPES.length) {
        const candidate = PHOTO_TYPES[sess.nextIndex - 1]
        if (!evidence || !evidence[candidate.field]) {
          nextField = { index: sess.nextIndex, field: candidate.field, label: candidate.label }
        }
      }
      if (!nextField) {
        nextField = getNextMissingPhotoField(evidence)
      }

      if (!nextField) {
        await (client as any).sendMessage(chatId, '✅ Semua 7 foto evidence sudah terupload.', getReplyMenuKeyboard('Teknisi'))
        // Close order
        await supabaseAdmin.from('orders').update({ status: 'Closed' }).eq('order_id', orderId)
        evidenceUploadSessions.delete(chatId)
        return NextResponse.json({ ok: true })
      }

      // Set flag processing
      if (sess) {
        sess.processing = true
        evidenceUploadSessions.set(chatId, sess)
      }

      const fileId: string = update.message.photo[update.message.photo.length - 1].file_id
      const fileUrl = await getTelegramFileUrl(token, fileId)
      const buffer = await downloadPhotoFromTelegram(fileUrl)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${orderId}-Evidence-${nextField.field}-${timestamp}.jpg`

      // Upload via shared util and save to evidence table
      try {
        const publicUrl = await uploadPhotoToSupabase(buffer, filename, 'image/jpeg')
        const updatePayload: any = {}
        updatePayload[nextField.field] = publicUrl
        updatePayload.uploaded_at = nowJakartaWithOffset()
        const { data: evPhoto } = await supabaseAdmin
          .from('evidence')
          .select('order_id')
          .eq('order_id', orderId)
          .maybeSingle()
        if (evPhoto) {
          await supabaseAdmin.from('evidence').update(updatePayload).eq('order_id', orderId)
        } else {
          await supabaseAdmin.from('evidence').insert({ order_id: orderId, ...updatePayload })
        }
      } catch (uploadError) {
        if (sess) {
          sess.processing = false
          evidenceUploadSessions.set(chatId, sess)
        }
        await (client as any).sendMessage(chatId, '❌ Gagal mengupload foto evidence.')
        return NextResponse.json({ ok: true })
      }

      // Tandai processed & advance pointer (session-first, fallback DB)
      if (sess) {
        if (!sess.processedPhotoIds) sess.processedPhotoIds = new Set<string>()
        if (uniqueId) sess.processedPhotoIds.add(uniqueId)

        // Advance session pointer optimistically
        const nextIdx = nextField.index + 1
        if (nextIdx > PHOTO_TYPES.length) {
          // All 7 done — close order and clear session
          await supabaseAdmin.from('orders').update({ status: 'Closed' }).eq('order_id', orderId)
          evidenceUploadSessions.delete(chatId)
          const finalMsg = `✅ ${nextField.label} berhasil diupload (${nextField.index}/7).\n\nSEMUA EVIDENCE BERHASIL DIUPLOAD`
          await (client as any).sendMessage(chatId, finalMsg, getReplyMenuKeyboard('Teknisi'))
          return NextResponse.json({ ok: true })
        }

        sess.nextIndex = nextIdx
        sess.processing = false
        evidenceUploadSessions.set(chatId, sess)

        // Fallback: verify from DB in case of out-of-sync writes
        const { data: verifyEvidence } = await supabaseAdmin
          .from('evidence')
          .select('*')
          .eq('order_id', orderId)
          .maybeSingle()
        const dbNext = getNextMissingPhotoField(verifyEvidence)
        if (dbNext && dbNext.index !== sess.nextIndex) {
          sess.nextIndex = dbNext.index
          evidenceUploadSessions.set(chatId, sess)
        } else if (!dbNext) {
          // Completed by DB view — close order
          await supabaseAdmin.from('orders').update({ status: 'Closed' }).eq('order_id', orderId)
          evidenceUploadSessions.delete(chatId)
          const finalMsg = `✅ ${nextField.label} berhasil diupload (${nextField.index}/7).\n\nSEMUA EVIDENCE BERHASIL DIUPLOAD`
          await (client as any).sendMessage(chatId, finalMsg, getReplyMenuKeyboard('Teknisi'))
          return NextResponse.json({ ok: true })
        }
      }

      await (client as any).sendMessage(chatId, `✅ ${nextField.label} berhasil diupload (${nextField.index}/7).`, getReplyMenuKeyboard('Teknisi'))
      await (client as any).sendMessage(chatId, `👆 Balas pesan instruksi evidence dengan foto berikutnya.`)
      return NextResponse.json({ ok: true })
    }

    // 0.5) Handle plain text input for sessions (Registration Name, Evidence, Progress, Create Order)
    if (update?.message?.text) {
      // Handle registration custom-name input first
      const regSess = registrationNameSessions.get(chatId)
      if (regSess) {
        const typedName = (update.message.text || '').trim()
        if (!typedName || typedName.length < 2) {
          await (client as any).sendMessage(chatId, '⚠️ Nama terlalu pendek. Masukkan minimal 2 karakter.')
          return NextResponse.json({ ok: true })
        }
        const { data: existing } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('telegram_id', String(telegramId))
          .maybeSingle()
        if (!existing) {
          const { error: insertErr } = await supabaseAdmin
            .from('users')
            .insert({ telegram_id: String(telegramId), name: typedName, role: regSess.role })
          if (insertErr) {
            await (client as any).sendMessage(chatId, `❌ Gagal mendaftar: ${insertErr.message}`)
            registrationNameSessions.delete(chatId)
            return NextResponse.json({ ok: true })
          }
        } else {
          await supabaseAdmin
            .from('users')
            .update({ name: typedName, role: regSess.role })
            .eq('telegram_id', String(telegramId))
        }
        await (showWelcomeMessage as any)(client as any, chatId, regSess.role, typedName)
        registrationNameSessions.delete(chatId)
        return NextResponse.json({ ok: true })
      }

      // Handle evidence text input (ODP name / SN ONT)
      const evSess = evidenceUploadSessions.get(chatId)
      if (evSess && evSess.type === 'upload_evidence') {
        const t = (update.message.text || '').trim()
        if (evSess.waitingInput === 'odp_name') {
          const { data: evODPExist } = await supabaseAdmin
            .from('evidence')
            .select('order_id')
            .eq('order_id', evSess.orderId)
            .maybeSingle()
          if (evODPExist) {
            await supabaseAdmin
              .from('evidence')
              .update({ odp_name: t, uploaded_at: nowJakartaWithOffset() })
              .eq('order_id', evSess.orderId)
          } else {
            await supabaseAdmin
              .from('evidence')
              .insert({ order_id: evSess.orderId, odp_name: t, uploaded_at: nowJakartaWithOffset() })
          }

          evSess.waitingInput = 'ont_sn'
          evidenceUploadSessions.set(chatId, evSess)
          await (client as any).sendMessage(chatId, `✅ ODP: ${t}\n\n2️⃣ Silakan masukkan SN ONT untuk ORDER ${evSess.orderId}:`, { reply_markup: { force_reply: true } })
          return NextResponse.json({ ok: true })
        }
        if (evSess.waitingInput === 'ont_sn') {
          const { data: evSNExist } = await supabaseAdmin
            .from('evidence')
            .select('order_id')
            .eq('order_id', evSess.orderId)
            .maybeSingle()
          if (evSNExist) {
            await supabaseAdmin
              .from('evidence')
              .update({ ont_sn: (t || '-'), uploaded_at: nowJakartaWithOffset() })
              .eq('order_id', evSess.orderId)
          } else {
            await supabaseAdmin
              .from('evidence')
              .insert({ order_id: evSess.orderId, ont_sn: (t || '-'), uploaded_at: nowJakartaWithOffset() })
          }

          // Ready to start photo uploads
          evSess.waitingInput = undefined
          evSess.nextIndex = 1
          evSess.processing = false
          evSess.processedPhotoIds = new Set<string>()
          evidenceUploadSessions.set(chatId, evSess)

          // Fetch ODP name to display together with SN ONT
          const { data: evInfo } = await supabaseAdmin
            .from('evidence')
            .select('odp_name, ont_sn')
            .eq('order_id', evSess.orderId)
            .maybeSingle()
          const odpName = evInfo?.odp_name || '-'
          const snOnt = evInfo?.ont_sn || (t || '-')

          const items = PHOTO_TYPES.map((p, i) => `${i + 1}. ${p.label}`).join('\n')
          await (client as any).sendMessage(
            chatId,
            `📸 Instruksi Upload Evidence\n\n` +
            `🆔 ORDER ${evSess.orderId}\n` +
            `📌 ODP: ${odpName}\n` +
            `🔖 SN ONT: ${snOnt}\n\n` +
            `Kirim 7 foto sesuai urutan berikut dengan membalas pesan ini:\n\n` +
            `${items}\n\n` +
            `UPLOAD_FOTO_ORDER ${evSess.orderId}`
          )
          return NextResponse.json({ ok: true })
        }
      }
      // Handle progress note session first
      const prog = progressUpdateSessions.get(chatId)
      if (prog && prog.type === 'update_progress') {
        const handledProg = await handleProgressTextInput(client as any, chatId, telegramId, update.message.text, prog)
        if (handledProg) {
          progressUpdateSessions.delete(chatId)
          return NextResponse.json({ ok: true })
        }
      }
      // Then handle create order session
      const session = createOrderSessions.get(chatId)
      if (session && session.type === 'create_order') {
        const handled = await handleCreateOrderTextInput(client as any, chatId, telegramId, update.message.text)
        if (handled) {
          return NextResponse.json({ ok: true })
        }
      }
    }

    // 1) route callback_query
    if (update?.callback_query) {
      const data: string = update.callback_query.data
      // Acknowledge callback to stop Telegram spinner
      try { await (client as any).answerCallbackQuery(update.callback_query.id) } catch (_) {}
      // Handle registration callbacks first
      const regRes = await (handleRegistrationCallback as any)(client as any, update.callback_query)
      if (regRes && typeof regRes === 'object' && (regRes as any).requiresNameInput && (regRes as any).role) {
        registrationNameSessions.set(chatId, { role: (regRes as any).role })
        return NextResponse.json({ ok: true })
      }

      if (data === 'create_order') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat membuat order.')
        } else {
          // Mulai flow create order inline berbasis sesi
          createOrderSessions.set(chatId, { type: 'create_order', step: 'order_id', data: {} })
          await (client as any).sendMessage(chatId, '📋 Membuat Order Baru\n\n🆔 Silakan masukkan Order ID:')
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
      } else if (data && data.startsWith('progress_order_')) {
        const orderId = data.replace('progress_order_', '')
        await showProgressStages(client as any, chatId, orderId)
      } else if (data && data.startsWith('progress_survey_')) {
        const orderId = data.replace('progress_survey_', '')
        await promptSurveyOptions(client as any, chatId, orderId)
      } else if (data && data.startsWith('survey_ready_')) {
        const orderId = data.replace('survey_ready_', '')
        await handleSurveyResult(client as any, chatId, telegramId, orderId, true)
      } else if (data && data.startsWith('survey_not_ready_')) {
        const orderId = data.replace('survey_not_ready_', '')
        await handleSurveyResult(client as any, chatId, telegramId, orderId, false)
      } else if (data && data.startsWith('progress_penarikan_')) {
        const orderId = data.replace('progress_penarikan_', '')
        await promptStageOptions(client as any, chatId, 'penarikan_kabel', 'Penarikan Kabel', orderId)
      } else if (data && data.startsWith('progress_p2p_')) {
        const orderId = data.replace('progress_p2p_', '')
        await promptStageOptions(client as any, chatId, 'p2p', 'P2P', orderId)
      } else if (data && data.startsWith('progress_instalasi_')) {
        const orderId = data.replace('progress_instalasi_', '')
        await promptStageOptions(client as any, chatId, 'instalasi_ont', 'Instalasi ONT', orderId)
      } else if (data && data.startsWith('penarikan_done_')) {
        const orderId = data.replace('penarikan_done_', '')
        await markStageCompleted(client as any, chatId, telegramId, orderId, 'penarikan_kabel', 'Penarikan Kabel')
      } else if (data && data.startsWith('p2p_done_')) {
        const orderId = data.replace('p2p_done_', '')
        await markStageCompleted(client as any, chatId, telegramId, orderId, 'p2p', 'P2P')
      } else if (data && data.startsWith('instalasi_done_')) {
        const orderId = data.replace('instalasi_done_', '')
        await markStageCompleted(client as any, chatId, telegramId, orderId, 'instalasi_ont', 'Instalasi ONT')
      } else if (data && data.startsWith('add_note_penarikan_')) {
        const orderId = data.replace('add_note_penarikan_', '')
        progressUpdateSessions.set(chatId, { type: 'update_progress', orderId, stage: 'penarikan_kabel' })
        await (client as any).sendMessage(chatId, `📝 Tambah Catatan - Penarikan Kabel\n\n🆔 ORDER ${orderId}\n\nSilakan kirim catatan Anda:`)
      } else if (data && data.startsWith('add_note_p2p_')) {
        const orderId = data.replace('add_note_p2p_', '')
        progressUpdateSessions.set(chatId, { type: 'update_progress', orderId, stage: 'p2p' })
        await (client as any).sendMessage(chatId, `📝 Tambah Catatan - P2P\n\n🆔 ORDER ${orderId}\n\nSilakan kirim catatan Anda:`)
      } else if (data && data.startsWith('add_note_instalasi_')) {
        const orderId = data.replace('add_note_instalasi_', '')
        progressUpdateSessions.set(chatId, { type: 'update_progress', orderId, stage: 'instalasi_ont' })
        await (client as any).sendMessage(chatId, `📝 Tambah Catatan - Instalasi ONT\n\n🆔 ORDER ${orderId}\n\nSilakan kirim catatan Anda:`)
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
          await (client as any).sendMessage(chatId, await formatOrderDetail(order, evidence, createdByName, assignedTechName, assignedAtIso, assignedTechRole))


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

          await (client as any).sendMessage(chatId, await formatOrderDetail(order, evidence, createdByName, assignedTechName, assignedAtIso, assignedTechRole))
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
      } else if (data === 'back_to_menu') {
        await handleStart(client as any, chatId, telegramId)
      } else if (data === 'sod_menu') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
        } else {
          await showSODUpdateMenu(client as any, chatId, telegramId)
        }
      } else if (data === 'select_order_for_sod') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
        } else {
          await showSODOrderSelection(client as any, chatId, telegramId)
        }
      } else if (data && data.startsWith('sod_order_')) {
        const orderId = data.replace('sod_order_', '')
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat melakukan update.')
        } else {
          await handleSODUpdate(client as any, chatId, telegramId, orderId)
        }
      } else if (data === 'select_order_for_lme_pt2') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
        } else {
          await showLMEPT2OrderSelection(client as any, chatId, telegramId)
        }
      } else if (data === 'view_lme_pt2_history') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
        } else {
          await showLMEPT2History(client as any, chatId, telegramId)
        }
      } else if (data && data.startsWith('lme_pt2_order_')) {
        const orderId = data.replace('lme_pt2_order_', '')
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat melakukan update.')
        } else {
          await handleLMEPT2Update(client as any, chatId, telegramId, orderId)
        }
      } else if (data === 'e2e_menu') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
        } else {
          await showE2EUpdateMenu(client as any, chatId, telegramId)
        }
      } else if (data === 'select_order_for_e2e') {
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
        } else {
          await showE2EOrderSelection(client as any, chatId, telegramId)
        }
      } else if (data && data.startsWith('e2e_order_')) {
        const orderId = data.replace('e2e_order_', '')
        const role = await (getUserRole as any)(telegramId)
        if (role !== 'HD') {
          await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat melakukan update.')
        } else {
          await handleE2EUpdate(client as any, chatId, telegramId, orderId)
        }
      } else if (data && data.startsWith('evidence_order_')) {
        const orderId = data.split('_')[2]
        // Fetch order basic info
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('order_id, customer_name, customer_address')
          .eq('order_id', orderId)
          .maybeSingle()
        // Initialize evidence upload session to collect ODP then SN ONT
        evidenceUploadSessions.set(chatId, { type: 'upload_evidence', orderId, waitingInput: 'odp_name', processing: false })
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
                await (client as any).sendMessage(chatId, buf)
                buf = ''
              }
              buf += line + '\n'
            }
            await (client as any).sendMessage(chatId, buf.trim(), { reply_markup: { inline_keyboard: keyboard } })
          } else {
            await (client as any).sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } })
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
            // Fallback opsi: buat order tanpa teknisi lalu assign per stage
            keyboard.push([{ text: '👥 Assign per Stage (buat order dulu)', callback_data: 'create_without_tech' }])
            keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_to_main' }])
            await (client as any).sendMessage(chatId, '🧑‍🔧 Pilih Teknisi yang akan ditugaskan:', { reply_markup: { inline_keyboard: keyboard } })
          }
        }
      } else if (data && data.startsWith('assign_tech_')) {
        const techId = data.replace('assign_tech_', '')
        const session = createOrderSessions.get(chatId)
        if (!session || session.type !== 'create_order') {
          await (client as any).sendMessage(chatId, 'ℹ️ Sesi pembuatan order tidak aktif. Mulai dari menu “📋 Buat Order”.')
        } else {
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
              transaction_type: normalizeTransactionType(session.data.transaction_type),
              service_type: normalizeServiceType(session.data.service_type),
              created_by: createdById,
              assigned_technician: techId,
              status: 'Pending',
              technician_assigned_at: nowJakartaWithOffset(),
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
                `❌ Gagal membuat order.\n\nAlasan: ${reasonText}\n\nSilakan pilih teknisi lain atau ulangi proses.`
              )
              // Tetap pertahankan sesi agar pengguna bisa coba lagi memilih teknisi
            } else {
              // Ambil nama teknisi dan telegram id untuk notifikasi
              const { data: tech } = await supabaseAdmin
                .from('users').select('name, telegram_id').eq('id', techId).maybeSingle()
              const techName = tech?.name || '-' 
              await sendOrderCreatedSuccess(client as any, chatId, payload, techName)
              // Notifikasi teknisi (format baru konsisten)
              if (tech?.telegram_id) {
                const techMsg = formatAssignmentSimple(payload, { includeSecondaryHeader: false })
                await (client as any).sendMessage(Number(tech.telegram_id), techMsg)
              }
              createOrderSessions.delete(chatId)
            }
          }
        }
      } else if (data === 'create_without_tech') {
        const session = createOrderSessions.get(chatId)
        if (!session || session.type !== 'create_order') {
          await (client as any).sendMessage(chatId, 'ℹ️ Sesi pembuatan order tidak aktif. Mulai dari menu “📋 Buat Order”.')
        } else {
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
              transaction_type: normalizeTransactionType(session.data.transaction_type),
              service_type: normalizeServiceType(session.data.service_type),
              created_by: createdById,
              assigned_technician: null,
              status: 'Pending',
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
                `❌ Gagal membuat order tanpa teknisi.\n\nAlasan: ${reasonText}`
              )
            } else {
              await sendOrderCreatedSuccess(client as any, chatId, payload, '-')
              createOrderSessions.delete(chatId)
              // Setelah order dibuat, arahkan ke menu assign teknisi per stage utk order ini
              await (showStageAssignmentMenu as any)(client as any, chatId, telegramId, payload.order_id)
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
        const { data: evODP } = await supabaseAdmin
          .from('evidence')
          .select('order_id')
          .eq('order_id', orderId)
          .maybeSingle()
        if (evODP) {
          await supabaseAdmin.from('evidence').update({ odp_name: text, uploaded_at: nowJakartaWithOffset() }).eq('order_id', orderId)
        } else {
          await supabaseAdmin.from('evidence').insert({ order_id: orderId, odp_name: text, uploaded_at: nowJakartaWithOffset() })
        }
        await (client as any).sendMessage(chatId, `Masukkan SN ONT untuk ORDER ${orderId}:`, {
          reply_markup: { force_reply: true }
        })
        return NextResponse.json({ ok: true })
      }
      // SN ONT
      const snMatch = replyText.match(/Masukkan SN ONT untuk ORDER\s+(\S+)/)
      if (snMatch) {
        const orderId = snMatch[1]
        const { data: evSN } = await supabaseAdmin
          .from('evidence')
          .select('order_id')
          .eq('order_id', orderId)
          .maybeSingle()
        if (evSN) {
          await supabaseAdmin.from('evidence').update({ ont_sn: text, uploaded_at: nowJakartaWithOffset() }).eq('order_id', orderId)
        } else {
          await supabaseAdmin.from('evidence').insert({ order_id: orderId, ont_sn: text, uploaded_at: nowJakartaWithOffset() })
        }
        evidenceUploadSessions.set(chatId, { type: 'upload_evidence', orderId, nextIndex: 1, processedPhotoIds: new Set<string>(), processing: false })
        // Fetch ODP & SN ONT to display in instruction
        const { data: evInfo } = await supabaseAdmin
          .from('evidence')
          .select('odp_name, ont_sn')
          .eq('order_id', orderId)
          .maybeSingle()
        const odpName = evInfo?.odp_name || '-'
        const snOnt = evInfo?.ont_sn || '-'

        const items = PHOTO_TYPES.map((p, i) => `${i + 1}. ${p.label}`).join('\n')
        await (client as any).sendMessage(
          chatId,
          `📸 Instruksi Upload Evidence\n\n` +
          `🆔 ORDER ${orderId}\n` +
          `📌 ODP: ${odpName}\n` +
          `🔖 SN ONT: ${snOnt}\n\n` +
          `Kirim 7 foto sesuai urutan berikut dengan membalas pesan ini:\n\n` +
          `${items}\n\n` +
          `UPLOAD_FOTO_ORDER ${orderId}`
        )
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
          await handleStart(client as any, chatId, telegramId)
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
            await (client as any).sendMessage(chatId, await formatOrderDetail(order, evidence, createdByName, assignedTechName, assignedAtIso, assignedTechRole))
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
    // Reply keyboard texts (non-slash)
    } else if (text === '📋 Order Saya') {
      const role = await (getUserRole as any)(telegramId)
      if (!role) {
        await (client as any).sendMessage(chatId, '❌ Anda belum terdaftar. Gunakan /start untuk mendaftar.')
      } else {
        await (showMyOrders as any)(client as any, chatId, telegramId, role)
      }
    } else if (text === '📝 Update Progress') {
      await (showProgressMenu as any)(client as any, chatId, telegramId)
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
        await (client as any).sendMessage(chatId, '📋 Membuat Order Baru\n\n🆔 Silakan masukkan Order ID:')
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
    } else if (text === '🚀 Update SOD') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'HD') {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
      } else {
        await showSODUpdateMenu(client as any, chatId, telegramId)
      }
    } else if (text === '🎯 Update E2E') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'HD') {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
      } else {
        await showE2EUpdateMenu(client as any, chatId, telegramId)
      }
    } else if (text === '📝 Update LME PT2') {
      const role = await (getUserRole as any)(telegramId)
      if (role !== 'HD') {
        await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
      } else {
        await showLMEPT2UpdateMenu(client as any, chatId, telegramId)
      }
    } else {
      await (client as any).sendMessage(chatId, 'Perintah tidak dikenali. Gunakan /start atau /help.')
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const message = error?.response?.data || error?.message || 'Unknown error'
    console.error('Webhook handler failed:', message)
    // Jangan balas 500 agar Telegram tidak retry terus dan tombol tidak nge-freeze
    return NextResponse.json({ ok: false, error: String(message) })
  }
}

// Helper untuk format tanggal WIB ringkas (digunakan untuk SOD/E2E/LME PT2)
function formatIndonesianDateTime(dateIso?: string | null) {
  if (!dateIso) return '-';
  const d = new Date(dateIso);
  if (!isFinite(d.getTime())) return '-';
  try {
    const s = d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    // Pastikan pemisah waktu konsisten menggunakan ':' dan tambahkan label WIB
    return s.replace(/\./g, ':') + ' WIB';
  } catch {
    // Fallback jika Intl gagal; konversi ISO ke format yang mudah dibaca
    return d.toISOString().replace('T', ' ').replace('Z', ' +00:00');
  }
}

function formatReadableDuration(hours: number) {
  if (!isFinite(hours) || hours < 0) return '-'
  // Konversi ke detik untuk presisi dan aturan <1 menit tampilkan detik
  const totalSeconds = Math.round(hours * 3600)
  if (totalSeconds < 60) {
    const secs = Math.max(totalSeconds, 0)
    return `${secs} detik`
  }

  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) {
    // Untuk < 1 jam, tampilkan menit saja
    return `${totalMinutes} menit`
  }

  if (totalMinutes < 1440) {
    // Untuk < 24 jam, tampilkan jam dan menit
    const hrs = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return mins === 0 ? `${hrs} jam` : `${hrs} jam ${mins} menit`
  }

  // Untuk >= 24 jam, konversi jadi hari, jam, menit
  const days = Math.floor(totalMinutes / 1440)
  const remainingMinutes = totalMinutes % 1440
  const hrs = Math.floor(remainingMinutes / 60)
  const mins = remainingMinutes % 60
  let result = `${days} hari`
  if (hrs > 0) result += ` ${hrs} jam`
  if (mins > 0) result += ` ${mins} menit`
  return result
}

async function getUserName(telegramId: string) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('name')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();
  return data?.name || 'HD';
}

// Menu: Update SOD
async function showSODUpdateMenu(client: any, chatId: number, telegramId: string) {
  await client.sendMessage(chatId, '🚀 Update SOD\n\nPilih aksi:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Pilih Order untuk Update SOD', callback_data: 'select_order_for_sod' }],
        [{ text: '🔙 Kembali', callback_data: 'back_to_menu' }]
      ]
    }
  });
}

// Menu: Update E2E
async function showE2EUpdateMenu(client: any, chatId: number, telegramId: string) {
  await client.sendMessage(chatId, '🎯 Update E2E\n\nPilih aksi:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Pilih Order untuk Update E2E', callback_data: 'select_order_for_e2e' }],
        [{ text: '🔙 Kembali', callback_data: 'back_to_menu' }]
      ]
    }
  });
}

// Menu: Update LME PT2
async function showLMEPT2UpdateMenu(client: any, chatId: number, telegramId: string) {
  await client.sendMessage(chatId,
    '📝 UPDATE LME PT2\n\n' +
    '📋 Pilih order untuk update LME PT2 timestamp:\n' +
    '⏰ LME PT2 akan diset ke waktu sekarang (WIB)\n' +
    '🔔 Teknisi akan mendapat notifikasi bahwa LME PT2 sudah ready',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Pilih Order untuk Update LME PT2', callback_data: 'select_order_for_lme_pt2' }],
          [{ text: '🔙 Kembali', callback_data: 'back_to_menu' }]
        ]
      }
    }
  );
}

// Util untuk buat timestamp Asia/Jakarta dengan offset +07:00
function nowJakartaWithOffset() {
  const now = new Date();
  const jakarta = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${jakarta.getFullYear()}-${pad(jakarta.getMonth() + 1)}-${pad(jakarta.getDate())} ${pad(jakarta.getHours())}:${pad(jakarta.getMinutes())}:${pad(jakarta.getSeconds())}+07:00`;
}

// 📊 Riwayat LME PT2 (mirror gaya bot.js)
async function showLMEPT2History(client: any, chatId: number, telegramId: string) {
  const role = await (getUserRole as any)(telegramId)
  if (role !== 'HD') {
    await (client as any).sendMessage(chatId, '❌ Hanya HD yang dapat mengakses menu ini.')
    return
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_name, sto, lme_pt2_end')
    .not('lme_pt2_end', 'is', null)
    .order('lme_pt2_end', { ascending: false })
    .limit(15)

  if (error) {
    await (client as any).sendMessage(chatId, `❌ Gagal mengambil riwayat LME PT2: ${error.message}`)
    return
  }
  if (!orders || orders.length === 0) {
    await (client as any).sendMessage(chatId, '📊 Belum ada riwayat update LME PT2.')
    return
  }

  let message = '📊 RIWAYAT UPDATE LME PT2 (Terbaru)\n\n'
  for (let i = 0; i < orders.length; i++) {
    const o: any = orders[i]
    message += `${i + 1}. ${o.order_id} — ${o.customer_name} (${o.sto})\n`
    message += `   ⏰ LME PT2: ${formatIndonesianDateTime(o.lme_pt2_end)}\n\n`
  }

  await (client as any).sendMessage(chatId, message, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu LME PT2', callback_data: 'back_to_menu' }]] }
  })
}

// Seleksi order untuk SOD
async function showSODOrderSelection(client: any, chatId: number, telegramId: string) {
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_name, sto, created_at')
    .is('sod_timestamp', null)
    .order('created_at', { ascending: false });

  if (!orders || orders.length === 0) {
    await client.sendMessage(chatId, '✅ Semua order sudah memiliki waktu SOD.');
    return;
  }

  const sorted = sortOrdersNewestFirst(orders || []);
  const lines = sorted.map((o: any, idx: number) => `${idx + 1}. ${o.order_id} — ${o.customer_name} (${o.sto})`).join('\n');

  await client.sendMessage(chatId, `Pilih order untuk update SOD:\n\n${lines}`, {
    reply_markup: {
      inline_keyboard: [
        ...sorted.map((o: any, idx: number) => [{ text: `${idx + 1}. 🕘 Update SOD: ${o.order_id}`, callback_data: `sod_order_${o.order_id}` }]),
        [{ text: '🔙 Kembali', callback_data: 'back_to_menu' }]
      ]
    }
  });
}

// Seleksi order untuk E2E
async function showE2EOrderSelection(client: any, chatId: number, telegramId: string) {
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_name, sto, created_at, sod_timestamp')
    .not('sod_timestamp', 'is', null)
    .is('e2e_timestamp', null)
    .order('created_at', { ascending: false });

  if (!orders || orders.length === 0) {
    await client.sendMessage(chatId, '✅ Tidak ada order yang menunggu update E2E.');
    return;
  }

  const sortedE2E = sortOrdersNewestFirst(orders || []);
  const lines = sortedE2E.map((o: any, idx: number) => `${idx + 1}. ${o.order_id} — ${o.customer_name} (${o.sto})\n  SOD: ${formatIndonesianDateTime(o.sod_timestamp)}`).join('\n\n');

  await client.sendMessage(chatId, `Pilih order untuk update E2E:\n\n${lines}`, {
    reply_markup: {
      inline_keyboard: [
        ...sortedE2E.map((o: any, idx: number) => [{ text: `${idx + 1}. 🎯 Update E2E: ${o.order_id}`, callback_data: `e2e_order_${o.order_id}` }]),
        [{ text: '🔙 Kembali', callback_data: 'back_to_menu' }]
      ]
    }
  });
}

// Seleksi order untuk LME PT2: gabungkan yang Not Ready saat ini dan yang pernah Not Ready (punya lme_pt2_start) dan belum end
async function showLMEPT2OrderSelection(client: any, chatId: number, telegramId: string) {
  // 1) Ambil progress dengan status Not Ready saat ini (tanpa bergantung FK)
  const { data: progresses, error: progErr } = await supabaseAdmin
    .from('progress_new')
    .select('order_id, survey_jaringan')
    .ilike('survey_jaringan->>status', '%Not Ready%')

  if (progErr) {
    await (client as any).sendMessage(chatId, `❌ Gagal mengambil data progress: ${progErr.message}`)
    return
  }

  const orderIdsRaw = Array.isArray(progresses) ? progresses.map((p: any) => p.order_id).filter(Boolean) : []
  const orderIds = Array.from(new Set(orderIdsRaw.map((id: any) => String(id).trim())))
  console.log('[LME PT2] progress_new Not Ready count:', progresses?.length || 0)
  console.log('[LME PT2] orderIds from progress_new:', orderIds)

  // 2) Ambil detail order dari list di atas yang belum memiliki LME PT2 end
  const { data: ordersFromProgress, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_name, sto, created_at, lme_pt2_end, lme_pt2_start')
    .in('order_id', orderIds.length ? orderIds : ['__none__']) // hindari error IN empty
    .is('lme_pt2_end', null)
    .order('created_at', { ascending: true })

  if (orderErr) {
    await (client as any).sendMessage(chatId, `❌ Gagal mengambil data order: ${orderErr.message}`)
    return
  }

  // 3) Tambah sumber kedua: orders yang pernah Not Ready (punya lme_pt2_start) tapi belum lme_pt2_end
  const { data: ordersWithStart, error: startErr } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_name, sto, created_at, lme_pt2_start, lme_pt2_end')
    .is('lme_pt2_end', null)
    .not('lme_pt2_start', 'is', null)
    .order('created_at', { ascending: true })

  if (startErr) {
    await (client as any).sendMessage(chatId, `❌ Gagal mengambil data order (riwayat Not Ready): ${startErr.message}`)
    return
  }

  // 4) Gabungkan dua sumber, unik per order_id
  const progressByOrder = new Map<string, any>()
  for (const p of (progresses || [])) progressByOrder.set(p.order_id, p.survey_jaringan)

  const itemsMap = new Map<string, { order_id: string, customer_name: string, sto: string, surveyTime: string, surveyTech: string }>()

  for (const o of (ordersFromProgress || [])) {
    const survey = progressByOrder.get(o.order_id)
    let surveyTime = survey?.timestamp ? formatIndonesianDateTime(survey.timestamp) : '-'
    let surveyTech = survey?.technician || '-'
    // Fallback parsing format lama: "Not Ready - dd/mm/yyyy, HH.MM.SS - nama"
    if (!survey?.timestamp && typeof survey?.status === 'string' && String(survey.status).startsWith('Not Ready')) {
      const parts = String(survey.status).split(' - ')
      if (parts.length >= 2) surveyTime = parts[1]
      if (parts.length >= 3) surveyTech = parts[2]
    }
    // Fallback ke lme_pt2_start bila tidak ada waktu jelas
    if (!surveyTime || surveyTime === '-') {
      surveyTime = o.lme_pt2_start ? formatIndonesianDateTime(o.lme_pt2_start) : '-'
    }
    itemsMap.set(o.order_id, {
      order_id: o.order_id,
      customer_name: o.customer_name,
      sto: o.sto,
      surveyTime,
      surveyTech
    })
  }

  for (const o of (ordersWithStart || [])) {
    if (itemsMap.has(o.order_id)) continue
    const surveyTime = o.lme_pt2_start ? formatIndonesianDateTime(o.lme_pt2_start) : '-'
    itemsMap.set(o.order_id, {
      order_id: o.order_id,
      customer_name: o.customer_name,
      sto: o.sto,
      surveyTime,
      surveyTech: '-'
    })
  }

  const items = Array.from(itemsMap.values())
  console.log('[LME PT2] final items count:', items.length)

  if (!items || items.length === 0) {
    await client.sendMessage(chatId,
      'Tidak ada order yang perlu update LME PT2.\n\n' +
      '✅ Semua order yang pernah "Not Ready" atau yang "Not Ready" saat ini sudah diupdate atau belum ada laporan jaringan not ready.'
    )
    return
  }

  let message = '📝 PILIH ORDER UNTUK UPDATE LME PT2\n\n'
  message += '📋 Order yang perlu update LME PT2 (termasuk yang pernah Not Ready):\n\n'

  const keyboard: any[] = []

  items.forEach((i: any) => {
    const orderInfo = `${i.order_id} - ${i.customer_name} (${i.sto})`
    message += `⏰ ${orderInfo}\n`
    message += `   📅 Waktu: ${i.surveyTime}\n`
    message += `   👷 Teknisi: ${i.surveyTech}\n\n`
    keyboard.push([{ text: `📝 Update LME PT2 - ${i.order_id}`, callback_data: `lme_pt2_order_${i.order_id}` }])
  })

  keyboard.push([{ text: '🔙 Kembali ke Menu LME PT2', callback_data: 'back_to_menu' }])

  await client.sendMessage(chatId, decodeUnicodeEscapes(message), {
    reply_markup: { inline_keyboard: keyboard }
  })
}




async function notifyTechnicianLMEReady(client: any, orderId: string) {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_name, customer_address, contact, service_type, sto, assigned_technician')
    .eq('order_id', orderId)
    .maybeSingle();

  const recipients = new Set<string>();

  // 1) Prioritas: teknisi yang diassign langsung pada orders (users.id -> telegram_id)
  if (order?.assigned_technician) {
    const { data: tech } = await supabaseAdmin
      .from('users')
      .select('telegram_id')
      .eq('id', order.assigned_technician)
      .maybeSingle();
    if (tech?.telegram_id) {
      recipients.add(String(tech.telegram_id));
    }
  }

  // 2) Tambahkan semua teknisi yang diassign per stage (berisi telegram_id)
  const { data: assignments } = await supabaseAdmin
    .from('order_stage_assignments')
    .select('assigned_technician, stage')
    .eq('order_id', orderId);
  if (assignments && assignments.length) {
    // Prioritaskan stage utama terlebih dahulu, kemudian tambahkan sisanya
    const preferredStages = ['Instalasi', 'Penarikan', 'Survey', 'P2P', 'Evidence'];
    for (const stage of preferredStages) {
      const a = assignments.find((x: any) => x.stage === stage && x.assigned_technician);
      if (a?.assigned_technician) recipients.add(String(a.assigned_technician));
    }
    // Tambahkan semua assignment lain yang belum masuk
    for (const a of assignments) {
      if (a?.assigned_technician) recipients.add(String(a.assigned_technician));
    }
  }

  if (recipients.size === 0) return;

  const message = 'Notifikasi LME PT2 Ready\n\n' +
    '✅ Jaringan sudah siap! HD telah mengupdate status LME PT2.\n\n' +
    `🆔 Order: ${order?.order_id || orderId}\n` +
    `👤 Customer Name: ${order?.customer_name || '-'}\n` +
    `🏠 Alamat: ${order?.customer_address || '-'}\n` +
    `📞 Telepon: ${order?.contact || 'N/A'}\n` +
    `🔧 Layanan: ${order?.service_type || '-'}\n` +
    `🏢 STO: ${order?.sto || '-'}\n\n` +
    'Gunakan menu "📝 Update Progress" untuk mencatat perkembangan pekerjaan.';

  const ids = Array.from(recipients);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      await client.sendMessage(Number(id), decodeUnicodeEscapes(message));
    } catch (e) {
      console.error('Failed to notify technician LME PT2 ready:', e);
    }
  }
}

async function updateComplyCalculationFromSODToE2E(orderId: string, e2eTimestamp: string) {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('sod_timestamp')
      .eq('order_id', orderId)
      .maybeSingle();
    if (!order || !order.sod_timestamp) return;
    const sodIso = String(order.sod_timestamp).replace(' ', 'T');
    const e2eIso = String(e2eTimestamp).replace(' ', 'T');
    const sodTime = new Date(sodIso);
    const e2eTime = new Date(e2eIso);
    const durationHours = (e2eTime.getTime() - sodTime.getTime()) / 36e5;
    const isComply = durationHours <= 72;
    const complyStatus = isComply ? 'Comply' : 'Not Comply';
    const readableDuration = formatReadableDuration(durationHours);
    const e2eDate = e2eTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const durationWithDate = `${readableDuration} (${e2eDate})`;
    await supabaseAdmin
      .from('orders')
      .update({ tti_comply_status: complyStatus, tti_comply_actual_duration: durationWithDate, updated_at: nowJakartaWithOffset() })
      .eq('order_id', orderId);
  } catch (error) {
    console.error('Error in updateComplyCalculationFromSODToE2E:', error);
  }
}

async function handleE2EUpdate(client: any, chatId: number, telegramId: string, orderId: string) {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (!order) {
      await client.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    if (!order.sod_timestamp) {
      await client.sendMessage(chatId, '❌ Order ini belum memiliki SOD timestamp.\n\nSilakan update SOD terlebih dahulu sebelum mengupdate E2E.');
      return;
    }
    if (order.e2e_timestamp) {
      await client.sendMessage(chatId, `⚠️ E2E SUDAH DISET\n\n📋 Order: ${order.order_id}\n👤 Customer: ${order.customer_name}\n🎯 E2E Timestamp: ${formatIndonesianDateTime(order.e2e_timestamp)}\n\nE2E timestamp sudah pernah diset untuk order ini.`);
      return;
    }
    const jakartaTimestamp = nowJakartaWithOffset();
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ e2e_timestamp: jakartaTimestamp, updated_at: nowJakartaWithOffset() })
      .eq('order_id', orderId);
    if (updateError) {
      console.error('Error updating E2E timestamp:', updateError);
      await client.sendMessage(chatId, '❌ Gagal mengupdate E2E timestamp.');
      return;
    }
    const sodTime = new Date(String(order.sod_timestamp).replace(' ', 'T'));
    const e2eTime = new Date(String(jakartaTimestamp).replace(' ', 'T'));
    const durationHours = (e2eTime.getTime() - sodTime.getTime()) / 36e5;
    await client.sendMessage(chatId,
      `✅ E2E TIMESTAMP BERHASIL DIUPDATE!\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer: ${order.customer_name}\n` +
      `🏢 STO: ${order.sto}\n\n` +
      `🚀 SOD: ${formatIndonesianDateTime(order.sod_timestamp)}\n` +
      `🎯 E2E: ${formatIndonesianDateTime(jakartaTimestamp)}\n\n` +
      `⏱️ Durasi SOD→E2E: ${formatReadableDuration(durationHours)}\n\n` +
      `📊 Perhitungan comply sekarang menggunakan durasi SOD ke E2E.`
    );
    await updateComplyCalculationFromSODToE2E(orderId, jakartaTimestamp);
  } catch (error) {
    console.error('Error handling E2E update:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function handleLMEPT2Update(client: any, chatId: number, telegramId: string, orderId: string) {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (!order) {
      await client.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    const hdName = await getUserName(telegramId);
    const jakartaTimestamp = nowJakartaWithOffset();
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ lme_pt2_end: jakartaTimestamp, status: 'Pending', updated_at: nowJakartaWithOffset() })
      .eq('order_id', orderId);
    if (updateError) {
      console.error('Error updating order LME PT2:', updateError);
      await client.sendMessage(chatId, `❌ Gagal menyimpan update LME PT2: ${updateError.message}`);
      return;
    }
    await client.sendMessage(chatId,
      `✅ LME PT2 Berhasil Diupdate!\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer Name: ${order.customer_name}\n` +
      `🕐 LME PT2 Update Time: ${formatIndonesianDateTime(jakartaTimestamp)}\n` +
      `👤 Updated by: ${hdName}`
    );
    try {
      await notifyTechnicianLMEReady(client, order.order_id);
    } catch (notifyError) {
      console.error('Error notifying technician about LME PT2 ready:', notifyError);
    }
  } catch (error) {
    console.error('Error in handleLMEPT2Update:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat update LME PT2.');
  }
}

async function handleSODUpdate(client: any, chatId: number, telegramId: string, orderId: string) {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (!order) {
      await client.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    const hdName = await getUserName(telegramId);
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const pad = (n: number) => String(n).padStart(2, '0');
    const jakartaTimestamp = `${jakartaTime.getFullYear()}-${pad(jakartaTime.getMonth() + 1)}-${pad(jakartaTime.getDate())} ${pad(jakartaTime.getHours())}:${pad(jakartaTime.getMinutes())}:${pad(jakartaTime.getSeconds())}+07:00`;
    // Set TTI In Progress dan deadline 3x24 jam dari waktu SOD
    const sodDate = new Date(String(jakartaTimestamp).replace(' ', 'T'));
    const deadlineTime = new Date(sodDate.getTime() + (72 * 60 * 60 * 1000));
    const deadlineTimestamp = `${deadlineTime.getFullYear()}-${pad(deadlineTime.getMonth() + 1)}-${pad(deadlineTime.getDate())} ${pad(deadlineTime.getHours())}:${pad(deadlineTime.getMinutes())}:${pad(deadlineTime.getSeconds())}+07:00`;
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ sod_timestamp: jakartaTimestamp, tti_comply_status: 'In Progress', tti_comply_deadline: deadlineTimestamp, updated_at: nowJakartaWithOffset() })
      .eq('order_id', orderId);
    if (updateError) {
      console.error('Error updating order SOD:', updateError);
      await client.sendMessage(chatId, `❌ Gagal menyimpan update SOD: ${updateError.message}`);
      return;
    }
    await client.sendMessage(chatId,
      `✅ SOD Berhasil Diupdate!\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer Name: ${order.customer_name}\n` +
      `🕐 SOD Time: ${formatIndonesianDateTime(jakartaTimestamp)}\n` +
      `📊 TTI Status: In Progress\n` +
      `⏰ TTI Comply Deadline: ${formatIndonesianDateTime(deadlineTimestamp)}\n` +
      `👤 Updated by: ${hdName}`
    );
    // TTI sudah berjalan dari SOD, tidak perlu pemanggilan tambahan
  } catch (error) {
    console.error('Error in handleSODUpdate:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat update SOD.');
  }
}

async function startTTIComplyFromSOD(orderId: string, sodTimestamp: string) {
  try {
    console.log(`🚀 Starting TTI Comply from SOD for order: ${orderId} at ${sodTimestamp}`);
    console.log(`✅ TTI Comply started from SOD for order ${orderId}`);
  } catch (error) {
    console.error('Error starting TTI Comply from SOD:', error);
  }
}

function decodeUnicodeEscapes(text: string): string {
  if (!text) return text;
  try {
    return text
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_: string, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return text;
  }
}

// ===== Progress Flow (mirrored from bot.js) =====
async function showProgressStages(client: any, chatId: number, orderId: string) {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('order_id, customer_name, customer_address, status')
      .eq('order_id', orderId)
      .maybeSingle();
    if (!order) {
      await client.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    const { data: progress } = await supabaseAdmin
      .from('progress_new')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    let message = '📝 Update Progress\n\n';
    message += `📋 Order: ${order.order_id} - ${order.customer_name}\n`;
    message += `🏠 Alamat: ${order.customer_address || '-'}\n`;
    message += `📊 Status: ${getStatusEmoji(order.status)} ${order.status}\n\n`;

    message += '📈 Progress Terakhir:\n';

    const stageLine = (label: string, data?: any) => {
      const hasStatus = !!(data && data.status);
      const statusText = hasStatus ? data.status : '-';
      const emoji = hasStatus ? getProgressStatusEmoji(statusText) : '⚪';
      const time = data?.timestamp ? formatIndonesianDateTime(data.timestamp) : undefined;
      const tech = data?.technician;
      const note = data?.note;
      let line = `• ${label}: ${emoji} ${statusText}`;
      if (note) { line += ` (${note})`; }
      if (time && tech) {
        line += ` - ${time} - ${tech}`;
      } else if (time) {
        line += ` - ${time}`;
      } else if (tech) {
        line += ` - ${tech}`;
      }
      return line;
    };

    message += stageLine('Survey Jaringan', progress?.survey_jaringan) + '\n';
    message += stageLine('Penarikan Kabel', progress?.penarikan_kabel) + '\n';
    message += stageLine('Instalasi ONT', progress?.instalasi_ont) + '\n';
    message += stageLine('P2P', progress?.p2p) + '\n\n';

    message += 'Pilih tahapan progress:';

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔍 Survey', callback_data: `progress_survey_${orderId}` }],
        [{ text: '📡 Penarikan Kabel', callback_data: `progress_penarikan_${orderId}` }],
        [{ text: '🔧 Instalasi ONT', callback_data: `progress_instalasi_${orderId}` }],
        [{ text: '🔗 P2P', callback_data: `progress_p2p_${orderId}` }],
        [{ text: '⬅️ Kembali', callback_data: 'update_progress' }],
      ],
    };

    await client.sendMessage(chatId, decodeUnicodeEscapes(message), { reply_markup: keyboard });
  } catch (err) {
    console.error('Error showProgressStages:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat membuka stage progress.');
  }
}

async function promptSurveyOptions(client: any, chatId: number, orderId: string) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Jaringan Ready', callback_data: `survey_ready_${orderId}` }],
      [{ text: '❌ Jaringan Not Ready', callback_data: `survey_not_ready_${orderId}` }],
      [{ text: '⬅️ Kembali', callback_data: `progress_order_${orderId}` }],
    ],
  };
  await client.sendMessage(chatId, `Hasil Survey untuk ORDER ${orderId}?`, { reply_markup: keyboard });
}

async function handleSurveyResult(client: any, chatId: number, telegramId: string, orderId: string, isReady: boolean) {
  try {
    const techName = await getUserName(telegramId);
    const jakartaTimestamp = nowJakartaWithOffset();
    const { data: row } = await supabaseAdmin
      .from('progress_new')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    const updatePayload: any = {
      order_id: orderId,
      survey_jaringan: {
        ...(row?.survey_jaringan || {}),
        status: isReady ? 'Ready' : 'Not Ready',
        timestamp: jakartaTimestamp,
        technician: techName,
      },
    };
    // Use conditional update/insert to avoid ON CONFLICT requirement
    let dbErr: any = null;
    if (row) {
      const { error: updateErr } = await supabaseAdmin
        .from('progress_new')
        .update(updatePayload)
        .eq('order_id', orderId);
      dbErr = updateErr;
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('progress_new')
        .insert(updatePayload);
      dbErr = insertErr;
    }
    if (dbErr) {
      console.error('Error saving survey_jaringan:', dbErr);
      await client.sendMessage(chatId, '❌ Gagal menyimpan hasil survey.');
      return;
    }
    // Update order status based on survey result
    const newStatus = isReady ? 'In Progress' : 'Pending';
    const { error: orderErr } = await supabaseAdmin
      .from('orders')
      .update({ status: newStatus, updated_at: nowJakartaWithOffset() })
      .eq('order_id', orderId);
    if (orderErr) {
      console.error('Error updating order after survey:', orderErr);
    }
    // Jika jaringan Not Ready, catat waktu LME PT2 start jika belum tercatat
    if (!isReady) {
      try {
        const { data: ord } = await supabaseAdmin
          .from('orders')
          .select('lme_pt2_start')
          .eq('order_id', orderId)
          .maybeSingle();
        if (!ord?.lme_pt2_start) {
          const { error: startErr } = await supabaseAdmin
            .from('orders')
            .update({ lme_pt2_start: jakartaTimestamp, updated_at: nowJakartaWithOffset() })
            .eq('order_id', orderId);
          if (startErr) {
            console.error('Error setting lme_pt2_start:', startErr);
          }
        }
      } catch (e) {
        console.error('Error checking/updating lme_pt2_start:', e);
      }
    }
    await client.sendMessage(
      chatId,
      `✅ Survey diperbarui untuk ORDER ${orderId}\nStatus: ${isReady ? 'Ready' : 'Not Ready'}\nWaktu: ${formatIndonesianDateTime(jakartaTimestamp)}\nTeknisi: ${techName}`
    );
    if (!isReady) {
      await notifyHDNetworkNotReady(client, orderId);
    }
    // Back to stages
    await showProgressStages(client, chatId, orderId);
  } catch (err) {
    console.error('Error handleSurveyResult:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat menyimpan hasil survey.');
  }
}

async function promptStageOptions(client: any, chatId: number, stageKey: 'penarikan_kabel'|'p2p'|'instalasi_ont', stageLabel: string, orderId: string) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Tandai Selesai', callback_data: `${stageKey === 'penarikan_kabel' ? 'penarikan_done_' : stageKey === 'p2p' ? 'p2p_done_' : 'instalasi_done_'}${orderId}` }],
      [{ text: '📝 Tambah Catatan', callback_data: `${stageKey === 'penarikan_kabel' ? 'add_note_penarikan_' : stageKey === 'p2p' ? 'add_note_p2p_' : 'add_note_instalasi_'}${orderId}` }],
      [{ text: '⬅️ Kembali', callback_data: `progress_order_${orderId}` }],
    ],
  };
  try {
    const { data: orderInfo } = await supabaseAdmin
      .from('orders')
      .select('order_id, customer_name')
      .eq('order_id', orderId)
      .maybeSingle();
    const custName = orderInfo?.customer_name || '-';
    await client.sendMessage(chatId, `Stage: ${stageLabel}\n🆔 Order: ${orderId} - ${custName}\nPilih aksi:`, { reply_markup: keyboard });
  } catch (e) {
    await client.sendMessage(chatId, `Stage: ${stageLabel}\n🆔 Order: ${orderId}\nPilih aksi:`, { reply_markup: keyboard });
  }
}

async function markStageCompleted(client: any, chatId: number, telegramId: string, orderId: string, stageKey: 'penarikan_kabel'|'p2p'|'instalasi_ont', stageLabel: string) {
  try {
    const techName = await getUserName(telegramId);
    const jakartaTimestamp = nowJakartaWithOffset();
    const { data: row } = await supabaseAdmin
      .from('progress_new')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    const updatePayload: any = {
      order_id: orderId,
      [stageKey]: {
        ...(row?.[stageKey] || {}),
        status: 'Selesai',
        timestamp: jakartaTimestamp,
        technician: techName,
      },
    };
    // Use conditional update/insert to avoid ON CONFLICT requirement
    let dbErr: any = null;
    if (row) {
      const { error: updateErr } = await supabaseAdmin
        .from('progress_new')
        .update(updatePayload)
        .eq('order_id', orderId);
      dbErr = updateErr;
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('progress_new')
        .insert(updatePayload);
      dbErr = insertErr;
    }
    if (dbErr) {
      console.error(`Error saving ${stageKey}:`, dbErr);
      await client.sendMessage(chatId, `❌ Gagal menyimpan status ${stageLabel}.`);
      return;
    }
    // Ensure order moves to In Progress if was Pending
    const { error: orderErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'In Progress', updated_at: nowJakartaWithOffset() })
      .eq('order_id', orderId);
    if (orderErr) {
      console.error('Error updating order status after stage complete:', orderErr);
    }
    await client.sendMessage(chatId,
      `✅ ${stageLabel} ditandai selesai untuk ORDER ${orderId}\nWaktu: ${formatIndonesianDateTime(jakartaTimestamp)}\nTeknisi: ${techName}`
    );
    await showProgressStages(client, chatId, orderId);
  } catch (err) {
    console.error('Error markStageCompleted:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat menyimpan status tahap.');
  }
}

async function handleProgressTextInput(client: any, chatId: number, telegramId: string, text: string, session: { type: 'update_progress', orderId: string, stage: 'penarikan_kabel' | 'p2p' | 'instalasi_ont' }) {
  try {
    const techName = await getUserName(telegramId);
    const jakartaTimestamp = nowJakartaWithOffset();
    const { data: row } = await supabaseAdmin
      .from('progress_new')
      .select('*')
      .eq('order_id', session.orderId)
      .maybeSingle();
    const prevStage = row?.[session.stage] || {};
    const newStatus = 'Selesai';
    const newTimestamp = jakartaTimestamp;
    const updatePayload: any = {
      order_id: session.orderId,
      [session.stage]: {
        ...prevStage,
        note: text,
        status: newStatus,
        timestamp: newTimestamp,
        technician: techName,
      },
    };
    // Use conditional update/insert to avoid ON CONFLICT requirement
    let dbErr: any = null;
    if (row) {
      const { error: updateErr } = await supabaseAdmin
        .from('progress_new')
        .update(updatePayload)
        .eq('order_id', session.orderId);
      dbErr = updateErr;
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('progress_new')
        .insert(updatePayload);
      dbErr = insertErr;
    }
    if (dbErr) {
      console.error('Error saving note:', dbErr);
      await client.sendMessage(chatId, '❌ Gagal menyimpan catatan.');
      return true;
    }
    const stageLabelPretty = session.stage === 'penarikan_kabel' ? 'Penarikan' : (session.stage === 'p2p' ? 'P2P' : 'Instalasi ONT');
    const timeStr = formatIndonesianDateTime(jakartaTimestamp);
    await client.sendMessage(chatId,
      `✅ Progress Berhasil Diupdate!\n\n` +
      `📝 Tahapan: ${stageLabelPretty}\n` +
      `📊 Status: Selesai - ${timeStr}\n` +
      `📝 Catatan: ${text}\n` +
      `👷🏻‍♂️ Teknisi: ${techName}`
    );
    // Tampilkan ringkasan progress seperti mekanisme tombol selesai
    await showProgressStages(client, chatId, session.orderId);
    return true;
  } catch (err) {
    console.error('Error handleProgressTextInput:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat menyimpan catatan.');
    return true;
  }
}

async function notifyHDNetworkNotReady(client: any, orderId: string) {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('order_id, customer_name, sto')
      .eq('order_id', orderId)
      .maybeSingle();
    const { data: hdUsers } = await supabaseAdmin
      .from('users')
      .select('telegram_id')
      .eq('role', 'HD');
    const msg = `⚠️ NOTIFIKASI HD\n\nORDER ${orderId} (Customer: ${order?.customer_name || '-'}, STO: ${order?.sto || '-'})\nHasil survey: Jaringan NOT READY. Mohon tindak lanjut.`;
    if (hdUsers && hdUsers.length) {
      for (const u of hdUsers) {
        const hdChatId = Number(u.telegram_id);
        if (hdChatId) {
          await client.sendMessage(hdChatId, msg);
        }
      }
    }
  } catch (err) {
    console.error('Error notifyHDNetworkNotReady:', err);
  }
}