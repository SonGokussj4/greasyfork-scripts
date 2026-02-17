// addSettingsButton function that will create element 'li' as a 'let button'

// Import html content from settings-button-content.html
import htmlContent from './settings-button-content.html';
// Load DEBUG variable from env file
import { DEBUG } from './env.js';
import { bindFancyAlertButton } from './fancy-alert.js';
import { initializeRatingsLoader } from './ratings-loader.js';
import { initializeRatingsSync } from './ratings-sync.js';
import { INDEXED_DB_NAME, RATINGS_STORE_NAME } from './config.js';
import { getAllFromIndexedDB } from './storage.js';

const MODAL_RENDER_SYNC_THRESHOLD = 700;
const MODAL_RENDER_CHUNK_SIZE = 450;
const ratingsModalCache = {
  userSlug: '',
  userRecords: null,
  rowsByScope: {
    direct: null,
    computed: null,
  },
};

function invalidateRatingsModalCache() {
  ratingsModalCache.userSlug = '';
  ratingsModalCache.userRecords = null;
  ratingsModalCache.rowsByScope = {
    direct: null,
    computed: null,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCurrentUserSlug() {
  const profileEl = document.querySelector('a.profile.initialized');
  const profileHref = profileEl?.getAttribute('href') || '';
  const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//);
  return match ? match[1] : undefined;
}

function getMostFrequentUserSlug(records) {
  const counts = new Map();

  for (const record of records) {
    const userSlug = record?.userSlug;
    if (!userSlug || !Number.isFinite(record?.movieId)) {
      continue;
    }

    counts.set(userSlug, (counts.get(userSlug) || 0) + 1);
  }

  let bestSlug;
  let bestCount = -1;
  for (const [slug, count] of counts.entries()) {
    if (count > bestCount) {
      bestSlug = slug;
      bestCount = count;
    }
  }

  return bestSlug;
}

function getCurrentUserRatingsUrl() {
  const profileEl = document.querySelector('a.profile.initialized');
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

function parseTotalRatingsFromDocument(doc) {
  const heading = doc.querySelector('h2')?.textContent || '';
  const match = heading.match(/\(([^)]+)\)/);
  if (!match) {
    return 0;
  }
  const parsed = Number.parseInt(match[1].replace(/\s+/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchTotalRatingsForCurrentUser() {
  const ratingsUrl = getCurrentUserRatingsUrl();
  if (!ratingsUrl) {
    return 0;
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
  return parseTotalRatingsFromDocument(doc);
}

async function refreshRatingsBadges(rootElement) {
  const redBadge = rootElement.querySelector('#cc-badge-red');
  const blackBadge = rootElement.querySelector('#cc-badge-black');
  if (!redBadge || !blackBadge) {
    return;
  }

  const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
  const userSlug = getCurrentUserSlug() || getMostFrequentUserSlug(records);
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
  blackBadge.textContent = `${computedCount}`;
}

async function getCachedUserRecords(userSlug) {
  if (
    ratingsModalCache.userSlug === userSlug &&
    Array.isArray(ratingsModalCache.userRecords) &&
    ratingsModalCache.userRecords.length >= 0
  ) {
    return ratingsModalCache.userRecords;
  }

  const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
  const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));

  ratingsModalCache.userSlug = userSlug;
  ratingsModalCache.userRecords = userRecords;
  ratingsModalCache.rowsByScope.direct = null;
  ratingsModalCache.rowsByScope.computed = null;

  return userRecords;
}

async function getCachedRowsForScope(userSlug, scope) {
  if (ratingsModalCache.userSlug === userSlug && Array.isArray(ratingsModalCache.rowsByScope[scope])) {
    return ratingsModalCache.rowsByScope[scope];
  }

  const userRecords = await getCachedUserRecords(userSlug);
  const scopedRecords =
    scope === 'computed'
      ? userRecords.filter((record) => record.computed === true)
      : userRecords.filter((record) => record.computed !== true);

  const rows = toModalRows(scopedRecords);
  ratingsModalCache.rowsByScope[scope] = rows;
  return rows;
}

function resolveRecordUrl(record) {
  if (record.fullUrl) {
    return record.fullUrl;
  }

  if (record.url) {
    return new URL(`/film/${record.url}/`, location.origin).toString();
  }

  return '';
}

function normalizeModalType(rawType) {
  const normalized = String(rawType || '').toLowerCase();
  if (normalized.includes('epizoda') || normalized === 'episode') {
    return { key: 'episode', label: 'Episode' };
  }
  if (normalized.includes('seriál') || normalized.includes('serial') || normalized === 'serial') {
    return { key: 'series', label: 'Series' };
  }
  if (normalized.includes('série') || normalized.includes('serie') || normalized === 'series') {
    return { key: 'season', label: 'Season' };
  }
  return { key: 'movie', label: 'Movie' };
}

function formatRatingForModal(ratingValue) {
  if (!Number.isFinite(ratingValue)) {
    return { stars: '—', isOdpad: false };
  }

  if (ratingValue === 0) {
    return { stars: 'Odpad', isOdpad: true };
  }

  const clamped = Math.max(0, Math.min(5, Math.trunc(ratingValue)));
  return {
    stars: '★'.repeat(clamped),
    isOdpad: false,
  };
}

function extractSeriesInfoToken(record, typeKey) {
  const candidates = [record?.url, record?.fullUrl, record?.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  for (const source of candidates) {
    const seasonEpisodeMatch = source.match(/s(\d{1,2})e(\d{1,2})/i);
    if (seasonEpisodeMatch) {
      const season = seasonEpisodeMatch[1].padStart(2, '0');
      const episode = seasonEpisodeMatch[2].padStart(2, '0');
      return `S${season}E${episode}`;
    }

    const seasonOnlyMatch = source.match(/(?:season|série|serie|seri[áa]l)[\s\-\(]*s?(\d{1,2})/i);
    if (seasonOnlyMatch) {
      const season = seasonOnlyMatch[1].padStart(2, '0');
      return `S${season}`;
    }

    const episodeOnlyMatch = source.match(/(?:episode|epizoda|ep\.?)[\s\-\(]*(\d{1,3})/i);
    if (episodeOnlyMatch) {
      const episode = episodeOnlyMatch[1].padStart(2, '0');
      return `E${episode}`;
    }
  }

  return typeKey === 'season' ? 'S??' : typeKey === 'episode' ? 'E??' : '';
}

function getRatingSquareClass(ratingValue) {
  if (!Number.isFinite(ratingValue)) {
    return 'is-unknown';
  }

  if (ratingValue <= 1) return 'is-1';
  if (ratingValue === 2) return 'is-2';
  if (ratingValue === 3) return 'is-3';
  if (ratingValue === 4) return 'is-4';
  return 'is-5';
}

function parseCzechDateToSortableValue(dateText) {
  const trimmed = String(dateText || '').trim();
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return Number.NEGATIVE_INFINITY;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return Number.NEGATIVE_INFINITY;
  }

  return year * 10000 + month * 100 + day;
}

function toModalRows(records) {
  return records.map((record) => {
    const ratingValue = Number.isFinite(record.rating) ? record.rating : Number.NEGATIVE_INFINITY;
    const normalizedType = normalizeModalType(record.type);
    const formattedRating = formatRatingForModal(record.rating);
    const parsedYear = Number.isFinite(record.year) ? record.year : NaN;
    const typeToken = extractSeriesInfoToken(record, normalizedType.key);
    const typeDisplay =
      normalizedType.key === 'season' || normalizedType.key === 'episode'
        ? `${normalizedType.label} (${typeToken})`
        : normalizedType.label;

    return {
      name: (record.name || '').trim(),
      url: resolveRecordUrl(record),
      typeKey: normalizedType.key,
      typeLabel: normalizedType.label,
      typeDisplay,
      yearValue: parsedYear,
      ratingText: formattedRating.stars,
      ratingIsOdpad: formattedRating.isOdpad,
      ratingValue,
      ratingSquareClass: getRatingSquareClass(record.rating),
      date: (record.date || '').trim(),
      dateSortValue: parseCzechDateToSortableValue(record.date),
      rawRecord: { ...record },
    };
  });
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase();
}

function sortRows(rows, sortKey, sortDir) {
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'type') {
      return a.typeDisplay.localeCompare(b.typeDisplay, 'en', { sensitivity: 'base' });
    }

    if (sortKey === 'year') {
      const aYear = Number.isFinite(a.yearValue) ? a.yearValue : -Infinity;
      const bYear = Number.isFinite(b.yearValue) ? b.yearValue : -Infinity;
      return aYear - bYear;
    }

    if (sortKey === 'rating') {
      return a.ratingValue - b.ratingValue;
    }

    if (sortKey === 'date') {
      return a.dateSortValue - b.dateSortValue;
    }

    return a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' });
  });

  return sortDir === 'desc' ? sorted.reverse() : sorted;
}

function filterRows(rows, search) {
  const query = normalizeSearchText(search).trim();
  if (!query) {
    return rows;
  }

  return rows.filter((row) => {
    return (
      normalizeSearchText(row.name).includes(query) ||
      normalizeSearchText(row.url).includes(query) ||
      normalizeSearchText(row.typeLabel).includes(query) ||
      normalizeSearchText(row.typeDisplay).includes(query) ||
      normalizeSearchText(row.yearValue).includes(query) ||
      normalizeSearchText(row.ratingText).includes(query) ||
      normalizeSearchText(row.date).includes(query)
    );
  });
}

function filterRowsByType(rows, typeFilters) {
  if (!typeFilters || typeFilters.size === 0 || typeFilters.has('all')) {
    return rows;
  }
  return rows.filter((row) => typeFilters.has(row.typeKey));
}

function getRatingsTableModal() {
  let overlay = document.querySelector('#cc-ratings-table-modal-overlay');
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = 'cc-ratings-table-modal-overlay';
  overlay.className = 'cc-ratings-table-overlay';
  overlay.innerHTML = `
    <div class="cc-ratings-table-modal" role="dialog" aria-modal="true" aria-labelledby="cc-ratings-table-title">
      <div class="cc-ratings-table-head">
        <h3 id="cc-ratings-table-title">Přehled hodnocení</h3>
        <button type="button" class="cc-ratings-table-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-ratings-table-toolbar">
        <input type="search" class="cc-ratings-table-search" placeholder="Filtrovat (název, URL, hodnocení, datum)…" />
        <div class="cc-ratings-type-multiselect" data-open="false">
          <button type="button" class="cc-ratings-type-toggle" aria-expanded="false">All types</button>
          <div class="cc-ratings-type-menu" hidden>
            <label><input type="checkbox" value="all" checked /> All</label>
            <label><input type="checkbox" value="movie" /> Movie</label>
            <label><input type="checkbox" value="series" /> Series</label>
            <label><input type="checkbox" value="season" /> Season</label>
            <label><input type="checkbox" value="episode" /> Episode</label>
          </div>
        </div>
        <span class="cc-ratings-table-summary">0 položek</span>
      </div>
      <div class="cc-ratings-table-wrap">
        <table class="cc-ratings-table" aria-live="polite">
          <thead>
            <tr>
              <th><button type="button" data-sort-key="name"><span class="cc-sort-label">Název</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="type"><span class="cc-sort-label">Typ</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="year"><span class="cc-sort-label">Rok</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="rating"><span class="cc-sort-label">Hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="date"><span class="cc-sort-label">Datum hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.cc-ratings-table-close');
  const searchInput = overlay.querySelector('.cc-ratings-table-search');
  const typeMulti = overlay.querySelector('.cc-ratings-type-multiselect');
  const typeToggle = overlay.querySelector('.cc-ratings-type-toggle');
  const typeMenu = overlay.querySelector('.cc-ratings-type-menu');
  const typeCheckboxes = Array.from(overlay.querySelectorAll('.cc-ratings-type-menu input[type="checkbox"]'));
  const summary = overlay.querySelector('.cc-ratings-table-summary');
  const tbody = overlay.querySelector('tbody');
  const title = overlay.querySelector('#cc-ratings-table-title');
  const sortButtons = Array.from(overlay.querySelectorAll('th button[data-sort-key]'));

  const state = {
    rows: [],
    visibleRows: [],
    search: '',
    typeFilters: new Set(['all']),
    sortKey: 'name',
    sortDir: 'asc',
    renderToken: 0,
  };

  const detailsOverlay = document.createElement('div');
  detailsOverlay.className = 'cc-rating-detail-overlay';
  detailsOverlay.innerHTML = `
    <div class="cc-rating-detail-card" role="dialog" aria-modal="true" aria-labelledby="cc-rating-detail-title">
      <div class="cc-rating-detail-head">
        <h4 id="cc-rating-detail-title">Detail záznamu</h4>
        <button type="button" class="cc-rating-detail-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-rating-detail-body"></div>
    </div>
  `;
  const detailsBody = detailsOverlay.querySelector('.cc-rating-detail-body');
  const detailsTitle = detailsOverlay.querySelector('#cc-rating-detail-title');
  const closeDetailsBtn = detailsOverlay.querySelector('.cc-rating-detail-close');

  const openDetailsModal = (row) => {
    const record = row?.rawRecord || {};
    const orderedKeys = [
      'id',
      'userSlug',
      'movieId',
      'name',
      'url',
      'fullUrl',
      'type',
      'year',
      'rating',
      'date',
      'parentId',
      'parentName',
      'computed',
      'computedCount',
      'computedFromText',
      'lastUpdate',
    ];
    const extraKeys = Object.keys(record)
      .filter((key) => !orderedKeys.includes(key))
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    const keys = [...orderedKeys.filter((key) => key in record), ...extraKeys];

    detailsTitle.textContent = row?.name ? `Detail: ${row.name}` : 'Detail záznamu';
    detailsBody.innerHTML = '';

    for (const key of keys) {
      const value = record[key];
      const rowEl = document.createElement('div');
      rowEl.className = 'cc-rating-detail-row';

      const keyEl = document.createElement('div');
      keyEl.className = 'cc-rating-detail-key';
      keyEl.textContent = key;

      const valueEl = document.createElement('div');
      valueEl.className = 'cc-rating-detail-value';
      if (value === null) {
        valueEl.textContent = 'null';
      } else if (typeof value === 'undefined') {
        valueEl.textContent = 'undefined';
      } else if (typeof value === 'object') {
        valueEl.textContent = JSON.stringify(value);
      } else if (typeof value === 'number' && Number.isNaN(value)) {
        valueEl.textContent = 'NaN';
      } else {
        valueEl.textContent = String(value);
      }

      rowEl.appendChild(keyEl);
      rowEl.appendChild(valueEl);
      detailsBody.appendChild(rowEl);
    }

    detailsOverlay.classList.add('is-open');
  };

  const closeDetailsModal = () => {
    detailsOverlay.classList.remove('is-open');
  };

  closeDetailsBtn.addEventListener('click', closeDetailsModal);
  detailsOverlay.addEventListener('click', (event) => {
    if (event.target === detailsOverlay) {
      closeDetailsModal();
    }
  });

  const updateTypeToggleText = () => {
    if (state.typeFilters.has('all') || state.typeFilters.size === 0) {
      typeToggle.textContent = 'All types';
      return;
    }

    const labels = [];
    if (state.typeFilters.has('movie')) labels.push('Movie');
    if (state.typeFilters.has('series')) labels.push('Series');
    if (state.typeFilters.has('season')) labels.push('Season');
    if (state.typeFilters.has('episode')) labels.push('Episode');
    typeToggle.textContent = labels.join(', ');
  };

  const syncTypeCheckboxes = () => {
    for (const input of typeCheckboxes) {
      input.checked = state.typeFilters.has(input.value);
    }
    updateTypeToggleText();
  };

  const buildRowHtml = (row, rowIndex) => {
    const detailsButton = `<button type="button" class="cc-ratings-table-details-btn cc-script-link-btn" data-row-index="${rowIndex}" aria-label="Zobrazit detail">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" />
            <path d="M12 11.5V15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="12" cy="8.2" r="1" fill="currentColor" />
          </svg>
        </button>`;

    const iconLink = row.url
      ? `<a class="cc-ratings-table-link-icon cc-script-link-btn" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer" aria-label="Otevřít detail">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path d="M9 8H6.5C5.1 8 4 9.1 4 10.5V17.5C4 18.9 5.1 20 6.5 20H13.5C14.9 20 16 18.9 16 17.5V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M10 14L20 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M14 4H20V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>`
      : '';

    const escapedName = escapeHtml(row.name || 'Bez názvu');
    const nameLink = row.url
      ? `<a class="cc-ratings-table-name-link" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapedName}</a>`
      : `<span class="cc-ratings-table-name-link">${escapedName}</span>`;

    return `
      <tr>
        <td>
          <div class="cc-ratings-table-name-row">
            <span class="cc-ratings-square ${escapeHtml(row.ratingSquareClass)}" aria-hidden="true"></span>
            ${nameLink}
            ${detailsButton}
            ${iconLink}
          </div>
        </td>
        <td class="cc-ratings-table-type">${escapeHtml(row.typeDisplay)}</td>
        <td class="cc-ratings-table-year">${Number.isFinite(row.yearValue) ? row.yearValue : '—'}</td>
        <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''}">${escapeHtml(row.ratingText)}</td>
        <td class="cc-ratings-table-date">${escapeHtml(row.date || '—')}</td>
      </tr>
    `;
  };

  const renderRowsFast = (rows, renderToken) => {
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="cc-ratings-table-empty">Žádná data</td></tr>';
      return;
    }

    if (rows.length <= MODAL_RENDER_SYNC_THRESHOLD) {
      let html = '';
      for (let index = 0; index < rows.length; index++) {
        html += buildRowHtml(rows[index], index);
      }
      if (state.renderToken === renderToken) {
        tbody.innerHTML = html;
      }
      return;
    }

    tbody.innerHTML = '';
    let index = 0;

    const renderChunk = () => {
      if (state.renderToken !== renderToken) {
        return;
      }

      const end = Math.min(index + MODAL_RENDER_CHUNK_SIZE, rows.length);
      let html = '';
      for (let cursor = index; cursor < end; cursor++) {
        html += buildRowHtml(rows[cursor], cursor);
      }

      if (index === 0) {
        tbody.innerHTML = html;
      } else {
        tbody.insertAdjacentHTML('beforeend', html);
      }

      index = end;
      if (index < rows.length) {
        setTimeout(renderChunk, 0);
      }
    };

    renderChunk();
  };

  const render = () => {
    state.renderToken += 1;
    const renderToken = state.renderToken;
    const typeFiltered = filterRowsByType(state.rows, state.typeFilters);
    const filtered = filterRows(typeFiltered, state.search);
    const sorted = sortRows(filtered, state.sortKey, state.sortDir);
    state.visibleRows = sorted;

    summary.textContent = `${sorted.length} položek`;
    renderRowsFast(sorted, renderToken);

    for (const button of sortButtons) {
      const key = button.dataset.sortKey;
      const active = key === state.sortKey;
      button.classList.toggle('is-active', active);
      const indicator = button.querySelector('.cc-sort-indicator');
      if (indicator) {
        indicator.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';
      }
    }
  };

  overlay.openWithData = ({ rows, modalTitle }) => {
    state.rows = rows;
    state.search = '';
    state.typeFilters = new Set(['all']);
    state.sortKey = 'name';
    state.sortDir = 'asc';
    title.textContent = modalTitle;
    searchInput.value = '';
    typeMulti.dataset.open = 'false';
    typeMenu.hidden = true;
    typeToggle.setAttribute('aria-expanded', 'false');
    syncTypeCheckboxes();
    render();
    overlay.classList.add('is-open');
    document.body.classList.add('cc-ratings-modal-open');
    searchInput.focus();
  };

  overlay.closeModal = () => {
    overlay.classList.remove('is-open');
    closeDetailsModal();
    document.body.classList.remove('cc-ratings-modal-open');
  };

  closeBtn.addEventListener('click', () => overlay.closeModal());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.closeModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    if (detailsOverlay.classList.contains('is-open')) {
      closeDetailsModal();
      return;
    }

    if (overlay.classList.contains('is-open')) {
      overlay.closeModal();
    }
  });

  tbody.addEventListener('click', (event) => {
    const detailsButton = event.target.closest('.cc-ratings-table-details-btn');
    if (!detailsButton) {
      return;
    }

    const rowIndex = Number.parseInt(detailsButton.getAttribute('data-row-index') || '-1', 10);
    if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= state.visibleRows.length) {
      return;
    }

    openDetailsModal(state.visibleRows[rowIndex]);
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    render();
  });

  typeToggle.addEventListener('click', () => {
    const isOpen = typeMulti.dataset.open === 'true';
    const nextOpen = !isOpen;
    typeMulti.dataset.open = nextOpen ? 'true' : 'false';
    typeMenu.hidden = !nextOpen;
    typeToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  });

  typeMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  for (const input of typeCheckboxes) {
    input.addEventListener('change', () => {
      const value = input.value;

      if (value === 'all' && input.checked) {
        state.typeFilters = new Set(['all']);
      } else if (value !== 'all') {
        state.typeFilters.delete('all');

        if (input.checked) {
          state.typeFilters.add(value);
        } else {
          state.typeFilters.delete(value);
        }

        if (state.typeFilters.size === 0) {
          state.typeFilters = new Set(['all']);
        }
      } else if (value === 'all' && !input.checked && state.typeFilters.size === 1 && state.typeFilters.has('all')) {
        state.typeFilters = new Set(['all']);
      }

      syncTypeCheckboxes();
      render();
    });
  }

  document.addEventListener('click', (event) => {
    if (!overlay.classList.contains('is-open')) {
      return;
    }
    if (!typeMulti.contains(event.target)) {
      typeMulti.dataset.open = 'false';
      typeMenu.hidden = true;
      typeToggle.setAttribute('aria-expanded', 'false');
    }
  });

  for (const button of sortButtons) {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey;
      if (!key) {
        return;
      }

      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      render();
    });
  }

  syncTypeCheckboxes();

  document.body.appendChild(overlay);
  document.body.appendChild(detailsOverlay);
  return overlay;
}

async function openRatingsTableModal(rootElement, scope) {
  let userSlug = getCurrentUserSlug();
  if (!userSlug) {
    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    userSlug = getMostFrequentUserSlug(records);
  }
  if (!userSlug) {
    return;
  }

  const rows = await getCachedRowsForScope(userSlug, scope);
  const modal = getRatingsTableModal();
  modal.openWithData({
    rows,
    modalTitle: scope === 'computed' ? 'Spočtená hodnocení' : 'Načtená hodnocení',
  });

  const redBadge = rootElement.querySelector('#cc-badge-red');
  const blackBadge = rootElement.querySelector('#cc-badge-black');
  redBadge?.blur();
  blackBadge?.blur();
}

async function addSettingsButton() {
  ('use strict');
  const settingsButton = document.createElement('li');
  settingsButton.classList.add('cc-menu-item');
  settingsButton.innerHTML = htmlContent;
  initializeRatingsLoader(settingsButton);
  initializeRatingsSync(settingsButton);

  const redBadge = settingsButton.querySelector('#cc-badge-red');
  const blackBadge = settingsButton.querySelector('#cc-badge-black');
  if (redBadge) {
    redBadge.setAttribute('role', 'button');
    redBadge.setAttribute('tabindex', '0');
    redBadge.title = 'Zobrazit načtená hodnocení';
    redBadge.addEventListener('click', () => {
      openRatingsTableModal(settingsButton, 'direct').catch((error) => {
        console.error('[CC] Failed to open direct ratings table:', error);
      });
    });
    redBadge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRatingsTableModal(settingsButton, 'direct').catch((error) => {
          console.error('[CC] Failed to open direct ratings table:', error);
        });
      }
    });
  }

  if (blackBadge) {
    blackBadge.setAttribute('role', 'button');
    blackBadge.setAttribute('tabindex', '0');
    blackBadge.title = 'Zobrazit spočtená hodnocení';
    blackBadge.addEventListener('click', () => {
      openRatingsTableModal(settingsButton, 'computed').catch((error) => {
        console.error('[CC] Failed to open computed ratings table:', error);
      });
    });
    blackBadge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRatingsTableModal(settingsButton, 'computed').catch((error) => {
          console.error('[CC] Failed to open computed ratings table:', error);
        });
      }
    });
  }

  refreshRatingsBadges(settingsButton).catch((error) => {
    console.error('[CC] Failed to refresh badges:', error);
  });

  const handleRatingsUpdated = () => {
    invalidateRatingsModalCache();
    refreshRatingsBadges(settingsButton).catch((error) => {
      console.error('[CC] Failed to refresh badges:', error);
    });
  };
  window.addEventListener('cc-ratings-updated', handleRatingsUpdated);

  const $button = $(settingsButton);
  const $headerBar = $('.header-bar').first();
  const $searchItem = $headerBar.children('li.item-search').first();
  const $languageItem = $headerBar.children('li.user-language-switch').first();

  if ($searchItem.length) {
    $searchItem.after($button);
  } else if ($languageItem.length) {
    $languageItem.before($button);
  } else {
    $headerBar.prepend($button);
  }

  let hoverTimeout;
  let hideTimeout;

  // If DEBUG is enabled, just add $('.header-bar li').addClass('hovered');
  // if not, have the code bellow
  console.log('🟣 DEBUG:', DEBUG);
  if (DEBUG) {
    // --- GROUP FANCY ALERT BUTTON AND CHECKBOX AT TOP RIGHT ---
    // Create or find a top-right container for controls
    let controlsContainer = document.querySelector('.fancy-alert-controls');
    if (!controlsContainer) {
      controlsContainer = document.createElement('div');
      controlsContainer.className = 'fancy-alert-controls';
      controlsContainer.style.position = 'fixed';
      controlsContainer.style.top = '4px';
      controlsContainer.style.right = '150px';
      controlsContainer.style.zIndex = '9999';
      controlsContainer.style.display = 'flex';
      controlsContainer.style.alignItems = 'center';
      controlsContainer.style.background = 'rgba(255,255,255,0.95)';
      controlsContainer.style.borderRadius = '8px';
      controlsContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      controlsContainer.style.padding = '8px 16px';
      document.body.appendChild(controlsContainer);
    }

    // Remove any previous checkbox/buttons from the container to avoid duplicates
    controlsContainer.innerHTML = '';

    // Add checkbox for toggling hovered state to the left of the alert button
    const checkboxLabel = document.createElement('label');
    checkboxLabel.style.display = 'inline-flex';
    checkboxLabel.style.alignItems = 'center';
    checkboxLabel.style.marginRight = '10px';
    checkboxLabel.style.cursor = 'pointer';
    checkboxLabel.textContent = 'Hovered';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.marginRight = '5px';
    checkbox.checked = localStorage.getItem('headerBarHovered') === 'true';
    checkboxLabel.prepend(checkbox);
    controlsContainer.appendChild(checkboxLabel);

    // Create or find the fancy alert button
    let alertButton = document.querySelector('.fancy-alert-button');
    if (!alertButton) {
      alertButton = document.createElement('button');
      alertButton.textContent = 'Show Fancy Alert';
      alertButton.className = 'fancy-alert-button';
    } else {
      // Remove from previous parent if needed
      if (alertButton.parentNode && alertButton.parentNode !== controlsContainer) {
        alertButton.parentNode.removeChild(alertButton);
      }
    }
    bindFancyAlertButton(alertButton);
    controlsContainer.appendChild(alertButton);

    // If checked, use DEBUG behaviour, else use non-DEBUG behaviour
    function enableDebugHover() {
      $('.header-bar li').addClass('hovered');
      $button.addClass('active');
      $button
        .find('.csfd-compare-menu')
        .off('click.debug')
        .on('click.debug', function (e) {
          e.stopPropagation();
          if ($button.hasClass('active')) {
            $button.removeClass('active');
            $('.header-bar li').removeClass('hovered');
          } else {
            $button.addClass('active');
            $('.header-bar li').addClass('hovered');
          }
        });
      $button.add($button.find('.dropdown-content')).off('mouseenter mouseleave');
    }

    function enableNormalHover() {
      $('.header-bar li').removeClass('hovered');
      $button.removeClass('active');
      $button.find('.csfd-compare-menu').off('click.debug');
      $button
        .add($button.find('.dropdown-content'))
        .off('mouseenter mouseleave')
        .hover(
          function () {
            clearTimeout(hideTimeout);
            hoverTimeout = setTimeout(() => {
              $('.header-bar li').addClass('hovered');
              $button.addClass('active');
            }, 200);
          },
          function () {
            clearTimeout(hoverTimeout);
            hideTimeout = setTimeout(() => {
              $('.header-bar li').removeClass('hovered');
              $button.removeClass('active');
            }, 200);
          },
        );
    }

    // Set initial state from localStorage
    if (checkbox.checked) {
      enableDebugHover();
    } else {
      enableNormalHover();
    }

    checkbox.addEventListener('change', function () {
      if (checkbox.checked) {
        localStorage.setItem('headerBarHovered', 'true');
        enableDebugHover();
      } else {
        localStorage.setItem('headerBarHovered', 'false');
        enableNormalHover();
      }
    });
  } else {
    $button.add($button.find('.dropdown-content')).hover(
      function () {
        clearTimeout(hideTimeout);
        hoverTimeout = setTimeout(() => {
          $('.header-bar li').addClass('hovered');
          $button.addClass('active');
        }, 200);
      },
      function () {
        clearTimeout(hoverTimeout);
        hideTimeout = setTimeout(() => {
          $('.header-bar li').removeClass('hovered');
          $button.removeClass('active');
        }, 200);
      },
    );
  }
}

export { addSettingsButton };
