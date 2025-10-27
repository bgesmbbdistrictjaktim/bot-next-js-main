const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
// Load env from .env.local (primary) and fallback to .env
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || token.trim() === '') {
  console.error('❌ Telegram Bot Token not provided.');
  console.error('Fix: Copy env.example to .env.local and set TELEGRAM_BOT_TOKEN.');
  console.error('Example: TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
  process.exit(1);
}

// Helper functions for formatting
function formatIndonesianDateTime(dateString) {
  if (!dateString) return 'Belum diset';
  
  // Pastikan dateString adalah valid date
  const date = new Date(dateString);
  
  // Periksa apakah date valid
  if (isNaN(date.getTime())) return 'Format tanggal tidak valid';
  
  // Format dengan timezone Indonesia - format: 27 Sep 2024 10:46:57 WIB
  const options = {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  // Format tanggal dan tambahkan indikator WIB
  const formattedDate = date.toLocaleString('id-ID', options).replace(',', '').replace(/\./g, ':');
  
  // Tambahkan WIB untuk menunjukkan timezone Indonesia
  return `${formattedDate} WIB`;
}

function formatReadableDuration(hours) {
  if (!hours || hours === 0) return '0 MENIT';
  
  // Handle negative duration - should not happen in normal flow
  if (hours < 0) {
    console.warn(`Warning: Negative duration detected: ${hours} hours`);
    return '0 MENIT';
  }
  
  // Convert hours to minutes with better precision
  const totalMinutes = Math.round(hours * 60);
  
  // Handle very small durations (less than 1 minute)
  if (totalMinutes < 1) {
    return '1 MENIT'; // Show minimum 1 minute instead of 0
  }
  
  if (totalMinutes < 60) {
    return `${totalMinutes} MENIT`;
  } else if (totalMinutes < 1440) { // Less than 24 hours
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) {
      return `${hrs} JAM`;
    } else {
      return `${hrs} JAM ${mins} MENIT`;
    }
  } else { // 24 hours or more
    const days = Math.floor(totalMinutes / 1440);
    const remainingMinutes = totalMinutes % 1440;
    const hrs = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    
    let result = `${days} HARI`;
    if (hrs > 0) result += ` ${hrs} JAM`;
    if (mins > 0) result += ` ${mins} MENIT`;
    
    return result;
  }
}

// Handle reply keyboard button presses atau ini adalah markup keyboard
async function handleReplyKeyboardButtons(chatId, telegramId, text, role) {
  try {
    switch (text) {
      case '📋 Buat Order':
      case '📋 Order Saya':
        if (role === 'HD') {
          startCreateOrder(chatId, telegramId);
        } else {
          await showMyOrders(nodeClient, chatId, telegramId, role);
        }
        break;
      
      // case '📊 Lihat Order':
      //   showMyOrders(chatId, telegramId, 'HD');
      //   break;
      
      case '🔍 Cek Order':
        if (role === 'HD') {
          showSearchOrderMenu(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat cek order.', getMainMenuKeyboard(role), 
          getReplyMenuKeyboard(role));
        }
        break;
      
      case '📝 Update LME PT2':
        if (role === 'HD') {
          showLMEPT2UpdateMenu(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat update LME PT2.', getReplyMenuKeyboard(role));
        }
        break;
//coba menu LIHAT DAFTAR MENU YANG BELUM SOD
        case '🔍 Show SOD Order':
        if (role === 'HD') {
          showSODOrder(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat melihat SOD order.', getReplyMenuKeyboard(role));
        }
        break;
      
      case '📊 Show Order On Progress':
        if (role === 'HD') {
          showOrderOnProgress(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat melihat order on progress.', getReplyMenuKeyboard(role));
        }
        break;
      
      case '✅ Show Order Completed':
        if (role === 'HD') {
          showOrderCompletedMenu(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat melihat order completed.', getReplyMenuKeyboard(role));
        }
        break;
      
      case '🚀 Update SOD':
        if (role === 'HD') {
          showSODUpdateMenu(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat update SOD.', getReplyMenuKeyboard(role));
        }
        break;
      
      case '🎯 Update E2E':
        if (role === 'HD') {
          showE2EUpdateMenu(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat update E2E.', getReplyMenuKeyboard(role));
        }
        break;
      
      case '📝 Update Progress':
        await showProgressMenu(nodeClient, chatId, telegramId);
        break;
      
      case '📸 Upload Evidence':
        await showEvidenceMenu(nodeClient, chatId, telegramId);
        break;
      
      case '❓ Bantuan':
        showHelpByRole(chatId, role);
        break;
      
      case '👥 Assign Teknisi':
        if (role === 'HD') {
          // Clear any existing user state first
          delete userStates[telegramId];
          showOrderSelectionForStageAssignment(chatId, telegramId);
        } else {
          bot.sendMessage(chatId, '❌ Hanya HD yang dapat assign teknisi per stage.', getReplyMenuKeyboard(role));
        }
        break;
      
      default:
        // If text doesn't match any button, show menu
        const firstName2 = await getUserName(telegramId);
        await showWelcomeMessage(nodeClient, chatId, role, firstName2);
        break;
    }
  } catch (error) {
    console.error('Error handling reply keyboard:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.', getReplyMenuKeyboard(role));
  }
}

// Helper function to get user name
async function getUserName(telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: user } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', telegramId)
      .single();
    
    return user?.name || 'User';
  } catch (error) {
    return 'User';
  }
}
//ini kode utnuk mode bot
// Initialize bot and start depending on mode to avoid duplication
const BOT_MODE = process.env.TELEGRAM_BOT_MODE || 'polling';
const { createNodeBotClient } = require('../lib/telegramClient');
const { handleHelp } = require('../lib/botHandlers/help');
const { showWelcomeMessage } = require('../lib/botHandlers/welcome');
const { showMyOrders } = require('../lib/botHandlers/orders');
const { showProgressMenu } = require('../lib/botHandlers/progress');
const { showEvidenceMenu } = require('../lib/botHandlers/evidence');

const bot = new TelegramBot(token, { polling: false });
const nodeClient = createNodeBotClient(bot);
if (BOT_MODE === 'polling') {
  try {
    bot.deleteWebHook({ drop_pending_updates: true }).catch(() => {});
  } catch (e) {
    // ignore
  }
  bot.startPolling();
} else {
  console.log('🚫 Bot running in webhook mode; polling disabled.');
}

// User sessions untuk menyimpan state
const userSessions = new Map();
const userStates = {};

console.log('🤖 Starting Complete Order Management Bot...');
console.log('📱 Bot will handle all features properly');
console.log('⚠️  Press Ctrl+C to stop');

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const firstName = msg.from.first_name || 'User';
  const lastName = msg.from.last_name || '';
  
  console.log(`📨 Received /start from ${firstName} (${chatId})`);
  
  // Clear any existing session
  userSessions.delete(chatId);
  
  // Restore original behavior: check registration then welcome
  const { checkUserRegistration } = require('../lib/botHandlers/registration');
  await checkUserRegistration(nodeClient, chatId, telegramId, firstName, lastName);
});

// Handle /help command
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  console.log(`📨 Received /help from ${msg.from.first_name || 'User'} (${chatId})`);
  
  await handleHelp(nodeClient, chatId, telegramId);
});

// Handle /order command (HD only)
bot.onText(/\/order/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  console.log(`📨 Received /order from ${msg.from.first_name} (${chatId})`);
  
  getUserRole(telegramId).then(role => {
    if (role === 'HD') {
      startCreateOrder(chatId, telegramId);
    } else {
      bot.sendMessage(chatId, '❌ Hanya Helpdesk yang dapat membuat order.');
    }
  });
});

// Handle /myorders command
bot.onText(/\/myorders/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  console.log(`📨 Received /myorders from ${msg.from.first_name} (${chatId})`);
  
  getUserRole(telegramId).then(async role => {
    if (role) {
      await showMyOrders(nodeClient, chatId, telegramId, role);
    } else {
      await nodeClient.sendMessage(chatId, '❌ Anda belum terdaftar. Gunakan /start untuk mendaftar.');
    }
  });
});

// Handle /progress command (Teknisi only)
bot.onText(/\/progress/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  console.log(`📨 Received /progress from ${msg.from.first_name} (${chatId})`);
  
  getUserRole(telegramId).then(async role => {
    if (role === 'Teknisi') {
      await showProgressMenu(nodeClient, chatId, telegramId);
    } else {
      await nodeClient.sendMessage(chatId, '❌ Hanya Teknisi yang dapat update progress.');
    }
  });
});

// Handle /evidence command (Teknisi only)
bot.onText(/\/evidence/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  console.log(`📨 Received /evidence from ${msg.from.first_name} (${chatId})`);
  
  getUserRole(telegramId).then(async role => {
    if (role === 'Teknisi') {
      await showEvidenceMenu(nodeClient, chatId, telegramId);
    } else {
      await nodeClient.sendMessage(chatId, '❌ Hanya Teknisi yang dapat upload evidence.');
    }
  });
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const telegramId = callbackQuery.from.id.toString();
  
  console.log(`📨 Received callback: ${data} from ${callbackQuery.from.first_name}`);
  
  try {
    const { handleRegistrationCallback } = require('../lib/botHandlers/registration');
    const handled = await handleRegistrationCallback(nodeClient, callbackQuery);
    if (handled) return;

    // Fallback to existing router for non-registration actions
    handleCallbackQuery(callbackQuery);
  } catch (err) {
    console.error('Error in callback_query handler:', err);
    await nodeClient.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses tindakan.');
  }
});

// Store media groups temporarily to handle batch uploads
const mediaGroups = new Map();

// Handle photo uploads
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  console.log(`📨 Received photo from ${msg.from.first_name} (${chatId})`);
  
  // Handle media group (multiple photos sent together)
  if (msg.media_group_id) {
    handleMediaGroup(msg, telegramId);
  } else {
    // Single photo
    handleSinglePhoto(msg, telegramId);
  }
});

// Handle media group (batch photos)
async function handleMediaGroup(msg, telegramId) {
  const chatId = msg.chat.id;
  const mediaGroupId = msg.media_group_id;
  
  // Initialize or add to media group
  if (!mediaGroups.has(mediaGroupId)) {
    mediaGroups.set(mediaGroupId, {
      photos: [],
      chatId: chatId,
      telegramId: telegramId,
      timeout: null
    });
  }
  
  const group = mediaGroups.get(mediaGroupId);
  group.photos.push(msg);
  
  // Clear existing timeout
  if (group.timeout) {
    clearTimeout(group.timeout);
  }
  
  // Set timeout to process group after 1 second of no new photos
  group.timeout = setTimeout(async () => {
    await processBatchPhotos(mediaGroupId);
    mediaGroups.delete(mediaGroupId);
  }, 1000);
}

// Process batch photos
async function processBatchPhotos(mediaGroupId) {
  const group = mediaGroups.get(mediaGroupId);
  if (!group) return;
  
  const { photos, chatId, telegramId } = group;
  console.log(`Processing batch of ${photos.length} photos for media group ${mediaGroupId}`);
  
  // Process each photo in sequence to avoid race conditions
  for (const photo of photos) {
    await handleSinglePhoto(photo, telegramId);
    // Small delay between photos to ensure proper sequencing
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Handle single photo (extracted from original code)
async function handleSinglePhoto(msg, telegramId) {
  const chatId = msg.chat.id;
  const session = userSessions.get(chatId);
  
  if (!session || session.step !== 'photos') {
    bot.sendMessage(chatId, '❌ Tidak ada sesi upload foto yang aktif. Silakan mulai dengan /evidence terlebih dahulu.');
    return;
  }

  // Prevent duplicate processing
  const photoId = msg.photo[msg.photo.length - 1].file_unique_id;
  if (session.processedPhotos && session.processedPhotos.has(photoId)) {
    console.log('Photo already processed, skipping duplicate');
    return;
  }
  
  // Initialize processed photos set if not exists
  if (!session.processedPhotos) {
    session.processedPhotos = new Set();
  }
  
  // Mark photo as being processed
  session.processedPhotos.add(photoId);

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Define photo types with correct field names matching database schema
    const photoTypes = {
      1: { field: 'photo_sn_ont', label: 'Foto SN ONT' },
      2: { field: 'photo_technician_customer', label: 'Foto Teknisi + Pelanggan' },
      3: { field: 'photo_customer_house', label: 'Foto Rumah Pelanggan' },
      4: { field: 'photo_odp_front', label: 'Foto Depan ODP' },
      5: { field: 'photo_odp_inside', label: 'Foto Dalam ODP' },
      6: { field: 'photo_label_dc', label: 'Foto Label DC' },
      7: { field: 'photo_test_result', label: 'Foto Test Redaman' }
    };

    // Get current photo number
    const photoNumber = session.data.uploadedPhotos + 1;
    
    // Check if we've already uploaded 7 photos
    if (photoNumber > 7) {
      bot.sendMessage(chatId, '✅ Semua 7 foto evidence sudah berhasil diupload!');
      return;
    }
    
    const currentPhoto = photoTypes[photoNumber];

    console.log(`Processing photo ${photoNumber}: ${currentPhoto.label}`); // Debug log

    // Get file from Telegram
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(fileId);
    const response = await axios({
      method: 'get',
      url: `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
      responseType: 'arraybuffer'
    });

    // Prepare file for upload
    const buffer = Buffer.from(response.data);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Rename file to start with ORD-XXX-Evidence per request
    const filename = `${session.orderId}-Evidence-${currentPhoto.field}-${timestamp}.jpg`;

    console.log('Uploading file:', filename); // Debug log

    // Upload to Supabase Storage
    const { error: uploadError, data: uploadData } = await supabase.storage
      .from('evidence-photos')
      .upload(filename, buffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      bot.sendMessage(chatId, `❌ Gagal upload ${currentPhoto.label}. Silakan coba lagi.`);
      return;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('evidence-photos')
      .getPublicUrl(filename);

    console.log('Got public URL:', urlData.publicUrl); // Debug log

    // Update evidence record in database
    const { error: updateError } = await supabase
      .from('evidence')
      .update({
        [currentPhoto.field]: urlData.publicUrl
      })
      .eq('order_id', session.orderId);

    if (updateError) {
      console.error('Evidence update error:', updateError);
      bot.sendMessage(chatId, `❌ Gagal menyimpan ${currentPhoto.label} ke database.`);
      return;
    }

    console.log(`Updated database for ${currentPhoto.field}`); // Debug log

    // Increment counter AFTER successful save
    session.data.uploadedPhotos++;

    // Send success message
    bot.sendMessage(chatId,
      `✅ ${currentPhoto.label} Berhasil Disimpan!\n\n` +
      `📊 Progress: ${session.data.uploadedPhotos}/7 foto\n\n` +
      (session.data.uploadedPhotos < 7 
        ? `Silakan upload foto ke-${session.data.uploadedPhotos + 1}: ${photoTypes[session.data.uploadedPhotos + 1].label}`
        : '🎉 Semua evidence berhasil disimpan!')
    );

    // Close order if all photos are uploaded
    if (session.data.uploadedPhotos >= 7) {
      const { error: closeError } = await supabase
        .from('orders')
        .update({ status: 'Closed' })
        .eq('order_id', session.orderId);

      if (closeError) {
        console.error('Error closing order:', closeError);
        bot.sendMessage(chatId, '⚠️ Order berhasil diselesaikan tapi gagal update status.');
      } else {
        bot.sendMessage(chatId, '🎉 Order berhasil diselesaikan dan status telah diupdate ke "Closed"!');
        
        // Auto-update TTI Comply status when order is closed
        await autoUpdateTTIComplyOnClose(session.orderId);
      }

      // Clear session
      userSessions.delete(chatId);
    }

  } catch (error) {
    console.error('Error in handleSinglePhoto:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses foto. Silakan coba lagi.');
  }
}



// Handle text messages (for session input)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const text = msg.text;

  console.log(`📨 Received message: "${text}" from ${telegramId}`);
  console.log(`🔍 Current userStates for ${telegramId}:`, userStates[telegramId]);

  // Skip command
  if (text && text.startsWith('/')) return;

  // Handle user states for order search
  if (userStates[telegramId] && userStates[telegramId].state === 'waiting_order_id_search') {
    console.log(`🎯 Handling order search for: ${text}`);
    await handleOrderSearch(chatId, telegramId, text);
    return;
  }

  // Check if user has active session first
  const session = userSessions.get(chatId);
  if (session) {
    if (session.type === 'evidence_upload') {
      await handleEvidenceUploadFlow(chatId, telegramId, text, msg, session);
      return;
    }
    await handleSessionInput(chatId, telegramId, text, msg, session);
    return;
  }

  // Handle reply keyboard buttons only if no active session
  if (text && !text.startsWith('/')) {
    const role = await getUserRole(telegramId);
    if (role) {
      await handleReplyKeyboardButtons(chatId, telegramId, text, role);
      return;
    }
  }
});

// Helper functions
async function legacyCheckUserRegistration(chatId, telegramId, firstName, lastName) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    
    if (error || !user) {
      // User not registered, show registration options
      bot.sendMessage(chatId, 
        `Halo ${firstName}! 👋\n\n` +
        'Selamat datang di Order Management Bot!\n\n' +
        'Anda belum terdaftar dalam sistem.\n' +
        'Silakan pilih role Anda:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Daftar sebagai HD (Helpdesk)', callback_data: 'register_hd' }],
              [{ text: '🔧 Daftar sebagai Teknisi', callback_data: 'register_teknis' }]
            ]
          }
        }
      );
    } else {
      // User is registered, show welcome message
      await showWelcomeMessage(nodeClient, chatId, user.role, user.name);
    }
  } catch (error) {
    console.error('Error checking user registration:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Stage Assignment Strategy Handlers
async function handleSameTechStrategy(chatId, telegramId) {
  try {
    const session = userSessions.get(telegramId);
    if (!session || !session.orderData || !session.mainTechnician) {
      bot.sendMessage(chatId, '❌ Data order tidak ditemukan. Silakan mulai ulang proses pembuatan order.');
      return;
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create order first
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([{
        ...session.orderData,
        assigned_technician: session.mainTechnician.telegram_id,
        created_by: telegramId
      }])
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      bot.sendMessage(chatId, '❌ Gagal membuat order. Silakan coba lagi.');
      return;
    }

    // Assign same technician to all stages
    const stages = ['Survey', 'Penarikan', 'P2P', 'Instalasi'];
    const stageAssignments = stages.map(stage => ({
      order_id: orderData.order_id,
      stage: stage,
      assigned_technician: session.mainTechnician.telegram_id,
      assigned_by_hd: telegramId,
      assigned_at: new Date().toISOString(),
      status: 'assigned'
    }));

    const { error: assignmentError } = await supabase
      .from('order_stage_assignments')
      .insert(stageAssignments);

    if (assignmentError) {
      console.error('Error creating stage assignments:', assignmentError);
      bot.sendMessage(chatId, '❌ Gagal membuat penugasan stage. Silakan coba lagi.');
      return;
    }

    // Clear session
    userSessions.delete(telegramId);

    // Send success message
    bot.sendMessage(chatId, 
      `✅ Order berhasil dibuat!\n\n` +
      `📋 Order ID: ${orderData.order_id}\n` +
      `👤 Teknisi: ${session.mainTechnician.name}\n` +
      `🔄 Strategi: Teknisi yang sama untuk semua stage\n\n` +
      `Teknisi akan menerima notifikasi untuk semua stage.`
    );

    // Notify technician
    await notifyTechnicianNewAssignment(session.mainTechnician.telegram_id, orderData, stages);

  } catch (error) {
    console.error('Error in handleSameTechStrategy:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleMultiTechStrategy(chatId, telegramId) {
  try {
    const session = userSessions.get(telegramId);
    if (!session || !session.orderData) {
      bot.sendMessage(chatId, '❌ Data order tidak ditemukan. Silakan mulai ulang proses pembuatan order.');
      return;
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create order without assigned technician (will be assigned per stage)
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([{
        ...session.orderData,
        assigned_technician: null, // No main technician
        created_by: telegramId
      }])
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      bot.sendMessage(chatId, '❌ Gagal membuat order. Silakan coba lagi.');
      return;
    }

    // Update session with order ID for stage assignment
    session.orderId = orderData.order_id;
    userSessions.set(telegramId, session);

    // Show stage assignment interface
    await showStageAssignmentInterface(chatId, telegramId, orderData.order_id);

  } catch (error) {
    console.error('Error in handleMultiTechStrategy:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleSkipStrategy(chatId, telegramId) {
  try {
    const session = userSessions.get(telegramId);
    if (!session || !session.orderData) {
      bot.sendMessage(chatId, '❌ Data order tidak ditemukan. Silakan mulai ulang proses pembuatan order.');
      return;
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create order without any technician assignment
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([{
        ...session.orderData,
        assigned_technician: null,
        created_by: telegramId
      }])
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      bot.sendMessage(chatId, '❌ Gagal membuat order. Silakan coba lagi.');
      return;
    }

    // Clear session
    userSessions.delete(telegramId);

    // Send success message
    bot.sendMessage(chatId, 
      `✅ Order berhasil dibuat!\n\n` +
      `📋 Order ID: ${orderData.order_id}\n` +
      `🔄 Strategi: Tanpa penugasan teknisi\n\n` +
      `Anda dapat menugaskan teknisi per stage nanti melalui menu "View Orders".`
    );

  } catch (error) {
    console.error('Error in handleSkipStrategy:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function showStageAssignmentInterface(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get available technicians
    const { data: technicians, error } = await supabase
      .from('users')
      .select('telegram_id, name')
      .eq('role', 'Teknisi');

    if (error || !technicians || technicians.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada teknisi yang tersedia.');
      return;
    }

    const stages = ['Survey', 'Penarikan', 'P2P', 'Instalasi'];
    let message = `🔧 Penugasan Teknisi per Stage\n`;
    message += `📋 Order ID: ${orderId}\n\n`;
    message += `Pilih stage untuk menugaskan teknisi:\n\n`;

    const keyboard = [];
    stages.forEach(stage => {
      keyboard.push([{
        text: `📍 ${stage}`,
        callback_data: `assign_stage_${orderId}_${stage}`
      }]);
    });

    keyboard.push([{
      text: '✅ Selesai Penugasan',
      callback_data: `finish_assignment_${orderId}`
    }]);

    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error in showStageAssignmentInterface:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function notifyTechnicianNewAssignment(technicianId, orderData, stages) {
  try {
    let message = `🔔 Penugasan Baru!\n\n`;
    message += `📋 Order ID: ${orderData.order_id}\n`;
    message += `🏢 STO: ${orderData.sto}\n`;
    message += `📞 Service: ${orderData.service_type}\n`;
    message += `📍 Stages yang ditugaskan:\n`;
    
    stages.forEach(stage => {
      message += `   • ${stage}\n`;
    });
    
    message += `\n💡 Gunakan menu "My Orders" untuk melihat detail dan update progress.`;

    await bot.sendMessage(technicianId, message);
  } catch (error) {
    console.error('Error notifying technician:', error);
  }
}

// (legacy) showTechnicianSelectionForStage with orderIndex removed to avoid duplication

// (legacy) assignTechnicianToStage duplicate removed to avoid confusion; using the newer implementation below

async function finishStageAssignment(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get all stage assignments for this order
    const { data: assignments, error } = await supabase
      .from('order_stage_assignments')
      .select(`
        stage,
        assigned_technician,
        users!order_stage_assignments_assigned_technician_fkey(name)
      `)
      .eq('order_id', orderId);

    if (error) {
      console.error('Error fetching assignments:', error);
      bot.sendMessage(chatId, '❌ Gagal mengambil data penugasan.');
      return;
    }

    // Clear session
    userSessions.delete(telegramId);

    let message = `✅ Penugasan Stage Selesai!\n\n`;
    message += `📋 Order ID: ${orderId}\n\n`;
    
    if (assignments && assignments.length > 0) {
      message += `📍 Ringkasan Penugasan:\n`;
      assignments.forEach(assignment => {
        const techName = assignment.users?.name || 'Unknown';
        message += `   • ${assignment.stage}: ${techName}\n`;
      });
      message += `\n🔔 Semua teknisi telah menerima notifikasi.`;
    } else {
      message += `⚠️ Belum ada stage yang ditugaskan.\n`;
      message += `Anda dapat menugaskan teknisi nanti melalui menu "View Orders".`;
    }

    bot.sendMessage(chatId, message);

  } catch (error) {
    console.error('Error in finishStageAssignment:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function notifyTechnicianStageAssignment(technicianId, orderId, stage) {
  try {
    let message = `🔔 Penugasan Stage Baru!\n\n`;
    message += `📋 Order ID: ${orderId}\n`;
    message += `📍 Stage: ${stage}\n\n`;
    message += `💡 Gunakan menu "My Orders" untuk melihat detail dan update progress.`;

    await bot.sendMessage(technicianId, message);
  } catch (error) {
    console.error('Error notifying technician stage assignment:', error);
  }
}

async function getTelegramIdFromChatId(chatId) {
  // Dalam konteks bot Telegram, chatId biasanya sama dengan telegramId untuk private chat
  // Namun untuk keamanan, kita bisa mengambil dari context atau session jika diperlukan
  return chatId.toString();
}

async function getUserRole(telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('telegram_id', telegramId)
      .single();
    
    if (error || !user) return null;
    return user.role;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

function legacyShowWelcomeMessage(chatId, role, name) {
  const roleEmoji = role === 'HD' ? '📋' : '🔧';
  const roleName = role === 'HD' ? 'Helpdesk' : 'Teknisi';
  
  bot.sendMessage(chatId, 
    `Halo ${name}! 👋\n\n` +
    `Role: ${roleEmoji} ${roleName}\n\n` +
    'Selamat datang kembali di Order Management Bot!\n\n' +
    'Gunakan menu di bawah untuk mengakses fitur:',
    {
      
      ...getMainMenuKeyboard(role),
      ...getReplyMenuKeyboard(role)
    }
  );
}

function getMainMenuKeyboard(role) {
  if (role === 'HD') {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Buat Order Baru', callback_data: 'create_order' }],
          [{ text: '📊 Lihat Semua Order', callback_data: 'view_orders' }],
          [{ text: '🔍 Cek Order', callback_data: 'search_order' }],
          [{ text: '⚙️ Update Status Order', callback_data: 'update_status' }],
          [{ text: '👥 Assign Teknisi per Stage', callback_data: 'assign_technician_stage' }],
          [{ text: '🚀 Update SOD', callback_data: 'sod_menu' }],
          [{ text: '🎯 Update E2E', callback_data: 'e2e_menu' }],
          [{ text: '❓ Bantuan', callback_data: 'help' }]
         
        ]
      }
    };
  } else {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Order Saya', callback_data: 'my_orders' }],
          [{ text: '📝 Update Progress', callback_data: 'update_progress' }],
          [{ text: '📸 Upload Evidence', callback_data: 'upload_evidence' }],
          [{ text: '❓ Bantuan', callback_data: 'help' }]
        
        ]
      }
    };
  }
}


//MENU HD 
// Fungsi untuk reply keyboard menu yang muncul di text input
function getReplyMenuKeyboard(role) {
  if (role === 'HD') {
    return {
      reply_markup: {
        keyboard: [
          ['📋 Buat Order', '👥 Assign Teknisi'],
          ['🔍 Cek Order', '📝 Update LME PT2'],
          ['🎯 Update E2E', '🚀 Update SOD'],
       
          // ['🔍 Show SOD Order'],
          ['📊 Show Order On Progress', '✅ Show Order Completed'],
             ['❓ Bantuan']
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        persistent: true
      }
    };
  } else {
    return {
      reply_markup: {
        keyboard: [
          // [ '📝 Update Progress'],
          ['📝 Update Progress','📸 Upload Evidence', '❓ Bantuan']
          
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        persistent: true
      }
    };
  }
}

// '📋 Order Saya',


function startCreateOrder(chatId, telegramId) {
  // Set session untuk order creation
  userSessions.set(chatId, {
    type: 'create_order',
    step: 'order_id',
    data: {}
  });
   
bot.sendMessage(chatId,
  '📋 Membuat Order Baru\n\n' +
  '🆔 Silakan masukkan Order ID:'





  // bot.sendMessage(chatId, 
  //   '📋 Membuat Order Baru\n\n' +
  //   'Silakan masukkan informasi order secara lengkap:\n\n' +
  //   '1️⃣ Nama Pelanggan:',
  //   getPersistentMenuKeyboard()
  );
}

async function legacyShowMyOrders(chatId, telegramId, role) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    if (role === 'Teknisi') {
      // For technicians, show stage-specific assignments
      await showTechnicianStageAssignments(chatId, telegramId);
      return;
    }
    
    // For HD, get user UUID first then show orders they created
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();
    
    if (userError || !user) {
      console.error('Error fetching user:', userError);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data user.');
      return;
    }
    
    let query = supabase.from('orders').select('*');
    query = query.eq('created_by', user.id);
    
    const { data: orders, error } = await query.order('order_id', { ascending: true });
    
    if (error) {
      console.error('Error fetching orders:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }
    
    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, '📋 Daftar Order\n\nTidak ada order yang ditemukan.');
      return;
    }
    
    let message = '📋 Daftar Order\n\n';
    orders.forEach((order, index) => {
      const statusEmoji = getStatusEmoji(order.status);
      message += `${index + 1}. ${order.customer_name}\n`;
      message += `   Status: ${statusEmoji} ${order.status}\n`;
      message += `   Alamat: ${order.customer_address}\n`;
      message += `   Kontak: ${order.contact}\n`;
      message += `   STO: ${order.sto || 'Belum diisi'}\n`;
      message += `   Type: ${order.transaction_type || 'Belum diisi'}\n`;
      message += `   Layanan: ${order.service_type || 'Belum diisi'}\n`;
      message += `   Dibuat: ${order.created_at ? new Date(order.created_at).toLocaleString('id-ID', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }) : 'Tanggal tidak tersedia'}\n\n`;
    });
    
    bot.sendMessage(chatId, message);
    
  } catch (error) {
    console.error('Error showing orders:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
  }
}

async function showTechnicianStageAssignments(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get stage assignments for this technician
    const { data: assignments, error } = await supabase
      .from('order_stage_assignments')
      .select(`
        id,
        order_id,
        stage,
        status,
        assigned_at,
        orders!inner(
          customer_name,
          customer_address,
          contact,
          sto,
          service_type,
          status
        )
      `)
      .eq('assigned_technician', telegramId)
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('Error fetching stage assignments:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data penugasan.');
      return;
    }

    if (!assignments || assignments.length === 0) {
      bot.sendMessage(chatId, '📋 Penugasan Stage Saya\n\nTidak ada penugasan stage yang ditemukan.');
      return;
    }

    // Group assignments by order
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

    let message = '📋 Penugasan Stage Saya\n\n';
    
    Object.keys(orderGroups).forEach((orderId, index) => {
      const group = orderGroups[orderId];
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

    // Add interactive buttons for stage updates
    const keyboard = [];
    Object.keys(orderGroups).forEach(orderId => {
      keyboard.push([{
        text: `🔄 Update Progress - ${orderId}`,
        callback_data: `tech_stage_progress_${orderId}`
      }]);
    });

    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error showing technician stage assignments:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data penugasan.');
  }
}

function getStageEmoji(stage) {
  const stageEmojis = {
    'Survey': '🔍',
    'Penarikan': '📡',
    'P2P': '🔗',
    'Instalasi': '🔧'
  };
  return stageEmojis[stage] || '📋';
}

function getStageStatusEmoji(status) {
  const statusEmojis = {
    'assigned': '📋',
    'in_progress': '🔄',
    'completed': '✅',
    'blocked': '⚠️'
  };
  return statusEmojis[status] || '❓';
}

async function showStageProgressOptions(chatId, telegramId, assignmentId, stage) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get assignment details
    const { data: assignment, error } = await supabase
      .from('order_stage_assignments')
      .select(`
        id,
        order_id,
        stage,
        status,
        orders!inner(
          customer_name,
          sto,
          service_type
        )
      `)
      .eq('id', assignmentId)
      .eq('assigned_technician', telegramId)
      .single();

    if (error || !assignment) {
      bot.sendMessage(chatId, '❌ Penugasan stage tidak ditemukan atau Anda tidak memiliki akses.');
      return;
    }

    const stageEmoji = getStageEmoji(stage);
    let message = `${stageEmoji} Update Progress: ${stage}\n\n`;
    message += `📋 Order ID: ${assignment.order_id}\n`;
    message += `👤 Customer: ${assignment.orders.customer_name}\n`;
    message += `🏢 STO: ${assignment.orders.sto}\n`;
    message += `📞 Service: ${assignment.orders.service_type}\n\n`;
    message += `Status saat ini: ${getStageStatusEmoji(assignment.status)} ${assignment.status}\n\n`;
    message += `Pilih status baru:`;

    const keyboard = [];
    
    // Define available status transitions based on current status
    const statusOptions = getAvailableStatusOptions(assignment.status);
    
    statusOptions.forEach(status => {
      keyboard.push([{
        text: `${getStageStatusEmoji(status)} ${status}`,
        callback_data: `set_stage_status_${assignmentId}_${status}`
      }]);
    });

    keyboard.push([{
      text: '🔙 Kembali ke Menu Progress',
      callback_data: `tech_stage_progress_${assignment.order_id}`
    }]);

    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error showing stage progress options:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function updateStageStatus(chatId, telegramId, assignmentId, newStatus) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // First, verify the assignment belongs to this technician
    const { data: assignment, error: fetchError } = await supabase
      .from('order_stage_assignments')
      .select('id, order_id, stage, status')
      .eq('id', assignmentId)
      .eq('assigned_technician', telegramId)
      .single();

    if (fetchError || !assignment) {
      bot.sendMessage(chatId, '❌ Penugasan stage tidak ditemukan atau Anda tidak memiliki akses.');
      return;
    }

    // Update the stage assignment status
    const { error: updateError } = await supabase
      .from('order_stage_assignments')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId);

    if (updateError) {
      console.error('Error updating stage status:', updateError);
      bot.sendMessage(chatId, '❌ Gagal mengupdate status stage. Silakan coba lagi.');
      return;
    }

    // Create progress entry
    const { error: progressError } = await supabase
      .from('progress_new')
      .insert({
        order_id: assignment.order_id,
        stage: assignment.stage,
        status: newStatus,
        updated_by_technician: telegramId,
        stage_assignment_id: assignmentId,
        timestamp: new Date().toISOString()
      });

    if (progressError) {
      console.error('Error creating progress entry:', progressError);
      // Don't fail the whole operation, just log the error
    }

    // Check if we need to auto-progress to next stage
    if (newStatus === 'Completed') {
      await checkAndProgressToNextStage(assignment.order_id, assignment.stage);
    }

    const stageEmoji = getStageEmoji(assignment.stage);
    const statusEmoji = getStageStatusEmoji(newStatus);
    
    bot.sendMessage(chatId, 
      `✅ Status berhasil diupdate!\n\n` +
      `${stageEmoji} Stage: ${assignment.stage}\n` +
      `${statusEmoji} Status: ${newStatus}\n\n` +
      `Progress telah dicatat dalam sistem.`
    );

    // Show the progress menu again
    await showTechnicianStageProgressMenu(chatId, telegramId, assignment.order_id);

  } catch (error) {
    console.error('Error updating stage status:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function checkAndProgressToNextStage(orderId, currentStage) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Define stage progression order
    const stageOrder = [
      'Survey',
      'Design',
      'Material Preparation',
      'Installation',
      'Testing',
      'Documentation'
    ];

    const currentIndex = stageOrder.indexOf(currentStage);
    if (currentIndex === -1 || currentIndex === stageOrder.length - 1) {
      // No next stage or unknown stage
      return;
    }

    const nextStage = stageOrder[currentIndex + 1];

    // Check if next stage assignment exists and is pending
    const { data: nextAssignment, error } = await supabase
      .from('order_stage_assignments')
      .select('id, status')
      .eq('order_id', orderId)
      .eq('stage', nextStage)
      .single();

    if (!error && nextAssignment && nextAssignment.status === 'Pending') {
      // Auto-progress next stage to 'In Progress'
      await supabase
        .from('order_stage_assignments')
        .update({ 
          status: 'In Progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', nextAssignment.id);

      // Create progress entry for auto-progression
      await supabase
        .from('progress_new')
        .insert({
          order_id: orderId,
          stage: nextStage,
          status: 'In Progress',
          updated_by_technician: null, // System auto-progression
          stage_assignment_id: nextAssignment.id,
          timestamp: new Date().toISOString()
        });

      console.log(`Auto-progressed ${nextStage} to In Progress for order ${orderId}`);
    }

  } catch (error) {
    console.error('Error in auto-progression:', error);
    // Don't fail the main operation
  }
}

function getAvailableStatusOptions(currentStatus) {
  const statusFlow = {
    'Pending': ['In Progress', 'Cancelled'],
    'In Progress': ['Completed', 'On Hold', 'Cancelled'],
    'On Hold': ['In Progress', 'Cancelled'],
    'Completed': [], // No transitions from completed
    'Cancelled': ['Pending'] // Can restart if needed
  };
  
  return statusFlow[currentStatus] || [];
}

async function showTechnicianStageProgressMenu(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get stage assignments for this technician and order
    const { data: assignments, error } = await supabase
      .from('order_stage_assignments')
      .select(`
        id,
        stage,
        status,
        orders!inner(
          customer_name,
          sto,
          service_type
        )
      `)
      .eq('assigned_technician', telegramId)
      .eq('order_id', orderId);

    if (error || !assignments || assignments.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada penugasan stage yang ditemukan untuk order ini.');
      return;
    }

    const order = assignments[0].orders;
    let message = `🔄 Update Progress Stage\n\n`;
    message += `📋 Order ID: ${orderId}\n`;
    message += `👤 Customer: ${order.customer_name}\n`;
    message += `🏢 STO: ${order.sto}\n`;
    message += `📞 Service: ${order.service_type}\n\n`;
    message += `Pilih stage yang akan diupdate:\n\n`;

    const keyboard = [];
    assignments.forEach(assignment => {
      const stageEmoji = getStageEmoji(assignment.stage);
      const statusEmoji = getStageStatusEmoji(assignment.status);
      
      keyboard.push([{
        text: `${stageEmoji} ${assignment.stage} (${statusEmoji} ${assignment.status})`,
        callback_data: `update_stage_${assignment.id}_${assignment.stage}`
      }]);
    });

    keyboard.push([{
      text: '🔙 Kembali ke Daftar Order',
      callback_data: 'my_orders'
    }]);

    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error showing technician stage progress menu:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

function legacyShowProgressMenu(chatId, telegramId) {
  // Get user's assigned orders first
  getUserAssignedOrders(telegramId).then(orders => {
    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, '📝 Update Progress\n\nTidak ada order aktif yang ditugaskan kepada Anda.', getReplyMenuKeyboard('Teknisi'));
      return;
    }
    
    let message = '📝 Update Progress\n\nPilih order yang akan diupdate:\n\n';
    const keyboard = [];
    
    orders.forEach((order, index) => {
      message += `${index + 1}. ${order.order_id} ${order.customer_name} (${order.status})\n`;
      keyboard.push([{ 
        text: `${index + 1}. ${order.order_id} ${order.customer_name}`, 
        callback_data: `progress_order_${order.order_id}` 
      }]);
    });
    
    
    
    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  });
}

function legacyShowEvidenceMenu(chatId, telegramId) {
  // Get user's assigned orders first
  getUserAssignedOrders(telegramId).then(orders => {
    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, '📸 Upload Evidence\n\nTidak ada order aktif yang ditugaskan kepada Anda.');
      return;
    }
    
    let message = '📸 Upload Evidence\n\nPilih order untuk memulai proses evidence close:\n\n';
    const keyboard = [];
    
    orders.forEach((order, index) => {
      message += `${index + 1}. ${order.order_id} ${order.customer_name} (${order.status})\n`;
      keyboard.push([{ 
        text: `${index + 1}. ${order.order_id} ${order.customer_name}`, 
        callback_data: `evidence_order_${order.order_id}` 
      }]);
    });
    
    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  });
}

// LME PT2 Update Menu Function
function showLMEPT2UpdateMenu(chatId, telegramId) {
  bot.sendMessage(chatId, 
    '📝 **UPDATE LME PT2**\n\n' +
    '📋 Pilih order untuk update LME PT2 timestamp:\n' +
    '⏰ LME PT2 akan diset ke waktu sekarang (WIB)\n' +
    '🔔 Teknisi akan mendapat notifikasi bahwa LME PT2 sudah ready',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Pilih Order untuk Update LME PT2', callback_data: 'select_order_for_lme_pt2' }],
          [{ text: '📊 Lihat LME PT2 History', callback_data: 'view_lme_pt2_history' }],
          [{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]
        ]
      }
    }
  );
}

// SOD Update Menu Function
function showSODUpdateMenu(chatId, telegramId) {
  bot.sendMessage(chatId, 
    '🚀 **UPDATE SOD**\n\n' +
    '📋 Pilih order untuk update SOD timestamp:\n' +
    '⏰ SOD akan diset ke waktu sekarang (WIB)\n' +
    '🎯 TTI Comply akan dihitung dari SOD timestamp',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Pilih Order untuk Update SOD', callback_data: 'select_order_for_sod' }],
          [{ text: '📊 Lihat SOD History', callback_data: 'view_sod_history' }],
          [{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]
        ]
      }
    }
  );
}

// E2E Update Menu Function
function showE2EUpdateMenu(chatId, telegramId) {
  bot.sendMessage(chatId, 
    '🎯 UPDATE E2E (End to End)\n\n' +
    '📋 Pilih order untuk update E2E timestamp:\n' +
    '📊 Perhitungan comply akan dihitung dari SOD ke E2E',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Pilih Order untuk Update E2E', callback_data: 'select_order_for_e2e' }],
          [{ text: '📊 Lihat E2E History', callback_data: 'view_e2e_history' }],
          [{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]
        ]
      }
    }
  );
}

async function getUserAssignedOrders(telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get user ID first
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();
    
    if (!user) return [];
    
    // Get orders assigned directly to technician (main assignment)
    const { data: directOrders, error: directError } = await supabase
      .from('orders')
      .select('*')
      .eq('assigned_technician', user.id)
      .in('status', ['Pending', 'In Progress', 'On Hold'])
      .order('created_at', { ascending: true });
    
    if (directError) {
      console.error('Error fetching direct assigned orders:', directError);
    }
    
    // Get orders assigned via stage assignments
    const { data: stageOrders, error: stageError } = await supabase
      .from('order_stage_assignments')
      .select(`
        orders!inner(*)
      `)
      .eq('assigned_technician', telegramId)
      .in('orders.status', ['Pending', 'In Progress', 'On Hold']);
    
    if (stageError) {
      console.error('Error fetching stage assigned orders:', stageError);
    }
    
    // Combine and deduplicate orders
    const allOrders = [];
    const orderIds = new Set();
    
    // Add direct orders
    if (directOrders) {
      directOrders.forEach(order => {
        if (!orderIds.has(order.id)) {
          allOrders.push(order);
          orderIds.add(order.id);
        }
      });
    }
    
    // Add stage orders
    if (stageOrders) {
      stageOrders.forEach(item => {
        const order = item.orders;
        if (!orderIds.has(order.id)) {
          allOrders.push(order);
          orderIds.add(order.id);
        }
      });
    }
    
    // Sort by created_at
    allOrders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    return allOrders;
  } catch (error) {
    console.error('Error getting assigned orders:', error);
    return [];
  }
}

async function updateComplyCalculationFromSODToE2E(orderId, e2eTimestamp) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Ambil data order untuk mendapatkan SOD timestamp
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (fetchError || !order || !order.sod_timestamp) {
      console.error('Error fetching order for comply calculation:', fetchError);
      return;
    }

    // Hitung durasi dari SOD ke E2E
    const sodTime = new Date(order.sod_timestamp);
    const e2eTime = new Date(e2eTimestamp);
    const durationHours = (e2eTime - sodTime) / (1000 * 60 * 60);

    // Tentukan status comply berdasarkan durasi SOD ke E2E
    // Asumsi: comply jika durasi <= 72 jam (3x24 jam)
    const isComply = durationHours <= 72;
    const complyStatus = isComply ? 'comply' : 'not_comply';

    // Format durasi yang mudah dibaca dengan tanggal E2E
    const readableDuration = formatReadableDuration(durationHours);
    const e2eDate = new Date(e2eTimestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long', 
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    });
    const durationWithDate = `${readableDuration} (${e2eDate})`;

    // Update status comply di database dengan format durasi yang readable
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        tti_comply_status: complyStatus,
        tti_comply_actual_duration: durationWithDate
      })
      .eq('order_id', orderId);

    if (updateError) {
      console.error('Error updating comply calculation:', updateError);
      return;
    }

    console.log(`✅ Comply calculation updated for order ${orderId}: ${complyStatus} (${durationHours.toFixed(2)} hours - ${durationWithDate})`);

  } catch (error) {
    console.error('Error in updateComplyCalculationFromSODToE2E:', error);
  }
}

async function showSODOrderSelection(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Ambil order yang belum memiliki SOD timestamp
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .is('sod_timestamp', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching orders for SOD:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, 
        'Tidak ada order yang perlu update SOD.\n\n' +
        '✅ Semua order aktif sudah memiliki SOD timestamp.'
      );
      return;
    }

    let message = '🚀 PILIH ORDER UNTUK UPDATE SOD\n\n';
    message += '📋 Order yang tersedia untuk update SOD:\n';
    message += '⏳ = SOD belum diset (perlu diupdate)\n\n';

    const keyboard = [];
    
    orders.forEach(order => {
      const orderInfo = `${order.order_id} - ${order.customer_name} (${order.sto})`;
      message += `⏳ ${orderInfo}\n`;
      
      keyboard.push([{
        text: `🚀 Update SOD - ${order.order_id}`,
        callback_data: `sod_order_${order.order_id}`
      }]);
    });

    keyboard.push([{ text: '🔙 Kembali ke Menu SOD', callback_data: 'back_to_menu' }]);

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error in showSODOrderSelection:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function showLMEPT2OrderSelection(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('🔍 Fetching LME PT2 orders from progress_new...');

    // Ambil order dari tabel progress_new yang survey_jaringan statusnya mengandung 'Not Ready'
    const { data: progressData, error } = await supabase
      .from('progress_new')
      .select(`
        order_id,
        survey_jaringan,
        orders (
          order_id,
          customer_name,
          sto,
          created_at,
          lme_pt2_end
        )
      `)
      .like('survey_jaringan->>status', 'Not Ready%')
      .is('orders.lme_pt2_end', null)
      .order('created_at', { ascending: true });

    console.log('📊 Query result:', { 
      error: error, 
      dataCount: progressData?.length || 0,
      data: progressData 
    });

    if (error) {
      console.error('Error fetching orders for LME PT2:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!progressData || progressData.length === 0) {
      console.log('📋 No orders found with survey_jaringan status "Not Ready"');
      bot.sendMessage(chatId, 
        'Tidak ada order yang perlu update LME PT2.\n\n' +
        '✅ Semua order dengan survey jaringan "Not Ready" telah diupdate atau belum ada teknisi yang melaporkan jaringan not ready.'
      );
      return;
    }

    let message = '📝 PILIH ORDER UNTUK UPDATE LME PT2\n\n';
    message += '📋 Order yang perlu update LME PT2 (survey jaringan: Not Ready):\n';
    message += '⏰ = Menunggu update dari HD\n\n';

    const keyboard = [];
    
    progressData.forEach(progress => {
      console.log('🔍 Processing progress:', progress);
      if (progress.orders) {
        const order = progress.orders;
        const orderInfo = `${order.order_id} - ${order.customer_name} (${order.sto})`;
        
        // Extract timestamp from status string like "Not Ready - 26/09/2025, 11.34.56"
        const statusString = progress.survey_jaringan?.status || '';
        const timestampMatch = statusString.match(/Not Ready - (.+)/);
        const surveyTimestamp = timestampMatch ? timestampMatch[1] : 'Tidak ada';
        const surveyNote = progress.survey_jaringan?.note || 'Tidak ada catatan';
        
        message += `⏰ ${orderInfo}\n`;
        message += `   📅 Survey Jaringan: ${surveyTimestamp}\n`;
        message += `   📝 Catatan: ${surveyNote}\n\n`;
        
        keyboard.push([{
          text: `📝 Update LME PT2 - ${order.order_id}`,
          callback_data: `lme_pt2_order_${order.order_id}`
        }]);
      }
    });

    keyboard.push([{ text: '🔙 Kembali ke Menu LME PT2', callback_data: 'back_to_menu' }]);

    console.log('📤 Sending message with', keyboard.length - 1, 'orders');
    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error in showLMEPT2OrderSelection:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function showE2EOrderSelection(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Ambil order yang sudah memiliki SOD timestamp tapi belum memiliki E2E timestamp
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .not('sod_timestamp', 'is', null)
      .is('e2e_timestamp', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching orders for E2E:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, 
        'Tidak ada order yang perlu update E2E.\n\n' +
        '✅ Semua order dengan SOD sudah memiliki E2E timestamp.'
      );
      return;
    }

    let message = '🎯 PILIH ORDER UNTUK UPDATE E2E\n\n';
    message += '📋 Order yang tersedia untuk update E2E:\n';
    message += '⏳ = E2E belum diset (perlu diupdate)\n\n';

    const keyboard = [];
    
    orders.forEach(order => {
      const orderInfo = `${order.order_id} - ${order.customer_name} (${order.sto})`;
      message += `📋 ${orderInfo}\n`;
      message += `   📅 SOD: ${formatIndonesianDateTime(order.sod_timestamp)}\n\n`;
      
      keyboard.push([{
        text: ` Update E2E - ${order.order_id}`,
        callback_data: `e2e_order_${order.order_id}`
      }]);
    });

    keyboard.push([{ text: '🔙 Kembali ke Menu E2E', callback_data: 'back_to_menu' }]);

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error in showE2EOrderSelection:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function showE2EHistory(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .not('e2e_timestamp', 'is', null)
      .order('e2e_timestamp', { ascending: false })
      ;

    if (error) {
      console.error('Error fetching E2E history:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil history E2E.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, 
        '📊 **HISTORY E2E TIMESTAMP**\n\n' +
        'Belum ada order yang memiliki E2E timestamp.'
      );
      return;
    }

    let message = '📊 **HISTORY E2E TIMESTAMP**\n\n';
    message += '🎯 Daftar E2E timestamp (urut terbaru):\n\n';

    orders.forEach((order, index) => {
      message += `${index + 1}. **${order.order_id}**\n`;
      message += `   👤Customer Name: ${order.customer_name}\n`;
      message += `   🏢STO: ${order.sto}\n`;
      message += `   🚀 SOD: ${formatIndonesianDateTime(order.sod_timestamp)}\n`;
      message += `   🎯 E2E: ${formatIndonesianDateTime(order.e2e_timestamp)}\n`;
      
      // Hitung durasi dari SOD ke E2E
      if (order.sod_timestamp && order.e2e_timestamp) {
        const sodTime = new Date(order.sod_timestamp);
        const e2eTime = new Date(order.e2e_timestamp);
        const durationHours = (e2eTime - sodTime) / (1000 * 60 * 60);
        message += `   ⏱️ Durasi SOD→E2E: ${formatReadableDuration(durationHours)}\n`;
      }
      
      message += '\n';
    });

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Kembali ke Menu E2E', callback_data: 'back_to_menu' }]
        ]
      }
    });

  } catch (error) {
    console.error('Error in showE2EHistory:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function handleE2EUpdate(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Ambil data order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (fetchError || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Cek apakah order sudah memiliki SOD timestamp
    if (!order.sod_timestamp) {
      bot.sendMessage(chatId, 
        '❌ Order ini belum memiliki SOD timestamp.\n\n' +
        'Silakan update SOD terlebih dahulu sebelum mengupdate E2E.'
      );
      return;
    }

    // Cek apakah E2E sudah diset
    if (order.e2e_timestamp) {
      bot.sendMessage(chatId, 
        `⚠️ **E2E SUDAH DISET**\n\n` +
        `📋 Order: ${order.order_id}\n` +
        `👤 Customer: ${order.customer_name}\n` +
        `🎯 E2E Timestamp: ${formatIndonesianDateTime(order.e2e_timestamp)}\n\n` +
        'E2E timestamp sudah pernah diset untuk order ini.'
      );
      return;
    }

    // Set E2E timestamp ke waktu sekarang (Jakarta timezone)
    const now = new Date();
    const jakartaTimestamp = new Date(now.getTime() + (7 * 60 * 60 * 1000))
      .toISOString().replace('Z', '+07:00');

    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        e2e_timestamp: jakartaTimestamp
      })
      .eq('order_id', orderId);

    if (updateError) {
      console.error('Error updating E2E timestamp:', updateError);
      bot.sendMessage(chatId, '❌ Gagal mengupdate E2E timestamp.');
      return;
    }

    // Hitung durasi dari SOD ke E2E
    const sodTime = new Date(order.sod_timestamp);
    const e2eTime = new Date(jakartaTimestamp);
    const durationHours = (e2eTime - sodTime) / (1000 * 60 * 60);

    bot.sendMessage(chatId, 
      `✅ E2E TIMESTAMP BERHASIL DIUPDATE!\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer: ${order.customer_name}\n` +
      `🏢 STO: ${order.sto}\n\n` +
      `🚀 SOD: ${formatIndonesianDateTime(order.sod_timestamp)}\n` +
      `🎯 E2E: ${formatIndonesianDateTime(jakartaTimestamp)}\n\n` +
      `⏱️ Durasi SOD→E2E: ${formatReadableDuration(durationHours)}\n\n` +
      `📊 Perhitungan comply sekarang menggunakan durasi SOD ke E2E.`
    );

    // Update perhitungan comply berdasarkan SOD ke E2E
    await updateComplyCalculationFromSODToE2E(orderId, jakartaTimestamp);

  } catch (error) {
    console.error('Error handling E2E update:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function showSODHistory(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get orders with SOD timestamps, ordered by updated_at
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, order_id, customer_name, sto, sod_timestamp, updated_at')
      .not('sod_timestamp', 'is', null)
      .order('updated_at', { ascending: false })
      ;

    if (error) {
      console.error('Error fetching SOD history:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil riwayat SOD.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, '📋 Belum ada riwayat update SOD.');
      return;
    }

    let message = '📊 *Riwayat Update SOD*\n\n';

    orders.forEach((order, index) => {
      const updatedTime = formatIndonesianDateTime(order.updated_at);
      
      // Format SOD timestamp to Indonesian time
      let sodTimeDisplay = 'Belum diset';
      if (order.sod_timestamp) {
        const sodDate = new Date(order.sod_timestamp);
        sodTimeDisplay = sodDate.toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      
      message += `${index + 1}. *${order.order_id}*\n`;
      message += `   👤 Customer: ${order.customer_name}\n`;
      message += `   ⏰ SOD Time: ${sodTimeDisplay}\n`;
      message += `   📍 STO: ${order.sto}\n`;
      message += `   📅 Updated at: ${updatedTime}\n\n`;
    });

    const keyboard = {
      inline_keyboard: [[{
        text: '🔙 Kembali ke Menu SOD',
        callback_data: 'sod_menu'
      }]]
    };

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error showing SOD history:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat menampilkan riwayat SOD.');
  }
}

async function showLMEPT2History(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get orders with LME PT2 timestamps, ordered by updated_at
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, order_id, customer_name, sto, lme_pt2_end, updated_at')
      .not('lme_pt2_end', 'is', null)
      .order('updated_at', { ascending: false })
      ;

    if (error) {
      console.error('Error fetching LME PT2 history:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil riwayat LME PT2.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, '📋 Belum ada riwayat update LME PT2.');
      return;
    }

    let message = '📊 *Riwayat Update LME PT2 (10 Terakhir)*\n\n';

    orders.forEach((order, index) => {
      const updatedTime = formatIndonesianDateTime(order.updated_at);
      
      // Format LME PT2 timestamp to Indonesian time
      let lmePT2TimeDisplay = 'Belum diset';
      if (order.lme_pt2_end) {
        const lmePT2Date = new Date(order.lme_pt2_end);
        lmePT2TimeDisplay = lmePT2Date.toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      
      message += `${index + 1}. *${order.order_id}*\n`;
      message += `   👤 Customer: ${order.customer_name}\n`;
      message += `   📝 LME PT2 Time: ${lmePT2TimeDisplay}\n`;
      message += `   📍 STO: ${order.sto}\n`;
      message += `   📅 Updated at: ${updatedTime}\n\n`;
    });

    const keyboard = {
      inline_keyboard: [[{
        text: '🔙 Kembali ke Menu LME PT2',
        callback_data: 'back_to_menu'
      }]]
    };

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error showing LME PT2 history:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat menampilkan riwayat LME PT2.');
  }
}

async function handleLMEPT2Update(chatId, telegramId, orderId) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Error fetching order:', orderError);
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Get HD name
    const hdName = await getUserName(telegramId);

    // Get current time in Jakarta timezone
    const jakartaTimestamp = new Date().toLocaleString('sv-SE', {
      timeZone: 'Asia/Jakarta'
    }).replace(' ', 'T') + '.000Z';
    
    // Create timeString directly from current Jakarta time without double conversion
    const currentJakartaTime = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', '').replace(/\./g, ':') + ' WIB';
    
    const timeString = currentJakartaTime;

    // Update order with LME PT2 timestamp
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        lme_pt2_end: jakartaTimestamp,
        status: 'Pending',
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId);

    if (updateError) {
      console.error('Error updating order LME PT2:', updateError);
      bot.sendMessage(chatId, `❌ Gagal menyimpan update LME PT2: ${updateError.message}`);
      return;
    }

    console.log('✅ LME PT2 timestamp updated successfully:', timeString);

    // Send success message
    bot.sendMessage(chatId, 
      `✅ *LME PT2 Berhasil Diupdate!*\n\n` +
      `📋 Order: ${order.order_id}\n` +
      `👤 Customer Name: ${order.customer_name}\n` +
      `🕐 LME PT2 Update Time: ${timeString}\n` +
      `👤 Updated by: ${hdName}`, 
      { parse_mode: 'Markdown' }
    );

    // Notify technician using the existing notification function
    try {
      await notifyTechnicianLMEReady(order.order_id);
    } catch (notifyError) {
      console.error('Error notifying technician about LME PT2 ready:', notifyError);
    }

  } catch (error) {
    console.error('Error in handleLMEPT2Update:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat update LME PT2.');
  }
}

async function handleSODUpdate(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Error fetching order:', orderError);
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Get HD name
    const hdName = await getUserName(telegramId);
    
    // Current time in Jakarta timezone - store directly as Jakarta time
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
    const timeString = jakartaTime.toTimeString().split(' ')[0]; // Gets HH:mm:ss format for display
    
    // Create Jakarta timestamp string in format that PostgreSQL will recognize as Jakarta time
    const jakartaTimestamp = jakartaTime.getFullYear() + '-' +
      String(jakartaTime.getMonth() + 1).padStart(2, '0') + '-' +
      String(jakartaTime.getDate()).padStart(2, '0') + ' ' +
      String(jakartaTime.getHours()).padStart(2, '0') + ':' +
      String(jakartaTime.getMinutes()).padStart(2, '0') + ':' +
      String(jakartaTime.getSeconds()).padStart(2, '0') + '+07:00';
    
    // Calculate TTI Comply deadline (SOD + 72 hours)
    const deadlineTime = new Date(jakartaTime.getTime() + (72 * 60 * 60 * 1000)); // Add 72 hours
    const deadlineTimestamp = deadlineTime.getFullYear() + '-' +
      String(deadlineTime.getMonth() + 1).padStart(2, '0') + '-' +
      String(deadlineTime.getDate()).padStart(2, '0') + ' ' +
      String(deadlineTime.getHours()).padStart(2, '0') + ':' +
      String(deadlineTime.getMinutes()).padStart(2, '0') + ':' +
      String(deadlineTime.getSeconds()).padStart(2, '0') + '+07:00';

    console.log('🚀 Updating SOD timestamp for order:', {
      order_id: order.order_id,
      sod_timestamp: jakartaTimestamp,
      tti_comply_deadline: deadlineTimestamp,
      display_time: timeString,
      updated_by: hdName
    });
    
    // Update order with SOD timestamp and TTI comply deadline (Jakarta timezone format)
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        sod_timestamp: jakartaTimestamp,
        tti_comply_deadline: deadlineTimestamp,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId);

    if (updateError) {
      console.error('Error updating order SOD:', updateError);
      bot.sendMessage(chatId, `❌ Gagal menyimpan update SOD: ${updateError.message}`);
      return;
    }

    console.log('✅ SOD timestamp updated successfully:', timeString);

    // Send success message
    bot.sendMessage(chatId, 
      `✅ *SOD Berhasil Diupdate!*\n\n` +

      `📋 Order: ${order.order_id}\n` +
      `👤 Customer Name: ${order.customer_name}\n` +
      `🕐 SOD Time: ${timeString}\n` +
      `👤 Updated by: ${hdName}`, 
      { parse_mode: 'Markdown' }
    );

    // Notify technician if assigned
    if (order.technician_id) {
      try {
        // Get technician telegram ID
        const { data: tech } = await supabase
          .from('users')
          .select('telegram_id, name')
          .eq('id', order.technician_id)
          .single();
        
        if (tech && tech.telegram_id) {
          bot.sendMessage(tech.telegram_id, 
            `🚀 *SOD Update Notification*\n\n` +
            
            `📋 Order: ${order.order_id}\n` +
            `🕐 SOD Time: ${timeString}\n` +
            `👤 Updated by: ${hdName}\n` +
            `📍 Location: ${order.sto}\n\n` +
            `Silakan lanjutkan pekerjaan sesuai jadwal.`, 
            { parse_mode: 'Markdown' }
          );
        }
      } catch (notifyError) {
        console.error('Error notifying technician:', notifyError);
      }
    }

    // Start TTI Comply countdown if not already started
    await startTTIComplyFromSOD(orderId, jakartaTimestamp);

  } catch (error) {
    console.error('Error in handleSODUpdate:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat update SOD.');
  }
}

async function startTTIComplyFromSOD(orderId, sodTimestamp) {
  try {
    console.log(`🚀 Starting TTI Comply from SOD for order: ${orderId} at ${sodTimestamp}`);
    
    // TTI Comply tracking is now handled directly in orders table
    // No need for separate tti_comply table
    
    console.log(`✅ TTI Comply started from SOD for order ${orderId}`);
    
  } catch (error) {
    console.error('Error starting TTI Comply from SOD:', error);
  }
}

function getStatusEmoji(status) {
  const statusEmojis = {
    'Pending': '⏳',
    'In Progress': '🔄',
    'On Hold': '⏸️',
    'Completed': '✅',
    'Closed': '🔒'
  };
  return statusEmojis[status] || '❓';
}

function getProgressStatusEmoji(status) {
  const statusEmojis = {
    'Ready': '✅',
    'Not Ready': '❌',
    'Selesai': '✅',
    'In Progress': '🔄'
  };
  return statusEmojis[status] || '❓';
}

async function handleSessionInput(chatId, telegramId, text, msg, session) {
  try {
    if (session.type === 'create_order') {
      await handleCreateOrderInput(chatId, telegramId, text, session);
    } else if (session.type === 'update_progress') {
      await handleUpdateProgressInput(chatId, telegramId, text, session);
    } else if (session.type === 'evidence_upload_flow') {
      await handleEvidenceUploadFlow(chatId, telegramId, text, msg, session);
    }
  } catch (error) {
    console.error('Error handling session input:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleCreateOrderInput(chatId, telegramId, text, session) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  if (session.step === 'order_id') {
    // Validasi Order ID tidak duplikat
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('order_id', text)
      .single();
    
    if (existingOrder) {
      bot.sendMessage(chatId, 
        '❌ Order ID sudah ada!\n\n' +
        '🆔 Silakan masukkan Order ID yang berbeda:'
      );
      return;
    }
    
    session.data.order_id = text;
    session.step = 'customer_name';
    
    bot.sendMessage(chatId, 
      '✅ Order ID: ' + text + '\n\n' +
      '1️⃣ Nama Pelanggan:'
    );
    
  } else if (session.step === 'customer_name') {
    session.data.customer_name = text;
    session.step = 'customer_address';
    
    bot.sendMessage(chatId, 
      '✅ Nama pelanggan: ' + text + '\n\n' +
      '2️⃣ Alamat Pelanggan:'
    );
    
  } else if (session.step === 'customer_address') {
    session.data.customer_address = text;
    session.step = 'customer_contact';
    
    bot.sendMessage(chatId, 
      '✅ Alamat pelanggan: ' + text + '\n\n' +
      '3️⃣ Kontak Pelanggan:'
    );
    
  } else if (session.step === 'customer_contact') {
    session.data.contact = text;
    session.step = 'sto_selection';
    
    bot.sendMessage(chatId, 
      '✅ Kontak pelanggan: ' + text + '\n\n' +
      '4️⃣ Pilih STO:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'CBB', callback_data: 'sto_CBB' },
              { text: 'CWA', callback_data: 'sto_CWA' },
              { text: 'GAN', callback_data: 'sto_GAN' },
              { text: 'JTN', callback_data: 'sto_JTN' }
            ],
            [
              { text: 'KLD', callback_data: 'sto_KLD' },
              { text: 'KRG', callback_data: 'sto_KRG' },
              { text: 'PDK', callback_data: 'sto_PDK' },
              { text: 'PGB', callback_data: 'sto_PGB' }
            ],
            [
              { text: 'PGG', callback_data: 'sto_PGG' },
              { text: 'PSR', callback_data: 'sto_PSR' },
              { text: 'RMG', callback_data: 'sto_RMG' },
              { text: 'BIN', callback_data: 'sto_BIN' }
            ],
            [
              { text: 'CPE', callback_data: 'sto_CPE' },
              { text: 'JAG', callback_data: 'sto_JAG' },
              { text: 'KAL', callback_data: 'sto_KAL' },
              { text: 'KBY', callback_data: 'sto_KBY' }
            ],
            [
              { text: 'KMG', callback_data: 'sto_KMG' },
              { text: 'PSM', callback_data: 'sto_PSM' },
              { text: 'TBE', callback_data: 'sto_TBE' },
              { text: 'NAS', callback_data: 'sto_NAS' }
            ]
          ]
        }
      }
    );
    
  } else if (session.step === 'transaction_type') {
    session.step = 'service_type';
    
    bot.sendMessage(chatId, 
      '✅ Type Transaksi: ' + session.data.transaction_type + '\n\n' +
      '6️⃣ Pilih Jenis Layanan:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Astinet', callback_data: 'service_Astinet' },
              { text: 'metro', callback_data: 'service_metro' }
            ],
            [
              { text: 'vpn ip', callback_data: 'service_vpn ip' },
              { text: 'ip transit', callback_data: 'service_ip transit' }
            ],
            [
              { text: 'siptrunk', callback_data: 'service_siptrunk' }
            ]
          ]
        }
      }
    );
    
  } else if (session.step === 'assign_technician') {
    // Get available technicians
    const { data: technicians, error } = await supabase
      .from('users')
      .select('id, name')
      .eq('role', 'Teknisi');
    
    if (error || !technicians || technicians.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada teknisi yang tersedia. Silakan hubungi admin.');
      userSessions.delete(chatId);
      return;
    }
    
    let message = '✅ Jenis Layanan: ' + session.data.service_type + '\n\n';
    message += '7️⃣ Pilih Teknisi yang akan ditugaskan:\n\n';
    
    const keyboard = [];
    technicians.forEach((tech, index) => {
      message += `${index + 1}. ${tech.name}\n`;
      keyboard.push([{ 
        text: `${index + 1}. ${tech.name}`, 
        callback_data: `assign_tech_${tech.id}` 
      }]);
    });
    
    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  }
}

async function handleUpdateProgressInput(chatId, telegramId, text, session) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get technician name
    const { data: technicianData } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', telegramId)
      .single();
    
    const technicianName = technicianData?.name || 'Unknown';
    
    // Format timestamp untuk status
    const now = new Date();
    const formattedTimestamp = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    }) + ', ' + now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const statusWithTimestamp = `Selesai - ${formattedTimestamp} - ${technicianName}`;
    
    // Map stage names to column names
    const stageColumnMap = {
      'Survey Jaringan': 'survey_jaringan',
      'Penarikan': 'penarikan_kabel',
      'P2P': 'p2p',
      'Instalasi': 'instalasi_ont'
    };
    
    const columnName = stageColumnMap[session.stage];
    if (!columnName) {
      console.error('Unknown stage:', session.stage);
      bot.sendMessage(chatId, '❌ Tahapan tidak dikenali. Silakan coba lagi.');
      return;
    }
    
    // Check if record exists for this order_id
    const { data: existingRecord, error: selectError } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', session.orderId)
      .single();
    
    const progressData = {
      status: statusWithTimestamp,
      note: text || null
    };
    
    let error;
    if (existingRecord) {
      // Update existing record
      const updateData = {};
      updateData[columnName] = progressData;
      
      const result = await supabase
        .from('progress_new')
        .update(updateData)
        .eq('order_id', session.orderId);
      
      error = result.error;
    } else {
      // Insert new record
      const insertData = {
        order_id: session.orderId,
        [columnName]: progressData
      };
      
      const result = await supabase
        .from('progress_new')
        .insert(insertData);
      
      error = result.error;
    }
    
    if (error) {
      console.error('Error saving progress:', error);
      bot.sendMessage(chatId, '❌ Gagal menyimpan progress. Silakan coba lagi.');
      return;
    }
    
    // Update order status to In Progress if it's still Pending
    await supabase
      .from('orders')
      .update({ status: 'In Progress' })
      .eq('order_id', session.orderId)
      .eq('status', 'Pending');
    
    bot.sendMessage(chatId, 
      `✅ Progress Berhasil Diupdate!\n\n` +
      `📝 Tahapan: ${session.stage}\n` +
      `📊 Status: ${statusWithTimestamp}\n` +
      `📝 Catatan: ${text || 'Tidak ada catatan'}\n\n` +
      'Progress telah tersimpan ke database.'
    );
    
    userSessions.delete(chatId);
    
  } catch (error) {
    console.error('Error handling progress update:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const telegramId = callbackQuery.from.id.toString();
  
  try {
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (data === 'register_hd') {
      await registerUser(telegramId, callbackQuery.from.first_name, 'HD');
      bot.sendMessage(chatId, 
        '✅ Registrasi Berhasil!\n\n' +
        'Anda telah terdaftar sebagai HD (Helpdesk).\n\n' +
        'Selamat datang di Order Management Bot!'
      );
      await showWelcomeMessage(nodeClient, chatId, 'HD', callbackQuery.from.first_name);
    } else if (data === 'register_teknis') {
      await registerUser(telegramId, callbackQuery.from.first_name, 'Teknisi');
      bot.sendMessage(chatId, 
        '✅ Registrasi Berhasil!\n\n' +
        'Anda telah terdaftar sebagai Teknisi.\n\n' +
        'Selamat datang di Order Management Bot!'
      );
      await showWelcomeMessage(nodeClient, chatId, 'Teknisi', callbackQuery.from.first_name);
    } else if (data === 'create_order') {
      startCreateOrder(chatId, telegramId);
    } else if (data === 'view_orders') {
      showMyOrders(chatId, telegramId, 'HD');
    } else if (data === 'search_order') {
      showSearchOrderMenu(chatId, telegramId);
    } else if (data === 'my_orders') {
      showMyOrders(chatId, telegramId, 'Teknisi');
    } else if (data === 'update_progress') {
      showProgressMenu(chatId, telegramId);
    } else if (data === 'upload_evidence') {
      showEvidenceMenu(chatId, telegramId);
    } else if (data === 'help') {
      getUserRole(telegramId).then(role => {
        if (role) {
          showHelpByRole(chatId, role);
        }
      });
    } else if (data === 'assign_technician_stage') {
      // Clear any existing user state first
      delete userStates[telegramId];
      await showOrderSelectionForStageAssignment(chatId, telegramId);
    
    // Stage Assignment Interface Handlers
    } else if (data.startsWith('assign_stage_')) {
      const parts = data.split('_');
      const orderId = parts[2];
      const stage = parts[3];
      await showTechnicianSelectionForStage(chatId, telegramId, orderId, stage);
    } else if (data.startsWith('finish_assignment_')) {
      const orderId = data.split('_')[2];
      await finishStageAssignment(chatId, telegramId, orderId);
    
    // Technician Stage Progress Handlers
    } else if (data.startsWith('tech_stage_progress_')) {
      const orderId = data.split('_')[3];
      await showTechnicianStageProgressMenu(chatId, telegramId, orderId);
    
    } else if (data.startsWith('update_stage_')) {
      const parts = data.split('_');
      const assignmentId = parts[2];
      const stage = parts.slice(3).join('_');
      await showStageProgressOptions(chatId, telegramId, assignmentId, stage);
    
    } else if (data.startsWith('set_stage_status_')) {
      const parts = data.split('_');
      const assignmentId = parts[3];
      const status = parts.slice(4).join('_');
      await updateStageStatus(chatId, telegramId, assignmentId, status);
   
    // New Stage Assignment Handlers
    } else if (data.startsWith('stage_assign_order_')) {
      const orderIndex = parseInt(data.split('_')[3]);
      // Ambil semua order aktif untuk memetakan index ke order_id
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: orders, error } = await supabase
        .from('orders')
        .select('order_id')
        .in('status', ['Pending', 'In Progress', 'On Hold'])
        .order('created_at', { ascending: false });

      if (!error && orders && orders[orderIndex]) {
        const orderId = orders[orderIndex].order_id;
        await showStageAssignmentMenu(chatId, telegramId, orderId);
      } else {
        bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      }
    } else if (data.startsWith('assign_stage_')) {
      const parts = data.split('_');
      const orderId = parts[2];
      const stage = parts[3];
      
      console.log(`🔍 assign_stage_ callback: orderId=${orderId}, stage=${stage}`);
      await showTechnicianSelectionForStage(chatId, telegramId, orderId, stage);
    } else if (data.startsWith('reassign_stage_')) {
      const parts = data.split('_');
      const orderId = parts[2];
      const stage = parts[3];
      
      console.log(`🔍 reassign_stage_ callback: orderId=${orderId}, stage=${stage}`);
      await showTechnicianSelectionForStage(chatId, telegramId, orderId, stage);
    } else if (data.startsWith('select_tech_for_stage_')) {
      const parts = data.split('_');
      const orderId = parts[4];
      const stage = parts[5];
      const techId = parts[6];
      await assignTechnicianToStage(chatId, telegramId, orderId, stage, techId);
    } else if (data.startsWith('assign_all_same_')) {
      const orderId = data.split('_')[3];
      
      console.log(`🔍 assign_all_same_ callback: orderId=${orderId}`);
      await showTechnicianSelectionForAllStages(chatId, telegramId, orderId);
    } else if (data.startsWith('assign_all_tech_')) {
      const parts = data.split('_');
      const orderId = parts[3];
      const techId = parts[4];
      await assignTechnicianToAllStages(chatId, telegramId, orderId, techId);
   
    } else if (data.startsWith('sto_')) {
      const sto = data.split('_')[1];
      await handleSTOSelection(chatId, telegramId, sto);
    } else if (data.startsWith('transaction_')) {
      const transactionType = data.split('_')[1];
      await handleTransactionTypeSelection(chatId, telegramId, transactionType);
    } else if (data.startsWith('service_')) {
      const serviceType = data.split('_')[1];
      await handleServiceTypeSelection(chatId, telegramId, serviceType);
    } else if (data.startsWith('assign_tech_')) {
      const techId = data.split('_')[2];
      await assignTechnician(chatId, telegramId, techId);
    } else if (data.startsWith('progress_order_')) {
      const orderId = data.split('_')[2];
      await showProgressStages(chatId, telegramId, orderId);
    } else if (data === 'progress_survey') {
      bot.sendMessage(chatId, '⚠️ Silakan pilih order terlebih dahulu melalui menu Update Progress.');
    } else if (data === 'progress_penarikan') {
      bot.sendMessage(chatId, '⚠️ Silakan pilih order terlebih dahulu melalui menu Update Progress.');
    } else if (data === 'progress_p2p') {
      bot.sendMessage(chatId, '⚠️ Silakan pilih order terlebih dahulu melalui menu Update Progress.');
    } else if (data === 'progress_instalasi') {
      bot.sendMessage(chatId, '⚠️ Silakan pilih order terlebih dahulu melalui menu Update Progress.');
    } else if (data.startsWith('progress_survey_')) {
      const orderId = data.split('_')[2];
      await handleProgressSurvey(chatId, telegramId, orderId);
    } else if (data.startsWith('progress_penarikan_')) {
      const orderId = data.split('_')[2];
      await handleProgressPenarikan(chatId, telegramId, orderId);
    } else if (data.startsWith('penarikan_selesai_')) {
      const orderId = data.split('_')[2];
      await handlePenarikanSelesai(chatId, telegramId, orderId);
    } else if (data.startsWith('penarikan_catatan_')) {
      const orderId = data.split('_')[2];
      await handlePenarikanCatatan(chatId, telegramId, orderId);
    } else if (data.startsWith('progress_p2p_')) {
      const orderId = data.split('_')[2];
      await handleProgressP2P(chatId, telegramId, orderId);
    } else if (data.startsWith('p2p_selesai_')) {
      const orderId = data.split('_')[2];
      await handleP2PSelesai(chatId, telegramId, orderId);
    } else if (data.startsWith('p2p_catatan_')) {
      const orderId = data.split('_')[2];
      await handleP2PCatatan(chatId, telegramId, orderId);
    } else if (data.startsWith('progress_instalasi_')) {
      const orderId = data.split('_')[2];
      await handleProgressInstalasi(chatId, telegramId, orderId);
    } else if (data.startsWith('instalasi_selesai_')) {
      const orderId = data.split('_')[2];
      await handleInstalasiSelesai(chatId, telegramId, orderId);
    } else if (data.startsWith('instalasi_catatan_')) {
      const orderId = data.split('_')[2];
      await handleInstalasiCatatan(chatId, telegramId, orderId);
    } else if (data.startsWith('evidence_order_')) {
      const orderId = data.split('_')[2];
      await startEvidenceUploadFlow(chatId, telegramId, orderId);
    } else if (data.startsWith('survey_ready_')) {
      const orderId = data.split('_')[2];
      await handleSurveyResult(chatId, telegramId, orderId, 'Ready');
    } else if (data.startsWith('survey_not_ready_')) {
      const orderId = data.split('_')[3];
      await handleSurveyResult(chatId, telegramId, orderId, 'Not Ready');
    } else if (data === 'sod_menu') {
      showSODUpdateMenu(chatId, telegramId);
//coba buat menu SOD order
    }else if (data === 'select_sod_order') {
  showSODOrder(chatID, telegramId);
  
    } else if (data === 'select_order_for_sod') {
      showSODOrderSelection(chatId, telegramId);
    } else if (data === 'sod_update') {
      showSODOrderSelection(chatId, telegramId);
    } else if (data === 'sod_history') {
      showSODHistory(chatId, telegramId);
    } else if (data === 'view_sod_history') {
      showSODHistory(chatId, telegramId);
    } else if (data.startsWith('sod_order_')) {
      const orderId = data.replace('sod_order_', '');
      await handleSODUpdate(chatId, telegramId, orderId);
    } else if (data === 'select_order_for_lme_pt2') {
      showLMEPT2OrderSelection(chatId, telegramId);
    } else if (data === 'view_lme_pt2_history') {
      showLMEPT2History(chatId, telegramId);
    } else if (data.startsWith('lme_pt2_order_')) {
      const orderId = data.replace('lme_pt2_order_', '');
      await handleLMEPT2Update(chatId, telegramId, orderId);
    } else if (data === 'select_order_for_e2e') {
      showE2EOrderSelection(chatId, telegramId);
    } else if (data === 'view_e2e_history') {
      showE2EHistory(chatId, telegramId);
    } else if (data.startsWith('e2e_order_')) {
      const orderId = data.replace('e2e_order_', '');
      await handleE2EUpdate(chatId, telegramId, orderId);
    } else if (data.startsWith('update_pt2_selesai_')) {
      const orderId = data.split('_')[3];
      // Update status order ke PT2 Selesai
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      await supabase
        .from('orders')
        .update({ 
          status: 'PT2 Selesai',
          pt2_completion_time: new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"})).toISOString(),
          lme_pt2_end: new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"})).toISOString()
        })
        .eq('order_id', orderId);

      bot.sendMessage(chatId, '✅ Waktu PT2 selesai telah diupdate. TTI Comply 3x24 jam dimulai otomatis!');
      
      // Start TTI Comply countdown from LME PT2 end time
      await startTTIComplyFromLMEPT2End(orderId);
      
      await notifyHDPT2SelesaiWithTTI(orderId);
    } else if (data.startsWith('update_lme_pt2_')) {
      const orderId = data.split('_')[3];
      // Update LME PT2 time
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      await supabase
        .from('orders')
        .update({ 
          status: 'LME PT2 Updated',
          lme_pt2_end: new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"})).toISOString()
        })
        .eq('order_id', orderId);

      bot.sendMessage(chatId, '✅ Waktu LME PT2 telah diupdate. Teknisi dapat melanjutkan pekerjaan.');
      
      // Notify technician that LME PT2 is ready
      await notifyTechnicianLMEReady(orderId);
    } else if (data.startsWith('view_order_')) {
      const orderId = data.split('_')[2];
      await showOrderDetails(chatId, orderId);
    } else if (data.startsWith('detail_order_')) {
      const orderId = data.split('_')[2];
      console.log(`📋 Showing detailed order info for: ${orderId}`);
      await showDetailedOrderInfo(chatId, orderId);
    } else if (data.startsWith('refresh_order_')) {
      const orderId = data.split('_')[2];
      await handleOrderSearch(chatId, telegramId, orderId);
    } else if (data === 'back_to_hd_menu') {
      const role = await getUserRole(telegramId);
      await showWelcomeMessage(nodeClient, chatId, role, 'User');
    } else if (data === 'back_to_assignment_list') {
      await showOrderSelectionForStageAssignment(chatId, telegramId);
    } else if (data === 'completed_orders') {
      await showOrderCompletedMenu(chatId, telegramId);
    } else if (data.startsWith('completed_month_')) {
      const month = data.split('_')[2];
      const year = data.split('_')[3];
      await showOrderCompletedByMonth(chatId, telegramId, year, month);
    } else if (data === 'back_to_completed_menu') {
      await showOrderCompletedMenu(chatId, telegramId);
    } else if (data === 'back_to_main') {
      const role = await getUserRole(telegramId);
      await showWelcomeMessage(nodeClient, chatId, role, 'User');
    } else {
      bot.sendMessage(chatId, 'Fitur ini sedang dalam pengembangan.');
    }
    
  } catch (error) {
    console.error('Error handling callback query:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleSTOSelection(chatId, telegramId, sto) {
  const session = userSessions.get(chatId);
  if (!session || session.type !== 'create_order') {
    bot.sendMessage(chatId, '❌ Session tidak valid. Silakan mulai ulang.');
    return;
  }
  
  session.data.sto = sto;
  session.step = 'transaction_type';
  
  bot.sendMessage(chatId, 
    '✅ STO: ' + sto + '\n\n' +
    '5️⃣ Pilih Type Transaksi:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Disconnect', callback_data: 'transaction_Disconnect' },
            { text: 'Modify', callback_data: 'transaction_modify' }
          ],
          [
            { text: 'New install existing', callback_data: 'transaction_new install existing' },
            { text: 'New install jt', callback_data: 'transaction_new install jt' }
          ],
          [
            { text: 'New install', callback_data: 'transaction_new install' },
            { text: 'PDA', callback_data: 'transaction_PDA' }
          ]
        ]
      }
    }
  );
}

async function handleTransactionTypeSelection(chatId, telegramId, transactionType) {
  const session = userSessions.get(chatId);
  if (!session || session.type !== 'create_order') {
    bot.sendMessage(chatId, '❌ Session tidak valid. Silakan mulai ulang.');
    return;
  }
  
  session.data.transaction_type = transactionType;
  session.step = 'service_type';
  
  bot.sendMessage(chatId, 
    '✅ Type Transaksi: ' + transactionType + '\n\n' +
    '6️⃣ Pilih Jenis Layanan:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Astinet', callback_data: 'service_Astinet' },
            { text: 'Metro', callback_data: 'service_metro' }
          ],
          [
            { text: 'Vpn Ip', callback_data: 'service_vpn ip' },
            { text: 'Ip Transit', callback_data: 'service_ip transit' }
          ],
          [
            { text: 'Siptrunk', callback_data: 'service_siptrunk' }
          ]
        ]
      }
    }
  );
}

async function handleServiceTypeSelection(chatId, telegramId, serviceType) {
  const session = userSessions.get(chatId);
  if (!session || session.type !== 'create_order') {
    bot.sendMessage(chatId, '❌ Session tidak valid. Silakan mulai ulang.');
    return;
  }
  
  session.data.service_type = serviceType;
  session.step = 'assign_technician';
  
  // Get available technicians
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const stoSelected = session.data.sto;
  let technicians = [];
  let error = null;
  
  // Try to get technicians mapped to the selected STO
  const { data: mappedTechs, error: mapError } = await supabase
    .from('technician_sto')
    .select('user_id, name')
    .eq('sto', stoSelected);

  if (!mapError && mappedTechs && mappedTechs.length > 0) {
    technicians = mappedTechs.map(t => ({ id: t.user_id, name: t.name }));
  } else {
    // Fallback: show all technicians
    const { data: allTechs, error: allError } = await supabase
      .from('users')
      .select('id, name')
      .eq('role', 'Teknisi');
    technicians = allTechs || [];
    error = allError || mapError || null;
  }
  
  if (error || !technicians || technicians.length === 0) {
    bot.sendMessage(chatId, '❌ Tidak ada teknisi yang tersedia. Silakan hubungi admin.');
    userSessions.delete(chatId);
    return;
  }
  
  let message = '✅ Jenis Layanan: ' + serviceType + '\n\n';
  if (stoSelected) {
    message += '📍 STO Dipilih: ' + stoSelected + '\n';
  }
  message += '7️⃣ Pilih Teknisi yang akan ditugaskan:\n\n';
  
  const keyboard = [];
  technicians.forEach((tech, index) => {
    message += `${index + 1}. ${tech.name}\n`;
    keyboard.push([{ 
      text: `${index + 1}. ${tech.name}`, 
      callback_data: `assign_tech_${tech.id}` 
    }]);
  });
  
  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

async function assignTechnician(chatId, telegramId, techId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const session = userSessions.get(chatId);
    if (!session || session.type !== 'create_order') {
      bot.sendMessage(chatId, '❌ Session tidak valid. Silakan mulai ulang.');
      return;
    }
    
    // Get technician name
    const { data: tech } = await supabase
      .from('users')
      .select('name')
      .eq('id', techId)
      .single();
    
    // Get HD user ID who is creating the order
    const { data: hdUser } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();
    
    // Create order
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        order_id: session.data.order_id,
        customer_name: session.data.customer_name,
        customer_address: session.data.customer_address,
        contact: session.data.contact,
        sto: session.data.sto,
        transaction_type: session.data.transaction_type,
        service_type: session.data.service_type,
        assigned_technician: techId, // Primary/Coordinator technician
        created_by: hdUser?.id,
        technician_assigned_at: new Date().toLocaleString('sv-SE', {
          timeZone: 'Asia/Jakarta'
        }).replace(' ', 'T') + '.000Z',
        status: 'Pending'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating order:', error);
      bot.sendMessage(chatId, '❌ Gagal membuat order. Silakan coba lagi.');
      return;
    }
    
    // Clear session
    userSessions.delete(chatId);
    
    // Send success message with technician notification
    bot.sendMessage(chatId, 
      '✅ Order Berhasil Dibuat!\n\n' +
      `📋 Order ID: ${order.order_id}\n` +
      `👤 Pelanggan: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n` +
      `📞 Kontak: ${order.contact}\n` +
      `🏢 STO: ${order.sto}\n` +
      `🔄 Type Transaksi: ${order.transaction_type}\n` +
      `🌐 Jenis Layanan: ${order.service_type}\n` +
      `🔧 Teknisi: ${tech.name}\n` +
      `📊 Status: Pending\n\n` +
      'Teknisi akan mendapat notifikasi order baru.'
    );
    
    // Notify technician
    await notifyTechnician(techId, order);
    
  } catch (error) {
    console.error('Error assigning technician:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function notifyTechnician(techId, order) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get technician telegram ID
    const { data: tech } = await supabase
      .from('users')
      .select('telegram_id, name')
      .eq('id', techId)
      .single();
    
    if (tech && tech.telegram_id) {
      bot.sendMessage(tech.telegram_id, 
        '🔔 Order Baru Ditugaskan!\n\n' +
        `📋 Order ID: ${order.order_id}\n` +
        `👤 Pelanggan: ${order.customer_name}\n` +
        `🏠 Alamat: ${order.customer_address}\n` +
        `📞 Kontak: ${order.contact}\n` +
        `🏢 STO: ${order.sto}\n` +
        `🔄 Type Transaksi: ${order.transaction_type}\n` +
        `🌐 Jenis Layanan: ${order.service_type}\n` +
        `📊 Status: Pending\n\n` +
        'Silakan mulai dengan melakukan survey jaringan.'
      );
    }
  } catch (error) {
    console.error('Error notifying technician:', error);
  }
}

async function showProgressStages(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    // Get existing progress from progress_new
    const { data: progressData, error: progressError } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (progressError && progressError.code !== 'PGRST116') {
      console.error('Error fetching progress:', progressError);
    }
    
    let message = '📝 Update Progress\n\n';
    message += `📋 Order: ${order.customer_name}\n`;
    message += `🏠 Alamat: ${order.customer_address}\n`;
    message += `📊 Status: ${getStatusEmoji(order.status)} ${order.status}\n\n`;
    
    if (progressData) {
      message += '📈 Progress Terakhir:\n';
      
      // Display progress from JSON structure
      if (progressData.survey_jaringan) {
        message += `• Survey Jaringan: ${getProgressStatusEmoji(progressData.survey_jaringan.status)} ${progressData.survey_jaringan.status}\n`;
      }
      if (progressData.penarikan_kabel) {
        message += `• Penarikan Kabel: ${getProgressStatusEmoji(progressData.penarikan_kabel.status)} ${progressData.penarikan_kabel.status}\n`;
      }
      if (progressData.p2p) {
        message += `• P2P: ${getProgressStatusEmoji(progressData.p2p.status)} ${progressData.p2p.status}\n`;
      }
      if (progressData.instalasi_ont) {
        message += `• Instalasi ONT: ${getProgressStatusEmoji(progressData.instalasi_ont.status)} ${progressData.instalasi_ont.status}\n`;
      }
      message += '\n';
    }
    
    message += 'Pilih tahapan progress:';
    
    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Survey', callback_data: `progress_survey_${orderId}` }],
          [{ text: '🔌 Penarikan Kabel', callback_data: `progress_penarikan_${orderId}` }],
          [{ text: '📡 P2P', callback_data: `progress_p2p_${orderId}` }],
          [{ text: '📱 Instalasi ONT', callback_data: `progress_instalasi_${orderId}` }]
        ]
      }
    });
    
  } catch (error) {
    console.error('Error showing progress stages:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Progress handling functions
async function handleProgressSurvey(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    bot.sendMessage(chatId, 
      '🔍 Survey Jaringan\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Pilih hasil survey:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Jaringan Ready', callback_data: `survey_ready_${orderId}` }],
            [{ text: '❌ Jaringan Not Ready', callback_data: `survey_not_ready_${orderId}` }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Error handling survey:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}


  

async function handleProgressPenarikan(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    bot.sendMessage(chatId, 
      '🔌 Penarikan Kabel\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Pilih status penarikan kabel:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Selesai Penarikan', callback_data: `penarikan_selesai_${orderId}` }],
            [{ text: '📝 Tambah Catatan', callback_data: `penarikan_catatan_${orderId}` }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Error handling penarikan:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleProgressP2P(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    bot.sendMessage(chatId, 
      '📡 P2P (Point-to-Point)\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Pilih status P2P:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Selesai P2P', callback_data: `p2p_selesai_${orderId}` }],
            [{ text: '📝 Tambah Catatan', callback_data: `p2p_catatan_${orderId}` }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Error handling P2P:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleProgressInstalasi(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    bot.sendMessage(chatId, 
      '📱 Instalasi ONT\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Pilih status instalasi ONT:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Selesai Instalasi', callback_data: `instalasi_selesai_${orderId}` }],
            [{ text: '📝 Tambah Catatan', callback_data: `instalasi_catatan_${orderId}` }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Error handling instalasi:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function handleSurveyResult(chatId, telegramId, orderId, result) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, users!assigned_technician(*)')
      .eq('order_id', orderId)
      .single();

    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Get technician name
    const { data: technicianData } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', telegramId)
      .single();
    
    const technicianName = technicianData?.name || 'Unknown';

    // Format timestamp untuk status
    const now = new Date();
    const formattedTimestamp = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    }) + ', ' + now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Save progress based on result
    if (result === 'Ready') {
      const statusWithTimestamp = `Ready - ${formattedTimestamp} - ${technicianName}`;
      
      // Update order status to In Progress
      await supabase
        .from('orders')
        .update({ status: 'In Progress' })
        .eq('order_id', orderId);

      // Save survey progress to progress_new
      const progressData = {
        status: statusWithTimestamp,
        note: null
      };

      // Check if record exists for this order_id
      const { data: existingRecord, error: selectError } = await supabase
        .from('progress_new')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (existingRecord) {
        // Update existing record
        await supabase
          .from('progress_new')
          .update({ survey_jaringan: progressData })
          .eq('order_id', orderId);
      } else {
        // Insert new record
        await supabase
          .from('progress_new')
          .insert({
            order_id: orderId,
            survey_jaringan: progressData
          });
      }

      bot.sendMessage(chatId, 
        '✅ Survey Selesai!\n\n' +
        `📋 Order: ${order.customer_name}\n` +
        `📊 Status: ${statusWithTimestamp}\n\n` +
        'Silakan lanjutkan ke tahap penarikan kabel.'
      );

    } else {
      const statusWithTimestamp = `Not Ready - ${formattedTimestamp} - ${technicianName}`;
      
      // Update order status to On Hold and set lme_pt2_start timestamp
      const jakartaTime = new Date().toLocaleString('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).replace(' ', 'T') + '.000Z';
      
      await supabase
        .from('orders')
        .update({ 
          status: 'On Hold',
          lme_pt2_start: jakartaTime,
        })
        .eq('order_id', orderId);

      // Save survey progress to progress_new
      const progressData = {
        status: statusWithTimestamp,
        note: null
      };

      // Check if record exists for this order_id
      const { data: existingRecord, error: selectError } = await supabase
        .from('progress_new')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (existingRecord) {
        // Update existing record
        await supabase
          .from('progress_new')
          .update({ survey_jaringan: progressData })
          .eq('order_id', orderId);
      } else {
        // Insert new record
        await supabase
          .from('progress_new')
          .insert({
            order_id: orderId,
            survey_jaringan: progressData
          });
      }

      // Create display time directly from current Jakarta time
      const displayTime = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      bot.sendMessage(chatId, 
        `❌ Jaringan ${statusWithTimestamp}. Status order diupdate ke On Hold.\n\n` +
        `📅 LME PT2 Start Time: ${displayTime}\n` +
        `🔔 HD telah diberitahu untuk update LME PT2.`
      );
      await notifyHDAboutNetworkNotReady(orderId);
    }

  } catch (error) {
    console.error('Error handling survey result:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function notifyHDAboutNetworkNotReady(orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, users!assigned_technician(*)')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      console.error('Error getting order for HD notification:', error);
      return;
    }
    
    // Get all HD users
    const { data: hdUsers, error: hdError } = await supabase
      .from('users')
      .select('telegram_id, name')
      .eq('role', 'HD');
    
    if (hdError || !hdUsers) {
      console.error('Error getting HD users:', hdError);
      return;
    }
    
    // Save notification record
    try {
      await supabase
        .from('notifications')
        .insert({
          order_id: orderId,
          type: 'network_not_ready',
          message: 'HD notified about network not ready status',
          sent_at: new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"})).toISOString(),
          status: 'sent'
        });
    } catch (notifError) {
      console.log('Notification logging failed (table may not exist):', notifError.message);
    }
    
    // Notify all HD users
    for (const hd of hdUsers) {
      if (hd.telegram_id) {
        bot.sendMessage(hd.telegram_id, 
          `🚨 **NETWORK NOT READY ALERT**\n\n` +
          `📋 **Order ID**: #${order.order_id}\n` +
          `👤 **Pelanggan**: ${order.customer_name}\n` +
          `🏠 **Alamat**: ${order.customer_address}\n` +
          `🔧 **Teknisi**: ${order.users?.name || 'Unknown'}\n\n` +
          `⚠️ **Status**: On Hold - Jaringan Not Ready\n` +
          `📝 **Instruksi**: Silakan update waktu LME PT2\n\n` +
          `⏰ **Waktu Notifikasi**: ${new Date().toLocaleString('id-ID')}\n\n` +
          `🎯 **Action Required**: TTI Comply dalam 3x24 jam setelah PT2 selesai`,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  // nonaktifin button Update LME PT2 di notifikasi karena sudah make yang dari button menu
                  // { text: ' Update LME PT2', callback_data: `update_lme_pt2_${orderId}` },
                  // { text: ' Lihat Detail', callback_data: `view_order_${orderId}` }
                ]
              ]
            }
          }
        );
      }
    }
    
    console.log(`✅ Network not ready notification sent to HD for order ${orderId}`);
    
  } catch (error) {
    console.error('Error notifying HD about network not ready:', error);
  }}

// Fungsi untuk menangani input progress update





async function notifyHDPT2SelesaiWithTTI(orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details
    const { data: order } = await supabase
      .from('orders')
      .select('*, users!assigned_technician(*)')
      .eq('order_id', orderId)
      .single();

    // Get all HD users
    const { data: hdUsers } = await supabase
      .from('users')
      .select('telegram_id, name')
      .eq('role', 'HD');

    // Notify all HD users
    for (const hd of hdUsers) {
      if (hd.telegram_id) {
        bot.sendMessage(hd.telegram_id,
          `✅ **PT2 SELESAI - TTI COMPLY DIMULAI**\n\n` +
          `📋 **Order ID**: #${order.order_id}\n` +
          `👤 **Pelanggan**: ${order.customer_name}\n` +
          `🏠 **Alamat**: ${order.customer_address}\n` +
          `🔧 **Teknisi**: ${order.users?.name || 'Unknown'}\n` +
          `📊 **Status**: PT2 Selesai\n` +
          `⏰ **Waktu PT2 Selesai**: ${new Date().toLocaleString('id-ID')}\n\n` +
          `🚀 **TTI COMPLY 3x24 JAM DIMULAI OTOMATIS!**\n` +
          `⏰ **Deadline**: ${formatIndonesianDateTime(new Date(Date.now() + 72*60*60*1000))}\n` +
          `📊 **Monitoring**: Otomatis dengan reminder berkala`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    
    // Start TTI Comply countdown automatically
    await startTTIComplyCountdown(orderId);
    
    console.log(`✅ PT2 completion notification sent and TTI Comply started for order ${orderId}`);
    
  } catch (error) {
    console.error('Error notifying HD PT2 selesai with TTI:', error);
  }
}

// TTI Comply system functions
async function startTTIComplyCountdown(orderId) {
  try {
    console.log(`🚀 Starting TTI Comply countdown for order: ${orderId}`);
    
    // Calculate TTI Comply deadline (3x24 hours = 72 hours)
    const startTime = new Date();
    const deadlineTime = new Date(startTime.getTime() + (72 * 60 * 60 * 1000)); // 72 hours
    
    // TTI Comply tracking is now handled directly in orders table
    // No need for separate tti_comply table
    
    // Schedule reminder notifications
    scheduleTTIReminders(orderId, deadlineTime);
    
    console.log(`✅ TTI Comply countdown started for order ${orderId}`);
    
  } catch (error) {
    console.error('Error starting TTI Comply countdown:', error);
  }
}

// Schedule TTI reminder notifications
function scheduleTTIReminders(orderId, deadlineTime) {
  const now = new Date();
  const timeToDeadline = deadlineTime.getTime() - now.getTime();
  
  // Reminder at 48 hours remaining (24 hours after start)
  const reminder48h = timeToDeadline - (48 * 60 * 60 * 1000);
  if (reminder48h > 0) {
    setTimeout(() => {
      sendTTIReminder(orderId, '48 jam', 'warning');
    }, reminder48h);
  }
  
  // Reminder at 24 hours remaining (48 hours after start)
  const reminder24h = timeToDeadline - (24 * 60 * 60 * 1000);
  if (reminder24h > 0) {
    setTimeout(() => {
      sendTTIReminder(orderId, '24 jam', 'urgent');
    }, reminder24h);
  }
  
  // Reminder at 6 hours remaining
  const reminder6h = timeToDeadline - (6 * 60 * 60 * 1000);
  if (reminder6h > 0) {
    setTimeout(() => {
      sendTTIReminder(orderId, '6 jam', 'critical');
    }, reminder6h);
  }
  
  // Final reminder at deadline
  if (timeToDeadline > 0) {
    setTimeout(() => {
      sendTTIReminder(orderId, '0 jam', 'expired');
    }, timeToDeadline);
  }
}

// Send TTI reminder notification
async function sendTTIReminder(orderId, remainingTime, urgencyLevel) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order } = await supabase
      .from('orders')
      .select('*, users!assigned_technician(*)')
      .eq('order_id', orderId)
      .single();
    
    // Get all HD users
    const { data: hdUsers } = await supabase
      .from('users')
      .select('telegram_id, name')
      .eq('role', 'HD');
    
    // Determine message based on urgency level
    let emoji, title, priority;
    switch (urgencyLevel) {
      case 'warning':
        emoji = '⚠️';
        title = 'TTI COMPLY WARNING';
        priority = 'MEDIUM';
        break;
      case 'urgent':
        emoji = '🚨';
        title = 'TTI COMPLY URGENT';
        priority = 'HIGH';
        break;
      case 'critical':
        emoji = '🔴';
        title = 'TTI COMPLY CRITICAL';
        priority = 'CRITICAL';
        break;
      case 'expired':
        emoji = '💀';
        title = 'TTI COMPLY EXPIRED';
        priority = 'EXPIRED';
        break;
      default:
        emoji = '⏰';
        title = 'TTI COMPLY REMINDER';
        priority = 'INFO';
    }
    
    // Send reminder to all HD users
    for (const hd of hdUsers) {
      if (hd.telegram_id) {
        bot.sendMessage(hd.telegram_id, 
          `${emoji} **${title}**\n\n` +
          `📋 **Order ID**: #${order.order_id}\n` +
          `👤 **Pelanggan**: ${order.customer_name}\n` +
          `🏠 **Alamat**: ${order.customer_address}\n` +
          `🔧 **Teknisi**: ${order.users?.name || 'Unknown'}\n\n` +
          `⏳ **Sisa Waktu**: ${remainingTime}\n` +
          `⚠️ **Prioritas**: ${priority}\n\n` +
          `${urgencyLevel === 'expired' ? 
            '💀 **TTI COMPLY SUDAH EXPIRED!**\n📞 Segera ambil tindakan darurat!' :
            '🎯 **TTI harus comply sebelum deadline!**'
          }`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    
    console.log(`✅ TTI reminder sent for order ${orderId} - ${remainingTime} remaining`);
    
  } catch (error) {
    console.error('Error sending TTI reminder:', error);
  }
}

// Show order details function
async function showOrderDetails(chatId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, users!assigned_technician(*)')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Get stage assignments
    const { data: stageAssignments } = await supabase
      .from('order_stage_assignments')
      .select(`
        id,
        stage,
        status,
        assigned_at,
        users!assigned_technician(name, telegram_id)
      `)
      .eq('order_id', orderId)
      .order('assigned_at', { ascending: true });

    // Get progress history from new progress table
    const { data: progress } = await supabase
      .from('progress_new')
      .select(`
        stage,
        status,
        timestamp,
        updated_by_technician,
        users!updated_by_technician(name)
      `)
      .eq('order_id', orderId)
      .order('timestamp', { ascending: true });
    
    let stageAssignmentsText = '';
    if (stageAssignments && stageAssignments.length > 0) {
      stageAssignmentsText = '\n\n👥 **Penugasan Stage:**\n';
      
      stageAssignments.forEach(assignment => {
        const stageEmoji = getStageEmoji(assignment.stage);
        const statusEmoji = getStageStatusEmoji(assignment.status);
        const technicianName = assignment.users?.name || 'Tidak ditugaskan';
        
        stageAssignmentsText += `${stageEmoji} **${assignment.stage}**\n`;
        stageAssignmentsText += `   👤 Teknisi: ${technicianName}\n`;
        stageAssignmentsText += `   ${statusEmoji} Status: ${assignment.status}\n`;
        stageAssignmentsText += `   📅 Ditugaskan: ${new Date(assignment.assigned_at).toLocaleString('id-ID')}\n\n`;
      });
    }

    let progressText = '';
    if (progress && progress.length > 0) {
      progressText = '\n📋 **Riwayat Progress:**\n';
      
      progress.forEach((entry, index) => {
        const stageEmoji = getStageEmoji(entry.stage);
        const statusEmoji = getStageStatusEmoji(entry.status);
        const updatedBy = entry.users?.name || 'Sistem';
        
        progressText += `${index + 1}. ${stageEmoji} ${entry.stage} → ${statusEmoji} ${entry.status}\n`;
        progressText += `   👤 Oleh: ${updatedBy}\n`;
        progressText += `   ⏰ ${new Date(entry.timestamp).toLocaleString('id-ID')}\n\n`;
      });
    }
    
    bot.sendMessage(chatId, 
      `📋 **Detail Order #${order.order_id}**\n\n` +
      `👤 **Pelanggan**: ${order.customer_name}\n` +
      `🏠 **Alamat**: ${order.customer_address}\n` +
      `📞 **Kontak**: ${order.customer_phone || 'N/A'}\n` +
      `🔧 **Teknisi Utama**: ${order.users?.name || 'Belum ditugaskan'}\n` +
      `📊 **Status**: ${order.status}\n` +
      `⏰ **Dibuat**: ${new Date(order.created_at).toLocaleString('id-ID')}\n` +
      `🏢 **STO**: ${order.sto || 'N/A'}\n` +
      `💼 **Tipe Transaksi**: ${order.transaction_type || 'N/A'}\n` +
      `🔧 **Tipe Service**: ${order.service_type || 'N/A'}\n` +
      `👨‍🔧 **Teknisi Ditugaskan**: ${formatIndonesianDateTime(order.technician_assigned_at)}\n` +
      `⏰ **TTI Comply Deadline**: ${formatIndonesianDateTime(order.tti_comply_deadline)}\n` +
      `📊 **TTI Comply Status**: ${order.tti_comply_status || 'Pending'}\n` +
      `⏱️ **TTI Comply Durasi**: ${order.tti_comply_actual_duration || 'Belum selesai'}` +
      stageAssignmentsText +
      progressText,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error showing order details:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil detail order.');
  }
}

function showHelpByRole(chatId, role) {
  let helpText = `Panduan Penggunaan Bot\n\n`;
  
  if (role === 'HD') {
    helpText += `Untuk Helpdesk (HD):\n\n` +
      `📋 Buat Order Baru - Membuat order instalasi baru\n` +
      `📊 Lihat Semua Order - Melihat semua order dalam sistem\n` +
      `⚙️ Update Status Order - Update status order (SOD, E2E, LME PT2)\n\n` +
      `Commands:\n` +
      `/start - Memulai bot\n` +
      `/help - Menampilkan panduan ini\n` +
      `/order - Membuat order baru\n` +
      `/myorders - Melihat semua order\n\n` +
      `Flow Order:\n` +
      `1. Buat order → Assign teknisi\n` +
      `2. Input SOD & E2E time\n` +
      `3. Monitor progress teknisi\n` +
      `4. Update LME PT2 jika diperlukan\n` +
      `5. Review evidence sebelum close`;
  } else {
    helpText += `Untuk Teknisi:\n\n` +
      `📋 Order Saya - Melihat order yang ditugaskan\n` +
      `📝 Update Progress - Update progress instalasi\n` +
      `📸 Upload Evidence - Upload foto dan data evidence\n\n` +
      `Commands:\n` +
      `/start - Memulai bot\n` +
      `/help - Menampilkan panduan ini\n` +
      `/myorders - Melihat order saya\n` +
      `/progress - Update progress\n` +
      `/evidence - Upload evidence\n\n` +
      `Flow Instalasi:\n` +
      `1. Terima notifikasi order baru\n` +
      `2. Survey jaringan (Ready/Not Ready)\n` +
      `3. Penarikan kabel\n` +
      `4. P2P (Point-to-Point)\n` +
      `5. Instalasi ONT\n` +
      `6. Upload semua evidence\n` +
      `7. Order otomatis close jika evidence lengkap`;
  }
  
  bot.sendMessage(chatId, helpText);
}

async function registerUser(telegramId, firstName, role) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { error } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        name: firstName,
        role: role
      });
    
    if (error) {
      console.error('Error registering user:', error);
    }
  } catch (error) {
    console.error('Error registering user:', error);
  }
}

// 1. Start evidence flow
async function startEvidenceUploadFlow(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details first
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error || !order) {
      console.error('Error getting order:', error);
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Set session with order details
    userSessions.set(chatId, {
      type: 'evidence_upload',
      step: 'odp',
      orderId,
      data: {
        order_name: order.customer_name,
        order_address: order.customer_address
      }
    });

    

    // Start evidence flow
    bot.sendMessage(chatId, 
      '📸 Upload Evidence\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Silakan masukkan nama ODP:',
    );

    

  } catch (error) {
    console.error('Error starting evidence flow:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// 2. Handle evidence input
async function handleEvidenceUploadFlow(chatId, telegramId, text, msg, session) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Handle ODP input
    if (session.step === 'odp') {
      session.data.odp = text;
      session.step = 'sn_ont';
      bot.sendMessage(chatId, 'Silakan masukkan SN ONT:');
      return;
    }

    // Handle SN ONT input  
    if (session.step === 'sn_ont') {
      session.data.sn_ont = text;
      session.step = 'photos';
      session.data.uploadedPhotos = 0;

      // Create initial evidence record
      const { error: createError } = await supabase
        .from('evidence')
        .insert({
          order_id: session.orderId,
          odp_name: session.data.odp,
          ont_sn: text
        });

      if (createError) {
        console.error('Error creating evidence:', createError);
        bot.sendMessage(chatId, '❌ Gagal menyimpan data awal. Silakan coba lagi.');
        return;
      }

      bot.sendMessage(chatId, 'Silakan kirim 7 foto evidence secara berurutan:\n\n1. Foto SN ONT\n2. Foto Teknisi + Pelanggan\n3. Foto Rumah Pelanggan\n4. Foto Depan ODP\n5. Foto Dalam ODP\n6. Foto Label DC\n7. Foto Test Redaman');
      return;
    }

    // Photo uploads are now handled by the main photo handler (bot.on('photo'))
    // This prevents duplicate processing
    
  } catch (error) {
    console.error('Error in evidence flow:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Handler untuk instalasi selesai langsung tanpa catatan
async function handleInstalasiSelesai(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get technician name
    const { data: technicianData } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', telegramId)
      .single();
    
    const technicianName = technicianData?.name || 'Unknown';
    
    // Create timestamp
    const now = new Date();
    const formattedTimestamp = now.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '/').replace(',', ',');
    
    const statusWithTimestamp = `Selesai - ${formattedTimestamp} - ${technicianName}`;
    
    // Check if record exists for this order_id
    const { data: existingRecord, error: selectError } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    const progressData = {
      status: statusWithTimestamp,
      note: null
    };
    
    let error;
    if (existingRecord) {
      // Update existing record
      const result = await supabase
        .from('progress_new')
        .update({ instalasi_ont: progressData })
        .eq('order_id', orderId);
      
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from('progress_new')
        .insert({
          order_id: orderId,
          instalasi_ont: progressData
        });
      
      error = result.error;
    }
    
    if (error) {
      console.error('Error saving progress:', error);
      bot.sendMessage(chatId, '❌ Gagal menyimpan progress. Silakan coba lagi.');
      return;
    }
    
    // Update order status to In Progress if it's still Pending
    await supabase
      .from('orders')
      .update({ status: 'In Progress' })
      .eq('order_id', orderId)
      .eq('status', 'Pending');
    
    bot.sendMessage(chatId, 
      `✅ Progress Berhasil Diupdate!\n\n` +
      `📝 Tahapan: Instalasi\n` +
      `📊 Status: ${statusWithTimestamp}\n` +
      `📝 Catatan: Tidak ada catatan\n\n` +
      'Progress telah tersimpan ke database.'
    );
    
  } catch (error) {
    console.error('Error handling instalasi selesai:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Handler untuk instalasi dengan catatan
async function handleInstalasiCatatan(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    // Set session for progress update
    userSessions.set(chatId, {
      type: 'update_progress',
      step: 'instalasi_note',
      orderId: orderId,
      stage: 'Instalasi',
      data: {}
    });
    
    bot.sendMessage(chatId, 
      '📱 Instalasi dengan Catatan\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Masukkan catatan instalasi ONT:'
    );
    
  } catch (error) {
    console.error('Error handling instalasi catatan:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Handler untuk penarikan selesai langsung tanpa catatan
async function handlePenarikanSelesai(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get technician name
    const { data: technicianData } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', telegramId)
      .single();
    
    const technicianName = technicianData?.name || 'Unknown';
    
    // Create timestamp
    const now = new Date();
    const formattedTimestamp = now.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '/').replace(',', ',');
    
    const statusWithTimestamp = `Selesai - ${formattedTimestamp} - ${technicianName}`;
    
    // Check if record exists for this order_id
    const { data: existingRecord, error: selectError } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    const progressData = {
      status: statusWithTimestamp,
      note: null
    };
    
    let error;
    if (existingRecord) {
      // Update existing record
      const result = await supabase
        .from('progress_new')
        .update({ penarikan_kabel: progressData })
        .eq('order_id', orderId);
      
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from('progress_new')
        .insert({
          order_id: orderId,
          penarikan_kabel: progressData
        });
      
      error = result.error;
    }
    
    if (error) {
      console.error('Error saving progress:', error);
      bot.sendMessage(chatId, '❌ Gagal menyimpan progress. Silakan coba lagi.');
      return;
    }
    
    // Update order status to In Progress if it's still Pending
    await supabase
      .from('orders')
      .update({ status: 'In Progress' })
      .eq('order_id', orderId)
      .eq('status', 'Pending');
    
    bot.sendMessage(chatId, 
      `✅ Progress Berhasil Diupdate!\n\n` +
      `📝 Tahapan: Penarikan\n` +
      `📊 Status: ${statusWithTimestamp}\n` +
      `📝 Catatan: Tidak ada catatan\n\n` +
      'Progress telah tersimpan ke database.'
    );
    
  } catch (error) {
    console.error('Error handling penarikan selesai:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Handler untuk penarikan dengan catatan
async function handlePenarikanCatatan(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    // Set session for progress update
    userSessions.set(chatId, {
      type: 'update_progress',
      step: 'penarikan_note',
      orderId: orderId,
      stage: 'Penarikan',
      data: {}
    });
    
    bot.sendMessage(chatId, 
      '🔌 Penarikan dengan Catatan\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Masukkan catatan penarikan kabel:'
    );
    
  } catch (error) {
    console.error('Error handling penarikan catatan:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Handler untuk P2P selesai langsung tanpa catatan
async function handleP2PSelesai(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get technician name
    const { data: technicianData } = await supabase
      .from('users')
      .select('name')
      .eq('telegram_id', telegramId)
      .single();
    
    const technicianName = technicianData?.name || 'Unknown';
    
    // Create timestamp
    const now = new Date();
    const formattedTimestamp = now.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '/').replace(',', ',');
    
    const statusWithTimestamp = `Selesai - ${formattedTimestamp} - ${technicianName}`;
    
    // Check if record exists for this order_id
    const { data: existingRecord, error: selectError } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    const progressData = {
      status: statusWithTimestamp,
      note: null
    };
    
    let error;
    if (existingRecord) {
      // Update existing record
      const result = await supabase
        .from('progress_new')
        .update({ p2p: progressData })
        .eq('order_id', orderId);
      
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from('progress_new')
        .insert({
          order_id: orderId,
          p2p: progressData
        });
      
      error = result.error;
    }
    
    if (error) {
      console.error('Error saving progress:', error);
      bot.sendMessage(chatId, '❌ Gagal menyimpan progress. Silakan coba lagi.');
      return;
    }
    
    // Update order status to In Progress if it's still Pending
    await supabase
      .from('orders')
      .update({ status: 'In Progress' })
      .eq('order_id', orderId)
      .eq('status', 'Pending');
    
    bot.sendMessage(chatId, 
      `✅ Progress Berhasil Diupdate!\n\n` +
      `📝 Tahapan: P2P\n` +
      `📊 Status: ${statusWithTimestamp}\n` +
      `📝 Catatan: Tidak ada catatan\n\n` +
      'Progress telah tersimpan ke database.'
    );
    
  } catch (error) {
    console.error('Error handling P2P selesai:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Handler untuk P2P dengan catatan
async function handleP2PCatatan(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error || !order) {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }
    
    // Set session for progress update
    userSessions.set(chatId, {
      type: 'update_progress',
      step: 'p2p_note',
      orderId: orderId,
      stage: 'P2P',
      data: {}
    });
    
    bot.sendMessage(chatId, 
      '📡 P2P dengan Catatan\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n\n` +
      'Masukkan catatan P2P:'
    );
    
  } catch (error) {
    console.error('Error handling P2P catatan:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Start TTI Comply countdown from LME PT2 end time (for network not ready case)
async function startTTIComplyFromLMEPT2End(orderId) {
  try {
    console.log(`🔄 Starting TTI Comply countdown from LME PT2 end for order: ${orderId}`);
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error || !order) {
      console.error('Error getting order for TTI from LME PT2:', error);
      return;
    }

    if (!order.lme_pt2_end) {
      console.error('No LME PT2 end time found for order:', orderId);
      return;
    }

    // Calculate TTI deadline (72 hours from LME PT2 end)
    const startTime = new Date(order.lme_pt2_end);
    const deadline = new Date(startTime.getTime() + (72 * 60 * 60 * 1000));

    // Convert deadline to Indonesian timezone before saving
    const indonesianDeadline = new Date(deadline.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    
    // Update orders table directly - no need for separate tti_comply table
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({
        tti_comply_status: 'pending',
        tti_comply_deadline: indonesianDeadline.toISOString(),
        tti_comply_calculated_from: 'lme_pt2_end'
      })
      .eq('order_id', orderId);

    if (orderUpdateError) {
      console.error('Error updating order TTI Comply from LME PT2:', orderUpdateError);
      return;
    }

    // Schedule TTI reminders
    scheduleTTIReminders(orderId, deadline);

    console.log(`✅ TTI Comply started from LME PT2 end for order ${orderId}, deadline: ${formatIndonesianDateTime(deadline)}`);

  } catch (error) {
    console.error('Error starting TTI Comply from LME PT2 end:', error);
  }
}

// Auto-update TTI Comply status when order is closed
async function autoUpdateTTIComplyOnClose(orderId) {
  try {
    console.log(`🔄 Auto-updating TTI Comply status for closed order: ${orderId}`);
    
    // Calculate TTI Comply status
    const ttiData = await calculateTTIComplyStatus(orderId);
    
    if (!ttiData) {
      console.error('Failed to calculate TTI Comply status for order:', orderId);
      return;
    }
    
    // Update TTI Comply status in database
    const success = await updateTTIComplyStatus(orderId, ttiData);
    
    if (success) {
      console.log(`✅ TTI Comply auto-updated for order ${orderId}: ${ttiData.status} (${formatReadableDuration(ttiData.actualDuration)})`);
      
      // Notify HD about TTI Comply result
      await notifyHDAboutTTIComplyResult(orderId, ttiData);
    } else {
      console.error('Failed to update TTI Comply status for order:', orderId);
    }
    
  } catch (error) {
    console.error('Error in auto-update TTI Comply:', error);
  }
}

// Notify HD about TTI Comply result
async function notifyHDAboutTTIComplyResult(orderId, ttiData) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error || !order) {
      console.error('Error getting order for TTI notification:', error);
      return;
    }

    // Get HD users
    const { data: hdUsers, error: hdError } = await supabase
      .from('users')
      .select('telegram_id, name')
      .eq('role', 'hd');

    if (hdError || !hdUsers || hdUsers.length === 0) {
      console.error('Error getting HD users:', hdError);
      return;
    }

    const statusEmoji = ttiData.status === 'comply' ? '✅' : '❌';
    const statusText = ttiData.status === 'comply' ? 'COMPLY' : 'NOT COMPLY';
    
    const message = 
      `🔔 *TTI Comply Result - Order Closed*\n\n` +
      `${statusEmoji} Status: *${statusText}*\n\n` +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n` +
      `🔧 Layanan: ${order.service_type}\n\n` +
      `⏱️ Durasi Aktual: *${formatReadableDuration(ttiData.actualDuration)}*\n` +
      `⏰ Target: 72 jam (3 hari)\n` +
      `📅 Mulai: ${formatIndonesianDateTime(ttiData.calculatedFrom === 'lme_pt2_end' ? order.lme_pt2_end : order.technician_assigned_at)}\n` +
      `⏰ Deadline: ${formatIndonesianDateTime(ttiData.deadline)}\n` +
      `🏁 Selesai: Order Closed\n\n` +
      `${ttiData.status === 'comply' ? '🎉 Teknisi berhasil menyelesaikan dalam waktu yang ditentukan!' : '⚠️ Teknisi melewati batas waktu TTI Comply.'}`;

    // Send notification to all HD users
    for (const hd of hdUsers) {
      try {
        await bot.sendMessage(hd.telegram_id, message, { parse_mode: 'Markdown' });
      } catch (sendError) {
        console.error(`Error sending TTI result to HD ${hd.name}:`, sendError);
      }
    }

    console.log(`✅ TTI Comply result notification sent to HD for order ${orderId}`);

  } catch (error) {
    console.error('Error sending TTI Comply result notification:', error);
  }
}

// Calculate TTI Comply status and duration
async function calculateTTIComplyStatus(orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error || !order) {
      console.error('Error getting order for TTI calculation:', error);
      return null;
    }

    let startTime;
    let calculatedFrom;
    let endTime = null;

    // Priority 1: Use E2E timestamp if available (new priority)
    if (order.e2e_timestamp && order.e2e_timestamp !== null) {
      // For E2E calculation, use SOD as start and E2E as end
      if (order.sod_timestamp && order.sod_timestamp !== null) {
        startTime = new Date(order.sod_timestamp);
        endTime = new Date(order.e2e_timestamp);
        calculatedFrom = 'sod_to_e2e';
      } else {
        // Fallback if no SOD but has E2E
        startTime = new Date(order.technician_assigned_at || order.created_at);
        endTime = new Date(order.e2e_timestamp);
        calculatedFrom = 'assigned_to_e2e';
      }
    }
    // Priority 2: Use SOD timestamp if available (existing logic)
    else if (order.sod_timestamp && order.sod_timestamp !== null) {
      startTime = new Date(order.sod_timestamp);
      calculatedFrom = 'sod_timestamp';
    }
    // Priority 3: Use LME PT2 end time if network was not ready
    else if (order.lme_pt2_end && order.lme_pt2_end !== null) {
      startTime = new Date(order.lme_pt2_end);
      calculatedFrom = 'lme_pt2_end';
    }
    // Priority 4: Use technician assignment time as fallback
    else if (order.technician_assigned_at) {
      startTime = new Date(order.technician_assigned_at);
      calculatedFrom = 'technician_assigned_at';
    } else {
      console.error('No valid start time found for TTI calculation:', orderId);
      return null;
    }

    // Calculate deadline (72 hours from start time)
    const deadline = new Date(startTime.getTime() + (72 * 60 * 60 * 1000));
    
    let status = 'pending';
    let actualDuration = null;

    // If order is closed or has E2E timestamp, calculate actual duration and determine comply status
    if (order.status === 'Closed' || endTime) {
      // Use E2E timestamp if available, otherwise use order close time
      if (!endTime) {
        endTime = new Date(order.updated_at);
      }
      
      // Calculate duration in minutes for better precision
      const durationInMinutes = Math.round((endTime - startTime) / (1000 * 60));
      actualDuration = Math.round(durationInMinutes / 60 * 100) / 100; // Convert to hours with 2 decimal precision
      
      // Ensure actualDuration is not negative
      if (actualDuration < 0) {
        console.warn(`Warning: Negative duration calculated for order ${orderId}: ${actualDuration} hours`);
        console.warn(`Start time: ${startTime}, End time: ${endTime}`);
        actualDuration = 0;
      }
      
      // Log calculation details for debugging
      console.log(`TTI Duration calculation for order ${orderId}:`);
      console.log(`- Start time (${calculatedFrom}): ${startTime.toISOString()}`);
      console.log(`- End time: ${endTime.toISOString()}`);
      console.log(`- Duration in minutes: ${durationInMinutes}`);
      console.log(`- Duration in hours: ${actualDuration}`);
      
      // Determine comply status
      if (actualDuration <= 72) {
        status = 'comply';
      } else {
        status = 'not_comply';
      }
    } else {
      // Order still in progress - check if deadline passed
      const now = new Date();
      if (now > deadline) {
        status = 'not_comply';
      }
    }

    const result = {
      orderId,
      startTime,
      deadline,
      endTime,
      actualDuration,
      status,
      calculatedFrom
    };

    // Create formatted result for console display
    const formattedResult = {
      ...result,
      startTime: formatIndonesianDateTime(startTime),
      deadline: formatIndonesianDateTime(deadline),
      endTime: endTime ? formatIndonesianDateTime(endTime) : null,
      actualDuration: actualDuration ? formatReadableDuration(actualDuration) : null
    };

    console.log(`TTI Comply calculation for order ${orderId}:`, formattedResult);
    return result;

  } catch (error) {
    console.error('Error calculating TTI Comply status:', error);
    return null;
  }
}

// Update TTI Comply status in database
async function updateTTIComplyStatus(orderId, ttiData) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Convert deadline to Indonesian timezone before saving
    const indonesianDeadline = new Date(ttiData.deadline.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    
    // Update orders table with TTI Comply data
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        tti_comply_status: ttiData.status,
        tti_comply_deadline: indonesianDeadline.toISOString(),
        tti_comply_calculated_from: ttiData.calculatedFrom,
        tti_comply_actual_duration: ttiData.actualDuration ? formatReadableDuration(ttiData.actualDuration) : null
      })
      .eq('order_id', orderId);

    if (orderError) {
      console.error('Error updating TTI Comply in orders table:', orderError);
      return false;
    }

    console.log(`✅ TTI Comply status updated successfully for order ${orderId}`);
    return true;

  } catch (error) {
    console.error('Error updating TTI Comply status:', error);
    return false;
  }
}

// Notify technician when LME PT2 is ready
async function notifyTechnicianLMEReady(orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order details with technician info
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, users!assigned_technician(*)')
      .eq('order_id', orderId)
      .single();

    if (error || !order) {
      console.error('Error getting order for LME notification:', error);
      return;
    }

    if (!order.assigned_technician || !order.users) {
      console.log('No technician assigned for order:', orderId);
      return;
    }

    const technician = order.users;
    
    if (!technician.telegram_id) {
      console.log('Technician has no telegram_id for order:', orderId);
      return;
    }

    const message = 
      '*Notifikasi LME PT2 Ready*\n\n' +
      '✅ Jaringan sudah siap! HD telah mengupdate status LME PT2.\n\n' +
      `📋 Order: ${order.customer_name}\n` +
      `🏠 Alamat: ${order.customer_address}\n` +
      `📞 Telepon: ${order.contact || 'N/A'}\n` +
      `🔧 Layanan: ${order.service_type}\n` +
      `🏢 STO: ${order.sto}\n\n` +
      'Anda dapat melanjutkan pekerjaan instalasi sekarang.\n' +
      '⏰ TTI Comply 3x24 jam akan dimulai setelah PT2 selesai.\n\n' +
      'Gunakan menu "📝 Update Progress" untuk mencatat perkembangan pekerjaan.';

    await bot.sendMessage(technician.telegram_id, message, { parse_mode: 'Markdown' });
    console.log(`✅ LME PT2 ready notification sent to technician ${technician.name} for order ${orderId}`);

  } catch (error) {
    console.error('Error sending LME PT2 ready notification:', error);
  }
}

// Function to show search order menu
async function showSearchOrderMenu(chatId, telegramId) {
  try {
    console.log(`🔍 Setting up search menu for user ${telegramId}`);
    
    const message = '🔍 *Cek Order*\n\n' +
      'Silakan masukkan Order ID yang ingin Anda cari:\n\n' +
      '📝 Format: Ketik order ID (contoh: ORD-001)\n' +
      '💡 Tip: Pastikan Order ID yang dimasukkan benar';

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Masukkan Order ID...'
      }
    });

    // Set user state to waiting for order ID input
    userStates[telegramId] = { 
      state: 'waiting_order_id_search',
      chatId: chatId
    };
    
    console.log(`✅ User state set for ${telegramId}:`, userStates[telegramId]);

  } catch (error) {
    console.error('Error showing search order menu:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat menampilkan menu cek order.');
  }
}

// Function to handle order search
async function handleOrderSearch(chatId, telegramId, orderId) {
  try {
    // Clear user state
    delete userStates[telegramId];

    if (!orderId || orderId.trim() === '') {
      bot.sendMessage(chatId, '❌ Order ID tidak boleh kosong. Silakan coba lagi.', getReplyMenuKeyboard('HD'));
      return;
    }

    // Show loading message
    const loadingMsg = await bot.sendMessage(chatId, '🔍 Mencari order...');

    // Search order in database
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log(`🔍 Searching for order: "${orderId.trim()}"`);

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        assigned_technician:users!orders_assigned_technician_fkey(name, telegram_id),
        created_by_user:users!orders_created_by_fkey(name)
      `)
      .eq('order_id', orderId.trim())
      .single();

    console.log('📊 Database query result:', { order, error });
    console.log('🔍 Order found:', !!order);
    console.log('❌ Error occurred:', !!error);

    // Delete loading message
    await bot.deleteMessage(chatId, loadingMsg.message_id);

    if (error || !order) {
      bot.sendMessage(chatId, 
        `❌ Order dengan ID "${orderId}" tidak ditemukan.\n\n` +
        '💡 Pastikan Order ID yang dimasukkan benar.',
        getReplyMenuKeyboard('HD')
      );
      return;
    }

    // Display detailed order information directly
    await showDetailedOrderInfo(chatId, order.order_id);

  } catch (error) {
    console.error('Error handling order search:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mencari order.', getReplyMenuKeyboard('HD'));
  }
}

// Function to display order details
async function displayOrderDetails(chatId, order) {
  try {
    const statusEmoji = {
      'pending': '⏳',
      'assigned': '👤',
      'in_progress': '🔄',
      'completed': '✅',
      'cancelled': '❌'
    };

    const serviceEmoji = {
      'Pasang Baru': '🆕',
      'Migrasi': '🔄',
      'Maintenance': '🔧'
    };

    const createdDate = new Date(order.created_at).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let message = `🔍 *Detail Order*\n\n`;
    message += `📋 *Order ID:* ${order.order_id}\n`;
    message += `${statusEmoji[order.status] || '❓'} *Status:* ${order.status.toUpperCase()}\n`;
    message += `${serviceEmoji[order.service_type] || '🔧'} *Layanan:* ${order.service_type}\n\n`;
    
    message += `👤 *Informasi Customer:*\n`;
    message += `• Nama: ${order.customer_name}\n`;
    message += `• Alamat: ${order.customer_address}\n`;
    message += `• Telepon: ${order.contact || 'N/A'}\n`;
    message += `• STO: ${order.sto}\n\n`;
    
    message += `📅 *Informasi Order:*\n`;
    message += `• Dibuat: ${createdDate}\n`;
    message += `• Dibuat oleh: ${order.created_by_user?.name || 'N/A'}\n`;
    
    if (order.assigned_technician) {
      message += `• Teknisi: ${order.assigned_technician.name}\n`;
    }
    
    if (order.notes) {
      message += `\n📝 *Catatan:*\n${order.notes}`;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh', callback_data: `refresh_order_${order.order_id}` },
          { text: '📋 Detail Lengkap', callback_data: `detail_order_${order.order_id}` }
        ]
      ]
    };

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Error displaying order details:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat menampilkan detail order.');
  }
}

// Function to show detailed order information
async function showDetailedOrderInfo(chatId, orderId) {
  try {
    console.log(`🔍 Starting showDetailedOrderInfo for order: ${orderId}`);
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log(`📊 Querying database for order: ${orderId}`);
    
    // Get order with all related data
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        assigned_technician:users!orders_assigned_technician_fkey(name, telegram_id, role),
        created_by_user:users!orders_created_by_fkey(name)
      `)
      .eq('order_id', orderId)
      .single();

    console.log(`📊 Database result:`, { order: order ? 'found' : 'not found', error });

    if (error || !order) {
      console.log(`❌ Order not found: ${orderId}`);
      bot.sendMessage(chatId, `❌ Order dengan ID "${orderId}" tidak ditemukan.`);
      return;
    }

    console.log(`✅ Order found, formatting message...`);

    // Get progress data from progress_new (single record per order_id)
    const { data: progressRecord } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', order.order_id)
      .single();

    // Get evidence data separately  
    const { data: evidenceData } = await supabase
      .from('evidence')
      .select('*')
      .eq('order_id', order.order_id)
      .order('uploaded_at', { ascending: false });

    console.log(`📊 Progress data:`, progressRecord ? 'present' : 'none');
    console.log(`📊 Evidence data:`, evidenceData ? evidenceData.length : 0, 'records');

    // Format timestamps
    const formatDateTime = (timestamp) => {
      if (!timestamp) return 'Belum diset';
      try {
        return formatIndonesianDateTime(new Date(timestamp));
      } catch (e) {
        console.log(`⚠️ Error formatting date: ${timestamp}`, e);
        return 'Format tanggal error';
      }
    };

    // Status emoji
    const statusEmoji = {
      'Pending': '⏳',
      'In Progress': '🔄', 
      'On Hold': '⏸️',
      'Completed': '✅',
      'Closed': '🔒'
    };

    let message = `📋 *DETAIL LENGKAP ORDER*\n\n`;
    
    // Basic Info
    message += `🆔 *Order ID:* ${order.order_id}\n`;
    message += `${statusEmoji[order.status] || '❓'} *Status:* ${order.status}\n`;
    message += `📅 *Dibuat:* ${formatDateTime(order.created_at)}\n`;
    message += `👤 *Dibuat oleh:* ${order.created_by_user?.name || 'N/A'}\n`;
    message += `📝 *Terakhir Update:* ${formatDateTime(order.updated_at)}\n\n`;
    
    // Customer Info
    message += `👤 *INFORMASI CUSTOMER*\n`;
    message += `• Nama: ${order.customer_name}\n`;
    message += `• Alamat: ${order.customer_address}\n`;
    message += `• Kontak: ${order.contact || 'N/A'}\n`;
    message += `• STO: ${order.sto}\n\n`;
    
    // Service Info
    message += `🔧 *INFORMASI LAYANAN*\n`;
    message += `• Jenis Transaksi: ${order.transaction_type}\n`;
    message += `• Jenis Layanan: ${order.service_type}\n\n`;
    
    // Technician Info
    if (order.assigned_technician) {
      message += `👨‍🔧 *TEKNISI ASSIGNED*\n`;
      message += `• Nama: ${order.assigned_technician.name}\n`;
      message += `• Role: ${order.assigned_technician.role}\n`;
      if (order.technician_assigned_at) {
        message += `• Assigned pada: ${formatDateTime(order.technician_assigned_at)}\n`;
      }
      message += `\n`;
    }
    
    // Timeline Info
    message += `⏰ *TIMELINE PEKERJAAN*\n`;
    message += `• SOD Time: ${formatDateTime(order.sod_timestamp)}\n`;
    message += `• E2E Time: ${formatDateTime(order.e2e_timestamp)}\n`;
    message += `• LME PT2 Start: ${formatDateTime(order.lme_pt2_start)}\n`;
    message += `• LME PT2 End: ${formatDateTime(order.lme_pt2_end)}\n\n`;
    
    // TTI Comply Info
    if (order.tti_comply_deadline) {
      message += `🎯 *TTI COMPLY*\n`;
      message += `• Deadline: ${formatDateTime(order.tti_comply_deadline)}\n`;
      message += `• Status: ${order.tti_comply_status || 'Pending'}\n`;
      if (order.tti_comply_actual_duration) {
        message += `• Durasi Aktual: ${order.tti_comply_actual_duration}\n`;
      }
      message += `\n`;
    }
    
    // Progress Info from progress_new
    if (progressRecord) {
      message += `*INFORMASI TRACK PROGRESS*\n`;
      const progressStages = [
        { key: 'survey_jaringan', label: 'Survey Jaringan' },
        { key: 'penarikan_kabel', label: 'Penarikan Kabel' },
        { key: 'p2p', label: 'P2P' },
        { key: 'instalasi_ont', label: 'Instalasi ONT' }
      ];
      for (const s of progressStages) {
        const data = progressRecord[s.key];
        if (data && data.status) {
          const emoji = getProgressStatusEmoji(data.status);
          message += `• ${s.label}: ${emoji} ${data.status}`;
          if (data.note) message += ` (${data.note})`;
          message += `\n`;
        } else {
          message += `• ${s.label}: Belum diset\n`;
        }
      }
      message += `\n`;
    }

    // Assignment per stage (optional)
    const { data: stageAssignments } = await supabase
      .from('order_stage_assignments')
      .select('stage, assigned_technician, status')
      .eq('order_id', order.order_id);
    if (stageAssignments && stageAssignments.length > 0) {
      // Fetch technician names in batch
      const techIds = [...new Set(stageAssignments
        .map(a => a.assigned_technician)
        .filter(Boolean))];
      let techMap = {};
      if (techIds.length > 0) {
        const { data: techs } = await supabase
          .from('users')
          .select('telegram_id, name')
          .in('telegram_id', techIds);
        techs?.forEach(t => { techMap[t.telegram_id] = t.name; });
      }
      message += `👥 *ASSIGNMENT TEKNISI PER STAGE*\n`;
      const stageOrder = ['Survey', 'Penarikan', 'P2P', 'Instalasi', 'Evidence'];
      for (const stage of stageOrder) {
        const a = stageAssignments.find(x => x.stage === stage);
        if (a) {
          const techName = a.assigned_technician ? (techMap[a.assigned_technician] || a.assigned_technician) : 'Belum di-assign';
          const status = a.status || 'Belum di-assign';
          message += `• ${stage}: ${status} - ${techName}\n`;
        } else {
          message += `• ${stage}: Belum di-assign\n`;
        }
      }
      message += `\n`;
    }
    
    // Evidence Info
    if (evidenceData && evidenceData.length > 0) {
      message += `📸 *EVIDENCE UPLOADED*\n`;
      const evidence = evidenceData[0]; // Get latest evidence
      if (evidence.odp_name) message += `• ODP Name: ${evidence.odp_name}\n`;
      if (evidence.ont_sn) message += `• ONT SN: ${evidence.ont_sn}\n`;
      
      const photoTypes = [
        { key: 'photo_sn_ont', label: 'Foto SN ONT' },
        { key: 'photo_technician_customer', label: 'Foto Teknisi & Customer' },
        { key: 'photo_customer_house', label: 'Foto Rumah Customer' },
        { key: 'photo_odp_front', label: 'Foto ODP Depan' },
        { key: 'photo_odp_inside', label: 'Foto ODP Dalam' },
        { key: 'photo_label_dc', label: 'Foto Label DC' },
        { key: 'photo_test_result', label: 'Foto Test Result' }
      ];
      
      const uploadedPhotos = photoTypes.filter(type => evidence[type.key]);
      if (uploadedPhotos.length > 0) {
        message += `• Foto terupload: ${uploadedPhotos.length}/7\n`;
        message += `• Upload terakhir: ${formatDateTime(evidence.uploaded_at)}\n`;
      }
      message += `\n`;
    }

    // Get user role to show appropriate keyboard
    const telegramId = await getTelegramIdFromChatId(chatId);
    const userRole = await getUserRole(telegramId);
    
    console.log(`📤 Sending detailed message for order: ${order.order_id}`);
    console.log(`📝 Message length: ${message.length} characters`);

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });

    console.log(`✅ Detailed message sent successfully for order: ${order.order_id}`);
    
    // Show reply keyboard menu after sending detail order
    if (userRole === 'HD') {
      await bot.sendMessage(chatId, '📋 Menu HD', getReplyMenuKeyboard(userRole));
    } else {
      await bot.sendMessage(chatId, '📋 Menu', getReplyMenuKeyboard(userRole));
    }

  } catch (error) {
    console.error('❌ Error showing detailed order info:', error);
    console.error('❌ Error stack:', error.stack);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat menampilkan detail lengkap order.');
  }
}



//MENU COBA LIHAT DATA YANG BELUM SOD







async function showSODOrder(chatId, telegramId) {
try{
const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY

);

//Get orders doesnt have sod timestamp

const {data: orders, error } = await supabase
.from('orders')
.select('id, order_id, customer_name, sto')
.is('sod_timestamp', null)
.order('created_at', { ascending: true });

if (error) {
      console.error('Error fetching orders for SOD:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, 
        'Tidak ada order yang perlu update SOD.\n\n' +
        '✅ Semua order aktif sudah memiliki SOD timestamp.'
      );
      return;
    }






// BUAT TAMPILIN DATANYA

let message = '📋 DAFTAR ORDER YANG BELUM SOD\n\n';


    message += `${statusEmoji[order.status] || '❓'} *Status:* ${order.status.toUpperCase()}\n`;
    message += `${serviceEmoji[order.service_type] || '🔧'} *Layanan:* ${order.service_type}\n\n`;
    
    message += `👤 *Informasi Customer:*\n`;
    message += `• Nama: ${order.customer_name}\n`;
    message += `• Alamat: ${order.customer_address}\n`;
    message += `• Telepon: ${order.contact || 'N/A'}\n`;
    message += `• STO: ${order.sto}\n\n`;
    
    message += `📅 *Informasi Order:*\n`;
    message += `• Dibuat: ${createdDate}\n`;
    message += `• Dibuat oleh: ${order.created_by_user?.name || 'N/A'}\n`;
    
    if (order.assigned_technician) {
      message += `• Teknisi: ${order.assigned_technician.name}\n`;
    }
    

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error in showSODOrder:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}







// ========================================
// STAGE ASSIGNMENT FUNCTIONS FOR HD
// ========================================

// Pagination dihapus: tampilkan semua order tanpa batasan halaman

async function showOrderSelectionForStageAssignment(chatId, telegramId) {
  try {
    console.log(`🔍 HD ${telegramId} requesting order selection for stage assignment`);
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get all active orders (no pagination)
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_id,
        customer_name,
        status,
        sto,
        transaction_type,
        service_type,
        created_at
      `)
      .in('status', ['Pending', 'In Progress', 'On Hold'])
      .order('created_at', { ascending: false })
      ;

    if (error) {
      console.error('❌ Error fetching orders:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, '📋 Tidak ada order aktif yang tersedia untuk assignment teknisi per stage.');
      return;
    }

    let message = '👥 **Pilih Order untuk Assignment Teknisi per Stage**\n\n';
    message += 'Pilih order yang ingin Anda assign teknisi untuk setiap stage:\n\n';
    // Menampilkan semua order aktif tanpa halaman

    const keyboard = [];
    
    orders.forEach((order, index) => {
      const statusEmoji = getStatusEmoji(order.status);
      const orderInfo = `${order.order_id} - ${order.customer_name}`;
      const shortInfo = orderInfo.length > 35 ? orderInfo.substring(0, 32) + '...' : orderInfo;
      
      keyboard.push([{
        text: `${statusEmoji} ${shortInfo}`,
        callback_data: `stage_assign_order_${index}`
      }]);
    });

    // Tidak ada kontrol pagination

    // Add back button
    // keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'back_to_main' }]);

    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      },
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('💥 Error in showOrderSelectionForStageAssignment:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

async function showStageAssignmentMenu(chatId, telegramId, orderId) {
  try {
    console.log(`🔍 HD ${telegramId} viewing stage assignment for order ${orderId}`);
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get order index for callback data
    const { data: orders } = await supabase
      .from('orders')
      .select('order_id')
      .in('status', ['Pending', 'In Progress', 'On Hold'])
      .order('created_at', { ascending: false });
    
    const orderIndex = orders ? orders.findIndex(order => order.order_id === orderId) : -1;
    
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_id,
        customer_name,
        status,
        sto,
        transaction_type,
        service_type
      `)
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      console.error('❌ Error fetching order:', orderError);
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Get existing stage assignments (fix: use string order_id for consistency)
    const { data: assignments, error: assignError } = await supabase
      .from('order_stage_assignments')
      .select(`
        stage,
        assigned_technician,
        status,
        assigned_at,
        users!assigned_technician(name)
      `)
      .eq('order_id', order.order_id);

    if (assignError) {
      console.error('❌ Error fetching assignments:', assignError);
    }

    // Create assignment map for easy lookup
    const assignmentMap = {};
    if (assignments) {
      assignments.forEach(assignment => {
        assignmentMap[assignment.stage] = assignment;
      });
    }

    const stages = ['Survey', 'Penarikan', 'P2P', 'Instalasi', 'Evidence'];
    
    // Fetch progress data from progress_new (source of stage status)
    const { data: progressRecord, error: progressError } = await supabase
      .from('progress_new')
      .select('*')
      .eq('order_id', order.order_id)
      .single();
    if (progressError && progressError.code !== 'PGRST116') {
      console.error('❌ Error fetching progress_new:', progressError);
    }
    
    // Map UI stage labels to progress_new JSON keys
    const progressKeyMap = {
      'Survey': 'survey_jaringan',
      'Penarikan': 'penarikan_kabel',
      'P2P': 'p2p',
      'Instalasi': 'instalasi_ont',
      'Evidence': null
    };
    
    let message = `👥 **Assignment Teknisi per Stage**\n\n`;
    message += `📋 **Order:** ${order.order_id}\n`;
    message += `👤 **Customer:** ${order.customer_name}\n`;
    message += `📍 **STO:** ${order.sto}\n`;
    message += `🔄 **Status:** ${order.status}\n\n`;
    message += `**Status Assignment per Stage:**\n\n`;

    const keyboard = [];
    
    stages.forEach(stage => {
      const stageEmoji = getStageEmoji(stage);
      const assignment = assignmentMap[stage];
      const key = progressKeyMap[stage];
      
      // Derive status from progress_new if available
      let statusText = 'Belum di-assign';
      let statusEmoji = '⚪';
      if (key && progressRecord && progressRecord[key]) {
        const st = progressRecord[key]?.status;
        if (st) {
          statusEmoji = getProgressStatusEmoji(st);
          statusText = st;
        } else {
          statusText = 'Belum ada progress';
        }
      } else if (key === null) {
        statusText = 'Belum ada progress';
      }
      
      if (assignment) {
        const techName = assignment.users?.name || 'Unknown';
        message += `${stageEmoji} **${stage}:** ${statusEmoji} ${statusText} • ${techName}\n`;
        keyboard.push([{
          text: `🔄 Reassign ${stage}`,
          callback_data: `reassign_stage_${orderId}_${stage}`
        }]);
      } else {
        message += `${stageEmoji} **${stage}:** ${statusEmoji} ${statusText}\n`;
        keyboard.push([{
          text: `➕ Assign ${stage}`,
          callback_data: `assign_stage_${orderId}_${stage}`
        }]);
      }
    });

    // Add action buttons
    keyboard.push([
      { text: '👥 Assign Semua ke Teknisi Sama', callback_data: `assign_all_same_${orderId}` }
    ]);
    keyboard.push([
      { text: '🔙 Kembali ke Daftar Order', callback_data: 'assign_technician_stage' }
    ]);
    // keyboard.push([
    //   { text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_main' }
    // ]);

    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      },
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('💥 Error in showStageAssignmentMenu:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

// Function to show technician selection for a specific stage
async function showTechnicianSelectionForStage(chatId, telegramId, orderId, stage) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    console.log('🔍 Searching for order with orderId:', orderId);
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, customer_name, sto')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      console.error('❌ Error fetching order:', orderError);
      console.error('❌ OrderId that failed:', orderId);
      
      // Try to find if order exists with different query
      const { data: allOrders, error: allError } = await supabase
        .from('orders')
        .select('order_id, customer_name, sto')
        .limit(10);
      
      console.log('📋 Available orders in database:', allOrders);
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Fetch technicians mapped to the order STO
    let technicians = [];
    const { data: mappings, error: mapError } = await supabase
      .from('technician_sto')
      .select('user_id')
      .eq('sto', order.sto);

    if (mapError) {
      console.error('❌ Error fetching technician_sto:', mapError);
    }

    if (mappings && mappings.length > 0) {
      const userIds = mappings.map(m => m.user_id).filter(Boolean);
      const { data: stoTechnicians, error: techError } = await supabase
        .from('users')
        .select('telegram_id, name, id')
        .eq('role', 'Teknisi')
        .in('id', userIds)
        .order('name');
      if (techError) {
        console.error('❌ Error fetching technicians by STO:', techError);
      } else {
        technicians = stoTechnicians || [];
      }
    }

    // Fallback: if no technicians for STO, show all technicians (avoid empty list)
    if (!technicians || technicians.length === 0) {
      const { data: allTechs, error: allTechsErr } = await supabase
        .from('users')
        .select('telegram_id, name')
        .eq('role', 'Teknisi')
        .order('name');
      if (allTechsErr) {
        console.error('❌ Error fetching all technicians:', allTechsErr);
        bot.sendMessage(chatId, '❌ Gagal mengambil data teknisi. Silakan coba lagi.');
        return;
      }
      technicians = allTechs || [];
    }

    const stageEmoji = getStageEmoji(stage);
    let message = `👥 **Pilih Teknisi untuk ${stage}**\n\n`;
    message += `📋 **Order:** ${order.order_id}\n`;
    message += `👤 **Customer:** ${order.customer_name}\n`;
    message += `📍 **STO:** ${order.sto}\n`;
    message += `${stageEmoji} **Stage:** ${stage}\n\n`;
    message += `Pilih teknisi yang akan di-assign untuk stage ini:`;

    const keyboard = [];
    
    // Add technician buttons (max 2 per row)
    for (let i = 0; i < technicians.length; i += 2) {
      const row = [];
      
      row.push({
        text: `👤 ${technicians[i].name}`,
        callback_data: `select_tech_for_stage_${orderId}_${stage}_${technicians[i].telegram_id}`
      });
      
      if (i + 1 < technicians.length) {
        row.push({
          text: `👤 ${technicians[i + 1].name}`,
          callback_data: `select_tech_for_stage_${orderId}_${stage}_${technicians[i + 1].telegram_id}`
        });
      }
      
      keyboard.push(row);
    }

    // Add back button
    keyboard.push([
      { text: '🔙 Kembali ke Assignment Menu', callback_data: `back_to_assignment_list` }
    ]);
    // keyboard.push([
    //   { text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_main' }
    // ]);

    const options = {
      reply_markup: {
        inline_keyboard: keyboard
      },
      parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, message, options);

  } catch (error) {
    console.error('❌ Error in showTechnicianSelectionForStage:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Function to assign technician to a specific stage
async function assignTechnicianToStage(chatId, telegramId, orderId, stage, techId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get technician details
    const { data: technician, error: techError } = await supabase
      .from('users')
      .select('name, telegram_id')
      .eq('telegram_id', techId)
      .single();

    if (techError || !technician) {
      console.error('❌ Error fetching technician:', techError);
      bot.sendMessage(chatId, '❌ Teknisi tidak ditemukan.');
      return;
    }

    // First get the order UUID from order_id string
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_id, customer_name, sto')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      console.error('❌ Error fetching order:', orderError);
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Check if assignment already exists using the order_id string
    const { data: existingAssignment, error: checkError } = await supabase
      .from('order_stage_assignments')
      .select('id')
      .eq('order_id', order.order_id)  // Use string order_id
      .eq('stage', stage)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking existing assignment:', checkError);
      bot.sendMessage(chatId, '❌ Gagal memeriksa assignment yang ada.');
      return;
    }

    if (existingAssignment) {
      // Update existing assignment
      const { error: updateError } = await supabase
        .from('order_stage_assignments')
        .update({
          assigned_technician: techId,
          assigned_by: telegramId,
          assigned_at: new Date().toISOString(),
          status: 'assigned'
        })
        .eq('id', existingAssignment.id);

      if (updateError) {
        console.error('❌ Error updating assignment:', updateError);
        bot.sendMessage(chatId, '❌ Gagal mengupdate assignment.');
        return;
      }
    } else {
      // Create new assignment
      const { error: insertError } = await supabase
        .from('order_stage_assignments')
        .insert({
          order_id: order.order_id,  // Use string order_id
          stage: stage,
          assigned_technician: techId,
          assigned_by: telegramId,
          assigned_at: new Date().toISOString(),
          status: 'assigned'
        });

      if (insertError) {
        console.error('❌ Error creating assignment:', insertError);
        bot.sendMessage(chatId, '❌ Gagal membuat assignment baru.');
        return;
      }
    }

    // Get order details for notification
    const { data: orderDetails, error: orderDetailsError } = await supabase
      .from('orders')
      .select('order_id, customer_name, sto')
      .eq('order_id', orderId)
      .single();

    const stageEmoji = getStageEmoji(stage);
    
    // Send confirmation to HD
    const confirmMessage = `✅ **Assignment Berhasil!**\n\n`;
    const confirmMsg = confirmMessage + 
      `${stageEmoji} **Stage:** ${stage}\n` +
      `👤 **Teknisi:** ${technician.name}\n` +
      `📋 **Order:** ${orderDetails?.order_id || orderId}\n` +
      `👤 **Customer:** ${orderDetails?.customer_name || 'N/A'}\n\n` +
      `Teknisi telah diberi notifikasi.`;

    bot.sendMessage(chatId, confirmMsg, { parse_mode: 'Markdown' });

    // Send notification to assigned technician
    const techMessage = `🔔 **Assignment Baru!**\n\n` +
      `${stageEmoji} **Stage:** ${stage}\n` +
      `📋 **Order:** ${orderDetails?.order_id || orderId}\n` +
      `👤 **Customer:** ${orderDetails?.customer_name || 'N/A'}\n` +
      `📍 **STO:** ${orderDetails?.sto || 'N/A'}\n\n` +
      `Anda telah di-assign untuk menangani stage ini. Silakan cek detail order untuk informasi lebih lanjut.`;

    bot.sendMessage(techId, techMessage, { parse_mode: 'Markdown' });

    // Show updated assignment menu
    setTimeout(() => {
      showStageAssignmentMenu(chatId, telegramId, orderId);
    }, 1000);

  } catch (error) {
    console.error('❌ Error in assignTechnicianToStage:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Function to show technician selection for all stages
async function showTechnicianSelectionForAllStages(chatId, telegramId, orderId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, customer_name, sto')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      console.error('❌ Error fetching order:', orderError);
      bot.sendMessage(chatId, '❌ Order tidak ditemukan.');
      return;
    }

    // Fetch technicians mapped to the order STO
    let technicians = [];
    const { data: mappings, error: mapError } = await supabase
      .from('technician_sto')
      .select('user_id')
      .eq('sto', order.sto);

    if (mapError) {
      console.error('❌ Error fetching technician_sto:', mapError);
    }

    if (mappings && mappings.length > 0) {
      const userIds = mappings.map(m => m.user_id).filter(Boolean);
      const { data: stoTechnicians, error: techError } = await supabase
        .from('users')
        .select('telegram_id, name, id')
        .eq('role', 'Teknisi')
        .in('id', userIds)
        .order('name');
      if (techError) {
        console.error('❌ Error fetching technicians by STO:', techError);
      } else {
        technicians = stoTechnicians || [];
      }
    }

    // Fallback: if no technicians for STO, show all technicians
    if (!technicians || technicians.length === 0) {
      const { data: allTechs, error: allTechsErr } = await supabase
        .from('users')
        .select('telegram_id, name')
        .eq('role', 'Teknisi')
        .order('name');
      if (allTechsErr) {
        console.error('❌ Error fetching all technicians:', allTechsErr);
        bot.sendMessage(chatId, '❌ Gagal mengambil data teknisi. Silakan coba lagi.');
        return;
      }
      technicians = allTechs || [];
    }

    let message = `👥 **Assign Semua Stage ke Teknisi Sama**\n\n`;
    message += `📋 **Order:** ${order.order_id}\n`;
    message += `👤 **Customer:** ${order.customer_name}\n`;
    message += `📍 **STO:** ${order.sto}\n\n`;
    message += `Pilih teknisi yang akan di-assign untuk SEMUA stage:`;

    const keyboard = [];
    
    // Add technician buttons (max 2 per row)
    for (let i = 0; i < technicians.length; i += 2) {
      const row = [];
      
      row.push({
        text: `👤 ${technicians[i].name}`,
        callback_data: `assign_all_tech_${orderId}_${technicians[i].telegram_id}`
      });
      
      if (i + 1 < technicians.length) {
        row.push({
          text: `👤 ${technicians[i + 1].name}`,
          callback_data: `assign_all_tech_${orderId}_${technicians[i + 1].telegram_id}`
        });
      }
      
      keyboard.push(row);
    }

    // Add back button
    keyboard.push([
      { text: '🔙 Kembali ke Assignment Menu', callback_data: `back_to_assignment_list` }
    ]);

    const options = {
      reply_markup: {
        inline_keyboard: keyboard
      },
      parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, message, options);

  } catch (error) {
    console.error('❌ Error in showTechnicianSelectionForAllStages:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Function to assign technician to all stages
async function assignTechnicianToAllStages(chatId, telegramId, orderId, techId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get technician details
    const { data: technician, error: techError } = await supabase
      .from('users')
      .select('name, telegram_id')
      .eq('telegram_id', techId)
      .single();

    if (techError || !technician) {
      console.error('❌ Error fetching technician:', techError);
      bot.sendMessage(chatId, '❌ Teknisi tidak ditemukan.');
      return;
    }

    const stages = ['Survey', 'Penarikan', 'P2P', 'Instalasi', 'Evidence'];
    let successCount = 0;
    let errorCount = 0;

    // Process each stage
    for (const stage of stages) {
      try {
        // Check if assignment already exists
        const { data: existingAssignment, error: checkError } = await supabase
          .from('order_stage_assignments')
          .select('id')
          .eq('order_id', orderId)
          .eq('stage', stage)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          console.error(`❌ Error checking existing assignment for ${stage}:`, checkError);
          errorCount++;
          continue;
        }

        if (existingAssignment) {
          // Update existing assignment
          const { error: updateError } = await supabase
            .from('order_stage_assignments')
            .update({
              assigned_technician: techId,
              assigned_by: telegramId,
              assigned_at: new Date().toISOString(),
              status: 'assigned'
            })
            .eq('id', existingAssignment.id);

          if (updateError) {
            console.error(`❌ Error updating assignment for ${stage}:`, updateError);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          // Create new assignment
          const { error: insertError } = await supabase
            .from('order_stage_assignments')
            .insert({
              order_id: orderId,
              stage: stage,
              assigned_technician: techId,
              assigned_by: telegramId,
              assigned_at: new Date().toISOString(),
              status: 'assigned'
            });

          if (insertError) {
            console.error(`❌ Error creating assignment for ${stage}:`, insertError);
            errorCount++;
          } else {
            successCount++;
          }
        }
      } catch (stageError) {
        console.error(`❌ Error processing stage ${stage}:`, stageError);
        errorCount++;
      }
    }

    // Get order details for notification
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, customer_name, sto')
      .eq('order_id', orderId)
      .single();

    // Send confirmation to HD
    let confirmMessage = `✅ **Bulk Assignment Selesai!**\n\n`;
    confirmMessage += `👤 **Teknisi:** ${technician.name}\n`;
    confirmMessage += `📋 **Order:** ${order?.order_id || orderId}\n`;
    confirmMessage += `👤 **Customer:** ${order?.customer_name || 'N/A'}\n\n`;
    confirmMessage += `📊 **Hasil:**\n`;
    confirmMessage += `✅ Berhasil: ${successCount} stage\n`;
    if (errorCount > 0) {
      confirmMessage += `❌ Gagal: ${errorCount} stage\n`;
    }
    confirmMessage += `\nTeknisi telah diberi notifikasi.`;

    bot.sendMessage(chatId, confirmMessage, { parse_mode: 'Markdown' });

    // Send notification to assigned technician
    const techMessage = `🔔 **Bulk Assignment Baru!**\n\n` +
      `👤 **Teknisi:** ${technician.name}\n` +
      `📋 **Order:** ${order?.order_id || orderId}\n` +
      `👤 **Customer:** ${order?.customer_name || 'N/A'}\n` +
      `📍 **STO:** ${order?.sto || 'N/A'}\n\n` +
      `Anda telah di-assign untuk menangani SEMUA stage dalam order ini. Silakan cek detail order untuk informasi lebih lanjut.`;

    bot.sendMessage(techId, techMessage, { parse_mode: 'Markdown' });

    // Show updated assignment menu
    setTimeout(() => {
      showStageAssignmentMenu(chatId, telegramId, orderId);
    }, 1000);

  } catch (error) {
    console.error('❌ Error in assignTechnicianToAllStages:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
  }
}

// Helper function to get stage emoji
function getStageEmoji(stage) {
  const emojiMap = {
    'Survey': '📋',
    'Penarikan': '🔌',
    'P2P': '🔗',
    'Instalasi': '🔧',
    'Evidence': '📸'
  };
  return emojiMap[stage] || '📝';
}

// Helper function to get stage status emoji
function getStageStatusEmoji(status) {
  const emojiMap = {
    'assigned': '👤',
    'in_progress': '🔄',
    'completed': '✅',
    'pending': '⏳'
  };
  return emojiMap[status] || '⚪';
}

// ========================================
// NEW MENU FUNCTIONS FOR HD
// ========================================

// Function to show orders that are on progress
async function showOrderOnProgress(chatId, telegramId) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get orders that are not completed (e2e_timestamp is null)
  const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        *,
        assigned_technician:users!orders_assigned_technician_fkey(name, telegram_id),
        created_by_user:users!orders_created_by_fkey(name)
      `)
      .is('e2e_timestamp', null)
      .order('order_id', { ascending: true })
      ;

    if (error) {
      console.error('Error fetching orders on progress:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, 
        '📊 ORDER ON PROGRESS\n\n' +
        'Tidak ada order yang sedang dalam progress.\n\n' +
        '✅ Semua order sudah completed.'
      );
      return;
    }

    let message = '📊 ORDER ON PROGRESS\n\n';
    message += `Total: ${orders.length} order sedang dalam progress\n\n`;

    orders.forEach((order, index) => {
      const statusEmoji = getStatusEmoji(order.status);
      const createdDate = formatIndonesianDateTime(order.created_at);
      const sodDate = order.sod_timestamp ? formatIndonesianDateTime(order.sod_timestamp) : '';
      
      message += `${index + 1}. ${order.order_id}/${order.customer_name}\n`;
      message += `Status: ${statusEmoji} ${order.status}\n`;
      message += `STO: ${order.sto || ''}\n`;
      message += `Type: ${order.transaction_type || ''}\n`;
      message += `Layanan: ${order.service_type || ''}\n`;
      message += `Dibuat: ${createdDate}\n`;
      message += `SOD: ${sodDate}\n\n`;
    });

    // Split message if too long
    if (message.length > 4000) {
      const messages = splitLongMessage(message);
      for (const msg of messages) {
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      }
    } else {
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    console.error('Error in showOrderOnProgress:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

// Function to show menu for completed orders by month
async function showOrderCompletedMenu(chatId, telegramId) {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    let message = '✅ ORDER COMPLETED\n\n';
    message += 'Pilih bulan untuk melihat order yang sudah completed:\n\n';

    const keyboard = [];
    
    // Generate last 6 months including current month
    for (let i = 0; i < 2; i++) {
      const date = new Date(currentYear, currentMonth - 1 - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthName = date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      
      keyboard.push([{
        text: `📅 ${monthName}`,
        callback_data: `completed_month_${month.toString().padStart(2, '0')}_${year}`
      }]);
    }

    keyboard.push([{
      text: '🔙 Kembali ke Menu Utama',
      callback_data: 'back_to_main'
    }]);

    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Error in showOrderCompletedMenu:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

// Function to show completed orders for specific month
async function showOrderCompletedByMonth(chatId, telegramId, year, month) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get completed orders for the specified month (orders with e2e_timestamp)
  const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        *,
        assigned_technician:users!orders_assigned_technician_fkey(name, telegram_id),
        created_by_user:users!orders_created_by_fkey(name)
      `)
      .not('e2e_timestamp', 'is', null)
      .gte('e2e_timestamp', startDate.toISOString())
      .lte('e2e_timestamp', endDate.toISOString())
      .order('order_id', { ascending: true })
      ;

    if (error) {
      console.error('Error fetching completed orders:', error);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data order.');
      return;
    }

    const monthName = startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    if (!orders || orders.length === 0) {
      bot.sendMessage(chatId, 
        `✅ ORDER COMPLETED - ${monthName}\n\n` +
        'Tidak ada order yang completed pada bulan ini.'
      );
      return;
    }

    let message = `✅ ORDER COMPLETED - ${monthName}\n\n`;
    message += `Total: ${orders.length} order completed\n\n`;

    orders.forEach((order, index) => {
      const completedDate = formatIndonesianDateTime(order.e2e_timestamp);
      const createdDate = formatIndonesianDateTime(order.created_at);
      const sodDate = order.sod_timestamp ? formatIndonesianDateTime(order.sod_timestamp) : '';
      
      message += `${index + 1}.📋 ${order.order_id}/${order.customer_name}\n`;
      message += `Status: ✅ Completed\n`;
      message += `STO: ${order.sto || ''}\n`;
      message += `Type: ${order.transaction_type || ''}\n`;
      message += `Layanan: ${order.service_type || ''}\n`;
      message += `Dibuat: ${createdDate}\n`;
      message += `SOD: ${sodDate}\n`;
      message += `E2E: ${completedDate}\n\n`;
    });

    // Add back button
    const keyboard = [[{
      text: '🔙 Kembali ke Menu Bulan',
      callback_data: 'back_to_completed_menu'
    }]];

    // Split message if too long
    if (message.length > 4000) {
      const messages = splitLongMessage(message);
      for (let i = 0; i < messages.length; i++) {
        const options = { parse_mode: 'Markdown' };
        if (i === messages.length - 1) {
          options.reply_markup = { inline_keyboard: keyboard };
        }
        await bot.sendMessage(chatId, messages[i], options);
      }
    } else {
      bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    }

  } catch (error) {
    console.error('Error in showOrderCompletedByMonth:', error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem.');
  }
}

// Helper function to split long messages
function splitLongMessage(message, maxLength = 4000) {
  const messages = [];
  let currentMessage = '';
  const lines = message.split('\n');
  
  for (const line of lines) {
    if ((currentMessage + line + '\n').length > maxLength) {
      if (currentMessage) {
        messages.push(currentMessage.trim());
        currentMessage = '';
      }
    }
    currentMessage += line + '\n';
  }
  
  if (currentMessage.trim()) {
    messages.push(currentMessage.trim());
  }
  
  return messages;
}

// Helper function to validate message before sending
function validateMessage(text) {
  if (typeof text !== 'string') {
    return '❌ Pesan tidak valid';
  }
  
  const trimmedText = text.trim();
  if (trimmedText === '' || trimmedText === '.' || trimmedText === ' ') {
    return '📋 Menu';
  }
  
  return trimmedText;
}

// Safe sendMessage wrapper
function safeSendMessage(bot, chatId, text, options = {}) {
  const validatedText = validateMessage(text);
  return bot.sendMessage(chatId, validatedText, options);
}

// Handle errors
bot.on('error', (error) => {
  console.error('❌ Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});

console.log('✅ Complete bot started successfully!');
console.log('📱 Send /start to your bot to test');
