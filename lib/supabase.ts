import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client untuk frontend
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client untuk backend operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Database types
export interface User {
  id: string
  telegram_id: string
  role: 'HD' | 'Teknisi'
  name: string
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  customer_name: string
  customer_address: string
  contact: string
  assigned_technician: string
  status: 'Pending' | 'In Progress' | 'On Hold' | 'Completed' | 'Closed'
  sod_time?: string
  e2e_time?: string
  lme_pt2_start?: string
  lme_pt2_end?: string
  sla_deadline?: string
  created_at: string
  updated_at: string
}

export interface Progress {
  id: string
  order_id: string
  stage: 'Survey' | 'Penarikan' | 'P2P' | 'Instalasi' | 'Catatan'
  status: 'Ready' | 'Not Ready' | 'Selesai'
  note?: string
  timestamp: string
}

export interface Evidence {
  id: string
  order_id: string
  odp_name?: string
  ont_sn?: string
  photo_sn_ont?: string
  photo_technician_customer?: string
  photo_customer_house?: string
  photo_odp_front?: string
  photo_odp_inside?: string
  photo_label_dc?: string
  photo_test_result?: string
  uploaded_at: string
}
