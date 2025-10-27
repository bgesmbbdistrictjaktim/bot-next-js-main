const { buildMainMenu } = require('../botUtils');

async function showWelcomeMessage(client, chatId, role, name) {
  const roleLabel = role === 'HD' ? 'HD (Helpdesk)' : role;
  const lines = [
    `Halo ${name || 'User'}! 👋`,
    'Selamat datang di Order Management Bot.',
    `Peran kamu: ${roleLabel}`,
    '',
    'Gunakan tombol menu di bawah untuk mulai.',
    'Ketik /help untuk panduan lebih lengkap.',
  ];

  const menu = buildMainMenu(role);

  await client.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: menu,
  });
}

module.exports = { showWelcomeMessage };