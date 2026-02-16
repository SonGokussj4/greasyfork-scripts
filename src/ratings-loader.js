import { INDEXED_DB_NAME, NUM_RATINGS_PER_PAGE } from './config.js';
import { saveToIndexedDB } from './storage.js';
import { delay } from './utils.js';

const DEFAULT_MAX_PAGES = 4;
const REQUEST_DELAY_MIN_MS = 250;
const REQUEST_DELAY_MAX_MS = 550;

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
  const ratingsSegment = getRatingsSegment();
  const basePath = profilePath.replace(/\/(prehled|prehlad)\/?$/i, `/${ratingsSegment}/`);
  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;

  if (pageNumber <= 1) {
    return new URL(normalizedBasePath, location.origin).toString();
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

function parseTotalRatingsFromDocument(doc) {
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
  const pageLinks = Array.from(doc.querySelectorAll('a[href*="strana-"]'));
  const pageNumbers = pageLinks
    .map((link) => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/strana-(\d+)/);
      return match ? Number.parseInt(match[1], 10) : NaN;
    })
    .filter((value) => !Number.isNaN(value));

  if (pageNumbers.length > 0) {
    return Math.max(...pageNumbers);
  }

  const totalRatings = parseTotalRatingsFromDocument(doc);
  return totalRatings > 0 ? Math.ceil(totalRatings / NUM_RATINGS_PER_PAGE) : 1;
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

  const starEl = row.querySelector('td.star-rating-only .star-rating .stars');
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
    computed: false,
    computedCount: NaN,
    computedFromText: '',
    lastUpdate: new Date().toISOString(),
  };
}

function parseRatingsFromDocument(doc, origin) {
  const rows = Array.from(doc.querySelectorAll('table tr'));
  return rows.map((row) => parseRatingRow(row, origin)).filter(Boolean);
}

function getStoreNameForUser() {
  return 'ratings';
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

function setButtonState(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Načítám…' : 'Načíst hodnocení';
}

async function loadRatingsForCurrentUser(maxPages = DEFAULT_MAX_PAGES, onProgress = () => {}) {
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

  const totalRatings = parseTotalRatingsFromDocument(firstDoc);
  const maxDetectedPages = parseMaxPaginationPageFromDocument(firstDoc);
  const targetPages = Math.max(1, maxPages);

  let totalParsed = 0;
  let loadedPages = 0;

  for (let page = 1; page <= targetPages; page++) {
    const doc = page === 1 ? firstDoc : await fetchRatingsPageDocument(buildRatingsPageUrl(profilePath, page));
    const pageRatings = parseRatingsFromDocument(doc, location.origin);

    if (page > 1 && pageRatings.length === 0) {
      break;
    }

    const storageRecords = pageRatings.map((record) => toStorageRecord(record, userSlug));
    await saveToIndexedDB(INDEXED_DB_NAME, getStoreNameForUser(), storageRecords);

    totalParsed += pageRatings.length;
    loadedPages += 1;
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
  };
}

export function initializeRatingsLoader(rootElement) {
  const loadButton = rootElement.querySelector('#cc-load-ratings-btn');
  const progress = {
    container: rootElement.querySelector('#cc-ratings-progress'),
    label: rootElement.querySelector('#cc-ratings-progress-label'),
    count: rootElement.querySelector('#cc-ratings-progress-count'),
    bar: rootElement.querySelector('#cc-ratings-progress-bar'),
  };

  if (!loadButton || !progress.container || !progress.label || !progress.count || !progress.bar) {
    return;
  }

  if (loadButton.dataset.ccRatingsBound === 'true') {
    return;
  }

  loadButton.dataset.ccRatingsBound = 'true';

  loadButton.addEventListener('click', async () => {
    try {
      setButtonState(loadButton, true);
      updateProgressUI(progress, { label: 'Připravuji načítání…', current: 0, total: 4 });

      const result = await loadRatingsForCurrentUser(DEFAULT_MAX_PAGES, ({ page, totalPages, totalParsed }) => {
        updateProgressUI(progress, {
          label: `Načítám stránku ${page}/${totalPages}… (${totalParsed} položek)`,
          current: page,
          total: totalPages,
        });
      });

      updateProgressUI(progress, {
        label: `Hotovo: ${result.totalParsed} hodnocení uloženo (${result.totalPagesLoaded} str., DB: ${result.storeName})`,
        current: result.totalPagesLoaded,
        total: DEFAULT_MAX_PAGES,
      });
    } catch (error) {
      updateProgressUI(progress, {
        label: `Chyba: ${error.message}`,
        current: 0,
        total: 1,
      });
      console.error('[CC] Ratings loader failed:', error);
    } finally {
      setButtonState(loadButton, false);
    }
  });
}
