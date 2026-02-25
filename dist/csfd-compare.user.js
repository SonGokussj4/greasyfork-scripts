// ==UserScript==
// @name         ČSFD Compare V2
// @version      0.8.12
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

  const SHOW_RATINGS_KEY = 'cc_show_ratings';
  const SHOW_RATINGS_IN_REVIEWS_KEY = 'cc_show_ratings_in_reviews';
  const SHOW_RATINGS_SECTION_COLLAPSED_KEY = 'cc_show_ratings_section_collapsed';

  // feature flags copied from legacy script
  const CLICKABLE_HEADER_BOXES_KEY = 'cc_clickable_header_boxes';
  const RATINGS_ESTIMATE_KEY = 'cc_ratings_estimate';
  const RATINGS_FROM_FAVORITES_KEY = 'cc_ratings_from_favorites';
  const ADD_RATINGS_DATE_KEY = 'cc_add_ratings_date';
  const HIDE_SELECTED_REVIEWS_KEY = 'cc_hide_selected_user_reviews';
  const HIDE_SELECTED_REVIEWS_LIST_KEY = 'cc_hide_selected_user_reviews_list';
  const HIDE_REVIEWS_SECTION_COLLAPSED_KEY = 'cc_hide_reviews_section_collapsed';
  const CREATOR_PREVIEW_CACHE_HOURS_KEY = 'cc_creator_preview_cache_hours';

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

  // Escape HTML to prevent XSS from weird CSFD data
  const escapeHtml$3 = (str) =>
    String(str || '').replace(
      /[&<>"']/g,
      (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m],
    );

  const PROFILE_LINK_SELECTOR$3 =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

  // Consolidated blocked selectors for the film link candidate search
  const BLOCKED_LINK_CLOSEST_SELECTORS = [
    '.article-header-review-action',
    '.article-header-review',
    '.article-more',
    '.aside-movie-profile',
    '.box-more-bar',
    '.box-pagination',
    '.box-video',
    '.cc-rating-detail-overlay',
    '.cc-ratings-table-modal',
    '.cc-ratings-table-overlay',
    '.film-header-name-control',
    '.film-header-name',
    '.film-posters',
    '.gallery',
    '.label-simple',
    '.more',
    '.page-navigation',
    '.pages',
    '.pagination',
    '.paginator',
    '.reference.down.reply',
    '.span-more-small',
    '.tab-nav-item',
    '#cc-ratings-table-modal-overlay',
    '#snippet--boxButtonCollection',
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
      } catch (e) {
        // ignore silently
      }

      // Dynamic Filter Trigger (runs immediately and whenever the list is updated)
      this.hideSelectedUserReviews();
      window.addEventListener('cc-hide-selected-reviews-updated', () => {
        this.hideSelectedUserReviews();
      });

      // Initialize Home Panels Hiding
      this.initHomePanels();

      // LIVE DOM REFRESH LISTENER (Triggered by Settings Menu)
      window.addEventListener('cc-ratings-updated', async () => {
        // 1. Wipe old injected stars specific to your original code
        document.querySelectorAll('.cc-own-rating, .cc-my-rating-col, .cc-my-rating-cell').forEach((el) => el.remove());
        document.querySelectorAll('a[data-cc-star-added="true"]').forEach((el) => {
          delete el.dataset.ccStarAdded;
        });

        // 2. Reload your original DB logic
        const settings = await getSettings(SETTINGSNAME);
        this.stars = settings?.stars || {};
        await this.loadStarsFromIndexedDb();

        // 3. Redraw the stars
        await this.addStars();
      });
    }

    initHomePanels() {
      if (location.pathname !== '/' && location.pathname !== '') return;

      const syncVisibility = () => {
        const enabled = localStorage.getItem('cc_hide_home_panels') !== 'false';
        let hiddenList = [];
        try {
          hiddenList = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
        } catch (e) {}

        const headers = document.querySelectorAll(`
          .page-content .box-header > h2,
          .page-content .updated-box-header > h2,
          .page-content .updated-box-header > p,
          .updated-box-homepage-video,
          .page-content .updated-box-banner p,
          .page-content .updated-box-banner-mobile p
        `);

        headers.forEach((headerEl) => {
          const isVideoSlider = headerEl.classList.contains('updated-box-homepage-video');
          let title = '';

          if (isVideoSlider) {
            title = 'Trailery a Videa';
          } else {
            title = Array.from(headerEl.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent)
              .join('')
              .replace(/\s+/g, ' ')
              .trim();
          }

          if (!title || title.length > 60) return;

          let wrapper =
            headerEl.closest('.column') || headerEl.closest('.box') || headerEl.closest('.updated-box') || headerEl;

          if (wrapper.classList.contains('column') && wrapper.children.length > 1) {
            wrapper = headerEl.closest('.box') || headerEl.closest('.updated-box') || headerEl;
          }

          if (enabled && hiddenList.includes(title)) {
            wrapper.style.display = 'none';
          } else {
            wrapper.style.display = '';
          }

          if (isVideoSlider) {
            if (!headerEl.querySelector('.cc-hide-video-btn')) {
              const btn = document.createElement('button');
              btn.className = 'cc-hide-video-btn';
              btn.title = 'Skrýt Trailery';
              btn.textContent = 'skrýt trailery';

              btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let currentList = [];
                try {
                  currentList = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
                } catch (err) {}

                if (!currentList.includes(title)) {
                  currentList.push(title);
                  localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentList));
                  window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
                }
              };
              headerEl.appendChild(btn);
            }
          } else {
            if (!headerEl.querySelector('.cc-hide-panel-btn')) {
              const btn = document.createElement('button');
              btn.className = 'cc-hide-panel-btn';
              btn.title = 'Skrýt tento panel';
              btn.textContent = 'skrýt';

              btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let currentList = [];
                try {
                  currentList = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
                } catch (err) {}

                if (!currentList.includes(title)) {
                  currentList.push(title);
                  localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentList));
                  window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
                }
              };
              headerEl.appendChild(btn);
            }
          }
        });

        // GROUP & ROW COLLAPSE ENGINE
        document.querySelectorAll('.page-content .updated-box-group').forEach((group) => {
          const items = Array.from(group.querySelectorAll(':scope > section, :scope > div.updated-box'));
          if (items.length > 0) {
            const allHidden = items.every((item) => item.style.display === 'none');
            group.style.display = allHidden ? 'none' : '';
          }
        });

        document.querySelectorAll('.page-content .row').forEach((row) => {
          const cols = Array.from(row.querySelectorAll(':scope > .column'));
          if (cols.length === 0) return;

          const allHidden = cols.every((col) => {
            if (col.style.display === 'none') return true;
            const sections = Array.from(
              col.querySelectorAll(':scope > section, :scope > div.updated-box, :scope > div.updated-box-group'),
            );
            if (sections.length === 0) return false;

            return sections.every((sec) => sec.style.display === 'none');
          });

          row.style.display = allHidden ? 'none' : '';
        });
      };

      syncVisibility();
      window.addEventListener('cc-hidden-panels-updated', syncVisibility);
      setTimeout(syncVisibility, 500);
      setTimeout(syncVisibility, 1500);
    }

    showAllCreatorTabs() {
      try {
        const selectors = ['.creator-about nav.tab-nav', '.creator-profile nav.tab-nav', '.creator nav.tab-nav'].join(
          ',',
        );
        const navs = document.querySelectorAll(selectors);
        if (!navs.length) return;

        navs.forEach((nav) => {
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
          nav.style.paddingRight = '';
        });

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

    _parseRatingFromStars(starElem) {
      const clazz = starElem.className || '';
      const m = clazz.match(/stars-(\d)/);
      if (m) return parseInt(m[1], 10);
      if (clazz.includes('trash')) return 0;
      return NaN;
    }

    _getRatingColor(percent) {
      if (percent >= 70) return '#ba0305'; // Native CSFD red
      if (percent >= 30) return '#62829d'; // Native CSFD blue
      return '#545454'; // Native CSFD gray/black
    }

    clickableHeaderBoxes() {
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
      avgEl.textContent = `${average}%`;
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

      if (!avgEl.dataset.original) {
        avgEl.dataset.original = avgEl.textContent.trim();
      }
      const baseText = avgEl.dataset.original;

      avgEl.innerHTML = `
                <span style="position: absolute;">${baseText}</span>
                <span style="position: relative; top: 25px; font-size: 0.3em; font-weight: 600;">oblíbení: ${ratingAverage}%</span>
            `;
    }

    clearRatingsFromFavorites() {
      const avgEl = document.querySelector('.box-rating-container div.film-rating-average');
      if (!avgEl) return;
      if (avgEl.dataset.original) {
        avgEl.textContent = avgEl.dataset.original;
        delete avgEl.dataset.original;
      } else {
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
      const enabled = localStorage.getItem(HIDE_SELECTED_REVIEWS_KEY) === 'true';
      let list = [];

      if (enabled) {
        try {
          const raw = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY) || '[]';
          // Map to lowercase for case-insensitive matching
          list = JSON.parse(raw).map((s) => s.toLowerCase());
        } catch (e) {
          list = [];
        }
      }

      const headers = Array.from(document.querySelectorAll('.article-header-review-name'));
      headers.forEach((el) => {
        const title = el.querySelector('.user-title-name');
        if (!title) return;

        const name = title.textContent.trim().toLowerCase();
        const article = el.closest('article');

        if (article) {
          if (enabled && list.includes(name)) {
            article.style.display = 'none';
          } else {
            article.style.display = ''; // Restore visibility instantly
          }
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
          const tombstone = {
            ...existingRecord,
            rating: null,
            deleted: true, // This is the magic flag
            lastUpdate: new Date().toISOString(),
          };
          await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, tombstone);
          this.stars[pageInfo.movieId] = tombstone;
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
      const showInReviews = localStorage.getItem(SHOW_RATINGS_IN_REVIEWS_KEY) !== 'false';

      return Array.from(searchRoot.querySelectorAll('a[href*="/film/"]')).filter((link) => {
        const href = link.getAttribute('href') || '';

        if (
          !/\/\d+-/.test(href) ||
          /[?&](page|comment)=\d+/i.test(href) ||
          /[?&]modal=/i.test(href) ||
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

        // Check if ratings should be shown inside review texts
        if (!showInReviews && link.closest('span.comment')) {
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
      // Check if the user completely disabled showing ratings globally
      if (localStorage.getItem(SHOW_RATINGS_KEY) === 'false') return;

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
        if (!ratingRecord || ratingRecord.deleted === true) continue; // Skip rendering if deleted

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

  var css_248z$2 = ".fancy-alert{background:#fff;border-radius:8px;-webkit-box-shadow:0 5px 15px rgba(0,0,0,.3);box-shadow:0 5px 15px rgba(0,0,0,.3);max-width:400px;padding:25px;-webkit-transform:translateY(-20px);transform:translateY(-20px);-webkit-transition:-webkit-transform .3s ease;transition:-webkit-transform .3s ease;transition:transform .3s ease;transition:transform .3s ease,-webkit-transform .3s ease;width:90%}.modal-overlay.visible .fancy-alert{-webkit-transform:translateY(0);transform:translateY(0)}.alert-title{color:#2c3e50;font-size:1.5em;margin-bottom:15px}.alert-message{color:#34495e;line-height:1.6;margin-bottom:20px}.alert-button{background:#3498db;border:none;border-radius:4px;color:#fff;cursor:pointer;height:auto;padding:8px 20px;-webkit-transition:background .2s;transition:background .2s}.alert-button:hover{background:#2980b9}";
  styleInject(css_248z$2);

  var css_248z$1 = ".dropdown-content.cc-settings{background-color:#fff!important;border:1px solid #eaeaea;border-radius:0 0 10px 10px;border-top:none;-webkit-box-shadow:0 12px 34px rgba(0,0,0,.15),0 4px 12px rgba(0,0,0,.08);box-shadow:0 12px 34px rgba(0,0,0,.15),0 4px 12px rgba(0,0,0,.08);-webkit-box-sizing:border-box;box-sizing:border-box;margin-top:0;overflow:hidden;padding:0;right:0;top:100%;width:360px;z-index:10000!important}header.page-header.user-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings,header.page-header.user-not-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings{margin-top:-4px;right:8px;z-index:10000!important}.dropdown-content.cc-settings .cc-settings-section,.dropdown-content.cc-settings .dropdown-content-head{-webkit-box-sizing:border-box;box-sizing:border-box;margin:0;width:100%}.cc-settings-section .cc-settings-section-content{-webkit-box-sizing:border-box;box-sizing:border-box;padding:10px;width:100%}.cc-settings-section+.cc-settings-section .cc-settings-section-content{border-top:1px solid #efefef}.dropdown-content.cc-settings .left-head{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;gap:2px}.dropdown-content.cc-settings .left-head h2{line-height:1.1;margin:0}.cc-version-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px}.cc-version-link{color:#555;font-size:11px;line-height:1;opacity:.9;text-decoration:none}.cc-version-link:hover{color:#aa2c16;text-decoration:underline}.cc-version-status{background:#b8b8b8;border-radius:999px;display:inline-block;height:8px;opacity:0;-webkit-transition:opacity .18s ease;transition:opacity .18s ease;width:8px}.cc-version-status.is-visible{opacity:1}.cc-version-status.is-checking{background:#9ca3af}.cc-version-status.is-ok{background:#8f8f8f}.cc-version-status.is-error{background:#9b9b9b}.cc-version-status.is-update{background:#aa2c16;color:#fff;font-size:10px;font-weight:700;height:auto;line-height:1.3;padding:1px 6px;width:auto}.cc-head-right,.cc-head-tools{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-version-info-btn{font-weight:700}.cc-version-info-btn svg{height:15px;width:15px}.cc-sync-icon-btn{border:1px solid #cfcfcf;border-radius:8px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:28px;width:28px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;color:#202020;cursor:pointer;justify-content:center;padding:0;text-decoration:none;-webkit-transition:background-color .15s ease,border-color .15s ease,color .15s ease;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.cc-sync-icon-btn:focus-visible,.cc-sync-icon-btn:hover{background:#f3f3f3;border-color:#bdbdbd;color:#aa2c16;outline:none}.cc-sync-icon-btn.is-enabled{background:#cae8cd!important;border-color:#6bb475!important;color:#184e21!important}.cc-badge{background-color:#2c3e50;border-radius:6px;color:#fff;cursor:help;font-size:11.2px;font-size:.7rem;font-weight:700;line-height:1.4;padding:2px 6px}.cc-badge-red{background-color:#aa2c16}.cc-badge-black{background-color:#000}.cc-button{border:none;border-radius:7px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;height:auto;line-height:1.2;padding:6px 8px;-webkit-transition:background .2s,-webkit-transform .12s;transition:background .2s,-webkit-transform .12s;transition:background .2s,transform .12s;transition:background .2s,transform .12s,-webkit-transform .12s}.cc-button:hover{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-button:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-button-red{background-color:#aa2c16}.cc-button-red:hover{background-color:#8b2414}.cc-button-red:active{background-color:#7a1f12}.cc-button-black{background-color:#242424!important;color:#fff!important}#cc-load-computed-btn:hover,.cc-button-black:active,.cc-button-black:focus,.cc-button-black:hover{background-color:#000!important;-webkit-box-shadow:none!important;box-shadow:none!important;color:#fff!important;outline:none!important}.cc-button-iconed{gap:5px}.cc-button-icon,.cc-button-iconed{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-button-icon{height:12px;width:12px}.cc-settings-actions{display:grid;gap:5px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.cc-settings-actions .cc-button{min-width:0;width:100%}.cc-settings-actions .cc-button-iconed span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-section-title{color:#444;font-size:12px;font-weight:700;margin:0 0 8px}.cc-category-title{border-top:1px solid #f0f0f0;color:#1f4f8f;font-size:12px;font-weight:700;margin:14px 0 6px;padding-top:10px}.cc-category-title.cc-category-first{border-top:none;margin-top:0;padding-top:0}.cc-config-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;gap:5px}.cc-config-list>.cc-setting-row{padding-left:9px;padding-right:9px}.cc-setting-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-backface-visibility:hidden;backface-visibility:hidden;background-color:#fff;border-radius:4px;contain:layout;gap:8px;padding:2px 0;position:relative;-webkit-transform:translateZ(0);transform:translateZ(0);z-index:1}.cc-setting-row:hover{z-index:10}.cc-setting-label{color:#444;cursor:inherit;font-size:11px;font-weight:500;line-height:1.3}.cc-grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-switch{display:inline-block;height:16px;position:relative;width:28px;-ms-flex-negative:0;flex-shrink:0}.cc-switch input{opacity:0;pointer-events:none;position:absolute}.cc-switch-bg{background-color:#d4d4d4;border-radius:20px;bottom:0;cursor:pointer;left:0;right:0;top:0}.cc-switch-bg,.cc-switch-bg:before{position:absolute;-webkit-transition:.25s ease;transition:.25s ease}.cc-switch-bg:before{background-color:#fff;border-radius:50%;bottom:2px;-webkit-box-shadow:0 1px 2px rgba(0,0,0,.2);box-shadow:0 1px 2px rgba(0,0,0,.2);content:\"\";height:12px;left:2px;width:12px}.cc-switch input:checked+.cc-switch-bg{background-color:#aa2c16}.cc-switch input:focus-visible+.cc-switch-bg{-webkit-box-shadow:0 0 0 2px rgba(170,44,22,.4);box-shadow:0 0 0 2px rgba(170,44,22,.4)}.cc-switch input:checked+.cc-switch-bg:before{-webkit-transform:translateX(12px);transform:translateX(12px)}.cc-setting-group{background:#fdfdfd;border:1px solid #eaeaea;border-radius:6px;padding:4px 8px;-webkit-transition:background-color .2s;transition:background-color .2s}.cc-setting-group:hover{background:#f8f8f8}.cc-setting-collapse-trigger{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-flex:1;-ms-flex-positive:1;cursor:pointer;flex-grow:1;padding:4px 0;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.cc-setting-collapse-trigger:hover .cc-setting-label{color:#aa2c16}.cc-chevron{color:#888;height:14px;margin-left:auto;-webkit-transition:-webkit-transform .2s ease;transition:-webkit-transform .2s ease;transition:transform .2s ease;transition:transform .2s ease,-webkit-transform .2s ease;width:14px}.cc-setting-group.is-collapsed .cc-chevron{-webkit-transform:rotate(-90deg);transform:rotate(-90deg)}.cc-setting-sub{display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;padding-bottom:2px;padding-left:36px;padding-top:4px;-webkit-box-orient:vertical;-webkit-box-direction:normal;border-top:1px solid transparent;-ms-flex-direction:column;flex-direction:column;gap:6px;max-height:250px;opacity:1;overflow:hidden;-webkit-transform-origin:top;transform-origin:top;-webkit-transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s ease-out,padding .3s cubic-bezier(.4,0,.2,1);transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s ease-out,padding .3s cubic-bezier(.4,0,.2,1)}.cc-setting-group.is-collapsed .cc-setting-sub,.cc-setting-sub[hidden]{max-height:0;opacity:0;padding-bottom:0;padding-top:0;pointer-events:none}.cc-setting-sub.is-disabled{filter:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"filter\"><feColorMatrix type=\"matrix\" color-interpolation-filters=\"sRGB\" values=\"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0\" /></filter></svg>#filter');-webkit-filter:grayscale(100%);filter:grayscale(100%);opacity:.45;pointer-events:none}.cc-form-field{color:#444;display:grid;font-size:11px;gap:4px}.cc-form-field input[type=text]{border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:11px;line-height:1.2;padding:6px 8px;width:100%}.cc-sub-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:10px;margin-top:2px}.cc-button-small{font-size:11px;padding:4px 10px}.cc-setting-icons{display:-webkit-box;display:-ms-flexbox;display:flex;gap:6px;margin-left:auto}.cc-info-icon,.cc-setting-icons{-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-info-icon{color:#a0a0a0;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-pack:center;-ms-flex-pack:center;background:transparent;border:none;cursor:pointer;justify-content:center;padding:0;position:relative;-webkit-transition:color .2s ease;transition:color .2s ease}.cc-info-icon:hover{color:#aa2c16}.cc-info-icon:after{background-color:#242424;border-radius:6px;bottom:calc(100% + 8px);-webkit-box-shadow:0 4px 15px rgba(0,0,0,.2);box-shadow:0 4px 15px rgba(0,0,0,.2);color:#fff;content:attr(aria-label);font-size:11px;font-weight:500;line-height:1.4;max-width:240px;padding:8px 12px;right:-5px;text-align:left;white-space:pre-wrap;width:-webkit-max-content;width:-moz-max-content;width:max-content}.cc-info-icon:after,.cc-info-icon:before{opacity:0;pointer-events:none;position:absolute;-webkit-transform:translateY(4px);transform:translateY(4px);-webkit-transition:opacity .2s ease,-webkit-transform .2s ease;transition:opacity .2s ease,-webkit-transform .2s ease;transition:opacity .2s ease,transform .2s ease;transition:opacity .2s ease,transform .2s ease,-webkit-transform .2s ease;visibility:hidden}.cc-info-icon:before{border-color:#242424 transparent transparent;border-style:solid;border-width:5px 5px 0;bottom:calc(100% + 3px);content:\"\";right:2px}.cc-info-icon:hover:after,.cc-info-icon:hover:before{opacity:1;-webkit-transform:translateY(0);transform:translateY(0);visibility:visible}.cc-ratings-progress{background:#f9f9f9;border:1px solid #e4e4e4;border-radius:6px;margin:0;padding:8px}.cc-ratings-progress-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;color:#555;font-size:11px;gap:10px;margin-bottom:6px}#cc-ratings-progress-label{-webkit-box-flex:1;-ms-flex:1;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#cc-ratings-progress-count{-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;white-space:nowrap}.cc-ratings-progress-track{background:#e6e6e6;border-radius:999px;height:8px;overflow:hidden;width:100%}.cc-ratings-progress-bar{background:-webkit-gradient(linear,left top,right top,from(#aa2c16),to(#d13b1f));background:linear-gradient(90deg,#aa2c16,#d13b1f);border-radius:999px;height:100%;-webkit-transition:width .25s ease;transition:width .25s ease;width:0}.cc-ratings-progress-actions{display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:6px;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-ratings-cancel-link{background:transparent;border:0;border-radius:4px;color:#7a7a7a;cursor:pointer;font-size:11px;padding:2px 6px;text-decoration:none;-webkit-transition:background-color .15s ease,color .15s ease;transition:background-color .15s ease,color .15s ease}.cc-ratings-cancel-link:hover{background:rgba(0,0,0,.06);color:#444}.cc-maint-actions{display:-webkit-box;display:-ms-flexbox;display:flex;gap:6px}.cc-version-info-overlay{background:rgba(0,0,0,.36);display:none;inset:0;position:fixed;z-index:10030;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);-webkit-box-sizing:border-box;box-sizing:border-box;justify-content:center;padding:16px}.cc-version-info-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-version-info-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 20px 45px rgba(0,0,0,.25);box-shadow:0 20px 45px rgba(0,0,0,.25);color:#222;display:grid;grid-template-rows:auto minmax(0,1fr);max-height:80vh;overflow:hidden;width:min(560px,100%)}.cc-version-info-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-version-info-head h3{font-size:14px;font-weight:700;margin:0}.cc-version-info-close{background:transparent;border:0;border-radius:7px;color:#666;cursor:pointer;font-size:20px;height:28px;line-height:1;width:28px}.cc-version-info-close:hover{background:#f1f1f1;color:#222}.cc-version-info-body{font-size:12px;line-height:1.5;overflow:auto;padding:12px 14px}.cc-badge[role=button]{cursor:pointer}.cc-ratings-table-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.45);justify-content:center;padding:24px;z-index:10010}.cc-ratings-table-modal,.cc-ratings-table-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-ratings-table-modal{background:#fff;border-radius:12px;-webkit-box-shadow:0 16px 42px rgba(0,0,0,.28);box-shadow:0 16px 42px rgba(0,0,0,.28);max-height:calc(100vh - 48px);overflow:hidden;width:min(1080px,calc(100vw - 40px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-ratings-table-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:14px 16px}.cc-ratings-table-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-ratings-table-close:hover{background:#f1f1f1;color:#222}.cc-ratings-table-toolbar{-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #f0f0f0;gap:10px;justify-content:space-between;padding:10px 16px}.cc-ratings-table-search{border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;height:34px;line-height:34px;margin:0!important;padding:0 10px;width:min(440px,100%)}.cc-ratings-table-summary{color:#666;font-size:12px;margin-left:auto;white-space:nowrap}.cc-ratings-type-multiselect{position:relative;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-ratings-type-toggle{background:#fff;border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;color:#333;cursor:pointer;font-size:12px;height:34px;line-height:34px;max-width:280px;min-width:186px;overflow:hidden;padding:0 32px 0 10px;position:relative;text-align:left;text-overflow:ellipsis;text-transform:none!important;white-space:nowrap}.cc-ratings-type-toggle:after{color:#777;content:\"▼\";font-size:10px;position:absolute;right:10px;top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%)}.cc-ratings-type-menu{background:#fff;border:1px solid #ddd;border-radius:8px;-webkit-box-shadow:0 8px 22px rgba(0,0,0,.12);box-shadow:0 8px 22px rgba(0,0,0,.12);left:0;max-height:220px;min-width:180px;overflow:auto;padding:6px;position:absolute;top:calc(100% + 6px);z-index:3}.cc-ratings-type-menu label{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-radius:6px;cursor:pointer;font-size:12px;gap:7px;padding:6px 8px}.cc-ratings-type-menu label:hover{background:#f5f5f5}.cc-ratings-table-wrap{overflow:auto;padding:0 0 4px}.cc-ratings-table{border-collapse:collapse;table-layout:fixed;width:100%}.cc-ratings-table td,.cc-ratings-table th{border-bottom:1px solid #f0f0f0;font-size:12px;padding:10px 16px;vertical-align:top}.cc-ratings-table th{background:#fafafa;position:sticky;top:0;z-index:1}.cc-ratings-table th button{background:transparent;border:0;color:#333;cursor:pointer;font:inherit;font-weight:700;gap:6px;padding:0}.cc-ratings-table th button,.cc-sort-indicator{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-sort-indicator{-webkit-box-pack:center;-ms-flex-pack:center;color:#8a8a8a;font-size:10px;justify-content:center;min-width:12px}.cc-ratings-table th button.is-active .cc-sort-indicator{color:#aa2c16}.cc-ratings-table td:first-child,.cc-ratings-table th:first-child{width:40%}.cc-ratings-table td:nth-child(2),.cc-ratings-table th:nth-child(2){width:18%}.cc-ratings-table td:nth-child(3),.cc-ratings-table th:nth-child(3){width:10%}.cc-ratings-table td:nth-child(4),.cc-ratings-table th:nth-child(4){width:12%}.cc-ratings-table td:nth-child(5),.cc-ratings-table th:nth-child(5){width:20%}.cc-ratings-table-name-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;contain:layout paint;gap:8px;justify-content:space-between;width:100%}.cc-ratings-table-name-link{color:#1f4f8f;font-size:13px;font-weight:600;text-decoration:none;word-break:break-word;-webkit-box-flex:1;-ms-flex:1;flex:1}.cc-ratings-table-name-link:hover{text-decoration:underline}.cc-ratings-table-details-btn,.cc-ratings-table-link-icon{border:1px solid #cfcfcf;border-radius:6px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:22px;width:22px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;justify-content:center;text-decoration:none;-webkit-box-flex:0;-moz-appearance:none;appearance:none;-webkit-appearance:none;color:#8a8a8a;cursor:pointer;-ms-flex:0 0 auto;flex:0 0 auto;padding:0;-webkit-transition:color .15s,background-color .15s,border-color .15s;transition:color .15s,background-color .15s,border-color .15s}.cc-ratings-table-details-btn:hover,.cc-ratings-table-link-icon:hover{background:#f3f3f3;border-color:#bcbcbc;color:#aa2c16}.cc-ratings-table-date,.cc-ratings-table-rating,.cc-ratings-table-year{white-space:nowrap}.cc-ratings-table-type{color:#444;white-space:nowrap}.cc-ratings-table-rating{color:#b8321d;font-size:13px;font-weight:700;letter-spacing:.2px}.cc-ratings-table-rating.is-odpad{color:#000;font-weight:700;letter-spacing:0}.cc-ratings-square{border-radius:2px;height:11px;width:11px;-webkit-box-flex:0;-ms-flex:0 0 11px;flex:0 0 11px;margin-right:2px}.cc-ratings-square.is-1{background:#465982}.cc-ratings-square.is-2{background:#5c6f96}.cc-ratings-square.is-3{background:#9a3d2b}.cc-ratings-square.is-4,.cc-ratings-square.is-5{background:#b8321d}.cc-ratings-square.is-unknown{background:#9a9a9a}.cc-ratings-table-empty{color:#7a7a7a;padding:18px 16px;text-align:center}body.cc-ratings-modal-open{overflow:hidden}.cc-rating-detail-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.32);justify-content:center;padding:20px;z-index:10011}.cc-rating-detail-card,.cc-rating-detail-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-rating-detail-card{background:#fff;border-radius:12px;-webkit-box-shadow:0 14px 38px rgba(0,0,0,.24);box-shadow:0 14px 38px rgba(0,0,0,.24);max-height:calc(100vh - 60px);overflow:hidden;width:min(760px,calc(100vw - 32px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-rating-detail-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-rating-detail-head h4{font-size:14px;font-weight:700;margin:0}.cc-rating-detail-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-rating-detail-close:hover{background:#f1f1f1;color:#222}.cc-rating-detail-body{overflow:auto;padding:8px 14px 12px}.cc-rating-detail-row{border-bottom:1px solid #f1f1f1;display:grid;gap:10px;grid-template-columns:180px 1fr;padding:8px 0}.cc-rating-detail-key{color:#666;font-size:12px;font-weight:600}.cc-rating-detail-value{color:#222;font-size:12px;white-space:pre-wrap;word-break:break-word}body.cc-menu-open .box-video,body.cc-menu-open .slick-list,body.cc-menu-open .slick-slider{pointer-events:none!important}.cc-sync-modal-overlay{background:rgba(0,0,0,.45);display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;opacity:0;pointer-events:none;-webkit-transition:opacity .18s ease,visibility .18s ease;transition:opacity .18s ease,visibility .18s ease;visibility:hidden;z-index:10002}.cc-sync-modal-overlay.visible{opacity:1;pointer-events:auto;visibility:visible}.cc-sync-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 10px 30px rgba(0,0,0,.22);box-shadow:0 10px 30px rgba(0,0,0,.22);max-width:calc(100vw - 30px);padding:14px;width:340px}.cc-sync-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;margin-bottom:8px}.cc-sync-modal-head h3{font-size:14px;margin:0}.cc-sync-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-sync-help{color:#444;font-size:12px;margin:0 0 10px}.cc-sync-toggle-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-size:12px;gap:6px;margin-bottom:10px}.cc-sync-label{color:#333;display:block;font-size:12px;margin-bottom:4px}.cc-sync-input{border:1px solid #d9d9d9;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;padding:7px 8px;width:100%}.cc-sync-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:end;-ms-flex-pack:end;gap:8px;justify-content:flex-end;margin-top:12px}.cc-sync-note{color:#666;font-size:11px;margin-top:8px}.cc-lc-modal-overlay{display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;z-index:10032;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.42);justify-content:center;opacity:0;padding:14px;pointer-events:none;-webkit-transition:opacity .16s ease,visibility .16s ease;transition:opacity .16s ease,visibility .16s ease;visibility:hidden}.cc-lc-modal-overlay.is-open{opacity:1;pointer-events:auto;visibility:visible}.cc-lc-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 18px 42px rgba(0,0,0,.28);box-shadow:0 18px 42px rgba(0,0,0,.28);display:grid;gap:8px;grid-template-rows:auto auto minmax(0,1fr) auto;max-height:min(80vh,700px);padding:12px;width:min(720px,calc(100vw - 30px))}.cc-lc-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.cc-lc-modal-head h3{font-size:14px;margin:0}.cc-lc-modal-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-lc-modal-help{color:#666;font-size:11px}.cc-lc-modal-body{border:1px solid #ededed;border-radius:8px;overflow:auto}.cc-lc-table{border-collapse:collapse;table-layout:fixed;width:100%}.cc-lc-table td,.cc-lc-table th{border-bottom:1px solid #f1f1f1;font-size:11px;padding:7px 8px;vertical-align:middle}.cc-lc-table th{background:#fafafa;position:sticky;text-align:left;top:0}.cc-lc-table td.cc-lc-key,.cc-lc-table th:first-child{width:33%}.cc-lc-table td.cc-lc-value,.cc-lc-table th:nth-child(2){width:45%}.cc-lc-table td.cc-lc-action,.cc-lc-table th:last-child{width:22%}.cc-lc-key,.cc-lc-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-lc-table-empty{color:#757575;padding:10px;text-align:center}.cc-lc-modal-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;gap:6px;justify-content:flex-end}.cc-lc-modal-body::-webkit-scrollbar,.cc-ratings-table-wrap::-webkit-scrollbar,.cc-version-info-body::-webkit-scrollbar{height:8px;width:8px}.cc-lc-modal-body::-webkit-scrollbar-track,.cc-ratings-table-wrap::-webkit-scrollbar-track,.cc-version-info-body::-webkit-scrollbar-track{background:transparent}.cc-lc-modal-body::-webkit-scrollbar-thumb,.cc-ratings-table-wrap::-webkit-scrollbar-thumb,.cc-version-info-body::-webkit-scrollbar-thumb{background:#ccc;border-radius:10px}.cc-lc-modal-body::-webkit-scrollbar-thumb:hover,.cc-ratings-table-wrap::-webkit-scrollbar-thumb:hover,.cc-version-info-body::-webkit-scrollbar-thumb:hover{background:#a8a8a8}.cc-pill-input-container{background:#fff;border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;cursor:text;display:-webkit-box;display:-ms-flexbox;display:flex;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px;min-height:32px;padding:5px 6px;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-pill-input-container.is-disabled{background:#f5f5f5;cursor:not-allowed}.cc-pills{display:-webkit-box;display:-ms-flexbox;display:flex;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px}.cc-pill{background:#aa2c16;border-radius:4px;color:#fff;font-size:12px;font-weight:600;line-height:1.2;padding:4px 8px}.cc-pill,.cc-pill-remove{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-pill-remove{cursor:pointer;font-size:16px;margin-left:6px;opacity:.7;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;line-height:1;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-pill-remove:hover{opacity:1}.cc-pill-input-container input{border:none!important;margin:0!important;outline:none!important;padding:0!important;-webkit-box-flex:1;background:transparent;color:#444;-ms-flex:1;flex:1;font-size:12px;min-width:80px}.cc-pill-input-container input:disabled{cursor:not-allowed}.cc-select-compact{-moz-appearance:none;appearance:none;-webkit-appearance:none;background-color:#fff;background-image:url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%23777777\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"></polyline></svg>');background-position:right 6px center;background-repeat:no-repeat;border:1px solid #d4d4d4;border-radius:5px;color:#444;cursor:pointer;font-family:inherit;font-size:11px;height:22px;outline:none;padding:0 20px 0 6px;-webkit-transition:border-color .15s ease,-webkit-box-shadow .15s ease;transition:border-color .15s ease,-webkit-box-shadow .15s ease;transition:border-color .15s ease,box-shadow .15s ease;transition:border-color .15s ease,box-shadow .15s ease,-webkit-box-shadow .15s ease}.cc-select-compact:focus,.cc-select-compact:hover{border-color:#bcbcbc}.cc-select-compact:focus{border-color:#aa2c16;-webkit-box-shadow:0 0 0 2px rgba(170,44,22,.15);box-shadow:0 0 0 2px rgba(170,44,22,.15)}.cc-setting-sub.is-disabled .cc-select-compact{background-color:#f5f5f5;cursor:not-allowed}.cc-requires-login{cursor:not-allowed!important;filter:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"filter\"><feColorMatrix type=\"matrix\" color-interpolation-filters=\"sRGB\" values=\"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0\" /></filter></svg>#filter');-webkit-filter:grayscale(100%);filter:grayscale(100%);opacity:.5}.cc-setting-group.cc-requires-login *,.cc-setting-row.cc-requires-login *{pointer-events:none}.cc-badge.cc-requires-login,.cc-button.cc-requires-login,.cc-sync-icon-btn.cc-requires-login{pointer-events:auto}.cc-badges-pill{border-radius:6px;-webkit-box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);margin-right:4px;overflow:hidden}.cc-badges-pill,.cc-badges-pill .cc-badge{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-badges-pill .cc-badge{border-radius:0;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:11.2px;font-size:.7rem;height:auto;line-height:1.4;margin:0;padding:2px 6px}.cc-badges-pill .cc-badge-black{border-left:1px solid hsla(0,0%,100%,.25)}#cc-open-ratings-btn{margin-right:2px}.cc-ratings-table-toolbar{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:12px}.cc-ratings-table-toolbar .cc-ratings-table-search{-webkit-box-flex:1;-ms-flex:1 1 200px;flex:1 1 200px;margin:0!important;max-width:300px}.cc-toolbar-right{-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;gap:10px;justify-content:flex-end;-webkit-box-flex:1;-ms-flex:1 1 200px;flex:1 1 200px}.cc-ratings-scope-toggle,.cc-toolbar-right{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-ratings-scope-toggle{background:#eef0f2;border-radius:8px;gap:2px;margin:0 auto;padding:4px}.cc-ratings-scope-toggle button{background:transparent;border:none;border-radius:6px;color:#666;cursor:pointer;display:-webkit-box;display:-ms-flexbox;display:flex;font-size:12px;font-weight:600;padding:6px 16px;-webkit-transition:all .2s ease;transition:all .2s ease;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-ratings-scope-toggle button:hover{color:#111}.cc-ratings-scope-toggle button.is-active[data-scope=all]{background:#fff;-webkit-box-shadow:0 1px 4px rgba(0,0,0,.1);box-shadow:0 1px 4px rgba(0,0,0,.1);color:#222}.cc-ratings-scope-toggle button.is-active[data-scope=direct]{background:#aa2c16;-webkit-box-shadow:0 2px 6px rgba(170,44,22,.3);box-shadow:0 2px 6px rgba(170,44,22,.3);color:#fff}.cc-ratings-scope-toggle button.is-active[data-scope=computed]{background:#000;-webkit-box-shadow:0 2px 6px rgba(0,0,0,.3);box-shadow:0 2px 6px rgba(0,0,0,.3);color:#fff}.cc-ratings-table-rating.is-computed{color:#000!important}.cc-ratings-square.is-computed{background:#000!important}";
  styleInject(css_248z$1);

  var css_248z = ".cc-flex{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-flex-column{-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-flex-row{-webkit-box-orient:horizontal;-webkit-box-direction:normal;-ms-flex-direction:row;flex-direction:row}.cc-flex-row-reverse{-webkit-box-orient:horizontal;-webkit-box-direction:reverse;-ms-flex-direction:row-reverse;flex-direction:row-reverse}.cc-flex-column-reverse{-webkit-box-orient:vertical;-webkit-box-direction:reverse;-ms-flex-direction:column-reverse;flex-direction:column-reverse}.cc-justify-center{-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-justify-evenly{-webkit-box-pack:space-evenly;-ms-flex-pack:space-evenly;justify-content:space-evenly}.cc-justify-start{-webkit-box-pack:start;-ms-flex-pack:start;justify-content:flex-start}.cc-justify-end{-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-justify-between{-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.cc-justify-around{-ms-flex-pack:distribute;justify-content:space-around}.cc-align-center{text-align:center}.cc-align-left{text-align:left}.cc-align-right{text-align:right}.cc-grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-grow-0{-webkit-box-flex:0;-ms-flex-positive:0;flex-grow:0}.cc-grow-1{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-grow-2{-webkit-box-flex:2;-ms-flex-positive:2;flex-grow:2}.cc-grow-3{-webkit-box-flex:3;-ms-flex-positive:3;flex-grow:3}.cc-grow-4{-webkit-box-flex:4;-ms-flex-positive:4;flex-grow:4}.cc-grow-5{-webkit-box-flex:5;-ms-flex-positive:5;flex-grow:5}.cc-gap-5{gap:5px}.cc-gap-10{gap:10px}.cc-gap-30{gap:30px}.cc-ml-auto{margin-left:auto}.cc-mr-auto{margin-right:auto}.cc-ph-5{padding:0 5px}.cc-ph-10{padding:0 10px}.cc-pv-5{padding:5px 0}.cc-pv-10{padding:10px 0}.cc-mh-5{margin:0 5px}.cc-mh-10{margin:0 10px}.cc-mv-5{margin:5px 0}.cc-mv-10{margin:10px 0}.cc-own-rating{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;margin-left:8px;vertical-align:middle;-webkit-box-align:center;-ms-flex-align:center;align-items:center;line-height:1}.cc-own-rating-foreign-profile{background-color:hsla(0,34%,69%,.08);border:1px solid #ba0305;border-radius:999px;-webkit-box-shadow:inset 0 0 0 1px hsla(0,0%,100%,.5);box-shadow:inset 0 0 0 1px hsla(0,0%,100%,.5);padding:0 7px 0 5px;position:relative;top:-4px;white-space:nowrap;-ms-flex-negative:0;flex-shrink:0}.cc-own-rating-foreign-profile:before{color:#ba0305;content:\"🤍\";display:inline-block;font-size:9px;font-weight:700;letter-spacing:.04em;margin-right:5px;opacity:.85;text-transform:uppercase}.cc-own-rating-computed .stars:before{color:#d2d2d2}.cc-own-rating-computed-count{color:#7b7b7b;font-size:11px;line-height:1;margin-left:3px;vertical-align:super}h3.film-title-inline .cc-own-rating,h3.film-title-nooverflow .cc-own-rating{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-ratings-table-export{cursor:pointer;font-size:11px;margin-left:auto;padding:5px 7px;text-align:center}.cc-my-rating-cell,.cc-my-rating-col{text-align:center;width:64px}.cc-my-rating-cell{white-space:nowrap}.cc-my-rating-cell .cc-own-rating{margin-left:0}.cc-compare-ratings-table{width:calc(100% + 24px)}.article-header{padding-top:2px}.cc-gallery-size-host{position:relative}.cc-gallery-size-links{bottom:8px;display:none;position:absolute;right:8px;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:end;-ms-flex-align:end;align-items:flex-end;gap:4px;z-index:11}.cc-gallery-size-host:hover .cc-gallery-size-links,.cc-gallery-size-links.is-visible,.cc-gallery-size-links:hover{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-gallery-size-link{background-color:hsla(0,100%,98%,.82);border-radius:5px;color:#222;display:inline-block;font-size:11px;font-weight:700;line-height:1.2;min-width:48px;padding:2px 6px;text-align:center;text-decoration:none}.cc-gallery-size-link:hover{text-decoration:underline}.cc-creator-preview{left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:translateY(2px);transform:translateY(2px);-webkit-transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,transform .12s ease;transition:opacity .12s ease,transform .12s ease,-webkit-transform .12s ease;z-index:10030}.cc-creator-preview.is-visible{opacity:1;-webkit-transform:translateY(0);transform:translateY(0)}.cc-creator-preview-card{background:hsla(0,0%,99%,.96);border:1px solid hsla(0,0%,50%,.35);border-radius:10px;-webkit-box-shadow:0 8px 20px rgba(0,0,0,.2);box-shadow:0 8px 20px rgba(0,0,0,.2);overflow:hidden;position:relative;width:176px}.cc-creator-preview-image{background-color:#ececec;display:block;height:200px;-o-object-fit:contain;object-fit:contain;-o-object-position:center center;object-position:center center;width:100%}.cc-creator-preview-image.empty-image{background-color:#c4c4c4;background-position:50%;background-repeat:no-repeat;background-size:60%}.cc-creator-preview-name{color:#303030;display:-webkit-box;display:-ms-flexbox;display:flex;font-size:11px;font-weight:600;line-height:1.2;overflow:hidden;padding:7px 8px 8px;text-align:center;text-overflow:ellipsis;white-space:nowrap;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;gap:4px;justify-content:center}.cc-creator-preview-name-flag{height:auto;width:14px;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-creator-preview-meta{background:hsla(0,0%,98%,.92);border-top:1px solid rgba(0,0,0,.06);padding:0 8px 9px}.cc-creator-preview-meta-line{color:#434343;font-size:11px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-creator-preview-meta-line+.cc-creator-preview-meta-line{margin-top:2px}.cc-creator-preview-meta-birth{color:#2f2f2f;font-size:12px;font-weight:600;line-height:1.4;white-space:normal}.cc-creator-preview-meta-birth-age-inline{color:#666;font-size:11px;font-weight:500}.cc-creator-preview-meta-age{color:#595959;font-size:11px;font-weight:600;text-align:center}.cc-creator-preview-meta-photo{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline;color:#505050;font-weight:600;gap:6px;min-width:0;white-space:nowrap}.cc-creator-preview-meta-photo:before{content:\"🎬\";line-height:1;margin-right:2px}.cc-creator-preview-meta-photo.is-copyright:before{content:\"©\";font-weight:700}.cc-creator-preview-meta-photo-source{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-creator-preview-meta-photo-year{-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;white-space:nowrap}.cc-creator-preview-meta-photo.is-movie{color:#ba0305}.cc-creator-preview-meta-photo.is-movie .cc-creator-preview-meta-photo-year{font-weight:700}.cc-creator-preview-meta-photo.is-movie .cc-creator-preview-meta-photo-source{line-height:1;white-space:nowrap}.cc-creator-preview-meta-photo.is-copyright{color:#4c4c4c}.cc-creator-preview-meta-photo.is-copyright .cc-creator-preview-meta-photo-year{display:none}.cc-creator-preview-meta-photo.is-copyright .cc-creator-preview-meta-photo-source{display:-webkit-box;overflow:hidden;text-overflow:clip;white-space:normal;-webkit-line-clamp:2;-webkit-box-orient:vertical}nav.tab-nav.cc-show-all-tabs{padding-right:0!important}nav.tab-nav.cc-show-all-tabs .tab-nav-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;list-style:none;margin:0;padding:0;width:100%}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item{-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;min-width:0;top:-4px}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item.active{top:0}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-link{display:block;overflow:hidden;padding:0 5px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.cc-hide-panel-btn,.cc-hide-video-btn{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background-color:#ba0305;border:none;border-radius:4px;-webkit-box-sizing:border-box;box-sizing:border-box;color:#fff!important;cursor:pointer;font-size:10px;font-weight:700;justify-content:center;line-height:1;opacity:0;padding:3px 8px;text-transform:uppercase;-webkit-transition:opacity .2s ease,background-color .2s ease;transition:opacity .2s ease,background-color .2s ease}.cc-hide-panel-btn:hover,.cc-hide-video-btn:hover{background-color:#8b0204}.box-header:hover .cc-hide-panel-btn,.updated-box-banner-mobile:hover .cc-hide-panel-btn,.updated-box-banner:hover .cc-hide-panel-btn,.updated-box-header:hover .cc-hide-panel-btn,.updated-box-homepage-video:hover .cc-hide-video-btn{opacity:1}.cc-hide-panel-btn{margin-left:12px;-webkit-transform:translateY(-2px);transform:translateY(-2px);vertical-align:middle}.cc-hide-video-btn{-webkit-box-shadow:0 2px 8px rgba(0,0,0,.3);box-shadow:0 2px 8px rgba(0,0,0,.3);left:10px;position:absolute;top:10px;z-index:10000}.updated-box--homepage-csfd-cinema .updated-box-header p{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;overflow:visible!important;position:relative;z-index:10}.updated-box--homepage-csfd-cinema .cc-hide-panel-btn{-webkit-box-shadow:0 1px 4px rgba(0,0,0,.15);box-shadow:0 1px 4px rgba(0,0,0,.15);-webkit-transform:translateY(0);transform:translateY(0)}body:not(.cc-dev-mode-active) .cc-dev-only,body:not(.cc-dev-mode-active) .cc-settings-sticky,body:not(.cc-panels-feature-enabled) .cc-hide-panel-btn,body:not(.cc-panels-feature-enabled) .cc-hide-video-btn{display:none!important}";
  styleInject(css_248z);

  var htmlContent = "<svg style=\"display: none;\" xmlns=\"http://www.w3.org/2000/svg\">\r\n    <symbol id=\"cc-icon-info\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\r\n        <line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line>\r\n        <line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-image\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>\r\n        <circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"></circle>\r\n        <polyline points=\"21 15 16 10 5 21\"></polyline>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-menu-logo\" viewBox=\"0 0 24 24\" fill=\"none\">\r\n        <text x=\"12\" y=\"12\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"currentColor\" font-size=\"11\"\r\n            font-weight=\"800\" letter-spacing=\"0.2\">CC</text>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-download\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path>\r\n        <polyline points=\"7 10 12 15 17 10\"></polyline>\r\n        <line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-star\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <polygon\r\n            points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\">\r\n        </polygon>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-cloud\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <path d=\"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z\"></path>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-chevron\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <polyline points=\"6 9 12 15 18 9\"></polyline>\r\n    </symbol>\r\n</svg>\r\n\r\n<a href=\"javascript:void(0)\" rel=\"dropdownContent\" class=\"user-link csfd-compare-menu initialized\">\r\n    <svg class=\"cc-menu-icon\" width=\"24\" height=\"24\">\r\n        <use href=\"#cc-icon-menu-logo\"></use>\r\n    </svg>\r\n</a>\r\n\r\n<div id=\"dropdown-compare-menu\" class=\"dropdown-content cc-settings\">\r\n\r\n    <div class=\"dropdown-content-head\">\r\n        <div class=\"left-head\">\r\n            <h2>CSFD-Compare</h2>\r\n            <div class=\"cc-version-row\">\r\n                <span class=\"cc-version-link\" id=\"cc-version-value\">v0.8.12</span>\r\n                <span class=\"cc-version-status\" id=\"cc-version-status\" aria-hidden=\"true\"></span>\r\n            </div>\r\n        </div>\r\n        <div class=\"right-head cc-ml-auto cc-head-right\">\r\n            <div class=\"cc-head-tools\">\r\n                <div class=\"cc-badges-pill\" title=\"Tvá uložená hodnocení\">\r\n                    <span id=\"cc-badge-red\" class=\"cc-badge cc-badge-red\" tabindex=\"0\" role=\"button\"\r\n                        title=\"Uloženo / Celkem: Počet přímo načtených hodnocení\">0 / 0</span>\r\n                    <span id=\"cc-badge-black\" class=\"cc-badge cc-badge-black\" tabindex=\"0\" role=\"button\"\r\n                        title=\"Spočtená hodnocení: Počet hodnocení automaticky dopočítaných pro seriály\">0</span>\r\n                </div>\r\n\r\n                <button type=\"button\" class=\"cc-sync-icon-btn\" id=\"cc-open-ratings-btn\" aria-label=\"Tabulka hodnocení\"\r\n                    title=\"Zobrazit tabulku všech hodnocení\">\r\n                    <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"\r\n                        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                        <line x1=\"8\" y1=\"6\" x2=\"21\" y2=\"6\"></line>\r\n                        <line x1=\"8\" y1=\"12\" x2=\"21\" y2=\"12\"></line>\r\n                        <line x1=\"8\" y1=\"18\" x2=\"21\" y2=\"18\"></line>\r\n                        <line x1=\"3\" y1=\"6\" x2=\"3.01\" y2=\"6\"></line>\r\n                        <line x1=\"3\" y1=\"12\" x2=\"3.01\" y2=\"12\"></line>\r\n                        <line x1=\"3\" y1=\"18\" x2=\"3.01\" y2=\"18\"></line>\r\n                    </svg>\r\n                </button>\r\n\r\n                <button type=\"button\" class=\"cc-sync-icon-btn\" id=\"cc-sync-cloud-btn\" title=\"Synchronizace s cloudem\">\r\n                    <svg width=\"14\" height=\"14\">\r\n                        <use href=\"#cc-icon-cloud\"></use>\r\n                    </svg>\r\n                </button>\r\n\r\n                <button type=\"button\" class=\"cc-sync-icon-btn cc-version-info-btn\" id=\"cc-version-info-btn\"\r\n                    title=\"Informace o verzi\">\r\n                    <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n                        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\r\n                        <line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line>\r\n                        <line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>\r\n                    </svg>\r\n                </button>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\">\r\n        <div class=\"cc-settings-section-content\">\r\n            <div class=\"cc-settings-actions\">\r\n                <button id=\"cc-load-ratings-btn\" class=\"cc-button cc-button-red cc-grow cc-button-iconed\"\r\n                    title=\"Projde váš profil a stáhne všechna vaše hodnocení do lokální databáze (nutné pro správné fungování ostatních funkcí).\">\r\n                    <span class=\"cc-button-icon\" aria-hidden=\"true\"><svg width=\"14\" height=\"14\">\r\n                            <use href=\"#cc-icon-download\"></use>\r\n                        </svg></span>\r\n                    <span>Načíst hodnocení</span>\r\n                </button>\r\n                <button id=\"cc-load-computed-btn\" class=\"cc-button cc-button-black cc-button-iconed\"\r\n                    title=\"Z načtených hodnocení automaticky vypočítá a doplní hodnocení pro celé seriály nebo jejich série.\">\r\n                    <span class=\"cc-button-icon\" aria-hidden=\"true\"><svg width=\"14\" height=\"14\">\r\n                            <use href=\"#cc-icon-star\"></use>\r\n                        </svg></span>\r\n                    <span>Načíst spočtené</span>\r\n                </button>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\" hidden>\r\n        <div class=\"cc-settings-section-content\">\r\n            <div id=\"cc-ratings-progress\" class=\"cc-ratings-progress\" hidden>\r\n                <div class=\"cc-ratings-progress-head\">\r\n                    <span id=\"cc-ratings-progress-label\">Připravuji načítání…</span>\r\n                    <span id=\"cc-ratings-progress-count\">0 / 0</span>\r\n                </div>\r\n                <div class=\"cc-ratings-progress-track\">\r\n                    <div id=\"cc-ratings-progress-bar\" class=\"cc-ratings-progress-bar\" style=\"width: 0%\"></div>\r\n                </div>\r\n                <div class=\"cc-ratings-progress-actions\">\r\n                    <button id=\"cc-cancel-ratings-loader-btn\" class=\"cc-ratings-cancel-link\" hidden>Zrušit\r\n                        načítání</button>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\">\r\n        <div class=\"cc-settings-section-content\" style=\"padding-top: 8px;\" id=\"cc-dynamic-settings-container\">\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"cc-settings-section\">\r\n        <div class=\"cc-settings-section-content\">\r\n            <h3 class=\"cc-section-title\" style=\"margin-top: 0;\">Další akce</h3>\r\n            <div class=\"cc-maint-actions\" style=\"width: 100%;\">\r\n                <button type=\"button\" class=\"cc-button cc-button-black cc-button-small\" id=\"cc-maint-reset-btn\"\r\n                    title=\"Vrátí veškeré přepínače a nastavení tohoto doplňku (včetně skrytých uživatelů) do původního, výchozího stavu.\">\r\n                    Reset\r\n                </button>\r\n                <button type=\"button\" class=\"cc-button cc-button-red cc-button-small cc-dev-only\"\r\n                    id=\"cc-maint-clear-lc-btn\" title=\"Otevře okno pro manuální smazání dat z LocalStorage.\">\r\n                    LC\r\n                </button>\r\n                <button type=\"button\" class=\"cc-button cc-button-red cc-button-small cc-dev-only\"\r\n                    id=\"cc-maint-clear-db-btn\"\r\n                    title=\"Smaže lokální CC hodnocení (IndexedDB). CSFD.cz hodnocení zůstanou nedotčena.\">\r\n                    Smazat DB\r\n                </button>\r\n\r\n                <div style=\"flex-grow: 1;\"></div>\r\n\r\n                <button type=\"button\" class=\"cc-button cc-button-black cc-button-small\" id=\"cc-maint-dev-btn\"\r\n                    title=\"Zapne/vypne vývojářský režim (skryje nebo zobrazí testovací prvky).\">DEV: OFF</button>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n</div>";

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
    labelEl.textContent = 'Načíst hodnocení';
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
      labelEl.textContent = 'Načíst spočtené';
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

  // supabase-api.js

  const SUPABASE_URL = 'https://ttbwkjnipnwqaujkyotc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_Mb7Bm7xyq0yaHjhGeHS76w_CNvfcCjU';

  const HEADERS = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  async function getOrCreateToken(userSlug) {
    if (!userSlug) return null;
    try {
      const getResponse = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync?user_slug=eq.${userSlug}&select=token`, {
        method: 'GET',
        headers: HEADERS,
      });
      if (!getResponse.ok) throw new Error('Failed to fetch existing token');
      const existingData = await getResponse.json();
      if (existingData && existingData.length > 0) return existingData[0].token;

      const postResponse = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'return=representation' },
        body: JSON.stringify({
          user_slug: userSlug,
          ratings_data: {},
          updated_at: new Date().toISOString(),
        }),
      });
      if (!postResponse.ok) throw new Error('Failed to create new token');
      const newData = await postResponse.json();
      return newData[0].token;
    } catch (error) {
      console.error('[CC Sync] Error generating token:', error);
      return null;
    }
  }

  /**
   * Downloads the user's ratings from Supabase.
   */
  async function downloadFromCloud(userToken) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync?token=eq.${userToken}&select=ratings_data`, {
        method: 'GET',
        headers: HEADERS,
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.length > 0 ? data[0].ratings_data : null;
    } catch (error) {
      console.error('[CC Sync] Download error:', error);
      return null;
    }
  }

  /**
   * Uploads merged ratings to Supabase using an Upsert.
   */
  async function uploadToCloud(userToken, ratingsJson, userSlug) {
    try {
      const payload = {
        token: userToken,
        ratings_data: ratingsJson,
        updated_at: new Date().toISOString(),
      };

      // Include user_slug so Supabase's Upsert doesn't fail the Not-Null constraint
      if (userSlug) {
        payload.user_slug = userSlug;
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('[CC Sync] Upload error:', error);
      return false;
    }
  }

  const SYNC_ENABLED_KEY = 'cc_sync_enabled';
  const SYNC_ACCESS_KEY = 'cc_sync_access_key';

  let isSyncing = false; // Lock to prevent overlapping sync loops

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

  function getActiveUserSlugFallback() {
    const match = document
      .querySelector('a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]')
      ?.getAttribute('href')
      ?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
  }

  /**
   * Creates the Conflict Modal to display differences and allow manual overrides.
   */
  function openConflictModal(conflicts, localData, cloudData, accessKey, currentUserSlug, onResolved) {
    // Map the raw conflict data into a clean, human-readable JSON object
    const localDiff = {};
    const cloudDiff = {};

    for (const [id, item] of Object.entries(conflicts)) {
      const title = item.local?.name || item.cloud?.name || id;

      localDiff[title] =
        item.local && !item.local.deleted ? { hodnoceni: item.local.rating, datum: item.local.date } : '--- SMAZÁNO ---';

      cloudDiff[title] =
        item.cloud && !item.cloud.deleted ? { hodnoceni: item.cloud.rating, datum: item.cloud.date } : '--- SMAZÁNO ---';
    }

    const overlay = document.createElement('div');
    overlay.className = 'cc-sync-modal-overlay visible';
    overlay.style.zIndex = '10050'; // Ensure it sits above the main sync modal

    overlay.innerHTML = `
    <div class="cc-sync-modal" style="width: 680px; max-width: 95vw;">
      <div class="cc-sync-modal-head" style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px;">
        <h3 style="color: #aa2c16;">Zjištěn konflikt v datech</h3>
        <button type="button" class="cc-sync-close" aria-label="Zavřít">&times;</button>
      </div>
      <p style="font-size: 12px; color: #444; margin-bottom: 12px; line-height: 1.4;">
        U následujících filmů se liší hodnocení mezi vaším prohlížečem a cloudem. Vyberte, která verze má přepsat tu druhou.
      </p>

      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <div style="flex: 1; display: flex; flex-direction: column;">
          <strong style="font-size: 11px; margin-bottom: 4px; color: #222;">Lokální data (Tento prohlížeč)</strong>
          <textarea readonly style="width: 100%; height: 220px; font-family: monospace; font-size: 11px; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; background: #f5f5f5; resize: none; white-space: pre;">${JSON.stringify(localDiff, null, 2)}</textarea>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column;">
          <strong style="font-size: 11px; margin-bottom: 4px; color: #222;">Cloud data (Záloha na serveru)</strong>
          <textarea readonly style="width: 100%; height: 220px; font-family: monospace; font-size: 11px; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; background: #f5f5f5; resize: none; white-space: pre;">${JSON.stringify(cloudDiff, null, 2)}</textarea>
        </div>
      </div>

      <div style="display: flex; gap: 8px;">
        <button type="button" id="cc-conflict-download" class="cc-button cc-button-black" style="flex: 1; font-size: 11px; padding: 8px;">
          ↓ PŘEPSAT Z CLOUDU (Zrušit lokální změny)
        </button>
        <button type="button" id="cc-conflict-upload" class="cc-button cc-button-black" style="flex: 1; font-size: 11px; padding: 8px;">
          ↑ PŘEPSAT DO CLOUDU (Potvrdit lokální změny)
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);

    // Manual Download Overwrite (Mirrors cloud exactly)
    overlay.querySelector('#cc-conflict-download')?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Stahuji...';
      try {
        // For any item in cloud, if it's a tombstone, delete locally. Otherwise save it.
        for (const record of Object.values(cloudData)) {
          if (record.deleted) {
            await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record.id);
          } else {
            await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record);
          }
        }
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
        onResolved('✅ Konflikt vyřešen: Data úspěšně přepsána z cloudu.');
        closeModal();
      } catch (err) {
        btn.textContent = 'Chyba stahování';
        btn.style.background = '#aa2c16';
      }
    });

    // Manual Upload Overwrite
    overlay.querySelector('#cc-conflict-upload')?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Nahrávám...';
      try {
        const activeSlug = currentUserSlug || Object.values(localData)[0]?.userSlug;
        await uploadToCloud(accessKey, localData, activeSlug);
        onResolved('✅ Konflikt vyřešen: Cloud úspěšně přepsán lokálními daty.');
        closeModal();
      } catch (err) {
        btn.textContent = 'Chyba nahrávání';
        btn.style.background = '#aa2c16';
      }
    });
  }

  /**
   * Creates and displays the primary Sync Setup modal.
   */
  function createSyncSetupModal(onSaveCallback, currentUserSlug) {
    removeSyncModal();

    const { enabled, accessKey } = getSyncSetupState();

    const overlay = document.createElement('div');
    overlay.className = 'cc-sync-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cc-sync-modal';

    modal.innerHTML = `
    <div class="cc-sync-modal-head">
      <h3>Nastavení Cloud Sync <span style="color: #aa2c16; font-size: 11px; vertical-align: middle;">(BETA)</span></h3>
      <button type="button" class="cc-sync-close" aria-label="Zavřít">&times;</button>
    </div>

    <div style="font-size: 12px; color: #444; margin-bottom: 14px; line-height: 1.4;">
      <p style="margin-top: 0;">
        Zálohujte svá hodnocení a synchronizujte je napříč zařízeními.
        Pro spárování vložte svůj osobní <strong>Sync Token</strong>.
      </p>
    </div>

    <div style="background: #f9f9f9; border: 1px solid #eee; padding: 10px; border-radius: 8px; margin-bottom: 14px;">
      <label class="cc-sync-toggle-row" style="margin-bottom: 8px; display: flex; cursor: pointer;">
        <input id="cc-sync-enabled-input" type="checkbox" ${enabled ? 'checked' : ''} style="margin-right: 8px; accent-color: #aa2c16;">
        <span style="font-weight: 600; color: #222;">Povolit synchronizaci</span>
      </label>

      <div id="cc-sync-inputs-container" style="transition: opacity 0.2s ease;">
        <label class="cc-sync-label" for="cc-sync-key-input" style="font-weight: 600; margin-top: 8px; display: block;">Váš Sync Token</label>

        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <input id="cc-sync-key-input" class="cc-sync-input" type="password" placeholder="Např. a1b2c3d4-e5f6..." value="${accessKey.replace(/"/g, '&quot;')}" style="flex: 1; border: 1px solid #ccc; margin: 0;">
          <button type="button" id="cc-generate-token-btn" class="cc-button cc-button-black" style="white-space: nowrap;" ${!currentUserSlug ? 'title="Musíte být přihlášeni"' : ''}>
            Získat Token
          </button>
        </div>
        <div id="cc-sync-error" style="color: #aa2c16; font-size: 11px; margin-top: 4px; display: none;">Došlo k chybě při komunikaci se serverem.</div>

        <div id="cc-smart-sync-section" style="margin-top: 16px; transition: opacity 0.2s ease;">
          <button type="button" id="cc-smart-sync-btn" class="cc-button cc-button-red" style="width: 100%; padding: 8px; font-size: 13px; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Synchronizovat Nyní
          </button>
          <div id="cc-smart-sync-status" style="color: #184e21; font-size: 11px; margin-top: 8px; text-align: center; font-weight: 600; min-height: 14px; white-space: pre-wrap;"></div>
        </div>
      </div>
    </div>

    <div class="cc-sync-actions">
      <button type="button" class="cc-sync-save cc-button cc-button-red">Zavřít</button>
    </div>
  `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('visible'));

    const closeModal = () => {
      overlay.classList.remove('visible');
      setTimeout(removeSyncModal, 180);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    modal.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);
    modal.querySelector('.cc-sync-save')?.addEventListener('click', closeModal);

    // --- UI Elements ---
    const generateBtn = modal.querySelector('#cc-generate-token-btn');
    const keyInput = modal.querySelector('#cc-sync-key-input');
    const enabledInput = modal.querySelector('#cc-sync-enabled-input');
    const inputsContainer = modal.querySelector('#cc-sync-inputs-container');
    const errorText = modal.querySelector('#cc-sync-error');
    const smartSyncBtn = modal.querySelector('#cc-smart-sync-btn');
    const smartSyncStatus = modal.querySelector('#cc-smart-sync-status');

    const setStatus = (msg, isError = false) => {
      smartSyncStatus.textContent = msg;
      smartSyncStatus.style.color = isError ? '#aa2c16' : '#184e21';
    };

    // --- Toggle & Auto-Save Logic ---
    const handleInputChange = () => {
      const isChecked = enabledInput.checked;
      const hasKey = keyInput.value.length > 0;

      keyInput.disabled = !isChecked;
      if (generateBtn) generateBtn.disabled = !isChecked || !currentUserSlug;

      inputsContainer.style.opacity = isChecked ? '1' : '0.5';
      inputsContainer.style.pointerEvents = isChecked ? 'auto' : 'none';

      const sectionsEnabled = isChecked && hasKey;
      smartSyncBtn.parentElement.style.opacity = sectionsEnabled ? '1' : '0.3';
      smartSyncBtn.parentElement.style.pointerEvents = sectionsEnabled ? 'auto' : 'none';

      saveSyncSetupState({
        enabled: Boolean(enabledInput.checked),
        accessKey: keyInput.value || '',
      });
      if (onSaveCallback) onSaveCallback();
    };

    handleInputChange();
    enabledInput.addEventListener('change', handleInputChange);
    keyInput.addEventListener('input', handleInputChange);

    // --- Token Generation ---
    if (generateBtn) {
      generateBtn.addEventListener('click', async () => {
        if (!currentUserSlug) return;

        generateBtn.disabled = true;
        generateBtn.textContent = 'Načítám...';
        errorText.style.display = 'none';

        const token = await getOrCreateToken(currentUserSlug);

        if (token) {
          keyInput.type = 'text';
          keyInput.value = token;
          enabledInput.checked = true;
          generateBtn.textContent = 'Hotovo ✓';
          handleInputChange();
        } else {
          errorText.style.display = 'block';
          generateBtn.disabled = false;
          generateBtn.textContent = 'Zkusit znovu';
        }
      });
    }

    // --- SMART SYNC NOW ---
    if (smartSyncBtn) {
      smartSyncBtn.addEventListener('click', async () => {
        smartSyncBtn.disabled = true;
        const originalText = smartSyncBtn.innerHTML;
        smartSyncBtn.textContent = 'Prověřuji data...';
        smartSyncStatus.textContent = '';

        // true = we are running manually, so it checks for conflicts!
        const result = await performCloudSync(true);

        if (result.status === 'conflict') {
          setStatus('Zjištěny nesrovnalosti.', true);
          openConflictModal(
            result.conflicts,
            result.localData,
            result.cloudData,
            keyInput.value,
            currentUserSlug,
            (resolutionMsg) => {
              setStatus(resolutionMsg);
            },
          );
        } else if (result.status === 'success') {
          const { addedToLocal, updatedInLocal, addedToCloud, updatedInCloud } = result.stats;

          if (addedToLocal === 0 && updatedInLocal === 0 && addedToCloud === 0 && updatedInCloud === 0) {
            setStatus('✅ Všechna data jsou již aktuální.');
          } else {
            let msg = '✅ Synchronizace úspěšná.\n';
            if (addedToLocal > 0) msg += `Staženo nových: ${addedToLocal}. `;
            if (updatedInLocal > 0) msg += `Aktualizováno lokálně: ${updatedInLocal}. `;
            if (addedToCloud > 0) msg += `Nahráno do cloudu: ${addedToCloud}. `;
            if (updatedInCloud > 0) msg += `Aktualizováno v cloudu: ${updatedInCloud}.`;
            setStatus(msg);
          }
        } else {
          setStatus('Nastala chyba při synchronizaci.', true);
        }

        smartSyncBtn.disabled = false;
        smartSyncBtn.innerHTML = originalText;
      });
    }
  }

  function updateSyncButtonLabel(button) {
    const { enabled, accessKey } = getSyncSetupState();
    const isFullyEnabled = enabled && accessKey.length > 0;

    button.classList.toggle('is-enabled', isFullyEnabled);
    button.setAttribute('title', isFullyEnabled ? 'Cloud sync je aktivní' : 'Nastavit Cloud sync');
    button.setAttribute('aria-label', isFullyEnabled ? 'Cloud sync zapnutý' : 'Nastavit Cloud sync');
  }

  function initializeRatingsSync(rootElement, getCurrentUserSlug) {
    const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');

    if (!syncButton || syncButton.dataset.ccSyncBound === 'true') return;

    syncButton.dataset.ccSyncBound = 'true';
    updateSyncButtonLabel(syncButton);

    syncButton.addEventListener('click', () => {
      const userSlug = getCurrentUserSlug();
      createSyncSetupModal(() => {
        updateSyncButtonLabel(syncButton);
      }, userSlug);
    });
  }

  /**
   * The main synchronization engine.
   * If isManualCheck is true, it strictly detects conflicts and pauses. Otherwise, it autosyncs.
   */
  async function performCloudSync(isManualCheck = false) {
    if (isSyncing) return { status: 'error' };

    const { enabled, accessKey } = getSyncSetupState();
    if (!enabled || !accessKey) return { status: 'error' };

    isSyncing = true;
    console.log('☁️ [CC Sync] Starting sync...');

    try {
      const localArray = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
      const localData = {};
      localArray.forEach((record) => {
        if (record && record.movieId) localData[record.movieId] = record;
      });

      const cloudData = (await downloadFromCloud(accessKey)) || {};

      let hasLocalChanges = false;
      let hasCloudChanges = false;
      const mergedData = { ...localData };
      const stats = { addedToLocal: 0, updatedInLocal: 0, addedToCloud: 0, updatedInCloud: 0 };

      // ==========================================
      // 1. CONFLICT DETECTION (Manual Mode Only)
      // ==========================================
      if (isManualCheck) {
        const conflicts = {};
        let hasConflicts = false;

        for (const [movieId, cloudRecord] of Object.entries(cloudData)) {
          const localRecord = localData[movieId];

          if (!localRecord && !cloudRecord.deleted) {
            // It's a real record in the cloud, but totally missing here.
            hasConflicts = true;
            conflicts[movieId] = { local: null, cloud: cloudRecord };
          } else if (localRecord && cloudRecord.deleted && !localRecord.deleted) {
            // We have it, but cloud says it's deleted
            hasConflicts = true;
            conflicts[movieId] = { local: localRecord, cloud: cloudRecord };
          } else if (localRecord && !cloudRecord.deleted && localRecord.rating !== cloudRecord.rating) {
            // Ratings are just different
            hasConflicts = true;
            conflicts[movieId] = { local: localRecord, cloud: cloudRecord };
          }
        }

        if (hasConflicts) {
          return { status: 'conflict', conflicts, localData, cloudData };
        }
      }

      // ==========================================
      // 2. STANDARD MERGE (Timestamp Based with Tombstones)
      // ==========================================
      for (const [movieId, cloudRecord] of Object.entries(cloudData)) {
        const localRecord = mergedData[movieId];

        if (!localRecord) {
          // We don't have it locally.
          if (cloudRecord.deleted) {
            // It's a tombstone. Ignore it, we already don't have it.
          } else {
            // It's a real new movie from the cloud. Download it.
            mergedData[movieId] = cloudRecord;
            await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord);
            hasLocalChanges = true;
            stats.addedToLocal++;
          }
        } else {
          const localTime = new Date(localRecord.lastUpdate || 0).getTime();
          const cloudTime = new Date(cloudRecord.lastUpdate || 0).getTime();

          if (cloudTime > localTime) {
            // Cloud is newer!
            mergedData[movieId] = cloudRecord;

            if (cloudRecord.deleted) {
              // Cloud says it was deleted on another device! Remove it here.
              await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord.id);
              stats.updatedInLocal++;
              hasLocalChanges = true;
            } else {
              await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord);
              stats.updatedInLocal++;
              hasLocalChanges = true;
            }
          } else if (localTime > cloudTime) {
            // Local is newer! (Could be a local edit, OR a local tombstone)
            hasCloudChanges = true;
            stats.updatedInCloud++;
          }
        }
      }

      // Add entirely new local items to the cloud list
      for (const movieId of Object.keys(localData)) {
        if (!cloudData[movieId]) {
          hasCloudChanges = true;
          stats.addedToCloud++;
        }
      }

      // ==========================================
      // 3. UPLOAD & REFRESH
      // ==========================================
      if (hasCloudChanges || Object.keys(cloudData).length === 0) {
        console.log('☁️ [CC Sync] Uploading updated data to cloud...');
        const activeSlug = getActiveUserSlugFallback() || Object.values(localData)[0]?.userSlug;
        await uploadToCloud(accessKey, mergedData, activeSlug);
      }

      if (hasLocalChanges) {
        console.log('☁️ [CC Sync] Local DB updated. Refreshing UI.');
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      }

      console.log('☁️ [CC Sync] Sync complete!', stats);
      return { status: 'success', stats, hasLocalChanges, hasCloudChanges };
    } catch (error) {
      console.error('☁️ [CC Sync] Failed:', error);
      return { status: 'error' };
    } finally {
      isSyncing = false;
    }
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
        isComputed: record.computed === true,
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
        <h3 id="cc-ratings-table-title" style="flex: 1; margin: 0; font-size: 15px;">Přehled hodnocení</h3>

        <div class="cc-ratings-scope-toggle">
          <button type="button" data-scope="all">Všechny</button>
          <button type="button" data-scope="direct">Přímo hodnocené</button>
          <button type="button" data-scope="computed">Spočtené</button>
        </div>

        <div style="flex: 1; display: flex; justify-content: flex-end;">
          <button type="button" class="cc-ratings-table-close" aria-label="Zavřít">×</button>
        </div>
      </div>
      <div class="cc-ratings-table-toolbar">
        <input type="search" class="cc-ratings-table-search" placeholder="Filtrovat (název, URL, hodnocení, datum)…" />

        <div class="cc-toolbar-right">
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
          <button type="button" class="cc-button cc-button-red cc-button-iconed cc-ratings-table-export">Export</button>
        </div>
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
      scopeFilter: 'all',
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
            <span class="cc-ratings-square ${escapeHtml$1(row.ratingSquareClass)} ${row.isComputed ? 'is-computed' : ''}" aria-hidden="true"></span>
            ${nameLink}
            ${detailsButton}
            ${iconLink}
          </div>
        </td>
        <td class="cc-ratings-table-type">${escapeHtml$1(row.typeDisplay)}</td>
        <td class="cc-ratings-table-year">${Number.isFinite(row.yearValue) ? row.yearValue : '—'}</td>
        <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''} ${row.isComputed ? 'is-computed' : ''}">${escapeHtml$1(row.ratingText)}</td>
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

      // 1. Filter by scope first
      const scopeFiltered = state.rows.filter((r) => {
        if (state.scopeFilter === 'direct') return !r.isComputed;
        if (state.scopeFilter === 'computed') return r.isComputed;
        return true;
      });

      // 2. Filter by type using the newly filtered scope list (BUG FIX)
      const typeFiltered = filterRowsByType(scopeFiltered, state.typeFilters);
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

    const scopeBtns = overlay.querySelectorAll('.cc-ratings-scope-toggle button');
    scopeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.scopeFilter = btn.dataset.scope;
        scopeBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        render();
      });
    });

    overlay.openWithData = ({ rows, modalTitle, initialScope = 'all' }) => {
      // update export button availability
      if (exportBtn) exportBtn.disabled = rows.length === 0;

      state.scopeFilter = initialScope;
      scopeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.scope === initialScope));

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
        const header = ['Název', 'Typ', 'Rok', 'Hodnocení', 'Datum hodnocení', 'URL', 'movieID'];
        csvLines.push(header.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));
        state.visibleRows.forEach((row) => {
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

  // BUG FIX: Ensure initialScope defaults properly and passes down.
  function openRatingsTableView({ rows, modalTitle, initialScope = 'all' }) {
    const modal = getRatingsTableModal();
    modal.openWithData({ rows, modalTitle, initialScope });
  }

  const ratingsModalCache = {
    userSlug: '',
    userRecords: null,
    allRows: null,
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
    ratingsModalCache.allRows = null;

    return userRecords;
  }

  async function getCachedAllRows(userSlug) {
    if (ratingsModalCache.userSlug === userSlug && Array.isArray(ratingsModalCache.allRows)) {
      return ratingsModalCache.allRows;
    }
    const userRecords = await getCachedUserRecords(userSlug);
    const rows = toModalRows(userRecords);
    ratingsModalCache.allRows = rows;
    return rows;
  }

  function invalidateRatingsModalCache() {
    ratingsModalCache.userSlug = '';
    ratingsModalCache.userRecords = null;
    ratingsModalCache.allRows = null;
  }

  async function openRatingsTableModal(rootElement, scope, callbacks) {
    const getCurrentUserSlug = callbacks?.getCurrentUserSlug;
    const getMostFrequentUserSlug = callbacks?.getMostFrequentUserSlug;

    let userSlug = getCurrentUserSlug?.();
    if (!userSlug) {
      const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
      userSlug = getMostFrequentUserSlug?.(records);
    }
    if (!userSlug) return;

    const rows = await getCachedAllRows(userSlug);
    openRatingsTableView({
      rows,
      modalTitle: 'Tabulka hodnocení',
      initialScope: scope,
    });

    const redBadge = rootElement.querySelector('#cc-badge-red');
    const blackBadge = rootElement.querySelector('#cc-badge-black');
    redBadge?.blur();
    blackBadge?.blur();
  }

  const DEBUG = true;

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
      // Place the debug toggle inside the settings menu next to the DEV button.
      // Fallback: if the settings menu isn't available yet, create a simple floating control.
      const maintActions = menuButton.querySelector('.cc-maint-actions');
      let checkbox;
      if (maintActions) {
        const wrapper = document.createElement('div');
        wrapper.className = 'cc-setting-row cc-dev-only';
        wrapper.title = 'Při aktivaci nechá CC menu trvale otevřené.';

        const switchLabel = document.createElement('label');
        switchLabel.className = 'cc-switch';

        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'cc-debug-hover-checkbox';
        checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';

        const switchBg = document.createElement('span');
        switchBg.className = 'cc-switch-bg';

        switchLabel.appendChild(checkbox);
        switchLabel.appendChild(switchBg);

        const labelText = document.createElement('span');
        labelText.className = 'cc-setting-label';
        labelText.textContent = 'Hovered';

        wrapper.appendChild(switchLabel);
        wrapper.appendChild(labelText);

        const devBtn = maintActions.querySelector('#cc-maint-dev-btn');
        if (devBtn) {
          maintActions.insertBefore(wrapper, devBtn);
        } else {
          maintActions.appendChild(wrapper);
        }
      } else {
        let controlsContainer = document.querySelector('.fancy-alert-controls');
        if (!controlsContainer) {
          controlsContainer = document.createElement('div');
          controlsContainer.className = 'fancy-alert-controls';
          Object.assign(controlsContainer.style, {
            position: 'fixed',
            top: '4px',
            right: '150px',
            zIndex: '9999',
            display: 'flex',
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

        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.style.marginRight = '5px';
        checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';
        checkboxLabel.prepend(checkbox);
        controlsContainer.appendChild(checkboxLabel);
      }

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

      if (checkbox && checkbox.checked) {
        enableDebugHover();
      } else if (checkbox) {
        enableNormalHover();
      }

      if (checkbox) {
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
  }

  // Export a pure data-driven MENU_CONFIG. Callback handlers are exported as
  // string names so the main module can resolve them to actual function refs.
  const MENU_CONFIG = [
    {
      category: 'Globální',
      items: [
        {
          type: 'toggle',
          id: 'cc-enable-clickable-header-boxes',
          storageKey: CLICKABLE_HEADER_BOXES_KEY,
          defaultValue: true,
          label: 'Boxy s tlačítkem "VÍCE" jsou klikatelné celé',
          tooltip: "Na domovské stránce roztáhne klikatelnou oblast u tlačítek 'Více' přes celý informační blok.",
          eventName: 'cc-clickable-header-boxes-toggled',
        },
        {
          type: 'group',
          id: 'cc-hide-home-panels',
          storageKey: 'cc_hide_home_panels',
          defaultValue: true,
          label: 'Domácí stránka - skryté panely',
          tooltip:
            'Umožňuje na domovské stránce skrývat nechtěné sekce najetím myší na jejich nadpis a kliknutím na tlačítko.',
          eventName: 'cc-hidden-panels-updated',
          groupToggleId: 'cc-hide-panels-group-toggle',
          groupBodyId: 'cc-hide-panels-group-body',
          collapsedKey: 'cc_hide_panels_collapsed',
          callback: 'updateHidePanelsUI',
          childrenHtml: `
            <div class="cc-form-field">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
                    <span title="Zde se zobrazují skryté panely. Pro jejich obnovení klikněte na křížek.">Skryté sekce:</span>
                    <button type="button" id="cc-restore-all-panels-btn" class="cc-button cc-button-black cc-button-small" style="padding: 4px 8px; font-size: 10px;" title="Obnoví zobrazení všech skrytých panelů na domovské stránce.">Obnovit vše</button>
                </div>
                <div class="cc-pill-input-container cc-hide-panels-scroll" id="cc-hide-panels-pill-container" style="min-height: 36px; max-height: 120px; overflow-y: auto; align-items: flex-start; align-content: flex-start; cursor: default; background: #fdfdfd; scrollbar-width: thin;">
                    <div class="cc-pills" id="cc-hide-panels-pills"></div>
                    <span id="cc-hide-panels-empty" style="color: #999; font-size: 11px; padding: 2px 4px;">Žádné skryté panely...</span>
                </div>
            </div>`,
        },
      ],
    },
    {
      category: 'Filmy a seriály',
      items: [
        {
          type: 'group',
          id: 'cc-show-ratings',
          storageKey: SHOW_RATINGS_KEY,
          defaultValue: true,
          label: 'Ukázat hodnocení',
          tooltip: 'Zobrazí tvé hodnocení (hvězdičky) vedle odkazů na filmy.',
          eventName: 'cc-ratings-updated',
          groupToggleId: 'cc-show-ratings-group-toggle',
          groupBodyId: 'cc-show-ratings-group-body',
          collapsedKey: SHOW_RATINGS_SECTION_COLLAPSED_KEY,
          callback: 'updateShowRatingsUI',
          childrenItems: [
            {
              type: 'toggle',
              id: 'cc-show-ratings-in-reviews',
              storageKey: SHOW_RATINGS_IN_REVIEWS_KEY,
              defaultValue: true,
              label: 'Ukazovat v recenzích',
              tooltip: 'Zobrazí hvězdičky i u odkazů uvnitř textů recenzí a komentářů.',
              eventName: 'cc-ratings-updated',
              callback: null,
            },
          ],
        },
        {
          type: 'toggle',
          id: 'cc-enable-gallery-image-links',
          storageKey: GALLERY_IMAGE_LINKS_ENABLED_KEY,
          defaultValue: true,
          label: 'Zobrazovat formáty obrázků v galerii',
          tooltip: 'Na stránce galerie přidá pod fotky odkazy pro rychlé zobrazení obrázků v originální velikosti.',
          eventName: 'cc-gallery-image-links-toggled',
        },
        {
          type: 'toggle',
          id: 'cc-ratings-estimate',
          storageKey: RATINGS_ESTIMATE_KEY,
          defaultValue: true,
          label: 'Vypočtení % při počtu hodnocení pod 10',
          tooltip: 'Matematicky dopočítá a zobrazí procentuální hodnocení i u filmů s méně než 10 hodnoceními.',
          eventName: 'cc-ratings-estimate-toggled',
          infoIcon: {
            url: 'https://i.imgur.com/8QG9gHq.jpeg',
            text: 'Když má film méně než 10 hodnocení, CSFD procenta skryje. Tato funkce je matematicky dopočítá.\\n\\n👉 Klikni pro ukázku',
          },
        },
        {
          type: 'toggle',
          id: 'cc-ratings-from-favorites',
          storageKey: RATINGS_FROM_FAVORITES_KEY,
          defaultValue: true,
          requiresLogin: true,
          label: 'Zobrazit hodnocení z průměru oblíbených',
          tooltip: 'Zobrazí doplňující průměrné hodnocení, vypočítané pouze z uživatelů, které máte v oblíbených.',
          eventName: 'cc-ratings-from-favorites-toggled',
        },
        {
          type: 'toggle',
          id: 'cc-add-ratings-date',
          storageKey: ADD_RATINGS_DATE_KEY,
          defaultValue: true,
          requiresLogin: true,
          label: 'Zobrazit datum hodnocení',
          tooltip: 'V hlavičce s vaším hodnocením filmu vždy zobrazí konkrétní datum, kdy jste film hodnotili.',
          eventName: 'cc-add-ratings-date-toggled',
        },
        {
          type: 'group',
          id: 'cc-hide-selected-reviews',
          storageKey: HIDE_SELECTED_REVIEWS_KEY,
          defaultValue: false,
          label: 'Skrýt recenze lidí',
          tooltip: 'Umožňuje skrýt komentáře a recenze od uživatelů, které nechcete číst.',
          eventName: 'cc-hide-selected-reviews-updated',
          groupToggleId: 'cc-hide-reviews-group-toggle',
          groupBodyId: 'cc-hide-reviews-group-body',
          collapsedKey: HIDE_REVIEWS_SECTION_COLLAPSED_KEY,
          callback: 'updateHideReviewsUI',
          childrenHtml: `
            <label class="cc-form-field">
                <span title="Zadejte uživatelské jméno a potvrďte klávesou Enter.">Jmena uživatelů (oddělte mezerou)</span>
                <div class="cc-pill-input-container" id="cc-hide-reviews-pill-container" title="Zadejte jméno uživatele a stiskněte Enter nebo Mezeru">
                    <div class="cc-pills" id="cc-hide-reviews-pills"></div>
                    <input type="text" data-bwignore="true" id="cc-hide-reviews-pill-input" placeholder="Přidat jméno..." />
                </div>
            </label>
            <div class="cc-sub-actions" style="margin-top: 6px;">
                <button type="button" id="cc-hide-reviews-apply" class="cc-button cc-button-red cc-button-small" title="Okamžitě uloží seznam a skryje vybrané recenze.">Uložit jména</button>
            </div>`,
        },
      ],
    },
    {
      category: 'Herci a tvůrci',
      items: [
        {
          type: 'toggle',
          id: 'cc-show-all-creator-tabs',
          storageKey: SHOW_ALL_CREATOR_TABS_KEY,
          defaultValue: true,
          label: 'Zobrazit všechny záložky tvůrce',
          tooltip: 'Na profilu herce/režiséra automaticky rozbalí menu "Více" a ukáže všechny záložky vedle sebe.',
          eventName: 'cc-show-all-creator-tabs-toggled',
          infoIcon: {
            url: 'https://i.imgur.com/aTrSU2X.png',
            text: 'Zobrazí všechny záložky (Režie, Scénář atd.) i když v nich má méně než 3 filmy.\\n\\n👉 Klikni pro ukázku',
          },
        },
        {
          type: 'group',
          id: 'cc-enable-creator-preview',
          storageKey: CREATOR_PREVIEW_ENABLED_KEY,
          defaultValue: true,
          label: 'Náhledy fotek tvůrců',
          tooltip: 'Po najetí myší na jméno tvůrce se objeví rychlý vyskakovací panel s jeho fotografií a detaily.',
          eventName: null,
          groupToggleId: 'cc-creator-preview-group-toggle',
          groupBodyId: 'cc-creator-preview-group-body',
          collapsedKey: CREATOR_PREVIEW_SECTION_COLLAPSED_KEY,
          callback: 'updateCreatorPreviewUI',
          childrenItems: [
            {
              type: 'toggle',
              id: 'cc-creator-preview-show-birth',
              storageKey: CREATOR_PREVIEW_SHOW_BIRTH_KEY,
              defaultValue: true,
              label: 'Zobrazovat datum narození',
              tooltip: 'Zobrazí datum narození/úmrtí a věk tvůrce.',
              callback: 'updateCreatorPreviewUI',
            },
            {
              type: 'toggle',
              id: 'cc-creator-preview-show-photo-from',
              storageKey: CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
              defaultValue: true,
              label: 'Zobrazovat „Photo from“',
              tooltip: 'Zobrazí copyright a film, ze kterého pochází fotka.',
              callback: 'updateCreatorPreviewUI',
            },
          ],
          childrenHtml: `
            <div class="cc-setting-row" style="margin-top: 2px;" title="Určuje, jak dlouho si prohlížeč bude pamatovat stažené fotky tvůrců. Delší čas šetří data a zrychluje web.">
                <span class="cc-setting-label cc-grow">Délka mezipaměti (Cache)</span>
                <select id="cc-creator-preview-cache-hours" class="cc-select-compact">
                    <option value="1">1 hodina</option>
                    <option value="12">12 hodin</option>
                    <option value="24">24 hodin</option>
                    <option value="168">7 dní</option>
                </select>
            </div>`,
        },
      ],
    },
  ];

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
  // IMAGE MODAL LOGIC
  // ==========================================
  function getOrCreateImageModal() {
    let overlay = document.getElementById('cc-image-preview-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'cc-image-preview-overlay';
    overlay.className = 'cc-version-info-overlay';

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

    const close = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => {
        overlay.querySelector('#cc-image-modal-img').src = '';
      }, 200);
    };

    overlay.querySelector('#cc-image-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    return overlay;
  }

  // ==========================================
  // MAIN INITIALIZATION
  // ==========================================
  async function addSettingsButton() {

    // 1. FIREFOX SHIELD: Wait for the HTML body and header to actually exist!
    if (document.readyState === 'loading') {
      await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve));
    }

    const loggedIn = isUserLoggedIn();

    const settingsButton = document.createElement('li');
    settingsButton.className = 'cc-menu-item';
    settingsButton.innerHTML = htmlContent;

    // Disable main actions if the user is not logged in
    if (!loggedIn) {
      // Buttons & Cloud Icon
      ['#cc-load-ratings-btn', '#cc-load-computed-btn', '#cc-sync-cloud-btn'].forEach((id) => {
        const btn = settingsButton.querySelector(id);
        if (btn) {
          btn.disabled = true;
          btn.title += ' (Vyžaduje přihlášení)';
        }
      });

      // Badges
      ['#cc-badge-red', '#cc-badge-black'].forEach((id) => {
        const badge = settingsButton.querySelector(id);
        if (badge) {
          badge.classList.add('is-disabled');
          badge.title += ' (Vyžaduje přihlášení)';
          badge.removeAttribute('tabindex'); // Prevent keyboard focus
          badge.removeAttribute('role');
        }
      });
    }

    const dropdown = settingsButton.querySelector('.dropdown-content');
    if (dropdown) {
      const blockEvent = (e) => e.stopPropagation();
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

    const updateCreatorPreviewUI = () => {
      const enabled = getBoolSetting(CREATOR_PREVIEW_ENABLED_KEY, true);
      const showBirth = getBoolSetting(CREATOR_PREVIEW_SHOW_BIRTH_KEY, true);
      const showPhoto = getBoolSetting(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY, true);
      const body = settingsButton.querySelector('#cc-creator-preview-group-body');
      const birthToggle = settingsButton.querySelector('#cc-creator-preview-show-birth');
      const photoToggle = settingsButton.querySelector('#cc-creator-preview-show-photo-from');

      if (birthToggle) birthToggle.disabled = !enabled;
      if (photoToggle) photoToggle.disabled = !enabled;
      if (body) body.classList.toggle('is-disabled', !enabled);

      window.dispatchEvent(
        new CustomEvent('cc-creator-preview-toggled', {
          detail: { enabled, showBirth, showPhotoFrom: showPhoto },
        }),
      );
    };

    const updateHideReviewsUI = () => {
      const enabled = getBoolSetting(HIDE_SELECTED_REVIEWS_KEY, false);
      const pillInput = settingsButton.querySelector('#cc-hide-reviews-pill-input');
      const hideApplyBtn = settingsButton.querySelector('#cc-hide-reviews-apply');
      const pillContainer = settingsButton.querySelector('#cc-hide-reviews-pill-container');
      const body = settingsButton.querySelector('#cc-hide-reviews-group-body');

      if (pillInput) pillInput.disabled = !enabled;
      if (hideApplyBtn) hideApplyBtn.disabled = !enabled;
      if (pillContainer) pillContainer.classList.toggle('is-disabled', !enabled);
      if (body) body.classList.toggle('is-disabled', !enabled);
    };

    const updateHidePanelsUI = () => {
      const enabled = getBoolSetting('cc_hide_home_panels', true);
      const body = settingsButton.querySelector('#cc-hide-panels-group-body');
      if (body) body.classList.toggle('is-disabled', !enabled);
    };

    const updateShowRatingsUI = () => {
      const enabled = getBoolSetting(SHOW_RATINGS_KEY, true);
      const childToggle = settingsButton.querySelector('#cc-show-ratings-in-reviews');
      const body = settingsButton.querySelector('#cc-show-ratings-group-body');

      if (childToggle) childToggle.disabled = !enabled;
      if (body) body.classList.toggle('is-disabled', !enabled);
    };

    // Resolve callback name strings (from settings-config) to the actual functions defined above.
    const CALLBACK_MAP = {
      updateHidePanelsUI,
      updateShowRatingsUI,
      updateCreatorPreviewUI,
      updateHideReviewsUI,
    };

    // This allows us to keep the MENU_CONFIG clean and not have to import functions into it, while still supporting callbacks for toggles/groups.
    const resolveCallbacksInConfig = (config) => {
      config.forEach((cat) => {
        cat.items.forEach((item) => {
          if (typeof item.callback === 'string' && CALLBACK_MAP[item.callback]) {
            item.callback = CALLBACK_MAP[item.callback];
          }
          if (item.childrenItems) {
            item.childrenItems.forEach((child) => {
              if (typeof child.callback === 'string' && CALLBACK_MAP[child.callback]) {
                child.callback = CALLBACK_MAP[child.callback];
              }
            });
          }
        });
      });
    };

    resolveCallbacksInConfig(MENU_CONFIG);

    const buildToggleHtml = (item) => {
      const isDisabled = item.requiresLogin && !loggedIn;
      const wrapperClass = isDisabled ? 'cc-requires-login' : '';
      const titleSuffix = isDisabled ? '\n(Vyžaduje přihlášení)' : '';
      const disabledAttr = isDisabled ? 'disabled' : '';

      return `
      <div class="cc-setting-row ${wrapperClass}" title="${escapeHtml((item.tooltip || '') + titleSuffix)}">
          <label class="cc-switch">
              <input type="checkbox" id="${item.id}" ${disabledAttr} />
              <span class="cc-switch-bg"></span>
          </label>
          <span class="cc-setting-label ${item.infoIcon ? 'cc-grow' : ''}">${escapeHtml(item.label)}</span>
          ${
            item.infoIcon
              ? `
              <div class="cc-setting-icons">
                  <div class="cc-info-icon" aria-label="${escapeHtml(item.infoIcon.text)}" data-image-url="${escapeHtml(item.infoIcon.url)}">
                      <svg width="14" height="14"><use href="#cc-icon-info"></use></svg>
                  </div>
              </div>`
              : ''
          }
      </div>`;
    };

    const buildGroupHtml = (item) => {
      const isDisabled = item.requiresLogin && !loggedIn;
      const wrapperClass = isDisabled ? 'cc-requires-login' : '';
      const titleSuffix = isDisabled ? '\n(Vyžaduje přihlášení)' : '';
      const disabledAttr = isDisabled ? 'disabled' : '';

      return `
      <div class="cc-setting-group ${wrapperClass}" id="${item.id}-group" style="margin-top: 2px;">
          <div class="cc-setting-row" title="${escapeHtml((item.tooltip || '') + titleSuffix)}">
              <label class="cc-switch">
                  <input type="checkbox" id="${item.id}" ${disabledAttr} />
                  <span class="cc-switch-bg"></span>
              </label>
              <div class="cc-setting-collapse-trigger" id="${item.groupToggleId}" aria-expanded="false">
                  <span class="cc-setting-label cc-grow">${escapeHtml(item.label)}</span>
                  <svg class="cc-chevron" width="14" height="14"><use href="#cc-icon-chevron"></use></svg>
              </div>
          </div>
          <div class="cc-setting-sub" id="${item.groupBodyId}" hidden>
              ${(item.childrenItems || []).map(buildToggleHtml).join('')}
              ${item.childrenHtml || ''}
          </div>
      </div>`;
    };

    const dynamicContainer = settingsButton.querySelector('#cc-dynamic-settings-container');
    if (dynamicContainer) {
      let generatedHtml = '';
      MENU_CONFIG.forEach((cat, idx) => {
        generatedHtml += `<h3 class="cc-category-title ${idx === 0 ? 'cc-category-first' : ''}">${escapeHtml(cat.category)}</h3>`;
        generatedHtml += `<div class="cc-config-list">`;
        cat.items.forEach((item) => {
          if (item.type === 'toggle') generatedHtml += buildToggleHtml(item);
          else if (item.type === 'group') generatedHtml += buildGroupHtml(item);
        });
        generatedHtml += `</div>`;
      });
      dynamicContainer.innerHTML = generatedHtml;
    }

    const togglesTracker = [];
    function bindToggle(selector, storageKey, defaultValue, eventName, toastOn, toastOff, callback = null) {
      const element = settingsButton.querySelector(selector);
      if (!element) return;

      element.checked = getBoolSetting(storageKey, defaultValue);
      togglesTracker.push({ element, storageKey, defaultValue });

      element.addEventListener('change', () => {
        localStorage.setItem(storageKey, String(element.checked));
        // skipSync: true so redraw triggers won't mistakenly try to push cloud updates constantly
        if (eventName)
          window.dispatchEvent(
            new CustomEvent(eventName, {
              detail: { enabled: element.checked, skipSync: true },
            }),
          );
        if (callback) callback();
      });
    }

    function bindGroupCollapse(groupId, toggleId, bodyId, storageKey) {
      const group = settingsButton.querySelector(`#${groupId}`);
      const toggle = settingsButton.querySelector(`#${toggleId}`);
      const body = settingsButton.querySelector(`#${bodyId}`);
      if (!toggle || !body) return;

      const setCollapsed = (collapsed) => {
        if (group) group.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        body.hidden = collapsed;
        localStorage.setItem(storageKey, String(collapsed));
      };

      setCollapsed(getBoolSetting(storageKey, true));
      toggle.addEventListener('click', () => {
        const currently = group?.classList.contains('is-collapsed');
        setCollapsed(!currently);
      });
    }

    MENU_CONFIG.forEach((cat) => {
      cat.items.forEach((item) => {
        if (item.type === 'toggle' || item.type === 'group') {
          bindToggle(`#${item.id}`, item.storageKey, item.defaultValue, item.eventName, null, null, item.callback);
        }
        if (item.type === 'group') {
          bindGroupCollapse(`${item.id}-group`, item.groupToggleId, item.groupBodyId, item.collapsedKey);
          (item.childrenItems || []).forEach((child) => {
            bindToggle(`#${child.id}`, child.storageKey, child.defaultValue, child.eventName, null, null, child.callback);
          });
        }
      });
    });

    initializeVersionUi(settingsButton).catch(() => undefined);
    initializeRatingsLoader(settingsButton);
    initializeRatingsSync(settingsButton, getCurrentUserSlug);

    const cacheSelect = settingsButton.querySelector('#cc-creator-preview-cache-hours');
    if (cacheSelect) {
      cacheSelect.value = localStorage.getItem(CREATOR_PREVIEW_CACHE_HOURS_KEY) || '24';
      cacheSelect.addEventListener('change', () => {
        localStorage.setItem(CREATOR_PREVIEW_CACHE_HOURS_KEY, cacheSelect.value);
        showSettingsInfoToast('Délka mezipaměti uložena.');
      });
    }

    const pillInput = settingsButton.querySelector('#cc-hide-reviews-pill-input');
    const pillsWrapper = settingsButton.querySelector('#cc-hide-reviews-pills');
    const pillContainer = settingsButton.querySelector('#cc-hide-reviews-pill-container');
    const hideApplyBtn = settingsButton.querySelector('#cc-hide-reviews-apply');

    let currentPills = [];
    try {
      const saved = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY);
      if (saved) currentPills = JSON.parse(saved);
    } catch (e) {}

    const renderPills = () => {
      if (!pillsWrapper) return;
      pillsWrapper.innerHTML = '';
      currentPills.forEach((pill, index) => {
        const pillEl = document.createElement('span');
        pillEl.className = 'cc-pill';
        pillEl.textContent = pill;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'cc-pill-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          currentPills.splice(index, 1);
          renderPills();
        };

        pillEl.appendChild(removeBtn);
        pillsWrapper.appendChild(pillEl);
      });
    };

    const addPill = (value) => {
      const trimmed = value.trim();
      if (trimmed && !currentPills.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
        currentPills.push(trimmed);
        renderPills();
      }
      if (pillInput) pillInput.value = '';
    };

    if (pillInput) {
      pillInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
          e.preventDefault();
          addPill(pillInput.value);
        } else if (e.key === 'Backspace' && pillInput.value === '' && currentPills.length > 0) {
          currentPills.pop();
          renderPills();
        }
      });
      pillInput.addEventListener('blur', () => addPill(pillInput.value));
    }

    if (pillContainer) {
      pillContainer.addEventListener('click', () => {
        if (!pillContainer.classList.contains('is-disabled')) pillInput?.focus();
      });
    }

    if (hideApplyBtn) {
      hideApplyBtn.addEventListener('click', () => {
        if (pillInput && pillInput.value.trim()) addPill(pillInput.value);
        localStorage.setItem(HIDE_SELECTED_REVIEWS_LIST_KEY, JSON.stringify(currentPills));
        window.dispatchEvent(new CustomEvent('cc-hide-selected-reviews-updated'));
        showSettingsInfoToast('Seznam skrytých uživatelů byl uložen.');
      });
    }

    renderPills();
    updateCreatorPreviewUI();
    updateHideReviewsUI();
    updateHidePanelsUI();
    updateShowRatingsUI();

    let currentPanelPills = [];
    try {
      const savedPanels = localStorage.getItem('cc_hidden_panels_list');
      if (savedPanels) currentPanelPills = JSON.parse(savedPanels);
    } catch (e) {}

    const renderPanelPills = () => {
      const wrapper = settingsButton.querySelector('#cc-hide-panels-pills');
      const emptyText = settingsButton.querySelector('#cc-hide-panels-empty');
      if (!wrapper || !emptyText) return;

      wrapper.innerHTML = '';

      if (currentPanelPills.length === 0) {
        emptyText.style.display = 'block';
      } else {
        emptyText.style.display = 'none';
        currentPanelPills.forEach((pill, index) => {
          const pillEl = document.createElement('span');
          pillEl.className = 'cc-pill';
          pillEl.textContent = pill;

          const removeBtn = document.createElement('span');
          removeBtn.className = 'cc-pill-remove';
          removeBtn.innerHTML = '&times;';
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            currentPanelPills.splice(index, 1);
            localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentPanelPills));
            renderPanelPills();
            window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
          };

          pillEl.appendChild(removeBtn);
          wrapper.appendChild(pillEl);
        });
      }
    };

    renderPanelPills();
    window.addEventListener('cc-hidden-panels-updated', () => {
      try {
        currentPanelPills = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
      } catch (e) {}
      renderPanelPills();
    });

    const restoreAllPanelsBtn = settingsButton.querySelector('#cc-restore-all-panels-btn');
    if (restoreAllPanelsBtn) {
      restoreAllPanelsBtn.addEventListener('click', () => {
        if (currentPanelPills.length > 0) {
          currentPanelPills = [];
          localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentPanelPills));
          renderPanelPills();
          window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
          showSettingsInfoToast('Všechny panely byly obnoveny.');
        } else {
          showSettingsInfoToast('Žádné panely ke smazání.');
        }
      });
    }

    const devBtn = settingsButton.querySelector('#cc-maint-dev-btn');

    const updateDevState = () => {
      // 1. Get the current state
      const isDev = localStorage.getItem('cc_dev_mode') === 'true';

      // 2. Update the button text (safe because devBtn is in memory)
      if (devBtn) {
        devBtn.textContent = isDev ? 'DEV: ON' : 'DEV: OFF';
      }

      // 3. Firefox safety check: Wait for the body to exist before touching it
      if (!document.body) {
        window.addEventListener('DOMContentLoaded', updateDevState, {
          once: true,
        });
        return;
      }

      // 4. Update the body class
      document.body.classList.toggle('cc-dev-mode-active', isDev);
    };

    updateDevState();

    if (devBtn) {
      devBtn.addEventListener('click', () => {
        const isDev = localStorage.getItem('cc_dev_mode') === 'true';
        localStorage.setItem('cc_dev_mode', String(!isDev));
        updateDevState();
        showSettingsInfoToast(`Vývojářský režim: ${!isDev ? 'ZAPNUT' : 'VYPNUT'}`);
      });
    }

    // --------------------------------------------------------
    // Homepage Panels Visibility Logic
    // --------------------------------------------------------
    const updatePanelsFeatureState = () => {
      // Evaluate the setting. (Default is true, so we check if it's explicitly 'false')
      const isEnabled = localStorage.getItem('cc_hide_home_panels') !== 'false';

      // Wait for body to exist before toggling the class (Firefox safety)
      if (!document.body) {
        window.addEventListener('DOMContentLoaded', updatePanelsFeatureState, { once: true });
        return;
      }

      document.body.classList.toggle('cc-panels-feature-enabled', isEnabled);
    };

    // 1. Run immediately on load
    updatePanelsFeatureState();

    // 2. Listen for changes from the settings menu toggle
    window.addEventListener('cc-hidden-panels-updated', updatePanelsFeatureState);

    const syncControlsFromStorage = () => {
      togglesTracker.forEach((t) => (t.element.checked = getBoolSetting(t.storageKey, t.defaultValue)));
      updateCreatorPreviewUI();
      updateHideReviewsUI();
      updateHidePanelsUI();
      updateShowRatingsUI();
      updateDevState();
    };

    settingsButton.querySelector('#cc-maint-reset-btn')?.addEventListener('click', () => {
      if (!confirm('Opravdu chcete vyresetovat všechna nastavení (tlačítka a skryté uživatele) do výchozího stavu?'))
        return;

      togglesTracker.forEach((t) => localStorage.removeItem(t.storageKey));

      localStorage.removeItem(HIDE_SELECTED_REVIEWS_LIST_KEY);
      localStorage.removeItem(HIDE_REVIEWS_SECTION_COLLAPSED_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_SECTION_COLLAPSED_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_CACHE_HOURS_KEY);
      localStorage.removeItem(SHOW_RATINGS_KEY);
      localStorage.removeItem(SHOW_RATINGS_IN_REVIEWS_KEY);
      localStorage.removeItem(SHOW_RATINGS_SECTION_COLLAPSED_KEY);
      localStorage.removeItem('cc_hide_home_panels');
      localStorage.removeItem('cc_hidden_panels_list');
      localStorage.removeItem('cc_hide_panels_collapsed');
      localStorage.removeItem('cc_dev_mode');

      currentPills = [];
      renderPills();

      currentPanelPills = [];
      renderPanelPills();

      syncControlsFromStorage();

      window.dispatchEvent(
        new CustomEvent('cc-gallery-image-links-toggled', {
          detail: { enabled: true },
        }),
      );
      window.dispatchEvent(new CustomEvent('cc-hide-selected-reviews-updated'));
      window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
      window.dispatchEvent(new CustomEvent('cc-ratings-updated', { detail: { skipSync: true } }));
      showSettingsInfoToast('Všechna nastavení byla vrácena na výchozí hodnoty.');
    });

    const dbDeleteBtn = settingsButton.querySelector('#cc-maint-clear-db-btn');
    if (dbDeleteBtn) {
      dbDeleteBtn.addEventListener('click', async () => {
        const originalText = dbDeleteBtn.textContent;

        dbDeleteBtn.textContent = 'Mažu...';
        dbDeleteBtn.style.opacity = '0.5';
        dbDeleteBtn.style.pointerEvents = 'none';

        try {
          await deleteIndexedDB(INDEXED_DB_NAME);
          invalidateRatingsModalCache();
          window.dispatchEvent(
            new CustomEvent('cc-ratings-updated', {
              detail: { skipSync: true },
            }),
          );
          showSettingsInfoToast('IndexedDB byla smazána.');
        } catch (error) {
          console.error('[CC] Failed to delete IndexedDB:', error);
          showSettingsInfoToast('Smazání DB selhalo.');
        } finally {
          dbDeleteBtn.textContent = originalText;
          dbDeleteBtn.style.opacity = '';
          dbDeleteBtn.style.pointerEvents = '';
        }
      });
    }

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
          <button type="button" class="cc-button cc-button-red cc-button-small" id="cc-lc-delete-all-btn">Smazat vše</button>
          <button type="button" class="cc-button cc-button-black cc-button-small" id="cc-lc-close-btn">Zavřít</button>
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
          <td class="cc-lc-action">
             <button type="button" class="cc-button cc-button-red cc-button-small cc-lc-delete-one" data-key="${escapeHtml(key)}">Smazat</button>
          </td>
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
            detail: {
              enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true),
            },
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
            detail: {
              enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true),
            },
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

    // Setup the dedicated list button in the settings menu
    const listBtn = settingsButton.querySelector('#cc-open-ratings-btn');
    if (listBtn) {
      const handler = (e) => {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keydown') e.preventDefault();

        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, 'all', ratingsModalOptions).catch((err) =>
          console.error(`[CC] Failed to open ratings table via icon button:`, err),
        );
      };

      listBtn.addEventListener('click', handler);
      listBtn.addEventListener('keydown', handler);
    }

    const badgeRefreshOptions = {
      isUserLoggedIn,
      getCurrentUserSlug,
      getMostFrequentUserSlug,
    };
    const refreshBadgesSafely = () =>
      refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((err) =>
        console.error('[CC] Failed to refresh badges:', err),
      );

    refreshBadgesSafely();
    window.setTimeout(refreshBadgesSafely, 1200);

    settingsButton.addEventListener('click', (e) => {
      const infoIcon = e.target.closest('.cc-info-icon[data-image-url]');
      if (!infoIcon) return;

      e.preventDefault();
      e.stopPropagation();

      const url = infoIcon.getAttribute('data-image-url');
      const titleText =
        infoIcon.closest('.cc-setting-row')?.querySelector('.cc-setting-label')?.textContent || 'Ukázka funkce';

      if (url) {
        const modal = getOrCreateImageModal();
        modal.querySelector('#cc-image-modal-title').textContent = titleText;
        modal.querySelector('#cc-image-modal-img').src = url;
        modal.classList.add('is-open');
      }
    });

    initializeSettingsMenuHover(settingsButton);

    let autoSyncTimeout;
    window.addEventListener('cc-ratings-updated', (e) => {
      invalidateRatingsModalCache();
      refreshBadgesSafely();

      if (e && e.detail && e.detail.skipSync) {
        return;
      }

      clearTimeout(autoSyncTimeout);
      autoSyncTimeout = setTimeout(() => {
        performCloudSync();
      }, 3000);
    });

    const SYNC_COOLDOWN_MS = 1000 * 60 * 60 * 2;
    const lastAutoSync = Number.parseInt(localStorage.getItem('cc_last_startup_sync') || '0', 10);

    if (Date.now() - lastAutoSync > SYNC_COOLDOWN_MS) {
      console.log('☁️ [CC Sync] Running startup background sync...');
      localStorage.setItem('cc_last_startup_sync', String(Date.now()));
      setTimeout(() => {
        performCloudSync();
      }, 2500);
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

  const CACHE_HOURS_KEY = 'cc_creator_preview_cache_hours';
  const CREATOR_LINK_SELECTOR = 'a[href*="/tvurce/"], a[href*="/tvorca/"]';

  let previewRoot;
  let activeAnchor;
  let hoverToken = 0;
  let mouseX = 0,
    mouseY = 0;

  // Tracker for active network requests to prevent duplicate fetches
  const inflightRequests = new Map();

  function ensurePreview() {
    if (previewRoot) return;
    previewRoot = document.createElement('div');
    previewRoot.className = 'cc-creator-preview';
    document.body.appendChild(previewRoot);
  }

  function hidePreview() {
    if (previewRoot) previewRoot.classList.remove('is-visible');
  }

  function positionPreview() {
    if (!previewRoot || !previewRoot.classList.contains('is-visible')) return;
    const rect = previewRoot.getBoundingClientRect();
    const x = Math.min(window.innerWidth - rect.width - 10, Math.max(10, mouseX + 18));
    const y = Math.min(window.innerHeight - rect.height - 10, Math.max(10, mouseY + 18));
    previewRoot.style.left = `${x}px`;
    previewRoot.style.top = `${y}px`;
  }

  // Age calculator (Handles normal life and calculating age at death)
  function calculateAge(birthStr, deathStr) {
    const extractDate = (str) => {
      const m = str?.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
      return m ? new Date(m[3], m[2] - 1, m[1]) : null;
    };
    const bDate = extractDate(birthStr);
    if (!bDate) return null;

    const endDate = extractDate(deathStr) || new Date();
    let age = endDate.getFullYear() - bDate.getFullYear();
    if (
      endDate.getMonth() < bDate.getMonth() ||
      (endDate.getMonth() === bDate.getMonth() && endDate.getDate() < bDate.getDate())
    ) {
      age--;
    }
    return age;
  }

  // Cleans up expired cache items randomly so localStorage doesn't bloat
  function cleanExpiredCache() {
    const maxAgeMs = parseInt(localStorage.getItem(CACHE_HOURS_KEY) || '24', 10) * 60 * 60 * 1000;
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cc_creator_')) {
        // V5 cache bump: Instantly removes older versions with transparent pixel bugs
        if (!key.startsWith('cc_creator_v5_')) {
          localStorage.removeItem(key);
          continue;
        }
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (now - item.timestamp > maxAgeMs) localStorage.removeItem(key);
        } catch {
          localStorage.removeItem(key);
        }
      }
    }
  }

  async function fetchCreatorData(url) {
    const slug = url.match(/\/(tvurce|tvorca)\/(\d+-[^/]+)/i)?.[2];
    if (!slug) return null;

    // 1. Check persistent Cache (Using v5 prefix)
    const cacheKey = `cc_creator_v5_${slug}`;
    const maxAgeMs = parseInt(localStorage.getItem(CACHE_HOURS_KEY) || '24', 10) * 60 * 60 * 1000;

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() - cached.timestamp < maxAgeMs) return cached.data;
    } catch (e) {}

    // 2. Prevent duplicate fetches if already fetching this exact creator
    if (inflightRequests.has(slug)) {
      return await inflightRequests.get(slug);
    }

    // 3. Fetch fresh data and save the promise to the inflight map
    const fetchPromise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

        // Scrape Data cleanly
        const name = doc.querySelector('h1')?.textContent.trim() || 'Tvůrce';
        const imgEl = doc.querySelector('.creator-profile figure img, .creator-profile-header figure img');
        let img = imgEl?.src || null;

        // Reject CSFD's 1x1 transparent placeholder GIFs so we correctly show the native empty silhouette
        if (img && (img.startsWith('data:image') || imgEl.classList.contains('empty-image'))) {
          img = null;
        }

        const flag = doc.querySelector('.creator-profile-details img.flag')?.src || null;

        // Life details
        const details = Array.from(doc.querySelectorAll('.creator-profile-details p'));
        const birthP = details.find((p) => /nar\.|born|naroden/i.test(p.textContent));
        const deathP = details.find((p) => /zem\.|zomr|died/i.test(p.textContent));

        // Clear out locations AND native CSFD age spans (.info) so we don't duplicate them
        const cleanLifeText = (el) => {
          if (!el) return null;
          const clone = el.cloneNode(true);
          clone.querySelector('.info-place')?.remove();
          clone.querySelectorAll('.info').forEach((info) => info.remove());
          return clone.textContent.replace(/\s+/g, ' ').trim();
        };

        // Photo details
        const footer = doc.querySelector('.creator-profile-footer');
        const movieL = footer?.querySelector('a.item-movie');
        const copyright = footer?.querySelector('.item-text')?.textContent;
        let photoSource = null;
        let isMovie = false;

        if (movieL) {
          photoSource = movieL.textContent.trim() + ' ' + (movieL.nextElementSibling?.textContent.trim() || '');
          isMovie = true;
        } else if (copyright) {
          // Robust clean: Aggressively strips combinations of Photo, Foto, Copyright, (c), ©, colons, dashes and spaces
          photoSource = copyright
            .trim()
            .replace(/^(?:photo|foto|copyright|\(c\)|©|:|-|\s)+/gi, '')
            .trim();
        }

        const data = {
          name,
          img,
          flag,
          birthText: cleanLifeText(birthP),
          deathText: cleanLifeText(deathP),
          photoSource,
          isMovie,
        };

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));

        // Small chance to trigger a garbage collection of old cache items
        if (Math.random() < 0.1) cleanExpiredCache();

        return data;
      } catch {
        return null;
      } finally {
        // Always remove from the inflight tracker when finished (whether success or fail)
        inflightRequests.delete(slug);
      }
    })();

    inflightRequests.set(slug, fetchPromise);
    return await fetchPromise;
  }

  async function showPreviewForAnchor(anchor, token) {
    ensurePreview();
    const isEnabled = localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY) !== 'false';
    if (!isEnabled) return;

    // Force the URL to bypass the 302 Redirect to /prehled/ to speed up the network tab
    let url = anchor.href.split('?')[0].split('#')[0];
    url = url.replace(/\/(prehled|prehlad|diskuze|galerie|zajimavosti|biografie)\/?$/i, '/');
    const segment = location.hostname.endsWith('.sk') ? 'prehlad' : 'prehled';
    url = url.endsWith('/') ? `${url}${segment}/` : `${url}/${segment}/`;

    const data = await fetchCreatorData(url);

    if (token !== hoverToken || activeAnchor !== anchor) return;
    if (!data) return;

    const showBirth = localStorage.getItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY) !== 'false';
    const showPhoto = localStorage.getItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY) !== 'false';
    const age = calculateAge(data.birthText, data.deathText);

    // Use CSFD's native 1x1 pixel and empty-image class to render the native silhouette perfectly
    const emptySrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const imgHtml = data.img
      ? `<img class="cc-creator-preview-image" src="${escapeHtml$3(data.img)}" onerror="this.onerror=null;this.src='${emptySrc}';this.classList.add('empty-image');" />`
      : `<img class="cc-creator-preview-image empty-image" src="${emptySrc}" />`;

    // Dynamic layout for birth/death logic
    let lifeHtml = '';
    if (showBirth) {
      const bDateMatch = data.birthText?.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4})/);
      const dDateMatch = data.deathText?.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4})/);

      if (data.deathText && bDateMatch) {
        const bDate = bDateMatch[1].replace(/\s/g, '');
        const dDate = dDateMatch ? dDateMatch[1].replace(/\s/g, '') : '?';
        lifeHtml += `
              <div class="cc-creator-preview-meta-line cc-creator-preview-meta-birth" style="text-align: center;">
                  <span>nar. ${bDate} &rarr; ${dDate}</span>
              </div>
              ${age ? `<div class="cc-creator-preview-meta-line cc-creator-preview-meta-age" style="margin-top: 1px;">(${age} let)</div>` : ''}
          `;
      } else if (data.birthText) {
        lifeHtml += `
              <div class="cc-creator-preview-meta-line cc-creator-preview-meta-birth">
                  <span>${escapeHtml$3(data.birthText)}</span>
                  ${!data.deathText && age ? `<span class="cc-creator-preview-meta-birth-age-inline">(${age} let)</span>` : ''}
              </div>
          `;
      }
    }

    const photoHtml =
      showPhoto && data.photoSource
        ? `
      <div class="cc-creator-preview-meta-line cc-creator-preview-meta-photo ${data.isMovie ? 'is-movie' : 'is-copyright'}" style="margin-top: 4px;">
          <span class="cc-creator-preview-meta-photo-source">${escapeHtml$3(data.photoSource)}</span>
      </div>
  `
        : '';

    previewRoot.innerHTML = `
      <div class="cc-creator-preview-card">
          ${imgHtml}
          <div class="cc-creator-preview-name">
              <span>${escapeHtml$3(data.name)}</span>
              ${data.flag ? `<img class="cc-creator-preview-name-flag" src="${escapeHtml$3(data.flag)}" />` : ''}
          </div>
          <div class="cc-creator-preview-meta" ${!showBirth && !showPhoto ? 'hidden' : ''}>
              ${lifeHtml}
              ${photoHtml}
          </div>
      </div>
  `;

    previewRoot.classList.add('is-visible');
    positionPreview();
  }

  function initializeCreatorHoverPreview() {
    if (/^\/(tvurce|tvorca)\/\d+-[^/]+\//i.test(location.pathname)) return;

    document.addEventListener(
      'mousemove',
      (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        positionPreview();
      },
      true,
    );

    document.addEventListener(
      'mouseover',
      (e) => {
        const anchor = e.target.closest(CREATOR_LINK_SELECTOR);
        if (!anchor || activeAnchor === anchor) return;

        activeAnchor = anchor;
        hoverToken++;
        showPreviewForAnchor(anchor, hoverToken);
      },
      true,
    );

    // FIXED BUG: Removing the bad check allows the modal to close the moment the mouse leaves the link boundaries
    document.addEventListener(
      'mouseout',
      (e) => {
        if (!activeAnchor) return;
        if (e.relatedTarget instanceof Element && activeAnchor.contains(e.relatedTarget)) return;

        activeAnchor = null;
        hoverToken++;
        hidePreview();
      },
      true,
    );

    window.addEventListener('scroll', positionPreview, true);
    window.addEventListener('cc-creator-preview-toggled', () => {
      if (localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY) === 'false') {
        hidePreview();
        activeAnchor = null;
        hoverToken++;
      } else if (activeAnchor) {
        hoverToken++;
        showPreviewForAnchor(activeAnchor, hoverToken);
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
  })();

})();
