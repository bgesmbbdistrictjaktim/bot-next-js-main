const { getUserRole, getUserName, buildMainMenu } = require('../botUtils');

async function handleStart(client, chatId, telegramId) {
  const role = (await getUserRole(telegramId)) || 'Teknisi';
  const name = await getUserName(telegramId);
  const menu = buildMainMenu(role);

  const lines = [
    `Halo ${name}! 👋`,
    'Selamat datang di Order Management Bot.',
    `Peran kamu: ${role}`,
    '',
    'Gunakan tombol menu di bawah untuk mulai.',
    'Ketik /help untuk panduan lebih lengkap.',
  ];

  await client.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: menu,
  });
}

module.exports = { handleStart };