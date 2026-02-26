import {
  SETTINGSNAME,
  INDEXED_DB_NAME,
  RATINGS_STORE_NAME,
  GALLERY_IMAGE_LINKS_ENABLED_KEY,
  HIDE_SELECTED_REVIEWS_LIST_KEY,
  HIDE_SELECTED_REVIEWS_KEY,
  SHOW_RATINGS_KEY,
  SHOW_RATINGS_IN_REVIEWS_KEY,
} from './config.js';
import { deleteItemFromIndexedDB, getAllFromIndexedDB, getSettings, saveToIndexedDB } from './storage.js';
import { delay } from './utils.js';

const PROFILE_LINK_SELECTOR =
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
  }

  getCurrentUser() {
    const userEl = document.querySelector(PROFILE_LINK_SELECTOR);
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
        el.style.cursor = 'pointer';
        el.onclick = () => {
          const hrefMap = {
            '.user-link.wantsee': '/chci-videt/',
            '.user-link.favorites': '/soukrome/oblibene/',
            '.user-link.messages': '/posta/',
          };
          location.href = hrefMap[sel] || hrefMap['.user-link.wantsee'];
        };
      }
    });

    const headers = Array.from(document.querySelectorAll('.dropdown-content-head, .box-header, .updated-box-header'));
    headers.forEach((div) => {
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

    // Remove clickable styles and handlers from user links
    ['.user-link.wantsee', '.user-link.favorites', '.user-link.messages'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.style.cursor = '';
        el.onclick = null;
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

    // Počítáme odhad jen pokud je původní CSFD stav "? %"
    if (!avgEl.dataset.ccOriginalText.includes('?')) return;

    const userRatings = Array.from(document.querySelectorAll('section.others-rating .star-rating'));
    if (!userRatings.length) return;
    const numbers = userRatings
      .map((ur) => this._parseRatingFromStars(ur.querySelector('.stars')))
      .map((n) => (Number.isFinite(n) ? n * 20 : NaN))
      .filter(Number.isFinite);
    if (!numbers.length) return;
    const average = Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);

    const mainSpan = avgEl.querySelector('.cc-main-rating');
    if (mainSpan) {
      mainSpan.textContent = `${average}%`;
    }

    avgEl.style.color = '#fff';
    avgEl.style.backgroundColor = this._getRatingColor(average);
    avgEl.setAttribute('title', `spočteno z hodnocení: ${numbers.length}`);
  }

  clearRatingsEstimate() {
    const avgEl = document.querySelector('.box-rating-container .film-rating-average');
    if (!avgEl || !avgEl.dataset.ccInitialized) return;

    const mainSpan = avgEl.querySelector('.cc-main-rating');
    if (mainSpan) {
      mainSpan.textContent = avgEl.dataset.ccOriginalText;
    }

    // Obnovení původní barvy, pozadí a titulku
    avgEl.style.color = avgEl.dataset.ccOriginalColor;
    avgEl.style.backgroundColor = avgEl.dataset.ccOriginalBg;

    if (avgEl.dataset.ccOriginalTitle) {
      avgEl.setAttribute('title', avgEl.dataset.ccOriginalTitle);
    } else {
      avgEl.removeAttribute('title');
    }
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

    const avgEl = this._getOrInitRatingContainer();
    if (!avgEl) return;

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

      // .program-item has overflow to hide excess text in ellipsis so we can't put the stars at the end.
      const tvProgramTimeRating = link.closest('.program-item')?.querySelector('.time-rating');
      if (tvProgramTimeRating) {
        starElement.classList.add('cc-own-rating-tv');
        tvProgramTimeRating.appendChild(starElement);
      } else {
        const headingAncestor = link.closest('h1, h2, h3, h4, h5, h6');
        headingAncestor
          ? headingAncestor.appendChild(starElement)
          : link.insertAdjacentElement('afterend', starElement);
      }

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
