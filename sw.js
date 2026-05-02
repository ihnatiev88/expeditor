const CACHE = 'expeditor-v1';
const STATIC = [
    './',
    './index.html',
    './db.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = e.request.url;

    // OSM map tiles — cache-first (offline maps)
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
                    return cached || new Response('', { status: 503 });
                }
            })
        );
        return;
    }

    // API calls (OSRM, Nominatim) — network only, fail silently
    if (url.includes('router.project-osrm.org') || url.includes('nominatim.openstreetmap.org')) {
        e.respondWith(fetch(e.request).catch(() => new Response('{}', { status: 503 })));
        return;
    }

    // Static assets — cache first
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res.ok) {
                    caches.open(CACHE).then(c => c.put(e.request, res.clone()));
                }
                return res;
            }).catch(() => cached);
        })
    );
});
