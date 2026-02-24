import { INDEXED_DB_VERSION, INDEXED_DB_NAME } from './config.js';

export async function getSettings(settingsName = 'CSFD-Compare-settings', defaultSettings = {}) {
  if (!localStorage.getItem(settingsName)) {
    localStorage.setItem(settingsName, JSON.stringify(defaultSettings));
    return defaultSettings;
  } else {
    return JSON.parse(localStorage.getItem(settingsName));
  }
}

export async function checkSettingsValidity(settings, settingsName, defaultSettings) {
  if (settingsName === 'CSFD-Compare-hiddenBoxes') {
    const isArray = Array.isArray(settings);
    let keysValid = true;
    settings.forEach((element) => {
      const keys = Object.keys(element);
      if (keys.length !== 2) {
        keysValid = false;
      }
    });
    if (!isArray || !keysValid) {
      settings = defaultSettings.hiddenSections;
      localStorage.setItem(settingsName, JSON.stringify(settings));
    }
  }
  return settings;
}

export async function initIndexedDB(dbName, storeName) {
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

      if (db.objectStoreNames.contains(storeName)) {
        resolve(db);
        return;
      }

      const nextVersion = db.version + 1;
      db.close();

      const upgradeRequest = indexedDB.open(dbName, nextVersion);
      upgradeRequest.onupgradeneeded = function (event) {
        const upgradedDb = event.target.result;
        if (!upgradedDb.objectStoreNames.contains(storeName)) {
          upgradedDb.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      upgradeRequest.onsuccess = function () {
        resolve(upgradeRequest.result);
      };
      upgradeRequest.onerror = function () {
        reject(upgradeRequest.error);
      };
    };

    openRequest.onerror = function () {
      reject(openRequest.error);
    };
  });
}

export async function saveToIndexedDB(dbName, storeName, data) {
  const db = await initIndexedDB(dbName, storeName);
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  try {
    if (Array.isArray(data)) {
      data.forEach((item) => {
        store.put(item);
      });
    } else {
      store.put(data);
    }
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error('Error in saveToIndexedDB:', err);
    return false;
  }
}

export async function updateIndexedDB(dbName, storeName, data) {
  return saveToIndexedDB(dbName, storeName, data); // Simplified for demonstration
}

export async function doesIndexedDBExist(dbName) {
  const dbs = await indexedDB.databases();
  return dbs.some((db) => db.name === dbName);
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

export async function getItemsFromIndexedDB(dbName, storeName, ids) {
  const db = await initIndexedDB(dbName, storeName);
  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  let items = [];
  for (let id of ids) {
    items.push(
      await new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    );
  }
  return items;
}

export async function getIndexedDBLength(dbName, storeName) {
  const db = await initIndexedDB(dbName, storeName);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const countRequest = store.count();
    countRequest.onsuccess = () => resolve(countRequest.result);
    countRequest.onerror = () => reject(countRequest.error);
  });
}

export async function deleteItemFromIndexedDB(dbName, storeName, id) {
  const db = await initIndexedDB(dbName, storeName);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAllDataFromIndexedDB(dbName, storeName) {
  const db = await initIndexedDB(dbName, storeName);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteIndexedDB(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears all data from a specific IndexedDB object store.
 * @param {string} dbName - The name of the database.
 * @param {string} storeName - The name of the object store to clear.
 * @returns {Promise<void>}
 */
export async function clearIndexedDB(dbName, storeName) {
  const db = await openIndexedDB(dbName);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}
