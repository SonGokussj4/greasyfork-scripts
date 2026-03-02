import { INDEXED_DB_NAME, RATINGS_STORE_NAME } from './config.js';
import { getAllFromIndexedDB } from './storage.js';

// ============================================================================
// 1. DATA PROCESSING & HELPERS (Private)
// ============================================================================

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveRecordUrl(record) {
  if (record.fullUrl) return record.fullUrl;
  if (record.url) return new URL(`/film/${record.url}/`, location.origin).toString();
  return '';
}

/**
 * Normalizes the raw type string from the rating record into a standardized format with a key and display label.
 * @param {*} rawType The raw type string from the record, e.g. "movie", "seriál", "episode", etc.
 * @returns {{key: string, label: string}}
 */
function normalizeModalType(rawType) {
  const normalized = String(rawType || '').toLowerCase();
  if (normalized.includes('epizoda') || normalized === 'episode') return { key: 'episode', label: 'Episode' };
  if (normalized.includes('seriál') || normalized.includes('serial') || normalized === 'serial')
    return { key: 'series', label: 'Series' };
  if (normalized.includes('série') || normalized.includes('serie') || normalized === 'series')
    return { key: 'season', label: 'Season' };
  return { key: 'movie', label: 'Movie' };
}

/**
 * Formats the rating value for display in the modal, handling special cases like deleted ratings and "odpad" (trash) ratings.
 * @param {*} ratingValue The numeric rating value.
 * @param {*} isDeleted Whether the rating is marked as deleted.
 * @returns {{stars: string, isOdpad: boolean}}
 */
function formatRatingForModal(ratingValue, isDeleted) {
  if (isDeleted) return { stars: 'SMAZÁNO', isOdpad: false };
  if (!Number.isFinite(ratingValue)) return { stars: 'odpad!', isOdpad: true };
  if (ratingValue === 0) return { stars: 'odpad!', isOdpad: true };
  const count = Math.min(5, Math.max(1, Math.round(ratingValue)));
  return { stars: '★'.repeat(count), isOdpad: false };
}

/**
 * Returns the CSS class for the rating square based on the rating value and deletion status.
 * @param {*} ratingValue The numeric rating value.
 * @param {*} isDeleted Whether the rating is marked as deleted.
 * @returns {string}
 */
function getRatingSquareClass(ratingValue, isDeleted) {
  if (isDeleted) return 'is-unknown';
  if (!Number.isFinite(ratingValue)) return 'is-unknown';
  if (ratingValue === 0) return 'is-0';
  const r = Math.min(5, Math.max(1, Math.round(ratingValue)));
  return `is-${r}`;
}

function parseCzechDateToSortableValue(dateStr) {
  if (!dateStr) return 0;
  const m = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return 0;
  const d = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const y = Number.parseInt(m[3], 10);
  return y * 10000 + mo * 100 + d;
}

function normalizeSearchText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Converts raw records into a format suitable for display in the modal.
 * Each record is normalized and enriched with computed properties for sorting and filtering.
 * @param {*} records The array of raw records.
 * @returns {Array} An array of formatted modal rows.
 */
function toModalRows(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => {
    // Normalize the type (e.g. "movie", "series", "episode") and derive display labels
    const normalizedType = normalizeModalType(record.type);

    // Decide how to display the type, incorporating seriesToken or parentName if available
    // E.g. "Series (The Office)", "Season (S01)", or just "Movie"
    let typeDisplay = normalizedType.label;
    if (record.seriesToken) {
      typeDisplay = `${normalizedType.label} (${record.seriesToken})`;
    } else if (record.parentName) {
      typeDisplay = `${normalizedType.label} (${record.parentName})`;
    }

    // Parse the year as a number for sorting, but keep the original string for display (in case of non-standard formats)
    const parsedYear = Number.parseInt(record.year, 10);

    // Format the rating for display and determine if it's "odpad" (trash) or unknown and determine the CSS class for the rating square
    const ratingValue = Number.isFinite(record.rating) ? record.rating : NaN;
    const formattedRating = formatRatingForModal(ratingValue, record.deleted);

    // For better search optimization, save all relevant fields as normalized text to one string
    const nameNorm = normalizeSearchText(record.name);
    const urlNorm = normalizeSearchText(record.url);
    const typeNorm = normalizeSearchText(typeDisplay);
    const typeLabelNorm = normalizeSearchText(normalizedType.label);
    const dateNorm = normalizeSearchText(record.date);
    const searchString = `${nameNorm} ${urlNorm} ${typeNorm} ${typeLabelNorm} ${parsedYear} ${dateNorm} ${formattedRating.isOdpad ? 'odpad' : ''}`;

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
      ratingSquareClass: getRatingSquareClass(ratingValue, record.deleted),
      date: (record.date || '').trim(),
      dateSortValue: parseCzechDateToSortableValue(record.date),
      isComputed: record.computed === true,
      isDeleted: record.deleted === true,
      searchString,
      rawRecord: { ...record },
    };
  });
}

function filterRowsByType(rows, typeFilters) {
  if (typeFilters.has('all') || typeFilters.size === 0) return rows;
  return rows.filter((row) => typeFilters.has(row.typeKey));
}

// Create Intl.Collator instances once for efficient string comparison during sorting
const csCollator = new Intl.Collator('cs', { sensitivity: 'base' });
const enCollator = new Intl.Collator('en', { sensitivity: 'base' });

function sortRows(rows, sortKey, sortDir) {
  const sorted = rows.sort((a, b) => {
    if (sortKey === 'type') return enCollator.compare(a.typeDisplay, b.typeDisplay);

    if (sortKey === 'year') {
      const aYear = Number.isFinite(a.yearValue) ? a.yearValue : -Infinity;
      const bYear = Number.isFinite(b.yearValue) ? b.yearValue : -Infinity;
      return aYear - bYear;
    }

    if (sortKey === 'rating') return a.ratingValue - b.ratingValue;
    if (sortKey === 'date') return a.dateSortValue - b.dateSortValue;

    // Extremely fast string comparison
    return csCollator.compare(a.name, b.name);
  });

  return sortDir === 'desc' ? sorted.reverse() : sorted;
}

function filterRows(rows, search) {
  const query = normalizeSearchText(search).trim();
  if (!query) return rows;

  // return rows.filter((row) => {
  //   return (
  //     normalizeSearchText(row.name).includes(query) ||
  //     normalizeSearchText(row.url).includes(query) ||
  //     normalizeSearchText(row.typeLabel).includes(query) ||
  //     normalizeSearchText(row.typeDisplay).includes(query) ||
  //     normalizeSearchText(row.yearValue).includes(query) ||
  //     normalizeSearchText(row.date).includes(query) ||
  //     (row.ratingIsOdpad && query.includes('odpad'))
  //   );
  // });
  return rows.filter((row) => row.searchString.includes(query));
}

// ============================================================================
// 2. DETAIL MODAL CONTROLLER (Private)
// ============================================================================

function createRatingDetailsController() {
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

  const open = (row) => {
    const record = row?.rawRecord || {};
    const keys = new Set([...orderedKeys, ...Object.keys(record)]);

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

      if (value === null) valueEl.textContent = 'null';
      else if (typeof value === 'undefined') valueEl.textContent = 'undefined';
      else if (typeof value === 'object') valueEl.textContent = JSON.stringify(value);
      else if (typeof value === 'number' && Number.isNaN(value)) valueEl.textContent = 'NaN';
      else valueEl.textContent = String(value);

      rowEl.appendChild(keyEl);
      rowEl.appendChild(valueEl);
      detailsBody.appendChild(rowEl);
    }
    detailsOverlay.classList.add('is-open');
  };

  const close = () => detailsOverlay.classList.remove('is-open');

  closeDetailsBtn.addEventListener('click', close);
  detailsOverlay.addEventListener('click', (event) => {
    if (event.target === detailsOverlay) close();
  });

  return { overlay: detailsOverlay, open, close, isOpen: () => detailsOverlay.classList.contains('is-open') };
}

// ============================================================================
// 3. MAIN TABLE UI (Private)
// ============================================================================

const MODAL_RENDER_SYNC_THRESHOLD = 700;
const MODAL_RENDER_CHUNK_SIZE = 450;

function getRatingsTableModal() {
  let overlay = document.querySelector('#cc-ratings-table-modal-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'cc-ratings-table-modal-overlay';
  overlay.className = 'cc-ratings-table-overlay';
  overlay.innerHTML = `
    <style>
      .cc-ratings-scope-dev-btn {
        display: none; /* Řízeno přes JS */
        align-items: center;
        justify-content: center;
        background: transparent;
        color: #888;
        border: 1px dashed #ccc;
        border-radius: 4px;
        padding: 0 10px;
        height: 24px;
        font-size: 11px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .cc-ratings-scope-dev-btn:hover {
        border-color: #aa2c16;
        color: #aa2c16;
        background: rgba(170, 44, 22, 0.05);
      }
      .cc-ratings-scope-dev-btn.is-active {
        border-color: #aa2c16;
        color: #aa2c16;
        background: rgba(170, 44, 22, 0.1);
        border-style: solid;
      }
    </style>
    <div class="cc-ratings-table-modal" role="dialog" aria-modal="true" aria-labelledby="cc-ratings-table-title">
      <div class="cc-ratings-table-head">
        <h3 id="cc-ratings-table-title" style="flex: 1; margin: 0; font-size: 15px;">Přehled hodnocení</h3>
        <div class="cc-ratings-scope-toggle">
          <button type="button" data-scope="all">Všechny</button>
          <button type="button" data-scope="direct">Přímo hodnocené</button>
          <button type="button" data-scope="computed">Spočtené</button>
        </div>
       <div style="flex: 1; display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding-right: 4px;">
          <button type="button" class="cc-ratings-scope-dev-btn" data-scope="deleted">Smazané</button>
          <button type="button" class="cc-ratings-table-close" aria-label="Zavřít">×</button>
        </div>
      </div>
      <div class="cc-ratings-table-toolbar">
        <input type="search" class="cc-ratings-table-search" placeholder="Filtrovat (název, URL, hodnocení, datum)…" />
        <div class="cc-toolbar-right">
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
          <button type="button" class="cc-button cc-button-red cc-button-iconed cc-ratings-table-export">Export</button>
        </div>
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
  const exportBtn = overlay.querySelector('.cc-ratings-table-export');
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
    scopeFilter: 'all',
    renderedCount: 0, // number of lines rendered in the table (for performance optimization)
  };

  const RENDER_CHUNK_SIZE = 100;
  const tableWrap = overlay.querySelector('.cc-ratings-table-wrap');

  // Initial render of few rows to show the modal faster, the rest will be rendered asynchronously in chunks
  const renderInitialRows = (rows) => {
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="cc-ratings-table-empty">Žádná data</td></tr>';
      return;
    }
    state.renderedCount = Math.min(RENDER_CHUNK_SIZE, rows.length);
    const html = rows
      .slice(0, state.renderedCount)
      .map((r, i) => buildRowHtml(r, i))
      .join('');
    tbody.innerHTML = html;
  };

  // Render next chung, when user scrolls to the end
  const renderMoreRows = () => {
    if (state.renderedCount >= state.visibleRows.length) return;

    const end = Math.min(state.renderedCount + RENDER_CHUNK_SIZE, state.visibleRows.length);
    const html = state.visibleRows
      .slice(state.renderedCount, end)
      .map((r, i) => buildRowHtml(r, state.renderedCount + i))
      .join('');

    tbody.insertAdjacentHTML('beforeend', html);
    state.renderedCount = end;
  };

  // Simple scroll handler with debounce to trigger rendering more rows when user scrolls near the end of the table
  let isScrolling = false;
  tableWrap.addEventListener('scroll', () => {
    if (!isScrolling) {
      window.requestAnimationFrame(() => {
        if (tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - 400) {
          renderMoreRows();
        }
        isScrolling = false;
      });
      isScrolling = true;
    }
  });

  const detailsController = createRatingDetailsController();

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
            <span class="cc-ratings-square ${escapeHtml(row.ratingSquareClass)} ${row.isComputed ? 'is-computed' : ''}" aria-hidden="true"></span>
            ${nameLink}
            ${detailsButton}
            ${iconLink}
          </div>
        </td>
        <td class="cc-ratings-table-type">${escapeHtml(row.typeDisplay)}</td>
        <td class="cc-ratings-table-year">${Number.isFinite(row.yearValue) ? row.yearValue : '—'}</td>
        <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''} ${row.isComputed ? 'is-computed' : ''}">${escapeHtml(row.ratingText)}</td>
        <td class="cc-ratings-table-date">${escapeHtml(row.date || '—')}</td>
      </tr>
    `;
  };

  const render = () => {
    const scopeFiltered = state.rows.filter((r) => {
      // Show deleted only if "Smazané" scope is active
      if (state.scopeFilter === 'deleted') return r.isDeleted;

      // For other scopes, always hide deleted records
      if (r.isDeleted) return false;

      if (state.scopeFilter === 'direct') return !r.isComputed;
      if (state.scopeFilter === 'computed') return r.isComputed;
      return true;
    });

    console.log(
      `[CC Debug] Scope: ${state.scopeFilter}, Smazaných v rows: ${state.rows.filter((r) => r.isDeleted).length}, Po prvním filtru: ${scopeFiltered.length}`,
    );

    const typeFiltered = filterRowsByType(scopeFiltered, state.typeFilters);
    const filtered = filterRows(typeFiltered, state.search);
    const sorted = sortRows(filtered, state.sortKey, state.sortDir);
    state.visibleRows = sorted;

    summary.textContent = `${sorted.length} položek`;
    if (exportBtn) exportBtn.disabled = sorted.length === 0;

    // renderRowsFast(sorted, renderToken);  // Old render method
    tableWrap.scrollTop = 0;
    renderInitialRows(sorted);

    for (const button of sortButtons) {
      const key = button.dataset.sortKey;
      const active = key === state.sortKey;
      button.classList.toggle('is-active', active);
      const indicator = button.querySelector('.cc-sort-indicator');
      if (indicator) indicator.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';
    }
  };

  const scopeBtns = overlay.querySelectorAll('.cc-ratings-scope-toggle button');
  const devBtn = overlay.querySelector('.cc-ratings-scope-dev-btn');
  const allScopeBtns = [...Array.from(scopeBtns), devBtn];

  // Scope buttons event listeners
  allScopeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scopeFilter = btn.dataset.scope;
      allScopeBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      render();
    });
  });

  overlay.openWithData = ({ rows, modalTitle, initialScope = 'all' }) => {
    const isDev = localStorage.getItem('cc_dev_mode') === 'true';
    devBtn.style.display = isDev ? 'flex' : 'none';

    if (exportBtn) exportBtn.disabled = rows.length === 0;
    state.scopeFilter = initialScope;

    // Activate the correct scope button based on initialScope
    allScopeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.scope === initialScope));

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
    detailsController.close();
    document.body.classList.remove('cc-ratings-modal-open');
  };

  closeBtn.addEventListener('click', () => overlay.closeModal());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (detailsController.isOpen()) {
      detailsController.close();
      return;
    }
    if (overlay.classList.contains('is-open')) overlay.closeModal();
  });

  tbody.addEventListener('click', (event) => {
    const detailsButton = event.target.closest('.cc-ratings-table-details-btn');
    if (!detailsButton) return;
    const rowIndex = Number.parseInt(detailsButton.getAttribute('data-row-index') || '-1', 10);
    if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= state.visibleRows.length) return;
    detailsController.open(state.visibleRows[rowIndex]);
  });

  // Render debounce for search input to avoid rendering on every keystroke
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = searchInput.value;
      render();
    }, 200); // TODO: Move to config as constant
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const csvLines = [];
      const header = ['Název', 'Typ', 'Rok', 'Hodnocení', 'Datum hodnocení', 'URL', 'movieID'];
      csvLines.push(header.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));
      state.visibleRows.forEach((row) => {
        let ratingNum = '';
        if (Number.isFinite(row.ratingValue)) ratingNum = Math.round(row.ratingValue);
        else if (row.ratingText && row.ratingText.toLowerCase().includes('odpad')) ratingNum = 0;

        const fields = [
          row.name,
          row.typeDisplay,
          row.yearValue,
          ratingNum,
          row.date,
          row.rawRecord?.fullUrl || '',
          row.rawRecord?.movieId || '',
        ];
        const escaped = fields.map((f) => `"${(f != null ? String(f) : '').replace(/"/g, '""')}"`);
        csvLines.push(escaped.join(','));
      });
      const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'cc-ratings.csv';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  typeToggle.addEventListener('click', () => {
    const isOpen = typeMulti.dataset.open === 'true';
    const nextOpen = !isOpen;
    typeMulti.dataset.open = nextOpen ? 'true' : 'false';
    typeMenu.hidden = !nextOpen;
    typeToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  });

  typeMenu.addEventListener('click', (e) => e.stopPropagation());

  for (const input of typeCheckboxes) {
    input.addEventListener('change', () => {
      const value = input.value;
      if (value === 'all' && input.checked) {
        state.typeFilters = new Set(['all']);
      } else if (value !== 'all') {
        state.typeFilters.delete('all');
        if (input.checked) state.typeFilters.add(value);
        else state.typeFilters.delete(value);
        if (state.typeFilters.size === 0) state.typeFilters = new Set(['all']);
      } else if (value === 'all' && !input.checked && state.typeFilters.size === 1 && state.typeFilters.has('all')) {
        state.typeFilters = new Set(['all']);
      }
      syncTypeCheckboxes();
      render();
    });
  }

  document.addEventListener('click', (event) => {
    if (!overlay.classList.contains('is-open')) return;
    if (!typeMulti.contains(event.target)) {
      typeMulti.dataset.open = 'false';
      typeMenu.hidden = true;
      typeToggle.setAttribute('aria-expanded', 'false');
    }
  });

  for (const button of sortButtons) {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey;
      if (!key) return;
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
  document.body.appendChild(detailsController.overlay);
  return overlay;
}

function openRatingsTableView({ rows, modalTitle, initialScope = 'all' }) {
  const modal = getRatingsTableModal();
  modal.openWithData({ rows, modalTitle, initialScope });
}

// ============================================================================
// 4. CACHE & ENTRY POINT (Public Exports)
// ============================================================================

const ratingsModalCache = {
  userSlug: '',
  userRecords: null,
  allRows: null,
};

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
  ratingsModalCache.allRows = null;

  return userRecords;
}

async function getCachedAllRows(userSlug) {
  if (ratingsModalCache.userSlug === userSlug && Array.isArray(ratingsModalCache.allRows)) {
    return ratingsModalCache.allRows;
  }
  const userRecords = await getCachedUserRecords(userSlug);
  const rows = toModalRows(userRecords);
  ratingsModalCache.allRows = rows;
  return rows;
}

export function invalidateRatingsModalCache() {
  ratingsModalCache.userSlug = '';
  ratingsModalCache.userRecords = null;
  ratingsModalCache.allRows = null;
}

export async function openRatingsTableModal(rootElement, scope, callbacks) {
  const getCurrentUserSlug = callbacks?.getCurrentUserSlug;
  const getMostFrequentUserSlug = callbacks?.getMostFrequentUserSlug;

  let userSlug = getCurrentUserSlug?.();
  if (!userSlug) {
    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    userSlug = getMostFrequentUserSlug?.(records);
  }
  if (!userSlug) return;

  const rows = await getCachedAllRows(userSlug);
  openRatingsTableView({
    rows,
    modalTitle: 'Tabulka hodnocení',
    initialScope: scope,
  });

  const redBadge = rootElement.querySelector('#cc-badge-red');
  const blackBadge = rootElement.querySelector('#cc-badge-black');
  redBadge?.blur();
  blackBadge?.blur();
}
