import htmlContent from './settings-button-content.html';
import { initializeRatingsLoader } from './ratings-loader.js';
import { initializeRatingsSync } from './ratings-sync.js';
import { deleteIndexedDB } from './storage.js';
import {
  CREATOR_PREVIEW_ENABLED_KEY,
  CREATOR_PREVIEW_SECTION_COLLAPSED_KEY,
  CREATOR_PREVIEW_SHOW_BIRTH_KEY,
  CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
  GALLERY_IMAGE_LINKS_ENABLED_KEY,
  SHOW_ALL_CREATOR_TABS_KEY,
  INDEXED_DB_NAME,
  SETTINGSNAME,
} from './config.js';
import { initializeVersionUi, openVersionInfoModal } from './settings-version.js';
import { refreshRatingsBadges } from './settings-badges.js';
import { invalidateRatingsModalCache, openRatingsTableModal } from './settings-ratings-modal.js';
import { initializeSettingsMenuHover } from './settings-hover.js';

let infoToastTimeoutId;
const PROFILE_LINK_SELECTOR =
  'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';
const MANAGED_LOCAL_STORAGE_PREFIXES = ['cc_', 'CSFD-Compare'];

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getBoolSetting(key, defaultValue = true) {
  const value = localStorage.getItem(key);
  return value === null ? defaultValue : value === 'true';
}

function getProfileLinkElement() {
  return document.querySelector(PROFILE_LINK_SELECTOR);
}

function isUserLoggedIn() {
  return Boolean(getProfileLinkElement());
}

function getCurrentUserSlug() {
  const match = getProfileLinkElement()
    ?.getAttribute('href')
    ?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
  return match ? match[1] : undefined;
}

function getMostFrequentUserSlug(records) {
  const counts = new Map();
  for (const record of records) {
    if (!record?.userSlug || !Number.isFinite(record?.movieId)) continue;
    counts.set(record.userSlug, (counts.get(record.userSlug) || 0) + 1);
  }

  let bestSlug,
    bestCount = -1;
  for (const [slug, count] of counts.entries()) {
    if (count > bestCount) {
      bestSlug = slug;
      bestCount = count;
    }
  }
  return bestSlug;
}

function showSettingsInfoToast(message) {
  let toastEl = document.querySelector('#cc-settings-info-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'cc-settings-info-toast';
    Object.assign(toastEl.style, {
      position: 'fixed',
      left: '50%',
      top: '70px',
      transform: 'translateX(-50%)',
      zIndex: '10020',
      padding: '8px 12px',
      borderRadius: '8px',
      background: 'rgba(40, 40, 40, 0.94)',
      color: '#fff',
      fontSize: '12px',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.28)',
      display: 'none',
    });
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.style.display = 'block';

  clearTimeout(infoToastTimeoutId);
  infoToastTimeoutId = window.setTimeout(() => {
    toastEl.style.display = 'none';
  }, 1800);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getManagedLocalStorageEntries() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key === SETTINGSNAME ||
      MANAGED_LOCAL_STORAGE_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix.toLowerCase()))
    ) {
      entries.push({ key, value: localStorage.getItem(key) ?? '' });
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

function formatLocalStorageValue(value, maxLength = 120) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

// ==========================================
// MAIN INITIALIZATION
// ==========================================

async function addSettingsButton() {
  'use strict';

  // 1. Create and Insert Button (Vanilla JS)
  const settingsButton = document.createElement('li');
  settingsButton.className = 'cc-menu-item';
  settingsButton.innerHTML = htmlContent;

  const headerBar = document.querySelector('.header-bar');
  if (headerBar) {
    const searchItem = headerBar.querySelector('li.item-search');
    const languageItem = headerBar.querySelector('li.user-language-switch');
    if (searchItem) searchItem.after(settingsButton);
    else if (languageItem) languageItem.before(settingsButton);
    else headerBar.prepend(settingsButton);
  }

  // 2. Initialize Sub-Components
  initializeVersionUi(settingsButton).catch(() => undefined);
  initializeRatingsLoader(settingsButton);
  initializeRatingsSync(settingsButton);

  // 3. Setup Toggles & DOM Elements
  const creatorPreviewGroup = settingsButton.querySelector('#cc-creator-preview-group');
  const creatorPreviewCount = settingsButton.querySelector('#cc-creator-preview-count');
  const creatorPreviewGroupBody = settingsButton.querySelector('#cc-creator-preview-group-body');
  const creatorPreviewGroupToggle = settingsButton.querySelector('#cc-creator-preview-group-toggle');
  const creatorSettingsExtra = settingsButton.querySelector('#cc-creator-preview-settings-extra');

  // Generic Toggle Binder
  const toggles = [];
  function bindToggle(selector, storageKey, defaultValue, eventName, toastOn, toastOff, callback = null) {
    const element = settingsButton.querySelector(selector);
    if (!element) return;

    element.checked = getBoolSetting(storageKey, defaultValue);
    toggles.push({ element, storageKey, defaultValue }); // Store for reset logic

    element.addEventListener('change', () => {
      localStorage.setItem(storageKey, String(element.checked));
      if (eventName) window.dispatchEvent(new CustomEvent(eventName, { detail: { enabled: element.checked } }));
      if (toastOn && toastOff) showSettingsInfoToast(element.checked ? toastOn : toastOff);
      if (callback) callback();
    });
    return element;
  }

  // UI Syncer for Creator Previews
  const updateCreatorPreviewUI = () => {
    const enabled = getBoolSetting(CREATOR_PREVIEW_ENABLED_KEY, true);
    const showBirth = getBoolSetting(CREATOR_PREVIEW_SHOW_BIRTH_KEY, true);
    const showPhoto = getBoolSetting(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY, true);
    const used = Number(showBirth) + Number(showPhoto);

    const birthToggle = settingsButton.querySelector('#cc-creator-preview-show-birth');
    const photoToggle = settingsButton.querySelector('#cc-creator-preview-show-photo-from');

    if (birthToggle) birthToggle.disabled = !enabled;
    if (photoToggle) photoToggle.disabled = !enabled;
    if (creatorSettingsExtra) creatorSettingsExtra.classList.toggle('is-disabled', !enabled);
    if (creatorPreviewCount) creatorPreviewCount.textContent = enabled ? `${used}/2` : `-/2`;

    if (creatorPreviewGroup) {
      creatorPreviewGroup.classList.remove('is-status-off', 'is-status-on-minimal', 'is-status-on-detailed');
      creatorPreviewGroup.classList.add(
        !enabled ? 'is-status-off' : used > 0 ? 'is-status-on-detailed' : 'is-status-on-minimal',
      );
    }

    window.dispatchEvent(
      new CustomEvent('cc-creator-preview-toggled', { detail: { enabled, showBirth, showPhotoFrom: showPhoto } }),
    );
  };

  // Bind All Toggles
  bindToggle(
    '#cc-enable-gallery-image-links',
    GALLERY_IMAGE_LINKS_ENABLED_KEY,
    true,
    'cc-gallery-image-links-toggled',
    'Formáty obrázků v galerii zapnuty.',
    'Formáty obrázků v galerii vypnuty.',
  );
  bindToggle(
    '#cc-show-all-creator-tabs',
    SHOW_ALL_CREATOR_TABS_KEY,
    false,
    'cc-show-all-creator-tabs-toggled',
    'Všechny záložky tvůrce zobrazeny.',
    'Záložky tvůrce skryty.',
  );
  bindToggle(
    '#cc-enable-creator-preview',
    CREATOR_PREVIEW_ENABLED_KEY,
    true,
    null,
    'Náhledy tvůrců zapnuty.',
    'Náhledy tvůrců vypnuty.',
    updateCreatorPreviewUI,
  );
  bindToggle(
    '#cc-creator-preview-show-birth',
    CREATOR_PREVIEW_SHOW_BIRTH_KEY,
    true,
    null,
    'Datum narození v náhledu zapnuto.',
    'Datum narození v náhledu vypnuto.',
    updateCreatorPreviewUI,
  );
  bindToggle(
    '#cc-creator-preview-show-photo-from',
    CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
    true,
    null,
    '„Photo from“ v náhledu zapnuto.',
    '„Photo from“ v náhledu vypnuto.',
    updateCreatorPreviewUI,
  );

  // Initialize UI State
  updateCreatorPreviewUI();

  // Collapsible Preview Section
  const setPreviewCollapsedState = (collapsed) => {
    if (creatorPreviewGroup) creatorPreviewGroup.classList.toggle('is-collapsed', collapsed);
    if (creatorPreviewGroupToggle) creatorPreviewGroupToggle.setAttribute('aria-expanded', String(!collapsed));
    if (creatorPreviewGroupBody) creatorPreviewGroupBody.hidden = collapsed;
    localStorage.setItem(CREATOR_PREVIEW_SECTION_COLLAPSED_KEY, String(collapsed));
  };

  if (creatorPreviewGroupToggle) {
    setPreviewCollapsedState(getBoolSetting(CREATOR_PREVIEW_SECTION_COLLAPSED_KEY, true));
    creatorPreviewGroupToggle.addEventListener('click', () => {
      // invert current state rather than re-applying it
      const currentlyCollapsed = creatorPreviewGroup?.classList.contains('is-collapsed') ?? true;
      setPreviewCollapsedState(!currentlyCollapsed);
    });
  }

  // 4. Maintenance Buttons Logic
  const syncControlsFromStorage = () => {
    toggles.forEach((t) => (t.element.checked = getBoolSetting(t.storageKey, t.defaultValue)));
    updateCreatorPreviewUI();
  };

  settingsButton.querySelector('#cc-maint-reset-btn')?.addEventListener('click', () => {
    localStorage.removeItem(GALLERY_IMAGE_LINKS_ENABLED_KEY);
    localStorage.removeItem(CREATOR_PREVIEW_ENABLED_KEY);
    localStorage.removeItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY);
    localStorage.removeItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY);
    syncControlsFromStorage();
    window.dispatchEvent(new CustomEvent('cc-gallery-image-links-toggled', { detail: { enabled: true } }));
    showSettingsInfoToast('Nastavení náhledů bylo vráceno na výchozí hodnoty.');
  });

  settingsButton.querySelector('#cc-maint-clear-db-btn')?.addEventListener('click', async () => {
    try {
      await deleteIndexedDB(INDEXED_DB_NAME);
      invalidateRatingsModalCache();
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      showSettingsInfoToast('IndexedDB byla smazána.');
    } catch (error) {
      console.error('[CC] Failed to delete IndexedDB:', error);
      showSettingsInfoToast('Smazání DB selhalo.');
    }
  });

  // Local Storage Modal Logic
  let localStorageModal;
  const ensureLocalStorageModal = () => {
    if (localStorageModal) return localStorageModal;

    const overlay = document.createElement('div');
    overlay.className = 'cc-lc-modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="cc-lc-modal" role="dialog" aria-modal="true" aria-label="Správa LocalStorage">
        <div class="cc-lc-modal-head">
          <h3>Správa LocalStorage</h3>
          <button type="button" class="cc-lc-modal-close" aria-label="Zavřít">×</button>
        </div>
        <div class="cc-lc-modal-help">Klíče používané CSFD-Compare (cc_*, CSFD-Compare*).</div>
        <div class="cc-lc-modal-body">
          <table class="cc-lc-table">
            <thead><tr><th>Klíč</th><th>Hodnota</th><th>Akce</th></tr></thead>
            <tbody id="cc-lc-table-body"></tbody>
          </table>
        </div>
        <div class="cc-lc-modal-actions">
          <button type="button" class="cc-maint-btn" id="cc-lc-delete-all-btn">Smazat vše</button>
          <button type="button" class="cc-maint-btn" id="cc-lc-close-btn">Zavřít</button>
        </div>
      </div>`;

    const closeModal = () => {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
    };
    const refreshTable = () => {
      const tableBody = overlay.querySelector('#cc-lc-table-body');
      if (!tableBody) return;
      const entries = getManagedLocalStorageEntries();
      if (!entries.length) {
        tableBody.innerHTML = '<tr><td colspan="3" class="cc-lc-table-empty">Žádné relevantní položky.</td></tr>';
        return;
      }
      tableBody.innerHTML = entries
        .map(
          ({ key, value }) => `
        <tr>
          <td class="cc-lc-key" title="${escapeHtml(key)}">${escapeHtml(key)}</td>
          <td class="cc-lc-value" title="${escapeHtml(String(value))}">${escapeHtml(formatLocalStorageValue(value))}</td>
          <td class="cc-lc-action"><button type="button" class="cc-maint-btn cc-lc-delete-one" data-key="${escapeHtml(key)}">Smazat</button></td>
        </tr>`,
        )
        .join('');
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    overlay.querySelector('.cc-lc-modal-close')?.addEventListener('click', closeModal);
    overlay.querySelector('#cc-lc-close-btn')?.addEventListener('click', closeModal);

    overlay.querySelector('#cc-lc-delete-all-btn')?.addEventListener('click', () => {
      getManagedLocalStorageEntries().forEach((entry) => localStorage.removeItem(entry.key));
      syncControlsFromStorage();
      window.dispatchEvent(
        new CustomEvent('cc-gallery-image-links-toggled', {
          detail: { enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true) },
        }),
      );
      refreshTable();
      showSettingsInfoToast('Relevantní LocalStorage klíče byly smazány.');
    });

    overlay.querySelector('#cc-lc-table-body')?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.cc-lc-delete-one');
      if (!deleteBtn || !deleteBtn.dataset.key) return;
      localStorage.removeItem(deleteBtn.dataset.key);
      syncControlsFromStorage();
      window.dispatchEvent(
        new CustomEvent('cc-gallery-image-links-toggled', {
          detail: { enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true) },
        }),
      );
      refreshTable();
      showSettingsInfoToast(`Smazán klíč: ${deleteBtn.dataset.key}`);
    });

    overlay.addEventListener('cc-lc-open', () => {
      refreshTable();
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add('is-open'));
    });

    document.body.appendChild(overlay);
    return (localStorageModal = overlay);
  };

  settingsButton.querySelector('#cc-maint-clear-lc-btn')?.addEventListener('click', () => {
    ensureLocalStorageModal().dispatchEvent(new CustomEvent('cc-lc-open'));
  });

  // 5. Header Bar Actions (Sync, Info, Badges)
  settingsButton.querySelector('#cc-sync-cloud-btn')?.addEventListener(
    'click',
    (e) => {
      if (isUserLoggedIn()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      showSettingsInfoToast('Cloud sync je dostupný až po přihlášení.');
    },
    true,
  );

  settingsButton.querySelector('#cc-version-info-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openVersionInfoModal(settingsButton).catch((err) => console.error('[CC] Failed to open version info modal:', err));
  });

  const ratingsModalOptions = { getCurrentUserSlug, getMostFrequentUserSlug };
  const setupBadge = (id, type) => {
    const badge = settingsButton.querySelector(id);
    if (!badge) return;
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');

    const handler = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();

      if (!isUserLoggedIn()) {
        showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
        return;
      }
      openRatingsTableModal(settingsButton, type, ratingsModalOptions).catch((err) =>
        console.error(`[CC] Failed to open ${type} ratings table:`, err),
      );
    };

    badge.addEventListener('click', handler);
    badge.addEventListener('keydown', handler);
  };

  setupBadge('#cc-badge-red', 'direct');
  setupBadge('#cc-badge-black', 'computed');

  // Badges Refresh Logic
  const badgeRefreshOptions = { isUserLoggedIn, getCurrentUserSlug, getMostFrequentUserSlug };
  const refreshBadgesSafely = () =>
    refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((err) =>
      console.error('[CC] Failed to refresh badges:', err),
    );

  refreshBadgesSafely();
  window.setTimeout(refreshBadgesSafely, 1200);

  window.addEventListener('cc-ratings-updated', () => {
    invalidateRatingsModalCache();
    refreshBadgesSafely();
  });

  // use the raw DOM element; helper no longer depends on jQuery
  initializeSettingsMenuHover(settingsButton);
}

export { addSettingsButton };
