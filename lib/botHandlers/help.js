const { getUserRole, buildMainMenu } = require('../botUtils');

async function handleHelp(client, chatId, telegramId) {
  const role = (await getUserRole(telegramId)) || 'Teknisi';
  const menu = buildMainMenu(role);

  const common = [
    'Panduan singkat:',
    '- /start: Tampilkan menu awal',
    '- /help: Tampilkan bantuan',
    '',
  ];

  const hdTips = [
    'Menu HD:',
    '- 📋 Buat Order: Membuat order baru',
    '- 🔍 Cek Order: Cari order berdasarkan ID atau status',
    '- 🚀 Update SOD: Update Start of Delivery',
    '- 🎯 Update E2E: Update End to End',
    '- 👥 Assign Teknisi: Atur teknisi per stage',
  ];

  const teknisiTips = [
    'Menu Teknisi:',
    '- 📋 Order Saya: Lihat order yang ditugaskan',
    '- 📝 Update Progress: Perbarui progress pengerjaan',
    '- 📸 Upload Evidence: Unggah foto bukti pengerjaan',
  ];

  const text = [
    ...common,
    ...(role === 'HD' ? hdTips : teknisiTips),
    '',
    'Gunakan tombol di bawah untuk navigasi cepat.',
  ].join('\n');

  await client.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: menu,
  });
}

module.exports = { handleHelp };