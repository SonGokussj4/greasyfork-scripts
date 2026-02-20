import { INDEXED_DB_NAME, RATINGS_STORE_NAME } from './config.js';
import { getAllFromIndexedDB } from './storage.js';

const PROFILE_LINK_SELECTOR =
  'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

function getCurrentUserSlugFromProfile() {
  const profileEl = document.querySelector(PROFILE_LINK_SELECTOR);
  const profileHref = profileEl?.getAttribute('href') || '';
  const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//i);
  return match ? match[1] : undefined;
}

function getUserSlugFromPath(pathname) {
  const match = String(pathname || '').match(/^\/uzivatel\/(\d+-[^/]+)\//i);
  return match ? match[1] : undefined;
}

function getCurrentUserRatingsUrl() {
  const profileEl = document.querySelector(PROFILE_LINK_SELECTOR);
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

export async function refreshRatingsBadges(rootElement, options) {
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
