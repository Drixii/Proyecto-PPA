// Notificaciones del navegador. Lo importa el service worker que genera
// vite-plugin-pwa (workbox.importScripts en vite.config.js), porque ese fichero
// se regenera en cada build y no se puede editar a mano.

self.addEventListener('push', function (evento) {
  var datos = {};
  try { datos = evento.data ? evento.data.json() : {}; } catch (e) { datos = {}; }

  var titulo = datos.title || 'KSA Global Evolution';
  var opciones = {
    body: datos.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Con la misma etiqueta, el aviso nuevo de una orden reemplaza al anterior
    // en vez de apilarse: cinco cambios de estado no dejan cinco avisos.
    tag: datos.tag || undefined,
    renotify: !!datos.tag,
    data: { url: datos.url || '/' }
  };
  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', function (evento) {
  evento.notification.close();
  var destino = (evento.notification.data && evento.notification.data.url) || '/';

  // Si la web ya está abierta se reutiliza esa pestaña en vez de abrir otra:
  // acabar con cinco pestañas de la misma web es la forma más rápida de que
  // alguien quite el permiso de notificaciones.
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (abiertas) {
      for (var i = 0; i < abiertas.length; i++) {
        var c = abiertas[i];
        if ('focus' in c) { c.navigate(destino); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
