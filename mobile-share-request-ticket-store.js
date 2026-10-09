'use strict';

// Share Request Ticketだけをsnapshotとは別のIndexedDB object storeへ保存する。
// raw値はこのstoreのticket fieldにだけ保持し、local/session storageやsnapshotへ出さない。
globalThis.MobileShareRequestTicketStore = (() => {
  const DATABASE_NAME = 'travel-shiori-mobile-snapshots';
  const DATABASE_VERSION = 4;
  const STORE_NAME = 'share_request_tickets';
  const TRIPS_STORE_NAME = 'trips';
  const PREFERENCES_STORE_NAME = 'preferences';
  const TRIP_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TICKET = /^[A-Za-z0-9_-]{43}$/;

  function storageError() { return new Error('mobile share request ticket storage'); }
  function validTripKey(value) { return typeof value === 'string' && TRIP_KEY.test(value); }
  function validTicket(value) { return typeof value === 'string' && TICKET.test(value); }

  function openDatabase(indexedDb = globalThis.indexedDB) {
    return new Promise((resolve, reject) => {
      if (!indexedDb || typeof indexedDb.open !== 'function') return reject(storageError());
      let request;
      try { request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION); } catch (_) { return reject(storageError()); }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, {keyPath: 'trip_key'});
        if (!database.objectStoreNames.contains(TRIPS_STORE_NAME)) database.createObjectStore(TRIPS_STORE_NAME, {keyPath: 'trip_key'});
        if (!database.objectStoreNames.contains(PREFERENCES_STORE_NAME)) {
          database.createObjectStore(PREFERENCES_STORE_NAME, {keyPath: 'key'});
        }
      };
      request.onerror = () => reject(storageError());
      request.onblocked = () => reject(storageError());
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function load(tripKey, indexedDb) {
    if (!validTripKey(tripKey)) throw storageError();
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(tripKey);
        request.onerror = () => { database.close(); reject(storageError()); };
        request.onsuccess = () => { database.close(); resolve(validTicket(request.result?.ticket) ? request.result.ticket : null); };
      } catch (_) { database.close(); reject(storageError()); }
    });
  }

  async function save(tripKey, ticket, indexedDb) {
    if (!validTripKey(tripKey) || !validTicket(ticket)) throw storageError();
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => { database.close(); resolve(ticket); };
        transaction.onerror = transaction.onabort = () => { database.close(); reject(storageError()); };
        transaction.objectStore(STORE_NAME).put({trip_key: tripKey, ticket});
      } catch (_) { database.close(); reject(storageError()); }
    });
  }

  async function remove(tripKey, indexedDb) {
    if (!validTripKey(tripKey)) throw storageError();
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => { database.close(); resolve(tripKey); };
        transaction.onerror = transaction.onabort = () => { database.close(); reject(storageError()); };
        transaction.objectStore(STORE_NAME).delete(tripKey);
      } catch (_) { database.close(); reject(storageError()); }
    });
  }

  return Object.freeze({databaseName: DATABASE_NAME, storeName: STORE_NAME, validTicket, load, save, remove});
})();
