# Telegram Order Management Bot

Bot Telegram untuk manajemen order instalasi/aktivasi layanan dengan role-based access (Helpdesk dan Teknisi).

## 🚀 Fitur Utama

### Untuk Helpdesk (HD)
- ✅ Membuat order baru dengan data pelanggan
- ✅ Assign teknisi ke order
- ✅ Input waktu SOD (Start of Delivery) dan E2E (End to End)
- ✅ Update status order (LME PT2, dll)
- ✅ Monitoring SLA (3x24 jam compliance)
- ✅ Generate laporan harian/mingguan
- ✅ Dashboard admin untuk manajemen users

### Untuk Teknisi
- ✅ Notifikasi order baru
- ✅ Update progress instalasi (Survey, Penarikan, P2P, Instalasi)
- ✅ Upload evidence lengkap (9 jenis foto + data)
- ✅ Validasi otomatis evidence sebelum close order
- ✅ Monitoring status order real-time

### Sistem Monitoring
- ✅ SLA monitoring dengan reminder otomatis
- ✅ Progress reminder jika teknisi tidak update dalam 2 jam
- ✅ Notifikasi SLA exceeded ke HD dan Teknisi

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **File Storage**: Supabase Storage
- **Bot Framework**: node-telegram-bot-api
- **Monitoring**: Cron jobs untuk SLA tracking

## 📋 Database Schema

### Users
- `id` (UUID) - Primary key
- `telegram_id` (string) - Telegram user ID
- `role` (HD/Teknisi) - User role
- `name` (string) - User name
- `created_at`, `updated_at` - Timestamps

### Orders
- `id` (UUID) - Primary key
- `customer_name`, `customer_address`, `contact` - Customer data
- `assigned_technician` (FK) - Assigned technician
- `status` (Pending/In Progress/On Hold/Completed/Closed)
- `sod_time`, `e2e_time` - Service times
- `lme_pt2_start`, `lme_pt2_end` - LME PT2 times
- `sla_deadline` - Calculated SLA deadline
- `created_at`, `updated_at` - Timestamps

### Progress
- `id` (UUID) - Primary key
- `order_id` (FK) - Related order
- `stage` (Survey/Penarikan/P2P/Instalasi/Catatan)
- `status` (Ready/Not Ready/Selesai)
- `note` (optional) - Additional notes
- `timestamp` - When progress was updated

### Evidence
- `id` (UUID) - Primary key
- `order_id` (FK) - Related order
- `odp_name`, `ont_sn` - Equipment data
- `photo_*` - URLs to photos stored in Supabase Storage
- `uploaded_at` - Upload timestamp

## 🔧 Setup & Installation

### 1. Clone Repository
```bash
git clone <repository-url>
cd telegram-order-bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `env.example` to `.env.local` and fill in the values:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WEBHOOK_URL=your_webhook_url

# File Storage Configuration
# Foto akan disimpan di Supabase Storage bucket 'evidence-photos'
# Tidak perlu konfigurasi tambahan

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Database Setup
1. Create a new Supabase project
2. Run the SQL schema from `supabase-schema.sql`
3. Enable Row Level Security (RLS) policies

### 5. Supabase Storage Setup
1. Storage bucket 'evidence-photos' akan dibuat otomatis melalui SQL schema
2. Tidak perlu konfigurasi tambahan untuk file storage

### 6. Telegram Bot Setup
1. Create a new bot with @BotFather
2. Get the bot token
3. Set webhook URL to your deployed app

### 7. Run Development Server
```bash
npm run dev
```

### 8. Initialize Services
Visit `/api/init` to start SLA monitoring cron jobs.

## 📱 Bot Commands

### Helpdesk Commands
- `/start` - Start bot dan tampilkan menu
- `/help` - Panduan penggunaan
- `/order` - Buat order baru
- `/myorders` - Lihat semua order
- `/report` - Generate laporan

### Teknisi Commands
- `/start` - Start bot dan tampilkan menu
- `/help` - Panduan penggunaan
- `/myorders` - Lihat order yang ditugaskan

## 🔄 Order Flow

1. **HD membuat order** → Input data pelanggan → Assign teknisi → Set SOD/E2E
2. **Bot notifikasi teknisi** → Order baru ditugaskan
3. **Teknisi survey** → Ready/Not Ready
   - Ready → Lanjut ke Penarikan Kabel → P2P → Instalasi ONT
   - Not Ready → Order On Hold → HD input LME PT2
4. **Teknisi upload evidence** → 9 jenis foto + data ODP/SN
5. **Bot validasi evidence** → Jika lengkap → Order Closed

## 📊 Evidence Requirements

Order hanya bisa ditutup jika semua evidence lengkap:

1. ✅ Nama ODP
2. ✅ SN ONT
3. ✅ Foto SN ONT
4. ✅ Foto teknisi + pelanggan
5. ✅ Foto rumah pelanggan
6. ✅ Foto depan ODP
7. ✅ Foto dalam ODP
8. ✅ Foto label DC
9. ✅ Foto hasil test redaman di ODP

## ⏰ SLA Monitoring

- **SLA Deadline**: 3x24 jam dari SOD time
- **Reminder**: 2 jam sebelum deadline
- **Alert**: Jika melewati deadline
- **Progress Reminder**: Jika teknisi tidak update dalam 2 jam

## 🚀 Deployment

### Vercel (Recommended)
1. Push code to GitHub
2. Connect to Vercel
3. Set environment variables
4. Deploy

### Other Platforms
- Ensure Node.js 18+ support
- Set up environment variables
- Configure webhook URL
- Run `/api/init` after deployment

## 📈 Monitoring & Analytics

- Real-time order status tracking
- SLA compliance monitoring
- Progress tracking per stage
- Evidence completion tracking
- Automated notifications

## 🔒 Security

- Row Level Security (RLS) di Supabase
- Role-based access control
- Secure file upload ke Google Drive
- Webhook signature validation

## 🐛 Troubleshooting

### Common Issues
1. **Webhook not working**: Check bot token and webhook URL
2. **Database connection**: Verify Supabase credentials
3. **File upload fails**: Check Google Drive API setup
4. **SLA monitoring**: Ensure cron jobs are running

### Logs
Check console logs for detailed error messages and debugging information.

## 📞 Support

Untuk bantuan teknis atau pertanyaan, silakan hubungi tim development.

---

**Version**: 1.0.0  
**Last Updated**: December 2023
