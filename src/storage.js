// Cache for the IndexedDB instance to avoid multiple openings of the same database during the session.
let dbInstance = null;

function configureDbInstance(db) {
  db.onversionchange = () => {
    closeCachedDbInstance();
  };

  dbInstance = db;
  return dbInstance;
}

function closeCachedDbInstance() {
  if (!dbInstance) {
    return;
  }

  try {
    dbInstance.onversionchange = null;
    dbInstance.close();
  } catch {
    // Ignore close errors during teardown.
  } finally {
    dbInstance = null;
  }
}

/**
 * Utility function to convert an IndexedDB request into a Promise, allowing for easier async/await usage.
 * @param {*} request - The IndexedDB request to convert.
 * @returns {Promise<any>} - A promise that resolves with the result of the request or rejects with an error.
 *
 * Example usage:
 * - `const count =await idbRequestToPromise(store.count());`
 * - `const deleted = await idbRequestToPromise(store.delete(id));`
 * - `const result = await idbRequestToPromise(request);`
 */
function idbRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSettings(settingsName = 'CSFD-Compare-settings', defaultSettings = {}) {
  if (!localStorage.getItem(settingsName)) {
    localStorage.setItem(settingsName, JSON.stringify(defaultSettings));
    return defaultSettings;
  } else {
    return JSON.parse(localStorage.getItem(settingsName));
  }
}

export async function initIndexedDB(dbName, storeName) {
  // Singleton pattern: if the database instance is already initialized, return it immediately.
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(dbName);

    openRequest.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };

    openRequest.onsuccess = function () {
      const db = openRequest.result;

      // Handle the situation where the database opened, but the store doesn't exist yet
      if (!db.objectStoreNames.contains(storeName)) {
        const nextVersion = db.version + 1;
        db.close(); // We must close the old connection before forcing an upgrade

        const upgradeRequest = indexedDB.open(dbName, nextVersion);
        upgradeRequest.onupgradeneeded = function (event) {
          const upgradedDb = event.target.result;
          if (!upgradedDb.objectStoreNames.contains(storeName)) {
            upgradedDb.createObjectStore(storeName, { keyPath: 'id' });
          }
        };
        upgradeRequest.onsuccess = function () {
          resolve(configureDbInstance(upgradeRequest.result));
        };
        upgradeRequest.onerror = function () {
          reject(upgradeRequest.error);
        };
        return;
      }

      resolve(configureDbInstance(db));
    };

    openRequest.onerror = function () {
      reject(openRequest.error);
    };
  });
}

export async function saveToIndexedDB(dbName, storeName, data) {
  const db = await initIndexedDB(dbName, storeName);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    // Manage the state of the entire transaction instead of individual operations
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => {
      console.error('Error in saveToIndexedDB:', transaction.error);
      reject(transaction.error);
    };

    if (Array.isArray(data)) {
      data.forEach((item) => store.put(item));
    } else {
      store.put(data);
    }
  });
}

export async function getAllFromIndexedDB(dbName, storeName) {
  const db = await initIndexedDB(dbName, storeName);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteItemFromIndexedDB(dbName, storeName, id) {
  const db = await initIndexedDB(dbName, storeName);
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  return await idbRequestToPromise(store.delete(id));
}

export async function deleteAllDataFromIndexedDB(dbName, storeName) {
  const db = await initIndexedDB(dbName, storeName);
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  return await idbRequestToPromise(store.clear());
}
