# Bot Telegram Order — Dokumentasi Pengguna

## Gambaran Umum
- Mengelola order layanan: buat, assign, progress, SOD/E2E, evidence, close.
- Menu inline meminimalkan kesalahan input dan memandu langkah-langkah.

## Peran & Akses
- **HD (Head Desk)**: buat order, assign, update SOD/LME PT2/E2E.
- **Teknisi**: catat progress per stage, unggah evidence penutupan.

## Menu Utama
### Untuk HD
- 📋 Buat Order Baru
- 📊 Lihat Semua Order
- 🔍 Cek Order
- ⚙️ Update Status Order
- 👥 Assign Teknisi per Stage
- 🚀 Update SOD
- 🎯 Update E2E
- ❓ Bantuan

### Untuk Teknisi
- 📝 Update Progress
- 📸 Upload Evidence
- ❓ Bantuan

## Istilah Penting
- **SOD**: Mulai pekerjaan; memulai perhitungan TTI (72 jam).
- **LME PT2**: Jaringan siap dikerjakan teknisi.
- **E2E**: Pekerjaan selesai end-to-end.
- **TTI Comply**: ≤72 jam dari SOD→E2E = Comply; >72 jam = Not Comply.

## Alur Kerja Standar
1. HD membuat order dan assign teknisi (langsung/per stage).
2. HD set SOD (aktifkan TTI, tentukan deadline 72 jam).
3. Teknisi update progress tiap stage.
4. HD set E2E (hitung otomatis Comply/Not Comply dan Durasi Aktual).
5. Teknisi upload 7 foto evidence; status menjadi **Closed** setelah lengkap.

## Fitur Utama
### Buat & Assign Order
- Isi data pelanggan, layanan, STO, dsb.
- Assign teknisi per stage: Survey, Penarikan, Instalasi, P2P, Evidence.
- Notifikasi LME PT2: teknisi diberi tahu saat jaringan siap.

### Update SOD
- Set waktu SOD (WIB).
- **TTI Status**: In Progress sejak SOD.
- **TTI Deadline**: 72 jam dari SOD.

### Update E2E
- Set waktu E2E (WIB).
- Hitung otomatis **TTI Comply**: ≤72 jam → Comply; >72 jam → Not Comply.
- **Durasi Aktual**: waktu SOD→E2E dengan format ramah dibaca.

### Update Progress (Teknisi)
- Catat status tiap stage: Survey, Penarikan Kabel, Instalasi ONT, P2P.
- Isi catatan ringkas saat perlu.
- Survey Ready akan mengubah order ke **In Progress**.

### Upload Evidence (Teknisi)
- Isi **ODP Name** dan **SN ONT** terlebih dahulu.
- Unggah 7 foto berurutan:
  1. Foto SN ONT
  2. Foto Teknisi + Pelanggan
  3. Foto Rumah Pelanggan
  4. Foto Depan ODP
  5. Foto Dalam ODP
  6. Foto Label DC
  7. Foto Test Redaman
- Bot mendeteksi duplikat dan memberi instruksi foto berikutnya.
- Setelah 7 foto lengkap → order **Closed** dan hilang dari daftar teknisi.

## Status Order
- **Pending**: order baru, menunggu progres.
- **In Progress**: pekerjaan berjalan (mis. Survey Ready).
- **On Hold**: pekerjaan tertunda.
- **Completed**: E2E sudah diset (selesai secara bisnis).
- **Closed**: evidence lengkap, order ditutup.

## TTI Comply
- **Deadline**: 72 jam dari SOD.
- **Status**: In Progress hingga E2E diset, lalu Comply/Not Comply.
- **Durasi Aktual**: diambil dari SOD→E2E; ditampilkan sesuai formatter durasi.

## Pencarian & Detail
- Cari: `order_id`, nama pelanggan, atau no HP.
- Detail: timeline, TTI, progres per stage, assignment, evidence.

## Kapan Order Hilang dari Daftar Teknisi
- Daftar teknisi memuat status aktif: **Pending**, **In Progress**, **On Hold**.
- Order hilang jika **Closed** atau penugasan teknisi dicabut.
- E2E diset tidak otomatis menghilangkan dari daftar progress.

## Troubleshooting & Best Practices
- Tidak akses menu HD: pastikan role HD.
- Order tidak muncul: cek status **Closed** atau penugasan.
- Pointer evidence tidak maju: ikuti urutan, tunggu pesan sukses.
- Gunakan tombol menu, semua waktu WIB, catatan ringkas & jelas.

## FAQ Singkat
- Apakah E2E menutup order? Tidak, tutup saat evidence lengkap (**Closed**).
- Siapa yang bisa set SOD/E2E/LME PT2? Peran **HD**.
- Berapa jumlah foto evidence? **7** sesuai urutan.
- Apa itu **Durasi Aktual**? Lama waktu dari **SOD** ke **E2E**.

---
**Ekspor ke PDF**
- Dari halaman slides (`/slides`), klik **Cetak ke PDF**.
- Pilih printer **Save as PDF** dan aktifkan opsi **Background graphics**.