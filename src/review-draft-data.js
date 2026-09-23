/*
 * Pure data helpers for the "review draft autosave" feature.
 *
 * These functions are framework-free and DOM-free so they can be unit tested in
 * isolation (see tests/reviewDraftData.test.cjs). The DOM / localStorage
 * controller lives in review-draft.js and delegates here.
 */
import { getMovieIdFromUrl } from './utils.js';

/** Minimum normalized length below which we require an exact match to call a draft "published". */
const PUBLISH_MATCH_MIN_LENGTH = 15;

/**
 * Derive a stable, page-scoped draft id.
 *
 * Prefers ČSFD's own `data-tinymce-autosave-id` (e.g. "film-comment-953802-lang1"),
 * stripping the trailing language suffix so all languages of one review share a
 * single record. Falls back to the film/season id parsed from the URL, which
 * resolves to the same number ČSFD uses for the autosave id.
 *
 * @param {string} [autosaveId] - value of a textarea's data-tinymce-autosave-id
 * @param {string} [pathname] - location.pathname, used as a fallback
 * @returns {string|null} draft id like "film-comment-953802", or null if undeterminable
 */
export function deriveDraftId(autosaveId, pathname = '') {
  const raw = String(autosaveId || '').trim();
  if (raw) {
    return raw.replace(/-lang\d+$/i, '');
  }

  const movieId = getMovieIdFromUrl(pathname);
  return Number.isFinite(movieId) ? `film-comment-${movieId}` : null;
}

/**
 * Parse the language index from a review textarea name like "languages[3][text]".
 * @param {string} name
 * @returns {string|null} the numeric index as a string ("1"|"2"|"3"), or null
 */
export function parseLanguageIndex(name) {
  const match = String(name || '').match(/languages\[(\d+)\]/);
  return match ? match[1] : null;
}

/**
 * Collapse rich-text review HTML to a comparable plain-text signature:
 * decode the handful of entities ČSFD emits, drop tags, collapse whitespace,
 * lowercase. Used both for "is this draft empty" and "was this draft published"
 * comparisons.
 * @param {string} html
 * @returns {string}
 */
export function normalizeReviewText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>(?=\s*\S)/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Convert review HTML to plain text suitable for the clipboard (keeps line
 * breaks from block-level tags, drops markup and decodes basic entities).
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Does any language of this draft contain real text?
 * @param {Record<string, string>} languages - map of langIndex -> HTML
 * @returns {boolean}
 */
export function draftHasContent(languages) {
  if (!languages || typeof languages !== 'object') return false;
  return Object.values(languages).some((html) => normalizeReviewText(html).length > 0);
}

/**
 * Return the language index of the first non-empty language in priority order
 * (Czech → Slovak → English → whatever else is present), or null if all empty.
 * @param {Record<string, string>} languages
 * @returns {string|null}
 */
export function getPrimaryLanguageIndex(languages) {
  if (!languages || typeof languages !== 'object') return null;
  const order = ['1', '2', '3', ...Object.keys(languages)];
  for (const lang of order) {
    if (normalizeReviewText(languages[lang]).length > 0) return lang;
  }
  return null;
}

/**
 * Decide whether a draft has been published, by comparing the rendered review
 * text on the page against each saved language of the draft.
 *
 * For non-trivial drafts a containment match is enough (the page may wrap or
 * truncate). Very short drafts require exact equality to avoid false positives.
 *
 * @param {string} publishedText - text content of the user's review on the page
 * @param {Record<string, string>} languages - draft languages map
 * @returns {boolean}
 */
export function isDraftPublished(publishedText, languages) {
  const normalizedPublished = normalizeReviewText(publishedText);
  if (!normalizedPublished || !languages) return false;

  return Object.values(languages).some((html) => {
    const normalizedDraft = normalizeReviewText(html);
    if (!normalizedDraft) return false;

    if (normalizedDraft.length < PUBLISH_MATCH_MIN_LENGTH) {
      return normalizedPublished === normalizedDraft;
    }

    return (
      normalizedPublished === normalizedDraft ||
      normalizedPublished.includes(normalizedDraft) ||
      normalizedDraft.includes(normalizedPublished)
    );
  });
}

/**
 * Build the localStorage key for a draft id.
 * @param {string} prefix
 * @param {string} draftId
 * @returns {string}
 */
export function buildDraftStorageKey(prefix, draftId) {
  return `${prefix}${draftId}`;
}

/**
 * Czech relative-time label for "saved X ago" UI. Falls back to an absolute
 * clock time once the draft is older than a day.
 * @param {number} savedAt - epoch ms
 * @param {number} [now] - epoch ms (injectable for tests)
 * @returns {string}
 */
export function formatDraftAge(savedAt, now = Date.now()) {
  const diffMs = Math.max(0, now - Number(savedAt || 0));
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) return 'právě teď';
  if (diffSec < 60) return `před ${diffSec} s`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `před ${diffMin} min`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `před ${diffHour} h`;

  try {
    return new Date(Number(savedAt)).toLocaleString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Format an absolute clock time (HH:MM:SS) for the "saved at" status pill.
 * @param {number} savedAt - epoch ms
 * @returns {string}
 */
export function formatClockTime(savedAt) {
  try {
    return new Date(Number(savedAt)).toLocaleTimeString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}
