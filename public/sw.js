/**
 * Campfire service worker — handles Web Push API notifications.
 * Registered by the client-side push subscription logic.
 * v1
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Campfire", body: event.data.text() };
  }

  const title = payload.title ?? "Campfire";
  const options = {
    body: payload.body ?? "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { url: payload.url ?? "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Prefer a window already on the target URL — focus without navigating
        for (const client of windowClients) {
          if (new URL(client.url).pathname === new URL(url, self.location.origin).pathname && "focus" in client) {
            return client.focus();
          }
        }
        // No matching window — focus any open window and navigate it
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(url);
            return;
          }
        }
        // No window open at all — open a new one
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
