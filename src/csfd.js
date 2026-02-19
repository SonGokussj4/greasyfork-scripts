import { SETTINGSNAME, INDEXED_DB_NAME, RATINGS_STORE_NAME, GALLERY_IMAGE_LINKS_ENABLED_KEY } from './config.js';
import { deleteItemFromIndexedDB, getAllFromIndexedDB, getSettings, saveToIndexedDB } from './storage.js';
import { delay } from './utils.js';

const PROFILE_LINK_SELECTOR =
  'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

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
    const userEl = document.querySelector(PROFILE_LINK_SELECTOR);
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
    const userHref = this.userUrl || (await this.getCurrentUser());
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
    this.userUrl = await this.getCurrentUser();
    console.debug('🟣 User URL:', this.userUrl);
    this.username = await this.getUsername();
    console.debug('🟣 Username:', this.username);
    this.storageKey = `${'CSFD-Compare'}_${this.username || 'guest'}`;
    console.debug('🟣 Storage Key:', this.storageKey);
    this.userSlug = this.userUrl?.match(/^\/uzivatel\/(\d+-[^/]+)\//)?.[1];
    console.debug('🟣 User Slug:', this.userSlug);
    this.userRatingsUrl = this.userUrl
      ? this.userUrl + (location.origin.endsWith('sk') ? 'hodnotenia' : 'hodnoceni')
      : undefined;
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
    const searchRoot = this.csfdPage || document;
    return Array.from(searchRoot.querySelectorAll('a[href*="/film/"]')).filter((link) => {
      const href = link.getAttribute('href') || '';
      if (!/\/\d+-/.test(href)) {
        return false;
      }

      if (this.isOnCreatorPage() && link.closest('.creator-filmography')) {
        return false;
      }

      if (link.matches('.edit-review, [class*="edit-review"]') || link.querySelector('.icon-edit-square')) {
        return false;
      }

      const isInRelatedBox = Boolean(link.closest('section.box-related, div.box-related, .box-related'));
      if (isInRelatedBox) {
        return link.matches('a.film-title-name[href*="/film/"]');
      }

      if (/[?&]page=\d+/i.test(href)) {
        return false;
      }

      if (/[?&]comment=\d+/i.test(href)) {
        return false;
      }

      if (/\/(galerie|videa?|tvurci|obsahy?)\//.test(href)) {
        return false;
      }

      if (link.closest('.film-posters, .box-video, .gallery, .aside-movie-profile')) {
        return false;
      }

      if (link.closest('.box-more-bar, .pagination, .paginator, .box-pagination, .page-navigation, .pages')) {
        return false;
      }

      if (link.closest('.article-header-review-action, .article-header-review')) {
        return false;
      }

      if (link.closest('.film-header-name, .film-header-name-control')) {
        return false;
      }

      if (
        link.closest(
          '#cc-ratings-table-modal-overlay, .cc-ratings-table-overlay, .cc-ratings-table-modal, .cc-rating-detail-overlay',
        )
      ) {
        return false;
      }

      if (this.shouldSkipProfileSectionLink(link)) {
        return false;
      }

      const linkText = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
      if (linkText === 'více' || linkText === 'viac') {
        return false;
      }

      if (link.closest('.span-more-small, .more, .article-more')) {
        return false;
      }

      if (this.isOnUserReviewsPage() && !link.matches('a.film-title-name')) {
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

  isOnCreatorPage() {
    const path = location.pathname || '';
    return /^\/(tvurce|tvorca)\/\d+-[^/]+\//i.test(path);
  }

  isOnUserProfilePage() {
    const path = location.pathname || '';
    const match = path.match(/^\/uzivatel\/(\d+-[^/]+)\//i);
    return match ? match[1] : undefined;
  }

  isOnOtherUserProfilePage() {
    const pageUserSlug = this.isOnUserProfilePage();
    if (!pageUserSlug || !this.userSlug) {
      return false;
    }

    return pageUserSlug !== this.userSlug;
  }

  isOnUserOverviewPage() {
    const path = location.pathname || '';
    return /^\/uzivatel\/\d+-[^/]+\/(prehled|prehlad)(\/|$)/i.test(path);
  }

  isOnUserReviewsPage() {
    const path = location.pathname || '';
    return /^\/uzivatel\/\d+-[^/]+\/(recenze|recenzie)(\/|$)/i.test(path);
  }

  shouldSkipProfileSectionLink(link) {
    if (!this.isOnUserOverviewPage()) {
      return false;
    }

    const explicitReviewOrRatingContainer = link.closest(
      '[id*="review" i], [id*="recenz" i], [id*="rating" i], [id*="hodnoc" i], [id*="hodnoten" i], [class*="review" i], [class*="recenz" i], [class*="rating" i], [class*="hodnoc" i], [class*="hodnoten" i]',
    );
    const explicitDiaryContainer = link.closest(
      '[id*="diar" i], [id*="denik" i], [id*="denic" i], [class*="diar" i], [class*="denik" i], [class*="denic" i]',
    );

    if (explicitReviewOrRatingContainer && !explicitDiaryContainer) {
      return true;
    }

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
        if (
          sectionTitle.includes('poslední recenze') ||
          sectionTitle.includes('posledne recenzie') ||
          sectionTitle.includes('poslední hodnocení') ||
          sectionTitle.includes('posledné hodnotenia')
        ) {
          return true;
        }

        if (sectionTitle.includes('poslední deníček') || sectionTitle.includes('posledny dennik')) {
          return false;
        }
      }

      sectionNode = sectionNode.parentElement;
    }

    return false;
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
          const computedCount = typeof ratingRecord === 'object' ? ratingRecord?.computedCount : NaN;
          const starElement = this.createStarElement(ratingValue, isComputed, computedCount);
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
    if (!Number.isFinite(ratingValue)) {
      return undefined;
    }

    const starRating = document.createElement('span');
    starRating.className = 'star-rating cc-own-rating';

    if (outlined) {
      starRating.classList.add('cc-own-rating-foreign-profile');
    }

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

    if (isComputed && Number.isFinite(computedCount) && computedCount > 0) {
      const sup = document.createElement('sup');
      sup.className = 'cc-own-rating-computed-count';
      sup.textContent = ` (${computedCount})`;
      starRating.appendChild(sup);
    }

    return starRating;
  }

  async addStars() {
    if (location.href.includes('/zebricky/') || location.href.includes('/rebricky/')) {
      return;
    }

    if (this.isOnUserReviewsPage() && !this.isOnOtherUserProfilePage()) {
      return;
    }

    if (this.isOnOwnRatingsPage()) {
      return;
    }

    if (this.isOnForeignRatingsPage()) {
      await this.addComparisonColumnOnForeignRatingsPage();
      return;
    }

    const links = this.getCandidateFilmLinks();
    const outlinedOnThisPage = this.isOnOtherUserProfilePage();
    for (let link of links) {
      if (link.dataset.ccStarAdded === 'true') {
        continue;
      }

      const movieId = await this.getMovieIdFromUrl(link.getAttribute('href'));
      const ratingRecord = this.stars[movieId];
      if (!ratingRecord) continue;

      const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
      const isComputed = typeof ratingRecord === 'object' && ratingRecord?.computed === true;
      const computedCount = typeof ratingRecord === 'object' ? ratingRecord?.computedCount : NaN;
      const starElement = this.createStarElement(ratingValue, isComputed, computedCount, outlinedOnThisPage);
      if (!starElement) continue;

      const headingAncestor = link.closest('h1, h2, h3, h4, h5, h6');

      if (headingAncestor) {
        headingAncestor.appendChild(starElement);
      } else {
        link.insertAdjacentElement('afterend', starElement);
      }
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
