import {
  INDEXED_DB_NAME,
  PROFILE_LINK_SELECTOR,
  RATINGS_STORE_NAME,
  RATINGS_TOTAL_CACHE_KEY,
  getCsfdPathSegment,
  getCsfdPathSegmentValues,
} from './config.js';
import { parseTotalRatingsFromDocument } from './ratings-loader.js';
import { reconcileUserRatingRecords } from './ratings-records.js';
import { getAllFromIndexedDB } from './storage.js';
import { extractUserSlug, getProfileLinkElement } from './utils.js';

function getCurrentUserSlugFromProfile() {
  return extractUserSlug(getProfileLinkElement()?.getAttribute('href'));
}

function getUserSlugFromPath(pathname) {
  return extractUserSlug(pathname);
}

function getCurrentUserRatingsUrl() {
  const profileHref = getProfileLinkElement()?.getAttribute('href');
  if (!profileHref) {
    return undefined;
  }

  const url = new URL(profileHref, location.origin);
  const segment = getCsfdPathSegment('ratings');
  const overviewPattern = new RegExp(`\/(${getCsfdPathSegmentValues('overview').join('|')})\/?$`, 'i');
  if (overviewPattern.test(url.pathname)) {
    url.pathname = url.pathname.replace(overviewPattern, `/${segment}/`);
  } else {
    url.pathname = url.pathname.endsWith('/') ? `${url.pathname}${segment}/` : `${url.pathname}/${segment}/`;
  }
  url.search = '';
  return url.toString();
}

// The ČSFD total is cached in localStorage so ordinary page views don't each download the
// whole /hodnoceni/ page. Any local ratings change invalidates it (see settings.js).
const RATINGS_TOTAL_CACHE_TTL_MS = 30 * 60 * 1000;
let inflightTotalRequest = null;

function readCachedRatingsTotal(ratingsUrl, now = Date.now()) {
  try {
    const cached = JSON.parse(localStorage.getItem(RATINGS_TOTAL_CACHE_KEY));
    if (cached?.url === ratingsUrl && cached.total > 0 && now - cached.timestamp < RATINGS_TOTAL_CACHE_TTL_MS) {
      return cached.total;
    }
  } catch {}
  return null;
}

function writeCachedRatingsTotal(ratingsUrl, total) {
  if (!ratingsUrl || !(total > 0)) return;
  localStorage.setItem(RATINGS_TOTAL_CACHE_KEY, JSON.stringify({ url: ratingsUrl, total, timestamp: Date.now() }));
}

export function invalidateRatingsTotalCache() {
  localStorage.removeItem(RATINGS_TOTAL_CACHE_KEY);
}

function getTotalRatingsFromCurrentPageForCurrentUser() {
  const path = location.pathname || '';
  const ratingsPattern = new RegExp(`\/(${getCsfdPathSegmentValues('ratings').join('|')})\/?$`, 'i');
  if (!/\/uzivatel\//.test(path) || !ratingsPattern.test(path)) {
    return 0;
  }

  const currentUserSlug = getCurrentUserSlugFromProfile();
  const pageUserSlug = getUserSlugFromPath(path);
  if (!currentUserSlug || !pageUserSlug || currentUserSlug !== pageUserSlug) {
    return 0;
  }

  return parseTotalRatingsFromDocument(document);
}

export async function fetchTotalRatingsForCurrentUser() {
  const ratingsUrl = getCurrentUserRatingsUrl();
  const currentPageTotal = getTotalRatingsFromCurrentPageForCurrentUser();
  if (currentPageTotal > 0) {
    writeCachedRatingsTotal(ratingsUrl, currentPageTotal);
    return currentPageTotal;
  }

  if (!ratingsUrl) {
    return 0;
  }

  const cachedTotal = readCachedRatingsTotal(ratingsUrl);
  if (cachedTotal !== null) {
    return cachedTotal;
  }

  // Share one request between the badge refreshes that run right after page load.
  inflightTotalRequest ??= (async () => {
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
    writeCachedRatingsTotal(ratingsUrl, total);
    return total;
  })().finally(() => {
    inflightTotalRequest = null;
  });

  return inflightTotalRequest;
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

  // Count how many ratings user has in total (including computed) but excluding deleted
  const userRecords = reconcileUserRatingRecords(records, userSlug).normalizedRecords.filter(
    (record) => record.deleted !== true,
  );
  const computedCount = userRecords.filter((record) => record.computed === true).length;
  const directRatingsCount = userRecords.length - computedCount;
  const fetchedTotalRatings = await fetchTotalRatingsForCurrentUser();
  const totalRatings = fetchedTotalRatings > 0 ? fetchedTotalRatings : directRatingsCount;

  redBadge.textContent = `${directRatingsCount} / ${totalRatings}`;
  if (directRatingsCount < totalRatings) {
    redBadge.classList.add('cc-badge-warning');
    redBadge.title = `Nenačtená hodnocení: ${totalRatings - directRatingsCount}. Klikněte na načtení.`;
  } else if (directRatingsCount > totalRatings) {
    redBadge.classList.add('cc-badge-warning');
    redBadge.title = `Uloženo o ${directRatingsCount - totalRatings} víc, než je na ČSFD (hodnocení smazaná na ČSFD). Klikněte na načtení pro srovnání.`;
  }
  blackBadge.textContent = `${computedCount}`;
}
