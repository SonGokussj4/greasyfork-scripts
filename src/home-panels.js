/*
 * Homepage panel hiding — lets the user hide individual boxes (TV tips,
 * trailers, banners, …) on the ČSFD homepage via small "skrýt" buttons.
 *
 * Extracted from csfd.js; the Csfd class delegates here. The hidden-panel
 * list itself lives in localStorage (HIDDEN_PANELS_LIST_KEY) and is cached
 * in memory by the caller, which passes live accessors into
 * createHomePanelsVisibilitySync().
 */
import { HIDE_HOME_PANELS_KEY } from './config.js';
import { getFeatureState } from './utils.js';

/**
 * Some panel titles change every day (e.g. "TV tipy dne - neděle").
 * These rules collapse them onto one stable storage key so hiding the panel
 * on Sunday keeps it hidden on Monday too.
 */
const HOME_PAGE_PANEL_TITLE_NORMALIZERS = Object.freeze([
  {
    pattern: /^tv tipy dne\s*-/i,
    storageTitle: 'TV tipy dne -',
  },
]);

/** Collapse whitespace and map day-specific titles onto their stable storage key. */
export function normalizeHomePanelTitle(title) {
  const normalizedTitle = String(title || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedTitle) return '';

  const matchedRule = HOME_PAGE_PANEL_TITLE_NORMALIZERS.find(({ pattern }) => pattern.test(normalizedTitle));
  return matchedRule?.storageTitle || normalizedTitle;
}

/** True when the hidden list contains the given panel title (after normalization). */
export function homePanelsListIncludes(hiddenList, title) {
  const normalizedTitle = normalizeHomePanelTitle(title);
  if (!normalizedTitle) return false;

  return hiddenList.some((hiddenTitle) => normalizeHomePanelTitle(hiddenTitle) === normalizedTitle);
}

/**
 * Build the visibility-sync routine for homepage panel hiding.
 *
 * @param {object} options
 * @param {() => string[]} options.getHiddenList - returns the live array of hidden panel titles
 * @param {(storageTitle: string) => void} options.onHidePanel - called when the user clicks a hide button
 * @returns {() => void} routine that shows/hides panels and injects hide buttons; safe to call repeatedly
 */
export function createHomePanelsVisibilitySync({ getHiddenList, onHidePanel }) {
  return () => {
    const enabled = getFeatureState(HIDE_HOME_PANELS_KEY, true);
    const hiddenList = getHiddenList();

    document
      .querySelectorAll(
        `
        .page-content .box-header > h2,
        .page-content .updated-box-header > h2,
        .page-content .updated-box-header > p,
        .updated-box-homepage-video,
        .page-content .updated-box-banner p,
        .page-content .updated-box-banner-mobile p
      `,
      )
      .forEach((headerEl) => {
        const isVideoSlider = headerEl.classList.contains('updated-box-homepage-video');
        let title = '';

        if (isVideoSlider) {
          title = 'Trailery a Videa';
        } else {
          title = Array.from(headerEl.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
        }

        if (!title || title.length > 60) return;
        const storageTitle = normalizeHomePanelTitle(title);

        let wrapper =
          headerEl.closest('.column') || headerEl.closest('.box') || headerEl.closest('.updated-box') || headerEl;

        if (wrapper.classList.contains('column') && wrapper.children.length > 1) {
          wrapper = headerEl.closest('.box') || headerEl.closest('.updated-box') || headerEl;
        }

        if (enabled && homePanelsListIncludes(hiddenList, storageTitle)) {
          wrapper.style.display = 'none';
        } else {
          wrapper.style.display = '';
        }

        // Add hide buttons if they don't exist
        const btnClass = isVideoSlider ? '.cc-hide-video-btn' : '.cc-hide-panel-btn';
        if (!headerEl.querySelector(btnClass)) {
          const btn = document.createElement('button');
          btn.className = btnClass.replace('.', '');
          btn.title = isVideoSlider ? 'Skrýt Trailery' : 'Skrýt tento panel';
          btn.textContent = isVideoSlider ? 'skrýt trailery' : 'skrýt';

          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onHidePanel(storageTitle);
          };
          headerEl.appendChild(btn);
        }
      });

    // GROUP & ROW COLLAPSE ENGINE — hide wrappers whose every child panel is hidden
    document.querySelectorAll('.page-content .updated-box-group').forEach((group) => {
      const items = Array.from(group.querySelectorAll(':scope > section, :scope > div.updated-box'));
      if (items.length > 0) {
        const allHidden = items.every((item) => item.style.display === 'none');
        group.style.display = allHidden ? 'none' : '';
      }
    });

    document.querySelectorAll('.page-content .row').forEach((row) => {
      const cols = Array.from(row.querySelectorAll(':scope > .column'));
      if (cols.length === 0) return;

      const allHidden = cols.every((col) => {
        if (col.style.display === 'none') return true;
        const sections = Array.from(
          col.querySelectorAll(':scope > section, :scope > div.updated-box, :scope > div.updated-box-group'),
        );
        if (sections.length === 0) return false;

        return sections.every((sec) => sec.style.display === 'none');
      });

      row.style.display = allHidden ? 'none' : '';
    });
  };
}
