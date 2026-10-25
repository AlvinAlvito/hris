/* Service worker Posi HRIS: menampilkan notifikasi push & membuka halaman terkait saat diklik */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { judul: 'Posi HRIS', isi: e.data ? e.data.text() : '' }; }
  const judul = d.judul || 'Posi HRIS';
  e.waitUntil(self.registration.showNotification(judul, {
    body: d.isi || '',
    icon: '/ikon-192.png',
    badge: '/favicon.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: d.jenis === 'pengingat',
    vibrate: [120, 60, 120],
    data: { tautan: d.tautan || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const tujuan = new URL((e.notification.data && e.notification.data.tautan) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const semua = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of semua) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); if ('navigate' in c) await c.navigate(tujuan).catch(() => {}); return; }
    }
    await self.clients.openWindow(tujuan);
  })());
});
