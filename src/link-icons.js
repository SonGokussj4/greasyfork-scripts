import {
  getCsfdPathAliasPattern,
  getCsfdPathSegmentPattern,
  LINK_ICONS_ANIDB_ENABLED_KEY,
  LINK_ICONS_CREATOR_ENABLED_KEY,
  LINK_ICONS_FILM_ENABLED_KEY,
  LINK_ICONS_MAL_ENABLED_KEY,
  LINK_ICONS_REVIEW_ENABLED_KEY,
  LINK_ICONS_STEAM_ENABLED_KEY,
  LINK_ICONS_USER_ENABLED_KEY,
  LINK_ICONS_WIKIPEDIA_ENABLED_KEY,
  LINK_ICONS_UPDATED_EVENT,
  LINK_ICONS_YOUTUBE_ENABLED_KEY,
} from './config.js';

const CREATOR_PATHS_PATTERN = getCsfdPathAliasPattern('creator');
const REVIEWS_SEGMENTS_PATTERN = getCsfdPathSegmentPattern('reviews');

const FILM_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="17" height="17" rx="4" fill="#b12417" />
    <rect x="4.7" y="5.2" width="9.6" height="8.6" rx="1.4" fill="#fff2cf" />
    <path d="M8.1 7.1 11.95 9.5 8.1 11.9V7.1Z" fill="#b12417" />
    <rect x="2.3" y="3.1" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
    <rect x="2.3" y="6.4" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
    <rect x="2.3" y="9.7" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
    <rect x="2.3" y="13" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
    <rect x="15.35" y="3.1" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
    <rect x="15.35" y="6.4" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
    <rect x="15.35" y="9.7" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
    <rect x="15.35" y="13" width="1.35" height="2.1" rx="0.45" fill="#fff2cf" />
  </svg>
`;

const REVIEW_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="0.65" y="0.65" width="17.7" height="17.7" rx="4.4" fill="#fcf1f1" stroke="#ddb6b6" stroke-width=".35" />
    <path d="M4.55 2.95h1.1v13.1h-1.1c-.43 0-.78-.35-.78-.78V3.73c0-.43.35-.78.78-.78Z" fill="#cfab77" />
    <path d="M5.65 3.15h8.3c.68 0 1.22.54 1.22 1.22v10.26c0 .67-.54 1.22-1.22 1.22h-8.3Z" fill="#f5e2bc" />
    <path d="M6.35 4.25h7.42c.42 0 .75.33.75.75v8.92c0 .42-.33.75-.75.75H6.35Z" fill="#f9ead0" />
    <path d="M7.05 6.2h6.15" stroke="#785b39" stroke-width=".95" stroke-linecap="round" />
    <path d="M7.05 8.6h6.15" stroke="#785b39" stroke-width=".95" stroke-linecap="round" />
    <path d="M7.05 11h3.9" stroke="#785b39" stroke-width=".95" stroke-linecap="round" />
    <rect x="11.55" y="10.55" width="2.5" height="2.5" rx=".5" fill="#c99750" />
    <path d="M12.3 11.4h1M12.8 10.9v1" stroke="#fff9ee" stroke-width=".72" stroke-linecap="round" />
  </svg>
`;

const ANIDB_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect width="19" height="19" fill="#2c3246" fill-opacity="0.95" rx="4" />
    <text x="9.5" y="7.0" font-family="Arial, sans-serif" font-size="7.8" font-weight="900" fill="#cdcdcd" text-anchor="middle" letter-spacing="-0.84">ani</text>
    <text x="9.5" y="15.7" font-family="Arial, sans-serif" font-size="9.15" font-weight="900" fill="#dfab5c" text-anchor="middle" letter-spacing="-0.82">DB</text>
  </svg>
`;

const CREATOR_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="17" height="17" rx="4" fill="#8f2414" />
    <circle cx="8.15" cy="7" r="2.35" fill="#fff1d4" />
    <path d="M4.7 14c.34-2.14 1.86-3.48 3.45-3.48S11.27 11.86 11.6 14H4.7Z" fill="#fff1d4" />
    <rect x="11.9" y="4.2" width="4.2" height="6.1" rx="0.9" fill="#fff1d4" />
    <path d="M13.3 6.15 15 7.25 13.3 8.35V6.15Z" fill="#8f2414" />
    <rect x="12.2" y="5.05" width=".55" height="1" rx=".2" fill="#8f2414" />
    <rect x="12.2" y="6.55" width=".55" height="1" rx=".2" fill="#8f2414" />
    <rect x="15.25" y="5.05" width=".55" height="1" rx=".2" fill="#8f2414" />
    <rect x="15.25" y="6.55" width=".55" height="1" rx=".2" fill="#8f2414" />
  </svg>
`;

const USER_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="17" height="17" rx="4" fill="#b12417" />
    <circle cx="9.5" cy="6.9" r="2.55" fill="#fff1d4" />
    <path d="M5 14c.42-2.43 2.2-4.02 4.5-4.02 2.3 0 4.08 1.59 4.5 4.02H5Z" fill="#fff1d4" />
  </svg>
`;

const YOUTUBE_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="cc-youtube-icon-gradient" x1="1" y1="1" x2="18" y2="18" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#f04b34" />
        <stop offset="1" stop-color="#c91f12" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="17" height="17" rx="4" fill="url(#cc-youtube-icon-gradient)" />
    <path d="M6.85 5.65 13.35 9.5 6.85 13.35V5.65Z" fill="#ffffff" />
  </svg>
`;

const STEAM_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="cc-steam-icon-gradient" x1="3.2" y1="2.3" x2="15.6" y2="16.8" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#173c62" />
        <stop offset="0.58" stop-color="#174f7e" />
        <stop offset="1" stop-color="#1b79aa" />
      </linearGradient>
    </defs>
    <circle cx="9.5" cy="9.5" r="8.5" fill="url(#cc-steam-icon-gradient)" />
    <circle cx="12.95" cy="6.2" r="2.55" stroke="#ffffff" stroke-width="1.1" fill="none" />
    <circle cx="12.95" cy="6.2" r="1.15" fill="#ffffff" />
    <circle cx="6.1" cy="12.85" r="1.55" fill="#ffffff" />
    <path d="M7.15 12.25 10.35 10.15a3.66 3.66 0 0 1-.05-.6c0-.22.02-.43.06-.63L7.55 10.3a2.7 2.7 0 0 0-1.45-.43c-.36 0-.7.07-1.01.2l1.06.44a2.24 2.24 0 0 1 1 2.98l-.33.76c.15-.06.29-.13.42-.22Z" fill="#ffffff" />
  </svg>
`;

const WIKIPEDIA_ICON_SVG = `
  <svg viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="17" height="17" rx="4" fill="#fbfbfb" stroke="#242424" stroke-width="0.95" />
    <text x="9.5" y="13.75" font-family="Georgia, Times New Roman, serif" font-size="12.35" font-weight="800" fill="#111111" text-anchor="middle">W</text>
  </svg>
`;

const MAL_ICON_SVG = `
  <svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect width="21" height="21" fill="#2E51A2" fill-opacity="0.95" rx="4" />
    <text x="10.4" y="14.05" font-family="Arial, sans-serif" font-size="8.95" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-0.28">MAL</text>
  </svg>
`;

function parseHref(href) {
  try {
    return new URL(href, location.origin);
  } catch {
    return undefined;
  }
}

function matchesHost(url, hosts) {
  return hosts.includes(url.hostname.toLowerCase());
}

function isCsfdUrl(url) {
  const host = url.hostname.toLowerCase();
  return url.origin === location.origin || ['www.csfd.cz', 'www.csfd.sk', 'csfd.cz', 'csfd.sk'].includes(host);
}

function matchesReviewUrl(url) {
  return (
    /^\/film\//i.test(url.pathname) &&
    new RegExp(`\/(${REVIEWS_SEGMENTS_PATTERN})\/?$`, 'i').test(url.pathname) &&
    /^\d+$/.test(url.searchParams.get('review') || '') &&
    isCsfdUrl(url)
  );
}

function matchesFilmUrl(url) {
  return /^\/film\//i.test(url.pathname) && !matchesReviewUrl(url) && isCsfdUrl(url);
}

function matchesCreatorUrl(url) {
  return new RegExp(String.raw`^\/(?:${CREATOR_PATHS_PATTERN})\/`, 'i').test(url.pathname) && isCsfdUrl(url);
}

function matchesUserUrl(url) {
  return /^\/uzivatel\//i.test(url.pathname) && isCsfdUrl(url);
}

function matchesYoutubeUrl(url) {
  return matchesHost(url, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
}

function matchesSteamUrl(url) {
  return /^\/app\//i.test(url.pathname) && matchesHost(url, ['store.steampowered.com', 'steampowered.com']);
}

function matchesWikipediaUrl(url) {
  return /(^|\.)wikipedia\.org$/i.test(url.hostname);
}

export const LINK_ICON_PROVIDERS = [
  {
    id: 'review',
    label: 'Recenze',
    settingsId: 'cc-link-icons-review',
    settingsLabel: 'ČSFD recenze',
    storageKey: LINK_ICONS_REVIEW_ENABLED_KEY,
    svg: REVIEW_ICON_SVG,
    matches(url) {
      return matchesReviewUrl(url);
    },
  },
  {
    id: 'film',
    label: 'Film',
    settingsId: 'cc-link-icons-film',
    settingsLabel: 'ČSFD filmy',
    storageKey: LINK_ICONS_FILM_ENABLED_KEY,
    svg: FILM_ICON_SVG,
    matches(url) {
      return matchesFilmUrl(url);
    },
  },
  {
    id: 'creator',
    label: 'Tvurce',
    settingsId: 'cc-link-icons-creator',
    settingsLabel: 'ČSFD tvůrci',
    storageKey: LINK_ICONS_CREATOR_ENABLED_KEY,
    svg: CREATOR_ICON_SVG,
    matches(url) {
      return matchesCreatorUrl(url);
    },
  },
  {
    id: 'user',
    label: 'Uzivatel',
    settingsId: 'cc-link-icons-user',
    settingsLabel: 'ČSFD uživatelé',
    storageKey: LINK_ICONS_USER_ENABLED_KEY,
    svg: USER_ICON_SVG,
    matches(url) {
      return matchesUserUrl(url);
    },
  },
  {
    id: 'youtube',
    label: 'YouTube',
    settingsId: 'cc-link-icons-youtube',
    settingsLabel: 'YouTube',
    storageKey: LINK_ICONS_YOUTUBE_ENABLED_KEY,
    svg: YOUTUBE_ICON_SVG,
    matches(url) {
      return matchesYoutubeUrl(url);
    },
  },
  {
    id: 'steam',
    label: 'Steam',
    settingsId: 'cc-link-icons-steam',
    settingsLabel: 'Steam',
    storageKey: LINK_ICONS_STEAM_ENABLED_KEY,
    svg: STEAM_ICON_SVG,
    matches(url) {
      return matchesSteamUrl(url);
    },
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    settingsId: 'cc-link-icons-wikipedia',
    settingsLabel: 'Wikipedia',
    storageKey: LINK_ICONS_WIKIPEDIA_ENABLED_KEY,
    svg: WIKIPEDIA_ICON_SVG,
    matches(url) {
      return matchesWikipediaUrl(url);
    },
  },
  {
    id: 'anidb',
    label: 'AniDB',
    settingsId: 'cc-link-icons-anidb',
    settingsLabel: 'AniDB',
    storageKey: LINK_ICONS_ANIDB_ENABLED_KEY,
    svg: ANIDB_ICON_SVG,
    matches(url) {
      return matchesHost(url, ['anidb.net', 'www.anidb.net']);
    },
  },
  {
    id: 'myanimelist',
    label: 'MyAnimeList',
    settingsId: 'cc-link-icons-myanimelist',
    settingsLabel: 'MyAnimeList',
    storageKey: LINK_ICONS_MAL_ENABLED_KEY,
    svg: MAL_ICON_SVG,
    matches(url) {
      return matchesHost(url, ['myanimelist.net', 'www.myanimelist.net']);
    },
  },
];

export const LINK_ICON_CONTENT_SELECTORS = [
  '[data-film-review-content] a[href]',
  '.diary-post .article-content.article-content-justify p a[href]',
  '.diary-post .article-content.article-content-justify li a[href]',
  'article.article-forum .article-content.article-content-icons a[href]',
  'article.article-forum .article-content.article-content-icons p a[href]',
  'article.article-forum .article-content.article-content-icons li a[href]',
  '.article-news-content.article-content-justify p a[href]',
  '.article-news-content.article-content-justify li a[href]',
].join(', ');

export const LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS = [
  '.article-header-review-action',
  '.article-header-review',
  '.article-more',
  '.aside-movie-profile',
  '.box-more-bar',
  '.box-pagination',
  '.box-video',
  '.cc-rating-detail-overlay',
  '.cc-ratings-table-modal',
  '.cc-ratings-table-overlay',
  '.film-header-name-control',
  '.film-header-name',
  '.film-posters',
  '.gallery',
  '.label-simple',
  '.more',
  '.page-navigation',
  '.pages',
  '.pagination',
  '.paginator',
  '.reference.down.reply',
  '.span-more-small',
  '.tab-nav-item',
  '#cc-ratings-table-modal-overlay',
  '#snippet--boxButtonCollection',
].join(', ');

export function getLinkIconSettingsItems() {
  return LINK_ICON_PROVIDERS.map((provider) => ({
    type: 'toggle',
    id: provider.settingsId,
    storageKey: provider.storageKey,
    defaultValue: true,
    label: provider.settingsLabel,
    leadingIconSvg: provider.svg,
    tooltip: '',
    eventName: LINK_ICONS_UPDATED_EVENT,
  }));
}

export function getLinkIconProviderByHref(href) {
  const url = parseHref(href);
  if (!url) return undefined;

  return LINK_ICON_PROVIDERS.find((provider) => provider.matches(url));
}

export function getLinkIconProviderById(providerId) {
  return LINK_ICON_PROVIDERS.find((provider) => provider.id === providerId);
}

export function createLinkIconElement(provider) {
  const resolvedProvider =
    typeof provider === 'string' ? LINK_ICON_PROVIDERS.find((item) => item.id === provider) : provider;

  if (!resolvedProvider) return undefined;

  const icon = document.createElement('span');
  icon.className = `cc-link-icon cc-link-icon-${resolvedProvider.id}`;
  icon.dataset.ccLinkIconProvider = resolvedProvider.id;
  icon.setAttribute('aria-hidden', 'true');
  icon.title = resolvedProvider.label;
  icon.innerHTML = resolvedProvider.svg.trim();
  return icon;
}

export function isItalicLinkIconContext(link) {
  if (!(link instanceof Element)) return false;

  if (link.closest('em, i')) return true;

  const onlyElementChild = link.childElementCount === 1 ? link.firstElementChild : null;
  return Boolean(onlyElementChild?.matches('em, i'));
}

export function isLinkIconCandidate(
  link,
  { selectors = LINK_ICON_CONTENT_SELECTORS, blockedClosestSelectors = LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS } = {},
) {
  if (!(link instanceof Element)) return false;

  const href = link.getAttribute('href') || '';
  if (!href || !getLinkIconProviderByHref(href)) return false;

  if (!link.matches(selectors)) return false;

  const linkText = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
  if (linkText === 'více' || linkText === 'viac') return false;

  if (link.closest(blockedClosestSelectors)) return false;
  if (link.closest('.article-header, .article-header-review, .article-header-review-action')) return false;

  return true;
}

export function clearLinkIcons(root = document) {
  root.querySelectorAll('.cc-link-icon').forEach((el) => el.remove());
  root.querySelectorAll('.cc-link-icon-inline').forEach((el) => {
    el.replaceWith(...el.childNodes);
  });
  root.querySelectorAll('a[data-cc-link-icon-applied="true"]').forEach((el) => {
    delete el.dataset.ccLinkIconApplied;
    delete el.dataset.ccLinkIconProvider;
    delete el.dataset.ccLinkIconPosition;
    el.classList.remove('cc-link-icon-target');
  });
}

export function getContentLinksForIcons(
  root = document,
  { selectors = LINK_ICON_CONTENT_SELECTORS, blockedClosestSelectors = LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS } = {},
) {
  return Array.from(root.querySelectorAll(selectors)).filter((link) =>
    isLinkIconCandidate(link, { selectors, blockedClosestSelectors }),
  );
}

export function createLinkIconInlineGroup(link, icon, position) {
  const group = document.createElement('span');
  group.className = `cc-link-icon-inline cc-link-icon-inline-${position}`;

  if (isItalicLinkIconContext(link)) {
    group.classList.add('cc-link-icon-inline-italic');
    icon.classList.add('cc-link-icon-italic');
  }

  if (position === 'after') {
    link.after(group);
    group.append(link, icon);
    return group;
  }

  link.before(group);
  group.append(icon, link);
  return group;
}

export function applyConfiguredLinkIcons(
  root = document,
  {
    iconsEnabled = true,
    position = 'before',
    isProviderEnabled = () => true,
    selectors = LINK_ICON_CONTENT_SELECTORS,
    blockedClosestSelectors = LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS,
  } = {},
) {
  if (!iconsEnabled) {
    clearLinkIcons(root);
    return;
  }

  getContentLinksForIcons(root, { selectors, blockedClosestSelectors }).forEach((link) => {
    const provider = getLinkIconProviderByHref(link.getAttribute('href') || '');
    if (!provider || !isProviderEnabled(provider)) return;

    const existingGroup = link.closest('.cc-link-icon-inline');
    const existingIcon = Array.from(existingGroup?.children || []).find((child) =>
      child.classList?.contains('cc-link-icon'),
    );
    if (
      existingGroup?.classList.contains(`cc-link-icon-inline-${position}`) &&
      existingIcon?.dataset.ccLinkIconProvider === provider.id
    ) {
      link.dataset.ccLinkIconApplied = 'true';
      link.dataset.ccLinkIconProvider = provider.id;
      link.dataset.ccLinkIconPosition = position;
      link.classList.add('cc-link-icon-target');
      return;
    }

    const icon = createLinkIconElement(provider);
    if (!icon) return;

    icon.classList.add(position === 'after' ? 'cc-link-icon-after' : 'cc-link-icon-before');
    createLinkIconInlineGroup(link, icon, position);
    link.dataset.ccLinkIconApplied = 'true';
    link.dataset.ccLinkIconProvider = provider.id;
    link.dataset.ccLinkIconPosition = position;
    link.classList.add('cc-link-icon-target');
  });
}

export function refreshConfiguredLinkIcons(root = document, options = {}) {
  clearLinkIcons(root);
  applyConfiguredLinkIcons(root, options);
}
