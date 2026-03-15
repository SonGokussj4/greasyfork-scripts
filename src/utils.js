import { PROFILE_LINK_SELECTOR, USER_SLUG_REGEX } from './config.js';

export function roundTo(number, decimals) {
  return Math.floor(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function delay(t) {
  return new Promise((resolve) => setTimeout(resolve, t));
}

// Escape HTML to prevent XSS from weird CSFD data
export const escapeHtml = (str) =>
  String(str || '').replace(
    /[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m],
  );

/**
 * Extract user slug (e.g. "12345-username") from a ČSFD user path or href.
 * @param {string} href - path like "/uzivatel/12345-username/hodnoceni/"
 * @returns {string|undefined}
 */
export function extractUserSlug(href) {
  return String(href || '').match(USER_SLUG_REGEX)?.[1];
}

/** Returns the profile link element for the logged-in user, or null. */
export function getProfileLinkElement() {
  return document.querySelector(PROFILE_LINK_SELECTOR);
}

/**
 * Parse a star-rating value from a ČSFD `.stars` element.
 * @param {Element|null} starsEl - element with class like "stars stars-4" or "stars trash"
 * @returns {number} 0-5 rating, or NaN if unparseable
 */
export function parseRatingFromStars(starsEl) {
  if (!starsEl) return NaN;
  const cls = starsEl.className || '';
  if (cls.includes('trash')) return 0;
  const m = cls.match(/stars-(\d)/);
  return m ? parseInt(m[1], 10) : NaN;
}

/**
 * Pure utility function for reading settings.
 * @param {string} key - The localStorage key for the setting.
 * @param {boolean} [defaultValue=true] - The default value if the setting is not set.
 * @returns {boolean} The current state of the setting.
 */
export function getFeatureState(key, defaultValue = true) {
  const value = localStorage.getItem(key);
  if (value === null) return defaultValue;
  return value === 'true';
}

/**
 * Extract the movie/film ID from a ČSFD URL path.
 * @param {string} url - The URL or path to extract the movie ID from.
 * @returns {number} The extracted movie ID, or NaN if it cannot be parsed.
 */
export function getMovieIdFromUrl(url) {
  if (!url) return NaN;
  // OPTIMIZATION: matchAll is slower. A simple regex match with global flag is faster.
  const matches = url.match(/\/(\d+)-/g);
  if (!matches || matches.length === 0) return NaN;

  // Extract numbers from the last match e.g., "/12345-" -> 12345
  const lastMatch = matches[matches.length - 1];
  return parseInt(lastMatch.replace(/\D/g, ''), 10);
}
