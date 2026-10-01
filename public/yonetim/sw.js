// Diyetisyen paneli bildirimleri (Web Push). Bildirim içeriksiz gelir; kişisel bilgi taşımaz.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  e.waitUntil(
    (async () => {
      let tur = 'randevu';
      try {
        const r = await fetch('/api/portal/bildirim/son', { cache: 'no-store' });
        const j = await r.json();
        if (j && j.tur) tur = j.tur;
      } catch (_) {
        /* çevrimdışı */
      }
      const deneme = tur === 'deneme';
      await self.registration.showNotification(deneme ? 'Bildirimler çalışıyor' : 'Yeni randevu talebi', {
        body: deneme ? 'Diyetisyen paneli bildirimleri bu cihazda açık.' : 'Ayrıntılar için diyetisyen panelini açın.',
        icon: '/icon-192.png',
        badge: '/favicon-32.png',
        tag: deneme ? 'dp-deneme' : 'dp-randevu',
        renotify: true,
        data: { url: '/yonetim/#talepler' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hedef = (e.notification.data && e.notification.data.url) || '/yonetim/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      for (const c of liste) {
        if (c.url.includes('/yonetim/') && !c.url.includes('/yonetim/bildirim') && 'focus' in c) {
          if ('navigate' in c) c.navigate(hedef).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(hedef);
    }),
  );
});
