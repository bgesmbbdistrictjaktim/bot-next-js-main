const { getUserAssignedOrders } = require('./orders');
const { getReplyMenuKeyboard } = require('../botMenus');

async function showProgressMenu(client, chatId, telegramId) {
  const orders = await getUserAssignedOrders(telegramId);
  if (!orders || orders.length === 0) {
    await client.sendMessage(
      chatId,
      '📝 Update Progress\n\nTidak ada order aktif yang ditugaskan kepada Anda.',
      getReplyMenuKeyboard('Teknisi')
    );
    return;
  }

  let message = '📝 Update Progress\n\nPilih order yang akan diupdate:\n\n';
  const keyboard = [];
  orders.forEach((order, index) => {
    message += `${index + 1}. ${order.order_id} ${order.customer_name} (${order.status})\n`;
    keyboard.push([
      { text: `${index + 1}. ${order.order_id} ${order.customer_name}`, callback_data: `progress_order_${order.order_id}` },
    ]);
  });

  // Tambahkan tombol Batalkan agar teknisi bisa keluar dari sesi dengan cepat
  keyboard.push([{ text: '❌ Batalkan', callback_data: 'cancel_session' }]);

  await client.sendMessage(chatId, message, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

module.exports = { showProgressMenu };