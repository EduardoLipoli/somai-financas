const CACHE_NAME = "finapp-v1";
 
// ── Instalação ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
 
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
 
// ── Recebe push do servidor ───────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {
    title: "Alerta Financeiro",
    body: "Você tem despesas pendentes!",
    icon: "/icon-192.png",   // troque pelo ícone do seu app
    badge: "/badge-72.png",  // ícone pequeno (opcional)
    tag: "finapp-alert",
    data: { url: "/despesas" },
  };
 
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (_) {}
  }
 
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      renotify: true,
      data: data.data,
      vibrate: [200, 100, 200],
      actions: [
        { action: "ver", title: "Ver despesas" },
        { action: "fechar", title: "Fechar" },
      ],
    })
  );
});
 
// ── Clique na notificação ─────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
 
  if (event.action === "fechar") return;
 
  const urlDestino = event.notification.data?.url || "/dashboard";
 
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Se já tem uma aba aberta, foca nela
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(self.location.origin + urlDestino);
      } else {
        self.clients.openWindow(self.location.origin + urlDestino);
      }
    })
  );
});