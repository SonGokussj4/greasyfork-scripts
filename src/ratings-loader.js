import { INDEXED_DB_NAME, NUM_RATINGS_PER_PAGE, RATINGS_STORE_NAME } from './config.js';
import { saveToIndexedDB } from './storage.js';
import { delay } from './utils.js';

const DEFAULT_MAX_PAGES = 0; // 0 means no limit, load all available pages
const REQUEST_DELAY_MIN_MS = 250;
const REQUEST_DELAY_MAX_MS = 550;
const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';

const loaderController = {
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

  const totalRatings = parseTotalRatingsFromDocument(doc);
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

function isStateForCurrentUser(state, userSlug) {
  if (!state || !userSlug) {
    return false;
  }

  return state.userSlug === userSlug;
}

async function loadRatingsForCurrentUser(maxPages = DEFAULT_MAX_PAGES, onProgress = () => {}, resumeState = undefined) {
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
  const paginationMode = detectPaginationModeFromDocument(firstDoc);
  const detectedTargetPages =
    maxPages === 0 ? Math.max(1, maxDetectedPages) : Math.max(1, Math.min(maxPages, maxDetectedPages));

  const startPage = Math.max(1, Number.parseInt(resumeState?.nextPage || '1', 10));
  const targetPages = Math.max(startPage, Number.parseInt(resumeState?.targetPages || detectedTargetPages, 10));
  let totalParsed = Number.parseInt(resumeState?.totalParsed || '0', 10);
  let loadedPages = Number.parseInt(resumeState?.loadedPages || '0', 10);

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
    await saveToIndexedDB(INDEXED_DB_NAME, getStoreNameForUser(), storageRecords);

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
    });

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
    paused: false,
    nextPage: targetPages + 1,
    targetPages,
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

  const runLoad = async ({ resumeState = undefined, autoResume = false } = {}) => {
    if (loaderController.isRunning) {
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
        ({ page, totalPages, totalParsed }) => {
          updateProgressUI(progress, {
            label: `Načítám stránku ${page}/${totalPages}… (${totalParsed} položek)`,
            current: page,
            total: totalPages,
          });

          if (loaderController.pauseRequested) {
            setLoadButtonMode(loadButton, 'pausing');
          }
        },
        resumeState,
      );

      if (result.paused) {
        updateProgressUI(progress, {
          label: `Pozastaveno na stránce ${result.nextPage}/${result.targetPages}`,
          current: Math.max(0, result.nextPage - 1),
          total: result.targetPages || 1,
        });
      } else {
        clearPersistedLoaderState();
        updateProgressUI(progress, {
          label: `Hotovo: ${result.totalParsed} hodnocení uloženo (${result.totalPagesLoaded} str., DB: ${result.storeName})`,
          current: result.totalPagesLoaded,
          total: result.totalPagesLoaded || 1,
        });
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
      } else {
        setLoadButtonMode(loadButton, 'idle');
      }
    }
  };

  loadButton.addEventListener('click', async () => {
    if (loaderController.isRunning) {
      loaderController.pauseRequested = true;
      loaderController.pauseReason = 'manual';
      setLoadButtonMode(loadButton, 'pausing');
      return;
    }

    const state = getPersistedLoaderState();
    await runLoad({
      resumeState: state?.status === 'paused' ? state : undefined,
      autoResume: false,
    });
  });

  const userSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
  const state = getPersistedLoaderState();
  if (state?.status === 'paused' && isStateForCurrentUser(state, userSlug)) {
    setLoadButtonMode(loadButton, 'resume');

    if (state.pauseReason === 'manual') {
      updateProgressUI(progress, {
        label: `Pozastaveno ručně na stránce ${state.nextPage}/${state.targetPages || '?'}`,
        current: Math.max(0, (state.nextPage || 1) - 1),
        total: state.targetPages || 1,
      });
      return;
    }

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
