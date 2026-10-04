/*
 * Creator (actor, director...) filmography: keep every film on a single line.
 * Long titles are cut with an ellipsis (CSS, see style.css) and the full title
 * is available as a tooltip. Page-only change, no requests.
 */
import { CREATOR_ONE_LINE_KEY } from './config.js';
import { getFeatureState } from './utils.js';

const BODY_CLASS = 'cc-creator-one-line';
const TITLE_MARKER = 'data-cc-title';

function isEnabled() {
  return getFeatureState(CREATOR_ONE_LINE_KEY, false) && /\/(?:tvurce|tvorca)\//i.test(location.pathname);
}

// Tooltips are added lazily on hover, so rows loaded later (tabs, AJAX) work too.
function addTitleOnHover(event) {
  const link = event.target instanceof Element ? event.target.closest('a.film-title-name') : null;
  if (!link || !document.body.classList.contains(BODY_CLASS) || link.hasAttribute('title')) return;

  link.setAttribute('title', link.textContent.trim());
  link.setAttribute(TITLE_MARKER, '');
}

let listening = false;

export function applyCreatorOneLine() {
  const body = document.body;
  if (!body) return;

  const enabled = isEnabled();
  body.classList.toggle(BODY_CLASS, enabled);

  if (enabled && !listening) {
    document.addEventListener('mouseover', addTitleOnHover);
    listening = true;
  } else if (!enabled && listening) {
    document.removeEventListener('mouseover', addTitleOnHover);
    listening = false;
  }

  if (!enabled) {
    document.querySelectorAll(`a[${TITLE_MARKER}]`).forEach((link) => {
      link.removeAttribute('title');
      link.removeAttribute(TITLE_MARKER);
    });
  }
}
