// ==UserScript==
// @name         ČSFD Compare
// @version      0.6.0.2
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @match        http*://www.csfd.cz/*
// @match        http*://www.csfd.sk/*
// @grant        GM_addStyle
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js

// ==/UserScript==
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @run-at       document-start


const VERSION = 'v0.6.0.2';
const SCRIPTNAME = 'CSFD-Compare';
const SETTINGSNAME = 'CSFD-Compare-settings';
const GREASYFORK_URL = 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare';

const SETTINGSNAME_HIDDEN_BOXES = 'CSFD-Compare-hiddenBoxes';

const NUM_RATINGS_PER_PAGE = 50;  // Was 100, now it's 50...
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_NAME = 'CC-Ratings';

const DEBUG_MAX_PAGES_LOAD = 0;  // 0 = no limit

window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB,
  IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.OIDBTransaction || window.msIDBTransaction,
  dbVersion = 1;

const DEV_PANEL_ALWAYS_VISIBLE = false;

// GM_addStyle(`
//   .my-custom-style-test {
//     background-color: red;
//     width: 100px;
//     height: 100px;
//   }
// `);



// let memoizeData = {};
const profilingData = {};

// function memoize(fn, fnName = '') {
//   const cache = {}

//   return async function (key, ...args) {
//     if (cache[key]) {
//       return cache[key]
//     }
//     if (!memoizeData[fnName]) {
//       memoizeData[fnName] = {
//         count: 0,
//       }
//     }
//     memoizeData[fnName] = {
//       count: memoizeData[fnName].count + 1,
//     }
//     return (cache[key] = await fn(...args))
//   }
// }

function roundTo(number, decimals) {
  return Math.floor(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function profileFunction(fn, name) {
  return function (...args) {
    const start = performance.now();
    const result = fn.apply(this, args);
    const end = performance.now();

    if (!profilingData[name]) {
      profilingData[name] = {
        type: "function",
        calledNumber: 0,
        completeTime_ms: 0,
      };
    }

    profilingData[name].calledNumber += 1;
    profilingData[name].completeTime_ms += Math.floor((end - start) * 10000) / 10000;
    profilingData[name].averagePerCall_ms = profilingData[name].completeTime_ms / profilingData[name].calledNumber;

    return result;
  };
}

function profileAsyncFunction(fn, name) {
  return async function (...args) {
    const start = performance.now();
    const result = await fn.apply(this, args);
    const end = performance.now();

    if (!profilingData[name]) {
      profilingData[name] = {
        type: "async function",
        calledNumber: 0,
        completeTime_ms: 0,
      };
    }

    profilingData[name].calledNumber += 1;
    profilingData[name].completeTime_ms += Math.floor((end - start) * 10000) / 10000;
    profilingData[name].averagePerCall_ms = profilingData[name].completeTime_ms / profilingData[name].calledNumber;

    return result;
  };
}

function profileMethod(obj, methodName) {
  const originalMethod = obj[methodName];

  obj[methodName] = function (...args) {
    const start = performance.now();
    const result = originalMethod.apply(this, args);
    const end = performance.now();

    if (!profilingData[methodName]) {
      profilingData[methodName] = {
        type: "method",
        calledNumber: 0,
        completeTime_ms: 0,
      };
    }

    profilingData[methodName].calledNumber += 1;
    profilingData[methodName].completeTime_ms += Math.floor((end - start) * 10000) / 10000;
    profilingData[methodName].averagePerCall_ms = profilingData[methodName].completeTime_ms / profilingData[methodName].calledNumber;

    return result;
  };
}


let defaultSettings = {
  // HOME PAGE
  hiddenSections: [],
  // GLOBAL
  showControlPanelOnHover: true,
  clickableHeaderBoxes: true,
  clickableMessages: true,
  addStars: true,
  // USER
  displayMessageButton: true,
  displayFavoriteButton: true,
  hideUserControlPanel: true,
  compareUserRatings: true,
  // FILM/SERIES
  addRatingsDate: false,
  showLinkToImage: true,
  ratingsEstimate: true,
  ratingsFromFavorites: true,
  addRatingsComputedCount: true,
  hideSelectedUserReviews: false,
  hideSelectedUserReviewsList: [],
  // ACTORS
  showOnOneLine: false,
  // EXPERIMENTAL
  loadComputedRatings: false,
  addChatReplyButton: false,
  hideSelectedVisitors: false,
  hideSelectedVisitorList: [],
};


class Api {

  async getCurrentPageRatings(url) {

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Ids: [9499, 563036, 123],
      }),
    });
    console.log("response", response);
    const data = await response.json();
    console.log("data", data);
    return data;
  }
}

/**
 * Check if settings are valid. If not, reset them.
 * Return either unmodified or modified settings
 * @param {*} settings - LocalStorage settings current value
 * @param {string} settingsName - Settings Name
 */
async function checkSettingsValidity(settings, settingsName) {

  if (settingsName === SETTINGSNAME_HIDDEN_BOXES) {
    const isArray = Array.isArray(settings);
    let keysValid = true;
    settings.forEach(element => {
      const keys = Object.keys(element);
      if (keys.length !== 2) {
        keysValid = false;
      }
    });

    if (!isArray || !keysValid) {
      settings = defaultSettings.hiddenSections;
      localStorage.setItem(SETTINGSNAME_HIDDEN_BOXES, JSON.stringify(settings));
    }
  }
  return settings;
}

/**
 * This function returns a promise that will resolve after "t" milliseconds
 */
function delay(t) {
  return new Promise(resolve => {
    setTimeout(resolve, t);
  });
}

async function getSettings(settingsName = SETTINGSNAME) {
  if (!localStorage[settingsName]) {
    if (settingsName === SETTINGSNAME_HIDDEN_BOXES) {
      defaultSettings = [];
    }
    console.log(`ADDDING DEFAULTS: ${defaultSettings}`);
    localStorage.setItem(settingsName, JSON.stringify(defaultSettings));
    return defaultSettings;
  } else {
    return JSON.parse(localStorage[settingsName]);
  }
}

async function refreshTooltips() {
  try {
    tippy('[data-tippy-content]', {
      // interactive: true,
      popperOptions: { modifiers: { computeStyle: { gpuAcceleration: false } } }
    });
  } catch (err) {
    console.log("Error: refreshTooltips():", err);
  }
}

/**
 * Take a list of dictionaries and return merged dictionary
 * @param {*} list
 * @returns {Object} merged
 * @example
 * const list = [{a: 1}, {b: 2, c: 3}];
 * const merged = mergeDict(list);
 * console.log(merged); // {a: 1, b: 2, c: 3}
 */
async function mergeDict(list) {
  const merged = list.reduce(function (r, o) {
    Object.keys(o).forEach(function (k) { r[k] = o[k]; });
    return r;
  }, {});
  return merged;
}

async function onHomepage(windowObj = window) {
  if (windowObj.location.pathname === '/') {
    return true;
  }
  return false;
}

async function initIndexedDB(dbName, storeName) {
  const start = performance.now();
  const openRequest = indexedDB.open(dbName, INDEXED_DB_VERSION);

  openRequest.onupgradeneeded = function (event) {
    const db = event.target.result;

    // Create the object store if it doesn't exist
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName, { keyPath: 'id' });
    }

    // Create an index for the 'year' property
    const transaction = event.target.transaction;
    const store = transaction.objectStore(storeName);
    if (!store.indexNames.contains('year')) {
      store.createIndex('year', 'year', { unique: false });
    }
    if (!store.indexNames.contains('type')) {
      store.createIndex('type', 'type', { unique: false });
    }
    if (!store.indexNames.contains('rating')) {
      store.createIndex('rating', 'rating', { unique: false });
    }
  };

  openRequest.onsuccess = function () {
    console.log('Database opened and index created');
  };

  openRequest.onerror = function () {
    console.log('Error opening database or creating index');
  };

  const end = performance.now();
  const time = (end - start) / 1000;
  console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);
}

/**
 *
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 * @param {Array<Object>} data - List of objects to save
 */
async function saveToIndexedDB(dbName, storeName, data) {
  const start = performance.now();
  const openRequest = indexedDB.open(dbName);
  openRequest.onupgradeneeded = function () {
    const db = openRequest.result;
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName, { keyPath: 'id' });
    }
  };

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  try {
    // If data is a list of objects, add each one to the store
    // If the first key is a number, it's a list
    if (!isNaN(Object.keys(data)[0]) && typeof data === 'object') {
      for (const id in data) {
        // Add item to the store, key should be INT
        const item = { ...data[id], id: Number(id) };
        store.put(item);
      }
    // If data is a single object, add it to the store
    } else {
      store.put(data);
    }

    const end = performance.now();
    const time = (end - start) / 1000;
    console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
    return true;
  } catch (err) {
    console.log('Error: saveToIndexedDB():', err);
    return false;
  }
}

/**
 *
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 * @param {Array<Object>} data - List of objects to save (must have id)
 */
async function updateIndexedDB(dbName, storeName, data) {
  const start = performance.now();
  const openRequest = indexedDB.open(dbName);
  openRequest.onupgradeneeded = function () {
    const db = openRequest.result;
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName, { keyPath: 'id' });
    }
  };

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  try {
    for (const id in data) {
      // Check if the item exists
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        // If the item exists, update it
        if (getRequest.result) {
          const item = { ...data[id], id };
          store.put(item);
        }
      };
    }
    const end = performance.now();
    const time = (end - start) / 1000;
    console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return true;
  } catch (err) {
    console.log('Error: updateIndexedDB():', err);
    return false;
  }

}

/**
 * Check if the database exists, returns true if it does and false if it doesn't
 * @param {string} dbName - Name of the database (file)
 * @returns {Promise<boolean>} exists - True if the database exists
 */
async function doesIndexedDBExist(dbName) {
  // const startComplet = performance.now();
  // const start1 = performance.now();
  const dbs = await indexedDB.databases();
  // const end1 = performance.now();
  // const start2 = performance.now();
  const dbExists = dbs.find((db) => db.name === dbName);
  // const end2 = performance.now();
  // const endComplet = performance.now();

  // console.log(`[CC] • (doesIndexedDBExist) Time: ${(endComplet - startComplet)} ms`);
  // console.log(`  -- (await indexDB.databases()) Time: ${(end1 - start1)} ms`);
  // console.debug(`  -- (dbs.find) Time: ${(end2 - start2) } ms`);

  return Boolean(dbExists);
}

/**
 * Get all items from the store
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 * @returns {Promise<Array<Object>>} items - Data from the store
 */
async function getAllFromIndexedDB(dbName, storeName) {

  // if (!(await doesIndexedDBExist(dbName))) {
  //   return 0;
  // }

  const start = performance.now();
  const openRequest = indexedDB.open(dbName);

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const data = await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const end = performance.now();
  const time = (end - start) / 1000;
  console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);

  return data.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

/**
 * Get items from the store by ID
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 * @param {Array<string>} ids - List of IDs to get from the store
 * @returns {Promise<Array<Object>>} items - Data from the store
 */
async function getItemsFromIndexedDB(dbName, storeName, ids) {
  const start = performance.now();
  const openRequest = indexedDB.open(dbName);

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const items = [];

  for (const id of ids) {
    const request = store.get(id);
    const item = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (item) {
      items.push(item);
    }
  }

  const end = performance.now();
  const time = (end - start) / 1000;
  console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);

  return items;
}

async function getItemsByPropertyFromIndexedDB(dbName, storeName, property, value) {
  const start = performance.now();
  const openRequest = indexedDB.open(dbName);

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const index = store.index(property);
  const range = IDBKeyRange.only(value);
  const cursorRequest = index.openCursor(range);

  const items = [];
  await new Promise((resolve, reject) => {
    cursorRequest.onsuccess = function () {
      const cursor = this.result;
      if (cursor) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  const end = performance.now();
  const time = (end - start) / 1000;
  console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);

  return items;
}

/**
 * Get the number of items in the store, or 0 if the store does not exist
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 * @returns {Promise<number>} count - Number of items in the store
 */
async function getIndexedDBLength(dbName, storeName) {

  if (!(await doesIndexedDBExist(dbName))) {
    return 0;
  }

  const start = performance.now();
  const openRequest = indexedDB.open(dbName);

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
    // TODO: Misto toho, abych vracel nulu tady, tak jinde inicializovat databazi pri spusteni aplikace
    openRequest.onupgradeneeded = (event) => {
      // If the database is being created or upgraded, return 0
      resolve(0);
    };
  });

  // If the database is being created or upgraded, or if the storeName doesn't exist, return 0
  if (db === 0 || !db.objectStoreNames.contains(storeName)) {
    return 0;
  }

  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  // const countRequest = store.count();
  // const count = await new Promise((resolve, reject) => {
  //   countRequest.onsuccess = () => resolve(countRequest.result);
  //   countRequest.onerror = () => reject(countRequest.error);
  // });

  let count = 0;
  let computedCount = 0;
  const cursorRequest = store.openCursor();

  const cursorFinished = await new Promise((resolve, reject) => {
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.computed === false) {
          count++;
        } else {
          computedCount++;
        }
        cursor.continue();
      } else {
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  db.close();

  const end = performance.now();
  const time = (end - start) / 1000;
  const totalCount = count + computedCount;
  console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);
  return { count, computedCount, totalCount };
}

/**
 *
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 * @param {string} id - ID of the item to be deleted (movie ID)
 */
async function deleteItemFromIndexedDB(dbName, storeName, id) {
  const start = performance.now();
  const openRequest = indexedDB.open(dbName);

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  const request = store.delete(id);
  await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  const end = performance.now();
  const time = (end - start) / 1000;
  console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);

  return true;
}

/**
 *
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 */
async function deleteAllDataFromIndexedDB(dbName, storeName) {
  const start = performance.now();
  const openRequest = indexedDB.open(dbName);

  const db = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  const cursorRequest = store.openCursor();

  await new Promise((resolve, reject) => {
    cursorRequest.onsuccess = function () {
      const cursor = this.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
  const end = performance.now();
  const time = (end - start) / 1000;
  console.debug(`[CC] ${arguments.callee.name}() Time: ${time} seconds`);
}

/**
 *
 * @param {string} dbName - Name of the database (file)
 * @param {string} storeName - Name of the store (table)
 */
async function deleteIndexedDB(dbName, storeName) {
  const openRequest = indexedDB.open(dbName);

  const db = await new Promise((resolve, reject) => {
    openRequest.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (db.objectStoreNames.contains(storeName)) {
        db.deleteObjectStore(storeName);
      }
      resolve(db);
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });

  db.close();
}


class Csfd {

  constructor(csfdPage) {
    this.csfdPage = csfdPage;
    this.stars = {};
    this.storageKey = undefined;
    this.userUrl = undefined;
    this.username = undefined;
    this.endPageNum = 0;
    this.userRatingsCount = 0;
    this.userRatingsUrl = undefined;
    this.localStorageRatingsCount = 0;
    this.settings = undefined;
    this.missingComputedRatingsCount = 0;

    this.RESULT = {};

    // Ignore the ads... Make 'hodnoceni' table wider.
    // TODO: Toto do hodnoceni!
    // $('.column.column-80').attr('class', '.column column-90');
    const ratingsColumn = document.querySelector('.column.column-80');
    if (ratingsColumn) {
      ratingsColumn.setAttribute('class', '.column column-90');
    }
  }

  async isLoggedIn() {
    const $profile = $('.profile.initialized');
    return $profile.length > 0;
  }

  /**
   * @async
   * @returns {Promise<string>} - User URL (e.g. /uzivatel/123456-adam-strong/)
   */
  async getCurrentUser() {
    let loggedInUser = $('.profile.initialized').attr('href');

    if (loggedInUser !== undefined) {
      if (loggedInUser.length == 1) {
        loggedInUser = loggedInUser[0];
      }
    }

    if (typeof loggedInUser === 'undefined') {
      console.log("Trying again...");

      // [OLD Firefox] workaround (the first returns undefined....?)
      let profile = document.querySelectorAll('.profile');
      if (profile.length == 0) {
        return undefined;
      }
      loggedInUser = profile[0].getAttribute('href');

      if (typeof loggedInUser === 'undefined') {
        console.error(`${SCRIPTNAME}: Can't find logged in username...`);
        throw (`${SCRIPTNAME}: exit`);  // TODO: Popup informing user
      }
    }
    return loggedInUser;
  }

  /**
   * @async
   * @returns {Promise<string>} - Username (e.g. adam-strong)
   */
  async getUsername() {
    const userHref = await this.getCurrentUser();
    if (userHref === undefined) {
      return undefined;
    }
    // get 'songokussj'   from '/uzivatel/78145-songokussj/'    with regex
    // get 'sans-sourire' from '/uzivatel/714142-sans-sourire/' with regex
    const foundMatch = userHref.match(new RegExp(/\/(\d+-(.*)+)\//));
    if (foundMatch.length == 3) {
      this.username = foundMatch[2];
      return foundMatch[2];
    }
    return undefined;
  }

  // getStars() {
  //   // TODO: remove this function and use getLocalStorageRatings() instead
  //   if (!localStorage[this.storageKey] || localStorage[this.storageKey] === 'undefined') {
  //     return {};
  //   }
  //   return JSON.parse(localStorage[this.storageKey]);
  // }

  async getLocalStorageRatings() {
    if (!localStorage[this.storageKey] || localStorage[this.storageKey] === 'undefined') {
      return {};
    }
    return JSON.parse(localStorage[this.storageKey]);
  }

  /**
   * Get ratings from LocalStorage and return the count of:
   * - normally rated (user clicked on rating)
   * - and computed ratings (not shown in user ratings)
   *
   * @returns {Promise<Object<string, number>>} `{ computed: int, rated: int }`
   */
  async getLocalStorageRatingsCount() {
    // const ratings = await this.getLocalStorageRatings();  // TODO: Smazat toto?
    const ratings = this.stars;
    const computedCount = Object.values(ratings).filter(rating => rating.computed).length;
    const ratedCount = Object.keys(ratings).length - computedCount;
    return {
      computed: computedCount,
      rated: ratedCount,
    };
  }

  /**
   *
   * @returns {Promise<str>} Current movie: `<MovieId>-<MovieUrlTitle>`
   *
   * Example:
   * - https://www.csfd.sk/film/739784-star-trek-lower-decks/prehlad/ --> `739784-star-trek-lower-decks`
   * - https://www.csfd.cz/film/1032817-naomi/1032819-don-t-believe-everything-you-think/recenze/ --> `1032819-don-t-believe-everything-you-think`
   */
  async getCurrentFilmUrl(page = undefined) {
    let foundMatch;
    if (page === undefined) {
      foundMatch = $('meta[property="og:url"]').attr('content').match(/\d+-[\w-]+/ig);
    } else {
      // Get meta URL from page (html)
      // Write this in vanilla JS, not jQuery: page.match(/<meta property="og:url" content="(.*)">/);
      const metaUrl = page.querySelector('meta[property="og:url"]').getAttribute('content');
      if (metaUrl === null) {
        console.error("TODO: getCurrentFilmUrl() Film URL wasn't found...");
        throw (`${SCRIPTNAME} Exiting... metaUrl === null`);
      }
      foundMatch = metaUrl.match(/\d+-[\w-]+/ig);
    }

    // TODO: getCurrentFilmUrl by melo vrátit film URL ne jen cast... ne?
    if (!foundMatch) {
      console.error("TODO: getCurrentFilmUrl() Film URL wasn't found...");
      throw (`${SCRIPTNAME} Exiting... foundMatch === null`);
    }
    return foundMatch[foundMatch.length - 1];
  }

  /**
   *
   * @returns {Promise<str>} Current movie: https://www.csfd.sk/film/739784-star-trek-lower-decks/recenze/
   *
   */
  async getCurrentFilmFullUrl(content = null) {
    const foundMatch = content === null
      ? $('meta[property="og:url"]').attr('content')
      : content.querySelector('meta[property="og:url"]').getAttribute('content');

    // TODO: getCurrentFilmFullUrl by melo vrátit film URL ne jen cast... ne?
    if (!foundMatch) {
      console.error("TODO: getCurrentFilmFullUrl() Film URL wasn't found...");
      return "";
    }
    return foundMatch;
  }

  /**
   * Get film name from the URL (e.g. /film/1032817-naomi/)
   * @param {string} fullUrl - Full URL of the movie (e.g. https://www.csfd.cz/film/1032817-naomi/1032819-don-t-believe-everything-you-think/recenze/)
   * @returns {Promise<string>} - Film name (e.g. /film/1032817-naomi/)
   */
  async getFilmNameFromFullUrl(fullUrl) {
    // Create a new URL object
    const url = new URL(fullUrl);

    // Extract the pathname from the URL object
    const pathname = url.pathname;

    // Split the pathname into segments
    const segments = pathname.split('/').filter(segment => segment !== '');

    // Get the first two segments
    const filmPath = segments.slice(0, 2).join('/');

    // Append a '/' at the end of the filmPath
    const result = '/' + filmPath + '/';

    return result;
  }


  /**
   * Return current movie Type (film, serial, episode)
   *
   * @param {html} content
   * @returns {Promise<str>} Current movie type: film, serial, episode, movie, ...
   */
  async getCurrentFilmType(content = null) {
    const foundTypes = content === null
    ? $(".film-header span.type")
    : $(content).find(".film-header span.type");

    let foundMatch = "";

    // No "type" found
    if (foundTypes.length === 0) {
      return "movie";

      // One span.type found ... (film), (serial), ...
    } else if (foundTypes.length === 1) {
      foundMatch = $(foundTypes).text();

      // Multiple span.type found, get the one containing "(" and ")"
    } else if (foundTypes.length > 1) {
      foundTypes.each(function (index, element) {
        if ($(element).text().includes("(")) {
          foundMatch = $(element).text().toLowerCase();
        }
      });
    }
    // Strip foundMatch from "(" and ")"
    foundMatch = foundMatch.replace(/[\(\)]/g, '');

    // Convert to english (film, serial, movie, series, ...)
    foundMatch = this.getShowTypeFromType(foundMatch);

    return foundMatch;
  }

  /**
   * from property `og:title` extract the movie year `'Movie Title (2019)' --> 2019`
   *
   * @param {html} content
   * @returns {Promise<str>} Current movie year
   */
  async getCurrentFilmYear(content = null) {
    let foundMatch;
    if (content === null) {
      foundMatch = $('meta[property="og:title"]').attr('content').match(/\((\d+)\)/);
    } else {
      // Get meta title from content (html)
      const metaTitle = content.querySelector('meta[property="og:title"]').getAttribute('content');
      if (metaTitle === null) {
        console.error("[ CC ] getCurrentFilmYear() Film year wasn't found...");
        throw (`${SCRIPTNAME} Exiting... metaTitle === null`);
      }
      foundMatch = metaTitle.match(/\((\d+)\)/);
    }

    if (foundMatch.length === 2) {
      let year = foundMatch[1];
      // Convert to number
      if (!isNaN(year)) {
        year = parseInt(year);
      }
      return year;
    }
    return "";
  }

  /**
   *
   * @param {html} content
   * @returns {bool} `true` if current movie rating is computed, `false` otherwise
   */
  async isCurrentFilmComputed(content = null) {
    const $computedStars = content === null
      ? $('.star.active.computed')
      : $(content).find('.star.active.computed');

    if ($computedStars.length > 0) {
      return true;
    }

    const secondTry = await this.isCurrentFilmRatingComputed(content);
    if (secondTry) {
      return true;
    }

    return false;
  }

  async isCurrentFilmRatingComputed(content = null) {
    const $computedStars = content === null
      ? this.csfdPage.find(".current-user-rating .star-rating.computed")
      : $(content).find(".current-user-rating .star-rating.computed");

    if ($computedStars.length !== 0) { return true; }

    return false;
  }

  /**
   *
   * @param {html} content
   * @returns {int} Current movie computed rating
   */
  async getCurrentFilmComputedCount(content = null) {
    const $curUserRating = content === null
      ? this.csfdPage.find('li.current-user-rating')
      : $(content).find('li.current-user-rating');

    const countedText = $($curUserRating).find('span[title]').attr('title');
    // split by :
    const counted = countedText?.split(':')[1]?.trim();
    if (counted === undefined) {
      return NaN;
    }
    return Number(counted);
  }

  async getCurrentFilmComputed() {
    const result = await this.getComputedRatings(this.csfdPage);
    return result;
  }


  /**
   *
   * @param {Object} ratingsObject - `{ url: str, id: int, rating: int, ... }`
   * @returns {Promise<bool>} `true` if item was added, `false` otherwise
   */
  async updateInDB(ratingsObject) {
    // TODO: Doplnit logiku update jen pouze pokud je hodnocení jiné než v IndexedDB
    console.log(`⚙️ ~ [CC] ~ updateInDb ~ Updating item...`, ratingsObject);
    return await updateIndexedDB(INDEXED_DB_NAME, this.username, ratingsObject);
    // // Check if film is in LocalStorage
    // const filmUrl = this.getCurrentFilmUrl();
    // const filmId = await this.getMovieIdFromHref(filmUrl);
    // const myRating = this.stars[filmId] || undefined;

    // // Item not in LocalStorage, add it then!
    // if (myRating === undefined) {
    //   // Item not in LocalStorage, add
    //   this.stars[filmId] = ratingsObject;
    //   localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
    //   return true;
    // }

    // if (myRating.rating !== ratingsObject.rating || myRating.computedCount !== ratingsObject.computedCount) {
    //   console.log(`⚙️ ~ Csfd ~ updateInLocalStorage ~ Updating item...`);
    //   this.stars[filmId] = ratingsObject;
    //   localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
    //   return true;
    // }

    // // Item in LocalStorage, everything is fine
    // // console.log(`✅ ~ Csfd ~ updateInLocalStorage ~ Item in LocalStorage, everything is fine`);
    // return false;
  }

  /**
   * Get movie rating from current or given page
   * @param {html} content
   * @returns {Promise<{rating: string, computedFrom: string, computed: boolean}>}
   */
  async getCurrentFilmRating(content = null) {
    const currentRatingIsComputed = await this.isCurrentFilmComputed(content);

    if (currentRatingIsComputed) {
      const { ratingCount, computedFromText } = content === null
        ? await this.getCurrentFilmComputed() :
        await this.getComputedRatings(content);

      return {
        rating: ratingCount,
        computedFrom: computedFromText,
        computed: true,
      };
    }

    const $activeStars = content === null
      ? this.csfdPage.find(".star.active")
      : $(content).find(".star.active");


    // No rating
    if ($activeStars.length === 0) {
      return {
        rating: NaN,
        computedFrom: "",
        computed: false,
      };
    }

    // Rating "odpad" or "1"
    if ($activeStars.length === 1) {
      if ($activeStars.attr('data-rating') === "0") {
        return {
          rating: 0,
          computedFrom: "",
          computed: false,
        };
      }
    }

    // Rating "1" to "5"
    return {
      rating: $activeStars.length,
      computedFrom: "",
      computed: false,
    };

  }

  async getCurrentUserRatingsCount() {
    return $.get(this.userRatingsUrl)
      .then(function (data) {
        const count = $(data).find('.box-user-rating span.count').text().replace(/[\s()]/g, '');
        if (count) {
          return parseInt(count);
        }
        return 0;
      });
  }

  async fillMissingSettingsKeys() {
    let settings = await getSettings();

    const currentKeys = Object.keys(settings);
    const defaultKeys = Object.keys(defaultSettings);
    for (const defaultKey of defaultKeys) {
      const exists = currentKeys.includes(defaultKey);
      if (!exists) {
        settings[defaultKey] = defaultSettings[defaultKey];
      }
    }
    localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
  }

  async checkForOldLocalstorageRatingKeys() {
    // const ratings = this.getStars();  // TODO: Mohu smazat?
    const ratings = this.stars;
    const keys = Object.keys(ratings);
    for (const key of keys) {
      if (key.includes("/")) {
        alert(`
            CSFD-Compare

            Byl nalezen starý způsob ukládání hodnocení do LocalStorage!
            Prosím, smažte staré hodnocení a znovu je nahrajte.

            CC -> Smazat Uložená hodnocení`
        );
        return null;
      }
    }
  }

  /**
   * $content should be URL with computed star ratings. Not manualy rated. \
   * Then, it will return dict with `computed stars` and text `"computed from episodes: X"`
   *
   * @param {str} $content HTML content of a page
   * @returns {Promise<{'ratingCount': int, 'computedFromText': str}>}
   *
   * Example: \
   * `{ ratingCount: 4, computedFromText: 'spocteno z episod': 2 }`
   */
  async getComputedRatings($content) {
    // Get current user rating
    const $curUserRating = $($content).find('li.current-user-rating');
    const $starsSpan = $($curUserRating).find('span.stars');
    const starCount = await this.getStarCountFromSpanClass($starsSpan);

    // Get 'Spocteno z episod' text
    const $countedText = $($curUserRating).find('span[title]').attr('title');

    // // Get this movieId and possible parentId
    // const filmUrl = await this.getFilmUrlFromHtml($content);
    // let [movieId, parentId] = await this.getMovieIdParentIdFromUrl(filmUrl);

    // Resulting dictionary
    const result = {
      'ratingCount': starCount,
      'computedFromText': $countedText,
      // 'movieId': movieId,
      // 'parentId': parentId
    };
    return result;
  }

  async loadInitialSettings() {

    const boxSettingsName = 'CSFD-Compare-settings';
    const settings = await getSettings(boxSettingsName);

    // GLOBAL
    $('#chkControlPanelOnHover').attr('checked', settings.showControlPanelOnHover);
    $('#chkClickableHeaderBoxes').attr('checked', settings.clickableHeaderBoxes);
    $('#chkClickableMessages').attr('checked', settings.clickableMessages);
    $('#chkAddStars').attr('checked', settings.addStars);

    // USER
    $('#chkDisplayMessageButton').attr('checked', settings.displayMessageButton);
    $('#chkDisplayFavoriteButton').attr('checked', settings.displayFavoriteButton);
    $('#chkHideUserControlPanel').attr('checked', settings.hideUserControlPanel);
    $('#chkCompareUserRatings').attr('checked', settings.compareUserRatings);

    // FILM/SERIES
    $('#chkAddRatingsDate').attr('checked', settings.addRatingsDate);
    $('#chkShowLinkToImage').attr('checked', settings.showLinkToImage);
    $('#chkRatingsEstimate').attr('checked', settings.ratingsEstimate);
    $('#chkRatingsFromFavorites').attr('checked', settings.ratingsFromFavorites);
    $('#chkAddRatingsComputedCount').attr('checked', settings.addRatingsComputedCount);
    $('#chkHideSelectedUserReviews').attr('checked', settings.hideSelectedUserReviews);
    settings.hideSelectedUserReviews || $('#txtHideSelectedUserReviews').parent().hide();
    if (settings.hideSelectedUserReviewsList !== undefined) { $('#txtHideSelectedUserReviews').val(settings.hideSelectedUserReviewsList.join(', ')); }

    // ACTORS
    $('#chkShowOnOneLine').attr('checked', settings.showOnOneLine);

    // EXPERIMENTAL
    $('#chkLoadComputedRatings').attr('checked', settings.loadComputedRatings);
    $('#chkAddChatReplyButton').attr('checked', settings.addChatReplyButton);
    $('#chkHideSelectedVisitors').attr('checked', settings.hideSelectedVisitors);
    settings.hideSelectedVisitors || $('#txtHideSelectedVisitors').parent().hide();
    if (settings.hideSelectedVisitorsList !== undefined) { $('#txtHideSelectedVisitors').val(settings.hideSelectedVisitorsList.join(', ')); }
  }

  async addSettingsEvents() {
    const boxSettingsName = 'CSFD-Compare-settings';
    const settings = await getSettings(boxSettingsName);

    // HOME PAGE

    // GLOBAL
    $('#chkControlPanelOnHover').on('change', function () {
      settings.showControlPanelOnHover = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkClickableHeaderBoxes').on('change', function () {
      settings.clickableHeaderBoxes = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkClickableMessages').on('change', function () {
      settings.clickableMessages = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkAddStars').on('change', function () {
      settings.addStars = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    // USER
    $('#chkDisplayMessageButton').on('change', function () {
      settings.displayMessageButton = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkDisplayFavoriteButton').on('change', function () {
      settings.displayFavoriteButton = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkHideUserControlPanel').on('change', function () {
      settings.hideUserControlPanel = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkCompareUserRatings').on('change', function () {
      settings.compareUserRatings = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    // FILM/SERIES
    $('#chkShowLinkToImage').on('change', function () {
      settings.showLinkToImage = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkRatingsEstimate').on('change', function () {
      settings.ratingsEstimate = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkRatingsFromFavorites').on('change', function () {
      settings.ratingsFromFavorites = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkAddRatingsDate').on('change', function () {
      settings.addRatingsDate = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkAddRatingsComputedCount').on('change', function () {
      settings.addRatingsComputedCount = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    $('#chkHideSelectedUserReviews').on('change', function () {
      settings.hideSelectedUserReviews = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
      $('#txtHideSelectedUserReviews').parent().toggle();
    });

    $('#txtHideSelectedUserReviews').on('change', function () {
      let ignoredUsers = this.value.replace(/\s/g, '').split(",");
      settings.hideSelectedUserReviewsList = ignoredUsers;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup(`Ignorovaní uživatelé:\n${ignoredUsers.join(', ')}`, 4);
    });

    // ACTORS
    $('#chkShowOnOneLine').on('change', function () {
      settings.showOnOneLine = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });

    // EXPERIMENTAL
    $('#chkLoadComputedRatings').on('change', function () {
      settings.loadComputedRatings = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });
    $('#chkAddChatReplyButton').on('change', function () {
      settings.addChatReplyButton = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
    });
    $('#chkHideSelectedVisitors').on('change', function () {
      settings.hideSelectedVisitors = this.checked;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
      $('#txtHideSelectedVisitors').parent().toggle();
    });
    $('#txtHideSelectedVisitors').on('change', function () {
      let hiddenVisitors = this.value.split(/,\s*/);
      settings.hideSelectedVisitorsList = hiddenVisitors;
      localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
      Glob.popup(`Ignorovaní uživatelé:\n${hiddenVisitors.join(', ')}`, 4);
    });

  }

  async onPageOtherUserHodnoceni() {
    if ((location.href.includes('/hodnoceni') || location.href.includes('/hodnotenia')) && location.href.includes('/uzivatel/')) {
      if (!location.href.includes(this.userUrl)) {
        return true;
      }
    }
    return false;
  }

  async onPageOtherUser() {
    if (location.href.includes('/uzivatel/')) {
      if (!location.href.includes(this.userUrl)) {
        return true;
      }
    }
    return false;
  }

  async onPageDiskuze() {
    if (location.href.includes('/diskuze/') || location.href.includes('/diskusie')) {
      return true;
    }
    return false;
  }

  async onPersonalFavorite() {
    if (location.href.includes('/soukromne/oblubene/') || location.href.includes('/soukrome/oblibene/')) {
      if (!location.href.includes(this.userUrl)) {
        return true;
      }
    }
    return false;
  }

  async notOnUserPage() {
    if (location.href.includes('/uzivatel/') && location.href.includes(this.userUrl)) {
      return false;
    }
    return true;
  }

  exportRatings() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
  }

  async addStars() {
    if (location.href.includes('/zebricky/') || location.href.includes('/rebricky/')) {
      return;
    }
    let starsCss = { marginLeft: "5px" };
    // On UserPage or PersonalFavorite page, modify the CSS by adding solid red border outline
    if (await this.onPageOtherUser() || await this.onPersonalFavorite()) {
      starsCss = {
        marginLeft: "5px",
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "#c78888",
        borderRadius: "5px",
        padding: "0px 5px",
      };
    }

    let $links = $('a.film-title-name');
    for (const $link of $links) {
      const href = $($link).attr('href');
      const movieId = await this.getMovieIdFromUrl(href);

      const res = this.stars[movieId];
      if (res === undefined) {
        continue;
      }
      const $sibl = $($link).closest('td').siblings('.rating,.star-rating-only');
      if ($sibl.length !== 0) {
        continue;
      }
      const starClass = res.rating !== 0 ? `stars-${res.rating}` : `trash`;
      const starText = res.rating !== 0 ? "" : "odpad!";
      const className = res.computed ? "star-rating computed" : "star-rating";
      const title = res.computed ? res.computedFromText : res.date;

      // Construct the HTML
      const $starSpan = $("<span>", {
        'class': className,
        html: `<span class="stars ${starClass}" title="${title}">${starText}</span>`
      }).css(starsCss);

      // Add the HTML
      $($link).after($starSpan);

      // If the rating is computed, add SUP element indicating from how many ratings it was computed
      if (res.computed) {
        const $numSpan = $("<span>", {
          'html': `<sup> (${res.computedCount})</sup>`
        }).css({
          'font-size': '13px',
          'color': '#7b7b7b'
        });
        $starSpan.find('span').after($numSpan);
      }
    }
  }

  /**
   * Adds a column to another user's ratings page with the user's rating
   *
   * @returns {None}
   */
  addRatingsColumn() {
    // const starsDict = this.getStars();  // TODO: Mohu smazat?
    const starsDict = this.stars;
    const lcRatingsCount = Object.keys(starsDict).length;

    // No ratings in LocalStorage, do nothing
    if (lcRatingsCount === 0) { return; }

    const $page = this.csfdPage;
    const $tbl = $page.find('#snippet--ratings table tbody');

    $tbl.find('tr').each(async function () {
      const $row = $(this);
      const href = $row.find('a.film-title-name').attr('href');
      const movieId = await csfd.getMovieIdFromHref(href);
      const myRating = starsDict[movieId];

      let $span = "";
      if (myRating?.rating === 0) {
        $span = `<span class="stars trash">odpad!</span>`;
      } else {
        if (myRating?.computed) {
          $span = `<span class="stars stars-${myRating?.rating}" title="${myRating?.computedFromText}"></span>`;
        } else {
          $span = `<span class="stars stars-${myRating?.rating}" title="${myRating?.date}"></span>`;
        }
      }

      // Color the rating to red (star-rating) or black (star-rating computed) if computed
      const className = myRating?.computed ? "star-rating computed" : "star-rating";

      // Build the HTML for computed rating SUP element: e.g. (3)
      const $computedSup = `
          <span style="position: relative;">
            <sup style="position: absolute; top: -1px; left: -2px; color: var(--color-grey-light2)">
              (${myRating?.computedCount})
            </sup>
          </span>
        `;

      const $currentUserSpan = `
          <span class="${className}">
            ${$span}
            ${myRating?.computed ? $computedSup : ""}
          </span>
        `;

      const $currentUserTd = $row.find('td:nth-child(2)')
      $currentUserTd.after(`
                    <td class="star-rating-only">
                        ${$currentUserSpan}
                    </td>
        `);
    });
  }

  async openControlPanelOnHover() {
    const btn = $('.button-control-panel');
    const panel = $('#dropdown-control-panel');

    $(btn).on('mouseover', () => {
      if (!panel.hasClass('active')) {
        panel.addClass('active');
        let windowWidth = $(window).width();
        if (windowWidth <= 635) {
          panel.appendTo(document.body);
          panel.css("top", "133px");
          panel.css("right", "15px");
        }
      }
    });
    $(btn).on('mouseleave', () => {
      if (panel.hasClass('active')) panel.removeClass('active');
    });
    $(panel).on('mouseover', () => {
      if (!panel.hasClass('active')) panel.addClass('active');
    });
    $(panel).on('mouseleave', () => {
      if (panel.hasClass('active')) panel.removeClass('active');
    });

  }

  async addWarningToUserProfile() {
    const ratingCountOk = this.isRatingCountOk();
    if (ratingCountOk) return;

    $(".csfd-compare-menu").append(`
                <div class='counter'>
                    <span><b>!</b></span>
                </div>
            `);
  }

  async refreshButtonNew(ratingsInLS, curUserRatings) {
    const ratingCountOk = await this.isRatingCountOk();
    if (ratingCountOk) return;

    const $button = $('<button>', {
      id: 'refr-ratings-button',
      "class": 'csfd-compare-reload',
      html: `<center>
                 <b> >> Načíst hodnocení (new) << </b> <br />
               </center>`,
    }).css({
      textTransform: "initial",
      fontSize: "0.9em",
      padding: "5px",
      border: "4px solid whitesmoke",
      borderRadius: "8px",
      width: "-moz-available",
      width: "-webkit-fill-available",
      width: "100%",
    });
    const $div = $('<div>', {
      html: $button,
    });
    $('.csfd-compare-settings').after($div);

    let forceUpdate = ratingsInLS > curUserRatings ? true : false;

    $($button).on("click", async function () {
      console.debug("refreshing ratings");
      const csfd = new Csfd($('div.page-content'));

      if (forceUpdate === true) {
        if (!confirm(`Pro jistotu bych obnovil VŠECHNA hodnocení... Důvod: počet tvých je [${ratingsInLS}], ale v databázi je uloženo více: [${curUserRatings}]. Souhlasíš?`)) {
          forceUpdate = false;
        }
      }
      csfd.refreshAllRatings(csfd, forceUpdate);
    });
  }

  async btnLoadComputedRatings() {
    const $button = $('<button>', {
      id: 'btn-load-computed-ratings',
      "class": 'csfd-compare-reload',
      html: `<center>
                  <b> >> Přinačíst vypočtená hodnocení << </b> <br />
                  (Work in progress)
                </center>`,
    }).css({
      textTransform: "initial",
      fontSize: "0.9em",
      padding: "5px",
      border: "4px solid whitesmoke",
      borderRadius: "8px",
      width: "-moz-available",
      width: "-webkit-fill-available",
      width: "100%",
      backgroundColor: "#212121",
    });
    const $div = $('<div>', {
      html: $button,
    });
    $('.csfd-compare-settings').after($div);

    $($button).on("click", async () => {
      console.debug("Refreshing Computed Ratings...");
      // Get all ratings from IndexedDB
      const allRatings = await getAllFromIndexedDB(INDEXED_DB_NAME, this.username);
      // console.log(`len(allRatings) = ${Object.keys(allRatings).length}`);
      // const filteredKeys = Object.keys(allRatings).filter(key => allRatings[key].computed === true);

      // const computedRatings = filteredKeys.reduce((obj, key) => {
      //   obj[key] = allRatings[key];
      //   return obj;
      // }, {});

      // console.log({ computedRatings });

      // Filter out all ratings of type "episode"
      const episodesRatings = Object.keys(allRatings)
        .filter(key => allRatings[key].type === "episode")
        .reduce((obj, key) => {
          obj[key] = allRatings[key];
          return obj;
        }, {});

      // Get get their parentIds and check if it exists in allRatings, if not, add it to empty array
      const allParentIds = Object.keys(episodesRatings).map(key => episodesRatings[key].parentId);
      const allParentIdsUnique = [...new Set(allParentIds)];
      console.log({ allParentIdsUnique });

      const filteredNotFoundParentRatings = allParentIdsUnique.filter(id => !allRatings.hasOwnProperty(id));
      console.log({ filteredNotFoundParentRatings });

      // this.missingComputedRatingsCount = filteredNotFoundParentRatings.length;
      // console.log({ missingComputedRatingsCount: this.missingComputedRatingsCount });

      // Convert IDs inside filteredNotFoundParentRatings to urls like this: 12345 -> '/film/12345/'
      const urls = filteredNotFoundParentRatings.map(id => `/film/${id}/`);
      console.log({ urls });

      // Fetch pages with missing parent ratings and add them to allRatings

      // TODO: DEBUG
      const firstTwoUrls = urls.slice(0, 2);
      for (const url of firstTwoUrls) {
      // for (const url of urls) {
        // Fetch page
        const page = await this.fetchPage(url);

        const { rating, computedFrom, computed } = await this.getCurrentFilmRating(page);
        if (!computed) {
          console.log(`Skipping, because computed is false`);
          continue;
        }
        const movie = await this.parseMoviePage(page);
        console.log({ movie });

        // Add to allRatings
        allRatings[Number(movie.filmId)] = movie;

        // Add to IndexedDB
        // await saveToIndexedDB(INDEXED_DB_NAME, this.username, movie);
      }

    });
  }

  async parseMoviePage(page) {
    // const start = performance.now();

    const [
      fullUrl,
      currentFilmDateAdded,
      computedCount,
      url,
      year,
      type,
      { rating, computedFrom, computed },
      lastUpdate,
    ] = await Promise.all([
      this.getCurrentFilmFullUrl(page),
      this.getCurrentFilmDateAdded(page),
      this.getCurrentFilmComputedCount(page),
      this.getCurrentFilmUrl(page),
      this.getCurrentFilmYear(page),
      this.getCurrentFilmType(page),
      this.getCurrentFilmRating(page),
      this.getCurrentDateTime(),
    ]);

    // // const start01 = performance.now();
    // const fullUrl = await this.getCurrentFilmFullUrl(page)
    // // const time01 = roundTo((performance.now() - start01) / 1000, 6)

    // // const start02 = performance.now();
    // const currentFilmDateAdded = await this.getCurrentFilmDateAdded(page)
    // // const time02 = roundTo((performance.now() - start02) / 1000, 6)

    // // const start03 = performance.now();
    // const computedCount = await this.getCurrentFilmComputedCount(page);
    // // const time03 = roundTo((performance.now() - start03) / 1000, 6)

    // // const start04 = performance.now();
    // const url = await this.getCurrentFilmUrl(page);
    // // const time04 = roundTo((performance.now() - start04) / 1000, 6)

    // // const start05 = performance.now();
    // const year = await this.getCurrentFilmYear(page);
    // // const time05 = roundTo((performance.now() - start05) / 1000, 6)

    // // const start06 = performance.now();
    // const type = await this.getCurrentFilmType(page);
    // // const time06 = roundTo((performance.now() - start06) / 1000, 6)

    // // const start07 = performance.now();
    // const ratingData = await this.getCurrentFilmRating(page);
    // // const time07 = roundTo((performance.now() - start07) / 1000, 6)

    // // const start1 = performance.now();
    // const { rating, computedFrom, computed } = ratingData;
    // // const time1 = roundTo((performance.now() - start1) / 1000, 6)

    // const start2 = performance.now();
    const filmId = await this.getMovieIdFromUrl(url);
    // const time2 = roundTo((performance.now() - start2) / 1000, 6)

    // // const start3 = performance.now();
    // const lastUpdate = await this.getCurrentDateTime();
    // // const time3 = roundTo((performance.now() - start3) / 1000, 6)

    // const start4 = performance.now();
    const parentName = await this.getParentNameFromUrl(fullUrl);
    // const time4 = roundTo((performance.now() - start4) / 1000, 6)

    // const start5 = performance.now();
    const parentId = await this.getMovieIdFromUrl(parentName);
    // const time5 = roundTo((performance.now() - start5) / 1000, 6)



    // const time = roundTo((performance.now() - start) / 1000, 6)
    // console.debug('===================================================================')
    // console.debug(`[CC] parseMoviePage() Time: ${time} seconds`);
    // console.debug(`     ⎿ Time01 (getCurrentFilmFullUrl): ${time01} seconds`);
    // console.debug(`     ⎿ Time02 (getCurrentFilmDateAdded): ${time02} seconds`);
    // console.debug(`     ⎿ Time03 (getCurrentFilmComputedTime): ${time03} seconds`);
    // console.debug(`     ⎿ Time04 (getCurrentFilmUrl): ${time04} seconds`);
    // console.debug(`     ⎿ Time05 (getCurrentFilmYear): ${time05} seconds`);
    // console.debug(`     ⎿ Time06 (getCurrentFilmType): ${time06} seconds`);
    // console.debug(`     ⎿ Time07 (getCurrentFilmRating): ${time07} seconds`);
    // console.debug(`     ⎿ Time1 (... unpact ratingData): ${time1} seconds`);
    // console.debug(`     ⎿ Time2 (getMovieIdFromUrl): ${time2} seconds`);
    // console.debug(`     ⎿ Time3 (getCurrentDateTime): ${time3} seconds`);
    // console.debug(`     ⎿ Time4 (getParentNameFromUrl): ${time4} seconds`);
    // console.debug(`     ⎿ Time5 (getMovieIdFromUrl): ${time5} seconds`);

    return {
      computed,
      computedCount,
      computedFromText: computedFrom,
      date: currentFilmDateAdded,
      fullUrl,
      id: filmId,
      lastUpdate,
      parentId,
      parentName,
      rating,
      type,
      url,
      year,
    };
  }

  async getMissingComputedRatings() {
    const allRatings = await getAllFromIndexedDB(INDEXED_DB_NAME, this.username);
    const episodesRatings = Object.keys(allRatings)
      .filter(key => allRatings[key].type === "episode")
      .reduce((obj, key) => {
        obj[key] = allRatings[key];
        return obj;
      }, {});

    // Get all parentId and check if it exists in allRatings, if not, add it to empty array
    const allParentIds = Object.keys(episodesRatings).map(key => episodesRatings[key].parentId);
    const allParentIdsUnique = [...new Set(allParentIds)];

    const filteredNotFoundParentRatings = allParentIdsUnique.filter(id => !allRatings.hasOwnProperty(id));

    this.missingComputedRatingsCount = filteredNotFoundParentRatings.length;
    return this.missingComputedRatingsCount;
  }

  /**
   * Fetches page from url and returns it as html using fetch API
   * @param {string} url film url
   * @returns {html} html of the page
   */
  async fetchPage(url) {
    const response = await fetch(url);
    const html = await response.text();
    // const $html = $(html);
    return new DOMParser().parseFromString(html, "text/html");
  }

  async badgesComponent(ratingsInLS, curUserRatings, computedRatings) {
    // TODO" Tohle už teď bude fungovat, jen to zakomponovat...
    return "<b>ahoj</b>";
  }

  displayMessageButton() {
    let userHref = $('#dropdown-control-panel li a.ajax').attr('href');
    if (userHref === undefined) {
      console.log("fn displayMessageButton(): can't find user href, exiting function...");
      return;
    }

    let button = document.createElement("button");
    button.setAttribute("data-tippy-content", $('#dropdown-control-panel li a.ajax')[0].text);
    button.setAttribute("style", "float: right; border-radius: 5px;");
    button.innerHTML = `
                <a class="ajax"
                    rel="contentModal"
                    data-mfp-src="#panelModal"
                    href="${userHref}"><i class="icon icon-messages"></i></a>
            `;
    $(".user-profile-content > h1").append(button);
  }

  async displayFavoriteButton() {
    let favoriteButton = $('#snippet--menuFavorite > a');
    if (favoriteButton.length !== 1) {
      console.log("fn displayFavoriteButton(): can't find user href, exiting function...");
      return;
    }
    let tooltipText = favoriteButton[0].text;
    let addRemoveIndicator = "+";
    if (tooltipText.includes("Odebrat") || tooltipText.includes("Odobrať")) {
      addRemoveIndicator = "-";
    }

    let button = document.createElement("button");
    button.setAttribute("style", "float: right; border-radius: 5px; margin: 0px 5px;");
    button.setAttribute("data-tippy-content", tooltipText);
    button.innerHTML = `
                <a class="ajax"
                    rel="contentModal"
                    data-mfp-src="#panelModal"
                    href="${favoriteButton.attr('href')}">
                        <span id="add-remove-indicator" style="font-size: 1.5em; color: white;">${addRemoveIndicator}</span>
                        <i class="icon icon-favorites"></i>
                </a>
            `;
    $(".user-profile-content > h1").append(button);

    $(button).on('click', async function () {
      if (addRemoveIndicator == "+") {
        $('#add-remove-indicator')[0].innerText = '-';
        button._tippy.setContent("Odebrat z oblíbených");
      } else {
        $('#add-remove-indicator')[0].innerText = '+';
        button._tippy.setContent("Přidat do oblíbených");
      }
      await refreshTooltips();
    });
  }

  hideUserControlPanel() {
    let panel = $('.button-control-panel:not(.small)');
    if (panel.length !== 1) { return; }
    panel.hide();
  }

  async showLinkToImageOnSmallMoviePoster() {
    let $film = this.csfdPage.find('.film-posters');
    let $img = $film.find('img');
    let src = $img.attr('src');
    let width = $img.attr('width');

    let $div = $(`<div>`, { "class": 'link-to-image' })
      .css({
        'position': 'absolute',
        'right': '0px',
        'bottom': '0px',
        'display': 'none',
        'z-index': '999',
        'padding-left': '0.5em',
        'padding-right': '0.5em',
        'margin-bottom': '0.5em',
        'margin-right': '0.5em',
        'background-color': 'rgba(255, 245, 245, 0.85)',
        'border-radius': '5px 0px',
        'font-weight': 'bold'
      })
      .html(`<a href="${src}">w${width}</a>`);

    $film.find('a').after($div);

    $film.on('mouseover', () => {
      $div.show("fast");
    });
    $film.on('mouseleave', () => {
      $div.hide("fast");
    });
  }

  /**
   * Show link for all possible picture sizes
   */
  async showLinkToImageOnOtherGalleryImages() {

    let $pictures = this.csfdPage.find('.gallery-item picture');

    let pictureIdx = 0;
    for (const $picture of $pictures) {
      let obj = {};

      let src = $($picture).find('img').attr('src').replace(/cache[/]resized[/]w\d+[/]/g, '');

      obj['100 %'] = src;

      let $sources = $($picture).find('source');

      for (const $source of $sources) {

        const srcset = $($source).attr('srcset');

        if (srcset === undefined) { continue; }

        let attributeText = srcset.replace(/\dx/g, '').replace(/\s/g, '');
        let links = attributeText.split(',');

        for (const link of links) {
          const match = link.match(/[/]w(\d+)/);
          if (match !== null) {
            if (match.length === 2) {
              const width = match[1];
              obj[width] = link;
            }
          }
        }
      }

      let idx = 0;
      for (const item in obj) {

        let $div = $(`<div>`, { "class": `link-to-image-gallery picture-idx-${pictureIdx}` })
          .css({
            'position': 'absolute',
            'right': '0px',
            'bottom': '0px',
            'display': 'none',
            'z-index': '999',
            'padding-left': '0.5em',
            'padding-right': '0.5em',
            'margin-bottom': `${0.5 + (idx * 2)}em`,
            'margin-right': '0.5em',
            'background-color': 'rgba(255, 245, 245, 0.75)',
            'border-radius': '5px 0px',
            'font-weight': 'bold'
          })
          .html(`<a href="${obj[item]}">${item}</a>`);

        $($picture).find('img').after($div);
        $($picture).attr('data-idx', pictureIdx);
        $($picture).parent().css({ position: 'relative' });  // need to have this for absolute position to work

        idx += 1;
      }

      pictureIdx += 1;

      $($picture).on('mouseover', () => {
        const pictureIdx = $($picture).attr('data-idx');
        $(`.link-to-image-gallery.picture-idx-${pictureIdx}`).show("fast");
      });
      $($picture).on('mouseleave', () => {
        const pictureIdx = $($picture).attr('data-idx');
        $(`.link-to-image-gallery.picture-idx-${pictureIdx}`).hide("fast");
      });
    }
  }

  /**
   * If film has been rated by user favorite people, make an average and display it
   * under the normal rating as: oblíbení: X %
   *
   * @returns null
   */
  async ratingsFromFavorites() {
    let $ratingSpans = this.csfdPage.find('li.favored:not(.current-user-rating) .star-rating .stars');

    // No favorite people ratings found
    if ($ratingSpans.length === 0) { return; }

    let ratingNumbers = [];
    for (let $span of $ratingSpans) {
      let num = this.getNumberFromRatingSpan($($span));
      num = num * 20;
      ratingNumbers.push(num);
    }
    let average = (array) => array.reduce((a, b) => a + b) / array.length;
    const ratingAverage = Math.round(average(ratingNumbers));

    let $ratingAverage = this.csfdPage.find('.box-rating-container div.film-rating-average');
    $ratingAverage.html(`
                <span style="position: absolute;">${$ratingAverage.text()}</span>
                <span style="position: relative; top: 25px; font-size: 0.3em; font-weight: 600;">oblíbení: ${ratingAverage} %</span>
            `);

  }
  /**
   * When there is less than 10 ratings on a movie, csfd waits with the rating.
   * This computes the rating from those less than 10 and shows it.
   *
   * @returns null
   */
  async ratingsEstimate() {

    // Find rating-average element
    let $ratingAverage = this.csfdPage.find('.box-rating-container .film-rating-average');

    // Not found, exit fn()
    if ($ratingAverage.length !== 1) { return; }

    // Get the text
    let curRating = $ratingAverage.text().replace(/\s/g, '');

    // If the text if anything than '?%', exit fn()
    if (!curRating.includes('?%')) { return; }

    // Get all other users ratings
    let $userRatings = this.csfdPage.find('section.others-rating .star-rating');

    // If no ratings in other ratings, exit fn()
    if ($userRatings.length === 0) { return; }

    // Fill the list with ratings as numbers
    let ratingNumbers = [];
    for (const $userRating of $userRatings) {
      let $ratingSpan = $($userRating).find('.stars');
      let num = this.getNumberFromRatingSpan($ratingSpan);
      // Transform number to percentage (0 -> 0 %, 1 -> 20 %, 2 -> 40 %...)
      num = num * 20;
      ratingNumbers.push(num);
    }

    // Compute the average
    let average = (array) => array.reduce((a, b) => a + b) / array.length;
    const ratingAverage = Math.round(average(ratingNumbers));

    // Rewrite the displayed rating
    const bgcolor = this.getRatingColor(ratingAverage);
    $ratingAverage
      .text(`${ratingAverage} %`)
      .css({ color: '#fff', backgroundColor: bgcolor })
      .attr('title', `spočteno z hodnocení: ${$userRatings.length}`);
  }
  /**
   * Depending on the percent number, return a color as a string representation
   * 0-29 black; 30-69 blue; 70-100 red
   *
   * @param {int} ratingPercent
   * @returns {string} representation of colour
   */
  getRatingColor(ratingPercent) {
    switch (true) {
      case (ratingPercent < 29):
        return "#535353";
      case (ratingPercent >= 30 && ratingPercent < 69):
        return "#658db4";
      case (ratingPercent >= 70):
        return "#ba0305";
      default:
        return "#d2d2d2";
    }
  }
  /**
   * From jquery! $span csfd element class (.stars stars-4) return the ratings number (4)
   *
   * @param {jquery} $span
   * @returns int in range 0-5
   */
  getNumberFromRatingSpan($span) {
    // TODO: využít tuto funkci i při načítání hodnocení do LS
    let rating = 0;
    for (let stars = 0; stars <= 5; stars++) {
      if ($span.hasClass('stars-' + stars)) {
        rating = stars;
      }
    }
    return rating;
  }
  /**
   * Show clickable link to the absolute url of the image mouse is hovering above.
   *
   * Works with:
   * - Small Movie Poster
   * - Movie Gallery Images
   */
  async showLinkToImage() {
    this.showLinkToImageOnSmallMoviePoster();
    this.showLinkToImageOnOtherGalleryImages();
  }


  async doSomethingNew(url) {
    let data = await $.get(url);
    const $rows = $(data).find('#snippet--ratings tr');

    let dc = {};
    const parentIds = [];
    const seriesIds = [];

    // Process each row of the rating page
    // $row = <>ItemName | ItemUrl | (year) | (type) | (Detail) | Rating | Date</>
    for (const $row of $rows) {

      const name = $($row).find('td.name a').attr('href');  // /film/697624-love-death-robots/800484-zakazane-ovoce/
      const filmInfo = $($row).find('td.name > h3 > span > span');  // (2007)(série)(S02) // (2021)(epizoda)(S02E05)
      console.log({ name });
      console.log({ filmInfo });

      const [showType, showYear, parentName, [movieId, parentId]] = await Promise.all([
        this.getShowType(filmInfo),
        this.getShowYear(filmInfo),
        this.getParentNameFromUrl(name),
        this.getMovieIdParentIdFromUrl(name),
      ]);

      // If the show is a SEASON, it's parent is a SERIES and ID is in the URL
      if (showType === 'season') {
        // If parentId is not in parentIds, add it to the list
        if (!parentIds.includes(parentName)) {
          // console.debug(`[ DEBUG ] Adding parentName to [PARENT Ids]: ${parentName}`);
          parentIds.push(parentName);
        }
      }
      // If the show is a EPISODE, it's parent is a SEASON but the ID is not in the URL
      // We need to get the ID from the parentName (SERIES) content and then grab the SEASON IDs there
      else if (showType === 'episode') {
        // If parentId is not in parentIds, add it to the list
        if (!seriesIds.includes(parentName)) {
          // console.debug(`[ DEBUG ] Adding parentName to [SERIES Ids]: ${parentName}`);
          parentIds.push(parentName);
          seriesIds.push(parentName);
        }
      }

      // Get the RATING from the stars and the DATE
      const $ratings = $($row).find('span.stars');
      const rating = await this.getStarCountFromSpanClass($ratings);
      const date = $($row).find('td.date-only').text().replace(/[\s]/g, '');

      dc[movieId] = {
        'url': name,
        'fullUrl': location.origin + name,
        'rating': rating,
        'date': date,
        'type': showType,
        'year': showYear,
        'parentName': parentName,
        'parentId': parentId,
        'computed': false,
        'computedCount': "",
        'computedFromText': "",
        'lastUpdate': await this.getCurrentDateTime(),
      };
    }
    return dc;
  }

  async getAllPages(force = false) {

    const boxSettingsName = 'CSFD-Compare-settings';
    const settings = await getSettings(boxSettingsName);

    const url = location.origin.endsWith('sk') ? `${this.userUrl}hodnotenia` : `${this.userUrl}hodnoceni`;
    const $content = await $.get(url);
    const $href = $($content).find(`.pagination a:not(.page-next):not(.page-prev):last`);
    let maxPageNum = $href.text();
    this.userRatingsCount = await this.getCurrentUserRatingsCount();

    const allUrls = [];
    maxPageNum = DEBUG_MAX_PAGES_LOAD != 0 ? DEBUG_MAX_PAGES_LOAD : maxPageNum;  // DEBUG PURPOSES
    for (let idx = 1; idx <= maxPageNum; idx++) {
      const url = location.origin.endsWith('sk') ? `${this.userUrl}hodnotenia/?page=${idx}` : `${this.userUrl}hodnoceni/?page=${idx}`;
      allUrls.push(url);
    }

    const savedRatingsCount = Object.keys(this.stars).filter((item) => item.computed === false).length;
    // const savedRatingsCount = Object.keys(this.stars).length;
    console.debug(`savedRatingsCount: ${savedRatingsCount}`);
    // If we don't have any ratings saved, load them all in chunks
    if (savedRatingsCount !== 0) {
      console.log(`Načítám pouze chybějící hodnocení...`);

      let dict = this.stars;
      let ls = force ? [] : [dict];
      for (let idx = 1; idx <= maxPageNum; idx++) {
        console.debug(`[ DEBUG ] iterating over ${idx} <= ${maxPageNum}`);
        const onlyRated = Object.values(dict).filter((item) => item.computed === false);
        if (!force) if (onlyRated.length >= this.userRatingsCount) break;

        console.log(`Načítám hodnocení ${idx}/${maxPageNum} stránek`);
        Glob.popup(`Načítám hodnocení ${idx}/${maxPageNum} stránek`, 1, 200, 0);

        const url = location.origin.endsWith('sk') ? `${this.userUrl}hodnotenia/?page=${idx}` : `${this.userUrl}hodnoceni/?page=${idx}`;
        const res = await this.doSomethingNew(url);

        ls.push(res);

        if (!force) dict = await mergeDict(ls);
      }
      if (force) dict = await mergeDict(ls);
      return dict;
    }

    const chunkSize = 5;

    // Divide the urls into chunks of X (to not overload the browser)
    const chunks = [];
    while (allUrls.length) {
      chunks.push(allUrls.splice(0, chunkSize));
    }

    console.log(`Načítám hodnocení...`);
    Glob.popup(`Načítám hodnocení...`, 2, 200, 0);

    // Load the chunks in parallel
    let contents = [];
    let chunkDone = 0;
    // for (const chunk of limitedChunks) {  // TODO: Debug
    for (const chunk of chunks) {
      Glob.popup(`Načítám hodnocení... ${chunkDone + chunk.length * NUM_RATINGS_PER_PAGE}/${this.userRatingsCount}`, 5, 200, 0);
      const content = await Promise.all(chunk.map(url => $.get(url)));
      contents.push(content);
      chunkDone += chunk.length * NUM_RATINGS_PER_PAGE;
    }

    // Process the content of each rating page
    let dc = {};
    const parentIds = [];
    const seriesIds = [];

    for (const content of contents) {
      for (const data of content) {
        const $rows = $(data).find('#snippet--ratings tr');

        // Process each row of the rating page
        // $row = <>ItemName | ItemUrl | (year) | (type) | (Detail) | Rating | Date</>
        for (const $row of $rows) {

          const name = $($row).find('td.name a').attr('href');  // /film/697624-love-death-robots/800484-zakazane-ovoce/
          const filmInfo = $($row).find('td.name > h3 > span > span');  // (2007)(série)(S02) // (2021)(epizoda)(S02E05)

          const [showType, showYear, parentName, [movieId, parentId]] = await Promise.all([
            this.getShowType(filmInfo),
            this.getShowYear(filmInfo),
            this.getParentNameFromUrl(name),
            this.getMovieIdParentIdFromUrl(name),
          ]);

          // If the show is a SEASON, it's parent is a SERIES and ID is in the URL
          if (showType === 'season') {
            // If parentId is not in parentIds, add it to the list
            if (!parentIds.includes(parentName)) {
              // console.debug(`[ DEBUG ] Adding parentName to [PARENT Ids]: ${parentName}`);
              parentIds.push(parentName);
            }
          }
          // If the show is a EPISODE, it's parent is a SEASON but the ID is not in the URL
          // We need to get the ID from the parentName (SERIES) content and then grab the SEASON IDs there
          else if (showType === 'episode') {
            // If parentId is not in parentIds, add it to the list
            if (!seriesIds.includes(parentName)) {
              // console.debug(`[ DEBUG ] Adding parentName to [SERIES Ids]: ${parentName}`);
              parentIds.push(parentName);
              seriesIds.push(parentName);
            }
          }

          // Get the RATING from the stars and the DATE
          const $ratings = $($row).find('span.stars');
          const rating = await this.getStarCountFromSpanClass($ratings);
          const date = $($row).find('td.date-only').text().replace(/[\s]/g, '');

          dc[movieId] = {
            'url': name,
            'fullUrl': location.origin + name,
            'rating': rating,
            'date': date,
            'type': showType,
            'year': showYear,
            'id': movieId,
            'parentName': parentName,
            'parentId': parentId,
            'computed': false,
            'computedCount': "",
            'computedFromText': "",
            'lastUpdate': await this.getCurrentDateTime(),
          };

        }
      }
    }

    if (settings.loadComputedRatings === false) {
      return dc;
    } else {
      // TODO: Load computed ratings
      return dc;
    }
  }

  /**
   * @param {<span>} filmInfo Combination of 0-3 `<span>` elements
   * @returns {int} `YYYY` (year) if it exists in filmInfo[0], `????` otherwise
   *
   * Example:
   * - (2007)(série)(S02) --> 2007
   * - (2021) --> 2021
   * - --> ????
   */
  async getShowYear(filmInfo) {
    const showYear = (filmInfo.length >= 1 ? $(filmInfo[0]).text().slice(1, -1) : '????');
    return parseInt(showYear);
  }

  /**
   * Return show type in 'english' language. Works for SK an CZ.
   *
   * @param {<span>} filmInfo Combination of 0-3 `<span>` elements
   * @returns {str} `showType` if it exists in filmInfo[1], `movie` otherwise
   *
   * Posible values: `movie`, `tv movie`, `serial`, `series`, `episode`
   *
   * Example:
   * - (2007)(série)(S02) --> series
   * - (2021)(epizoda)(S02E01) --> episode
   * - (2019) --> movie
   */
  async getShowType(filmInfo) {
    const showType = (filmInfo.length > 1 ? $(filmInfo[1]).text().slice(1, -1) : 'film');

    switch (showType) {
      case "epizoda": case "epizóda":
        return 'episode';

      case "série": case "séria":
        return 'season';

      case "seriál":
        return 'series';

      case "TV film":
        return 'tv movie';

      case 'film':
        return 'movie';

      default:
        return showType;
    }
  }

  /**
   * Return show type in 'english' language. Works for SK an CZ.
   *
   * @param {str} showType seriál, série, epizoda, film, ...
   * @returns {str} `showType`
   *
   * Posible returned values: `movie`, `tv movie`, `serial`, `series`, `episode`
   *
   * Example:
   * - série --> series
   * - epizoda --> episode
   * - film --> movie
   */
  getShowTypeFromType(showType) {

    showType = showType.toLowerCase();

    switch (showType) {
      case "epizoda": case "epizóda":
        return 'episode';

      case "série": case "séria":
        return 'season';

      case "seriál":
        return 'series';

      case "tv film":
        return 'tv movie';

      case 'film':
        return 'movie';

      default:
        return showType;
    }
  }

  /**
   * Get star count from span with stars class
   *
   * @param {"<span>"} $starsSpan $span with class of 'stars-X' or 'trash' type.
   * @returns {int} `0` if trash; `1-5` if stars-X
   *
   * Example: \
   *    `<span class="stars stars-4">` --> `4`\
   *    `<span class='stars trash'>` --> `0`
   */
  async getStarCountFromSpanClass($starsSpan) {
    let rating = 0;
    for (let stars = 0; stars <= 5; stars++) {
      if ($starsSpan.hasClass('stars-' + stars)) {
        rating = stars;
      }
    }
    return rating;
  }

  /**
   * Return **relative** parent name from episode name
   *
   * @param {string} name relative URL of episode name
   * @returns relative URL of parent name
   *
   * Example: \
   * `/film/697624-love-death-robots/800484-zakazane-ovoce/` --> `/film/697624-love-death-robots/`
   * `/film/697624-love-death-robots/` --> `""`
   * `/film/
   */
  async getParentNameFromUrl(url) {
    // Remove protocol and domain if present
    const urlRegex = /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n]+)/;
    const path = url.replace(urlRegex, "");

    // Remove trailing and leading slashes
    const cleanedPath = path.replace(/^\/|\/$/g, '');

    // Split the path by '/'
    const splitted = cleanedPath.split("/");

    // If the length of the split array is less than or equal to 3, return an empty string
    if (splitted.length <= 3) {
      return "";
    }

    // Otherwise, return the second element from the split array
    return splitted[1];
  }

  /**
   *
   * @param {str} url csfd link for movie/series/episode
   * @returns {Promise<int>} Movie ID number
   *
   * Example:
   * - url = '/film/774319-zhoubne-zlo/' --> 774319
   * - url = '/film/1058697-devadesatky/1121972-epizoda-6/' --> 1121972
   * - url = '1058697-devadesatky' --> 1058697
   * - url = 'sdfsfdsf-devadesatky' --> NaN
   * - url = \'' --> NaN
   * - url = null --> NaN
   */
  async getMovieIdFromUrl(url) {
    if (!url) { return NaN; }

    const found_groups = url.match(/(\d)+-[-\w]+/ig);

    if (!found_groups) { return NaN; }
    const movieIds = found_groups.map(x => x.split("-")[0]);
    const movieId = movieIds[movieIds.length - 1];

    return Number(movieId);
  }

  /**
   * Extract MovieId, possibly ParentId from csfd URL address
   *
   * @param {str} url csfd movie URL
   * @returns {Promise<[int, int]>} [MovieId, ParentId]
   *
   * Example: \
   * - `/film/697624-love-death-robots/800484-zakazane-ovoce/` --> `[800484, 697624]`
   * - `/film/697624-love-death-robots` --> `[697624, NaN]`
   * - `/film/` --> `[NaN, NaN]`
   * - `/uzivatel/78145-songokussj/prehled/` --> `[NaN, NaN]`
   */
  async getMovieIdParentIdFromUrl(url) {
    if (!url.includes('/film/')) {
      return [NaN, NaN];
    }
    let [firstResult, secondResult] = url.matchAll(/\/(\d+)-/g);
    if (firstResult === undefined && secondResult === undefined) {
      return [NaN, NaN];
    }
    if (secondResult === undefined) {
      // Convert to number
      return [parseInt(firstResult[1], 10), NaN];
    }
    return [parseInt(secondResult[1], 10), parseInt(firstResult[1], 10)];
  }

  async refreshAllRatings(csfd, force = false) {
    // Start timer
    const start = performance.now();
    const username = await csfd.getUsername();

    await csfd.initializeClassVariables();
    // csfd.stars = await this.getAllPagesNew(force);

    let res = await this.getAllPages(force);
    console.log(`getAllPagesNew() ... Total ratings: ${Object.keys(res).length}`);

    // Save all to IndexedDB
    await saveToIndexedDB(INDEXED_DB_NAME, username, res);
    csfd.stars = res;

    // // Loading all ratings from IndexedDB
    // let indexRatings = await getAllFromIndexedDB(INDEXED_DB_NAME, "songokussj");
    // console.log({ indexRatings });

    // // Get the length of the IndexedDB database
    // let numOfRatings = await getIndexedDBLength(INDEXED_DB_NAME, "songokussj");
    // console.log(`IndexedDB length: ${numOfRatings}`);

    // // Delete from IndexedDB
    // console.log("Deleting from IndexedDB");
    // await deleteItemFromIndexedDB(INDEXED_DB_NAME, "songokussj", "1324443");

    // // Loading specific rating from IndexedDB
    // console.log("Loading specific rating from IndexedDB");
    // let movieIds = ["134187", "1324444"];
    // let specificRatings = await getItemsFromIndexedDB(INDEXED_DB_NAME, "songokussj", movieIds);
    // console.log({ specificRatings });

    // // Get all ratings with property year = 2023
    // console.log("Get all ratings with property year = 2023");
    // // let ratingsWithYear = await getItemsFromIndexedDB(INDEXED_DB_NAME, "songokussj", null, "year", 2023);
    // let ratingsWithYear = await getItemsByPropertyFromIndexedDB(INDEXED_DB_NAME, "songokussj", "year_idx", 2023);
    // console.log({ ratingsWithYear });


    // // Delete all data from IndexedDB
    // console.log("Deleting all data from IndexedDB");
    // await deleteAllDataFromIndexedDB(INDEXED_DB_NAME, "songokussj");

    // // Delete IndexedDB
    // console.log("Deleting IndexedDB");
    // await deleteIndexedDB(INDEXED_DB_NAME, "songokussj");

    // Stop timer
    const end = performance.now();
    const time = (end - start) / 1000;
    console.debug(`Time: ${time} seconds`);

    // Refresh page
    // location.reload();

    Glob.popup(`Vaše hodnocení byla načtena.<br>Obnovte stránku.`, 4, 200);
  }

  async removableHomeBoxes() {
    const boxSettingsName = 'CSFD-Compare-hiddenBoxes';
    const settings = await getSettings(boxSettingsName);

    $('.box-header').each(async function (index, value) {
      const $section = $(this).closest('section');
      $section.attr('data-box-id', index);

      if (settings.some(x => x.boxId == index)) {
        $section.hide();
      }

      const $btnHideBox = $('<a>', {
        'class': 'hide-me button',
        href: 'javascript:void(0)',
        html: `Skrýt`
      }).css({
        margin: 'auto',
        marginLeft: '10px',
        backgroundColor: '#7b0203',
        display: 'none',
      });

      let $h2 = $(this).find('h2');
      if ($h2.length === 0) {
        $h2 = $(this).find('p');
        $(this).css({ 'padding-right': '0px' });
        $h2.after($btnHideBox[0]);
        return;
        // }
      }

      $h2.append($btnHideBox[0]);
    });

    $('.box-header').on('mouseover', async function () {
      $(this).find('.hide-me').show();
    }).on('mouseout', async function () {
      $(this).find('.hide-me').hide();
    });

    const self = this;
    $('.hide-me').on('click', async function (event) {
      const $section = $(event.target).closest('section');
      const boxId = $section.data('box-id');
      let boxName = $section.find('h2').first().text().replace(/\n|\t|Skrýt/g, "");  // clean from '\t', '\n'
      if (boxName === '') {
        boxName = $section.find('p').first().text().replace(/\n|\t|Skrýt/g, "");
      }
      const dict = { boxId: boxId, boxName: boxName };
      const settings = await getSettings(SETTINGSNAME_HIDDEN_BOXES);
      if (!settings.includes(dict)) {
        settings.push(dict);
        localStorage.setItem(boxSettingsName, JSON.stringify(settings));
        self.addHideSectionButton(boxId, boxName);
      }
      $section.hide();
    });
  }

  showOnOneLine() {
    const $sections = $(`div.creator-filmography`).find(`section`);
    let $nooverflowH3 = $sections.find(`h3.film-title-nooverflow`);
    $nooverflowH3.css({
      "display": "inline-block",
      "white-space": "nowrap",
      "text-overflow": "ellipsis",
      "overflow": "hidden",
      "max-width": "230px",
    });
    const $filmTitleNameA = $nooverflowH3.find(`a.film-title-name`);
    $filmTitleNameA.css({
      "white-space": "nowrap",
    });
    $filmTitleNameA.each(function () {
      const $this = $(this);
      $this.attr("title", $this.text());
    });
  }

  addHideSectionButton(boxId, boxName) {
    let $button = `
                <button class="restore-hidden-section" data-box-id="${boxId}" title="${boxName}"
                    style="border-radius: 4px;
                           margin: 1px;
                           max-width: 60px;
                           text-transform: capitalize;
                           overflow: hidden;
                           text-overflow: ellipsis;"
                >${boxName}</button>
            `;
    let $div = $(`div.hidden-sections`);
    $div.append($button);
  }

  /**
   * Creates a <span> element with a tooltip.
   *
   * @param {str} url imgur/github url of the image (screenshot)
   * @param {str} description description of the image
   * @returns {str} html code of the image
   */
  helpImageComponent(url, description) {
    const $span = $(`
                <span class="help-hover-image"
                      data-description="${description}"
                      data-img-url="${url}"><a href="${url}" target="_blank">💬</a></span>
            `).css({
      "cursor": "pointer",
      "color": "rgba(255, 255, 255, 0.8)",
    })
    return $span.get(0).outerHTML;
  }

  settingsPanelComponent() {
    const $div = $(`
        <article class="article" style="padding: 5px 10px;">
          <section>
            <div class="article-section">
              <button id="btnResetSettings" class="settings-button" style="border-radius: 4px;" title="Resetuje uložená nastavení (NE hodnocení)">Reset nastavení</button>
              <button id="btnRemoveSavedRatings" class="settings-button" style="border-radius: 4px;" title="Smaže všechna uložená hodnocení z LocalStorage (staré)!">Smazat z LC</button>
              <button id="btnRemoveDBRatings" class="settings-button" style="border-radius: 4px;" title="Smaže všechna uložená hodnocení! z IndexedDB (nové)">Smazat z DB (new)</button>
            </div>
          </section>
        </article>
      `)

    return $div.get(0).outerHTML;
  }

  async addSettingsPanel() {
    let dropdownStyle = 'right: 150px; width: max-content; max-width: 360px;';
    let disabled = '';
    let needToLoginTooltip = '';
    let needToLoginStyle = '';

    if (!await this.isLoggedIn()) {
      dropdownStyle = 'right: 50px; width: max-content; max-width: 360px;';
      disabled = 'disabled';
      needToLoginTooltip = `data-tippy-content="Funguje jen po přihlášení do CSFD"`;
      needToLoginStyle = 'color: grey;';
    }

    let button = document.createElement('li');
    // button.classList.add('active');  // TODO: Debug - Nonstop zobrazení CC Menu
    let resetLabelStyle = "-webkit-transition: initial; transition: initial; font-weight: initial; display: initial !important;";

    // Add box-id attribute to .box-header(s)
    $('.box-header').each(async function (index, value) {
      let $section = $(this).closest('section');
      $section.attr('data-box-id', index);
    });

    // Build array of buttons for un-hiding sections
    let resultDisplayArray = [];
    let hiddenBoxesArray = await getSettings(SETTINGSNAME_HIDDEN_BOXES);
    hiddenBoxesArray = await checkSettingsValidity(hiddenBoxesArray, SETTINGSNAME_HIDDEN_BOXES);
    hiddenBoxesArray.sort((a, b) => a - b);  // sort by numbers
    hiddenBoxesArray.forEach(element => {
      let boxId = element.boxId;
      let boxName = element.boxName.replace(/\n|\t/g, "");  // clean text of '\n' and '\t';
      resultDisplayArray.push(`
                    <button class="restore-hidden-section" data-box-id="${boxId}" title="${boxName}"
                            style="border-radius: 4px;
                                   margin: 1px;
                                   max-width: 60px;
                                   text-transform: capitalize;
                                   overflow: hidden;
                                   text-overflow: ellipsis;"
                    >
                        ${boxName}
                    </button>
                `);
    });

    const { computed: computed_ratings, rated: rated_ratings } = await this.getLocalStorageRatingsCount();
    console.log(`[ DEBUG ] this.username: ${this.username}`);
    const new_rated_ratings = await getIndexedDBLength(INDEXED_DB_NAME, this.username);
    const current_ratings = await this.getCurrentUserRatingsCount();
    // const current_ratings = 999;

    button.innerHTML = `
                <a href="javascript:void()" class="user-link initialized csfd-compare-menu">CC</a>
                <div class="dropdown-content notifications" style="${dropdownStyle}">

                    <div class="dropdown-content-head csfd-compare-settings">

                        <h2>CSFD-Compare</h2>

                        <span class="badge" id="cc-control-panel-rating-count" title="Počet načtených/celkových červených hodnocení" style="margin-left: 10px; font-size: 0.7rem; font-weight: bold; background-color: #aa2c16; color: white; padding: 2px 4px; border-radius: 6px; cursor: help;">
                            ${new_rated_ratings.count} / ${current_ratings}
                        </span>

                        <span class="badge" id="cc-control-panel-computed-count" title="Počet načtených vypočtených hodnocení" style="margin-left: 10px; font-size: 0.7rem; font-weight: bold; background-color: #393939; color: white; padding: 2px 4px; border-radius: 6px; cursor: help;">
                            ${computed_ratings.computedCount} / ${this.missingComputedRatingsCount}
                        </span>

                        <span style="float: right; font-size: 0.7rem; margin-top: 0.2rem;">
                            <a id="script-version" href="${GREASYFORK_URL}">${VERSION}</a>
                        </span>
                    </div>

                    ${this.settingsPanelComponent()}

                    <article class="article" style="padding: 5px 10px;">
                        <h2 class="article-header">Domácí stránka - skryté panely</h2>
                        <section>
                            <div class="article-content">
                                <div class="hidden-sections" style="max-width: fit-content;">${resultDisplayArray.join("")}</div>
                            </div>
                        </section>
                    </article>

                    <article class="article" style="padding: 5px 10px;">
                        <h2 class="article-header">Globální</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkClickableHeaderBoxes" name="clickable-header-boxes">
                                <label for="chkClickableHeaderBoxes" style="${resetLabelStyle}">Boxy s tlačítkem "VÍCE" jsou klikatelné celé</label>
                                ${this.helpImageComponent("https://i.imgur.com/8AwhbGK.png", "Boxy s tlačítkem 'VÍCE' jsou klikatelné celé, ne pouze na tlačítko 'VÍCE'")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkClickableMessages" name="clickable-messages" ${disabled}>
                                <label for="chkClickableMessages" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Klikatelné zprávy (bez tlačítka "více...")</label>
                                ${this.helpImageComponent("https://i.imgur.com/ettGHsH.png", "Zprávy lze otevřít kliknutím kamkoli na zprávu, ne pouze na 'více...'")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkAddStars" name="add-stars" ${disabled}>
                                <label for="chkAddStars" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Přidat hvězdičky hodnocení u viděných filmů/seriálů</label>
                                ${this.helpImageComponent("https://i.imgur.com/aTrSU2X.png", "Přidá hvězdy hodnocení u viděných filmů/seriálů")}
                            </div>
                        </section>
                    </article>

                    <article class="article" style="padding: 5px 10px;">
                        <h2 class="article-header">Uživatelé</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkControlPanelOnHover" name="control-panel-on-hover">
                                <label for="chkControlPanelOnHover" style="${resetLabelStyle}">Otevřít ovládací panel přejetím myší</label>
                                ${this.helpImageComponent("https://i.imgur.com/N2hfkZ6.png", "Otevřít ovládací panel přejetím myší")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkCompareUserRatings" name="compare-user-ratings" ${disabled}>
                                <label for="chkCompareUserRatings" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Porovnat uživatelská hodnocení s mými</label>
                                ${this.helpImageComponent("https://i.imgur.com/cDX0JaX.png", "Přidá sloupec pro porovnání hodnocení s mými hodnoceními")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideUserControlPanel" name="chide-user-control-panel" ${disabled}>
                                <label for="chkHideUserControlPanel" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Skrýt ovládací panel</label>
                                ${this.helpImageComponent("https://i.imgur.com/KLzFqxM.png", "Skryje ovládací panel uživatele, další funkce lze poté zobrazit pomocí nastavení níže")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkDisplayMessageButton" name="display-message-button" ${disabled}>
                                <label for="chkDisplayMessageButton" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}> ↳ Přidat tlačítko odeslání zprávy</label>
                                ${this.helpImageComponent("https://i.imgur.com/N1JuzYk.png", "Zobrazení tlačítka pro odeslání zprávy")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkDisplayFavoriteButton" name="display-favorite-button" ${disabled}>
                                <label for="chkDisplayFavoriteButton" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}> ↳ Přidat tlačítko přidat/odebrat z oblíbených</label>
                                ${this.helpImageComponent("https://i.imgur.com/vbnFpEU.png", "Zobrazení tlačítka pro přidání/odebrání z oblíbených")}
                            </div>
                        </section>
                    </article>

                    <article class="article" style="padding: 5px 10px;">
                        <h2 class="article-header">Film/Seriál</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkShowLinkToImage" name="show-link-to-image">
                                <label for="chkShowLinkToImage" style="${resetLabelStyle}"}>Zobrazit odkazy na obrázcích</label>
                                ${this.helpImageComponent("https://i.imgur.com/a2Av3AK.png", "Přidá vpravo odkazy na všechny možné velikosti, které jsou k dispozici")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRatingsEstimate" name="ratings-estimate">
                                <label for="chkRatingsEstimate" style="${resetLabelStyle}">Vypočtení % při počtu hodnocení pod 10</label>
                                ${this.helpImageComponent("https://i.imgur.com/qGAhXog.png", "Ukáže % hodnocení i u filmů s méně než 10 hodnoceními")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRatingsFromFavorites" name="ratings-from-favorites" ${disabled}>
                                <label for="chkRatingsFromFavorites" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Zobrazit hodnocení z průměru oblíbených</label>
                                ${this.helpImageComponent("https://i.imgur.com/ol88F6z.png", "Zobrazí % hodnocení od přidaných oblíbených uživatelů")}
                                </div>
                                <div class="article-content">
                                <input type="checkbox" id="chkAddRatingsComputedCount" name="compare-user-ratings" ${disabled}>
                                <label for="chkAddRatingsComputedCount" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Zobrazit spočteno ze sérií</label>
                                ${this.helpImageComponent("https://i.imgur.com/KtpT81X.png", "Pokud je hodnocení 'vypočteno', zobrazí 'spočteno ze sérií/episod'")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkAddRatingsDate" name="add-ratings" ${disabled}>
                                <label for="chkAddRatingsDate" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Zobrazit datum hodnocení</label>
                                ${this.helpImageComponent("https://i.imgur.com/CHpBDxK.png", "Zobrazí datum hodnocení <br>!!! Pozor !!! pere se s pluginem ČSFD Extended - v tomto případě ponechte vypnuté")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideSelectedUserReviews" name="hide-selected-user-reviews">
                                <label for="chkHideSelectedUserReviews" style="${resetLabelStyle}">Skrýt recenze lidí</label>
                                ${this.helpImageComponent("https://i.imgur.com/k6GGE9K.png", "Skryje recenze zvolených uživatelů oddělených čárkou: POMO, kOCOUR")}
                                <div>
                                    <input type="textbox" id="txtHideSelectedUserReviews" name="hide-selected-user-reviews-list">
                                    <label style="${resetLabelStyle}">(např: POMO, golfista)</label>
                                </div>
                            </div>
                        </section>
                    </article>

                    <article class="article" style="padding: 5px 10px;">
                        <h2 class="article-header">Herci</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkShowOnOneLine" name="show-on-one-line">
                                <label for="chkShowOnOneLine" style="${resetLabelStyle}"}>Filmy na jednom řádku</label>
                                ${this.helpImageComponent("https://i.imgur.com/IPXzclo.png", "Donutí zobrazit název filmu na jeden řádek")}
                            </div>
                        </section>
                    </article>

                    <article class="article" style="padding: 5px 10px;">
                        <h2 class="article-header">!! Experimentální !!</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkLoadComputedRatings" name="control-panel-on-hover" disabled>
                                <label for="chkLoadComputedRatings" style="${resetLabelStyle}"><del>Přinačíst vypočtená (černá) hodnocení</del></label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkAddChatReplyButton" name="control-panel-on-hover" ${disabled}>
                                <label for="chkAddChatReplyButton" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Přidat v diskuzích možnost odpovědět na sebe</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideSelectedVisitors" name="hide-selected-visitors">
                                <label for="chkHideSelectedVisitors" style="${resetLabelStyle}">Skrýt uživatele v návštěvnících</label>
                                <!--${this.helpImageComponent("https://i.imgur.com/k6GGE9K.png", "Skryje zvolené uživatele v 'návštěvnících' a 'kdo mě má v oblíbených'. Oddělte čárkou: POMO, kOCOUR")}-->
                                <div>
                                    <input type="textbox" id="txtHideSelectedVisitors" name="hide-selected-visitors">
                                    <label style="${resetLabelStyle}">(např: POMO, golfista)</label>
                                </div>
                            </div>
                        </section>
                    </article>

                </div>
            `;
    $('.header-bar').prepend(button);

    await refreshTooltips();

    // Show help image on hover
    $(".help-hover-image").on('mouseenter', function (e) {
      const url = $(this).attr("data-img-url");
      const description = $(this).attr("data-description");
      $("body").append(
        `<p id='image-when-hovering-text'><img src='${url}'/><br>${description}</p>`
      );
      $("#image-when-hovering-text").css({
        position: "absolute",
        top: (e.pageY + 5) + "px",
        left: (e.pageX + 25) + "px",
        zIndex: "9999",
        backgroundColor: "white",
        padding: "5px",
        border: "1px solid #6a6a6a",
        borderRadius: "5px"
      }).fadeIn("fast");
    }).on('mouseleave', function () {
      $("#image-when-hovering-text").remove();
    });

    $(".help-hover-image").on('mousemove', function (e) {
      $("#image-when-hovering-text")
        .css("top", (e.pageY + 5) + "px")
        .css("left", (e.pageX + 25) + "px");
    });

    // Show() the section and remove the number from localStorage
    $(".hidden-sections").on("click", ".restore-hidden-section", async function () {
      let $element = $(this);
      let sectionId = $element.attr("data-box-id");

      // Remove from localStorage
      let hiddenBoxesArray = await getSettings(SETTINGSNAME_HIDDEN_BOXES);
      hiddenBoxesArray = hiddenBoxesArray.filter(item => item.boxId !== parseInt(sectionId));
      let settingsName = "CSFD-Compare-hiddenBoxes";
      localStorage.setItem(settingsName, JSON.stringify(hiddenBoxesArray));

      // Show section
      let $section = $(`section[data-box-id="${sectionId}"`);
      $section.show();

      // Remove button
      $element.remove();
    });

    if (DEV_PANEL_ALWAYS_VISIBLE === true) {  // DEV SETTINGS
      $(button).addClass("active");
      $(button).on("click", function (event) {
        // React only to clicks on the button itself
        if (!event.target.className.includes("csfd-compare-menu")) {
          return;
        }
        // Toggle active class
        if ($(button).hasClass("active")) {
          $(button).removeClass("active");
        } else {
          $(button).addClass("active");
        }
      });
    } else {
      let timer;
      $(button).on("mouseover", function () {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (!$(button).hasClass("active")) {
          $(button).addClass("active");
        }
      });

      $(button).on("mouseleave", function () {
        if ($(button).hasClass("active")) {
          timer = setTimeout(() => {
            $(button).removeClass("active");
          }, 200);
        }
      });
    }

    $(button).find("#btnResetSettings").on("click", async function () {
      console.debug("Resetting 'CSFD-Compare-settings' settings...");
      localStorage.removeItem("CSFD-Compare-settings");
      location.reload();
    });

    $(button).find("#btnRemoveSavedRatings").on("click", async () => {
      const username = await this.getUsername();

      if (!username) {
        alert("Nejprve se přihlašte.");
        return;
      }

      if (!confirm(`Opravdu chcete smazat uložená hodnocení uživatele ${username}?`)) {
        return;
      }

      console.debug(`Removing saved ratings for user '${username}'...`);
      localStorage.removeItem(`CSFD-Compare_${username}`);
      location.reload();
    });

    $(button).find("#btnRemoveDBRatings").on("click", async () => {
      const username = await this.getUsername();

      if (!username) {
        alert("Nejprve se přihlašte.");
        return;
      }

      if (!confirm(`Opravdu chcete smazat všechna hodnocení z databáze?`)) {
        return;
      }

      console.debug(`Removing all ratings from database...`);
      await deleteAllDataFromIndexedDB(INDEXED_DB_NAME, username)
      location.reload();
    });
  }

  async checkAndUpdateCurrentRating() {
    const { rating, computedFrom, computed } = await this.getCurrentFilmRating();
    console.log(`Current rating: ${rating}, computedFrom: ${computedFrom}, computed: ${computed}`);

    const currentFilmDateAdded = await this.getCurrentFilmDateAdded();
    console.log(`Current film date added: ${currentFilmDateAdded}`);

    const filmUrl = await this.getCurrentFilmUrl();
    console.log(`Current film url: ${filmUrl}`);

    const filmId = await this.getMovieIdFromUrl(filmUrl);
    console.log(`Current film id: ${filmId}`);

    // Check if current film is in IndexedDb
    const filmInIndexedDb = await getItemsFromIndexedDB(INDEXED_DB_NAME, await this.getUsername(), [filmId]);
    console.log(`Film in IndexedDb:`, filmInIndexedDb);

    // In case user removed rating, we need to remove it from the LC
    if (rating === "" && filmInIndexedDb.length > 0) {
      console.info("☠️ No rating on current page, but exists in DB => Removing in DB...");
      const removed = await deleteItemFromIndexedDB(INDEXED_DB_NAME, await this.getUsername(), filmId);

      if (removed) {
        console.info("☠️ Movie removed from DB.");
        await this.updateControlPanelRatingCount();
        const cur_rat = await getIndexedDBLength(INDEXED_DB_NAME, this.username);
        console.log(`☠️ IndexedDB length: ${cur_rat}`);
      }
      return;
    }

    // Ignore if current film is not rated
    if (rating === "") {
      console.log("Current film is not rated, skipping...");
      return;
    }

    // Check if current page rating corresponds with that in LocalStorage, if not, update it
    const filmFullUrl = await this.getCurrentFilmFullUrl();
    const filmName = await this.getFilmNameFromFullUrl(filmFullUrl);
    const type = await this.getCurrentFilmType();
    const year = await this.getCurrentFilmYear();
    const lastUpdate = await this.getCurrentDateTime()
    const movieId = await this.getMovieIdFromUrl(filmUrl);
    console.log(`Current film id: ${movieId}, ${typeof (movieId)}`);
    const parentName = await this.getParentNameFromUrl(filmFullUrl);
    const parentId = await this.getMovieIdFromUrl(parentName);


    const ratingsObject = {
      url: filmName,
      fullUrl: filmFullUrl,
      rating: rating,
      date: currentFilmDateAdded,
      type: type,
      year: year,
      id: movieId,
      parentName: parentName,
      parentId: parentId,
      computed: computed,
      computedCount: computed ? await this.getCurrentFilmComputedCount() : NaN,
      computedFromText: computed ? computedFrom : "",
      lastUpdate: lastUpdate,
    };
    const dataToUpdate = { [movieId]: ratingsObject };
    console.log(`Data to update:`, dataToUpdate);

    const updated = await saveToIndexedDB(INDEXED_DB_NAME, this.username, dataToUpdate);
    if (updated) {
      console.info("✅ Updated record in DB.");
      // Without async because we don't need to wait for it
      this.updateControlPanelRatingCount();
    }
  }

 /**
 * Returns current DateTime, e.g. 11.10.2022 1:49:42
 * @returns {str} DateTime in format DD.MM.YYYY hh:mm:ss
 */
  async getCurrentDateTime() {
    // SLOW AF
    // const d = new Date();
    // const dateFormat = d.toLocaleString('en-GB', {
    //   day: '2-digit',
    //   month: '2-digit',
    //   year: 'numeric',
    //   hour: '2-digit',
    //   minute: '2-digit',
    //   second: '2-digit',
    // });
    // // 'DD/MM/YYYY, hh:mm:ss' --> 'DD.MM.YYYY hh:mm:ss'
    // const dateFormatFixed = dateFormat.replace(/\//g, '.').replace(',', '');
    // return dateFormatFixed;

    const d = new Date
    const dateFormat = [
      d.getDate(),
      d.getMonth() + 1,
      d.getFullYear()
    ].join('.') + ' ' + [
      d.getHours(),
      d.getMinutes(),
      d.getSeconds()
    ].join(':');
    return dateFormat
  }

  /**
   * When user wants to open message, he needs to click on 'více' link.
   * This removes the 'více' link and enables to click on the message.
   *
   * @returns {None}
   */
  clickableMessages() {
    const $messagesBox = $('.dropdown-content.messages');
    const $moreSpan = $messagesBox.find('.span-more-small');
    if ($moreSpan.length < 1) { return; }

    for (const $span of $moreSpan) {

      // Hide "... více" button
      $($span).hide();

      const $content = $($span).closest('.article-content');
      const $article = $content.closest('article');
      $content.on('hover', function () {
        $article.css('background-color', '#e1e0e0');
      }, function () {
        $article.css('background-color', 'initial');
      });

      const href = $($span).find('a').attr('href');
      $content.wrap(`<a href="${href}"></a>`);
    }
  }

  async clickableHeaderBoxes() {
    // CLICKABLE HEADER BUTTONS
    $(".user-link.wantsee").on("click", function () {
      location.href = "/chci-videt/";
    });
    $(".user-link.favorites").on("click", function () {
      location.href = "/soukrome/oblibene/";  // TODO: Toto pry nefunguje
    });
    $(".user-link.messages").on("click", function () {
      location.href = "/posta/";
    });

    // CLICKABLE HEADER DIVS
    const headers = $('.dropdown-content-head,.box-header');
    for (const div of headers) {
      const btn = $(div).find('a.button');

      if (btn.length === 0) { continue; }
      if (!["více", "viac"].includes(btn[0].text.toLowerCase())) { continue; }

      $(div).wrap(`<a href="${btn.attr('href')}"></a>`);

      const h2 = $(div).find('h2');
      const spanCount = h2.find('span.count');
      $(div)
        .on('mouseover', () => {
          $(div).css({ backgroundColor: '#ba0305' });
          $(h2[0]).css({ backgroundColor: '#ba0305', color: '#fff' });
          if (spanCount.length == 1) { spanCount[0].style.color = '#fff'; }
        })
        .on('mouseout', () => {
          if ($(div).hasClass('dropdown-content-head')) {
            $(div).css({ backgroundColor: '#ececec' });
          } else {
            $(div).css({ backgroundColor: '#e3e3e3' });
          }
          $(h2[0]).css({ backgroundColor: 'initial', color: 'initial' });
          if (spanCount.length == 1) { spanCount[0].style.color = 'initial'; }
        });
    }
  }

  hideSelectedUserReviews() {
    let articleHeaders = $('.article-header-review-name');
    for (const element of articleHeaders) {
      let userTitle = $(element).find('.user-title-name');
      if (userTitle.length != 1) { continue; }
      let ignoredUser = settings.hideSelectedUserReviewsList.includes(userTitle[0].text);
      if (!ignoredUser) { continue; }
      $(element).closest('article').hide();
    }
  }

  /**
   * Hide selected visitors from the "Personal-Favorites" page and "Visitors" page.
   * Hides each row where the username is in the settings.hideSelectedVisitorsList
   * @returns {Promise<None>}
   */
  async hideSelectedVisitors() {
    const start = performance.now();

    // Hide visitors from TABLE
    const rows = document.getElementsByTagName("tr");
    // Check if there is a <td> with both <img> and <a>
    for (const row of rows) {
      // Ignore headers
      if (row.getElementsByTagName("td").length < 2) { continue; }
      const td = row.getElementsByTagName("td")[1];
      // Ignore if there is no <img> (country flag) AND <a> (username)
      if (td.getElementsByTagName("img").length !== 1) { continue; }
      if (td.getElementsByTagName("a").length !== 1) { continue; }
      const a = td.getElementsByTagName("a")[0];
      const username = a.text;
      if (settings.hideSelectedVisitorsList.includes(username)) {
        row.style.display = "none";
      }
    }
    // Hide visitors from WHO-FAVORS-ME
    const articles = document.querySelectorAll('.who-favors-me-users article');
    articles.forEach(article => {
      const username = article.querySelector('header a').textContent.trim();
      if (settings.hideSelectedVisitorsList.includes(username)) {
        article.style.display = 'none';
      }
    });

    const end = performance.now();
    const time = (end - start) / 1000;
    console.debug(`[CC] hideSelectedVisitors() Time: ${time} seconds`);
  }

  /**
   * @param {string} content
   * @returns {Promise<{rating: string, computedFrom: string, computed: boolean}>}
   */
  async getCurrentFilmDateAdded(content = null) {
    // content = content === null
    //   ? this.csfdPage
    //   : $(content);

    // let ratingText = content.find('span.stars-rating.initialized').attr('title');
    // if (ratingText === undefined) {
    //   // Grab the rating date from mobile-rating
    //   ratingText = content.find('.mobile-film-rating-detail a span').attr('title');
    //   if (ratingText === undefined) {
    //     return "";
    //   }
    // }
    // let match = ratingText.match("[0-9]{2}[.][0-9]{2}[.][0-9]{4}");
    // if (match !== null) {
    //   let ratingDate = match[0];
    //   return ratingDate;
    // }
    // return "";

    if (content === null) {
      content = this.csfdPage;
    }

    // Get 'span.stars-rating.initialized' and attribute 'title'
    let ratingText = content.querySelector('span.stars-rating').getAttribute('title');

    if (ratingText === null) {
      // Grab the rating date from mobile-rating
      ratingText = content.querySelector('.mobile-film-rating-detail a span').getAttribute('title');
      if (ratingText === null) {
        return "";
      }
    }

    let match = ratingText.match("[0-9]{2}[.][0-9]{2}[.][0-9]{4}");

    if (match !== null) {
      let ratingDate = match[0];
      return ratingDate;
    }
    return "";
  }

  async addRatingsDate() {
    // Grab the rating date from stars-rating
    let ratingText = $('span.stars-rating.initialized').attr('title');
    if (ratingText === undefined) {
      // Grab the rating date from mobile-rating
      ratingText = $('.mobile-film-rating-detail a span').attr('title');
      if (ratingText === undefined) {
        return;
      }
    }
    let match = ratingText.match("[0-9]{2}[.][0-9]{2}[.][0-9]{4}");
    if (match !== null) {
      let ratingDate = match[0];
      let $myRatingCaption = $('.my-rating h3');
      $myRatingCaption.html(`${$myRatingCaption.text()}<br>${ratingDate}`);
    }
  }

  /**
   * From the title of .current-user-rating span get 'spocteno ze serii: x'
   * and add it bellow the 'Moje hodnoceni' text
   */
  async addRatingsComputedCount() {
    const $computedStars = $('.star.active.computed');
    const isComputed = $computedStars.length != 0;
    if (!isComputed) { return; }
    const fromRatingsText = this.csfdPage.find('.current-user-rating > span').attr('title');
    if (fromRatingsText === undefined) {
      return;
    }
    const $myRatingCaption = $('.my-rating h3');
    $myRatingCaption.html(`${$myRatingCaption.text()}<br>${fromRatingsText}`);
  }

  async checkForUpdate() {
    let pageHtml = await $.get(GREASYFORK_URL);
    let version = $(pageHtml).find('dd.script-show-version > span').text();
    return version;
  }

  async getChangelog() {
    let pageHtml = await $.get(`${GREASYFORK_URL}/versions`);
    let versionDateTime = $(pageHtml).find('.version-date').first().attr('datetime');
    let versionNumber = $(pageHtml).find('.version-number a').first().text();
    let versionDate = versionDateTime.substring(0, 10);
    let versionTime = versionDateTime.substring(11, 16);
    let changelogText = `
                <div style="font-size: 0.8rem; line-height: 1.5;">${versionDate} ${versionTime} (${versionNumber})<br>
                    <hr>
                    ${$(pageHtml).find('.version-changelog').html()}
                </div>
            `;
    return changelogText;
  }

  async initializeClassVariables() {
    this.userUrl = await this.getCurrentUser();
    this.username = await this.getUsername();
    this.storageKey = `${SCRIPTNAME}_${this.username}`;
    this.userRatingsUrl = location.origin.endsWith('sk') ? `${this.userUrl}/hodnotenia` : `${this.userUrl}/hodnoceni`;
    this.stars = await getAllFromIndexedDB(INDEXED_DB_NAME, this.username);
  }

  async updateControlPanelRatingCount() {  // TODO: KDE TOTO CO TOTO JE DO DULEZITE?
    const start = performance.now();

    const [current_ratings, rated] = await Promise.all([
      this.getCurrentUserRatingsCount(),
      getIndexedDBLength(INDEXED_DB_NAME, this.username)
    ]);

    const ratingsSpan = document.getElementById('cc-control-panel-rating-count');
    const computedSpan = document.getElementById('cc-control-panel-computed-count');

    ratingsSpan.textContent = `${rated.count} / ${current_ratings}`;
    console.log(`[CC] updateControlPanelRatingCount() ${rated.count} / ${current_ratings}`);
    const missingComputedRatingsCount = await this.getMissingComputedRatings();
    const computedRatingsCount = rated.computedCount + missingComputedRatingsCount;
    computedSpan.textContent = `${rated.computedCount} / ${computedRatingsCount}`;
    // computedSpan.textContent = `${rated.computedCount}`;
    // computedSpan.textContent = '¯\\_(ツ)_/¯';

    const end = performance.now();
    const time = (end - start) / 1000;
    console.debug(`[CC] updateControlPanelRatingCount() Time: ${time} seconds`);
  }

  async isRatingCountOk() {
    const { rated, computed } = await this.getLocalStorageRatingsCount();
    const current_ratings = await this.getCurrentUserRatingsCount();
    return rated === current_ratings
  }

  /**
   * For some reason, IMDb button to link current film does not have icon. This function adds it.
   *
   * @returns {Promise<void>}
   */
  async addImdbIcon() {
    const $image = $('<img>', {
      // src: 'https://cdn4.iconfinder.com/data/icons/logos-and-brands/512/171_Imdb_logo_logos-512.png',
      src: 'https://images.squarespace-cdn.com/content/v1/57c984f1cd0f68cf4beeb2cf/1472911999963-KH5AM2AU675ZGJUJEGQV/imdb+logo.png',
      alt: 'IMDB',
      title: 'IMDB',
      style: 'width: 26px; height: 26px; mix-blend-mode: darken;',
      class: 'imdb-icon',
    });
    const $imdbI = $('a.button-big.button-imdb i');
    $imdbI.css({ 'opacity': '1', 'background-color': '#f5c518' });
    $imdbI.append($image);
  }

  /**
   * On discussion pages, add a button to reply to user's own comments.
   *
   * Limitations:
   *  - If user replies to his own comment, he can't reply to the first someone else's comment.
   *  - Can't reply to multiple user's own comments at once.
   *
   * @returns {Promise<void>}
   */
  async addChatReplyButton() {

    // Get all divs with class 'icon-control' containing <i> with class 'icon-reply' in them (working reply buttons)
    const replyIconControlElements = $('.icon-control:has(i.icon-reply)');
    const $firstWorkingReplyIconControl = replyIconControlElements.first();
    const missingIconElements = $('.icon-control').not($(':has(i.icon-reply'));

    // Copy the working reply button and add it to the missingIconElements
    missingIconElements.each(async (index, element) => {

      // Clone working IconControl and remove potential '<a>' element whose child element has 'i.icon-trash'
      const $replyIconControlClone = $firstWorkingReplyIconControl.clone();
      $replyIconControlClone.find('a:has(i.icon-trash)').remove();

      const $replyIconCloneHref = $replyIconControlClone.find('a');  // TODO: not trash
      const $userTitle = element.closest('.article-content').querySelector('a.user-title-name');

      const username = $userTitle.text;
      const userId = $userTitle.href.split("/")[4].split("-")[0]
      const postId = element.closest('article').getAttribute('id').split('-')[2];

      $replyIconCloneHref.attr({
        'data-nick': username,
        'data-id': userId,
        'data-post': postId,
      });

      const $replyIconClone = $replyIconControlClone.find('i.icon-reply');
      $replyIconClone.on('click', () => {
        const $originalHref = $firstWorkingReplyIconControl.find('a');

        // Save original state
        const originalState = {
          'data-nick': $originalHref.attr('data-nick'),
          'data-id': $originalHref.attr('data-id'),
          'data-post': $originalHref.attr('data-post'),
        };

        // Edit the working reply button to contain the correct data
        $originalHref.attr({
          'data-nick': username,
          'data-id': userId,
          'data-post': postId,
        });

        // Trigger the click on the working reply button
        $originalHref.find('i.icon-reply').trigger('click');

        // Return the working reply button to its original state
        $originalHref.attr({
          'data-nick': originalState['data-nick'],
          'data-id': originalState['data-id'],
          'data-post': originalState['data-post'],
        });
      });

      $(element).append($replyIconCloneHref);
    });
  }
}

(async () => {
  "use strict";
  /* globals jQuery, $, waitForKeyElements */
  /* jshint -W069 */
  /* jshint -W083 */
  /* jshint -W075 */




  // ============================================================================================
  // SCRIPT START
  // ============================================================================================
  if (!('indexedDB' in window)) {
    console.warn("[CC] !!! ====================================== !!!");
    console.warn("[CC] !!! This browser doesn't support IndexedDB !!!");
    console.warn("[CC] !!! Ratings will be saved in Local Storage !!!");
    console.warn("[CC] !!! ====================================== !!!");
  }

  await delay(20);  // Greasemonkey workaround, wait a little bit for page to somehow load
  console.debug("CSFD-Compare - Script started")
  const csfd = new Csfd($('div.page-content'));

  // =================================
  // PROFILING METHODS
  // =================================
  profileMethod(csfd, 'addHideSectionButton');
  profileMethod(csfd, 'addImdbIcon');
  profileMethod(csfd, 'addRatingsComputedCount');
  profileMethod(csfd, 'addRatingsDate');
  profileMethod(csfd, 'addSettingsEvents');
  profileMethod(csfd, 'addSettingsPanel');
  profileMethod(csfd, 'addStars');
  profileMethod(csfd, 'checkAndUpdateCurrentRating');
  profileMethod(csfd, 'checkForUpdate');
  profileMethod(csfd, 'clickableHeaderBoxes');
  profileMethod(csfd, 'getChangelog');
  profileMethod(csfd, 'getCurrentFilmDateAdded');
  profileMethod(csfd, 'getUsername');
  profileMethod(csfd, 'helpImageComponent');
  profileMethod(csfd, 'hideSelectedVisitors');
  profileMethod(csfd, 'initializeClassVariables');
  profileMethod(csfd, 'isRatingCountOk');
  profileMethod(csfd, 'loadInitialSettings');
  profileMethod(csfd, 'onPageDiskuze');
  profileMethod(csfd, 'onPageOtherUser');
  profileMethod(csfd, 'onPageOtherUserHodnoceni');
  profileMethod(csfd, 'onPersonalFavorite');
  profileMethod(csfd, 'removableHomeBoxes');
  profileMethod(csfd, 'settingsPanelComponent');
  profileMethod(csfd, 'showOnOneLine');
  profileMethod(csfd, 'updateControlPanelRatingCount');
  profileMethod(csfd, 'parseMoviePage');
  // =================================
  // PROFILING ASYNC FUNCTIONS
  // =================================
  onHomepage = profileAsyncFunction(onHomepage, 'onHomepage');
  getSettings = profileAsyncFunction(getSettings, 'getSettings');
  initIndexedDB = profileAsyncFunction(initIndexedDB, 'initIndexedDB');
  checkSettingsValidity = profileAsyncFunction(checkSettingsValidity, 'checkSettingsValidity');
  deleteAllDataFromIndexedDB = profileAsyncFunction(deleteAllDataFromIndexedDB, 'deleteAllDataFromIndexedDB');
  deleteIndexedDB = profileAsyncFunction(deleteIndexedDB, 'deleteIndexedDB');
  deleteItemFromIndexedDB = profileAsyncFunction(deleteItemFromIndexedDB, 'deleteItemFromIndexedDB');
  doesIndexedDBExist = profileAsyncFunction(doesIndexedDBExist, 'doesIndexedDBExist');
  getAllFromIndexedDB = profileAsyncFunction(getAllFromIndexedDB, 'getAllFromIndexedDB');
  getIndexedDBLength = profileAsyncFunction(getIndexedDBLength, 'getIndexedDBLength');
  getItemsByPropertyFromIndexedDB = profileAsyncFunction(getItemsByPropertyFromIndexedDB, 'getItemsByPropertyFromIndexedDB');
  getItemsFromIndexedDB = profileAsyncFunction(getItemsFromIndexedDB, 'getItemsFromIndexedDB');
  mergeDict = profileAsyncFunction(mergeDict, 'mergeDict');
  refreshTooltips = profileAsyncFunction(refreshTooltips, 'refreshTooltips');
  saveToIndexedDB = profileAsyncFunction(saveToIndexedDB, 'saveToIndexedDB');
  updateIndexedDB = profileAsyncFunction(updateIndexedDB, 'updateIndexedDB');



  // =================================
  // LOAD SETTINGS
  // =================================
  await csfd.fillMissingSettingsKeys();

  const settings = await getSettings();

  // =================================
  // Page - Soukrome
  // =================================
  if (location.href.includes('/soukrome/') || location.href.includes('/sukromne/')) {
    if (settings.hideSelectedVisitors) { csfd.hideSelectedVisitors(); }
  }

  // =================================
  //
  // =================================
  await csfd.addSettingsPanel();
  await csfd.loadInitialSettings();
  await csfd.addSettingsEvents();


  // =================================
  // GLOBAL
  // =================================
  csfd.addImdbIcon();

  if (settings.clickableHeaderBoxes) { csfd.clickableHeaderBoxes(); }
  // TODO: Toto nic nedela???
  if (settings.showControlPanelOnHover) { csfd.openControlPanelOnHover(); }


  // =================================
  // Page - Film/Series
  // =================================
  if (location.href.includes('/film/') || location.href.includes('/tvurce/') || location.href.includes('/tvorca/')) {
    if (settings.hideSelectedUserReviews) { csfd.hideSelectedUserReviews(); }
    if (settings.showLinkToImage) { csfd.showLinkToImage(); }
    if (settings.ratingsEstimate) { csfd.ratingsEstimate(); }
    if (settings.ratingsFromFavorites) { csfd.ratingsFromFavorites(); }
  }

  // =================================
  // Page - Tvurce
  // =================================
  if (location.href.includes('/tvurce/') || location.href.includes('/tvorca/')) {
    if (settings.showOnOneLine) { csfd.showOnOneLine(); }
  }


  // =================================
  // Page - Homepage
  // =================================
  if (await onHomepage()) { csfd.removableHomeBoxes(); }

  // =================================
  // NOT LOGGED IN
  // =================================
  if (!await csfd.isLoggedIn()) {
    // User page
    if (location.href.includes('/uzivatel/')) {
      if (settings.hideUserControlPanel) { csfd.hideUserControlPanel(); }
    }
  }


  // =================================
  // LOGGED IN
  // =================================
  if (await csfd.isLoggedIn()) {
    // Init IndexedDB
    await initIndexedDB(INDEXED_DB_NAME, await csfd.getUsername());

    // Global settings without category
    await csfd.initializeClassVariables();

    csfd.checkForOldLocalstorageRatingKeys();

    // Update user ratings count
    csfd.updateControlPanelRatingCount();

    // =================================
    // Page - Diskuze
    // =================================
    if (await csfd.onPageDiskuze() && settings.addChatReplyButton) {
      csfd.addChatReplyButton()
    }

    if (settings.addStars && await csfd.notOnUserPage()) { csfd.addStars(); }

    let ratingsInLocalStorage = 0;
    let computedRatingsInLocalStorage = 0;
    let currentUserRatingsCount = 0;
    if (settings.addStars || settings.compareUserRatings) {
      const { computed, rated } = await csfd.getLocalStorageRatingsCount();
      ratingsInLocalStorage = rated;
      computedRatingsInLocalStorage = computed;
      currentUserRatingsCount = await csfd.getCurrentUserRatingsCount();
      if (ratingsInLocalStorage !== currentUserRatingsCount) {
        csfd.refreshButtonNew(ratingsInLocalStorage, currentUserRatingsCount, computedRatingsInLocalStorage);
        csfd.badgesComponent(ratingsInLocalStorage, currentUserRatingsCount, computedRatingsInLocalStorage);
        await csfd.addWarningToUserProfile();
      } else {
        csfd.userRatingsCount = currentUserRatingsCount;
      }
      csfd.btnLoadComputedRatings();  // TODO:
    }

    // =================================
    // Header modifications
    // =================================
    if (settings.clickableMessages) { csfd.clickableMessages(); }

    // =================================
    // Page - Film
    // =================================
    if (location.href.includes('/film/')) {
      if (settings.addRatingsDate) { csfd.addRatingsDate(); }
      if (settings.addRatingsComputedCount) { csfd.addRatingsComputedCount(); }

      // Dynamic LocalStorage update on Film/Series in case user changes ratings
      await csfd.checkAndUpdateCurrentRating();
    }

    // =================================
    // Page - Other User
    // =================================
    if (await csfd.onPageOtherUser()) {
      if (settings.displayMessageButton) { csfd.displayMessageButton(); }
      if (settings.displayFavoriteButton) { csfd.displayFavoriteButton(); }
      if (settings.hideUserControlPanel) { csfd.hideUserControlPanel(); }
      if (await csfd.onPageOtherUserHodnoceni()) {
        if (settings.compareUserRatings) { csfd.addRatingsColumn(); }
      }
    }
  }

  // let t0 = performance.now();
  // const $siteHtml = await $.get(GREASYFORK_URL);
  // let t1 = performance.now();
  // console.log("Call to 'await $.get(GREASYFORK_URL)' took " + (t1 - t0) + " ms.");

  // =================================
  // Check for update
  // =================================
  // If not already in session storage, get new version from greasyfork and display changelog over version link
  let updateCheckJson = sessionStorage.updateChecked !== undefined ? JSON.parse(sessionStorage.updateChecked) : {};
  let $verLink = $('#script-version');
  if (Object.keys(updateCheckJson).length !== 0) {
    const difference = (Date.now() - updateCheckJson.lastCheck) / 60 / 60 / 60;
    const curVersion = VERSION.replace('v', '');
    // If more than 5 minutes, check for update
    if (difference >= 5) {
      let version = await csfd.checkForUpdate();
      let changelogText = await csfd.getChangelog();
      updateCheckJson.changelogText = changelogText;
      $verLink.attr("data-tippy-content", changelogText);
      if (version !== curVersion) {
        updateCheckJson.newVersion = true;
        updateCheckJson.newVersionNumber = version;

        let versionText = `${$verLink.text()} (Update v${version})`;
        $verLink.text(versionText);
        updateCheckJson.versionText = versionText;
      } else {
        updateCheckJson.newVersion = false;
        updateCheckJson.versionText = VERSION;
      }
      updateCheckJson.lastCheck = Date.now();
      sessionStorage.updateChecked = JSON.stringify(updateCheckJson);
    } else {
      if (updateCheckJson.newVersion === true) {
        if (updateCheckJson.newVersionNumber === curVersion) {
          $verLink.text(`v${curVersion}`);
        } else {
          const versionText = `${$verLink.text()} (Update v${updateCheckJson.newVersionNumber})`;
          $verLink.text(versionText);
        }
        $verLink.attr("data-tippy-content", updateCheckJson.changelogText);
      } else {
        $verLink.attr("data-tippy-content", updateCheckJson.changelogText);
      }
      // $('#script-version')
      //     .text(updateCheckJson.versionText)
      //     .attr("data-tippy-content", updateCheckJson.changelogText);
    }

  } else {
    let version = await csfd.checkForUpdate();
    let curVersion = VERSION.replace('v', '');
    if (version !== curVersion) {
      updateCheckJson.newVersion = true;
      let $verLink = $('#script-version');
      let versionText = `${$verLink.text()} (Update v${version})`;
      updateCheckJson.versionText = versionText;
      updateCheckJson.newVersionNumber = version;
      let changelogText = await csfd.getChangelog();
      $verLink.text(versionText);
      updateCheckJson.changelogText = changelogText;
      $verLink.attr("data-tippy-content", changelogText);
    } else {
      updateCheckJson.changelogText = await csfd.getChangelog();
      updateCheckJson.newVersion = false;
      updateCheckJson.versionText = VERSION;
      $('#script-version').attr("data-tippy-content", updateCheckJson.changelogText);
    }
    updateCheckJson.lastCheck = Date.now();
    sessionStorage.updateChecked = JSON.stringify(updateCheckJson);
  }

  // Call TippyJs constructor
  await refreshTooltips();
  console.table(profilingData);
  // console.log({ memoizeData });

  // =================================
  // TEST
  // =================================
  // const api = new Api();
  // const url = 'https://csfdb.noirgoku.eu/api/v1/movies/byids/';
  // const res = await api.getCurrentPageRatings(url);
  // console.log("CURRENT PAGE RATINGS");
  // console.log(res);

})();

// Check if module object exists and export Csfd class
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    Csfd,
    onHomepage,
  };
}
