// עובד רקע — אחראי על התראות הדחיפה ועל פתיחת הכלי בלחיצה עליהן.
// אין כאן שמירת נתונים במטמון: נתוני נסיעות וכספים חייבים להיות עדכניים.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "נסיעות שיתופיות", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "נסיעות שיתופיות";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    dir: "rtl",
    lang: "he",
    tag: payload.tag || payload.kind || "carpool",
    renotify: false,
    data: { link: payload.link || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const target = new URL(`/#${link}`, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // אם הכלי כבר פתוח — להביא אותו לחזית במקום לפתוח חלון נוסף
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
