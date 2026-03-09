import {
  HOVER_PREVIEW_CACHE_GROUP_PREFIX,
  HOVER_PREVIEW_CACHE_HOURS_KEY,
  HOVER_PREVIEW_CACHE_PREFIX,
  HOVER_PREVIEW_ENABLED_KEY,
  HOVER_PREVIEW_SETTINGS_CHANGED_EVENT,
} from './config.js';
import { getFeatureState } from './utils.js';
import { HOVER_PREVIEW_PROVIDERS } from './hover-preview-providers.js';

let previewRoot;
let secondaryPreviewRoot;
let activeAnchor = null;
let activeProvider = null;
let hoverToken = 0;
let secondaryHoverToken = 0;
let mouseX = 0;
let mouseY = 0;
const suppressedTitles = [];
const frozenPreviewRoots = [];
let dragState = null;
let loadingIndicator;
let pendingLoadingIndicators = 0;

const inflightRequests = new Map();

function ensurePreviewRoot() {
  if (!previewRoot) {
    previewRoot = document.createElement('div');
    previewRoot.className = 'cc-hover-preview';
    previewRoot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(previewRoot);
  }

  return previewRoot;
}

function ensureSecondaryPreviewRoot() {
  if (!secondaryPreviewRoot) {
    secondaryPreviewRoot = document.createElement('div');
    secondaryPreviewRoot.className = 'cc-hover-preview cc-hover-preview-secondary';
    secondaryPreviewRoot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(secondaryPreviewRoot);
  }

  return secondaryPreviewRoot;
}

function ensureLoadingIndicator() {
  if (!loadingIndicator) {
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'cc-hover-preview-loading';
    loadingIndicator.setAttribute('aria-hidden', 'true');
    loadingIndicator.innerHTML = '<span class="cc-hover-preview-loading-dot"></span>';
    document.body.appendChild(loadingIndicator);
  }

  return loadingIndicator;
}

function hidePreview(root = previewRoot) {
  if (!root) return;
  root.classList.remove('is-visible');
  root.classList.remove('is-frozen');
  root.classList.remove('is-stack-leader');
  root.dataset.provider = '';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
  root.__ccPreviewData = null;
  root.__ccPreviewMeta = null;
  root.__ccDeferredPromise = null;
  root.style.zIndex = '';
}

function showLoadingIndicator() {
  pendingLoadingIndicators += 1;
  const indicator = ensureLoadingIndicator();
  indicator.classList.add('is-visible');
  indicator.setAttribute('aria-hidden', 'false');
  indicator.style.left = `${Math.max(8, mouseX + 14)}px`;
  indicator.style.top = `${Math.max(8, mouseY + 14)}px`;
}

function hideLoadingIndicator({ force = false } = {}) {
  pendingLoadingIndicators = force ? 0 : Math.max(0, pendingLoadingIndicators - 1);
  if (pendingLoadingIndicators > 0) return;
  if (!loadingIndicator) return;
  loadingIndicator.classList.remove('is-visible');
  loadingIndicator.setAttribute('aria-hidden', 'true');
}

function isFrozenRoot(root) {
  return frozenPreviewRoots.includes(root);
}

function getTopFrozenRoot() {
  return frozenPreviewRoots[frozenPreviewRoots.length - 1] || null;
}

function refreshFrozenPreviewState() {
  const showLeader = frozenPreviewRoots.length > 1;

  frozenPreviewRoots.forEach((root, index) => {
    root.classList.toggle('is-stack-leader', showLeader && index === frozenPreviewRoots.length - 1);
    root.style.zIndex = String(10030 + index);
  });

  if (secondaryPreviewRoot?.classList.contains('is-visible')) {
    secondaryPreviewRoot.style.zIndex = String(10031 + frozenPreviewRoots.length);
  }
}

function getPreviewRootFromTarget(target) {
  return target instanceof Element ? target.closest('.cc-hover-preview') : null;
}

function restoreSuppressedTitles() {
  while (suppressedTitles.length > 0) {
    const item = suppressedTitles.pop();
    if (item?.element?.isConnected) {
      item.element.setAttribute('title', item.title);
    }
  }
}

function suppressNativeTitles(target) {
  restoreSuppressedTitles();

  let element = target instanceof Element ? target : target?.parentElement || null;
  while (element && element !== document.body) {
    if (element.hasAttribute('title')) {
      suppressedTitles.push({ element, title: element.getAttribute('title') || '' });
      element.removeAttribute('title');
    }
    element = element.parentElement;
  }
}

function getAnchorFromTarget(target) {
  let element = target instanceof Element ? target : target?.parentElement || null;
  while (element) {
    if (element.matches?.('a[href]')) return element;
    if (element.hasAttribute?.('title')) {
      const titledAnchor = element.querySelector?.('a[href]');
      if (titledAnchor) return titledAnchor;
    }
    element = element.parentElement;
  }

  return null;
}

async function updateFrozenFilmPoster(root, direction) {
  if (!root?.__ccPreviewData) return;

  if (!root.__ccPreviewData.posters || root.__ccPreviewData.posters.length <= 1) {
    await ensureDeferredPreviewData(root);
  }

  if (!root?.__ccPreviewData?.posters?.length || root.__ccPreviewData.posters.length <= 1) return;

  const posters = root.__ccPreviewData.posters;
  const nextIndex = (Number(root.__ccPreviewData.posterIndex || 0) + direction + posters.length) % posters.length;

  root.__ccPreviewData.posterIndex = nextIndex;

  const image = root.querySelector('.cc-hover-preview-image');
  const index = root.querySelector('.cc-hover-preview-poster-index');
  if (image) {
    image.src = posters[nextIndex].imageUrl;
    image.classList.remove('empty-image');
  }
  if (index) {
    index.textContent = `${nextIndex + 1}/${posters.length}`;
  }
}

function positionPreview() {
  if (previewRoot?.classList.contains('is-visible')) {
    const rect = previewRoot.getBoundingClientRect();
    const x = Math.min(window.innerWidth - rect.width - 10, Math.max(10, mouseX + 18));
    const y = Math.min(window.innerHeight - rect.height - 10, Math.max(10, mouseY + 18));

    previewRoot.style.left = `${x}px`;
    previewRoot.style.top = `${y}px`;
  }

  if (secondaryPreviewRoot?.classList.contains('is-visible')) {
    const rect = secondaryPreviewRoot.getBoundingClientRect();
    const x = Math.min(window.innerWidth - rect.width - 10, Math.max(10, mouseX + 28));
    const y = Math.min(window.innerHeight - rect.height - 10, Math.max(10, mouseY + 16));

    secondaryPreviewRoot.style.left = `${x}px`;
    secondaryPreviewRoot.style.top = `${y}px`;
  }

  if (loadingIndicator?.classList.contains('is-visible')) {
    loadingIndicator.style.left = `${Math.max(8, mouseX + 14)}px`;
    loadingIndicator.style.top = `${Math.max(8, mouseY + 14)}px`;
  }
}

function getMaxCacheAgeMs() {
  return Number.parseInt(localStorage.getItem(HOVER_PREVIEW_CACHE_HOURS_KEY) || '24', 10) * 60 * 60 * 1000;
}

function cleanExpiredCache() {
  const now = Date.now();
  const maxAgeMs = getMaxCacheAgeMs();

  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (!key) continue;

    if (key.startsWith('cc_creator_')) {
      localStorage.removeItem(key);
      continue;
    }

    if (!key.startsWith(HOVER_PREVIEW_CACHE_GROUP_PREFIX)) continue;
    if (!key.startsWith(HOVER_PREVIEW_CACHE_PREFIX)) {
      localStorage.removeItem(key);
      continue;
    }

    try {
      const cachedItem = JSON.parse(localStorage.getItem(key));
      if (!cachedItem?.timestamp || now - cachedItem.timestamp > maxAgeMs) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
}

function isHoverPreviewEnabled() {
  return getFeatureState(HOVER_PREVIEW_ENABLED_KEY, true);
}

function isProviderEnabled(provider) {
  return isHoverPreviewEnabled() && getFeatureState(provider.storageKey, true);
}

function getProviderForAnchor(anchor) {
  return HOVER_PREVIEW_PROVIDERS.find((provider) => provider.matches(anchor));
}

function getProviderById(providerId) {
  return HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === providerId) || null;
}

async function loadProviderData(provider, url) {
  if (typeof provider.fetchData === 'function') {
    return provider.fetchData({ url });
  }

  const response = await fetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const documentNode = new DOMParser().parseFromString(html, 'text/html');
  return provider.parseDocument(documentNode, { url });
}

async function fetchPreviewData(provider, normalizedUrl) {
  const entityKey = provider.getEntityKey(normalizedUrl);
  if (!entityKey) return null;

  const cacheKey = `${HOVER_PREVIEW_CACHE_PREFIX}${provider.id}_${entityKey}`;
  const requestKey = `${provider.id}:${entityKey}`;
  const maxAgeMs = getMaxCacheAgeMs();

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached?.timestamp && Date.now() - cached.timestamp < maxAgeMs) {
      return cached.data;
    }
  } catch {}

  if (inflightRequests.has(requestKey)) {
    return inflightRequests.get(requestKey);
  }

  const request = (async () => {
    try {
      const data = await loadProviderData(provider, normalizedUrl);
      if (!data) return null;

      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
      if (Math.random() < 0.1) cleanExpiredCache();
      return data;
    } catch {
      return null;
    } finally {
      inflightRequests.delete(requestKey);
    }
  })();

  inflightRequests.set(requestKey, request);
  return request;
}

async function showPreviewForAnchor(anchor, provider, token) {
  return showPreviewForAnchorInRoot(anchor, provider, token, ensurePreviewRoot(), false);
}

async function ensureDeferredPreviewData(root) {
  const previewData = root?.__ccPreviewData;
  const previewMeta = root?.__ccPreviewMeta;
  const provider = getProviderById(previewMeta?.providerId);

  if (!root || !previewData || !provider || typeof provider.loadDeferredData !== 'function') {
    return previewData || null;
  }

  if (previewData.deferredLoaded) return previewData;
  if (root.__ccDeferredPromise) return root.__ccDeferredPromise;

  root.__ccDeferredPromise = (async () => {
    const currentData = root.__ccPreviewData;
    const deferredData = await provider.loadDeferredData({
      url: previewMeta.normalizedUrl,
      data: currentData,
    });

    const nextData = {
      ...(deferredData || currentData),
      posterIndex: Number(currentData?.posterIndex || 0),
      deferredLoaded: true,
    };

    const posters = Array.isArray(nextData.posters) ? nextData.posters : [];
    if (posters.length > 0) {
      nextData.posterIndex = Math.min(nextData.posterIndex, posters.length - 1);
    }

    if (!root.isConnected) return nextData;

    root.innerHTML = provider.render(nextData);
    root.__ccPreviewData = nextData;
    root.dataset.provider = provider.id;
    root.setAttribute('aria-hidden', root.classList.contains('is-visible') ? 'false' : 'true');
    positionPreview();
    return nextData;
  })().finally(() => {
    if (root) root.__ccDeferredPromise = null;
  });

  return root.__ccDeferredPromise;
}

async function showPreviewForAnchorInRoot(anchor, provider, token, root, isSecondary) {
  if (!isProviderEnabled(provider)) return;

  const normalizedUrl = provider.normalizeUrl(anchor.href);
  if (!normalizedUrl) return;

  showLoadingIndicator();
  const data = await fetchPreviewData(provider, normalizedUrl);
  hideLoadingIndicator();
  if (!data) return;
  if (isSecondary) {
    if (token !== secondaryHoverToken) return;
  } else if (token !== hoverToken || activeAnchor !== anchor) {
    return;
  }

  root.innerHTML = provider.render(data);
  root.__ccPreviewData = {
    ...data,
    posterIndex: 0,
    deferredLoaded: typeof provider.loadDeferredData !== 'function',
  };
  root.__ccPreviewMeta = {
    providerId: provider.id,
    normalizedUrl,
  };
  root.dataset.provider = provider.id;
  root.classList.add('is-visible');
  root.setAttribute('aria-hidden', 'false');
  positionPreview();
}

function clearActivePreview() {
  restoreSuppressedTitles();
  activeAnchor = null;
  activeProvider = null;
  hoverToken++;
  secondaryHoverToken++;
  hidePreview(previewRoot);
  hidePreview(secondaryPreviewRoot);
  hideLoadingIndicator({ force: true });
}

function clearAllPreviews() {
  clearActivePreview();
  frozenPreviewRoots.splice(0).forEach((root) => hidePreview(root));
  refreshFrozenPreviewState();
}

function popLastFrozenPreview() {
  const root = frozenPreviewRoots.pop();
  if (!root) return;

  hidePreview(root);
  restoreSuppressedTitles();
  secondaryHoverToken++;
  refreshFrozenPreviewState();
}

function toggleFreezePreview() {
  if (!previewRoot?.classList.contains('is-visible')) return;

  const frozenRoot = previewRoot;
  previewRoot.classList.add('is-frozen');
  frozenPreviewRoots.push(frozenRoot);
  refreshFrozenPreviewState();
  previewRoot = null;
  restoreSuppressedTitles();
  activeAnchor = null;
  activeProvider = null;
  hoverToken++;
  void ensureDeferredPreviewData(frozenRoot);
}

function refreshActivePreview() {
  if (!activeAnchor || !activeProvider) {
    if (!isHoverPreviewEnabled()) clearActivePreview();
    return;
  }

  if (!isProviderEnabled(activeProvider)) {
    clearActivePreview();
    return;
  }

  hoverToken++;
  showPreviewForAnchor(activeAnchor, activeProvider, hoverToken);
}

function resetHoverPreviewStateForTests() {
  restoreSuppressedTitles();
  [previewRoot, secondaryPreviewRoot, loadingIndicator, ...frozenPreviewRoots].forEach((root) => root?.remove());

  previewRoot = null;
  secondaryPreviewRoot = null;
  activeAnchor = null;
  activeProvider = null;
  hoverToken = 0;
  secondaryHoverToken = 0;
  mouseX = 0;
  mouseY = 0;
  suppressedTitles.length = 0;
  frozenPreviewRoots.length = 0;
  dragState = null;
  loadingIndicator = null;
  pendingLoadingIndicators = 0;
  inflightRequests.clear();
}

export const __hoverPreviewTestApi = {
  clearActivePreview,
  ensureLoadingIndicator,
  hideLoadingIndicator,
  resetHoverPreviewStateForTests,
  showLoadingIndicator,
  getPendingLoadingIndicators() {
    return pendingLoadingIndicators;
  },
};

export function initializeHoverPreviews() {
  document.addEventListener(
    'mousemove',
    (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      positionPreview();
    },
    true,
  );

  document.addEventListener(
    'mouseover',
    (event) => {
      const hoveredPreviewRoot = getPreviewRootFromTarget(event.target);
      const insideFrozenPreview = Boolean(hoveredPreviewRoot && hoveredPreviewRoot === getTopFrozenRoot());
      if (frozenPreviewRoots.length > 0 && !insideFrozenPreview) return;

      const anchor = getAnchorFromTarget(event.target);
      if (!anchor) return;

      const provider = getProviderForAnchor(anchor);
      if (!provider || !isProviderEnabled(provider)) return;
      if (!insideFrozenPreview && activeAnchor === anchor && activeProvider?.id === provider.id) return;

      suppressNativeTitles(event.target);

      if (insideFrozenPreview) {
        secondaryHoverToken++;
        showPreviewForAnchorInRoot(anchor, provider, secondaryHoverToken, ensureSecondaryPreviewRoot(), true);
        return;
      }

      activeAnchor = anchor;
      activeProvider = provider;
      hoverToken++;
      showPreviewForAnchor(anchor, provider, hoverToken);
    },
    true,
  );

  document.addEventListener(
    'mouseout',
    (event) => {
      if (frozenPreviewRoots.length > 0) {
        if (!secondaryPreviewRoot?.classList.contains('is-visible')) return;
        const fromAnchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
        const toAnchor = event.relatedTarget instanceof Element ? event.relatedTarget.closest('a[href]') : null;
        const relatedPreviewRoot = getPreviewRootFromTarget(event.relatedTarget);

        if (fromAnchor && toAnchor && fromAnchor === toAnchor) return;
        if (secondaryPreviewRoot?.contains(event.relatedTarget)) return;
        if (relatedPreviewRoot && isFrozenRoot(relatedPreviewRoot) && toAnchor) return;

        hidePreview(secondaryPreviewRoot);
        return;
      }
      if (!activeAnchor) return;
      if (event.relatedTarget instanceof Element && activeAnchor.contains(event.relatedTarget)) return;

      clearActivePreview();
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat) return;

      if (event.key === 'Control') {
        if (secondaryPreviewRoot?.classList.contains('is-visible')) {
          const frozenRoot = secondaryPreviewRoot;
          secondaryPreviewRoot.classList.add('is-frozen');
          frozenPreviewRoots.push(frozenRoot);
          refreshFrozenPreviewState();
          secondaryPreviewRoot = null;
          restoreSuppressedTitles();
          secondaryHoverToken++;
          void ensureDeferredPreviewData(frozenRoot);
        } else if (previewRoot?.classList.contains('is-visible')) {
          toggleFreezePreview();
        } else if (frozenPreviewRoots.length > 0) {
          popLastFrozenPreview();
        }
        return;
      }

      if (event.key === 'Escape') {
        clearAllPreviews();
      }
    },
    true,
  );

  document.addEventListener(
    'click',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-cc-hover-poster-dir]') : null;
      const root = getPreviewRootFromTarget(button);
      if (!button || !root) return;

      event.preventDefault();
      event.stopPropagation();
      void updateFrozenFilmPoster(root, Number(button.getAttribute('data-cc-hover-poster-dir') || '0'));
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      const root = getPreviewRootFromTarget(event.target);
      const handle =
        event.target instanceof Element ? event.target.closest('.cc-hover-preview-top, .cc-hover-preview-title') : null;
      if (!root || !handle || !isFrozenRoot(root)) return;
      if (event.target instanceof Element && event.target.closest('a, button')) return;

      const rect = root.getBoundingClientRect();
      dragState = {
        root,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      root.classList.add('is-dragging');
      event.preventDefault();
    },
    true,
  );

  document.addEventListener(
    'pointermove',
    (event) => {
      if (!dragState?.root?.isConnected) return;

      const rect = dragState.root.getBoundingClientRect();
      const nextLeft = Math.min(window.innerWidth - rect.width - 8, Math.max(8, event.clientX - dragState.offsetX));
      const nextTop = Math.min(window.innerHeight - rect.height - 8, Math.max(8, event.clientY - dragState.offsetY));

      dragState.root.style.left = `${nextLeft}px`;
      dragState.root.style.top = `${nextTop}px`;
    },
    true,
  );

  document.addEventListener(
    'pointerup',
    () => {
      if (!dragState?.root) return;
      dragState.root.classList.remove('is-dragging');
      dragState = null;
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (frozenPreviewRoots.length === 0) return;

      const clickedInsidePreview = [previewRoot, secondaryPreviewRoot, ...frozenPreviewRoots].some((root) =>
        root?.contains(event.target),
      );
      if (clickedInsidePreview) return;

      clearAllPreviews();
    },
    true,
  );

  window.addEventListener('scroll', positionPreview, true);
  window.addEventListener(HOVER_PREVIEW_SETTINGS_CHANGED_EVENT, refreshActivePreview);

  cleanExpiredCache();
}
