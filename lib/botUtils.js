const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  try {
    return createClient(url, serviceKey);
  } catch (_e) {
    return null;
  }
}

async function getUserRole(telegramId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;
    const { data } = await supabase
      .from('users')
      .select('role')
      .eq('telegram_id', String(telegramId))
      .single();
    return data?.role || null;
  } catch (_e) {
    return null;
  }
}

async function getUserName(telegramId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return 'User';
    const { data } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', String(telegramId))
      .single();
    return data?.name || 'User';
  } catch (_e) {
    return 'User';
  }
}

function formatIndonesianDateTime(dateString) {
  if (!dateString) return 'Belum diset';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Format tanggal tidak valid';
  const options = {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  const formattedDate = date
    .toLocaleString('id-ID', options)
    .replace(',', '')
    .replace(/\./g, ':');
  return `${formattedDate} WIB`;
}

function formatReadableDuration(hours) {
  if (!hours || hours === 0) return '0 MENIT';
  if (hours < 0) return '0 MENIT';
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 1) return '1 MENIT';
  if (totalMinutes < 60) return `${totalMinutes} MENIT`;
  if (totalMinutes < 1440) {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins === 0 ? `${hrs} JAM` : `${hrs} JAM ${mins} MENIT`;
  }
  const days = Math.floor(totalMinutes / 1440);
  const remainingMinutes = totalMinutes % 1440;
  const hrs = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  let result = `${days} HARI`;
  if (hrs > 0) result += ` ${hrs} JAM`;
  if (mins > 0) result += ` ${mins} MENIT`;
  return result;
}

function nowJakartaWithOffset() {
  const now = new Date();
  const jakarta = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const pad = n => String(n).padStart(2, '0');
  return `${jakarta.getFullYear()}-${pad(jakarta.getMonth() + 1)}-${pad(jakarta.getDate())} ${pad(jakarta.getHours())}:${pad(jakarta.getMinutes())}:${pad(jakarta.getSeconds())}+07:00`;
}

function buildMainMenu(role) {
  // Minimal, general-purpose main menu; adjust as needed for parity
  const hdKeyboard = [
    ['📋 Buat Order', '👥 Assign Teknisi'],
    ['🔍 Cek Order', '📝 Update LME PT2'],
    ['🎯 Update E2E', '🚀 Update SOD'],
    ['📊 Show Order On Progress', '✅ Show Order Completed'],
    ['❓ Bantuan'],
  ];
  const teknisiKeyboard = [
    ['📝 Update Progress', '📸 Upload Evidence'],
    ['❓ Bantuan'],
  ];
  const keyboard = role === 'HD' ? hdKeyboard : teknisiKeyboard;
  return { keyboard, resize_keyboard: true, one_time_keyboard: false };
}

function getStatusEmoji(status) {
  const statusEmojis = {
    'Pending': '⏳',
    'In Progress': '🔄',
    'On Hold': '⏸️',
    'Completed': '✅',
    'Closed': '🔒'
  };
  return statusEmojis[status] || '❓';
}

function getProgressStatusEmoji(status) {
  const statusEmojis = {
    'Ready': '✅',
    'Not Ready': '❌',
    'Selesai': '✅',
    'In Progress': '🔄'
  };
  return statusEmojis[status] || '❓';
}

function getStageEmoji(stage) {
  const emojiMap = {
    'Survey': '🔍',
    'Penarikan': '📡',
    'P2P': '🔗',
    'Instalasi': '🔧',
    'Evidence': '📸'
  };
  return emojiMap[stage] || '📝';
}

function getStageStatusEmoji(status) {
  const emojiMap = {
    'assigned': '📋',
    'in_progress': '🔄',
    'completed': '✅',
    'blocked': '⚠️',
    'pending': '⏳'
  };
  return emojiMap[status] || '⚪';
}

function formatOrderCard(order, opts = {}) {
  const {
    header = '🔔 Order Baru Ditugaskan',
    stage,
    technicianName,
    assignedBy,
    assignedAt,
    extraNote,
  } = opts;

  const lines = [];
  lines.push(header);
  lines.push('');
  const id = order?.order_id || order?.id || '-';
  const name = order?.customer_name || '-';
  lines.push(`🆔 ${id} - ${name}`);
  lines.push(`📍 ${order?.customer_address || '-'}`);
  lines.push(`📞 ${order?.contact || '-'}`);
  lines.push(`🏢 STO: ${order?.sto || '-'}`);
  const trx = order?.transaction_type || '-';
  const svc = order?.service_type || '-';
  lines.push(`📦 ${trx} | ${svc}`);
  if (order?.status) {
    lines.push(`📊 Status: ${getStatusEmoji(order.status)} ${order.status}`);
  }
  lines.push('');
  if (order?.created_at) {
    lines.push(`📅 Dibuat: ${formatIndonesianDateTime(order.created_at)}`);
  }
  if (order?.updated_at) {
    lines.push(`📝 Update: ${formatIndonesianDateTime(order.updated_at)}`);
  }
  if (order?.sod_timestamp) {
    lines.push(`🚀 SOD: ${formatIndonesianDateTime(order.sod_timestamp)}`);
  }
  if (order?.e2e_timestamp) {
    lines.push(`🎯 E2E: ${formatIndonesianDateTime(order.e2e_timestamp)}`);
  }
  if (order?.tti_comply_deadline) {
    lines.push(`⏰ TTI Deadline: ${formatIndonesianDateTime(order.tti_comply_deadline)}`);
  }
  lines.push('');
  if (stage) {
    lines.push(`🔧 Stage: ${getStageEmoji(stage)} ${stage}`);
  }
  if (technicianName) {
    lines.push(`👨‍🔧 Teknisi: ${technicianName}`);
  }
  if (assignedBy) {
    lines.push(`👤 Assigned oleh: ${assignedBy}`);
  }
  if (assignedAt) {
    lines.push(`🕐 Assigned pada: ${formatIndonesianDateTime(assignedAt)}`);
  }
  if (extraNote) {
    lines.push('');
    lines.push(extraNote);
  } else {
    lines.push('');
    lines.push('Gunakan menu "📝 Update Progress" atau "📸 Upload Evidence" untuk melanjutkan.');
  }
  return lines.join('\n');
}

function formatAssignmentSimple(order, opts = {}) {
  const {
    headerTop = '🔔 Order baru ditugaskan kepada Anda',
    secondaryHeader = '🔔 Assignment Baru',
    includeSecondaryHeader = false,
    stageLabel,
    assignedAt,
  } = opts;
  const id = order?.order_id || order?.id || '-';
  const name = order?.customer_name || '-';
  const address = order?.customer_address || '-';
  const contact = order?.contact || '-';
  const sto = order?.sto || '-';
  const trx = order?.transaction_type || '-';
  const svc = order?.service_type || '-';

  const pushBlock = (arr) => {
    arr.push(`🆔 Order ID: ${id}`);
    arr.push(`👤 Pelanggan: ${name}`);
    arr.push(`📍 Alamat: ${address}`);
    arr.push(`📞 Kontak: ${contact}`);
    arr.push(`🏢 STO: ${sto}`);
    arr.push(`📦 Type Transaksi: ${trx}`);
    arr.push(`🔧 Jenis Layanan: ${svc}`);
  };

  const lines = [];
  // Header utama + blok detail
  lines.push(headerTop);
  lines.push('');
  pushBlock(lines);

  // Header sekunder + blok detail (opsional)
  if (includeSecondaryHeader) {
    lines.push('');
    lines.push(secondaryHeader);
    lines.push('');
    pushBlock(lines);
  }

  // Tampilkan stage jika ada
  if (stageLabel) {
    lines.push('');
    lines.push(`➡️Stage : ${stageLabel}`);
  }

  if (assignedAt) {
    lines.push('');
    lines.push(`🕐 assigned: ${formatIndonesianDateTime(assignedAt)}`);
  }

  return lines.join('\n');
}

module.exports = {
  getUserRole,
  getUserName,
  formatIndonesianDateTime,
  formatReadableDuration,
  buildMainMenu,
  // new exports
  getStatusEmoji,
  getProgressStatusEmoji,
  getStageEmoji,
  getStageStatusEmoji,
  nowJakartaWithOffset,
  formatOrderCard,
  formatAssignmentSimple,
};