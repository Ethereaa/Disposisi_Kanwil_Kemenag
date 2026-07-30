// Supabase Edge Function: send-agenda-reminders
//
// Checks Agenda Pimpinan entries whose `tanggal_kegiatan` is "besok" (H-1)
// or "hari ini" (H-0, hari-H) in Asia/Makassar (WITA, UTC+8) time, and sends
// a Web Push notification to every registered device in
// `push_subscriptions` for each entry that hasn't already been notified for
// that reminder type (tracked in `agenda_reminder_log`).
//
// Deploy:
//   supabase functions deploy send-agenda-reminders
//
// Required secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@domain.go.id)
//   CRON_SECRET            - shared secret the cron caller must send back
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are already provided
//   automatically to every Edge Function by the Supabase runtime.
//
// Trigger: intended to run on a schedule (pg_cron + pg_net, see
// supabase/sql/agenda_reminder_cron.sql) a couple of times a day. Safe to
// call more often than needed — already-sent reminders are skipped.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const CRON_SECRET = Deno.env.get('CRON_SECRET');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

type ReminderType = 'h-1' | 'h-0';

interface AgendaRow {
  id: string;
  tanggal_kegiatan: string | null;
  waktu_kegiatan: string | null;
  nama_kegiatan: string;
  tempat_kegiatan: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// WITA has no DST, so a fixed +8h offset from UTC is always correct.
function makassarISODate(offsetDays: number): string {
  const now = new Date();
  const wita = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  wita.setUTCDate(wita.getUTCDate() + offsetDays);
  return wita.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const todayISO = makassarISODate(0);
  const tomorrowISO = makassarISODate(1);

  const { data: agendaRows, error: agendaError } = await supabase
    .from('agenda_pimpinan')
    .select('id, tanggal_kegiatan, waktu_kegiatan, nama_kegiatan, tempat_kegiatan')
    .in('tanggal_kegiatan', [todayISO, tomorrowISO]);

  if (agendaError) {
    return new Response(JSON.stringify({ error: agendaError.message }), { status: 500 });
  }

  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key');

  if (subError) {
    return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
  }

  const results: Array<{ agendaId: string; type: ReminderType; sent: number; skipped: boolean }> = [];

  for (const agenda of (agendaRows ?? []) as AgendaRow[]) {
    const type: ReminderType = agenda.tanggal_kegiatan === todayISO ? 'h-0' : 'h-1';

    // Claim this (agenda, type) pair. If it's already been sent, the
    // unique constraint on agenda_reminder_log makes this insert fail —
    // that's our idempotency check, so we skip sending again.
    const { error: claimError } = await supabase
      .from('agenda_reminder_log')
      .insert({ agenda_id: agenda.id, reminder_type: type });

    if (claimError) {
      results.push({ agendaId: agenda.id, type, sent: 0, skipped: true });
      continue;
    }

    const title = type === 'h-0' ? 'Agenda Hari Ini' : 'Agenda Besok';
    const waktu = agenda.waktu_kegiatan ? `${agenda.waktu_kegiatan} WITA` : '';
    const body = [agenda.nama_kegiatan || 'Agenda Pimpinan', waktu, agenda.tempat_kegiatan]
      .filter(Boolean)
      .join(' • ');

    const payload = JSON.stringify({
      title,
      body,
      url: `/#/agenda-preview/${agenda.id}`,
      tag: `agenda-${agenda.id}-${type}`,
    });

    let sent = 0;
    for (const sub of (subscriptions ?? []) as SubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          payload
        );
        sent += 1;
      } catch (err) {
        // 404/410 means the subscription is gone (browser data cleared,
        // uninstalled, etc.) — clean it up so future runs don't retry it.
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    results.push({ agendaId: agenda.id, type, sent, skipped: false });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
