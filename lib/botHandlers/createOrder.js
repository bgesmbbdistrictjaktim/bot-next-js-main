const { createClient } = require('@supabase/supabase-js');
const { nowJakartaWithOffset, formatOrderCard, formatAssignmentSimple } = require('../botUtils');

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

async function getUserByTelegramId(telegramId) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from('users')
    .select('id, role, name')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();
  return data || null;
}

function buildOrderSummary(order) {
  const statusEmoji = {
    'Pending': '⏳',
    'In Progress': '🔄',
    'On Hold': '⏸️',
    'Completed': '✅',
    'Closed': '🔒',
  }[order.status] || '❓';
  return [
    `🆔 Order: ${order.order_id || order.id}`,
    `👤 ${order.customer_name || '-'}`,
    `📞 ${order.contact || '-'}`,
    `📍 ${order.customer_address || '-'}`,
    `🏢 STO: ${order.sto || '-'}`,
    `🧾 Transaksi: ${order.transaction_type || '-'}`,
    `⚙️ Layanan: ${order.service_type || '-'}`,
    `📈 Status: ${statusEmoji} ${order.status}`,
  ].join('\n');
}

async function startCreateOrderFlow(client, chatId, telegramId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await client.sendMessage(chatId, '❌ Anda belum terdaftar. Gunakan /start untuk mendaftar.');
      return;
    }
    if (user.role !== 'HD') {
      await client.sendMessage(chatId, '❌ Hanya Helpdesk (HD) yang dapat membuat order.');
      return;
    }
    await client.sendMessage(chatId, '🆕 Masukkan ORDER ID baru:', {
      reply_markup: { force_reply: true },
    });
  } catch (error) {
    console.error('startCreateOrderFlow error:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat memulai pembuatan order.');
  }
}

async function handleCreateOrderReply(client, chatId, telegramId, replyText, text) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return false;

    // STEP 1: ORDER ID
    if (/Masukkan ORDER ID baru:/i.test(replyText)) {
      const orderId = (text || '').trim();
      if (!orderId) {
        await client.sendMessage(chatId, '⚠️ ORDER ID tidak boleh kosong. Masukkan ORDER ID baru:', { reply_markup: { force_reply: true } });
        return true;
      }
      const { data: dup } = await supabase
        .from('orders')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();
      if (dup) {
        await client.sendMessage(chatId, `⚠️ ORDER ID ${orderId} sudah ada. Masukkan ORDER ID lain:`, { reply_markup: { force_reply: true } });
        return true;
      }

      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await client.sendMessage(chatId, '❌ Anda belum terdaftar. Gunakan /start untuk mendaftar.');
        return true;
      }

      const insertPayload = {
        order_id: orderId,
        status: 'Pending',
        tti_comply_status: 'Pending',
        created_by: user.id,
        created_at: nowJakartaWithOffset(),
        updated_at: nowJakartaWithOffset(),
        // Prefill NOT NULL columns using minimal-safe placeholders that pass checks
        customer_name: '-',
        customer_address: '-',
        contact: '-',
        // STO must satisfy orders_sto_check. Use a valid placeholder and update later.
        sto: 'CBB',
        // Transaction type may have checks; use a valid default from bot.js options.
        transaction_type: 'New install',
        // Service type must satisfy orders_service_type_check; update later with user input.
        service_type: 'Astinet',
      };
      const { error: insertErr } = await supabase.from('orders').insert(insertPayload);
      if (insertErr) {
        console.error('insert order error:', insertErr);
        await client.sendMessage(chatId, '❌ Gagal membuat order. Coba lagi.');
        return true;
      }
      await client.sendMessage(chatId, `Masukkan Nama Pelanggan untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
      return true;
    }

    // Extract ORDER ID from previous prompt
    let orderIdMatch = replyText.match(/ORDER\s+(\S+)/);
    const orderId = orderIdMatch ? orderIdMatch[1] : null;

    // STEP 2: Customer Name
    if (/Masukkan Nama Pelanggan untuk ORDER/i.test(replyText) && orderId) {
      await supabase
        .from('orders')
        .update({ customer_name: text, updated_at: nowJakartaWithOffset() })
        .eq('order_id', orderId);
      await client.sendMessage(chatId, `Masukkan Alamat Pelanggan untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
      return true;
    }

    // STEP 3: Customer Address
    if (/Masukkan Alamat Pelanggan untuk ORDER/i.test(replyText) && orderId) {
      await supabase
        .from('orders')
        .update({ customer_address: text, updated_at: nowJakartaWithOffset() })
        .eq('order_id', orderId);
      await client.sendMessage(chatId, `Masukkan Nomor Kontak Pelanggan untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
      return true;
    }

    // STEP 4: Contact
    if (/Masukkan Nomor Kontak Pelanggan untuk ORDER/i.test(replyText) && orderId) {
      await supabase
        .from('orders')
        .update({ contact: text, updated_at: nowJakartaWithOffset() })
        .eq('order_id', orderId);
      await client.sendMessage(chatId, `Masukkan STO untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
      return true;
    }

    // STEP 5: STO
    if (/Masukkan STO untuk ORDER/i.test(replyText) && orderId) {
      const raw = (text || '').trim();
      const upper = raw.toUpperCase();
      const allowedSto = new Set(['CBB','CWA','GAN','JTN','KLD','KRG','PDK','PGB','PGG','PSR','RMG','BIN','CPE','JAG','KAL','KBY','KMG','PSM','TBE','NAS']);
      if (!allowedSto.has(upper)) {
        await client.sendMessage(chatId, `⚠️ STO tidak valid. Pilih salah satu: CBB, CWA, GAN, JTN, KLD, KRG, PDK, PGB, PGG, PSR, RMG, BIN, CPE, JAG, KAL, KBY, KMG, PSM, TBE, NAS.\nMasukkan STO untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
        return true;
      }
      await supabase
        .from('orders')
        .update({ sto: upper, updated_at: nowJakartaWithOffset() })
        .eq('order_id', orderId);
      await client.sendMessage(chatId, `Masukkan Jenis Transaksi untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
      return true;
    }

    // STEP 6: Transaction Type
    if (/Masukkan Jenis Transaksi untuk ORDER/i.test(replyText) && orderId) {
      const raw = (text || '').trim().toLowerCase();
      const canonicalMap = {
        'disconnect': 'Disconnect',
        'modify': 'Modify',
        'new install existing': 'New install existing',
        'new install jt': 'New install jt',
        'new install': 'New install',
        'pda': 'PDA',
      };
      const transactionType = canonicalMap[raw];
      if (!transactionType) {
        await client.sendMessage(chatId, `⚠️ Jenis Transaksi tidak valid. Pilih salah satu: Disconnect, Modify, New install existing, New install jt, New install, PDA.\nMasukkan Jenis Transaksi untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
        return true;
      }
      await supabase
        .from('orders')
        .update({ transaction_type: transactionType, updated_at: nowJakartaWithOffset() })
        .eq('order_id', orderId);
      // Show allowed service types to guide input
      await client.sendMessage(chatId, `Masukkan Jenis Layanan untuk ORDER ${orderId} (pilihan: Astinet, metro, vpn ip, ip transit, siptrunk):`, { reply_markup: { force_reply: true } });
      return true;
    }

    // STEP 7: Service Type -> Finish
    if (/Masukkan Jenis Layanan untuk ORDER/i.test(replyText) && orderId) {
      const raw = (text || '').trim();
      const lower = raw.toLowerCase();
      const canonicalMap = {
        'astinet': 'Astinet',
        'metro': 'metro',
        'vpn ip': 'vpn ip',
        'ip transit': 'ip transit',
        'siptrunk': 'siptrunk',
      };
      const serviceType = canonicalMap[lower];
      if (!serviceType) {
        await client.sendMessage(chatId, `⚠️ Jenis Layanan tidak valid. Pilih salah satu: Astinet, metro, vpn ip, ip transit, siptrunk.\nMasukkan Jenis Layanan untuk ORDER ${orderId}:`, { reply_markup: { force_reply: true } });
        return true;
      }

      await supabase
        .from('orders')
        .update({ service_type: serviceType, updated_at: nowJakartaWithOffset() })
        .eq('order_id', orderId);
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      const summary = buildOrderSummary(order || { order_id: orderId, status: 'Pending' });
      await client.sendMessage(chatId, `✅ Order berhasil dibuat dan disimpan!\n\n${summary}\n\nPilih tindakan berikut:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👥 Assign Teknisi (Langsung)', callback_data: `direct_assign_${orderId}` }],
            [{ text: '⬅️ Kembali', callback_data: 'back_to_hd_menu' }],
          ],
        },
      });
      return true;
    }

    return false; // Not handled
  } catch (error) {
    console.error('handleCreateOrderReply error:', error);
    return false;
  }
}

async function showDirectAssignmentTechnicians(client, chatId, telegramId, orderId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }

    const { data: techs, error } = await supabase
      .from('users')
      .select('id, name, telegram_id')
      .eq('role', 'Teknisi')
      .order('name', { ascending: true });
    if (error) {
      console.error('fetch technicians error:', error);
      await client.sendMessage(chatId, '❌ Gagal mengambil daftar teknisi.');
      return;
    }
    if (!techs || techs.length === 0) {
      await client.sendMessage(chatId, 'ℹ️ Belum ada teknisi terdaftar.');
      return;
    }

    const keyboard = [];
    techs.forEach(t => {
      keyboard.push([{ text: `👷 ${t.name}`, callback_data: `select_direct_tech_${orderId}_${t.id}` }]);
    });
    keyboard.push([{ text: '⬅️ Batal', callback_data: `detail_order_${orderId}` }]);

    await client.sendMessage(chatId, `Pilih teknisi untuk ORDER ${orderId}:`, {
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (error) {
    console.error('showDirectAssignmentTechnicians error:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat menampilkan teknisi.');
  }
}

async function assignTechnicianDirectly(client, chatId, telegramId, orderId, userId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }
    const { error } = await supabase
      .from('orders')
      .update({ assigned_technician: userId, technician_assigned_at: nowJakartaWithOffset(), updated_at: nowJakartaWithOffset() })
      .eq('order_id', orderId);
    if (error) {
      console.error('assign direct technician error:', error);
      await client.sendMessage(chatId, '❌ Gagal melakukan assignment teknisi langsung.');
      return;
    }
    // Ambil detail order dan teknisi untuk notifikasi yang rapi
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    const { data: tech } = await supabase
      .from('users')
      .select('telegram_id, name')
      .eq('id', userId)
      .maybeSingle();
    const { data: hd } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', String(telegramId))
      .maybeSingle();
    if (tech && tech.telegram_id) {
      const techMsg = formatAssignmentSimple(order || { order_id: orderId }, {
        includeSecondaryHeader: false,
      });
      await client.sendMessage(Number(tech.telegram_id), techMsg);
    }
    await client.sendMessage(chatId, `✅ Teknisi berhasil diassign ke ORDER ${orderId}.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📄 Detail', callback_data: `detail_order_${orderId}` }],
          [{ text: '⬅️ Kembali', callback_data: 'back_to_hd_menu' }],
        ],
      },
    });
  } catch (error) {
    console.error('assignTechnicianDirectly error:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat menyimpan assignment teknisi.');
  }
}

module.exports = {
  startCreateOrderFlow,
  handleCreateOrderReply,
  showDirectAssignmentTechnicians,
  assignTechnicianDirectly,
};