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

function buildMainMenu(role) {
  // Minimal, general-purpose main menu; adjust as needed for parity
  const hdKeyboard = [
    ['📋 Buat Order', '🔍 Cek Order'],
    ['🚀 Update SOD', '🎯 Update E2E'],
    ['📝 Update Progress', '📸 Upload Evidence'],
    ['👥 Assign Teknisi', '❓ Bantuan'],
  ];
  const teknisiKeyboard = [
    ['📋 Order Saya', '📝 Update Progress'],
    ['📸 Upload Evidence', '❓ Bantuan'],
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
};