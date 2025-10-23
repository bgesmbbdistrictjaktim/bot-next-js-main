function getMainMenuKeyboard(role) {
  if (role === 'HD') {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Buat Order Baru', callback_data: 'create_order' }],
          [{ text: '📊 Lihat Semua Order', callback_data: 'view_orders' }],
          [{ text: '🔍 Cek Order', callback_data: 'search_order' }],
          [{ text: '⚙️ Update Status Order', callback_data: 'update_status' }],
          [{ text: '👥 Assign Teknisi per Stage', callback_data: 'assign_technician_stage' }],
          [{ text: '🚀 Update SOD', callback_data: 'sod_menu' }],
          [{ text: '🎯 Update E2E', callback_data: 'e2e_menu' }],
          [{ text: '❓ Bantuan', callback_data: 'help' }]
        ]
      }
    };
  } else {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Order Saya', callback_data: 'my_orders' }],
          [{ text: '📝 Update Progress', callback_data: 'update_progress' }],
          [{ text: '📸 Upload Evidence', callback_data: 'upload_evidence' }],
          [{ text: '❓ Bantuan', callback_data: 'help' }]
        ]
      }
    };
  }
}

function getReplyMenuKeyboard(role) {
  if (role === 'HD') {
    return {
      reply_markup: {
        keyboard: [
          ['📋 Buat Order', '👥 Assign Teknisi'],
          ['🔍 Cek Order', '📝 Update LME PT2'],
          ['🎯 Update E2E', '🚀 Update SOD'],
          ['📊 Show Order On Progress', '✅ Show Order Completed'],
          ['❓ Bantuan']
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        persistent: true
      }
    };
  } else {
    return {
      reply_markup: {
        keyboard: [
          ['📝 Update Progress','📸 Upload Evidence', '❓ Bantuan']
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        persistent: true
      }
    };
  }
}

module.exports = { getMainMenuKeyboard, getReplyMenuKeyboard };