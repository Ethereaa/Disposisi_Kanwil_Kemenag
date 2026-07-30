import { supabase } from './supabase';

// Public VAPID key used by the browser to create a Push subscription.
// Must match the VAPID_PUBLIC_KEY secret configured on the
// send-agenda-reminders Edge Function (see supabase/functions/send-agenda-reminders).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const platform = isAndroid ? 'Android' : isIOS ? 'iOS' : /Win/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Perangkat';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} · ${platform}`;
}

/** Returns the current subscription for this device/browser, if any. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Requests notification permission (if needed), subscribes this device to
 * Web Push, and upserts the subscription into `push_subscriptions` so the
 * send-agenda-reminders Edge Function can reach it.
 */
export async function subscribeToAgendaReminders(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Browser ini tidak mendukung notifikasi push.');
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VITE_VAPID_PUBLIC_KEY belum diatur. Hubungi admin aplikasi.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Izin notifikasi ditolak. Aktifkan lewat pengaturan browser untuk menerima reminder.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Anda harus login untuk mengaktifkan reminder.');

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth_key: json.keys!.auth,
      device_label: deviceLabel(),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
}

/** Unsubscribes this device from Web Push and removes it from the DB. */
export async function unsubscribeFromAgendaReminders(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
