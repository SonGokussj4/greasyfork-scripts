// addSettingsButton function that will create element 'li' as a 'let button'

// Import html content from settings-button-content.html
import htmlContent from './settings-button-content.html';
import { initializeRatingsLoader } from './ratings-loader.js';
import { initializeRatingsSync } from './ratings-sync.js';
import { GALLERY_IMAGE_LINKS_ENABLED_KEY } from './config.js';
import { initializeVersionUi, openVersionInfoModal } from './settings-version.js';
import { refreshRatingsBadges } from './settings-badges.js';
import { invalidateRatingsModalCache, openRatingsTableModal } from './settings-ratings-modal.js';
import { initializeSettingsMenuHover } from './settings-hover.js';

let infoToastTimeoutId;
const PROFILE_LINK_SELECTOR =
  'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

function getProfileLinkElement() {
  return document.querySelector(PROFILE_LINK_SELECTOR);
}

function isGalleryImageLinksEnabled() {
  const persistedValue = localStorage.getItem(GALLERY_IMAGE_LINKS_ENABLED_KEY);
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

async function addSettingsButton() {
  ('use strict');
  const settingsButton = document.createElement('li');
  settingsButton.classList.add('cc-menu-item');
  settingsButton.innerHTML = htmlContent;
  initializeVersionUi(settingsButton).catch(() => undefined);
  initializeRatingsLoader(settingsButton);
  initializeRatingsSync(settingsButton);

  const galleryImageLinksToggle = settingsButton.querySelector('#cc-enable-gallery-image-links');
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
  window.setTimeout(refreshBadgesSafely, 1200);
  window.setTimeout(refreshBadgesSafely, 3000);

  const handleRatingsUpdated = () => {
    invalidateRatingsModalCache();
    refreshBadgesSafely();
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

  initializeSettingsMenuHover($button);
}

export { addSettingsButton };
