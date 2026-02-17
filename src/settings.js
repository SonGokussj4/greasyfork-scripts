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
  url.pathname = url.pathname.replace(/\/(prehled|prehlad)\/?$/i, `/${segment}/`);
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
  const totalRatings = await fetchTotalRatingsForCurrentUser();

  redBadge.textContent = `${userRecords.length} / ${totalRatings}`;
  blackBadge.textContent = `${computedCount}`;
}

async function addSettingsButton() {
  ('use strict');
  const settingsButton = document.createElement('li');
  settingsButton.classList.add('cc-menu-item');
  settingsButton.innerHTML = htmlContent;
  initializeRatingsLoader(settingsButton);
  initializeRatingsSync(settingsButton);
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
