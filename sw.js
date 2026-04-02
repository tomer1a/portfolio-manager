var CACHE_NAME = 'portfolio-v3';

var ASSETS_TO_CACHE = [
    './',
    './portfolio_v2.html',
    './css/styles.css',
    './js/config.js',
    './js/utils.js',
    './js/spData.js',
    './js/chartBuilder.js',
    './js/calculations.js',
    './js/excelImport.js',
    './js/crypto.js',
    './js/api.js',
    './js/handlers.js',
    // CDN dependencies
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore-compat.js',
    'https://unpkg.com/react@18/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
    'https://unpkg.com/react-is@18/umd/react-is.production.min.js',
    'https://unpkg.com/@babel/standalone/babel.min.js',
    'https://unpkg.com/prop-types@15.8.1/prop-types.min.js',
    'https://unpkg.com/recharts@2.12.3/umd/Recharts.js',
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
];

// Install: cache all assets
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

// Activate: clean up old caches
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names.filter(function (name) { return name !== CACHE_NAME; })
                    .map(function (name) { return caches.delete(name); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', function (event) {
    var url = event.request.url;

    // Always go to network for API calls (Finnhub, Firebase)
    if (url.indexOf('finnhub.io') !== -1 ||
        url.indexOf('firestore.googleapis.com') !== -1 ||
        url.indexOf('identitytoolkit.googleapis.com') !== -1 ||
        url.indexOf('securetoken.googleapis.com') !== -1) {
        return;
    }

    // Cache-first for everything else
    event.respondWith(
        caches.match(event.request).then(function (cached) {
            if (cached) {
                // Return cache immediately, but also update in background
                var fetchPromise = fetch(event.request).then(function (response) {
                    if (response && response.status === 200) {
                        var clone = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                }).catch(function () { });
                return cached;
            }

            // Not in cache — fetch from network and cache it
            return fetch(event.request).then(function (response) {
                if (response && response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            });
        })
    );
});
