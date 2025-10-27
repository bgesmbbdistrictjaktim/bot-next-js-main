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
      const displayName = `${firstName || ''}${lastName ? ' ' + lastName : ''}`.trim() || (firstName || 'User');
      await client.sendMessage(
        chatId,
        `Halo ${displayName}! 👋\n\n` +
          'Selamat datang di Order Management Bot!\n\n' +
          'Anda belum terdaftar dalam sistem.\n' +
          'Silakan pilih cara registrasi dan role Anda:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👨‍💻 HD (Pakai Nama Telegram)', callback_data: 'register_hd' }],
              [{ text: '👷🏻‍♂️ Teknisi (Pakai Nama Telegram)', callback_data: 'register_teknis' }],
              [{ text: '👨‍💻 HD (Ketik Nama Sendiri)', callback_data: 'register_hd_custom' }],
              [{ text: '👷🏻‍♂️ Teknisi (Ketik Nama Sendiri)', callback_data: 'register_teknis_custom' }],
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
    const firstName = callbackQuery.from.first_name || '';
    const lastName = callbackQuery.from.last_name || '';
    const data = callbackQuery.data;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await client.sendMessage(chatId, '❌ Konfigurasi Supabase tidak lengkap.');
      return;
    }

    // Handle custom-name registration: prompt user to type a name
    if (data === 'register_hd_custom' || data === 'register_teknis_custom') {
      const role = data === 'register_hd_custom' ? 'HD' : 'Teknisi';
      await client.sendMessage(
        chatId,
        '✏️ Masukkan nama Anda untuk registrasi:',
        { reply_markup: { force_reply: true } }
      );
      // Return a signal object so route can start name-input session
      return { handled: true, requiresNameInput: true, role };
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

    const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`.trim() || (firstName || 'User');
    if (!existing) {
      const { error: insertError } = await supabase
        .from('users')
        .insert({ telegram_id: telegramId, name: fullName, role });
      if (insertError) {
        await client.sendMessage(chatId, `❌ Gagal mendaftar: ${insertError.message}`);
        return true;
      }
    } else {
      // Update role if already registered; also update name from Telegram
      await supabase.from('users').update({ role, name: fullName }).eq('telegram_id', telegramId);
    }

    if (typeof client.answerCallbackQuery === 'function') {
      await client.answerCallbackQuery(callbackQuery.id);
    }

    await showWelcomeMessage(client, chatId, role, fullName);
    return true;
  } catch (error) {
    console.error('Error in registration callback:', error);
    const chatId = callbackQuery.message.chat.id;
    await client.sendMessage(chatId, '❌ Terjadi kesalahan saat proses pendaftaran.');
    return true;
  }
}

module.exports = { checkUserRegistration, handleRegistrationCallback };