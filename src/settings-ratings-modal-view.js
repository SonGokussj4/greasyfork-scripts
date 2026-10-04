import {
  RATINGS_TABLE_RATING_FILTERS,
  RATINGS_TABLE_RENDER_CHUNK_SIZE,
  RATINGS_TABLE_SCROLL_PREFETCH_PX,
  RATINGS_TABLE_SEARCH_DEBOUNCE_MS,
  RATINGS_TABLE_TYPE_FILTERS,
} from './config.js';
import { createRatingDetailsController } from './settings-ratings-modal-detail.js';
import {
  createRatingsCsv,
  filterRowsByRating,
  filterRowsByScope,
  filterRowsBySearch,
  filterRowsByType,
  getRatingsSummary,
  sortRows,
} from './settings-ratings-modal-data.js';
import { escapeHtml } from './utils.js';

const SORT_INDICATORS = Object.freeze({
  idle: '↕',
  asc: '▲',
  desc: '▼',
});

const DETAILS_ICON = `
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" />
    <path d="M12 11.5V15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <circle cx="12" cy="8.2" r="1" fill="currentColor" />
  </svg>
`;

function buildCheckboxFilterHtml(options) {
  return options.map(
    (option) =>
      `<label><input type="checkbox" value="${escapeHtml(option.value)}"${
        option.value === 'all' ? ' checked' : ''
      } /> ${escapeHtml(option.label)}</label>`,
  ).join('');
}

function formatVisibleCount(visible, total) {
  if (visible === total) return `${visible} položek`;
  return `${visible} z ${total} položek`;
}

function buildStatsHtml(summary) {
  const chips = [
    ['Přímo', summary.direct],
    ['Spočtené', summary.computed],
    ['Smazané', summary.deleted],
    ['Filmy', summary.types.movie],
    ['Seriály', summary.types.series],
    ['Série', summary.types.season],
    ['Epizody', summary.types.episode],
  ];

  return chips
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `<span class="cc-ratings-table-stat"><b>${count}</b> ${escapeHtml(label)}</span>`)
    .join('');
}

function buildRowHtml(row, rowIndex) {
  const detailsButton = `<button type="button" class="cc-ratings-table-details-btn cc-script-link-btn" data-row-index="${rowIndex}" aria-label="Zobrazit detail">${DETAILS_ICON}</button>`;
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
        </div>
      </td>
      <td class="cc-ratings-table-type">${escapeHtml(row.typeDisplay)}</td>
      <td class="cc-ratings-table-year">${Number.isFinite(row.yearValue) ? row.yearValue : '—'}</td>
      <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''} ${row.isComputed ? 'is-computed' : ''}">${escapeHtml(row.ratingText)}</td>
      <td class="cc-ratings-table-date">${escapeHtml(row.date || '—')}</td>
    </tr>
  `;
}

function downloadCsv(rows) {
  const blob = new Blob([createRatingsCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'cc-ratings.csv';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function createRatingsTableModal() {
  const overlay = document.createElement('div');
  overlay.id = 'cc-ratings-table-modal-overlay';
  overlay.className = 'cc-ratings-table-overlay';
  overlay.innerHTML = `
    <div class="cc-ratings-table-modal" role="dialog" aria-modal="true" aria-labelledby="cc-ratings-table-title">
      <div class="cc-ratings-table-head">
        <h3 id="cc-ratings-table-title" class="cc-ratings-table-title">Přehled hodnocení</h3>
        <div class="cc-ratings-scope-toggle">
          <button type="button" data-scope="all">Všechny</button>
          <button type="button" data-scope="direct">Přímo hodnocené</button>
          <button type="button" data-scope="computed">Spočtené</button>
        </div>
        <div class="cc-ratings-table-head-actions">
          <button type="button" class="cc-ratings-scope-dev-btn" data-scope="deleted">Smazané</button>
          <button type="button" class="cc-ratings-table-close" aria-label="Zavřít">×</button>
        </div>
      </div>
      <div class="cc-ratings-table-toolbar">
        <input type="search" class="cc-ratings-table-search" placeholder="Filtrovat podle názvu, URL, roku, data…" />
        <div class="cc-toolbar-right">
          <div class="cc-ratings-type-multiselect" data-open="false">
            <button type="button" class="cc-ratings-type-toggle" aria-expanded="false">All types</button>
            <div class="cc-ratings-type-menu" hidden>${buildCheckboxFilterHtml(RATINGS_TABLE_TYPE_FILTERS)}</div>
          </div>
          <div class="cc-ratings-rating-multiselect" data-open="false">
            <button type="button" class="cc-ratings-rating-toggle" aria-expanded="false">All ratings</button>
            <div class="cc-ratings-rating-menu" hidden>${buildCheckboxFilterHtml(RATINGS_TABLE_RATING_FILTERS)}</div>
          </div>
          <button type="button" class="cc-ratings-table-reset" disabled>Reset</button>
          <span class="cc-ratings-table-summary">0 položek</span>
          <button type="button" class="cc-button cc-button-red cc-button-iconed cc-ratings-table-export">Export CSV</button>
        </div>
      </div>
      <div class="cc-ratings-table-stats" aria-live="polite"></div>
      <div class="cc-ratings-table-wrap">
        <table class="cc-ratings-table" aria-live="polite">
          <thead>
            <tr>
              <th><button type="button" data-sort-key="name"><span class="cc-sort-label">Název</span><span class="cc-sort-indicator" aria-hidden="true">${SORT_INDICATORS.idle}</span></button></th>
              <th><button type="button" data-sort-key="type"><span class="cc-sort-label">Typ</span><span class="cc-sort-indicator" aria-hidden="true">${SORT_INDICATORS.idle}</span></button></th>
              <th><button type="button" data-sort-key="year"><span class="cc-sort-label">Rok</span><span class="cc-sort-indicator" aria-hidden="true">${SORT_INDICATORS.idle}</span></button></th>
              <th><button type="button" data-sort-key="rating"><span class="cc-sort-label">Hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">${SORT_INDICATORS.idle}</span></button></th>
              <th><button type="button" data-sort-key="date"><span class="cc-sort-label">Datum hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">${SORT_INDICATORS.idle}</span></button></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="cc-ratings-table-foot">
        <span class="cc-ratings-table-render-status">0 zobrazeno</span>
      </div>
    </div>
  `;

  return overlay;
}

export function getRatingsTableModal() {
  let overlay = document.querySelector('#cc-ratings-table-modal-overlay');
  if (overlay) return overlay;

  overlay = createRatingsTableModal();

  const closeBtn = overlay.querySelector('.cc-ratings-table-close');
  const searchInput = overlay.querySelector('.cc-ratings-table-search');
  const typeMulti = overlay.querySelector('.cc-ratings-type-multiselect');
  const typeToggle = overlay.querySelector('.cc-ratings-type-toggle');
  const typeMenu = overlay.querySelector('.cc-ratings-type-menu');
  const typeCheckboxes = Array.from(overlay.querySelectorAll('.cc-ratings-type-menu input[type="checkbox"]'));
  const ratingMulti = overlay.querySelector('.cc-ratings-rating-multiselect');
  const ratingToggle = overlay.querySelector('.cc-ratings-rating-toggle');
  const ratingMenu = overlay.querySelector('.cc-ratings-rating-menu');
  const ratingCheckboxes = Array.from(overlay.querySelectorAll('.cc-ratings-rating-menu input[type="checkbox"]'));
  const resetBtn = overlay.querySelector('.cc-ratings-table-reset');
  const summary = overlay.querySelector('.cc-ratings-table-summary');
  const stats = overlay.querySelector('.cc-ratings-table-stats');
  const renderStatus = overlay.querySelector('.cc-ratings-table-render-status');
  const exportBtn = overlay.querySelector('.cc-ratings-table-export');
  const tbody = overlay.querySelector('tbody');
  const title = overlay.querySelector('#cc-ratings-table-title');
  const sortButtons = Array.from(overlay.querySelectorAll('th button[data-sort-key]'));
  const tableWrap = overlay.querySelector('.cc-ratings-table-wrap');
  const detailsController = createRatingDetailsController();

  const state = {
    rows: [],
    visibleRows: [],
    search: '',
    typeFilters: new Set(['all']),
    ratingFilters: new Set(['all']),
    sortKey: 'name',
    sortDir: 'asc',
    scopeFilter: 'all',
    renderedCount: 0,
  };

  const updateRenderStatus = () => {
    renderStatus.textContent =
      state.visibleRows.length === 0
        ? '0 zobrazeno'
        : `${state.renderedCount} z ${state.visibleRows.length} zobrazeno`;
  };

  const renderRows = (startIndex, endIndex, mode) => {
    const html = state.visibleRows
      .slice(startIndex, endIndex)
      .map((row, index) => buildRowHtml(row, startIndex + index))
      .join('');

    if (mode === 'replace') tbody.innerHTML = html;
    else tbody.insertAdjacentHTML('beforeend', html);

    state.renderedCount = endIndex;
    updateRenderStatus();
  };

  const renderInitialRows = () => {
    if (state.visibleRows.length === 0) {
      state.renderedCount = 0;
      tbody.innerHTML = '<tr><td colspan="5" class="cc-ratings-table-empty">Žádná data</td></tr>';
      updateRenderStatus();
      return;
    }

    renderRows(0, Math.min(RATINGS_TABLE_RENDER_CHUNK_SIZE, state.visibleRows.length), 'replace');
  };

  const renderMoreRows = () => {
    if (state.renderedCount >= state.visibleRows.length) return;
    renderRows(
      state.renderedCount,
      Math.min(state.renderedCount + RATINGS_TABLE_RENDER_CHUNK_SIZE, state.visibleRows.length),
      'append',
    );
  };

  let isScrollFrameQueued = false;
  tableWrap.addEventListener('scroll', () => {
    if (isScrollFrameQueued) return;
    window.requestAnimationFrame(() => {
      if (tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - RATINGS_TABLE_SCROLL_PREFETCH_PX) {
        renderMoreRows();
      }
      isScrollFrameQueued = false;
    });
    isScrollFrameQueued = true;
  });

  const hasActiveFilters = () =>
    state.search.trim() !== '' ||
    !state.typeFilters.has('all') ||
    !state.ratingFilters.has('all') ||
    state.scopeFilter !== 'all';

  const updateToggleText = (toggle, filters, options, allLabel) => {
    if (filters.has('all') || filters.size === 0) {
      toggle.textContent = allLabel;
      return;
    }

    toggle.textContent = options
      .filter((option) => filters.has(option.value))
      .map((option) => option.label)
      .join(', ');
  };

  const syncCheckboxes = (checkboxes, filters, toggle, options, allLabel) => {
    for (const input of checkboxes) {
      input.checked = filters.has(input.value);
    }
    updateToggleText(toggle, filters, options, allLabel);
  };

  const syncTypeCheckboxes = () => {
    syncCheckboxes(typeCheckboxes, state.typeFilters, typeToggle, RATINGS_TABLE_TYPE_FILTERS, 'All types');
  };

  const syncRatingCheckboxes = () => {
    syncCheckboxes(ratingCheckboxes, state.ratingFilters, ratingToggle, RATINGS_TABLE_RATING_FILTERS, 'All ratings');
  };

  const updateSortButtons = () => {
    for (const button of sortButtons) {
      const key = button.dataset.sortKey;
      const active = key === state.sortKey;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      const indicator = button.querySelector('.cc-sort-indicator');
      if (indicator) indicator.textContent = active ? SORT_INDICATORS[state.sortDir] : SORT_INDICATORS.idle;
    }
  };

  const render = () => {
    const scopeFiltered = filterRowsByScope(state.rows, state.scopeFilter);
    const typeFiltered = filterRowsByType(scopeFiltered, state.typeFilters);
    const ratingFiltered = filterRowsByRating(typeFiltered, state.ratingFilters);
    const filtered = filterRowsBySearch(ratingFiltered, state.search);

    state.visibleRows = sortRows(filtered, state.sortKey, state.sortDir);
    summary.textContent = formatVisibleCount(state.visibleRows.length, scopeFiltered.length);
    stats.innerHTML = buildStatsHtml(getRatingsSummary(state.visibleRows));
    resetBtn.disabled = !hasActiveFilters();
    exportBtn.disabled = state.visibleRows.length === 0;

    tableWrap.scrollTop = 0;
    renderInitialRows();
    updateSortButtons();
  };

  const scopeBtns = Array.from(overlay.querySelectorAll('.cc-ratings-scope-toggle button'));
  const devBtn = overlay.querySelector('.cc-ratings-scope-dev-btn');
  const allScopeBtns = [...scopeBtns, devBtn].filter(Boolean);

  for (const btn of allScopeBtns) {
    btn.addEventListener('click', () => {
      state.scopeFilter = btn.dataset.scope || 'all';
      allScopeBtns.forEach((scopeBtn) => scopeBtn.classList.toggle('is-active', scopeBtn === btn));
      render();
    });
  }

  const closeTypeMenu = () => {
    typeMulti.dataset.open = 'false';
    typeMenu.hidden = true;
    typeToggle.setAttribute('aria-expanded', 'false');
  };

  const closeRatingMenu = () => {
    ratingMulti.dataset.open = 'false';
    ratingMenu.hidden = true;
    ratingToggle.setAttribute('aria-expanded', 'false');
  };

  const closeFilterMenus = () => {
    closeTypeMenu();
    closeRatingMenu();
  };

  const resetFilters = () => {
    state.search = '';
    state.typeFilters = new Set(['all']);
    state.ratingFilters = new Set(['all']);
    state.scopeFilter = 'all';
    searchInput.value = '';
    allScopeBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.scope === 'all'));
    syncTypeCheckboxes();
    syncRatingCheckboxes();
    closeFilterMenus();
    render();
  };

  overlay.openWithData = ({ rows, modalTitle, initialScope = 'all' }) => {
    const isDev = globalThis.localStorage?.getItem('cc_dev_mode') === 'true';
    devBtn.style.display = isDev ? 'flex' : 'none';

    state.rows = rows;
    state.visibleRows = [];
    state.search = '';
    state.typeFilters = new Set(['all']);
    state.ratingFilters = new Set(['all']);
    state.sortKey = 'name';
    state.sortDir = 'asc';
    state.scopeFilter = initialScope;
    state.renderedCount = 0;

    title.textContent = modalTitle;
    searchInput.value = '';
    allScopeBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.scope === initialScope));
    syncTypeCheckboxes();
    syncRatingCheckboxes();
    closeFilterMenus();
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

  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = searchInput.value;
      render();
    }, RATINGS_TABLE_SEARCH_DEBOUNCE_MS);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || searchInput.value === '') return;
    event.stopPropagation();
    state.search = '';
    searchInput.value = '';
    render();
  });

  exportBtn.addEventListener('click', () => {
    if (state.visibleRows.length > 0) downloadCsv(state.visibleRows);
  });

  resetBtn.addEventListener('click', resetFilters);

  const toggleMenu = (multi, menu, toggle) => {
    const nextOpen = multi.dataset.open !== 'true';
    closeFilterMenus();
    multi.dataset.open = nextOpen ? 'true' : 'false';
    menu.hidden = !nextOpen;
    toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  };

  typeToggle.addEventListener('click', () => toggleMenu(typeMulti, typeMenu, typeToggle));
  ratingToggle.addEventListener('click', () => toggleMenu(ratingMulti, ratingMenu, ratingToggle));

  typeMenu.addEventListener('click', (event) => event.stopPropagation());
  ratingMenu.addEventListener('click', (event) => event.stopPropagation());

  const bindCheckboxFilters = (checkboxes, stateKey, sync) => {
    for (const input of checkboxes) {
      input.addEventListener('change', () => {
        if (input.value === 'all' && input.checked) {
          state[stateKey] = new Set(['all']);
        } else if (input.value !== 'all') {
          state[stateKey].delete('all');
          if (input.checked) state[stateKey].add(input.value);
          else state[stateKey].delete(input.value);
          if (state[stateKey].size === 0) state[stateKey] = new Set(['all']);
        } else if (!input.checked && state[stateKey].size === 1 && state[stateKey].has('all')) {
          state[stateKey] = new Set(['all']);
        }

        sync();
        render();
      });
    }
  };

  bindCheckboxFilters(typeCheckboxes, 'typeFilters', syncTypeCheckboxes);
  bindCheckboxFilters(ratingCheckboxes, 'ratingFilters', syncRatingCheckboxes);

  document.addEventListener('click', (event) => {
    if (!overlay.classList.contains('is-open')) return;
    if (!typeMulti.contains(event.target) && !ratingMulti.contains(event.target)) closeFilterMenus();
  });

  for (const button of sortButtons) {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey;
      if (!key) return;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      render();
    });
  }

  syncTypeCheckboxes();
  syncRatingCheckboxes();
  document.body.appendChild(overlay);
  document.body.appendChild(detailsController.overlay);
  return overlay;
}

export function openRatingsTableView({ rows, modalTitle, initialScope = 'all' }) {
  getRatingsTableModal().openWithData({ rows, modalTitle, initialScope });
}
