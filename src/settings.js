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

function getCurrentUserSlug() {
  const profileEl = document.querySelector('a.profile.initialized');
  const profileHref = profileEl?.getAttribute('href') || '';
  const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//);
  return match ? match[1] : undefined;
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

  const userSlug = getCurrentUserSlug();
  if (!userSlug) {
    redBadge.textContent = '0 / 0';
    blackBadge.textContent = '0';
    return;
  }

  const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
  const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));
  const computedCount = userRecords.filter((record) => record.computed === true).length;
  const directRatingsCount = userRecords.length - computedCount;
  const totalRatings = await fetchTotalRatingsForCurrentUser();

  redBadge.textContent = `${directRatingsCount} / ${totalRatings}`;
  blackBadge.textContent = `${computedCount}`;
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
    stars: `${'★'.repeat(clamped)}${'☆'.repeat(5 - clamped)}`,
    isOdpad: false,
  };
}

function toModalRows(records) {
  return records.map((record) => {
    const ratingValue = Number.isFinite(record.rating) ? record.rating : Number.NEGATIVE_INFINITY;
    const normalizedType = normalizeModalType(record.type);
    const formattedRating = formatRatingForModal(record.rating);

    return {
      name: (record.name || '').trim(),
      url: resolveRecordUrl(record),
      typeKey: normalizedType.key,
      typeLabel: normalizedType.label,
      ratingText: formattedRating.stars,
      ratingIsOdpad: formattedRating.isOdpad,
      ratingValue,
      date: (record.date || '').trim(),
    };
  });
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase();
}

function sortRows(rows, sortKey, sortDir) {
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'type') {
      return a.typeLabel.localeCompare(b.typeLabel, 'en', { sensitivity: 'base' });
    }

    if (sortKey === 'rating') {
      return a.ratingValue - b.ratingValue;
    }

    if (sortKey === 'date') {
      return a.date.localeCompare(b.date, 'cs', { sensitivity: 'base' });
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
      normalizeSearchText(row.ratingText).includes(query) ||
      normalizeSearchText(row.date).includes(query)
    );
  });
}

function filterRowsByType(rows, typeFilter) {
  if (!typeFilter || typeFilter === 'all') {
    return rows;
  }
  return rows.filter((row) => row.typeKey === typeFilter);
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
        <select class="cc-ratings-table-type-filter" aria-label="Filtr typu">
          <option value="all">All types</option>
          <option value="movie">Movie</option>
          <option value="series">Series</option>
          <option value="season">Season</option>
          <option value="episode">Episode</option>
        </select>
        <span class="cc-ratings-table-summary">0 položek</span>
      </div>
      <div class="cc-ratings-table-wrap">
        <table class="cc-ratings-table" aria-live="polite">
          <thead>
            <tr>
              <th><button type="button" data-sort-key="name"><span class="cc-sort-label">Název</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="type"><span class="cc-sort-label">Typ</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="rating"><span class="cc-sort-label">Hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="date"><span class="cc-sort-label">Datum</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.cc-ratings-table-close');
  const searchInput = overlay.querySelector('.cc-ratings-table-search');
  const typeFilter = overlay.querySelector('.cc-ratings-table-type-filter');
  const summary = overlay.querySelector('.cc-ratings-table-summary');
  const tbody = overlay.querySelector('tbody');
  const title = overlay.querySelector('#cc-ratings-table-title');
  const sortButtons = Array.from(overlay.querySelectorAll('th button[data-sort-key]'));

  const state = {
    rows: [],
    search: '',
    typeFilter: 'all',
    sortKey: 'name',
    sortDir: 'asc',
  };

  const render = () => {
    const typeFiltered = filterRowsByType(state.rows, state.typeFilter);
    const filtered = filterRows(typeFiltered, state.search);
    const sorted = sortRows(filtered, state.sortKey, state.sortDir);

    summary.textContent = `${sorted.length} položek`;
    tbody.innerHTML = '';

    if (sorted.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = '<td colspan="4" class="cc-ratings-table-empty">Žádná data</td>';
      tbody.appendChild(emptyRow);
    } else {
      for (const row of sorted) {
        const tr = document.createElement('tr');
        const iconLink = row.url
          ? `<a class="cc-ratings-table-link-icon" href="${row.url}" target="_blank" rel="noopener noreferrer" aria-label="Otevřít detail">↗</a>`
          : '';
        const nameLink = row.url
          ? `<a class="cc-ratings-table-name-link" href="${row.url}" target="_blank" rel="noopener noreferrer">${row.name || 'Bez názvu'}</a>`
          : `<span class="cc-ratings-table-name-link">${row.name || 'Bez názvu'}</span>`;
        tr.innerHTML = `
          <td>
            <div class="cc-ratings-table-name-row">
              ${nameLink}
              ${iconLink}
            </div>
          </td>
          <td class="cc-ratings-table-type">${row.typeLabel}</td>
          <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''}">${row.ratingText}</td>
          <td class="cc-ratings-table-date">${row.date || '—'}</td>
        `;
        tbody.appendChild(tr);
      }
    }

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
    state.typeFilter = 'all';
    state.sortKey = 'name';
    state.sortDir = 'asc';
    title.textContent = modalTitle;
    searchInput.value = '';
    typeFilter.value = 'all';
    render();
    overlay.classList.add('is-open');
    document.body.classList.add('cc-ratings-modal-open');
    searchInput.focus();
  };

  overlay.closeModal = () => {
    overlay.classList.remove('is-open');
    document.body.classList.remove('cc-ratings-modal-open');
  };

  closeBtn.addEventListener('click', () => overlay.closeModal());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.closeModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
      overlay.closeModal();
    }
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    render();
  });

  typeFilter.addEventListener('change', () => {
    state.typeFilter = typeFilter.value;
    render();
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

  document.body.appendChild(overlay);
  return overlay;
}

async function openRatingsTableModal(rootElement, scope) {
  const userSlug = getCurrentUserSlug();
  if (!userSlug) {
    return;
  }

  const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
  const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));
  const scopedRecords =
    scope === 'computed'
      ? userRecords.filter((record) => record.computed === true)
      : userRecords.filter((record) => record.computed !== true);

  const rows = toModalRows(scopedRecords);
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
    refreshRatingsBadges(settingsButton).catch((error) => {
      console.error('[CC] Failed to refresh badges:', error);
    });
  };
  window.addEventListener('cc-ratings-updated', handleRatingsUpdated);

  const $button = $(settingsButton);
  $('.header-bar').prepend($button);

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
