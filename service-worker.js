const CACHE_NAME = "bedit-cache-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./service-worker.js",
  "./manifest.json",
  "./bedit192.png",
  "./bedit512.png",
];

const ADDITIONAL_STATIC = [];

const CACHEABLE_ASSETS = APP_SHELL.concat(ADDITIONAL_STATIC);

const STRATEGIES = {
  CACHE_FIRST: "cache-first",
  NETWORK_FIRST: "network-first",
  STALE_WHILE_REVALIDATE: "stale-while-revalidate",
  CACHE_ONLY: "cache-only",
  NETWORK_ONLY: "network-only",
};

const ROUTE_STRATEGIES = [
  {
    urlPattern: ({ url }) =>
      CACHEABLE_ASSETS.includes(url.pathname) || url.pathname === "/",
    strategy: STRATEGIES.CACHE_FIRST,
  },
  {
    urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
    strategy: STRATEGIES.NETWORK_FIRST,
    options: {
      cacheName: "api-cache",
      expiration: {
        maxAgeSeconds: 60 * 60 * 24,
      },
    },
  },
  {
    urlPattern: ({ request }) =>
      request.destination === "image" || request.destination === "media",
    strategy: STRATEGIES.STALE_WHILE_REVALIDATE,
    options: {
      cacheName: "media-cache",
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      },
    },
  },
  {
    urlPattern: () => true,
    strategy: STRATEGIES.STALE_WHILE_REVALIDATE,
    options: {
      cacheName: "default-cache",
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 3 * 24 * 60 * 60,
      },
      networkTimeoutSeconds: 5,
    },
  },
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[ServiceWorker] Pre-caching app shell");
        return cache.addAll(CACHEABLE_ASSETS);
      })
      .then(() => {
        console.log("[ServiceWorker] Installation complete");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("[ServiceWorker] Pre-cache error:", error);
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith("bedit-") && cacheName !== CACHE_NAME,
            )
            .map((cacheName) => {
              console.log("[ServiceWorker] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }),
        );
      })
      .then(() => {
        console.log("[ServiceWorker] Claiming clients");

        return self.clients.claim();
      }),
  );
});

async function applyStrategy(request, strategy, options = {}) {
  const cacheName = options.cacheName || CACHE_NAME;
  const networkTimeoutSeconds = options.networkTimeoutSeconds || 10;

  const requestClone = request.clone();

  switch (strategy) {
    case STRATEGIES.CACHE_FIRST:
      try {
        const cacheResponse = await caches.match(request);
        if (cacheResponse) {
          console.log("[ServiceWorker] Serving from cache:", request.url);
          return cacheResponse;
        }

        console.log("[ServiceWorker] Fetching (cache miss):", request.url);
        const networkResponse = await fetch(requestClone);

        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(cacheName).then((cache) => {
          cache.put(request, responseClone);
        });

        return networkResponse;
      } catch (error) {
        console.error("[ServiceWorker] Cache-first strategy failed:", error);

        return new Response("Network error occurred", { status: 408 });
      }

    case STRATEGIES.NETWORK_FIRST:
      try {
        const networkPromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Network timeout"));
          }, networkTimeoutSeconds * 1000);

          fetch(requestClone)
            .then((response) => {
              clearTimeout(timeoutId);

              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(cacheName).then((cache) => {
                  cache.put(request, responseClone);
                });
              }

              resolve(response);
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              reject(err);
            });
        });

        return await networkPromise;
      } catch (error) {
        console.log(
          "[ServiceWorker] Network request failed, falling back to cache:",
          error,
        );

        const cachedResponse = await caches.match(request);
        return (
          cachedResponse ||
          new Response("Network error and no cache available", { status: 504 })
        );
      }

    case STRATEGIES.STALE_WHILE_REVALIDATE:
      const cachedResponse = await caches.match(request);

      const fetchPromise = fetch(requestClone)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(cacheName).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch((error) => {
          console.error("[ServiceWorker] Background fetch failed:", error);
        });

      return cachedResponse || fetchPromise;

    case STRATEGIES.CACHE_ONLY:
      return (
        (await caches.match(request)) ||
        new Response("Resource not in cache", { status: 404 })
      );

    case STRATEGIES.NETWORK_ONLY:
      try {
        return await fetch(requestClone);
      } catch (error) {
        return new Response("Network error", { status: 500 });
      }

    default:
      return fetch(request);
  }
}

async function manageExpiration(cacheName, options) {
  if (!options.expiration) return;

  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (
    options.expiration.maxEntries &&
    keys.length > options.expiration.maxEntries
  ) {
    const entriesToDelete = keys.length - options.expiration.maxEntries;
    for (let i = 0; i < entriesToDelete; i++) {
      await cache.delete(keys[i]);
    }
  }

  if (options.expiration.maxAgeSeconds) {
    const now = Date.now();
    const maxAge = options.expiration.maxAgeSeconds * 1000;

    for (const request of keys) {
      const response = await cache.match(request);
      if (!response) continue;

      const dateHeader = response.headers.get("date");
      if (dateHeader) {
        const cachedTime = new Date(dateHeader).getTime();
        if (now - cachedTime > maxAge) {
          await cache.delete(request);
        }
      }
    }
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const route = ROUTE_STRATEGIES.find((route) =>
    route.urlPattern({
      url: new URL(event.request.url),
      request: event.request,
    }),
  );

  if (route) {
    event.respondWith(
      applyStrategy(event.request, route.strategy, route.options)
        .then((response) => {
          // Manage cache expiration in the background
          if (route.options) {
            manageExpiration(
              route.options.cacheName || CACHE_NAME,
              route.options,
            ).catch((err) =>
              console.error("[ServiceWorker] Expiration error:", err),
            );
          }
          return response;
        })
        .catch((error) => {
          console.error("[ServiceWorker] Fetch handler error:", error);
          return new Response("Something went wrong", { status: 500 });
        }),
    );
  }
});

const OFFLINE_PAGE = "./index.html";

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_PAGE);
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json();

    event.waitUntil(
      self.registration.showNotification(data.title || "bEdit Notification", {
        body: data.body || "Something important happened in bEdit",
        icon: "./bedit192.png",
        data: data,
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url === "/" && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow("./");
      }
    }),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-data") {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log("[ServiceWorker] Background sync triggered");
  // Implement sync logic for pending data here
}
