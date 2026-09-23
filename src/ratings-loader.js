import {
  INDEXED_DB_NAME,
  NUM_RATINGS_PER_PAGE,
  PROFILE_LINK_SELECTOR,
  RATINGS_STORE_NAME,
  getCsfdPathSegment,
  getCsfdPathSegmentPattern,
  normalizeCsfdShowType,
} from './config.js';
import {
  buildRatingRecordId,
  canReconcileDeletions,
  findStaleRatingRecords,
  reconcileUserRatingRecords,
  toDeletedRatingRecord,
} from './ratings-records.js';
import { deleteItemFromIndexedDB, getAllFromIndexedDB, saveToIndexedDB } from './storage.js';
import { delay, extractUserSlug, getProfileLinkElement, parseRatingFromStars } from './utils.js';

const ALL_RATINGS_FETCH_DELAY_MIN_MS = 50;
const ALL_RATINGS_FETCH_DELAY_MAX_MS = 500;
const COMPUTED_REQUEST_DELAY_MIN_MS = 250;
const COMPUTED_REQUEST_DELAY_MAX_MS = 550;
const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';
const COMPUTED_LOADER_STATE_STORAGE_KEY = 'cc_computed_loader_state_v1';

const loaderController = {
  isRunning: false,
  stopRequested: false,
};

const computedLoaderController = {
  isRunning: false,
  pauseRequested: false,
  pauseReason: 'manual',
};

/**
 * Returns a random inclusive delay between the provided bounds.
 * @param {number} minMs
 * @param {number} maxMs
 * @returns {number}
 */
function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/** Delay used before each full ratings page fetch. */
function getAllRatingsFetchDelayMs() {
  return randomDelay(ALL_RATINGS_FETCH_DELAY_MIN_MS, ALL_RATINGS_FETCH_DELAY_MAX_MS);
}

/** Delay used between computed ratings fetches. */
function getComputedRequestDelayMs() {
  return randomDelay(COMPUTED_REQUEST_DELAY_MIN_MS, COMPUTED_REQUEST_DELAY_MAX_MS);
}

function normalizeProfilePath(profileHref) {
  if (!profileHref) {
    return undefined;
  }

  const url = new URL(profileHref, location.origin);
  return url.pathname;
}

function getCurrentProfilePath() {
  const profileEl = getProfileLinkElement();
  if (!profileEl) {
    return undefined;
  }
  return normalizeProfilePath(profileEl.getAttribute('href'));
}

function getRatingsSegment() {
  return getCsfdPathSegment('ratings');
}

function extractUserSlugFromProfilePath(profilePath) {
  return extractUserSlug(profilePath);
}

function buildRatingsPageUrl(profilePath, pageNumber = 1) {
  return buildRatingsPageUrlWithMode(profilePath, pageNumber, 'path');
}

function buildRatingsPageUrlWithMode(profilePath, pageNumber = 1, mode = 'path') {
  const ratingsSegment = getRatingsSegment();
  const overviewSegments = getCsfdPathSegmentPattern('overview');
  const basePath = profilePath.replace(new RegExp(`\/(${overviewSegments})\/?$`, 'i'), `/${ratingsSegment}/`);
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

/**
 * Fetches a ratings page and parses it into a document.
 * @param {string} url
 * @param {{ delayMs?: number }} [options]
 */
async function fetchRatingsPageDocument(url, options = {}) {
  const parsedDelayMs = Number(options.delayMs ?? 0);
  const delayMs = Number.isFinite(parsedDelayMs) && parsedDelayMs > 0 ? parsedDelayMs : 0;
  if (delayMs > 0) {
    await delay(delayMs);
  }

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

/**
 * Reads the user's total ratings count from a ČSFD ratings page, e.g. "Hodnocení (2 448)".
 * The page has other headings first ("Upozornění", "Fanklub (62)"), so match the ratings heading by text.
 */
export function parseTotalRatingsFromDocument(doc) {
  const heading = Array.from(doc.querySelectorAll('h2, h3'))
    .map((element) => String(element.textContent || '').replace(/\u00a0/g, ' '))
    .find((text) => /hodnocen|hodnoten/i.test(text) && /\(\s*[\d\s]+\)/.test(text));
  const match = heading?.match(/\(([\d\s]+)\)/);
  const parsed = match ? Number.parseInt(match[1].replace(/\s+/g, ''), 10) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
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
  return normalizeCsfdShowType(rawType, 'movie');
}

// helpers exported for tests
export {
  parseRatingsFromDocument,
  normalizeType,
  parseRatingRow,
  createRecordFingerprint,
  hasRecordChanged,
  buildStorageRecordId,
  loadRatingsForCurrentUser,
};

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

/**
 * Parses a single rating row from the user's ratings table and extracts all relevant information into a structured record.
 * Examples of rating rows:
 * - Übel Blatt - Durch Bruch (Break Through)2025epizoda (E01)		11.01.2025
 * - Stargate SG-1 - Bloodlines1997epizoda (S01E11)		26.02.2026
 * - Stranger Things - Season 52025série (S05)		20.02.2026
 * - May I Ask for One Final Thing?2025seriál		20.12.2025
 * @param {*} row The table row element containing the rating information.
 * @param {*} origin The origin URL to resolve relative links against.
 * @returns {Object|undefined} Structured rating record or undefined if parsing fails.
 */
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
  const tokenMatch = infoValues.find((value) => /^\((S\d{1,2}E\d{1,2}|S\d{1,2}|E\d{1,2})\)$/i.test(value));

  let seriesToken = tokenMatch ? tokenMatch.replace(/[()]/g, '') : '';

  // If no explicit series token is found in the info values, attempt to extract it from the name using common patterns
  if (!seriesToken) {
    const nameParent = name.match(/\((S\d{1,2}E\d{1,2}|S\d{1,2}|E\d{1,2})\)/i);
    if (nameParent) {
      seriesToken = nameParent[0].replace(/[()]/g, '');
    } else {
      const nameSeason = name.match(/S(\d{1,2})E(\d{1,2})/i);
      if (nameSeason) {
        seriesToken = `S${nameSeason[1].padStart(2, '0')}E${nameSeason[2].padStart(2, '0')}`;
      } else {
        const nameEpisode = name.match(/Episode\s*(\d{1,3})/i);
        if (nameEpisode) {
          seriesToken = `E${nameEpisode[1].padStart(2, '0')}`;
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

function buildStorageRecordId(userSlug, movieId) {
  return buildRatingRecordId(userSlug, movieId);
}

function toStorageRecord(record, userSlug) {
  const movieId = record.id;

  return {
    ...record,
    movieId,
    userSlug,
    id: buildStorageRecordId(userSlug, movieId),
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

function countsAsDirect(record) {
  return record && record.computed !== true && record.deleted !== true ? 1 : 0;
}

function hasRecordChanged(existingRecord, nextRecord) {
  if (!existingRecord) {
    return true;
  }

  return createRecordFingerprint(existingRecord) !== createRecordFingerprint(nextRecord);
}

/**
 * The sweep may stop once the local count matches ČSFD. With more local ratings than ČSFD
 * reports it never matches, so the sweep runs to the last page and resolves deletions.
 */
export function isSweepInSync({ totalRatings, directRatingsCount }) {
  return totalRatings > 0 && directRatingsCount === totalRatings;
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
    labelEl.textContent = 'Zastavit načítání';
    return;
  }

  if (mode === 'stopping') {
    button.disabled = true;
    labelEl.textContent = 'Zastavuji…';
    return;
  }

  button.disabled = false;
  labelEl.textContent = 'Načíst hodnocení';
}

// Ratings loads are no longer resumable; drop state left behind by older versions.
function clearLegacyLoaderState() {
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
  return parseRatingFromStars(starsEl);
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
  return normalizeCsfdShowType(typeText, 'movie');
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
  return new URL(`/film/${parentSlug}/${getCsfdPathSegment('reviews')}/`, location.origin).toString();
}

function toComputedParentRecord({ userSlug, parentId, parentSlug, existingRecord, parsedRating, doc }) {
  const nowIso = new Date().toISOString();

  return {
    ...(existingRecord || {}),
    id: buildStorageRecordId(userSlug, parentId),
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
  const reconciledRecords = reconcileUserRatingRecords(allRecords, userSlug);
  if (reconciledRecords.hasChanges) {
    await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, reconciledRecords.normalizedRecords);
    await Promise.all(
      reconciledRecords.staleRecordIds.map((recordId) =>
        deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, recordId),
      ),
    );
  }
  const userRecords = reconciledRecords.normalizedRecords;

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
    // Computed ratings keep the legacy pause at the end of each loop iteration so pause/resume stays responsive.
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
      await delay(getComputedRequestDelayMs());
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

/**
 * One sweep over the user's ČSFD ratings, newest page first. Ends when:
 * - 'in-sync': the local count matches ČSFD (unless `sweepToEnd`),
 * - 'stopped': the user pressed Stop (everything loaded so far is kept),
 * - 'completed': the last page was read; only then are ratings missing on ČSFD marked deleted.
 */
async function loadRatingsForCurrentUser(onProgress = () => {}, { sweepToEnd = false, shouldStop = () => false } = {}) {
  const profilePath = getCurrentProfilePath();
  if (!profilePath) {
    throw new Error('Profil uživatele nebyl nalezen.');
  }

  const userSlug = extractUserSlugFromProfilePath(profilePath);
  if (!userSlug) {
    throw new Error('Nepodařilo se přečíst ID uživatele z profilu.');
  }

  const firstDoc = await fetchRatingsPageDocument(buildRatingsPageUrl(profilePath, 1));
  const totalRatings = parseTotalRatingsFromDocument(firstDoc);
  const totalPages = Math.max(1, parseMaxPaginationPageFromDocument(firstDoc));
  const paginationMode = detectPaginationModeFromDocument(firstDoc);

  const allExistingRecords = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
  const reconciledRecords = reconcileUserRatingRecords(allExistingRecords, userSlug);
  if (reconciledRecords.hasChanges) {
    await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, reconciledRecords.normalizedRecords);
    await Promise.all(
      reconciledRecords.staleRecordIds.map((recordId) =>
        deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, recordId),
      ),
    );
  }
  const existingRecordsById = new Map(reconciledRecords.normalizedRecords.map((record) => [record.id, record]));
  let directRatingsCount = reconciledRecords.normalizedRecords.filter(
    (record) => record.computed !== true && record.deleted !== true,
  ).length;

  const seenMovieIds = new Set();
  let loadedPages = 0;
  let totalUpserted = 0;
  let endReason = 'completed';

  for (let page = 1; page <= totalPages; page++) {
    if (page > 1 && shouldStop()) {
      endReason = 'stopped';
      break;
    }

    const doc =
      page === 1
        ? firstDoc
        : await fetchRatingsPageDocument(buildRatingsPageUrlWithMode(profilePath, page, paginationMode), {
            delayMs: getAllRatingsFetchDelayMs(),
          });
    const pageRatings = parseRatingsFromDocument(doc, location.origin);
    if (page > 1 && pageRatings.length === 0) {
      break;
    }

    const changedRecords = [];
    for (const record of pageRatings.map((rating) => toStorageRecord(rating, userSlug))) {
      seenMovieIds.add(record.movieId);
      const existing = existingRecordsById.get(record.id);
      if (!hasRecordChanged(existing, record)) {
        continue;
      }

      changedRecords.push(record);
      directRatingsCount = Math.max(0, directRatingsCount + countsAsDirect(record) - countsAsDirect(existing));
      existingRecordsById.set(record.id, record);
    }

    if (changedRecords.length > 0) {
      await saveToIndexedDB(INDEXED_DB_NAME, getStoreNameForUser(), changedRecords);
      totalUpserted += changedRecords.length;
    }
    loadedPages += 1;

    onProgress({ page, totalPages, totalUpserted, directRatingsCount, totalRatings });

    if (!sweepToEnd && isSweepInSync({ totalRatings, directRatingsCount })) {
      endReason = 'in-sync';
      break;
    }
  }

  let totalMarkedDeleted = 0;
  if (
    endReason === 'completed' &&
    canReconcileDeletions({ completed: true, totalRatings, seenCount: seenMovieIds.size })
  ) {
    const nowIso = new Date().toISOString();
    const deletedRecords = findStaleRatingRecords([...existingRecordsById.values()], seenMovieIds).map((record) =>
      toDeletedRatingRecord(record, nowIso),
    );
    if (deletedRecords.length > 0) {
      await saveToIndexedDB(INDEXED_DB_NAME, getStoreNameForUser(), deletedRecords);
      totalMarkedDeleted = deletedRecords.length;
      directRatingsCount = Math.max(0, directRatingsCount - totalMarkedDeleted);
    }
  }

  return { endReason, loadedPages, totalPages, totalUpserted, totalMarkedDeleted, totalRatings, directRatingsCount };
}

function describeSweepResult(result) {
  const changes = `${result.totalUpserted} nových/změněných`;
  const pages = `${result.loadedPages}/${result.totalPages} str.`;
  if (result.endReason === 'in-sync') {
    return `Vše synchronizováno: ${changes} (${pages})`;
  }
  if (result.endReason === 'stopped') {
    return `Zastaveno: ${changes} uloženo (${pages})`;
  }
  const deleted = result.totalMarkedDeleted > 0 ? `, ${result.totalMarkedDeleted} smazaných na ČSFD` : '';
  return `Hotovo: ${changes}${deleted} (${pages})`;
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

  const runLoad = async ({ sweepToEnd = false } = {}) => {
    if (loaderController.isRunning || computedLoaderController.isRunning) {
      return;
    }

    try {
      loaderController.isRunning = true;
      loaderController.stopRequested = false;
      setLoadButtonMode(loadButton, 'running');
      updateProgressUI(progress, { label: 'Načítám nejnovější hodnocení…', current: 0, total: 1 });

      const result = await loadRatingsForCurrentUser(
        ({ page, totalPages, totalUpserted, directRatingsCount, totalRatings }) => {
          updateProgressUI(progress, {
            label: `Stránka ${page}/${totalPages}: ${totalUpserted} nových/změněných · načteno ${directRatingsCount} / ${totalRatings}`,
            current: page,
            total: totalPages,
          });
        },
        { sweepToEnd, shouldStop: () => loaderController.stopRequested },
      );

      updateProgressUI(progress, {
        label: describeSweepResult(result),
        current: result.loadedPages,
        total: result.totalPages,
      });
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
    } catch (error) {
      updateProgressUI(progress, {
        label: `Chyba: ${error.message}`,
        current: 0,
        total: 1,
      });
      console.error('[CC] Ratings loader failed:', error);
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
    } finally {
      loaderController.isRunning = false;
      loaderController.stopRequested = false;
      setLoadButtonMode(loadButton, 'idle');
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
      const computedState = getPersistedComputedLoaderState();
      if (computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug)) {
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
      }

      setCancelPausedButtonVisible(false);
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
    });
  }

  loadButton.title =
    'Načte hodnocení od nejnovějších a samo skončí, když počet sedí s ČSFD. Kdykoli lze zastavit. Shift+klik: projde všechny stránky.';

  loadButton.addEventListener('click', async (event) => {
    if (computedLoaderController.isRunning) {
      return;
    }

    if (loaderController.isRunning) {
      loaderController.stopRequested = true;
      setLoadButtonMode(loadButton, 'stopping');
      return;
    }

    await runLoad({ sweepToEnd: event.shiftKey === true });
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

  clearLegacyLoaderState();
  const userSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
  const computedState = getPersistedComputedLoaderState();

  if (computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug)) {
    setComputedButtonMode('resume');

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

  const hasComputedPause = computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug);
  setCancelPausedButtonVisible(hasComputedPause, 'computed');
}
