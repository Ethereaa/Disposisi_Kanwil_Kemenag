# Reminder Agenda Pimpinan (Web Push)

Fitur ini mengirim notifikasi push otomatis ke perangkat yang sudah
"Aktifkan Reminder" di halaman **Settings**, untuk agenda pimpinan yang
jadwalnya:
- **H-1** (besok), dan
- **hari-H** (hari ini)

Berjalan di atas kapabilitas service worker yang sudah ada (`public/sw.js`),
menggunakan Web Push standar (bukan Firebase/OneSignal), jadi tidak perlu
SDK pihak ketiga.

## Bagian-bagian

| Bagian | File |
|---|---|
| Tabel penyimpanan device/subscription | `supabase/migrations/20260731000000_create_push_subscriptions.sql` |
| Tabel anti-duplikat kirim reminder | `supabase/migrations/20260731010000_create_agenda_reminder_log.sql` |
| Edge Function pengirim notifikasi | `supabase/functions/send-agenda-reminders/index.ts` |
| Contoh jadwal cron | `supabase/sql/agenda_reminder_cron.sql` |
| Helper subscribe/unsubscribe di client | `src/lib/push.ts` |
| Handler notifikasi di service worker | `public/sw.js` (`push`, `notificationclick`) |
| Toggle di UI | Settings → "Reminder Agenda Pimpinan" |

## Langkah setup (sekali saja, oleh admin)

1. **Generate VAPID keys** (kunci untuk Web Push):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Simpan `Public Key` dan `Private Key` yang dihasilkan.

2. **Set environment variable untuk build frontend** — tambahkan ke
   `.env` (atau environment variables di Vercel):
   ```
   VITE_SUPABASE_URL=...           # sudah ada
   VITE_SUPABASE_ANON_KEY=...      # sudah ada
   VITE_VAPID_PUBLIC_KEY=<Public Key dari langkah 1>
   ```

3. **Jalankan migration** (lewat Supabase CLI `supabase db push`, atau
   tempel isi kedua file migration `20260731...sql` ke Supabase SQL
   Editor).

4. **Deploy Edge Function**:
   ```bash
   supabase functions deploy send-agenda-reminders
   ```

5. **Set secrets untuk Edge Function**:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=<Public Key dari langkah 1>
   supabase secrets set VAPID_PRIVATE_KEY=<Private Key dari langkah 1>
   supabase secrets set VAPID_SUBJECT=mailto:admin@kemenaggorontalo.go.id
   supabase secrets set CRON_SECRET=<string acak buatan sendiri, misal hasil `openssl rand -hex 24`>
   ```

6. **Jadwalkan cron** — buka `supabase/sql/agenda_reminder_cron.sql`,
   ganti `PROJECT_REF` dan `CRON_SECRET_VALUE` sesuai proyek Anda, lalu
   jalankan isinya di Supabase SQL Editor. Ini butuh extension `pg_cron`
   dan `pg_net` (skrip sudah meng-`CREATE EXTENSION IF NOT EXISTS`
   keduanya).

7. **Build & deploy ulang frontend** supaya `VITE_VAPID_PUBLIC_KEY`
   ikut terbawa ke bundle.

## Cara staf mengaktifkan reminder

1. Buka aplikasi di HP/laptop, login seperti biasa.
2. Masuk ke **Settings → Reminder Agenda Pimpinan**.
3. Klik **"Aktifkan Reminder"**, lalu izinkan notifikasi saat diminta
   browser.
4. Selesai — perangkat itu akan menerima notifikasi H-1 dan hari-H untuk
   SEMUA agenda pimpinan (bukan hanya yang dibuat sendiri), karena agenda
   pimpinan memang data bersama satu kantor.

Reminder bersifat per-perangkat/per-browser: jika staf memakai HP dan
laptop, masing-masing perlu diaktifkan sendiri lewat Settings di
perangkat itu. Nonaktifkan kapan saja lewat tombol yang sama.

## Cara kerja singkat

- `send-agenda-reminders` dipanggil oleh pg_cron dua kali sehari (pagi
  untuk cek agenda hari ini, sore untuk cek agenda besok — jadwal bisa
  disesuaikan di `agenda_reminder_cron.sql`).
- Untuk setiap agenda yang jatuh tempo, function mengunci baris di
  `agenda_reminder_log` (unique constraint) supaya reminder yang sama
  tidak terkirim dua kali walau cron terpanggil berkali-kali.
- Function lalu mengirim Web Push ke semua baris `push_subscriptions`
  (semua perangkat yang pernah "Aktifkan Reminder").
- Service worker menerima event `push`, menampilkan notifikasi, dan saat
  di-tap akan membuka halaman preview agenda yang bersangkutan
  (`/#/agenda-preview/:id`).
- Subscription yang sudah tidak valid (browser data dihapus, dsb.)
  otomatis dibersihkan dari `push_subscriptions` saat pengiriman gagal
  dengan status 404/410.
