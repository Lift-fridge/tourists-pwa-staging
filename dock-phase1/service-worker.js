'use strict';
// Dedicated testing scope only. No offline cache and no interception.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
