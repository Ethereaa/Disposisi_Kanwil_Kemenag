// Supabase Edge Function: send-surat-overdue-reminders
//
// Checks Surat Masuk whose status_disposisi is 'diproses' and have sat
// there for more than the configured threshold (app_settings key
// 'surat_overdue_threshold_days', counted in business days — weekends
// don't count against the clock), and sends a Web Push notification to
// every registered device in `push_subscriptions` for each one that
// hasn't already been notified for its current status_updated_at
// (tracked in `surat_masuk_reminder_log`).
//
// This reuses the SAME push_subscriptions table as send-agenda-reminders
// — there's one "Aktifkan Reminder" toggle in Settings that covers both
// Agenda Pimpinan reminders and Surat Masuk overdue reminders, since a
// device subscription here isn't scoped to a single feature.
//
// Deploy:
//   supabase functions deploy send-surat-overdue-reminders
//
// Required secrets (same ones send-agenda-reminders already needs — no
// new secrets to set up if that function is already deployed):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   CRON_SECRET
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Trigger: intended to run on a schedule (pg_cron + pg_net, see
// supabase/sql/surat_overdue_reminder_cron.sql) once a day on a weekday
// morning. Safe to call more often — already-sent reminders are skipped.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const CRON_SECRET = Deno.env.get('CRON_SECRET');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const DEFAULT_THRESHOLD_DAYS = 3;

interface SuratRow {
  id: string;
  nomor_surat: string | null;
  nomor_agenda: string | null;
  perihal: string | null;
  tujuan_disposisi: string | null;
  status_updated_at: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// Business days (Mon-Fri) between an ISO timestamp and now — mirrors
// src/lib/date.ts's businessDaysSince() so the app and this function
// agree on what "overdue" means.
function businessDaysSince(iso: string): number {
  const from = new Date(iso);
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

Deno.serve(async (req) => {
  if (
    !CRON_SECRET ||
    req.headers.get('x-cron-secret') !== CRON_SECRET
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: settingRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'surat_overdue_threshold_days')
    .maybeSingle();
  const parsedThreshold = settingRow ? Number.parseInt((settingRow as { value: string }).value, 10) : NaN;
  const thresholdDays = Number.isFinite(parsedThreshold) && parsedThreshold > 0 ? parsedThreshold : DEFAULT_THRESHOLD_DAYS;

  const { data: suratRows, error: suratError } = await supabase
    .from('surat_masuk')
    .select('id, nomor_surat, nomor_agenda, perihal, tujuan_disposisi, status_updated_at')
    .eq('status_disposisi', 'diproses');

  if (suratError) {
    return new Response(JSON.stringify({ error: suratError.message }), { status: 500 });
  }

  const overdue = (suratRows ?? []).filter(
    (r: SuratRow) => businessDaysSince(r.status_updated_at) >= thresholdDays,
  );

  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key');

  if (subError) {
    return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
  }

  const results: Array<{ suratId: string; sent: number; skipped: boolean }> = [];

  for (const surat of overdue as SuratRow[]) {
    // Claim this (surat, status_updated_at) pair — the unique constraint
    // on surat_masuk_reminder_log makes a repeat insert fail, which is
    // our "already sent for this overdue period" check.
    const { error: claimError } = await supabase
      .from('surat_masuk_reminder_log')
      .insert({ surat_masuk_id: surat.id, notified_status_updated_at: surat.status_updated_at });

    if (claimError) {
      results.push({ suratId: surat.id, sent: 0, skipped: true });
      continue;
    }

    const title = 'Surat Masuk Terlambat Diproses';
    const body = [surat.nomor_surat || surat.nomor_agenda, surat.perihal, `→ ${surat.tujuan_disposisi}`]
      .filter(Boolean)
      .join(' • ');

    const payload = JSON.stringify({
      title,
      body,
      url: '/surat-masuk',
      tag: `surat-overdue-${surat.id}`,
    });

    let sent = 0;
    for (const sub of (subscriptions ?? []) as SubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          payload,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    results.push({ suratId: surat.id, sent, skipped: false });
  }

  return new Response(JSON.stringify({ ok: true, thresholdDays, checked: (suratRows ?? []).length, overdue: overdue.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
