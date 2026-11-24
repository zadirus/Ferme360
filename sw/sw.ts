/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// Fonctionnement hors-ligne : l'application est gardée sur le téléphone
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));
self.skipWaiting();
clientsClaim();

// Notifications du matin envoyées par le serveur, même application fermée
self.addEventListener('push', (event) => {
  let d: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    d = event.data?.json() ?? {};
  } catch {
    d = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(d.title ?? 'Ferme360', {
      body: d.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag ?? 'ferme360',
      data: { url: d.url ?? '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      const f = fenetres[0];
      if (f) return f.focus();
      return self.clients.openWindow(url);
    })
  );
});
