// addSettingsButton function that will create element 'li' as a 'let button'

// Import html content from settings-button-content.html
import htmlContent from './settings-button-content.html';
// Load DEBUG variable from env file
import { DEBUG } from './env.js';
import { bindFancyAlertButton } from './fancy-alert.js';
import { initializeRatingsLoader } from './ratings-loader.js';
import { initializeRatingsSync } from './ratings-sync.js';
import { GALLERY_IMAGE_LINKS_ENABLED_KEY } from './config.js';
import { initializeVersionUi, openVersionInfoModal } from './settings-version.js';
import { refreshRatingsBadges } from './settings-badges.js';
import { invalidateRatingsModalCache, openRatingsTableModal } from './settings-ratings-modal.js';

let infoToastTimeoutId;

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
  const profileEl = document.querySelector('a.profile.initialized');
  const profileHref = profileEl?.getAttribute('href') || '';
  const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//);
  return match ? match[1] : undefined;
}

function isUserLoggedIn() {
  return Boolean(document.querySelector('a.profile.initialized'));
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

  refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((error) => {
    console.error('[CC] Failed to refresh badges:', error);
  });

  const handleRatingsUpdated = () => {
    invalidateRatingsModalCache();
    refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((error) => {
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
