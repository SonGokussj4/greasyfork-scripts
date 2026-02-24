import { INDEXED_DB_NAME, NUM_RATINGS_PER_PAGE, RATINGS_STORE_NAME } from './config.js';
import { getAllFromIndexedDB, saveToIndexedDB } from './storage.js';
import { delay } from './utils.js';

const DEFAULT_MAX_PAGES = 0; // 0 means no limit, load all available pages
const REQUEST_DELAY_MIN_MS = 250;
const REQUEST_DELAY_MAX_MS = 550;
const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';
const COMPUTED_LOADER_STATE_STORAGE_KEY = 'cc_computed_loader_state_v1';
const PROFILE_LINK_SELECTOR =
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
  const profileEl = document.querySelector(PROFILE_LINK_SELECTOR);
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

// helpers exported for tests
export { parseRatingsFromDocument, normalizeType, parseRatingRow, createRecordFingerprint, hasRecordChanged };

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

// expose early-stop predicate for testing
export function evaluateShouldStopEarly({
  incremental,
  page,
  totalRatings,
  directRatingsCount,
  consecutiveStablePages,
}) {
  return (
    !incremental && page >= 2 && totalRatings > 0 && directRatingsCount >= totalRatings && consecutiveStablePages >= 1
  );
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

  const totalRatings = parseTotalRatingsFromDocument(firstDoc);
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

export function initializeRatingsLoader(rootElement) {
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
