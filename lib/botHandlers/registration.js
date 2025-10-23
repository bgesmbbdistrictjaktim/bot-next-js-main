const { createClient } = require('@supabase/supabase-js');
const { showWelcomeMessage } = require('./welcome');

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

async function checkUserRegistration(client, chatId, telegramId, firstName, lastName) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', String(telegramId))
      .single();

    if (error || !user) {
      await client.sendMessage(
        chatId,
        `Halo ${firstName}! 👋\n\n` +
          'Selamat datang di Order Management Bot!\n\n' +
          'Anda belum terdaftar dalam sistem.\n' +
          'Silakan pilih role Anda:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Daftar sebagai HD (Helpdesk)', callback_data: 'register_hd' }],
              [{ text: '🔧 Daftar sebagai Teknisi', callback_data: 'register_teknis' }],
            ],
          },
        }
      );
      return;
    }

    await showWelcomeMessage(client, chatId, user.role, user.name);
  } catch (error) {
    console.error('Error checking user registration:', error);
    await client.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleRegistrationCallback(client, callbackQuery) {
  try {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = String(callbackQuery.from.id);
    const firstName = callbackQuery.from.first_name || 'User';
    const data = callbackQuery.data;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }

    let role = null;
    if (data === 'register_hd') role = 'HD';
    if (data === 'register_teknis') role = 'Teknisi';

    if (!role) {
      // Not a registration callback, ignore
      return false;
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase
        .from('users')
        .insert({ telegram_id: telegramId, name: firstName, role });
      if (insertError) {
        await client.sendMessage(chatId, `❌ Gagal mendaftar: ${insertError.message}`);
        return true;
      }
    } else {
      // Update role if already registered
      await supabase.from('users').update({ role }).eq('telegram_id', telegramId);
    }

    if (typeof client.answerCallbackQuery === 'function') {
      await client.answerCallbackQuery(callbackQuery.id);
    }

    await showWelcomeMessage(client, chatId, role, firstName);
    return true;
  } catch (error) {
    console.error('Error in registration callback:', error);
    const chatId = callbackQuery.message.chat.id;
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat proses pendaftaran.');
    return true;
  }
}

module.exports = { checkUserRegistration, handleRegistrationCallback };