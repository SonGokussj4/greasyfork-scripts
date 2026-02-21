// ==UserScript==
// @name         ČSFD Compare V2
// @version      0.8.6
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @include      *csfd.cz/*
// @include      *csfd.sk/*
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
  const CREATOR_PREVIEW_ENABLED_KEY = 'cc_creator_preview_enabled';
  const CREATOR_PREVIEW_SHOW_BIRTH_KEY = 'cc_creator_preview_show_birth';
  const CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY = 'cc_creator_preview_show_photo_from';
  const CREATOR_PREVIEW_SECTION_COLLAPSED_KEY = 'cc_creator_preview_section_collapsed';
  const SHOW_ALL_CREATOR_TABS_KEY = 'cc_show_all_creator_tabs';

  // feature flags copied from legacy script
  const CLICKABLE_HEADER_BOXES_KEY = 'cc_clickable_header_boxes';
  const RATINGS_ESTIMATE_KEY = 'cc_ratings_estimate';
  const RATINGS_FROM_FAVORITES_KEY = 'cc_ratings_from_favorites';
  const ADD_RATINGS_DATE_KEY = 'cc_add_ratings_date';
  const HIDE_SELECTED_REVIEWS_KEY = 'cc_hide_selected_user_reviews';
  const HIDE_SELECTED_REVIEWS_LIST_KEY = 'cc_hide_selected_user_reviews_list';
  const HIDE_REVIEWS_SECTION_COLLAPSED_KEY = 'cc_hide_reviews_section_collapsed';

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

  async function deleteIndexedDB(dbName) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function delay(t) {
    return new Promise((resolve) => setTimeout(resolve, t));
  }

  const PROFILE_LINK_SELECTOR$3 =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

  // Consolidated blocked selectors for the film link candidate search
  const BLOCKED_LINK_CLOSEST_SELECTORS = [
    '.film-posters',
    '.box-video',
    '.gallery',
    '.aside-movie-profile',
    '.box-more-bar',
    '.pagination',
    '.paginator',
    '.box-pagination',
    '.page-navigation',
    '.pages',
    '.article-header-review-action',
    '.article-header-review',
    '.film-header-name',
    '.film-header-name-control',
    '#cc-ratings-table-modal-overlay',
    '.cc-ratings-table-overlay',
    '.cc-ratings-table-modal',
    '.cc-rating-detail-overlay',
    '.span-more-small',
    '.more',
    '.article-more',
  ].join(', ');

  class Csfd {
    constructor(pageContent) {
      this.csfdPage = pageContent;
      this.stars = {};
      this.storageKey = undefined;
      this.userUrl = undefined;
      this.username = undefined;
      this.userRatingsUrl = undefined;
      this.isLoggedIn = false;
      this.userSlug = undefined;
    }

    /**
     * @returns {string|undefined} - Returns the user URL or undefined if not found
     * @description - Retrieves the current user's URL from the CSFD page and sets isLoggedIn.
     */
    getCurrentUser() {
      const userEl = document.querySelector(PROFILE_LINK_SELECTOR$3);
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
     * @description - Retrieves the current user's username from the CSFD page.
     */
    getUsername() {
      const userHref = this.userUrl || this.getCurrentUser();
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
      console.debug('🟣 Login state:', this.isLoggedIn);
      return this.isLoggedIn;
    }

    async initialize() {
      this.userUrl = this.getCurrentUser();
      console.debug('🟣 User URL:', this.userUrl);

      this.username = this.getUsername();
      console.debug('🟣 Username:', this.username);

      this.storageKey = `CSFD-Compare_${this.username || 'guest'}`;
      console.debug('🟣 Storage Key:', this.storageKey);

      this.userSlug = this.userUrl?.match(/^\/uzivatel\/(\d+-[^/]+)\//)?.[1];
      console.debug('🟣 User Slug:', this.userSlug);

      this.userRatingsUrl = this.userUrl
        ? this.userUrl + (location.origin.endsWith('sk') ? 'hodnotenia' : 'hodnoceni')
        : undefined;
      console.debug('🟣 User Ratings URL:', this.userRatingsUrl);

      const settings = await getSettings(SETTINGSNAME);
      this.stars = settings?.stars || {};

      await this.loadStarsFromIndexedDb();
      await this.syncCurrentPageRatingWithIndexedDb();

      try {
        if (localStorage.getItem('cc_show_all_creator_tabs') === 'true') {
          this.showAllCreatorTabs();
        }
        if (localStorage.getItem('cc_clickable_header_boxes') === 'true') {
          this.clickableHeaderBoxes();
        }
        if (localStorage.getItem('cc_ratings_estimate') === 'true') {
          this.ratingsEstimate();
        }
        if (localStorage.getItem('cc_ratings_from_favorites') === 'true') {
          this.ratingsFromFavorites();
        }
        if (localStorage.getItem('cc_add_ratings_date') === 'true') {
          this.addRatingsDate();
        }
        if (localStorage.getItem('cc_hide_selected_user_reviews') === 'true') {
          this.hideSelectedUserReviews();
        }
      } catch (e) {
        // ignore silently
      }
    }

    showAllCreatorTabs() {
      try {
        const selectors = ['.creator-about nav.tab-nav', '.creator-profile nav.tab-nav', '.creator nav.tab-nav'].join(
          ',',
        );
        const navs = document.querySelectorAll(selectors);
        if (!navs.length) return;

        navs.forEach((nav) => {
          // make sure any inline padding reserved for the dropdown is removed
          nav.style.paddingRight = '';
          const mainList = nav.querySelector('.tab-nav-list');
          const dropdown = nav.querySelector('.tab-nav-more .dropdown-content, .tab-nav-more > .dropdown-content');
          if (!mainList || !dropdown) return;

          mainList.querySelectorAll('[data-cc-clone="1"]').forEach((n) => n.remove());

          const dropdownItems = Array.from(dropdown.querySelectorAll('.tab-nav-item'));
          const existingHrefs = new Set(
            Array.from(mainList.querySelectorAll('a.tab-link')).map((a) => a.getAttribute('href') || ''),
          );

          for (const item of dropdownItems) {
            const href = item.querySelector('a.tab-link')?.getAttribute('href') || '';
            if (!existingHrefs.has(href)) {
              const clone = item.cloneNode(true);
              clone.dataset.ccClone = '1';
              clone.classList.remove('hidden');
              clone.style.display = '';
              mainList.appendChild(clone);
            }
          }

          const more = nav.querySelector('.tab-nav-more');
          if (more) more.style.display = 'none';

          nav.classList.add('cc-show-all-tabs');

          // Removed dead code here that just iterated and trimmed text strings
        });
      } catch (err) {
        console.error('[CC] showAllCreatorTabs failed', err);
      }
    }

    restoreCreatorTabs() {
      try {
        const selectors = ['.creator-about nav.tab-nav', '.creator-profile nav.tab-nav', '.creator nav.tab-nav'].join(
          ',',
        );
        const navs = document.querySelectorAll(selectors);
        if (!navs.length) return;

        navs.forEach((nav) => {
          nav.querySelectorAll('[data-cc-clone="1"]').forEach((n) => n.remove());
          const more = nav.querySelector('.tab-nav-more');
          if (more) more.style.display = '';
          nav.classList.remove('cc-show-all-tabs');
          // clear inline padding that CSFD may have set, forcing a layout recalculation
          nav.style.paddingRight = '';
        });

        // fire a resize so the site script recalculates widths immediately
        window.dispatchEvent(new Event('resize'));
      } catch (err) {
        console.error('[CC] restoreCreatorTabs failed', err);
      }
    }

    getCurrentItemUrlAndIds() {
      const path = location.pathname || '';
      if (!path.includes('/film/')) {
        return { movieId: NaN, urlSlug: '', parentId: NaN, parentName: '', fullUrl: '' };
      }

      const slugMatches = Array.from(path.matchAll(/\/(\d+-[^/]+)/g)).map((m) => m[1]);
      const idMatches = slugMatches
        .map((slug) => Number.parseInt((slug.match(/^(\d+)-/) || [])[1], 10))
        .filter((id) => Number.isFinite(id));

      const movieId = idMatches.length ? idMatches[idMatches.length - 1] : NaN;
      const parentId = idMatches.length > 1 ? idMatches[0] : NaN;
      const parentName = slugMatches.length > 1 ? slugMatches[0] : '';
      const urlSlug = slugMatches.length ? slugMatches[slugMatches.length - 1] : '';

      const cleanPath = path.replace(/\/(recenze|komentare|prehled|prehlad)\/?$/i, '/');

      return { movieId, urlSlug, parentId, parentName, fullUrl: `${location.origin}${cleanPath}` };
    }

    getCurrentPageOwnRating() {
      const activeStars = Array.from(document.querySelectorAll('.my-rating .stars-rating a.star.active[data-rating]'));
      if (!activeStars.length) return null;

      const rawRatings = activeStars
        .map((star) => Number.parseInt(star.getAttribute('data-rating') || '', 10))
        .filter((val) => Number.isFinite(val));

      if (!rawRatings.length) return null;
      if (rawRatings.includes(0)) return 0;

      const maxRatingPercent = Math.max(...rawRatings);
      return Math.max(0, Math.min(5, Math.round(maxRatingPercent / 20)));
    }

    getCurrentPageRatingDate() {
      const title = document.querySelector('.my-rating .stars-rating')?.getAttribute('title') || '';
      return (title.match(/(\d{1,2}\.\d{1,2}\.\d{4})/) || [])[1] || '';
    }

    getCurrentPageName() {
      return document.querySelector('.film-header h1')?.textContent?.replace(/\s+/g, ' ').trim() || '';
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
      const isStarComputed = document.querySelectorAll('.my-rating .stars-rating a.star.computed').length > 0;

      // Consolidated selectors
      const titleSelectors = [
        '.others-rating .current-user-rating [title*="spočten" i]',
        '.mobile-film-rating-detail [title*="spočten" i]',
        '.my-rating .stars-rating[title*="spočten" i]',
        '.others-rating .current-user-rating [title*="spocten" i]',
        '.mobile-film-rating-detail [title*="spocten" i]',
        '.my-rating .stars-rating[title*="spocten" i]',
      ].join(', ');

      const computedTitle = document.querySelector(titleSelectors)?.getAttribute('title') || '';
      const computedCountMatch = computedTitle.match(/(\d+)/);

      return {
        isComputed: isStarComputed || computedTitle.length > 0,
        computedFromText: computedTitle,
        computedCount: computedCountMatch ? Number.parseInt(computedCountMatch[1], 10) : NaN,
      };
    }

    // helper used by several legacy features
    _parseRatingFromStars(starElem) {
      const clazz = starElem.className || '';
      const m = clazz.match(/stars-(\d)/);
      if (m) return parseInt(m[1], 10);
      if (clazz.includes('trash')) return 0;
      return NaN;
    }

    _getRatingColor(percent) {
      if (percent >= 70) return 'red';
      if (percent >= 30) return 'blue';
      return 'black';
    }

    // legacy features ported from old script
    clickableHeaderBoxes() {
      // make a few specific header buttons clickable by clicking anywhere on the box
      const selectors = ['.user-link.wantsee', '.user-link.favorites', '.user-link.messages'];
      selectors.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.addEventListener('click', () => {
            const hrefMap = {
              '.user-link.wantsee': '/chci-videt/',
              '.user-link.favorites': '/soukrome/oblibene/',
              '.user-link.messages': '/posta/',
            };
            location.href = hrefMap[sel] || hrefMap['.user-link.wantsee'];
          });
        }
      });

      // entire box headers
      const headers = Array.from(document.querySelectorAll('.dropdown-content-head, .box-header'));
      headers.forEach((div) => {
        const btn = div.querySelector('a.button');
        if (!btn) return;
        const text = btn.textContent.trim().toLowerCase();
        if (!['více', 'viac'].includes(text)) return;
        const href = btn.getAttribute('href');
        if (!href) return;
        const wrapper = document.createElement('a');
        wrapper.setAttribute('href', href);
        div.parentNode.replaceChild(wrapper, div);
        wrapper.appendChild(div);
        // hover styling borrowed from old code
        const h2 = div.querySelector('h2');
        const spanCount = h2?.querySelector('span.count');
        div.addEventListener('mouseenter', () => {
          div.style.backgroundColor = '#ba0305';
          if (h2) {
            h2.style.backgroundColor = '#ba0305';
            h2.style.color = '#fff';
          }
          if (spanCount) spanCount.style.color = '#fff';
        });
        div.addEventListener('mouseleave', () => {
          if (div.classList.contains('dropdown-content-head')) {
            div.style.backgroundColor = '#ececec';
          } else {
            div.style.backgroundColor = '#e3e3e3';
          }
          if (h2) {
            h2.style.backgroundColor = 'initial';
            h2.style.color = 'initial';
          }
          if (spanCount) spanCount.style.color = 'initial';
        });
      });
    }

    ratingsEstimate() {
      const avgEl = document.querySelector('.box-rating-container .film-rating-average');
      if (!avgEl) return;
      const text = avgEl.textContent.replace(/\s/g, '');
      if (!text.includes('?%')) return;
      const userRatings = Array.from(document.querySelectorAll('section.others-rating .star-rating'));
      if (!userRatings.length) return;
      const numbers = userRatings
        .map((ur) => this._parseRatingFromStars(ur.querySelector('.stars')))
        .map((n) => (Number.isFinite(n) ? n * 20 : NaN))
        .filter(Number.isFinite);
      if (!numbers.length) return;
      const average = Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
      avgEl.textContent = `${average} %`;
      avgEl.style.color = '#fff';
      avgEl.style.backgroundColor = this._getRatingColor(average);
      avgEl.setAttribute('title', `spočteno z hodnocení: ${numbers.length}`);
    }

    ratingsFromFavorites() {
      const spans = Array.from(document.querySelectorAll('li.favored:not(.current-user-rating) .star-rating .stars'));
      if (!spans.length) return;

      const numbers = spans
        .map((sp) => this._parseRatingFromStars(sp))
        .map((n) => (Number.isFinite(n) ? n * 20 : NaN))
        .filter(Number.isFinite);
      if (!numbers.length) return;

      const ratingAverage = Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
      const avgEl = document.querySelector('.box-rating-container div.film-rating-average');
      if (!avgEl) return;

      // remember the unmodified text so we can restore later
      if (!avgEl.dataset.original) {
        avgEl.dataset.original = avgEl.textContent.trim();
      }
      const baseText = avgEl.dataset.original;

      avgEl.innerHTML = `
                <span style="position: absolute;">${baseText}</span>
                <span style="position: relative; top: 25px; font-size: 0.3em; font-weight: 600;">oblíbení: ${ratingAverage} %</span>
            `;
    }

    clearRatingsFromFavorites() {
      const avgEl = document.querySelector('.box-rating-container div.film-rating-average');
      if (!avgEl) return;
      if (avgEl.dataset.original) {
        avgEl.textContent = avgEl.dataset.original;
        delete avgEl.dataset.original;
      } else {
        // fallback: just remove the appended span if it exists
        const absSpan = avgEl.querySelector('span[style*="position:absolute"]');
        if (absSpan) {
          avgEl.textContent = absSpan.textContent.trim();
        }
      }
    }

    clearRatingsDate() {
      const caption = document.querySelector('.my-rating h3');
      if (!caption) return;
      if (caption.dataset.original) {
        caption.textContent = caption.dataset.original;
        delete caption.dataset.original;
      }
    }

    addRatingsDate() {
      const caption = document.querySelector('.my-rating h3');
      if (!caption) return;

      if (!caption.dataset.original) {
        caption.dataset.original = caption.textContent.trim();
      }

      let ratingText = document.querySelector('span.stars-rating.initialized')?.getAttribute('title') || '';
      if (!ratingText) {
        ratingText = document.querySelector('.mobile-film-rating-detail a span')?.getAttribute('title') || '';
      }
      const match = ratingText.match(/(\d{2}\.\d{2}\.\d{4})/);
      if (match) {
        const ratingDate = match[1];
        caption.innerHTML = `${caption.dataset.original}<br>${ratingDate}`;
      }
    }

    hideSelectedUserReviews() {
      let raw = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY) || '[]';
      let list;
      try {
        list = JSON.parse(raw);
      } catch (e) {
        list = [];
      }
      if (!Array.isArray(list) || list.length === 0) return;
      const headers = Array.from(document.querySelectorAll('.article-header-review-name'));
      headers.forEach((el) => {
        const title = el.querySelector('.user-title-name');
        if (!title) return;
        const name = title.textContent.trim();
        if (list.includes(name)) {
          const article = el.closest('article');
          if (article) article.style.display = 'none';
        }
      });
    }

    createCurrentPageRecord({ movieId, urlSlug, parentId, parentName, fullUrl, rating, existingRecord }) {
      const computedInfo = this.getCurrentPageComputedInfo();
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
        lastUpdate: new Date().toISOString(),
      };
    }

    async syncCurrentPageRatingWithIndexedDb() {
      if (!this.userSlug || !this.getIsLoggedIn()) return;

      const pageInfo = this.getCurrentItemUrlAndIds();
      if (!Number.isFinite(pageInfo.movieId) || !pageInfo.urlSlug) return;

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
        typeof existingRecord === 'number' ? existingRecord : (existingRecord?.rating ?? NaN);

      const currentComputedInfo = this.getCurrentPageComputedInfo();
      const existingComputed = typeof existingRecord === 'object' && existingRecord?.computed === true;
      const existingComputedCount = existingRecord?.computedCount ?? null;
      const currentComputedCount = Number.isFinite(currentComputedInfo.computedCount)
        ? currentComputedInfo.computedCount
        : null;

      const computedUnchanged =
        existingComputed === currentComputedInfo.isComputed &&
        existingComputedCount === currentComputedCount &&
        (existingRecord?.computedFromText || '') === currentComputedInfo.computedFromText;

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
      if (!this.userSlug) return;

      try {
        const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
        const userRecords = records.filter((r) => r.userSlug === this.userSlug && Number.isFinite(r.movieId));

        for (const record of userRecords) {
          this.stars[record.movieId] = record;
        }
      } catch (error) {
        console.error('[CC] Failed to load stars from IndexedDB:', error);
      }
    }

    getCandidateFilmLinks() {
      const searchRoot = this.csfdPage || document;
      return Array.from(searchRoot.querySelectorAll('a[href*="/film/"]')).filter((link) => {
        const href = link.getAttribute('href') || '';

        if (
          !/\/\d+-/.test(href) ||
          /[?&](page|comment)=\d+/i.test(href) ||
          /\/(galerie|videa?|tvurci|obsahy?)\//.test(href)
        ) {
          return false;
        }

        if (this.isOnCreatorPage() && link.closest('.creator-filmography')) return false;
        if (link.matches('.edit-review, [class*="edit-review"]') || link.querySelector('.icon-edit-square, img'))
          return false;

        if (link.closest('section.box-related, div.box-related, .box-related')) {
          return link.matches('a.film-title-name[href*="/film/"]');
        }

        if (link.closest(BLOCKED_LINK_CLOSEST_SELECTORS) || this.shouldSkipProfileSectionLink(link)) {
          return false;
        }

        const linkText = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
        if (linkText === 'více' || linkText === 'viac') return false;

        if (this.isOnUserReviewsPage() && !link.matches('a.film-title-name')) return false;

        return true;
      });
    }

    isOnOwnRatingsPage() {
      if (!this.userSlug) return false;
      const path = location.pathname || '';
      return (
        path.startsWith(`/uzivatel/${this.userSlug}/`) && (path.includes('/hodnoceni/') || path.includes('/hodnotenia/'))
      );
    }

    isOnCreatorPage() {
      return /^\/(tvurce|tvorca)\/\d+-[^/]+\//i.test(location.pathname || '');
    }

    isOnUserProfilePage() {
      return (location.pathname || '').match(/^\/uzivatel\/(\d+-[^/]+)\//i)?.[1];
    }

    isOnOtherUserProfilePage() {
      const pageUserSlug = this.isOnUserProfilePage();
      return Boolean(pageUserSlug && this.userSlug && pageUserSlug !== this.userSlug);
    }

    isOnUserOverviewPage() {
      return /^\/uzivatel\/\d+-[^/]+\/(prehled|prehlad)(\/|$)/i.test(location.pathname || '');
    }

    isOnUserReviewsPage() {
      return /^\/uzivatel\/\d+-[^/]+\/(recenze|recenzie)(\/|$)/i.test(location.pathname || '');
    }

    shouldSkipProfileSectionLink(link) {
      if (!this.isOnUserOverviewPage()) return false;

      const explicitReviewOrRatingContainer = link.closest(
        '[id*="review" i], [id*="recenz" i], [id*="rating" i], [id*="hodnoc" i], [id*="hodnoten" i], [class*="review" i], [class*="recenz" i], [class*="rating" i], [class*="hodnoc" i], [class*="hodnoten" i]',
      );
      const explicitDiaryContainer = link.closest(
        '[id*="diar" i], [id*="denik" i], [id*="denic" i], [class*="diar" i], [class*="denik" i], [class*="denic" i]',
      );

      if (explicitReviewOrRatingContainer && !explicitDiaryContainer) return true;

      const searchRoot = this.csfdPage || document.body;
      let sectionNode = link;

      while (sectionNode && sectionNode !== searchRoot && sectionNode !== document.body) {
        if (!(sectionNode instanceof HTMLElement)) {
          sectionNode = sectionNode.parentElement;
          continue;
        }

        const titleEl = sectionNode.querySelector(
          ':scope > .box-header h2, :scope > .box-header h3, :scope > header h2, :scope > header h3, :scope > h2, :scope > h3',
        );
        const sectionTitle = titleEl?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

        if (sectionTitle) {
          if (sectionTitle.match(/poslední recenze|posledne recenzie|poslední hodnocení|posledné hodnotenia/))
            return true;
          if (sectionTitle.match(/poslední deníček|posledny dennik/)) return false;
        }
        sectionNode = sectionNode.parentElement;
      }
      return false;
    }

    getRatingsPageSlug() {
      return (location.pathname || '').match(/^\/uzivatel\/(\d+-[^/]+)\/(hodnoceni|hodnotenia)\/?/i)?.[1];
    }

    isOnForeignRatingsPage() {
      const ratingsPageSlug = this.getRatingsPageSlug();
      return Boolean(ratingsPageSlug && this.userSlug && ratingsPageSlug !== this.userSlug);
    }

    async addComparisonColumnOnForeignRatingsPage() {
      const getRatingsTables = () =>
        Array.from(
          document.querySelectorAll('#snippet--ratings table, #snippet-ratings table, .snippet-ratings table, table'),
        ).filter(
          (table) => table.querySelector('td.star-rating-only') && table.querySelector('td.name a[href*="/film/"]'),
        );

      let ratingsTables = getRatingsTables();
      if (!ratingsTables.length) {
        await delay(350);
        ratingsTables = getRatingsTables();
        if (!ratingsTables.length) return;
      }

      for (const table of ratingsTables) {
        table.classList.add('cc-compare-ratings-table');

        const rows = Array.from(table.querySelectorAll('tbody tr')).filter(
          (row) => row.querySelector('td.name a[href*="/film/"]') && row.querySelector('td.star-rating-only'),
        );

        if (!rows.length) continue;

        const headerRow = table.querySelector('thead tr');
        if (headerRow && !headerRow.querySelector('.cc-my-rating-col')) {
          const colHeader = document.createElement('th');
          colHeader.className = 'cc-my-rating-col';
          colHeader.textContent = 'Moje';
          const ratingHeader = headerRow.querySelector('th.star-rating-only');
          ratingHeader ? ratingHeader.insertAdjacentElement('beforebegin', colHeader) : headerRow.appendChild(colHeader);
        }

        for (const row of rows) {
          if (row.querySelector('td.cc-my-rating-cell')) continue;

          const nameLink = row.querySelector('td.name a[href*="/film/"]');
          const ratingCell = row.querySelector('td.star-rating-only');
          const movieId = await this.getMovieIdFromUrl(nameLink.getAttribute('href'));
          const ratingRecord = this.stars[movieId];

          const myRatingCell = document.createElement('td');
          myRatingCell.className = 'cc-my-rating-cell star-rating-only';

          if (ratingRecord) {
            const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
            const isComputed = ratingRecord?.computed === true;
            const starElement = this.createStarElement(ratingValue, isComputed, ratingRecord?.computedCount);
            if (starElement) {
              starElement.classList.remove('cc-own-rating');
              myRatingCell.appendChild(starElement);
            }
          }
          ratingCell.insertAdjacentElement('beforebegin', myRatingCell);
        }
      }
    }

    createStarElement(ratingValue, isComputed = false, computedCount = NaN, outlined = false) {
      if (!Number.isFinite(ratingValue)) return undefined;

      const starRating = document.createElement('span');
      starRating.className = 'star-rating cc-own-rating';
      if (outlined) starRating.classList.add('cc-own-rating-foreign-profile');
      if (isComputed) starRating.classList.add('computed', 'cc-own-rating-computed');

      const stars = document.createElement('span');
      stars.className = 'stars';

      if (ratingValue === 0) {
        stars.classList.add('trash');
      } else {
        stars.classList.add(`stars-${Math.min(5, Math.max(1, ratingValue))}`);
      }

      starRating.appendChild(stars);

      if (isComputed && Number.isFinite(computedCount) && computedCount > 0) {
        const sup = document.createElement('sup');
        sup.className = 'cc-own-rating-computed-count';
        sup.textContent = ` (${computedCount})`;
        starRating.appendChild(sup);
      }

      return starRating;
    }

    async addStars() {
      if (location.href.match(/\/(zebricky|rebricky)\//)) return;
      if (this.isOnUserReviewsPage() && !this.isOnOtherUserProfilePage()) return;
      if (this.isOnOwnRatingsPage()) return;

      if (this.isOnForeignRatingsPage()) {
        return this.addComparisonColumnOnForeignRatingsPage();
      }

      const links = this.getCandidateFilmLinks();
      const outlinedOnThisPage = this.isOnOtherUserProfilePage();

      for (const link of links) {
        if (link.dataset.ccStarAdded === 'true') continue;

        const movieId = await this.getMovieIdFromUrl(link.getAttribute('href'));
        const ratingRecord = this.stars[movieId];
        if (!ratingRecord) continue;

        const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
        const isComputed = ratingRecord?.computed === true;
        const starElement = this.createStarElement(
          ratingValue,
          isComputed,
          ratingRecord?.computedCount,
          outlinedOnThisPage,
        );

        if (!starElement) continue;

        const headingAncestor = link.closest('h1, h2, h3, h4, h5, h6');
        headingAncestor ? headingAncestor.appendChild(starElement) : link.insertAdjacentElement('afterend', starElement);
        link.dataset.ccStarAdded = 'true';
      }
    }

    isOnGalleryPage() {
      return /\/(galerie|galeria)\//i.test(location.pathname || '');
    }

    isGalleryImageLinksEnabled() {
      return localStorage.getItem(GALLERY_IMAGE_LINKS_ENABLED_KEY) !== 'false';
    }

    clearGalleryImageFormatLinks() {
      document.querySelectorAll('.cc-gallery-size-links').forEach((el) => el.remove());
      document.querySelectorAll('.cc-gallery-size-host').forEach((el) => el.classList.remove('cc-gallery-size-host'));
      document.querySelectorAll('.gallery-item picture[data-cc-gallery-links-bound="true"]').forEach((el) => {
        delete el.dataset.ccGalleryLinksBound;
      });
    }

    getGalleryImageFormatLinks(pictureEl) {
      const widthLinks = [];
      const seenHrefs = new Set();

      const addWidthCandidate = (rawUrl) => {
        if (!rawUrl) return;
        const widthMatch = rawUrl.match(/[/]w(\d+)(?:h\d+)?[/]/i);
        if (!widthMatch) return;

        const absoluteUrl = new URL(rawUrl, location.origin).toString();
        if (seenHrefs.has(absoluteUrl)) return;

        seenHrefs.add(absoluteUrl);
        widthLinks.push({ width: Number.parseInt(widthMatch[1], 10), href: absoluteUrl });
      };

      pictureEl.querySelectorAll('source').forEach((sourceEl) => {
        const candidates = (sourceEl.getAttribute('srcset') || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        candidates.forEach((candidate) => addWidthCandidate(candidate.split(/\s+/, 1)[0]));
      });

      const imgEl = pictureEl.querySelector('img');
      addWidthCandidate(imgEl?.getAttribute('src'));

      const imgSrcsetCandidates = (imgEl?.getAttribute('srcset') || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      imgSrcsetCandidates.forEach((candidate) => addWidthCandidate(candidate.split(/\s+/, 1)[0]));

      addWidthCandidate(pictureEl.closest('figure')?.querySelector('a.btn-photo-share')?.getAttribute('href'));

      const uniqueByWidth = [];
      const seenWidths = new Set();

      widthLinks
        .sort((a, b) => b.width - a.width)
        .forEach((link) => {
          if (!seenWidths.has(link.width)) {
            seenWidths.add(link.width);
            uniqueByWidth.push(link);
          }
        });

      if (!uniqueByWidth.length) return [];

      return [
        { label: '100 %', href: uniqueByWidth[0].href },
        ...uniqueByWidth.map((item) => ({ label: String(item.width), href: item.href })),
      ];
    }

    async addGalleryImageFormatLinks() {
      if (!this.isOnGalleryPage()) return;

      if (!this.isGalleryImageLinksEnabled()) {
        return this.clearGalleryImageFormatLinks();
      }

      document.querySelectorAll('.gallery-item picture').forEach((pictureEl) => {
        if (pictureEl.dataset.ccGalleryLinksBound === 'true') return;

        const links = this.getGalleryImageFormatLinks(pictureEl);
        if (!links.length || !pictureEl.parentElement) {
          pictureEl.dataset.ccGalleryLinksBound = 'true';
          return;
        }

        const host = pictureEl.parentElement;
        host.classList.add('cc-gallery-size-host');

        const linksWrapper = document.createElement('div');
        linksWrapper.className = 'cc-gallery-size-links';

        links.forEach((linkDef) => {
          const anchor = document.createElement('a');
          anchor.className = 'cc-gallery-size-link';
          anchor.href = linkDef.href;
          anchor.textContent = linkDef.label;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          linksWrapper.appendChild(anchor);
        });

        host.appendChild(linksWrapper);
        pictureEl.dataset.ccGalleryLinksBound = 'true';
      });
    }

    async getMovieIdFromUrl(url) {
      if (!url) return NaN;
      const matches = Array.from(url.matchAll(/\/(\d+)-/g));
      return matches.length ? Number(matches[matches.length - 1][1]) : NaN;
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

  var css_248z$1 = ".dropdown-content.cc-settings{background-color:#fff!important;-webkit-box-sizing:border-box;box-sizing:border-box;margin-top:0;overflow:hidden;padding:0;right:0;top:100%;width:360px;z-index:10000!important}header.page-header.user-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings,header.page-header.user-not-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings{margin-top:-4px;right:8px;z-index:10000!important}.cc-badge.cc-badge-disabled{cursor:not-allowed;opacity:.7}.cc-badge.cc-badge-warning{-webkit-box-shadow:inset 0 0 0 1px #f3c24f;box-shadow:inset 0 0 0 1px #f3c24f;position:relative}.cc-badge.cc-badge-warning:after{background:#f3c24f;border-radius:999px;color:#3b2a04;content:\"!\";font-size:9px;font-weight:800;height:12px;line-height:12px;position:absolute;right:-5px;text-align:center;top:-5px;width:12px}.dropdown-content.cc-settings .cc-settings-section,.dropdown-content.cc-settings .dropdown-content-head{-webkit-box-sizing:border-box;box-sizing:border-box;margin:0;width:100%}.cc-settings-section .cc-settings-section-content{-webkit-box-sizing:border-box;box-sizing:border-box;padding:10px;width:100%}.cc-settings-section+.cc-settings-section .cc-settings-section-content{border-top:1px solid #efefef}.dropdown-content.cc-settings .left-head{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;gap:2px}.dropdown-content.cc-settings .left-head h2{line-height:1.1;margin:0}.cc-version-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px}.cc-version-link{color:#555;font-size:11px;line-height:1;opacity:.9;text-decoration:none}.cc-version-link:hover{color:#aa2c16;text-decoration:underline}.cc-version-status{background:#b8b8b8;border-radius:999px;display:inline-block;height:8px;opacity:0;-webkit-transition:opacity .18s ease;transition:opacity .18s ease;width:8px}.cc-version-status.is-visible{opacity:1}.cc-version-status.is-checking{background:#9ca3af}.cc-version-status.is-ok{background:#8f8f8f}.cc-version-status.is-error{background:#9b9b9b}.cc-version-status.is-update{background:#aa2c16;color:#fff;font-size:10px;font-weight:700;height:auto;line-height:1.3;padding:1px 6px;width:auto}.cc-head-right,.cc-head-tools{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-version-info-btn{font-weight:700}.cc-version-info-btn svg{height:15px;width:15px}.cc-sync-icon-btn{border:1px solid #cfcfcf;border-radius:8px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:28px;width:28px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;color:#202020;cursor:pointer;justify-content:center;padding:0;text-decoration:none;-webkit-transition:background-color .15s ease,border-color .15s ease,color .15s ease;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.cc-sync-icon-btn:focus-visible,.cc-sync-icon-btn:hover{background:#f3f3f3;border-color:#bdbdbd;color:#aa2c16;outline:none}.cc-sync-icon-btn.is-enabled{background:#fff3f0;border-color:#cf7c6d;color:#aa2c16}.cc-sync-icon-btn.cc-sync-icon-btn-disabled{color:#8b8b8b;cursor:not-allowed;opacity:.6}.cc-badge{background-color:#2c3e50;border-radius:6px;color:#fff;cursor:help;font-size:11.2px;font-size:.7rem;font-weight:700;line-height:1.4;padding:2px 6px}.cc-badge-red{background-color:#aa2c16}.cc-badge-black{background-color:#000}.cc-button{border:none;border-radius:7px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;height:auto;line-height:1.2;padding:6px 8px;-webkit-transition:background .2s,-webkit-transform .12s;transition:background .2s,-webkit-transform .12s;transition:background .2s,transform .12s;transition:background .2s,transform .12s,-webkit-transform .12s}.cc-button:hover{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-button:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-button-red{background-color:#aa2c16}.cc-button-red:hover{background-color:#8b2414}.cc-button-red:active{background-color:#7a1f12}.cc-button-black{background-color:#242424}#cc-load-computed-btn:hover,.cc-button-black:hover{background-color:#000!important}.cc-button-iconed{gap:5px}.cc-button-icon,.cc-button-iconed{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-button-icon{height:12px;width:12px}.cc-settings-actions{display:grid;gap:5px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.cc-settings-actions .cc-button{min-width:0;width:100%}.cc-settings-actions .cc-button-iconed span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-section-title{color:#444;font-size:12px;font-weight:700;margin:0 0 8px}.cc-config-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;gap:5px}.cc-config-list>.cc-setting-row{padding-left:9px;padding-right:9px}.cc-setting-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-backface-visibility:hidden;backface-visibility:hidden;background-color:#fff;border-radius:4px;contain:layout;gap:8px;padding:2px 0;position:relative;-webkit-transform:translateZ(0);transform:translateZ(0);z-index:1}.cc-setting-row:hover{z-index:10}.cc-setting-label{color:#444;cursor:default;font-size:11px;font-weight:500;line-height:1.3}.cc-grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-switch{display:inline-block;height:16px;position:relative;width:28px;-ms-flex-negative:0;flex-shrink:0}.cc-switch input{opacity:0;pointer-events:none;position:absolute}.cc-switch-bg{background-color:#d4d4d4;border-radius:20px;bottom:0;cursor:pointer;left:0;right:0;top:0}.cc-switch-bg,.cc-switch-bg:before{position:absolute;-webkit-transition:.25s ease;transition:.25s ease}.cc-switch-bg:before{background-color:#fff;border-radius:50%;bottom:2px;-webkit-box-shadow:0 1px 2px rgba(0,0,0,.2);box-shadow:0 1px 2px rgba(0,0,0,.2);content:\"\";height:12px;left:2px;width:12px}.cc-switch input:checked+.cc-switch-bg{background-color:#aa2c16}.cc-switch input:focus-visible+.cc-switch-bg{-webkit-box-shadow:0 0 0 2px rgba(170,44,22,.4);box-shadow:0 0 0 2px rgba(170,44,22,.4)}.cc-switch input:checked+.cc-switch-bg:before{-webkit-transform:translateX(12px);transform:translateX(12px)}.cc-setting-group{background:#fdfdfd;border:1px solid #eaeaea;border-radius:6px;padding:4px 8px;-webkit-transition:background-color .2s;transition:background-color .2s}.cc-setting-group:hover{background:#f8f8f8}.cc-setting-collapse-trigger{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-flex:1;-ms-flex-positive:1;cursor:pointer;flex-grow:1;padding:4px 0;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.cc-setting-collapse-trigger:hover .cc-setting-label{color:#aa2c16}.cc-chevron{color:#888;height:14px;margin-left:auto;-webkit-transition:-webkit-transform .2s ease;transition:-webkit-transform .2s ease;transition:transform .2s ease;transition:transform .2s ease,-webkit-transform .2s ease;width:14px}.cc-setting-group.is-collapsed .cc-chevron{-webkit-transform:rotate(-90deg);transform:rotate(-90deg)}.cc-setting-sub{display:-webkit-box;display:-ms-flexbox;display:flex;padding-bottom:2px;padding-left:36px;padding-top:4px;-webkit-box-orient:vertical;-webkit-box-direction:normal;border-top:1px solid transparent;-ms-flex-direction:column;flex-direction:column;gap:6px}.cc-setting-group.is-collapsed .cc-setting-sub,.cc-setting-sub[hidden]{display:none!important}.cc-setting-sub.is-disabled{filter:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"filter\"><feColorMatrix type=\"matrix\" color-interpolation-filters=\"sRGB\" values=\"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0\" /></filter></svg>#filter');-webkit-filter:grayscale(100%);filter:grayscale(100%);opacity:.45;pointer-events:none}.cc-form-field{color:#444;display:grid;font-size:11px;gap:4px}.cc-form-field input[type=text]{border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:11px;line-height:1.2;padding:6px 8px;width:100%}.cc-sub-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:10px;margin-top:2px}.cc-button-small{font-size:11px;padding:4px 10px}.cc-setting-icons{display:-webkit-box;display:-ms-flexbox;display:flex;gap:6px;margin-left:auto}.cc-image-icon-btn,.cc-info-icon,.cc-setting-icons{-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-image-icon-btn,.cc-info-icon{color:#a0a0a0;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-pack:center;-ms-flex-pack:center;background:transparent;border:none;cursor:pointer;justify-content:center;padding:0;position:relative;-webkit-transition:color .2s ease;transition:color .2s ease}.cc-image-icon-btn:hover,.cc-info-icon:hover{background-color:transparent!important;color:#aa2c16}.cc-image-icon-btn:focus{outline:none}.cc-info-icon:after{background-color:#242424;border-radius:6px;bottom:calc(100% + 8px);-webkit-box-shadow:0 4px 15px rgba(0,0,0,.2);box-shadow:0 4px 15px rgba(0,0,0,.2);color:#fff;content:attr(aria-label);font-size:11px;font-weight:500;line-height:1.4;max-width:240px;padding:7px 10px;right:-5px;text-align:right;white-space:normal;width:-webkit-max-content;width:-moz-max-content;width:max-content}.cc-info-icon:after,.cc-info-icon:before{opacity:0;pointer-events:none;position:absolute;-webkit-transform:translateY(4px);transform:translateY(4px);-webkit-transition:opacity .2s ease,-webkit-transform .2s ease;transition:opacity .2s ease,-webkit-transform .2s ease;transition:opacity .2s ease,transform .2s ease;transition:opacity .2s ease,transform .2s ease,-webkit-transform .2s ease;visibility:hidden}.cc-info-icon:before{border-color:#242424 transparent transparent;border-style:solid;border-width:5px 5px 0;bottom:calc(100% + 3px);content:\"\";right:2px}.cc-info-icon:hover:after,.cc-info-icon:hover:before{opacity:1;-webkit-transform:translateY(0);transform:translateY(0);visibility:visible}.cc-ratings-progress{background:#f9f9f9;border:1px solid #e4e4e4;border-radius:6px;margin:0;padding:8px}.cc-ratings-progress-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;color:#555;font-size:11px;gap:10px;margin-bottom:6px}#cc-ratings-progress-label{-webkit-box-flex:1;-ms-flex:1;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#cc-ratings-progress-count{-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;white-space:nowrap}.cc-ratings-progress-track{background:#e6e6e6;border-radius:999px;height:8px;overflow:hidden;width:100%}.cc-ratings-progress-bar{background:-webkit-gradient(linear,left top,right top,from(#aa2c16),to(#d13b1f));background:linear-gradient(90deg,#aa2c16,#d13b1f);border-radius:999px;height:100%;-webkit-transition:width .25s ease;transition:width .25s ease;width:0}.cc-ratings-progress-actions{display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:6px;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-ratings-cancel-link{background:transparent;border:0;border-radius:4px;color:#7a7a7a;cursor:pointer;font-size:11px;padding:2px 6px;text-decoration:none;-webkit-transition:background-color .15s ease,color .15s ease;transition:background-color .15s ease,color .15s ease}.cc-ratings-cancel-link:hover{background:rgba(0,0,0,.06);color:#444}.cc-maint-actions{display:-webkit-box;display:-ms-flexbox;display:flex;gap:6px}.cc-maint-btn{background:#fff;border:1px solid #cfcfcf;border-radius:6px;color:#444;cursor:pointer;font-size:11px;padding:6px 8px}.cc-maint-btn:hover{background:#f7f7f7;border-color:#bcbcbc}.cc-version-info-overlay{background:rgba(0,0,0,.36);display:none;inset:0;position:fixed;z-index:10030;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;-webkit-box-sizing:border-box;box-sizing:border-box;justify-content:center;padding:16px}.cc-version-info-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-version-info-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 20px 45px rgba(0,0,0,.25);box-shadow:0 20px 45px rgba(0,0,0,.25);color:#222;display:grid;grid-template-rows:auto minmax(0,1fr);max-height:80vh;overflow:hidden;width:min(560px,100%)}.cc-version-info-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-version-info-head h3{font-size:14px;font-weight:700;margin:0}.cc-version-info-close{background:transparent;border:0;border-radius:7px;color:#666;cursor:pointer;font-size:20px;height:28px;line-height:1;width:28px}.cc-version-info-close:hover{background:#f1f1f1;color:#222}.cc-version-info-body{font-size:12px;line-height:1.5;overflow:auto;padding:12px 14px}body.cc-menu-open .box-video,body.cc-menu-open .slick-list,body.cc-menu-open .slick-slider{pointer-events:none!important}";
  styleInject(css_248z$1);

  var css_248z = ".cc-flex{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-flex-column{-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-flex-row{-webkit-box-orient:horizontal;-webkit-box-direction:normal;-ms-flex-direction:row;flex-direction:row}.cc-flex-row-reverse{-webkit-box-orient:horizontal;-webkit-box-direction:reverse;-ms-flex-direction:row-reverse;flex-direction:row-reverse}.cc-flex-column-reverse{-webkit-box-orient:vertical;-webkit-box-direction:reverse;-ms-flex-direction:column-reverse;flex-direction:column-reverse}.cc-justify-center{-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-justify-evenly{-webkit-box-pack:space-evenly;-ms-flex-pack:space-evenly;justify-content:space-evenly}.cc-justify-start{-webkit-box-pack:start;-ms-flex-pack:start;justify-content:flex-start}.cc-justify-end{-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-justify-between{-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.cc-justify-around{-ms-flex-pack:distribute;justify-content:space-around}.cc-align-center{text-align:center}.cc-align-left{text-align:left}.cc-align-right{text-align:right}.cc-grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-grow-0{-webkit-box-flex:0;-ms-flex-positive:0;flex-grow:0}.cc-grow-1{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-grow-2{-webkit-box-flex:2;-ms-flex-positive:2;flex-grow:2}.cc-grow-3{-webkit-box-flex:3;-ms-flex-positive:3;flex-grow:3}.cc-grow-4{-webkit-box-flex:4;-ms-flex-positive:4;flex-grow:4}.cc-grow-5{-webkit-box-flex:5;-ms-flex-positive:5;flex-grow:5}.cc-gap-5{gap:5px}.cc-gap-10{gap:10px}.cc-gap-30{gap:30px}.cc-ml-auto{margin-left:auto}.cc-mr-auto{margin-right:auto}.cc-ph-5{padding:0 5px}.cc-ph-10{padding:0 10px}.cc-pv-5{padding:5px 0}.cc-pv-10{padding:10px 0}.cc-mh-5{margin:0 5px}.cc-mh-10{margin:0 10px}.cc-mv-5{margin:5px 0}.cc-mv-10{margin:10px 0}.cc-own-rating{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;margin-left:8px;vertical-align:middle;-webkit-box-align:center;-ms-flex-align:center;align-items:center;line-height:1}.cc-own-rating-foreign-profile{background-color:hsla(0,34%,69%,.08);border:1px solid #ba0305;border-radius:999px;-webkit-box-shadow:inset 0 0 0 1px hsla(0,0%,100%,.5);box-shadow:inset 0 0 0 1px hsla(0,0%,100%,.5);padding:0 7px 0 5px;position:relative;top:-4px;white-space:nowrap;-ms-flex-negative:0;flex-shrink:0}.cc-own-rating-foreign-profile:before{color:#ba0305;content:\"🤍\";display:inline-block;font-size:9px;font-weight:700;letter-spacing:.04em;margin-right:5px;opacity:.85;text-transform:uppercase}.cc-own-rating-computed .stars:before{color:#d2d2d2}.cc-own-rating-computed-count{color:#7b7b7b;font-size:11px;line-height:1;margin-left:3px;vertical-align:super}h3.film-title-inline .cc-own-rating,h3.film-title-nooverflow .cc-own-rating{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-ratings-table-export{cursor:pointer;font-size:11px;margin-left:auto;padding:5px 7px;text-align:center}.cc-my-rating-cell,.cc-my-rating-col{text-align:center;width:64px}.cc-my-rating-cell{white-space:nowrap}.cc-my-rating-cell .cc-own-rating{margin-left:0}.cc-compare-ratings-table{width:calc(100% + 24px)}.article-header{padding-top:2px}.cc-gallery-size-host{position:relative}.cc-gallery-size-links{bottom:8px;display:none;position:absolute;right:8px;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:end;-ms-flex-align:end;align-items:flex-end;gap:4px;z-index:11}.cc-gallery-size-host:hover .cc-gallery-size-links,.cc-gallery-size-links.is-visible,.cc-gallery-size-links:hover{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-gallery-size-link{background-color:hsla(0,100%,98%,.82);border-radius:5px;color:#222;display:inline-block;font-size:11px;font-weight:700;line-height:1.2;min-width:48px;padding:2px 6px;text-align:center;text-decoration:none}.cc-gallery-size-link:hover{text-decoration:underline}.cc-creator-preview{left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:translateY(2px);transform:translateY(2px);-webkit-transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,transform .12s ease;transition:opacity .12s ease,transform .12s ease,-webkit-transform .12s ease;z-index:10030}.cc-creator-preview.is-visible{opacity:1;-webkit-transform:translateY(0);transform:translateY(0)}.cc-creator-preview-card{background:hsla(0,0%,99%,.96);border:1px solid hsla(0,0%,50%,.35);border-radius:10px;-webkit-box-shadow:0 8px 20px rgba(0,0,0,.2);box-shadow:0 8px 20px rgba(0,0,0,.2);overflow:hidden;position:relative;width:176px}.cc-creator-preview-image{background:#ececec;display:block;height:200px;-o-object-fit:contain;object-fit:contain;-o-object-position:center center;object-position:center center;width:100%}.cc-creator-preview.is-no-image .cc-creator-preview-image{background:linear-gradient(160deg,#f2f2f2,#e3e3e3);opacity:0}.cc-creator-preview.is-no-image .cc-creator-preview-card:before{color:#777;content:\"Bez fotky\";font-size:12px;font-weight:600;left:50%;letter-spacing:.02em;position:absolute;top:82px;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);z-index:1}.cc-creator-preview-name{color:#303030;display:-webkit-box;display:-ms-flexbox;display:flex;font-size:11px;font-weight:600;line-height:1.2;overflow:hidden;padding:7px 8px 8px;text-align:center;text-overflow:ellipsis;white-space:nowrap;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;gap:4px;justify-content:center}.cc-creator-preview-name-flag{height:auto;width:14px;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-creator-preview-meta{background:hsla(0,0%,98%,.92);border-top:1px solid rgba(0,0,0,.06);padding:0 8px 9px}.cc-creator-preview-meta-line{color:#434343;font-size:11px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-creator-preview-meta-line+.cc-creator-preview-meta-line{margin-top:2px}.cc-creator-preview-meta-birth{color:#2f2f2f;font-size:12px;font-weight:600;line-height:1.4;white-space:normal}.cc-creator-preview-meta-birth-age-inline{color:#666;font-size:11px;font-weight:500}.cc-creator-preview-meta-age{color:#595959;font-size:11px;font-weight:600;text-align:center}.cc-creator-preview-meta-photo{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline;color:#505050;font-weight:600;gap:6px;min-width:0;white-space:nowrap}.cc-creator-preview-meta-photo:before{content:\"🎬\";line-height:1;margin-right:2px}.cc-creator-preview-meta-photo.is-copyright:before{content:\"©\";font-weight:700}.cc-creator-preview-meta-photo-source{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-creator-preview-meta-photo-year{-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;white-space:nowrap}.cc-creator-preview-meta-photo.is-movie{color:#ba0305}.cc-creator-preview-meta-photo.is-movie .cc-creator-preview-meta-photo-year{font-weight:700}.cc-creator-preview-meta-photo.is-movie .cc-creator-preview-meta-photo-source{line-height:1;white-space:nowrap}.cc-creator-preview-meta-photo.is-copyright{color:#4c4c4c}.cc-creator-preview-meta-photo.is-copyright .cc-creator-preview-meta-photo-year{display:none}.cc-creator-preview-meta-photo.is-copyright .cc-creator-preview-meta-photo-source{display:-webkit-box;overflow:hidden;text-overflow:clip;white-space:normal;-webkit-line-clamp:2;-webkit-box-orient:vertical}nav.tab-nav.cc-show-all-tabs{padding-right:0!important}nav.tab-nav.cc-show-all-tabs .tab-nav-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;list-style:none;margin:0;padding:0;width:100%}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item{-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;min-width:0;top:-4px}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item.active{top:0}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-link{display:block;overflow:hidden;padding:0 5px;text-align:center;text-overflow:ellipsis;white-space:nowrap}";
  styleInject(css_248z);

  var htmlContent = "<svg style=\"display: none;\" xmlns=\"http://www.w3.org/2000/svg\">\r\n    <symbol id=\"cc-icon-info\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\r\n        <line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line>\r\n        <line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-image\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>\r\n        <circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"></circle>\r\n        <polyline points=\"21 15 16 10 5 21\"></polyline>\r\n    </symbol>\r\n</svg>\r\n\r\n<a href=\"javascript:void(0)\" rel=\"dropdownContent\" class=\"user-link csfd-compare-menu initialized\">\r\n    <svg class=\"cc-menu-icon\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n        aria-hidden=\"true\" focusable=\"false\">\r\n        <text x=\"12\" y=\"12\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"currentColor\" font-size=\"11\"\r\n            font-weight=\"800\" letter-spacing=\"0.2\">CC</text>\r\n    </svg>\r\n</a>\r\n\r\n<div class=\"dropdown-content cc-settings\">\r\n\r\n    <div class=\"dropdown-content-head\">\r\n        <div class=\"left-head\">\r\n            <h2>CSFD-Compare</h2>\r\n            <div class=\"cc-version-row\">\r\n                <span class=\"cc-version-link\" id=\"cc-version-value\">v0.8.6</span>\r\n                <span class=\"cc-version-status\" id=\"cc-version-status\" aria-hidden=\"true\"></span>\r\n            </div>\r\n        </div>\r\n        <div class=\"right-head cc-ml-auto cc-head-right\">\r\n            <span class=\"cc-badge cc-badge-red\" id=\"cc-badge-red\" title=\"Uloženo / Celkem\">0 / 0</span>\r\n            <span class=\"cc-badge cc-badge-black\" id=\"cc-badge-black\" title=\"Spočtená hodnocení\">0</span>\r\n            <div class=\"cc-head-tools\">\r\n                <button id=\"cc-sync-cloud-btn\" class=\"cc-sync-icon-btn\" title=\"Cloud sync\" aria-label=\"Cloud sync\">\r\n                    <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n                        aria-hidden=\"true\" focusable=\"false\">\r\n                        <path\r\n                            d=\"M16.5 18H6.2C4.43 18 3 16.57 3 14.8C3 13.03 4.43 11.6 6.2 11.6C6.27 8.52 8.76 6 11.85 6C14.16 6 16.19 7.43 17 9.54C18.67 9.75 20 11.18 20 12.9C20 14.76 18.49 16.27 16.63 16.27\"\r\n                            stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />\r\n                        <path d=\"M18.5 18V22\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                        <path d=\"M16.5 20H20.5\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                    </svg>\r\n                </button>\r\n                <button id=\"cc-version-info-btn\" class=\"cc-sync-icon-btn cc-version-info-btn\" title=\"Informace o verzi\"\r\n                    aria-label=\"Informace o verzi\">\r\n                    <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n                        aria-hidden=\"true\" focusable=\"false\">\r\n                        <circle cx=\"12\" cy=\"12\" r=\"8\" stroke=\"currentColor\" stroke-width=\"1.9\" />\r\n                        <path d=\"M12 11V15\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" />\r\n                        <circle cx=\"12\" cy=\"8.4\" r=\"1\" fill=\"currentColor\" />\r\n                    </svg>\r\n                </button>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\">\r\n        <div class=\"cc-settings-section-content\">\r\n            <div class=\"cc-settings-actions\">\r\n                <button id=\"cc-load-ratings-btn\" class=\"cc-button cc-button-red cc-grow cc-button-iconed\">\r\n                    <span class=\"cc-button-icon\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\"\r\n                            fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n                            <path d=\"M12 4V14\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                            <path d=\"M8 10L12 14L16 10\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"\r\n                                stroke-linejoin=\"round\" />\r\n                            <path d=\"M5 19H19\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />\r\n                        </svg></span>\r\n                    <span>Načíst moje hodnocení</span>\r\n                </button>\r\n                <button id=\"cc-load-computed-btn\" class=\"cc-button cc-button-black cc-button-iconed\">\r\n                    <span class=\"cc-button-icon\" aria-hidden=\"true\">\r\n                        <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n                            <path\r\n                                d=\"M12 6L13.8 9.6L17.8 10.2L14.9 13L15.6 17L12 15.2L8.4 17L9.1 13L6.2 10.2L10.2 9.6L12 6Z\"\r\n                                stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\" />\r\n                        </svg>\r\n                    </span>\r\n                    <span>Dopočítat seriály</span>\r\n                </button>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\" hidden>\r\n        <div class=\"cc-settings-section-content\">\r\n            <div id=\"cc-ratings-progress\" class=\"cc-ratings-progress\" hidden>\r\n                <div class=\"cc-ratings-progress-head\">\r\n                    <span id=\"cc-ratings-progress-label\">Připravuji načítání…</span>\r\n                    <span id=\"cc-ratings-progress-count\">0 / 0</span>\r\n                </div>\r\n                <div class=\"cc-ratings-progress-track\">\r\n                    <div id=\"cc-ratings-progress-bar\" class=\"cc-ratings-progress-bar\" style=\"width: 0%\"></div>\r\n                </div>\r\n                <div class=\"cc-ratings-progress-actions\">\r\n                    <button id=\"cc-cancel-ratings-loader-btn\" class=\"cc-ratings-cancel-link\" hidden>Zrušit\r\n                        načítání</button>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\">\r\n        <div class=\"cc-settings-section-content\">\r\n            <h3 class=\"cc-section-title\">Konfigurace</h3>\r\n            <div class=\"cc-config-list\">\r\n\r\n                <div class=\"cc-setting-row\">\r\n                    <label class=\"cc-switch\">\r\n                        <input type=\"checkbox\" id=\"cc-enable-gallery-image-links\" checked />\r\n                        <span class=\"cc-switch-bg\"></span>\r\n                    </label>\r\n                    <span class=\"cc-setting-label\">Zobrazovat formáty obrázků v galerii</span>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-row\">\r\n                    <label class=\"cc-switch\">\r\n                        <input type=\"checkbox\" id=\"cc-show-all-creator-tabs\" checked />\r\n                        <span class=\"cc-switch-bg\"></span>\r\n                    </label>\r\n                    <span class=\"cc-setting-label\">Zobrazit všechny záložky tvůrce</span>\r\n                    <div class=\"cc-setting-icons\">\r\n                        <div class=\"cc-info-icon\"\r\n                            aria-label=\"Na stránce tvůrce natvrdo zobrazí všechny záložky (Režie, Scénář, Herec atd.), i když v nich má méně než 3 filmy.\">\r\n                            <svg width=\"14\" height=\"14\">\r\n                                <use href=\"#cc-icon-info\"></use>\r\n                            </svg>\r\n                        </div>\r\n                        <div class=\"cc-image-icon-btn\" role=\"button\" tabindex=\"0\"\r\n                            data-image-url=\"https://i.imgur.com/aTrSU2X.png\" aria-label=\"Zobrazit ukázku\">\r\n                            <svg width=\"14\" height=\"14\">\r\n                                <use href=\"#cc-icon-image\"></use>\r\n                            </svg>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-group\" id=\"cc-creator-preview-group\">\r\n                    <div class=\"cc-setting-row\">\r\n                        <label class=\"cc-switch\">\r\n                            <input type=\"checkbox\" id=\"cc-enable-creator-preview\" checked />\r\n                            <span class=\"cc-switch-bg\"></span>\r\n                        </label>\r\n                        <div class=\"cc-setting-collapse-trigger\" id=\"cc-creator-preview-group-toggle\"\r\n                            aria-expanded=\"true\">\r\n                            <span class=\"cc-setting-label cc-grow\">Náhledy fotek tvůrců</span>\r\n                            <svg class=\"cc-chevron\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <polyline points=\"6 9 12 15 18 9\"></polyline>\r\n                            </svg>\r\n                        </div>\r\n                    </div>\r\n                    <div class=\"cc-setting-sub\" id=\"cc-creator-preview-group-body\">\r\n                        <div class=\"cc-setting-row\">\r\n                            <label class=\"cc-switch\">\r\n                                <input type=\"checkbox\" id=\"cc-creator-preview-show-birth\" checked />\r\n                                <span class=\"cc-switch-bg\"></span>\r\n                            </label>\r\n                            <span class=\"cc-setting-label\">Zobrazovat datum narození</span>\r\n                        </div>\r\n                        <div class=\"cc-setting-row\">\r\n                            <label class=\"cc-switch\">\r\n                                <input type=\"checkbox\" id=\"cc-creator-preview-show-photo-from\" checked />\r\n                                <span class=\"cc-switch-bg\"></span>\r\n                            </label>\r\n                            <span class=\"cc-setting-label\">Zobrazovat „Photo from“</span>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-row\">\r\n                    <label class=\"cc-switch\">\r\n                        <input type=\"checkbox\" id=\"cc-enable-clickable-header-boxes\" checked />\r\n                        <span class=\"cc-switch-bg\"></span>\r\n                    </label>\r\n                    <span class=\"cc-setting-label\">Boxy s tlačítkem \"VÍCE\" jsou klikatelné celé</span>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-row\">\r\n                    <label class=\"cc-switch\">\r\n                        <input type=\"checkbox\" id=\"cc-ratings-estimate\" />\r\n                        <span class=\"cc-switch-bg\"></span>\r\n                    </label>\r\n                    <span class=\"cc-setting-label\">Vypočtení % při počtu hodnocení pod 10</span>\r\n                    <div class=\"cc-setting-icons\">\r\n                        <div class=\"cc-info-icon\"\r\n                            aria-label=\"Když má film méně než 10 hodnocení, CSFD procenta skryje. Tato funkce je matematicky dopočítá a zobrazí.\">\r\n                            <svg width=\"14\" height=\"14\">\r\n                                <use href=\"#cc-icon-info\"></use>\r\n                            </svg>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-row\">\r\n                    <label class=\"cc-switch\">\r\n                        <input type=\"checkbox\" id=\"cc-ratings-from-favorites\" />\r\n                        <span class=\"cc-switch-bg\"></span>\r\n                    </label>\r\n                    <span class=\"cc-setting-label\">Zobrazit hodnocení z průměru oblíbených</span>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-row\">\r\n                    <label class=\"cc-switch\">\r\n                        <input type=\"checkbox\" id=\"cc-add-ratings-date\" />\r\n                        <span class=\"cc-switch-bg\"></span>\r\n                    </label>\r\n                    <span class=\"cc-setting-label\">Zobrazit datum hodnocení</span>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-group\" id=\"cc-hide-reviews-group\">\r\n                    <div class=\"cc-setting-row\">\r\n                        <label class=\"cc-switch\">\r\n                            <input type=\"checkbox\" id=\"cc-hide-selected-reviews\" />\r\n                            <span class=\"cc-switch-bg\"></span>\r\n                        </label>\r\n                        <div class=\"cc-setting-collapse-trigger\" id=\"cc-hide-reviews-group-toggle\"\r\n                            aria-expanded=\"false\">\r\n                            <span class=\"cc-setting-label cc-grow\">Skrýt recenze lidí</span>\r\n                            <svg class=\"cc-chevron\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <polyline points=\"6 9 12 15 18 9\"></polyline>\r\n                            </svg>\r\n                        </div>\r\n                    </div>\r\n                    <div class=\"cc-setting-sub\" id=\"cc-hide-reviews-group-body\" hidden>\r\n                        <label class=\"cc-form-field\">\r\n                            <span>Jména (oddělena čárkou)</span>\r\n                            <input type=\"text\" data-bwignore=\"true\" id=\"cc-hide-selected-reviews-list\"\r\n                                placeholder=\"Např. Adrian, Karel\" />\r\n                        </label>\r\n                        <div class=\"cc-sub-actions\">\r\n                            <button type=\"button\" id=\"cc-hide-reviews-apply\"\r\n                                class=\"cc-button cc-button-red cc-button-small\">Použít</button>\r\n                            <span class=\"cc-form-note\">Stiskněte Enter pro uložení.</span>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"cc-setting-group\" style=\"padding: 8px;\">\r\n                    <label class=\"cc-form-field\">\r\n                        <span style=\"font-weight: 600; color: #444; margin-bottom: 2px;\">Vlastní štítek sekce</span>\r\n                        <input type=\"text\" data-bwignore=\"true\" name=\"sectionLabel\"\r\n                            placeholder=\"Např. Můj CSFD Compare\" />\r\n                    </label>\r\n                </div>\r\n\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\">\r\n        <div class=\"cc-settings-section-content\">\r\n            <h3 class=\"cc-section-title\">Další akce</h3>\r\n            <div class=\"cc-maint-actions\">\r\n                <button type=\"button\" class=\"cc-maint-btn\" id=\"cc-maint-reset-btn\">Reset</button>\r\n                <button type=\"button\" class=\"cc-maint-btn\" id=\"cc-maint-clear-lc-btn\">Smazat LC</button>\r\n                <button type=\"button\" class=\"cc-maint-btn\" id=\"cc-maint-clear-db-btn\">Smazat DB</button>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n</div>\r\n\r\n<!-- <div class=\"cc-version-info-overlay\" id=\"cc-image-modal\">\r\n    <div class=\"cc-version-info-modal\" style=\"width: min(800px, 95vw);\">\r\n        <div class=\"cc-version-info-head\">\r\n            <h3 id=\"cc-image-modal-title\">Ukázka funkce</h3>\r\n            <button type=\"button\" class=\"cc-version-info-close\" id=\"cc-image-modal-close\" aria-label=\"Zavřít\">×</button>\r\n        </div>\r\n        <div class=\"cc-version-info-body\" style=\"text-align: center; padding: 16px;\">\r\n            <img id=\"cc-image-modal-img\" src=\"\" alt=\"Ukázka\"\r\n                style=\"max-width: 100%; max-height: 65vh; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);\" />\r\n        </div>\r\n    </div>\r\n</div> -->";

  const DEFAULT_MAX_PAGES = 0; // 0 means no limit, load all available pages
  const REQUEST_DELAY_MIN_MS = 250;
  const REQUEST_DELAY_MAX_MS = 550;
  const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';
  const COMPUTED_LOADER_STATE_STORAGE_KEY = 'cc_computed_loader_state_v1';
  const PROFILE_LINK_SELECTOR$2 =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

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
    const profileEl = document.querySelector(PROFILE_LINK_SELECTOR$2);
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
    // rawType is the first non-year info (e.g. "epizoda" or "seriál").
    const rawType = infoValues.find((value) => !/^\d{4}$/.test(value));
    // try to pick up a season/episode token such as (S01E04) that appears as a
    // separate info element; store it without parentheses so downstream code can
    // display it correctly.
    const tokenMatch = infoValues.find((value) => /^\(S\d{1,2}(?:E\d{1,2})?\)$/.test(value));
    let seriesToken = tokenMatch ? tokenMatch.replace(/[()]/g, '') : '';
    if (!seriesToken) {
      const nameParen = name.match(/\(S\d{1,2}(?:E\d{1,2})?\)/i);
      if (nameParen) {
        seriesToken = nameParen[0].replace(/[()]/g, '');
      } else {
        const nameSe = name.match(/S(\d{1,2})E(\d{1,2})/i);
        if (nameSe) {
          seriesToken = `S${nameSe[1].padStart(2, '0')}E${nameSe[2].padStart(2, '0')}`;
        } else {
          const nameEp = name.match(/Episode\s*(\d{1,3})/i);
          if (nameEp) {
            seriesToken = `E${nameEp[1].padStart(2, '0')}`;
          } else {
            const nameSeason = name.match(/Season\s*(\d{1,2})/i);
            if (nameSeason) {
              seriesToken = `S${nameSeason[1].padStart(2, '0')}`;
            }
          }
        }
      }
    }

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
      seriesToken,
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
    const token = record?.seriesToken || '';
    return [
      Number.isFinite(record?.rating) ? String(record.rating) : '',
      record?.date || '',
      record?.computed === true ? '1' : '0',
      computedCount,
      record?.computedFromText || '',
      token,
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
    const section = progress.section;
    const label = progress.label;
    const count = progress.count;
    const bar = progress.bar;

    if (section) {
      section.hidden = false;
    }
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

      // previously we stopped early during incremental runs once the count
      // reached totalRatings and we saw a stable page.  this was efficient when
      // we only cared about new entries, but it meant that metadata-only changes
      // (like adding a seriesToken) on later pages would never be detected.  by
      // requiring non-incremental mode we ensure full scans when the user explicitly
      // requests updates, while still allowing non-incremental callers to abort.
      const shouldStopEarly =
        !incremental &&
        page >= 2 &&
        totalRatings > 0 &&
        directRatingsCount >= totalRatings &&
        consecutiveStablePages >= 1;

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
      section: rootElement.querySelector('#cc-ratings-progress')?.closest('.cc-settings-section'),
      label: rootElement.querySelector('#cc-ratings-progress-label'),
      count: rootElement.querySelector('#cc-ratings-progress-count'),
      bar: rootElement.querySelector('#cc-ratings-progress-bar'),
    };

    if (!loadButton || !computedButton || !progress.container || !progress.label || !progress.count || !progress.bar) {
      return;
    }

    if (progress.section) {
      progress.section.hidden = true;
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

  /**
   * Creates and displays the Sync Setup modal.
   * @param {Function} onSaveCallback - Function to run after the user clicks "Uložit" (Save).
   */
  function createSyncSetupModal(onSaveCallback) {
    removeSyncModal();

    const { enabled, accessKey } = getSyncSetupState();

    const overlay = document.createElement('div');
    overlay.className = 'cc-sync-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cc-sync-modal';

    // Updated HTML for a much better User Experience
    modal.innerHTML = `
    <div class="cc-sync-modal-head">
      <h3>Nastavení Cloud Sync <span style="color: #aa2c16; font-size: 11px; vertical-align: middle;">(BETA)</span></h3>
      <button type="button" class="cc-sync-close" aria-label="Zavřít">&times;</button>
    </div>

    <div style="font-size: 12px; color: #444; margin-bottom: 14px; line-height: 1.4;">
      <p style="margin-top: 0;">
        Zálohujte svá hodnocení a synchronizujte je napříč zařízeními (např. mezi stolním PC a notebookem).
      </p>
      <p style="margin-bottom: 0;">
        Pro spárování zařízení vložte svůj osobní <strong>Sync Token</strong>.
        <br>
        <a href="#" target="_blank" style="color: #aa2c16; text-decoration: none; font-weight: 600;">Jak získám svůj Token?</a> </p>
    </div>

    <div style="background: #f9f9f9; border: 1px solid #eee; padding: 10px; border-radius: 8px; margin-bottom: 14px;">
      <label class="cc-sync-toggle-row" style="margin-bottom: 8px; display: flex; cursor: pointer;">
        <input id="cc-sync-enabled-input" type="checkbox" ${enabled ? 'checked' : ''} style="margin-right: 8px; accent-color: #aa2c16;">
        <span style="font-weight: 600; color: #222;">Povolit synchronizaci</span>
      </label>

      <label class="cc-sync-label" for="cc-sync-key-input" style="font-weight: 600; margin-top: 8px;">Váš Sync Token</label>
      <input id="cc-sync-key-input" class="cc-sync-input" type="password" placeholder="Např. a1b2c3d4-e5f6..." value="${accessKey.replace(/"/g, '&quot;')}" style="margin-top: 4px; border: 1px solid #ccc;">
    </div>

    <div class="cc-sync-actions">
      <button type="button" class="cc-sync-save cc-button cc-button-red">Uložit nastavení</button>
      <button type="button" class="cc-sync-cancel cc-button cc-button-black">Zrušit</button>
    </div>
  `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Trigger CSS transition
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    const closeModal = () => {
      overlay.classList.remove('visible');
      setTimeout(removeSyncModal, 180);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
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

      // Execute the callback to instantly update the button UI
      if (onSaveCallback) {
        onSaveCallback();
      }

      closeModal();
    });
  }

  function updateSyncButtonLabel(button) {
    const { enabled, accessKey } = getSyncSetupState();

    // Only show as fully enabled if the checkbox is checked AND they actually provided a key
    const isFullyEnabled = enabled && accessKey.length > 0;

    button.classList.toggle('is-enabled', isFullyEnabled);
    button.setAttribute('title', isFullyEnabled ? 'Cloud sync je aktivní' : 'Nastavit Cloud sync');
    button.setAttribute('aria-label', isFullyEnabled ? 'Cloud sync zapnutý' : 'Nastavit Cloud sync');
  }

  function initializeRatingsSync(rootElement) {
    const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');

    if (!syncButton || syncButton.dataset.ccSyncBound === 'true') {
      return;
    }

    syncButton.dataset.ccSyncBound = 'true';
    updateSyncButtonLabel(syncButton);

    syncButton.addEventListener('click', () => {
      // We pass the update logic as a callback so it fires ONLY when the user clicks "Save"
      createSyncSetupModal(() => {
        updateSyncButtonLabel(syncButton);
      });
    });
  }

  const UPDATE_CHECK_CACHE_KEY = 'cc_update_check_cache_v1';
  const VERSION_DETAILS_CACHE_KEY = 'cc_version_details_cache_v1';
  const UPDATE_CHECK_MAX_AGE_MS = 1000 * 60 * 60 * 12;
  const GREASYFORK_SCRIPT_API_URL = 'https://greasyfork.org/scripts/425054.json';

  function escapeHtml$2(value) {
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
        <div class="cc-version-info-value">${escapeHtml$2(normalizeVersionLabel(currentVersion))}</div>
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
      ? `<ul class="cc-version-info-list">${changelogItems.map((item) => `<li>${escapeHtml$2(item)}</li>`).join('')}</ul>`
      : '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';

    bodyElement.innerHTML = `
    <div class="cc-version-info-meta">
      <div class="cc-version-info-key">Nainstalováno</div>
      <div class="cc-version-info-value">${escapeHtml$2(normalizeVersionLabel(currentVersion))}</div>

      <div class="cc-version-info-key">Nejnovější</div>
      <div class="cc-version-info-value">${escapeHtml$2(normalizeVersionLabel(latestVersion))}</div>

      <div class="cc-version-info-key">Poslední aktualizace</div>
      <div class="cc-version-info-value">${escapeHtml$2(formatVersionDateTime(details?.datetimeRaw))}</div>

      <div class="cc-version-info-key">Stav</div>
      <div class="cc-version-info-value">
        <span class="cc-version-info-status ${statusClass}">
          <span class="cc-version-info-status-dot" aria-hidden="true"></span>
          ${escapeHtml$2(statusText)}
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

  const PROFILE_LINK_SELECTOR$1 =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

  function getCurrentUserSlugFromProfile() {
    const profileEl = document.querySelector(PROFILE_LINK_SELECTOR$1);
    const profileHref = profileEl?.getAttribute('href') || '';
    const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//i);
    return match ? match[1] : undefined;
  }

  function getUserSlugFromPath(pathname) {
    const match = String(pathname || '').match(/^\/uzivatel\/(\d+-[^/]+)\//i);
    return match ? match[1] : undefined;
  }

  function getCurrentUserRatingsUrl() {
    const profileEl = document.querySelector(PROFILE_LINK_SELECTOR$1);
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

  // Cache the last fetched total so multiple refreshRatingsBadges calls within the same
  // page load don't each trigger a separate network request to /hodnoceni/.
  let _cachedRatingsUrl = null;
  let _cachedRatingsTotal = null;

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

    const currentUserSlug = getCurrentUserSlugFromProfile();
    const pageUserSlug = getUserSlugFromPath(path);
    if (!currentUserSlug || !pageUserSlug || currentUserSlug !== pageUserSlug) {
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

    // Return cached value for this URL so repeated badge refreshes within the same
    // page load don't each fire a redundant network request.
    if (_cachedRatingsUrl === ratingsUrl && _cachedRatingsTotal !== null) {
      return _cachedRatingsTotal;
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
    const total = parseTotalRatingsFromDocument(doc);

    _cachedRatingsUrl = ratingsUrl;
    _cachedRatingsTotal = total;

    return total;
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

  function escapeHtml$1(value) {
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

  function extractSeriesInfoToken(record, typeKey) {
    const candidates = [record?.seriesToken, record?.url, record?.fullUrl, record?.name]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    for (const source of candidates) {
      // season+episode e.g. s01e04
      const seasonEpisodeMatch = source.match(/s(\d{1,2})e(\d{1,2})/i);
      if (seasonEpisodeMatch) {
        const season = seasonEpisodeMatch[1].padStart(2, '0');
        const episode = seasonEpisodeMatch[2].padStart(2, '0');
        return `S${season}E${episode}`;
      }

      // season only e.g. season 2 or série S02
      const seasonOnlyMatch = source.match(/(?:season|série|serie|seri[áa]l)[\s\-\(]*s?(\d{1,2})/i);
      if (seasonOnlyMatch) {
        const season = seasonOnlyMatch[1].padStart(2, '0');
        return `S${season}`;
      }

      // episode only token e.g. episode 5
      const episodeOnlyMatch = source.match(/(?:episode|epizoda|ep\.?)[\s\-\(]*(\d{1,3})/i);
      if (episodeOnlyMatch) {
        const episode = episodeOnlyMatch[1].padStart(2, '0');
        return `E${episode}`;
      }

      // bare e##
      const bareE = source.match(/^e(\d{1,2})$/i);
      if (bareE) {
        return `E${bareE[1].padStart(2, '0')}`;
      }
    }

    // fallback default based on type
    if (typeKey === 'season') return 'S??';
    if (typeKey === 'episode') return 'E??';
    return '';
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
        <button type="button" class="cc-button cc-button-red cc-button-iconed cc-ratings-table-export">Export CSV</button>
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
    const exportBtn = overlay.querySelector('.cc-ratings-table-export');
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
        ? `<a class="cc-ratings-table-link-icon cc-script-link-btn" href="${escapeHtml$1(row.url)}" target="_blank" rel="noopener noreferrer" aria-label="Otevřít detail">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path d="M9 8H6.5C5.1 8 4 9.1 4 10.5V17.5C4 18.9 5.1 20 6.5 20H13.5C14.9 20 16 18.9 16 17.5V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M10 14L20 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M14 4H20V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>`
        : '';

      const escapedName = escapeHtml$1(row.name || 'Bez názvu');
      const nameLink = row.url
        ? `<a class="cc-ratings-table-name-link" href="${escapeHtml$1(row.url)}" target="_blank" rel="noopener noreferrer">${escapedName}</a>`
        : `<span class="cc-ratings-table-name-link">${escapedName}</span>`;

      return `
      <tr>
        <td>
          <div class="cc-ratings-table-name-row">
            <span class="cc-ratings-square ${escapeHtml$1(row.ratingSquareClass)}" aria-hidden="true"></span>
            ${nameLink}
            ${detailsButton}
            ${iconLink}
          </div>
        </td>
        <td class="cc-ratings-table-type">${escapeHtml$1(row.typeDisplay)}</td>
        <td class="cc-ratings-table-year">${Number.isFinite(row.yearValue) ? row.yearValue : '—'}</td>
        <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''}">${escapeHtml$1(row.ratingText)}</td>
        <td class="cc-ratings-table-date">${escapeHtml$1(row.date || '—')}</td>
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
      if (exportBtn) exportBtn.disabled = sorted.length === 0;
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
      console.debug('[CC] ratings modal opening, rows count', rows.length, modalTitle);
      // update export button availability (always enabled since rows supplied)
      if (exportBtn) exportBtn.disabled = rows.length === 0;
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

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        // generate CSV from currently visible rows
        const csvLines = [];
        // include required columns plus fullURL and movieID
        const header = ['Název', 'Typ', 'Rok', 'Hodnocení', 'Datum hodnocení', 'URL', 'movieID'];
        csvLines.push(header.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));
        state.visibleRows.forEach((row) => {
          // rating numeric: prefer ratingValue (NaN -> empty, 0 -> 0, etc.)
          let ratingNum = '';
          if (Number.isFinite(row.ratingValue)) {
            ratingNum = Math.round(row.ratingValue);
          } else if (row.ratingText && row.ratingText.toLowerCase().includes('odpad')) {
            ratingNum = 0;
          }

          const fields = [
            row.name,
            row.typeDisplay,
            row.yearValue,
            ratingNum,
            row.date,
            row.rawRecord?.fullUrl || '',
            row.rawRecord?.movieId || '',
          ];
          const escaped = fields.map((f) => {
            const val = f != null ? String(f) : '';
            return `"${val.replace(/"/g, '""')}"`;
          });
          csvLines.push(escaped.join(','));
        });
        const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'cc-ratings.csv';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

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
    console.debug('[CC] openRatingsTableModal called', { scope, callbacks });
    const getCurrentUserSlug = callbacks?.getCurrentUserSlug;
    const getMostFrequentUserSlug = callbacks?.getMostFrequentUserSlug;

    let userSlug = getCurrentUserSlug?.();
    console.debug('[CC] initial userSlug from callback', userSlug);
    if (!userSlug) {
      const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
      userSlug = getMostFrequentUserSlug?.(records);
      console.debug('[CC] fallback userSlug from records', userSlug);
    }
    if (!userSlug) {
      console.warn('[CC] openRatingsTableModal aborting, no userSlug');
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

  let normalListeners = [];

  // OPTIMIZATION: Only modify the specific menu button, preventing CSFD native scripts
  // from freezing the browser by trying to open all native dropdowns at once.
  function setHoverState(menuButton, isHovered) {
    if (isHovered) {
      menuButton.classList.add('hovered', 'active');
      document.body.classList.add('cc-menu-open');
    } else {
      menuButton.classList.remove('hovered', 'active');
      document.body.classList.remove('cc-menu-open');
    }
  }

  function clearNormalListeners() {
    normalListeners.forEach(({ el, type, handler }) => el.removeEventListener(type, handler));
    normalListeners = [];
  }

  function bindHoverHandlers(menuButton, timeoutState) {
    clearNormalListeners();

    // OPTIMIZATION: We only need to listen on the parent wrapper.
    // 'mouseenter' and 'mouseleave' naturally cover child elements like the dropdown.
    const onEnter = () => {
      clearTimeout(timeoutState.hideTimeout);
      timeoutState.hoverTimeout = setTimeout(() => {
        setHoverState(menuButton, true);
      }, HOVER_TOGGLE_DELAY_MS);
    };

    const onLeave = () => {
      clearTimeout(timeoutState.hoverTimeout);
      timeoutState.hideTimeout = setTimeout(() => {
        setHoverState(menuButton, false);
      }, HOVER_TOGGLE_DELAY_MS);
    };

    menuButton.addEventListener('mouseenter', onEnter);
    menuButton.addEventListener('mouseleave', onLeave);
    normalListeners.push({ el: menuButton, type: 'mouseenter', handler: onEnter });
    normalListeners.push({ el: menuButton, type: 'mouseleave', handler: onLeave });
  }

  function initializeSettingsMenuHover(menuButton) {
    if (typeof menuButton === 'string') {
      menuButton = document.querySelector(menuButton);
    }
    // Handle jQuery objects if they accidentally get passed
    if (!(menuButton instanceof Element) && menuButton && menuButton.jquery) {
      menuButton = menuButton[0];
    }

    if (!menuButton) return;

    let hoverTimeout;
    let hideTimeout;

    console.log('🟣 DEBUG:', DEBUG);
    {
      let controlsContainer = document.querySelector('.fancy-alert-controls');
      if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'fancy-alert-controls';
        Object.assign(controlsContainer.style, {
          position: 'fixed',
          top: '4px',
          right: '150px',
          zIndex: '9999',
          display: 'flex', // Fixed invalid 'cc-flex'
          alignItems: 'center',
          background: 'rgba(255,255,255,0.95)',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '8px 16px',
        });
        document.body.appendChild(controlsContainer);
      }

      controlsContainer.innerHTML = '';

      const checkboxLabel = document.createElement('label');
      Object.assign(checkboxLabel.style, {
        display: 'inline-flex',
        alignItems: 'center',
        marginRight: '10px',
        cursor: 'pointer',
      });
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

      const menuLink = menuButton.querySelector('.csfd-compare-menu');

      function debugClickHandler(e) {
        e.stopPropagation();
        const isActive = menuButton.classList.contains('active');
        setHoverState(menuButton, !isActive);
      }

      function enableDebugHover() {
        clearNormalListeners();
        setHoverState(menuButton, true);
        if (menuLink) {
          menuLink.addEventListener('click', debugClickHandler);
        }
      }

      function enableNormalHover() {
        if (menuLink) {
          menuLink.removeEventListener('click', debugClickHandler);
        }
        setHoverState(menuButton, false);
        bindHoverHandlers(menuButton, {
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

  let infoToastTimeoutId;
  const PROFILE_LINK_SELECTOR =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';
  const MANAGED_LOCAL_STORAGE_PREFIXES = ['cc_', 'CSFD-Compare'];

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function getBoolSetting(key, defaultValue = true) {
    const value = localStorage.getItem(key);
    return value === null ? defaultValue : value === 'true';
  }

  function getProfileLinkElement() {
    return document.querySelector(PROFILE_LINK_SELECTOR);
  }

  function isUserLoggedIn() {
    return Boolean(getProfileLinkElement());
  }

  function getCurrentUserSlug() {
    const match = getProfileLinkElement()
      ?.getAttribute('href')
      ?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
  }

  function getMostFrequentUserSlug(records) {
    const counts = new Map();
    for (const record of records) {
      if (!record?.userSlug || !Number.isFinite(record?.movieId)) continue;
      counts.set(record.userSlug, (counts.get(record.userSlug) || 0) + 1);
    }

    let bestSlug,
      bestCount = -1;
    for (const [slug, count] of counts.entries()) {
      if (count > bestCount) {
        bestSlug = slug;
        bestCount = count;
      }
    }
    return bestSlug;
  }

  function showSettingsInfoToast(message) {
    let toastEl = document.querySelector('#cc-settings-info-toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'cc-settings-info-toast';
      Object.assign(toastEl.style, {
        position: 'fixed',
        left: '50%',
        top: '70px',
        transform: 'translateX(-50%)',
        zIndex: '10020',
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'rgba(40, 40, 40, 0.94)',
        color: '#fff',
        fontSize: '12px',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.28)',
        display: 'none',
      });
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    toastEl.style.display = 'block';

    clearTimeout(infoToastTimeoutId);
    infoToastTimeoutId = window.setTimeout(() => {
      toastEl.style.display = 'none';
    }, 1800);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getManagedLocalStorageEntries() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key === SETTINGSNAME ||
        MANAGED_LOCAL_STORAGE_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix.toLowerCase()))
      ) {
        entries.push({ key, value: localStorage.getItem(key) ?? '' });
      }
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }

  function formatLocalStorageValue(value, maxLength = 120) {
    const normalized = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
  }

  // ==========================================
  // MAIN INITIALIZATION
  // ==========================================

  // Creates a clone of the Version Info modal specifically for Image Previews
  function getOrCreateImageModal() {
    let overlay = document.getElementById('cc-image-preview-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'cc-image-preview-overlay';
    overlay.className = 'cc-version-info-overlay'; // Reuse exact CSS from version modal!

    overlay.innerHTML = `
    <div class="cc-version-info-modal" style="width: min(840px, 95vw); max-height: 90vh;">
      <div class="cc-version-info-head">
        <h3 id="cc-image-modal-title">Ukázka funkce</h3>
        <button type="button" class="cc-version-info-close" id="cc-image-modal-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-version-info-body" style="text-align: center; padding: 16px; display: flex; justify-content: center; align-items: center; background: #f4f4f4;">
        <img id="cc-image-modal-img" src="" alt="Ukázka" style="max-width: 100%; max-height: 75vh; object-fit: contain; border-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);" />
      </div>
    </div>
  `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#cc-image-modal-close');
    const img = overlay.querySelector('#cc-image-modal-img');

    const close = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => {
        img.src = '';
      }, 200); // clear image after fade out
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    return overlay;
  }

  async function addSettingsButton() {

    // 1. Create and Insert Button (Vanilla JS)
    const settingsButton = document.createElement('li');
    settingsButton.className = 'cc-menu-item';
    settingsButton.innerHTML = htmlContent;

    const dropdown = settingsButton.querySelector('.dropdown-content');
    if (dropdown) {
      const blockEvent = (e) => e.stopPropagation();

      // By using 'true' as the third argument (Capture Phase), we intercept the mouse
      // events at the very top level and destroy them BEFORE CSFD's heavy scripts
      // can see them and trigger the 800ms carousel lag.
      ['pointermove', 'mousemove', 'mouseover', 'mouseenter', 'wheel', 'touchmove'].forEach((evt) => {
        dropdown.addEventListener(evt, blockEvent, true);
      });
    }

    const headerBar = document.querySelector('.header-bar');
    if (headerBar) {
      const searchItem = headerBar.querySelector('li.item-search');
      const languageItem = headerBar.querySelector('li.user-language-switch');
      if (searchItem) searchItem.after(settingsButton);
      else if (languageItem) languageItem.before(settingsButton);
      else headerBar.prepend(settingsButton);
    }

    // 2. Initialize Sub-Components
    initializeVersionUi(settingsButton).catch(() => undefined);
    initializeRatingsLoader(settingsButton);
    initializeRatingsSync(settingsButton);

    // 3. Setup Toggles & DOM Elements
    const creatorPreviewGroup = settingsButton.querySelector('#cc-creator-preview-group');
    const creatorPreviewGroupBody = settingsButton.querySelector('#cc-creator-preview-group-body');
    const creatorPreviewGroupToggle = settingsButton.querySelector('#cc-creator-preview-group-toggle');

    // Generic Toggle Binder
    const toggles = [];
    function bindToggle(selector, storageKey, defaultValue, eventName, toastOn, toastOff, callback = null) {
      const element = settingsButton.querySelector(selector);
      if (!element) return;

      element.checked = getBoolSetting(storageKey, defaultValue);
      toggles.push({ element, storageKey, defaultValue }); // Store for reset logic

      element.addEventListener('change', () => {
        localStorage.setItem(storageKey, String(element.checked));
        if (eventName) window.dispatchEvent(new CustomEvent(eventName, { detail: { enabled: element.checked } }));
        if (toastOn && toastOff) showSettingsInfoToast(element.checked ? toastOn : toastOff);
        if (callback) callback();
      });
      return element;
    }

    // UI Syncer for Creator Previews
    const updateCreatorPreviewUI = () => {
      const enabled = getBoolSetting(CREATOR_PREVIEW_ENABLED_KEY, true);
      const showBirth = getBoolSetting(CREATOR_PREVIEW_SHOW_BIRTH_KEY, true);
      const showPhoto = getBoolSetting(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY, true);

      const birthToggle = settingsButton.querySelector('#cc-creator-preview-show-birth');
      const photoToggle = settingsButton.querySelector('#cc-creator-preview-show-photo-from');

      if (birthToggle) birthToggle.disabled = !enabled;
      if (photoToggle) photoToggle.disabled = !enabled;

      // ADD THIS: Visually disable the sub-menu container
      if (creatorPreviewGroupBody) {
        creatorPreviewGroupBody.classList.toggle('is-disabled', !enabled);
      }

      window.dispatchEvent(
        new CustomEvent('cc-creator-preview-toggled', { detail: { enabled, showBirth, showPhotoFrom: showPhoto } }),
      );
    };

    // Bind All Toggles
    bindToggle(
      '#cc-enable-gallery-image-links',
      GALLERY_IMAGE_LINKS_ENABLED_KEY,
      true,
      'cc-gallery-image-links-toggled',
      'Formáty obrázků v galerii zapnuty.',
      'Formáty obrázků v galerii vypnuty.',
    );
    bindToggle(
      '#cc-show-all-creator-tabs',
      SHOW_ALL_CREATOR_TABS_KEY,
      false,
      'cc-show-all-creator-tabs-toggled',
      'Všechny záložky tvůrce zobrazeny.',
      'Záložky tvůrce skryty.',
    );
    bindToggle(
      '#cc-enable-creator-preview',
      CREATOR_PREVIEW_ENABLED_KEY,
      true,
      null,
      'Náhledy tvůrců zapnuty.',
      'Náhledy tvůrců vypnuty.',
      updateCreatorPreviewUI,
    );
    bindToggle(
      '#cc-creator-preview-show-birth',
      CREATOR_PREVIEW_SHOW_BIRTH_KEY,
      true,
      null,
      'Datum narození v náhledu zapnuto.',
      'Datum narození v náhledu vypnuto.',
      updateCreatorPreviewUI,
    );
    bindToggle(
      '#cc-creator-preview-show-photo-from',
      CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
      true,
      null,
      '„Photo from“ v náhledu zapnuto.',
      '„Photo from“ v náhledu vypnuto.',
      updateCreatorPreviewUI,
    );

    bindToggle(
      '#cc-enable-clickable-header-boxes',
      CLICKABLE_HEADER_BOXES_KEY,
      false,
      'cc-clickable-header-boxes-toggled',
      'Klientní hlavičky jsou nyní celoplošně klikatelné.',
      'Klientní hlavičky již nejsou celoplošně klikatelné.',
    );
    bindToggle(
      '#cc-ratings-estimate',
      RATINGS_ESTIMATE_KEY,
      false,
      'cc-ratings-estimate-toggled',
      'Zobrazení odhadovaného % zapnuto.',
      'Zobrazení odhadovaného % vypnuto.',
    );
    bindToggle(
      '#cc-ratings-from-favorites',
      RATINGS_FROM_FAVORITES_KEY,
      false,
      'cc-ratings-from-favorites-toggled',
      'Průměr oblíbených zapnut.',
      'Průměr oblíbených vypnut.',
    );

    // hide reviews group elements
    const hideGroup = settingsButton.querySelector('#cc-hide-reviews-group');
    const hideGroupBody = settingsButton.querySelector('#cc-hide-reviews-group-body');
    const hideGroupToggle = settingsButton.querySelector('#cc-hide-reviews-group-toggle');
    const hideListInput = settingsButton.querySelector('#cc-hide-selected-reviews-list');
    const hideApplyBtn = settingsButton.querySelector('#cc-hide-reviews-apply');

    // UI updater for hide-reviews group
    const updateHideReviewsUI = () => {
      const enabled = getBoolSetting(HIDE_SELECTED_REVIEWS_KEY, false);
      if (hideListInput) hideListInput.disabled = !enabled;
      if (hideApplyBtn) hideApplyBtn.disabled = !enabled;

      // ADD THIS: Visually disable the sub-menu container
      if (hideGroupBody) {
        hideGroupBody.classList.toggle('is-disabled', !enabled);
      }
    };

    bindToggle(
      '#cc-add-ratings-date',
      ADD_RATINGS_DATE_KEY,
      false,
      'cc-add-ratings-date-toggled',
      'Zobrazení data hodnocení zapnuto.',
      'Zobrazení data hodnocení vypnuto.',
    );
    bindToggle(
      '#cc-hide-selected-reviews',
      HIDE_SELECTED_REVIEWS_KEY,
      false,
      null,
      'Filtrování recenzí zapnuto.',
      'Filtrování recenzí vypnuto.',
      updateHideReviewsUI,
    );

    // collapse logic for hide reviews group
    const setHideGroupCollapsedState = (collapsed) => {
      if (hideGroup) hideGroup.classList.toggle('is-collapsed', collapsed);
      if (hideGroupToggle) hideGroupToggle.setAttribute('aria-expanded', String(!collapsed));
      if (hideGroupBody) hideGroupBody.hidden = collapsed;
      localStorage.setItem(HIDE_REVIEWS_SECTION_COLLAPSED_KEY, String(collapsed));
    };

    if (hideGroupToggle) {
      setHideGroupCollapsedState(getBoolSetting(HIDE_REVIEWS_SECTION_COLLAPSED_KEY, true));
      hideGroupToggle.addEventListener('click', () => {
        const currently = hideGroup?.classList.contains('is-collapsed');
        setHideGroupCollapsedState(!currently);
      });
    }

    const applyHideList = () => {
      if (!hideListInput) return;
      const list = hideListInput.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      localStorage.setItem(HIDE_SELECTED_REVIEWS_LIST_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('cc-hide-selected-reviews-updated'));
    };

    if (hideListInput) {
      try {
        const saved = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY);
        hideListInput.value = saved ? JSON.parse(saved).join(', ') : '';
      } catch (e) {
        hideListInput.value = '';
      }
      hideListInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyHideList();
        }
      });
      if (hideApplyBtn) hideApplyBtn.addEventListener('click', applyHideList);
    }

    // Initialize UI State
    updateCreatorPreviewUI();
    updateHideReviewsUI();

    // Collapsible Preview Section
    const setPreviewCollapsedState = (collapsed) => {
      if (creatorPreviewGroup) creatorPreviewGroup.classList.toggle('is-collapsed', collapsed);
      if (creatorPreviewGroupToggle) creatorPreviewGroupToggle.setAttribute('aria-expanded', String(!collapsed));
      if (creatorPreviewGroupBody) creatorPreviewGroupBody.hidden = collapsed;
      localStorage.setItem(CREATOR_PREVIEW_SECTION_COLLAPSED_KEY, String(collapsed));
    };

    if (creatorPreviewGroupToggle) {
      setPreviewCollapsedState(getBoolSetting(CREATOR_PREVIEW_SECTION_COLLAPSED_KEY, true));
      creatorPreviewGroupToggle.addEventListener('click', () => {
        const currentlyCollapsed = creatorPreviewGroup?.classList.contains('is-collapsed') ?? true;
        setPreviewCollapsedState(!currentlyCollapsed);
      });
    }

    // 4. Maintenance Buttons Logic
    const syncControlsFromStorage = () => {
      toggles.forEach((t) => (t.element.checked = getBoolSetting(t.storageKey, t.defaultValue)));
      updateCreatorPreviewUI();
    };

    settingsButton.querySelector('#cc-maint-reset-btn')?.addEventListener('click', () => {
      localStorage.removeItem(GALLERY_IMAGE_LINKS_ENABLED_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_ENABLED_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY);
      syncControlsFromStorage();
      window.dispatchEvent(new CustomEvent('cc-gallery-image-links-toggled', { detail: { enabled: true } }));
      showSettingsInfoToast('Nastavení náhledů bylo vráceno na výchozí hodnoty.');
    });

    settingsButton.querySelector('#cc-maint-clear-db-btn')?.addEventListener('click', async () => {
      try {
        await deleteIndexedDB(INDEXED_DB_NAME);
        invalidateRatingsModalCache();
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
        showSettingsInfoToast('IndexedDB byla smazána.');
      } catch (error) {
        console.error('[CC] Failed to delete IndexedDB:', error);
        showSettingsInfoToast('Smazání DB selhalo.');
      }
    });

    // Local Storage Modal Logic
    let localStorageModal;
    const ensureLocalStorageModal = () => {
      if (localStorageModal) return localStorageModal;

      const overlay = document.createElement('div');
      overlay.className = 'cc-lc-modal-overlay';
      overlay.hidden = true;
      overlay.innerHTML = `
      <div class="cc-lc-modal" role="dialog" aria-modal="true" aria-label="Správa LocalStorage">
        <div class="cc-lc-modal-head">
          <h3>Správa LocalStorage</h3>
          <button type="button" class="cc-lc-modal-close" aria-label="Zavřít">×</button>
        </div>
        <div class="cc-lc-modal-help">Klíče používané CSFD-Compare (cc_*, CSFD-Compare*).</div>
        <div class="cc-lc-modal-body">
          <table class="cc-lc-table">
            <thead><tr><th>Klíč</th><th>Hodnota</th><th>Akce</th></tr></thead>
            <tbody id="cc-lc-table-body"></tbody>
          </table>
        </div>
        <div class="cc-lc-modal-actions">
          <button type="button" class="cc-maint-btn" id="cc-lc-delete-all-btn">Smazat vše</button>
          <button type="button" class="cc-maint-btn" id="cc-lc-close-btn">Zavřít</button>
        </div>
      </div>`;

      const closeModal = () => {
        overlay.classList.remove('is-open');
        overlay.hidden = true;
      };
      const refreshTable = () => {
        const tableBody = overlay.querySelector('#cc-lc-table-body');
        if (!tableBody) return;
        const entries = getManagedLocalStorageEntries();
        if (!entries.length) {
          tableBody.innerHTML = '<tr><td colspan="3" class="cc-lc-table-empty">Žádné relevantní položky.</td></tr>';
          return;
        }
        tableBody.innerHTML = entries
          .map(
            ({ key, value }) => `
        <tr>
          <td class="cc-lc-key" title="${escapeHtml(key)}">${escapeHtml(key)}</td>
          <td class="cc-lc-value" title="${escapeHtml(String(value))}">${escapeHtml(formatLocalStorageValue(value))}</td>
          <td class="cc-lc-action"><button type="button" class="cc-maint-btn cc-lc-delete-one" data-key="${escapeHtml(key)}">Smazat</button></td>
        </tr>`,
          )
          .join('');
      };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
      overlay.querySelector('.cc-lc-modal-close')?.addEventListener('click', closeModal);
      overlay.querySelector('#cc-lc-close-btn')?.addEventListener('click', closeModal);

      overlay.querySelector('#cc-lc-delete-all-btn')?.addEventListener('click', () => {
        getManagedLocalStorageEntries().forEach((entry) => localStorage.removeItem(entry.key));
        syncControlsFromStorage();
        window.dispatchEvent(
          new CustomEvent('cc-gallery-image-links-toggled', {
            detail: { enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true) },
          }),
        );
        refreshTable();
        showSettingsInfoToast('Relevantní LocalStorage klíče byly smazány.');
      });

      overlay.querySelector('#cc-lc-table-body')?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.cc-lc-delete-one');
        if (!deleteBtn || !deleteBtn.dataset.key) return;
        localStorage.removeItem(deleteBtn.dataset.key);
        syncControlsFromStorage();
        window.dispatchEvent(
          new CustomEvent('cc-gallery-image-links-toggled', {
            detail: { enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true) },
          }),
        );
        refreshTable();
        showSettingsInfoToast(`Smazán klíč: ${deleteBtn.dataset.key}`);
      });

      overlay.addEventListener('cc-lc-open', () => {
        refreshTable();
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('is-open'));
      });

      document.body.appendChild(overlay);
      return (localStorageModal = overlay);
    };

    settingsButton.querySelector('#cc-maint-clear-lc-btn')?.addEventListener('click', () => {
      ensureLocalStorageModal().dispatchEvent(new CustomEvent('cc-lc-open'));
    });

    // 5. Header Bar Actions (Sync, Info, Badges)
    settingsButton.querySelector('#cc-sync-cloud-btn')?.addEventListener(
      'click',
      (e) => {
        if (isUserLoggedIn()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        showSettingsInfoToast('Cloud sync je dostupný až po přihlášení.');
      },
      true,
    );

    settingsButton.querySelector('#cc-version-info-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      openVersionInfoModal(settingsButton).catch((err) => console.error('[CC] Failed to open version info modal:', err));
    });

    const ratingsModalOptions = { getCurrentUserSlug, getMostFrequentUserSlug };
    const setupBadge = (id, type) => {
      const badge = settingsButton.querySelector(id);
      if (!badge) return;
      badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');

      const handler = (e) => {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keydown') e.preventDefault();

        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, type, ratingsModalOptions).catch((err) =>
          console.error(`[CC] Failed to open ${type} ratings table:`, err),
        );
      };

      badge.addEventListener('click', handler);
      badge.addEventListener('keydown', handler);
    };

    setupBadge('#cc-badge-red', 'direct');
    setupBadge('#cc-badge-black', 'computed');

    // Badges Refresh Logic
    const badgeRefreshOptions = { isUserLoggedIn, getCurrentUserSlug, getMostFrequentUserSlug };
    const refreshBadgesSafely = () =>
      refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((err) =>
        console.error('[CC] Failed to refresh badges:', err),
      );

    refreshBadgesSafely();
    window.setTimeout(refreshBadgesSafely, 1200);

    window.addEventListener('cc-ratings-updated', () => {
      invalidateRatingsModalCache();
      refreshBadgesSafely();
    });

    // --- IMAGE PREVIEW MODAL LOGIC ---
    settingsButton.querySelectorAll('.cc-image-icon-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevents CSFD search/sliders from reacting

        const url = btn.getAttribute('data-image-url');
        const titleText =
          btn.closest('.cc-setting-row')?.querySelector('.cc-setting-label')?.textContent || 'Ukázka funkce';

        if (url) {
          const modal = getOrCreateImageModal();
          modal.querySelector('#cc-image-modal-title').textContent = titleText;
          modal.querySelector('#cc-image-modal-img').src = url;

          // Show the modal
          modal.classList.add('is-open');
        }
      });
    });
    // use the raw DOM element; helper no longer depends on jQuery
    initializeSettingsMenuHover(settingsButton);
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

  // ==========================================
  // 1. DATA STRUCTURES (TYPES)
  // ==========================================

  /**
   * @typedef {Object} CreatorPreviewData
   * @property {string|undefined} imageUrl - Normalized URL of the best available photo.
   * @property {string|undefined} birthInfo - Extracted birth date and location text.
   * @property {string|undefined} deathAgeInfo - Age at death, if applicable.
   * @property {string|undefined} birthFlagUrl - URL to the country flag image.
   * @property {string|undefined} birthFlagAlt - Alt text for the country flag.
   * @property {string|undefined} photoFromInfo - Source/copyright info for the photo.
   * @property {'movie'|'copyright'|undefined} photoFromKind - Type of photo source.
   * @property {string|undefined} photoFromYear - Year the photo was taken (if from a movie).
   */

  // ==========================================
  // 2. CONFIGURATION & STATE
  // ==========================================

  const CREATOR_LINK_SELECTOR = 'a[href*="/tvurce/"], a[href*="/tvorca/"]';
  const MAX_CREATORS_IN_CACHE = 24;
  const MAX_IMAGE_CANDIDATES = 6;
  const PREVIEW_OFFSET_X = 18;
  const PREVIEW_OFFSET_Y = 18;

  // DOM Elements
  let previewRoot;
  let previewImage;
  let previewName;
  let previewNameText;
  let previewNameFlag;
  let previewMeta;
  let previewMetaBirth;
  let previewMetaBirthText;
  let previewMetaBirthAgeInline;
  let previewMetaAge;
  let previewMetaPhotoFrom;
  let previewMetaPhotoSource;
  let previewMetaPhotoYear;

  // Interaction State
  let activeAnchor;
  let pointerX = 0;
  let pointerY = 0;
  let hoverToken = 0; // Used to prevent race conditions when hovering multiple links quickly

  // Network & Data Caches
  const creatorPreviewCache = new Map();
  const creatorCacheOrder = [];
  const creatorFetchPromises = new Map();
  const failedImageUrls = new Set();
  const imageProbeResultCache = new Map();

  // ==========================================
  // 3. UTILITIES & PREFERENCES
  // ==========================================

  /** @returns {boolean} Whether the preview feature is enabled in local storage. */
  function isCreatorPreviewEnabled() {
    const persistedValue = localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY);
    return persistedValue === null ? true : persistedValue === 'true';
  }

  /** @returns {boolean} Whether birth information should be shown. */
  function isCreatorPreviewBirthVisible() {
    const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY);
    return persistedValue === null ? true : persistedValue === 'true';
  }

  /** @returns {boolean} Whether photo source information should be shown. */
  function isCreatorPreviewPhotoFromVisible() {
    const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY);
    return persistedValue === null ? true : persistedValue === 'true';
  }

  /**
   * Collapses multiple spaces into a single space and trims the string.
   * @param {string|null|undefined} value
   * @returns {string}
   */
  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ==========================================
  // 4. DOM MANAGEMENT & UI
  // ==========================================

  /**
   * Bootstraps the DOM elements required for the preview card.
   * Only runs once; exits early if the root element already exists.
   */
  function ensurePreviewElements() {
    if (previewRoot) {
      return;
    }

    previewRoot = document.createElement('div');
    previewRoot.className = 'cc-creator-preview';
    previewRoot.hidden = true;

    const card = document.createElement('div');
    card.className = 'cc-creator-preview-card';

    previewImage = document.createElement('img');
    previewImage.className = 'cc-creator-preview-image';
    previewImage.alt = '';
    previewImage.loading = 'lazy';

    previewName = document.createElement('div');
    previewName.className = 'cc-creator-preview-name';

    previewNameText = document.createElement('span');

    previewNameFlag = document.createElement('img');
    previewNameFlag.className = 'cc-creator-preview-name-flag';
    previewNameFlag.alt = '';
    previewNameFlag.hidden = true;

    previewName.appendChild(previewNameText);
    previewName.appendChild(previewNameFlag);

    previewMeta = document.createElement('div');
    previewMeta.className = 'cc-creator-preview-meta';

    previewMetaBirth = document.createElement('div');
    previewMetaBirth.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-birth';

    previewMetaBirthText = document.createElement('span');
    previewMetaBirthAgeInline = document.createElement('span');
    previewMetaBirthAgeInline.className = 'cc-creator-preview-meta-birth-age-inline';

    previewMetaBirth.appendChild(previewMetaBirthText);
    previewMetaBirth.appendChild(previewMetaBirthAgeInline);

    previewMetaAge = document.createElement('div');
    previewMetaAge.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-age';

    previewMetaPhotoFrom = document.createElement('div');
    previewMetaPhotoFrom.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-photo';

    previewMetaPhotoSource = document.createElement('span');
    previewMetaPhotoSource.className = 'cc-creator-preview-meta-photo-source';

    previewMetaPhotoYear = document.createElement('span');
    previewMetaPhotoYear.className = 'cc-creator-preview-meta-photo-year';

    previewMetaPhotoFrom.appendChild(previewMetaPhotoSource);
    previewMetaPhotoFrom.appendChild(previewMetaPhotoYear);

    previewMeta.appendChild(previewMetaBirth);
    previewMeta.appendChild(previewMetaAge);
    previewMeta.appendChild(previewMetaPhotoFrom);

    card.appendChild(previewImage);
    card.appendChild(previewName);
    card.appendChild(previewMeta);
    previewRoot.appendChild(card);
    document.body.appendChild(previewRoot);
  }

  /** Hides the preview card and cleans up state classes. */
  function hidePreview() {
    if (!previewRoot) {
      return;
    }

    previewRoot.hidden = true;
    previewRoot.classList.remove('is-visible');
    previewRoot.classList.remove('is-no-image');
  }

  /**
   * Calculates and applies the X/Y position of the preview card relative to the cursor.
   * Keeps the card bounded within the viewport margins.
   */
  function positionPreview() {
    if (!previewRoot || previewRoot.hidden) {
      return;
    }

    const margin = 10; // Distance from the edge of the viewport
    const rect = previewRoot.getBoundingClientRect();
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);

    const desiredX = pointerX + PREVIEW_OFFSET_X;
    const desiredY = pointerY + PREVIEW_OFFSET_Y;

    const x = Math.min(maxX, Math.max(margin, desiredX));
    const y = Math.min(maxY, Math.max(margin, desiredY));

    previewRoot.style.left = `${x}px`;
    previewRoot.style.top = `${y}px`;
  }

  // ==========================================
  // 5. URL & CACHE MANAGEMENT
  // ==========================================

  /**
   * Cleans up creator URLs to point to their overview page for consistent fetching.
   * Accounts for both CZ (.cz/prehled/) and SK (.sk/prehlad/) domains.
   * @param {string|null} href
   * @returns {string|undefined} Normalized URL
   */
  function normalizeCreatorUrl(href) {
    if (!href) {
      return undefined;
    }

    try {
      const url = new URL(href, location.origin);
      url.search = '';
      url.hash = '';
      // Matches patterns like /tvurce/123-john-doe/
      const pathname = url.pathname.match(/^\/(tvurce|tvorca)\/\d+-[^/]+\//i);
      if (!pathname) {
        return undefined;
      }

      const overviewSegment = location.hostname.endsWith('.sk') ? 'prehlad' : 'prehled';
      url.pathname = `${pathname[0]}${overviewSegment}/`;
      return url.toString();
    } catch {
      return undefined;
    }
  }

  /**
   * Extracts the unique ID/slug from a normalized creator URL.
   * @param {string} url
   * @returns {string|undefined}
   */
  function getCreatorSlugFromUrl(url) {
    const match = String(url || '').match(/\/(tvurce|tvorca)\/(\d+-[^/]+)\//i);
    return match ? match[2] : undefined;
  }

  /**
   * Saves fetched creator data to an LRU (Least Recently Used) cache.
   * @param {string} slug
   * @param {CreatorPreviewData} data
   */
  function upsertCreatorCache(slug, data) {
    if (!slug || !data) {
      return;
    }

    creatorPreviewCache.set(slug, {
      imageUrl: data.imageUrl,
      birthInfo: data.birthInfo,
      deathAgeInfo: data.deathAgeInfo,
      birthFlagUrl: data.birthFlagUrl,
      birthFlagAlt: data.birthFlagAlt,
      photoFromInfo: data.photoFromInfo,
      photoFromKind: data.photoFromKind,
      photoFromYear: data.photoFromYear,
    });

    // LRU Eviction logic
    const existingIndex = creatorCacheOrder.indexOf(slug);
    if (existingIndex >= 0) {
      creatorCacheOrder.splice(existingIndex, 1);
    }
    creatorCacheOrder.push(slug);

    while (creatorCacheOrder.length > MAX_CREATORS_IN_CACHE) {
      const oldest = creatorCacheOrder.shift();
      if (oldest) {
        creatorPreviewCache.delete(oldest);
      }
    }
  }

  /**
   * Parses a standard HTML srcset attribute into an array of individual URLs.
   * @param {string|null} srcset
   * @returns {string[]}
   */
  function extractUrlsFromSrcset(srcset) {
    if (!srcset) {
      return [];
    }

    return srcset
      .split(',')
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  /**
   * @param {string} rawUrl
   * @returns {string|undefined}
   */
  function normalizeImageUrl(rawUrl) {
    if (!rawUrl) {
      return undefined;
    }

    try {
      return new URL(rawUrl, location.origin).toString();
    } catch {
      return undefined;
    }
  }

  // ==========================================
  // 6. HTML PARSING & SCRAPING
  // ==========================================

  /**
   * Scores an image URL based on its dimensions, preferring sizes closest to 100x132.
   * Lower score is better.
   * @param {string} url
   * @returns {number}
   */
  function getImageSizeScore(url) {
    if (!url) {
      return 9999;
    }

    // Matches explicitly defined width/height in URL (e.g., /w100h132crop/)
    const preciseMatch = url.match(/\/w(\d+)h(\d+)(?:crop)?\//i);
    if (preciseMatch) {
      const width = Number.parseInt(preciseMatch[1], 10);
      const height = Number.parseInt(preciseMatch[2], 10);
      return Math.abs(width - 100) + Math.abs(height - 132);
    }

    // Matches width-only parameters (e.g., /w100/)
    const widthMatch = url.match(/\/w(\d+)(?:h\d+)?\//i);
    if (widthMatch) {
      const width = Number.parseInt(widthMatch[1], 10);
      return Math.abs(width - 100) + 120; // +120 penalty for missing height
    }

    return 2000; // Base penalty for unrecognizable sizes
  }

  /**
   * Strips resizing parameters from an image URL to get the full-res original.
   * @param {string} url
   * @returns {string|undefined}
   */
  function toOriginalVariant(url) {
    if (!url) {
      return undefined;
    }
    return url.replace(/\/cache\/resized\/w\d+h\d+(?:crop)?\//i, '/').replace(/\/cache\/resized\/w\d+\//i, '/');
  }

  /**
   * Scrapes the DOM for all potential creator profile images, including fallbacks (OG/Twitter).
   * @param {Document} doc - The parsed HTML document of the creator's page.
   * @returns {string[]} Sorted array of image candidates.
   */
  function pickCreatorImageCandidates(doc) {
    const candidates = [];
    const seen = new Set();

    const pushCandidate = (candidateUrl) => {
      const normalized = normalizeImageUrl(candidateUrl);
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      candidates.push(normalized);

      const originalVariant = normalizeImageUrl(toOriginalVariant(normalized));
      if (originalVariant && !seen.has(originalVariant)) {
        seen.add(originalVariant);
        candidates.push(originalVariant);
      }
    };

    const profileImage =
      doc.querySelector('.creator-profile-header figure img, .creator-profile figure img') ||
      doc.querySelector(
        '.creator-profile-header img[src*="/creator/photos/"], .creator-profile img[src*="/creator/photos/"]',
      );

    if (profileImage) {
      pushCandidate(profileImage.getAttribute('src'));
      extractUrlsFromSrcset(profileImage.getAttribute('srcset')).forEach(pushCandidate);

      const sourceUrls = Array.from(profileImage.closest('picture')?.querySelectorAll('source') || []).flatMap((source) =>
        extractUrlsFromSrcset(source.getAttribute('srcset')),
      );
      sourceUrls.forEach(pushCandidate);
    }

    pushCandidate(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'));
    pushCandidate(doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content'));

    return candidates
      .filter((url) => /\/creator\//i.test(url)) // Ensure it's actually a creator image
      .sort((a, b) => getImageSizeScore(a) - getImageSizeScore(b))
      .slice(0, MAX_IMAGE_CANDIDATES);
  }

  /**
   * Removes whitespace from a date string (e.g., "1. 1. 2000" -> "1.1.2000").
   * @param {string} value
   * @returns {string}
   */
  function normalizeDateToken(value) {
    return normalizeText(value).replace(/\s*/g, '');
  }

  /**
   * Attempts to locate and parse a standard European date format from a text node.
   * @param {Element|undefined} paragraph
   * @returns {string|undefined}
   */
  function extractDateFromParagraph(paragraph) {
    if (!paragraph) {
      return undefined;
    }

    const line = normalizeText(paragraph.textContent || '');
    if (!line) {
      return undefined;
    }

    // Matches formats like "1.1.2000" or "01. 12. 1995"
    const dateMatch = line.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/);
    if (dateMatch) {
      return normalizeDateToken(dateMatch[1]);
    }

    return undefined;
  }

  /**
   * Computes a person's current age based on their birth date.
   * @param {string} birthInfo
   * @returns {string|undefined} Age string (e.g., "45 let")
   */
  function calculateCurrentAgeFromBirthInfo(birthInfo) {
    const line = normalizeText(birthInfo || '');
    const match = line.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!match) {
      return undefined;
    }

    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
      return undefined;
    }

    const now = new Date();
    let age = now.getFullYear() - year;
    const hadBirthdayThisYear = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
    if (!hadBirthdayThisYear) {
      age -= 1;
    }

    return age >= 0 ? `${age} let` : undefined;
  }

  /**
   * Scrapes birth date, death date, and nationality flag from the creator's profile page.
   * @param {Document} doc
   * @returns {Partial<CreatorPreviewData>}
   */
  function extractLifeInfo(doc) {
    const detailsParagraphs = Array.from(doc.querySelectorAll('.creator-profile-details p'));
    if (detailsParagraphs.length === 0) {
      return {
        birthInfo: undefined,
        deathAgeInfo: undefined,
        birthFlagUrl: undefined,
        birthFlagAlt: undefined,
      };
    }

    // Look for language-specific keywords for birth and death
    const birthParagraph =
      detailsParagraphs.find((paragraph) => /\bnar\.|\bnaroden|\bborn\b/i.test(normalizeText(paragraph.textContent))) ||
      detailsParagraphs[0];

    const deathParagraph = detailsParagraphs.find((paragraph) =>
      /\bzem\.|\bzomr|\bdied\b/i.test(normalizeText(paragraph.textContent)),
    );

    const birthDate = extractDateFromParagraph(birthParagraph);
    const deathDate = extractDateFromParagraph(deathParagraph);
    const deathAge = normalizeText(deathParagraph?.querySelector('.info')?.textContent || '').replace(/^\((.*)\)$/, '$1');

    let birthInfo;
    if (birthDate && deathDate) {
      birthInfo = `${birthDate} → ${deathDate}`;
    } else if (birthDate) {
      birthInfo = `nar. ${birthDate}`;
    } else {
      // Fallback: Clone the node and remove the location tag to just get the text
      const birthClone = birthParagraph?.cloneNode(true);
      if (birthClone) {
        birthClone.querySelector('.info-place')?.remove();
        birthInfo = normalizeText(birthClone.textContent || '');
      }
    }

    const flagImage =
      birthParagraph?.querySelector('.info-place img.flag') ||
      detailsParagraphs[0]?.querySelector('.info-place img.flag') ||
      doc.querySelector('.creator-profile-details .info-place img.flag');

    return {
      birthInfo,
      deathAgeInfo: deathAge || undefined,
      birthFlagUrl: normalizeImageUrl(flagImage?.getAttribute('src')),
      birthFlagAlt: normalizeText(flagImage?.getAttribute('title') || flagImage?.getAttribute('alt') || ''),
    };
  }

  /**
   * Scrapes metadata about where the profile photo came from (e.g., copyright or movie still).
   * @param {Document} doc
   * @returns {Partial<CreatorPreviewData>}
   */
  function extractPhotoFromInfo(doc) {
    const footer = doc.querySelector('.creator-profile-footer');
    if (!footer) {
      return {
        photoFromInfo: undefined,
        photoFromKind: undefined,
        photoFromYear: undefined,
      };
    }

    const movieAnchor = footer.querySelector('a.item-movie');
    if (movieAnchor) {
      const movieTitle = normalizeText(movieAnchor.textContent);
      const siblingYear =
        movieAnchor.nextElementSibling instanceof Element && movieAnchor.nextElementSibling.matches('.item-movie-rest')
          ? movieAnchor.nextElementSibling
          : undefined;
      const movieYear = normalizeText(
        footer.querySelector('.item-movie-rest')?.textContent || siblingYear?.textContent || '',
      );

      if (movieTitle) {
        return {
          photoFromInfo: movieTitle,
          photoFromKind: 'movie',
          photoFromYear: movieYear,
        };
      }
    }

    const sourceText = normalizeText(footer.querySelector('.item-text')?.textContent || '');
    if (!sourceText) {
      return {
        photoFromInfo: undefined,
        photoFromKind: undefined,
        photoFromYear: undefined,
      };
    }

    // Clean up typical copyright text noise
    let normalizedSource = sourceText.replace(/^(photo|foto)\s*/i, '').trim() || sourceText;
    normalizedSource = normalizedSource.replace(/^([©Ⓒ]|\(c\)|copyright)\s*/i, '').trim() || normalizedSource;
    return {
      photoFromInfo: normalizedSource,
      photoFromKind: 'copyright',
      photoFromYear: undefined,
    };
  }

  // ==========================================
  // 7. NETWORK & IMAGE VALIDATION
  // ==========================================

  /**
   * Pre-loads an image to verify it actually resolves and has valid dimensions.
   * Prevents rendering 1x1 tracking pixels or broken images.
   * @param {string} url
   * @param {number} timeoutMs
   * @returns {Promise<boolean>}
   */
  function probeImageUrl(url, timeoutMs = 5000) {
    if (!url) {
      return Promise.resolve(false);
    }

    if (failedImageUrls.has(url)) {
      return Promise.resolve(false);
    }

    if (imageProbeResultCache.has(url)) {
      return Promise.resolve(imageProbeResultCache.get(url) === true);
    }

    return new Promise((resolve) => {
      const probe = new Image();
      let done = false;

      const finish = (isValid) => {
        if (done) {
          return;
        }

        done = true;
        imageProbeResultCache.set(url, isValid);
        resolve(isValid);
      };

      const timeout = window.setTimeout(() => {
        finish(false);
      }, timeoutMs);

      probe.onload = () => {
        window.clearTimeout(timeout);
        const validDimensions = Number.isFinite(probe.naturalWidth) && Number.isFinite(probe.naturalHeight);
        // Reject images that are smaller than 8x8 (likely tracking pixels)
        finish(validDimensions && probe.naturalWidth > 8 && probe.naturalHeight > 8);
      };

      probe.onerror = () => {
        window.clearTimeout(timeout);
        finish(false);
      };

      probe.src = url;
    });
  }

  /**
   * Fetches the target creator page in the background and parses it for preview data.
   * @param {string} creatorUrl
   * @returns {Promise<CreatorPreviewData>}
   */
  async function fetchCreatorPreviewDataFromUrl(creatorUrl) {
    const response = await fetch(creatorUrl, {
      credentials: 'include',
      method: 'GET',
    });

    if (!response.ok) {
      return {
        imageUrl: undefined,
        birthInfo: undefined,
        deathAgeInfo: undefined,
        birthFlagUrl: undefined,
        birthFlagAlt: undefined,
        photoFromInfo: undefined,
        photoFromKind: undefined,
        photoFromYear: undefined,
      };
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imageCandidates = pickCreatorImageCandidates(doc);

    let validImageUrl;
    // Test candidate images one by one until a valid one is found
    for (const candidateUrl of imageCandidates) {
      const isValid = await probeImageUrl(candidateUrl);
      if (isValid) {
        validImageUrl = candidateUrl;
        break;
      }

      failedImageUrls.add(candidateUrl);
    }

    return {
      imageUrl: validImageUrl,
      ...extractLifeInfo(doc),
      ...extractPhotoFromInfo(doc),
    };
  }

  /**
   * Orchestrates the data fetching, checking the cache and resolving inflight requests.
   * @param {Element} anchorEl
   * @returns {Promise<CreatorPreviewData|undefined>}
   */
  async function getCreatorPreviewDataForLink(anchorEl) {
    const creatorUrl = normalizeCreatorUrl(anchorEl.getAttribute('href'));
    if (!creatorUrl) {
      return undefined;
    }

    const creatorSlug = getCreatorSlugFromUrl(creatorUrl);
    if (!creatorSlug) {
      return undefined;
    }

    if (creatorPreviewCache.has(creatorSlug)) {
      return creatorPreviewCache.get(creatorSlug);
    }

    // Prevent duplicate network requests if user hovers multiple times before resolution
    if (!creatorFetchPromises.has(creatorSlug)) {
      const fetchPromise = fetchCreatorPreviewDataFromUrl(creatorUrl)
        .catch(() => ({
          imageUrl: undefined,
          birthInfo: undefined,
          deathAgeInfo: undefined,
          birthFlagUrl: undefined,
          birthFlagAlt: undefined,
          photoFromInfo: undefined,
          photoFromKind: undefined,
          photoFromYear: undefined,
        }))
        .then((data) => {
          upsertCreatorCache(creatorSlug, data);
          return data;
        })
        .finally(() => {
          creatorFetchPromises.delete(creatorSlug);
        });

      creatorFetchPromises.set(creatorSlug, fetchPromise);
    }

    const inFlight = creatorFetchPromises.get(creatorSlug);
    return inFlight ? await inFlight : undefined;
  }

  // ==========================================
  // 8. RENDER CONTROLLERS
  // ==========================================

  /**
   * Updates the DOM elements for the text-based metadata (birth, age, photo source).
   * @param {CreatorPreviewData} data
   */
  function renderPreviewMeta(data) {
    if (
      !previewMeta ||
      !previewMetaBirth ||
      !previewMetaBirthText ||
      !previewMetaBirthAgeInline ||
      !previewMetaAge ||
      !previewMetaPhotoFrom ||
      !previewMetaPhotoSource ||
      !previewMetaPhotoYear
    ) {
      return;
    }

    const showBirth = isCreatorPreviewBirthVisible() && Boolean(data?.birthInfo);
    const liveAgeInfo = showBirth && !data?.deathAgeInfo ? calculateCurrentAgeFromBirthInfo(data?.birthInfo) : undefined;
    const deceasedAgeInfo = showBirth ? data?.deathAgeInfo : undefined;
    const showAgeLine = Boolean(deceasedAgeInfo);
    const showPhotoFrom = isCreatorPreviewPhotoFromVisible() && Boolean(data?.photoFromInfo);

    if (showBirth) {
      previewMetaBirthText.textContent = data.birthInfo;
      previewMetaBirthAgeInline.textContent = liveAgeInfo ? ` (${liveAgeInfo})` : '';
      previewMetaBirthAgeInline.hidden = !liveAgeInfo;
    } else {
      previewMetaBirthText.textContent = '';
      previewMetaBirthAgeInline.textContent = '';
      previewMetaBirthAgeInline.hidden = true;
    }
    previewMetaBirth.hidden = !showBirth;

    previewMetaAge.textContent = showAgeLine ? `(${deceasedAgeInfo})` : '';
    previewMetaAge.hidden = !showAgeLine;

    previewMetaPhotoFrom.classList.remove('is-movie', 'is-copyright');
    if (showPhotoFrom) {
      const kind = data?.photoFromKind === 'movie' ? 'movie' : 'copyright';
      previewMetaPhotoFrom.classList.add(kind === 'movie' ? 'is-movie' : 'is-copyright');
      previewMetaPhotoSource.textContent = data.photoFromInfo || '';
      previewMetaPhotoYear.textContent = kind === 'movie' ? normalizeText(data?.photoFromYear || '') : '';
      previewMetaPhotoYear.hidden = !(kind === 'movie' && Boolean(previewMetaPhotoYear.textContent));
    } else {
      previewMetaPhotoSource.textContent = '';
      previewMetaPhotoYear.textContent = '';
      previewMetaPhotoYear.hidden = true;
    }
    previewMetaPhotoFrom.hidden = !showPhotoFrom;

    previewMeta.hidden = !showBirth && !showPhotoFrom && !showAgeLine;
  }

  /**
   * Handles the fallback state when a creator has a profile but no valid photo.
   * @param {string} label
   * @param {CreatorPreviewData} data
   */
  function showNoImagePreview(label, data) {
    ensurePreviewElements();
    previewImage.removeAttribute('src');
    previewImage.alt = 'Bez fotografie';
    previewNameText.textContent = label;

    if (data?.birthFlagUrl) {
      previewNameFlag.src = data.birthFlagUrl;
      previewNameFlag.alt = data.birthFlagAlt || '';
      previewNameFlag.title = data.birthFlagAlt || '';
      previewNameFlag.hidden = false;
    } else {
      previewNameFlag.removeAttribute('src');
      previewNameFlag.alt = '';
      previewNameFlag.title = '';
      previewNameFlag.hidden = true;
    }

    renderPreviewMeta(data);
    previewRoot.hidden = false;
    previewRoot.classList.add('is-visible', 'is-no-image');
    positionPreview();
  }

  /**
   * Master rendering function. Fetches data and updates the full DOM tree for the preview.
   * @param {Element} anchorEl
   * @param {number} token - Validates that the user hasn't hovered away during the fetch.
   */
  async function showPreviewForAnchor(anchorEl, token) {
    ensurePreviewElements();

    if (!isCreatorPreviewEnabled()) {
      hidePreview();
      return;
    }

    const anchorText = anchorEl.textContent?.replace(/\s+/g, ' ').trim() || 'Tvůrce';
    const previewData = await getCreatorPreviewDataForLink(anchorEl);

    // Abort if the user moved on to another link while we were fetching
    if (token !== hoverToken || activeAnchor !== anchorEl) {
      return;
    }

    if (!previewData || !previewData.imageUrl) {
      showNoImagePreview(anchorText, previewData);
      return;
    }

    previewImage.src = previewData.imageUrl;
    previewImage.alt = anchorText;
    previewNameText.textContent = anchorText;

    if (previewData?.birthFlagUrl) {
      previewNameFlag.src = previewData.birthFlagUrl;
      previewNameFlag.alt = previewData.birthFlagAlt || '';
      previewNameFlag.title = previewData.birthFlagAlt || '';
      previewNameFlag.hidden = false;
    } else {
      previewNameFlag.removeAttribute('src');
      previewNameFlag.alt = '';
      previewNameFlag.title = '';
      previewNameFlag.hidden = true;
    }

    renderPreviewMeta(previewData);
    previewRoot.hidden = false;
    previewRoot.classList.remove('is-no-image');
    previewRoot.classList.add('is-visible');
    positionPreview();
  }

  // ==========================================
  // 9. EVENT HANDLERS & INITIALIZATION
  // ==========================================

  function handlePointerMove(event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
    positionPreview();
  }

  function handlePointerOver(event) {
    const anchorEl = event.target.closest(CREATOR_LINK_SELECTOR);
    if (!anchorEl) {
      return;
    }

    if (!isCreatorPreviewEnabled()) {
      return;
    }

    if (activeAnchor === anchorEl) {
      return;
    }

    activeAnchor = anchorEl;
    hoverToken += 1;
    showPreviewForAnchor(anchorEl, hoverToken).catch(() => {
      if (hoverToken && activeAnchor === anchorEl) {
        hidePreview();
      }
    });
  }

  function handlePointerOut(event) {
    if (!activeAnchor) {
      return;
    }

    // Don't hide if moving between nested elements inside the anchor
    const related = event.relatedTarget;
    if (related instanceof Element && activeAnchor.contains(related)) {
      return;
    }

    const leftFromActiveAnchor =
      event.target instanceof Element && event.target.closest(CREATOR_LINK_SELECTOR) === activeAnchor;
    if (!leftFromActiveAnchor) {
      return;
    }

    activeAnchor = undefined;
    hoverToken += 1;
    hidePreview();
  }

  /**
   * Call this function once on page load to bind global event listeners.
   */
  function initializeCreatorHoverPreview() {
    ensurePreviewElements();

    // Disable preview on creator detail pages (we don't want popups when hovering the tabs there)
    const onCreatorPage = /^\/(tvurce|tvorca)\/\d+-[^/]+\//i.test(location.pathname || '');
    if (onCreatorPage) {
      // Ensure preview is hidden and don't bind global handlers on creator pages
      hidePreview();
      return;
    }

    document.addEventListener('mousemove', handlePointerMove, true);
    document.addEventListener('mouseover', handlePointerOver, true);
    document.addEventListener('mouseout', handlePointerOut, true);

    window.addEventListener(
      'scroll',
      () => {
        positionPreview();
      },
      true,
    );

    // Listen for preference changes from the UI
    window.addEventListener('cc-creator-preview-toggled', () => {
      if (!isCreatorPreviewEnabled()) {
        hidePreview();
        activeAnchor = undefined;
        hoverToken += 1;
        return;
      }

      if (activeAnchor) {
        hoverToken += 1;
        showPreviewForAnchor(activeAnchor, hoverToken).catch(() => {
          hidePreview();
        });
      }
    });
  }

  (async () => {
    console.debug('🟣 Script started');
    await delay(20);

    // Initialise the CSFD helper and add the settings button in parallel so neither
    // blocks the other — the button DOM insertion now happens immediately inside
    // addSettingsButton(), so it appears as soon as jQuery can find the header bar.
    const csfd = new Csfd(document.querySelector('div.page-content'));
    console.debug('🟣 Adding main button + initialising CSFD-Compare in parallel');
    await Promise.all([addSettingsButton(), csfd.initialize()]);

    // The stored preference is honoured inside csfd.initialize(); no need
    // to invoke showAllCreatorTabs here unconditionally.  The toggle listener
    // below will react if the user changes the setting later.

    window.addEventListener('cc-show-all-creator-tabs-toggled', (ev) => {
      try {
        const enabled = !!ev?.detail?.enabled;
        if (enabled) {
          csfd.showAllCreatorTabs();
        } else {
          csfd.restoreCreatorTabs();
        }
      } catch (err) {
        console.error('[CC] show-all-creator-tabs toggle handler failed:', err);
      }
    });

    console.debug('🟣 Adding stars (first pass)');
    await csfd.addStars();
    await csfd.addGalleryImageFormatLinks();
    initializeCreatorHoverPreview();

    // CSFD loads some page sections asynchronously (Nette snippets, TV-tips table,
    // etc.).  Re-run addStars once the page is fully loaded and once more a bit
    // later to catch any sections that arrive after the load event.
    let addStarsRunning = false;
    let addStarsQueued = false;
    const rerunStars = () => {
      if (addStarsRunning) {
        addStarsQueued = true;
        return;
      }

      addStarsRunning = true;
      csfd
        .addStars()
        .catch((err) => console.error('[CC] addStars rerun failed:', err))
        .finally(() => {
          addStarsRunning = false;
          if (addStarsQueued) {
            addStarsQueued = false;
            window.setTimeout(rerunStars, 0);
          }
        });
    };
    if (document.readyState === 'complete') {
      rerunStars();
    } else {
      window.addEventListener('load', rerunStars, { once: true });
    }
    window.setTimeout(rerunStars, 1500);

    // Watch for content injected into the DOM after initial load (e.g. pagination
    // clicks, lazy-loaded boxes) and add stars to any new film links.
    // Debounced so that the star elements addStars() itself inserts don't trigger
    // an infinite loop of observer → addStars → insert → observer → ...
    let starObserverTimer = null;
    const mutationContainsFilmLink = (mutationList) => {
      for (const mutation of mutationList) {
        if (!mutation.addedNodes || mutation.addedNodes.length === 0) {
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches?.('a[href*="/film/"]') || node.querySelector?.('a[href*="/film/"]')) {
            return true;
          }
        }
      }

      return false;
    };

    const starObserver = new MutationObserver((mutationList) => {
      if (!mutationContainsFilmLink(mutationList)) {
        return;
      }

      if (starObserverTimer !== null) return;
      starObserverTimer = window.setTimeout(() => {
        starObserverTimer = null;
        rerunStars();
      }, 200);
    });
    const pageContent = document.querySelector('div.page-content') || document.body;
    starObserver.observe(pageContent, { childList: true, subtree: true });

    window.addEventListener('cc-gallery-image-links-toggled', () => {
      csfd.addGalleryImageFormatLinks().catch((error) => {
        console.error('[CC] Failed to toggle gallery image format links:', error);
      });
    });

    // wire up legacy‑style toggles
    window.addEventListener('cc-clickable-header-boxes-toggled', () => {
      csfd.clickableHeaderBoxes();
    });
    window.addEventListener('cc-ratings-estimate-toggled', () => {
      csfd.ratingsEstimate();
    });
    window.addEventListener('cc-ratings-from-favorites-toggled', (ev) => {
      if (ev?.detail?.enabled) {
        csfd.ratingsFromFavorites();
      } else {
        csfd.clearRatingsFromFavorites();
      }
    });
    window.addEventListener('cc-add-ratings-date-toggled', (ev) => {
      if (ev?.detail?.enabled) {
        csfd.addRatingsDate();
      } else {
        csfd.clearRatingsDate();
      }
    });
    window.addEventListener('cc-hide-selected-reviews-updated', () => {
      csfd.hideSelectedUserReviews();
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
