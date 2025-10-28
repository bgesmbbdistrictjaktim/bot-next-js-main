const { createClient } = require('@supabase/supabase-js');
const { getStatusEmoji, getStageEmoji, getStageStatusEmoji, formatIndonesianDateTime, sortOrdersNewestFirst } = require('../botUtils');

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch (_e) {
    return null;
  }
}

async function getUserAssignedOrders(telegramId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', String(telegramId))
      .single();
    if (!user) return [];

    const { data: directOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('assigned_technician', user.id)
      .in('status', ['Pending', 'In Progress', 'On Hold'])
      .order('created_at', { ascending: false });

    const { data: stageOrders } = await supabase
      .from('order_stage_assignments')
      .select(`orders!inner(*)`)
      .eq('assigned_technician', String(telegramId))
      .in('orders.status', ['Pending', 'In Progress', 'On Hold']);

    const allOrders = [];
    const orderIds = new Set();

    if (directOrders) {
      directOrders.forEach(order => {
        if (!orderIds.has(order.id)) {
          allOrders.push(order);
          orderIds.add(order.id);
        }
      });
    }

    if (stageOrders) {
      stageOrders.forEach(item => {
        const order = item.orders;
        if (!orderIds.has(order.id)) {
          allOrders.push(order);
          orderIds.add(order.id);
        }
      });
    }

    const sorted = sortOrdersNewestFirst(allOrders);
    return sorted;
  } catch (error) {
    console.error('Error getting assigned orders:', error);
    return [];
  }
}

async function showMyOrders(client, chatId, telegramId, role) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }

    if (role === 'Teknisi') {
      await showTechnicianStageAssignments(client, chatId, telegramId);
      return;
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', String(telegramId))
      .single();

    if (userError || !user) {
      console.error('Error fetching user:', userError);
      await client.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data user.');
      return;
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      await client.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!orders || orders.length === 0) {
      await client.sendMessage(chatId, '📋 Daftar Order\n\nTidak ada order yang ditemukan.');
      return;
    }

    let message = '📋 Daftar Order\n\n';
    const ordersSorted = sortOrdersNewestFirst(orders || []);
    ordersSorted.forEach((order, index) => {
      const statusEmoji = getStatusEmoji(order.status);
      message += `${index + 1}. ${order.customer_name}\n`;
      message += `   Status: ${statusEmoji} ${order.status}\n`;
      message += `   Alamat: ${order.customer_address}\n`;
      message += `   Kontak: ${order.contact}\n`;
      message += `   STO: ${order.sto || 'Belum diisi'}\n`;
      message += `   Type: ${order.transaction_type || 'Belum diisi'}\n`;
      message += `   Layanan: ${order.service_type || 'Belum diisi'}\n`;
      message += `   Dibuat: ${formatIndonesianDateTime(order.created_at)}\n\n`;
    });

    await client.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error showing orders:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
  }
}

async function showTechnicianStageAssignments(client, chatId, telegramId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }

    const { data: assignments, error } = await supabase
      .from('order_stage_assignments')
      .select(`
        id,
        order_id,
        stage,
        status,
        assigned_at,
        orders!inner(
          order_id,
          created_at,
          customer_name,
          customer_address,
          contact,
          sto,
          service_type,
          status
        )
      `)
      .eq('assigned_technician', String(telegramId))
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('Error fetching stage assignments:', error);
      await client.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data penugasan.');
      return;
    }

    if (!assignments || assignments.length === 0) {
      await client.sendMessage(chatId, '📋 Penugasan Stage Saya\n\nTidak ada penugasan stage yang ditemukan.');
      return;
    }

    const orderGroups = {};
    assignments.forEach(assignment => {
      const orderId = assignment.order_id;
      if (!orderGroups[orderId]) {
        orderGroups[orderId] = {
          order: assignment.orders,
          stages: []
        };
      }
      orderGroups[orderId].stages.push(assignment);
    });

    // Sort groups by order.created_at desc, fallback by numeric order_id desc
    const groups = Object.keys(orderGroups).map(orderId => ({ orderId, ...orderGroups[orderId] }));
    const groupsSorted = groups.sort((a, b) => {
      const ta = a.order?.created_at ? new Date(a.order.created_at).getTime() : -Infinity;
      const tb = b.order?.created_at ? new Date(b.order.created_at).getTime() : -Infinity;
      if (ta !== tb) return tb - ta;
      const na = Number(String(a.orderId || '').replace(/\D/g, '')) || -Infinity;
      const nb = Number(String(b.orderId || '').replace(/\D/g, '')) || -Infinity;
      return nb - na;
    });

    let message = '📋 Penugasan Stage Saya\n\n';
    groupsSorted.forEach((group, index) => {
      const orderId = group.orderId;
      const order = group.order;

      message += `${index + 1}. 📋 ${orderId}\n`;
      message += `   👤 ${order.customer_name}\n`;
      message += `   📍 ${order.customer_address}\n`;
      message += `   📞 ${order.contact}\n`;
      message += `   🏢 STO: ${order.sto}\n`;
      message += `   📞 Service: ${order.service_type}\n`;
      message += `   📊 Status Order: ${getStatusEmoji(order.status)} ${order.status}\n`;
      message += `   \n   🔧 Stage yang ditugaskan:\n`;

      group.stages.forEach(stage => {
        const stageEmoji = getStageEmoji(stage.stage);
        const statusEmoji = getStageStatusEmoji(stage.status);
        message += `      ${stageEmoji} ${stage.stage}: ${statusEmoji} ${stage.status}\n`;
      });
      message += `\n`;
    });

  const keyboard = [];
  groupsSorted.forEach(group => {
    keyboard.push([{ text: `🔄 Update Progress - ${group.orderId}`, callback_data: `tech_stage_progress_${group.orderId}` }]);
  });

  // Tambahkan tombol Batalkan agar teknisi bisa keluar dari daftar penugasan
  keyboard.push([{ text: '❌ BATALKAN/EN SESSION', callback_data: 'cancel_session' }]);

  await client.sendMessage(chatId, message, {
    reply_markup: { inline_keyboard: keyboard }
  });
  } catch (error) {
    console.error('Error showing technician stage assignments:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data penugasan.');
  }
}

module.exports = { showMyOrders, showTechnicianStageAssignments, getUserAssignedOrders };