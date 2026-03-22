import {
  GALLERY_IMAGE_LINKS_ENABLED_KEY,
  HIDE_SELECTED_REVIEWS_KEY,
  HIDE_SELECTED_REVIEWS_LIST_KEY,
  INDEXED_DB_NAME,
  LINK_ICONS_ENABLED_KEY,
  LINK_ICONS_POSITION_KEY,
  RATINGS_STORE_NAME,
  SETTINGSNAME,
  SELF_REPLY_IN_DISCUSSIONS_KEY,
  SHOW_RATINGS_IN_DIARIES_KEY,
  SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY,
  SHOW_RATINGS_IN_REVIEWS_KEY,
  SHOW_RATINGS_KEY,
  getCsfdPathAliasPattern,
  getCsfdPathSegment,
  getCsfdPathSegmentPattern,
  matchesCsfdTextVariant,
  normalizeCsfdShowType,
} from './config.js';
import { buildRatingRecordId, reconcileUserRatingRecords } from './ratings-records.js';
import {
  applyConfiguredLinkIcons,
  LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS,
  refreshConfiguredLinkIcons,
} from './link-icons.js';
import { deleteItemFromIndexedDB, getAllFromIndexedDB, getSettings, saveToIndexedDB } from './storage.js';
import {
  delay,
  extractUserSlug,
  getFeatureState,
  getMovieIdFromUrl,
  getProfileLinkElement,
  parseRatingFromStars,
} from './utils.js';

const OVERVIEW_SEGMENTS_PATTERN = getCsfdPathSegmentPattern('overview');
const CREATOR_PATHS_PATTERN = getCsfdPathAliasPattern('creator');
const DISCUSSION_PATHS_PATTERN = getCsfdPathAliasPattern('discussion');
const GALLERY_PATHS_PATTERN = getCsfdPathAliasPattern('gallery');
const RATINGS_SEGMENTS_PATTERN = getCsfdPathSegmentPattern('ratings');
const REVIEWS_SEGMENTS_PATTERN = getCsfdPathSegmentPattern('reviews');

export class Csfd {
  constructor(pageContent) {
    this.csfdPage = pageContent;
    this.stars = {};
    this.storageKey = undefined;
    this.userUrl = undefined;
    this.username = undefined;
    this.userRatingsUrl = undefined;
    this.isLoggedIn = false;
    this.userSlug = undefined;

    // OPTIMIZATION: Cache parsed lists to avoid calling JSON.parse in high-frequency DOM operations
    this.cachedHiddenPanelsList = [];
    this.cachedHiddenReviewsList = [];
    this.updateCachedLists();
  }

  // OPTIMIZATION: One method to update all memory-cached local storage lists
  updateCachedLists() {
    try {
      this.cachedHiddenPanelsList = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
    } catch (e) {
      this.cachedHiddenPanelsList = [];
    }

    try {
      const raw = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY) || '[]';
      this.cachedHiddenReviewsList = JSON.parse(raw).map((s) => s.toLowerCase());
    } catch (e) {
      this.cachedHiddenReviewsList = [];
    }
  }

  getCurrentUser() {
    const userEl = getProfileLinkElement();
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

    this.userSlug = extractUserSlug(this.userUrl);
    console.debug('🟣 User Slug:', this.userSlug);

    this.userRatingsUrl = this.userUrl ? this.userUrl + getCsfdPathSegment('ratings') : undefined;
    console.debug('🟣 User Ratings URL:', this.userRatingsUrl);

    const settings = await getSettings(SETTINGSNAME);
    this.stars = settings?.stars || {};

    await this.loadStarsFromIndexedDb();
    await this.syncCurrentPageRatingWithIndexedDb();

    try {
      if (getFeatureState('cc_show_all_creator_tabs')) this.showAllCreatorTabs();
      if (getFeatureState('cc_clickable_header_boxes')) this.clickableHeaderBoxes();
      if (getFeatureState('cc_ratings_estimate')) this.ratingsEstimate();
      if (getFeatureState('cc_ratings_from_favorites')) this.ratingsFromFavorites();
      if (getFeatureState('cc_add_ratings_date')) this.addRatingsDate();
      if (getFeatureState(SELF_REPLY_IN_DISCUSSIONS_KEY, true)) this.enableSelfReplyInDiscussions();
    } catch (e) {
      // ignore silently
    }

    // Dynamic Filter Trigger (runs immediately and whenever the list is updated)
    this.hideSelectedUserReviews();
    window.addEventListener('cc-hide-selected-reviews-updated', () => {
      this.updateCachedLists(); // Update memory cache
      this.hideSelectedUserReviews();
    });

    // Initialize Home Panels Hiding
    window.addEventListener('cc-hidden-panels-updated', () => {
      this.updateCachedLists(); // Update memory cache
      if (typeof this._syncVisibility === 'function') this._syncVisibility();
    });
    this.initHomePanels();

    // LIVE DOM REFRESH LISTENER (Triggered by Settings Menu)
    window.addEventListener('cc-ratings-updated', async () => {
      // 1. Wipe old injected stars specific to your original code
      // TODO: Older, with design hopping around
      // document.querySelectorAll('.cc-own-rating, .cc-my-rating-col, .cc-my-rating-cell').forEach((el) => el.remove());
      document.querySelectorAll('.cc-own-rating-inline').forEach((el) => el.remove());
      document.querySelectorAll('.cc-own-rating').forEach((el) => el.remove());
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

    // Save reference so event listeners can call it without recreating it
    this._syncVisibility = () => {
      const enabled = getFeatureState('cc_hide_home_panels', true);
      const hiddenList = this.cachedHiddenPanelsList; // Use memory cache!

      // REFACTOR: Removed Array.from(), modern NodeLists support .forEach natively
      document
        .querySelectorAll(
          `
          .page-content .box-header > h2,
          .page-content .updated-box-header > h2,
          .page-content .updated-box-header > p,
          .updated-box-homepage-video,
          .page-content .updated-box-banner p,
          .page-content .updated-box-banner-mobile p
        `,
        )
        .forEach((headerEl) => {
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

          // Add hide buttons if they don't exist
          const btnClass = isVideoSlider ? '.cc-hide-video-btn' : '.cc-hide-panel-btn';
          if (!headerEl.querySelector(btnClass)) {
            const btn = document.createElement('button');
            btn.className = btnClass.replace('.', '');
            btn.title = isVideoSlider ? 'Skrýt Trailery' : 'Skrýt tento panel';
            btn.textContent = isVideoSlider ? 'skrýt trailery' : 'skrýt';

            btn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!this.cachedHiddenPanelsList.includes(title)) {
                this.cachedHiddenPanelsList.push(title);
                localStorage.setItem('cc_hidden_panels_list', JSON.stringify(this.cachedHiddenPanelsList));
                window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
              }
            };
            headerEl.appendChild(btn);
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

    this._syncVisibility();
    setTimeout(this._syncVisibility, 500);
    setTimeout(this._syncVisibility, 1500);
  }

  showAllCreatorTabs() {
    document.body.classList.add('cc-show-all-tabs-enabled');
  }

  restoreCreatorTabs() {
    document.body.classList.remove('cc-show-all-tabs-enabled');
    window.dispatchEvent(new Event('resize'));
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

    const cleanPath = path.replace(
      new RegExp(`\/(${REVIEWS_SEGMENTS_PATTERN}|komentare|${OVERVIEW_SEGMENTS_PATTERN})\/?$`, 'i'),
      '/',
    );

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
    return normalizeCsfdShowType(typeText, 'movie');
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
    return parseRatingFromStars(starElem);
  }

  _getRatingColor(percent) {
    if (percent >= 70) return '#ba0305'; // Native CSFD red
    if (percent >= 30) return '#62829d'; // Native CSFD blue
    return '#545454'; // Native CSFD gray/black
  }

  clickableHeaderBoxes() {
    // Aplikujeme pouze na klasické boxy a hlavičky v rozbalovacích menu
    document.querySelectorAll('.dropdown-content-head, .box-header, .updated-box-header').forEach((div) => {
      if (div.dataset.ccClickable === 'true') return;

      const btn = div.querySelector('a.button');
      if (!btn) return;
      const text = btn.textContent.trim().toLowerCase();
      if (!['více', 'viac'].includes(text)) return;
      const href = btn.getAttribute('href');
      if (!href) return;

      div.dataset.ccClickable = 'true';

      const wrapper = document.createElement('a');
      wrapper.setAttribute('href', href);
      wrapper.dataset.ccHeaderWrapper = 'true';
      wrapper.style.display = 'block';
      wrapper.style.textDecoration = 'none';
      wrapper.style.color = 'inherit';

      div.parentNode.replaceChild(wrapper, div);
      wrapper.appendChild(div);

      const h2 = div.querySelector('h2');
      const spanCount = h2?.querySelector('span.count');

      div.ccHoverEnter = () => {
        div.dataset.origBg = div.style.backgroundColor || '';
        div.style.backgroundColor = '#ba0305';
        if (h2) {
          h2.dataset.origBg = h2.style.backgroundColor || '';
          h2.dataset.origColor = h2.style.color || '';
          h2.style.backgroundColor = '#ba0305';
          h2.style.color = '#fff';
        }
        if (spanCount) {
          spanCount.dataset.origColor = spanCount.style.color || '';
          spanCount.style.color = '#fff';
        }
      };

      div.ccHoverLeave = () => {
        div.style.backgroundColor = div.dataset.origBg || '';
        if (h2) {
          h2.style.backgroundColor = h2.dataset.origBg || '';
          h2.style.color = h2.dataset.origColor || '';
        }
        if (spanCount) {
          spanCount.style.color = spanCount.dataset.origColor || '';
        }
      };

      div.addEventListener('mouseenter', div.ccHoverEnter);
      div.addEventListener('mouseleave', div.ccHoverLeave);
    });
  }

  clearClickableHeaderBoxes() {
    document.querySelectorAll('a[data-cc-header-wrapper="true"]').forEach((wrapper) => {
      const div = wrapper.firstElementChild;
      if (div) {
        div.dataset.ccClickable = 'false';

        // Clear hover styles if the mouse is currently over the element
        if (div.ccHoverLeave) {
          div.removeEventListener('mouseenter', div.ccHoverEnter);
          div.removeEventListener('mouseleave', div.ccHoverLeave);
          div.ccHoverLeave();
        }

        // Unwrap the div from the anchor
        wrapper.parentNode.replaceChild(div, wrapper);
      }
    });
  }

  _getOrInitRatingContainer() {
    const avgEl = document.querySelector('.box-rating-container .film-rating-average');
    if (!avgEl) return null;

    if (!avgEl.dataset.ccInitialized) {
      avgEl.dataset.ccOriginalText = avgEl.textContent.trim();
      avgEl.dataset.ccOriginalBg = avgEl.style.backgroundColor || '';
      avgEl.dataset.ccOriginalColor = avgEl.style.color || '';
      avgEl.dataset.ccOriginalTitle = avgEl.getAttribute('title') || '';

      avgEl.innerHTML = '';

      const mainSpan = document.createElement('span');
      mainSpan.className = 'cc-main-rating';
      mainSpan.textContent = avgEl.dataset.ccOriginalText;

      const favSpan = document.createElement('span');
      favSpan.className = 'cc-fav-rating';
      favSpan.style.position = 'relative';
      favSpan.style.top = '25px';
      favSpan.style.fontSize = '0.3em';
      favSpan.style.fontWeight = '600';
      favSpan.style.display = 'none';

      avgEl.appendChild(mainSpan);
      avgEl.appendChild(favSpan);
      avgEl.dataset.ccInitialized = 'true';
    }
    return avgEl;
  }

  ratingsEstimate() {
    const avgEl = this._getOrInitRatingContainer();
    if (!avgEl) return;

    // Count the estimate only if the original text contains "? %"
    if (!avgEl.dataset.ccOriginalText.includes('?')) return;

    // OPTIMIZATION: Replaced 3 array loops (.map.map.filter) with a single fast loop
    let sum = 0;
    let count = 0;
    document.querySelectorAll('section.others-rating .star-rating .stars').forEach((starEl) => {
      const num = this._parseRatingFromStars(starEl);
      if (Number.isFinite(num)) {
        sum += num * 20;
        count++;
      }
    });

    if (count === 0) return;
    const average = Math.round(sum / count);

    const mainSpan = avgEl.querySelector('.cc-main-rating');
    if (mainSpan) {
      mainSpan.textContent = `${average}%`;
    }

    avgEl.style.color = '#fff';
    avgEl.style.backgroundColor = this._getRatingColor(average);
    avgEl.setAttribute('title', `spočteno z hodnocení: ${count}`);
  }

  clearRatingsEstimate() {
    const avgEl = document.querySelector('.box-rating-container .film-rating-average');
    if (!avgEl || !avgEl.dataset.ccInitialized) return;

    const mainSpan = avgEl.querySelector('.cc-main-rating');
    if (mainSpan) {
      mainSpan.textContent = avgEl.dataset.ccOriginalText;
    }

    avgEl.style.color = avgEl.dataset.ccOriginalColor;
    avgEl.style.backgroundColor = avgEl.dataset.ccOriginalBg;

    if (avgEl.dataset.ccOriginalTitle) {
      avgEl.setAttribute('title', avgEl.dataset.ccOriginalTitle);
    } else {
      avgEl.removeAttribute('title');
    }
  }

  ratingsFromFavorites() {
    const avgEl = this._getOrInitRatingContainer();
    if (!avgEl) return;

    // OPTIMIZATION: Single loop instead of .map.map.filter chain
    let sum = 0;
    let count = 0;
    document.querySelectorAll('li.favored:not(.current-user-rating) .star-rating .stars').forEach((starEl) => {
      const num = this._parseRatingFromStars(starEl);
      if (Number.isFinite(num)) {
        sum += num * 20;
        count++;
      }
    });

    if (count === 0) return;
    const ratingAverage = Math.round(sum / count);

    const favSpan = avgEl.querySelector('.cc-fav-rating');
    const mainSpan = avgEl.querySelector('.cc-main-rating');

    if (favSpan && mainSpan) {
      favSpan.textContent = `oblíbení: ${ratingAverage}%`;
      favSpan.style.display = 'inline-block';
      mainSpan.style.position = 'absolute';
    }
  }

  clearRatingsFromFavorites() {
    const avgEl = document.querySelector('.box-rating-container .film-rating-average');
    if (!avgEl || !avgEl.dataset.ccInitialized) return;

    const favSpan = avgEl.querySelector('.cc-fav-rating');
    const mainSpan = avgEl.querySelector('.cc-main-rating');

    if (favSpan && mainSpan) {
      favSpan.style.display = 'none';
      mainSpan.style.position = 'static';
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
    const enabled = getFeatureState(HIDE_SELECTED_REVIEWS_KEY, false);
    const hiddenList = this.cachedHiddenReviewsList; // OPTIMIZATION: Uses memory cache

    document.querySelectorAll('.article-header-review-name').forEach((el) => {
      const title = el.querySelector('.user-title-name');
      if (!title) return;

      const name = title.textContent.trim().toLowerCase();
      const article = el.closest('article');

      if (article) {
        if (enabled && hiddenList.includes(name)) {
          article.style.display = 'none';
        } else {
          article.style.display = '';
        }
      }
    });
  }

  createCurrentPageRecord({ movieId, urlSlug, parentId, parentName, fullUrl, rating, existingRecord }) {
    const computedInfo = this.getCurrentPageComputedInfo();
    return {
      ...(existingRecord || {}),
      id: buildRatingRecordId(this.userSlug, movieId),
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
    const storageId = buildRatingRecordId(this.userSlug, pageInfo.movieId);

    if (pageRating === null) {
      if (existingRecord) {
        const tombstone = {
          ...existingRecord,
          id: storageId,
          rating: null,
          deleted: true,
          lastUpdate: new Date().toISOString(),
        };
        await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, tombstone);
        if (existingRecord.id && existingRecord.id !== storageId) {
          await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, existingRecord.id);
        }
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
    if (existingRecord?.id && existingRecord.id !== storageId) {
      await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, existingRecord.id);
    }
    this.stars[pageInfo.movieId] = newRecord;
    window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
  }

  async loadStarsFromIndexedDb() {
    if (!this.userSlug) return;

    try {
      const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
      const reconciledRecords = reconcileUserRatingRecords(records, this.userSlug);

      if (reconciledRecords.hasChanges) {
        await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, reconciledRecords.normalizedRecords);
        await Promise.all(
          reconciledRecords.staleRecordIds.map((recordId) =>
            deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, recordId),
          ),
        );
      }

      const userRecords = reconciledRecords.normalizedRecords;

      for (const record of userRecords) {
        this.stars[record.movieId] = record;
      }
    } catch (error) {
      console.error('[CC] Failed to load stars from IndexedDB:', error);
    }
  }

  getCandidateFilmLinks() {
    const searchRoot = this.csfdPage || document;

    const showInReviews = getFeatureState(SHOW_RATINGS_IN_REVIEWS_KEY);
    const showInForeignReviews = getFeatureState(SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY, true);
    const showInDiaries = getFeatureState(SHOW_RATINGS_IN_DIARIES_KEY, true); // ZDE

    const isCreatorPage = this.isOnCreatorPage();
    const isUserReviewsPage = this.isOnUserReviewsPage();
    const isUserOverviewPage = this.isOnUserOverviewPage();
    const isOtherUser = this.isOnOtherUserProfilePage();
    const isForeignProfile = isOtherUser && (isUserReviewsPage || isUserOverviewPage);
    const isOwnProfile = this.isOnUserProfilePage() && !isOtherUser;

    // Links pointing to sections that are not actual film pages
    const ignorePathRegex = new RegExp(String.raw`\/(?:${GALLERY_PATHS_PATTERN}|videa?|tvurci|obsahy?)\/`, 'i');
    // Links containing 'page' or 'comment' query parameters (usually pagination or comment links)
    const ignoreParamRegex = /[?&](page|comment|modal|review)=/i;
    // Links missing the expected numeric ID pattern (e.g., "/12345-slug/")
    const validFilmRegex = /\/\d+-/;

    return Array.from(searchRoot.querySelectorAll('a[href*="/film/"]')).filter((link) => {
      const href = link.getAttribute('href') || '';

      if (!validFilmRegex.test(href) || ignoreParamRegex.test(href) || ignorePathRegex.test(href)) {
        return false;
      }

      // Exclude links in /tvurce/ (creator) pages except for those in the filmography section
      if (isCreatorPage && link.closest('.creator-filmography')) return false;

      // Exclude links that are likely for editing reviews (identified by classes or icons)
      if (
        link.classList.contains('edit-review') ||
        link.matches('[class*="edit-review"]') ||
        link.querySelector('.icon-edit-square, img')
      ) {
        return false;
      }

      // Include links in related boxes only if they match the film title pattern
      if (link.closest('section.box-related, div.box-related, .box-related')) {
        return link.classList.contains('film-title-name');
      }

      // Exclude links in the ratings comparison table (/profile/xxx/prehled) to not duplicate the title links
      if (link.closest('.cc-compare-ratings-table')) {
        return false;
      }

      const linkText = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
      if (linkText === 'více' || linkText === 'viac') return false;

      const isTitleLink = link.classList.contains('film-title-name');
      const inlineRatingContext = this.getInlineRatingContext(link);
      const isDiaryLink = inlineRatingContext === 'diary';
      const isReviewTextLink = inlineRatingContext === 'review';

      if (isDiaryLink) {
        // Diaries should be treated differently
        if (!showInDiaries) return false;
      } else if (isReviewTextLink) {
        // Review text links should be treated differently and also depend on whether it's own or foreign profile
        if (isOtherUser) {
          if (!showInForeignReviews) return false;
        } else {
          if (!showInReviews) return false;
        }
      }

      if (isOwnProfile && isTitleLink) {
        if (isUserReviewsPage) return false;
        if (link.closest('.last-ratings table')) return false;
        // On the overview page, we want to include the title links in the main sections but exclude those in the review/rating sections to avoid duplicates and false positives
        if (this.shouldSkipProfileSectionLink(link)) return false;
      }

      if (link.closest(LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS)) {
        return false;
      }

      return true;
    });
  }

  getResolvedUserSlug() {
    if (this.userSlug) return this.userSlug;

    const resolvedUserSlug = extractUserSlug(this.userUrl || this.getCurrentUser());
    if (resolvedUserSlug) {
      this.userSlug = resolvedUserSlug;
    }

    return resolvedUserSlug;
  }

  isOnOwnRatingsPage() {
    const currentUserSlug = this.getResolvedUserSlug();
    if (!currentUserSlug) return false;
    const path = location.pathname || '';
    return (
      path.startsWith(`/uzivatel/${currentUserSlug}/`) &&
      new RegExp(`\/(${RATINGS_SEGMENTS_PATTERN})\/`, 'i').test(path)
    );
  }

  isOnCreatorPage() {
    return new RegExp(String.raw`^\/(${CREATOR_PATHS_PATTERN})\/\d+-[^/]+\/`, 'i').test(location.pathname || '');
  }

  isOnUserProfilePage() {
    return extractUserSlug(location.pathname);
  }

  isOnOtherUserProfilePage() {
    const pageUserSlug = this.isOnUserProfilePage();
    const currentUserSlug = this.getResolvedUserSlug();
    return Boolean(pageUserSlug && currentUserSlug && pageUserSlug !== currentUserSlug);
  }

  isOnUserOverviewPage() {
    return new RegExp(`^\/uzivatel\/\d+-[^/]+\/(${OVERVIEW_SEGMENTS_PATTERN})(\/|$)`, 'i').test(
      location.pathname || '',
    );
  }

  isOnUserReviewsPage() {
    return new RegExp(`^\/uzivatel\/\d+-[^/]+\/(${REVIEWS_SEGMENTS_PATTERN})(\/|$)`, 'i').test(location.pathname || '');
  }

  /**
   * Determines if a given link on the user overview page should be skipped when looking for film links,
   * based on its context in the DOM. Returns 'true' if the links should be skipped
   * @param {*} link
   * @returns {boolean}
   */
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
        ':scope > .box-header h2, :scope > .box-header h3, :scope > .updated-box-header h2, :scope > .updated-box-header h3, :scope > header h2, :scope > header h3, :scope > a[data-cc-header-wrapper] > .box-header h2, :scope > a[data-cc-header-wrapper] > .box-header h3, :scope > a[data-cc-header-wrapper] > .updated-box-header h2, :scope > a[data-cc-header-wrapper] > .updated-box-header h3, :scope > h2, :scope > h3',
      );
      const sectionTitle = titleEl?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

      if (sectionTitle) {
        if (matchesCsfdTextVariant('recentReviewsOrRatingsHeading', sectionTitle)) return true;
        if (matchesCsfdTextVariant('recentDiaryHeading', sectionTitle)) return false;
      }
      sectionNode = sectionNode.parentElement;
    }
    return false;
  }

  hasNativeTitleRating(link) {
    if (!(link instanceof Element)) return false;

    const titleContainer = link.closest('h1, h2, h3, h4, h5, h6, .film-title-inline, .film-title-ellipsis');
    if (!titleContainer) return false;

    return Boolean(titleContainer.querySelector('.star-rating:not(.cc-own-rating)'));
  }

  getRatingsPageSlug() {
    return (location.pathname || '').match(
      new RegExp(`^\/uzivatel\/(\d+-[^/]+)\/(${RATINGS_SEGMENTS_PATTERN})\/?`, 'i'),
    )?.[1];
  }

  isOnForeignRatingsPage() {
    const ratingsPageSlug = this.getRatingsPageSlug();
    const currentUserSlug = this.getResolvedUserSlug();
    return Boolean(ratingsPageSlug && currentUserSlug && ratingsPageSlug !== currentUserSlug);
  }

  async addComparisonColumnOnOverviewPage() {
    const table = document.querySelector('.last-ratings table');

    if (!table) return;

    console.debug('🔵 Found ratings table on overview page, adding comparison column');
    table.classList.add('cc-compare-ratings-table');

    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(
      (row) => row.querySelector('td.name a[href*="/film/"]') && row.querySelector('td.star-rating-only'),
    );

    for (const row of rows) {
      if (row.querySelector('td.cc-my-rating-cell')) continue;

      const nameLink = row.querySelector('td.name a[href*="/film/"]');
      const ratingCell = row.querySelector('td.star-rating-only');
      const movieId = await getMovieIdFromUrl(nameLink.getAttribute('href'));
      const ratingRecord = this.stars[movieId];

      const myRatingCell = document.createElement('td');
      myRatingCell.className = 'cc-my-rating-cell star-rating-only';
      myRatingCell.style.textAlign = 'right';

      if (ratingRecord && ratingRecord.deleted !== true) {
        const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
        const isComputed = ratingRecord?.computed === true;
        // The 'true' at the end forces the outlined box style
        const starElement = this.createStarElement(ratingValue, isComputed, ratingRecord?.computedCount, true);
        if (starElement) {
          starElement.classList.remove('cc-own-rating');
          myRatingCell.appendChild(starElement);
        }
      }
      // ratingCell.insertAdjacentElement('beforebegin', myRatingCell);
      ratingCell.insertAdjacentElement('afterend', myRatingCell);
    }
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
        colHeader.style.textAlign = 'right';
        const ratingHeader = headerRow.querySelector('th.star-rating-only');
        // ratingHeader ? ratingHeader.insertAdjacentElement('beforebegin', colHeader) : headerRow.appendChild(colHeader);
        ratingHeader ? ratingHeader.insertAdjacentElement('afterend', colHeader) : headerRow.appendChild(colHeader);
      }

      for (const row of rows) {
        if (row.querySelector('td.cc-my-rating-cell')) continue;

        const nameLink = row.querySelector('td.name a[href*="/film/"]');
        const ratingCell = row.querySelector('td.star-rating-only');
        const movieId = await getMovieIdFromUrl(nameLink.getAttribute('href')); // REFACTOR: uses utils.js
        const ratingRecord = this.stars[movieId];

        const myRatingCell = document.createElement('td');
        myRatingCell.className = 'cc-my-rating-cell star-rating-only';
        myRatingCell.style.textAlign = 'right';

        if (ratingRecord) {
          const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
          const isComputed = ratingRecord?.computed === true;
          const starElement = this.createStarElement(ratingValue, isComputed, ratingRecord?.computedCount);
          if (starElement) {
            starElement.classList.remove('cc-own-rating');
            myRatingCell.appendChild(starElement);
          }
        }
        // ratingCell.insertAdjacentElement('beforebegin', myRatingCell);
        ratingCell.insertAdjacentElement('afterend', myRatingCell);
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
      stars.textContent = 'odpad!';
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

  isInlineTextRatingLink(link) {
    if (!(link instanceof Element)) return false;

    return Boolean(
      link.closest('[data-film-review-content], span.comment') ||
      link.closest(
        '.diary-post .article-content.article-content-justify p, .diary-post .article-content.article-content-justify li',
      ) ||
      link.closest(
        'article.article-forum .article-content.article-content-icons p, article.article-forum .article-content.article-content-icons li',
      ) ||
      link.closest(
        '.article-news-content.article-content-justify p, .article-news-content.article-content-justify li',
      ) ||
      this.getInlineRatingContext(link),
    );
  }

  getInlineRatingContext(link) {
    if (!(link instanceof Element)) return undefined;

    if (
      link.closest(
        '.diary-post .article-content.article-content-justify p, .diary-post .article-content.article-content-justify li',
      )
    ) {
      return 'diary';
    }

    if (
      link.closest('[data-film-review-content], span.comment') ||
      link.closest(
        'article.article-forum .article-content.article-content-icons p, article.article-forum .article-content.article-content-icons li',
      ) ||
      link.closest('.article-news-content.article-content-justify p, .article-news-content.article-content-justify li')
    ) {
      return 'review';
    }

    const favoritesActivityTextContainer = link.closest('.favorite-users-ratings .article-content-reviewtext');
    const favoritesInlineTextNode = link.closest(
      '.favorite-users-ratings .article-content-reviewtext p, .favorite-users-ratings .article-content-reviewtext li',
    );

    if (favoritesActivityTextContainer && favoritesInlineTextNode && !link.closest('h1, h2, h3, h4, h5, h6')) {
      const activityLeadText =
        favoritesActivityTextContainer.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

      if (/(den[ií]čku|den[ií]k)/i.test(activityLeadText)) {
        return 'diary';
      }

      if (/(recenzoval|komentoval|diskutoval)/i.test(activityLeadText)) {
        return 'review';
      }
    }

    if (this.isOnUserReviewsPage() && !link.classList.contains('film-title-name')) {
      return 'review';
    }

    return undefined;
  }

  createInlineRatingGroup(link, starElement) {
    const group = document.createElement('span');
    group.className = 'cc-own-rating-inline';
    group.append(document.createTextNode('\u00A0'), starElement);
    link.after(group);
    return group;
  }

  makeTrailingHyphenUnbreakable(link) {
    if (!(link instanceof Element)) return;

    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    const lastTextNode = textNodes.at(-1);
    if (!lastTextNode?.textContent) return;

    const text = lastTextNode.textContent;
    const trailingWhitespaceMatch = text.match(/\s*$/);
    const trailingWhitespace = trailingWhitespaceMatch?.[0] || '';
    const contentEnd = text.length - trailingWhitespace.length;
    if (contentEnd <= 0) return;

    const content = text.slice(0, contentEnd);
    const lastWhitespaceIndex = content.search(/\s+[^\s]*$/);
    const tokenStart = lastWhitespaceIndex >= 0 ? lastWhitespaceIndex + 1 : 0;
    const prefix = content.slice(0, tokenStart);
    const token = content.slice(tokenStart);

    if (!token.includes('-')) return;

    lastTextNode.textContent = `${prefix}${token.replace(/-/g, '\u2011')}${trailingWhitespace}`;
  }

  async addStars() {
    if (!getFeatureState(SHOW_RATINGS_KEY)) {
      console.debug('🟣 Ratings not added: SHOW_RATINGS_KEY disabled');
      return;
    }

    if (location.href.match(/\/(zebricky|rebricky)\//)) {
      console.debug('🟣 Ratings not added: on leaderboards page');
      return;
    }
    if (this.isOnUserReviewsPage() && !this.isOnOtherUserProfilePage()) {
      console.debug('🟣 Ratings not added: on user reviews page (not other user)');
      return;
    }
    if (this.isOnOwnRatingsPage()) {
      console.debug('🟣 Ratings not added: on own ratings page');
      return;
    }

    const isForeignProfilePage = this.isOnOtherUserProfilePage();
    const hasForeignOverviewRatingsTable = Boolean(
      isForeignProfilePage && document.querySelector('.last-ratings table'),
    );
    const hasForeignRatingsPageTable = Boolean(
      isForeignProfilePage &&
      document.querySelector('#snippet--ratings table, #snippet-ratings table, .snippet-ratings table'),
    );

    if (this.isOnForeignRatingsPage() || hasForeignRatingsPageTable) {
      console.debug('🟣 Ratings not added: on foreign ratings page — adding comparison column instead');
      return this.addComparisonColumnOnForeignRatingsPage();
    }

    // Handle the header-less table on the Overview page
    if ((this.isOnUserOverviewPage() && isForeignProfilePage) || hasForeignOverviewRatingsTable) {
      console.debug('🟣 On other user overview page — adding column to last ratings table');
      await this.addComparisonColumnOnOverviewPage();
    }

    const links = this.getCandidateFilmLinks();
    console.debug(`🔵 Found ${links.length} candidate links for adding ratings`);
    console.debug({ links });
    const outlinedOnThisPage =
      isForeignProfilePage || /^\/soukrome\/oblibeni-uzivatele\/(\?|$)/i.test(location.pathname || '');

    for (const link of links) {
      if (link.dataset.ccStarAdded === 'true') continue;

      if (
        link.classList.contains('film-title-name') &&
        this.hasNativeTitleRating(link) &&
        !this.isOnOtherUserProfilePage()
      ) {
        continue;
      }

      const movieId = await getMovieIdFromUrl(link.getAttribute('href')); // REFACTOR: uses utils.js
      const ratingRecord = this.stars[movieId];
      if (!ratingRecord || ratingRecord.deleted === true) continue;

      const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
      const isComputed = ratingRecord?.computed === true;
      const starElement = this.createStarElement(
        ratingValue,
        isComputed,
        ratingRecord?.computedCount,
        outlinedOnThisPage,
      );

      if (!starElement) continue;

      // Check if we are inside a list item that has a dedicated .time-rating block (TV program pages)
      const listItem = link.closest('.program-item, .box-item, article, li, tr');
      const timeRatingDiv = listItem ? listItem.querySelector('.time-rating') : null;

      if (timeRatingDiv) {
        timeRatingDiv.appendChild(starElement);
      } else {
        const headingAncestor = link.closest('h1, h2, h3, h4, h5, h6');
        if (headingAncestor) {
          headingAncestor.appendChild(starElement);
        } else if (this.isInlineTextRatingLink(link)) {
          this.makeTrailingHyphenUnbreakable(link);
          this.createInlineRatingGroup(link, starElement);
        } else {
          link.insertAdjacentElement('afterend', starElement);
        }
      }

      link.dataset.ccStarAdded = 'true';
    }
  }

  isOnGalleryPage() {
    return new RegExp(String.raw`\/(?:${GALLERY_PATHS_PATTERN})\/`, 'i').test(location.pathname || '');
  }

  isGalleryImageLinksEnabled() {
    return getFeatureState(GALLERY_IMAGE_LINKS_ENABLED_KEY);
  }

  areLinkIconsEnabled() {
    return getFeatureState(LINK_ICONS_ENABLED_KEY, true);
  }

  getLinkIconsPosition() {
    return localStorage.getItem(LINK_ICONS_POSITION_KEY) === 'after' ? 'after' : 'before';
  }

  addConfiguredLinkIcons(root = this.csfdPage || document) {
    applyConfiguredLinkIcons(root, {
      iconsEnabled: this.areLinkIconsEnabled(),
      position: this.getLinkIconsPosition(),
      isProviderEnabled: (provider) => getFeatureState(provider.storageKey, true),
    });
  }

  refreshLinkIcons(root = this.csfdPage || document) {
    refreshConfiguredLinkIcons(root, {
      iconsEnabled: this.areLinkIconsEnabled(),
      position: this.getLinkIconsPosition(),
      isProviderEnabled: (provider) => getFeatureState(provider.storageKey, true),
    });
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

  /**
   * Adds a "Reagovat" button to the logged-in user's own discussion posts.
   * Uses a Vanilla JS proxy-click to trigger the native ČSFD UI.
   */
  enableSelfReplyInDiscussions() {
    if (!new RegExp(String.raw`\/(?:${DISCUSSION_PATHS_PATTERN})\/`, 'i').test(window.location.pathname || '')) return;
    if (!getFeatureState(SELF_REPLY_IN_DISCUSSIONS_KEY, true)) return;

    const posts = document.querySelectorAll('article.article-forum');

    posts.forEach((post) => {
      const actionsContainer = post.querySelector('.icon-control');
      if (!actionsContainer) return;

      const hasReplyBtn = actionsContainer.querySelector('.reply-add');

      // If missing, it's your post. Let's inject our proxy button.
      if (!hasReplyBtn) {
        const authorLink = post.querySelector('.article-header-message a.user-title-name');
        if (!authorLink) return;

        // Extract your user info and post ID
        const href = authorLink.getAttribute('href') || '';
        const userMatch = href.match(/\/uzivatel\/(\d+)-([^/]+)\//);
        if (!userMatch) return;

        const userId = userMatch[1];
        const username = authorLink.textContent.trim();

        const articleId = post.getAttribute('id') || '';
        const postMatch = articleId.match(/highlight-post-(\d+)/);
        if (!postMatch) return;

        const postId = postMatch[1];

        // Create our visual button
        const replyBtn = document.createElement('a');
        replyBtn.href = '#';
        replyBtn.className = 'button button-circle reply-add cc-self-reply';
        replyBtn.title = 'Odpovědět (CC)';
        replyBtn.innerHTML = '<i class="icon icon-reply"></i>';

        // The magic: Proxy the click to an existing native button
        replyBtn.addEventListener('click', (e) => {
          e.preventDefault();

          // Find any valid native button on the page from another user
          const nativeBtn = document.querySelector('a.reply-add:not(.cc-self-reply)');

          if (nativeBtn) {
            console.debug(`[CC] Proxying reply click to native button for ${username}`);

            // 1. Backup the native button's original values
            const origNick = nativeBtn.getAttribute('data-nick');
            const origId = nativeBtn.getAttribute('data-id');
            const origPost = nativeBtn.getAttribute('data-post');

            // 2. Override with your post's values
            nativeBtn.setAttribute('data-nick', username);
            nativeBtn.setAttribute('data-id', userId);
            nativeBtn.setAttribute('data-post', postId);

            // 3. Dispatch the native click (this triggers ČSFD's UI formatting)
            nativeBtn.click();

            // 4. Restore the native button immediately so it isn't permanently broken
            nativeBtn.setAttribute('data-nick', origNick);
            nativeBtn.setAttribute('data-id', origId);
            nativeBtn.setAttribute('data-post', origPost);
          } else {
            console.debug('[CC] No native button found. Using simple fallback.');

            // Fallback just in case you are the ONLY person in the discussion
            const textToInsert = `@${username} `;
            if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
              tinymce.activeEditor.execCommand('mceInsertContent', false, textToInsert);
              tinymce.activeEditor.focus();
            } else {
              const textarea = document.querySelector('form textarea#frm-forum-postForm-text');
              if (textarea) {
                textarea.value = textarea.value ? `${textarea.value} ${textToInsert}` : textToInsert;
                textarea.focus();
              }
            }
          }
        });

        // Insert our button into the actions bar
        actionsContainer.insertBefore(replyBtn, actionsContainer.firstChild);
      }
    });
  }

  clearSelfReplyInDiscussions() {
    document.querySelectorAll('.cc-self-reply').forEach((btn) => btn.remove());
  }
}
