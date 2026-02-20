import {
  CREATOR_PREVIEW_ENABLED_KEY,
  CREATOR_PREVIEW_SHOW_BIRTH_KEY,
  CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
} from './config.js';

// ==========================================
// 1. DATA STRUCTURES (TYPES)
// ==========================================

/**
 * @typedef {Object} CreatorPreviewData
 * @property {string|undefined} imageUrl - Normalized URL of the best available photo.
 * @property {string|undefined} birthInfo - Extracted birth date and location text.
 * @property {string|undefined} deathAgeInfo - Age at death, if applicable.
 * @property {string|undefined} birthFlagUrl - URL to the country flag image.
 * @property {string|undefined} birthFlagAlt - Alt text for the country flag.
 * @property {string|undefined} photoFromInfo - Source/copyright info for the photo.
 * @property {'movie'|'copyright'|undefined} photoFromKind - Type of photo source.
 * @property {string|undefined} photoFromYear - Year the photo was taken (if from a movie).
 */

// ==========================================
// 2. CONFIGURATION & STATE
// ==========================================

const CREATOR_LINK_SELECTOR = 'a[href*="/tvurce/"], a[href*="/tvorca/"]';
const MAX_CREATORS_IN_CACHE = 24;
const MAX_IMAGE_CANDIDATES = 6;
const PREVIEW_OFFSET_X = 18;
const PREVIEW_OFFSET_Y = 18;

// DOM Elements
let previewRoot;
let previewImage;
let previewName;
let previewNameText;
let previewNameFlag;
let previewMeta;
let previewMetaBirth;
let previewMetaBirthText;
let previewMetaBirthAgeInline;
let previewMetaAge;
let previewMetaPhotoFrom;
let previewMetaPhotoSource;
let previewMetaPhotoYear;

// Interaction State
let activeAnchor;
let pointerX = 0;
let pointerY = 0;
let hoverToken = 0; // Used to prevent race conditions when hovering multiple links quickly

// Network & Data Caches
const creatorPreviewCache = new Map();
const creatorCacheOrder = [];
const creatorFetchPromises = new Map();
const failedImageUrls = new Set();
const imageProbeResultCache = new Map();

// ==========================================
// 3. UTILITIES & PREFERENCES
// ==========================================

/** @returns {boolean} Whether the preview feature is enabled in local storage. */
function isCreatorPreviewEnabled() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

/** @returns {boolean} Whether birth information should be shown. */
function isCreatorPreviewBirthVisible() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

/** @returns {boolean} Whether photo source information should be shown. */
function isCreatorPreviewPhotoFromVisible() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

/**
 * Collapses multiple spaces into a single space and trims the string.
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ==========================================
// 4. DOM MANAGEMENT & UI
// ==========================================

/**
 * Bootstraps the DOM elements required for the preview card.
 * Only runs once; exits early if the root element already exists.
 */
function ensurePreviewElements() {
  if (previewRoot) {
    return;
  }

  previewRoot = document.createElement('div');
  previewRoot.className = 'cc-creator-preview';
  previewRoot.hidden = true;

  const card = document.createElement('div');
  card.className = 'cc-creator-preview-card';

  previewImage = document.createElement('img');
  previewImage.className = 'cc-creator-preview-image';
  previewImage.alt = '';
  previewImage.loading = 'lazy';

  previewName = document.createElement('div');
  previewName.className = 'cc-creator-preview-name';

  previewNameText = document.createElement('span');

  previewNameFlag = document.createElement('img');
  previewNameFlag.className = 'cc-creator-preview-name-flag';
  previewNameFlag.alt = '';
  previewNameFlag.hidden = true;

  previewName.appendChild(previewNameText);
  previewName.appendChild(previewNameFlag);

  previewMeta = document.createElement('div');
  previewMeta.className = 'cc-creator-preview-meta';

  previewMetaBirth = document.createElement('div');
  previewMetaBirth.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-birth';

  previewMetaBirthText = document.createElement('span');
  previewMetaBirthAgeInline = document.createElement('span');
  previewMetaBirthAgeInline.className = 'cc-creator-preview-meta-birth-age-inline';

  previewMetaBirth.appendChild(previewMetaBirthText);
  previewMetaBirth.appendChild(previewMetaBirthAgeInline);

  previewMetaAge = document.createElement('div');
  previewMetaAge.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-age';

  previewMetaPhotoFrom = document.createElement('div');
  previewMetaPhotoFrom.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-photo';

  previewMetaPhotoSource = document.createElement('span');
  previewMetaPhotoSource.className = 'cc-creator-preview-meta-photo-source';

  previewMetaPhotoYear = document.createElement('span');
  previewMetaPhotoYear.className = 'cc-creator-preview-meta-photo-year';

  previewMetaPhotoFrom.appendChild(previewMetaPhotoSource);
  previewMetaPhotoFrom.appendChild(previewMetaPhotoYear);

  previewMeta.appendChild(previewMetaBirth);
  previewMeta.appendChild(previewMetaAge);
  previewMeta.appendChild(previewMetaPhotoFrom);

  card.appendChild(previewImage);
  card.appendChild(previewName);
  card.appendChild(previewMeta);
  previewRoot.appendChild(card);
  document.body.appendChild(previewRoot);
}

/** Hides the preview card and cleans up state classes. */
function hidePreview() {
  if (!previewRoot) {
    return;
  }

  previewRoot.hidden = true;
  previewRoot.classList.remove('is-visible');
  previewRoot.classList.remove('is-no-image');
}

/**
 * Calculates and applies the X/Y position of the preview card relative to the cursor.
 * Keeps the card bounded within the viewport margins.
 */
function positionPreview() {
  if (!previewRoot || previewRoot.hidden) {
    return;
  }

  const margin = 10; // Distance from the edge of the viewport
  const rect = previewRoot.getBoundingClientRect();
  const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxY = Math.max(margin, window.innerHeight - rect.height - margin);

  const desiredX = pointerX + PREVIEW_OFFSET_X;
  const desiredY = pointerY + PREVIEW_OFFSET_Y;

  const x = Math.min(maxX, Math.max(margin, desiredX));
  const y = Math.min(maxY, Math.max(margin, desiredY));

  previewRoot.style.left = `${x}px`;
  previewRoot.style.top = `${y}px`;
}

// ==========================================
// 5. URL & CACHE MANAGEMENT
// ==========================================

/**
 * Cleans up creator URLs to point to their overview page for consistent fetching.
 * Accounts for both CZ (.cz/prehled/) and SK (.sk/prehlad/) domains.
 * @param {string|null} href
 * @returns {string|undefined} Normalized URL
 */
function normalizeCreatorUrl(href) {
  if (!href) {
    return undefined;
  }

  try {
    const url = new URL(href, location.origin);
    url.search = '';
    url.hash = '';
    // Matches patterns like /tvurce/123-john-doe/
    const pathname = url.pathname.match(/^\/(tvurce|tvorca)\/\d+-[^/]+\//i);
    if (!pathname) {
      return undefined;
    }

    const overviewSegment = location.hostname.endsWith('.sk') ? 'prehlad' : 'prehled';
    url.pathname = `${pathname[0]}${overviewSegment}/`;
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Extracts the unique ID/slug from a normalized creator URL.
 * @param {string} url
 * @returns {string|undefined}
 */
function getCreatorSlugFromUrl(url) {
  const match = String(url || '').match(/\/(tvurce|tvorca)\/(\d+-[^/]+)\//i);
  return match ? match[2] : undefined;
}

/**
 * Saves fetched creator data to an LRU (Least Recently Used) cache.
 * @param {string} slug
 * @param {CreatorPreviewData} data
 */
function upsertCreatorCache(slug, data) {
  if (!slug || !data) {
    return;
  }

  creatorPreviewCache.set(slug, {
    imageUrl: data.imageUrl,
    birthInfo: data.birthInfo,
    deathAgeInfo: data.deathAgeInfo,
    birthFlagUrl: data.birthFlagUrl,
    birthFlagAlt: data.birthFlagAlt,
    photoFromInfo: data.photoFromInfo,
    photoFromKind: data.photoFromKind,
    photoFromYear: data.photoFromYear,
  });

  // LRU Eviction logic
  const existingIndex = creatorCacheOrder.indexOf(slug);
  if (existingIndex >= 0) {
    creatorCacheOrder.splice(existingIndex, 1);
  }
  creatorCacheOrder.push(slug);

  while (creatorCacheOrder.length > MAX_CREATORS_IN_CACHE) {
    const oldest = creatorCacheOrder.shift();
    if (oldest) {
      creatorPreviewCache.delete(oldest);
    }
  }
}

/**
 * Parses a standard HTML srcset attribute into an array of individual URLs.
 * @param {string|null} srcset
 * @returns {string[]}
 */
function extractUrlsFromSrcset(srcset) {
  if (!srcset) {
    return [];
  }

  return srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * @param {string} rawUrl
 * @returns {string|undefined}
 */
function normalizeImageUrl(rawUrl) {
  if (!rawUrl) {
    return undefined;
  }

  try {
    return new URL(rawUrl, location.origin).toString();
  } catch {
    return undefined;
  }
}

// ==========================================
// 6. HTML PARSING & SCRAPING
// ==========================================

/**
 * Scores an image URL based on its dimensions, preferring sizes closest to 100x132.
 * Lower score is better.
 * @param {string} url
 * @returns {number}
 */
function getImageSizeScore(url) {
  if (!url) {
    return 9999;
  }

  // Matches explicitly defined width/height in URL (e.g., /w100h132crop/)
  const preciseMatch = url.match(/\/w(\d+)h(\d+)(?:crop)?\//i);
  if (preciseMatch) {
    const width = Number.parseInt(preciseMatch[1], 10);
    const height = Number.parseInt(preciseMatch[2], 10);
    return Math.abs(width - 100) + Math.abs(height - 132);
  }

  // Matches width-only parameters (e.g., /w100/)
  const widthMatch = url.match(/\/w(\d+)(?:h\d+)?\//i);
  if (widthMatch) {
    const width = Number.parseInt(widthMatch[1], 10);
    return Math.abs(width - 100) + 120; // +120 penalty for missing height
  }

  return 2000; // Base penalty for unrecognizable sizes
}

/**
 * Strips resizing parameters from an image URL to get the full-res original.
 * @param {string} url
 * @returns {string|undefined}
 */
function toOriginalVariant(url) {
  if (!url) {
    return undefined;
  }
  return url.replace(/\/cache\/resized\/w\d+h\d+(?:crop)?\//i, '/').replace(/\/cache\/resized\/w\d+\//i, '/');
}

/**
 * Scrapes the DOM for all potential creator profile images, including fallbacks (OG/Twitter).
 * @param {Document} doc - The parsed HTML document of the creator's page.
 * @returns {string[]} Sorted array of image candidates.
 */
function pickCreatorImageCandidates(doc) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (candidateUrl) => {
    const normalized = normalizeImageUrl(candidateUrl);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    candidates.push(normalized);

    const originalVariant = normalizeImageUrl(toOriginalVariant(normalized));
    if (originalVariant && !seen.has(originalVariant)) {
      seen.add(originalVariant);
      candidates.push(originalVariant);
    }
  };

  const profileImage =
    doc.querySelector('.creator-profile-header figure img, .creator-profile figure img') ||
    doc.querySelector(
      '.creator-profile-header img[src*="/creator/photos/"], .creator-profile img[src*="/creator/photos/"]',
    );

  if (profileImage) {
    pushCandidate(profileImage.getAttribute('src'));
    extractUrlsFromSrcset(profileImage.getAttribute('srcset')).forEach(pushCandidate);

    const sourceUrls = Array.from(profileImage.closest('picture')?.querySelectorAll('source') || []).flatMap((source) =>
      extractUrlsFromSrcset(source.getAttribute('srcset')),
    );
    sourceUrls.forEach(pushCandidate);
  }

  pushCandidate(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'));
  pushCandidate(doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content'));

  return candidates
    .filter((url) => /\/creator\//i.test(url)) // Ensure it's actually a creator image
    .sort((a, b) => getImageSizeScore(a) - getImageSizeScore(b))
    .slice(0, MAX_IMAGE_CANDIDATES);
}

/**
 * Removes whitespace from a date string (e.g., "1. 1. 2000" -> "1.1.2000").
 * @param {string} value
 * @returns {string}
 */
function normalizeDateToken(value) {
  return normalizeText(value).replace(/\s*/g, '');
}

/**
 * Attempts to locate and parse a standard European date format from a text node.
 * @param {Element|undefined} paragraph
 * @returns {string|undefined}
 */
function extractDateFromParagraph(paragraph) {
  if (!paragraph) {
    return undefined;
  }

  const line = normalizeText(paragraph.textContent || '');
  if (!line) {
    return undefined;
  }

  // Matches formats like "1.1.2000" or "01. 12. 1995"
  const dateMatch = line.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/);
  if (dateMatch) {
    return normalizeDateToken(dateMatch[1]);
  }

  return undefined;
}

/**
 * Computes a person's current age based on their birth date.
 * @param {string} birthInfo
 * @returns {string|undefined} Age string (e.g., "45 let")
 */
function calculateCurrentAgeFromBirthInfo(birthInfo) {
  const line = normalizeText(birthInfo || '');
  const match = line.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) {
    return undefined;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return undefined;
  }

  const now = new Date();
  let age = now.getFullYear() - year;
  const hadBirthdayThisYear = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!hadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? `${age} let` : undefined;
}

/**
 * Scrapes birth date, death date, and nationality flag from the creator's profile page.
 * @param {Document} doc
 * @returns {Partial<CreatorPreviewData>}
 */
function extractLifeInfo(doc) {
  const detailsParagraphs = Array.from(doc.querySelectorAll('.creator-profile-details p'));
  if (detailsParagraphs.length === 0) {
    return {
      birthInfo: undefined,
      deathAgeInfo: undefined,
      birthFlagUrl: undefined,
      birthFlagAlt: undefined,
    };
  }

  // Look for language-specific keywords for birth and death
  const birthParagraph =
    detailsParagraphs.find((paragraph) => /\bnar\.|\bnaroden|\bborn\b/i.test(normalizeText(paragraph.textContent))) ||
    detailsParagraphs[0];

  const deathParagraph = detailsParagraphs.find((paragraph) =>
    /\bzem\.|\bzomr|\bdied\b/i.test(normalizeText(paragraph.textContent)),
  );

  const birthDate = extractDateFromParagraph(birthParagraph);
  const deathDate = extractDateFromParagraph(deathParagraph);
  const deathAge = normalizeText(deathParagraph?.querySelector('.info')?.textContent || '').replace(/^\((.*)\)$/, '$1');

  let birthInfo;
  if (birthDate && deathDate) {
    birthInfo = `${birthDate} → ${deathDate}`;
  } else if (birthDate) {
    birthInfo = `nar. ${birthDate}`;
  } else {
    // Fallback: Clone the node and remove the location tag to just get the text
    const birthClone = birthParagraph?.cloneNode(true);
    if (birthClone) {
      birthClone.querySelector('.info-place')?.remove();
      birthInfo = normalizeText(birthClone.textContent || '');
    }
  }

  const flagImage =
    birthParagraph?.querySelector('.info-place img.flag') ||
    detailsParagraphs[0]?.querySelector('.info-place img.flag') ||
    doc.querySelector('.creator-profile-details .info-place img.flag');

  return {
    birthInfo,
    deathAgeInfo: deathAge || undefined,
    birthFlagUrl: normalizeImageUrl(flagImage?.getAttribute('src')),
    birthFlagAlt: normalizeText(flagImage?.getAttribute('title') || flagImage?.getAttribute('alt') || ''),
  };
}

/**
 * Scrapes metadata about where the profile photo came from (e.g., copyright or movie still).
 * @param {Document} doc
 * @returns {Partial<CreatorPreviewData>}
 */
function extractPhotoFromInfo(doc) {
  const footer = doc.querySelector('.creator-profile-footer');
  if (!footer) {
    return {
      photoFromInfo: undefined,
      photoFromKind: undefined,
      photoFromYear: undefined,
    };
  }

  const movieAnchor = footer.querySelector('a.item-movie');
  if (movieAnchor) {
    const movieTitle = normalizeText(movieAnchor.textContent);
    const siblingYear =
      movieAnchor.nextElementSibling instanceof Element && movieAnchor.nextElementSibling.matches('.item-movie-rest')
        ? movieAnchor.nextElementSibling
        : undefined;
    const movieYear = normalizeText(
      footer.querySelector('.item-movie-rest')?.textContent || siblingYear?.textContent || '',
    );

    if (movieTitle) {
      return {
        photoFromInfo: movieTitle,
        photoFromKind: 'movie',
        photoFromYear: movieYear,
      };
    }
  }

  const sourceText = normalizeText(footer.querySelector('.item-text')?.textContent || '');
  if (!sourceText) {
    return {
      photoFromInfo: undefined,
      photoFromKind: undefined,
      photoFromYear: undefined,
    };
  }

  // Clean up typical copyright text noise
  let normalizedSource = sourceText.replace(/^(photo|foto)\s*/i, '').trim() || sourceText;
  normalizedSource = normalizedSource.replace(/^([©Ⓒ]|\(c\)|copyright)\s*/i, '').trim() || normalizedSource;
  return {
    photoFromInfo: normalizedSource,
    photoFromKind: 'copyright',
    photoFromYear: undefined,
  };
}

// ==========================================
// 7. NETWORK & IMAGE VALIDATION
// ==========================================

/**
 * Pre-loads an image to verify it actually resolves and has valid dimensions.
 * Prevents rendering 1x1 tracking pixels or broken images.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function probeImageUrl(url, timeoutMs = 5000) {
  if (!url) {
    return Promise.resolve(false);
  }

  if (failedImageUrls.has(url)) {
    return Promise.resolve(false);
  }

  if (imageProbeResultCache.has(url)) {
    return Promise.resolve(imageProbeResultCache.get(url) === true);
  }

  return new Promise((resolve) => {
    const probe = new Image();
    let done = false;

    const finish = (isValid) => {
      if (done) {
        return;
      }

      done = true;
      imageProbeResultCache.set(url, isValid);
      resolve(isValid);
    };

    const timeout = window.setTimeout(() => {
      finish(false);
    }, timeoutMs);

    probe.onload = () => {
      window.clearTimeout(timeout);
      const validDimensions = Number.isFinite(probe.naturalWidth) && Number.isFinite(probe.naturalHeight);
      // Reject images that are smaller than 8x8 (likely tracking pixels)
      finish(validDimensions && probe.naturalWidth > 8 && probe.naturalHeight > 8);
    };

    probe.onerror = () => {
      window.clearTimeout(timeout);
      finish(false);
    };

    probe.src = url;
  });
}

/**
 * Fetches the target creator page in the background and parses it for preview data.
 * @param {string} creatorUrl
 * @returns {Promise<CreatorPreviewData>}
 */
async function fetchCreatorPreviewDataFromUrl(creatorUrl) {
  const response = await fetch(creatorUrl, {
    credentials: 'include',
    method: 'GET',
  });

  if (!response.ok) {
    return {
      imageUrl: undefined,
      birthInfo: undefined,
      deathAgeInfo: undefined,
      birthFlagUrl: undefined,
      birthFlagAlt: undefined,
      photoFromInfo: undefined,
      photoFromKind: undefined,
      photoFromYear: undefined,
    };
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imageCandidates = pickCreatorImageCandidates(doc);

  let validImageUrl;
  // Test candidate images one by one until a valid one is found
  for (const candidateUrl of imageCandidates) {
    const isValid = await probeImageUrl(candidateUrl);
    if (isValid) {
      validImageUrl = candidateUrl;
      break;
    }

    failedImageUrls.add(candidateUrl);
  }

  return {
    imageUrl: validImageUrl,
    ...extractLifeInfo(doc),
    ...extractPhotoFromInfo(doc),
  };
}

/**
 * Orchestrates the data fetching, checking the cache and resolving inflight requests.
 * @param {Element} anchorEl
 * @returns {Promise<CreatorPreviewData|undefined>}
 */
async function getCreatorPreviewDataForLink(anchorEl) {
  const creatorUrl = normalizeCreatorUrl(anchorEl.getAttribute('href'));
  if (!creatorUrl) {
    return undefined;
  }

  const creatorSlug = getCreatorSlugFromUrl(creatorUrl);
  if (!creatorSlug) {
    return undefined;
  }

  if (creatorPreviewCache.has(creatorSlug)) {
    return creatorPreviewCache.get(creatorSlug);
  }

  // Prevent duplicate network requests if user hovers multiple times before resolution
  if (!creatorFetchPromises.has(creatorSlug)) {
    const fetchPromise = fetchCreatorPreviewDataFromUrl(creatorUrl)
      .catch(() => ({
        imageUrl: undefined,
        birthInfo: undefined,
        deathAgeInfo: undefined,
        birthFlagUrl: undefined,
        birthFlagAlt: undefined,
        photoFromInfo: undefined,
        photoFromKind: undefined,
        photoFromYear: undefined,
      }))
      .then((data) => {
        upsertCreatorCache(creatorSlug, data);
        return data;
      })
      .finally(() => {
        creatorFetchPromises.delete(creatorSlug);
      });

    creatorFetchPromises.set(creatorSlug, fetchPromise);
  }

  const inFlight = creatorFetchPromises.get(creatorSlug);
  return inFlight ? await inFlight : undefined;
}

// ==========================================
// 8. RENDER CONTROLLERS
// ==========================================

/**
 * Updates the DOM elements for the text-based metadata (birth, age, photo source).
 * @param {CreatorPreviewData} data
 */
function renderPreviewMeta(data) {
  if (
    !previewMeta ||
    !previewMetaBirth ||
    !previewMetaBirthText ||
    !previewMetaBirthAgeInline ||
    !previewMetaAge ||
    !previewMetaPhotoFrom ||
    !previewMetaPhotoSource ||
    !previewMetaPhotoYear
  ) {
    return;
  }

  const showBirth = isCreatorPreviewBirthVisible() && Boolean(data?.birthInfo);
  const liveAgeInfo = showBirth && !data?.deathAgeInfo ? calculateCurrentAgeFromBirthInfo(data?.birthInfo) : undefined;
  const deceasedAgeInfo = showBirth ? data?.deathAgeInfo : undefined;
  const showAgeLine = Boolean(deceasedAgeInfo);
  const showPhotoFrom = isCreatorPreviewPhotoFromVisible() && Boolean(data?.photoFromInfo);

  if (showBirth) {
    previewMetaBirthText.textContent = data.birthInfo;
    previewMetaBirthAgeInline.textContent = liveAgeInfo ? ` (${liveAgeInfo})` : '';
    previewMetaBirthAgeInline.hidden = !liveAgeInfo;
  } else {
    previewMetaBirthText.textContent = '';
    previewMetaBirthAgeInline.textContent = '';
    previewMetaBirthAgeInline.hidden = true;
  }
  previewMetaBirth.hidden = !showBirth;

  previewMetaAge.textContent = showAgeLine ? `(${deceasedAgeInfo})` : '';
  previewMetaAge.hidden = !showAgeLine;

  previewMetaPhotoFrom.classList.remove('is-movie', 'is-copyright');
  if (showPhotoFrom) {
    const kind = data?.photoFromKind === 'movie' ? 'movie' : 'copyright';
    previewMetaPhotoFrom.classList.add(kind === 'movie' ? 'is-movie' : 'is-copyright');
    previewMetaPhotoSource.textContent = data.photoFromInfo || '';
    previewMetaPhotoYear.textContent = kind === 'movie' ? normalizeText(data?.photoFromYear || '') : '';
    previewMetaPhotoYear.hidden = !(kind === 'movie' && Boolean(previewMetaPhotoYear.textContent));
  } else {
    previewMetaPhotoSource.textContent = '';
    previewMetaPhotoYear.textContent = '';
    previewMetaPhotoYear.hidden = true;
  }
  previewMetaPhotoFrom.hidden = !showPhotoFrom;

  previewMeta.hidden = !showBirth && !showPhotoFrom && !showAgeLine;
}

/**
 * Handles the fallback state when a creator has a profile but no valid photo.
 * @param {string} label
 * @param {CreatorPreviewData} data
 */
function showNoImagePreview(label, data) {
  ensurePreviewElements();
  previewImage.removeAttribute('src');
  previewImage.alt = 'Bez fotografie';
  previewNameText.textContent = label;

  if (data?.birthFlagUrl) {
    previewNameFlag.src = data.birthFlagUrl;
    previewNameFlag.alt = data.birthFlagAlt || '';
    previewNameFlag.title = data.birthFlagAlt || '';
    previewNameFlag.hidden = false;
  } else {
    previewNameFlag.removeAttribute('src');
    previewNameFlag.alt = '';
    previewNameFlag.title = '';
    previewNameFlag.hidden = true;
  }

  renderPreviewMeta(data);
  previewRoot.hidden = false;
  previewRoot.classList.add('is-visible', 'is-no-image');
  positionPreview();
}

/**
 * Master rendering function. Fetches data and updates the full DOM tree for the preview.
 * @param {Element} anchorEl
 * @param {number} token - Validates that the user hasn't hovered away during the fetch.
 */
async function showPreviewForAnchor(anchorEl, token) {
  ensurePreviewElements();

  if (!isCreatorPreviewEnabled()) {
    hidePreview();
    return;
  }

  const anchorText = anchorEl.textContent?.replace(/\s+/g, ' ').trim() || 'Tvůrce';
  const previewData = await getCreatorPreviewDataForLink(anchorEl);

  // Abort if the user moved on to another link while we were fetching
  if (token !== hoverToken || activeAnchor !== anchorEl) {
    return;
  }

  if (!previewData || !previewData.imageUrl) {
    showNoImagePreview(anchorText, previewData);
    return;
  }

  previewImage.src = previewData.imageUrl;
  previewImage.alt = anchorText;
  previewNameText.textContent = anchorText;

  if (previewData?.birthFlagUrl) {
    previewNameFlag.src = previewData.birthFlagUrl;
    previewNameFlag.alt = previewData.birthFlagAlt || '';
    previewNameFlag.title = previewData.birthFlagAlt || '';
    previewNameFlag.hidden = false;
  } else {
    previewNameFlag.removeAttribute('src');
    previewNameFlag.alt = '';
    previewNameFlag.title = '';
    previewNameFlag.hidden = true;
  }

  renderPreviewMeta(previewData);
  previewRoot.hidden = false;
  previewRoot.classList.remove('is-no-image');
  previewRoot.classList.add('is-visible');
  positionPreview();
}

// ==========================================
// 9. EVENT HANDLERS & INITIALIZATION
// ==========================================

function handlePointerMove(event) {
  pointerX = event.clientX;
  pointerY = event.clientY;
  positionPreview();
}

function handlePointerOver(event) {
  const anchorEl = event.target.closest(CREATOR_LINK_SELECTOR);
  if (!anchorEl) {
    return;
  }

  if (!isCreatorPreviewEnabled()) {
    return;
  }

  if (activeAnchor === anchorEl) {
    return;
  }

  activeAnchor = anchorEl;
  hoverToken += 1;
  showPreviewForAnchor(anchorEl, hoverToken).catch(() => {
    if (hoverToken && activeAnchor === anchorEl) {
      hidePreview();
    }
  });
}

function handlePointerOut(event) {
  if (!activeAnchor) {
    return;
  }

  // Don't hide if moving between nested elements inside the anchor
  const related = event.relatedTarget;
  if (related instanceof Element && activeAnchor.contains(related)) {
    return;
  }

  const leftFromActiveAnchor =
    event.target instanceof Element && event.target.closest(CREATOR_LINK_SELECTOR) === activeAnchor;
  if (!leftFromActiveAnchor) {
    return;
  }

  activeAnchor = undefined;
  hoverToken += 1;
  hidePreview();
}

/**
 * Call this function once on page load to bind global event listeners.
 */
export function initializeCreatorHoverPreview() {
  ensurePreviewElements();

  // Disable preview on creator detail pages (we don't want popups when hovering the tabs there)
  const onCreatorPage = /^\/(tvurce|tvorca)\/\d+-[^/]+\//i.test(location.pathname || '');
  if (onCreatorPage) {
    // Ensure preview is hidden and don't bind global handlers on creator pages
    hidePreview();
    return;
  }

  document.addEventListener('mousemove', handlePointerMove, true);
  document.addEventListener('mouseover', handlePointerOver, true);
  document.addEventListener('mouseout', handlePointerOut, true);

  window.addEventListener(
    'scroll',
    () => {
      positionPreview();
    },
    true,
  );

  // Listen for preference changes from the UI
  window.addEventListener('cc-creator-preview-toggled', () => {
    if (!isCreatorPreviewEnabled()) {
      hidePreview();
      activeAnchor = undefined;
      hoverToken += 1;
      return;
    }

    if (activeAnchor) {
      hoverToken += 1;
      showPreviewForAnchor(activeAnchor, hoverToken).catch(() => {
        hidePreview();
      });
    }
  });
}
