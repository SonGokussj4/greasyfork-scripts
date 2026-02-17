import { SETTINGSNAME, INDEXED_DB_NAME, RATINGS_STORE_NAME } from './config.js';
import { deleteItemFromIndexedDB, getAllFromIndexedDB, getSettings, saveToIndexedDB } from './storage.js';
import { delay } from './utils.js';

export class Csfd {
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
