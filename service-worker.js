'use strict';

// GitHub Pagesのproject siteでも、Workerの登録scopeを基準にshellを解決する。
const CACHE_PREFIX = 'travel-shiori-staging-shell-';
const SHELL_VERSION = 'staging-69a282e';
const CACHE_NAME = CACHE_PREFIX + SHELL_VERSION;
const SCOPE_URL = new URL(self.registration.scope);
const SHELL_PATHS = [
  'index.html',
  'mobile.js',
  'mobile.css',
  'mobile-snapshot-store.js',
  'mobile-incoming-snapshot.js',
  'tourists-public-config.js',
  'assets/jsqr-1.4.0.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/mobile-cover.png',
  'assets/mobile-clover.svg',
];

function shellUrl(path, versioned = false) {
  const url = new URL(path, SCOPE_URL);
  if (versioned) url.searchParams.set('pwa', SHELL_VERSION);
  return url;
}

const SHELL_PATHNAMES = new Map(SHELL_PATHS.map((path) => [shellUrl(path).pathname, path]));
const APP_SHELL = SHELL_PATHS.map((path) => shellUrl(path, true).toString());

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

// 診断画面だけが使うread-only応答。Worker更新、cache削除、通信は行わない。
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'travel-shiori-pwa-diagnostic' || !event.ports?.[0]) return;
  event.ports[0].postMessage({shellVersion: SHELL_VERSION, cacheName: CACHE_NAME});
});

async function cachedShellFirst(request, cacheKey) {
  const cached = await caches.match(cacheKey, {ignoreSearch: true});
  // 保存済み旅行を開く通常の起動では、navigator.onLineの値にかかわらず
  // shellのキャッシュを優先する。iOS standaloneでは機内モードでもonLineが
  // trueになり得るため、network-firstにしてはいけない。
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error('mobile shell response');
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // iOSのホーム画面起動では、manifestのstart_urlではなく追加時のURLで
  // navigationが始まる場合がある。常にこのscopeのキャッシュ済みshellを返す。
  if (request.mode === 'navigate') {
    const indexPath = shellUrl('index.html').pathname;
    event.respondWith(cachedShellFirst(shellUrl('index.html', true), indexPath));
    return;
  }

  // shell外の通常リソースはCache Storageへ保存しない。shell資産は常に
  // precache済みのものを使い、通常の閲覧起動ではネットワークへ行かない。
  const shellPath = SHELL_PATHNAMES.get(url.pathname);
  if (!shellPath) return;
  event.respondWith(cachedShellFirst(shellUrl(shellPath, true), url.pathname));
});
