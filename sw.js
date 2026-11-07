'use strict';
// Cache de l'appli : elle s'ouvre sans réseau (les vidéos YouTube, elles, demandent le réseau).
// Stratégie "cache d'abord, mise à jour en arrière-plan".
const CACHE = 'cuisine-v11';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'recipe.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' : on ignore le cache HTTP du navigateur (GitHub Pages en garde 10 min) pour ne pas figer d'anciens fichiers.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    // Seuls les anciens caches de l'appli (cuisine-vN) sont supprimés.
    .then(keys => Promise.all(keys.filter(k => /^cuisine-v\d+$/.test(k) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
