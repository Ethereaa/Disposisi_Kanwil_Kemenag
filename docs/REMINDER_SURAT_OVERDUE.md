# Status Disposisi & Reminder Surat Terlambat

Dokumen ini menjelaskan DUA fitur baru yang ditambahkan bersamaan (satu
paket perubahan):

1. **Status Disposisi** — setiap Surat Masuk sekarang punya status alur
   kerja: **Baru → Diproses → Selesai**, terlepas dari `tujuan_disposisi`
   (bidang tujuan) yang sudah ada sebelumnya.
2. **Reminder Surat Terlambat** — notifikasi push otomatis kalau ada surat
   yang sudah lewat ambang batas hari kerja masih berstatus "Diproses".
   Fitur ini DIBANGUN DI ATAS fitur #1 (butuh `status_updated_at` untuk
   tahu sudah berapa lama surat "diam" di status Diproses), dan
   memakai infrastruktur Web Push yang SAMA dengan reminder Agenda
   Pimpinan yang sudah ada (`docs/REMINDER_AGENDA_PIMPINAN.md`) — satu
   tombol "Aktifkan Reminder" di Settings sekarang mengaktifkan
   keduanya sekaligus.

## Ringkasan file yang berubah/ditambah

| File | Perubahan |
|---|---|
| `supabase/migrations/20260803000000_add_surat_masuk_status_disposisi.sql` | Kolom `status_disposisi` + `status_updated_at` di `surat_masuk`, plus trigger auto-update timestamp |
| `supabase/migrations/20260803000100_create_app_settings.sql` | Tabel key/value bersama `app_settings` (untuk ambang waktu, dan setting lain di masa depan) |
| `supabase/migrations/20260803000200_create_surat_masuk_reminder_log.sql` | Anti-duplikat kirim reminder (mirip `agenda_reminder_log`) |
| `supabase/functions/send-surat-overdue-reminders/index.ts` | Edge Function pengirim reminder — mirip `send-agenda-reminders` |
| `supabase/sql/surat_overdue_reminder_cron.sql` | Contoh jadwal cron untuk function di atas |
| `src/types.ts` | Tipe `StatusDisposisi`, `STATUS_DISPOSISI_LABEL`, field baru di `SuratMasuk` |
| `src/lib/date.ts` | `businessDaysSince()` — hitung hari kerja (Senin-Jumat) sejak suatu timestamp |
| `src/lib/db.ts` | `updateStatusDisposisi()`, `getOverdueThresholdDays()` / `setOverdueThresholdDays()` |
| `src/lib/migrate.ts` | Default status 'baru' untuk migrasi data lokal lama |
| `src/components/ui/StatusBadge.tsx` | Komponen `DisposisiStatusBadge` |
| `src/components/ui/DataTable.tsx` | Prop baru `rowClassName` (dipakai untuk garis merah di baris terlambat) |
| `src/pages/SuratMasukPage.tsx` | Kolom Status (dropdown langsung di tabel), filter status, indikator terlambat |
| `src/pages/Dashboard.tsx` | Ringkasan status (Baru/Diproses/Selesai) + banner peringatan terlambat |
| `src/pages/SettingsPage.tsx` | Input "Ambang Waktu Terlambat", copy reminder diperluas |

## Bagian 1 — Status Disposisi

- Nilai yang mungkin: `baru` (default untuk surat baru), `diproses`,
  `selesai`.
- Diubah langsung dari dropdown kecil di kolom "Status" pada tabel Surat
  Masuk (tidak perlu buka form edit) — lihat `SuratMasukPage.tsx`.
- `status_updated_at` di-set OTOMATIS oleh trigger database setiap kali
  `status_disposisi` benar-benar berubah nilainya — bukan oleh kode
  aplikasi. Ini penting: form edit biasa (`updateMasuk`) TIDAK menyentuh
  kolom status sama sekali, supaya edit isi surat tidak diam-diam
  me-reset jam hitung mundur "terlambat".
- Dashboard menampilkan ringkasan jumlah per status, dan halaman Surat
  Masuk punya filter "Semua Status" + opsi "Terlambat".

## Bagian 2 — Reminder Surat Terlambat (Web Push)

Sama seperti reminder Agenda Pimpinan, berjalan di atas service worker
yang sudah ada (`public/sw.js`) dan Web Push standar — tidak perlu SDK
pihak ketiga baru.

| Bagian | File |
|---|---|
| Ambang waktu (hari kerja) | Tabel `app_settings`, key `surat_overdue_threshold_days` (default 3) |
| Tabel anti-duplikat kirim reminder | `supabase/migrations/20260803000200_create_surat_masuk_reminder_log.sql` |
| Edge Function pengirim notifikasi | `supabase/functions/send-surat-overdue-reminders/index.ts` |
| Contoh jadwal cron | `supabase/sql/surat_overdue_reminder_cron.sql` |
| Device/subscription | Tabel `push_subscriptions` yang **SAMA** dengan reminder Agenda Pimpinan — tidak ada tabel/opt-in baru |
| Toggle di UI | Settings → "Reminder Agenda & Surat Masuk" (tombol yang sama, cakupannya diperluas) |
| Ambang waktu di UI | Settings → "Ambang Waktu Terlambat" (input angka hari kerja + tombol Simpan) |

### Cara kerja singkat

1. `send-surat-overdue-reminders` dipanggil oleh pg_cron (disarankan
   sekali di pagi hari kerja — lihat `surat_overdue_reminder_cron.sql`).
2. Function membaca ambang batas dari `app_settings` (fallback ke 3 hari
   kerja kalau baris settingnya belum ada/rusak).
3. Mengambil semua `surat_masuk` berstatus `diproses`, menghitung hari
   kerja sejak `status_updated_at` (Sabtu/Minggu tidak dihitung — logika
   yang sama persis dengan `businessDaysSince()` di frontend, supaya UI
   dan notifikasi selalu sepakat soal "terlambat").
4. Untuk yang sudah lewat ambang, function mengunci baris di
   `surat_masuk_reminder_log` (unique constraint pada kombinasi surat +
   `status_updated_at` saat itu) — kalau gagal (sudah pernah dikirim
   untuk periode keterlambatan yang sama), dilewati.
5. Kirim Web Push ke semua `push_subscriptions`, buka `/surat-masuk`
   saat notifikasi di-tap.
6. Kalau surat itu nanti berubah status lalu balik lagi ke "Diproses"
   dan telat lagi, `status_updated_at` sudah berubah (trigger di Bagian
   1) — jadi kombinasi barunya belum pernah tercatat di
   `surat_masuk_reminder_log`, dan reminder bisa terkirim lagi. Tidak
   perlu bersihkan log manual.

### Setup (sekali saja, oleh admin)

Kalau `send-agenda-reminders` sudah pernah di-deploy dan secrets-nya
(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`CRON_SECRET`) sudah di-set, **tidak ada secret baru** yang perlu
ditambahkan — function baru ini memakai secret yang sama.

1. Jalankan 3 migration baru (`supabase db push`, atau tempel isinya ke
   Supabase SQL Editor satu per satu, urut sesuai nama file).
2. Deploy Edge Function:
   ```bash
   supabase functions deploy send-surat-overdue-reminders
   ```
3. Jadwalkan cron — buka `supabase/sql/surat_overdue_reminder_cron.sql`,
   ganti `PROJECT_REF` dan `CRON_SECRET_VALUE`, jalankan di SQL Editor.
4. Selesai. Staf yang device-nya SUDAH "Aktifkan Reminder" (untuk agenda)
   otomatis juga menerima reminder surat terlambat — tidak perlu
   aktivasi ulang. Staf baru mengaktifkan lewat Settings seperti biasa.

Ambang waktu bisa diubah kapan saja lewat Settings → "Ambang Waktu
Terlambat", tanpa perlu redeploy apa pun (dibaca langsung dari
`app_settings` setiap kali function jalan).
