// addSettingsButton function that will create element 'li' as a 'let button'

// Import html content from settings-button-content.html
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

function getProfileLinkElement() {
  return document.querySelector(PROFILE_LINK_SELECTOR);
}

function isGalleryImageLinksEnabled() {
  const persistedValue = localStorage.getItem(GALLERY_IMAGE_LINKS_ENABLED_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function isCreatorPreviewEnabled() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_ENABLED_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function isShowAllCreatorTabsEnabled() {
  const persistedValue = localStorage.getItem(SHOW_ALL_CREATOR_TABS_KEY);
  return persistedValue === null ? false : persistedValue === 'true';
}

function isCreatorPreviewBirthVisible() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function isCreatorPreviewPhotoFromVisible() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function isCreatorPreviewSectionCollapsed() {
  const persistedValue = localStorage.getItem(CREATOR_PREVIEW_SECTION_COLLAPSED_KEY);
  return persistedValue === null ? true : persistedValue === 'true';
}

function showSettingsInfoToast(message) {
  let toastEl = document.querySelector('#cc-settings-info-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'cc-settings-info-toast';
    toastEl.style.position = 'fixed';
    toastEl.style.left = '50%';
    toastEl.style.top = '70px';
    toastEl.style.transform = 'translateX(-50%)';
    toastEl.style.zIndex = '10020';
    toastEl.style.padding = '8px 12px';
    toastEl.style.borderRadius = '8px';
    toastEl.style.background = 'rgba(40, 40, 40, 0.94)';
    toastEl.style.color = '#fff';
    toastEl.style.fontSize = '12px';
    toastEl.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.28)';
    toastEl.style.display = 'none';
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.style.display = 'block';

  if (infoToastTimeoutId) {
    clearTimeout(infoToastTimeoutId);
  }
  infoToastTimeoutId = window.setTimeout(() => {
    toastEl.style.display = 'none';
  }, 1800);
}

function getCurrentUserSlug() {
  const profileEl = getProfileLinkElement();
  const profileHref = profileEl?.getAttribute('href') || '';
  const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//);
  return match ? match[1] : undefined;
}

function isUserLoggedIn() {
  return Boolean(getProfileLinkElement());
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

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) {
      continue;
    }

    if (
      key === SETTINGSNAME ||
      MANAGED_LOCAL_STORAGE_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix.toLowerCase()))
    ) {
      entries.push({
        key,
        value: localStorage.getItem(key) ?? '',
      });
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

function formatLocalStorageValue(value, maxLength = 120) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

async function addSettingsButton() {
  ('use strict');
  const settingsButton = document.createElement('li');
  settingsButton.classList.add('cc-menu-item');
  settingsButton.innerHTML = htmlContent;

  // Insert into the header bar immediately so the button appears as fast as possible.
  // All async/event-listener setup below runs after the element is already visible.
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

  initializeVersionUi(settingsButton).catch(() => undefined);
  initializeRatingsLoader(settingsButton);
  initializeRatingsSync(settingsButton);

  const galleryImageLinksToggle = settingsButton.querySelector('#cc-enable-gallery-image-links');
  const showAllCreatorTabsToggle = settingsButton.querySelector('#cc-show-all-creator-tabs');
  if (galleryImageLinksToggle) {
    galleryImageLinksToggle.checked = isGalleryImageLinksEnabled();
    galleryImageLinksToggle.addEventListener('change', () => {
      const enabled = galleryImageLinksToggle.checked;
      localStorage.setItem(GALLERY_IMAGE_LINKS_ENABLED_KEY, String(enabled));
      window.dispatchEvent(
        new CustomEvent('cc-gallery-image-links-toggled', {
          detail: { enabled },
        }),
      );

      showSettingsInfoToast(enabled ? 'Formáty obrázků v galerii zapnuty.' : 'Formáty obrázků v galerii vypnuty.');
    });
  }

  if (showAllCreatorTabsToggle) {
    showAllCreatorTabsToggle.checked = isShowAllCreatorTabsEnabled();
    showAllCreatorTabsToggle.addEventListener('change', () => {
      const enabled = showAllCreatorTabsToggle.checked;
      localStorage.setItem(SHOW_ALL_CREATOR_TABS_KEY, String(enabled));
      window.dispatchEvent(
        new CustomEvent('cc-show-all-creator-tabs-toggled', {
          detail: { enabled },
        }),
      );
      showSettingsInfoToast(enabled ? 'Všechny záložky tvůrce zobrazeny.' : 'Záložky tvůrce skryty.');
    });
  }

  const creatorPreviewToggle = settingsButton.querySelector('#cc-enable-creator-preview');
  const creatorPreviewGroup = settingsButton.querySelector('#cc-creator-preview-group');
  const creatorPreviewGroupToggle = settingsButton.querySelector('#cc-creator-preview-group-toggle');
  const creatorPreviewCount = settingsButton.querySelector('#cc-creator-preview-count');
  const creatorPreviewGroupBody = settingsButton.querySelector('#cc-creator-preview-group-body');
  const creatorPreviewShowBirthToggle = settingsButton.querySelector('#cc-creator-preview-show-birth');
  const creatorPreviewShowPhotoFromToggle = settingsButton.querySelector('#cc-creator-preview-show-photo-from');
  const creatorPreviewSettingsExtra = settingsButton.querySelector('#cc-creator-preview-settings-extra');
  const resetSettingsButton = settingsButton.querySelector('#cc-maint-reset-btn');
  const clearLocalStorageButton = settingsButton.querySelector('#cc-maint-clear-lc-btn');
  const clearDatabaseButton = settingsButton.querySelector('#cc-maint-clear-db-btn');

  const dispatchCreatorPreviewSettingsChanged = () => {
    window.dispatchEvent(
      new CustomEvent('cc-creator-preview-toggled', {
        detail: {
          enabled: isCreatorPreviewEnabled(),
          showBirth: isCreatorPreviewBirthVisible(),
          showPhotoFrom: isCreatorPreviewPhotoFromVisible(),
        },
      }),
    );
  };

  const dispatchGalleryPreviewSettingsChanged = () => {
    window.dispatchEvent(
      new CustomEvent('cc-gallery-image-links-toggled', {
        detail: { enabled: isGalleryImageLinksEnabled() },
      }),
    );
  };

  const syncCreatorPreviewUsageCount = () => {
    if (!creatorPreviewCount) {
      return;
    }

    const total = Math.max(1, creatorPreviewSettingsExtra?.querySelectorAll('input[type="checkbox"]').length || 2);
    const enabled = Boolean(creatorPreviewToggle?.checked);
    const used =
      Number(Boolean(creatorPreviewShowBirthToggle?.checked)) +
      Number(Boolean(creatorPreviewShowPhotoFromToggle?.checked));

    creatorPreviewCount.textContent = enabled ? `${used}/${total}` : `-/${total}`;

    if (!creatorPreviewGroup) {
      return;
    }

    creatorPreviewGroup.classList.remove('is-status-off', 'is-status-on-minimal', 'is-status-on-detailed');
    if (!enabled) {
      creatorPreviewGroup.classList.add('is-status-off');
      return;
    }

    if (used > 0) {
      creatorPreviewGroup.classList.add('is-status-on-detailed');
    } else {
      creatorPreviewGroup.classList.add('is-status-on-minimal');
    }
  };

  const setCreatorPreviewCollapsedState = (collapsed) => {
    if (creatorPreviewGroup) {
      creatorPreviewGroup.classList.toggle('is-collapsed', collapsed);
    }
    if (creatorPreviewGroupToggle) {
      creatorPreviewGroupToggle.setAttribute('aria-expanded', String(!collapsed));
    }
    if (creatorPreviewGroupBody) {
      creatorPreviewGroupBody.hidden = collapsed;
    }

    localStorage.setItem(CREATOR_PREVIEW_SECTION_COLLAPSED_KEY, String(collapsed));
  };

  const syncCreatorPreviewDependentState = () => {
    const enabled = creatorPreviewToggle ? creatorPreviewToggle.checked : isCreatorPreviewEnabled();

    if (creatorPreviewShowBirthToggle) {
      creatorPreviewShowBirthToggle.disabled = !enabled;
    }

    if (creatorPreviewShowPhotoFromToggle) {
      creatorPreviewShowPhotoFromToggle.disabled = !enabled;
    }

    if (creatorPreviewSettingsExtra) {
      creatorPreviewSettingsExtra.classList.toggle('is-disabled', !enabled);
    }

    syncCreatorPreviewUsageCount();
  };

  const syncSettingsControlsFromStorage = () => {
    if (galleryImageLinksToggle) {
      galleryImageLinksToggle.checked = isGalleryImageLinksEnabled();
    }
    if (showAllCreatorTabsToggle) {
      showAllCreatorTabsToggle.checked = isShowAllCreatorTabsEnabled();
    }
    if (creatorPreviewToggle) {
      creatorPreviewToggle.checked = isCreatorPreviewEnabled();
    }
    if (creatorPreviewShowBirthToggle) {
      creatorPreviewShowBirthToggle.checked = isCreatorPreviewBirthVisible();
    }
    if (creatorPreviewShowPhotoFromToggle) {
      creatorPreviewShowPhotoFromToggle.checked = isCreatorPreviewPhotoFromVisible();
    }

    syncCreatorPreviewDependentState();
    syncCreatorPreviewUsageCount();
  };

  let localStorageModal;
  const ensureLocalStorageModal = () => {
    if (localStorageModal) {
      return localStorageModal;
    }

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
            <thead>
              <tr>
                <th>Klíč</th>
                <th>Hodnota</th>
                <th>Akce</th>
              </tr>
            </thead>
            <tbody id="cc-lc-table-body"></tbody>
          </table>
        </div>
        <div class="cc-lc-modal-actions">
          <button type="button" class="cc-maint-btn" id="cc-lc-delete-all-btn">Smazat vše</button>
          <button type="button" class="cc-maint-btn" id="cc-lc-close-btn">Zavřít</button>
        </div>
      </div>
    `;

    const closeModal = () => {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
    };

    const refreshTable = () => {
      const tableBody = overlay.querySelector('#cc-lc-table-body');
      if (!tableBody) {
        return;
      }

      const entries = getManagedLocalStorageEntries();
      if (entries.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="cc-lc-table-empty">Žádné relevantní položky.</td></tr>';
        return;
      }

      tableBody.innerHTML = entries
        .map(
          ({ key, value }) => `
          <tr>
            <td class="cc-lc-key" title="${escapeHtml(key)}">${escapeHtml(key)}</td>
            <td class="cc-lc-value" title="${escapeHtml(String(value))}">${escapeHtml(formatLocalStorageValue(value))}</td>
            <td class="cc-lc-action">
              <button type="button" class="cc-maint-btn cc-lc-delete-one" data-key="${escapeHtml(key)}">Smazat</button>
            </td>
          </tr>
        `,
        )
        .join('');
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    overlay.querySelector('.cc-lc-modal-close')?.addEventListener('click', closeModal);
    overlay.querySelector('#cc-lc-close-btn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cc-lc-delete-all-btn')?.addEventListener('click', () => {
      const entries = getManagedLocalStorageEntries();
      for (const entry of entries) {
        localStorage.removeItem(entry.key);
      }

      syncSettingsControlsFromStorage();
      dispatchGalleryPreviewSettingsChanged();
      dispatchCreatorPreviewSettingsChanged();
      refreshTable();
      showSettingsInfoToast('Relevantní LocalStorage klíče byly smazány.');
    });

    overlay.querySelector('#cc-lc-table-body')?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const deleteButton = target.closest('.cc-lc-delete-one');
      if (!(deleteButton instanceof HTMLButtonElement)) {
        return;
      }

      const storageKey = deleteButton.dataset.key;
      if (!storageKey) {
        return;
      }

      localStorage.removeItem(storageKey);
      syncSettingsControlsFromStorage();
      dispatchGalleryPreviewSettingsChanged();
      dispatchCreatorPreviewSettingsChanged();
      refreshTable();
      showSettingsInfoToast(`Smazán klíč: ${storageKey}`);
    });

    overlay.addEventListener('cc-lc-open', () => {
      refreshTable();
      overlay.hidden = false;
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
      });
    });

    document.body.appendChild(overlay);
    localStorageModal = overlay;
    return overlay;
  };

  if (creatorPreviewToggle) {
    creatorPreviewToggle.checked = isCreatorPreviewEnabled();
    syncCreatorPreviewDependentState();
    creatorPreviewToggle.addEventListener('change', () => {
      const enabled = creatorPreviewToggle.checked;
      localStorage.setItem(CREATOR_PREVIEW_ENABLED_KEY, String(enabled));
      syncCreatorPreviewDependentState();
      syncCreatorPreviewUsageCount();
      dispatchCreatorPreviewSettingsChanged();

      showSettingsInfoToast(enabled ? 'Náhledy tvůrců zapnuty.' : 'Náhledy tvůrců vypnuty.');
    });
  }

  if (creatorPreviewShowBirthToggle) {
    creatorPreviewShowBirthToggle.checked = isCreatorPreviewBirthVisible();
    creatorPreviewShowBirthToggle.addEventListener('change', () => {
      localStorage.setItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY, String(creatorPreviewShowBirthToggle.checked));
      syncCreatorPreviewUsageCount();
      dispatchCreatorPreviewSettingsChanged();
      showSettingsInfoToast(
        creatorPreviewShowBirthToggle.checked
          ? 'Datum narození v náhledu zapnuto.'
          : 'Datum narození v náhledu vypnuto.',
      );
    });
  }

  if (creatorPreviewShowPhotoFromToggle) {
    creatorPreviewShowPhotoFromToggle.checked = isCreatorPreviewPhotoFromVisible();
    creatorPreviewShowPhotoFromToggle.addEventListener('change', () => {
      localStorage.setItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY, String(creatorPreviewShowPhotoFromToggle.checked));
      syncCreatorPreviewUsageCount();
      dispatchCreatorPreviewSettingsChanged();
      showSettingsInfoToast(
        creatorPreviewShowPhotoFromToggle.checked
          ? '„Photo from“ v náhledu zapnuto.'
          : '„Photo from“ v náhledu vypnuto.',
      );
    });
  }

  if (creatorPreviewGroupToggle) {
    setCreatorPreviewCollapsedState(isCreatorPreviewSectionCollapsed());
    creatorPreviewGroupToggle.addEventListener('click', () => {
      const collapsed = creatorPreviewGroup?.classList.contains('is-collapsed') ?? true;
      setCreatorPreviewCollapsedState(!collapsed);
    });
  }

  syncCreatorPreviewUsageCount();

  if (resetSettingsButton) {
    resetSettingsButton.addEventListener('click', () => {
      localStorage.removeItem(GALLERY_IMAGE_LINKS_ENABLED_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_ENABLED_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_SHOW_BIRTH_KEY);
      localStorage.removeItem(CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY);

      syncSettingsControlsFromStorage();
      dispatchGalleryPreviewSettingsChanged();
      dispatchCreatorPreviewSettingsChanged();

      showSettingsInfoToast('Nastavení náhledů bylo vráceno na výchozí hodnoty.');
    });
  }

  if (clearLocalStorageButton) {
    clearLocalStorageButton.addEventListener('click', () => {
      const modal = ensureLocalStorageModal();
      modal.dispatchEvent(new CustomEvent('cc-lc-open'));
    });
  }

  if (clearDatabaseButton) {
    clearDatabaseButton.addEventListener('click', async () => {
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
  }

  const syncButton = settingsButton.querySelector('#cc-sync-cloud-btn');
  if (syncButton) {
    syncButton.addEventListener(
      'click',
      (event) => {
        if (isUserLoggedIn()) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        showSettingsInfoToast('Cloud sync je dostupný až po přihlášení.');
      },
      true,
    );
  }

  const versionInfoButton = settingsButton.querySelector('#cc-version-info-btn');
  if (versionInfoButton) {
    versionInfoButton.addEventListener('click', (event) => {
      event.preventDefault();
      openVersionInfoModal(settingsButton).catch((error) => {
        console.error('[CC] Failed to open version info modal:', error);
      });
    });
  }

  const redBadge = settingsButton.querySelector('#cc-badge-red');
  const blackBadge = settingsButton.querySelector('#cc-badge-black');
  const ratingsModalOptions = {
    getCurrentUserSlug,
    getMostFrequentUserSlug,
  };

  if (redBadge) {
    redBadge.setAttribute('role', 'button');
    redBadge.setAttribute('tabindex', '0');
    redBadge.title = 'Zobrazit načtená hodnocení';
    redBadge.addEventListener('click', () => {
      if (!isUserLoggedIn()) {
        showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
        return;
      }
      openRatingsTableModal(settingsButton, 'direct', ratingsModalOptions).catch((error) => {
        console.error('[CC] Failed to open direct ratings table:', error);
      });
    });
    redBadge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, 'direct', ratingsModalOptions).catch((error) => {
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
      if (!isUserLoggedIn()) {
        showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
        return;
      }
      openRatingsTableModal(settingsButton, 'computed', ratingsModalOptions).catch((error) => {
        console.error('[CC] Failed to open computed ratings table:', error);
      });
    });
    blackBadge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, 'computed', ratingsModalOptions).catch((error) => {
          console.error('[CC] Failed to open computed ratings table:', error);
        });
      }
    });
  }

  const badgeRefreshOptions = {
    isUserLoggedIn,
    getCurrentUserSlug,
    getMostFrequentUserSlug,
  };

  const refreshBadgesSafely = () => {
    refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((error) => {
      console.error('[CC] Failed to refresh badges:', error);
    });
  };

  refreshBadgesSafely();
  // Single delayed retry in case the profile link wasn't initialised yet on first run.
  window.setTimeout(refreshBadgesSafely, 1200);

  const handleRatingsUpdated = () => {
    invalidateRatingsModalCache();
    refreshBadgesSafely();
  };
  window.addEventListener('cc-ratings-updated', handleRatingsUpdated);

  initializeSettingsMenuHover($button);
}

export { addSettingsButton };
