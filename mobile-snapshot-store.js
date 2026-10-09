'use strict';

// スマホ側の旅行snapshotだけを保存する最小IndexedDB helper。
// transfer tokenや認証情報は引数にもrecordにも持ち込まない。
globalThis.MobileSnapshotStore = (() => {
  const DATABASE_NAME = 'travel-shiori-mobile-snapshots-staging';
  const DATABASE_VERSION = 4;
  const STORE_NAME = 'trips';
  const PREFERENCES_STORE_NAME = 'preferences';
  const SHARE_REQUEST_TICKET_STORE_NAME = 'share_request_tickets';
  const FONT_SIZE_KEY = 'font_size';
  const FONT_SIZES = new Set(['small', 'medium', 'large']);
  const TRIP_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function storageError() {
    return new Error('mobile snapshot storage');
  }

  function tripKey(snapshot) {
    return snapshot && typeof snapshot === 'object' && typeof snapshot.trip_key === 'string'
      && TRIP_KEY.test(snapshot.trip_key) ? snapshot.trip_key : null;
  }

  function validSnapshot(snapshot) {
    return Boolean(tripKey(snapshot) && snapshot.trip && typeof snapshot.trip.title === 'string'
      && snapshot.trip.title.trim() && Array.isArray(snapshot.days)
      && Array.isArray(snapshot.candidates) && Array.isArray(snapshot.places)
      && Array.isArray(snapshot.memo_pages));
  }

  function openDatabase(indexedDb = globalThis.indexedDB) {
    return new Promise((resolve, reject) => {
      if (!indexedDb || typeof indexedDb.open !== 'function') return reject(storageError());
      let request;
      try {
        request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      } catch (_) {
        return reject(storageError());
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, {keyPath: 'trip_key'});
        if (!database.objectStoreNames.contains(PREFERENCES_STORE_NAME)) {
          database.createObjectStore(PREFERENCES_STORE_NAME, {keyPath: 'key'});
        }
        if (!database.objectStoreNames.contains(SHARE_REQUEST_TICKET_STORE_NAME)) {
          database.createObjectStore(SHARE_REQUEST_TICKET_STORE_NAME, {keyPath: 'trip_key'});
        }
      };
      request.onerror = () => reject(storageError());
      request.onblocked = () => reject(storageError());
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function readRecords(indexedDb, read) {
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = read(transaction.objectStore(STORE_NAME));
        request.onerror = () => {
          database.close();
          reject(storageError());
        };
        request.onsuccess = () => {
          database.close();
          resolve(request.result);
        };
      } catch (_) {
        database.close();
        reject(storageError());
      }
    });
  }

  async function readPreference(key, indexedDb) {
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(PREFERENCES_STORE_NAME, 'readonly');
        const request = transaction.objectStore(PREFERENCES_STORE_NAME).get(key);
        request.onerror = () => {
          database.close();
          reject(storageError());
        };
        request.onsuccess = () => {
          database.close();
          resolve(request.result);
        };
      } catch (_) {
        database.close();
        reject(storageError());
      }
    });
  }

  function validFontSize(value) {
    return typeof value === 'string' && FONT_SIZES.has(value);
  }

  async function loadFontSize(indexedDb) {
    const record = await readPreference(FONT_SIZE_KEY, indexedDb);
    return validFontSize(record?.value) ? record.value : null;
  }

  async function saveFontSize(value, indexedDb) {
    if (!validFontSize(value)) throw storageError();
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(PREFERENCES_STORE_NAME, 'readwrite');
        transaction.oncomplete = () => {
          database.close();
          resolve(value);
        };
        transaction.onerror = transaction.onabort = () => {
          database.close();
          reject(storageError());
        };
        transaction.objectStore(PREFERENCES_STORE_NAME).put({key: FONT_SIZE_KEY, value});
      } catch (_) {
        database.close();
        reject(storageError());
      }
    });
  }

  async function load(tripKeyValue, indexedDb) {
    if (typeof tripKeyValue !== 'string' || !TRIP_KEY.test(tripKeyValue)) throw storageError();
    const record = await readRecords(indexedDb, (store) => store.get(tripKeyValue));
    const snapshot = record?.snapshot;
    return validSnapshot(snapshot) && tripKey(snapshot) === tripKeyValue ? snapshot : null;
  }

  async function list(indexedDb) {
    const records = await readRecords(indexedDb, (store) => store.getAll());
    if (!Array.isArray(records)) throw storageError();
    return records.map((record) => record?.snapshot).filter((snapshot) => validSnapshot(snapshot));
  }

  async function remove(tripKeyValue, indexedDb) {
    if (typeof tripKeyValue !== 'string' || !TRIP_KEY.test(tripKeyValue)) throw storageError();
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => {
          database.close();
          resolve(tripKeyValue);
        };
        transaction.onerror = transaction.onabort = () => {
          database.close();
          reject(storageError());
        };
        transaction.objectStore(STORE_NAME).delete(tripKeyValue);
      } catch (_) {
        database.close();
        reject(storageError());
      }
    });
  }

  async function save(snapshot, indexedDb) {
    const key = tripKey(snapshot);
    if (!key || !validSnapshot(snapshot)) throw storageError();
    const database = await openDatabase(indexedDb);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => {
          database.close();
          resolve(key);
        };
        transaction.onerror = transaction.onabort = () => {
          database.close();
          reject(storageError());
        };
        // keyPathのtrip_keyとsnapshot本体だけを保存する。履歴・tokenは保存しない。
        transaction.objectStore(STORE_NAME).put({trip_key: key, snapshot});
      } catch (_) {
        database.close();
        reject(storageError());
      }
    });
  }

  return Object.freeze({
    databaseName: DATABASE_NAME,
    storeName: STORE_NAME,
    preferencesStoreName: PREFERENCES_STORE_NAME,
    tripKey,
    validSnapshot,
    validFontSize,
    loadFontSize,
    saveFontSize,
    load,
    list,
    remove,
    save,
  });
})();
