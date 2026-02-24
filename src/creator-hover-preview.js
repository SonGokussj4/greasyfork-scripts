import {
  CREATOR_PREVIEW_ENABLED_KEY,
  CREATOR_PREVIEW_SHOW_BIRTH_KEY,
  CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
} from './config.js';

import { escapeHtml } from './utils.js';

const CACHE_HOURS_KEY = 'cc_creator_preview_cache_hours';
const CREATOR_LINK_SELECTOR = 'a[href*="/tvurce/"], a[href*="/tvorca/"]';

let previewRoot;
let activeAnchor;
let hoverToken = 0;
let mouseX = 0,
  mouseY = 0;

// Tracker for active network requests to prevent duplicate fetches
const inflightRequests = new Map();

function ensurePreview() {
  if (previewRoot) return;
  previewRoot = document.createElement('div');
  previewRoot.className = 'cc-creator-preview';
  document.body.appendChild(previewRoot);
}

function hidePreview() {
  if (previewRoot) previewRoot.classList.remove('is-visible');
}

function positionPreview() {
  if (!previewRoot || !previewRoot.classList.contains('is-visible')) return;
  const rect = previewRoot.getBoundingClientRect();
  const x = Math.min(window.innerWidth - rect.width - 10, Math.max(10, mouseX + 18));
  const y = Math.min(window.innerHeight - rect.height - 10, Math.max(10, mouseY + 18));
  previewRoot.style.left = `${x}px`;
  previewRoot.style.top = `${y}px`;
}

// Age calculator (Handles normal life and calculating age at death)
function calculateAge(birthStr, deathStr) {
  const extractDate = (str) => {
    const m = str?.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    return m ? new Date(m[3], m[2] - 1, m[1]) : null;
  };
  const bDate = extractDate(birthStr);
  if (!bDate) return null;

  const endDate = extractDate(deathStr) || new Date();
  let age = endDate.getFullYear() - bDate.getFullYear();
  if (
    endDate.getMonth() < bDate.getMonth() ||
    (endDate.getMonth() === bDate.getMonth() && endDate.getDate() < bDate.getDate())
  ) {
    age--;
  }
  return age;
}

// Cleans up expired cache items randomly so localStorage doesn't bloat
function cleanExpiredCache() {
  const maxAgeMs = parseInt(localStorage.getItem(CACHE_HOURS_KEY) || '24', 10) * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('cc_creator_')) {
      // V5 cache bump: Instantly removes older versions with transparent pixel bugs
      if (!key.startsWith('cc_creator_v5_')) {
        localStorage.removeItem(key);
        continue;
      }
      try {
        const item = JSON.parse(localStorage.getItem(key));
        if (now - item.timestamp > maxAgeMs) localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  }
}

async function fetchCreatorData(url) {
  const slug = url.match(/\/(tvurce|tvorca)\/(\d+-[^/]+)/i)?.[2];
  if (!slug) return null;

  // 1. Check persistent Cache (Using v5 prefix)
  const cacheKey = `cc_creator_v5_${slug}`;
  const maxAgeMs = parseInt(localStorage.getItem(CACHE_HOURS_KEY) || '24', 10) * 60 * 60 * 1000;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached && Date.now() - cached.timestamp < maxAgeMs) return cached.data;
  } catch (e) {}

  // 2. Prevent duplicate fetches if already fetching this exact creator
  if (inflightRequests.has(slug)) {
    return await inflightRequests.get(slug);
  }

  // 3. Fetch fresh data and save the promise to the inflight map
  const fetchPromise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

      // Scrape Data cleanly
      const name = doc.querySelector('h1')?.textContent.trim() || 'Tvůrce';
      const imgEl = doc.querySelector('.creator-profile figure img, .creator-profile-header figure img');
      let img = imgEl?.src || null;

      // Reject CSFD's 1x1 transparent placeholder GIFs so we correctly show the native empty silhouette
      if (img && (img.startsWith('data:image') || imgEl.classList.contains('empty-image'))) {
        img = null;
      }

      const flag = doc.querySelector('.creator-profile-details img.flag')?.src || null;

      // Life details
      const details = Array.from(doc.querySelectorAll('.creator-profile-details p'));
      const birthP = details.find((p) => /nar\.|born|naroden/i.test(p.textContent));
      const deathP = details.find((p) => /zem\.|zomr|died/i.test(p.textContent));

      // Clear out locations AND native CSFD age spans (.info) so we don't duplicate them
      const cleanLifeText = (el) => {
        if (!el) return null;
        const clone = el.cloneNode(true);
        clone.querySelector('.info-place')?.remove();
        clone.querySelectorAll('.info').forEach((info) => info.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim();
      };

      // Photo details
      const footer = doc.querySelector('.creator-profile-footer');
      const movieL = footer?.querySelector('a.item-movie');
      const copyright = footer?.querySelector('.item-text')?.textContent;
      let photoSource = null;
      let isMovie = false;

      if (movieL) {
        photoSource = movieL.textContent.trim() + ' ' + (movieL.nextElementSibling?.textContent.trim() || '');
        isMovie = true;
      } else if (copyright) {
        // Robust clean: Aggressively strips combinations of Photo, Foto, Copyright, (c), ©, colons, dashes and spaces
        photoSource = copyright
          .trim()
          .replace(/^(?:photo|foto|copyright|\(c\)|©|:|-|\s)+/gi, '')
          .trim();
      }

      const data = {
        name,
        img,
        flag,
        birthText: cleanLifeText(birthP),
        deathText: cleanLifeText(deathP),
        photoSource,
        isMovie,
      };

      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));

      // Small chance to trigger a garbage collection of old cache items
      if (Math.random() < 0.1) cleanExpiredCache();

      return data;
    } catch {
      return null;
    } finally {
      // Always remove from the inflight tracker when finished (whether success or fail)
      inflightRequests.delete(slug);
    }
  })();

  inflightRequests.set(slug, fetchPromise);
  return await fetchPromise;
}

async function showPreviewForAnchor(anchor, token) {
  ensurePreview();
  const isEnabled = localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY) !== 'false';
  if (!isEnabled) return;

  // Force the URL to bypass the 302 Redirect to /prehled/ to speed up the network tab
  let url = anchor.href.split('?')[0].split('#')[0];
  url = url.replace(/\/(prehled|prehlad|diskuze|galerie|zajimavosti|biografie)\/?$/i, '/');
  const segment = location.hostname.endsWith('.sk') ? 'prehlad' : 'prehled';
  url = url.endsWith('/') ? `${url}${segment}/` : `${url}/${segment}/`;

  const data = await fetchCreatorData(url);

  if (token !== hoverToken || activeAnchor !== anchor) return;
  if (!data) return;

  const showBirth = localStorage.getItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY) !== 'false';
  const showPhoto = localStorage.getItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY) !== 'false';
  const age = calculateAge(data.birthText, data.deathText);

  // Use CSFD's native 1x1 pixel and empty-image class to render the native silhouette perfectly
  const emptySrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const imgHtml = data.img
    ? `<img class="cc-creator-preview-image" src="${escapeHtml(data.img)}" onerror="this.onerror=null;this.src='${emptySrc}';this.classList.add('empty-image');" />`
    : `<img class="cc-creator-preview-image empty-image" src="${emptySrc}" />`;

  // Dynamic layout for birth/death logic
  let lifeHtml = '';
  if (showBirth) {
    const bDateMatch = data.birthText?.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4})/);
    const dDateMatch = data.deathText?.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4})/);

    if (data.deathText && bDateMatch) {
      const bDate = bDateMatch[1].replace(/\s/g, '');
      const dDate = dDateMatch ? dDateMatch[1].replace(/\s/g, '') : '?';
      lifeHtml += `
              <div class="cc-creator-preview-meta-line cc-creator-preview-meta-birth" style="text-align: center;">
                  <span>nar. ${bDate} &rarr; ${dDate}</span>
              </div>
              ${age ? `<div class="cc-creator-preview-meta-line cc-creator-preview-meta-age" style="margin-top: 1px;">(${age} let)</div>` : ''}
          `;
    } else if (data.birthText) {
      lifeHtml += `
              <div class="cc-creator-preview-meta-line cc-creator-preview-meta-birth">
                  <span>${escapeHtml(data.birthText)}</span>
                  ${!data.deathText && age ? `<span class="cc-creator-preview-meta-birth-age-inline">(${age} let)</span>` : ''}
              </div>
          `;
    }
  }

  const photoHtml =
    showPhoto && data.photoSource
      ? `
      <div class="cc-creator-preview-meta-line cc-creator-preview-meta-photo ${data.isMovie ? 'is-movie' : 'is-copyright'}" style="margin-top: 4px;">
          <span class="cc-creator-preview-meta-photo-source">${escapeHtml(data.photoSource)}</span>
      </div>
  `
      : '';

  previewRoot.innerHTML = `
      <div class="cc-creator-preview-card">
          ${imgHtml}
          <div class="cc-creator-preview-name">
              <span>${escapeHtml(data.name)}</span>
              ${data.flag ? `<img class="cc-creator-preview-name-flag" src="${escapeHtml(data.flag)}" />` : ''}
          </div>
          <div class="cc-creator-preview-meta" ${!showBirth && !showPhoto ? 'hidden' : ''}>
              ${lifeHtml}
              ${photoHtml}
          </div>
      </div>
  `;

  previewRoot.classList.add('is-visible');
  positionPreview();
}

export function initializeCreatorHoverPreview() {
  if (/^\/(tvurce|tvorca)\/\d+-[^/]+\//i.test(location.pathname)) return;

  document.addEventListener(
    'mousemove',
    (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      positionPreview();
    },
    true,
  );

  document.addEventListener(
    'mouseover',
    (e) => {
      const anchor = e.target.closest(CREATOR_LINK_SELECTOR);
      if (!anchor || activeAnchor === anchor) return;

      activeAnchor = anchor;
      hoverToken++;
      showPreviewForAnchor(anchor, hoverToken);
    },
    true,
  );

  // FIXED BUG: Removing the bad check allows the modal to close the moment the mouse leaves the link boundaries
  document.addEventListener(
    'mouseout',
    (e) => {
      if (!activeAnchor) return;
      if (e.relatedTarget instanceof Element && activeAnchor.contains(e.relatedTarget)) return;

      activeAnchor = null;
      hoverToken++;
      hidePreview();
    },
    true,
  );

  window.addEventListener('scroll', positionPreview, true);
  window.addEventListener('cc-creator-preview-toggled', () => {
    if (localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY) === 'false') {
      hidePreview();
      activeAnchor = null;
      hoverToken++;
    } else if (activeAnchor) {
      hoverToken++;
      showPreviewForAnchor(activeAnchor, hoverToken);
    }
  });
}
