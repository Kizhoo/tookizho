export default async function handler(req, res) {
  // Set CORS headers untuk development
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Hanya terima POST request
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Hanya metode POST yang diizinkan'
    });
  }

  // Debug logging
  console.log('📩 API DIPANGGIL:', {
    method: req.method,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body || {})
  });

  try {
    const { username, message, photos } = req.body;

    // VALIDASI INPUT
    if (!username || username.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDASI_ERROR',
        field: 'username',
        message: 'Nama tidak boleh kosong'
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDASI_ERROR',
        field: 'message',
        message: 'Pesan tidak boleh kosong'
      });
    }

    // CEK ENVIRONMENT VARIABLES
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const OWNER_ID = process.env.OWNER_ID;

    console.log('🔐 Cek Environment Variables:', {
      BOT_TOKEN_SET: !!BOT_TOKEN,
      OWNER_ID_SET: !!OWNER_ID
    });

    if (!BOT_TOKEN || !OWNER_ID) {
      console.error('❌ ERROR: Environment variables tidak ditemukan');
      return res.status(500).json({
        success: false,
        error: 'CONFIGURATION_ERROR',
        message: 'Server tidak dikonfigurasi dengan benar',
        details: !BOT_TOKEN ? 'BOT_TOKEN tidak ditemukan' : 'OWNER_ID tidak ditemukan',
        solution: 'Silakan hubungi administrator untuk mengatur environment variables'
      });
    }

    // KIRIM KE TELEGRAM
    if (photos && photos.length > 0) {
      console.log(`📷 Mengirim ${photos.length} foto dengan pesan...`);
      
      // Kirim foto pertama dengan caption lengkap
      const firstPhoto = photos[0];
      const caption = `📨 **PESAN BARU DARI TO-KIZHOO**\n\n👤 **Nama:** ${username}\n💬 **Pesan:** ${message}\n\n🕒 **Dikirim:** ${new Date().toLocaleString('id-ID')}`;
      
      try {
        await sendPhoto(firstPhoto, caption, BOT_TOKEN, OWNER_ID);
        console.log('✅ Foto pertama terkirim');
      } catch (photoError) {
        console.error('❌ Gagal mengirim foto:', photoError.message);
        // Coba kirim pesan teks saja jika foto gagal
        await sendText(caption, BOT_TOKEN, OWNER_ID);
      }
      
      // Kirim foto-foto lainnya (jika ada) tanpa caption panjang
      for (let i = 1; i < photos.length; i++) {
        try {
          await sendPhoto(photos[i], `📸 Foto ${i + 1} dari ${username}`, BOT_TOKEN, OWNER_ID);
          console.log(`✅ Foto ${i + 1} terkirim`);
          // Delay antar foto untuk hindari rate limit
          if (i < photos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error) {
          console.error(`❌ Foto ${i + 1} gagal:`, error.message);
          // Lanjut ke foto berikutnya meski ada error
          continue;
        }
      }
    } else {
      // Kirim pesan teks saja
      console.log('📝 Mengirim pesan teks saja...');
      const text = `📨 **PESAN BARU DARI TO-KIZHOO**\n\n👤 **Nama:** ${username}\n💬 **Pesan:** ${message}\n\n🕒 **Dikirim:** ${new Date().toLocaleString('id-ID')}\n\n💝 *Pesan ini dikirim melalui To-Kizhoo*`;
      await sendText(text, BOT_TOKEN, OWNER_ID);
    }

    // LOG SUKSES
    console.log(`✅ PESAN TERKIRIM dari: ${username}`);
    
    return res.status(200).json({
      success: true,
      message: 'Pesan berhasil dikirim ke Telegram!',
      timestamp: new Date().toISOString(),
      sender: username
    });

  } catch (error) {
    // ERROR HANDLING DETAIL
    console.error('🔥 ERROR DETAIL:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    // Deteksi jenis error
    let errorType = 'UNKNOWN_ERROR';
    let errorMessage = 'Gagal mengirim pesan. Silakan coba lagi.';
    let solution = 'Coba beberapa menit lagi atau hubungi administrator.';
    let statusCode = 500;

    if (error.message.includes('fetch failed') || error.message.includes('NetworkError')) {
      errorType = 'NETWORK_ERROR';
      errorMessage = 'Tidak dapat terhubung ke Telegram API.';
      solution = 'Periksa koneksi internet atau coba lagi nanti.';
    } 
    else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorType = 'BOT_TOKEN_INVALID';
      errorMessage = 'Token Bot Telegram tidak valid!';
      solution = 'Periksa BOT_TOKEN di environment variables.';
      statusCode = 401;
    }
    else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      errorType = 'BOT_BLOCKED';
      errorMessage = 'Bot diblokir atau tidak memiliki akses!';
      solution = 'Pastikan bot sudah di-start dan tidak diblokir oleh pengguna.';
      statusCode = 403;
    }
    else if (error.message.includes('400') && error.message.includes('chat not found')) {
      errorType = 'CHAT_ID_INVALID';
      errorMessage = 'ID Chat tidak valid!';
      solution = 'Periksa OWNER_ID di environment variables. Pastikan ID benar.';
      statusCode = 400;
    }
    else if (error.message.includes('400')) {
      errorType = 'BAD_REQUEST';
      errorMessage = 'Permintaan tidak valid ke Telegram API.';
      solution = 'Format data mungkin salah. Hubungi developer.';
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      error: errorType,
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      solution: solution,
      timestamp: new Date().toISOString()
    });
  }
}

// FUNGSI BANTU: Kirim pesan teks ke Telegram
async function sendText(text, botToken, chatId) {
  console.log('🤖 Mengirim teks ke Telegram...');
  
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('❌ Telegram API Error:', errorData);
    throw new Error(`Telegram API Error ${response.status}: ${JSON.stringify(errorData)}`);
  }

  const result = await response.json();
  console.log('✅ Telegram Response:', result.ok);
  return result;
}

// FUNGSI BANTU: Kirim foto ke Telegram
async function sendPhoto(photoBase64, caption, botToken, chatId) {
  console.log('🖼️ Mengirim foto ke Telegram...');
  
  // Validasi base64
  if (!photoBase64 || !photoBase64.includes('base64,')) {
    throw new Error('Format base64 tidak valid');
  }

  const base64Data = photoBase64.split(';base64,').pop();
  if (!base64Data || base64Data.length < 100) {
    throw new Error('Data base64 terlalu pendek');
  }

  const buffer = Buffer.from(base64Data, 'base64');
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('parse_mode', 'Markdown');
  formData.append('photo', new Blob([buffer]), `photo_${Date.now()}.jpg`);

  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('❌ Telegram Photo API Error:', errorData);
    throw new Error(`Telegram Photo API Error ${response.status}: ${JSON.stringify(errorData)}`);
  }

  const result = await response.json();
  console.log('✅ Telegram Photo Response:', result.ok);
  return result;
  }
