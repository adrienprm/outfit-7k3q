// Le service worker met les fichiers de l'app en cache pour qu'elle
// s'ouvre même sans réseau. Quand on modifie l'app, on change le numéro
// de version ci-dessous pour forcer la mise à jour du cache.
const VERSION = "v14";
const CACHE = "tenues-" + VERSION;

const FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/weather.js",
  "./js/picker.js",
  "./js/messages.js",
  "./js/screens/tonight.js",
  "./js/screens/wardrobe.js",
  "./js/screens/outfit.js",
  "./js/screens/settings.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Installation : on télécharge et on garde tous les fichiers de l'app.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

// Activation : on supprime les caches des anciennes versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Requêtes : fichiers de l'app depuis le cache d'abord. Tout ce qui vient
// d'un autre site (la météo, par exemple) passe directement par le réseau.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
  );
});
