import { Csfd } from './csfd.js';
import { delay } from './utils.js';
import './style.css';
import { addSettingsButton } from './settings.js';
import { setControlsDisabledByLoginState } from './ui-utils.js';
import { initializeHoverPreviews } from './hover-preview.js';
import { applyFilmActionVisibility } from './film-actions.js';
import { FILM_ACTIONS_UPDATED_EVENT, MY_DISCUSSIONS_UPDATED_EVENT } from './config.js';
import { applyMyDiscussions } from './my-discussions.js';
import { initializeReviewDraftAutosave, setReviewDraftAutosaveEnabled } from './review-draft.js';

(async () => {
  'use strict';
  console.debug('🟣 Script started');

  await delay(20);

  if (document.readyState === 'loading') {
    await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve));
  }

  // Initialise the CSFD helper and add the settings button in parallel so neither
  // blocks the other — the button DOM insertion now happens immediately inside
  // addSettingsButton(), so it appears as soon as jQuery can find the header bar.
  const csfd = new Csfd(document.querySelector('div.page-content'));
  console.debug('🟣 Adding main button + initialising CSFD-Compare in parallel');
  await Promise.all([addSettingsButton(), csfd.initialize()]);

  // The stored preference is honoured inside csfd.initialize(); no need
  // to invoke showAllCreatorTabs here unconditionally.  The toggle listener
  // below will react if the user changes the setting later.

  window.addEventListener('cc-show-all-creator-tabs-toggled', (ev) => {
    try {
      const enabled = !!ev?.detail?.enabled;
      if (enabled) {
        csfd.showAllCreatorTabs();
      } else {
        csfd.restoreCreatorTabs();
      }
    } catch (err) {
      console.error('[CC] show-all-creator-tabs toggle handler failed:', err);
    }
  });

  window.addEventListener('cc-revert-star-style-toggled', (ev) => {
    if (ev?.detail?.enabled) {
      csfd.revertStarStyle();
    } else {
      csfd.restoreStarStyle();
    }
  });

  applyFilmActionVisibility();
  applyMyDiscussions();
  window.addEventListener(MY_DISCUSSIONS_UPDATED_EVENT, applyMyDiscussions);
  window.addEventListener(FILM_ACTIONS_UPDATED_EVENT, applyFilmActionVisibility);

  console.debug('🟣 Adding stars (first pass)');
  await csfd.addStars();
  await csfd.addGalleryImageFormatLinks();
  csfd.addConfiguredLinkIcons();
  initializeHoverPreviews();
  initializeReviewDraftAutosave();

  // CSFD loads some page sections asynchronously (Nette snippets, TV-tips table,
  // etc.).  Re-run addStars once the page is fully loaded and once more a bit
  // later to catch any sections that arrive after the load event.
  let addStarsRunning = false;
  let addStarsQueued = false;
  let linkIconObserverTimer = null;
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

  // Watch for content injected into the DOM after initial load (e.g. pagination
  // clicks, lazy-loaded boxes and AJAX-replies in discussions) and add stars to any new film links.
  // Debounced so that the star elements addStars() itself inserts don't trigger
  // an infinite loop of observer → addStars → insert → observer → ...
  let starObserverTimer = null;
  let forumObserverTimer = null;

  const FILM_LINK_SELECTOR = 'a[href*="/film/"]';
  const FORUM_POST_SELECTOR = '.article-forum-item, article.article-forum';
  const LINK_ICON_SELECTOR =
    'a[href*="/film/"], a[href*="/tvurce/"], a[href*="/tvorca/"], a[href*="/uzivatel/"], a[href*="youtube.com"], a[href*="youtu.be"], a[href*="store.steampowered.com"], a[href*="wikipedia.org"], a[href*="anidb.net"], a[href*="myanimelist.net"], .article-content.article-content-justify, .article-content.article-content-icons, .article-news-content.article-content-justify, span.comment';

  // Single pass over the added nodes; stops early once every kind has been seen.
  const classifyMutations = (mutationList) => {
    const found = { film: false, forum: false, linkIcon: false };
    const hit = (node, selector) => node.matches(selector) || node.querySelector(selector) !== null;

    for (const mutation of mutationList) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        found.film = found.film || hit(node, FILM_LINK_SELECTOR);
        found.forum = found.forum || hit(node, FORUM_POST_SELECTOR);
        found.linkIcon = found.linkIcon || hit(node, LINK_ICON_SELECTOR);
        if (found.film && found.forum && found.linkIcon) return found;
      }
    }

    return found;
  };

  const contentObserver = new MutationObserver((mutationList) => {
    const changes = classifyMutations(mutationList);
    if (changes.film) {
      if (starObserverTimer === null) {
        starObserverTimer = window.setTimeout(() => {
          starObserverTimer = null;
          rerunStars();
        }, 200);
      }
    }

    // If the DOM update contained a forum post, redraw the self-reply buttons!
    if (changes.forum) {
      if (forumObserverTimer === null) {
        forumObserverTimer = window.setTimeout(() => {
          forumObserverTimer = null;
          csfd.enableSelfReplyInDiscussions();
          csfd.addPostPermalinks();
        }, 200);
      }
    }

    if (changes.linkIcon) {
      if (linkIconObserverTimer === null) {
        linkIconObserverTimer = window.setTimeout(() => {
          linkIconObserverTimer = null;
          csfd.addConfiguredLinkIcons(pageContent);
        }, 200);
      }
    }
  });

  const pageContent = document.querySelector('div.page-content') || document.body;
  contentObserver.observe(pageContent, { childList: true, subtree: true });

  window.addEventListener('cc-gallery-image-links-toggled', () => {
    csfd.addGalleryImageFormatLinks().catch((error) => {
      console.error('[CC] Failed to toggle gallery image format links:', error);
    });
  });

  window.addEventListener('cc-link-icons-updated', () => {
    csfd.refreshLinkIcons(pageContent);
  });

  // wire up legacy‑style toggles
  window.addEventListener('cc-clickable-header-boxes-toggled', (ev) => {
    if (ev?.detail?.enabled) {
      csfd.clickableHeaderBoxes();
    } else {
      csfd.clearClickableHeaderBoxes();
    }
  });
  window.addEventListener('cc-ratings-estimate-toggled', (ev) => {
    if (ev?.detail?.enabled) {
      csfd.ratingsEstimate();
    } else {
      csfd.clearRatingsEstimate();
    }
  });
  window.addEventListener('cc-ratings-from-favorites-toggled', (ev) => {
    if (ev?.detail?.enabled) {
      csfd.ratingsFromFavorites();
    } else {
      csfd.clearRatingsFromFavorites();
    }
  });
  window.addEventListener('cc-add-ratings-date-toggled', (ev) => {
    if (ev?.detail?.enabled) {
      csfd.addRatingsDate();
    } else {
      csfd.clearRatingsDate();
    }
  });
  window.addEventListener('cc-hide-selected-reviews-updated', () => {
    csfd.hideSelectedUserReviews();
  });

  window.addEventListener('cc-self-reply-toggled', (ev) => {
    if (ev?.detail?.enabled) {
      csfd.enableSelfReplyInDiscussions();
    } else {
      csfd.clearSelfReplyInDiscussions();
    }
  });

  window.addEventListener('cc-post-permalink-toggled', (ev) => {
    if (ev?.detail?.enabled) {
      csfd.addPostPermalinks();
    } else {
      csfd.clearPostPermalinks();
    }
  });

  window.addEventListener('cc-review-draft-autosave-toggled', (ev) => {
    setReviewDraftAutosaveEnabled(!!ev?.detail?.enabled);
  });

  // Disable Option 2 if not logged in (now using utility)
  setControlsDisabledByLoginState(csfd.getIsLoggedIn(), ['option2']);
})();
