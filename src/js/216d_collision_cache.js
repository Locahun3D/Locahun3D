// Optional, origin-local derived data only. Caller still validates source and codec.
(() => {
  'use strict';
  const DATABASE = 'locahun-collision-cache-v1', STORE = 'payloads';
  const MAX_ENTRY = 16 * 1024 * 1024, MAX_TOTAL = 64 * 1024 * 1024, MAX_ENTRIES = 4;
  const validKey = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
  const isBytes = value => ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';

  function create(options = {}) {
    const entryLimit = options.maxEntryBytes ?? MAX_ENTRY;
    const totalLimit = options.maxTotalBytes ?? MAX_TOTAL;
    const countLimit = options.maxEntries ?? MAX_ENTRIES;
    const timeoutMs = options.timeoutMs ?? 1500;
    // Limits may be lowered by the host, never raised beyond the storage budget.
    const enabled = [[entryLimit,MAX_ENTRY],[totalLimit,MAX_TOTAL],[countLimit,MAX_ENTRIES],[timeoutMs,10000]]
      .every(([value,cap]) => Number.isSafeInteger(value) && value > 0 && value <= cap);
    function validRecord(record, key) {
      return record && record.version === 1 && validKey(record.key) && record.key === key &&
        isBytes(record.payload) && record.payload.byteLength > 0 && record.payload.byteLength <= entryLimit &&
        Number.isSafeInteger(record.storedAt) && record.storedAt >= 0 && record.storedAt < Number.MAX_SAFE_INTEGER;
    }
    function run(mode, fallback, operation) {
      if (!enabled) return Promise.resolve(fallback);
      return new Promise(resolve => {
        let db, transaction, done = false;
        function finish(value, abort = false) {
          if (done) return;
          done = true; clearTimeout(timer);
          if (abort) { try { transaction?.abort(); } catch (_) {} }
          try { db?.close(); } catch (_) {}
          resolve(value);
        }
        const timer = setTimeout(() => finish(fallback,true),timeoutMs);
        try {
          const factory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
          if (!factory) { finish(fallback); return; }
          const opening = factory.open(DATABASE,1);
          opening.onerror = () => finish(fallback,true);
          opening.onblocked = () => finish(fallback,true);
          opening.onupgradeneeded = () => {
            try {
              if (done) { opening.transaction?.abort(); return; }
              const upgrading = opening.result;
              if (!upgrading.objectStoreNames.contains(STORE)) upgrading.createObjectStore(STORE,{keyPath:'key'});
            } catch (_) { try { opening.transaction?.abort(); } catch (_) {} finish(fallback,true); }
          };
          opening.onsuccess = () => {
            db = opening.result;
            if (done) { try { db.close(); } catch (_) {} return; }
            try {
              db.onversionchange = () => finish(fallback,true);
              db.onclose = () => finish(fallback,true);
              transaction = db.transaction(STORE,mode);
              let result = fallback;
              transaction.oncomplete = () => finish(result);
              transaction.onabort = transaction.onerror = () => finish(fallback,true);
              operation(transaction.objectStore(STORE), value => { result = value; }, () => finish(fallback,true));
            } catch (_) { finish(fallback,true); }
          };
        } catch (_) { finish(fallback,true); }
      });
    }
    function get(key) {
      if (!validKey(key)) return Promise.resolve(null);
      return run('readonly',null,(store,result,fail) => {
        const request = store.get(key);
        request.onerror = fail;
        request.onsuccess = () => {
          try {
            const record = request.result;
            if (validRecord(record,key) && record.payload.byteLength <= totalLimit) result(new Uint8Array(record.payload));
          } catch (_) { fail(); }
        };
      });
    }
    function put(key, payload) {
      if (!enabled || !validKey(key) || !isBytes(payload) || !payload.byteLength ||
          payload.byteLength > entryLimit || payload.byteLength > totalLimit) return Promise.resolve(false);
      let copy;
      try { copy = new Uint8Array(payload); } catch (_) { return Promise.resolve(false); }
      return run('readwrite',false,(store,result,fail) => {
        const entries = []; let bytes = 0;
        const scan = store.openCursor();
        scan.onerror = fail;
        scan.onsuccess = () => {
          try {
            const cursor = scan.result;
            if (cursor) {
              const record = cursor.value;
              if (!validRecord(record,cursor.primaryKey)) cursor.delete();
              else if (record.key !== key) {
                entries.push({key:record.key,bytes:record.payload.byteLength,storedAt:record.storedAt});
                bytes += record.payload.byteLength;
              }
              cursor.continue(); return;
            }
            entries.sort((a,b) => a.storedAt-b.storedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
            const storedAt = Math.max(Date.now(),...entries.map(entry => entry.storedAt+1));
            // Eviction and insertion commit together, including quota/abort rollback.
            while (entries.length >= countLimit || bytes + copy.byteLength > totalLimit) {
              const oldest = entries.shift(); bytes -= oldest.bytes; store.delete(oldest.key);
            }
            const write = store.put({key,version:1,payload:copy,storedAt});
            write.onerror = fail;
            write.onsuccess = () => result(true);
          } catch (_) { fail(); }
        };
      });
    }
    return Object.freeze({get,put});
  }
  const cache = create();
  globalThis.LocahunCollisionCache = Object.freeze({get:cache.get,put:cache.put,create});
})();
