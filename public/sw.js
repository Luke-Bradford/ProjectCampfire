/**
 * Campfire service worker — handles Web Push API notifications.
 * Registered by the client-side push subscription logic.
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
        // If a window is already open, focus it and navigate
        for (const client of windowClients) {
          if ("focus" in client) {
            void client.focus();
            if ("navigate" in client) void client.navigate(url);
            return;
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
