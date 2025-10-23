import { supabaseAdmin } from './supabase'
import axios from 'axios'

export async function uploadPhotoToSupabase(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  try {
    // Upload file to Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from('evidence-photos')
      .upload(fileName, fileBuffer, {
        contentType: mimeType,
        upsert: true
      })

    if (error) {
      throw error
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('evidence-photos')
      .getPublicUrl(data.path)

    return urlData.publicUrl
  } catch (error) {
    console.error('Error uploading to Supabase Storage:', error)
    throw error
  }
}

export async function downloadPhotoFromTelegram(fileUrl: string): Promise<Buffer> {
  try {
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${process.env.TELEGRAM_BOT_TOKEN}`
      }
    })
    
    return Buffer.from(response.data)
  } catch (error) {
    console.error('Error downloading from Telegram:', error)
    throw error
  }
}
