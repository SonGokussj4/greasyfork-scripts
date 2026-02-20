import { Csfd } from './csfd.js';
import { delay } from './utils.js';
import './styles/fancy-alert.css';
import './styles/alert-modal.css';
import './styles/cc-menu.css';
import './styles/general.css';
import { addSettingsButton } from './settings.js';
import { setControlsDisabledByLoginState } from './ui-utils.js';
import { fancyAlert } from './fancy-alert.js';
import { initializeCreatorHoverPreview } from './creator-hover-preview.js';

(async () => {
  'use strict';
  console.debug('🟣 Script started');
  await delay(20);

  // Initialise the CSFD helper and add the settings button in parallel so neither
  // blocks the other — the button DOM insertion now happens immediately inside
  // addSettingsButton(), so it appears as soon as jQuery can find the header bar.
  const csfd = new Csfd(document.querySelector('div.page-content'));
  console.debug('🟣 Adding main button + initialising CSFD-Compare in parallel');
  await Promise.all([addSettingsButton(), csfd.initialize()]);

  console.debug('🟣 Adding stars (first pass)');
  await csfd.addStars();
  await csfd.addGalleryImageFormatLinks();
  initializeCreatorHoverPreview();

  // CSFD loads some page sections asynchronously (Nette snippets, TV-tips table,
  // etc.).  Re-run addStars once the page is fully loaded and once more a bit
  // later to catch any sections that arrive after the load event.
  let addStarsRunning = false;
  let addStarsQueued = false;
  const rerunStars = () => {
    if (addStarsRunning) {
      addStarsQueued = true;
      return;
    }

    addStarsRunning = true;
    csfd
      .addStars()
      .catch((err) => console.error('[CC] addStars rerun failed:', err))
      .finally(() => {
        addStarsRunning = false;
        if (addStarsQueued) {
          addStarsQueued = false;
          window.setTimeout(rerunStars, 0);
        }
      });
  };
  if (document.readyState === 'complete') {
    rerunStars();
  } else {
    window.addEventListener('load', rerunStars, { once: true });
  }
  window.setTimeout(rerunStars, 1500);

  // Watch for content injected into the DOM after initial load (e.g. pagination
  // clicks, lazy-loaded boxes) and add stars to any new film links.
  // Debounced so that the star elements addStars() itself inserts don't trigger
  // an infinite loop of observer → addStars → insert → observer → ...
  let starObserverTimer = null;
  const mutationContainsFilmLink = (mutationList) => {
    for (const mutation of mutationList) {
      if (!mutation.addedNodes || mutation.addedNodes.length === 0) {
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }

        if (node.matches?.('a[href*="/film/"]') || node.querySelector?.('a[href*="/film/"]')) {
          return true;
        }
      }
    }

    return false;
  };

  const starObserver = new MutationObserver((mutationList) => {
    if (!mutationContainsFilmLink(mutationList)) {
      return;
    }

    if (starObserverTimer !== null) return;
    starObserverTimer = window.setTimeout(() => {
      starObserverTimer = null;
      rerunStars();
    }, 200);
  });
  const pageContent = document.querySelector('div.page-content') || document.body;
  starObserver.observe(pageContent, { childList: true, subtree: true });

  window.addEventListener('cc-gallery-image-links-toggled', () => {
    csfd.addGalleryImageFormatLinks().catch((error) => {
      console.error('[CC] Failed to toggle gallery image format links:', error);
    });
  });

  // Disable Option 2 if not logged in (now using utility)
  setControlsDisabledByLoginState(csfd.getIsLoggedIn(), ['option2']);

  // Add fancy alert
  let alertButton = document.querySelector('.fancy-alert-button');
  if (!alertButton) {
    alertButton = document.createElement('button');
    alertButton.textContent = 'Show Fancy Alert';
    alertButton.className = 'fancy-alert-button';
    document.body.appendChild(alertButton);
  }
  alertButton.addEventListener('click', () => {
    fancyAlert();
  });
})();
