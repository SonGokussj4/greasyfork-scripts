// ==UserScript==
// @name         ČSFD Compare DEV
// @version      0.7.0
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @match        *://*csfd.cz/*
// @match        *://*csfd.sk/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://greasyfork.org/scripts/449554-csfd-compare-utils/code/csfd-compare-utils.js?version=1100309
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /*
   * Config and constants for CSFD-Compare
   */
  const SETTINGSNAME = 'CSFD-Compare-settings';
  const NUM_RATINGS_PER_PAGE = 50;
  const INDEXED_DB_NAME = 'CC-Ratings';
  const RATINGS_STORE_NAME = 'ratings';

  async function getSettings(settingsName = 'CSFD-Compare-settings', defaultSettings = {}) {
    if (!localStorage.getItem(settingsName)) {
      localStorage.setItem(settingsName, JSON.stringify(defaultSettings));
      return defaultSettings;
    } else {
      return JSON.parse(localStorage.getItem(settingsName));
    }
  }

  async function initIndexedDB(dbName, storeName) {
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

  async function saveToIndexedDB(dbName, storeName, data) {
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

  async function getAllFromIndexedDB(dbName, storeName) {
    const db = await initIndexedDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteItemFromIndexedDB(dbName, storeName, id) {
    const db = await initIndexedDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function delay(t) {
    return new Promise((resolve) => setTimeout(resolve, t));
  }

  class Csfd {
    constructor(pageContent) {
      this.csfdPage = pageContent;
      this.stars = {};
      this.storageKey = undefined;
      this.userUrl = undefined;
      this.username = undefined;
      this.userRatingsUrl = undefined;
      this.isLoggedIn = false; // New property
      this.userSlug = undefined;
    }

    /**
     *
     * @returns {string|undefined} - Returns the user URL or undefined if not found
     * @description - This function retrieves the current user's URL from the CSFD page and sets isLoggedIn.
     */
    async getCurrentUser() {
      const userEl = document.querySelector('.profile.initialized');
      if (userEl) {
        this.isLoggedIn = true;
        return userEl.getAttribute('href');
      }
      this.isLoggedIn = false;
      console.debug('🟣 User not found');
      return undefined;
    }

    /**
     * @returns {string|undefined} - Returns the username or undefined if not found
     * @description - This function retrieves the current user's username from the CSFD page.
     */
    async getUsername() {
      const userHref = await this.getCurrentUser();
      if (!userHref) {
        console.debug('🟣 User URL not found');
        return undefined;
      }
      const match = userHref.match(/\/(\d+)-(.+?)\//);
      if (match && match.length >= 3) {
        this.username = match[2];
        return this.username;
      }
      console.debug('🟣 Username not found');
      return undefined;
    }

    getIsLoggedIn() {
      return this.isLoggedIn;
    }

    async initialize() {
      this.userUrl = await this.getCurrentUser();
      console.debug('🟣 User URL:', this.userUrl);
      this.username = await this.getUsername();
      console.debug('🟣 Username:', this.username);
      this.storageKey = `${'CSFD-Compare'}_${this.username}`;
      this.userSlug = this.userUrl?.match(/^\/uzivatel\/(\d+-[^/]+)\//)?.[1];
      this.userRatingsUrl = this.userUrl + (location.origin.endsWith('sk') ? 'hodnotenia' : 'hodnoceni');
      console.debug('🟣 User URL:', this.userUrl);
      console.debug('🟣 Username:', this.username);
      console.debug('🟣 Storage Key:', this.storageKey);
      console.debug('🟣 User Ratings URL:', this.userRatingsUrl);
      const settings = await getSettings(SETTINGSNAME);
      if (settings) {
        this.stars = settings.stars;
      }
      if (!this.stars) {
        this.stars = {};
      }

      await this.loadStarsFromIndexedDb();
      await this.syncCurrentPageRatingWithIndexedDb();
    }

    getCurrentItemUrlAndIds() {
      const path = location.pathname || '';
      if (!path.includes('/film/')) {
        return {
          movieId: NaN,
          urlSlug: '',
          parentId: NaN,
          parentName: '',
          fullUrl: '',
        };
      }

      const slugMatches = Array.from(path.matchAll(/\/(\d+-[^/]+)/g)).map((match) => match[1]);
      const idMatches = slugMatches
        .map((slug) => Number.parseInt((slug.match(/^(\d+)-/) || [])[1], 10))
        .filter((id) => Number.isFinite(id));

      const movieId = idMatches.length ? idMatches[idMatches.length - 1] : NaN;
      const parentId = idMatches.length > 1 ? idMatches[0] : NaN;
      const parentName = slugMatches.length > 1 ? slugMatches[0] : '';
      const urlSlug = slugMatches.length ? slugMatches[slugMatches.length - 1] : '';

      const cleanPath = path.replace(/\/(recenze|komentare|prehled|prehlad)\/?$/i, '/');
      const fullUrl = `${location.origin}${cleanPath}`;

      return {
        movieId,
        urlSlug,
        parentId,
        parentName,
        fullUrl,
      };
    }

    getCurrentPageOwnRating() {
      const activeStars = Array.from(document.querySelectorAll('.my-rating .stars-rating a.star.active[data-rating]'));
      if (activeStars.length === 0) {
        return null;
      }

      const rawRatings = activeStars
        .map((star) => Number.parseInt(star.getAttribute('data-rating') || '', 10))
        .filter((value) => Number.isFinite(value));

      if (rawRatings.length === 0) {
        return null;
      }

      if (rawRatings.includes(0)) {
        return 0;
      }

      const maxRatingPercent = Math.max(...rawRatings);
      return Math.max(0, Math.min(5, Math.round(maxRatingPercent / 20)));
    }

    getCurrentPageRatingDate() {
      const title = document.querySelector('.my-rating .stars-rating')?.getAttribute('title') || '';
      const match = title.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
      return match ? match[1] : '';
    }

    getCurrentPageName() {
      const titleEl = document.querySelector('.film-header h1');
      return titleEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
    }

    getCurrentPageYear() {
      const originText = document.querySelector('.film-info-content .origin')?.textContent || '';
      const yearMatch = originText.match(/\b(19|20)\d{2}\b/);
      return yearMatch ? Number.parseInt(yearMatch[0], 10) : NaN;
    }

    getCurrentPageType() {
      const typeText = document.querySelector('.film-header .type')?.textContent?.toLowerCase() || '';
      if (typeText.includes('epizoda')) return 'episode';
      if (typeText.includes('seriál') || typeText.includes('serial')) return 'serial';
      if (typeText.includes('série') || typeText.includes('serie')) return 'series';
      return 'movie';
    }

    getCurrentPageComputedInfo() {
      const computedStars = document.querySelectorAll('.my-rating .stars-rating a.star.computed');

      const computedTitle =
        document.querySelector('.others-rating .current-user-rating [title*="spočten" i]')?.getAttribute('title') ||
        document.querySelector('.mobile-film-rating-detail [title*="spočten" i]')?.getAttribute('title') ||
        document.querySelector('.my-rating .stars-rating[title*="spočten" i]')?.getAttribute('title') ||
        document.querySelector('.others-rating .current-user-rating [title*="spocten" i]')?.getAttribute('title') ||
        document.querySelector('.mobile-film-rating-detail [title*="spocten" i]')?.getAttribute('title') ||
        document.querySelector('.my-rating .stars-rating[title*="spocten" i]')?.getAttribute('title') ||
        '';

      const isComputed = computedStars.length > 0 || computedTitle.length > 0;

      const computedCountMatch = computedTitle.match(/(\d+)/);
      const computedCount = computedCountMatch ? Number.parseInt(computedCountMatch[1], 10) : NaN;

      return {
        isComputed,
        computedFromText: computedTitle,
        computedCount,
      };
    }

    createCurrentPageRecord({ movieId, urlSlug, parentId, parentName, fullUrl, rating, existingRecord }) {
      const computedInfo = this.getCurrentPageComputedInfo();
      const nowIso = new Date().toISOString();
      return {
        ...(existingRecord || {}),
        id: `${this.userSlug}:${urlSlug}`,
        userSlug: this.userSlug,
        movieId,
        url: urlSlug,
        fullUrl,
        name: this.getCurrentPageName() || existingRecord?.name || '',
        year: this.getCurrentPageYear(),
        type: this.getCurrentPageType(),
        rating,
        date: this.getCurrentPageRatingDate() || existingRecord?.date || '',
        parentId,
        parentName,
        computed: computedInfo.isComputed,
        computedCount: computedInfo.computedCount,
        computedFromText: computedInfo.computedFromText,
        lastUpdate: nowIso,
      };
    }

    async syncCurrentPageRatingWithIndexedDb() {
      if (!this.userSlug || !this.getIsLoggedIn()) {
        return;
      }

      const pageInfo = this.getCurrentItemUrlAndIds();
      if (!Number.isFinite(pageInfo.movieId) || !pageInfo.urlSlug) {
        return;
      }

      let pageRating = this.getCurrentPageOwnRating();
      if (pageRating === null) {
        await delay(250);
        pageRating = this.getCurrentPageOwnRating();
      }

      const existingRecord = this.stars[pageInfo.movieId];
      const storageId = `${this.userSlug}:${pageInfo.urlSlug}`;

      if (pageRating === null) {
        if (existingRecord) {
          await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, storageId);
          delete this.stars[pageInfo.movieId];
          window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
        }
        return;
      }

      const normalizedExistingRating =
        typeof existingRecord === 'number'
          ? existingRecord
          : Number.isFinite(existingRecord?.rating)
            ? existingRecord.rating
            : NaN;

      const currentComputedInfo = this.getCurrentPageComputedInfo();
      const existingComputed = typeof existingRecord === 'object' && existingRecord?.computed === true;
      const existingComputedCount = Number.isFinite(existingRecord?.computedCount) ? existingRecord.computedCount : null;
      const currentComputedCount = Number.isFinite(currentComputedInfo.computedCount)
        ? currentComputedInfo.computedCount
        : null;
      const existingComputedText =
        typeof existingRecord?.computedFromText === 'string' ? existingRecord.computedFromText : '';
      const computedUnchanged =
        existingComputed === currentComputedInfo.isComputed &&
        existingComputedCount === currentComputedCount &&
        existingComputedText === currentComputedInfo.computedFromText;

      if (normalizedExistingRating === pageRating && existingRecord?.id === storageId && computedUnchanged) {
        return;
      }

      const newRecord = this.createCurrentPageRecord({
        ...pageInfo,
        rating: pageRating,
        existingRecord: typeof existingRecord === 'object' ? existingRecord : undefined,
      });

      await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, newRecord);
      this.stars[pageInfo.movieId] = newRecord;
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
    }

    async loadStarsFromIndexedDb() {
      if (!this.userSlug) {
        return;
      }

      try {
        const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
        const userRecords = records.filter(
          (record) => record.userSlug === this.userSlug && Number.isFinite(record.movieId),
        );

        for (const record of userRecords) {
          this.stars[record.movieId] = record;
        }
      } catch (error) {
        console.error('[CC] Failed to load stars from IndexedDB:', error);
      }
    }

    getCandidateFilmLinks() {
      return Array.from(document.querySelectorAll('a[href*="/film/"]')).filter((link) => {
        const href = link.getAttribute('href') || '';
        if (!/\/\d+-/.test(href)) {
          return false;
        }

        if (/\/(galerie|videa?|tvurci|obsahy?)\//.test(href)) {
          return false;
        }

        if (link.closest('.film-posters, .box-video, .gallery, .aside-movie-profile')) {
          return false;
        }

        if (link.closest('.article-header-review-action, .article-header-review')) {
          return false;
        }

        if (link.closest('.film-header-name, .film-header-name-control')) {
          return false;
        }

        if (link.querySelector('img')) {
          return false;
        }

        return true;
      });
    }

    isOnOwnRatingsPage() {
      if (!this.userSlug) {
        return false;
      }

      const path = location.pathname || '';
      if (!path.startsWith(`/uzivatel/${this.userSlug}/`)) {
        return false;
      }

      return path.includes('/hodnoceni/') || path.includes('/hodnotenia/');
    }

    getRatingsPageSlug() {
      const path = location.pathname || '';
      const match = path.match(/^\/uzivatel\/(\d+-[^/]+)\/(hodnoceni|hodnotenia)\/?/i);
      return match ? match[1] : undefined;
    }

    isOnForeignRatingsPage() {
      const ratingsPageSlug = this.getRatingsPageSlug();
      if (!ratingsPageSlug || !this.userSlug) {
        return false;
      }

      return ratingsPageSlug !== this.userSlug;
    }

    async addComparisonColumnOnForeignRatingsPage() {
      const getRatingsTables = () =>
        Array.from(
          document.querySelectorAll('#snippet--ratings table, #snippet-ratings table, .snippet-ratings table, table'),
        ).filter(
          (table) => table.querySelector('td.star-rating-only') && table.querySelector('td.name a[href*="/film/"]'),
        );

      let ratingsTables = getRatingsTables();
      if (ratingsTables.length === 0) {
        await delay(350);
        ratingsTables = getRatingsTables();
        if (ratingsTables.length === 0) {
          return;
        }
      }

      for (const table of ratingsTables) {
        table.classList.add('cc-compare-ratings-table');

        const rows = Array.from(table.querySelectorAll('tbody tr')).filter(
          (row) => row.querySelector('td.name a[href*="/film/"]') && row.querySelector('td.star-rating-only'),
        );

        if (rows.length === 0) {
          continue;
        }

        const headerRow = table.querySelector('thead tr');
        if (headerRow && !headerRow.querySelector('.cc-my-rating-col')) {
          const colHeader = document.createElement('th');
          colHeader.className = 'cc-my-rating-col';
          colHeader.textContent = 'Moje';
          const ratingHeader = headerRow.querySelector('th.star-rating-only');
          if (ratingHeader) {
            ratingHeader.insertAdjacentElement('beforebegin', colHeader);
          } else {
            headerRow.appendChild(colHeader);
          }
        }

        for (const row of rows) {
          if (row.querySelector('td.cc-my-rating-cell')) {
            continue;
          }

          const nameLink = row.querySelector('td.name a[href*="/film/"]');
          const ratingCell = row.querySelector('td.star-rating-only');
          if (!nameLink || !ratingCell) {
            continue;
          }

          const movieId = await this.getMovieIdFromUrl(nameLink.getAttribute('href'));
          const ratingRecord = this.stars[movieId];

          const myRatingCell = document.createElement('td');
          myRatingCell.className = 'cc-my-rating-cell star-rating-only';

          if (ratingRecord) {
            const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
            const isComputed = typeof ratingRecord === 'object' && ratingRecord?.computed === true;
            const starElement = this.createStarElement(ratingValue, isComputed);
            if (starElement) {
              starElement.classList.remove('cc-own-rating');
              myRatingCell.appendChild(starElement);
            }
          }

          ratingCell.insertAdjacentElement('beforebegin', myRatingCell);
        }
      }
    }

    createStarElement(ratingValue, isComputed = false) {
      if (!Number.isFinite(ratingValue)) {
        return undefined;
      }

      const starRating = document.createElement('span');
      starRating.className = 'star-rating cc-own-rating';
      if (isComputed) {
        starRating.classList.add('computed', 'cc-own-rating-computed');
      }

      const stars = document.createElement('span');
      stars.className = 'stars';

      if (ratingValue === 0) {
        stars.classList.add('trash');
      } else {
        const normalizedRating = Math.min(5, Math.max(1, ratingValue));
        stars.classList.add(`stars-${normalizedRating}`);
      }

      starRating.appendChild(stars);
      return starRating;
    }

    async addStars() {
      if (this.isOnOwnRatingsPage()) {
        return;
      }

      if (this.isOnForeignRatingsPage()) {
        await this.addComparisonColumnOnForeignRatingsPage();
        return;
      }

      const links = this.getCandidateFilmLinks();
      for (let link of links) {
        if (link.dataset.ccStarAdded === 'true') {
          continue;
        }

        const movieId = await this.getMovieIdFromUrl(link.getAttribute('href'));
        const ratingRecord = this.stars[movieId];
        if (!ratingRecord) continue;

        const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
        const isComputed = typeof ratingRecord === 'object' && ratingRecord?.computed === true;
        const starElement = this.createStarElement(ratingValue, isComputed);
        if (!starElement) continue;

        link.insertAdjacentElement('afterend', starElement);
        link.dataset.ccStarAdded = 'true';
      }
    }

    async getMovieIdFromUrl(url) {
      if (!url) return NaN;

      const matches = Array.from(url.matchAll(/\/(\d+)-/g));
      if (matches.length === 0) {
        return NaN;
      }

      return Number(matches[matches.length - 1][1]);
    }
  }

  function styleInject(css, ref) {
    if ( ref === void 0 ) ref = {};
    var insertAt = ref.insertAt;

    if (!css || typeof document === 'undefined') { return; }

    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';

    if (insertAt === 'top') {
      if (head.firstChild) {
        head.insertBefore(style, head.firstChild);
      } else {
        head.appendChild(style);
      }
    } else {
      head.appendChild(style);
    }

    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
  }

  var css_248z$3 = ".alert-content{position:relative;text-align:center}.close-btn{background:none;border:none;color:#7f8c8d;cursor:pointer;font-size:20px;position:absolute;right:10px;top:10px;-webkit-transition:color .2s;transition:color .2s}.close-btn:hover{color:#f5f5f5}.fancy-alert-button{position:fixed;right:10px;top:10px;z-index:1000}.modal-overlay{background:rgba(0,0,0,.5);display:-webkit-box;display:-ms-flexbox;display:flex;height:100%;left:0;position:fixed;top:0;width:100%;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;-webkit-box-align:center;-ms-flex-align:center;align-items:center;opacity:0;-webkit-transition:opacity .3s ease;transition:opacity .3s ease;z-index:10000}.modal-overlay.visible{opacity:1}";
  styleInject(css_248z$3);

  var css_248z$2 = ".fancy-alert{background:#fff;border-radius:8px;-webkit-box-shadow:0 5px 15px rgba(0,0,0,.3);box-shadow:0 5px 15px rgba(0,0,0,.3);max-width:400px;padding:25px;-webkit-transform:translateY(-20px);transform:translateY(-20px);-webkit-transition:-webkit-transform .3s ease;transition:-webkit-transform .3s ease;transition:transform .3s ease;transition:transform .3s ease,-webkit-transform .3s ease;width:90%}.modal-overlay.visible .fancy-alert{-webkit-transform:translateY(0);transform:translateY(0)}.alert-title{color:#2c3e50;font-size:1.5em;margin-bottom:15px}.alert-message{color:#34495e;line-height:1.6;margin-bottom:20px}.alert-button{background:#3498db;border:none;border-radius:4px;color:#fff;cursor:pointer;height:auto;padding:8px 20px;-webkit-transition:background .2s;transition:background .2s}.alert-button:hover{background:#2980b9}";
  styleInject(css_248z$2);

  var css_248z$1 = ".dropdown-content.cc-settings{border-radius:10px;margin-top:0;padding:8px 0 2px;right:8px;top:100%;width:360px}.cc-settings-head{-webkit-box-pack:justify;-ms-flex-pack:justify;background:#f9f9f9;border-radius:8px;justify-content:space-between;margin:0 8px 8px;padding:8px}.cc-head-main,.cc-settings-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-head-main{gap:6px}.cc-head-main h2{margin:0}.cc-version-link{font-size:12px;opacity:.85}.cc-head-badges,.cc-head-tools{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-head-cc-link{font-weight:700;min-width:26px;text-align:center}.cc-icon-btn{border:0;border-radius:7px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:24px;width:24px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#242424;color:#fff;cursor:pointer;justify-content:center;text-decoration:none;-webkit-transition:background-color .16s ease,-webkit-transform .12s ease;transition:background-color .16s ease,-webkit-transform .12s ease;transition:background-color .16s ease,transform .12s ease;transition:background-color .16s ease,transform .12s ease,-webkit-transform .12s ease}.cc-icon-btn:hover{background:#111;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-icon-btn:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-icon-btn-sync.is-enabled{background:#aa2c16}.cc-sync-icon-btn{border:1px solid #cfcfcf;border-radius:8px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:28px;width:28px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;color:#202020;cursor:pointer;justify-content:center;padding:0;text-decoration:none;-webkit-transition:background-color .15s ease,border-color .15s ease,color .15s ease;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.cc-sync-icon-btn:hover{background:#f3f3f3;border-color:#bdbdbd;color:#aa2c16}.cc-sync-icon-btn:focus,.cc-sync-icon-btn:focus-visible{background:#f3f3f3;border-color:#b0b0b0;color:#aa2c16;outline:none}.cc-sync-icon-btn.is-enabled{background:#fff3f0;border-color:#cf7c6d;color:#aa2c16}.cc-script-link-btn svg{height:14px;width:14px}.cc-badge{background-color:#2c3e50;border-radius:6px;color:#fff;cursor:help;font-size:11.2px;font-size:.7rem;font-weight:700;line-height:1.4;padding:2px 6px}.cc-badge-red{background-color:#aa2c16}.cc-badge-black{background-color:#000}.cc-button{border:none;border-radius:7px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;height:auto;line-height:1.2;padding:6px 8px;-webkit-transition:background .2s,-webkit-transform .12s;transition:background .2s,-webkit-transform .12s;transition:background .2s,transform .12s;transition:background .2s,transform .12s,-webkit-transform .12s}.cc-button:hover{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-button:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-button-red{background-color:#aa2c16}.cc-button-black{background-color:#242424}.cc-button-black:hover{background-color:#000}.cc-button-iconed{gap:5px}.cc-button-icon,.cc-button-iconed{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-button-icon{height:12px;width:12px}.cc-settings-actions{display:grid;gap:5px;grid-template-columns:1fr 1fr}.cc-settings-sync{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}#cc-sync-cloud-btn{margin-top:0}.cc-sync-mini{font-size:11px;min-width:68px;padding:6px 9px}.cc-sync-modal-overlay{background:rgba(0,0,0,.45);display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;opacity:0;-webkit-transition:opacity .18s ease;transition:opacity .18s ease;z-index:10002}.cc-sync-modal-overlay.visible{opacity:1}.cc-sync-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 10px 30px rgba(0,0,0,.22);box-shadow:0 10px 30px rgba(0,0,0,.22);max-width:calc(100vw - 30px);padding:14px;width:340px}.cc-sync-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;margin-bottom:8px}.cc-sync-modal-head h3{font-size:14px;margin:0}.cc-sync-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-sync-help{color:#444;font-size:12px;margin:0 0 10px}.cc-sync-toggle-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-size:12px;gap:6px;margin-bottom:10px}.cc-sync-label{color:#333;display:block;font-size:12px;margin-bottom:4px}.cc-sync-input{border:1px solid #d9d9d9;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;padding:7px 8px;width:100%}.cc-sync-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:end;-ms-flex-pack:end;gap:8px;justify-content:flex-end;margin-top:12px}.cc-sync-note{color:#666;font-size:11px;margin-top:8px}.cc-button:disabled{cursor:wait;opacity:.75}.cc-ratings-progress{background:#f9f9f9;border:1px solid #e4e4e4;border-radius:6px;margin:4px 8px 10px;padding:8px}.cc-ratings-progress-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;color:#555;font-size:11px;gap:10px;margin-bottom:6px}.cc-ratings-progress-track{background:#e6e6e6;border-radius:999px;height:8px;overflow:hidden;width:100%}.cc-ratings-progress-bar{background:-webkit-gradient(linear,left top,right top,from(#aa2c16),to(#d13b1f));background:linear-gradient(90deg,#aa2c16,#d13b1f);border-radius:999px;height:100%;-webkit-transition:width .25s ease;transition:width .25s ease;width:0}.cc-ratings-progress-actions{display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:6px;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-ratings-cancel-link{-moz-appearance:none;appearance:none;-webkit-appearance:none;background:transparent;border:0;border-radius:4px;color:#7a7a7a;cursor:pointer;font-size:11px;padding:2px 6px;text-decoration:none;-webkit-transition:background-color .15s ease,color .15s ease;transition:background-color .15s ease,color .15s ease}.cc-ratings-cancel-link:hover{background:rgba(0,0,0,.06);color:#444}.cc-ratings-cancel-link:active,.cc-ratings-cancel-link:focus,.cc-ratings-cancel-link:focus-visible{background:rgba(0,0,0,.08);color:#333;outline:none}.header-bar .csfd-compare-menu{position:relative}.header-bar .csfd-compare-menu .cc-menu-icon{display:block;height:24px;inset:0;margin:auto;position:absolute;width:24px}";
  styleInject(css_248z$1);

  var css_248z = ".flex{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.flex,.justify-center{-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.justify-evenly{-webkit-box-pack:space-evenly;-ms-flex-pack:space-evenly;justify-content:space-evenly}.justify-start{-webkit-box-pack:start;-ms-flex-pack:start;justify-content:flex-start}.justify-end{-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.justify-between{-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.justify-around{-ms-flex-pack:distribute;justify-content:space-around}.grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.grow-0{-webkit-box-flex:0;-ms-flex-positive:0;flex-grow:0}.grow-1{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.grow-2{-webkit-box-flex:2;-ms-flex-positive:2;flex-grow:2}.grow-3{-webkit-box-flex:3;-ms-flex-positive:3;flex-grow:3}.grow-4{-webkit-box-flex:4;-ms-flex-positive:4;flex-grow:4}.grow-5{-webkit-box-flex:5;-ms-flex-positive:5;flex-grow:5}.align-center{text-align:center}.align-left{text-align:left}.align-right{text-align:right}.flex-column{-webkit-box-orient:vertical;-ms-flex-direction:column;flex-direction:column}.flex-column,.flex-row{-webkit-box-direction:normal}.flex-row{-ms-flex-direction:row;flex-direction:row}.flex-row,.flex-row-reverse{-webkit-box-orient:horizontal}.flex-row-reverse{-webkit-box-direction:reverse;-ms-flex-direction:row-reverse;flex-direction:row-reverse}.flex-column-reverse{-webkit-box-orient:vertical;-webkit-box-direction:reverse;-ms-flex-direction:column-reverse;flex-direction:column-reverse}.gap-5{gap:5px}.gap-10{gap:10px}.gap-30{gap:30px}.ml-auto{margin-left:auto}.mr-auto{margin-right:auto}.ph-5{padding-left:5px;padding-right:5px}.ph-10{padding-left:10px;padding-right:10px}.pv-5{padding-bottom:5px;padding-top:5px}.pv-10{padding-bottom:10px;padding-top:10px}.mh-5{margin-left:5px;margin-right:5px}.mh-10{margin-left:10px;margin-right:10px}.mv-5{margin-bottom:5px;margin-top:5px}.mv-10{margin-bottom:10px;margin-top:10px}.cc-own-rating{margin-left:6px;vertical-align:middle}.cc-own-rating-computed .stars:before{color:#d2d2d2}.cc-my-rating-cell,.cc-my-rating-col{text-align:center;width:64px}.cc-my-rating-cell{white-space:nowrap}.cc-my-rating-cell .cc-own-rating{margin-left:0}.cc-compare-ratings-table{width:calc(100% + 24px)}";
  styleInject(css_248z);

  var htmlContent = "<a href=\"javascript:void(0)\" rel=\"dropdownContent\" class=\"user-link csfd-compare-menu initialized\">\r\n    <svg class=\"cc-menu-icon\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n        aria-hidden=\"true\" focusable=\"false\">\r\n        <text x=\"12\" y=\"12\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"currentColor\" font-size=\"11\"\r\n            font-weight=\"800\" letter-spacing=\"0.2\">CC</text>\r\n    </svg>\r\n</a>\r\n<div class=\"dropdown-content cc-settings\">\r\n\r\n    <div class=\"dropdown-content-head cc-settings-head\">\r\n        <div class=\"left-head cc-head-main\">\r\n            <h2>CSFD-Compare</h2>\r\n            <a href=\"https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare\" class=\"cc-version-link\">v6.6.0</a>\r\n        </div>\r\n        <div class=\"right-head ml-auto cc-head-badges\">\r\n            <span class=\"cc-badge cc-badge-red\" id=\"cc-badge-red\" title=\"Uloženo / Celkem\">0 / 0</span>\r\n            <span class=\"cc-badge cc-badge-black\" id=\"cc-badge-black\" title=\"Spočtená hodnocení\">0</span>\r\n            <div class=\"cc-head-tools\">\r\n                <button id=\"cc-sync-cloud-btn\" class=\"cc-sync-icon-btn\" title=\"Cloud sync\" aria-label=\"Cloud sync\">\r\n                    <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n                        aria-hidden=\"true\" focusable=\"false\">\r\n                        <path\r\n                            d=\"M16.5 18H6.2C4.43 18 3 16.57 3 14.8C3 13.03 4.43 11.6 6.2 11.6C6.27 8.52 8.76 6 11.85 6C14.16 6 16.19 7.43 17 9.54C18.67 9.75 20 11.18 20 12.9C20 14.76 18.49 16.27 16.63 16.27\"\r\n                            stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />\r\n                        <path d=\"M18.5 18V22\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                        <path d=\"M16.5 20H20.5\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                    </svg>\r\n                </button>\r\n                <a href=\"https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare\"\r\n                    class=\"cc-sync-icon-btn cc-script-link-btn\" title=\"Skript na GreasyFork\"\r\n                    aria-label=\"Skript na GreasyFork\">\r\n                    <svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n                        aria-hidden=\"true\" focusable=\"false\">\r\n                        <path d=\"M9 8H6.5C5.1 8 4 9.1 4 10.5V17.5C4 18.9 5.1 20 6.5 20H13.5C14.9 20 16 18.9 16 17.5V15\"\r\n                            stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                        <path d=\"M10 14L20 4\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                        <path d=\"M14 4H20V10\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"\r\n                            stroke-linejoin=\"round\" />\r\n                    </svg>\r\n                </a>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-actions ph-5\">\r\n        <button id=\"cc-load-ratings-btn\" class=\"cc-button cc-button-red grow cc-button-iconed\">\r\n            <span class=\"cc-button-icon\" aria-hidden=\"true\">\r\n                <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n                    <path d=\"M12 4V14\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                    <path d=\"M8 10L12 14L16 10\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"\r\n                        stroke-linejoin=\"round\" />\r\n                    <path d=\"M5 19H19\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                </svg>\r\n            </span>\r\n            <span>Načíst moje hodnocení</span>\r\n        </button>\r\n        <button id=\"cc-load-computed-btn\" class=\"cc-button cc-button-black cc-button-iconed\">\r\n            <span class=\"cc-button-icon\" aria-hidden=\"true\">\r\n                <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n                    <path d=\"M12 6L13.8 9.6L17.8 10.2L14.9 13L15.6 17L12 15.2L8.4 17L9.1 13L6.2 10.2L10.2 9.6L12 6Z\"\r\n                        stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\" />\r\n                </svg>\r\n            </span>\r\n            <span>Dopočítat seriály</span>\r\n        </button>\r\n    </div>\r\n\r\n    <div id=\"cc-ratings-progress\" class=\"cc-ratings-progress\" hidden>\r\n        <div class=\"cc-ratings-progress-head\">\r\n            <span id=\"cc-ratings-progress-label\">Připravuji načítání…</span>\r\n            <span id=\"cc-ratings-progress-count\">0 / 0</span>\r\n        </div>\r\n        <div class=\"cc-ratings-progress-track\">\r\n            <div id=\"cc-ratings-progress-bar\" class=\"cc-ratings-progress-bar\" style=\"width: 0%\"></div>\r\n        </div>\r\n        <div class=\"cc-ratings-progress-actions\">\r\n            <button id=\"cc-cancel-ratings-loader-btn\" class=\"cc-ratings-cancel-link\" hidden>Zrušit načítání</button>\r\n        </div>\r\n    </div>\r\n\r\n    <details style=\"margin-bottom: 16px;\">\r\n        <summary style=\"cursor: pointer; font-size: 12px; color: #444;\">🛠️ Další akce</summary>\r\n        <div\r\n            style=\"display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px solid #eee; margin-top: 6px;\">\r\n            <button\r\n                style=\"background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; padding: 4px 6px; font-size: 11px; cursor: pointer;\">Reset</button>\r\n            <button\r\n                style=\"background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; padding: 4px 6px; font-size: 11px; cursor: pointer;\">Smazat\r\n                LC</button>\r\n            <button\r\n                style=\"background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; padding: 4px 6px; font-size: 11px; cursor: pointer;\">Smazat\r\n                DB</button>\r\n        </div>\r\n    </details>\r\n\r\n    <article class=\"article\">\r\n        <div class=\"article-content\">\r\n            <form>\r\n                <label>\r\n                    <input type=\"checkbox\" name=\"option1\" /> Option 1\r\n                </label>\r\n                <br />\r\n                <label>\r\n                    <input type=\"checkbox\" name=\"option2\" /> Option 2\r\n                </label>\r\n            </form>\r\n        </div>\r\n    </article>\r\n\r\n</div>";

  const DEBUG = true;

  let isFancyAlertOpen = false;

  async function fancyAlert() {
    if (isFancyAlertOpen) {
      return;
    }
    isFancyAlertOpen = true;

    console.log('fancyAlert called');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const alert = document.createElement('div');
    alert.className = 'fancy-alert';
    alert.innerHTML = `
    <div class="alert-content">
      <button class="close-btn">&times;</button>
      <h2 class="alert-title">Welcome!</h2>
      <p class="alert-message">This is a fancy modal alert with modern styling and animations.</p>
      <button class="alert-button">Got it!</button>
    </div>
  `;

    overlay.appendChild(alert);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    let isClosing = false;
    const closeModal = () => {
      if (isClosing) {
        return;
      }
      isClosing = true;
      overlay.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        isFancyAlertOpen = false;
        isClosing = false;
      }, 300);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    alert.querySelector('.close-btn').addEventListener('click', closeModal);
    alert.querySelector('.alert-button').addEventListener('click', closeModal);
  }

  function bindFancyAlertButton(alertButton) {
    if (!alertButton || alertButton.dataset.fancyAlertBound === 'true') {
      return;
    }

    alertButton.addEventListener('click', () => {
      fancyAlert();
    });
    alertButton.dataset.fancyAlertBound = 'true';
  }

  const DEFAULT_MAX_PAGES = 0; // 0 means no limit, load all available pages
  const REQUEST_DELAY_MIN_MS = 250;
  const REQUEST_DELAY_MAX_MS = 550;
  const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';

  const loaderController = {
    isRunning: false,
    pauseRequested: false,
    pauseReason: 'manual',
  };

  function randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  function normalizeProfilePath(profileHref) {
    if (!profileHref) {
      return undefined;
    }

    const url = new URL(profileHref, location.origin);
    return url.pathname;
  }

  function getCurrentProfilePath() {
    const profileEl = document.querySelector('a.profile.initialized');
    if (!profileEl) {
      return undefined;
    }
    return normalizeProfilePath(profileEl.getAttribute('href'));
  }

  function getRatingsSegment() {
    return location.hostname.endsWith('.sk') ? 'hodnotenia' : 'hodnoceni';
  }

  function extractUserSlugFromProfilePath(profilePath) {
    const match = profilePath?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
  }

  function buildRatingsPageUrl(profilePath, pageNumber = 1) {
    return buildRatingsPageUrlWithMode(profilePath, pageNumber, 'path');
  }

  function buildRatingsPageUrlWithMode(profilePath, pageNumber = 1, mode = 'path') {
    const ratingsSegment = getRatingsSegment();
    const basePath = profilePath.replace(/\/(prehled|prehlad)\/?$/i, `/${ratingsSegment}/`);
    const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;

    if (pageNumber <= 1) {
      return new URL(normalizedBasePath, location.origin).toString();
    }

    if (mode === 'query') {
      const url = new URL(normalizedBasePath, location.origin);
      url.searchParams.set('page', String(pageNumber));
      return url.toString();
    }

    return new URL(`${normalizedBasePath}strana-${pageNumber}/`, location.origin).toString();
  }

  async function fetchRatingsPageDocument(url) {
    const response = await fetch(url, {
      credentials: 'include',
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to load page (${response.status})`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  function parseTotalRatingsFromDocument$1(doc) {
    const heading = doc.querySelector('h2')?.textContent || '';
    const match = heading.match(/\(([^)]+)\)/);
    if (!match) {
      return 0;
    }
    const numeric = match[1].replace(/\s+/g, '');
    const parsed = Number.parseInt(numeric, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function parseMaxPaginationPageFromDocument(doc) {
    const pageLinks = Array.from(doc.querySelectorAll('a[href*="strana-"], a[href*="?page="], a[href*="&page="]'));
    const pageNumbers = pageLinks
      .map((link) => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/(?:strana-|[?&]page=)(\d+)/);
        return match ? Number.parseInt(match[1], 10) : NaN;
      })
      .filter((value) => !Number.isNaN(value));

    if (pageNumbers.length > 0) {
      return Math.max(...pageNumbers);
    }

    const totalRatings = parseTotalRatingsFromDocument$1(doc);
    return totalRatings > 0 ? Math.ceil(totalRatings / NUM_RATINGS_PER_PAGE) : 1;
  }

  function detectPaginationModeFromDocument(doc) {
    const queryPaginationLink = doc.querySelector('a[href*="?page="], a[href*="&page="]');
    return queryPaginationLink ? 'query' : 'path';
  }

  function normalizeType(rawType) {
    const normalized = (rawType || '').trim().toLowerCase();
    if (!normalized) return 'movie';
    if (normalized.includes('epizoda')) return 'episode';
    if (normalized.includes('seriál') || normalized.includes('serial')) return 'serial';
    if (normalized.startsWith('série') || normalized.startsWith('serie')) return 'series';
    if (normalized.includes('film')) return 'movie';
    return normalized;
  }

  function parseRating(starElement) {
    if (!starElement) {
      return NaN;
    }

    if (starElement.classList.contains('trash')) {
      return 0;
    }

    const starClass = Array.from(starElement.classList).find((className) => /^stars-\d$/.test(className));
    if (!starClass) {
      return NaN;
    }

    return Number.parseInt(starClass.replace('stars-', ''), 10);
  }

  function parseIdsFromUrl(relativeUrl) {
    const matches = Array.from((relativeUrl || '').matchAll(/\/(\d+)-/g)).map((match) => Number.parseInt(match[1], 10));

    if (matches.length === 0) {
      return { id: NaN, parentId: NaN, parentName: '' };
    }

    const id = matches[matches.length - 1];
    const parentId = matches.length > 1 ? matches[0] : NaN;
    const parts = (relativeUrl || '').split('/').filter(Boolean);
    const parentName = matches.length > 1 ? parts[1] || '' : '';

    return { id, parentId, parentName };
  }

  function parseRatingRow(row, origin) {
    const titleLink = row.querySelector('td.name a.film-title-name');
    if (!titleLink) {
      return undefined;
    }

    const relativeUrl = titleLink.getAttribute('href') || '';
    const name = titleLink.textContent?.trim() || '';
    const infoValues = Array.from(row.querySelectorAll('.film-title-info .info')).map((el) => el.textContent.trim());

    const yearValue = infoValues.find((value) => /^\d{4}$/.test(value));
    const rawType = infoValues.find((value) => !/^\d{4}$/.test(value));

    const starRatingWrapper = row.querySelector('td.star-rating-only .star-rating');
    const starEl = starRatingWrapper?.querySelector('.stars');
    const computed = starRatingWrapper?.classList.contains('computed') || false;
    const computedFromText =
      row.querySelector('td.star-rating-only [title*="spočten" i]')?.getAttribute('title') ||
      row.querySelector('td.star-rating-only [title*="spocten" i]')?.getAttribute('title') ||
      '';
    const computedCountMatch = computedFromText.match(/(\d+)/);
    const computedCount = computedCountMatch ? Number.parseInt(computedCountMatch[1], 10) : NaN;
    const dateText = row.querySelector('td.date-only')?.textContent?.trim() || '';
    const { id, parentId, parentName } = parseIdsFromUrl(relativeUrl);

    const slugParts = relativeUrl.split('/').filter(Boolean);
    const urlSlug = slugParts[slugParts.length - 1] || '';

    return {
      id,
      url: urlSlug,
      fullUrl: new URL(relativeUrl, origin).toString(),
      name,
      year: yearValue ? Number.parseInt(yearValue, 10) : NaN,
      type: normalizeType(rawType),
      rating: parseRating(starEl),
      date: dateText,
      parentId,
      parentName,
      computed,
      computedCount,
      computedFromText,
      lastUpdate: new Date().toISOString(),
    };
  }

  function parseRatingsFromDocument(doc, origin) {
    const rows = Array.from(doc.querySelectorAll('table tr'));
    return rows.map((row) => parseRatingRow(row, origin)).filter(Boolean);
  }

  function getStoreNameForUser() {
    return RATINGS_STORE_NAME;
  }

  function toStorageRecord(record, userSlug) {
    const movieId = record.id;
    const uniqueKeyPart = record.url || record.fullUrl || `${record.name}-${record.date}`;

    return {
      ...record,
      movieId,
      userSlug,
      id: `${userSlug}:${uniqueKeyPart}`,
    };
  }

  function updateProgressUI(progress, state) {
    const container = progress.container;
    const label = progress.label;
    const count = progress.count;
    const bar = progress.bar;

    container.hidden = false;
    label.textContent = state.label;
    count.textContent = `${state.current} / ${state.total}`;
    const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
    bar.style.width = `${pct}%`;
  }

  function getButtonLabelElement(button) {
    return button?.querySelector('span:last-child') || button;
  }

  function setLoadButtonMode(button, mode) {
    if (!button) return;

    const labelEl = getButtonLabelElement(button);
    if (mode === 'running') {
      button.disabled = false;
      labelEl.textContent = 'Pozastavit načítání';
      return;
    }

    if (mode === 'pausing') {
      button.disabled = true;
      labelEl.textContent = 'Pozastavuji…';
      return;
    }

    if (mode === 'resume') {
      button.disabled = false;
      labelEl.textContent = 'Pokračovat v načítání';
      return;
    }

    button.disabled = false;
    labelEl.textContent = 'Načíst moje hodnocení';
  }

  function getPersistedLoaderState() {
    try {
      const raw = localStorage.getItem(LOADER_STATE_STORAGE_KEY);
      if (!raw) {
        return undefined;
      }
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  function setPersistedLoaderState(state) {
    localStorage.setItem(
      LOADER_STATE_STORAGE_KEY,
      JSON.stringify({
        ...state,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  function clearPersistedLoaderState() {
    localStorage.removeItem(LOADER_STATE_STORAGE_KEY);
  }

  function isStateForCurrentUser(state, userSlug) {
    if (!state || !userSlug) {
      return false;
    }

    return state.userSlug === userSlug;
  }

  async function loadRatingsForCurrentUser(maxPages = DEFAULT_MAX_PAGES, onProgress = () => {}, resumeState = undefined) {
    const profilePath = getCurrentProfilePath();
    if (!profilePath) {
      throw new Error('Profil uživatele nebyl nalezen.');
    }

    const userSlug = extractUserSlugFromProfilePath(profilePath);
    if (!userSlug) {
      throw new Error('Nepodařilo se přečíst ID uživatele z profilu.');
    }

    const firstPageUrl = buildRatingsPageUrl(profilePath, 1);
    const firstDoc = await fetchRatingsPageDocument(firstPageUrl);

    const totalRatings = parseTotalRatingsFromDocument$1(firstDoc);
    const maxDetectedPages = parseMaxPaginationPageFromDocument(firstDoc);
    const paginationMode = detectPaginationModeFromDocument(firstDoc);
    const detectedTargetPages =
      maxPages === 0 ? Math.max(1, maxDetectedPages) : Math.max(1, Math.min(maxPages, maxDetectedPages));

    const startPage = Math.max(1, Number.parseInt(resumeState?.nextPage || '1', 10));
    const targetPages = Math.max(startPage, Number.parseInt(resumeState?.targetPages || detectedTargetPages, 10));
    let totalParsed = Number.parseInt(resumeState?.totalParsed || '0', 10);
    let loadedPages = Number.parseInt(resumeState?.loadedPages || '0', 10);

    setPersistedLoaderState({
      status: 'running',
      userSlug,
      profilePath,
      maxPages,
      totalRatings,
      maxDetectedPages,
      paginationMode,
      targetPages,
      nextPage: startPage,
      loadedPages,
      totalParsed,
    });

    for (let page = startPage; page <= targetPages; page++) {
      if (loaderController.pauseRequested) {
        setPersistedLoaderState({
          status: 'paused',
          pauseReason: loaderController.pauseReason || 'manual',
          userSlug,
          profilePath,
          maxPages,
          totalRatings,
          maxDetectedPages,
          paginationMode,
          targetPages,
          nextPage: page,
          loadedPages,
          totalParsed,
        });

        return {
          userSlug,
          totalPagesLoaded: loadedPages,
          totalPagesDetected: maxDetectedPages,
          totalParsed,
          totalRatings,
          storeName: getStoreNameForUser(),
          paused: true,
          nextPage: page,
          targetPages,
        };
      }

      const doc =
        page === 1
          ? firstDoc
          : await fetchRatingsPageDocument(buildRatingsPageUrlWithMode(profilePath, page, paginationMode));
      const pageRatings = parseRatingsFromDocument(doc, location.origin);

      if (page > 1 && pageRatings.length === 0) {
        break;
      }

      const storageRecords = pageRatings.map((record) => toStorageRecord(record, userSlug));
      await saveToIndexedDB(INDEXED_DB_NAME, getStoreNameForUser(), storageRecords);

      totalParsed += pageRatings.length;
      loadedPages += 1;

      setPersistedLoaderState({
        status: 'running',
        userSlug,
        profilePath,
        maxPages,
        totalRatings,
        maxDetectedPages,
        paginationMode,
        targetPages,
        nextPage: page + 1,
        loadedPages,
        totalParsed,
      });

      onProgress({
        page,
        totalPages: targetPages,
        totalParsed,
        totalRatings,
      });

      if (page < targetPages) {
        await delay(randomDelay());
      }
    }

    return {
      userSlug,
      totalPagesLoaded: loadedPages,
      totalPagesDetected: maxDetectedPages,
      totalParsed,
      totalRatings,
      storeName: getStoreNameForUser(),
      paused: false,
      nextPage: targetPages + 1,
      targetPages,
    };
  }

  function initializeRatingsLoader(rootElement) {
    const loadButton = rootElement.querySelector('#cc-load-ratings-btn');
    const cancelPausedButton = rootElement.querySelector('#cc-cancel-ratings-loader-btn');
    const progress = {
      container: rootElement.querySelector('#cc-ratings-progress'),
      label: rootElement.querySelector('#cc-ratings-progress-label'),
      count: rootElement.querySelector('#cc-ratings-progress-count'),
      bar: rootElement.querySelector('#cc-ratings-progress-bar'),
    };

    if (!loadButton || !progress.container || !progress.label || !progress.count || !progress.bar) {
      return;
    }

    const setCancelPausedButtonVisible = (visible) => {
      if (!cancelPausedButton) {
        return;
      }
      cancelPausedButton.hidden = !visible;
      cancelPausedButton.disabled = false;
    };

    if (loadButton.dataset.ccRatingsBound === 'true') {
      return;
    }

    loadButton.dataset.ccRatingsBound = 'true';

    const runLoad = async ({ resumeState = undefined, autoResume = false } = {}) => {
      if (loaderController.isRunning) {
        return;
      }

      try {
        loaderController.isRunning = true;
        loaderController.pauseRequested = false;
        setLoadButtonMode(loadButton, 'running');

        const startPage = Math.max(1, Number.parseInt(resumeState?.nextPage || '1', 10));
        updateProgressUI(progress, {
          label: autoResume ? `Pokračuji od stránky ${startPage}…` : 'Připravuji načítání…',
          current: Math.max(0, startPage - 1),
          total: Math.max(1, Number.parseInt(resumeState?.targetPages || '1', 10)),
        });

        const result = await loadRatingsForCurrentUser(
          resumeState?.maxPages ?? DEFAULT_MAX_PAGES,
          ({ page, totalPages, totalParsed }) => {
            updateProgressUI(progress, {
              label: `Načítám stránku ${page}/${totalPages}… (${totalParsed} položek)`,
              current: page,
              total: totalPages,
            });

            if (loaderController.pauseRequested) {
              setLoadButtonMode(loadButton, 'pausing');
            }
          },
          resumeState,
        );

        if (result.paused) {
          updateProgressUI(progress, {
            label: `Pozastaveno na stránce ${result.nextPage}/${result.targetPages}`,
            current: Math.max(0, result.nextPage - 1),
            total: result.targetPages || 1,
          });
          setCancelPausedButtonVisible(true);
        } else {
          clearPersistedLoaderState();
          updateProgressUI(progress, {
            label: `Hotovo: ${result.totalParsed} hodnocení uloženo (${result.totalPagesLoaded} str., DB: ${result.storeName})`,
            current: result.totalPagesLoaded,
            total: result.totalPagesLoaded || 1,
          });
          setCancelPausedButtonVisible(false);
        }

        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      } catch (error) {
        setPersistedLoaderState({
          ...(getPersistedLoaderState() || {}),
          status: 'paused',
          pauseReason: 'interrupted',
        });
        updateProgressUI(progress, {
          label: `Chyba: ${error.message}`,
          current: 0,
          total: 1,
        });
        console.error('[CC] Ratings loader failed:', error);
      } finally {
        loaderController.isRunning = false;
        loaderController.pauseRequested = false;
        loaderController.pauseReason = 'manual';

        const currentUserSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
        const stateAfterRun = getPersistedLoaderState();
        if (stateAfterRun?.status === 'paused' && isStateForCurrentUser(stateAfterRun, currentUserSlug)) {
          setLoadButtonMode(loadButton, 'resume');
          setCancelPausedButtonVisible(true);
        } else {
          setLoadButtonMode(loadButton, 'idle');
          setCancelPausedButtonVisible(false);
        }
      }
    };

    if (cancelPausedButton) {
      cancelPausedButton.addEventListener('click', () => {
        if (loaderController.isRunning) {
          return;
        }

        clearPersistedLoaderState();
        setCancelPausedButtonVisible(false);
        setLoadButtonMode(loadButton, 'idle');
        updateProgressUI(progress, {
          label: 'Pozastavené načítání bylo zrušeno',
          current: 0,
          total: 1,
        });
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      });
    }

    loadButton.addEventListener('click', async () => {
      if (loaderController.isRunning) {
        loaderController.pauseRequested = true;
        loaderController.pauseReason = 'manual';
        setLoadButtonMode(loadButton, 'pausing');
        return;
      }

      const state = getPersistedLoaderState();
      await runLoad({
        resumeState: state?.status === 'paused' ? state : undefined,
        autoResume: false,
      });
    });

    const userSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
    const state = getPersistedLoaderState();
    if (state?.status === 'paused' && isStateForCurrentUser(state, userSlug)) {
      setLoadButtonMode(loadButton, 'resume');
      setCancelPausedButtonVisible(true);

      if (state.pauseReason === 'manual') {
        updateProgressUI(progress, {
          label: `Pozastaveno ručně na stránce ${state.nextPage}/${state.targetPages || '?'}`,
          current: Math.max(0, (state.nextPage || 1) - 1),
          total: state.targetPages || 1,
        });
        return;
      }

      updateProgressUI(progress, {
        label: `Nalezeno nedokončené načítání (str. ${state.nextPage}/${state.targetPages || '?'}) — automaticky pokračuji…`,
        current: Math.max(0, (state.nextPage || 1) - 1),
        total: state.targetPages || 1,
      });

      setTimeout(() => {
        runLoad({ resumeState: state, autoResume: true });
      }, 500);
    }
  }

  const SYNC_ENABLED_KEY = 'cc_sync_enabled';
  const SYNC_ACCESS_KEY = 'cc_sync_access_key';

  function getSyncSetupState() {
    return {
      enabled: localStorage.getItem(SYNC_ENABLED_KEY) === 'true',
      accessKey: localStorage.getItem(SYNC_ACCESS_KEY) || '',
    };
  }

  function saveSyncSetupState({ enabled, accessKey }) {
    localStorage.setItem(SYNC_ENABLED_KEY, String(Boolean(enabled)));
    localStorage.setItem(SYNC_ACCESS_KEY, (accessKey || '').trim());
  }

  function removeSyncModal() {
    document.querySelector('.cc-sync-modal-overlay')?.remove();
  }

  function createSyncSetupModal() {
    removeSyncModal();

    const { enabled, accessKey } = getSyncSetupState();

    const overlay = document.createElement('div');
    overlay.className = 'cc-sync-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cc-sync-modal';
    modal.innerHTML = `
    <div class="cc-sync-modal-head">
      <h3>Cloud sync setup (beta)</h3>
      <button type="button" class="cc-sync-close" aria-label="Close">&times;</button>
    </div>
    <p class="cc-sync-help">
      Nastavte jeden Sync key. Funkční cloud synchronizace bude doplněna v dalším kroku.
    </p>
    <label class="cc-sync-toggle-row">
      <input id="cc-sync-enabled-input" type="checkbox" ${enabled ? 'checked' : ''}>
      <span>Povolit sync</span>
    </label>
    <label class="cc-sync-label" for="cc-sync-key-input">Sync key</label>
    <input id="cc-sync-key-input" class="cc-sync-input" type="password" placeholder="Vložte váš Sync key" value="${accessKey.replace(/"/g, '&quot;')}">
    <div class="cc-sync-actions">
      <button type="button" class="cc-sync-save cc-button cc-button-red">Uložit</button>
      <button type="button" class="cc-sync-cancel cc-button cc-button-black">Zavřít</button>
    </div>
    <div class="cc-sync-note">Tip: stejný key použijte na obou počítačích.</div>
  `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    const closeModal = () => {
      overlay.classList.remove('visible');
      setTimeout(removeSyncModal, 180);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    modal.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);
    modal.querySelector('.cc-sync-cancel')?.addEventListener('click', closeModal);
    modal.querySelector('.cc-sync-save')?.addEventListener('click', () => {
      const enabledInput = modal.querySelector('#cc-sync-enabled-input');
      const keyInput = modal.querySelector('#cc-sync-key-input');

      saveSyncSetupState({
        enabled: Boolean(enabledInput?.checked),
        accessKey: keyInput?.value || '',
      });

      closeModal();
    });
  }

  function updateSyncButtonLabel(button) {
    const { enabled } = getSyncSetupState();
    button.classList.toggle('is-enabled', enabled);
    button.setAttribute('title', enabled ? 'Cloud sync zapnutý' : 'Cloud sync');
    button.setAttribute('aria-label', enabled ? 'Cloud sync zapnutý' : 'Cloud sync');
  }

  function initializeRatingsSync(rootElement) {
    const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');

    if (!syncButton) {
      return;
    }

    if (syncButton.dataset.ccSyncBound === 'true') {
      return;
    }

    syncButton.dataset.ccSyncBound = 'true';
    updateSyncButtonLabel(syncButton);

    syncButton.addEventListener('click', () => {
      createSyncSetupModal();
      setTimeout(() => updateSyncButtonLabel(syncButton), 220);
    });
  }

  // addSettingsButton function that will create element 'li' as a 'let button'


  function getCurrentUserSlug() {
    const profileEl = document.querySelector('a.profile.initialized');
    const profileHref = profileEl?.getAttribute('href') || '';
    const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
  }

  function getCurrentUserRatingsUrl() {
    const profileEl = document.querySelector('a.profile.initialized');
    const profileHref = profileEl?.getAttribute('href');
    if (!profileHref) {
      return undefined;
    }

    const url = new URL(profileHref, location.origin);
    const segment = location.hostname.endsWith('.sk') ? 'hodnotenia' : 'hodnoceni';
    url.pathname = url.pathname.replace(/\/(prehled|prehlad)\/?$/i, `/${segment}/`);
    url.search = '';
    return url.toString();
  }

  function parseTotalRatingsFromDocument(doc) {
    const heading = doc.querySelector('h2')?.textContent || '';
    const match = heading.match(/\(([^)]+)\)/);
    if (!match) {
      return 0;
    }
    const parsed = Number.parseInt(match[1].replace(/\s+/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function fetchTotalRatingsForCurrentUser() {
    const ratingsUrl = getCurrentUserRatingsUrl();
    if (!ratingsUrl) {
      return 0;
    }

    const response = await fetch(ratingsUrl, {
      credentials: 'include',
      method: 'GET',
    });
    if (!response.ok) {
      return 0;
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return parseTotalRatingsFromDocument(doc);
  }

  async function refreshRatingsBadges(rootElement) {
    const redBadge = rootElement.querySelector('#cc-badge-red');
    const blackBadge = rootElement.querySelector('#cc-badge-black');
    if (!redBadge || !blackBadge) {
      return;
    }

    const userSlug = getCurrentUserSlug();
    if (!userSlug) {
      redBadge.textContent = '0 / 0';
      blackBadge.textContent = '0';
      return;
    }

    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));
    const computedCount = userRecords.filter((record) => record.computed === true).length;
    const totalRatings = await fetchTotalRatingsForCurrentUser();

    redBadge.textContent = `${userRecords.length} / ${totalRatings}`;
    blackBadge.textContent = `${computedCount}`;
  }

  async function addSettingsButton() {
    const settingsButton = document.createElement('li');
    settingsButton.classList.add('cc-menu-item');
    settingsButton.innerHTML = htmlContent;
    initializeRatingsLoader(settingsButton);
    initializeRatingsSync(settingsButton);
    refreshRatingsBadges(settingsButton).catch((error) => {
      console.error('[CC] Failed to refresh badges:', error);
    });

    const handleRatingsUpdated = () => {
      refreshRatingsBadges(settingsButton).catch((error) => {
        console.error('[CC] Failed to refresh badges:', error);
      });
    };
    window.addEventListener('cc-ratings-updated', handleRatingsUpdated);

    const $button = $(settingsButton);
    $('.header-bar').prepend($button);

    let hoverTimeout;
    let hideTimeout;

    // If DEBUG is enabled, just add $('.header-bar li').addClass('hovered');
    // if not, have the code bellow
    console.log('🟣 DEBUG:', DEBUG);
    {
      // --- GROUP FANCY ALERT BUTTON AND CHECKBOX AT TOP RIGHT ---
      // Create or find a top-right container for controls
      let controlsContainer = document.querySelector('.fancy-alert-controls');
      if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'fancy-alert-controls';
        controlsContainer.style.position = 'fixed';
        controlsContainer.style.top = '4px';
        controlsContainer.style.right = '150px';
        controlsContainer.style.zIndex = '9999';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.alignItems = 'center';
        controlsContainer.style.background = 'rgba(255,255,255,0.95)';
        controlsContainer.style.borderRadius = '8px';
        controlsContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        controlsContainer.style.padding = '8px 16px';
        document.body.appendChild(controlsContainer);
      }

      // Remove any previous checkbox/buttons from the container to avoid duplicates
      controlsContainer.innerHTML = '';

      // Add checkbox for toggling hovered state to the left of the alert button
      const checkboxLabel = document.createElement('label');
      checkboxLabel.style.display = 'inline-flex';
      checkboxLabel.style.alignItems = 'center';
      checkboxLabel.style.marginRight = '10px';
      checkboxLabel.style.cursor = 'pointer';
      checkboxLabel.textContent = 'Hovered';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.marginRight = '5px';
      checkbox.checked = localStorage.getItem('headerBarHovered') === 'true';
      checkboxLabel.prepend(checkbox);
      controlsContainer.appendChild(checkboxLabel);

      // Create or find the fancy alert button
      let alertButton = document.querySelector('.fancy-alert-button');
      if (!alertButton) {
        alertButton = document.createElement('button');
        alertButton.textContent = 'Show Fancy Alert';
        alertButton.className = 'fancy-alert-button';
      } else {
        // Remove from previous parent if needed
        if (alertButton.parentNode && alertButton.parentNode !== controlsContainer) {
          alertButton.parentNode.removeChild(alertButton);
        }
      }
      bindFancyAlertButton(alertButton);
      controlsContainer.appendChild(alertButton);

      // If checked, use DEBUG behaviour, else use non-DEBUG behaviour
      function enableDebugHover() {
        $('.header-bar li').addClass('hovered');
        $button.addClass('active');
        $button
          .find('.csfd-compare-menu')
          .off('click.debug')
          .on('click.debug', function (e) {
            e.stopPropagation();
            if ($button.hasClass('active')) {
              $button.removeClass('active');
              $('.header-bar li').removeClass('hovered');
            } else {
              $button.addClass('active');
              $('.header-bar li').addClass('hovered');
            }
          });
        $button.add($button.find('.dropdown-content')).off('mouseenter mouseleave');
      }

      function enableNormalHover() {
        $('.header-bar li').removeClass('hovered');
        $button.removeClass('active');
        $button.find('.csfd-compare-menu').off('click.debug');
        $button
          .add($button.find('.dropdown-content'))
          .off('mouseenter mouseleave')
          .hover(
            function () {
              clearTimeout(hideTimeout);
              hoverTimeout = setTimeout(() => {
                $('.header-bar li').addClass('hovered');
                $button.addClass('active');
              }, 200);
            },
            function () {
              clearTimeout(hoverTimeout);
              hideTimeout = setTimeout(() => {
                $('.header-bar li').removeClass('hovered');
                $button.removeClass('active');
              }, 200);
            },
          );
      }

      // Set initial state from localStorage
      if (checkbox.checked) {
        enableDebugHover();
      } else {
        enableNormalHover();
      }

      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          localStorage.setItem('headerBarHovered', 'true');
          enableDebugHover();
        } else {
          localStorage.setItem('headerBarHovered', 'false');
          enableNormalHover();
        }
      });
    }
  }

  // Utility to enable/disable controls by IDs based on login state
  function setControlsDisabledByLoginState(isLoggedIn, controlIds) {
    controlIds.forEach((id) => {
      const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
      if (el) {
        el.disabled = !isLoggedIn;
        if (!isLoggedIn) {
          el.parentElement && (el.parentElement.style.color = '#aaa');
          el.parentElement && (el.parentElement.title = 'Přihlaste se pro aktivaci této volby');
        } else {
          el.parentElement && (el.parentElement.style.color = '');
          el.parentElement && (el.parentElement.title = '');
        }
      }
    });
  }

  (async () => {
    console.debug('🟣 Script started');
    await delay(20);
    console.debug('🟣 Adding main button');
    await addSettingsButton();

    const csfd = new Csfd(document.querySelector('div.page-content'));
    console.debug('🟣 Initializing CSFD-Compare');
    await csfd.initialize();
    console.debug('🟣 Adding stars');
    await csfd.addStars();

    // Disable Option 2 if not logged in (now using utility)
    setControlsDisabledByLoginState(csfd.getIsLoggedIn(), ['option2']);

    // Add fancy alert
    let alertButton = document.querySelector('.fancy-alert-button');
    if (!alertButton) {
      alertButton = document.createElement('button');
      alertButton.textContent = 'Show Fancy Alert';
      alertButton.className = 'fancy-alert-button';
      document.body.appendChild(alertButton);
    }
    alertButton.addEventListener('click', () => {
      fancyAlert();
    });
  })();

})();
