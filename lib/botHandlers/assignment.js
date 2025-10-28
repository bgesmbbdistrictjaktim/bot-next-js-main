const { createClient } = require('@supabase/supabase-js');
const { getStatusEmoji, getProgressStatusEmoji, getStageEmoji, getStageStatusEmoji, nowJakartaWithOffset, formatOrderCard, formatAssignmentSimple, formatIndonesianDateTime } = require('../botUtils');

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try { return createClient(url, key); } catch (_e) { return null; }
}

async function showOrderSelectionForStageAssignment(client, chatId, telegramId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('order_id, customer_name, status, sto, transaction_type, service_type, created_at')
      .in('status', ['Pending', 'In Progress', 'On Hold'])
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Error fetching orders:', error);
      await client.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!orders || orders.length === 0) {
      await client.sendMessage(chatId, '📋 Tidak ada order aktif untuk assignment per stage.');
      return;
    }

    let message = '👥 Pilih Order untuk Assignment Teknisi per Stage\n\n';
    message += 'Pilih order yang ingin Anda assign teknisi untuk setiap stage:\n\n';

    // Client-side stable sort: newest by created_at desc, nulls last; tie-breaker by numeric part of order_id desc
    const sortedOrders = (orders || []).slice().sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : -Infinity;
      const tb = b.created_at ? new Date(b.created_at).getTime() : -Infinity;
      if (ta !== tb) return tb - ta;
      const na = Number(String(a.order_id || '').replace(/\D/g, '')) || 0;
      const nb = Number(String(b.order_id || '').replace(/\D/g, '')) || 0;
      return nb - na;
    });

    const keyboard = sortedOrders.map(order => {
      const statusEmoji = getStatusEmoji(order.status);
      const shortInfo = `${order.order_id} - ${order.customer_name}`;
      const label = shortInfo.length > 35 ? shortInfo.substring(0, 32) + '...' : shortInfo;
      return [{ text: `${statusEmoji} ${label}`, callback_data: `stage_assign_order_${order.order_id}` }];
    });

    await client.sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } });
  } catch (err) {
    console.error('Error in showOrderSelectionForStageAssignment:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function showStageAssignmentMenu(client, chatId, telegramId, orderId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) { await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.'); return; }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, customer_name, status, sto, transaction_type, service_type')
      .eq('order_id', orderId)
      .single();
    if (orderError || !order) { await client.sendMessage(chatId, '❌ Order tidak ditemukan.'); return; }

    const { data: assignments } = await supabase
      .from('order_stage_assignments')
      .select('stage, assigned_technician, status, assigned_at, users!assigned_technician(name)')
      .eq('order_id', order.order_id);

    const assignmentMap = {};
    if (assignments) assignments.forEach(a => { assignmentMap[a.stage] = a; });

    const stages = ['Survey', 'Penarikan', 'Instalasi', 'P2P', 'Evidence'];
    const { data: progressRecord } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', order.order_id)
      .maybeSingle();

    const progressKeyMap = {
      'Survey': 'survey_jaringan',
      'Penarikan': 'penarikan_kabel',
      'P2P': 'p2p',
      'Instalasi': 'instalasi_ont',
      'Evidence': null,
    };

    let message = `👥 Assignment Teknisi per Stage\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer: ${order.customer_name}\n` +
      `📍 STO: ${order.sto}\n` +
      `🔄 Status: ${order.status}\n\n` +
      `Status Assignment per Stage:\n\n`;

    const keyboard = [];
    for (const stage of stages) {
      const stageEmoji = getStageEmoji(stage);
      const assignment = assignmentMap[stage];
      const key = progressKeyMap[stage];
      const progress = key && progressRecord ? progressRecord[key] : null;
      const st = progress?.status;
      const timeStr = progress?.timestamp ? formatIndonesianDateTime(progress.timestamp) : null;
      const progressTech = progress?.technician || null;

      let statusText = 'Belum ada progress';
      let statusEmoji = '⚪';
      if (st) {
        statusEmoji = getProgressStatusEmoji(st);
        statusText = st;
      } else if (key === null) {
        statusText = 'Belum ada progress';
      }

      // Compose line: prefer technician who did progress; fallback to assigned technician
      const techName = progressTech || (assignment?.users?.name || null);
      let line = `${stageEmoji} ${stage}: ${statusEmoji} ${statusText}`;
      if (timeStr) line += ` - ${timeStr}`;
      if (techName) line += ` • ${techName}`;
      message += `${line}\n`;

      // Buttons: include status and technician hint to reflect current progress
      // Treat stages with existing progress as eligible for Reassign even if no assignment row yet
      const hasProgress = Boolean(st) || Boolean(progressTech);
      if (assignment || hasProgress) {
        const parts = [`🔄 Reassign ${stage}`];
        if (statusText && statusText !== 'Belum ada progress') parts.push(`• ${statusText}`);
        if (techName) parts.push(`• ${techName}`);
        const btnLabel = parts.join(' ');
        keyboard.push([{ text: btnLabel, callback_data: `reassign_stage_${order.order_id}_${stage}` }]);
      } else {
        const parts = [`➕ Assign ${stage}`];
        if (statusText && statusText !== 'Belum ada progress') parts.push(`• ${statusText}`);
        if (techName) parts.push(`• ${techName}`);
        const btnLabel = parts.join(' ');
        keyboard.push([{ text: btnLabel, callback_data: `assign_stage_${order.order_id}_${stage}` }]);
      }
    }

    keyboard.push([{ text: '👥 Assign Semua ke Teknisi Sama', callback_data: `assign_all_same_${order.order_id}` }]);
    keyboard.push([{ text: '🔙 Kembali ke Daftar Order', callback_data: 'back_to_assignment_list' }]);

    await client.sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } });
  } catch (err) {
    console.error('Error in showStageAssignmentMenu:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function showTechnicianSelectionForStage(client, chatId, telegramId, orderId, stage) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) { await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.'); return; }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, customer_name, sto')
      .eq('order_id', orderId)
      .single();
    if (orderError || !order) { await client.sendMessage(chatId, '❌ Order tidak ditemukan.'); return; }

    let technicians = [];
    const { data: mappings } = await supabase
      .from('technician_sto')
      .select('user_id')
      .eq('sto', order.sto);
    if (mappings && mappings.length) {
      const userIds = mappings.map(m => m.user_id).filter(Boolean);
      const { data: stoTechnicians } = await supabase
        .from('users')
        .select('telegram_id, name, id')
        .eq('role', 'Teknisi')
        .in('id', userIds)
        .order('name');
      technicians = stoTechnicians || [];
    }
    if (!technicians || technicians.length === 0) {
      const { data: allTechs } = await supabase
        .from('users')
        .select('telegram_id, name')
        .eq('role', 'Teknisi')
        .order('name');
      technicians = allTechs || [];
    }

    const stageEmoji = getStageEmoji(stage);
    let message = `👥 Pilih Teknisi untuk ${stage}\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer: ${order.customer_name}\n` +
      `📍 STO: ${order.sto}\n` +
      `${stageEmoji} Stage: ${stage}\n\n` +
      `Pilih teknisi untuk stage ini:`;

    const keyboard = [];
    for (let i = 0; i < technicians.length; i += 2) {
      const row = [];
      row.push({ text: `👤 ${technicians[i].name}`, callback_data: `select_tech_for_stage_${order.order_id}_${stage}_${technicians[i].telegram_id}` });
      if (i + 1 < technicians.length) {
        row.push({ text: `👤 ${technicians[i + 1].name}`, callback_data: `select_tech_for_stage_${order.order_id}_${stage}_${technicians[i + 1].telegram_id}` });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: '🔙 Kembali ke Assignment Menu', callback_data: 'back_to_assignment_list' }]);

    await client.sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } });
  } catch (err) {
    console.error('Error in showTechnicianSelectionForStage:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function assignTechnicianToStage(client, chatId, telegramId, orderId, stage, techId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) { await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.'); return; }

    const { data: technician, error: techError } = await supabase
      .from('users').select('name, telegram_id').eq('telegram_id', String(techId)).single();
    if (techError || !technician) { await client.sendMessage(chatId, '❌ Teknisi tidak ditemukan.'); return; }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, customer_name, customer_address, contact, sto, transaction_type, service_type')
      .eq('order_id', orderId)
      .single();
    if (orderError || !order) { await client.sendMessage(chatId, '❌ Order tidak ditemukan.'); return; }

    const { data: existingAssignment, error: checkError } = await supabase
      .from('order_stage_assignments').select('id').eq('order_id', order.order_id).eq('stage', stage).maybeSingle();
    if (checkError && checkError.code !== 'PGRST116') { await client.sendMessage(chatId, '❌ Gagal memeriksa assignment.'); return; }

    if (existingAssignment) {
      const { error: updateError } = await supabase
        .from('order_stage_assignments')
        .update({ assigned_technician: String(techId), assigned_by: String(telegramId), assigned_at: nowJakartaWithOffset(), status: 'assigned' })
        .eq('id', existingAssignment.id);
      if (updateError) { await client.sendMessage(chatId, '❌ Gagal mengupdate assignment.'); return; }
    } else {
      const { error: insertError } = await supabase
        .from('order_stage_assignments')
        .insert({ order_id: order.order_id, stage, assigned_technician: String(techId), assigned_by: String(telegramId), assigned_at: nowJakartaWithOffset(), status: 'assigned' });
      if (insertError) { await client.sendMessage(chatId, '❌ Gagal membuat assignment baru.'); return; }
    }

    const stageEmoji = getStageEmoji(stage);
    const confirmMsg = `✅ Assignment Berhasil!\n\n${stageEmoji} Stage: ${stage}\n👤 Teknisi: ${technician.name}\n📋 Order: ${order.order_id}\n👤 Customer: ${order.customer_name}\n\nTeknisi telah diberi notifikasi.`;
    await client.sendMessage(chatId, confirmMsg);
    const techMessage = formatAssignmentSimple(order, {
      headerTop: '🔔 Assignment Baru Ditugaskan',
      includeSecondaryHeader: false,
      stageLabel: stage,
    });
    await client.sendMessage(Number(techId), techMessage);

    await showStageAssignmentMenu(client, chatId, telegramId, order.order_id);
  } catch (err) {
    console.error('Error in assignTechnicianToStage:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function showTechnicianSelectionForAllStages(client, chatId, telegramId, orderId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) { await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.'); return; }

    const { data: order, error: orderError } = await supabase
      .from('orders').select('order_id, customer_name, sto').eq('order_id', orderId).single();
    if (orderError || !order) { await client.sendMessage(chatId, '❌ Order tidak ditemukan.'); return; }

    let technicians = [];
    const { data: mappings } = await supabase
      .from('technician_sto').select('user_id').eq('sto', order.sto);
    if (mappings && mappings.length) {
      const userIds = mappings.map(m => m.user_id).filter(Boolean);
      const { data: stoTechnicians } = await supabase
        .from('users').select('telegram_id, name, id').eq('role', 'Teknisi').in('id', userIds).order('name');
      technicians = stoTechnicians || [];
    }
    if (!technicians || technicians.length === 0) {
      const { data: allTechs } = await supabase
        .from('users').select('telegram_id, name').eq('role', 'Teknisi').order('name');
      technicians = allTechs || [];
    }

    let message = `👥 Assign Semua Stage ke Teknisi Sama\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer: ${order.customer_name}\n` +
      `📍 STO: ${order.sto}\n\n` +
      `Pilih teknisi:`;

    const keyboard = [];
    for (let i = 0; i < technicians.length; i += 2) {
      const row = [];
      row.push({ text: `👤 ${technicians[i].name}`, callback_data: `assign_all_tech_${order.order_id}_${technicians[i].telegram_id}` });
      if (i + 1 < technicians.length) {
        row.push({ text: `👤 ${technicians[i + 1].name}`, callback_data: `assign_all_tech_${order.order_id}_${technicians[i + 1].telegram_id}` });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: '🔙 Kembali ke Assignment Menu', callback_data: 'back_to_assignment_list' }]);

    await client.sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } });
  } catch (err) {
    console.error('Error in showTechnicianSelectionForAllStages:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function assignTechnicianToAllStages(client, chatId, telegramId, orderId, techId) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) { await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.'); return; }

    const { data: technician, error: techError } = await supabase
      .from('users').select('name, telegram_id').eq('telegram_id', String(techId)).single();
    if (techError || !technician) { await client.sendMessage(chatId, '❌ Teknisi tidak ditemukan.'); return; }

    const stages = ['Survey', 'Penarikan', 'P2P', 'Instalasi', 'Evidence'];
    let successCount = 0, errorCount = 0;

    for (const stage of stages) {
      const { data: existingAssignment, error: checkError } = await supabase
        .from('order_stage_assignments').select('id').eq('order_id', orderId).eq('stage', stage).maybeSingle();
      if (checkError && checkError.code !== 'PGRST116') { errorCount++; continue; }
      if (existingAssignment) {
        const { error: updateError } = await supabase
          .from('order_stage_assignments')
          .update({ assigned_technician: String(techId), assigned_by: String(telegramId), assigned_at: nowJakartaWithOffset(), status: 'assigned' })
          .eq('id', existingAssignment.id);
        if (updateError) errorCount++; else successCount++;
      } else {
        const { error: insertError } = await supabase
          .from('order_stage_assignments')
          .insert({ order_id: orderId, stage, assigned_technician: String(techId), assigned_by: String(telegramId), assigned_at: nowJakartaWithOffset(), status: 'assigned' });
        if (insertError) errorCount++; else successCount++;
      }
    }

    const { data: order } = await supabase
      .from('orders')
      .select('order_id, customer_name, customer_address, contact, sto, transaction_type, service_type')
      .eq('order_id', orderId)
      .maybeSingle();

    let confirmMessage = `✅ Bulk Assignment Selesai!\n\n` +
      `👤 Teknisi: ${technician.name}\n` +
      `📋 Order: ${order?.order_id || orderId}\n` +
      `👤 Customer: ${order?.customer_name || 'N/A'}\n\n` +
      `📊 Hasil:\n` +
      `✅ Berhasil: ${successCount} stage\n` +
      (errorCount > 0 ? `❌ Gagal: ${errorCount} stage\n` : '') +
      `\nTeknisi telah diberi notifikasi.`;
    await client.sendMessage(chatId, confirmMessage);

    const techMessage = formatAssignmentSimple(order || { order_id: orderId }, {
      headerTop: '🔔 Assignment Baru Ditugaskan',
      includeSecondaryHeader: false,
      stageLabel: 'Semua Stage',
    });
    await client.sendMessage(Number(techId), techMessage);

    await showStageAssignmentMenu(client, chatId, telegramId, orderId);
  } catch (err) {
    console.error('Error in assignTechnicianToAllStages:', err);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

module.exports = {
  showOrderSelectionForStageAssignment,
  showStageAssignmentMenu,
  showTechnicianSelectionForStage,
  assignTechnicianToStage,
  showTechnicianSelectionForAllStages,
  assignTechnicianToAllStages,
};