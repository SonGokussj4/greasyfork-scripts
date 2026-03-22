import {
  CSFD_CREATOR_ROLE_KEYWORDS,
  HOVER_PREVIEW_CREATOR_ENABLED_KEY,
  HOVER_PREVIEW_ENABLED_KEY,
  HOVER_PREVIEW_EXTERNAL_ENABLED_KEY,
  HOVER_PREVIEW_FILM_ENABLED_KEY,
  HOVER_PREVIEW_REVIEW_ENABLED_KEY,
  HOVER_PREVIEW_USER_ENABLED_KEY,
  getCsfdPathAliasPattern,
  getCsfdCreatorRoleLabel,
  getCsfdLocale,
  getCsfdPathSegment,
  getCsfdPathSegmentPattern,
  getCsfdUserProfileSubpathPattern,
  matchesCsfdTextVariant,
} from './config.js';
import { escapeHtml } from './utils.js';

const EMPTY_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const CREATOR_PATHS_PATTERN = getCsfdPathAliasPattern('creator');
const OVERVIEW_SEGMENTS_PATTERN = getCsfdPathSegmentPattern('overview');
const REVIEWS_SEGMENTS_PATTERN = getCsfdPathSegmentPattern('reviews');
const USER_PROFILE_SUBPATHS_PATTERN = getCsfdUserProfileSubpathPattern();

function createUrl(href) {
  try {
    return new URL(href, location.origin);
  } catch {
    return null;
  }
}

function isUserLinkInsideAccountDropdown(anchor) {
  return anchor instanceof Element && anchor.closest('.dropdown-content.main-menu') !== null;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCount(value) {
  const numericValue = Number.parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(numericValue) ? new Intl.NumberFormat('cs-CZ').format(numericValue) : normalizeText(value);
}

function resolveAssetUrl(url) {
  if (!url) return null;
  try {
    return new URL(url, location.origin).href;
  } catch {
    return url;
  }
}

function resolveUrlAgainst(url, baseHref) {
  if (!url) return null;
  try {
    return new URL(url, baseHref).href;
  } catch {
    return url;
  }
}

/**
 * Determines the CSFD locale of a document by checking the `<html lang>` attribute.
 * If the language cannot be determined from the document, it falls back to checking the hostname.
 *
 * @param {Document} doc - The document (or a document-like object)
 */
function getDocumentCsfdLocale(doc) {
  const documentLang = normalizeText(doc.documentElement?.lang || doc.body?.dataset?.lang).toLowerCase();
  if (documentLang.startsWith('sk')) return 'sk';
  if (documentLang.startsWith('cs')) return 'cz';

  const documentHostname = createUrl(doc.URL || doc.baseURI)?.hostname;
  return getCsfdLocale(documentHostname || location.hostname);
}

function findCreatorBlockByRole(doc, roleKey) {
  const keywords = CSFD_CREATOR_ROLE_KEYWORDS[roleKey] || [];

  return Array.from(doc.querySelectorAll('#creators > div')).find((block) =>
    keywords.includes(normalizeText(block.querySelector('h4')?.textContent).replace(/:$/, '')),
  );
}

function normalizeCreatorUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(new RegExp(String.raw`^\/(${CREATOR_PATHS_PATTERN})\/(\d+-[^/]+)`, 'i'));
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/${match[1]}/${match[2]}/${getCsfdPathSegment('overview', url.hostname)}/`;
  return url.toString();
}

function normalizeUserUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(/^\/uzivatel\/(\d+-[^/]+)/i);
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/uzivatel/${match[1]}/${getCsfdPathSegment('overview', url.hostname)}/`;
  return url.toString();
}

function getUserReviewsUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(/^\/uzivatel\/(\d+-[^/]+)/i);
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/uzivatel/${match[1]}/${getCsfdPathSegment('reviews', url.hostname)}/`;
  return url.toString();
}

function normalizeFilmUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(/^\/film\/(\d+-[^/]+)(?:\/(\d+-[^/]+))?/i);
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/film/${match[1]}/${match[2] ? `${match[2]}/` : ''}${getCsfdPathSegment('overview', url.hostname)}/`;
  return url.toString();
}

function normalizeReviewUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(
    new RegExp(`^\/film\/(\d+-[^/]+)(?:\/(\d+-[^/]+))?\/(${REVIEWS_SEGMENTS_PATTERN})\/?$`, 'i'),
  );
  const reviewId = url?.searchParams.get('review') || '';
  if (!url || !match || !/^\d+$/.test(reviewId)) return null;

  url.hash = '';
  url.search = '';
  url.searchParams.set('review', reviewId);
  url.pathname = `/film/${match[1]}/${match[2] ? `${match[2]}/` : ''}${getCsfdPathSegment('reviews', url.hostname)}/`;
  return url.toString();
}

/**
 * Normalizes a MyAnimeList character URL into a stable cache key URL.
 *
 * Example:
 * - `/character/233866/Klein_Moretti/pics?x=1` -> `/character/233866/Klein_Moretti`
 */
function normalizeMyAnimeListCharacterUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(/^\/character\/(\d+)(?:\/([^/?#]+))?/i);
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/character/${match[1]}${match[2] ? `/${match[2]}` : ''}`;
  return url.toString();
}

/**
 * Normalizes a MyAnimeList anime URL so direct detail links share one cache entry.
 */
function normalizeMyAnimeListAnimeUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(/^\/anime\/(\d+)(?:\/([^/?#]+))?/i);
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/anime/${match[1]}${match[2] ? `/${match[2]}` : ''}`;
  return url.toString();
}

/**
 * Normalizes an AniDB character URL so all supported links map to one canonical target.
 */
function normalizeAniDbCharacterUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(/^\/character\/(\d+)/i);
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/character/${match[1]}`;
  return url.toString();
}

/**
 * Normalizes an AniDB anime URL so nested hovers for related anime reuse one cache entry.
 */
function normalizeAniDbAnimeUrl(href) {
  const url = createUrl(href);
  const match = url?.pathname.match(/^\/anime\/(\d+)/i);
  if (!url || !match) return null;

  url.search = '';
  url.hash = '';
  url.pathname = `/anime/${match[1]}`;
  return url.toString();
}

function getCreatorEntityKey(url) {
  return (
    createUrl(url)?.pathname.match(new RegExp(String.raw`^\/(?:${CREATOR_PATHS_PATTERN})\/(\d+-[^/]+)`, 'i'))?.[1] ||
    null
  );
}

function getUserEntityKey(url) {
  return createUrl(url)?.pathname.match(/^\/uzivatel\/(\d+-[^/]+)/i)?.[1] || null;
}

function getFilmEntityKey(url) {
  const match = createUrl(url)?.pathname.match(/^\/film\/(\d+-[^/]+)(?:\/(\d+-[^/]+))?/i);
  if (!match) return null;
  return match[2] ? `${match[1]}__${match[2]}` : match[1];
}

function getReviewEntityKey(url) {
  const normalizedUrl = createUrl(url);
  const reviewId = normalizedUrl?.searchParams.get('review') || '';
  const filmEntityKey = getFilmEntityKey(url);
  if (!filmEntityKey || !/^\d+$/.test(reviewId)) return null;
  return `${filmEntityKey}__review__${reviewId}`;
}

/**
 * Extracts the MAL character id used for cache grouping and request deduplication.
 */
function getMyAnimeListCharacterEntityKey(url) {
  return createUrl(url)?.pathname.match(/^\/character\/(\d+)(?:\/[^/]+)?\/?$/i)?.[1] || null;
}

/**
 * Extracts the MAL anime id used for cache grouping and request deduplication.
 */
function getMyAnimeListAnimeEntityKey(url) {
  return createUrl(url)?.pathname.match(/^\/anime\/(\d+)(?:\/[^/]+)?\/?$/i)?.[1] || null;
}

/**
 * Extracts the AniDB character id used for cache grouping and request deduplication.
 */
function getAniDbCharacterEntityKey(url) {
  return createUrl(url)?.pathname.match(/^\/character\/(\d+)\/?$/i)?.[1] || null;
}

/**
 * Extracts the AniDB anime id used for cache grouping and request deduplication.
 */
function getAniDbAnimeEntityKey(url) {
  return createUrl(url)?.pathname.match(/^\/anime\/(\d+)\/?$/i)?.[1] || null;
}

function isCurrentFilmEntity(url) {
  if (!/^\/film\//i.test(location.pathname || '')) return false;
  return getFilmEntityKey(url) === getFilmEntityKey(location.href);
}

function isCurrentCreatorEntity(url) {
  if (!new RegExp(String.raw`^\/(?:${CREATOR_PATHS_PATTERN})\/`, 'i').test(location.pathname || '')) return false;
  return getCreatorEntityKey(url) === getCreatorEntityKey(location.href);
}

function isCurrentUserEntity(url) {
  if (!/^\/uzivatel\//i.test(location.pathname || '')) return false;
  return getUserEntityKey(url) === getUserEntityKey(location.href);
}

function isCurrentReviewEntity(url) {
  if (!/^\/film\//i.test(location.pathname || '')) return false;
  if (!new RegExp(`\/(${REVIEWS_SEGMENTS_PATTERN})\/?$`, 'i').test(location.pathname || '')) return false;
  return getReviewEntityKey(url) === getReviewEntityKey(location.href);
}

function cloneWithout(selectorList, element) {
  if (!element) return null;
  const clone = element.cloneNode(true);
  selectorList.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((node) => node.remove());
  });
  return normalizeText(clone.textContent);
}

function parseJsonLd(doc) {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || 'null');
      if (parsed && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore malformed embedded JSON-LD blocks.
    }
  }

  return null;
}

/**
 * Loads raw HTML for same-site and external hover previews.
 *
 * For external sites we prefer userscript requests because they bypass normal
 * page CORS limits. If that API is not available, we fall back to regular `fetch()`.
 */
async function requestHtml(url) {
  const gmRequest = globalThis.GM_xmlhttpRequest || globalThis.GM?.xmlHttpRequest;

  if (typeof gmRequest === 'function') {
    try {
      return await new Promise((resolve, reject) => {
        gmRequest({
          method: 'GET',
          url,
          onload: (response) => {
            if (response?.status >= 200 && response?.status < 400) {
              resolve(response.responseText || '');
              return;
            }

            reject(new Error(`Request failed with status ${response?.status || 'unknown'}`));
          },
          onerror: reject,
        });
      });
    } catch {
      // Fall back to fetch when a userscript request is unavailable.
    }
  }

  const response = await fetch(url);
  if (!response.ok) return null;

  return response.text();
}

/**
 * Convenience wrapper around `requestHtml()` that returns a parsed HTML document.
 */
async function requestHtmlDocument(url) {
  const html = await requestHtml(url);
  return html ? new DOMParser().parseFromString(html, 'text/html') : null;
}

function countCareerTitles(table) {
  return Array.from(table?.querySelectorAll('tr') || []).filter((row) => row.querySelector('td.name a.film-title-name'))
    .length;
}

function calculateAge(birthStr, deathStr) {
  const extractDate = (value) => {
    const match = String(value || '').match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
  };

  const birthDate = extractDate(birthStr);
  if (!birthDate) return null;

  const endDate = extractDate(deathStr) || new Date();
  let age = endDate.getFullYear() - birthDate.getFullYear();
  if (
    endDate.getMonth() < birthDate.getMonth() ||
    (endDate.getMonth() === birthDate.getMonth() && endDate.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

function renderImage(imageUrl, altText) {
  if (imageUrl) {
    return `<img class="cc-hover-preview-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText || '')}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${EMPTY_IMAGE_SRC}';this.classList.add('empty-image');" />`;
  }

  return `<img class="cc-hover-preview-image empty-image" src="${EMPTY_IMAGE_SRC}" alt="" referrerpolicy="no-referrer" />`;
}

function renderCardWithTop({ providerClass, topHtml = '', imageUrl, title, titleExtraHtml = '', metaHtml = '' }) {
  return `
    <div class="cc-hover-preview-card ${providerClass}">
      ${topHtml ? `<div class="cc-hover-preview-top">${topHtml}</div>` : ''}
      ${renderImage(imageUrl, title)}
      <div class="cc-hover-preview-title">
        <span>${escapeHtml(title)}</span>
        ${titleExtraHtml}
      </div>
      <div class="cc-hover-preview-meta" ${metaHtml ? '' : 'hidden'}>
        ${metaHtml}
      </div>
    </div>
  `;
}

function renderLine(text, className = '') {
  if (!text) return '';
  return `<div class="cc-hover-preview-line ${className}">${text}</div>`;
}

function renderLabelValue(label, value, className = '') {
  if (!value) return '';
  return renderLine(
    `<span class="cc-hover-preview-label-strong">${escapeHtml(label)}</span> ${escapeHtml(value)}`,
    className,
  );
}

function parseCreatorLinks(block, limit = Infinity) {
  return Array.from(block?.querySelectorAll('a') || [])
    .slice(0, limit)
    .map((link) => ({
      name: normalizeText(link.textContent),
      href: resolveAssetUrl(link.getAttribute('href')),
    }))
    .filter((person) => person.name && person.href);
}

function renderLinkedPeopleLine(label, people) {
  if (!Array.isArray(people) || people.length === 0) return '';

  const peopleHtml = people
    .map(
      (person) => `<a class="cc-hover-preview-link" href="${escapeHtml(person.href)}">${escapeHtml(person.name)}</a>`,
    )
    .join(', ');

  return renderLine(
    `<span class="cc-hover-preview-clamp-2"><span class="cc-hover-preview-label">${escapeHtml(label)}:</span> ${peopleHtml}</span>`,
  );
}

function getReviewExcerpt(text, maxLength = 320) {
  const normalized = normalizeText(text);
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/[\s,.!?;:-]+$/u, '')}...`;
}

function getReviewRatingValue(article) {
  const starsClassName = article?.querySelector('.star-rating .stars')?.className || '';
  const match = starsClassName.match(/\bstars-(\d)\b/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function renderReviewRating(rating) {
  if (!Number.isInteger(rating) || rating < 0) return '';

  const clampedRating = Math.max(0, Math.min(5, rating));
  return `
    <span class="cc-hover-preview-review-stars" aria-label="${escapeHtml(String(clampedRating))} z 5 hvězdiček">
      <span class="is-filled">${'★'.repeat(clampedRating)}</span><span class="is-empty">${'☆'.repeat(5 - clampedRating)}</span>
    </span>
  `;
}

function sanitizeReviewContent(contentNode, baseHref) {
  if (!contentNode) return '';

  const clone = contentNode.cloneNode(true);
  const allowedTags = new Set([
    'A',
    'B',
    'BLOCKQUOTE',
    'BR',
    'DIV',
    'EM',
    'I',
    'LI',
    'OL',
    'P',
    'SPAN',
    'STRONG',
    'UL',
  ]);

  Array.from(clone.querySelectorAll('*'))
    .reverse()
    .forEach((node) => {
      const tagName = node.tagName;

      if (tagName === 'A') {
        const href = resolveUrlAgainst(node.getAttribute('href'), baseHref);
        if (!href) {
          node.replaceWith(...node.childNodes);
          return;
        }

        Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
        node.setAttribute('href', href);
        node.className = 'cc-hover-preview-link';
        return;
      }

      if (allowedTags.has(tagName)) {
        Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
        return;
      }

      node.replaceWith(...node.childNodes);
    });

  return clone.innerHTML.trim();
}

export function parseCreatorPreviewDocument(doc) {
  const name = normalizeText(doc.querySelector('h1')?.textContent) || 'Tvůrce';
  const imageElement = doc.querySelector('.creator-profile figure img, .creator-profile-header figure img');
  let imageUrl = resolveAssetUrl(imageElement?.getAttribute('src'));

  if (imageUrl && (imageUrl.startsWith('data:image') || imageElement?.classList.contains('empty-image'))) {
    imageUrl = null;
  }

  const flagUrl = resolveAssetUrl(doc.querySelector('.creator-profile-details img.flag')?.getAttribute('src'));
  const details = Array.from(doc.querySelectorAll('.creator-profile-details p'));
  const birthElement = details.find((item) => /nar\.|born|naroden/i.test(item.textContent));
  const deathElement = details.find((item) => /zem\.|zom\.|died/i.test(item.textContent));
  const birthText = cloneWithout(['.info-place', '.info'], birthElement);
  const deathText = cloneWithout(['.info-place', '.info'], deathElement);

  const footer = doc.querySelector('.creator-profile-footer');
  const movieLink = footer?.querySelector('a.item-movie');
  const copyrightText = normalizeText(footer?.querySelector('.item-text')?.textContent);
  const fanclubCount = normalizeText(
    doc.querySelector('#snippet--fanclubCountDesktop, #snippet--fanclubCountMobile')?.textContent,
  ).replace(/[()]/g, '');
  const careerTables = Array.from(doc.querySelectorAll('.updated-box-table'));
  const moviesTable = careerTables.find(
    (table) => normalizeText(table.querySelector('thead th')?.textContent).toLowerCase() === 'filmy',
  );
  const seriesTable = careerTables.find(
    (table) => normalizeText(table.querySelector('thead th')?.textContent).toLowerCase() === 'seriály',
  );

  let photoSource = null;
  let photoType = null;

  if (movieLink) {
    photoSource = normalizeText(`${movieLink.textContent} ${movieLink.nextElementSibling?.textContent || ''}`);
    photoType = 'movie';
  } else if (copyrightText) {
    photoSource = copyrightText.replace(/^(?:photo|foto|copyright|\(c\)|©|:|-|\s)+/gi, '').trim();
    photoType = 'copyright';
  }

  return {
    name,
    imageUrl,
    flagUrl,
    birthText,
    deathText,
    photoSource,
    photoType,
    photoSourceHref: resolveAssetUrl(movieLink?.getAttribute('href')),
    fanclubCount,
    movieCount: countCareerTitles(moviesTable),
    seriesCount: countCareerTitles(seriesTable),
  };
}

export function parseUserPreviewDocument(doc) {
  const profile = doc.querySelector('.user-profile');
  if (!profile) return null;

  const imageUrl = resolveAssetUrl(
    profile.querySelector('.user-profile-header figure img, .user-profile-header img')?.src,
  );
  const name = normalizeText(profile.querySelector('.user-profile-header h1')?.textContent) || 'Uživatel';
  const contentParagraph = profile.querySelector('.user-profile-content p');
  const realName = normalizeText(contentParagraph?.querySelector('strong')?.textContent);

  const stats = Array.from(profile.querySelectorAll('.fans-box-mobile-count p'))
    .map((item) => ({
      label: normalizeText(
        Array.from(item.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(' '),
      ),
      value: normalizeText(item.querySelector('strong')?.textContent),
    }))
    .filter((item) => item.label || item.value);

  const fans = stats.find((item) => /^fanoušk/i.test(item.label));
  const points = stats.find((item) => /^bod/i.test(item.label));

  const footer = profile.querySelector('.user-profile-footer');
  const memberSince = normalizeText(
    Array.from(footer?.childNodes || [])
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' '),
  );
  const lastLogin = normalizeText(footer?.querySelector('.p-last-login')?.textContent);
  const reviewCount = normalizeText(
    Array.from(doc.querySelectorAll('.updated-box-header h2, .box-header h2'))
      .find((heading) => matchesCsfdTextVariant('reviewHeading', normalizeText(heading.textContent)))
      ?.querySelector('.count')?.textContent,
  ).replace(/[()]/g, '');

  return {
    name,
    imageUrl,
    realName,
    fans,
    points,
    memberSince,
    lastLogin,
    reviewCount,
  };
}

export function parseFilmPreviewDocument(doc) {
  const locale = getDocumentCsfdLocale(doc);
  const schemaData = parseJsonLd(doc);
  const title = normalizeText(doc.querySelector('h1')?.textContent) || 'Film';
  const imageUrl =
    resolveAssetUrl(doc.querySelector('.film-posters img, #poster img')?.getAttribute('src')) ||
    resolveAssetUrl(schemaData?.image);
  const rating = normalizeText(doc.querySelector('.film-rating-average')?.textContent);
  const genres = normalizeText(doc.querySelector('.genres')?.textContent);
  const origin = normalizeText(doc.querySelector('.origin')?.textContent);
  const ratingCount = schemaData?.aggregateRating?.ratingCount || null;
  const reviewCount = schemaData?.aggregateRating?.reviewCount || null;
  const actorsBlock = findCreatorBlockByRole(doc, 'actors');
  const actors = parseCreatorLinks(actorsBlock, 18);
  const directedByBlock = findCreatorBlockByRole(doc, 'directors');
  const directors = parseCreatorLinks(directedByBlock, 18);

  return {
    title,
    imageUrl,
    rating,
    ratingCount,
    reviewCount,
    genres,
    origin,
    actors,
    directors,
    locale,
    posters: imageUrl ? [{ imageUrl, label: title }] : [],
  };
}

/**
 * Reads the main content of a film review, along with some basic metadata about the review and its author.
 */
export function parseReviewPreviewDocument(doc, reviewUrl = location.href) {
  const normalizedUrl = createUrl(reviewUrl);
  const reviewId = normalizedUrl?.searchParams.get('review') || '';
  const articleId = /^\d+$/.test(reviewId) ? `review-${reviewId}` : '';
  const article =
    (articleId ? doc.getElementById(articleId) : null) ||
    doc.querySelector(`.tabs-review-content[data-highlight="${articleId}"] article[data-film-review]`) ||
    doc.querySelector('article[data-film-review].highlight') ||
    doc.querySelector('article[data-film-review]');

  if (!article) return null;

  const authorLink = article.querySelector(
    'h3.user-title a.user-title-name, .article-header-review-name .user-title-name',
  );
  const authorName = normalizeText(authorLink?.textContent) || 'Uživatel';
  const authorUrl = resolveAssetUrl(authorLink?.getAttribute('href'));
  const titleDateText = normalizeText(article.querySelector('[title*="Vloženo v "]')?.getAttribute('title')).replace(
    /^.*Vloženo v\s*/i,
    '',
  );
  const dateText = normalizeText(
    article.querySelector(
      '.review-date time, .review-date, .comment-date time, .comment-date, .header-right-info .info time, .header-right-info time',
    )?.textContent || titleDateText,
  ).replace(/^\((.*)\)$/, '$1');
  const reviewContentNode = article.querySelector(
    '[data-film-review-content], .article-review .comment, .comment[data-film-review-content]',
  );
  const reviewText = normalizeText(reviewContentNode?.textContent);
  const filmTitle = normalizeText(doc.querySelector('h1')?.textContent) || 'Recenze';
  const filmUrl = normalizeFilmUrl(reviewUrl);

  return {
    filmTitle,
    filmUrl,
    authorName,
    authorUrl,
    reviewId,
    dateText,
    rating: getReviewRatingValue(article),
    excerptText: getReviewExcerpt(reviewText),
    previewReviewHtml: sanitizeReviewContent(reviewContentNode, normalizedUrl?.href || reviewUrl),
    fullReviewHtml: sanitizeReviewContent(reviewContentNode, normalizedUrl?.href || reviewUrl),
  };
}

export function parseFilmPosterGalleryDocument(doc) {
  return Array.from(doc.querySelectorAll('.gallery-item .box.box-media.poster'))
    .map((item) => {
      const bestLink = item.querySelector('.cc-gallery-size-links a[href]');
      const imageUrl = resolveAssetUrl(
        bestLink?.getAttribute('href') || item.querySelector('picture img')?.getAttribute('src'),
      );
      const label = normalizeText(item.querySelector('.figcaption-poster-title h3')?.textContent);
      return imageUrl ? { imageUrl, label } : null;
    })
    .filter(Boolean);
}

/**
 * Reads the minimum data needed for a MAL character hover card.
 *
 * Current v1 behavior is intentionally simple: title + portrait image.
 */
export function parseMyAnimeListCharacterPreviewDocument(doc) {
  const imageUrl =
    resolveAssetUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')) ||
    resolveAssetUrl(
      doc.querySelector('#content img.portrait-225x350, #content a[href*="/pics"] img')?.getAttribute('src'),
    ) ||
    resolveAssetUrl(
      doc.querySelector('#content img.portrait-225x350, #content a[href*="/pics"] img')?.getAttribute('data-src'),
    );
  const title =
    normalizeText(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')) ||
    normalizeText(doc.querySelector('#content h1, #content h2')?.textContent) ||
    normalizeText(doc.querySelector('#content img[alt]')?.getAttribute('alt')) ||
    'Character';

  const animeographyTable = doc.querySelector('#content .character-anime + table');
  const animeography = Array.from(animeographyTable?.querySelectorAll('tr') || [])
    .map((row) => {
      const link = Array.from(row.querySelectorAll('a[href*="/anime/"]')).find((candidate) =>
        normalizeText(candidate.textContent),
      );
      const name = normalizeText(link?.textContent);
      const href = link?.href || resolveUrlAgainst(link?.getAttribute('href'), 'https://myanimelist.net');
      const role = normalizeText(row.querySelector('small')?.textContent);

      return name && href ? { name, href, role } : null;
    })
    .filter(Boolean)
    .slice(0, 5);

  return { title, imageUrl, animeography };
}

/**
 * Reads the main poster and a few compact stats for a MAL anime hover card.
 */
export function parseMyAnimeListAnimePreviewDocument(doc) {
  const imageUrl =
    resolveAssetUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')) ||
    resolveAssetUrl(doc.querySelector('#content td img[itemprop="image"], #content td img')?.getAttribute('src')) ||
    resolveAssetUrl(doc.querySelector('#content td img[itemprop="image"], #content td img')?.getAttribute('data-src'));
  const title =
    normalizeText(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')) ||
    normalizeText(doc.querySelector('#content h1, #content h2')?.textContent) ||
    normalizeText(doc.querySelector('#content img[itemprop="image"]')?.getAttribute('alt')) ||
    'Anime';
  const score =
    normalizeText(doc.querySelector('.score-label')?.textContent) ||
    normalizeText(doc.querySelector('[itemprop="ratingValue"]')?.textContent);
  const scoreCount =
    normalizeText(doc.querySelector('[itemprop="ratingCount"]')?.getAttribute('content')) ||
    normalizeText(doc.querySelector('.score[data-user]')?.getAttribute('data-user')).replace(/\s*users?$/i, '');

  const infoRows = Array.from(doc.querySelectorAll('#content .leftside .spaceit_pad'));
  const getInfoValue = (label) => {
    const row = infoRows.find(
      (item) => normalizeText(item.querySelector('.dark_text')?.textContent).replace(/:$/, '') === label,
    );
    if (!row) return '';

    const clone = row.cloneNode(true);
    clone.querySelectorAll('.dark_text').forEach((node) => node.remove());
    return normalizeText(clone.textContent).replace(/^:\s*/, '');
  };

  return {
    title,
    imageUrl,
    score,
    scoreCount,
    episodes: getInfoValue('Episodes'),
    type: getInfoValue('Type'),
    aired: getInfoValue('Aired'),
  };
}

/**
 * Reads the minimum data needed for an AniDB character hover card.
 *
 * We prefer `og:image` when present because it is usually the most stable image source.
 */
export function parseAniDbCharacterPreviewDocument(doc) {
  const imageUrl =
    resolveAssetUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')) ||
    resolveAssetUrl(
      doc
        .querySelector('.g_section.info picture img[itemprop="image"], .g_section.info picture img')
        ?.getAttribute('src'),
    );
  const title =
    normalizeText(doc.querySelector('.mainname [itemprop="name"]')?.textContent) ||
    normalizeText(doc.querySelector('h1')?.textContent).replace(/^Character:\s*/i, '') ||
    normalizeText(doc.querySelector('img[itemprop="image"]')?.getAttribute('alt')) ||
    'Character';
  const relatedAnime = Array.from(
    doc.querySelectorAll(
      '#tab_main_2_1_pane table.animelist tbody tr, .pane.anime_appearance table.animelist tbody tr',
    ),
  )
    .map((row) => {
      const link = row.querySelector('td.name.anime a[href^="/anime/"]');
      const name = normalizeText(link?.textContent);
      const href = resolveUrlAgainst(link?.getAttribute('href'), 'https://anidb.net');
      const rating = normalizeText(row.querySelector('td.rating')?.childNodes?.[0]?.textContent);

      return name && href
        ? {
            name,
            href,
            rating,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 4);

  return { title, imageUrl, relatedAnime };
}

/**
 * Reads the minimum data needed for an AniDB anime hover card.
 *
 * Current v1 shows poster, title, rating and a short year/type summary.
 */
export function parseAniDbAnimePreviewDocument(doc) {
  const imageUrl =
    resolveAssetUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')) ||
    resolveAssetUrl(
      doc
        .querySelector('.g_section.info picture img[itemprop="image"], .g_section.info picture img')
        ?.getAttribute('src'),
    );
  const title =
    normalizeText(doc.querySelector('.romaji [itemprop="name"]')?.textContent) ||
    normalizeText(doc.querySelector('h1')?.textContent).replace(/^Anime:\s*/i, '') ||
    normalizeText(doc.querySelector('img[itemprop="image"]')?.getAttribute('alt')) ||
    'Anime';
  const type = normalizeText(doc.querySelector('tr.type td.value')?.textContent).replace(/\s+/g, ' ');
  const year = normalizeText(doc.querySelector('tr.year td.value')?.textContent).replace(/\s+/g, ' ');
  const rating = normalizeText(doc.querySelector('tr.rating .value .value, tr.rating td.value .value')?.textContent);

  return {
    title,
    imageUrl,
    rating,
    type,
    year,
  };
}

function getFilmPosterGalleryUrl(url) {
  const parsed = createUrl(url);
  const match = parsed?.pathname.match(/^\/film\/(\d+-[^/]+)(?:\/(\d+-[^/]+))?/i);
  if (!parsed || !match) return null;

  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = `/film/${match[1]}/${match[2] ? `${match[2]}/` : ''}galerie/plakaty/`;
  return parsed.toString();
}

async function fetchFilmPosterGallery(url) {
  const galleryUrl = getFilmPosterGalleryUrl(url);
  if (!galleryUrl) return [];

  try {
    const galleryResponse = await fetch(galleryUrl);
    if (!galleryResponse.ok) return [];

    const galleryHtml = await galleryResponse.text();
    const galleryDocument = new DOMParser().parseFromString(galleryHtml, 'text/html');
    return parseFilmPosterGalleryDocument(galleryDocument);
  } catch {
    return [];
  }
}

function renderCreatorPreview(data) {
  const age = calculateAge(data.birthText, data.deathText);

  let lifeHtml = '';
  const birthDate = data.birthText?.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4})/)?.[1]?.replace(/\s/g, '');
  const deathDate = data.deathText?.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4})/)?.[1]?.replace(/\s/g, '');

  if (data.deathText && birthDate) {
    lifeHtml = [
      renderLine(`nar. ${escapeHtml(birthDate)} → ${escapeHtml(deathDate || '?')}`, 'is-primary is-center'),
      age ? renderLine(`(${escapeHtml(String(age))} let)`, 'is-center') : '',
    ].join('');
  } else if (data.birthText) {
    lifeHtml = renderLine(
      `${escapeHtml(data.birthText)}${!data.deathText && age ? ` <span class="cc-hover-preview-inline-note">(${escapeHtml(String(age))} let)</span>` : ''}`,
      'is-primary',
    );
  }

  const photoHtml = data.photoSource
    ? renderLine(
        data.photoType === 'movie' && data.photoSourceHref
          ? `<a class="cc-hover-preview-link cc-hover-preview-photo-source" href="${escapeHtml(data.photoSourceHref)}">${escapeHtml(data.photoSource)}</a>`
          : `<span class="cc-hover-preview-photo-source">${escapeHtml(data.photoSource)}</span>`,
        `is-photo ${data.photoType === 'movie' ? 'is-movie' : 'is-copyright'}`,
      )
    : '';

  const topHtml =
    data.movieCount || data.seriesCount
      ? `
      <div class="cc-hover-preview-stats">
        <div class="cc-hover-preview-stat is-primary">
          <span class="cc-hover-preview-stat-value">${escapeHtml(formatCount(data.movieCount || '0'))}</span>
          <span class="cc-hover-preview-stat-label">filmů</span>
        </div>
        <div class="cc-hover-preview-stat is-secondary">
          <span class="cc-hover-preview-stat-value">${escapeHtml(formatCount(data.seriesCount || '0'))}</span>
          <span class="cc-hover-preview-stat-label">seriálů</span>
        </div>
      </div>
    `
      : data.fanclubCount
        ? `
      <div class="cc-hover-preview-stats">
        <div class="cc-hover-preview-stat is-primary is-wide">
          <span class="cc-hover-preview-stat-value">${escapeHtml(formatCount(data.fanclubCount))}</span>
          <span class="cc-hover-preview-stat-label">fanoušků</span>
        </div>
      </div>
    `
        : '';

  return renderCardWithTop({
    providerClass: 'is-creator',
    topHtml,
    imageUrl: data.imageUrl,
    title: data.name,
    titleExtraHtml: data.flagUrl
      ? `<img class="cc-hover-preview-title-flag" src="${escapeHtml(data.flagUrl)}" alt="" />`
      : '',
    metaHtml: `${lifeHtml}${photoHtml}`,
  });
}

function renderUserPreview(data) {
  const topHtml =
    data.points?.value || data.fans?.value
      ? `
      <div class="cc-hover-preview-stats">
        <div class="cc-hover-preview-stat is-primary">
          <span class="cc-hover-preview-stat-value">${escapeHtml(formatCount(data.points?.value || '0'))}</span>
          <span class="cc-hover-preview-stat-label">bodů</span>
        </div>
        <div class="cc-hover-preview-stat is-secondary">
          <span class="cc-hover-preview-stat-value">${escapeHtml(formatCount(data.fans?.value || '0'))}</span>
          <span class="cc-hover-preview-stat-label">fanoušků</span>
        </div>
      </div>
    `
      : '';

  const lines = [
    data.realName ? renderLine(escapeHtml(data.realName), 'is-strong') : '',
    data.lastLogin
      ? renderLabelValue('Viděn', data.lastLogin.replace(/^Poslední\s+přihlášení\s*/i, ''), 'is-muted')
      : '',
    data.lastLogin && (data.memberSince || data.reviewCount)
      ? '<div class="cc-hover-preview-divider is-subtle"></div>'
      : '',
    data.memberSince
      ? renderLabelValue('Na ČSFD od', data.memberSince.replace(/^Na\s+ČSFD\s+od\s*/i, ''), 'is-muted')
      : '',
    data.reviewCount ? renderLabelValue('Recenzí', formatCount(data.reviewCount), 'is-muted') : '',
  ].join('');

  return renderCardWithTop({
    providerClass: 'is-user',
    topHtml,
    imageUrl: data.imageUrl,
    title: data.name,
    metaHtml: lines,
  });
}

function renderFilmPreview(data) {
  const directorsLine = renderLinkedPeopleLine(getCsfdCreatorRoleLabel('directors', data.locale), data.directors);
  const actorsLine = renderLinkedPeopleLine(getCsfdCreatorRoleLabel('actors', data.locale), data.actors);

  const topHtml = [
    data.rating || data.ratingCount
      ? renderLine(
          [
            data.rating ? escapeHtml(data.rating) : '',
            data.ratingCount
              ? `<span class="cc-hover-preview-inline-note">(${escapeHtml(formatCount(data.ratingCount))})</span>`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
          'is-rating',
        )
      : '',
    data.reviewCount ? renderLine(`${escapeHtml(formatCount(data.reviewCount))} recenzí`, 'is-muted is-center') : '',
  ].join('');

  const lines = [
    data.genres ? renderLine(escapeHtml(data.genres), 'is-primary') : '',
    data.origin ? renderLine(escapeHtml(data.origin), 'is-muted') : '',
    directorsLine || actorsLine ? '<div class="cc-hover-preview-divider"></div>' : '',
    directorsLine,
    actorsLine,
  ].join('');

  return renderCardWithTop({
    providerClass: 'is-film',
    topHtml,
    imageUrl: data.posters?.[0]?.imageUrl || data.imageUrl,
    title: data.title,
    titleExtraHtml:
      Array.isArray(data.posters) && data.posters.length > 1
        ? `
          <button type="button" class="cc-hover-preview-poster-nav is-prev" data-cc-hover-poster-dir="-1" aria-label="Předchozí plakát"><i class="icon icon-arrow-left"></i></button>
          <span class="cc-hover-preview-poster-index">1/${escapeHtml(String(data.posters.length))}</span>
          <button type="button" class="cc-hover-preview-poster-nav is-next" data-cc-hover-poster-dir="1" aria-label="Další plakát"><i class="icon icon-arrow-right"></i></button>
        `
        : '',
    metaHtml: lines,
  });
}

function renderReviewPreview(data) {
  const authorHtml = data.authorUrl
    ? `<a class="cc-hover-preview-link" href="${escapeHtml(data.authorUrl)}">${escapeHtml(data.authorName)}</a>`
    : escapeHtml(data.authorName || 'Uživatel');
  const isDeferred = Boolean(data.deferredLoaded);
  const bodyHtml = isDeferred
    ? data.fullReviewHtml || data.previewReviewHtml || escapeHtml(data.excerptText || '')
    : data.previewReviewHtml || data.fullReviewHtml || escapeHtml(data.excerptText || '');
  const bodyClassName = isDeferred ? 'is-full' : 'is-compact';

  return `
    <div class="cc-hover-preview-card is-review ${isDeferred ? 'is-expanded' : ''}">
      <div class="cc-hover-preview-title">
        ${data.filmUrl ? `<a class="cc-hover-preview-link" href="${escapeHtml(data.filmUrl)}">${escapeHtml(data.filmTitle || 'Recenze')}</a>` : `<span>${escapeHtml(data.filmTitle || 'Recenze')}</span>`}
      </div>
      <div class="cc-hover-preview-meta">
        <div class="cc-hover-preview-review-header">
          <div class="cc-hover-preview-review-author-wrap">
            <span class="cc-hover-preview-line is-primary">${authorHtml}</span>
            ${renderReviewRating(data.rating)}
          </div>
          ${data.dateText ? `<span class="cc-hover-preview-line is-muted cc-hover-preview-review-date">${escapeHtml(data.dateText)}</span>` : ''}
        </div>
        <div class="cc-hover-preview-divider"></div>
        <div class="cc-hover-preview-review-body ${bodyClassName}">${bodyHtml}</div>
        ${!isDeferred && data.fullReviewHtml ? renderLine('CTRL pro celou recenzi', 'is-muted is-small is-center') : ''}
      </div>
    </div>
  `;
}

function renderMyAnimeListCharacterPreview(data) {
  const animeographyHtml = Array.isArray(data.animeography)
    ? data.animeography
        .map((item) =>
          renderLine(
            `<a class="cc-hover-preview-link" href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>${item.role ? ` <span class="cc-hover-preview-inline-note">(${escapeHtml(item.role)})</span>` : ''}`,
            'is-muted',
          ),
        )
        .join('')
    : '';

  return renderCardWithTop({
    providerClass: 'is-external-character is-myanimelist-character',
    topHtml: `
      <div class="cc-hover-preview-stats">
        <div class="cc-hover-preview-stat is-primary is-wide">
          <span class="cc-hover-preview-stat-label">myanimelist.net</span>
        </div>
      </div>
    `,
    imageUrl: data.imageUrl,
    title: data.title || 'Character',
    metaHtml: animeographyHtml ? `<div class="cc-hover-preview-divider"></div>${animeographyHtml}` : '',
  });
}

function renderAniDbCharacterPreview(data) {
  const relatedAnimeHtml = Array.isArray(data.relatedAnime)
    ? data.relatedAnime
        .map((item) => {
          const ratingSuffix = item.rating ? ` - ${escapeHtml(item.rating)}/10` : '';
          return renderLine(
            `<a class="cc-hover-preview-link" href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>${ratingSuffix}`,
            'is-muted',
          );
        })
        .join('')
    : '';

  return renderCardWithTop({
    providerClass: 'is-external-character is-anidb-character',
    topHtml: `
      <div class="cc-hover-preview-stats">
        <div class="cc-hover-preview-stat is-primary is-wide">
          <span class="cc-hover-preview-stat-label">anidb.net</span>
        </div>
      </div>
    `,
    imageUrl: data.imageUrl,
    title: data.title || 'Character',
    metaHtml: relatedAnimeHtml ? `<div class="cc-hover-preview-divider"></div>${relatedAnimeHtml}` : '',
  });
}

function renderAniDbAnimePreview(data) {
  const topHtml = data.rating ? renderLine(`${escapeHtml(data.rating)}/10`, 'is-rating') : '';
  const metaHtml = [
    data.year ? renderLine(escapeHtml(data.year), 'is-muted') : '',
    data.type ? renderLine(escapeHtml(data.type), 'is-primary') : '',
  ].join('');

  return renderCardWithTop({
    providerClass: 'is-external-anime is-anidb-anime',
    topHtml,
    imageUrl: data.imageUrl,
    title: data.title || 'Anime',
    metaHtml,
  });
}

function renderMyAnimeListAnimePreview(data) {
  const topHtml = data.score
    ? renderLine(
        [
          `${escapeHtml(data.score)}/10`,
          data.scoreCount
            ? `<span class="cc-hover-preview-inline-note">(${escapeHtml(formatCount(data.scoreCount))})</span>`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        'is-rating',
      )
    : '';
  const metaHtml = [
    data.episodes ? renderLabelValue('Episodes', data.episodes, 'is-muted') : '',
    data.type ? renderLabelValue('Type', data.type, 'is-primary') : '',
    data.aired ? renderLabelValue('Aired', data.aired, 'is-muted') : '',
  ].join('');

  return renderCardWithTop({
    providerClass: 'is-external-anime is-myanimelist-anime',
    topHtml,
    imageUrl: data.imageUrl,
    title: data.title || 'Anime',
    metaHtml,
  });
}

const EXTERNAL_HOVER_PREVIEW_SETTINGS = {
  settingsId: 'cc-hover-preview-external',
  settingsLabel: 'Náhledy externích odkazů',
  settingsInfoIcon: {
    url: 'https://i.imgur.com/wsMMjOo.png',
    text: 'Zobrazí náhledy externích odkazů. Aktuálně podporuje:\n - 🟢 AniDB a MyAnimeList\n - 🔴 Wiki, Steam\nCTRL pro ukotvení.\n\n👉 Klikni pro ukázku',
  },
};

export const HOVER_PREVIEW_PROVIDERS = [
  // =====================================
  // Internal providers for CSFD entities
  // =====================================
  {
    id: 'creator',
    storageKey: HOVER_PREVIEW_CREATOR_ENABLED_KEY,
    settingsId: 'cc-hover-preview-creators',
    settingsLabel: 'Náhledy csfd tvůrců',
    settingsInfoIcon: {
      url: 'https://i.imgur.com/oX5vYjZ.png',
      text: 'Zobrazí fotku a základní informace o herci nebo tvůrci.\nCTRL pro ukotvení.\n\n👉 Klikni pro ukázku',
    },
    matches(anchor) {
      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(
        url &&
        !url.search &&
        !url.hash &&
        !isCurrentCreatorEntity(url) &&
        new RegExp(
          String.raw`^\/(${CREATOR_PATHS_PATTERN})\/\d+-[^/]+(?:\/(?:${OVERVIEW_SEGMENTS_PATTERN}))?\/?$`,
          'i',
        ).test(url.pathname || ''),
      );
    },
    normalizeUrl: normalizeCreatorUrl,
    getEntityKey: getCreatorEntityKey,
    parseDocument: parseCreatorPreviewDocument,
    render: renderCreatorPreview,
  },
  {
    id: 'user',
    storageKey: HOVER_PREVIEW_USER_ENABLED_KEY,
    settingsId: 'cc-hover-preview-users',
    settingsLabel: 'Náhledy csfd uživatelů',
    settingsInfoIcon: {
      url: 'https://i.imgur.com/jg6bUCM.png',
      text: 'Zobrazí avatar a stručné informace o uživateli ČSFD.\nCTRL pro ukotvení.\n\n👉 Klikni pro ukázku',
    },
    matches(anchor) {
      if (isUserLinkInsideAccountDropdown(anchor)) {
        return false;
      }

      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(
        url &&
        !url.search &&
        !url.hash &&
        !isCurrentUserEntity(url) &&
        new RegExp(
          String.raw`^\/uzivatel\/\d+-[^/]+(?:\/(?:${USER_PROFILE_SUBPATHS_PATTERN})|\/oblibene(?:\/[^/]+)*)?\/?$`,
          'i',
        ).test(url.pathname || ''),
      );
    },
    normalizeUrl: normalizeUserUrl,
    getEntityKey: getUserEntityKey,
    async fetchData({ url }) {
      const response = await fetch(getUserReviewsUrl(url) || url);
      if (!response.ok) return null;

      const html = await response.text();
      const documentNode = new DOMParser().parseFromString(html, 'text/html');
      return parseUserPreviewDocument(documentNode);
    },
    parseDocument: parseUserPreviewDocument,
    render: renderUserPreview,
  },
  {
    id: 'review',
    storageKey: HOVER_PREVIEW_REVIEW_ENABLED_KEY,
    settingsId: 'cc-hover-preview-reviews',
    settingsLabel: 'Náhledy csfd recenzí',
    settingsInfoIcon: {
      url: 'https://i.imgur.com/aejN8f7.png',
      text: 'Zobrazí autora, hodnocení, datum a ukázku z konkrétní recenze ČSFD. CTRL ukotví náhled a rozbalí celou recenzi.',
    },
    matches(anchor) {
      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(
        url &&
        /^\/film\//i.test(url.pathname || '') &&
        new RegExp(`\/(${REVIEWS_SEGMENTS_PATTERN})\/?$`, 'i').test(url.pathname || '') &&
        /^\d+$/.test(url.searchParams.get('review') || '') &&
        !isCurrentReviewEntity(url),
      );
    },
    normalizeUrl: normalizeReviewUrl,
    getEntityKey: getReviewEntityKey,
    async fetchData({ url }) {
      const response = await fetch(url);
      if (!response.ok) return null;

      const html = await response.text();
      const detailDocument = new DOMParser().parseFromString(html, 'text/html');
      return parseReviewPreviewDocument(detailDocument, url);
    },
    async loadDeferredData({ data }) {
      return data;
    },
    parseDocument: parseReviewPreviewDocument,
    render: renderReviewPreview,
  },
  {
    id: 'film',
    storageKey: HOVER_PREVIEW_FILM_ENABLED_KEY,
    settingsId: 'cc-hover-preview-films',
    settingsLabel: 'Náhledy csfd filmů / seriálů / epizod',
    settingsInfoIcon: {
      url: 'https://i.imgur.com/aejN8f7.png',
      text: 'Zobrazí plakát a stručné informace o filmu, seriálu nebo epizodě.\nCTRL pro ukotvení.\n\n👉 Klikni pro ukázku',
    },
    matches(anchor) {
      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(url && /^\/film\//i.test(url.pathname || '') && !isCurrentFilmEntity(url));
    },
    normalizeUrl: normalizeFilmUrl,
    getEntityKey: getFilmEntityKey,
    async fetchData({ url }) {
      const response = await fetch(url);
      if (!response.ok) return null;

      const html = await response.text();
      const detailDocument = new DOMParser().parseFromString(html, 'text/html');
      return parseFilmPreviewDocument(detailDocument);
    },
    async loadDeferredData({ url, data }) {
      if (!data || (Array.isArray(data.posters) && data.posters.length > 1)) {
        return data;
      }

      const posters = await fetchFilmPosterGallery(url);
      if (posters.length === 0) return data;

      return {
        ...data,
        posters,
      };
    },
    parseDocument: parseFilmPreviewDocument,
    render: renderFilmPreview,
  },
  {
    id: 'myanimelist-character',
    storageKey: HOVER_PREVIEW_EXTERNAL_ENABLED_KEY,
    ...EXTERNAL_HOVER_PREVIEW_SETTINGS,
    matches(anchor) {
      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(
        url &&
        /^([^.]+\.)?myanimelist\.net$/i.test(url.hostname || '') &&
        /^\/character\/\d+(?:\/[^/?#]+)?\/?$/i.test(url.pathname || ''),
      );
    },
    normalizeUrl: normalizeMyAnimeListCharacterUrl,
    getEntityKey: getMyAnimeListCharacterEntityKey,
    async fetchData({ url }) {
      const documentNode = await requestHtmlDocument(url);
      return documentNode ? parseMyAnimeListCharacterPreviewDocument(documentNode) : null;
    },
    parseDocument: parseMyAnimeListCharacterPreviewDocument,
    render: renderMyAnimeListCharacterPreview,
  },
  {
    id: 'myanimelist-anime',
    storageKey: HOVER_PREVIEW_EXTERNAL_ENABLED_KEY,
    ...EXTERNAL_HOVER_PREVIEW_SETTINGS,
    matches(anchor) {
      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(
        url &&
        /^([^.]+\.)?myanimelist\.net$/i.test(url.hostname || '') &&
        /^\/anime\/\d+(?:\/[^/?#]+)?\/?$/i.test(url.pathname || ''),
      );
    },
    normalizeUrl: normalizeMyAnimeListAnimeUrl,
    getEntityKey: getMyAnimeListAnimeEntityKey,
    async fetchData({ url }) {
      const documentNode = await requestHtmlDocument(url);
      return documentNode ? parseMyAnimeListAnimePreviewDocument(documentNode) : null;
    },
    parseDocument: parseMyAnimeListAnimePreviewDocument,
    render: renderMyAnimeListAnimePreview,
  },
  {
    id: 'anidb-character',
    storageKey: HOVER_PREVIEW_EXTERNAL_ENABLED_KEY,
    ...EXTERNAL_HOVER_PREVIEW_SETTINGS,
    matches(anchor) {
      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(
        url && /^([^.]+\.)?anidb\.net$/i.test(url.hostname || '') && /^\/character\/\d+\/?$/i.test(url.pathname || ''),
      );
    },
    normalizeUrl: normalizeAniDbCharacterUrl,
    getEntityKey: getAniDbCharacterEntityKey,
    async fetchData({ url }) {
      const documentNode = await requestHtmlDocument(url);
      return documentNode ? parseAniDbCharacterPreviewDocument(documentNode) : null;
    },
    parseDocument: parseAniDbCharacterPreviewDocument,
    render: renderAniDbCharacterPreview,
  },
  {
    id: 'anidb-anime',
    storageKey: HOVER_PREVIEW_EXTERNAL_ENABLED_KEY,
    ...EXTERNAL_HOVER_PREVIEW_SETTINGS,
    matches(anchor) {
      const url = createUrl(anchor.getAttribute('href') || anchor.href || '');
      return Boolean(
        url && /^([^.]+\.)?anidb\.net$/i.test(url.hostname || '') && /^\/anime\/\d+\/?$/i.test(url.pathname || ''),
      );
    },
    normalizeUrl: normalizeAniDbAnimeUrl,
    getEntityKey: getAniDbAnimeEntityKey,
    async fetchData({ url }) {
      const documentNode = await requestHtmlDocument(url);
      return documentNode ? parseAniDbAnimePreviewDocument(documentNode) : null;
    },
    parseDocument: parseAniDbAnimePreviewDocument,
    render: renderAniDbAnimePreview,
  },
];

export function getHoverPreviewSettingsItems() {
  const settingsItems = new Map();

  HOVER_PREVIEW_PROVIDERS.filter((provider) => provider.settingsId).forEach((provider) => {
    if (settingsItems.has(provider.settingsId)) {
      return;
    }

    settingsItems.set(provider.settingsId, {
      type: 'toggle',
      id: provider.settingsId,
      storageKey: provider.storageKey,
      defaultValue: true,
      label: provider.settingsLabel,
      tooltip: '',
      infoIcon: provider.settingsInfoIcon,
      callback: 'updateHoverPreviewUI',
    });
  });

  return Array.from(settingsItems.values());
}
