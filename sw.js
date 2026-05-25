const CACHE = 'expeditor-v4';
const STATIC = [
    './',
    './index.html',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap'
];

// Never intercept — always network
const NETWORK_ONLY = [
    'nominatim.openstreetmap.org',
    'router.project-osrm.org',
    'api.openrouteservice.org',
    'api.github.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(STATIC))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE && k !== 'tiles-v1')
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = e.request.url;

    // Never intercept API calls
    if (NETWORK_ONLY.some(domain => url.includes(domain))) return;

    // db.js — network first, fallback to cache (always get fresh database)
    if (url.includes('db.js')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    if (res.ok) {
                        const toCache = res.clone();
                        caches.open(CACHE).then(c => c.put(e.request, toCache));
                    }
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // OSM tiles — cache first
    if (url.includes('tile.openstreetmap.org')) {
        e.respondWith(
            caches.open('tiles-v1').then(async cache => {
                const cached = await cache.match(e.request);
                if (cached) return cached;
                try {
                    const res = await fetch(e.request);
                    if (res.ok) cache.put(e.request, res.clone());
                    return res;
                } catch {
                    return new Response('', { status: 503 });
                }
            })
        );
        return;
    }

    // Static assets — cache first
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res.ok) {
                    const toCache = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, toCache));
                }
                return res;
            }).catch(() => new Response('', { status: 503 }));
        })
    );
});
