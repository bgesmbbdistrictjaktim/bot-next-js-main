const { getMainMenuKeyboard, getReplyMenuKeyboard } = require('../botMenus');

async function showWelcomeMessage(client, chatId, role, name) {
  const roleEmoji = role === 'HD' ? '📋' : '🔧';
  const roleName = role === 'HD' ? 'Helpdesk' : 'Teknisi';
  const text = [
    `Halo ${name}! 👋`,
    '',
    `Role: ${roleEmoji} ${roleName}`,
    '',
    'Selamat datang kembali di Order Management Bot!',
    '',
    'Gunakan menu di bawah untuk mengakses fitur:',
  ].join('\n');

  const inlineMenu = getMainMenuKeyboard(role);
  const replyMenu = getReplyMenuKeyboard(role);

  // Merge reply_markup options if needed; prefer reply keyboard to be visible
  const options = {
    parse_mode: 'HTML',
    ...(inlineMenu || {}),
    ...(replyMenu || {}),
  };

  await client.sendMessage(chatId, text, options);
}

module.exports = { showWelcomeMessage };