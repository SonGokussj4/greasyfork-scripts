import {
  CREATOR_PREVIEW_ENABLED_KEY,
  CREATOR_PREVIEW_SHOW_BIRTH_KEY,
  CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
} from './config.js';

const CREATOR_LINK_SELECTOR = 'a[href*="/tvurce/"], a[href*="/tvorca/"]';
const MAX_CREATORS_IN_CACHE = 24;
const MAX_IMAGE_CANDIDATES = 6;
const PREVIEW_OFFSET_X = 18;
const PREVIEW_OFFSET_Y = 18;

let previewRoot;
let previewImage;
let previewName;
let previewMeta;
let previewMetaBirth;
let previewMetaPhotoFrom;
let activeAnchor;
let pointerX = 0;
let pointerY = 0;
let hoverToken = 0;

const creatorPreviewCache = new Map();
const creatorCacheOrder = [];
const creatorFetchPromises = new Map();
const failedImageUrls = new Set();
const imageProbeResultCache = new Map();

function isCreatorPreviewEnabled() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function isCreatorPreviewBirthVisible() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function isCreatorPreviewPhotoFromVisible() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  previewMeta = document.createElement('div');
  previewMeta.className = 'cc-creator-preview-meta';

  previewMetaBirth = document.createElement('div');
  previewMetaBirth.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-birth';

  previewMetaPhotoFrom = document.createElement('div');
  previewMetaPhotoFrom.className = 'cc-creator-preview-meta-line cc-creator-preview-meta-photo';

  previewMeta.appendChild(previewMetaBirth);
  previewMeta.appendChild(previewMetaPhotoFrom);

  card.appendChild(previewImage);
  card.appendChild(previewName);
  card.appendChild(previewMeta);
  previewRoot.appendChild(card);
  document.body.appendChild(previewRoot);
}

function hidePreview() {
  if (!previewRoot) {
    return;
  }

  previewRoot.hidden = true;
  previewRoot.classList.remove('is-visible');
  previewRoot.classList.remove('is-no-image');
}

function positionPreview() {
  if (!previewRoot || previewRoot.hidden) {
    return;
  }

  const margin = 10;
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

function normalizeCreatorUrl(href) {
  if (!href) {
    return undefined;
  }

  try {
    const url = new URL(href, location.origin);
    url.search = '';
    url.hash = '';
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

function getCreatorSlugFromUrl(url) {
  const match = String(url || '').match(/\/(tvurce|tvorca)\/(\d+-[^/]+)\//i);
  return match ? match[2] : undefined;
}

function upsertCreatorCache(slug, data) {
  if (!slug || !data) {
    return;
  }

  creatorPreviewCache.set(slug, {
    imageUrl: data.imageUrl,
    birthInfo: data.birthInfo,
    photoFromInfo: data.photoFromInfo,
  });

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

function extractUrlsFromSrcset(srcset) {
  if (!srcset) {
    return [];
  }

  return srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

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

function getImageSizeScore(url) {
  if (!url) {
    return 9999;
  }

  const preciseMatch = url.match(/\/w(\d+)h(\d+)(?:crop)?\//i);
  if (preciseMatch) {
    const width = Number.parseInt(preciseMatch[1], 10);
    const height = Number.parseInt(preciseMatch[2], 10);
    return Math.abs(width - 100) + Math.abs(height - 132);
  }

  const widthMatch = url.match(/\/w(\d+)(?:h\d+)?\//i);
  if (widthMatch) {
    const width = Number.parseInt(widthMatch[1], 10);
    return Math.abs(width - 100) + 120;
  }

  return 2000;
}

function toOriginalVariant(url) {
  if (!url) {
    return undefined;
  }

  return url.replace(/\/cache\/resized\/w\d+h\d+(?:crop)?\//i, '/').replace(/\/cache\/resized\/w\d+\//i, '/');
}

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
    .filter((url) => /\/creator\//i.test(url))
    .sort((a, b) => getImageSizeScore(a) - getImageSizeScore(b))
    .slice(0, MAX_IMAGE_CANDIDATES);
}

function extractBirthInfo(doc) {
  const detailsParagraph = doc.querySelector('.creator-profile-details p');
  if (!detailsParagraph) {
    return undefined;
  }

  const clone = detailsParagraph.cloneNode(true);
  clone.querySelector('.info-place')?.remove();
  const line = normalizeText(clone.textContent);

  if (!line) {
    return undefined;
  }

  if (/\bnar\.|\bnaroden|\bborn\b/i.test(line)) {
    return line;
  }

  return undefined;
}

function extractPhotoFromInfo(doc) {
  const containers = [
    ...doc.querySelectorAll(
      '.creator-profile-footer, .creator-profile-content, .creator-profile-details, .creator-profile',
    ),
  ];

  let movieAnchor;
  let sourceContainer;
  for (const container of containers) {
    const candidateAnchor = container.querySelector('a.item-movie');
    if (candidateAnchor) {
      movieAnchor = candidateAnchor;
      sourceContainer = candidateAnchor.closest('.creator-profile-footer') || container;
      break;
    }
  }

  if (!movieAnchor || !sourceContainer) {
    return undefined;
  }

  const movieTitle = normalizeText(movieAnchor.textContent);
  if (!movieTitle) {
    return undefined;
  }

  const rawLabel = normalizeText(sourceContainer.querySelector('.item-text')?.textContent || '');
  const prefix = /photo\s*from|foto\s*z|foto\s*z\s*filmu/i.test(rawLabel) ? rawLabel : 'Photo from';

  const siblingYear =
    movieAnchor.nextElementSibling instanceof Element && movieAnchor.nextElementSibling.matches('.item-movie-rest')
      ? movieAnchor.nextElementSibling
      : undefined;
  const movieYear = normalizeText(
    sourceContainer.querySelector('.item-movie-rest')?.textContent || siblingYear?.textContent || '',
  );

  return movieYear ? `${prefix} ${movieTitle} ${movieYear}` : `${prefix} ${movieTitle}`;
}

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
      finish(validDimensions && probe.naturalWidth > 8 && probe.naturalHeight > 8);
    };

    probe.onerror = () => {
      window.clearTimeout(timeout);
      finish(false);
    };

    probe.src = url;
  });
}

async function fetchCreatorPreviewDataFromUrl(creatorUrl) {
  const response = await fetch(creatorUrl, {
    credentials: 'include',
    method: 'GET',
  });

  if (!response.ok) {
    return {
      imageUrl: undefined,
      birthInfo: undefined,
      photoFromInfo: undefined,
    };
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imageCandidates = pickCreatorImageCandidates(doc);

  let validImageUrl;
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
    birthInfo: extractBirthInfo(doc),
    photoFromInfo: extractPhotoFromInfo(doc),
  };
}

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

  if (!creatorFetchPromises.has(creatorSlug)) {
    const fetchPromise = fetchCreatorPreviewDataFromUrl(creatorUrl)
      .catch(() => ({
        imageUrl: undefined,
        birthInfo: undefined,
        photoFromInfo: undefined,
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

function renderPreviewMeta(data) {
  if (!previewMeta || !previewMetaBirth || !previewMetaPhotoFrom) {
    return;
  }

  const showBirth = isCreatorPreviewBirthVisible() && Boolean(data?.birthInfo);
  const showPhotoFrom = isCreatorPreviewPhotoFromVisible() && Boolean(data?.photoFromInfo);

  previewMetaBirth.textContent = showBirth ? data.birthInfo : '';
  previewMetaBirth.hidden = !showBirth;

  previewMetaPhotoFrom.textContent = showPhotoFrom ? data.photoFromInfo : '';
  previewMetaPhotoFrom.hidden = !showPhotoFrom;

  previewMeta.hidden = !showBirth && !showPhotoFrom;
}

function showNoImagePreview(label, data) {
  ensurePreviewElements();
  previewImage.removeAttribute('src');
  previewImage.alt = 'Bez fotografie';
  previewName.textContent = label;
  renderPreviewMeta(data);
  previewRoot.hidden = false;
  previewRoot.classList.add('is-visible', 'is-no-image');
  positionPreview();
}

async function showPreviewForAnchor(anchorEl, token) {
  ensurePreviewElements();

  if (!isCreatorPreviewEnabled()) {
    hidePreview();
    return;
  }

  const anchorText = anchorEl.textContent?.replace(/\s+/g, ' ').trim() || 'Tvůrce';
  const previewData = await getCreatorPreviewDataForLink(anchorEl);
  if (token !== hoverToken || activeAnchor !== anchorEl) {
    return;
  }

  if (!previewData || !previewData.imageUrl) {
    showNoImagePreview(anchorText, previewData);
    return;
  }

  previewImage.src = previewData.imageUrl;
  previewImage.alt = anchorText;
  previewName.textContent = anchorText;
  renderPreviewMeta(previewData);
  previewRoot.hidden = false;
  previewRoot.classList.remove('is-no-image');
  previewRoot.classList.add('is-visible');
  positionPreview();
}

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

export function initializeCreatorHoverPreview() {
  ensurePreviewElements();

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
