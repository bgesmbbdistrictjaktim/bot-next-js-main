const { getUserAssignedOrders } = require('./orders');

async function showEvidenceMenu(client, chatId, telegramId) {
  const orders = await getUserAssignedOrders(telegramId);
  if (!orders || orders.length === 0) {
    await client.sendMessage(chatId, '📸 Upload Evidence\n\nTidak ada order aktif yang ditugaskan kepada Anda.');
    return;
  }

  let message = '📸 Upload Evidence\n\nPilih order untuk memulai proses evidence close:\n\n';
  const keyboard = [];
  orders.forEach((order, index) => {
    message += `${index + 1}. ${order.order_id} ${order.customer_name} (${order.status})\n`;
    keyboard.push([
      { text: `${index + 1}. ${order.order_id} ${order.customer_name}`, callback_data: `evidence_order_${order.order_id}` },
    ]);
  });

  await client.sendMessage(chatId, message, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

module.exports = { showEvidenceMenu };