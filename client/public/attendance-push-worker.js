self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || '' };
  }

  const title = data.title || 'Attendance reminder';
  const options = {
    body: data.body || 'Your attendance window is open.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `attendance-${data.actionLabel || 'reminder'}`,
    renotify: false,
    data: {
      url: data.url || '/dashboard/student/attendance',
    },
    actions: data.actionLabel
      ? [{ action: 'open-attendance', title: data.actionLabel }]
      : [],
  };

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const visibleWindows = windows.filter((client) => (
      client.url.startsWith(self.location.origin)
      && client.visibilityState === 'visible'
    ));

    if (visibleWindows.length) {
      const message = {
        type: 'ATTENDANCE_WINDOW_OPEN',
        title,
        body: options.body,
        actionLabel: data.actionLabel || 'Open Attendance',
        url: options.data.url,
      };
      visibleWindows.forEach((client) => client.postMessage(message));
      return;
    }

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || '/dashboard/student/attendance',
    self.location.origin,
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
