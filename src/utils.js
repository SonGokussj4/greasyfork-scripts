import { PROFILE_LINK_SELECTOR, USER_SLUG_REGEX } from './config.js';

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
 * Accepts relative paths and absolute URLs, with or without a trailing slash.
 * @param {string} href - path like "/uzivatel/12345-username/hodnoceni/"
 * @returns {string|undefined}
 */
export function extractUserSlug(href) {
  return String(href || '').match(USER_SLUG_REGEX)?.[1];
}

/**
 * Extract the readable username from a user slug.
 * @param {string} slug - slug like "12345-username"
 * @returns {string|undefined}
 */
export function extractUsernameFromUserSlug(slug) {
  return String(slug || '').match(/^\d+-(.+)$/)?.[1];
}

/**
 * Extract the readable username directly from a ČSFD profile href.
 * @param {string} href - path like "/uzivatel/12345-username/"
 * @returns {string|undefined}
 */
export function extractUsernameFromHref(href) {
  return extractUsernameFromUserSlug(extractUserSlug(href));
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

// A film path: "/film/123-slug/", an episode or season "/film/123-slug/456-slug/", and films ČSFD
// gives no slug at all: "/film/410649/" (e.g. some music videos).
const FILM_PATH_REGEX = /\/film\/(\d+(?:-[^/?#]*)?)(?:\/(\d+(?:-[^/?#]*)?))?(?=[/?#]|$)/i;

/**
 * Reads the film ids from a ČSFD film URL or path, with or without slugs.
 * @param {string} url
 * @returns {{ ids: number[], segments: string[] } | null} parent first; segments are "123-slug" or "123"
 */
export function parseFilmPath(url) {
  const match = String(url || '').match(FILM_PATH_REGEX);
  if (!match) return null;
  const segments = [match[1], match[2]].filter(Boolean);
  return { ids: segments.map((segment) => Number.parseInt(segment, 10)), segments };
}

/**
 * Extract the movie/film ID from a ČSFD URL path.
 * @param {string} url - The URL or path to extract the movie ID from.
 * @returns {number} The extracted movie ID, or NaN if it cannot be parsed.
 */
export function getMovieIdFromUrl(url) {
  if (!url) return NaN;
  const filmPath = parseFilmPath(url);
  if (filmPath) return filmPath.ids[filmPath.ids.length - 1];
  // OPTIMIZATION: matchAll is slower. A simple regex match with global flag is faster.
  const matches = url.match(/\/(\d+)-/g);
  if (!matches || matches.length === 0) return NaN;

  // Extract numbers from the last match e.g., "/12345-" -> 12345
  const lastMatch = matches[matches.length - 1];
  return parseInt(lastMatch.replace(/\D/g, ''), 10);
}
