import { escapeHtml, filterRows, filterRowsByType, sortRows } from './settings-ratings-modal-data.js';
import { createRatingDetailsController } from './settings-ratings-modal-detail.js';

const MODAL_RENDER_SYNC_THRESHOLD = 700;
const MODAL_RENDER_CHUNK_SIZE = 450;

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
        <button type="button" class="cc-button cc-button-red cc-button-iconed cc-ratings-table-export">Export CSV</button>
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
    renderToken: 0,
  };

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
    if (exportBtn) exportBtn.disabled = sorted.length === 0;
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
    // update export button availability (always enabled since rows supplied)
    if (exportBtn) exportBtn.disabled = rows.length === 0;
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
    if (event.target === overlay) {
      overlay.closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    if (detailsController.isOpen()) {
      detailsController.close();
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

    detailsController.open(state.visibleRows[rowIndex]);
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    render();
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      // generate CSV from currently visible rows
      const csvLines = [];
      // include required columns plus fullURL and movieID
      const header = ['Název', 'Typ', 'Rok', 'Hodnocení', 'Datum hodnocení', 'URL', 'movieID'];
      csvLines.push(header.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));
      state.visibleRows.forEach((row) => {
        // rating numeric: prefer ratingValue (NaN -> empty, 0 -> 0, etc.)
        let ratingNum = '';
        if (Number.isFinite(row.ratingValue)) {
          ratingNum = Math.round(row.ratingValue);
        } else if (row.ratingText && row.ratingText.toLowerCase().includes('odpad')) {
          ratingNum = 0;
        }

        const fields = [
          row.name,
          row.typeDisplay,
          row.yearValue,
          ratingNum,
          row.date,
          row.rawRecord?.fullUrl || '',
          row.rawRecord?.movieId || '',
        ];
        const escaped = fields.map((f) => {
          const val = f != null ? String(f) : '';
          return `"${val.replace(/"/g, '""')}"`;
        });
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
  document.body.appendChild(detailsController.overlay);
  return overlay;
}

export function openRatingsTableView({ rows, modalTitle }) {
  const modal = getRatingsTableModal();
  modal.openWithData({ rows, modalTitle });
}
