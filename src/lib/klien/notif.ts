'use client';
/* Izin & langganan notifikasi browser (Web Push lewat service worker /sw.js) */
import { api } from './api';

export type StatusNotif = 'tidak-didukung' | 'perlu-https' | 'default' | 'denied' | 'aktif' | 'izin-saja';

export const dukungNotif = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
const dukungPush = () => dukungNotif() && 'PushManager' in window;

export async function daftarkanSW(): Promise<ServiceWorkerRegistration | null> {
  if (!dukungNotif() || !window.isSecureContext) return null;
  try { return await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch { return null; }
}

function kunciKeBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function statusNotif(): Promise<StatusNotif> {
  if (!dukungNotif()) return 'tidak-didukung';
  if (!window.isSecureContext) return 'perlu-https';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'default';
  if (!dukungPush()) return 'izin-saja';
  const reg = await daftarkanSW();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'default';
  // pastikan server masih mengenali langganan ini (mis. setelah ganti akun di perangkat yang sama)
  const st = await api<{ terdaftar: boolean }>('push_status', { endpoint: sub.endpoint }, true).catch(() => ({ terdaftar: false }));
  if (!st.terdaftar) await kirimLangganan(sub).catch(() => {});
  return 'aktif';
}

async function kirimLangganan(sub: PushSubscription) {
  return api<{ pesan: string }>('push_langganan', { langganan: sub.toJSON(), asal: location.origin }, true);
}

/* harus dipanggil dari klik pengguna (syarat browser untuk meminta izin) */
export async function aktifkanNotif(): Promise<StatusNotif> {
  if (!dukungNotif()) return 'tidak-didukung';
  if (!window.isSecureContext) return 'perlu-https';
  const izin = await Notification.requestPermission();
  if (izin !== 'granted') return izin === 'denied' ? 'denied' : 'default';
  if (!dukungPush()) return 'izin-saja';
  const reg = await daftarkanSW();
  if (!reg) return 'tidak-didukung';
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { kunci } = await api<{ kunci: string }>('push_kunci', {}, true);
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciKeBytes(kunci) as BufferSource });
  }
  await kirimLangganan(sub);
  return 'aktif';
}

export async function matikanNotif(): Promise<void> {
  const reg = await daftarkanSW();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api('push_lepas', { endpoint: sub.endpoint }, true).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/* tampilkan notifikasi sistem langsung (dipakai bila push tidak tersedia, mis. sebagian browser) */
export async function tampilkanLokal(judul: string, isi: string, tautan: string) {
  if (!dukungNotif() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(judul, { body: isi, icon: '/ikon-192.png', badge: '/favicon.png', data: { tautan } });
}
