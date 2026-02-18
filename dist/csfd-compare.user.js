// ==UserScript==
// @name         ČSFD Compare V2
// @version      0.8.2
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @include      *csfd.cz/*
// @include      *csfd.sk/*
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
  const GREASYFORK_URL = 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare';
  const NUM_RATINGS_PER_PAGE = 50;
  const INDEXED_DB_NAME = 'CC-Ratings';
  const RATINGS_STORE_NAME = 'ratings';
  const GALLERY_IMAGE_LINKS_ENABLED_KEY = 'cc_gallery_image_links_enabled';

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

    isOnGalleryPage() {
      return /\/(galerie|galeria)\//i.test(location.pathname || '');
    }

    isGalleryImageLinksEnabled() {
      const persistedValue = localStorage.getItem(GALLERY_IMAGE_LINKS_ENABLED_KEY);
      return persistedValue === null ? true : persistedValue === 'true';
    }

    clearGalleryImageFormatLinks() {
      const wrappers = Array.from(document.querySelectorAll('.cc-gallery-size-links'));
      for (const wrapper of wrappers) {
        wrapper.remove();
      }

      const hosts = Array.from(document.querySelectorAll('.cc-gallery-size-host'));
      for (const host of hosts) {
        host.classList.remove('cc-gallery-size-host');
      }

      const boundPictures = Array.from(
        document.querySelectorAll('.gallery-item picture[data-cc-gallery-links-bound="true"]'),
      );
      for (const pictureEl of boundPictures) {
        delete pictureEl.dataset.ccGalleryLinksBound;
      }
    }

    getGalleryImageFormatLinks(pictureEl) {
      const widthLinks = [];
      const seenHrefs = new Set();

      const addWidthCandidate = (rawUrl) => {
        if (!rawUrl) {
          return;
        }

        const widthMatch = rawUrl.match(/[/]w(\d+)(?:h\d+)?[/]/i);
        if (!widthMatch) {
          return;
        }

        const absoluteUrl = new URL(rawUrl, location.origin).toString();
        if (seenHrefs.has(absoluteUrl)) {
          return;
        }

        seenHrefs.add(absoluteUrl);
        widthLinks.push({
          width: Number.parseInt(widthMatch[1], 10),
          href: absoluteUrl,
        });
      };

      const sourceEls = Array.from(pictureEl.querySelectorAll('source'));
      for (const sourceEl of sourceEls) {
        const srcset = sourceEl.getAttribute('srcset') || '';
        const candidates = srcset
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);

        for (const candidate of candidates) {
          const [rawUrl] = candidate.split(/\s+/, 1);
          if (!rawUrl) {
            continue;
          }

          addWidthCandidate(rawUrl);
        }
      }

      const imgEl = pictureEl.querySelector('img');
      const imgSrc = imgEl?.getAttribute('src') || '';
      addWidthCandidate(imgSrc);

      const imgSrcset = imgEl?.getAttribute('srcset') || '';
      const imgSrcsetCandidates = imgSrcset
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      for (const candidate of imgSrcsetCandidates) {
        const [rawUrl] = candidate.split(/\s+/, 1);
        addWidthCandidate(rawUrl);
      }

      const shareHref =
        pictureEl.parentElement?.querySelector('a.btn-photo-share')?.getAttribute('href') ||
        pictureEl.closest('figure')?.querySelector('a.btn-photo-share')?.getAttribute('href') ||
        '';
      addWidthCandidate(shareHref);

      widthLinks.sort((a, b) => b.width - a.width);

      const uniqueByWidth = [];
      const seenWidths = new Set();
      for (const link of widthLinks) {
        if (seenWidths.has(link.width)) {
          continue;
        }
        seenWidths.add(link.width);
        uniqueByWidth.push(link);
      }

      if (uniqueByWidth.length === 0) {
        return [];
      }

      const top = uniqueByWidth[0];
      const normalizedWidthLinks = uniqueByWidth.map((item) => ({
        label: String(item.width),
        href: item.href,
      }));

      return [{ label: '100 %', href: top.href }, ...normalizedWidthLinks];
    }

    async addGalleryImageFormatLinks() {
      if (!this.isOnGalleryPage()) {
        return;
      }

      if (!this.isGalleryImageLinksEnabled()) {
        this.clearGalleryImageFormatLinks();
        return;
      }

      const pictureEls = Array.from(document.querySelectorAll('.gallery-item picture'));
      for (const pictureEl of pictureEls) {
        if (pictureEl.dataset.ccGalleryLinksBound === 'true') {
          continue;
        }

        const links = this.getGalleryImageFormatLinks(pictureEl);
        if (links.length === 0) {
          pictureEl.dataset.ccGalleryLinksBound = 'true';
          continue;
        }

        const host = pictureEl.parentElement;
        if (!host) {
          pictureEl.dataset.ccGalleryLinksBound = 'true';
          continue;
        }

        host.classList.add('cc-gallery-size-host');

        const linksWrapper = document.createElement('div');
        linksWrapper.className = 'cc-gallery-size-links';

        for (const linkDef of links) {
          const anchor = document.createElement('a');
          anchor.className = 'cc-gallery-size-link';
          anchor.href = linkDef.href;
          anchor.textContent = linkDef.label;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          linksWrapper.appendChild(anchor);
        }

        host.appendChild(linksWrapper);

        pictureEl.dataset.ccGalleryLinksBound = 'true';
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

  var css_248z$1 = ".dropdown-content.cc-settings{-webkit-box-sizing:border-box;box-sizing:border-box;margin-top:0;overflow:hidden;padding:0;right:0;top:100%;width:360px}header.page-header.user-not-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings{margin-top:-4px;right:-140px}header.page-header.user-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings{margin-top:-4px;right:-170px}.cc-badge.cc-badge-disabled{cursor:not-allowed;opacity:.7}.cc-badge.cc-badge-warning{-webkit-box-shadow:inset 0 0 0 1px #f3c24f;box-shadow:inset 0 0 0 1px #f3c24f;position:relative}.cc-badge.cc-badge-warning:after{background:#f3c24f;border-radius:999px;color:#3b2a04;content:\"!\";font-size:9px;font-weight:800;height:12px;line-height:12px;position:absolute;right:-5px;text-align:center;top:-5px;width:12px}.dropdown-content.cc-settings .article,.dropdown-content.cc-settings .dropdown-content-head{-webkit-box-sizing:border-box;box-sizing:border-box;margin:0;width:100%}.dropdown-content.cc-settings .left-head{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;gap:2px}.dropdown-content.cc-settings .left-head h2{line-height:1.1;margin:0}.cc-version-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px}.cc-version-link{color:#555;font-size:11px;line-height:1;opacity:.9;text-decoration:none}.cc-version-link:hover{color:#aa2c16;text-decoration:underline}.cc-version-status{background:#b8b8b8;border-radius:999px;display:inline-block;height:8px;opacity:0;-webkit-transition:opacity .18s ease;transition:opacity .18s ease;width:8px}.cc-version-status.is-visible{opacity:1}.cc-version-status.is-checking{background:#9ca3af}.cc-version-status.is-ok{background:#8f8f8f}.cc-version-status.is-update{background:#aa2c16;border-radius:999px;color:#fff;font-size:10px;font-weight:700;height:auto;line-height:1.3;padding:1px 6px;width:auto}.cc-version-status.is-error{background:#9b9b9b}.cc-head-right,.cc-head-tools{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-version-info-btn{font-weight:700}.cc-version-info-btn svg{height:15px;width:15px}.cc-head-cc-link{font-weight:700;min-width:26px;text-align:center}.cc-icon-btn{border:0;border-radius:7px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:24px;width:24px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#242424;color:#fff;cursor:pointer;justify-content:center;text-decoration:none;-webkit-transition:background-color .16s ease,-webkit-transform .12s ease;transition:background-color .16s ease,-webkit-transform .12s ease;transition:background-color .16s ease,transform .12s ease;transition:background-color .16s ease,transform .12s ease,-webkit-transform .12s ease}.cc-icon-btn:hover{background:#111;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-icon-btn:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-icon-btn-sync.is-enabled{background:#aa2c16}.cc-sync-icon-btn{border:1px solid #cfcfcf;border-radius:8px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:28px;width:28px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;color:#202020;cursor:pointer;justify-content:center;padding:0;text-decoration:none;-webkit-transition:background-color .15s ease,border-color .15s ease,color .15s ease;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.cc-sync-icon-btn:hover{background:#f3f3f3;border-color:#bdbdbd;color:#aa2c16}.cc-sync-icon-btn:focus,.cc-sync-icon-btn:focus-visible{background:#f3f3f3;border-color:#b0b0b0;color:#aa2c16;outline:none}.cc-sync-icon-btn.is-enabled{background:#fff3f0;border-color:#cf7c6d;color:#aa2c16}.cc-sync-icon-btn.cc-sync-icon-btn-disabled{color:#8b8b8b;cursor:not-allowed;opacity:.6}.cc-script-link-btn svg{height:14px;width:14px}.cc-version-info-overlay{background:rgba(0,0,0,.36);display:none;inset:0;position:fixed;z-index:10030;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;-webkit-box-sizing:border-box;box-sizing:border-box;justify-content:center;padding:16px}.cc-version-info-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-version-info-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 20px 45px rgba(0,0,0,.25);box-shadow:0 20px 45px rgba(0,0,0,.25);color:#222;display:grid;grid-template-rows:auto minmax(0,1fr);max-height:80vh;overflow:hidden;width:min(560px,100%)}.cc-version-info-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-version-info-head h3{font-size:14px;font-weight:700;margin:0}.cc-version-info-close{background:transparent;border:0;border-radius:7px;color:#666;cursor:pointer;font-size:20px;height:28px;line-height:1;width:28px}.cc-version-info-close:hover{background:#f1f1f1;color:#222}.cc-version-info-body{font-size:12px;line-height:1.5;overflow:auto;padding:12px 14px}.cc-version-info-meta{display:grid;gap:4px 10px;grid-template-columns:120px minmax(0,1fr);margin-bottom:10px}.cc-version-info-key{color:#666}.cc-version-info-value{color:#202020;font-weight:600}.cc-version-info-status{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px}.cc-version-info-status-dot{background:#8f8f8f;border-radius:999px;height:8px;width:8px}.cc-version-info-status.is-update .cc-version-info-status-dot{background:#aa2c16}.cc-version-info-status.is-error .cc-version-info-status-dot{background:#9b9b9b}.cc-version-info-section-title{color:#444;font-size:12px;font-weight:700;margin:0 0 6px}.cc-version-info-list{color:#2a2a2a;margin:0;padding-left:16px}.cc-version-info-empty{color:#666;margin:0}.cc-version-info-loading{color:#666}.cc-badge{background-color:#2c3e50;border-radius:6px;color:#fff;cursor:help;font-size:11.2px;font-size:.7rem;font-weight:700;line-height:1.4;padding:2px 6px}.cc-badge-red{background-color:#aa2c16}.cc-badge-black{background-color:#000}.cc-button{border:none;border-radius:7px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;height:auto;line-height:1.2;padding:6px 8px;-webkit-transition:background .2s,-webkit-transform .12s;transition:background .2s,-webkit-transform .12s;transition:background .2s,transform .12s;transition:background .2s,transform .12s,-webkit-transform .12s}.cc-button:hover{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-button:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-button-red{background-color:#aa2c16}.cc-button-black{background-color:#242424}.cc-button-black:hover{background-color:#000}#cc-load-computed-btn{background-color:#242424!important}#cc-load-computed-btn:active,#cc-load-computed-btn:focus,#cc-load-computed-btn:focus-visible,#cc-load-computed-btn:hover{background-color:#000!important}.cc-button-iconed{gap:5px}.cc-button-icon,.cc-button-iconed{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-button-icon{height:12px;width:12px}.cc-settings-actions{display:grid;gap:5px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.cc-settings-section .article-content{-webkit-box-sizing:border-box;box-sizing:border-box;padding:10px;width:100%}.cc-settings-section+.cc-settings-section .article-content{border-top:1px solid #efefef}.cc-section-title{color:#444;font-size:12px;font-weight:700;margin:0 0 8px}.cc-settings-form{display:grid;gap:8px}.cc-form-check{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;color:#444;font-size:12px;gap:6px}.cc-form-field{color:#444;display:grid;font-size:12px;gap:4px}.cc-form-field input[type=text]{border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;line-height:1.2;padding:6px 8px;width:100%}.cc-maint-actions{display:-webkit-box;display:-ms-flexbox;display:flex;gap:6px}.cc-maint-btn{background:#fff;border:1px solid #cfcfcf;border-radius:6px;color:#444;cursor:pointer;font-size:11px;line-height:1;padding:6px 8px}.cc-maint-btn:hover{background:#f7f7f7;border-color:#bcbcbc}.cc-settings-actions .cc-button{min-width:0;width:100%}.cc-settings-actions .cc-button-iconed span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-settings-sync{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}#cc-sync-cloud-btn{margin-top:0}.cc-sync-mini{font-size:11px;min-width:68px;padding:6px 9px}.cc-sync-modal-overlay{background:rgba(0,0,0,.45);display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;opacity:0;-webkit-transition:opacity .18s ease;transition:opacity .18s ease;z-index:10002}.cc-sync-modal-overlay.visible{opacity:1}.cc-sync-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 10px 30px rgba(0,0,0,.22);box-shadow:0 10px 30px rgba(0,0,0,.22);max-width:calc(100vw - 30px);padding:14px;width:340px}.cc-sync-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;margin-bottom:8px}.cc-sync-modal-head h3{font-size:14px;margin:0}.cc-sync-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-sync-help{color:#444;font-size:12px;margin:0 0 10px}.cc-sync-toggle-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-size:12px;gap:6px;margin-bottom:10px}.cc-sync-label{color:#333;display:block;font-size:12px;margin-bottom:4px}.cc-sync-input{border:1px solid #d9d9d9;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;padding:7px 8px;width:100%}.cc-sync-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:end;-ms-flex-pack:end;gap:8px;justify-content:flex-end;margin-top:12px}.cc-sync-note{color:#666;font-size:11px;margin-top:8px}.cc-button:disabled{cursor:wait;opacity:.75}.cc-ratings-progress{background:#f9f9f9;border:1px solid #e4e4e4;border-radius:6px;margin:0;padding:8px}.cc-ratings-progress-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;color:#555;font-size:11px;gap:10px;margin-bottom:6px}#cc-ratings-progress-label{-webkit-box-flex:1;-ms-flex:1;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#cc-ratings-progress-count{-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;white-space:nowrap}.cc-ratings-progress-track{background:#e6e6e6;border-radius:999px;height:8px;overflow:hidden;width:100%}.cc-ratings-progress-bar{background:-webkit-gradient(linear,left top,right top,from(#aa2c16),to(#d13b1f));background:linear-gradient(90deg,#aa2c16,#d13b1f);border-radius:999px;height:100%;-webkit-transition:width .25s ease;transition:width .25s ease;width:0}.cc-ratings-progress-actions{display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:6px;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-ratings-cancel-link{-moz-appearance:none;appearance:none;-webkit-appearance:none;background:transparent;border:0;border-radius:4px;color:#7a7a7a;cursor:pointer;font-size:11px;padding:2px 6px;text-decoration:none;-webkit-transition:background-color .15s ease,color .15s ease;transition:background-color .15s ease,color .15s ease}.cc-ratings-cancel-link:hover{background:rgba(0,0,0,.06);color:#444}.cc-ratings-cancel-link:active,.cc-ratings-cancel-link:focus,.cc-ratings-cancel-link:focus-visible{background:rgba(0,0,0,.08);color:#333;outline:none}.header-bar .csfd-compare-menu{position:relative}.header-bar>li.cc-menu-item{position:relative;z-index:8;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;min-width:42px}.header-bar>li.cc-menu-item.active{z-index:14}.header-bar>li.cc-menu-item .dropdown-content.cc-settings{z-index:15}.header-bar .csfd-compare-menu .cc-menu-icon{display:block;height:24px;inset:0;margin:auto;position:absolute;width:24px}.cc-badge[role=button]{cursor:pointer}.cc-ratings-table-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.45);justify-content:center;padding:24px;z-index:10010}.cc-ratings-table-modal,.cc-ratings-table-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-ratings-table-modal{background:#fff;border-radius:12px;-webkit-box-shadow:0 16px 42px rgba(0,0,0,.28);box-shadow:0 16px 42px rgba(0,0,0,.28);max-height:calc(100vh - 48px);overflow:hidden;width:min(1080px,calc(100vw - 40px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-ratings-table-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:14px 16px}.cc-ratings-table-head h3{font-size:15px;margin:0}.cc-ratings-table-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-ratings-table-close:hover{background:#f1f1f1;color:#222}.cc-ratings-table-toolbar{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #f0f0f0;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:10px;justify-content:space-between;padding:10px 16px}.cc-ratings-table-search{border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;height:34px;line-height:34px;margin:0!important;padding:0 10px;width:min(440px,100%)}.cc-ratings-table-summary{color:#666;font-size:12px;margin-left:auto;white-space:nowrap}.cc-ratings-type-multiselect{position:relative;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-ratings-type-toggle{background:#fff;border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;color:#333;cursor:pointer;font-size:12px;height:34px;line-height:34px;max-width:280px;min-width:186px;overflow:hidden;padding:0 32px 0 10px;position:relative;text-align:left;text-overflow:ellipsis;text-transform:none!important;white-space:nowrap}.cc-ratings-type-toggle:after{color:#777;content:\"▼\";font-size:10px;position:absolute;right:10px;top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%)}.cc-ratings-type-menu{background:#fff;border:1px solid #ddd;border-radius:8px;-webkit-box-shadow:0 8px 22px rgba(0,0,0,.12);box-shadow:0 8px 22px rgba(0,0,0,.12);left:0;max-height:220px;min-width:180px;overflow:auto;padding:6px;position:absolute;top:calc(100% + 6px);z-index:3}.cc-ratings-type-menu label{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-radius:6px;cursor:pointer;font-size:12px;gap:7px;padding:6px 8px}.cc-ratings-type-menu label:hover{background:#f5f5f5}.cc-ratings-table-wrap{overflow:auto;padding:0 0 4px}.cc-ratings-table{border-collapse:collapse;table-layout:fixed;width:100%}.cc-ratings-table td,.cc-ratings-table th{border-bottom:1px solid #f0f0f0;font-size:12px;padding:10px 16px;vertical-align:top}.cc-ratings-table th{background:#fafafa;position:sticky;top:0;z-index:1}.cc-ratings-table th button{background:transparent;border:0;color:#333;cursor:pointer;font:inherit;font-weight:700;gap:6px;padding:0}.cc-ratings-table th button,.cc-sort-indicator{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-sort-indicator{-webkit-box-pack:center;-ms-flex-pack:center;color:#8a8a8a;font-size:10px;justify-content:center;min-width:12px}.cc-ratings-table th button.is-active .cc-sort-indicator{color:#aa2c16}.cc-ratings-table td:first-child,.cc-ratings-table th:first-child{width:40%}.cc-ratings-table td:nth-child(2),.cc-ratings-table th:nth-child(2){width:18%}.cc-ratings-table td:nth-child(3),.cc-ratings-table th:nth-child(3){width:10%}.cc-ratings-table td:nth-child(4),.cc-ratings-table th:nth-child(4){width:12%}.cc-ratings-table td:nth-child(5),.cc-ratings-table th:nth-child(5){width:20%}.cc-ratings-table-name-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;gap:8px;justify-content:space-between;width:100%}.cc-ratings-table-name-link{color:#1f4f8f;font-size:13px;font-weight:600;text-decoration:none;word-break:break-word;-webkit-box-flex:1;-ms-flex:1;flex:1}.cc-ratings-table-name-link:hover{text-decoration:underline}.cc-ratings-table-details-btn,.cc-ratings-table-link-icon{border:1px solid #cfcfcf;border-radius:6px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:22px;width:22px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;color:#7b7b7b;justify-content:center;text-decoration:none;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;opacity:.88}.cc-ratings-table-details-btn{-moz-appearance:none;appearance:none;-webkit-appearance:none;cursor:pointer;padding:0}.cc-ratings-table-details-btn:hover,.cc-ratings-table-link-icon:hover{background:#f3f3f3;border-color:#bcbcbc;color:#aa2c16;opacity:1}.cc-ratings-table-date,.cc-ratings-table-rating,.cc-ratings-table-year{white-space:nowrap}.cc-ratings-table-type{color:#444;white-space:nowrap}.cc-ratings-table-rating{color:#b8321d;font-size:13px;font-weight:700;letter-spacing:.2px}.cc-ratings-table-rating.is-odpad{color:#000;font-weight:700;letter-spacing:0}.cc-ratings-square{border-radius:2px;height:11px;width:11px;-webkit-box-flex:0;-ms-flex:0 0 11px;flex:0 0 11px;margin-right:2px}.cc-ratings-square.is-1{background:#465982}.cc-ratings-square.is-2{background:#5c6f96}.cc-ratings-square.is-3{background:#9a3d2b}.cc-ratings-square.is-4,.cc-ratings-square.is-5{background:#b8321d}.cc-ratings-square.is-unknown{background:#9a9a9a}.cc-ratings-table-empty{color:#7a7a7a;padding:18px 16px;text-align:center}body.cc-ratings-modal-open{overflow:hidden}.cc-rating-detail-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.32);justify-content:center;padding:20px;z-index:10011}.cc-rating-detail-card,.cc-rating-detail-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-rating-detail-card{background:#fff;border-radius:12px;-webkit-box-shadow:0 14px 38px rgba(0,0,0,.24);box-shadow:0 14px 38px rgba(0,0,0,.24);max-height:calc(100vh - 60px);overflow:hidden;width:min(760px,calc(100vw - 32px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-rating-detail-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-rating-detail-head h4{font-size:14px;font-weight:700;margin:0}.cc-rating-detail-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-rating-detail-close:hover{background:#f1f1f1;color:#222}.cc-rating-detail-body{overflow:auto;padding:8px 14px 12px}.cc-rating-detail-row{border-bottom:1px solid #f1f1f1;display:grid;gap:10px;grid-template-columns:180px 1fr;padding:8px 0}.cc-rating-detail-key{color:#666;font-size:12px;font-weight:600}.cc-rating-detail-value{color:#222;font-size:12px;white-space:pre-wrap;word-break:break-word}";
  styleInject(css_248z$1);

  var css_248z = ".flex{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.flex,.justify-center{-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.justify-evenly{-webkit-box-pack:space-evenly;-ms-flex-pack:space-evenly;justify-content:space-evenly}.justify-start{-webkit-box-pack:start;-ms-flex-pack:start;justify-content:flex-start}.justify-end{-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.justify-between{-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.justify-around{-ms-flex-pack:distribute;justify-content:space-around}.grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.grow-0{-webkit-box-flex:0;-ms-flex-positive:0;flex-grow:0}.grow-1{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.grow-2{-webkit-box-flex:2;-ms-flex-positive:2;flex-grow:2}.grow-3{-webkit-box-flex:3;-ms-flex-positive:3;flex-grow:3}.grow-4{-webkit-box-flex:4;-ms-flex-positive:4;flex-grow:4}.grow-5{-webkit-box-flex:5;-ms-flex-positive:5;flex-grow:5}.align-center{text-align:center}.align-left{text-align:left}.align-right{text-align:right}.flex-column{-webkit-box-orient:vertical;-ms-flex-direction:column;flex-direction:column}.flex-column,.flex-row{-webkit-box-direction:normal}.flex-row{-ms-flex-direction:row;flex-direction:row}.flex-row,.flex-row-reverse{-webkit-box-orient:horizontal}.flex-row-reverse{-webkit-box-direction:reverse;-ms-flex-direction:row-reverse;flex-direction:row-reverse}.flex-column-reverse{-webkit-box-orient:vertical;-webkit-box-direction:reverse;-ms-flex-direction:column-reverse;flex-direction:column-reverse}.gap-5{gap:5px}.gap-10{gap:10px}.gap-30{gap:30px}.ml-auto{margin-left:auto}.mr-auto{margin-right:auto}.ph-5{padding-left:5px;padding-right:5px}.ph-10{padding-left:10px;padding-right:10px}.pv-5{padding-bottom:5px;padding-top:5px}.pv-10{padding-bottom:10px;padding-top:10px}.mh-5{margin-left:5px;margin-right:5px}.mh-10{margin-left:10px;margin-right:10px}.mv-5{margin-bottom:5px;margin-top:5px}.mv-10{margin-bottom:10px;margin-top:10px}.cc-own-rating{margin-left:6px;vertical-align:middle}.cc-own-rating-computed .stars:before{color:#d2d2d2}.cc-my-rating-cell,.cc-my-rating-col{text-align:center;width:64px}.cc-my-rating-cell{white-space:nowrap}.cc-my-rating-cell .cc-own-rating{margin-left:0}.cc-compare-ratings-table{width:calc(100% + 24px)}.cc-gallery-size-host{position:relative}.cc-gallery-size-links{bottom:8px;display:none;position:absolute;right:8px;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:end;-ms-flex-align:end;align-items:flex-end;gap:4px;z-index:11}.cc-gallery-size-host:hover .cc-gallery-size-links,.cc-gallery-size-links.is-visible,.cc-gallery-size-links:hover{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-gallery-size-link{background-color:hsla(0,100%,98%,.82);border-radius:5px;color:#222;display:inline-block;font-size:11px;font-weight:700;line-height:1.2;min-width:48px;padding:2px 6px;text-align:center;text-decoration:none}.cc-gallery-size-link:hover{text-decoration:underline}";
  styleInject(css_248z);

  var htmlContent = "<a href=\"javascript:void(0)\" rel=\"dropdownContent\" class=\"user-link csfd-compare-menu initialized\">\r\n    <svg class=\"cc-menu-icon\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n        aria-hidden=\"true\" focusable=\"false\">\r\n        <text x=\"12\" y=\"12\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"currentColor\" font-size=\"11\"\r\n            font-weight=\"800\" letter-spacing=\"0.2\">CC</text>\r\n    </svg>\r\n</a>\r\n<div class=\"dropdown-content cc-settings\">\r\n\r\n    <div class=\"dropdown-content-head\">\r\n        <div class=\"left-head\">\r\n            <h2>CSFD-Compare</h2>\r\n            <div class=\"cc-version-row\">\r\n                <span class=\"cc-version-link\" id=\"cc-version-value\">v0.8.2</span>\r\n                <span class=\"cc-version-status\" id=\"cc-version-status\" aria-hidden=\"true\"></span>\r\n            </div>\r\n        </div>\r\n        <div class=\"right-head ml-auto cc-head-right\">\r\n            <span class=\"cc-badge cc-badge-red\" id=\"cc-badge-red\" title=\"Uloženo / Celkem\">0 / 0</span>\r\n            <span class=\"cc-badge cc-badge-black\" id=\"cc-badge-black\" title=\"Spočtená hodnocení\">0</span>\r\n            <div class=\"cc-head-tools\">\r\n                <button id=\"cc-sync-cloud-btn\" class=\"cc-sync-icon-btn\" title=\"Cloud sync\" aria-label=\"Cloud sync\">\r\n                    <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n                        aria-hidden=\"true\" focusable=\"false\">\r\n                        <path\r\n                            d=\"M16.5 18H6.2C4.43 18 3 16.57 3 14.8C3 13.03 4.43 11.6 6.2 11.6C6.27 8.52 8.76 6 11.85 6C14.16 6 16.19 7.43 17 9.54C18.67 9.75 20 11.18 20 12.9C20 14.76 18.49 16.27 16.63 16.27\"\r\n                            stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />\r\n                        <path d=\"M18.5 18V22\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                        <path d=\"M16.5 20H20.5\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                    </svg>\r\n                </button>\r\n                <button id=\"cc-version-info-btn\" class=\"cc-sync-icon-btn cc-version-info-btn\" title=\"Informace o verzi\"\r\n                    aria-label=\"Informace o verzi\">\r\n                    <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n                        aria-hidden=\"true\" focusable=\"false\">\r\n                        <circle cx=\"12\" cy=\"12\" r=\"8\" stroke=\"currentColor\" stroke-width=\"1.9\" />\r\n                        <path d=\"M12 11V15\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                        <circle cx=\"12\" cy=\"8.4\" r=\"1\" fill=\"currentColor\" />\r\n                    </svg>\r\n                </button>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <article class=\"article cc-settings-section\">\r\n        <div class=\"article-content\">\r\n            <div class=\"cc-settings-actions\">\r\n                <button id=\"cc-load-ratings-btn\" class=\"cc-button cc-button-red grow cc-button-iconed\">\r\n                    <span class=\"cc-button-icon\" aria-hidden=\"true\">\r\n                        <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n                            <path d=\"M12 4V14\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                            <path d=\"M8 10L12 14L16 10\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"\r\n                                stroke-linejoin=\"round\" />\r\n                            <path d=\"M5 19H19\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                        </svg>\r\n                    </span>\r\n                    <span>Načíst moje hodnocení</span>\r\n                </button>\r\n                <button id=\"cc-load-computed-btn\" class=\"cc-button cc-button-black cc-button-iconed\">\r\n                    <span class=\"cc-button-icon\" aria-hidden=\"true\">\r\n                        <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n                            <path\r\n                                d=\"M12 6L13.8 9.6L17.8 10.2L14.9 13L15.6 17L12 15.2L8.4 17L9.1 13L6.2 10.2L10.2 9.6L12 6Z\"\r\n                                stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\" />\r\n                        </svg>\r\n                    </span>\r\n                    <span>Dopočítat seriály</span>\r\n                </button>\r\n            </div>\r\n        </div>\r\n    </article>\r\n\r\n    <article class=\"article cc-settings-section\">\r\n        <div class=\"article-content\">\r\n            <div id=\"cc-ratings-progress\" class=\"cc-ratings-progress\" hidden>\r\n                <div class=\"cc-ratings-progress-head\">\r\n                    <span id=\"cc-ratings-progress-label\">Připravuji načítání…</span>\r\n                    <span id=\"cc-ratings-progress-count\">0 / 0</span>\r\n                </div>\r\n                <div class=\"cc-ratings-progress-track\">\r\n                    <div id=\"cc-ratings-progress-bar\" class=\"cc-ratings-progress-bar\" style=\"width: 0%\"></div>\r\n                </div>\r\n                <div class=\"cc-ratings-progress-actions\">\r\n                    <button id=\"cc-cancel-ratings-loader-btn\" class=\"cc-ratings-cancel-link\" hidden>Zrušit\r\n                        načítání</button>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </article>\r\n\r\n    <article class=\"article cc-settings-section\">\r\n        <div class=\"article-content\">\r\n            <h3 class=\"cc-section-title\">Konfigurace</h3>\r\n            <form class=\"cc-settings-form\">\r\n                <label class=\"cc-form-check\">\r\n                    <input type=\"checkbox\" id=\"cc-enable-gallery-image-links\" name=\"cc-enable-gallery-image-links\" />\r\n                    Zobrazovat formáty obrázků v galerii\r\n                </label>\r\n                <label class=\"cc-form-check\">\r\n                    <input type=\"checkbox\" name=\"option2\" /> Povolit automatickou aktualizaci dat\r\n                </label>\r\n                <label class=\"cc-form-field\">\r\n                    <span>Vlastní štítek sekce</span>\r\n                    <input type=\"text\" name=\"sectionLabel\" placeholder=\"Např. Můj CSFD Compare\" />\r\n                </label>\r\n            </form>\r\n        </div>\r\n    </article>\r\n\r\n    <article class=\"article cc-settings-section\">\r\n        <div class=\"article-content\">\r\n            <h3 class=\"cc-section-title\">Další akce</h3>\r\n            <div class=\"cc-maint-actions\">\r\n                <button type=\"button\" class=\"cc-maint-btn\">Reset</button>\r\n                <button type=\"button\" class=\"cc-maint-btn\">Smazat LC</button>\r\n                <button type=\"button\" class=\"cc-maint-btn\">Smazat DB</button>\r\n            </div>\r\n        </div>\r\n    </article>\r\n\r\n</div>";

  const DEFAULT_MAX_PAGES = 0; // 0 means no limit, load all available pages
  const REQUEST_DELAY_MIN_MS = 250;
  const REQUEST_DELAY_MAX_MS = 550;
  const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';
  const COMPUTED_LOADER_STATE_STORAGE_KEY = 'cc_computed_loader_state_v1';

  const loaderController = {
    isRunning: false,
    pauseRequested: false,
    pauseReason: 'manual',
  };

  const computedLoaderController = {
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

  function createRecordFingerprint(record) {
    const computedCount = Number.isFinite(record?.computedCount) ? String(record.computedCount) : '';
    return [
      Number.isFinite(record?.rating) ? String(record.rating) : '',
      record?.date || '',
      record?.computed === true ? '1' : '0',
      computedCount,
      record?.computedFromText || '',
    ].join('|');
  }

  function hasRecordChanged(existingRecord, nextRecord) {
    if (!existingRecord) {
      return true;
    }

    return createRecordFingerprint(existingRecord) !== createRecordFingerprint(nextRecord);
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

  function getPersistedComputedLoaderState() {
    try {
      const raw = localStorage.getItem(COMPUTED_LOADER_STATE_STORAGE_KEY);
      if (!raw) {
        return undefined;
      }
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  function setPersistedComputedLoaderState(state) {
    localStorage.setItem(
      COMPUTED_LOADER_STATE_STORAGE_KEY,
      JSON.stringify({
        ...state,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  function clearPersistedComputedLoaderState() {
    localStorage.removeItem(COMPUTED_LOADER_STATE_STORAGE_KEY);
  }

  function isStateForCurrentUser(state, userSlug) {
    if (!state || !userSlug) {
      return false;
    }

    return state.userSlug === userSlug;
  }

  function parseRatingFromStarsElement(starsEl) {
    if (!starsEl) {
      return NaN;
    }

    if (starsEl.classList.contains('trash')) {
      return 0;
    }

    const starClass = Array.from(starsEl.classList).find((className) => /^stars-\d$/.test(className));
    if (!starClass) {
      return NaN;
    }

    return Number.parseInt(starClass.replace('stars-', ''), 10);
  }

  function parseCurrentUserRatingFromDocument(doc) {
    const currentUserNode = doc.querySelector('.others-rating .current-user-rating') || doc.querySelector('.my-rating');
    if (!currentUserNode) {
      return undefined;
    }

    const starRatingNode =
      currentUserNode.querySelector('.star-rating') || currentUserNode.querySelector('.stars-rating');
    const starsEl = starRatingNode?.querySelector('.stars');
    const rating = parseRatingFromStarsElement(starsEl);

    if (!Number.isFinite(rating)) {
      return undefined;
    }

    const titleWithComputed =
      currentUserNode.querySelector('[title*="spočten" i]')?.getAttribute('title') ||
      currentUserNode.querySelector('[title*="spocten" i]')?.getAttribute('title') ||
      '';

    const computedByClass =
      starRatingNode?.classList.contains('computed') ||
      currentUserNode.querySelector('.star.active.computed, .star.computed') !== null;

    const computed = computedByClass || titleWithComputed.length > 0;
    const computedCountMatch = titleWithComputed.match(/(\d+)/);
    const computedCount = computedCountMatch ? Number.parseInt(computedCountMatch[1], 10) : NaN;

    return {
      rating,
      computed,
      computedCount,
      computedFromText: titleWithComputed,
    };
  }

  function parsePageName(doc) {
    const titleEl = doc.querySelector('.film-header h1');
    return titleEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
  }

  function parsePageYear(doc) {
    const originText = doc.querySelector('.film-info-content .origin')?.textContent || '';
    const yearMatch = originText.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? Number.parseInt(yearMatch[0], 10) : NaN;
  }

  function parsePageType(doc) {
    const typeText = doc.querySelector('.film-header .type')?.textContent?.toLowerCase() || '';
    if (typeText.includes('epizoda')) return 'episode';
    if (typeText.includes('seriál') || typeText.includes('serial')) return 'serial';
    if (typeText.includes('série') || typeText.includes('serie')) return 'series';
    return 'movie';
  }

  function parsePageDate(doc) {
    const title =
      doc.querySelector('.my-rating .stars-rating')?.getAttribute('title') ||
      doc.querySelector('.others-rating .current-user-rating [title*="Vloženo" i]')?.getAttribute('title') ||
      '';
    const match = title.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
    return match ? match[1] : '';
  }

  function buildParentFullUrl(parentSlug) {
    return new URL(`/film/${parentSlug}/`, location.origin).toString();
  }

  function buildParentReviewsUrl(parentSlug) {
    return new URL(`/film/${parentSlug}/recenze/`, location.origin).toString();
  }

  function toComputedParentRecord({ userSlug, parentId, parentSlug, existingRecord, parsedRating, doc }) {
    const nowIso = new Date().toISOString();

    return {
      ...(existingRecord || {}),
      id: `${userSlug}:${parentSlug}`,
      userSlug,
      movieId: parentId,
      url: parentSlug,
      fullUrl: buildParentFullUrl(parentSlug),
      name: parsePageName(doc) || existingRecord?.name || '',
      year: parsePageYear(doc),
      type: parsePageType(doc),
      rating: parsedRating.rating,
      date: parsePageDate(doc) || existingRecord?.date || '',
      parentId: Number.NaN,
      parentName: '',
      computed: parsedRating.computed,
      computedCount: parsedRating.computedCount,
      computedFromText: parsedRating.computedFromText,
      lastUpdate: nowIso,
    };
  }

  async function loadComputedParentRatingsForCurrentUser({
    onProgress = () => {},
    resumeState = undefined,
    shouldPause = () => false,
  } = {}) {
    const profilePath = getCurrentProfilePath();
    if (!profilePath) {
      throw new Error('Profil uživatele nebyl nalezen.');
    }

    const userSlug = extractUserSlugFromProfilePath(profilePath);
    if (!userSlug) {
      throw new Error('Nepodařilo se přečíst ID uživatele z profilu.');
    }

    const allRecords = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const userRecords = allRecords.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));

    let parentCandidatesCount = 0;
    let unresolvedParents = [];
    let startIndex = 0;
    let processed = 0;
    let saved = 0;
    let skippedNonComputed = 0;

    const recordsByMovieId = new Map();

    for (const record of userRecords) {
      const existing = recordsByMovieId.get(record.movieId);
      if (!existing) {
        recordsByMovieId.set(record.movieId, record);
      } else if (existing?.computed === true && record?.computed !== true) {
        recordsByMovieId.set(record.movieId, record);
      }

      if (record.computed === true && !record.computedFromText) {
        record.computedFromText = 'spocten';
      }
    }

    if (
      resumeState &&
      isStateForCurrentUser(resumeState, userSlug) &&
      Array.isArray(resumeState.unresolvedParents) &&
      resumeState.unresolvedParents.length > 0
    ) {
      unresolvedParents = resumeState.unresolvedParents;
      parentCandidatesCount = Number.parseInt(resumeState.parentCandidatesCount || `${unresolvedParents.length}`, 10);
      startIndex = Math.max(0, Number.parseInt(resumeState.nextIndex || '0', 10));
      processed = Math.max(0, Number.parseInt(resumeState.processed || '0', 10));
      saved = Math.max(0, Number.parseInt(resumeState.saved || '0', 10));
      skippedNonComputed = Math.max(0, Number.parseInt(resumeState.skippedNonComputed || '0', 10));
    } else {
      const parentCandidatesMap = new Map();
      for (const record of userRecords) {
        if (Number.isFinite(record.parentId) && typeof record.parentName === 'string' && record.parentName.length > 0) {
          parentCandidatesMap.set(record.parentId, record.parentName);
        }
      }

      const parentCandidates = Array.from(parentCandidatesMap.entries()).map(([parentId, parentSlug]) => ({
        parentId,
        parentSlug,
      }));
      parentCandidatesCount = parentCandidates.length;

      unresolvedParents = parentCandidates.filter(({ parentId }) => {
        const existingParent = recordsByMovieId.get(parentId);
        return !existingParent || existingParent.computed === true;
      });
    }

    setPersistedComputedLoaderState({
      status: 'running',
      userSlug,
      profilePath,
      parentCandidatesCount,
      unresolvedParents,
      nextIndex: startIndex,
      processed,
      saved,
      skippedNonComputed,
    });

    onProgress({
      stage: 'prepare',
      current: Math.min(startIndex, unresolvedParents.length),
      total: unresolvedParents.length || 1,
      message: `Kandidáti parent položek: ${parentCandidatesCount}, k dopočtu: ${unresolvedParents.length}`,
    });

    for (let index = startIndex; index < unresolvedParents.length; index++) {
      if (shouldPause()) {
        setPersistedComputedLoaderState({
          status: 'paused',
          pauseReason: computedLoaderController.pauseReason || 'manual',
          userSlug,
          profilePath,
          parentCandidatesCount,
          unresolvedParents,
          nextIndex: index,
          processed,
          saved,
          skippedNonComputed,
        });

        return {
          userSlug,
          candidates: parentCandidatesCount,
          unresolved: unresolvedParents.length,
          processed,
          saved,
          skippedNonComputed,
          paused: true,
          nextIndex: index,
        };
      }

      const { parentId, parentSlug } = unresolvedParents[index];
      processed = index + 1;

      const existingRecord = recordsByMovieId.get(parentId);
      const reviewsUrl = buildParentReviewsUrl(parentSlug);
      const doc = await fetchRatingsPageDocument(reviewsUrl);
      const parsedRating = parseCurrentUserRatingFromDocument(doc);

      if (!parsedRating) {
        onProgress({
          stage: 'fetch',
          current: processed,
          total: unresolvedParents.length || 1,
          message: `Stránka ${processed}/${unresolvedParents.length}: bez uživatelského hodnocení (${parentSlug})`,
        });

        setPersistedComputedLoaderState({
          status: 'running',
          userSlug,
          profilePath,
          parentCandidatesCount,
          unresolvedParents,
          nextIndex: index + 1,
          processed,
          saved,
          skippedNonComputed,
        });
        continue;
      }

      if (!parsedRating.computed) {
        skippedNonComputed += 1;
        onProgress({
          stage: 'fetch',
          current: processed,
          total: unresolvedParents.length || 1,
          message: `Přeskakuji ne-spočtené hodnocení (${processed}/${unresolvedParents.length})`,
        });

        setPersistedComputedLoaderState({
          status: 'running',
          userSlug,
          profilePath,
          parentCandidatesCount,
          unresolvedParents,
          nextIndex: index + 1,
          processed,
          saved,
          skippedNonComputed,
        });
        continue;
      }

      const record = toComputedParentRecord({
        userSlug,
        parentId,
        parentSlug,
        existingRecord,
        parsedRating,
        doc,
      });

      await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record);
      recordsByMovieId.set(parentId, record);
      saved += 1;

      setPersistedComputedLoaderState({
        status: 'running',
        userSlug,
        profilePath,
        parentCandidatesCount,
        unresolvedParents,
        nextIndex: index + 1,
        processed,
        saved,
        skippedNonComputed,
      });

      onProgress({
        stage: 'fetch',
        current: processed,
        total: unresolvedParents.length || 1,
        message: `Dopočítávám ${processed}/${unresolvedParents.length}… (${saved} spočtených uloženo)`,
      });

      if (index < unresolvedParents.length - 1) {
        await delay(randomDelay());
      }
    }

    return {
      userSlug,
      candidates: parentCandidatesCount,
      unresolved: unresolvedParents.length,
      processed,
      saved,
      skippedNonComputed,
      paused: false,
      nextIndex: unresolvedParents.length,
    };
  }

  async function loadRatingsForCurrentUser(
    maxPages = DEFAULT_MAX_PAGES,
    onProgress = () => {},
    resumeState = undefined,
    options = {},
  ) {
    const incremental = options.incremental !== false;
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

    const allExistingRecords = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const userExistingRecords = allExistingRecords.filter(
      (record) => record.userSlug === userSlug && Number.isFinite(record.movieId),
    );
    const existingRecordsById = new Map(userExistingRecords.map((record) => [record.id, record]));
    let directRatingsCount = userExistingRecords.filter((record) => record.computed !== true).length;

    const detectedTargetPages =
      maxPages === 0 ? Math.max(1, maxDetectedPages) : Math.max(1, Math.min(maxPages, maxDetectedPages));

    const startPage = Math.max(1, Number.parseInt(resumeState?.nextPage || '1', 10));
    const targetPages = Math.max(startPage, Number.parseInt(resumeState?.targetPages || detectedTargetPages, 10));
    let totalParsed = Number.parseInt(resumeState?.totalParsed || '0', 10);
    let loadedPages = Number.parseInt(resumeState?.loadedPages || '0', 10);
    let totalUpserted = Number.parseInt(resumeState?.totalUpserted || '0', 10);
    let consecutiveStablePages = Number.parseInt(resumeState?.consecutiveStablePages || '0', 10);
    let stoppedEarly = false;

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
      totalUpserted,
      directRatingsCount,
      consecutiveStablePages,
      incremental,
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
          totalUpserted,
          directRatingsCount,
          consecutiveStablePages,
          incremental,
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
      const changedRecords = [];

      for (const record of storageRecords) {
        const existing = existingRecordsById.get(record.id);
        const recordChanged = hasRecordChanged(existing, record);
        if (!recordChanged) {
          continue;
        }

        changedRecords.push(record);

        if (!existing && record.computed !== true) {
          directRatingsCount += 1;
        } else if (existing) {
          const existingIsDirect = existing.computed !== true;
          const nextIsDirect = record.computed !== true;
          if (existingIsDirect && !nextIsDirect) {
            directRatingsCount = Math.max(0, directRatingsCount - 1);
          } else if (!existingIsDirect && nextIsDirect) {
            directRatingsCount += 1;
          }
        }

        existingRecordsById.set(record.id, record);
      }

      if (changedRecords.length > 0) {
        await saveToIndexedDB(INDEXED_DB_NAME, getStoreNameForUser(), changedRecords);
        totalUpserted += changedRecords.length;
        consecutiveStablePages = 0;
      } else {
        consecutiveStablePages += 1;
      }

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
        totalUpserted,
        directRatingsCount,
        consecutiveStablePages,
        incremental,
      });

      onProgress({
        page,
        totalPages: targetPages,
        totalParsed,
        totalRatings,
        changedOnPage: changedRecords.length,
        totalUpserted,
        directRatingsCount,
        incremental,
      });

      const shouldStopEarly =
        incremental && page >= 2 && totalRatings > 0 && directRatingsCount >= totalRatings && consecutiveStablePages >= 1;

      if (shouldStopEarly) {
        stoppedEarly = true;
        break;
      }

      if (page < targetPages) {
        await delay(randomDelay());
      }
    }

    return {
      userSlug,
      totalPagesLoaded: loadedPages,
      totalPagesDetected: maxDetectedPages,
      totalParsed,
      totalUpserted,
      totalRatings,
      directRatingsCount,
      storeName: getStoreNameForUser(),
      paused: false,
      nextPage: stoppedEarly ? loadedPages + 1 : targetPages + 1,
      targetPages,
      stoppedEarly,
      incremental,
    };
  }

  function initializeRatingsLoader(rootElement) {
    const loadButton = rootElement.querySelector('#cc-load-ratings-btn');
    const computedButton = rootElement.querySelector('#cc-load-computed-btn');
    const cancelPausedButton = rootElement.querySelector('#cc-cancel-ratings-loader-btn');
    const progress = {
      container: rootElement.querySelector('#cc-ratings-progress'),
      label: rootElement.querySelector('#cc-ratings-progress-label'),
      count: rootElement.querySelector('#cc-ratings-progress-count'),
      bar: rootElement.querySelector('#cc-ratings-progress-bar'),
    };

    if (!loadButton || !computedButton || !progress.container || !progress.label || !progress.count || !progress.bar) {
      return;
    }

    const setCancelPausedButtonVisible = (visible, mode = 'ratings') => {
      if (!cancelPausedButton) {
        return;
      }
      cancelPausedButton.hidden = !visible;
      cancelPausedButton.disabled = false;
      cancelPausedButton.dataset.mode = mode;
      const labelEl = getButtonLabelElement(cancelPausedButton);
      labelEl.textContent = mode === 'computed' ? 'Zrušit dopočet' : 'Zrušit načítání';
    };

    if (loadButton.dataset.ccRatingsBound === 'true') {
      return;
    }

    loadButton.dataset.ccRatingsBound = 'true';

    const setComputedButtonMode = (mode) => {
      const labelEl = getButtonLabelElement(computedButton);
      if (mode === 'running') {
        computedButton.disabled = false;
        labelEl.textContent = 'Pozastavit dopočet';
        return;
      }

      if (mode === 'pausing') {
        computedButton.disabled = true;
        labelEl.textContent = 'Pozastavuji…';
        return;
      }

      if (mode === 'resume') {
        computedButton.disabled = false;
        labelEl.textContent = 'Pokračovat v dopočtu';
        return;
      }

      computedButton.disabled = false;
      labelEl.textContent = 'Dopočítat seriály';
    };

    const runLoad = async ({ resumeState = undefined, autoResume = false } = {}) => {
      if (loaderController.isRunning || computedLoaderController.isRunning) {
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
          ({
            page,
            totalPages,
            totalParsed,
            changedOnPage = 0,
            totalUpserted = 0,
            incremental: isIncremental = true,
          }) => {
            updateProgressUI(progress, {
              label: isIncremental
                ? `Kontroluji stránku ${page}/${totalPages}… (${changedOnPage} změn, celkem ${totalUpserted})`
                : `Načítám stránku ${page}/${totalPages}… (${totalParsed} položek)`,
              current: page,
              total: totalPages,
            });

            if (loaderController.pauseRequested) {
              setLoadButtonMode(loadButton, 'pausing');
            }
          },
          resumeState,
          {
            incremental: resumeState?.incremental !== false,
          },
        );

        if (result.paused) {
          updateProgressUI(progress, {
            label: `Pozastaveno na stránce ${result.nextPage}/${result.targetPages}`,
            current: Math.max(0, result.nextPage - 1),
            total: result.targetPages || 1,
          });
          setCancelPausedButtonVisible(true, 'ratings');
        } else {
          clearPersistedLoaderState();
          updateProgressUI(progress, {
            label: result.incremental
              ? `Hotovo: ${result.totalUpserted} nových/změněných (${result.totalPagesLoaded} str.)`
              : `Hotovo: ${result.totalParsed} hodnocení zpracováno (${result.totalPagesLoaded} str.)`,
            current: result.totalPagesLoaded,
            total: result.totalPagesLoaded || 1,
          });
          setCancelPausedButtonVisible(false, 'ratings');
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
          setCancelPausedButtonVisible(true, 'ratings');
        } else {
          setLoadButtonMode(loadButton, 'idle');
          const computedState = getPersistedComputedLoaderState();
          const hasComputedPause =
            computedState?.status === 'paused' && isStateForCurrentUser(computedState, currentUserSlug);
          setCancelPausedButtonVisible(hasComputedPause, hasComputedPause ? 'computed' : 'ratings');
        }
      }
    };

    const runComputedLoad = async ({ resumeState = undefined, autoResume = false } = {}) => {
      if (loaderController.isRunning || computedLoaderController.isRunning) {
        return;
      }

      try {
        computedLoaderController.isRunning = true;
        computedLoaderController.pauseRequested = false;
        setComputedButtonMode('running');

        const total = Math.max(1, Number.parseInt(resumeState?.unresolvedParents?.length || '1', 10));
        const startIndex = Math.max(0, Number.parseInt(resumeState?.nextIndex || '0', 10));
        updateProgressUI(progress, {
          label: autoResume ? `Pokračuji v dopočtu od položky ${startIndex + 1}…` : 'Připravuji dopočet seriálů…',
          current: Math.min(startIndex, total),
          total,
        });

        const result = await loadComputedParentRatingsForCurrentUser({
          resumeState,
          shouldPause: () => computedLoaderController.pauseRequested,
          onProgress: ({ current, total: progressTotal, message }) => {
            updateProgressUI(progress, {
              label: message,
              current,
              total: progressTotal,
            });

            if (computedLoaderController.pauseRequested) {
              setComputedButtonMode('pausing');
            }
          },
        });

        if (result.paused) {
          updateProgressUI(progress, {
            label: `Dopočet pozastaven na položce ${Math.min(result.nextIndex + 1, result.unresolved)}/${result.unresolved || 1}`,
            current: result.nextIndex,
            total: result.unresolved || 1,
          });
          setCancelPausedButtonVisible(true, 'computed');
        } else {
          clearPersistedComputedLoaderState();
          updateProgressUI(progress, {
            label: `Hotovo: ${result.saved} uloženo, ${result.skippedNonComputed} přeskočeno`,
            current: result.processed,
            total: result.unresolved || 1,
          });
          setCancelPausedButtonVisible(false, 'computed');
        }

        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      } catch (error) {
        setPersistedComputedLoaderState({
          ...(getPersistedComputedLoaderState() || {}),
          status: 'paused',
          pauseReason: 'interrupted',
        });
        updateProgressUI(progress, {
          label: `Chyba dopočtu: ${error.message}`,
          current: 0,
          total: 1,
        });
        console.error('[CC] Computed ratings loader failed:', error);
      } finally {
        computedLoaderController.isRunning = false;
        computedLoaderController.pauseRequested = false;
        computedLoaderController.pauseReason = 'manual';

        const currentUserSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
        const stateAfterRun = getPersistedComputedLoaderState();
        if (stateAfterRun?.status === 'paused' && isStateForCurrentUser(stateAfterRun, currentUserSlug)) {
          setComputedButtonMode('resume');
          setCancelPausedButtonVisible(true, 'computed');
        } else {
          setComputedButtonMode('idle');
          setCancelPausedButtonVisible(false, 'computed');
        }
      }
    };

    if (cancelPausedButton) {
      cancelPausedButton.addEventListener('click', () => {
        if (loaderController.isRunning || computedLoaderController.isRunning) {
          return;
        }

        const userSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
        const ratingsState = getPersistedLoaderState();
        const computedState = getPersistedComputedLoaderState();

        const hasRatingsPause = ratingsState?.status === 'paused' && isStateForCurrentUser(ratingsState, userSlug);
        const hasComputedPause = computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug);

        if (hasComputedPause && !hasRatingsPause) {
          const pausedCurrent = Math.max(
            0,
            Number.parseInt(computedState?.processed || `${computedState?.nextIndex || 0}`, 10),
          );
          const pausedTotal = Math.max(1, Number.parseInt(computedState?.unresolvedParents?.length || '1', 10));
          clearPersistedComputedLoaderState();
          setComputedButtonMode('idle');
          updateProgressUI(progress, {
            label: 'Pozastavený dopočet byl zrušen',
            current: pausedCurrent,
            total: pausedTotal,
          });
        } else {
          const pausedCurrent = Math.max(
            0,
            Number.parseInt(ratingsState?.loadedPages || `${Math.max(0, (ratingsState?.nextPage || 1) - 1)}`, 10),
          );
          const pausedTotal = Math.max(1, Number.parseInt(ratingsState?.targetPages || '1', 10));
          clearPersistedLoaderState();
          setLoadButtonMode(loadButton, 'idle');
          updateProgressUI(progress, {
            label: 'Pozastavené načítání bylo zrušeno',
            current: pausedCurrent,
            total: pausedTotal,
          });
        }

        setCancelPausedButtonVisible(false);
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      });
    }

    loadButton.title = 'Klik: rychlé doplnění chybějících/změněných, Shift+klik: plné načtení';

    loadButton.addEventListener('click', async (event) => {
      if (computedLoaderController.isRunning) {
        return;
      }

      if (loaderController.isRunning) {
        loaderController.pauseRequested = true;
        loaderController.pauseReason = 'manual';
        setLoadButtonMode(loadButton, 'pausing');
        return;
      }

      const state = getPersistedLoaderState();
      const forceFullLoad = event.shiftKey === true;
      const resumeState = state?.status === 'paused' ? state : undefined;

      if (forceFullLoad && resumeState) {
        resumeState.incremental = false;
      }

      await runLoad({
        resumeState: resumeState
          ? resumeState
          : {
              incremental: !forceFullLoad,
            },
        autoResume: false,
      });
    });

    if (computedButton.dataset.ccComputedBound !== 'true') {
      computedButton.dataset.ccComputedBound = 'true';
      computedButton.addEventListener('click', async () => {
        if (loaderController.isRunning) {
          return;
        }

        if (computedLoaderController.isRunning) {
          computedLoaderController.pauseRequested = true;
          computedLoaderController.pauseReason = 'manual';
          setComputedButtonMode('pausing');
          return;
        }

        const computedState = getPersistedComputedLoaderState();
        await runComputedLoad({
          resumeState: computedState?.status === 'paused' ? computedState : undefined,
          autoResume: false,
        });
      });
    }

    const userSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
    const state = getPersistedLoaderState();
    const computedState = getPersistedComputedLoaderState();
    let cancelMode = 'ratings';

    if (state?.status === 'paused' && isStateForCurrentUser(state, userSlug)) {
      setLoadButtonMode(loadButton, 'resume');
      cancelMode = 'ratings';

      if (state.pauseReason === 'manual') {
        updateProgressUI(progress, {
          label: `Pozastaveno ručně na stránce ${state.nextPage}/${state.targetPages || '?'}`,
          current: Math.max(0, (state.nextPage || 1) - 1),
          total: state.targetPages || 1,
        });
      } else {
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

    if (computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug)) {
      setComputedButtonMode('resume');
      cancelMode = 'computed';

      if (computedState.pauseReason === 'manual') {
        updateProgressUI(progress, {
          label: `Dopočet pozastaven ručně na položce ${(computedState.nextIndex || 0) + 1}/${computedState.unresolvedParents?.length || 1}`,
          current: computedState.nextIndex || 0,
          total: computedState.unresolvedParents?.length || 1,
        });
      } else {
        updateProgressUI(progress, {
          label: `Nalezen nedokončený dopočet (${computedState.nextIndex || 0}/${computedState.unresolvedParents?.length || 1}) — automaticky pokračuji…`,
          current: computedState.nextIndex || 0,
          total: computedState.unresolvedParents?.length || 1,
        });

        setTimeout(() => {
          runComputedLoad({ resumeState: computedState, autoResume: true });
        }, 500);
      }
    }

    const hasAnyPaused =
      (state?.status === 'paused' && isStateForCurrentUser(state, userSlug)) ||
      (computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug));
    setCancelPausedButtonVisible(hasAnyPaused, cancelMode);
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

  const UPDATE_CHECK_CACHE_KEY = 'cc_update_check_cache_v1';
  const VERSION_DETAILS_CACHE_KEY = 'cc_version_details_cache_v1';
  const UPDATE_CHECK_MAX_AGE_MS = 1000 * 60 * 60 * 12;
  const GREASYFORK_SCRIPT_API_URL = 'https://greasyfork.org/scripts/425054.json';

  function escapeHtml$1(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseVersionParts(version) {
    return String(version || '')
      .trim()
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part));
  }

  function compareVersions(left, right) {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const maxLen = Math.max(leftParts.length, rightParts.length);

    for (let i = 0; i < maxLen; i += 1) {
      const l = leftParts[i] ?? 0;
      const r = rightParts[i] ?? 0;
      if (l > r) return 1;
      if (l < r) return -1;
    }

    return 0;
  }

  function parseCurrentVersionFromText(versionText) {
    return String(versionText || '')
      .replace(/^v/i, '')
      .trim();
  }

  function getCachedUpdateInfo() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UPDATE_CHECK_CACHE_KEY) || 'null');
      if (!parsed || !parsed.checkedAt || !parsed.latestVersion) {
        return undefined;
      }

      if (Date.now() - Number(parsed.checkedAt) > UPDATE_CHECK_MAX_AGE_MS) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  function setCachedUpdateInfo(latestVersion) {
    localStorage.setItem(
      UPDATE_CHECK_CACHE_KEY,
      JSON.stringify({
        latestVersion,
        checkedAt: Date.now(),
      }),
    );
  }

  async function fetchLatestScriptVersion() {
    const response = await fetch(GREASYFORK_SCRIPT_API_URL, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Update check failed: ${response.status}`);
    }

    const payload = await response.json();
    const latestVersion = String(payload?.version || '').trim();
    if (!latestVersion) {
      throw new Error('Update check returned empty version');
    }

    return latestVersion;
  }

  function getCachedVersionDetails() {
    try {
      const parsed = JSON.parse(localStorage.getItem(VERSION_DETAILS_CACHE_KEY) || 'null');
      if (!parsed || !parsed.checkedAt || !parsed.latestVersion) {
        return undefined;
      }

      if (Date.now() - Number(parsed.checkedAt) > UPDATE_CHECK_MAX_AGE_MS) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  function setCachedVersionDetails(details) {
    localStorage.setItem(
      VERSION_DETAILS_CACHE_KEY,
      JSON.stringify({
        ...details,
        checkedAt: Date.now(),
      }),
    );
  }

  function normalizeVersionLabel(version) {
    const normalized = parseCurrentVersionFromText(version);
    return normalized ? `v${normalized}` : '—';
  }

  function formatVersionDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '—';
    }

    const parsedDate = new Date(raw);
    if (Number.isNaN(parsedDate.getTime())) {
      return raw;
    }

    return parsedDate.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function extractChangelogItems(changelogElement) {
    if (!changelogElement) {
      return [];
    }

    const listItems = Array.from(changelogElement.querySelectorAll('li'))
      .map((item) => item.textContent?.trim())
      .filter(Boolean);

    if (listItems.length > 0) {
      return listItems.slice(0, 12);
    }

    return String(changelogElement.textContent || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  async function fetchLatestVersionDetails() {
    const response = await fetch(`${GREASYFORK_URL}/versions`, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Version details fetch failed: ${response.status}`);
    }

    const pageHtml = await response.text();
    const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
    const versionNumberText = doc.querySelector('.version-number a, .version-number')?.textContent?.trim() || '';
    const latestVersion = parseCurrentVersionFromText(versionNumberText);
    if (!latestVersion) {
      throw new Error('Version details returned empty version number');
    }

    const datetimeRaw = doc.querySelector('.version-date')?.getAttribute('datetime') || '';
    const changelogElement = doc.querySelector('.version-changelog');
    const changelogItems = extractChangelogItems(changelogElement);

    return {
      latestVersion,
      datetimeRaw,
      changelogItems,
    };
  }

  function getVersionInfoModal() {
    let overlay = document.querySelector('#cc-version-info-overlay');
    if (overlay) {
      return {
        overlay,
        body: overlay.querySelector('.cc-version-info-body'),
      };
    }

    overlay = document.createElement('div');
    overlay.id = 'cc-version-info-overlay';
    overlay.className = 'cc-version-info-overlay';
    overlay.innerHTML = `
    <div class="cc-version-info-modal" role="dialog" aria-modal="true" aria-labelledby="cc-version-info-title">
      <div class="cc-version-info-head">
        <h3 id="cc-version-info-title">Informace o verzi</h3>
        <button type="button" class="cc-version-info-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-version-info-body"></div>
    </div>
  `;

    const closeButton = overlay.querySelector('.cc-version-info-close');
    closeButton?.addEventListener('click', () => {
      overlay.classList.remove('is-open');
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.classList.remove('is-open');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
        overlay.classList.remove('is-open');
      }
    });

    document.body.appendChild(overlay);
    return {
      overlay,
      body: overlay.querySelector('.cc-version-info-body'),
    };
  }

  function renderVersionInfoContent(bodyElement, currentVersion, details, state) {
    if (!bodyElement) {
      return;
    }

    if (state === 'loading') {
      bodyElement.innerHTML = '<p class="cc-version-info-loading">Načítám informace o verzi…</p>';
      return;
    }

    if (state === 'error') {
      bodyElement.innerHTML = `
      <div class="cc-version-info-meta">
        <div class="cc-version-info-key">Nainstalováno</div>
        <div class="cc-version-info-value">${escapeHtml$1(normalizeVersionLabel(currentVersion))}</div>
      </div>
      <p class="cc-version-info-empty">Nepodařilo se načíst informace z GreasyFork.</p>
    `;
      return;
    }

    const latestVersion = details?.latestVersion || '';
    const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
    const statusClass = hasUpdate ? 'is-update' : 'is-ok';
    const statusText = hasUpdate ? 'K dispozici je novější verze' : 'Používáte aktuální verzi';
    const changelogItems = Array.isArray(details?.changelogItems) ? details.changelogItems : [];

    const changelogHtml = changelogItems.length
      ? `<ul class="cc-version-info-list">${changelogItems.map((item) => `<li>${escapeHtml$1(item)}</li>`).join('')}</ul>`
      : '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';

    bodyElement.innerHTML = `
    <div class="cc-version-info-meta">
      <div class="cc-version-info-key">Nainstalováno</div>
      <div class="cc-version-info-value">${escapeHtml$1(normalizeVersionLabel(currentVersion))}</div>

      <div class="cc-version-info-key">Nejnovější</div>
      <div class="cc-version-info-value">${escapeHtml$1(normalizeVersionLabel(latestVersion))}</div>

      <div class="cc-version-info-key">Poslední aktualizace</div>
      <div class="cc-version-info-value">${escapeHtml$1(formatVersionDateTime(details?.datetimeRaw))}</div>

      <div class="cc-version-info-key">Stav</div>
      <div class="cc-version-info-value">
        <span class="cc-version-info-status ${statusClass}">
          <span class="cc-version-info-status-dot" aria-hidden="true"></span>
          ${escapeHtml$1(statusText)}
        </span>
      </div>
    </div>
    <h4 class="cc-version-info-section-title">Changelog</h4>
    ${changelogHtml}
  `;
  }

  async function openVersionInfoModal(menuRootElement) {
    const modal = getVersionInfoModal();
    const versionTextEl = menuRootElement.querySelector('#cc-version-value');
    const currentVersion = parseCurrentVersionFromText(versionTextEl?.textContent || '');

    renderVersionInfoContent(modal.body, currentVersion, null, 'loading');
    modal.overlay.classList.add('is-open');

    const cached = getCachedVersionDetails();
    if (cached) {
      renderVersionInfoContent(modal.body, currentVersion, cached, 'ready');
      return;
    }

    try {
      const details = await fetchLatestVersionDetails();
      setCachedVersionDetails(details);
      renderVersionInfoContent(modal.body, currentVersion, details, 'ready');
    } catch {
      renderVersionInfoContent(modal.body, currentVersion, null, 'error');
    }
  }

  function setVersionStatus(versionStatusEl, state, latestVersion) {
    if (!versionStatusEl) {
      return;
    }

    versionStatusEl.className = 'cc-version-status';
    versionStatusEl.textContent = '';
    versionStatusEl.removeAttribute('title');

    if (state === 'hidden') {
      return;
    }

    versionStatusEl.classList.add('is-visible');

    if (state === 'checking') {
      versionStatusEl.classList.add('is-checking');
      versionStatusEl.title = 'Kontroluji aktualizaci…';
      return;
    }

    if (state === 'ok') {
      versionStatusEl.classList.add('is-ok');
      versionStatusEl.title = 'Používáte aktuální verzi.';
      return;
    }

    if (state === 'update') {
      versionStatusEl.classList.add('is-update');
      versionStatusEl.textContent = '↑';
      versionStatusEl.title = `K dispozici je nová verze: v${latestVersion}`;
      return;
    }

    versionStatusEl.classList.add('is-error');
    versionStatusEl.title = 'Aktualizaci se nepodařilo ověřit.';
  }

  async function initializeVersionUi(menuRootElement) {
    const versionValueEl = menuRootElement.querySelector('#cc-version-value');
    const versionStatusEl = menuRootElement.querySelector('#cc-version-status');
    if (!versionValueEl || !versionStatusEl) {
      return;
    }

    const currentVersion = parseCurrentVersionFromText(versionValueEl.textContent);
    if (!currentVersion) {
      setVersionStatus(versionStatusEl, 'hidden');
      return;
    }

    setVersionStatus(versionStatusEl, 'checking');

    const cached = getCachedUpdateInfo();
    if (cached?.latestVersion) {
      const isUpdateAvailable = compareVersions(cached.latestVersion, currentVersion) > 0;
      setVersionStatus(versionStatusEl, isUpdateAvailable ? 'update' : 'ok', cached.latestVersion);
      return;
    }

    try {
      const latestVersion = await fetchLatestScriptVersion();
      setCachedUpdateInfo(latestVersion);
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      setVersionStatus(versionStatusEl, isUpdateAvailable ? 'update' : 'ok', latestVersion);
    } catch {
      setVersionStatus(versionStatusEl, 'error');
    }
  }

  function getCurrentUserRatingsUrl() {
    const profileEl = document.querySelector('a.profile.initialized');
    const profileHref = profileEl?.getAttribute('href');
    if (!profileHref) {
      return undefined;
    }

    const url = new URL(profileHref, location.origin);
    const segment = location.hostname.endsWith('.sk') ? 'hodnotenia' : 'hodnoceni';
    if (/\/(prehled|prehlad)\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/(prehled|prehlad)\/?$/i, `/${segment}/`);
    } else {
      url.pathname = url.pathname.endsWith('/') ? `${url.pathname}${segment}/` : `${url.pathname}/${segment}/`;
    }
    url.search = '';
    return url.toString();
  }

  function parseTotalRatingsFromDocument(doc) {
    const extractCount = (text) => {
      const normalized = String(text || '').replace(/\u00a0/g, ' ');
      const match = normalized.match(/\(([^)]+)\)/);
      if (!match) {
        return 0;
      }

      const parsed = Number.parseInt(match[1].replace(/\s+/g, ''), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const preferredSelectors = ['#snippet--ratings h2', '#snippet--ratings .box-header h2', 'h2.page-header', 'h2'];
    for (const selector of preferredSelectors) {
      const heading = doc.querySelector(selector)?.textContent || '';
      const value = extractCount(heading);
      if (value > 0) {
        return value;
      }
    }

    const headingWithRatingsWord = Array.from(doc.querySelectorAll('h2, h3')).find((heading) => {
      const text = String(heading?.textContent || '');
      return /hodnocen|hodnoten/i.test(text) && /\(\s*[\d\s\u00a0]+\s*\)/.test(text);
    });

    return extractCount(headingWithRatingsWord?.textContent || '');
  }

  function getTotalRatingsFromCurrentPageForCurrentUser() {
    const path = location.pathname || '';
    if (!/\/uzivatel\//.test(path) || !/\/(hodnoceni|hodnotenia)\/?$/i.test(path)) {
      return 0;
    }

    return parseTotalRatingsFromDocument(document);
  }

  async function fetchTotalRatingsForCurrentUser() {
    const currentPageTotal = getTotalRatingsFromCurrentPageForCurrentUser();
    if (currentPageTotal > 0) {
      return currentPageTotal;
    }

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

  function updateSyncButtonAuthState(rootElement, isLoggedIn) {
    const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');
    if (!syncButton) {
      return;
    }

    if (!isLoggedIn) {
      syncButton.classList.add('cc-sync-icon-btn-disabled');
      syncButton.setAttribute('title', 'Cloud sync je dostupný po přihlášení.');
      syncButton.setAttribute('aria-label', 'Cloud sync je dostupný po přihlášení.');
      return;
    }

    syncButton.classList.remove('cc-sync-icon-btn-disabled');
  }

  async function refreshRatingsBadges(rootElement, options) {
    const redBadge = rootElement.querySelector('#cc-badge-red');
    const blackBadge = rootElement.querySelector('#cc-badge-black');
    if (!redBadge || !blackBadge) {
      return;
    }

    const isLoggedIn = options.isUserLoggedIn();
    if (!isLoggedIn) {
      redBadge.textContent = '- / -';
      blackBadge.textContent = '-';
      redBadge.title = 'Pro načtení hodnocení se přihlaste.';
      blackBadge.title = 'Pro načtení hodnocení se přihlaste.';
      redBadge.classList.add('cc-badge-disabled');
      redBadge.classList.remove('cc-badge-warning');
      blackBadge.classList.add('cc-badge-disabled');
      updateSyncButtonAuthState(rootElement, false);
      return;
    }

    redBadge.classList.remove('cc-badge-disabled');
    redBadge.classList.remove('cc-badge-warning');
    blackBadge.classList.remove('cc-badge-disabled');
    redBadge.title = 'Zobrazit načtená hodnocení';
    blackBadge.title = 'Zobrazit spočtená hodnocení';
    updateSyncButtonAuthState(rootElement, true);

    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const userSlug = options.getCurrentUserSlug() || options.getMostFrequentUserSlug(records);
    if (!userSlug) {
      redBadge.textContent = '0 / 0';
      blackBadge.textContent = '0';
      return;
    }

    const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));
    const computedCount = userRecords.filter((record) => record.computed === true).length;
    const directRatingsCount = userRecords.length - computedCount;
    const fetchedTotalRatings = await fetchTotalRatingsForCurrentUser();
    const totalRatings = fetchedTotalRatings > 0 ? fetchedTotalRatings : directRatingsCount;

    redBadge.textContent = `${directRatingsCount} / ${totalRatings}`;
    if (directRatingsCount < totalRatings) {
      redBadge.classList.add('cc-badge-warning');
      redBadge.title = `Nenačtená hodnocení: ${totalRatings - directRatingsCount}. Klikněte na načtení.`;
    }
    blackBadge.textContent = `${computedCount}`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveRecordUrl(record) {
    if (record.fullUrl) {
      return record.fullUrl;
    }

    if (record.url) {
      return new URL(`/film/${record.url}/`, location.origin).toString();
    }

    return '';
  }

  function normalizeModalType(rawType) {
    const normalized = String(rawType || '').toLowerCase();
    if (normalized.includes('epizoda') || normalized === 'episode') {
      return { key: 'episode', label: 'Episode' };
    }
    if (normalized.includes('seriál') || normalized.includes('serial') || normalized === 'serial') {
      return { key: 'series', label: 'Series' };
    }
    if (normalized.includes('série') || normalized.includes('serie') || normalized === 'series') {
      return { key: 'season', label: 'Season' };
    }
    return { key: 'movie', label: 'Movie' };
  }

  function formatRatingForModal(ratingValue) {
    if (!Number.isFinite(ratingValue)) {
      return { stars: '—', isOdpad: false };
    }

    if (ratingValue === 0) {
      return { stars: 'Odpad', isOdpad: true };
    }

    const clamped = Math.max(0, Math.min(5, Math.trunc(ratingValue)));
    return {
      stars: '★'.repeat(clamped),
      isOdpad: false,
    };
  }

  function extractSeriesInfoToken(record, typeKey) {
    const candidates = [record?.url, record?.fullUrl, record?.name]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    for (const source of candidates) {
      const seasonEpisodeMatch = source.match(/s(\d{1,2})e(\d{1,2})/i);
      if (seasonEpisodeMatch) {
        const season = seasonEpisodeMatch[1].padStart(2, '0');
        const episode = seasonEpisodeMatch[2].padStart(2, '0');
        return `S${season}E${episode}`;
      }

      const seasonOnlyMatch = source.match(/(?:season|série|serie|seri[áa]l)[\s\-\(]*s?(\d{1,2})/i);
      if (seasonOnlyMatch) {
        const season = seasonOnlyMatch[1].padStart(2, '0');
        return `S${season}`;
      }

      const episodeOnlyMatch = source.match(/(?:episode|epizoda|ep\.?)[\s\-\(]*(\d{1,3})/i);
      if (episodeOnlyMatch) {
        const episode = episodeOnlyMatch[1].padStart(2, '0');
        return `E${episode}`;
      }
    }

    return typeKey === 'season' ? 'S??' : typeKey === 'episode' ? 'E??' : '';
  }

  function getRatingSquareClass(ratingValue) {
    if (!Number.isFinite(ratingValue)) {
      return 'is-unknown';
    }

    if (ratingValue <= 1) return 'is-1';
    if (ratingValue === 2) return 'is-2';
    if (ratingValue === 3) return 'is-3';
    if (ratingValue === 4) return 'is-4';
    return 'is-5';
  }

  function parseCzechDateToSortableValue(dateText) {
    const trimmed = String(dateText || '').trim();
    const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) {
      return Number.NEGATIVE_INFINITY;
    }

    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
      return Number.NEGATIVE_INFINITY;
    }

    return year * 10000 + month * 100 + day;
  }

  function toModalRows(records) {
    return records.map((record) => {
      const ratingValue = Number.isFinite(record.rating) ? record.rating : Number.NEGATIVE_INFINITY;
      const normalizedType = normalizeModalType(record.type);
      const formattedRating = formatRatingForModal(record.rating);
      const parsedYear = Number.isFinite(record.year) ? record.year : NaN;
      const typeToken = extractSeriesInfoToken(record, normalizedType.key);
      const typeDisplay =
        normalizedType.key === 'season' || normalizedType.key === 'episode'
          ? `${normalizedType.label} (${typeToken})`
          : normalizedType.label;

      return {
        name: (record.name || '').trim(),
        url: resolveRecordUrl(record),
        typeKey: normalizedType.key,
        typeLabel: normalizedType.label,
        typeDisplay,
        yearValue: parsedYear,
        ratingText: formattedRating.stars,
        ratingIsOdpad: formattedRating.isOdpad,
        ratingValue,
        ratingSquareClass: getRatingSquareClass(record.rating),
        date: (record.date || '').trim(),
        dateSortValue: parseCzechDateToSortableValue(record.date),
        rawRecord: { ...record },
      };
    });
  }

  function normalizeSearchText(value) {
    return String(value || '').toLowerCase();
  }

  function sortRows(rows, sortKey, sortDir) {
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === 'type') {
        return a.typeDisplay.localeCompare(b.typeDisplay, 'en', { sensitivity: 'base' });
      }

      if (sortKey === 'year') {
        const aYear = Number.isFinite(a.yearValue) ? a.yearValue : -Infinity;
        const bYear = Number.isFinite(b.yearValue) ? b.yearValue : -Infinity;
        return aYear - bYear;
      }

      if (sortKey === 'rating') {
        return a.ratingValue - b.ratingValue;
      }

      if (sortKey === 'date') {
        return a.dateSortValue - b.dateSortValue;
      }

      return a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' });
    });

    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }

  function filterRows(rows, search) {
    const query = normalizeSearchText(search).trim();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => {
      return (
        normalizeSearchText(row.name).includes(query) ||
        normalizeSearchText(row.url).includes(query) ||
        normalizeSearchText(row.typeLabel).includes(query) ||
        normalizeSearchText(row.typeDisplay).includes(query) ||
        normalizeSearchText(row.yearValue).includes(query) ||
        normalizeSearchText(row.ratingText).includes(query) ||
        normalizeSearchText(row.date).includes(query)
      );
    });
  }

  function filterRowsByType(rows, typeFilters) {
    if (!typeFilters || typeFilters.size === 0 || typeFilters.has('all')) {
      return rows;
    }
    return rows.filter((row) => typeFilters.has(row.typeKey));
  }

  function createRatingDetailsController() {
    const detailsOverlay = document.createElement('div');
    detailsOverlay.className = 'cc-rating-detail-overlay';
    detailsOverlay.innerHTML = `
    <div class="cc-rating-detail-card" role="dialog" aria-modal="true" aria-labelledby="cc-rating-detail-title">
      <div class="cc-rating-detail-head">
        <h4 id="cc-rating-detail-title">Detail záznamu</h4>
        <button type="button" class="cc-rating-detail-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-rating-detail-body"></div>
    </div>
  `;

    const detailsBody = detailsOverlay.querySelector('.cc-rating-detail-body');
    const detailsTitle = detailsOverlay.querySelector('#cc-rating-detail-title');
    const closeDetailsBtn = detailsOverlay.querySelector('.cc-rating-detail-close');

    const orderedKeys = [
      'id',
      'userSlug',
      'movieId',
      'name',
      'url',
      'fullUrl',
      'type',
      'year',
      'rating',
      'date',
      'parentId',
      'parentName',
      'computed',
      'computedCount',
      'computedFromText',
      'lastUpdate',
    ];

    const open = (row) => {
      const record = row?.rawRecord || {};
      const extraKeys = Object.keys(record)
        .filter((key) => !orderedKeys.includes(key))
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
      const keys = [...orderedKeys.filter((key) => key in record), ...extraKeys];

      detailsTitle.textContent = row?.name ? `Detail: ${row.name}` : 'Detail záznamu';
      detailsBody.innerHTML = '';

      for (const key of keys) {
        const value = record[key];
        const rowEl = document.createElement('div');
        rowEl.className = 'cc-rating-detail-row';

        const keyEl = document.createElement('div');
        keyEl.className = 'cc-rating-detail-key';
        keyEl.textContent = key;

        const valueEl = document.createElement('div');
        valueEl.className = 'cc-rating-detail-value';
        if (value === null) {
          valueEl.textContent = 'null';
        } else if (typeof value === 'undefined') {
          valueEl.textContent = 'undefined';
        } else if (typeof value === 'object') {
          valueEl.textContent = JSON.stringify(value);
        } else if (typeof value === 'number' && Number.isNaN(value)) {
          valueEl.textContent = 'NaN';
        } else {
          valueEl.textContent = String(value);
        }

        rowEl.appendChild(keyEl);
        rowEl.appendChild(valueEl);
        detailsBody.appendChild(rowEl);
      }

      detailsOverlay.classList.add('is-open');
    };

    const close = () => {
      detailsOverlay.classList.remove('is-open');
    };

    closeDetailsBtn.addEventListener('click', close);
    detailsOverlay.addEventListener('click', (event) => {
      if (event.target === detailsOverlay) {
        close();
      }
    });

    return {
      overlay: detailsOverlay,
      open,
      close,
      isOpen: () => detailsOverlay.classList.contains('is-open'),
    };
  }

  const MODAL_RENDER_SYNC_THRESHOLD = 700;
  const MODAL_RENDER_CHUNK_SIZE = 450;

  function getRatingsTableModal() {
    let overlay = document.querySelector('#cc-ratings-table-modal-overlay');
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'cc-ratings-table-modal-overlay';
    overlay.className = 'cc-ratings-table-overlay';
    overlay.innerHTML = `
    <div class="cc-ratings-table-modal" role="dialog" aria-modal="true" aria-labelledby="cc-ratings-table-title">
      <div class="cc-ratings-table-head">
        <h3 id="cc-ratings-table-title">Přehled hodnocení</h3>
        <button type="button" class="cc-ratings-table-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-ratings-table-toolbar">
        <input type="search" class="cc-ratings-table-search" placeholder="Filtrovat (název, URL, hodnocení, datum)…" />
        <div class="cc-ratings-type-multiselect" data-open="false">
          <button type="button" class="cc-ratings-type-toggle" aria-expanded="false">All types</button>
          <div class="cc-ratings-type-menu" hidden>
            <label><input type="checkbox" value="all" checked /> All</label>
            <label><input type="checkbox" value="movie" /> Movie</label>
            <label><input type="checkbox" value="series" /> Series</label>
            <label><input type="checkbox" value="season" /> Season</label>
            <label><input type="checkbox" value="episode" /> Episode</label>
          </div>
        </div>
        <span class="cc-ratings-table-summary">0 položek</span>
      </div>
      <div class="cc-ratings-table-wrap">
        <table class="cc-ratings-table" aria-live="polite">
          <thead>
            <tr>
              <th><button type="button" data-sort-key="name"><span class="cc-sort-label">Název</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="type"><span class="cc-sort-label">Typ</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="year"><span class="cc-sort-label">Rok</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="rating"><span class="cc-sort-label">Hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="date"><span class="cc-sort-label">Datum hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

    const closeBtn = overlay.querySelector('.cc-ratings-table-close');
    const searchInput = overlay.querySelector('.cc-ratings-table-search');
    const typeMulti = overlay.querySelector('.cc-ratings-type-multiselect');
    const typeToggle = overlay.querySelector('.cc-ratings-type-toggle');
    const typeMenu = overlay.querySelector('.cc-ratings-type-menu');
    const typeCheckboxes = Array.from(overlay.querySelectorAll('.cc-ratings-type-menu input[type="checkbox"]'));
    const summary = overlay.querySelector('.cc-ratings-table-summary');
    const tbody = overlay.querySelector('tbody');
    const title = overlay.querySelector('#cc-ratings-table-title');
    const sortButtons = Array.from(overlay.querySelectorAll('th button[data-sort-key]'));

    const state = {
      rows: [],
      visibleRows: [],
      search: '',
      typeFilters: new Set(['all']),
      sortKey: 'name',
      sortDir: 'asc',
      renderToken: 0,
    };

    const detailsController = createRatingDetailsController();

    const updateTypeToggleText = () => {
      if (state.typeFilters.has('all') || state.typeFilters.size === 0) {
        typeToggle.textContent = 'All types';
        return;
      }

      const labels = [];
      if (state.typeFilters.has('movie')) labels.push('Movie');
      if (state.typeFilters.has('series')) labels.push('Series');
      if (state.typeFilters.has('season')) labels.push('Season');
      if (state.typeFilters.has('episode')) labels.push('Episode');
      typeToggle.textContent = labels.join(', ');
    };

    const syncTypeCheckboxes = () => {
      for (const input of typeCheckboxes) {
        input.checked = state.typeFilters.has(input.value);
      }
      updateTypeToggleText();
    };

    const buildRowHtml = (row, rowIndex) => {
      const detailsButton = `<button type="button" class="cc-ratings-table-details-btn cc-script-link-btn" data-row-index="${rowIndex}" aria-label="Zobrazit detail">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" />
            <path d="M12 11.5V15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="12" cy="8.2" r="1" fill="currentColor" />
          </svg>
        </button>`;

      const iconLink = row.url
        ? `<a class="cc-ratings-table-link-icon cc-script-link-btn" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer" aria-label="Otevřít detail">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path d="M9 8H6.5C5.1 8 4 9.1 4 10.5V17.5C4 18.9 5.1 20 6.5 20H13.5C14.9 20 16 18.9 16 17.5V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M10 14L20 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M14 4H20V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>`
        : '';

      const escapedName = escapeHtml(row.name || 'Bez názvu');
      const nameLink = row.url
        ? `<a class="cc-ratings-table-name-link" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapedName}</a>`
        : `<span class="cc-ratings-table-name-link">${escapedName}</span>`;

      return `
      <tr>
        <td>
          <div class="cc-ratings-table-name-row">
            <span class="cc-ratings-square ${escapeHtml(row.ratingSquareClass)}" aria-hidden="true"></span>
            ${nameLink}
            ${detailsButton}
            ${iconLink}
          </div>
        </td>
        <td class="cc-ratings-table-type">${escapeHtml(row.typeDisplay)}</td>
        <td class="cc-ratings-table-year">${Number.isFinite(row.yearValue) ? row.yearValue : '—'}</td>
        <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''}">${escapeHtml(row.ratingText)}</td>
        <td class="cc-ratings-table-date">${escapeHtml(row.date || '—')}</td>
      </tr>
    `;
    };

    const renderRowsFast = (rows, renderToken) => {
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="cc-ratings-table-empty">Žádná data</td></tr>';
        return;
      }

      if (rows.length <= MODAL_RENDER_SYNC_THRESHOLD) {
        let html = '';
        for (let index = 0; index < rows.length; index++) {
          html += buildRowHtml(rows[index], index);
        }
        if (state.renderToken === renderToken) {
          tbody.innerHTML = html;
        }
        return;
      }

      tbody.innerHTML = '';
      let index = 0;

      const renderChunk = () => {
        if (state.renderToken !== renderToken) {
          return;
        }

        const end = Math.min(index + MODAL_RENDER_CHUNK_SIZE, rows.length);
        let html = '';
        for (let cursor = index; cursor < end; cursor++) {
          html += buildRowHtml(rows[cursor], cursor);
        }

        if (index === 0) {
          tbody.innerHTML = html;
        } else {
          tbody.insertAdjacentHTML('beforeend', html);
        }

        index = end;
        if (index < rows.length) {
          setTimeout(renderChunk, 0);
        }
      };

      renderChunk();
    };

    const render = () => {
      state.renderToken += 1;
      const renderToken = state.renderToken;
      const typeFiltered = filterRowsByType(state.rows, state.typeFilters);
      const filtered = filterRows(typeFiltered, state.search);
      const sorted = sortRows(filtered, state.sortKey, state.sortDir);
      state.visibleRows = sorted;

      summary.textContent = `${sorted.length} položek`;
      renderRowsFast(sorted, renderToken);

      for (const button of sortButtons) {
        const key = button.dataset.sortKey;
        const active = key === state.sortKey;
        button.classList.toggle('is-active', active);
        const indicator = button.querySelector('.cc-sort-indicator');
        if (indicator) {
          indicator.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';
        }
      }
    };

    overlay.openWithData = ({ rows, modalTitle }) => {
      state.rows = rows;
      state.search = '';
      state.typeFilters = new Set(['all']);
      state.sortKey = 'name';
      state.sortDir = 'asc';
      title.textContent = modalTitle;
      searchInput.value = '';
      typeMulti.dataset.open = 'false';
      typeMenu.hidden = true;
      typeToggle.setAttribute('aria-expanded', 'false');
      syncTypeCheckboxes();
      render();
      overlay.classList.add('is-open');
      document.body.classList.add('cc-ratings-modal-open');
      searchInput.focus();
    };

    overlay.closeModal = () => {
      overlay.classList.remove('is-open');
      detailsController.close();
      document.body.classList.remove('cc-ratings-modal-open');
    };

    closeBtn.addEventListener('click', () => overlay.closeModal());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.closeModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (detailsController.isOpen()) {
        detailsController.close();
        return;
      }

      if (overlay.classList.contains('is-open')) {
        overlay.closeModal();
      }
    });

    tbody.addEventListener('click', (event) => {
      const detailsButton = event.target.closest('.cc-ratings-table-details-btn');
      if (!detailsButton) {
        return;
      }

      const rowIndex = Number.parseInt(detailsButton.getAttribute('data-row-index') || '-1', 10);
      if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= state.visibleRows.length) {
        return;
      }

      detailsController.open(state.visibleRows[rowIndex]);
    });

    searchInput.addEventListener('input', () => {
      state.search = searchInput.value;
      render();
    });

    typeToggle.addEventListener('click', () => {
      const isOpen = typeMulti.dataset.open === 'true';
      const nextOpen = !isOpen;
      typeMulti.dataset.open = nextOpen ? 'true' : 'false';
      typeMenu.hidden = !nextOpen;
      typeToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    });

    typeMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    for (const input of typeCheckboxes) {
      input.addEventListener('change', () => {
        const value = input.value;

        if (value === 'all' && input.checked) {
          state.typeFilters = new Set(['all']);
        } else if (value !== 'all') {
          state.typeFilters.delete('all');

          if (input.checked) {
            state.typeFilters.add(value);
          } else {
            state.typeFilters.delete(value);
          }

          if (state.typeFilters.size === 0) {
            state.typeFilters = new Set(['all']);
          }
        } else if (value === 'all' && !input.checked && state.typeFilters.size === 1 && state.typeFilters.has('all')) {
          state.typeFilters = new Set(['all']);
        }

        syncTypeCheckboxes();
        render();
      });
    }

    document.addEventListener('click', (event) => {
      if (!overlay.classList.contains('is-open')) {
        return;
      }
      if (!typeMulti.contains(event.target)) {
        typeMulti.dataset.open = 'false';
        typeMenu.hidden = true;
        typeToggle.setAttribute('aria-expanded', 'false');
      }
    });

    for (const button of sortButtons) {
      button.addEventListener('click', () => {
        const key = button.dataset.sortKey;
        if (!key) {
          return;
        }

        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        render();
      });
    }

    syncTypeCheckboxes();

    document.body.appendChild(overlay);
    document.body.appendChild(detailsController.overlay);
    return overlay;
  }

  function openRatingsTableView({ rows, modalTitle }) {
    const modal = getRatingsTableModal();
    modal.openWithData({ rows, modalTitle });
  }

  const MODAL_TITLE_BY_SCOPE = {
    direct: 'Načtená hodnocení',
    computed: 'Spočtená hodnocení',
  };

  const ratingsModalCache = {
    userSlug: '',
    userRecords: null,
    rowsByScope: {
      direct: null,
      computed: null,
    },
  };

  async function getCachedUserRecords(userSlug) {
    if (
      ratingsModalCache.userSlug === userSlug &&
      Array.isArray(ratingsModalCache.userRecords) &&
      ratingsModalCache.userRecords.length >= 0
    ) {
      return ratingsModalCache.userRecords;
    }

    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));

    ratingsModalCache.userSlug = userSlug;
    ratingsModalCache.userRecords = userRecords;
    ratingsModalCache.rowsByScope.direct = null;
    ratingsModalCache.rowsByScope.computed = null;

    return userRecords;
  }

  async function getCachedRowsForScope(userSlug, scope) {
    if (ratingsModalCache.userSlug === userSlug && Array.isArray(ratingsModalCache.rowsByScope[scope])) {
      return ratingsModalCache.rowsByScope[scope];
    }

    const userRecords = await getCachedUserRecords(userSlug);
    const scopedRecords =
      scope === 'computed'
        ? userRecords.filter((record) => record.computed === true)
        : userRecords.filter((record) => record.computed !== true);

    const rows = toModalRows(scopedRecords);
    ratingsModalCache.rowsByScope[scope] = rows;
    return rows;
  }

  function invalidateRatingsModalCache() {
    ratingsModalCache.userSlug = '';
    ratingsModalCache.userRecords = null;
    ratingsModalCache.rowsByScope = {
      direct: null,
      computed: null,
    };
  }

  function getModalTitleForScope(scope) {
    return MODAL_TITLE_BY_SCOPE[scope] || MODAL_TITLE_BY_SCOPE.direct;
  }

  async function openRatingsTableModal(rootElement, scope, callbacks) {
    const getCurrentUserSlug = callbacks?.getCurrentUserSlug;
    const getMostFrequentUserSlug = callbacks?.getMostFrequentUserSlug;

    let userSlug = getCurrentUserSlug?.();
    if (!userSlug) {
      const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
      userSlug = getMostFrequentUserSlug?.(records);
    }
    if (!userSlug) {
      return;
    }

    const rows = await getCachedRowsForScope(userSlug, scope);
    openRatingsTableView({
      rows,
      modalTitle: getModalTitleForScope(scope),
    });

    const redBadge = rootElement.querySelector('#cc-badge-red');
    const blackBadge = rootElement.querySelector('#cc-badge-black');
    redBadge?.blur();
    blackBadge?.blur();
  }

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

  const HEADER_HOVER_STORAGE_KEY = 'headerBarHovered';
  const HOVER_TOGGLE_DELAY_MS = 200;

  function bindHoverHandlers($menuButton, timeoutState) {
    $menuButton.add($menuButton.find('.dropdown-content')).hover(
      function () {
        clearTimeout(timeoutState.hideTimeout);
        timeoutState.hoverTimeout = setTimeout(() => {
          $('.header-bar li').addClass('hovered');
          $menuButton.addClass('active');
        }, HOVER_TOGGLE_DELAY_MS);
      },
      function () {
        clearTimeout(timeoutState.hoverTimeout);
        timeoutState.hideTimeout = setTimeout(() => {
          $('.header-bar li').removeClass('hovered');
          $menuButton.removeClass('active');
        }, HOVER_TOGGLE_DELAY_MS);
      },
    );
  }

  function initializeSettingsMenuHover($menuButton) {
    let hoverTimeout;
    let hideTimeout;

    console.log('🟣 DEBUG:', DEBUG);
    {
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

      controlsContainer.innerHTML = '';

      const checkboxLabel = document.createElement('label');
      checkboxLabel.style.display = 'inline-flex';
      checkboxLabel.style.alignItems = 'center';
      checkboxLabel.style.marginRight = '10px';
      checkboxLabel.style.cursor = 'pointer';
      checkboxLabel.textContent = 'Hovered';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.marginRight = '5px';
      checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';
      checkboxLabel.prepend(checkbox);
      controlsContainer.appendChild(checkboxLabel);

      let alertButton = document.querySelector('.fancy-alert-button');
      if (!alertButton) {
        alertButton = document.createElement('button');
        alertButton.textContent = 'Show Fancy Alert';
        alertButton.className = 'fancy-alert-button';
      } else if (alertButton.parentNode && alertButton.parentNode !== controlsContainer) {
        alertButton.parentNode.removeChild(alertButton);
      }
      bindFancyAlertButton(alertButton);
      controlsContainer.appendChild(alertButton);

      function enableDebugHover() {
        $('.header-bar li').addClass('hovered');
        $menuButton.addClass('active');
        $menuButton
          .find('.csfd-compare-menu')
          .off('click.debug')
          .on('click.debug', function (e) {
            e.stopPropagation();
            if ($menuButton.hasClass('active')) {
              $menuButton.removeClass('active');
              $('.header-bar li').removeClass('hovered');
            } else {
              $menuButton.addClass('active');
              $('.header-bar li').addClass('hovered');
            }
          });
        $menuButton.add($menuButton.find('.dropdown-content')).off('mouseenter mouseleave');
      }

      function enableNormalHover() {
        $('.header-bar li').removeClass('hovered');
        $menuButton.removeClass('active');
        $menuButton.find('.csfd-compare-menu').off('click.debug');
        $menuButton.add($menuButton.find('.dropdown-content')).off('mouseenter mouseleave');
        bindHoverHandlers($menuButton, {
          get hoverTimeout() {
            return hoverTimeout;
          },
          set hoverTimeout(value) {
            hoverTimeout = value;
          },
          get hideTimeout() {
            return hideTimeout;
          },
          set hideTimeout(value) {
            hideTimeout = value;
          },
        });
      }

      if (checkbox.checked) {
        enableDebugHover();
      } else {
        enableNormalHover();
      }

      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'true');
          enableDebugHover();
        } else {
          localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'false');
          enableNormalHover();
        }
      });
    }
  }

  // addSettingsButton function that will create element 'li' as a 'let button'


  let infoToastTimeoutId;

  function isGalleryImageLinksEnabled() {
    const persistedValue = localStorage.getItem(GALLERY_IMAGE_LINKS_ENABLED_KEY);
    return persistedValue === null ? true : persistedValue === 'true';
  }

  function showSettingsInfoToast(message) {
    let toastEl = document.querySelector('#cc-settings-info-toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'cc-settings-info-toast';
      toastEl.style.position = 'fixed';
      toastEl.style.left = '50%';
      toastEl.style.top = '70px';
      toastEl.style.transform = 'translateX(-50%)';
      toastEl.style.zIndex = '10020';
      toastEl.style.padding = '8px 12px';
      toastEl.style.borderRadius = '8px';
      toastEl.style.background = 'rgba(40, 40, 40, 0.94)';
      toastEl.style.color = '#fff';
      toastEl.style.fontSize = '12px';
      toastEl.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.28)';
      toastEl.style.display = 'none';
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    toastEl.style.display = 'block';

    if (infoToastTimeoutId) {
      clearTimeout(infoToastTimeoutId);
    }
    infoToastTimeoutId = window.setTimeout(() => {
      toastEl.style.display = 'none';
    }, 1800);
  }

  function getCurrentUserSlug() {
    const profileEl = document.querySelector('a.profile.initialized');
    const profileHref = profileEl?.getAttribute('href') || '';
    const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
  }

  function isUserLoggedIn() {
    return Boolean(document.querySelector('a.profile.initialized'));
  }

  function getMostFrequentUserSlug(records) {
    const counts = new Map();

    for (const record of records) {
      const userSlug = record?.userSlug;
      if (!userSlug || !Number.isFinite(record?.movieId)) {
        continue;
      }

      counts.set(userSlug, (counts.get(userSlug) || 0) + 1);
    }

    let bestSlug;
    let bestCount = -1;
    for (const [slug, count] of counts.entries()) {
      if (count > bestCount) {
        bestSlug = slug;
        bestCount = count;
      }
    }

    return bestSlug;
  }

  async function addSettingsButton() {
    const settingsButton = document.createElement('li');
    settingsButton.classList.add('cc-menu-item');
    settingsButton.innerHTML = htmlContent;
    initializeVersionUi(settingsButton).catch(() => undefined);
    initializeRatingsLoader(settingsButton);
    initializeRatingsSync(settingsButton);

    const galleryImageLinksToggle = settingsButton.querySelector('#cc-enable-gallery-image-links');
    if (galleryImageLinksToggle) {
      galleryImageLinksToggle.checked = isGalleryImageLinksEnabled();
      galleryImageLinksToggle.addEventListener('change', () => {
        const enabled = galleryImageLinksToggle.checked;
        localStorage.setItem(GALLERY_IMAGE_LINKS_ENABLED_KEY, String(enabled));
        window.dispatchEvent(
          new CustomEvent('cc-gallery-image-links-toggled', {
            detail: { enabled },
          }),
        );

        showSettingsInfoToast(enabled ? 'Formáty obrázků v galerii zapnuty.' : 'Formáty obrázků v galerii vypnuty.');
      });
    }

    const syncButton = settingsButton.querySelector('#cc-sync-cloud-btn');
    if (syncButton) {
      syncButton.addEventListener(
        'click',
        (event) => {
          if (isUserLoggedIn()) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          showSettingsInfoToast('Cloud sync je dostupný až po přihlášení.');
        },
        true,
      );
    }

    const versionInfoButton = settingsButton.querySelector('#cc-version-info-btn');
    if (versionInfoButton) {
      versionInfoButton.addEventListener('click', (event) => {
        event.preventDefault();
        openVersionInfoModal(settingsButton).catch((error) => {
          console.error('[CC] Failed to open version info modal:', error);
        });
      });
    }

    const redBadge = settingsButton.querySelector('#cc-badge-red');
    const blackBadge = settingsButton.querySelector('#cc-badge-black');
    const ratingsModalOptions = {
      getCurrentUserSlug,
      getMostFrequentUserSlug,
    };

    if (redBadge) {
      redBadge.setAttribute('role', 'button');
      redBadge.setAttribute('tabindex', '0');
      redBadge.title = 'Zobrazit načtená hodnocení';
      redBadge.addEventListener('click', () => {
        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, 'direct', ratingsModalOptions).catch((error) => {
          console.error('[CC] Failed to open direct ratings table:', error);
        });
      });
      redBadge.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!isUserLoggedIn()) {
            showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
            return;
          }
          openRatingsTableModal(settingsButton, 'direct', ratingsModalOptions).catch((error) => {
            console.error('[CC] Failed to open direct ratings table:', error);
          });
        }
      });
    }

    if (blackBadge) {
      blackBadge.setAttribute('role', 'button');
      blackBadge.setAttribute('tabindex', '0');
      blackBadge.title = 'Zobrazit spočtená hodnocení';
      blackBadge.addEventListener('click', () => {
        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, 'computed', ratingsModalOptions).catch((error) => {
          console.error('[CC] Failed to open computed ratings table:', error);
        });
      });
      blackBadge.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!isUserLoggedIn()) {
            showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
            return;
          }
          openRatingsTableModal(settingsButton, 'computed', ratingsModalOptions).catch((error) => {
            console.error('[CC] Failed to open computed ratings table:', error);
          });
        }
      });
    }

    const badgeRefreshOptions = {
      isUserLoggedIn,
      getCurrentUserSlug,
      getMostFrequentUserSlug,
    };

    refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((error) => {
      console.error('[CC] Failed to refresh badges:', error);
    });

    const handleRatingsUpdated = () => {
      invalidateRatingsModalCache();
      refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((error) => {
        console.error('[CC] Failed to refresh badges:', error);
      });
    };
    window.addEventListener('cc-ratings-updated', handleRatingsUpdated);

    const $button = $(settingsButton);
    const $headerBar = $('.header-bar').first();
    const $searchItem = $headerBar.children('li.item-search').first();
    const $languageItem = $headerBar.children('li.user-language-switch').first();

    if ($searchItem.length) {
      $searchItem.after($button);
    } else if ($languageItem.length) {
      $languageItem.before($button);
    } else {
      $headerBar.prepend($button);
    }

    initializeSettingsMenuHover($button);
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
    await csfd.addGalleryImageFormatLinks();

    window.addEventListener('cc-gallery-image-links-toggled', () => {
      csfd.addGalleryImageFormatLinks().catch((error) => {
        console.error('[CC] Failed to toggle gallery image format links:', error);
      });
    });

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
