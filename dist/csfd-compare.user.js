// ==UserScript==
// @name         ČSFD Compare V2
// @version      0.9.0
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @include      *csfd.cz/*
// @include      *csfd.sk/*
// @require      https://greasyfork.org/scripts/449554-csfd-compare-utils/code/csfd-compare-utils.js?version=1100309
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      myanimelist.net
// @connect      www.myanimelist.net
// @connect      anidb.net
// @connect      cdn-eu.anidb.net
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /*
   * Config and constants for CSFD-Compare
   */
  const VERSION = '0.9.0';
  const SCRIPTNAME = 'CSFD-Compare';
  const SETTINGSNAME = 'CSFD-Compare-settings';
  const GREASYFORK_URL = 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare';
  const WHATS_NEW_VERSION_KEY = 'cc_whats_new_version';
  const NUM_RATINGS_PER_PAGE = 50;
  const INDEXED_DB_NAME = 'CC-Ratings';
  const RATINGS_STORE_NAME = 'ratings';
  const GALLERY_IMAGE_LINKS_ENABLED_KEY = 'cc_gallery_image_links_enabled';
  const LINK_ICONS_ENABLED_KEY = 'cc_link_icons_enabled';
  const LINK_ICONS_REVIEW_ENABLED_KEY = 'cc_link_icons_review_enabled';
  const LINK_ICONS_FILM_ENABLED_KEY = 'cc_link_icons_film_enabled';
  const LINK_ICONS_CREATOR_ENABLED_KEY = 'cc_link_icons_creator_enabled';
  const LINK_ICONS_USER_ENABLED_KEY = 'cc_link_icons_user_enabled';
  const LINK_ICONS_YOUTUBE_ENABLED_KEY = 'cc_link_icons_youtube_enabled';
  const LINK_ICONS_STEAM_ENABLED_KEY = 'cc_link_icons_steam_enabled';
  const LINK_ICONS_WIKIPEDIA_ENABLED_KEY = 'cc_link_icons_wikipedia_enabled';
  const LINK_ICONS_ANIDB_ENABLED_KEY = 'cc_link_icons_anidb_enabled';
  const LINK_ICONS_MAL_ENABLED_KEY = 'cc_link_icons_myanimelist_enabled';
  const LINK_ICONS_POSITION_KEY = 'cc_link_icons_position';
  const LINK_ICONS_SECTION_COLLAPSED_KEY = 'cc_link_icons_section_collapsed';
  const LINK_ICONS_UPDATED_EVENT = 'cc-link-icons-updated';
  const HOVER_PREVIEW_CACHE_GROUP_PREFIX = 'cc_hover_cache_';
  const HOVER_PREVIEW_CACHE_PREFIX = 'cc_hover_cache_v1_';
  const HOVER_PREVIEW_CACHE_HOURS_KEY = 'cc_hover_preview_cache_hours';
  const HOVER_PREVIEW_ENABLED_KEY = 'cc_hover_preview_enabled';
  const HOVER_PREVIEW_CREATOR_ENABLED_KEY = 'cc_hover_preview_creator_enabled';
  const HOVER_PREVIEW_USER_ENABLED_KEY = 'cc_hover_preview_user_enabled';
  const HOVER_PREVIEW_REVIEW_ENABLED_KEY = 'cc_hover_preview_review_enabled';
  const HOVER_PREVIEW_FILM_ENABLED_KEY = 'cc_hover_preview_film_enabled';
  const HOVER_PREVIEW_EXTERNAL_ENABLED_KEY = 'cc_hover_preview_external_enabled';
  const HOVER_PREVIEW_SECTION_COLLAPSED_KEY = 'cc_hover_preview_section_collapsed';
  const HOVER_PREVIEW_SETTINGS_CHANGED_EVENT = 'cc-hover-preview-settings-changed';
  const SELF_REPLY_IN_DISCUSSIONS_KEY = 'cc_self_reply_discussions';
  const SHOW_ALL_CREATOR_TABS_KEY = 'cc_show_all_creator_tabs';
  const SHOW_RATINGS_KEY = 'cc_show_ratings';
  const SHOW_RATINGS_IN_REVIEWS_KEY = 'cc_show_ratings_in_reviews';
  const SHOW_RATINGS_IN_DIARIES_KEY = 'cc_show_ratings_in_diaries';
  const SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY = 'cc_show_ratings_in_foreign_reviews';
  const SHOW_RATINGS_SECTION_COLLAPSED_KEY = 'cc_show_ratings_section_collapsed';

  // feature flags copied from legacy script
  const CLICKABLE_HEADER_BOXES_KEY = 'cc_clickable_header_boxes';
  const RATINGS_ESTIMATE_KEY = 'cc_ratings_estimate';
  const RATINGS_FROM_FAVORITES_KEY = 'cc_ratings_from_favorites';
  const ADD_RATINGS_DATE_KEY = 'cc_add_ratings_date';
  const REVERT_STAR_STYLE_KEY = 'cc_revert_star_style';
  const HIDE_SELECTED_REVIEWS_KEY = 'cc_hide_selected_user_reviews';
  const HIDE_SELECTED_REVIEWS_LIST_KEY = 'cc_hide_selected_user_reviews_list';
  const HIDE_REVIEWS_SECTION_COLLAPSED_KEY = 'cc_hide_reviews_section_collapsed';

  /** Selector for the logged-in user's profile link in the ČSFD header. */
  const PROFILE_LINK_SELECTOR =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

  /** Regex to extract user slug (e.g. "12345-username") from a ČSFD user path. */
  const USER_SLUG_REGEX = /^\/uzivatel\/(\d+-[^/]+)\//i;

  const CSFD_SITE_CONFIG = Object.freeze({
    cz: Object.freeze({
      pathSegments: Object.freeze({
        overview: 'prehled',
        ratings: 'hodnoceni',
        reviews: 'recenze',
      }),
      creatorRoles: Object.freeze({
        actors: 'Hrají',
        directors: 'Režie',
      }),
    }),
    sk: Object.freeze({
      pathSegments: Object.freeze({
        overview: 'prehlad',
        ratings: 'hodnotenia',
        reviews: 'recenzie',
      }),
      creatorRoles: Object.freeze({
        actors: 'Hrajú',
        directors: 'Réžia',
      }),
    }),
  });

  const CSFD_SHOW_TYPE_KEYWORDS = Object.freeze({
    episode: Object.freeze(['epizoda', 'epizóda', 'episode']),
    serial: Object.freeze(['seriál', 'serial']),
    season: Object.freeze(['série', 'séria', 'serie', 'season', 'series']),
    'tv movie': Object.freeze(['tv film', 'tv movie']),
    movie: Object.freeze(['film', 'movie']),
  });

  const CSFD_CREATOR_ROLE_KEYWORDS = Object.freeze(
    Object.fromEntries(
      Object.keys(CSFD_SITE_CONFIG.cz.creatorRoles).map((roleKey) => [
        roleKey,
        Object.freeze(
          Array.from(new Set(Object.values(CSFD_SITE_CONFIG).map((localeConfig) => localeConfig.creatorRoles[roleKey]))),
        ),
      ]),
    ),
  );

  const CSFD_TEXT_VARIANTS = Object.freeze({
    reviewHeading: Object.freeze(['recenze', 'recenzie']),
    recentReviewsOrRatingsHeading: Object.freeze([
      'poslední recenze',
      'posledne recenzie',
      'poslední hodnocení',
      'posledné hodnotenia',
    ]),
    recentDiaryHeading: Object.freeze(['poslední deníček', 'posledny dennik']),
  });

  const CSFD_USER_PROFILE_SUBPATHS = Object.freeze([
    'o-mne',
    'denicek',
    'dennik',
    'seznamy',
    'filmoteka',
    'komentare',
    'komentare-filmy',
    'diskuze',
    'diskusia',
    'fanclub',
    'videa',
    'galerie',
    'galaria',
    'zajimavosti',
    'zaujimavosti',
    'biografie',
    'biografia',
    'obsahy',
    'videa-fotky',
  ]);

  const CSFD_PATH_ALIASES = Object.freeze({
    creator: Object.freeze(['tvurce', 'tvorca']),
    discussion: Object.freeze(['diskuze', 'diskusia', 'diskusie']),
    gallery: Object.freeze(['galerie', 'galaria']),
  });

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getCsfdLocale(hostname = globalThis.location?.hostname || '') {
    return String(hostname).endsWith('.sk') ? 'sk' : 'cz';
  }

  function getCsfdPathSegment(segmentKey, localeOrHostname = getCsfdLocale()) {
    const locale = Object.hasOwn(CSFD_SITE_CONFIG, localeOrHostname) ? localeOrHostname : getCsfdLocale(localeOrHostname);
    return CSFD_SITE_CONFIG[locale]?.pathSegments?.[segmentKey] || CSFD_SITE_CONFIG.cz.pathSegments?.[segmentKey] || '';
  }

  function getCsfdPathSegmentValues(segmentKey) {
    return Object.freeze(
      Array.from(
        new Set(Object.values(CSFD_SITE_CONFIG).map((localeConfig) => localeConfig.pathSegments?.[segmentKey])),
      ).filter(Boolean),
    );
  }

  function getCsfdPathSegmentPattern(segmentKey) {
    return getCsfdPathSegmentValues(segmentKey).map(escapeRegExp).join('|');
  }

  function getCsfdPathAliasPattern(aliasKey) {
    return (CSFD_PATH_ALIASES[aliasKey] || []).map(escapeRegExp).join('|');
  }

  function getCsfdUserProfileSubpathPattern() {
    return [getCsfdPathSegmentPattern('overview'), ...CSFD_USER_PROFILE_SUBPATHS.map(escapeRegExp)].join('|');
  }

  function getCsfdCreatorRoleLabel(roleKey, localeOrHostname = getCsfdLocale()) {
    const locale = Object.hasOwn(CSFD_SITE_CONFIG, localeOrHostname) ? localeOrHostname : getCsfdLocale(localeOrHostname);
    return CSFD_SITE_CONFIG[locale]?.creatorRoles?.[roleKey] || CSFD_SITE_CONFIG.cz.creatorRoles?.[roleKey] || '';
  }

  function matchesCsfdTextVariant(variantKey, text = '') {
    const normalized = String(text || '')
      .trim()
      .toLowerCase();
    if (!normalized) return false;

    return (CSFD_TEXT_VARIANTS[variantKey] || []).some((variant) => normalized.includes(variant));
  }

  function normalizeCsfdShowType(rawType, defaultType = 'movie') {
    const normalized = String(rawType || '')
      .trim()
      .toLowerCase();
    if (!normalized) return defaultType;

    for (const [typeKey, keywords] of Object.entries(CSFD_SHOW_TYPE_KEYWORDS)) {
      if (keywords.some((keyword) => normalized === keyword || normalized.includes(keyword))) {
        return typeKey;
      }
    }

    return normalized;
  }

  function buildRatingRecordId(userSlug, movieId) {
    return `${userSlug}:${movieId}`;
  }

  function parseLastUpdateMs(record) {
    const parsed = Date.parse(record?.lastUpdate || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function pickPreferredRatingRecord(existingRecord, nextRecord) {
    if (!existingRecord) return nextRecord;

    const existingUpdatedAt = parseLastUpdateMs(existingRecord);
    const nextUpdatedAt = parseLastUpdateMs(nextRecord);
    if (nextUpdatedAt !== existingUpdatedAt) {
      return nextUpdatedAt > existingUpdatedAt ? nextRecord : existingRecord;
    }

    const existingDeleted = existingRecord?.deleted === true;
    const nextDeleted = nextRecord?.deleted === true;
    if (existingDeleted !== nextDeleted) {
      return nextDeleted ? existingRecord : nextRecord;
    }

    const existingDirect = existingRecord?.computed !== true;
    const nextDirect = nextRecord?.computed !== true;
    if (existingDirect !== nextDirect) {
      return nextDirect ? nextRecord : existingRecord;
    }

    const existingRating = Number.isFinite(existingRecord?.rating) ? existingRecord.rating : Number.NEGATIVE_INFINITY;
    const nextRating = Number.isFinite(nextRecord?.rating) ? nextRecord.rating : Number.NEGATIVE_INFINITY;
    if (nextRating !== existingRating) {
      return nextRating > existingRating ? nextRecord : existingRecord;
    }

    return nextRecord;
  }

  function reconcileUserRatingRecords(records, userSlug) {
    const relevantRecords = Array.isArray(records)
      ? records.filter((record) => record?.userSlug === userSlug && Number.isFinite(record?.movieId))
      : [];

    const sourceRecordIdsByMovieId = new Map();
    const preferredRecordsByMovieId = new Map();

    for (const record of relevantRecords) {
      const normalizedRecord = {
        ...record,
        id: buildRatingRecordId(userSlug, record.movieId),
      };
      const preferredRecord = pickPreferredRatingRecord(preferredRecordsByMovieId.get(record.movieId), normalizedRecord);
      preferredRecordsByMovieId.set(record.movieId, preferredRecord);
      if (preferredRecord === normalizedRecord) {
        sourceRecordIdsByMovieId.set(record.movieId, record.id);
      }
    }

    const staleRecordIds = [];
    for (const record of relevantRecords) {
      const expectedId = buildRatingRecordId(userSlug, record.movieId);
      const chosenSourceId = sourceRecordIdsByMovieId.get(record.movieId);
      if (record.id !== expectedId || record.id !== chosenSourceId) {
        staleRecordIds.push(record.id);
      }
    }

    return {
      normalizedRecords: Array.from(preferredRecordsByMovieId.values()),
      recordsByMovieId: preferredRecordsByMovieId,
      staleRecordIds: Array.from(new Set(staleRecordIds.filter(Boolean))),
      hasChanges: staleRecordIds.length > 0,
    };
  }

  const CREATOR_PATHS_PATTERN$2 = getCsfdPathAliasPattern('creator');
  const REVIEWS_SEGMENTS_PATTERN$2 = getCsfdPathSegmentPattern('reviews');

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
      new RegExp(`\/(${REVIEWS_SEGMENTS_PATTERN$2})\/?$`, 'i').test(url.pathname) &&
      /^\d+$/.test(url.searchParams.get('review') || '') &&
      isCsfdUrl(url)
    );
  }

  function matchesFilmUrl(url) {
    return /^\/film\//i.test(url.pathname) && !matchesReviewUrl(url) && isCsfdUrl(url);
  }

  function matchesCreatorUrl(url) {
    return new RegExp(String.raw`^\/(?:${CREATOR_PATHS_PATTERN$2})\/`, 'i').test(url.pathname) && isCsfdUrl(url);
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

  const LINK_ICON_PROVIDERS = [
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

  const LINK_ICON_CONTENT_SELECTORS = [
    '[data-film-review-content] a[href]',
    '.diary-post .article-content.article-content-justify p a[href]',
    '.diary-post .article-content.article-content-justify li a[href]',
    'article.article-forum .article-content.article-content-icons a[href]',
    'article.article-forum .article-content.article-content-icons p a[href]',
    'article.article-forum .article-content.article-content-icons li a[href]',
    '.article-news-content.article-content-justify p a[href]',
    '.article-news-content.article-content-justify li a[href]',
  ].join(', ');

  const LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS = [
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

  function getLinkIconSettingsItems() {
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

  function getLinkIconProviderByHref(href) {
    const url = parseHref(href);
    if (!url) return undefined;

    return LINK_ICON_PROVIDERS.find((provider) => provider.matches(url));
  }

  function createLinkIconElement(provider) {
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

  function isItalicLinkIconContext(link) {
    if (!(link instanceof Element)) return false;

    if (link.closest('em, i')) return true;

    const onlyElementChild = link.childElementCount === 1 ? link.firstElementChild : null;
    return Boolean(onlyElementChild?.matches('em, i'));
  }

  function isLinkIconCandidate(
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

  function clearLinkIcons(root = document) {
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

  function getContentLinksForIcons(
    root = document,
    { selectors = LINK_ICON_CONTENT_SELECTORS, blockedClosestSelectors = LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS } = {},
  ) {
    return Array.from(root.querySelectorAll(selectors)).filter((link) =>
      isLinkIconCandidate(link, { selectors, blockedClosestSelectors }),
    );
  }

  function createLinkIconInlineGroup(link, icon, position) {
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

  function applyConfiguredLinkIcons(
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

  function refreshConfiguredLinkIcons(root = document, options = {}) {
    clearLinkIcons(root);
    applyConfiguredLinkIcons(root, options);
  }

  // Cache for the IndexedDB instance to avoid multiple openings of the same database during the session.
  let dbInstance = null;

  function configureDbInstance(db) {
    db.onversionchange = () => {
      closeCachedDbInstance();
    };

    dbInstance = db;
    return dbInstance;
  }

  function closeCachedDbInstance() {
    if (!dbInstance) {
      return;
    }

    try {
      dbInstance.onversionchange = null;
      dbInstance.close();
    } catch {
      // Ignore close errors during teardown.
    } finally {
      dbInstance = null;
    }
  }

  /**
   * Utility function to convert an IndexedDB request into a Promise, allowing for easier async/await usage.
   * @param {*} request - The IndexedDB request to convert.
   * @returns {Promise<any>} - A promise that resolves with the result of the request or rejects with an error.
   *
   * Example usage:
   * - `const count =await idbRequestToPromise(store.count());`
   * - `const deleted = await idbRequestToPromise(store.delete(id));`
   * - `const result = await idbRequestToPromise(request);`
   */
  function idbRequestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getSettings(settingsName = 'CSFD-Compare-settings', defaultSettings = {}) {
    if (!localStorage.getItem(settingsName)) {
      localStorage.setItem(settingsName, JSON.stringify(defaultSettings));
      return defaultSettings;
    } else {
      return JSON.parse(localStorage.getItem(settingsName));
    }
  }

  async function initIndexedDB(dbName, storeName) {
    // Singleton pattern: if the database instance is already initialized, return it immediately.
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(dbName);

      openRequest.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      };

      openRequest.onsuccess = function () {
        const db = openRequest.result;

        // Handle the situation where the database opened, but the store doesn't exist yet
        if (!db.objectStoreNames.contains(storeName)) {
          const nextVersion = db.version + 1;
          db.close(); // We must close the old connection before forcing an upgrade

          const upgradeRequest = indexedDB.open(dbName, nextVersion);
          upgradeRequest.onupgradeneeded = function (event) {
            const upgradedDb = event.target.result;
            if (!upgradedDb.objectStoreNames.contains(storeName)) {
              upgradedDb.createObjectStore(storeName, { keyPath: 'id' });
            }
          };
          upgradeRequest.onsuccess = function () {
            resolve(configureDbInstance(upgradeRequest.result));
          };
          upgradeRequest.onerror = function () {
            reject(upgradeRequest.error);
          };
          return;
        }

        resolve(configureDbInstance(db));
      };

      openRequest.onerror = function () {
        reject(openRequest.error);
      };
    });
  }

  async function saveToIndexedDB(dbName, storeName, data) {
    const db = await initIndexedDB(dbName, storeName);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      // Manage the state of the entire transaction instead of individual operations
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        console.error('Error in saveToIndexedDB:', transaction.error);
        reject(transaction.error);
      };

      if (Array.isArray(data)) {
        data.forEach((item) => store.put(item));
      } else {
        store.put(data);
      }
    });
  }

  async function getAllFromIndexedDB(dbName, storeName) {
    const db = await initIndexedDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteItemFromIndexedDB(dbName, storeName, id) {
    // const db = await initIndexedDB(dbName, storeName);
    // return new Promise((resolve, reject) => {
    //   const transaction = db.transaction(storeName, 'readwrite');
    //   const store = transaction.objectStore(storeName);
    //   const req = store.delete(id);
    //   req.onsuccess = () => resolve(true);
    //   req.onerror = () => reject(req.error);
    // });
    const db = await initIndexedDB(dbName, storeName);
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    return await idbRequestToPromise(store.delete(id));
  }

  async function deleteAllDataFromIndexedDB(dbName, storeName) {
    // const db = await initIndexedDB(dbName, storeName);
    // return new Promise((resolve, reject) => {
    //   const transaction = db.transaction(storeName, 'readwrite');
    //   const store = transaction.objectStore(storeName);
    //   const req = store.clear();
    //   req.onsuccess = () => resolve(true);
    //   req.onerror = () => reject(req.error);
    // });
    const db = await initIndexedDB(dbName, storeName);
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    return await idbRequestToPromise(store.clear());
  }

  function delay(t) {
    return new Promise((resolve) => setTimeout(resolve, t));
  }

  // Escape HTML to prevent XSS from weird CSFD data
  const escapeHtml = (str) =>
    String(str || '').replace(
      /[&<>"']/g,
      (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m],
    );

  /**
   * Extract user slug (e.g. "12345-username") from a ČSFD user path or href.
   * @param {string} href - path like "/uzivatel/12345-username/hodnoceni/"
   * @returns {string|undefined}
   */
  function extractUserSlug(href) {
    return String(href || '').match(USER_SLUG_REGEX)?.[1];
  }

  /** Returns the profile link element for the logged-in user, or null. */
  function getProfileLinkElement() {
    return document.querySelector(PROFILE_LINK_SELECTOR);
  }

  /**
   * Parse a star-rating value from a ČSFD `.stars` element.
   * @param {Element|null} starsEl - element with class like "stars stars-4" or "stars trash"
   * @returns {number} 0-5 rating, or NaN if unparseable
   */
  function parseRatingFromStars(starsEl) {
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
  function getFeatureState(key, defaultValue = true) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
  }

  /**
   * Extract the movie/film ID from a ČSFD URL path.
   * @param {string} url - The URL or path to extract the movie ID from.
   * @returns {number} The extracted movie ID, or NaN if it cannot be parsed.
   */
  function getMovieIdFromUrl(url) {
    if (!url) return NaN;
    // OPTIMIZATION: matchAll is slower. A simple regex match with global flag is faster.
    const matches = url.match(/\/(\d+)-/g);
    if (!matches || matches.length === 0) return NaN;

    // Extract numbers from the last match e.g., "/12345-" -> 12345
    const lastMatch = matches[matches.length - 1];
    return parseInt(lastMatch.replace(/\D/g, ''), 10);
  }

  const OVERVIEW_SEGMENTS_PATTERN$1 = getCsfdPathSegmentPattern('overview');
  const CREATOR_PATHS_PATTERN$1 = getCsfdPathAliasPattern('creator');
  const DISCUSSION_PATHS_PATTERN = getCsfdPathAliasPattern('discussion');
  const GALLERY_PATHS_PATTERN = getCsfdPathAliasPattern('gallery');
  const RATINGS_SEGMENTS_PATTERN = getCsfdPathSegmentPattern('ratings');
  const REVIEWS_SEGMENTS_PATTERN$1 = getCsfdPathSegmentPattern('reviews');
  const HOME_PAGE_PANEL_TITLE_NORMALIZERS = Object.freeze([
    {
      pattern: /^tv tipy dne\s*-/i,
      storageTitle: 'TV tipy dne -',
    },
  ]);

  function normalizeHomePanelTitle(title) {
    const normalizedTitle = String(title || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalizedTitle) return '';

    const matchedRule = HOME_PAGE_PANEL_TITLE_NORMALIZERS.find(({ pattern }) => pattern.test(normalizedTitle));
    return matchedRule?.storageTitle || normalizedTitle;
  }

  function homePanelsListIncludes(hiddenList, title) {
    const normalizedTitle = normalizeHomePanelTitle(title);
    if (!normalizedTitle) return false;

    return hiddenList.some((hiddenTitle) => normalizeHomePanelTitle(hiddenTitle) === normalizedTitle);
  }

  class Csfd {
    constructor(pageContent) {
      this.csfdPage = pageContent;
      this.stars = {};
      this.storageKey = undefined;
      this.userUrl = undefined;
      this.username = undefined;
      this.userRatingsUrl = undefined;
      this.isLoggedIn = false;
      this.userSlug = undefined;

      // OPTIMIZATION: Cache parsed lists to avoid calling JSON.parse in high-frequency DOM operations
      this.cachedHiddenPanelsList = [];
      this.cachedHiddenReviewsList = [];
      this.updateCachedLists();
    }

    // OPTIMIZATION: One method to update all memory-cached local storage lists
    updateCachedLists() {
      try {
        this.cachedHiddenPanelsList = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
      } catch (e) {
        this.cachedHiddenPanelsList = [];
      }

      try {
        const raw = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY) || '[]';
        this.cachedHiddenReviewsList = JSON.parse(raw).map((s) => s.toLowerCase());
      } catch (e) {
        this.cachedHiddenReviewsList = [];
      }
    }

    getCurrentUser() {
      const userEl = getProfileLinkElement();
      if (userEl) {
        this.isLoggedIn = true;
        return userEl.getAttribute('href');
      }
      this.isLoggedIn = false;
      console.debug('🟣 User not found');
      return undefined;
    }

    getUsername() {
      const userHref = this.userUrl || this.getCurrentUser();
      if (!userHref) {
        console.debug('🟣 User URL not found');
        return undefined;
      }
      const match = userHref.match(/\/(\d+)-(.+?)\//);
      if (match && match.length >= 3) {
        this.username = match[2];
        return this.username;
      }
      console.debug('🟣 Username not found');
      return undefined;
    }

    getIsLoggedIn() {
      console.debug('🟣 Login state:', this.isLoggedIn);
      return this.isLoggedIn;
    }

    async initialize() {
      this.userUrl = this.getCurrentUser();
      console.debug('🟣 User URL:', this.userUrl);

      this.username = this.getUsername();
      console.debug('🟣 Username:', this.username);

      this.storageKey = `CSFD-Compare_${this.username || 'guest'}`;
      console.debug('🟣 Storage Key:', this.storageKey);

      this.userSlug = extractUserSlug(this.userUrl);
      console.debug('🟣 User Slug:', this.userSlug);

      this.userRatingsUrl = this.userUrl ? this.userUrl + getCsfdPathSegment('ratings') : undefined;
      console.debug('🟣 User Ratings URL:', this.userRatingsUrl);

      const settings = await getSettings(SETTINGSNAME);
      this.stars = settings?.stars || {};

      await this.loadStarsFromIndexedDb();
      await this.syncCurrentPageRatingWithIndexedDb();

      try {
        if (getFeatureState('cc_show_all_creator_tabs')) this.showAllCreatorTabs();
        if (getFeatureState(REVERT_STAR_STYLE_KEY)) this.revertStarStyle();
        if (getFeatureState('cc_clickable_header_boxes')) this.clickableHeaderBoxes();
        if (getFeatureState('cc_ratings_estimate')) this.ratingsEstimate();
        if (getFeatureState('cc_ratings_from_favorites')) this.ratingsFromFavorites();
        if (getFeatureState('cc_add_ratings_date')) this.addRatingsDate();
        if (getFeatureState(SELF_REPLY_IN_DISCUSSIONS_KEY, true)) this.enableSelfReplyInDiscussions();
      } catch (e) {
        // ignore silently
      }

      // Dynamic Filter Trigger (runs immediately and whenever the list is updated)
      this.hideSelectedUserReviews();
      window.addEventListener('cc-hide-selected-reviews-updated', () => {
        this.updateCachedLists(); // Update memory cache
        this.hideSelectedUserReviews();
      });

      // Initialize Home Panels Hiding
      window.addEventListener('cc-hidden-panels-updated', () => {
        this.updateCachedLists(); // Update memory cache
        if (typeof this._syncVisibility === 'function') this._syncVisibility();
      });
      this.initHomePanels();

      // LIVE DOM REFRESH LISTENER (Triggered by Settings Menu)
      window.addEventListener('cc-ratings-updated', async () => {
        // 1. Wipe old injected stars specific to your original code
        // TODO: Older, with design hopping around
        // document.querySelectorAll('.cc-own-rating, .cc-my-rating-col, .cc-my-rating-cell').forEach((el) => el.remove());
        document.querySelectorAll('.cc-own-rating-inline').forEach((el) => el.remove());
        document.querySelectorAll('.cc-own-rating').forEach((el) => el.remove());
        document.querySelectorAll('a[data-cc-star-added="true"]').forEach((el) => {
          delete el.dataset.ccStarAdded;
        });

        // 2. Reload your original DB logic
        const settings = await getSettings(SETTINGSNAME);
        this.stars = settings?.stars || {};
        await this.loadStarsFromIndexedDb();

        // 3. Redraw the stars
        await this.addStars();
      });
    }

    initHomePanels() {
      if (location.pathname !== '/' && location.pathname !== '') return;

      // Save reference so event listeners can call it without recreating it
      this._syncVisibility = () => {
        const enabled = getFeatureState('cc_hide_home_panels', true);
        const hiddenList = this.cachedHiddenPanelsList; // Use memory cache!

        // REFACTOR: Removed Array.from(), modern NodeLists support .forEach natively
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
                if (!homePanelsListIncludes(this.cachedHiddenPanelsList, storageTitle)) {
                  this.cachedHiddenPanelsList.push(storageTitle);
                  localStorage.setItem('cc_hidden_panels_list', JSON.stringify(this.cachedHiddenPanelsList));
                  window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
                }
              };
              headerEl.appendChild(btn);
            }
          });

        // GROUP & ROW COLLAPSE ENGINE
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

      this._syncVisibility();
      setTimeout(this._syncVisibility, 500);
      setTimeout(this._syncVisibility, 1500);
    }

    showAllCreatorTabs() {
      document.body.classList.add('cc-show-all-tabs-enabled');
    }

    restoreCreatorTabs() {
      document.body.classList.remove('cc-show-all-tabs-enabled');
      window.dispatchEvent(new Event('resize'));
    }

    revertStarStyle() {
      document.body.classList.add('cc-revert-star-style');
    }

    restoreStarStyle() {
      document.body.classList.remove('cc-revert-star-style');
    }

    getCurrentItemUrlAndIds() {
      const path = location.pathname || '';
      if (!path.includes('/film/')) {
        return { movieId: NaN, urlSlug: '', parentId: NaN, parentName: '', fullUrl: '' };
      }

      const slugMatches = Array.from(path.matchAll(/\/(\d+-[^/]+)/g)).map((m) => m[1]);
      const idMatches = slugMatches
        .map((slug) => Number.parseInt((slug.match(/^(\d+)-/) || [])[1], 10))
        .filter((id) => Number.isFinite(id));

      const movieId = idMatches.length ? idMatches[idMatches.length - 1] : NaN;
      const parentId = idMatches.length > 1 ? idMatches[0] : NaN;
      const parentName = slugMatches.length > 1 ? slugMatches[0] : '';
      const urlSlug = slugMatches.length ? slugMatches[slugMatches.length - 1] : '';

      const cleanPath = path.replace(
        new RegExp(`\/(${REVIEWS_SEGMENTS_PATTERN$1}|komentare|${OVERVIEW_SEGMENTS_PATTERN$1})\/?$`, 'i'),
        '/',
      );

      return { movieId, urlSlug, parentId, parentName, fullUrl: `${location.origin}${cleanPath}` };
    }

    getCurrentPageOwnRating() {
      const activeStars = Array.from(document.querySelectorAll('.my-rating .stars-rating a.star.active[data-rating]'));
      if (!activeStars.length) return null;

      const rawRatings = activeStars
        .map((star) => Number.parseInt(star.getAttribute('data-rating') || '', 10))
        .filter((val) => Number.isFinite(val));

      if (!rawRatings.length) return null;
      if (rawRatings.includes(0)) return 0;

      const maxRatingPercent = Math.max(...rawRatings);
      return Math.max(0, Math.min(5, Math.round(maxRatingPercent / 20)));
    }

    getCurrentPageRatingDate() {
      const title = document.querySelector('.my-rating .stars-rating')?.getAttribute('title') || '';
      return (title.match(/(\d{1,2}\.\d{1,2}\.\d{4})/) || [])[1] || '';
    }

    getCurrentPageName() {
      return document.querySelector('.film-header h1')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    }

    getCurrentPageYear() {
      const originText = document.querySelector('.film-info-content .origin')?.textContent || '';
      const yearMatch = originText.match(/\b(19|20)\d{2}\b/);
      return yearMatch ? Number.parseInt(yearMatch[0], 10) : NaN;
    }

    getCurrentPageType() {
      const typeText = document.querySelector('.film-header .type')?.textContent?.toLowerCase() || '';
      return normalizeCsfdShowType(typeText, 'movie');
    }

    getCurrentPageComputedInfo() {
      const isStarComputed = document.querySelectorAll('.my-rating .stars-rating a.star.computed').length > 0;

      const titleSelectors = [
        '.others-rating .current-user-rating [title*="spočten" i]',
        '.mobile-film-rating-detail [title*="spočten" i]',
        '.my-rating .stars-rating[title*="spočten" i]',
        '.others-rating .current-user-rating [title*="spocten" i]',
        '.mobile-film-rating-detail [title*="spocten" i]',
        '.my-rating .stars-rating[title*="spocten" i]',
      ].join(', ');

      const computedTitle = document.querySelector(titleSelectors)?.getAttribute('title') || '';
      const computedCountMatch = computedTitle.match(/(\d+)/);

      return {
        isComputed: isStarComputed || computedTitle.length > 0,
        computedFromText: computedTitle,
        computedCount: computedCountMatch ? Number.parseInt(computedCountMatch[1], 10) : NaN,
      };
    }

    _parseRatingFromStars(starElem) {
      return parseRatingFromStars(starElem);
    }

    _getRatingColor(percent) {
      if (percent >= 70) return '#ba0305'; // Native CSFD red
      if (percent >= 30) return '#62829d'; // Native CSFD blue
      return '#545454'; // Native CSFD gray/black
    }

    clickableHeaderBoxes() {
      // Aplikujeme pouze na klasické boxy a hlavičky v rozbalovacích menu
      document.querySelectorAll('.dropdown-content-head, .box-header, .updated-box-header').forEach((div) => {
        if (div.dataset.ccClickable === 'true') return;

        const btn = div.querySelector('a.button');
        if (!btn) return;
        const text = btn.textContent.trim().toLowerCase();
        if (!['více', 'viac'].includes(text)) return;
        const href = btn.getAttribute('href');
        if (!href) return;

        div.dataset.ccClickable = 'true';

        const wrapper = document.createElement('a');
        wrapper.setAttribute('href', href);
        wrapper.dataset.ccHeaderWrapper = 'true';
        wrapper.style.display = 'block';
        wrapper.style.textDecoration = 'none';
        wrapper.style.color = 'inherit';

        div.parentNode.replaceChild(wrapper, div);
        wrapper.appendChild(div);

        const h2 = div.querySelector('h2');
        const spanCount = h2?.querySelector('span.count');

        div.ccHoverEnter = () => {
          div.dataset.origBg = div.style.backgroundColor || '';
          div.style.backgroundColor = '#ba0305';
          if (h2) {
            h2.dataset.origBg = h2.style.backgroundColor || '';
            h2.dataset.origColor = h2.style.color || '';
            h2.style.backgroundColor = '#ba0305';
            h2.style.color = '#fff';
          }
          if (spanCount) {
            spanCount.dataset.origColor = spanCount.style.color || '';
            spanCount.style.color = '#fff';
          }
        };

        div.ccHoverLeave = () => {
          div.style.backgroundColor = div.dataset.origBg || '';
          if (h2) {
            h2.style.backgroundColor = h2.dataset.origBg || '';
            h2.style.color = h2.dataset.origColor || '';
          }
          if (spanCount) {
            spanCount.style.color = spanCount.dataset.origColor || '';
          }
        };

        div.addEventListener('mouseenter', div.ccHoverEnter);
        div.addEventListener('mouseleave', div.ccHoverLeave);
      });
    }

    clearClickableHeaderBoxes() {
      document.querySelectorAll('a[data-cc-header-wrapper="true"]').forEach((wrapper) => {
        const div = wrapper.firstElementChild;
        if (div) {
          div.dataset.ccClickable = 'false';

          // Clear hover styles if the mouse is currently over the element
          if (div.ccHoverLeave) {
            div.removeEventListener('mouseenter', div.ccHoverEnter);
            div.removeEventListener('mouseleave', div.ccHoverLeave);
            div.ccHoverLeave();
          }

          // Unwrap the div from the anchor
          wrapper.parentNode.replaceChild(div, wrapper);
        }
      });
    }

    _getOrInitRatingContainer() {
      const avgEl = document.querySelector('.box-rating-container .film-rating-average');
      if (!avgEl) return null;

      if (!avgEl.dataset.ccInitialized) {
        avgEl.dataset.ccOriginalText = avgEl.textContent.trim();
        avgEl.dataset.ccOriginalBg = avgEl.style.backgroundColor || '';
        avgEl.dataset.ccOriginalColor = avgEl.style.color || '';
        avgEl.dataset.ccOriginalTitle = avgEl.getAttribute('title') || '';

        avgEl.innerHTML = '';

        const mainSpan = document.createElement('span');
        mainSpan.className = 'cc-main-rating';
        mainSpan.textContent = avgEl.dataset.ccOriginalText;

        const favSpan = document.createElement('span');
        favSpan.className = 'cc-fav-rating';
        favSpan.style.position = 'relative';
        favSpan.style.top = '25px';
        favSpan.style.fontSize = '0.3em';
        favSpan.style.fontWeight = '600';
        favSpan.style.display = 'none';

        avgEl.appendChild(mainSpan);
        avgEl.appendChild(favSpan);
        avgEl.dataset.ccInitialized = 'true';
      }
      return avgEl;
    }

    ratingsEstimate() {
      const avgEl = this._getOrInitRatingContainer();
      if (!avgEl) return;

      // Count the estimate only if the original text contains "? %"
      if (!avgEl.dataset.ccOriginalText.includes('?')) return;

      // OPTIMIZATION: Replaced 3 array loops (.map.map.filter) with a single fast loop
      let sum = 0;
      let count = 0;
      document.querySelectorAll('section.others-rating .star-rating .stars').forEach((starEl) => {
        const num = this._parseRatingFromStars(starEl);
        if (Number.isFinite(num)) {
          sum += num * 20;
          count++;
        }
      });

      if (count === 0) return;
      const average = Math.round(sum / count);

      const mainSpan = avgEl.querySelector('.cc-main-rating');
      if (mainSpan) {
        mainSpan.textContent = `${average}%`;
      }

      avgEl.style.color = '#fff';
      avgEl.style.backgroundColor = this._getRatingColor(average);
      avgEl.setAttribute('title', `spočteno z hodnocení: ${count}`);
    }

    clearRatingsEstimate() {
      const avgEl = document.querySelector('.box-rating-container .film-rating-average');
      if (!avgEl || !avgEl.dataset.ccInitialized) return;

      const mainSpan = avgEl.querySelector('.cc-main-rating');
      if (mainSpan) {
        mainSpan.textContent = avgEl.dataset.ccOriginalText;
      }

      avgEl.style.color = avgEl.dataset.ccOriginalColor;
      avgEl.style.backgroundColor = avgEl.dataset.ccOriginalBg;

      if (avgEl.dataset.ccOriginalTitle) {
        avgEl.setAttribute('title', avgEl.dataset.ccOriginalTitle);
      } else {
        avgEl.removeAttribute('title');
      }
    }

    ratingsFromFavorites() {
      const avgEl = this._getOrInitRatingContainer();
      if (!avgEl) return;

      // OPTIMIZATION: Single loop instead of .map.map.filter chain
      let sum = 0;
      let count = 0;
      document.querySelectorAll('li.favored:not(.current-user-rating) .star-rating .stars').forEach((starEl) => {
        const num = this._parseRatingFromStars(starEl);
        if (Number.isFinite(num)) {
          sum += num * 20;
          count++;
        }
      });

      if (count === 0) return;
      const ratingAverage = Math.round(sum / count);

      const favSpan = avgEl.querySelector('.cc-fav-rating');
      const mainSpan = avgEl.querySelector('.cc-main-rating');

      if (favSpan && mainSpan) {
        favSpan.textContent = `oblíbení: ${ratingAverage}%`;
        favSpan.style.display = 'inline-block';
        mainSpan.style.position = 'absolute';
      }
    }

    clearRatingsFromFavorites() {
      const avgEl = document.querySelector('.box-rating-container .film-rating-average');
      if (!avgEl || !avgEl.dataset.ccInitialized) return;

      const favSpan = avgEl.querySelector('.cc-fav-rating');
      const mainSpan = avgEl.querySelector('.cc-main-rating');

      if (favSpan && mainSpan) {
        favSpan.style.display = 'none';
        mainSpan.style.position = 'static';
      }
    }

    clearRatingsDate() {
      const caption = document.querySelector('.my-rating h3');
      if (!caption) return;
      if (caption.dataset.original) {
        caption.textContent = caption.dataset.original;
        delete caption.dataset.original;
      }
    }

    addRatingsDate() {
      const caption = document.querySelector('.my-rating h3');
      if (!caption) return;

      if (!caption.dataset.original) {
        caption.dataset.original = caption.textContent.trim();
      }

      let ratingText = document.querySelector('span.stars-rating.initialized')?.getAttribute('title') || '';
      if (!ratingText) {
        ratingText = document.querySelector('.mobile-film-rating-detail a span')?.getAttribute('title') || '';
      }
      const match = ratingText.match(/(\d{2}\.\d{2}\.\d{4})/);
      if (match) {
        const ratingDate = match[1];
        caption.innerHTML = `${caption.dataset.original}<br>${ratingDate}`;
      }
    }

    hideSelectedUserReviews() {
      const enabled = getFeatureState(HIDE_SELECTED_REVIEWS_KEY, false);
      const hiddenList = this.cachedHiddenReviewsList; // OPTIMIZATION: Uses memory cache

      document.querySelectorAll('.article-header-review-name').forEach((el) => {
        const title = el.querySelector('.user-title-name');
        if (!title) return;

        const name = title.textContent.trim().toLowerCase();
        const article = el.closest('article');

        if (article) {
          if (enabled && hiddenList.includes(name)) {
            article.style.display = 'none';
          } else {
            article.style.display = '';
          }
        }
      });
    }

    createCurrentPageRecord({ movieId, urlSlug, parentId, parentName, fullUrl, rating, existingRecord }) {
      const computedInfo = this.getCurrentPageComputedInfo();
      return {
        ...(existingRecord || {}),
        id: buildRatingRecordId(this.userSlug, movieId),
        userSlug: this.userSlug,
        movieId,
        url: urlSlug,
        fullUrl,
        name: this.getCurrentPageName() || existingRecord?.name || '',
        year: this.getCurrentPageYear(),
        type: this.getCurrentPageType(),
        rating,
        date: this.getCurrentPageRatingDate() || existingRecord?.date || '',
        parentId,
        parentName,
        computed: computedInfo.isComputed,
        computedCount: computedInfo.computedCount,
        computedFromText: computedInfo.computedFromText,
        lastUpdate: new Date().toISOString(),
      };
    }

    async syncCurrentPageRatingWithIndexedDb() {
      if (!this.userSlug || !this.getIsLoggedIn()) return;

      const pageInfo = this.getCurrentItemUrlAndIds();
      if (!Number.isFinite(pageInfo.movieId) || !pageInfo.urlSlug) return;

      let pageRating = this.getCurrentPageOwnRating();
      if (pageRating === null) {
        await delay(250);
        pageRating = this.getCurrentPageOwnRating();
      }

      const existingRecord = this.stars[pageInfo.movieId];
      const storageId = buildRatingRecordId(this.userSlug, pageInfo.movieId);

      if (pageRating === null) {
        if (existingRecord) {
          const tombstone = {
            ...existingRecord,
            id: storageId,
            rating: null,
            deleted: true,
            lastUpdate: new Date().toISOString(),
          };
          await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, tombstone);
          if (existingRecord.id && existingRecord.id !== storageId) {
            await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, existingRecord.id);
          }
          this.stars[pageInfo.movieId] = tombstone;
          window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
        }
        return;
      }

      const normalizedExistingRating =
        typeof existingRecord === 'number' ? existingRecord : (existingRecord?.rating ?? NaN);

      const currentComputedInfo = this.getCurrentPageComputedInfo();
      const existingComputed = typeof existingRecord === 'object' && existingRecord?.computed === true;
      const existingComputedCount = existingRecord?.computedCount ?? null;
      const currentComputedCount = Number.isFinite(currentComputedInfo.computedCount)
        ? currentComputedInfo.computedCount
        : null;

      const computedUnchanged =
        existingComputed === currentComputedInfo.isComputed &&
        existingComputedCount === currentComputedCount &&
        (existingRecord?.computedFromText || '') === currentComputedInfo.computedFromText;

      if (normalizedExistingRating === pageRating && existingRecord?.id === storageId && computedUnchanged) {
        return;
      }

      const newRecord = this.createCurrentPageRecord({
        ...pageInfo,
        rating: pageRating,
        existingRecord: typeof existingRecord === 'object' ? existingRecord : undefined,
      });

      await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, newRecord);
      if (existingRecord?.id && existingRecord.id !== storageId) {
        await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, existingRecord.id);
      }
      this.stars[pageInfo.movieId] = newRecord;
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
    }

    async loadStarsFromIndexedDb() {
      if (!this.userSlug) return;

      try {
        const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
        const reconciledRecords = reconcileUserRatingRecords(records, this.userSlug);

        if (reconciledRecords.hasChanges) {
          await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, reconciledRecords.normalizedRecords);
          await Promise.all(
            reconciledRecords.staleRecordIds.map((recordId) =>
              deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, recordId),
            ),
          );
        }

        const userRecords = reconciledRecords.normalizedRecords;

        for (const record of userRecords) {
          this.stars[record.movieId] = record;
        }
      } catch (error) {
        console.error('[CC] Failed to load stars from IndexedDB:', error);
      }
    }

    getCandidateFilmLinks() {
      const searchRoot = this.csfdPage || document;
      const searchRoots = [searchRoot];
      const movieSidebar = document.querySelector('aside.aside-movie-profile');

      if (movieSidebar && !searchRoot.contains(movieSidebar)) {
        searchRoots.push(movieSidebar);
      }

      const showInReviews = getFeatureState(SHOW_RATINGS_IN_REVIEWS_KEY);
      const showInForeignReviews = getFeatureState(SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY, true);
      const showInDiaries = getFeatureState(SHOW_RATINGS_IN_DIARIES_KEY, true); // ZDE

      const isCreatorPage = this.isOnCreatorPage();
      const isUserReviewsPage = this.isOnUserReviewsPage();
      this.isOnUserOverviewPage();
      const isOtherUser = this.isOnOtherUserProfilePage();
      const isOwnProfile = this.isOnUserProfilePage() && !isOtherUser;

      // Links pointing to sections that are not actual film pages
      const ignorePathRegex = new RegExp(String.raw`\/(?:${GALLERY_PATHS_PATTERN}|videa?|tvurci|obsahy?)\/`, 'i');
      // Links containing 'page' or 'comment' query parameters (usually pagination or comment links)
      const ignoreParamRegex = /[?&](page|comment|modal|review)=/i;
      // Links missing the expected numeric ID pattern (e.g., "/12345-slug/")
      const validFilmRegex = /\/\d+-/;

      return Array.from(
        new Set(searchRoots.flatMap((root) => Array.from(root.querySelectorAll('a[href*="/film/"]')))),
      ).filter((link) => {
        const href = link.getAttribute('href') || '';

        if (!validFilmRegex.test(href) || ignoreParamRegex.test(href) || ignorePathRegex.test(href)) {
          return false;
        }

        // Exclude links in /tvurce/ (creator) pages except for those in the filmography section
        if (isCreatorPage && link.closest('.creator-filmography')) return false;

        // Exclude links that are likely for editing reviews (identified by classes or icons)
        if (
          link.classList.contains('edit-review') ||
          link.matches('[class*="edit-review"]') ||
          link.querySelector('.icon-edit-square, img')
        ) {
          return false;
        }

        // Include links in related boxes only if they match the film title pattern
        if (link.closest('section.box-related, div.box-related, .box-related')) {
          return link.classList.contains('film-title-name');
        }

        // Exclude links in the ratings comparison table (/profile/xxx/prehled) to not duplicate the title links
        if (link.closest('.cc-compare-ratings-table')) {
          return false;
        }

        const linkText = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
        if (linkText === 'více' || linkText === 'viac') return false;

        const isTitleLink = link.classList.contains('film-title-name');
        const isMovieSidebarTitleLink = isTitleLink && link.closest('aside.aside-movie-profile .article-header') !== null;
        const inlineRatingContext = this.getInlineRatingContext(link);
        const isDiaryLink = inlineRatingContext === 'diary';
        const isReviewTextLink = inlineRatingContext === 'review';

        if (isDiaryLink) {
          // Diaries should be treated differently
          if (!showInDiaries) return false;
        } else if (isReviewTextLink) {
          // Review text links should be treated differently and also depend on whether it's own or foreign profile
          if (isOtherUser) {
            if (!showInForeignReviews) return false;
          } else {
            if (!showInReviews) return false;
          }
        }

        if (isOwnProfile && isTitleLink) {
          if (isUserReviewsPage) return false;
          if (link.closest('.last-ratings table')) return false;
          // On the overview page, we want to include the title links in the main sections but exclude those in the review/rating sections to avoid duplicates and false positives
          if (this.shouldSkipProfileSectionLink(link)) return false;
        }

        if (link.closest(LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS) && !isMovieSidebarTitleLink) {
          return false;
        }

        return true;
      });
    }

    getResolvedUserSlug() {
      if (this.userSlug) return this.userSlug;

      const resolvedUserSlug = extractUserSlug(this.userUrl || this.getCurrentUser());
      if (resolvedUserSlug) {
        this.userSlug = resolvedUserSlug;
      }

      return resolvedUserSlug;
    }

    isOnOwnRatingsPage() {
      const currentUserSlug = this.getResolvedUserSlug();
      if (!currentUserSlug) return false;
      const path = location.pathname || '';
      return (
        path.startsWith(`/uzivatel/${currentUserSlug}/`) &&
        new RegExp(`\/(${RATINGS_SEGMENTS_PATTERN})\/`, 'i').test(path)
      );
    }

    isOnCreatorPage() {
      return new RegExp(String.raw`^\/(${CREATOR_PATHS_PATTERN$1})\/\d+-[^/]+\/`, 'i').test(location.pathname || '');
    }

    isOnUserProfilePage() {
      return extractUserSlug(location.pathname);
    }

    isOnOtherUserProfilePage() {
      const pageUserSlug = this.isOnUserProfilePage();
      const currentUserSlug = this.getResolvedUserSlug();
      return Boolean(pageUserSlug && currentUserSlug && pageUserSlug !== currentUserSlug);
    }

    isOnUserOverviewPage() {
      return new RegExp(`^\/uzivatel\/\d+-[^/]+\/(${OVERVIEW_SEGMENTS_PATTERN$1})(\/|$)`, 'i').test(
        location.pathname || '',
      );
    }

    isOnUserReviewsPage() {
      return new RegExp(`^\/uzivatel\/\d+-[^/]+\/(${REVIEWS_SEGMENTS_PATTERN$1})(\/|$)`, 'i').test(location.pathname || '');
    }

    /**
     * Determines if a given link on the user overview page should be skipped when looking for film links,
     * based on its context in the DOM. Returns 'true' if the links should be skipped
     * @param {*} link
     * @returns {boolean}
     */
    shouldSkipProfileSectionLink(link) {
      if (!this.isOnUserOverviewPage()) return false;

      const explicitReviewOrRatingContainer = link.closest(
        '[id*="review" i], [id*="recenz" i], [id*="rating" i], [id*="hodnoc" i], [id*="hodnoten" i], [class*="review" i], [class*="recenz" i], [class*="rating" i], [class*="hodnoc" i], [class*="hodnoten" i]',
      );
      const explicitDiaryContainer = link.closest(
        '[id*="diar" i], [id*="denik" i], [id*="denic" i], [class*="diar" i], [class*="denik" i], [class*="denic" i]',
      );

      if (explicitReviewOrRatingContainer && !explicitDiaryContainer) return true;

      const searchRoot = this.csfdPage || document.body;
      let sectionNode = link;

      while (sectionNode && sectionNode !== searchRoot && sectionNode !== document.body) {
        if (!(sectionNode instanceof HTMLElement)) {
          sectionNode = sectionNode.parentElement;
          continue;
        }

        const titleEl = sectionNode.querySelector(
          ':scope > .box-header h2, :scope > .box-header h3, :scope > .updated-box-header h2, :scope > .updated-box-header h3, :scope > header h2, :scope > header h3, :scope > a[data-cc-header-wrapper] > .box-header h2, :scope > a[data-cc-header-wrapper] > .box-header h3, :scope > a[data-cc-header-wrapper] > .updated-box-header h2, :scope > a[data-cc-header-wrapper] > .updated-box-header h3, :scope > h2, :scope > h3',
        );
        const sectionTitle = titleEl?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

        if (sectionTitle) {
          if (matchesCsfdTextVariant('recentReviewsOrRatingsHeading', sectionTitle)) return true;
          if (matchesCsfdTextVariant('recentDiaryHeading', sectionTitle)) return false;
        }
        sectionNode = sectionNode.parentElement;
      }
      return false;
    }

    hasNativeTitleRating(link) {
      if (!(link instanceof Element)) return false;

      const titleContainer = link.closest('h1, h2, h3, h4, h5, h6, .film-title-inline, .film-title-ellipsis');
      if (!titleContainer) return false;

      return Boolean(titleContainer.querySelector('.star-rating:not(.cc-own-rating)'));
    }

    getRatingsPageSlug() {
      return (location.pathname || '').match(
        new RegExp(`^\/uzivatel\/(\d+-[^/]+)\/(${RATINGS_SEGMENTS_PATTERN})\/?`, 'i'),
      )?.[1];
    }

    isOnForeignRatingsPage() {
      const ratingsPageSlug = this.getRatingsPageSlug();
      const currentUserSlug = this.getResolvedUserSlug();
      return Boolean(ratingsPageSlug && currentUserSlug && ratingsPageSlug !== currentUserSlug);
    }

    async addComparisonColumnOnOverviewPage() {
      const table = document.querySelector('.last-ratings table');

      if (!table) return;

      console.debug('🔵 Found ratings table on overview page, adding comparison column');
      table.classList.add('cc-compare-ratings-table');

      const rows = Array.from(table.querySelectorAll('tbody tr')).filter(
        (row) => row.querySelector('td.name a[href*="/film/"]') && row.querySelector('td.star-rating-only'),
      );

      for (const row of rows) {
        if (row.querySelector('td.cc-my-rating-cell')) continue;

        const nameLink = row.querySelector('td.name a[href*="/film/"]');
        const ratingCell = row.querySelector('td.star-rating-only');
        const movieId = await getMovieIdFromUrl(nameLink.getAttribute('href'));
        const ratingRecord = this.stars[movieId];

        const myRatingCell = document.createElement('td');
        myRatingCell.className = 'cc-my-rating-cell star-rating-only';
        myRatingCell.style.textAlign = 'right';

        if (ratingRecord && ratingRecord.deleted !== true) {
          const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
          const isComputed = ratingRecord?.computed === true;
          // The 'true' at the end forces the outlined box style
          const starElement = this.createStarElement(ratingValue, isComputed, ratingRecord?.computedCount, true);
          if (starElement) {
            starElement.classList.remove('cc-own-rating');
            myRatingCell.appendChild(starElement);
          }
        }
        // ratingCell.insertAdjacentElement('beforebegin', myRatingCell);
        ratingCell.insertAdjacentElement('afterend', myRatingCell);
      }
    }

    async addComparisonColumnOnForeignRatingsPage() {
      const getRatingsTables = () =>
        Array.from(
          document.querySelectorAll('#snippet--ratings table, #snippet-ratings table, .snippet-ratings table, table'),
        ).filter(
          (table) => table.querySelector('td.star-rating-only') && table.querySelector('td.name a[href*="/film/"]'),
        );

      let ratingsTables = getRatingsTables();
      if (!ratingsTables.length) {
        await delay(350);
        ratingsTables = getRatingsTables();
        if (!ratingsTables.length) return;
      }

      for (const table of ratingsTables) {
        table.classList.add('cc-compare-ratings-table');

        const rows = Array.from(table.querySelectorAll('tbody tr')).filter(
          (row) => row.querySelector('td.name a[href*="/film/"]') && row.querySelector('td.star-rating-only'),
        );

        if (!rows.length) continue;

        const headerRow = table.querySelector('thead tr');
        if (headerRow && !headerRow.querySelector('.cc-my-rating-col')) {
          const colHeader = document.createElement('th');
          colHeader.className = 'cc-my-rating-col';
          colHeader.textContent = 'Moje';
          colHeader.style.textAlign = 'right';
          const ratingHeader = headerRow.querySelector('th.star-rating-only');
          // ratingHeader ? ratingHeader.insertAdjacentElement('beforebegin', colHeader) : headerRow.appendChild(colHeader);
          ratingHeader ? ratingHeader.insertAdjacentElement('afterend', colHeader) : headerRow.appendChild(colHeader);
        }

        for (const row of rows) {
          if (row.querySelector('td.cc-my-rating-cell')) continue;

          const nameLink = row.querySelector('td.name a[href*="/film/"]');
          const ratingCell = row.querySelector('td.star-rating-only');
          const movieId = await getMovieIdFromUrl(nameLink.getAttribute('href')); // REFACTOR: uses utils.js
          const ratingRecord = this.stars[movieId];

          const myRatingCell = document.createElement('td');
          myRatingCell.className = 'cc-my-rating-cell star-rating-only';
          myRatingCell.style.textAlign = 'right';

          if (ratingRecord) {
            const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
            const isComputed = ratingRecord?.computed === true;
            const starElement = this.createStarElement(ratingValue, isComputed, ratingRecord?.computedCount);
            if (starElement) {
              starElement.classList.remove('cc-own-rating');
              myRatingCell.appendChild(starElement);
            }
          }
          // ratingCell.insertAdjacentElement('beforebegin', myRatingCell);
          ratingCell.insertAdjacentElement('afterend', myRatingCell);
        }
      }
    }

    createStarElement(ratingValue, isComputed = false, computedCount = NaN, outlined = false) {
      if (!Number.isFinite(ratingValue)) return undefined;

      const starRating = document.createElement('span');
      starRating.className = 'star-rating cc-own-rating';
      if (outlined) starRating.classList.add('cc-own-rating-foreign-profile');
      if (isComputed) starRating.classList.add('computed', 'cc-own-rating-computed');

      const stars = document.createElement('span');
      stars.className = 'stars';

      if (ratingValue === 0) {
        stars.classList.add('trash');
        stars.textContent = 'odpad!';
      } else {
        stars.classList.add(`stars-${Math.min(5, Math.max(1, ratingValue))}`);
      }

      starRating.appendChild(stars);

      if (isComputed && Number.isFinite(computedCount) && computedCount > 0) {
        const sup = document.createElement('sup');
        sup.className = 'cc-own-rating-computed-count';
        sup.textContent = ` (${computedCount})`;
        starRating.appendChild(sup);
      }

      return starRating;
    }

    isInlineTextRatingLink(link) {
      if (!(link instanceof Element)) return false;

      return Boolean(
        link.closest('[data-film-review-content], span.comment') ||
        link.closest(
          '.diary-post .article-content.article-content-justify p, .diary-post .article-content.article-content-justify li',
        ) ||
        link.closest(
          'article.article-forum .article-content.article-content-icons p, article.article-forum .article-content.article-content-icons li',
        ) ||
        link.closest(
          '.article-news-content.article-content-justify p, .article-news-content.article-content-justify li',
        ) ||
        this.getInlineRatingContext(link),
      );
    }

    getInlineRatingContext(link) {
      if (!(link instanceof Element)) return undefined;

      if (
        link.closest(
          '.diary-post .article-content.article-content-justify p, .diary-post .article-content.article-content-justify li',
        )
      ) {
        return 'diary';
      }

      if (
        link.closest('[data-film-review-content], span.comment') ||
        link.closest(
          'article.article-forum .article-content.article-content-icons p, article.article-forum .article-content.article-content-icons li',
        ) ||
        link.closest('.article-news-content.article-content-justify p, .article-news-content.article-content-justify li')
      ) {
        return 'review';
      }

      const favoritesActivityTextContainer = link.closest('.favorite-users-ratings .article-content-reviewtext');
      const favoritesInlineTextNode = link.closest(
        '.favorite-users-ratings .article-content-reviewtext p, .favorite-users-ratings .article-content-reviewtext li',
      );

      if (favoritesActivityTextContainer && favoritesInlineTextNode && !link.closest('h1, h2, h3, h4, h5, h6')) {
        const activityLeadText =
          favoritesActivityTextContainer.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

        if (/(den[ií]čku|den[ií]k)/i.test(activityLeadText)) {
          return 'diary';
        }

        if (/(recenzoval|komentoval|diskutoval)/i.test(activityLeadText)) {
          return 'review';
        }
      }

      if (this.isOnUserReviewsPage() && !link.classList.contains('film-title-name')) {
        return 'review';
      }

      return undefined;
    }

    createInlineRatingGroup(link, starElement) {
      const group = document.createElement('span');
      group.className = 'cc-own-rating-inline';
      group.append(document.createTextNode('\u00A0'), starElement);
      link.after(group);
      return group;
    }

    makeTrailingHyphenUnbreakable(link) {
      if (!(link instanceof Element)) return;

      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });

      const textNodes = [];
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
      }

      const lastTextNode = textNodes.at(-1);
      if (!lastTextNode?.textContent) return;

      const text = lastTextNode.textContent;
      const trailingWhitespaceMatch = text.match(/\s*$/);
      const trailingWhitespace = trailingWhitespaceMatch?.[0] || '';
      const contentEnd = text.length - trailingWhitespace.length;
      if (contentEnd <= 0) return;

      const content = text.slice(0, contentEnd);
      const lastWhitespaceIndex = content.search(/\s+[^\s]*$/);
      const tokenStart = lastWhitespaceIndex >= 0 ? lastWhitespaceIndex + 1 : 0;
      const prefix = content.slice(0, tokenStart);
      const token = content.slice(tokenStart);

      if (!token.includes('-')) return;

      lastTextNode.textContent = `${prefix}${token.replace(/-/g, '\u2011')}${trailingWhitespace}`;
    }

    async addStars() {
      if (!getFeatureState(SHOW_RATINGS_KEY)) {
        console.debug('🟣 Ratings not added: SHOW_RATINGS_KEY disabled');
        return;
      }

      if (location.href.match(/\/(zebricky|rebricky)\//)) {
        console.debug('🟣 Ratings not added: on leaderboards page');
        return;
      }
      if (this.isOnUserReviewsPage() && !this.isOnOtherUserProfilePage()) {
        console.debug('🟣 Ratings not added: on user reviews page (not other user)');
        return;
      }
      if (this.isOnOwnRatingsPage()) {
        console.debug('🟣 Ratings not added: on own ratings page');
        return;
      }

      const isForeignProfilePage = this.isOnOtherUserProfilePage();
      const hasForeignOverviewRatingsTable = Boolean(
        isForeignProfilePage && document.querySelector('.last-ratings table'),
      );
      const hasForeignRatingsPageTable = Boolean(
        isForeignProfilePage &&
        document.querySelector('#snippet--ratings table, #snippet-ratings table, .snippet-ratings table'),
      );

      if (this.isOnForeignRatingsPage() || hasForeignRatingsPageTable) {
        console.debug('🟣 Ratings not added: on foreign ratings page — adding comparison column instead');
        return this.addComparisonColumnOnForeignRatingsPage();
      }

      // Handle the header-less table on the Overview page
      if ((this.isOnUserOverviewPage() && isForeignProfilePage) || hasForeignOverviewRatingsTable) {
        console.debug('🟣 On other user overview page — adding column to last ratings table');
        await this.addComparisonColumnOnOverviewPage();
      }

      const links = this.getCandidateFilmLinks();
      console.debug(`🔵 Found ${links.length} candidate links for adding ratings`);
      console.debug({ links });
      const outlinedOnThisPage =
        isForeignProfilePage || /^\/soukrome\/oblibeni-uzivatele\/(\?|$)/i.test(location.pathname || '');

      for (const link of links) {
        if (link.dataset.ccStarAdded === 'true') continue;

        if (
          link.classList.contains('film-title-name') &&
          this.hasNativeTitleRating(link) &&
          !this.isOnOtherUserProfilePage()
        ) {
          continue;
        }

        const movieId = await getMovieIdFromUrl(link.getAttribute('href')); // REFACTOR: uses utils.js
        const ratingRecord = this.stars[movieId];
        if (!ratingRecord || ratingRecord.deleted === true) continue;

        const ratingValue = typeof ratingRecord === 'number' ? ratingRecord : ratingRecord?.rating;
        const isComputed = ratingRecord?.computed === true;
        const starElement = this.createStarElement(
          ratingValue,
          isComputed,
          ratingRecord?.computedCount,
          outlinedOnThisPage,
        );

        if (!starElement) continue;

        // Check if we are inside a list item that has a dedicated .time-rating block (TV program pages)
        const listItem = link.closest('.program-item, .box-item, article, li, tr');
        const timeRatingDiv = listItem ? listItem.querySelector('.time-rating') : null;

        if (timeRatingDiv) {
          timeRatingDiv.appendChild(starElement);
        } else {
          const headingAncestor = link.closest('h1, h2, h3, h4, h5, h6');
          if (headingAncestor && link.classList.contains('film-title-name')) {
            link.insertAdjacentElement('afterend', starElement);
          } else if (headingAncestor) {
            headingAncestor.appendChild(starElement);
          } else if (this.isInlineTextRatingLink(link)) {
            this.makeTrailingHyphenUnbreakable(link);
            this.createInlineRatingGroup(link, starElement);
          } else {
            link.insertAdjacentElement('afterend', starElement);
          }
        }

        link.dataset.ccStarAdded = 'true';
      }
    }

    isOnGalleryPage() {
      return new RegExp(String.raw`\/(?:${GALLERY_PATHS_PATTERN})\/`, 'i').test(location.pathname || '');
    }

    isGalleryImageLinksEnabled() {
      return getFeatureState(GALLERY_IMAGE_LINKS_ENABLED_KEY);
    }

    areLinkIconsEnabled() {
      return getFeatureState(LINK_ICONS_ENABLED_KEY, true);
    }

    getLinkIconsPosition() {
      return localStorage.getItem(LINK_ICONS_POSITION_KEY) === 'after' ? 'after' : 'before';
    }

    addConfiguredLinkIcons(root = this.csfdPage || document) {
      applyConfiguredLinkIcons(root, {
        iconsEnabled: this.areLinkIconsEnabled(),
        position: this.getLinkIconsPosition(),
        isProviderEnabled: (provider) => getFeatureState(provider.storageKey, true),
      });
    }

    refreshLinkIcons(root = this.csfdPage || document) {
      refreshConfiguredLinkIcons(root, {
        iconsEnabled: this.areLinkIconsEnabled(),
        position: this.getLinkIconsPosition(),
        isProviderEnabled: (provider) => getFeatureState(provider.storageKey, true),
      });
    }

    clearGalleryImageFormatLinks() {
      document.querySelectorAll('.cc-gallery-size-links').forEach((el) => el.remove());
      document.querySelectorAll('.cc-gallery-size-host').forEach((el) => el.classList.remove('cc-gallery-size-host'));
      document.querySelectorAll('.gallery-item picture[data-cc-gallery-links-bound="true"]').forEach((el) => {
        delete el.dataset.ccGalleryLinksBound;
      });
    }

    getGalleryImageFormatLinks(pictureEl) {
      const widthLinks = [];
      const seenHrefs = new Set();

      const addWidthCandidate = (rawUrl) => {
        if (!rawUrl) return;
        const widthMatch = rawUrl.match(/[/]w(\d+)(?:h\d+)?[/]/i);
        if (!widthMatch) return;

        const absoluteUrl = new URL(rawUrl, location.origin).toString();
        if (seenHrefs.has(absoluteUrl)) return;

        seenHrefs.add(absoluteUrl);
        widthLinks.push({ width: Number.parseInt(widthMatch[1], 10), href: absoluteUrl });
      };

      pictureEl.querySelectorAll('source').forEach((sourceEl) => {
        const candidates = (sourceEl.getAttribute('srcset') || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        candidates.forEach((candidate) => addWidthCandidate(candidate.split(/\s+/, 1)[0]));
      });

      const imgEl = pictureEl.querySelector('img');
      addWidthCandidate(imgEl?.getAttribute('src'));

      const imgSrcsetCandidates = (imgEl?.getAttribute('srcset') || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      imgSrcsetCandidates.forEach((candidate) => addWidthCandidate(candidate.split(/\s+/, 1)[0]));

      addWidthCandidate(pictureEl.closest('figure')?.querySelector('a.btn-photo-share')?.getAttribute('href'));

      const uniqueByWidth = [];
      const seenWidths = new Set();

      widthLinks
        .sort((a, b) => b.width - a.width)
        .forEach((link) => {
          if (!seenWidths.has(link.width)) {
            seenWidths.add(link.width);
            uniqueByWidth.push(link);
          }
        });

      if (!uniqueByWidth.length) return [];

      return [
        { label: '100 %', href: uniqueByWidth[0].href },
        ...uniqueByWidth.map((item) => ({ label: String(item.width), href: item.href })),
      ];
    }

    async addGalleryImageFormatLinks() {
      if (!this.isOnGalleryPage()) return;

      if (!this.isGalleryImageLinksEnabled()) {
        return this.clearGalleryImageFormatLinks();
      }

      document.querySelectorAll('.gallery-item picture').forEach((pictureEl) => {
        if (pictureEl.dataset.ccGalleryLinksBound === 'true') return;

        const links = this.getGalleryImageFormatLinks(pictureEl);
        if (!links.length || !pictureEl.parentElement) {
          pictureEl.dataset.ccGalleryLinksBound = 'true';
          return;
        }

        const host = pictureEl.parentElement;
        host.classList.add('cc-gallery-size-host');

        const linksWrapper = document.createElement('div');
        linksWrapper.className = 'cc-gallery-size-links';

        links.forEach((linkDef) => {
          const anchor = document.createElement('a');
          anchor.className = 'cc-gallery-size-link';
          anchor.href = linkDef.href;
          anchor.textContent = linkDef.label;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          linksWrapper.appendChild(anchor);
        });

        host.appendChild(linksWrapper);
        pictureEl.dataset.ccGalleryLinksBound = 'true';
      });
    }

    /**
     * Adds a "Reagovat" button to the logged-in user's own discussion posts.
     * Uses a Vanilla JS proxy-click to trigger the native ČSFD UI.
     */
    enableSelfReplyInDiscussions() {
      if (!new RegExp(String.raw`\/(?:${DISCUSSION_PATHS_PATTERN})\/`, 'i').test(window.location.pathname || '')) return;
      if (!getFeatureState(SELF_REPLY_IN_DISCUSSIONS_KEY, true)) return;

      const posts = document.querySelectorAll('article.article-forum');

      posts.forEach((post) => {
        const actionsContainer = post.querySelector('.icon-control');
        if (!actionsContainer) return;

        const hasReplyBtn = actionsContainer.querySelector('.reply-add');

        // If missing, it's your post. Let's inject our proxy button.
        if (!hasReplyBtn) {
          const authorLink = post.querySelector('.article-header-message a.user-title-name');
          if (!authorLink) return;

          // Extract your user info and post ID
          const href = authorLink.getAttribute('href') || '';
          const userMatch = href.match(/\/uzivatel\/(\d+)-([^/]+)\//);
          if (!userMatch) return;

          const userId = userMatch[1];
          const username = authorLink.textContent.trim();

          const articleId = post.getAttribute('id') || '';
          const postMatch = articleId.match(/highlight-post-(\d+)/);
          if (!postMatch) return;

          const postId = postMatch[1];

          // Create our visual button
          const replyBtn = document.createElement('a');
          replyBtn.href = '#';
          replyBtn.className = 'button button-circle reply-add cc-self-reply';
          replyBtn.title = 'Odpovědět (CC)';
          replyBtn.innerHTML = '<i class="icon icon-reply"></i>';

          // The magic: Proxy the click to an existing native button
          replyBtn.addEventListener('click', (e) => {
            e.preventDefault();

            // Find any valid native button on the page from another user
            const nativeBtn = document.querySelector('a.reply-add:not(.cc-self-reply)');

            if (nativeBtn) {
              console.debug(`[CC] Proxying reply click to native button for ${username}`);

              // 1. Backup the native button's original values
              const origNick = nativeBtn.getAttribute('data-nick');
              const origId = nativeBtn.getAttribute('data-id');
              const origPost = nativeBtn.getAttribute('data-post');

              // 2. Override with your post's values
              nativeBtn.setAttribute('data-nick', username);
              nativeBtn.setAttribute('data-id', userId);
              nativeBtn.setAttribute('data-post', postId);

              // 3. Dispatch the native click (this triggers ČSFD's UI formatting)
              nativeBtn.click();

              // 4. Restore the native button immediately so it isn't permanently broken
              nativeBtn.setAttribute('data-nick', origNick);
              nativeBtn.setAttribute('data-id', origId);
              nativeBtn.setAttribute('data-post', origPost);
            } else {
              console.debug('[CC] No native button found. Using simple fallback.');

              // Fallback just in case you are the ONLY person in the discussion
              const textToInsert = `@${username} `;
              if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
                tinymce.activeEditor.execCommand('mceInsertContent', false, textToInsert);
                tinymce.activeEditor.focus();
              } else {
                const textarea = document.querySelector('form textarea#frm-forum-postForm-text');
                if (textarea) {
                  textarea.value = textarea.value ? `${textarea.value} ${textToInsert}` : textToInsert;
                  textarea.focus();
                }
              }
            }
          });

          // Insert our button into the actions bar
          actionsContainer.insertBefore(replyBtn, actionsContainer.firstChild);
        }
      });
    }

    clearSelfReplyInDiscussions() {
      document.querySelectorAll('.cc-self-reply').forEach((btn) => btn.remove());
    }
  }

  function styleInject(css, ref) {
    if ( ref === void 0 ) ref = {};
    var insertAt = ref.insertAt;

    if (typeof document === 'undefined') { return; }

    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';

    if (insertAt === 'top') {
      if (head.firstChild) {
        head.insertBefore(style, head.firstChild);
      } else {
        head.appendChild(style);
      }
    } else {
      head.appendChild(style);
    }

    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
  }

  var css_248z = ".dropdown-content.cc-settings{background-color:#fff!important;border:1px solid #eaeaea;border-radius:8px;border-top:none;-webkit-box-shadow:0 12px 34px rgba(0,0,0,.15),0 4px 12px rgba(0,0,0,.08);box-shadow:0 12px 34px rgba(0,0,0,.15),0 4px 12px rgba(0,0,0,.08);-webkit-box-sizing:border-box;box-sizing:border-box;display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:0;overflow:hidden;padding:0;right:8px!important;top:100%;width:360px;z-index:10000!important;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;max-height:min(65vh,calc(100vh - 48px));min-height:0}header.page-header.user-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings,header.page-header.user-not-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings{left:auto;margin-top:-4px;right:0;z-index:10000!important}.dropdown-content.cc-settings.cc-settings-pinned-root{border-radius:10px;border-top:1px solid #eaeaea;display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;left:auto;margin-top:0!important;max-height:min(65vh,calc(100vh - 60px));opacity:1!important;position:fixed!important;right:30px;top:30px;visibility:visible!important;width:388px;z-index:10020!important}.cc-settings-shell{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;height:100%;min-height:0;width:100%}.cc-settings-shell-foot,.cc-settings-shell-head{-webkit-box-flex:0;background:#fff;-ms-flex:0 0 auto;flex:0 0 auto}.cc-settings-shell-head{border-bottom:1px solid #efefef}.cc-settings-shell-foot{border-top:1px solid #efefef}.cc-settings-shell-body{background:#fff;display:-webkit-box;display:-ms-flexbox;display:flex;overflow:hidden}.cc-settings-scroll-region,.cc-settings-shell-body{-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;min-height:0}.cc-settings-scroll-region{overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}.cc-head-tools .cc-settings-pin-close{display:none!important}.dropdown-content.cc-settings.cc-settings-pinned-root .cc-settings-pin-close{display:-webkit-inline-box!important;display:-ms-inline-flexbox!important;display:inline-flex!important}.dropdown-content.cc-settings .dropdown-content-head{position:relative}.dropdown-content.cc-settings.cc-settings-pinned-root .right-head{padding-right:34px;position:relative}.dropdown-content.cc-settings.cc-settings-pinned-root .cc-settings-pin-close{position:absolute;right:0;top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%)}.dropdown-content.cc-settings.cc-settings-pinned-root .left-head{cursor:move;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.dropdown-content.cc-settings.cc-settings-pinned-root .left-head a,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head button,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head input,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head select,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head textarea{cursor:pointer}.dropdown-content.cc-settings .cc-settings-section,.dropdown-content.cc-settings .dropdown-content-head{-webkit-box-sizing:border-box;box-sizing:border-box;margin:0;width:100%}.cc-settings-section .cc-settings-section-content{-webkit-box-sizing:border-box;box-sizing:border-box;padding:10px;width:100%}.cc-settings-section+.cc-settings-section .cc-settings-section-content{border-top:1px solid #efefef}.cc-settings-shell-body .cc-settings-section:first-child .cc-settings-section-content,.cc-settings-shell-foot .cc-settings-section+.cc-settings-section .cc-settings-section-content,.cc-settings-shell-head .cc-settings-section+.cc-settings-section .cc-settings-section-content{border-top:none}.dropdown-content.cc-settings .left-head{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;gap:2px}.dropdown-content.cc-settings .left-head h2{line-height:1.1;margin:0}.user-link.csfd-compare-menu{position:relative}.cc-menu-update-pill{background:#ffefbe;border:1px solid #efdb9d;border-radius:10px;-webkit-box-sizing:border-box;box-sizing:border-box;color:rgba(70,50,0,.733);font-size:10px;font-weight:700;height:16px;line-height:14px;min-width:16px;opacity:0;padding:0 4px;position:absolute;right:0;text-align:center;top:3px}.cc-menu-update-pill.is-visible{opacity:1;-webkit-transform:translateY(0);transform:translateY(0)}.cc-version-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px}.cc-version-link{color:#555;font-size:11px;line-height:1;opacity:.9;text-decoration:none}.cc-version-link:hover{color:#aa2c16;text-decoration:underline}.cc-version-status{background:#b8b8b8;border-radius:999px;display:inline-block;height:8px;opacity:0;pointer-events:none;text-decoration:none;-webkit-transition:opacity .18s ease;transition:opacity .18s ease;width:8px}.cc-version-status.is-visible{opacity:1}.cc-version-status.is-checking{background:#9ca3af}.cc-version-status.is-ok{background:rgba(52,191,36,.69)}.cc-version-status.is-error{background:#9b9b9b}.cc-version-status.is-update{background:#ffefbe;border:1px solid #efdb9d;border-radius:999px;color:#6d5200;font-size:10px;font-weight:700;height:auto;letter-spacing:.02em;line-height:1.3;padding:1px 6px;pointer-events:auto;white-space:nowrap;width:auto}.cc-version-status.is-update:hover{background:#f8e39b;border-color:#d7bf72;color:#5f4700}.cc-head-right,.cc-head-tools{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-version-info-btn{font-weight:700}.cc-version-info-btn svg{height:15px;width:15px}.cc-sync-icon-btn{border:1px solid #cfcfcf;border-radius:8px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:28px;width:28px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;color:#202020;cursor:pointer;justify-content:center;padding:0;text-decoration:none;-webkit-transition:background-color .15s ease,border-color .15s ease,color .15s ease;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.cc-sync-icon-btn:focus-visible,.cc-sync-icon-btn:hover{background:#f3f3f3;border-color:#bdbdbd;color:#aa2c16;outline:none}.cc-sync-icon-btn.is-enabled{background:#cae8cd!important;border-color:#6bb475!important;color:#184e21!important}.cc-badge{background-color:#2c3e50;border-radius:6px;color:#fff;cursor:help;font-size:11.2px;font-size:.7rem;font-weight:700;line-height:1.4;padding:2px 6px}.cc-badge-red{background-color:#aa2c16}.cc-badge-black{background-color:#000}.cc-button{border:none;border-radius:7px;color:#fff;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;padding:6px 8px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;cursor:pointer;font-size:12px;font-weight:600;height:auto;justify-content:center;line-height:1.2;-webkit-transition:background .2s,-webkit-transform .12s;transition:background .2s,-webkit-transform .12s;transition:background .2s,transform .12s;transition:background .2s,transform .12s,-webkit-transform .12s}.cc-button:hover{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-button:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-button-red{background-color:#aa2c16}.cc-button-red:hover{background-color:#8b2414}.cc-button-red:active{background-color:#7a1f12}.cc-button-black{background-color:#242424!important;color:#fff!important}#cc-load-computed-btn:hover,.cc-button-black:active,.cc-button-black:focus,.cc-button-black:hover{background-color:#000!important;-webkit-box-shadow:none!important;box-shadow:none!important;color:#fff!important;outline:none!important}.cc-button-iconed{gap:5px}.cc-button-icon,.cc-button-iconed{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-button-icon{height:12px;width:12px}.cc-settings-actions{display:grid;gap:5px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.cc-settings-actions .cc-button{min-width:0;width:100%}.cc-settings-actions .cc-button-iconed span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-section-title{color:#444;font-size:12px;font-weight:700;margin:0 0 8px}.cc-category-title{border-top:1px solid #f0f0f0;color:#1f4f8f;font-size:12px;font-weight:700;margin:14px 0 6px;padding-top:10px}.cc-category-title.cc-category-first{border-top:none;margin-top:0;padding-top:0}.cc-config-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;gap:5px}.cc-config-list>.cc-setting-row{padding-left:9px;padding-right:9px}.cc-setting-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-backface-visibility:hidden;backface-visibility:hidden;background-color:#fff;border-radius:4px;contain:layout;gap:8px;padding:2px 0;position:relative;-webkit-transform:translateZ(0);transform:translateZ(0);z-index:1}.cc-setting-row:hover{background:#f8f8f8;z-index:10}.cc-setting-label{color:#444;cursor:inherit;font-size:11px;font-weight:500;line-height:1.3}.cc-setting-label-content{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-link-icons-preview-after .cc-setting-label-content-with-leading-icon{-webkit-box-orient:horizontal;-webkit-box-direction:reverse;-ms-flex-direction:row-reverse;flex-direction:row-reverse}.cc-link-icons-preview-after .cc-setting-row,.cc-link-icons-preview-before .cc-setting-row{min-height:24px}.cc-setting-leading-icon{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;height:16px;justify-content:center;width:16px;-webkit-box-flex:0;-ms-flex:0 0 16px;flex:0 0 16px;line-height:1;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-setting-leading-icon svg{display:block;height:100%;width:100%}.cc-switch{display:inline-block;height:16px;position:relative;width:28px;-ms-flex-negative:0;flex-shrink:0}.cc-switch input{opacity:0;pointer-events:none;position:absolute}.cc-switch-bg{background-color:#d4d4d4;border-radius:20px;bottom:0;cursor:pointer;left:0;right:0;top:0}.cc-switch-bg,.cc-switch-bg:before{position:absolute;-webkit-transition:.25s ease;transition:.25s ease}.cc-switch-bg:before{background-color:#fff;border-radius:50%;bottom:2px;-webkit-box-shadow:0 1px 2px rgba(0,0,0,.2);box-shadow:0 1px 2px rgba(0,0,0,.2);content:\"\";height:12px;left:2px;width:12px}.cc-switch input:checked+.cc-switch-bg{background-color:#aa2c16}.cc-switch input:focus-visible+.cc-switch-bg{-webkit-box-shadow:0 0 0 2px rgba(170,44,22,.4);box-shadow:0 0 0 2px rgba(170,44,22,.4)}.cc-switch input:checked+.cc-switch-bg:before{-webkit-transform:translateX(12px);transform:translateX(12px)}.cc-setting-group{background:#fdfdfd;border:1px solid #eaeaea;border-radius:6px;border-right:2px solid #9d3b20;padding:4px 8px;position:relative;-webkit-transition:background-color .2s;transition:background-color .2s;z-index:1}.cc-setting-group:focus-within,.cc-setting-group:hover{background:#f8f8f8;z-index:10}.cc-setting-collapse-trigger{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-flex:1;-ms-flex-positive:1;cursor:pointer;flex-grow:1;padding:4px 0;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.cc-setting-collapse-trigger:hover .cc-setting-label{color:#aa2c16}.cc-chevron{color:#888;height:14px;margin-left:auto;-webkit-transition:-webkit-transform .2s ease;transition:-webkit-transform .2s ease;transition:transform .2s ease;transition:transform .2s ease,-webkit-transform .2s ease;width:14px}.cc-setting-group.is-collapsed .cc-chevron{-webkit-transform:rotate(-90deg);transform:rotate(-90deg)}.cc-setting-sub{-webkit-box-sizing:border-box;box-sizing:border-box;display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;padding:4px 8px 2px 36px;-webkit-box-orient:vertical;-webkit-box-direction:normal;border-top:1px solid transparent;-ms-flex-direction:column;flex-direction:column;gap:6px;max-height:520px;opacity:1;overflow:visible;-webkit-transform-origin:top;transform-origin:top;-webkit-transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s ease-out,padding .3s cubic-bezier(.4,0,.2,1);transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s ease-out,padding .3s cubic-bezier(.4,0,.2,1)}.cc-setting-group.is-collapsed .cc-setting-sub,.cc-setting-sub[hidden]{max-height:0;opacity:0;overflow:hidden;padding-bottom:0;padding-top:0;pointer-events:none}.cc-setting-sub.is-disabled{filter:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"filter\"><feColorMatrix type=\"matrix\" color-interpolation-filters=\"sRGB\" values=\"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0\" /></filter></svg>#filter');-webkit-filter:grayscale(100%);filter:grayscale(100%);opacity:.45;pointer-events:none}.cc-form-field{color:#444;display:grid;font-size:11px;gap:4px}.cc-sub-inline-field{border-top:1px solid #f1e4de;margin-top:2px;padding-top:6px}.cc-sub-inline-control{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;gap:8px;justify-content:space-between;min-height:24px}.cc-sub-inline-label{color:#555;font-size:11px}.cc-setting-sub .cc-form-field:last-child{padding-bottom:6px}.cc-form-field input[type=text]{border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:11px;line-height:1.2;padding:6px 8px;width:100%}.cc-sub-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:10px;margin-top:2px}.cc-button-small{font-size:11px;padding:4px 10px}.cc-setting-icons{display:-webkit-box;display:-ms-flexbox;display:flex;gap:6px;margin-left:auto}.cc-info-icon,.cc-setting-icons{-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-info-icon{color:#a0a0a0;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-pack:center;-ms-flex-pack:center;background:transparent;border:none;cursor:pointer;justify-content:center;padding:0;position:relative;-webkit-transition:color .2s ease;transition:color .2s ease}.cc-info-icon:hover{color:#aa2c16}.cc-info-icon:after,.cc-info-icon:before{content:none}.cc-settings-info-tooltip{left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:translateY(4px);transform:translateY(4px);-webkit-transition:opacity .18s ease,-webkit-transform .18s ease;transition:opacity .18s ease,-webkit-transform .18s ease;transition:opacity .18s ease,transform .18s ease;transition:opacity .18s ease,transform .18s ease,-webkit-transform .18s ease;visibility:hidden;z-index:10031}.cc-settings-info-tooltip.is-open{opacity:1;-webkit-transform:translateY(0);transform:translateY(0);visibility:visible}.cc-settings-info-tooltip-body{background-color:#242424;border-radius:6px;-webkit-box-shadow:0 4px 15px rgba(0,0,0,.2);box-shadow:0 4px 15px rgba(0,0,0,.2);color:#fff;font-size:11px;font-weight:500;line-height:1.4;max-width:240px;padding:8px 12px;position:relative;text-align:left;white-space:pre-wrap;width:-webkit-max-content;width:-moz-max-content;width:max-content}.cc-settings-info-tooltip-body:after{border-color:#242424 transparent transparent;border-style:solid;border-width:5px 5px 0;content:\"\";left:20px;position:absolute;top:100%;-webkit-transform:translateX(-50%);transform:translateX(-50%)}.cc-ratings-progress{background:#f9f9f9;border:1px solid #e4e4e4;border-radius:6px;margin:0;padding:8px}.cc-ratings-progress-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;color:#555;font-size:11px;gap:10px;margin-bottom:6px}#cc-ratings-progress-label{-webkit-box-flex:1;-ms-flex:1;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#cc-ratings-progress-count{-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;white-space:nowrap}.cc-ratings-progress-track{background:#e6e6e6;border-radius:999px;height:8px;overflow:hidden;width:100%}.cc-ratings-progress-bar{background:-webkit-gradient(linear,left top,right top,from(#aa2c16),to(#d13b1f));background:linear-gradient(90deg,#aa2c16,#d13b1f);border-radius:999px;height:100%;-webkit-transition:width .25s ease;transition:width .25s ease;width:0}.cc-ratings-progress-actions{display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:6px;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-ratings-cancel-link{background:transparent;border:0;border-radius:4px;color:#7a7a7a;cursor:pointer;font-size:11px;padding:2px 6px;text-decoration:none;-webkit-transition:background-color .15s ease,color .15s ease;transition:background-color .15s ease,color .15s ease}.cc-ratings-cancel-link:hover{background:rgba(0,0,0,.06);color:#444}.cc-maint-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px;min-height:23px}.cc-dev-only{display:none!important}body.cc-dev-mode-active .cc-maint-actions>.cc-dev-only{display:-webkit-inline-box!important;display:-ms-inline-flexbox!important;display:inline-flex!important}body.cc-dev-mode-active .cc-maint-dev-control.cc-dev-only{display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important}.cc-maint-dev-control{-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-radius:0;gap:6px;padding:0;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-maint-dev-control,.cc-maint-dev-control:hover{background:transparent}.cc-maint-dev-control .cc-setting-label{line-height:1;white-space:nowrap}.cc-maint-dev-control .cc-switch{margin:0}#cc-maint-dev-btn,.cc-maint-dev-control .cc-switch{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}#cc-maint-dev-btn{-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;min-width:74px;text-align:center}#cc-maint-dev-btn:active,#cc-maint-dev-btn:hover{-webkit-transform:none;transform:none}.cc-version-info-overlay{background:rgba(0,0,0,.36);display:none;inset:0;position:fixed;z-index:10030;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);-webkit-box-sizing:border-box;box-sizing:border-box;justify-content:center;overscroll-behavior:contain;padding:16px}.cc-version-info-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-version-info-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 20px 45px rgba(0,0,0,.25);box-shadow:0 20px 45px rgba(0,0,0,.25);color:#222;display:grid;grid-template-rows:auto minmax(0,1fr);max-height:min(86vh,920px);overflow:hidden;width:min(850px,100%)}.cc-version-info-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-version-info-head.is-title-hidden{-webkit-box-pack:end;-ms-flex-pack:end;border-bottom:0;justify-content:flex-end;padding-bottom:0}.cc-version-info-title-wrap{min-width:0}.cc-version-info-head h3{font-size:14px;font-weight:700;margin:0}.cc-version-info-close{background:transparent;border:0;border-radius:7px;color:#666;cursor:pointer;font-size:20px;height:28px;line-height:1;width:28px}.cc-version-info-close:hover{background:#f1f1f1;color:#222}.cc-version-info-body{font-size:13px;line-height:1.7;overflow:auto;overscroll-behavior:contain;padding:18px 20px}.cc-version-info-modal.is-whats-new-modal .cc-version-info-body{padding-top:10px}.cc-version-info-foot{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;border-top:1px solid #efefef;justify-content:flex-end;margin-top:0;padding:10px 14px 14px}.cc-version-info-meta{display:grid;gap:12px;margin-bottom:22px}.cc-version-info-key{color:#666;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase}.cc-version-info-value{color:#222;font-size:14px;min-width:0}.cc-version-info-meta-cards{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:12px}.cc-version-info-card{min-width:150px;-webkit-box-flex:1;background:#fafafa;border:1px solid #ececec;border-radius:10px;-ms-flex:1 1 150px;flex:1 1 150px;padding:10px 12px}.cc-version-info-card .cc-version-info-value{font-size:19px;font-weight:700;line-height:1.2;margin-top:4px}.cc-version-info-status-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;min-height:20px}.cc-version-shortcuts{margin:0 0 22px}.cc-version-shortcuts-list{display:grid;gap:8px}.cc-version-shortcut-item{display:grid;gap:10px 14px;grid-template-columns:minmax(180px,auto) minmax(0,1fr);-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-bottom:1px solid #efefef;padding:8px 0}.cc-version-shortcut-item:last-child{border-bottom:0;padding-bottom:0}.cc-version-shortcut-keys{color:#444;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px}.cc-version-shortcut-keys,.cc-version-shortcut-keys kbd{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-version-shortcut-keys kbd{-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;border:solid #d6d6d6;border-radius:7px;border-width:1px 1px 2px;-webkit-box-shadow:inset 0 -1px 0 rgba(0,0,0,.04);box-shadow:inset 0 -1px 0 rgba(0,0,0,.04);color:#222;font-family:inherit;font-size:12px;font-weight:700;justify-content:center;line-height:1;min-width:32px;padding:3px 8px}.cc-version-shortcut-text{color:#444;line-height:1.5}.cc-version-info-section-title{color:#222;font-size:15px;font-weight:700;margin:0 0 14px}.cc-version-info-empty,.cc-version-info-loading{color:#666;margin:0 0 12px}.cc-version-info-warning{background:#fff6e8;border:1px solid #f0d2a8;border-radius:10px;color:#8a5a14;margin:0 0 12px;padding:10px 12px}.cc-version-info-status{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-weight:600;gap:6px}.cc-version-info-status-dot{background:#8f8f8f;border-radius:999px;height:8px;width:8px}.cc-version-info-status.is-update .cc-version-info-status-dot{background:#aa2c16}.cc-version-changelog-section+.cc-version-changelog-section{border-top:1px solid #e7e7e7;margin-top:28px;padding-top:28px}.cc-version-changelog-section{padding:2px 0 0}.cc-version-update-summary{margin-bottom:22px}.cc-version-update-title{color:#202020;font-size:20px;font-weight:700;line-height:1.25;margin:0 0 10px}.cc-version-update-text{color:#555;font-size:14px;margin:0}.cc-version-markdown-heading-version{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline;border-bottom:1px solid #e8e8e8;gap:10px;margin:0 0 14px;padding-bottom:10px}.cc-version-markdown-version{color:#202020;font-size:20px;font-weight:700}.cc-version-markdown-date{color:#8a8a8a;font-size:14px;font-weight:400}.cc-version-markdown-kind-item-icon{height:16px;width:16px;-webkit-box-flex:0;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-ms-flex:0 0 16px;flex:0 0 16px;margin-top:.15em;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-version-markdown-kind-item-icon svg{display:block;height:16px;width:16px}.cc-version-markdown-kind-list{list-style:none;margin:0 0 12px;padding:0}.cc-version-markdown-kind-item{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;color:#333;gap:10px}.cc-version-markdown-kind-item+.cc-version-markdown-kind-item{margin-top:8px}.cc-version-markdown-kind-item.is-added .cc-version-markdown-kind-item-icon{color:#2ba24c}.cc-version-markdown-kind-item.is-changed .cc-version-markdown-kind-item-icon{color:#3b78c2}.cc-version-markdown-kind-item.is-development .cc-version-markdown-kind-item-icon{color:#6b7280}.cc-version-markdown-kind-item.is-fixed .cc-version-markdown-kind-item-icon{color:#d98d19}.cc-version-markdown-kind-item-text{min-width:0;padding-top:1px}.cc-version-markdown-heading{color:#202020;line-height:1.3;margin:0 0 12px}.cc-version-markdown-heading-1{font-size:21px}.cc-version-markdown-heading-2{font-size:18px;margin-top:8px}.cc-version-markdown-heading-3,.cc-version-markdown-heading-4{color:#333;font-size:15px}.cc-version-markdown-paragraph{color:#333;margin:0 0 14px}.cc-version-markdown-list{margin:0 0 16px 22px;padding:0}.cc-version-markdown-list li+li{margin-top:8px}.cc-version-markdown-rule{border:0;border-top:1px solid #ececec;margin:14px 0}.cc-version-markdown-pre{background:#f6f6f6;border-radius:8px;margin:0 0 12px;overflow:auto;padding:10px 12px}.cc-version-markdown-heading code,.cc-version-markdown-kind-item-text code,.cc-version-markdown-list code,.cc-version-markdown-paragraph code,.cc-version-markdown-pre code{font-family:Consolas,Courier New,monospace}.cc-version-markdown-heading code,.cc-version-markdown-kind-item-text code,.cc-version-markdown-list code,.cc-version-markdown-paragraph code{background:#fafafa;border:solid #d6d6d6;border-radius:6px;border-width:1px 1px 2px;-webkit-box-shadow:inset 0 -1px 0 rgba(0,0,0,.04);box-shadow:inset 0 -1px 0 rgba(0,0,0,.04);color:#222;display:inline-block;font-size:.86em;font-weight:500;line-height:1.1;margin:0 1px;padding:3px 7px;vertical-align:baseline;white-space:nowrap}.cc-version-info-body a{color:#1f4f8f;text-decoration:none}.cc-version-info-body a:hover{text-decoration:underline}.cc-version-markdown-image{background:#fff;border:1px solid #ececec;border-radius:8px;display:block;height:auto;margin:16px auto 6px;max-width:100%}.cc-version-markdown-paragraph-image{text-align:center}body.cc-version-info-open{overflow:hidden}@media (max-width:768px){.cc-version-info-body{font-size:12.5px;padding:16px}.cc-version-info-meta,.cc-version-info-meta-cards{gap:10px}.cc-version-info-card{min-width:0}.cc-version-shortcut-item{gap:6px;grid-template-columns:1fr}.cc-version-changelog-section{padding:2px 0 0}.cc-version-markdown-heading-version{-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;gap:4px}}.cc-badge[role=button]{cursor:pointer}.cc-ratings-table-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.45);justify-content:center;padding:24px;z-index:10010}.cc-ratings-table-modal,.cc-ratings-table-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-ratings-table-modal{background:#fff;border-radius:12px;-webkit-box-shadow:0 16px 42px rgba(0,0,0,.28);box-shadow:0 16px 42px rgba(0,0,0,.28);max-height:calc(100vh - 48px);overflow:hidden;width:min(1080px,calc(100vw - 40px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-ratings-table-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:14px 16px}.cc-ratings-table-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-ratings-table-close:hover{background:#f1f1f1;color:#222}.cc-ratings-table-toolbar{-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #f0f0f0;gap:10px;justify-content:space-between;padding:10px 16px}.cc-ratings-table-search{border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;height:34px;line-height:34px;margin:0!important;padding:0 10px;width:min(440px,100%)}.cc-ratings-table-summary{color:#666;font-size:12px;margin-left:auto;white-space:nowrap}.cc-ratings-type-multiselect{position:relative;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-ratings-type-toggle{background:#fff;border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;color:#333;cursor:pointer;font-size:12px;height:34px;line-height:34px;max-width:280px;min-width:186px;overflow:hidden;padding:0 32px 0 10px;position:relative;text-align:left;text-overflow:ellipsis;text-transform:none!important;white-space:nowrap}.cc-ratings-type-toggle:after{color:#777;content:\"▼\";font-size:10px;position:absolute;right:10px;top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%)}.cc-ratings-type-menu{background:#fff;border:1px solid #ddd;border-radius:8px;-webkit-box-shadow:0 8px 22px rgba(0,0,0,.12);box-shadow:0 8px 22px rgba(0,0,0,.12);left:0;max-height:220px;min-width:180px;overflow:auto;padding:6px;position:absolute;top:calc(100% + 6px);z-index:3}.cc-ratings-type-menu label{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-radius:6px;cursor:pointer;font-size:12px;gap:7px;padding:6px 8px}.cc-ratings-type-menu label:hover{background:#f5f5f5}.cc-ratings-table-wrap{overflow:auto;padding:0 0 4px}.cc-ratings-table{border-collapse:collapse;table-layout:fixed;width:100%}.cc-ratings-table td,.cc-ratings-table th{border-bottom:1px solid #f0f0f0;font-size:12px;padding:10px 16px;vertical-align:top}.cc-ratings-table th{background:#fafafa;position:sticky;top:0;z-index:1}.cc-ratings-table th button{background:transparent;border:0;color:#333;cursor:pointer;font:inherit;font-weight:700;gap:6px;padding:0}.cc-ratings-table th button,.cc-sort-indicator{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-sort-indicator{-webkit-box-pack:center;-ms-flex-pack:center;color:#8a8a8a;font-size:10px;justify-content:center;min-width:12px}.cc-ratings-table th button.is-active .cc-sort-indicator{color:#aa2c16}.cc-ratings-table td:first-child,.cc-ratings-table th:first-child{width:40%}.cc-ratings-table td:nth-child(2),.cc-ratings-table th:nth-child(2){width:18%}.cc-ratings-table td:nth-child(3),.cc-ratings-table th:nth-child(3){width:10%}.cc-ratings-table td:nth-child(4),.cc-ratings-table th:nth-child(4){width:12%}.cc-ratings-table td:nth-child(5),.cc-ratings-table th:nth-child(5){width:20%}.cc-ratings-table-name-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;contain:layout paint;gap:8px;justify-content:space-between;width:100%}.cc-ratings-table-name-link{color:#1f4f8f;font-size:13px;font-weight:600;text-decoration:none;word-break:break-word;-webkit-box-flex:1;-ms-flex:1;flex:1}.cc-ratings-table-name-link:hover{text-decoration:underline}.cc-ratings-table-details-btn,.cc-ratings-table-link-icon{border:1px solid #cfcfcf;border-radius:6px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:22px;width:22px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;justify-content:center;text-decoration:none;-webkit-box-flex:0;-moz-appearance:none;appearance:none;-webkit-appearance:none;color:#8a8a8a;cursor:pointer;-ms-flex:0 0 auto;flex:0 0 auto;padding:0;-webkit-transition:color .15s,background-color .15s,border-color .15s;transition:color .15s,background-color .15s,border-color .15s}.cc-ratings-table-details-btn:hover,.cc-ratings-table-link-icon:hover{background:#f3f3f3;border-color:#bcbcbc;color:#aa2c16}.cc-ratings-table-date,.cc-ratings-table-rating,.cc-ratings-table-year{white-space:nowrap}.cc-ratings-table-type{color:#444;white-space:nowrap}.cc-ratings-table-rating{color:#b8321d;font-size:13px;font-weight:700;letter-spacing:.2px}.cc-ratings-table-rating.is-odpad{color:#000;font-weight:700;letter-spacing:0}.cc-ratings-square{border-radius:2px;height:11px;width:11px;-webkit-box-flex:0;-ms-flex:0 0 11px;flex:0 0 11px;margin-right:2px}.cc-ratings-square.is-1{background:#465982}.cc-ratings-square.is-2{background:#5c6f96}.cc-ratings-square.is-3{background:#9a3d2b}.cc-ratings-square.is-4,.cc-ratings-square.is-5{background:#b8321d}.cc-ratings-square.is-unknown{background:#9a9a9a}.cc-ratings-table-empty{color:#7a7a7a;padding:18px 16px;text-align:center}body.cc-ratings-modal-open{overflow:hidden}.cc-rating-detail-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.32);justify-content:center;padding:20px;z-index:10011}.cc-rating-detail-card,.cc-rating-detail-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-rating-detail-card{background:#fff;border-radius:12px;-webkit-box-shadow:0 14px 38px rgba(0,0,0,.24);box-shadow:0 14px 38px rgba(0,0,0,.24);max-height:calc(100vh - 60px);overflow:hidden;width:min(760px,calc(100vw - 32px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-rating-detail-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-rating-detail-head h4{font-size:14px;font-weight:700;margin:0}.cc-rating-detail-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-rating-detail-close:hover{background:#f1f1f1;color:#222}.cc-rating-detail-body{overflow:auto;padding:8px 14px 12px}.cc-rating-detail-row{border-bottom:1px solid #f1f1f1;display:grid;gap:10px;grid-template-columns:180px 1fr;padding:8px 0}.cc-rating-detail-key{color:#666;font-size:12px;font-weight:600}.cc-rating-detail-value{color:#222;font-size:12px;white-space:pre-wrap;word-break:break-word}body.cc-menu-open .box-video,body.cc-menu-open .slick-list,body.cc-menu-open .slick-slider{pointer-events:none!important}.cc-sync-modal-overlay{background:rgba(0,0,0,.45);display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;opacity:0;pointer-events:none;-webkit-transition:opacity .18s ease,visibility .18s ease;transition:opacity .18s ease,visibility .18s ease;visibility:hidden;z-index:10002}.cc-sync-modal-overlay.visible{opacity:1;pointer-events:auto;visibility:visible}.cc-sync-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 10px 30px rgba(0,0,0,.22);box-shadow:0 10px 30px rgba(0,0,0,.22);max-width:calc(100vw - 30px);padding:14px;width:340px}.cc-sync-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;margin-bottom:8px}.cc-sync-modal-head h3{font-size:14px;margin:0}.cc-sync-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-sync-help{color:#444;font-size:12px;margin:0 0 10px}.cc-sync-toggle-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-size:12px;gap:6px;margin-bottom:10px}.cc-sync-label{color:#333;display:block;font-size:12px;margin-bottom:4px}.cc-sync-input{border:1px solid #d9d9d9;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;padding:7px 8px;width:100%}.cc-sync-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:end;-ms-flex-pack:end;gap:8px;justify-content:flex-end;margin-top:12px}.cc-sync-note{color:#666;font-size:11px;margin-top:8px}.cc-lc-modal-overlay{display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;z-index:10032;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.42);justify-content:center;opacity:0;padding:14px;pointer-events:none;-webkit-transition:opacity .16s ease,visibility .16s ease;transition:opacity .16s ease,visibility .16s ease;visibility:hidden}.cc-lc-modal-overlay.is-open{opacity:1;pointer-events:auto;visibility:visible}.cc-lc-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 18px 42px rgba(0,0,0,.28);box-shadow:0 18px 42px rgba(0,0,0,.28);display:grid;gap:8px;grid-template-rows:auto auto minmax(0,1fr) auto;height:min(80vh,700px);max-height:min(80vh,700px);padding:12px;width:min(720px,calc(100vw - 30px))}.cc-lc-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.cc-lc-modal-head h3{font-size:14px;margin:0}.cc-lc-modal-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-lc-modal-help{color:#666;font-size:11px}.cc-lc-modal-body{border:1px solid #ededed;border-radius:8px;min-height:0;overflow:auto}.cc-lc-table{border-collapse:collapse;table-layout:fixed;width:100%}.cc-lc-table td,.cc-lc-table th{border-bottom:1px solid #f1f1f1;font-size:11px;padding:7px 8px;vertical-align:middle}.cc-lc-table th{background:#fafafa;position:sticky;text-align:left;top:0}.cc-lc-table td.cc-lc-key,.cc-lc-table th:first-child{width:33%}.cc-lc-table td.cc-lc-value,.cc-lc-table th:nth-child(2){width:45%}.cc-lc-table td.cc-lc-action,.cc-lc-table th:last-child{width:22%}.cc-lc-key,.cc-lc-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-lc-value-content{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:8px;min-width:0}.cc-lc-value-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;-webkit-box-flex:1;-ms-flex:1;flex:1}.cc-lc-value-info{-webkit-box-flex:0;background:#fff;border:1px solid #cfcfcf;border-radius:6px;color:#8a8a8a;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-ms-flex:0 0 auto;flex:0 0 auto;height:22px;width:22px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;cursor:pointer;justify-content:center;line-height:1;padding:0;-webkit-transition:color .15s,background-color .15s,border-color .15s;transition:color .15s,background-color .15s,border-color .15s}.cc-lc-value-info:hover{background:#f3f3f3;border-color:#bcbcbc;color:#aa2c16}.cc-lc-group-row{background:-webkit-gradient(linear,left top,left bottom,from(#fcfcfc),to(#f3f3f3));background:linear-gradient(180deg,#fcfcfc,#f3f3f3);cursor:pointer}.cc-lc-group-row td{background:transparent;border-bottom-color:#e8e8e8}.cc-lc-group-row:hover td{background:rgba(170,44,22,.05)}.cc-lc-group-key{border-left:3px solid #aa2c16;padding-left:6px!important}.cc-lc-group-toggle{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;background:transparent;border:0;color:#333;cursor:pointer;font:inherit;font-weight:700;gap:6px;margin:0;padding:0;pointer-events:none}.cc-lc-group-toggle:hover{color:#aa2c16}.cc-lc-group-chevron{color:#888;text-align:center;width:10px}.cc-lc-group-summary{color:#666;font-weight:600}.cc-lc-group-label{letter-spacing:.03em;text-transform:uppercase}.cc-lc-key-child{padding-left:26px!important}.cc-lc-entry-row.is-group-child td{background:#fff}.cc-generic-detail-overlay{z-index:10033}.cc-detail-group{background:#fcfcfc;border:1px solid #ececec;border-radius:10px;margin-bottom:12px;overflow:hidden}.cc-detail-group:last-child{margin-bottom:0}.cc-detail-group-title{background:-webkit-gradient(linear,left top,left bottom,from(#fcfcfc),to(#f3f3f3));background:linear-gradient(180deg,#fcfcfc,#f3f3f3);border-left:3px solid #aa2c16;color:#333;font-size:12px;font-weight:700;letter-spacing:.03em;padding:10px 12px;text-transform:uppercase}.cc-detail-group-body{padding:0 12px}.cc-detail-group-body .cc-rating-detail-row:last-child{border-bottom:0}.cc-lc-table-empty{color:#757575;padding:10px;text-align:center}.cc-lc-modal-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;gap:6px;justify-content:flex-end}.cc-lc-modal-body::-webkit-scrollbar,.cc-ratings-table-wrap::-webkit-scrollbar,.cc-version-info-body::-webkit-scrollbar{height:8px;width:8px}.cc-lc-modal-body::-webkit-scrollbar-track,.cc-ratings-table-wrap::-webkit-scrollbar-track,.cc-version-info-body::-webkit-scrollbar-track{background:transparent}.cc-lc-modal-body::-webkit-scrollbar-thumb,.cc-ratings-table-wrap::-webkit-scrollbar-thumb,.cc-version-info-body::-webkit-scrollbar-thumb{background:#ccc;border-radius:10px}.cc-lc-modal-body::-webkit-scrollbar-thumb:hover,.cc-ratings-table-wrap::-webkit-scrollbar-thumb:hover,.cc-version-info-body::-webkit-scrollbar-thumb:hover{background:#a8a8a8}.cc-pill-input-container{background:#fff;border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;cursor:text;display:-webkit-box;display:-ms-flexbox;display:flex;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px;min-height:32px;padding:5px 6px;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-pill-input-container.is-disabled{background:#f5f5f5;cursor:not-allowed}.cc-pills{display:-webkit-box;display:-ms-flexbox;display:flex;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px}.cc-pill{background:#aa2c16;border-radius:4px;color:#fff;font-size:12px;font-weight:600;line-height:1.2;padding:4px 8px}.cc-pill,.cc-pill-remove{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-pill-remove{cursor:pointer;font-size:16px;margin-left:6px;opacity:.7;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;line-height:1;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-pill-remove:hover{opacity:1}.cc-pill-input-container input{border:none!important;margin:0!important;outline:none!important;padding:0!important;-webkit-box-flex:1;background:transparent;color:#444;-ms-flex:1;flex:1;font-size:12px;min-width:80px}.cc-pill-input-container input:disabled{cursor:not-allowed}.cc-select-compact{-moz-appearance:none;appearance:none;-webkit-appearance:none;background-color:#fff;background-image:url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%23777777\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"></polyline></svg>');background-position:right 6px center;background-repeat:no-repeat;border:1px solid #d4d4d4;border-radius:5px;color:#444;cursor:pointer;font-family:inherit;font-size:11px;height:22px;outline:none;padding:0 20px 0 6px;-webkit-transition:border-color .15s ease,-webkit-box-shadow .15s ease;transition:border-color .15s ease,-webkit-box-shadow .15s ease;transition:border-color .15s ease,box-shadow .15s ease;transition:border-color .15s ease,box-shadow .15s ease,-webkit-box-shadow .15s ease}.cc-select-compact:focus,.cc-select-compact:hover{border-color:#bcbcbc}.cc-select-compact:focus{border-color:#aa2c16;-webkit-box-shadow:0 0 0 2px rgba(170,44,22,.15);box-shadow:0 0 0 2px rgba(170,44,22,.15)}.cc-setting-sub.is-disabled .cc-select-compact{background-color:#f5f5f5;cursor:not-allowed}.cc-requires-login{cursor:not-allowed!important;filter:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"filter\"><feColorMatrix type=\"matrix\" color-interpolation-filters=\"sRGB\" values=\"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0\" /></filter></svg>#filter');-webkit-filter:grayscale(100%);filter:grayscale(100%);opacity:.5}.cc-setting-group.cc-requires-login *,.cc-setting-row.cc-requires-login *{pointer-events:none}.cc-badge.cc-requires-login,.cc-button.cc-requires-login,.cc-sync-icon-btn.cc-requires-login{pointer-events:auto}.cc-badges-pill{border-radius:6px;-webkit-box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);margin-right:4px;overflow:hidden}.cc-badges-pill,.cc-badges-pill .cc-badge{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-badges-pill .cc-badge{border-radius:0;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:11.2px;font-size:.7rem;height:auto;line-height:1.4;margin:0;padding:2px 6px}.cc-badges-pill .cc-badge-black{border-left:1px solid hsla(0,0%,100%,.25)}#cc-open-ratings-btn{margin-right:2px}.cc-ratings-table-toolbar{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:12px}.cc-ratings-table-toolbar .cc-ratings-table-search{-webkit-box-flex:1;-ms-flex:1 1 200px;flex:1 1 200px;margin:0!important;max-width:300px}.cc-toolbar-right{-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;gap:10px;justify-content:flex-end;-webkit-box-flex:1;-ms-flex:1 1 200px;flex:1 1 200px}.cc-ratings-scope-toggle,.cc-toolbar-right{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-ratings-scope-toggle{background:#eef0f2;border-radius:8px;gap:2px;margin:0 auto;padding:4px}.cc-ratings-scope-toggle button{background:transparent;border:none;border-radius:6px;color:#666;cursor:pointer;display:-webkit-box;display:-ms-flexbox;display:flex;font-size:12px;font-weight:600;padding:6px 16px;-webkit-transition:all .2s ease;transition:all .2s ease;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-ratings-scope-toggle button:hover{color:#111}.cc-ratings-scope-toggle button.is-active[data-scope=all]{background:#fff;-webkit-box-shadow:0 1px 4px rgba(0,0,0,.1);box-shadow:0 1px 4px rgba(0,0,0,.1);color:#222}.cc-ratings-scope-toggle button.is-active[data-scope=direct]{background:#aa2c16;-webkit-box-shadow:0 2px 6px rgba(170,44,22,.3);box-shadow:0 2px 6px rgba(170,44,22,.3);color:#fff}.cc-ratings-scope-toggle button.is-active[data-scope=computed]{background:#000;-webkit-box-shadow:0 2px 6px rgba(0,0,0,.3);box-shadow:0 2px 6px rgba(0,0,0,.3);color:#fff}.cc-ratings-table-rating.is-computed{color:#000!important}.cc-ratings-square.is-computed{background:#000!important}.cc-grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-ml-auto{margin-left:auto}.cc-own-rating{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;margin-left:8px;vertical-align:middle;-webkit-box-align:center;-ms-flex-align:center;align-items:center;line-height:1}.cc-own-rating-inline{display:inline;white-space:nowrap}.cc-own-rating-inline>.cc-own-rating{margin-left:0}.cc-own-rating-foreign-profile,span.comment .cc-own-rating{border:1px solid rgba(53,52,52,.5);border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:20px;margin-right:3px;overflow:hidden;padding:0 5px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;vertical-align:middle}.article-news-content.article-content-justify li .cc-own-rating,.article-news-content.article-content-justify li .cc-own-rating-foreign-profile,.article-news-content.article-content-justify p .cc-own-rating,.article-news-content.article-content-justify p .cc-own-rating-foreign-profile,.diary-post p .cc-own-rating,.diary-post p .cc-own-rating-foreign-profile,.favorite-users-ratings .article-content-reviewtext li .cc-own-rating,.favorite-users-ratings .article-content-reviewtext li .cc-own-rating-foreign-profile,.favorite-users-ratings .article-content-reviewtext p .cc-own-rating,.favorite-users-ratings .article-content-reviewtext p .cc-own-rating-foreign-profile,article.article-forum .article-content.article-content-icons li .cc-own-rating,article.article-forum .article-content.article-content-icons li .cc-own-rating-foreign-profile,article.article-forum .article-content.article-content-icons p .cc-own-rating,article.article-forum .article-content.article-content-icons p .cc-own-rating-foreign-profile,span.comment .cc-own-rating,span.comment .cc-own-rating-foreign-profile{margin-top:-3px}div.plot-full .cc-own-rating,div.plot-preview .cc-own-rating{margin-top:-4px}.cc-own-rating-computed .stars:before{color:#d2d2d2}.cc-own-rating-computed-count{color:#7b7b7b;font-size:9px;line-height:1;margin-left:3px;top:-.4em;vertical-align:super}h3.film-title-inline .cc-own-rating{margin-top:-10px;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-ratings-table-export{cursor:pointer;font-size:11px;margin-left:auto;padding:5px 7px;text-align:center}.cc-my-rating-cell,.cc-my-rating-col{text-align:center;width:64px}.cc-my-rating-cell{white-space:nowrap}.cc-my-rating-cell .cc-own-rating{margin-left:0}.cc-compare-ratings-table{width:calc(100% + 24px)}.article-header{padding-top:2px}.cc-gallery-size-host{position:relative}.cc-gallery-size-links{bottom:8px;display:none;position:absolute;right:8px;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:end;-ms-flex-align:end;align-items:flex-end;gap:4px;z-index:11}.cc-gallery-size-host:hover .cc-gallery-size-links,.cc-gallery-size-links.is-visible,.cc-gallery-size-links:hover{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-gallery-size-link{background-color:hsla(0,100%,98%,.82);border-radius:5px;color:#222;display:inline-block;font-size:11px;font-weight:700;line-height:1.2;min-width:48px;padding:2px 6px;text-align:center;text-decoration:none}.cc-gallery-size-link:hover{text-decoration:underline}.cc-link-icon{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;height:16px;justify-content:center;line-height:1;-webkit-transform:translateY(-1px);transform:translateY(-1px);vertical-align:middle;width:16px}.cc-link-icon-italic{-webkit-transform:translateY(-1.5px);transform:translateY(-1.5px)}.cc-link-icon-inline{display:inline;vertical-align:baseline}.cc-link-icon-inline-after,.cc-link-icon-inline-before{white-space:nowrap}.cc-link-icon-inline>a.cc-link-icon-target{white-space:normal}.cc-link-icon-before{margin-right:4px}.cc-link-icon-after{margin-left:4px;margin-right:0}.cc-link-icon svg{display:block;height:100%;width:100%}.cc-hover-preview{left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:translateY(2px);transform:translateY(2px);-webkit-transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,transform .12s ease;transition:opacity .12s ease,transform .12s ease,-webkit-transform .12s ease;z-index:10030}.cc-hover-preview.is-visible{opacity:1;-webkit-transform:translateY(0);transform:translateY(0)}.cc-hover-preview-loading{height:16px;left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:scale(.85);transform:scale(.85);-webkit-transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,transform .12s ease;transition:opacity .12s ease,transform .12s ease,-webkit-transform .12s ease;width:16px;z-index:10040}.cc-hover-preview-loading.is-visible{opacity:1;-webkit-transform:scale(1);transform:scale(1)}.cc-hover-preview-loading-dot{-webkit-animation:cc-hover-preview-spin .7s linear infinite;animation:cc-hover-preview-spin .7s linear infinite;background:hsla(0,0%,100%,.82);border:2px solid rgba(186,3,5,.18);border-radius:50%;border-top-color:#ba0305;-webkit-box-sizing:border-box;box-sizing:border-box;display:block;height:100%;width:100%}@-webkit-keyframes cc-hover-preview-spin{0%{-webkit-transform:rotate(0deg);transform:rotate(0deg)}to{-webkit-transform:rotate(1turn);transform:rotate(1turn)}}@keyframes cc-hover-preview-spin{0%{-webkit-transform:rotate(0deg);transform:rotate(0deg)}to{-webkit-transform:rotate(1turn);transform:rotate(1turn)}}.cc-hover-preview.is-frozen{pointer-events:auto}.cc-hover-preview.is-frozen .cc-hover-preview-title,.cc-hover-preview.is-frozen .cc-hover-preview-top{cursor:-webkit-grab;cursor:grab}.cc-hover-preview.is-frozen.is-dragging .cc-hover-preview-title,.cc-hover-preview.is-frozen.is-dragging .cc-hover-preview-top{cursor:-webkit-grabbing;cursor:grabbing}.cc-hover-preview-card{background:hsla(0,0%,98%,.98);border:1px solid hsla(0,0%,50%,.35);border-radius:10px;-webkit-box-shadow:0 8px 20px rgba(0,0,0,.2);box-shadow:0 8px 20px rgba(0,0,0,.2);overflow:hidden;position:relative;width:188px}.cc-hover-preview.is-stack-leader .cc-hover-preview-card{border-color:rgba(186,3,5,.55);-webkit-box-shadow:0 10px 24px rgba(0,0,0,.24),0 0 0 2px rgba(186,3,5,.16);box-shadow:0 10px 24px rgba(0,0,0,.24),0 0 0 2px rgba(186,3,5,.16)}.cc-hover-preview.is-stack-leader .cc-hover-preview-card:after{background:#ba0305;border-radius:50%;-webkit-box-shadow:0 0 0 3px hsla(0,0%,100%,.88);box-shadow:0 0 0 3px hsla(0,0%,100%,.88);content:\"\";height:8px;position:absolute;right:10px;top:10px;width:8px}.cc-hover-preview-card.is-film{width:230px}.cc-hover-preview-card.is-review{width:320px}.cc-hover-preview-card.is-review.is-expanded{max-width:min(640px,calc(100vw - 24px));width:640px}.cc-hover-preview-top{background:hsla(0,0%,98%,.98);border-bottom:1px solid rgba(0,0,0,.06);padding:6px 8px 4px}.cc-hover-preview-image{background-color:#fafafa;display:block;height:210px;-o-object-fit:contain;object-fit:contain;-o-object-position:center center;object-position:center center;width:100%}.cc-hover-preview-card.is-film .cc-hover-preview-image{border-radius:4px;height:286px;margin:6px auto 0;width:calc(100% - 12px)}.cc-hover-preview-card.is-user .cc-hover-preview-image{border-radius:6px;height:165px;margin:4px auto 0;-o-object-fit:cover;object-fit:cover;width:124px}.cc-hover-preview-image.empty-image{background-image:url(https://static.pmgstatic.com/assets/images/39d04896278fe3eb71998df70adadd40/empty-image.svg);background-position:50%;background-repeat:no-repeat;background-size:contain}.cc-hover-preview-card.is-film .cc-hover-preview-image.empty-image{background-color:#c4c4c4}.cc-hover-preview-title{color:#303030;display:-webkit-box;display:-ms-flexbox;display:flex;font-size:12px;font-weight:600;line-height:1.2;padding:8px 8px 9px;text-align:center;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;gap:4px;justify-content:center;white-space:normal}.cc-hover-preview-card.is-film .cc-hover-preview-title{padding-inline:28px;padding-top:12px;position:relative}.cc-hover-preview-title-flag{height:auto;width:14px;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-hover-preview-meta{background:hsla(0,0%,98%,.92);border-top:1px solid rgba(0,0,0,.06);padding:0 8px 9px}.cc-hover-preview-line{color:#434343;font-size:11px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:normal}.cc-hover-preview-line+.cc-hover-preview-line{margin-top:2px}.cc-hover-preview-line.is-primary{color:#2f2f2f;font-size:12px;font-weight:600;line-height:1.4}.cc-hover-preview-inline-note{color:#666;font-size:11px;font-weight:500}.cc-hover-preview-line.is-center{text-align:center}.cc-hover-preview-line.is-rating{color:#ba0305;font-size:16px;font-weight:700;text-align:center}.cc-hover-preview-line.is-user-points{font-size:15px}.cc-hover-preview-label-strong{color:#3c3c3c;font-weight:700}.cc-hover-preview-line.is-strong{color:#303030;font-size:11px;font-weight:600}.cc-hover-preview-line.is-muted{color:#5b5b5b}.cc-hover-preview-line.is-small{font-size:10px}.cc-hover-preview-review-header{-webkit-box-pack:justify;-ms-flex-pack:justify;gap:10px;justify-content:space-between;min-height:20px}.cc-hover-preview-review-author-wrap,.cc-hover-preview-review-header{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-hover-preview-review-author-wrap{gap:8px;min-width:0;-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto}.cc-hover-preview-review-author-wrap .cc-hover-preview-line{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-hover-preview-review-date{color:#666;font-size:11px;margin-left:auto;text-align:right}.cc-hover-preview-review-date,.cc-hover-preview-review-stars{white-space:nowrap;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-hover-preview-review-stars{font-size:14px;letter-spacing:.03em;line-height:1}.cc-hover-preview-review-stars .is-filled{color:#ba0305}.cc-hover-preview-review-stars .is-empty{color:#c6b5a3}.cc-hover-preview-review-body{color:#353535;font-size:12px;line-height:1.45;white-space:normal}.cc-hover-preview-review-body.is-compact{display:-webkit-box;-webkit-line-clamp:6;line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}.cc-hover-preview-review-body.is-compact a,.cc-hover-preview-review-body.is-compact b,.cc-hover-preview-review-body.is-compact em,.cc-hover-preview-review-body.is-compact i,.cc-hover-preview-review-body.is-compact strong{display:inline}.cc-hover-preview-review-body.is-full{max-height:min(52vh,620px);overflow:auto;padding-right:4px}.cc-hover-preview-review-body blockquote,.cc-hover-preview-review-body div,.cc-hover-preview-review-body ol,.cc-hover-preview-review-body p,.cc-hover-preview-review-body ul{margin:0}.cc-hover-preview-review-body blockquote+p,.cc-hover-preview-review-body div+div,.cc-hover-preview-review-body div+p,.cc-hover-preview-review-body ol+p,.cc-hover-preview-review-body p+blockquote,.cc-hover-preview-review-body p+div,.cc-hover-preview-review-body p+ol,.cc-hover-preview-review-body p+p,.cc-hover-preview-review-body p+ul,.cc-hover-preview-review-body ul+p{margin-top:8px}.cc-hover-preview-review-body blockquote{border-left:2px solid rgba(186,3,5,.24);color:#575757;padding-left:8px}.cc-hover-preview-label{color:#2f2f2f;font-weight:600}.cc-hover-preview-clamp-2{display:-webkit-inline-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;max-width:100%;overflow:hidden;vertical-align:top}.cc-hover-preview-link{color:#8f1f12;text-decoration:none}.cc-hover-preview-link:hover{text-decoration:underline}.cc-hover-preview-poster-nav{background:rgba(186,3,5,.92);border:none;border-radius:50%;color:#fff;cursor:pointer;display:none;font-size:0;height:24px;line-height:1;position:absolute;top:-16px;width:24px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;padding:0}.cc-hover-preview-poster-nav i{font-size:12px;line-height:1}.cc-hover-preview.is-frozen .cc-hover-preview-poster-nav{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex}.cc-hover-preview-poster-nav.is-prev{left:8px}.cc-hover-preview-poster-nav.is-next{right:8px}.cc-hover-preview-poster-index{background:hsla(0,0%,98%,.96);border-radius:8px;color:#707070;display:none;font-size:10px;font-weight:500;left:50%;padding:0 4px;position:absolute;top:-10px;-webkit-transform:translateX(-50%);transform:translateX(-50%)}.cc-hover-preview.is-frozen .cc-hover-preview-poster-index{display:inline-block}.cc-hover-preview-divider.is-subtle{margin-bottom:6px;margin-top:6px;width:48%}.cc-hover-preview-secondary{z-index:10031}.cc-hover-preview-divider{background:rgba(0,0,0,.09);height:1px;margin:5px auto 4px;width:58%}.cc-hover-preview-stats{-webkit-box-pack:justify;-ms-flex-pack:justify;gap:10px;justify-content:space-between}.cc-hover-preview-stat,.cc-hover-preview-stats{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline}.cc-hover-preview-stat{gap:4px;min-width:0}.cc-hover-preview-stat.is-primary{color:#ba0305;font-weight:700}.cc-hover-preview-stat.is-secondary{color:#5b5b5b}.cc-hover-preview-stat.is-wide{margin:0 auto}.cc-hover-preview-stat-value{font-size:14px;font-weight:700;line-height:1}.cc-hover-preview-stat-label{font-size:11px;line-height:1.1;white-space:nowrap}.cc-hover-preview-line.is-photo{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline;color:#505050;font-weight:600;gap:6px;min-width:0}.cc-hover-preview-line.is-photo:before{content:\"🎬\";line-height:1;margin-right:2px}.cc-hover-preview-line.is-photo.is-copyright:before{content:\"©\";font-weight:700}.cc-hover-preview-photo-source{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-hover-preview-line.is-photo.is-movie{color:#ba0305}.cc-hover-preview-line.is-photo.is-movie .cc-hover-preview-photo-source{line-height:1;white-space:nowrap}.cc-hover-preview-line.is-photo.is-copyright{color:#4c4c4c}.cc-hover-preview-line.is-photo.is-copyright .cc-hover-preview-photo-source{display:-webkit-box;overflow:hidden;text-overflow:clip;white-space:normal;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical}nav.tab-nav.cc-show-all-tabs{padding-right:0!important}nav.tab-nav.cc-show-all-tabs .tab-nav-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;list-style:none;margin:0;padding:0;width:100%}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item{-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;min-width:0;top:-4px}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item.active{top:0}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-link{display:block;overflow:hidden;padding:0 5px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.cc-hide-panel-btn,.cc-hide-video-btn{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background-color:#ba0305;border:none;border-radius:4px;-webkit-box-sizing:border-box;box-sizing:border-box;color:#fff!important;cursor:pointer;font-size:10px;font-weight:700;justify-content:center;line-height:1;opacity:0;padding:3px 8px;text-transform:uppercase;-webkit-transition:opacity .2s ease,background-color .2s ease;transition:opacity .2s ease,background-color .2s ease}.cc-hide-panel-btn:hover,.cc-hide-video-btn:hover{background-color:#8b0204}.box-header:hover .cc-hide-panel-btn,.updated-box-banner-mobile:hover .cc-hide-panel-btn,.updated-box-banner:hover .cc-hide-panel-btn,.updated-box-header:hover .cc-hide-panel-btn,.updated-box-homepage-video:hover .cc-hide-video-btn{opacity:1}.cc-hide-panel-btn{margin-left:12px;-webkit-transform:translateY(-2px);transform:translateY(-2px);vertical-align:middle}.cc-hide-video-btn{-webkit-box-shadow:0 2px 8px rgba(0,0,0,.3);box-shadow:0 2px 8px rgba(0,0,0,.3);left:10px;position:absolute;top:10px;z-index:10000}.updated-box--homepage-csfd-cinema .updated-box-header p{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;overflow:visible!important;position:relative;z-index:10}.updated-box--homepage-csfd-cinema .cc-hide-panel-btn{-webkit-box-shadow:0 1px 4px rgba(0,0,0,.15);box-shadow:0 1px 4px rgba(0,0,0,.15);-webkit-transform:translateY(0);transform:translateY(0)}body:not(.cc-panels-feature-enabled) .cc-hide-panel-btn,body:not(.cc-panels-feature-enabled) .cc-hide-video-btn{display:none!important}.discussion-list .td-title{width:90%!important}.discussion-list .td-info{text-align:right;white-space:nowrap;width:30%!important}.film-title-ellipsis .cc-own-rating,.film-title-ellipsis .cc-own-rating-foreign-profile{margin-top:-5px}header.article-header>h3>span.cc-own-rating-foreign-profile{margin-left:15px;margin-top:-6px}.cc-compare-ratings-table .cc-own-rating-foreign-profile{margin-top:-4px}.time-rating{display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;-webkit-box-align:center!important;-ms-flex-align:center!important;align-items:center!important;white-space:nowrap!important}.time-rating .cc-own-rating{line-height:1;margin-left:6px}.box-item:has(.time-rating .cc-own-rating),:not(.program)>.program-item:has(.cc-own-rating){display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;-webkit-box-align:start!important;-ms-flex-align:start!important;align-items:flex-start!important}.box-item:has(.time-rating .cc-own-rating) .time-rating,:not(.program)>.program-item:has(.cc-own-rating)>.time-rating{float:none!important;width:auto!important;-ms-flex-negative:0!important;flex-shrink:0!important;padding-right:12px!important}.box-item:has(.time-rating .cc-own-rating) .inner,:not(.program)>.program-item:has(.cc-own-rating)>.inner{margin-left:0!important;-webkit-box-flex:1!important;-ms-flex-positive:1!important;flex-grow:1!important;min-width:0!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav{padding-right:0!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-list,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-list,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-list{display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;-ms-flex-wrap:nowrap!important;flex-wrap:nowrap!important;-webkit-box-pack:justify!important;-ms-flex-pack:justify!important;justify-content:space-between!important;overflow:hidden!important;width:100%!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-list .tab-nav-item,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-list .tab-nav-item,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-list .tab-nav-item{display:block!important;opacity:1!important;visibility:visible!important;-webkit-box-flex:1!important;-ms-flex:1 1 auto!important;flex:1 1 auto!important;min-width:0!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-list .tab-link,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-list .tab-link,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-list .tab-link{display:block!important;overflow:hidden!important;padding-left:4px!important;padding-right:4px!important;text-align:center!important;text-overflow:ellipsis!important;white-space:nowrap!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-more,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-more,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-more{display:none!important}body.cc-revert-star-style section.others-rating .star-rating .stars{direction:rtl}body.cc-revert-star-style section.others-rating .star-rating .stars:before{direction:ltr}body.cc-revert-star-style section.others-rating .star-rating .stars:after{display:none!important}";
  styleInject(css_248z);

  var htmlContent = "<svg style=\"display: none;\" xmlns=\"http://www.w3.org/2000/svg\">\r\n    <symbol id=\"cc-icon-info\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\r\n        <line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line>\r\n        <line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-image\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>\r\n        <circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"></circle>\r\n        <polyline points=\"21 15 16 10 5 21\"></polyline>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-menu-logo\" viewBox=\"0 0 24 24\" fill=\"none\">\r\n        <text x=\"12\" y=\"12\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"currentColor\" font-size=\"11\"\r\n            font-weight=\"800\" letter-spacing=\"0.2\">CC</text>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-download\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path>\r\n        <polyline points=\"7 10 12 15 17 10\"></polyline>\r\n        <line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-star\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <polygon\r\n            points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\">\r\n        </polygon>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-cloud\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <path d=\"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z\"></path>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-chevron\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <polyline points=\"6 9 12 15 18 9\"></polyline>\r\n    </symbol>\r\n</svg>\r\n\r\n<a href=\"javascript:void(0)\" rel=\"dropdownContent\" class=\"user-link csfd-compare-menu initialized\">\r\n    <svg class=\"cc-menu-icon\" width=\"24\" height=\"24\">\r\n        <use href=\"#cc-icon-menu-logo\"></use>\r\n    </svg>\r\n    <span class=\"cc-menu-update-pill\" id=\"cc-menu-update-pill\" aria-hidden=\"true\">1</span>\r\n</a>\r\n\r\n<div id=\"dropdown-compare-menu\" class=\"dropdown-content cc-settings\">\r\n    <div class=\"cc-settings-shell\">\r\n        <div class=\"cc-settings-shell-head\">\r\n            <div class=\"dropdown-content-head\">\r\n                <div class=\"left-head\">\r\n                    <h2>CSFD-Compare</h2>\r\n                    <div class=\"cc-version-row\">\r\n                        <a class=\"cc-version-link\" id=\"cc-version-value\"\r\n                            href=\"https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare\" target=\"_blank\"\r\n                            rel=\"noopener noreferrer\">v0.9.0</a>\r\n                        <a class=\"cc-version-status\" id=\"cc-version-status\"\r\n                            href=\"https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare\" target=\"_blank\"\r\n                            rel=\"noopener noreferrer\" tabindex=\"-1\" aria-hidden=\"true\"></a>\r\n                    </div>\r\n                </div>\r\n                <div class=\"right-head cc-ml-auto cc-head-right\">\r\n                    <div class=\"cc-head-tools\">\r\n                        <div class=\"cc-badges-pill\" title=\"Tvá uložená hodnocení\">\r\n                            <span id=\"cc-badge-red\" class=\"cc-badge cc-badge-red\" tabindex=\"0\" role=\"button\"\r\n                                title=\"Uloženo / Celkem: Počet přímo načtených hodnocení\">0 / 0</span>\r\n                            <span id=\"cc-badge-black\" class=\"cc-badge cc-badge-black\" tabindex=\"0\" role=\"button\"\r\n                                title=\"Spočtená hodnocení: Počet hodnocení automaticky dopočítaných pro seriály\">0</span>\r\n                        </div>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn\" id=\"cc-open-ratings-btn\"\r\n                            aria-label=\"Tabulka hodnocení\" title=\"Zobrazit tabulku všech hodnocení\">\r\n                            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <line x1=\"8\" y1=\"6\" x2=\"21\" y2=\"6\"></line>\r\n                                <line x1=\"8\" y1=\"12\" x2=\"21\" y2=\"12\"></line>\r\n                                <line x1=\"8\" y1=\"18\" x2=\"21\" y2=\"18\"></line>\r\n                                <line x1=\"3\" y1=\"6\" x2=\"3.01\" y2=\"6\"></line>\r\n                                <line x1=\"3\" y1=\"12\" x2=\"3.01\" y2=\"12\"></line>\r\n                                <line x1=\"3\" y1=\"18\" x2=\"3.01\" y2=\"18\"></line>\r\n                            </svg>\r\n                        </button>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn\" id=\"cc-sync-cloud-btn\"\r\n                            title=\"Synchronizace s cloudem\">\r\n                            <svg width=\"14\" height=\"14\">\r\n                                <use href=\"#cc-icon-cloud\"></use>\r\n                            </svg>\r\n                        </button>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn cc-version-info-btn\" id=\"cc-version-info-btn\"\r\n                            title=\"Informace o verzi\">\r\n                            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\r\n                                <line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line>\r\n                                <line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>\r\n                            </svg>\r\n                        </button>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn cc-settings-pin-close\"\r\n                            id=\"cc-settings-pinned-close-btn\" title=\"Zavřít připnuté menu\"\r\n                            aria-label=\"Zavřít připnuté menu\">\r\n                            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line>\r\n                                <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line>\r\n                            </svg>\r\n                        </button>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n\r\n            <div class=\"cc-settings-section\">\r\n                <div class=\"cc-settings-section-content\">\r\n                    <div class=\"cc-settings-actions\">\r\n                        <button id=\"cc-load-ratings-btn\" class=\"cc-button cc-button-red cc-grow cc-button-iconed\"\r\n                            title=\"Projde váš profil a stáhne všechna vaše hodnocení do lokální databáze (nutné pro správné fungování ostatních funkcí).\">\r\n                            <span class=\"cc-button-icon\" aria-hidden=\"true\"><svg width=\"14\" height=\"14\">\r\n                                    <use href=\"#cc-icon-download\"></use>\r\n                                </svg></span>\r\n                            <span>Načíst hodnocení</span>\r\n                        </button>\r\n                        <button id=\"cc-load-computed-btn\" class=\"cc-button cc-button-black cc-button-iconed\"\r\n                            title=\"Z načtených hodnocení automaticky vypočítá a doplní hodnocení pro celé seriály nebo jejich série.\">\r\n                            <span class=\"cc-button-icon\" aria-hidden=\"true\"><svg width=\"14\" height=\"14\">\r\n                                    <use href=\"#cc-icon-star\"></use>\r\n                                </svg></span>\r\n                            <span>Načíst spočtené</span>\r\n                        </button>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n\r\n        <div class=\"cc-settings-shell-body\">\r\n            <div class=\"cc-settings-scroll-region\">\r\n                <div class=\"cc-settings-section\" hidden>\r\n                    <div class=\"cc-settings-section-content\">\r\n                        <div id=\"cc-ratings-progress\" class=\"cc-ratings-progress\" hidden>\r\n                            <div class=\"cc-ratings-progress-head\">\r\n                                <span id=\"cc-ratings-progress-label\">Připravuji načítání…</span>\r\n                                <span id=\"cc-ratings-progress-count\">0 / 0</span>\r\n                            </div>\r\n                            <div class=\"cc-ratings-progress-track\">\r\n                                <div id=\"cc-ratings-progress-bar\" class=\"cc-ratings-progress-bar\" style=\"width: 0%\">\r\n                                </div>\r\n                            </div>\r\n                            <div class=\"cc-ratings-progress-actions\">\r\n                                <button id=\"cc-cancel-ratings-loader-btn\" class=\"cc-ratings-cancel-link\" hidden>Zrušit\r\n                                    načítání</button>\r\n                            </div>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"cc-settings-section\">\r\n                    <div class=\"cc-settings-section-content\" style=\"padding-top: 8px;\"\r\n                        id=\"cc-dynamic-settings-container\">\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n\r\n        <div class=\"cc-settings-shell-foot\">\r\n            <div class=\"cc-settings-section\">\r\n                <div class=\"cc-settings-section-content\">\r\n                    <h3 class=\"cc-section-title\" style=\"margin-top: 0;\">Další akce</h3>\r\n                    <div class=\"cc-maint-actions\" style=\"width: 100%;\">\r\n                        <button type=\"button\" class=\"cc-button cc-button-black cc-button-small\" id=\"cc-maint-reset-btn\"\r\n                            title=\"Vrátí veškeré přepínače a nastavení tohoto doplňku (včetně skrytých uživatelů) do původního, výchozího stavu.\">\r\n                            Reset\r\n                        </button>\r\n                        <button type=\"button\" class=\"cc-button cc-button-red cc-button-small cc-dev-only\"\r\n                            id=\"cc-maint-clear-lc-btn\" title=\"Otevře okno pro manuální smazání dat z LocalStorage.\">\r\n                            LC\r\n                        </button>\r\n                        <button type=\"button\" class=\"cc-button cc-button-red cc-button-small cc-dev-only\"\r\n                            id=\"cc-maint-clear-db-btn\"\r\n                            title=\"Smaže lokální CC hodnocení (IndexedDB). CSFD.cz hodnocení zůstanou nedotčena.\">\r\n                            Smazat DB\r\n                        </button>\r\n\r\n                        <div style=\"flex-grow: 1;\"></div>\r\n\r\n                        <button type=\"button\" class=\"cc-button cc-button-black cc-button-small\" id=\"cc-maint-dev-btn\"\r\n                            title=\"Zapne/vypne vývojářský režim (skryje nebo zobrazí testovací prvky).\">DEV:\r\n                            OFF</button>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n</div>";

  const DEFAULT_MAX_PAGES = 0; // 0 means no limit, load all available pages
  const REQUEST_DELAY_MIN_MS = 250;
  const REQUEST_DELAY_MAX_MS = 550;
  const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';
  const COMPUTED_LOADER_STATE_STORAGE_KEY = 'cc_computed_loader_state_v1';

  const loaderController = {
    isRunning: false,
    pauseRequested: false,
    pauseReason: 'manual',
  };

  const computedLoaderController = {
    isRunning: false,
    pauseRequested: false,
    pauseReason: 'manual',
  };

  function randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  function normalizeProfilePath(profileHref) {
    if (!profileHref) {
      return undefined;
    }

    const url = new URL(profileHref, location.origin);
    return url.pathname;
  }

  function getCurrentProfilePath() {
    const profileEl = getProfileLinkElement();
    if (!profileEl) {
      return undefined;
    }
    return normalizeProfilePath(profileEl.getAttribute('href'));
  }

  function getRatingsSegment() {
    return getCsfdPathSegment('ratings');
  }

  function extractUserSlugFromProfilePath(profilePath) {
    return extractUserSlug(profilePath);
  }

  function buildRatingsPageUrl(profilePath, pageNumber = 1) {
    return buildRatingsPageUrlWithMode(profilePath, pageNumber, 'path');
  }

  function buildRatingsPageUrlWithMode(profilePath, pageNumber = 1, mode = 'path') {
    const ratingsSegment = getRatingsSegment();
    const overviewSegments = getCsfdPathSegmentPattern('overview');
    const basePath = profilePath.replace(new RegExp(`\/(${overviewSegments})\/?$`, 'i'), `/${ratingsSegment}/`);
    const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;

    if (pageNumber <= 1) {
      return new URL(normalizedBasePath, location.origin).toString();
    }

    if (mode === 'query') {
      const url = new URL(normalizedBasePath, location.origin);
      url.searchParams.set('page', String(pageNumber));
      return url.toString();
    }

    return new URL(`${normalizedBasePath}strana-${pageNumber}/`, location.origin).toString();
  }

  async function fetchRatingsPageDocument(url) {
    const response = await fetch(url, {
      credentials: 'include',
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to load page (${response.status})`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  function parseTotalRatingsFromDocument$1(doc) {
    const heading = doc.querySelector('h2')?.textContent || '';
    const match = heading.match(/\(([^)]+)\)/);
    if (!match) {
      return 0;
    }
    const numeric = match[1].replace(/\s+/g, '');
    const parsed = Number.parseInt(numeric, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function parseMaxPaginationPageFromDocument(doc) {
    const pageLinks = Array.from(doc.querySelectorAll('a[href*="strana-"], a[href*="?page="], a[href*="&page="]'));
    const pageNumbers = pageLinks
      .map((link) => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/(?:strana-|[?&]page=)(\d+)/);
        return match ? Number.parseInt(match[1], 10) : NaN;
      })
      .filter((value) => !Number.isNaN(value));

    if (pageNumbers.length > 0) {
      return Math.max(...pageNumbers);
    }

    const totalRatings = parseTotalRatingsFromDocument$1(doc);
    return totalRatings > 0 ? Math.ceil(totalRatings / NUM_RATINGS_PER_PAGE) : 1;
  }

  function detectPaginationModeFromDocument(doc) {
    const queryPaginationLink = doc.querySelector('a[href*="?page="], a[href*="&page="]');
    return queryPaginationLink ? 'query' : 'path';
  }

  function normalizeType(rawType) {
    return normalizeCsfdShowType(rawType, 'movie');
  }

  function parseRating(starElement) {
    if (!starElement) {
      return NaN;
    }

    if (starElement.classList.contains('trash')) {
      return 0;
    }

    const starClass = Array.from(starElement.classList).find((className) => /^stars-\d$/.test(className));
    if (!starClass) {
      return NaN;
    }

    return Number.parseInt(starClass.replace('stars-', ''), 10);
  }

  function parseIdsFromUrl(relativeUrl) {
    const matches = Array.from((relativeUrl || '').matchAll(/\/(\d+)-/g)).map((match) => Number.parseInt(match[1], 10));

    if (matches.length === 0) {
      return { id: NaN, parentId: NaN, parentName: '' };
    }

    const id = matches[matches.length - 1];
    const parentId = matches.length > 1 ? matches[0] : NaN;
    const parts = (relativeUrl || '').split('/').filter(Boolean);
    const parentName = matches.length > 1 ? parts[1] || '' : '';

    return { id, parentId, parentName };
  }

  /**
   * Parses a single rating row from the user's ratings table and extracts all relevant information into a structured record.
   * Examples of rating rows:
   * - Übel Blatt - Durch Bruch (Break Through)2025epizoda (E01)		11.01.2025
   * - Stargate SG-1 - Bloodlines1997epizoda (S01E11)		26.02.2026
   * - Stranger Things - Season 52025série (S05)		20.02.2026
   * - May I Ask for One Final Thing?2025seriál		20.12.2025
   * @param {*} row The table row element containing the rating information.
   * @param {*} origin The origin URL to resolve relative links against.
   * @returns {Object|undefined} Structured rating record or undefined if parsing fails.
   */
  function parseRatingRow(row, origin) {
    const titleLink = row.querySelector('td.name a.film-title-name');
    if (!titleLink) {
      return undefined;
    }

    const relativeUrl = titleLink.getAttribute('href') || '';
    const name = titleLink.textContent?.trim() || '';
    const infoValues = Array.from(row.querySelectorAll('.film-title-info .info')).map((el) => el.textContent.trim());
    const yearValue = infoValues.find((value) => /^\d{4}$/.test(value));
    const rawType = infoValues.find((value) => !/^\d{4}$/.test(value));
    const tokenMatch = infoValues.find((value) => /^\((S\d{1,2}E\d{1,2}|S\d{1,2}|E\d{1,2})\)$/i.test(value));

    let seriesToken = tokenMatch ? tokenMatch.replace(/[()]/g, '') : '';

    // If no explicit series token is found in the info values, attempt to extract it from the name using common patterns
    if (!seriesToken) {
      const nameParent = name.match(/\((S\d{1,2}E\d{1,2}|S\d{1,2}|E\d{1,2})\)/i);
      if (nameParent) {
        seriesToken = nameParent[0].replace(/[()]/g, '');
      } else {
        const nameSeason = name.match(/S(\d{1,2})E(\d{1,2})/i);
        if (nameSeason) {
          seriesToken = `S${nameSeason[1].padStart(2, '0')}E${nameSeason[2].padStart(2, '0')}`;
        } else {
          const nameEpisode = name.match(/Episode\s*(\d{1,3})/i);
          if (nameEpisode) {
            seriesToken = `E${nameEpisode[1].padStart(2, '0')}`;
          } else {
            const nameSeason = name.match(/Season\s*(\d{1,2})/i);
            if (nameSeason) {
              seriesToken = `S${nameSeason[1].padStart(2, '0')}`;
            }
          }
        }
      }
    }

    const starRatingWrapper = row.querySelector('td.star-rating-only .star-rating');
    const starEl = starRatingWrapper?.querySelector('.stars');
    const computed = starRatingWrapper?.classList.contains('computed') || false;
    const computedFromText =
      row.querySelector('td.star-rating-only [title*="spočten" i]')?.getAttribute('title') ||
      row.querySelector('td.star-rating-only [title*="spocten" i]')?.getAttribute('title') ||
      '';
    const computedCountMatch = computedFromText.match(/(\d+)/);
    const computedCount = computedCountMatch ? Number.parseInt(computedCountMatch[1], 10) : NaN;
    const dateText = row.querySelector('td.date-only')?.textContent?.trim() || '';
    const { id, parentId, parentName } = parseIdsFromUrl(relativeUrl);

    const slugParts = relativeUrl.split('/').filter(Boolean);
    const urlSlug = slugParts[slugParts.length - 1] || '';

    return {
      id,
      url: urlSlug,
      fullUrl: new URL(relativeUrl, origin).toString(),
      name,
      year: yearValue ? Number.parseInt(yearValue, 10) : NaN,
      type: normalizeType(rawType),
      rating: parseRating(starEl),
      date: dateText,
      parentId,
      parentName,
      computed,
      computedCount,
      computedFromText,
      seriesToken,
      lastUpdate: new Date().toISOString(),
    };
  }

  function parseRatingsFromDocument(doc, origin) {
    const rows = Array.from(doc.querySelectorAll('table tr'));
    return rows.map((row) => parseRatingRow(row, origin)).filter(Boolean);
  }

  function getStoreNameForUser() {
    return RATINGS_STORE_NAME;
  }

  function buildStorageRecordId(userSlug, movieId) {
    return buildRatingRecordId(userSlug, movieId);
  }

  function toStorageRecord(record, userSlug) {
    const movieId = record.id;

    return {
      ...record,
      movieId,
      userSlug,
      id: buildStorageRecordId(userSlug, movieId),
    };
  }

  function createRecordFingerprint(record) {
    const computedCount = Number.isFinite(record?.computedCount) ? String(record.computedCount) : '';
    const token = record?.seriesToken || '';
    return [
      Number.isFinite(record?.rating) ? String(record.rating) : '',
      record?.date || '',
      record?.computed === true ? '1' : '0',
      computedCount,
      record?.computedFromText || '',
      token,
    ].join('|');
  }

  function hasRecordChanged(existingRecord, nextRecord) {
    if (!existingRecord) {
      return true;
    }

    return createRecordFingerprint(existingRecord) !== createRecordFingerprint(nextRecord);
  }

  function updateProgressUI(progress, state) {
    const container = progress.container;
    const section = progress.section;
    const label = progress.label;
    const count = progress.count;
    const bar = progress.bar;

    if (section) {
      section.hidden = false;
    }
    container.hidden = false;
    label.textContent = state.label;
    count.textContent = `${state.current} / ${state.total}`;
    const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
    bar.style.width = `${pct}%`;
  }

  function getButtonLabelElement(button) {
    return button?.querySelector('span:last-child') || button;
  }

  function setLoadButtonMode(button, mode) {
    if (!button) return;

    const labelEl = getButtonLabelElement(button);
    if (mode === 'running') {
      button.disabled = false;
      labelEl.textContent = 'Pozastavit načítání';
      return;
    }

    if (mode === 'pausing') {
      button.disabled = true;
      labelEl.textContent = 'Pozastavuji…';
      return;
    }

    if (mode === 'resume') {
      button.disabled = false;
      labelEl.textContent = 'Pokračovat v načítání';
      return;
    }

    button.disabled = false;
    labelEl.textContent = 'Načíst hodnocení';
  }

  function getPersistedLoaderState() {
    try {
      const raw = localStorage.getItem(LOADER_STATE_STORAGE_KEY);
      if (!raw) {
        return undefined;
      }
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  function setPersistedLoaderState(state) {
    localStorage.setItem(
      LOADER_STATE_STORAGE_KEY,
      JSON.stringify({
        ...state,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  function clearPersistedLoaderState() {
    localStorage.removeItem(LOADER_STATE_STORAGE_KEY);
  }

  function getPersistedComputedLoaderState() {
    try {
      const raw = localStorage.getItem(COMPUTED_LOADER_STATE_STORAGE_KEY);
      if (!raw) {
        return undefined;
      }
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  function setPersistedComputedLoaderState(state) {
    localStorage.setItem(
      COMPUTED_LOADER_STATE_STORAGE_KEY,
      JSON.stringify({
        ...state,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  function clearPersistedComputedLoaderState() {
    localStorage.removeItem(COMPUTED_LOADER_STATE_STORAGE_KEY);
  }

  function isStateForCurrentUser(state, userSlug) {
    if (!state || !userSlug) {
      return false;
    }

    return state.userSlug === userSlug;
  }

  function parseRatingFromStarsElement(starsEl) {
    return parseRatingFromStars(starsEl);
  }

  function parseCurrentUserRatingFromDocument(doc) {
    const currentUserNode = doc.querySelector('.others-rating .current-user-rating') || doc.querySelector('.my-rating');
    if (!currentUserNode) {
      return undefined;
    }

    const starRatingNode =
      currentUserNode.querySelector('.star-rating') || currentUserNode.querySelector('.stars-rating');
    const starsEl = starRatingNode?.querySelector('.stars');
    const rating = parseRatingFromStarsElement(starsEl);

    if (!Number.isFinite(rating)) {
      return undefined;
    }

    const titleWithComputed =
      currentUserNode.querySelector('[title*="spočten" i]')?.getAttribute('title') ||
      currentUserNode.querySelector('[title*="spocten" i]')?.getAttribute('title') ||
      '';

    const computedByClass =
      starRatingNode?.classList.contains('computed') ||
      currentUserNode.querySelector('.star.active.computed, .star.computed') !== null;

    const computed = computedByClass || titleWithComputed.length > 0;
    const computedCountMatch = titleWithComputed.match(/(\d+)/);
    const computedCount = computedCountMatch ? Number.parseInt(computedCountMatch[1], 10) : NaN;

    return {
      rating,
      computed,
      computedCount,
      computedFromText: titleWithComputed,
    };
  }

  function parsePageName(doc) {
    const titleEl = doc.querySelector('.film-header h1');
    return titleEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
  }

  function parsePageYear(doc) {
    const originText = doc.querySelector('.film-info-content .origin')?.textContent || '';
    const yearMatch = originText.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? Number.parseInt(yearMatch[0], 10) : NaN;
  }

  function parsePageType(doc) {
    const typeText = doc.querySelector('.film-header .type')?.textContent?.toLowerCase() || '';
    return normalizeCsfdShowType(typeText, 'movie');
  }

  function parsePageDate(doc) {
    const title =
      doc.querySelector('.my-rating .stars-rating')?.getAttribute('title') ||
      doc.querySelector('.others-rating .current-user-rating [title*="Vloženo" i]')?.getAttribute('title') ||
      '';
    const match = title.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
    return match ? match[1] : '';
  }

  function buildParentFullUrl(parentSlug) {
    return new URL(`/film/${parentSlug}/`, location.origin).toString();
  }

  function buildParentReviewsUrl(parentSlug) {
    return new URL(`/film/${parentSlug}/${getCsfdPathSegment('reviews')}/`, location.origin).toString();
  }

  function toComputedParentRecord({ userSlug, parentId, parentSlug, existingRecord, parsedRating, doc }) {
    const nowIso = new Date().toISOString();

    return {
      ...(existingRecord || {}),
      id: buildStorageRecordId(userSlug, parentId),
      userSlug,
      movieId: parentId,
      url: parentSlug,
      fullUrl: buildParentFullUrl(parentSlug),
      name: parsePageName(doc) || existingRecord?.name || '',
      year: parsePageYear(doc),
      type: parsePageType(doc),
      rating: parsedRating.rating,
      date: parsePageDate(doc) || existingRecord?.date || '',
      parentId: Number.NaN,
      parentName: '',
      computed: parsedRating.computed,
      computedCount: parsedRating.computedCount,
      computedFromText: parsedRating.computedFromText,
      lastUpdate: nowIso,
    };
  }

  async function loadComputedParentRatingsForCurrentUser({
    onProgress = () => {},
    resumeState = undefined,
    shouldPause = () => false,
  } = {}) {
    const profilePath = getCurrentProfilePath();
    if (!profilePath) {
      throw new Error('Profil uživatele nebyl nalezen.');
    }

    const userSlug = extractUserSlugFromProfilePath(profilePath);
    if (!userSlug) {
      throw new Error('Nepodařilo se přečíst ID uživatele z profilu.');
    }

    const allRecords = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const reconciledRecords = reconcileUserRatingRecords(allRecords, userSlug);
    if (reconciledRecords.hasChanges) {
      await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, reconciledRecords.normalizedRecords);
      await Promise.all(
        reconciledRecords.staleRecordIds.map((recordId) =>
          deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, recordId),
        ),
      );
    }
    const userRecords = reconciledRecords.normalizedRecords;

    let parentCandidatesCount = 0;
    let unresolvedParents = [];
    let startIndex = 0;
    let processed = 0;
    let saved = 0;
    let skippedNonComputed = 0;

    const recordsByMovieId = new Map();

    for (const record of userRecords) {
      const existing = recordsByMovieId.get(record.movieId);
      if (!existing) {
        recordsByMovieId.set(record.movieId, record);
      } else if (existing?.computed === true && record?.computed !== true) {
        recordsByMovieId.set(record.movieId, record);
      }

      if (record.computed === true && !record.computedFromText) {
        record.computedFromText = 'spocten';
      }
    }

    if (
      resumeState &&
      isStateForCurrentUser(resumeState, userSlug) &&
      Array.isArray(resumeState.unresolvedParents) &&
      resumeState.unresolvedParents.length > 0
    ) {
      unresolvedParents = resumeState.unresolvedParents;
      parentCandidatesCount = Number.parseInt(resumeState.parentCandidatesCount || `${unresolvedParents.length}`, 10);
      startIndex = Math.max(0, Number.parseInt(resumeState.nextIndex || '0', 10));
      processed = Math.max(0, Number.parseInt(resumeState.processed || '0', 10));
      saved = Math.max(0, Number.parseInt(resumeState.saved || '0', 10));
      skippedNonComputed = Math.max(0, Number.parseInt(resumeState.skippedNonComputed || '0', 10));
    } else {
      const parentCandidatesMap = new Map();
      for (const record of userRecords) {
        if (Number.isFinite(record.parentId) && typeof record.parentName === 'string' && record.parentName.length > 0) {
          parentCandidatesMap.set(record.parentId, record.parentName);
        }
      }

      const parentCandidates = Array.from(parentCandidatesMap.entries()).map(([parentId, parentSlug]) => ({
        parentId,
        parentSlug,
      }));
      parentCandidatesCount = parentCandidates.length;

      unresolvedParents = parentCandidates.filter(({ parentId }) => {
        const existingParent = recordsByMovieId.get(parentId);
        return !existingParent || existingParent.computed === true;
      });
    }

    setPersistedComputedLoaderState({
      status: 'running',
      userSlug,
      profilePath,
      parentCandidatesCount,
      unresolvedParents,
      nextIndex: startIndex,
      processed,
      saved,
      skippedNonComputed,
    });

    onProgress({
      stage: 'prepare',
      current: Math.min(startIndex, unresolvedParents.length),
      total: unresolvedParents.length || 1,
      message: `Kandidáti parent položek: ${parentCandidatesCount}, k dopočtu: ${unresolvedParents.length}`,
    });

    for (let index = startIndex; index < unresolvedParents.length; index++) {
      if (shouldPause()) {
        setPersistedComputedLoaderState({
          status: 'paused',
          pauseReason: computedLoaderController.pauseReason || 'manual',
          userSlug,
          profilePath,
          parentCandidatesCount,
          unresolvedParents,
          nextIndex: index,
          processed,
          saved,
          skippedNonComputed,
        });

        return {
          userSlug,
          candidates: parentCandidatesCount,
          unresolved: unresolvedParents.length,
          processed,
          saved,
          skippedNonComputed,
          paused: true,
          nextIndex: index,
        };
      }

      const { parentId, parentSlug } = unresolvedParents[index];
      processed = index + 1;

      const existingRecord = recordsByMovieId.get(parentId);
      const reviewsUrl = buildParentReviewsUrl(parentSlug);
      const doc = await fetchRatingsPageDocument(reviewsUrl);
      const parsedRating = parseCurrentUserRatingFromDocument(doc);

      if (!parsedRating) {
        onProgress({
          stage: 'fetch',
          current: processed,
          total: unresolvedParents.length || 1,
          message: `Stránka ${processed}/${unresolvedParents.length}: bez uživatelského hodnocení (${parentSlug})`,
        });

        setPersistedComputedLoaderState({
          status: 'running',
          userSlug,
          profilePath,
          parentCandidatesCount,
          unresolvedParents,
          nextIndex: index + 1,
          processed,
          saved,
          skippedNonComputed,
        });
        continue;
      }

      if (!parsedRating.computed) {
        skippedNonComputed += 1;
        onProgress({
          stage: 'fetch',
          current: processed,
          total: unresolvedParents.length || 1,
          message: `Přeskakuji ne-spočtené hodnocení (${processed}/${unresolvedParents.length})`,
        });

        setPersistedComputedLoaderState({
          status: 'running',
          userSlug,
          profilePath,
          parentCandidatesCount,
          unresolvedParents,
          nextIndex: index + 1,
          processed,
          saved,
          skippedNonComputed,
        });
        continue;
      }

      const record = toComputedParentRecord({
        userSlug,
        parentId,
        parentSlug,
        existingRecord,
        parsedRating,
        doc,
      });

      await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record);
      recordsByMovieId.set(parentId, record);
      saved += 1;

      setPersistedComputedLoaderState({
        status: 'running',
        userSlug,
        profilePath,
        parentCandidatesCount,
        unresolvedParents,
        nextIndex: index + 1,
        processed,
        saved,
        skippedNonComputed,
      });

      onProgress({
        stage: 'fetch',
        current: processed,
        total: unresolvedParents.length || 1,
        message: `Dopočítávám ${processed}/${unresolvedParents.length}… (${saved} spočtených uloženo)`,
      });

      if (index < unresolvedParents.length - 1) {
        await delay(randomDelay());
      }
    }

    return {
      userSlug,
      candidates: parentCandidatesCount,
      unresolved: unresolvedParents.length,
      processed,
      saved,
      skippedNonComputed,
      paused: false,
      nextIndex: unresolvedParents.length,
    };
  }

  async function loadRatingsForCurrentUser(
    maxPages = DEFAULT_MAX_PAGES,
    onProgress = () => {},
    resumeState = undefined,
    options = {},
  ) {
    const incremental = options.incremental !== false;
    const profilePath = getCurrentProfilePath();
    if (!profilePath) {
      throw new Error('Profil uživatele nebyl nalezen.');
    }

    const userSlug = extractUserSlugFromProfilePath(profilePath);
    if (!userSlug) {
      throw new Error('Nepodařilo se přečíst ID uživatele z profilu.');
    }

    const firstPageUrl = buildRatingsPageUrl(profilePath, 1);
    const firstDoc = await fetchRatingsPageDocument(firstPageUrl);

    const totalRatings = parseTotalRatingsFromDocument$1(firstDoc);
    const maxDetectedPages = parseMaxPaginationPageFromDocument(firstDoc);
    const paginationMode = detectPaginationModeFromDocument(firstDoc);

    const allExistingRecords = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const reconciledRecords = reconcileUserRatingRecords(allExistingRecords, userSlug);
    if (reconciledRecords.hasChanges) {
      await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, reconciledRecords.normalizedRecords);
      await Promise.all(
        reconciledRecords.staleRecordIds.map((recordId) =>
          deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, recordId),
        ),
      );
    }
    const userExistingRecords = reconciledRecords.normalizedRecords;
    const existingRecordsById = new Map(userExistingRecords.map((record) => [record.id, record]));
    let directRatingsCount = userExistingRecords.filter((record) => record.computed !== true).length;

    const detectedTargetPages =
      maxPages === 0 ? Math.max(1, maxDetectedPages) : Math.max(1, Math.min(maxPages, maxDetectedPages));

    const startPage = Math.max(1, Number.parseInt(resumeState?.nextPage || '1', 10));
    const targetPages = Math.max(startPage, Number.parseInt(resumeState?.targetPages || detectedTargetPages, 10));
    let totalParsed = Number.parseInt(resumeState?.totalParsed || '0', 10);
    let loadedPages = Number.parseInt(resumeState?.loadedPages || '0', 10);
    let totalUpserted = Number.parseInt(resumeState?.totalUpserted || '0', 10);
    let consecutiveStablePages = Number.parseInt(resumeState?.consecutiveStablePages || '0', 10);
    let stoppedEarly = false;

    setPersistedLoaderState({
      status: 'running',
      userSlug,
      profilePath,
      maxPages,
      totalRatings,
      maxDetectedPages,
      paginationMode,
      targetPages,
      nextPage: startPage,
      loadedPages,
      totalParsed,
      totalUpserted,
      directRatingsCount,
      consecutiveStablePages,
      incremental,
    });

    for (let page = startPage; page <= targetPages; page++) {
      if (loaderController.pauseRequested) {
        setPersistedLoaderState({
          status: 'paused',
          pauseReason: loaderController.pauseReason || 'manual',
          userSlug,
          profilePath,
          maxPages,
          totalRatings,
          maxDetectedPages,
          paginationMode,
          targetPages,
          nextPage: page,
          loadedPages,
          totalParsed,
          totalUpserted,
          directRatingsCount,
          consecutiveStablePages,
          incremental,
        });

        return {
          userSlug,
          totalPagesLoaded: loadedPages,
          totalPagesDetected: maxDetectedPages,
          totalParsed,
          totalRatings,
          storeName: getStoreNameForUser(),
          paused: true,
          nextPage: page,
          targetPages,
        };
      }

      const doc =
        page === 1
          ? firstDoc
          : await fetchRatingsPageDocument(buildRatingsPageUrlWithMode(profilePath, page, paginationMode));
      const pageRatings = parseRatingsFromDocument(doc, location.origin);

      if (page > 1 && pageRatings.length === 0) {
        break;
      }

      const storageRecords = pageRatings.map((record) => toStorageRecord(record, userSlug));
      const changedRecords = [];

      for (const record of storageRecords) {
        const existing = existingRecordsById.get(record.id);
        const recordChanged = hasRecordChanged(existing, record);
        if (!recordChanged) {
          continue;
        }

        changedRecords.push(record);

        if (!existing && record.computed !== true) {
          directRatingsCount += 1;
        } else if (existing) {
          const existingIsDirect = existing.computed !== true;
          const nextIsDirect = record.computed !== true;
          if (existingIsDirect && !nextIsDirect) {
            directRatingsCount = Math.max(0, directRatingsCount - 1);
          } else if (!existingIsDirect && nextIsDirect) {
            directRatingsCount += 1;
          }
        }

        existingRecordsById.set(record.id, record);
      }

      if (changedRecords.length > 0) {
        await saveToIndexedDB(INDEXED_DB_NAME, getStoreNameForUser(), changedRecords);
        totalUpserted += changedRecords.length;
        consecutiveStablePages = 0;
      } else {
        consecutiveStablePages += 1;
      }

      totalParsed += pageRatings.length;
      loadedPages += 1;

      setPersistedLoaderState({
        status: 'running',
        userSlug,
        profilePath,
        maxPages,
        totalRatings,
        maxDetectedPages,
        paginationMode,
        targetPages,
        nextPage: page + 1,
        loadedPages,
        totalParsed,
        totalUpserted,
        directRatingsCount,
        consecutiveStablePages,
        incremental,
      });

      onProgress({
        page,
        totalPages: targetPages,
        totalParsed,
        totalRatings,
        changedOnPage: changedRecords.length,
        totalUpserted,
        directRatingsCount,
        incremental,
      });

      // previously we stopped early during incremental runs once the count
      // reached totalRatings and we saw a stable page.  this was efficient when
      // we only cared about new entries, but it meant that metadata-only changes
      // (like adding a seriesToken) on later pages would never be detected.  by
      // requiring non-incremental mode we ensure full scans when the user explicitly
      // requests updates, while still allowing non-incremental callers to abort.
      const shouldStopEarly =
        !incremental &&
        page >= 2 &&
        totalRatings > 0 &&
        directRatingsCount >= totalRatings &&
        consecutiveStablePages >= 1;

      if (shouldStopEarly) {
        stoppedEarly = true;
        break;
      }

      if (page < targetPages) {
        await delay(randomDelay());
      }
    }

    return {
      userSlug,
      totalPagesLoaded: loadedPages,
      totalPagesDetected: maxDetectedPages,
      totalParsed,
      totalUpserted,
      totalRatings,
      directRatingsCount,
      storeName: getStoreNameForUser(),
      paused: false,
      nextPage: stoppedEarly ? loadedPages + 1 : targetPages + 1,
      targetPages,
      stoppedEarly,
      incremental,
    };
  }

  function initializeRatingsLoader(rootElement) {
    const loadButton = rootElement.querySelector('#cc-load-ratings-btn');
    const computedButton = rootElement.querySelector('#cc-load-computed-btn');
    const cancelPausedButton = rootElement.querySelector('#cc-cancel-ratings-loader-btn');
    const progress = {
      container: rootElement.querySelector('#cc-ratings-progress'),
      section: rootElement.querySelector('#cc-ratings-progress')?.closest('.cc-settings-section'),
      label: rootElement.querySelector('#cc-ratings-progress-label'),
      count: rootElement.querySelector('#cc-ratings-progress-count'),
      bar: rootElement.querySelector('#cc-ratings-progress-bar'),
    };

    if (!loadButton || !computedButton || !progress.container || !progress.label || !progress.count || !progress.bar) {
      return;
    }

    if (progress.section) {
      progress.section.hidden = true;
    }

    const setCancelPausedButtonVisible = (visible, mode = 'ratings') => {
      if (!cancelPausedButton) {
        return;
      }
      cancelPausedButton.hidden = !visible;
      cancelPausedButton.disabled = false;
      cancelPausedButton.dataset.mode = mode;
      const labelEl = getButtonLabelElement(cancelPausedButton);
      labelEl.textContent = mode === 'computed' ? 'Zrušit dopočet' : 'Zrušit načítání';
    };

    if (loadButton.dataset.ccRatingsBound === 'true') {
      return;
    }

    loadButton.dataset.ccRatingsBound = 'true';

    const setComputedButtonMode = (mode) => {
      const labelEl = getButtonLabelElement(computedButton);
      if (mode === 'running') {
        computedButton.disabled = false;
        labelEl.textContent = 'Pozastavit dopočet';
        return;
      }

      if (mode === 'pausing') {
        computedButton.disabled = true;
        labelEl.textContent = 'Pozastavuji…';
        return;
      }

      if (mode === 'resume') {
        computedButton.disabled = false;
        labelEl.textContent = 'Pokračovat v dopočtu';
        return;
      }

      computedButton.disabled = false;
      labelEl.textContent = 'Načíst spočtené';
    };

    const runLoad = async ({ resumeState = undefined, autoResume = false } = {}) => {
      if (loaderController.isRunning || computedLoaderController.isRunning) {
        return;
      }

      try {
        loaderController.isRunning = true;
        loaderController.pauseRequested = false;
        setLoadButtonMode(loadButton, 'running');

        const startPage = Math.max(1, Number.parseInt(resumeState?.nextPage || '1', 10));
        updateProgressUI(progress, {
          label: autoResume ? `Pokračuji od stránky ${startPage}…` : 'Připravuji načítání…',
          current: Math.max(0, startPage - 1),
          total: Math.max(1, Number.parseInt(resumeState?.targetPages || '1', 10)),
        });

        const result = await loadRatingsForCurrentUser(
          resumeState?.maxPages ?? DEFAULT_MAX_PAGES,
          ({
            page,
            totalPages,
            totalParsed,
            changedOnPage = 0,
            totalUpserted = 0,
            incremental: isIncremental = true,
          }) => {
            updateProgressUI(progress, {
              label: isIncremental
                ? `Kontroluji stránku ${page}/${totalPages}… (${changedOnPage} změn, celkem ${totalUpserted})`
                : `Načítám stránku ${page}/${totalPages}… (${totalParsed} položek)`,
              current: page,
              total: totalPages,
            });

            if (loaderController.pauseRequested) {
              setLoadButtonMode(loadButton, 'pausing');
            }
          },
          resumeState,
          {
            incremental: resumeState?.incremental !== false,
          },
        );

        if (result.paused) {
          updateProgressUI(progress, {
            label: `Pozastaveno na stránce ${result.nextPage}/${result.targetPages}`,
            current: Math.max(0, result.nextPage - 1),
            total: result.targetPages || 1,
          });
          setCancelPausedButtonVisible(true, 'ratings');
        } else {
          clearPersistedLoaderState();
          updateProgressUI(progress, {
            label: result.incremental
              ? `Hotovo: ${result.totalUpserted} nových/změněných (${result.totalPagesLoaded} str.)`
              : `Hotovo: ${result.totalParsed} hodnocení zpracováno (${result.totalPagesLoaded} str.)`,
            current: result.totalPagesLoaded,
            total: result.totalPagesLoaded || 1,
          });
          setCancelPausedButtonVisible(false, 'ratings');
        }

        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      } catch (error) {
        setPersistedLoaderState({
          ...(getPersistedLoaderState() || {}),
          status: 'paused',
          pauseReason: 'interrupted',
        });
        updateProgressUI(progress, {
          label: `Chyba: ${error.message}`,
          current: 0,
          total: 1,
        });
        console.error('[CC] Ratings loader failed:', error);
      } finally {
        loaderController.isRunning = false;
        loaderController.pauseRequested = false;
        loaderController.pauseReason = 'manual';

        const currentUserSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
        const stateAfterRun = getPersistedLoaderState();
        if (stateAfterRun?.status === 'paused' && isStateForCurrentUser(stateAfterRun, currentUserSlug)) {
          setLoadButtonMode(loadButton, 'resume');
          setCancelPausedButtonVisible(true, 'ratings');
        } else {
          setLoadButtonMode(loadButton, 'idle');
          const computedState = getPersistedComputedLoaderState();
          const hasComputedPause =
            computedState?.status === 'paused' && isStateForCurrentUser(computedState, currentUserSlug);
          setCancelPausedButtonVisible(hasComputedPause, hasComputedPause ? 'computed' : 'ratings');
        }
      }
    };

    const runComputedLoad = async ({ resumeState = undefined, autoResume = false } = {}) => {
      if (loaderController.isRunning || computedLoaderController.isRunning) {
        return;
      }

      try {
        computedLoaderController.isRunning = true;
        computedLoaderController.pauseRequested = false;
        setComputedButtonMode('running');

        const total = Math.max(1, Number.parseInt(resumeState?.unresolvedParents?.length || '1', 10));
        const startIndex = Math.max(0, Number.parseInt(resumeState?.nextIndex || '0', 10));
        updateProgressUI(progress, {
          label: autoResume ? `Pokračuji v dopočtu od položky ${startIndex + 1}…` : 'Připravuji dopočet seriálů…',
          current: Math.min(startIndex, total),
          total,
        });

        const result = await loadComputedParentRatingsForCurrentUser({
          resumeState,
          shouldPause: () => computedLoaderController.pauseRequested,
          onProgress: ({ current, total: progressTotal, message }) => {
            updateProgressUI(progress, {
              label: message,
              current,
              total: progressTotal,
            });

            if (computedLoaderController.pauseRequested) {
              setComputedButtonMode('pausing');
            }
          },
        });

        if (result.paused) {
          updateProgressUI(progress, {
            label: `Dopočet pozastaven na položce ${Math.min(result.nextIndex + 1, result.unresolved)}/${result.unresolved || 1}`,
            current: result.nextIndex,
            total: result.unresolved || 1,
          });
          setCancelPausedButtonVisible(true, 'computed');
        } else {
          clearPersistedComputedLoaderState();
          updateProgressUI(progress, {
            label: `Hotovo: ${result.saved} uloženo, ${result.skippedNonComputed} přeskočeno`,
            current: result.processed,
            total: result.unresolved || 1,
          });
          setCancelPausedButtonVisible(false, 'computed');
        }

        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      } catch (error) {
        setPersistedComputedLoaderState({
          ...(getPersistedComputedLoaderState() || {}),
          status: 'paused',
          pauseReason: 'interrupted',
        });
        updateProgressUI(progress, {
          label: `Chyba dopočtu: ${error.message}`,
          current: 0,
          total: 1,
        });
        console.error('[CC] Computed ratings loader failed:', error);
      } finally {
        computedLoaderController.isRunning = false;
        computedLoaderController.pauseRequested = false;
        computedLoaderController.pauseReason = 'manual';

        const currentUserSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
        const stateAfterRun = getPersistedComputedLoaderState();
        if (stateAfterRun?.status === 'paused' && isStateForCurrentUser(stateAfterRun, currentUserSlug)) {
          setComputedButtonMode('resume');
          setCancelPausedButtonVisible(true, 'computed');
        } else {
          setComputedButtonMode('idle');
          setCancelPausedButtonVisible(false, 'computed');
        }
      }
    };

    if (cancelPausedButton) {
      cancelPausedButton.addEventListener('click', () => {
        if (loaderController.isRunning || computedLoaderController.isRunning) {
          return;
        }

        const userSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
        const ratingsState = getPersistedLoaderState();
        const computedState = getPersistedComputedLoaderState();

        const hasRatingsPause = ratingsState?.status === 'paused' && isStateForCurrentUser(ratingsState, userSlug);
        const hasComputedPause = computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug);

        if (hasComputedPause && !hasRatingsPause) {
          const pausedCurrent = Math.max(
            0,
            Number.parseInt(computedState?.processed || `${computedState?.nextIndex || 0}`, 10),
          );
          const pausedTotal = Math.max(1, Number.parseInt(computedState?.unresolvedParents?.length || '1', 10));
          clearPersistedComputedLoaderState();
          setComputedButtonMode('idle');
          updateProgressUI(progress, {
            label: 'Pozastavený dopočet byl zrušen',
            current: pausedCurrent,
            total: pausedTotal,
          });
        } else {
          const pausedCurrent = Math.max(
            0,
            Number.parseInt(ratingsState?.loadedPages || `${Math.max(0, (ratingsState?.nextPage || 1) - 1)}`, 10),
          );
          const pausedTotal = Math.max(1, Number.parseInt(ratingsState?.targetPages || '1', 10));
          clearPersistedLoaderState();
          setLoadButtonMode(loadButton, 'idle');
          updateProgressUI(progress, {
            label: 'Pozastavené načítání bylo zrušeno',
            current: pausedCurrent,
            total: pausedTotal,
          });
        }

        setCancelPausedButtonVisible(false);
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      });
    }

    loadButton.title = 'Klik: rychlé doplnění chybějících/změněných, Shift+klik: plné načtení';

    loadButton.addEventListener('click', async (event) => {
      if (computedLoaderController.isRunning) {
        return;
      }

      if (loaderController.isRunning) {
        loaderController.pauseRequested = true;
        loaderController.pauseReason = 'manual';
        setLoadButtonMode(loadButton, 'pausing');
        return;
      }

      const state = getPersistedLoaderState();
      const forceFullLoad = event.shiftKey === true;
      const resumeState = state?.status === 'paused' ? state : undefined;

      if (forceFullLoad && resumeState) {
        resumeState.incremental = false;
      }

      await runLoad({
        resumeState: resumeState
          ? resumeState
          : {
              incremental: !forceFullLoad,
            },
        autoResume: false,
      });
    });

    if (computedButton.dataset.ccComputedBound !== 'true') {
      computedButton.dataset.ccComputedBound = 'true';
      computedButton.addEventListener('click', async () => {
        if (loaderController.isRunning) {
          return;
        }

        if (computedLoaderController.isRunning) {
          computedLoaderController.pauseRequested = true;
          computedLoaderController.pauseReason = 'manual';
          setComputedButtonMode('pausing');
          return;
        }

        const computedState = getPersistedComputedLoaderState();
        await runComputedLoad({
          resumeState: computedState?.status === 'paused' ? computedState : undefined,
          autoResume: false,
        });
      });
    }

    const userSlug = extractUserSlugFromProfilePath(getCurrentProfilePath());
    const state = getPersistedLoaderState();
    const computedState = getPersistedComputedLoaderState();
    let cancelMode = 'ratings';

    if (state?.status === 'paused' && isStateForCurrentUser(state, userSlug)) {
      setLoadButtonMode(loadButton, 'resume');
      cancelMode = 'ratings';

      if (state.pauseReason === 'manual') {
        updateProgressUI(progress, {
          label: `Pozastaveno ručně na stránce ${state.nextPage}/${state.targetPages || '?'}`,
          current: Math.max(0, (state.nextPage || 1) - 1),
          total: state.targetPages || 1,
        });
      } else {
        updateProgressUI(progress, {
          label: `Nalezeno nedokončené načítání (str. ${state.nextPage}/${state.targetPages || '?'}) — automaticky pokračuji…`,
          current: Math.max(0, (state.nextPage || 1) - 1),
          total: state.targetPages || 1,
        });

        setTimeout(() => {
          runLoad({ resumeState: state, autoResume: true });
        }, 500);
      }
    }

    if (computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug)) {
      setComputedButtonMode('resume');
      cancelMode = 'computed';

      if (computedState.pauseReason === 'manual') {
        updateProgressUI(progress, {
          label: `Dopočet pozastaven ručně na položce ${(computedState.nextIndex || 0) + 1}/${computedState.unresolvedParents?.length || 1}`,
          current: computedState.nextIndex || 0,
          total: computedState.unresolvedParents?.length || 1,
        });
      } else {
        updateProgressUI(progress, {
          label: `Nalezen nedokončený dopočet (${computedState.nextIndex || 0}/${computedState.unresolvedParents?.length || 1}) — automaticky pokračuji…`,
          current: computedState.nextIndex || 0,
          total: computedState.unresolvedParents?.length || 1,
        });

        setTimeout(() => {
          runComputedLoad({ resumeState: computedState, autoResume: true });
        }, 500);
      }
    }

    const hasAnyPaused =
      (state?.status === 'paused' && isStateForCurrentUser(state, userSlug)) ||
      (computedState?.status === 'paused' && isStateForCurrentUser(computedState, userSlug));
    setCancelPausedButtonVisible(hasAnyPaused, cancelMode);
  }

  // supabase-api.js

  const SUPABASE_URL = 'https://ttbwkjnipnwqaujkyotc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_Mb7Bm7xyq0yaHjhGeHS76w_CNvfcCjU';

  const HEADERS = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  async function getOrCreateToken(userSlug) {
    if (!userSlug) return null;
    try {
      const getResponse = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync?user_slug=eq.${userSlug}&select=token`, {
        method: 'GET',
        headers: HEADERS,
      });
      if (!getResponse.ok) throw new Error('Failed to fetch existing token');
      const existingData = await getResponse.json();
      if (existingData && existingData.length > 0) return existingData[0].token;

      const postResponse = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'return=representation' },
        body: JSON.stringify({
          user_slug: userSlug,
          ratings_data: {},
          updated_at: new Date().toISOString(),
        }),
      });
      if (!postResponse.ok) throw new Error('Failed to create new token');
      const newData = await postResponse.json();
      return newData[0].token;
    } catch (error) {
      console.error('[CC Sync] Error generating token:', error);
      return null;
    }
  }

  /**
   * Downloads the user's ratings from Supabase.
   */
  async function downloadFromCloud(userToken) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync?token=eq.${userToken}&select=ratings_data`, {
        method: 'GET',
        headers: HEADERS,
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.length > 0 ? data[0].ratings_data : null;
    } catch (error) {
      console.error('[CC Sync] Download error:', error);
      return null;
    }
  }

  /**
   * Uploads merged ratings to Supabase using an Upsert.
   */
  async function uploadToCloud(userToken, ratingsJson, userSlug) {
    try {
      const payload = {
        token: userToken,
        ratings_data: ratingsJson,
        updated_at: new Date().toISOString(),
      };

      // Include user_slug so Supabase's Upsert doesn't fail the Not-Null constraint
      if (userSlug) {
        payload.user_slug = userSlug;
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('[CC Sync] Upload error:', error);
      return false;
    }
  }

  const SYNC_ENABLED_KEY = 'cc_sync_enabled';
  const SYNC_ACCESS_KEY = 'cc_sync_access_key';

  let isSyncing = false; // Lock to prevent overlapping sync loops

  function getSyncSetupState() {
    return {
      enabled: localStorage.getItem(SYNC_ENABLED_KEY) === 'true',
      accessKey: localStorage.getItem(SYNC_ACCESS_KEY) || '',
    };
  }

  function saveSyncSetupState({ enabled, accessKey }) {
    localStorage.setItem(SYNC_ENABLED_KEY, String(Boolean(enabled)));
    localStorage.setItem(SYNC_ACCESS_KEY, (accessKey || '').trim());
  }

  function removeSyncModal() {
    document.querySelector('.cc-sync-modal-overlay')?.remove();
  }

  function getActiveUserSlugFallback() {
    const match = document
      .querySelector('a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]')
      ?.getAttribute('href')
      ?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
  }

  /**
   * Creates the Conflict Modal to display differences and allow manual overrides.
   */
  function openConflictModal(conflicts, localData, cloudData, accessKey, currentUserSlug, onResolved) {
    const overlay = document.createElement('div');
    overlay.className = 'cc-sync-modal-overlay visible';
    overlay.style.zIndex = '10050'; // Zaručí, že překryje i původní sync okno

    // Helper pro krásné vykreslení hodnocení nebo "odpadu"
    const formatRating = (record) => {
      if (!record || record.deleted) {
        return '<span style="color: #aa2c16; font-weight: 600;">Smazáno</span>';
      }

      let ratingDisplay = '';
      if (record.rating === 0) {
        ratingDisplay = '<strong style="color: #000;">Odpad!</strong>';
      } else if (Number.isFinite(record.rating)) {
        const r = Math.min(5, Math.max(1, Math.round(record.rating)));
        const starsOn = '★'.repeat(r);
        const starsOff = '★'.repeat(5 - r);
        ratingDisplay = `<span style="color: #b8321d; font-size: 14px; letter-spacing: 1px;">${starsOn}<span style="color: #ddd;">${starsOff}</span></span>`;
      } else {
        ratingDisplay = '<span style="color: #888;">Neznámé</span>';
      }

      const dateDisplay = record.date
        ? `<div style="color: #888; font-size: 10px; margin-top: 4px;">${record.date}</div>`
        : '';

      return `<div>${ratingDisplay}${dateDisplay}</div>`;
    };

    // Sestavení řádků do tabulky
    const rowsHtml = Object.entries(conflicts)
      .map(([id, item]) => {
        const title = item.local?.name || item.cloud?.name || id;
        return `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 10px; font-size: 12px; color: #222; font-weight: 600; line-height: 1.3;">${title}</td>
        <td style="padding: 10px; border-left: 1px solid #f0f0f0; background: #fffdfd; text-align: center; vertical-align: middle;">${formatRating(item.local)}</td>
        <td style="padding: 10px; border-left: 1px solid #f0f0f0; background: #fbfbfb; text-align: center; vertical-align: middle;">${formatRating(item.cloud)}</td>
      </tr>
    `;
      })
      .join('');

    overlay.innerHTML = `
    <div class="cc-sync-modal" style="width: 680px; max-width: 95vw; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,0.25); padding: 18px;">
      <div class="cc-sync-modal-head" style="border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="color: #aa2c16; font-size: 16px; margin: 0; display: flex; align-items: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Zjištěn konflikt v hodnoceních
        </h3>
        <button type="button" class="cc-sync-close" aria-label="Zavřít" style="font-size: 24px; border: 0; background: transparent; cursor: pointer; color: #666; line-height: 1;">&times;</button>
      </div>

      <p style="font-size: 13px; color: #444; margin-bottom: 16px; line-height: 1.5;">
        Našli jsme rozdíly mezi tímto prohlížečem a zálohou v cloudu. Může to znamenat, že jste tyto filmy hodnotili na jiném zařízení. <strong>Kterou verzi si přejete zachovat?</strong>
      </p>

      <div style="max-height: 350px; max-height: 60vh; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead style="background: #f5f5f5; position: sticky; top: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1;">
            <tr>
              <th style="padding: 10px; font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase;">Název filmu / seriálu</th>
              <th style="padding: 10px; font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; border-left: 1px solid #e0e0e0; text-align: center; width: 28%;">Tento prohlížeč</th>
              <th style="padding: 10px; font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; border-left: 1px solid #e0e0e0; text-align: center; width: 28%;">Záloha v cloudu</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="display: flex; gap: 12px;">
        <button type="button" id="cc-conflict-download" class="cc-button cc-button-black" style="flex: 1; padding: 12px 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 8px; height: auto; transition: all 0.2s;">
          <span style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Přijmout cloudovou zálohu
          </span>
          <span style="font-size: 11px; color: #aaa; font-weight: normal;">Zahodí lokální úpravy a stáhne data z cloudu</span>
        </button>

        <button type="button" id="cc-conflict-upload" class="cc-button cc-button-red" style="flex: 1; padding: 12px 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 8px; height: auto; transition: all 0.2s;">
          <span style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Ponechat lokální změny
          </span>
          <span style="font-size: 11px; color: rgba(255,255,255,0.7); font-weight: normal;">Nahraje tyto novější úpravy do cloudu</span>
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);

    // Manual Download Overwrite
    overlay.querySelector('#cc-conflict-download')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Stahuji...';
      try {
        for (const record of Object.values(cloudData)) {
          if (record.deleted) {
            await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record.id);
          } else {
            await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record);
          }
        }
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
        onResolved('✅ Konflikt vyřešen: Data úspěšně přepsána z cloudu.');
        closeModal();
      } catch (err) {
        btn.querySelector('span').textContent = 'Chyba stahování';
        btn.style.background = '#aa2c16';
      }
    });

    // Manual Upload Overwrite
    overlay.querySelector('#cc-conflict-upload')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Nahrávám...';
      try {
        const activeSlug = currentUserSlug || Object.values(localData)[0]?.userSlug;
        await uploadToCloud(accessKey, localData, activeSlug);
        onResolved('✅ Konflikt vyřešen: Cloud úspěšně přepsán lokálními daty.');
        closeModal();
      } catch (err) {
        btn.querySelector('span').textContent = 'Chyba nahrávání';
        btn.style.background = '#222';
      }
    });
  }

  /**
   * Creates and displays the primary Sync Setup modal.
   */
  function createSyncSetupModal(onSaveCallback, currentUserSlug) {
    removeSyncModal();

    const { enabled, accessKey } = getSyncSetupState();

    const overlay = document.createElement('div');
    overlay.className = 'cc-sync-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cc-sync-modal';

    modal.innerHTML = `
    <div class="cc-sync-modal-head">
      <h3>Nastavení Cloud Sync <span style="color: #aa2c16; font-size: 11px; vertical-align: middle;">(BETA)</span></h3>
      <button type="button" class="cc-sync-close" aria-label="Zavřít">&times;</button>
    </div>

    <div style="font-size: 12px; color: #444; margin-bottom: 14px; line-height: 1.4;">
      <p style="margin-top: 0;">
        Zálohujte svá hodnocení a synchronizujte je napříč zařízeními.
        Pro spárování vložte svůj osobní <strong>Sync Token</strong>.
      </p>
    </div>

    <div style="background: #f9f9f9; border: 1px solid #eee; padding: 10px; border-radius: 8px; margin-bottom: 14px;">
      <label class="cc-sync-toggle-row" style="margin-bottom: 8px; display: flex; cursor: pointer;">
        <input id="cc-sync-enabled-input" type="checkbox" ${enabled ? 'checked' : ''} style="margin-right: 8px; accent-color: #aa2c16;">
        <span style="font-weight: 600; color: #222;">Povolit synchronizaci</span>
      </label>

      <div id="cc-sync-inputs-container" style="transition: opacity 0.2s ease;">
        <label class="cc-sync-label" for="cc-sync-key-input" style="font-weight: 600; margin-top: 8px; display: block;">Váš Sync Token</label>

        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <input id="cc-sync-key-input" class="cc-sync-input" type="password" placeholder="Např. a1b2c3d4-e5f6..." value="${accessKey.replace(/"/g, '&quot;')}" style="flex: 1; border: 1px solid #ccc; margin: 0;">
          <button type="button" id="cc-generate-token-btn" class="cc-button cc-button-black" style="white-space: nowrap;" ${!currentUserSlug ? 'title="Musíte být přihlášeni"' : ''}>
            Získat Token
          </button>
        </div>
        <div id="cc-sync-error" style="color: #aa2c16; font-size: 11px; margin-top: 4px; display: none;">Došlo k chybě při komunikaci se serverem.</div>

        <div id="cc-smart-sync-section" style="margin-top: 16px; transition: opacity 0.2s ease;">
          <button type="button" id="cc-smart-sync-btn" class="cc-button cc-button-red" style="width: 100%; padding: 8px; font-size: 13px; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Synchronizovat Nyní
          </button>
          <div id="cc-smart-sync-status" style="color: #184e21; font-size: 11px; margin-top: 8px; text-align: center; font-weight: 600; min-height: 14px; white-space: pre-wrap;"></div>
        </div>
      </div>
    </div>

    <div class="cc-sync-actions">
      <button type="button" class="cc-sync-save cc-button cc-button-red">Zavřít</button>
    </div>
  `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('visible'));

    const closeModal = () => {
      overlay.classList.remove('visible');
      setTimeout(removeSyncModal, 180);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    modal.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);
    modal.querySelector('.cc-sync-save')?.addEventListener('click', closeModal);

    // --- UI Elements ---
    const generateBtn = modal.querySelector('#cc-generate-token-btn');
    const keyInput = modal.querySelector('#cc-sync-key-input');
    const enabledInput = modal.querySelector('#cc-sync-enabled-input');
    const inputsContainer = modal.querySelector('#cc-sync-inputs-container');
    const errorText = modal.querySelector('#cc-sync-error');
    const smartSyncBtn = modal.querySelector('#cc-smart-sync-btn');
    const smartSyncStatus = modal.querySelector('#cc-smart-sync-status');

    const setStatus = (msg, isError = false) => {
      smartSyncStatus.textContent = msg;
      smartSyncStatus.style.color = isError ? '#aa2c16' : '#184e21';
    };

    // --- Toggle & Auto-Save Logic ---
    const handleInputChange = () => {
      const isChecked = enabledInput.checked;
      const hasKey = keyInput.value.length > 0;

      keyInput.disabled = !isChecked;
      if (generateBtn) generateBtn.disabled = !isChecked || !currentUserSlug;

      inputsContainer.style.opacity = isChecked ? '1' : '0.5';
      inputsContainer.style.pointerEvents = isChecked ? 'auto' : 'none';

      const sectionsEnabled = isChecked && hasKey;
      smartSyncBtn.parentElement.style.opacity = sectionsEnabled ? '1' : '0.3';
      smartSyncBtn.parentElement.style.pointerEvents = sectionsEnabled ? 'auto' : 'none';

      saveSyncSetupState({
        enabled: Boolean(enabledInput.checked),
        accessKey: keyInput.value || '',
      });
      if (onSaveCallback) onSaveCallback();
    };

    handleInputChange();
    enabledInput.addEventListener('change', handleInputChange);
    keyInput.addEventListener('input', handleInputChange);

    // --- Token Generation ---
    if (generateBtn) {
      generateBtn.addEventListener('click', async () => {
        if (!currentUserSlug) return;

        generateBtn.disabled = true;
        generateBtn.textContent = 'Načítám...';
        errorText.style.display = 'none';

        const token = await getOrCreateToken(currentUserSlug);

        if (token) {
          keyInput.type = 'text';
          keyInput.value = token;
          enabledInput.checked = true;
          generateBtn.textContent = 'Hotovo ✓';
          handleInputChange();
        } else {
          errorText.style.display = 'block';
          generateBtn.disabled = false;
          generateBtn.textContent = 'Zkusit znovu';
        }
      });
    }

    // --- SMART SYNC NOW ---
    if (smartSyncBtn) {
      smartSyncBtn.addEventListener('click', async () => {
        smartSyncBtn.disabled = true;
        const originalText = smartSyncBtn.innerHTML;
        smartSyncBtn.textContent = 'Prověřuji data...';
        smartSyncStatus.textContent = '';

        // true = we are running manually, so it checks for conflicts!
        const result = await performCloudSync(true);

        if (result.status === 'conflict') {
          setStatus('Zjištěny nesrovnalosti.', true);
          openConflictModal(
            result.conflicts,
            result.localData,
            result.cloudData,
            keyInput.value,
            currentUserSlug,
            (resolutionMsg) => {
              setStatus(resolutionMsg);
            },
          );
        } else if (result.status === 'success') {
          const { addedToLocal, updatedInLocal, addedToCloud, updatedInCloud } = result.stats;

          if (addedToLocal === 0 && updatedInLocal === 0 && addedToCloud === 0 && updatedInCloud === 0) {
            setStatus('✅ Všechna data jsou již aktuální.');
          } else {
            let msg = '✅ Synchronizace úspěšná.\n';
            if (addedToLocal > 0) msg += `Staženo nových: ${addedToLocal}. `;
            if (updatedInLocal > 0) msg += `Aktualizováno lokálně: ${updatedInLocal}. `;
            if (addedToCloud > 0) msg += `Nahráno do cloudu: ${addedToCloud}. `;
            if (updatedInCloud > 0) msg += `Aktualizováno v cloudu: ${updatedInCloud}.`;
            setStatus(msg);
          }
        } else {
          setStatus('Nastala chyba při synchronizaci.', true);
        }

        smartSyncBtn.disabled = false;
        smartSyncBtn.innerHTML = originalText;
      });
    }
  }

  function updateSyncButtonLabel(button) {
    const { enabled, accessKey } = getSyncSetupState();
    const isFullyEnabled = enabled && accessKey.length > 0;

    button.classList.toggle('is-enabled', isFullyEnabled);
    button.setAttribute('title', isFullyEnabled ? 'Cloud sync je aktivní' : 'Nastavit Cloud sync');
    button.setAttribute('aria-label', isFullyEnabled ? 'Cloud sync zapnutý' : 'Nastavit Cloud sync');
  }

  function initializeRatingsSync(rootElement, getCurrentUserSlug) {
    const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');

    if (!syncButton || syncButton.dataset.ccSyncBound === 'true') return;

    syncButton.dataset.ccSyncBound = 'true';
    updateSyncButtonLabel(syncButton);

    syncButton.addEventListener('click', () => {
      const userSlug = getCurrentUserSlug();
      createSyncSetupModal(() => {
        updateSyncButtonLabel(syncButton);
      }, userSlug);
    });
  }

  /**
   * The main synchronization engine.
   * If isManualCheck is true, it strictly detects conflicts and pauses. Otherwise, it autosyncs.
   */
  async function performCloudSync(isManualCheck = false) {
    if (isSyncing) return { status: 'error' };

    const { enabled, accessKey } = getSyncSetupState();
    if (!enabled || !accessKey) return { status: 'error' };

    isSyncing = true;
    console.log('☁️ [CC Sync] Starting sync...');

    try {
      const localArray = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
      const localData = {};
      localArray.forEach((record) => {
        if (record && record.movieId) localData[record.movieId] = record;
      });

      const cloudData = (await downloadFromCloud(accessKey)) || {};

      let hasLocalChanges = false;
      let hasCloudChanges = false;
      const mergedData = { ...localData };
      const stats = { addedToLocal: 0, updatedInLocal: 0, addedToCloud: 0, updatedInCloud: 0 };

      // ==========================================
      // 1. CONFLICT DETECTION (Manual Mode Only)
      // ==========================================
      if (isManualCheck) {
        const conflicts = {};
        let hasConflicts = false;

        for (const [movieId, cloudRecord] of Object.entries(cloudData)) {
          const localRecord = localData[movieId];

          if (!localRecord && !cloudRecord.deleted) {
            // It's a real record in the cloud, but totally missing here.
            hasConflicts = true;
            conflicts[movieId] = { local: null, cloud: cloudRecord };
          } else if (localRecord && cloudRecord.deleted && !localRecord.deleted) {
            // We have it, but cloud says it's deleted
            hasConflicts = true;
            conflicts[movieId] = { local: localRecord, cloud: cloudRecord };
          } else if (localRecord && !cloudRecord.deleted && localRecord.rating !== cloudRecord.rating) {
            // Ratings are just different
            hasConflicts = true;
            conflicts[movieId] = { local: localRecord, cloud: cloudRecord };
          }
        }

        if (hasConflicts) {
          return { status: 'conflict', conflicts, localData, cloudData };
        }
      }

      // ==========================================
      // 2. STANDARD MERGE (Timestamp Based with Tombstones)
      // ==========================================
      for (const [movieId, cloudRecord] of Object.entries(cloudData)) {
        const localRecord = mergedData[movieId];

        if (!localRecord) {
          // We don't have it locally.
          if (cloudRecord.deleted) {
            // It's a tombstone. Ignore it, we already don't have it.
          } else {
            // It's a real new movie from the cloud. Download it.
            mergedData[movieId] = cloudRecord;
            await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord);
            hasLocalChanges = true;
            stats.addedToLocal++;
          }
        } else {
          const localTime = new Date(localRecord.lastUpdate || 0).getTime();
          const cloudTime = new Date(cloudRecord.lastUpdate || 0).getTime();

          if (cloudTime > localTime) {
            // Cloud is newer!
            mergedData[movieId] = cloudRecord;

            if (cloudRecord.deleted) {
              // Cloud says it was deleted on another device! Remove it here.
              await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord.id);
              stats.updatedInLocal++;
              hasLocalChanges = true;
            } else {
              await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord);
              stats.updatedInLocal++;
              hasLocalChanges = true;
            }
          } else if (localTime > cloudTime) {
            // Local is newer! (Could be a local edit, OR a local tombstone)
            hasCloudChanges = true;
            stats.updatedInCloud++;
          }
        }
      }

      // Add entirely new local items to the cloud list
      for (const movieId of Object.keys(localData)) {
        if (!cloudData[movieId]) {
          hasCloudChanges = true;
          stats.addedToCloud++;
        }
      }

      // ==========================================
      // 3. UPLOAD & REFRESH
      // ==========================================
      if (hasCloudChanges || Object.keys(cloudData).length === 0) {
        console.log('☁️ [CC Sync] Uploading updated data to cloud...');
        const activeSlug = getActiveUserSlugFallback() || Object.values(localData)[0]?.userSlug;
        await uploadToCloud(accessKey, mergedData, activeSlug);
      }

      if (hasLocalChanges) {
        console.log('☁️ [CC Sync] Local DB updated. Refreshing UI.');
        window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      }

      console.log('☁️ [CC Sync] Sync complete!', stats);
      return { status: 'success', stats, hasLocalChanges, hasCloudChanges };
    } catch (error) {
      console.error('☁️ [CC Sync] Failed:', error);
      return { status: 'error' };
    } finally {
      isSyncing = false;
    }
  }

  const BUILD_CHANGELOG_BASE_URL = "https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/refs/heads/dev/";
  const BUILD_CHANGELOG_MARKDOWN = "# Changelog\r\n\r\n## 0.9.1 - unreleased\r\n\r\n### Added\r\n\r\n- Notifikace o nové verzi skriptu nad CC menu\r\n- Do náhledové karty filmu přidáno - **Režie:**\r\n- Nové nastavení: vrácení stylu hvězdiček pro hodnocení u filmu (žádné šedé, zarovnání doprava)\r\n- Nový náhled: Odkaz na přímou recenzi na CSFD, včetně hodnocení, data a odkazu na recenzi\r\n  ![Recenze](images/changelog/0.9.1-nahledy-recenze.png)\r\n\r\n### Changed\r\n\r\n- Lepší notifikace o nové verzi skriptu v CC menu  \r\n  ![Notifikace](images/changelog/0.9.1-notifikace.png)\r\n\r\n### Fixed\r\n\r\n- Opraveno zobrazení Hrajů v náhledu filmu pro SK verzi\r\n- Opraveno schovávání panelu TV tipy dne - <den>\r\n- Už se nezobrazuje náhled svého profilu po přejetí myši přes profil v menu\r\n- Filmové postranní sekce (Oblíbené, Související) už zobrazují hvězdičky hodnocení\r\n\r\n### Development\r\n\r\n- Úprava logiky pro zobrazení changelogu po aktualizaci skriptu v dev prostředí\r\n- Zobrazení fotek z images/changelog v dev módu, přes github v release verzi\r\n- Optimalizace kódu, zbavení se duplikátů, atd...\r\n- CHANGELOG.md - předány sekce z minulých releasů\r\n- CHANGELOG.md - opraveny odkazy na github issues (#X)\r\n- Vylepšení README.md pro vývoj, přidány instrukce pro nastavení @require pro Chrome/Opera i Firefox\r\n- Vylepšení rozeznání SK vs CZ verze pro mechaniky skriptu\r\n  Nový skript pro stažení testovacích stránek z obou verzí pro vývoj a testování: `scripts/download-test-pages.js`\r\n\r\n## 0.9.0 - 2026-03-09\r\n\r\n### Added\r\n\r\n- Nova samostatna volba `Nahledy externich odkazu` pro zapinani externich hover preview provideru jako AniDB a MyAnimeList.\r\n- Doplneny nove ulozene stranky pro aktualni CSFD strukturu tvurcu a serialu pro presnejsi vyvoj a testovani.\r\n\r\n### Changed\r\n\r\n- Prejmenovany polozky hover preview v menu na jasnejsi varianty pro `csfd` tvurce, uzivatele a filmy / serialy / epizody.\r\n- Tooltipy informacnich ikon v CC-menu se vykresluji mimo scrollovatelne telo menu, takze zustavaji citelne i u hlavicky a paticky.\r\n- Changelog z GitHubu se po zmene verze nebo po kratke dobe nacita znovu, aby se nove release poznamky propsaly rychleji.\r\n\r\n### Fixedd\r\n\r\n- Opraveno klikani na info ikony se screenshoty v pripnutem CC-menu otevrenem pres `Ctrl+Alt+C`.\r\n- Opraveno skryvani tooltipu informacnich ikon za pevnou hlavickou a patickou CC-menu.\r\n- Zpresneno rozpoznani inline hodnoceni u vice CSFD kontextu, hlavne u serialovych a odvozenych stranek.\r\n\r\n## 0.8.24 - 2026-03-08\r\n\r\n### Added\r\n\r\n- Hover preview karty pro odkazy na CSFD filmy, tvurce a uzivatele i pro Steam, Wikipedii, AniDB a MyAnimeList.\r\n- Moznost pripnout hover preview klavesou Ctrl, presouvat pripnutou kartu a klikat na odkazy primo v ni.\r\n- Klavesovou zkratku Ctrl+Alt+C pro otevreni menu a novou sekci nastaveni pro hover preview.\r\n- Novy modal po aktualizaci skriptu s prehledem zmen pro novou verzi a plny changelog v informacnim modalu.\r\n\r\n### Changed\r\n\r\n- Prepracovano menu nastaveni do scrollovatelneho rozlozeni a sjednocena logika hover preview provideru.\r\n- Rozsireny a zkonfigurovany ikony odkazu pro CSFD, YouTube, Steam, Wikipedii, AniDB a MyAnimeList.\r\n- Changelog se nacita z GitHub repozitare a renderuje markdown vcetne obrazku a odkazu.\r\n- Logika zobrazeni novinek si pamatuje posledni potvrzenou verzi a umi zobrazit zmeny znovu i rucne z informacniho okna.\r\n\r\n### Fixed\r\n\r\n- Opraven konflikt pri ukladani hodnoceni pro ruzne uzivatele stejneho filmu pouzitim klice MovieID-UserSlug.\r\n- Stabilizovano nacitani a zobrazeni hodnoceni, ikon odkazu a hover preview po velkem refaktoru a rozsireni provideru.\r\n\r\n## 0.8.23 - 2026-03-07\r\n\r\n### Added\r\n\r\n- Detailni nahled hodnot v modalnim okne Sprava LocalStorage, vcetne rozbaleni strukturovanych dat.\r\n- Seskupeni cache polozek v LocalStorage a moznost hromadne smazat celou skupinu `cc_creator` cache.\r\n\r\n### Changed\r\n\r\n- Prepracovan modal Sprava LocalStorage pro lepsi citelnost, vetsi pracovni plochu a prehlednejsi tabulku hodnot.\r\n- Sjednocena znovupouzitelna detailni modal logika pro zobrazovani vnorenych dat v nastaveni.\r\n\r\n### Fixed\r\n\r\n- Po mazani jednotlivych nebo vsech LocalStorage polozek se znovu synchronizuji prepinace a navazany stav nastaveni.\r\n- Opraveno propisovani navazanych UI aktualizaci po zmenach v LocalStorage, napr. u galerie obrazkovych odkazu a dalsich prvku nastaveni.\r\n\r\n## 0.8.22 - 2026-03-05\r\n\r\n### Changed\r\n\r\n- Prvni vetsi refaktor hover preview provideru a logiky menu.\r\n\r\n### Added\r\n\r\n- Pridana nova testovaci pokryti pro inline hodnoceni, ikonky odkazu a hover preview controller.\r\n\r\n## v0.6.0.3 - 2025-03-29\r\n\r\n### Fixed\r\n\r\n- Upraven design tlačítek, rozšířen panel\r\n\r\n## v0.6.0.2 - 2022-12-28\r\n\r\n### Fixed\r\n\r\n- Opraveno ukládání správného uživatelského jména do LocalStorage, i když má mezery. Doteď se ukládalo bez mezer.\r\n\r\n## v0.6.0.1 - 2022-12-28\r\n\r\n### Fixed\r\n\r\n- Neukazovalo se tlačítko pro načtení hodnocení\r\n\r\n## v0.6.0 - 2022-12-28\r\n\r\nMenší vánoční update :-)\r\n\r\n### Added\r\n\r\n-- Přidána ikona pro IMDb link (tlačítko) u filmů/seriálů ([#18](https://github.com/SonGokussj4/greasyfork-scripts/issues/18))\r\n-- Přidána tlačítka pro `reset nastavení` a `reset přidaných filmů` ([#16](https://github.com/SonGokussj4/greasyfork-scripts/issues/16))\r\n-- V CC menu jsou nyní obrázkové nápovědy v sekci `Film/Seriál`, `Uživatelé` a `Herci` ([#4](https://github.com/SonGokussj4/greasyfork-scripts/issues/4))\r\n-- V diskuzích je nyní možné reagovat na sebe, nejen na ostatní uživatele ([#2](https://github.com/SonGokussj4/greasyfork-scripts/issues/2))\r\n    - OMEZENÍ:\r\n    1) nelze pak reagovat na první příspěvek\r\n    2) nelze reagovat na více \"svých\" příspěvků najednou\r\n- CC menu je trochu přepracováno, aby šetřilo místo:\r\n  - Snížen padding, je to více na sobě\r\n  - Tlačítko \"Načíst hodnocení\" bylo zbaveno počtu načtených filmů\r\n  - Počet načtených filmů je nyní zobrazeno v titulku\r\n- Pokud je načteno více filmů, než je shlédnutých, objeví se nabídka, zda přenačíst vše\r\n- Přidáno nové načítání filmů, je to \"experimentální\", dělá to víc stránek naráz\r\n  - To se pojí s novou databázovou strukturou v LocalStorage, **je třeba přenačíst vše znovu**\r\n- Při ohodnocení nebo odstranění hodnocení se nyní CC menu aktualizuje okamžitě, netřeba refreshovat stránku\r\n- Dočasná vánoční výzdoba\r\n\r\n### Fixed\r\n\r\n- Ukládání filmů by mělo být stabilnější\r\n- Opraveno pár okrajových případů, kdy script celý spadl\r\n- Opraveno zobrazování nabídky odkazů na obrázky v několika případech\r\n- Csfd opět někde změnilo styl a v případě, kdy byly skryty sekce hlavní stránky bylo CC menu zbytečně široké\r\n- Zobrazení \"vypočtených\" hodnocení - zobrazí se jako černé hvězdičky - by mělo být stabilnější\r\n- Zobrazování prvků v CC menu pro nepřihlášené uživatele\r\n-- Opraven update dopočítaných hodnocení ([#3](https://github.com/SonGokussj4/greasyfork-scripts/issues/3))\r\n\r\n## v0.5.12 - 2022-10-xx\r\n\r\n### Added\r\n\r\n- Pokud je seriál ohodnocen vypočtením průměrů episod, zobrazí se jako černé hvězdičky\r\n- Přidána kapota nových informací do individuálně uložených dat v Local Storage\r\n\r\n### Fixed\r\n\r\n- Srovnání hodnocených/uložených hodnocení nyní správně respektuje nová \"vypočtené\" hodnocení\r\n- Opraveno zobrazování srovnání hodnocení u jiného uživatele\r\n\r\n## v0.5.12 - 2022-10-01\r\n\r\n### Fixed\r\n\r\n-- Domácí stránka: tlačítko \"Skrýt\" už nepřeskakuje u boxu videa + přídáno u \"Partnerem čsfd...\" ([#12](https://github.com/SonGokussj4/greasyfork-scripts/issues/12)) ([#1](https://github.com/SonGokussj4/greasyfork-scripts/issues/1))\r\n-- Galerie tvůrců: zobrazení linků na různé velikosti fotky po přejetí myší, tak jak u galerii filmů ([#10](https://github.com/SonGokussj4/greasyfork-scripts/issues/10))\r\n- Hodnocení: znovu ukazuje % hodnocení i když hodnotilo méně jak 10 lidí\r\n- Hodnocení: znovu ukazuje dodatečné hodnocení jako průměr od oblíbených uživatelů\r\n\r\n## v0.5.11.1 - 2021-11-24\r\n\r\n### Fixed\r\n\r\n- 1-řádkový seznam filmů se nyní zobrazuje stabilněji (jde vidět hodnocení, skoro ve všech případech)\r\n\r\n## v0.5.11 - 2021-11-24\r\n\r\n### Added\r\n\r\n- Boxy na domácí stránce se nyní skrývají tlačítkem \"Skrýt\" u titulku, zpět zobrazují přes nastavení v CC\r\n- U herců jsou seznamy filmů na 1 řádek. Pokud by film přeskočil na řádek druhý, jsou zobrazeny \"...\" (experimentální)\r\n\r\n## v0.5.10 - 2021-11-10\r\n\r\n### Fixed\r\n\r\n- Pokud máte zaplé rozšíření csfd-movie-preview, nyní se již nebude zobrazovat náhled cachovaného filmu nad CC\r\n- Opraveno zobrazení ovládacího panelu po přejetí myší, pokud je okno prohlížeče menší jak 635px\r\n\r\n## v0.5.9 - 2021-07-20\r\n\r\n### Added\r\n\r\n- Přidáno zobrazování průměru hodnocení oblíbených uživatelů, pokud nějací hodnotili\r\n\r\n### Fixed\r\n\r\n- \"Datum hodnocení\" změněno defaultně jako vypnuté, protože jej zohledňuje CSFD-Extended\r\n\r\n## v0.5.8 - 2021-07-20\r\n\r\n### Added\r\n\r\n- Přidáno zobrazování \"Datum hodnocení\", protože to čsfd po 2 dnech odebrala\r\n\r\n### Fixed\r\n\r\n- Opravena funkce 'Zobrazit spočteno ze sérií', už se opět ukazuje pod 'Moje hodnocení'\r\n\r\n## v0.5.7 - 2021-07-16\r\n\r\n### Added\r\n\r\n- Přidáno nastavení pro zobrazování vypočtených % hodnocení, pokud to nehodnotilo ještě 10 uživatelů\r\n\r\n## v0.5.6 - 2021-07-14\r\n\r\n### Added\r\n\r\n- Přidáno nastavení pro zobrazování odkazů na jednotlivé velikosti obrázků v galerii\r\n\r\n### Removed\r\n\r\n- Odebrána klikatelnost obrázků/plakátů v plné kvalitě, nahrazeno zobrazením odkazů na velikosti\r\n- Odebráno zobrazování \"Datum hodnocení\", protože to čsfd konečně přidala\r\n\r\n## v0.5.5 - 2021-07-13\r\n\r\n### Added\r\n\r\n- Navrácení klikatelných obrázků/plakátů (v plné kvalitě) v galerii filmů či tvůrce\r\n\r\n## v0.5.4 - 2021-07-12\r\n\r\n### Added\r\n\r\n- Možnost přenačíst všechna hodnocení i po kliknutí na varovnou ikonu v nastavení\r\n\r\n### Fixed\r\n\r\n- Pokud má uživatel uloženo více hodnocení než existuje, tlačítko obnovení resetuje a obnoví vše\r\n- Duplikace uživatelského hodnocení na stránkách uživatele\r\n- Po najetí kurzorem na verzi už nyní zobrazuje správně changelog\r\n- Pár úprav, které by měly řešit načítání viděných filmů\r\n\r\n## v0.5.3 - 2021-07-01\r\n\r\n### Added\r\n\r\n- Rychlejší obnovení DB, pokud už je částečně načtena\r\n- Tlačítko pro obnovení přesunuto nahoru, zelenou fajfku teď zobrazuje i StarNames\r\n\r\n## v0.5.2 - 2021-06-30\r\n\r\n### Added\r\n\r\n- Přidáno zobrazování hodnocení (hvězd) u viděných filmů/sérií (StarNames obdoba)\r\n\r\n## v0.5.0 - 2021-06-27\r\n\r\n### Added\r\n\r\n- Zcela přepracovaná logika načítání a porovnávání hodnocení (rychlejší)\r\n- U porovnávání hodnocení přejetím myší nad mým hodnocením se zobrazí datum\r\n- Tlačítko pro obnovení hodnocení přesunuto do csfd-compare settings panelu (původně v uživ.)\r\n- Přidáno tlačítko do nastavení: \"Přenačíst hodnocení\" - zelená fajfka\r\n- Přidáno nastavení: Skrýt panel - Vítej na ČSFD\r\n- Vylepšené zjišťování updatů, nyní jednou za 5 minut, ale info si drží v mezipaměti\r\n\r\n### Fixed\r\n\r\n- Oprava detekce logovaného uživatele u Greasemonkey\r\n- Oprava skrytí registračního panelu v SK verzi\r\n\r\n## v0.4.5 - 2021-06-23\r\n\r\n### Added\r\n\r\n- Panel nastavení: Přidána sekce \"Domácí stránka\"\r\n- Přidáno nastavení: Zobrazit datum ohodnocení\r\n- Přidáno nastavení: Zobrazit spočteno ze sérií\r\n\r\n### Fixed\r\n\r\n- Chyby u načítání hodnocení sérií pro \"compare\" z vypočtených hodnocení\r\n\r\n### Quality\r\n\r\n- Nesrovnalost mezi uloženým/reálným počtem hodnocení pro \"compare\" nyní ukazuje stále\r\n\r\n## v0.4.4 - 2021-06-22\r\n\r\n### Added\r\n\r\n- Zobrazení data ohodnocení filmu/seriálu\r\n\r\n### Quality\r\n\r\n- Lepší načítání informací o nové verzi. Jen jednou za session\r\n\r\n## v0.4.3 - 2021-06-21\r\n\r\n### Fixed\r\n\r\n- Odebráno nastavení: Skrýt registrační box (čsfd to teď dělá defaultně)\r\n\r\n### Added\r\n\r\n- Přidáno nastavení: Skrýt panel - Soutěž\r\n- Přidáno nastavení: Skrýt panel - ČSFD sál\r\n- Přidáno nastavení: Skrýt panel - Nové trailery a rozhovory\r\n- Přidáno nastavení: Skrýt panel - Sledujte online / Žhavé DVD tipy\r\n- Upozornění na aktualizaci nyní ukazuje poslední changelog\r\n\r\n## v0.4.2 - 2021-06-15\r\n\r\n### Added\r\n\r\n- Kompatibilita s csfd.sk\r\n\r\n## v0.4.1 - 2021-06-14\r\n\r\n### Added\r\n\r\n- Nově funguje i pro nepřihlášené uživatele (omezeně)\r\n- Nastavení: zobrazit porovnání hodnocení MOJE x UŽIVATEL (v tabulce hodnocení)\r\n- Panel nastavení: přidána verze skriptu\r\n\r\n### Fixed\r\n\r\n- Zbavení se nepotřebného kódu\r\n\r\n## v0.4.0 - 2021-06-14\r\n\r\n### Added\r\n\r\n- U profilů uživatelů přidáno tlačítko pro zaslání zprávy (místo klikání v ovládacím panelu)\r\n- První nástřel \"nastavení\", kde si uživatel vybere, co zapne/vypne\r\n- Klikatelné boxy místo tlačítka \"VÍCE\"\r\n- Tlačítko pro přidání/odebrání z oblíbených na profilu uživatele\r\n- Možnost filtrovat uživatele, jejichž recenze nebudou zobrazeny\r\n- Klikatelný box se zprávou od uživatele místo tlačítka \"... více\"\r\n\r\n## v0.3.5 - 2021-06-08\r\n\r\n### Added\r\n\r\n- Už žádné vyskakovací okno když nejsou načteny filmy. Nyní jen vykřičník u uživatelského profilu\r\n- Tlačítko pro obnovení hodnocení se objeví jen pokud nesouhlasí počet uložených záznamů v prohlížeči (LocalStorage) vs počet v profilu uživatele\r\n\r\n### Fixed\r\n\r\n- Zjištění názvu série (předtím fungovalo jen pro filmy, ne jednotlivé série seriálu)\r\n- Při nenačteném hodnocení a navštívení profilu filmu/série, skript zkolaboval\r\n";
  const BUILD_CHANGELOG_ASSET_MAP = {"images/changelog/0.9.1-nahledy-recenze.png":"data:image/png;base64,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","images/changelog/0.9.1-notifikace.png":"data:image/png;base64,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"};

  const UPDATE_CHECK_CACHE_KEY = 'cc_update_check_cache_v1';
  const VERSION_DETAILS_CACHE_KEY = 'cc_version_details_cache_v1';
  const CHANGELOG_CACHE_KEY = 'cc_repo_changelog_cache_v1';
  const MIGRATION_REMINDER_SHOWN_KEY = 'cc_migration_reminder_shown_v1';
  const PREVIOUS_WHATS_NEW_VERSION_KEY = 'CC-whats-new-version';
  const LEGACY_INSTALLED_VERSION_KEY = 'cc_installed_script_version_v1';
  const LEGACY_SHOWN_VERSION_KEY = 'cc_update_modal_shown_version_v1';
  const UPDATE_CHECK_MAX_AGE_MS = 1000 * 60 * 60 * 12;
  const CHANGELOG_CACHE_MAX_AGE_MS = 1000 * 60 * 5;
  const GREASYFORK_SCRIPT_API_URL = 'https://greasyfork.org/scripts/425054.json';
  const GITHUB_CHANGELOG_URL =
    'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/refs/heads/master/CHANGELOG.md';
  const GITHUB_CHANGELOG_BASE_URL = 'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/refs/heads/master/';
  const CHANGELOG_KIND_HEADINGS = new Map([
    ['added', 'is-added'],
    ['changed', 'is-changed'],
    ['development', 'is-development'],
    ['fixed', 'is-fixed'],
  ]);
  const CHANGELOG_KIND_LABELS = new Map([
    ['is-added', 'Novinka'],
    ['is-changed', 'Uprava'],
    ['is-development', 'Vyvoj'],
    ['is-fixed', 'Oprava'],
  ]);

  function parseVersionParts(version) {
    return String(version || '')
      .trim()
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part));
  }

  function compareVersions(left, right) {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const maxLen = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLen; index += 1) {
      const leftPart = leftParts[index] ?? 0;
      const rightPart = rightParts[index] ?? 0;
      if (leftPart > rightPart) return 1;
      if (leftPart < rightPart) return -1;
    }

    return 0;
  }

  function parseCurrentVersionFromText(versionText) {
    return String(versionText || '')
      .replace(/^v/i, '')
      .trim();
  }

  function normalizeVersionLabel(version) {
    const normalized = parseCurrentVersionFromText(version);
    return normalized || '—';
  }

  function getCurrentMenuVersion(menuRootElement) {
    const versionTextEl = menuRootElement.querySelector('#cc-version-value');
    return parseCurrentVersionFromText(versionTextEl?.textContent || VERSION);
  }

  function getWhatsNewStoredVersion() {
    return parseCurrentVersionFromText(localStorage.getItem(WHATS_NEW_VERSION_KEY) || '');
  }

  function maybeWarnAboutLegacyWhatsNewMigrationRemoval() {
    if (compareVersions(VERSION, '1.0.0') < 0) {
      return;
    }

    if (localStorage.getItem(MIGRATION_REMINDER_SHOWN_KEY) === VERSION) {
      return;
    }

    console.warn(
      `[${SCRIPTNAME}] Version ${VERSION} is >= 1.0.0. Review and remove legacy whats-new migration code in settings-version.js if it is no longer needed.`,
    );
    localStorage.setItem(MIGRATION_REMINDER_SHOWN_KEY, VERSION);
  }

  function migrateLegacyWhatsNewStorage() {
    // Temporary compatibility shim for pre-1.0.0 releases.
    // Once the project is stable on 1.0.0+, this migration should be removed.
    maybeWarnAboutLegacyWhatsNewMigrationRemoval();

    const currentValue = getWhatsNewStoredVersion();
    const previousKeyValue = parseCurrentVersionFromText(localStorage.getItem(PREVIOUS_WHATS_NEW_VERSION_KEY) || '');
    const legacyShownValue = parseCurrentVersionFromText(localStorage.getItem(LEGACY_SHOWN_VERSION_KEY) || '');
    const legacyInstalledValue = parseCurrentVersionFromText(localStorage.getItem(LEGACY_INSTALLED_VERSION_KEY) || '');

    if (!currentValue) {
      const migratedValue = previousKeyValue || legacyShownValue || legacyInstalledValue;
      if (migratedValue) {
        localStorage.setItem(WHATS_NEW_VERSION_KEY, migratedValue);
      }
    }

    localStorage.removeItem(PREVIOUS_WHATS_NEW_VERSION_KEY);
    localStorage.removeItem(LEGACY_SHOWN_VERSION_KEY);
    localStorage.removeItem(LEGACY_INSTALLED_VERSION_KEY);
  }

  function setWhatsNewStoredVersion(version) {
    const normalized = parseCurrentVersionFromText(version);
    if (!normalized) {
      localStorage.removeItem(WHATS_NEW_VERSION_KEY);
      return;
    }

    localStorage.setItem(WHATS_NEW_VERSION_KEY, normalizeVersionLabel(normalized));
  }

  function getCachedUpdateInfo() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UPDATE_CHECK_CACHE_KEY) || 'null');
      if (!parsed || !parsed.checkedAt || !parsed.latestVersion) {
        return undefined;
      }

      if (Date.now() - Number(parsed.checkedAt) > UPDATE_CHECK_MAX_AGE_MS) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  function setCachedUpdateInfo(latestVersion) {
    localStorage.setItem(
      UPDATE_CHECK_CACHE_KEY,
      JSON.stringify({
        latestVersion,
        checkedAt: Date.now(),
      }),
    );
  }

  async function fetchLatestScriptVersion() {
    const response = await fetch(GREASYFORK_SCRIPT_API_URL, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Update check failed: ${response.status}`);
    }

    const payload = await response.json();
    const latestVersion = String(payload?.version || '').trim();
    if (!latestVersion) {
      throw new Error('Update check returned empty version');
    }

    return latestVersion;
  }

  function getCachedVersionDetails() {
    try {
      const parsed = JSON.parse(localStorage.getItem(VERSION_DETAILS_CACHE_KEY) || 'null');
      if (!parsed || !parsed.checkedAt || !parsed.latestVersion) {
        return undefined;
      }

      if (Date.now() - Number(parsed.checkedAt) > UPDATE_CHECK_MAX_AGE_MS) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  function setCachedVersionDetails(details) {
    localStorage.setItem(
      VERSION_DETAILS_CACHE_KEY,
      JSON.stringify({
        ...details,
        checkedAt: Date.now(),
      }),
    );
  }

  function formatVersionDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '—';
    }

    const parsedDate = new Date(raw);
    if (Number.isNaN(parsedDate.getTime())) {
      return raw;
    }

    return parsedDate.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function fetchLatestVersionDetails() {
    const response = await fetch(`${GREASYFORK_URL}/versions`, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Version details fetch failed: ${response.status}`);
    }

    const pageHtml = await response.text();
    const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
    const versionNumberText = doc.querySelector('.version-number a, .version-number')?.textContent?.trim() || '';
    const latestVersion = parseCurrentVersionFromText(versionNumberText);
    if (!latestVersion) {
      throw new Error('Version details returned empty version number');
    }

    return {
      latestVersion,
      datetimeRaw: doc.querySelector('.version-date')?.getAttribute('datetime') || '',
    };
  }

  function getCachedChangelogData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CHANGELOG_CACHE_KEY) || 'null');
      if (!parsed || !parsed.checkedAt || !parsed.markdown || parsed.scriptVersion !== VERSION) {
        return undefined;
      }

      if (Date.now() - Number(parsed.checkedAt) > CHANGELOG_CACHE_MAX_AGE_MS) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  function setCachedChangelogData(changelogData) {
    localStorage.setItem(
      CHANGELOG_CACHE_KEY,
      JSON.stringify({
        ...changelogData,
        scriptVersion: VERSION,
        checkedAt: Date.now(),
      }),
    );
  }

  function getBundledChangelogData() {
    const markdown = String(BUILD_CHANGELOG_MARKDOWN).trim();
    if (!markdown) {
      return undefined;
    }

    const baseUrl = String(BUILD_CHANGELOG_BASE_URL).trim() || GITHUB_CHANGELOG_BASE_URL;
    const sourceUrl = resolveMarkdownUrl('CHANGELOG.md', baseUrl);
    const assetMap =
      BUILD_CHANGELOG_ASSET_MAP && typeof BUILD_CHANGELOG_ASSET_MAP === 'object' ? BUILD_CHANGELOG_ASSET_MAP : {};

    return {
      markdown,
      sourceUrl,
      baseUrl,
      assetMap,
      isFallback: true,
      loadFailed: false,
    };
  }

  async function fetchRepoChangelogData() {
    try {
      const response = await fetch(GITHUB_CHANGELOG_URL, { method: 'GET', cache: 'no-store' });
      if (response.ok) {
        const markdown = await response.text();
        if (String(markdown || '').trim()) {
          const nextData = {
            markdown,
            sourceUrl: GITHUB_CHANGELOG_URL,
            baseUrl: GITHUB_CHANGELOG_BASE_URL,
            isFallback: false,
          };
          setCachedChangelogData(nextData);
          return nextData;
        }
      }
    } catch {
      // The UI handles changelog load failures explicitly.
    }

    return {
      markdown: '',
      sourceUrl: GITHUB_CHANGELOG_URL,
      baseUrl: GITHUB_CHANGELOG_BASE_URL,
      isFallback: false,
      loadFailed: true,
    };
  }

  async function getRepoChangelogData() {
    const bundled = getBundledChangelogData();
    if (bundled) {
      return bundled;
    }

    const cached = getCachedChangelogData();
    if (cached) {
      return cached;
    }

    const remote = await fetchRepoChangelogData();
    if (!remote.loadFailed) {
      return remote;
    }

    return bundled || remote;
  }

  function normalizeMarkdownAssetPath(url) {
    return String(url || '')
      .trim()
      .replace(/\\/g, '/');
  }

  function isRelativeMarkdownAssetPath(url) {
    const normalized = normalizeMarkdownAssetPath(url);
    if (!normalized || normalized.startsWith('#') || normalized.startsWith('/')) {
      return false;
    }

    return !/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(normalized) && !/^[a-z][a-z\d+.-]*:/i.test(normalized);
  }

  function resolveMarkdownUrl(url, baseUrl, assetMap) {
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) {
      return '';
    }

    const normalizedAssetPath = normalizeMarkdownAssetPath(trimmedUrl);
    // Bundled dev changelog mode can serve local relative resources from the
    // generated asset map before falling back to the GitHub raw URL.
    if (isRelativeMarkdownAssetPath(normalizedAssetPath) && assetMap?.[normalizedAssetPath]) {
      return assetMap[normalizedAssetPath];
    }

    try {
      return new URL(trimmedUrl, baseUrl).href;
    } catch {
      return trimmedUrl;
    }
  }

  function createCodePlaceholder(index) {
    return `@@CCCODE${index}@@`;
  }

  function getVersionHeadingParts(headingText) {
    const match = String(headingText || '')
      .trim()
      .match(/^(v?\d+(?:\.\d+)+)(?:\s*-\s*(.+))?$/i);
    if (!match) {
      return undefined;
    }

    return {
      versionLabel: normalizeVersionLabel(match[1]),
      dateLabel: String(match[2] || '').trim(),
    };
  }

  function renderChangelogKindHeading(text) {
    const label = String(text || '').trim();
    return CHANGELOG_KIND_HEADINGS.get(label.toLowerCase());
  }

  function renderChangelogKindItems(kindClass, items, baseUrl, assetMap) {
    const normalizedItems = items.map((item) => String(item || '').trim()).filter(Boolean);

    if (normalizedItems.length === 0) {
      return undefined;
    }

    const kindLabel = CHANGELOG_KIND_LABELS.get(kindClass) || '';

    return `
    <ul class="cc-version-markdown-kind-list ${kindClass}">
      ${normalizedItems
        .map(
          (item) => `
            <li class="cc-version-markdown-kind-item ${kindClass}">
              <span class="cc-version-markdown-kind-item-icon" title="${escapeHtml(kindLabel)}" aria-label="${escapeHtml(kindLabel)}">${renderChangelogKindIcon(kindClass)}</span>
              <span class="cc-version-markdown-kind-item-text">${renderInlineMarkdown(item, baseUrl, assetMap)}</span>
            </li>
          `,
        )
        .join('')}
    </ul>
  `.trim();
  }

  function renderChangelogKindIcon(kindClass) {
    if (kindClass === 'is-added') {
      return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 8v8"></path>
        <path d="M8 12h8"></path>
      </svg>
    `.trim();
    }

    if (kindClass === 'is-development') {
      return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="14" rx="2"></rect>
        <path d="m7 9 3 3-3 3"></path>
        <path d="M13 15h4"></path>
      </svg>
    `.trim();
    }

    if (kindClass === 'is-fixed') {
      return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 20v-9"></path>
        <path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"></path>
        <path d="M14.12 3.88 16 2"></path>
        <path d="M21 21a4 4 0 0 0-3.81-4"></path>
        <path d="M21 5a4 4 0 0 1-3.55 3.97"></path>
        <path d="M22 13h-4"></path>
        <path d="M3 21a4 4 0 0 1 3.81-4"></path>
        <path d="M3 5a4 4 0 0 0 3.55 3.97"></path>
        <path d="M6 13H2"></path>
        <path d="m8 2 1.88 1.88"></path>
        <path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"></path>
      </svg>
    `.trim();
    }

    return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20h9"></path>
      <path d="m16.5 3.5 4 4"></path>
      <path d="M19 3a2.12 2.12 0 1 1 3 3L7 21l-4 1 1-4Z"></path>
    </svg>
  `.trim();
  }

  function renderInlineMarkdown(text, baseUrl, assetMap) {
    const codeSegments = [];
    let output = String(text || '').replace(/`([^`]+)`/g, (_, code) => {
      const placeholder = createCodePlaceholder(codeSegments.length);
      codeSegments.push(`<code>${escapeHtml(code)}</code>`);
      return placeholder;
    });

    output = escapeHtml(output);
    output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, alt, url, title) => {
      const resolvedUrl = resolveMarkdownUrl(url, baseUrl, assetMap);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img class="cc-version-markdown-image" src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy" referrerpolicy="no-referrer" />`;
    });
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, label, url, title) => {
      const resolvedUrl = resolveMarkdownUrl(url, baseUrl, assetMap);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${label}</a>`;
    });
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    output = output.replace(/_([^_]+)_/g, '<em>$1</em>');

    codeSegments.forEach((segment, index) => {
      output = output.replaceAll(createCodePlaceholder(index), segment);
    });

    return output;
  }

  function renderMarkdownToHtml(markdown, baseUrl = GITHUB_CHANGELOG_BASE_URL, assetMap) {
    const lines = String(markdown || '')
      .replace(/\r\n/g, '\n')
      .split('\n');
    const htmlParts = [];
    let index = 0;
    let currentKindClass = '';

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      if (/^```/.test(trimmed)) {
        index += 1;
        const codeLines = [];
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        htmlParts.push(`<pre class="cc-version-markdown-pre"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        htmlParts.push('<hr class="cc-version-markdown-rule" />');
        index += 1;
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (headingMatch) {
        const level = Math.min(4, headingMatch[1].length);
        const versionHeadingParts = level === 2 ? getVersionHeadingParts(headingMatch[2]) : undefined;
        const kindHeadingClass = level === 3 ? renderChangelogKindHeading(headingMatch[2]) : undefined;

        if (versionHeadingParts) {
          currentKindClass = '';
          htmlParts.push(
            `
            <h${level} class="cc-version-markdown-heading cc-version-markdown-heading-${level} cc-version-markdown-heading-version">
              <span class="cc-version-markdown-version">${escapeHtml(versionHeadingParts.versionLabel)}</span>
              ${versionHeadingParts.dateLabel ? `<span class="cc-version-markdown-date">${escapeHtml(versionHeadingParts.dateLabel)}</span>` : ''}
            </h${level}>
          `.trim(),
          );
          index += 1;
          continue;
        }

        if (kindHeadingClass) {
          currentKindClass = kindHeadingClass;
          index += 1;
          continue;
        }

        currentKindClass = '';
        htmlParts.push(
          `<h${level} class="cc-version-markdown-heading cc-version-markdown-heading-${level}">${renderInlineMarkdown(headingMatch[2], baseUrl, assetMap)}</h${level}>`,
        );
        index += 1;
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
          index += 1;
        }

        if (currentKindClass) {
          htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl, assetMap));
          continue;
        }

        htmlParts.push(
          `<ul class="cc-version-markdown-list">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl, assetMap)}</li>`).join('')}</ul>`,
        );
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
          index += 1;
        }

        if (currentKindClass) {
          htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl, assetMap));
          continue;
        }

        htmlParts.push(
          `<ol class="cc-version-markdown-list cc-version-markdown-list-ordered">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl, assetMap)}</li>`).join('')}</ol>`,
        );
        continue;
      }

      const paragraphLines = [];
      while (index < lines.length) {
        const candidate = lines[index];
        const candidateTrimmed = candidate.trim();
        if (!candidateTrimmed) break;
        if (/^(#{1,4})\s+/.test(candidateTrimmed)) break;
        if (/^```/.test(candidateTrimmed)) break;
        if (/^---+$/.test(candidateTrimmed)) break;
        if (/^\s*[-*+]\s+/.test(candidate)) break;
        if (/^\s*\d+\.\s+/.test(candidate)) break;
        paragraphLines.push(candidateTrimmed);
        index += 1;
      }

      const paragraphText = paragraphLines.join('\n').trim();
      if (currentKindClass && /^!\[[^\]]*\]\([^)]+\)$/.test(paragraphText)) {
        htmlParts.push(
          `<p class="cc-version-markdown-paragraph cc-version-markdown-paragraph-image">${renderInlineMarkdown(paragraphText, baseUrl, assetMap)}</p>`,
        );
        continue;
      }

      if (currentKindClass) {
        htmlParts.push(renderChangelogKindItems(currentKindClass, paragraphLines, baseUrl, assetMap));
        continue;
      }

      htmlParts.push(
        `<p class="cc-version-markdown-paragraph">${renderInlineMarkdown(paragraphLines.join('<br />'), baseUrl, assetMap)}</p>`,
      );
    }

    return htmlParts.join('');
  }

  function extractVersionFromHeading(headingText) {
    const match = String(headingText || '').match(/\bv?(\d+(?:\.\d+)+)\b/);
    return match ? match[1] : '';
  }

  function extractVersionSectionsFromMarkdown(markdown) {
    const lines = String(markdown || '')
      .replace(/\r\n/g, '\n')
      .split('\n');
    const sections = [];
    let currentSection = null;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
      const version = headingMatch ? extractVersionFromHeading(headingMatch[2]) : '';

      if (version) {
        if (currentSection) {
          sections.push({
            ...currentSection,
            markdown: currentSection.lines.join('\n').trim(),
          });
        }

        currentSection = {
          version,
          heading: headingMatch[2].trim(),
          lines: [line],
        };
        continue;
      }

      if (currentSection) {
        currentSection.lines.push(line);
      }
    }

    if (currentSection) {
      sections.push({
        ...currentSection,
        markdown: currentSection.lines.join('\n').trim(),
      });
    }

    return sections;
  }

  function selectChangelogSectionsForRange(markdown, fromVersion, toVersion) {
    const sections = extractVersionSectionsFromMarkdown(markdown);
    if (sections.length === 0) {
      return [];
    }

    const normalizedFromVersion = parseCurrentVersionFromText(fromVersion);
    const normalizedToVersion = parseCurrentVersionFromText(toVersion);

    if (!normalizedFromVersion && normalizedToVersion) {
      const matchingCurrentSection = sections.find(
        (section) => compareVersions(section.version, normalizedToVersion) === 0,
      );
      return matchingCurrentSection ? [matchingCurrentSection] : sections.slice(0, 1);
    }

    const filteredSections = sections.filter((section) => {
      if (normalizedToVersion && compareVersions(section.version, normalizedToVersion) > 0) {
        return false;
      }

      if (normalizedFromVersion && compareVersions(section.version, normalizedFromVersion) <= 0) {
        return false;
      }

      return true;
    });

    if (filteredSections.length > 0) {
      return filteredSections;
    }

    if (!normalizedToVersion) {
      return sections;
    }

    const currentSection = sections.find((section) => compareVersions(section.version, normalizedToVersion) === 0);
    return currentSection ? [currentSection] : sections.slice(0, 1);
  }

  function buildChangelogHtml(markdown, baseUrl, assetMap, fromVersion, toVersion) {
    const sections = selectChangelogSectionsForRange(markdown, fromVersion, toVersion);
    if (sections.length === 0) {
      return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
    }

    return sections
      .map(
        (section) =>
          `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl, assetMap)}</section>`,
      )
      .join('');
  }

  function buildFullChangelogHtml(markdown, baseUrl, assetMap) {
    if (!String(markdown || '').trim()) {
      return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
    }

    const sections = extractVersionSectionsFromMarkdown(markdown);
    if (sections.length === 0) {
      return `<section class="cc-version-changelog-section">${renderMarkdownToHtml(markdown, baseUrl, assetMap)}</section>`;
    }

    return sections
      .map(
        (section) =>
          `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl, assetMap)}</section>`,
      )
      .join('');
  }

  function buildChangelogWarningHtml(message = 'Changelog se nepodařilo načíst.') {
    return `<p class="cc-version-info-warning">${escapeHtml(message)}</p>`;
  }

  function shouldShowWhatsNewModal(storedVersion, currentVersion) {
    const normalizedStoredVersion = parseCurrentVersionFromText(storedVersion);
    const normalizedCurrentVersion = parseCurrentVersionFromText(currentVersion);

    if (!normalizedCurrentVersion) {
      return false;
    }

    if (!normalizedStoredVersion) {
      return true;
    }

    return compareVersions(normalizedCurrentVersion, normalizedStoredVersion) > 0;
  }

  function buildVersionMetaHtml(currentVersion, details) {
    const latestVersion = details?.latestVersion || '';
    const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
    const statusClass = hasUpdate ? 'is-update' : 'is-ok';
    const statusText = hasUpdate ? 'K dispozici je novější verze' : 'Používáte aktuální verzi';

    return `
    <div class="cc-version-info-meta">
      <div class="cc-version-info-meta-cards">
        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Nainstalováno</div>
          <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(currentVersion))}</div>
        </div>

        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Nejnovější</div>
          <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(latestVersion))}</div>
        </div>

        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Poslední aktualizace</div>
          <div class="cc-version-info-value">${escapeHtml(formatVersionDateTime(details?.datetimeRaw))}</div>
        </div>
      </div>

      <div class="cc-version-info-status-row">
        <span class="cc-version-info-status ${statusClass}">
          <span class="cc-version-info-status-dot" aria-hidden="true"></span>
          ${escapeHtml(statusText)}
        </span>
      </div>
    </div>
  `;
  }

  function buildInstalledOnlyMetaHtml(currentVersion) {
    return `
    <div class="cc-version-info-meta">
      <div class="cc-version-info-meta-cards">
        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Nainstalováno</div>
          <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(currentVersion))}</div>
        </div>
      </div>
      <div class="cc-version-info-status-row">
        <span class="cc-version-info-status">
          <span class="cc-version-info-status-dot" aria-hidden="true"></span>
          Nepodařilo se načíst informace z GreasyFork.
        </span>
      </div>
    </div>
  `;
  }

  function buildKeyboardShortcutsHtml() {
    return `
    <section class="cc-version-shortcuts" aria-label="Klávesové zkratky">
      <h4 class="cc-version-info-section-title">Klávesové zkratky</h4>
      <div class="cc-version-shortcuts-list">
        <div class="cc-version-shortcut-item">
          <div class="cc-version-shortcut-keys" aria-label="Ctrl plus Alt plus C">
            <kbd>Ctrl</kbd>
            <span>+</span>
            <kbd>Alt</kbd>
            <span>+</span>
            <kbd>C</kbd>
          </div>
          <div class="cc-version-shortcut-text">Otevře nebo zavře menu CSFD-Compare.</div>
        </div>

        <div class="cc-version-shortcut-item">
          <div class="cc-version-shortcut-keys" aria-label="Ctrl plus Alt plus R">
            <kbd>Ctrl</kbd>
            <span>+</span>
            <kbd>Alt</kbd>
            <span>+</span>
            <kbd>R</kbd>
          </div>
          <div class="cc-version-shortcut-text">Zapne nebo vypne zobrazení hodnocení.</div>
        </div>
      </div>
    </section>
  `;
  }

  function renderVersionInfoContent(currentVersion, details, changelogData) {
    const metaHtml = buildVersionMetaHtml(currentVersion, details);
    const shortcutsHtml = buildKeyboardShortcutsHtml();
    const changelogHtml = changelogData?.loadFailed
      ? buildChangelogWarningHtml()
      : buildFullChangelogHtml(
          changelogData?.markdown,
          changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL,
          changelogData?.assetMap,
        );

    return `
    ${metaHtml}
    ${shortcutsHtml}
    <h4 class="cc-version-info-section-title">Changelog</h4>
    ${changelogHtml}
  `;
  }

  function renderVersionInfoErrorContent(currentVersion, changelogData) {
    const shortcutsHtml = buildKeyboardShortcutsHtml();
    const changelogHtml = changelogData?.loadFailed
      ? buildChangelogWarningHtml()
      : buildFullChangelogHtml(
          changelogData?.markdown,
          changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL,
          changelogData?.assetMap,
        );
    return `
    ${buildInstalledOnlyMetaHtml(currentVersion)}
    ${shortcutsHtml}
    <h4 class="cc-version-info-section-title">Changelog</h4>
    ${changelogHtml}
  `;
  }

  function setVersionStatus(versionStatusEl, menuUpdatePillEl, state, latestVersion) {
    if (!versionStatusEl && !menuUpdatePillEl) {
      return;
    }

    if (versionStatusEl) {
      versionStatusEl.className = 'cc-version-status';
      versionStatusEl.textContent = '';
      versionStatusEl.removeAttribute('title');
      versionStatusEl.removeAttribute('aria-label');
      versionStatusEl.setAttribute('aria-hidden', 'true');
      versionStatusEl.setAttribute('tabindex', '-1');
    }

    if (menuUpdatePillEl) {
      menuUpdatePillEl.className = 'cc-menu-update-pill';
      menuUpdatePillEl.textContent = '!';
      menuUpdatePillEl.removeAttribute('title');
      menuUpdatePillEl.setAttribute('aria-hidden', 'true');
    }

    if (state === 'hidden') {
      return;
    }

    if (versionStatusEl) {
      versionStatusEl.classList.add('is-visible');
    }

    if (state === 'checking') {
      if (versionStatusEl) {
        versionStatusEl.classList.add('is-checking');
        versionStatusEl.title = 'Kontroluji aktualizaci…';
      }
      return;
    }

    if (state === 'ok') {
      if (versionStatusEl) {
        versionStatusEl.classList.add('is-ok');
        versionStatusEl.title = 'Používáte aktuální verzi.';
      }
      return;
    }

    if (state === 'update') {
      if (versionStatusEl) {
        versionStatusEl.classList.add('is-update');
        versionStatusEl.textContent = '⚠ Update';
        versionStatusEl.title = `K dispozici je nová verze: ${latestVersion}`;
        versionStatusEl.setAttribute('aria-label', `K dispozici je nová verze: ${latestVersion}`);
        versionStatusEl.setAttribute('aria-hidden', 'false');
        versionStatusEl.setAttribute('tabindex', '0');
      }

      if (menuUpdatePillEl) {
        menuUpdatePillEl.classList.add('is-visible');
        menuUpdatePillEl.title = `K dispozici je nová verze: ${latestVersion}`;
        menuUpdatePillEl.setAttribute('aria-label', `Nová verze k dispozici: ${latestVersion}`);
      }
      return;
    }

    if (versionStatusEl) {
      versionStatusEl.classList.add('is-error');
      versionStatusEl.title = 'Aktualizaci se nepodařilo ověřit.';
    }
  }

  function getVersionModal() {
    let overlay = document.querySelector('#cc-version-info-overlay');
    if (overlay) {
      return {
        overlay,
        modal: overlay.querySelector('.cc-version-info-modal'),
        head: overlay.querySelector('.cc-version-info-head'),
        titleWrap: overlay.querySelector('.cc-version-info-title-wrap'),
        title: overlay.querySelector('#cc-version-info-title'),
        body: overlay.querySelector('.cc-version-info-body'),
        actionButton: overlay.querySelector('#cc-version-info-action-btn'),
        footer: overlay.querySelector('.cc-version-info-foot'),
      };
    }

    overlay = document.createElement('div');
    overlay.id = 'cc-version-info-overlay';
    overlay.className = 'cc-version-info-overlay';
    overlay.innerHTML = `
    <div class="cc-version-info-modal" role="dialog" aria-modal="true" aria-labelledby="cc-version-info-title">
      <div class="cc-version-info-head">
        <div class="cc-version-info-title-wrap">
          <h3 id="cc-version-info-title">Informace o verzi</h3>
        </div>
        <button type="button" class="cc-version-info-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-version-info-body"></div>
      <div class="cc-version-info-foot" hidden>
        <button type="button" id="cc-version-info-action-btn" class="cc-button cc-button-red">Zavřít</button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);
    return {
      overlay,
      modal: overlay.querySelector('.cc-version-info-modal'),
      head: overlay.querySelector('.cc-version-info-head'),
      titleWrap: overlay.querySelector('.cc-version-info-title-wrap'),
      title: overlay.querySelector('#cc-version-info-title'),
      body: overlay.querySelector('.cc-version-info-body'),
      actionButton: overlay.querySelector('#cc-version-info-action-btn'),
      footer: overlay.querySelector('.cc-version-info-foot'),
    };
  }

  function openVersionModal({ title, html, actionLabel, onClose, hideHeaderTitle = false, modalVariant = '' } = {}) {
    const modal = getVersionModal();
    if (typeof modal.overlay.__ccVersionModalCleanup === 'function') {
      modal.overlay.__ccVersionModalCleanup();
    }

    modal.title.textContent = title || 'Informace o verzi';
    modal.body.innerHTML = html || '';
    modal.footer.hidden = !actionLabel;
    modal.modal.classList.toggle('is-whats-new-modal', modalVariant === 'whats-new');
    modal.head.classList.toggle('is-title-hidden', hideHeaderTitle);
    modal.titleWrap.hidden = hideHeaderTitle;

    if (actionLabel) {
      modal.actionButton.textContent = actionLabel;
    }

    document.body.classList.add('cc-version-info-open');
    modal.overlay.classList.add('is-open');

    const closeButton = modal.overlay.querySelector('.cc-version-info-close');
    const actionButton = modal.actionButton;

    const finalizeClose = () => {
      modal.overlay.classList.remove('is-open');
      document.body.classList.remove('cc-version-info-open');
      if (typeof onClose === 'function') {
        onClose();
      }
    };

    const closeHandler = () => {
      cleanup();
      finalizeClose();
    };
    const outsideClickHandler = (event) => {
      if (event.target === modal.overlay) {
        cleanup();
        finalizeClose();
      }
    };
    const escapeHandler = (event) => {
      if (event.key === 'Escape' && modal.overlay.classList.contains('is-open')) {
        cleanup();
        finalizeClose();
      }
    };

    function cleanup() {
      closeButton?.removeEventListener('click', closeHandler);
      actionButton?.removeEventListener('click', closeHandler);
      modal.overlay.removeEventListener('click', outsideClickHandler);
      document.removeEventListener('keydown', escapeHandler);
      delete modal.overlay.__ccVersionModalCleanup;
    }

    modal.overlay.__ccVersionModalCleanup = cleanup;
    closeButton?.addEventListener('click', closeHandler);
    actionButton?.addEventListener('click', closeHandler);
    modal.overlay.addEventListener('click', outsideClickHandler);
    document.addEventListener('keydown', escapeHandler);
  }

  function renderVersionInfoLoadingContent() {
    return '<p class="cc-version-info-loading">Načítám changelog a informace o verzi…</p>';
  }

  function renderUpdateModalContent({ fromVersion, toVersion, changelogData }) {
    const fromLabel = fromVersion ? normalizeVersionLabel(fromVersion) : 'starší verze';
    const changelogHtml = changelogData?.loadFailed
      ? buildChangelogWarningHtml('Changelog se nepodařilo načíst. Změny pro tuto verzi nejsou k dispozici.')
      : buildChangelogHtml(
          changelogData?.markdown,
          changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL,
          changelogData?.assetMap,
          fromVersion,
          toVersion,
        );

    return `
    <div class="cc-version-update-summary">
      <h4 class="cc-version-update-title">${escapeHtml(SCRIPTNAME)} byl aktualizován na ${escapeHtml(normalizeVersionLabel(toVersion))}</h4>
      <p class="cc-version-update-text">Zobrazuji změny od ${escapeHtml(fromLabel)} do ${escapeHtml(normalizeVersionLabel(toVersion))}.</p>
    </div>
    ${changelogHtml}
  `;
  }

  async function openVersionInfoModal(menuRootElement) {
    const currentVersion = getCurrentMenuVersion(menuRootElement);
    openVersionModal({
      title: 'Informace o verzi',
      html: renderVersionInfoLoadingContent(),
    });

    const detailsPromise = (async () => {
      const cached = getCachedVersionDetails();
      if (cached) {
        return cached;
      }

      const details = await fetchLatestVersionDetails();
      setCachedVersionDetails(details);
      return details;
    })();

    const [detailsResult, changelogResult] = await Promise.allSettled([detailsPromise, getRepoChangelogData()]);
    const resolvedChangelog =
      changelogResult.status === 'fulfilled'
        ? changelogResult.value
        : { markdown: '', baseUrl: GITHUB_CHANGELOG_BASE_URL, loadFailed: true };

    if (detailsResult.status === 'fulfilled') {
      openVersionModal({
        title: 'Informace o verzi',
        html: renderVersionInfoContent(currentVersion, detailsResult.value, resolvedChangelog),
      });
      return;
    }

    openVersionModal({
      title: 'Informace o verzi',
      html: renderVersionInfoErrorContent(currentVersion, resolvedChangelog),
    });
  }

  async function maybeShowUpdatedVersionModal(menuRootElement) {
    migrateLegacyWhatsNewStorage();

    const currentVersion = getCurrentMenuVersion(menuRootElement);
    if (!currentVersion) {
      return;
    }

    const previousShownVersion = getWhatsNewStoredVersion();
    if (!shouldShowWhatsNewModal(previousShownVersion, currentVersion)) {
      return;
    }

    const changelogData = await getRepoChangelogData();
    openVersionModal({
      title: '',
      html: renderUpdateModalContent({
        fromVersion: previousShownVersion,
        toVersion: currentVersion,
        changelogData,
      }),
      actionLabel: 'Rozumím',
      hideHeaderTitle: true,
      modalVariant: 'whats-new',
      onClose: () => {
        setWhatsNewStoredVersion(currentVersion);
      },
    });
  }

  async function initializeVersionUi(menuRootElement) {
    const versionStatusEl = menuRootElement.querySelector('#cc-version-status');
    const menuUpdatePillEl = menuRootElement.querySelector('#cc-menu-update-pill');
    const currentVersion = getCurrentMenuVersion(menuRootElement);
    if (!versionStatusEl || !currentVersion) {
      setVersionStatus(versionStatusEl, menuUpdatePillEl, 'hidden');
      return;
    }

    maybeShowUpdatedVersionModal(menuRootElement).catch(() => undefined);

    setVersionStatus(versionStatusEl, menuUpdatePillEl, 'checking');

    const cached = getCachedUpdateInfo();
    if (cached?.latestVersion) {
      const isUpdateAvailable = compareVersions(cached.latestVersion, currentVersion) > 0;
      setVersionStatus(versionStatusEl, menuUpdatePillEl, isUpdateAvailable ? 'update' : 'ok', cached.latestVersion);
      return;
    }

    try {
      const latestVersion = await fetchLatestScriptVersion();
      setCachedUpdateInfo(latestVersion);
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      setVersionStatus(versionStatusEl, menuUpdatePillEl, isUpdateAvailable ? 'update' : 'ok', latestVersion);
    } catch {
      setVersionStatus(versionStatusEl, menuUpdatePillEl, 'error');
    }
  }

  function getCurrentUserSlugFromProfile() {
    return extractUserSlug(getProfileLinkElement()?.getAttribute('href'));
  }

  function getUserSlugFromPath(pathname) {
    return extractUserSlug(pathname);
  }

  function getCurrentUserRatingsUrl() {
    const profileHref = getProfileLinkElement()?.getAttribute('href');
    if (!profileHref) {
      return undefined;
    }

    const url = new URL(profileHref, location.origin);
    const segment = getCsfdPathSegment('ratings');
    const overviewPattern = new RegExp(`\/(${getCsfdPathSegmentValues('overview').join('|')})\/?$`, 'i');
    if (overviewPattern.test(url.pathname)) {
      url.pathname = url.pathname.replace(overviewPattern, `/${segment}/`);
    } else {
      url.pathname = url.pathname.endsWith('/') ? `${url.pathname}${segment}/` : `${url.pathname}/${segment}/`;
    }
    url.search = '';
    return url.toString();
  }

  // Cache the last fetched total so multiple refreshRatingsBadges calls within the same
  // page load don't each trigger a separate network request to /hodnoceni/.
  let _cachedRatingsUrl = null;
  let _cachedRatingsTotal = null;

  function parseTotalRatingsFromDocument(doc) {
    const extractCount = (text) => {
      const normalized = String(text || '').replace(/\u00a0/g, ' ');
      const match = normalized.match(/\(([^)]+)\)/);
      if (!match) {
        return 0;
      }

      const parsed = Number.parseInt(match[1].replace(/\s+/g, ''), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const preferredSelectors = ['#snippet--ratings h2', '#snippet--ratings .box-header h2', 'h2.page-header', 'h2'];
    for (const selector of preferredSelectors) {
      const heading = doc.querySelector(selector)?.textContent || '';
      const value = extractCount(heading);
      if (value > 0) {
        return value;
      }
    }

    const headingWithRatingsWord = Array.from(doc.querySelectorAll('h2, h3')).find((heading) => {
      const text = String(heading?.textContent || '');
      return /hodnocen|hodnoten/i.test(text) && /\(\s*[\d\s\u00a0]+\s*\)/.test(text);
    });

    return extractCount(headingWithRatingsWord?.textContent || '');
  }

  function getTotalRatingsFromCurrentPageForCurrentUser() {
    const path = location.pathname || '';
    const ratingsPattern = new RegExp(`\/(${getCsfdPathSegmentValues('ratings').join('|')})\/?$`, 'i');
    if (!/\/uzivatel\//.test(path) || !ratingsPattern.test(path)) {
      return 0;
    }

    const currentUserSlug = getCurrentUserSlugFromProfile();
    const pageUserSlug = getUserSlugFromPath(path);
    if (!currentUserSlug || !pageUserSlug || currentUserSlug !== pageUserSlug) {
      return 0;
    }

    return parseTotalRatingsFromDocument(document);
  }

  async function fetchTotalRatingsForCurrentUser() {
    const currentPageTotal = getTotalRatingsFromCurrentPageForCurrentUser();
    if (currentPageTotal > 0) {
      return currentPageTotal;
    }

    const ratingsUrl = getCurrentUserRatingsUrl();
    if (!ratingsUrl) {
      return 0;
    }

    // Return cached value for this URL so repeated badge refreshes within the same
    // page load don't each fire a redundant network request.
    if (_cachedRatingsUrl === ratingsUrl && _cachedRatingsTotal !== null) {
      return _cachedRatingsTotal;
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
    const total = parseTotalRatingsFromDocument(doc);

    _cachedRatingsUrl = ratingsUrl;
    _cachedRatingsTotal = total;

    return total;
  }

  function updateSyncButtonAuthState(rootElement, isLoggedIn) {
    const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');
    if (!syncButton) {
      return;
    }

    if (!isLoggedIn) {
      syncButton.classList.add('cc-sync-icon-btn-disabled');
      syncButton.setAttribute('title', 'Cloud sync je dostupný po přihlášení.');
      syncButton.setAttribute('aria-label', 'Cloud sync je dostupný po přihlášení.');
      return;
    }

    syncButton.classList.remove('cc-sync-icon-btn-disabled');
  }

  async function refreshRatingsBadges(rootElement, options) {
    const redBadge = rootElement.querySelector('#cc-badge-red');
    const blackBadge = rootElement.querySelector('#cc-badge-black');
    if (!redBadge || !blackBadge) {
      return;
    }

    const isLoggedIn = options.isUserLoggedIn();
    if (!isLoggedIn) {
      redBadge.textContent = '- / -';
      blackBadge.textContent = '-';
      redBadge.title = 'Pro načtení hodnocení se přihlaste.';
      blackBadge.title = 'Pro načtení hodnocení se přihlaste.';
      redBadge.classList.add('cc-badge-disabled');
      redBadge.classList.remove('cc-badge-warning');
      blackBadge.classList.add('cc-badge-disabled');
      updateSyncButtonAuthState(rootElement, false);
      return;
    }

    redBadge.classList.remove('cc-badge-disabled');
    redBadge.classList.remove('cc-badge-warning');
    blackBadge.classList.remove('cc-badge-disabled');
    redBadge.title = 'Zobrazit načtená hodnocení';
    blackBadge.title = 'Zobrazit spočtená hodnocení';
    updateSyncButtonAuthState(rootElement, true);

    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const userSlug = options.getCurrentUserSlug() || options.getMostFrequentUserSlug(records);
    if (!userSlug) {
      redBadge.textContent = '0 / 0';
      blackBadge.textContent = '0';
      return;
    }

    // Count how many ratings user has in total (including computed) but excluding deleted
    const userRecords = reconcileUserRatingRecords(records, userSlug).normalizedRecords.filter(
      (record) => record.deleted !== true,
    );
    const computedCount = userRecords.filter((record) => record.computed === true).length;
    const directRatingsCount = userRecords.length - computedCount;
    const fetchedTotalRatings = await fetchTotalRatingsForCurrentUser();
    const totalRatings = fetchedTotalRatings > 0 ? fetchedTotalRatings : directRatingsCount;

    redBadge.textContent = `${directRatingsCount} / ${totalRatings}`;
    if (directRatingsCount < totalRatings) {
      redBadge.classList.add('cc-badge-warning');
      redBadge.title = `Nenačtená hodnocení: ${totalRatings - directRatingsCount}. Klikněte na načtení.`;
    }
    blackBadge.textContent = `${computedCount}`;
  }

  // Utility to enable/disable controls by IDs based on login state
  function setControlsDisabledByLoginState(isLoggedIn, controlIds) {
    controlIds.forEach((id) => {
      const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
      if (el) {
        el.disabled = !isLoggedIn;
        if (!isLoggedIn) {
          el.parentElement && (el.parentElement.style.color = '#aaa');
          el.parentElement && (el.parentElement.title = 'Přihlaste se pro aktivaci této volby');
        } else {
          el.parentElement && (el.parentElement.style.color = '');
          el.parentElement && (el.parentElement.title = '');
        }
      }
    });
  }

  function formatDetailValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    return typeof value === 'string' ? value : String(value);
  }

  function createDetailGroup(label, value) {
    return {
      type: 'group',
      label,
      rows: buildStructuredDetailItems(value),
    };
  }

  function buildStructuredDetailItems(value, label = 'value') {
    if (Array.isArray(value)) {
      if (value.length === 0) return [{ key: label, value: '[]' }];
      return value.map((item, index) =>
        item && typeof item === 'object'
          ? createDetailGroup(`${label}[${index}]`, item)
          : { key: `[${index}]`, value: formatDetailValue(item) },
      );
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return [{ key: label, value: '{}' }];
      return entries.map(([key, nestedValue]) =>
        nestedValue && typeof nestedValue === 'object'
          ? createDetailGroup(key, nestedValue)
          : { key, value: formatDetailValue(nestedValue) },
      );
    }

    return [{ key: label, value: formatDetailValue(value) }];
  }

  function appendDetailsRows(container, items) {
    items.forEach((item) => {
      if (item?.type === 'group') {
        const groupEl = document.createElement('div');
        groupEl.className = 'cc-detail-group';

        const groupTitleEl = document.createElement('div');
        groupTitleEl.className = 'cc-detail-group-title';
        groupTitleEl.textContent = item.label;

        const groupBodyEl = document.createElement('div');
        groupBodyEl.className = 'cc-detail-group-body';
        appendDetailsRows(groupBodyEl, item.rows || []);

        groupEl.appendChild(groupTitleEl);
        groupEl.appendChild(groupBodyEl);
        container.appendChild(groupEl);
        return;
      }

      const rowEl = document.createElement('div');
      rowEl.className = 'cc-rating-detail-row';

      const keyEl = document.createElement('div');
      keyEl.className = 'cc-rating-detail-key';
      keyEl.textContent = item?.key ?? '';

      const valueEl = document.createElement('div');
      valueEl.className = 'cc-rating-detail-value';
      valueEl.textContent = item?.value ?? '';

      rowEl.appendChild(keyEl);
      rowEl.appendChild(valueEl);
      container.appendChild(rowEl);
    });
  }

  /**
   * Creates a modal that shows extra details.
   * It displas simple values or grouped/nested detail items.
   * The returned object lets you open and close the popup.
   *
   * @param {Object} options Settings for the popup
   * @param {string} options.overlayClass Extra CSS class added to the popup overlay
   * @param {string} options.defaultTitle Default heading shown at the top of the popup
   * @param {string} options.titleId ID used for the popup title element
   * @returns {Object} An object with methods to control the popup
   */
  function createDetailsModalController({
    overlayClass = '',
    defaultTitle = 'Detail',
    titleId = 'cc-detail-title',
  } = {}) {
    const detailsOverlay = document.createElement('div');
    detailsOverlay.className = ['cc-rating-detail-overlay', overlayClass].filter(Boolean).join(' ');
    detailsOverlay.innerHTML = `
    <div class="cc-rating-detail-card" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="cc-rating-detail-head">
        <h4 id="${titleId}">${defaultTitle}</h4>
        <button type="button" class="cc-rating-detail-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-rating-detail-body"></div>
    </div>
  `;

    const detailsBody = detailsOverlay.querySelector('.cc-rating-detail-body');
    const detailsTitle = detailsOverlay.querySelector(`#${titleId}`);
    const closeDetailsBtn = detailsOverlay.querySelector('.cc-rating-detail-close');

    const open = (title, rows = []) => {
      detailsTitle.textContent = title || defaultTitle;
      detailsBody.innerHTML = '';
      appendDetailsRows(detailsBody, rows);
      detailsOverlay.classList.add('is-open');
    };

    const close = () => detailsOverlay.classList.remove('is-open');

    // Use an AbortController to manage event listeners and ensure they are cleaned up when the modal is destroyed
    const abortController = new AbortController();
    const { signal } = abortController;

    closeDetailsBtn.addEventListener('click', close);
    detailsOverlay.addEventListener('click', (event) => {
      if (event.target === detailsOverlay) close();
    });

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && detailsOverlay.classList.contains('is-open')) close();
      },
      { signal },
    );

    const destroy = () => {
      abortController.abort();
      detailsOverlay.remove();
    };

    return {
      overlay: detailsOverlay,
      open,
      close,
      destroy,
      isOpen: () => detailsOverlay.classList.contains('is-open'),
    };
  }

  // ============================================================================
  // 1. DATA PROCESSING & HELPERS (Private)
  // ============================================================================

  function resolveRecordUrl(record) {
    if (record.fullUrl) return record.fullUrl;
    if (record.url) return new URL(`/film/${record.url}/`, location.origin).toString();
    return '';
  }

  /**
   * Normalizes the raw type string from the rating record into a standardized format with a key and display label.
   * @param {*} rawType The raw type string from the record, e.g. "movie", "seriál", "episode", etc.
   * @returns {{key: string, label: string}}
   */
  function normalizeModalType(rawType) {
    const normalized = normalizeCsfdShowType(rawType, 'movie');
    if (normalized === 'episode') return { key: 'episode', label: 'Episode' };
    if (normalized === 'serial') return { key: 'series', label: 'Series' };
    if (normalized === 'season') return { key: 'season', label: 'Season' };
    return { key: 'movie', label: 'Movie' };
  }

  /**
   * Formats the rating value for display in the modal, handling special cases like deleted ratings and "odpad" (trash) ratings.
   * @param {*} ratingValue The numeric rating value.
   * @param {*} isDeleted Whether the rating is marked as deleted.
   * @returns {{stars: string, isOdpad: boolean}}
   */
  function formatRatingForModal(ratingValue, isDeleted) {
    if (isDeleted) return { stars: 'SMAZÁNO', isOdpad: false };
    if (!Number.isFinite(ratingValue)) return { stars: 'odpad!', isOdpad: true };
    if (ratingValue === 0) return { stars: 'odpad!', isOdpad: true };
    const count = Math.min(5, Math.max(1, Math.round(ratingValue)));
    return { stars: '★'.repeat(count), isOdpad: false };
  }

  /**
   * Returns the CSS class for the rating square based on the rating value and deletion status.
   * @param {*} ratingValue The numeric rating value.
   * @param {*} isDeleted Whether the rating is marked as deleted.
   * @returns {string}
   */
  function getRatingSquareClass(ratingValue, isDeleted) {
    if (isDeleted) return 'is-unknown';
    if (!Number.isFinite(ratingValue)) return 'is-unknown';
    if (ratingValue === 0) return 'is-0';
    const r = Math.min(5, Math.max(1, Math.round(ratingValue)));
    return `is-${r}`;
  }

  function parseCzechDateToSortableValue(dateStr) {
    if (!dateStr) return 0;
    const m = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return 0;
    const d = Number.parseInt(m[1], 10);
    const mo = Number.parseInt(m[2], 10);
    const y = Number.parseInt(m[3], 10);
    return y * 10000 + mo * 100 + d;
  }

  function normalizeSearchText(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Converts raw records into a format suitable for display in the modal.
   * Each record is normalized and enriched with computed properties for sorting and filtering.
   * @param {*} records The array of raw records.
   * @returns {Array} An array of formatted modal rows.
   */
  function toModalRows(records) {
    if (!Array.isArray(records)) return [];
    return records.map((record) => {
      // Normalize the type (e.g. "movie", "series", "episode") and derive display labels
      const normalizedType = normalizeModalType(record.type);

      // Decide how to display the type, incorporating seriesToken or parentName if available
      // E.g. "Series (The Office)", "Season (S01)", or just "Movie"
      let typeDisplay = normalizedType.label;
      if (record.seriesToken) {
        typeDisplay = `${normalizedType.label} (${record.seriesToken})`;
      } else if (record.parentName) {
        typeDisplay = `${normalizedType.label} (${record.parentName})`;
      }

      // Parse the year as a number for sorting, but keep the original string for display (in case of non-standard formats)
      const parsedYear = Number.parseInt(record.year, 10);

      // Format the rating for display and determine if it's "odpad" (trash) or unknown and determine the CSS class for the rating square
      const ratingValue = Number.isFinite(record.rating) ? record.rating : NaN;
      const formattedRating = formatRatingForModal(ratingValue, record.deleted);

      // For better search optimization, save all relevant fields as normalized text to one string
      const nameNorm = normalizeSearchText(record.name);
      const urlNorm = normalizeSearchText(record.url);
      const typeNorm = normalizeSearchText(typeDisplay);
      const typeLabelNorm = normalizeSearchText(normalizedType.label);
      const dateNorm = normalizeSearchText(record.date);
      const searchString = `${nameNorm} ${urlNorm} ${typeNorm} ${typeLabelNorm} ${parsedYear} ${dateNorm} ${formattedRating.isOdpad ? 'odpad' : ''}`;

      return {
        name: (record.name || '').trim(),
        url: resolveRecordUrl(record),
        typeKey: normalizedType.key,
        typeLabel: normalizedType.label,
        typeDisplay,
        yearValue: parsedYear,
        ratingText: formattedRating.stars,
        ratingIsOdpad: formattedRating.isOdpad,
        ratingValue,
        ratingSquareClass: getRatingSquareClass(ratingValue, record.deleted),
        date: (record.date || '').trim(),
        dateSortValue: parseCzechDateToSortableValue(record.date),
        isComputed: record.computed === true,
        isDeleted: record.deleted === true,
        searchString,
        rawRecord: { ...record },
      };
    });
  }

  function filterRowsByType(rows, typeFilters) {
    if (typeFilters.has('all') || typeFilters.size === 0) return rows;
    return rows.filter((row) => typeFilters.has(row.typeKey));
  }

  // Create Intl.Collator instances once for efficient string comparison during sorting
  const csCollator = new Intl.Collator('cs', { sensitivity: 'base' });
  const enCollator = new Intl.Collator('en', { sensitivity: 'base' });

  function sortRows(rows, sortKey, sortDir) {
    const sorted = rows.sort((a, b) => {
      if (sortKey === 'type') return enCollator.compare(a.typeDisplay, b.typeDisplay);

      if (sortKey === 'year') {
        const aYear = Number.isFinite(a.yearValue) ? a.yearValue : -Infinity;
        const bYear = Number.isFinite(b.yearValue) ? b.yearValue : -Infinity;
        return aYear - bYear;
      }

      if (sortKey === 'rating') return a.ratingValue - b.ratingValue;
      if (sortKey === 'date') return a.dateSortValue - b.dateSortValue;

      // Extremely fast string comparison
      return csCollator.compare(a.name, b.name);
    });

    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }

  function filterRows(rows, search) {
    const query = normalizeSearchText(search).trim();
    if (!query) return rows;
    return rows.filter((row) => row.searchString.includes(query));
  }

  // ============================================================================
  // 2. DETAIL MODAL CONTROLLER (Private)
  // ============================================================================

  function createRatingDetailsController() {
    const orderedKeys = [
      'id',
      'userSlug',
      'movieId',
      'name',
      'url',
      'fullUrl',
      'type',
      'year',
      'rating',
      'date',
      'parentId',
      'parentName',
      'computed',
      'computedCount',
      'computedFromText',
      'lastUpdate',
    ];

    const controller = createDetailsModalController({
      defaultTitle: 'Detail záznamu',
      titleId: 'cc-rating-detail-title',
    });

    const open = (row) => {
      const record = row?.rawRecord || {};
      const keys = new Set([...orderedKeys, ...Object.keys(record)]);

      controller.open(
        row?.name ? `Detail: ${row.name}` : 'Detail záznamu',
        Array.from(keys).map((key) => ({
          key,
          value:
            record[key] !== null && typeof record[key] === 'object'
              ? JSON.stringify(record[key])
              : formatDetailValue(record[key]),
        })),
      );
    };

    return {
      ...controller,
      open,
    };
  }

  function getRatingsTableModal() {
    let overlay = document.querySelector('#cc-ratings-table-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'cc-ratings-table-modal-overlay';
    overlay.className = 'cc-ratings-table-overlay';
    overlay.innerHTML = `
    <style>
      .cc-ratings-scope-dev-btn {
        display: none; /* Řízeno přes JS */
        align-items: center;
        justify-content: center;
        background: transparent;
        color: #888;
        border: 1px dashed #ccc;
        border-radius: 4px;
        padding: 0 10px;
        height: 24px;
        font-size: 11px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .cc-ratings-scope-dev-btn:hover {
        border-color: #aa2c16;
        color: #aa2c16;
        background: rgba(170, 44, 22, 0.05);
      }
      .cc-ratings-scope-dev-btn.is-active {
        border-color: #aa2c16;
        color: #aa2c16;
        background: rgba(170, 44, 22, 0.1);
        border-style: solid;
      }
    </style>
    <div class="cc-ratings-table-modal" role="dialog" aria-modal="true" aria-labelledby="cc-ratings-table-title">
      <div class="cc-ratings-table-head">
        <h3 id="cc-ratings-table-title" style="flex: 1; margin: 0; font-size: 15px;">Přehled hodnocení</h3>
        <div class="cc-ratings-scope-toggle">
          <button type="button" data-scope="all">Všechny</button>
          <button type="button" data-scope="direct">Přímo hodnocené</button>
          <button type="button" data-scope="computed">Spočtené</button>
        </div>
       <div style="flex: 1; display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding-right: 4px;">
          <button type="button" class="cc-ratings-scope-dev-btn" data-scope="deleted">Smazané</button>
          <button type="button" class="cc-ratings-table-close" aria-label="Zavřít">×</button>
        </div>
      </div>
      <div class="cc-ratings-table-toolbar">
        <input type="search" class="cc-ratings-table-search" placeholder="Filtrovat (název, URL, hodnocení, datum)…" />
        <div class="cc-toolbar-right">
          <div class="cc-ratings-type-multiselect" data-open="false">
            <button type="button" class="cc-ratings-type-toggle" aria-expanded="false">All types</button>
            <div class="cc-ratings-type-menu" hidden>
              <label><input type="checkbox" value="all" checked /> All</label>
              <label><input type="checkbox" value="movie" /> Movie</label>
              <label><input type="checkbox" value="series" /> Series</label>
              <label><input type="checkbox" value="season" /> Season</label>
              <label><input type="checkbox" value="episode" /> Episode</label>
            </div>
          </div>
          <span class="cc-ratings-table-summary">0 položek</span>
          <button type="button" class="cc-button cc-button-red cc-button-iconed cc-ratings-table-export">Export</button>
        </div>
      </div>
      <div class="cc-ratings-table-wrap">
        <table class="cc-ratings-table" aria-live="polite">
          <thead>
            <tr>
              <th><button type="button" data-sort-key="name"><span class="cc-sort-label">Název</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="type"><span class="cc-sort-label">Typ</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="year"><span class="cc-sort-label">Rok</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="rating"><span class="cc-sort-label">Hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
              <th><button type="button" data-sort-key="date"><span class="cc-sort-label">Datum hodnocení</span><span class="cc-sort-indicator" aria-hidden="true">↕</span></button></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

    const closeBtn = overlay.querySelector('.cc-ratings-table-close');
    const searchInput = overlay.querySelector('.cc-ratings-table-search');
    const typeMulti = overlay.querySelector('.cc-ratings-type-multiselect');
    const typeToggle = overlay.querySelector('.cc-ratings-type-toggle');
    const typeMenu = overlay.querySelector('.cc-ratings-type-menu');
    const typeCheckboxes = Array.from(overlay.querySelectorAll('.cc-ratings-type-menu input[type="checkbox"]'));
    const summary = overlay.querySelector('.cc-ratings-table-summary');
    const exportBtn = overlay.querySelector('.cc-ratings-table-export');
    const tbody = overlay.querySelector('tbody');
    const title = overlay.querySelector('#cc-ratings-table-title');
    const sortButtons = Array.from(overlay.querySelectorAll('th button[data-sort-key]'));

    const state = {
      rows: [],
      visibleRows: [],
      search: '',
      typeFilters: new Set(['all']),
      sortKey: 'name',
      sortDir: 'asc',
      scopeFilter: 'all',
      renderedCount: 0, // number of lines rendered in the table (for performance optimization)
    };

    const RENDER_CHUNK_SIZE = 100;
    const tableWrap = overlay.querySelector('.cc-ratings-table-wrap');

    // Initial render of few rows to show the modal faster, the rest will be rendered asynchronously in chunks
    const renderInitialRows = (rows) => {
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="cc-ratings-table-empty">Žádná data</td></tr>';
        return;
      }
      state.renderedCount = Math.min(RENDER_CHUNK_SIZE, rows.length);
      const html = rows
        .slice(0, state.renderedCount)
        .map((r, i) => buildRowHtml(r, i))
        .join('');
      tbody.innerHTML = html;
    };

    // Render next chung, when user scrolls to the end
    const renderMoreRows = () => {
      if (state.renderedCount >= state.visibleRows.length) return;

      const end = Math.min(state.renderedCount + RENDER_CHUNK_SIZE, state.visibleRows.length);
      const html = state.visibleRows
        .slice(state.renderedCount, end)
        .map((r, i) => buildRowHtml(r, state.renderedCount + i))
        .join('');

      tbody.insertAdjacentHTML('beforeend', html);
      state.renderedCount = end;
    };

    // Simple scroll handler with debounce to trigger rendering more rows when user scrolls near the end of the table
    let isScrolling = false;
    tableWrap.addEventListener('scroll', () => {
      if (!isScrolling) {
        window.requestAnimationFrame(() => {
          if (tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - 400) {
            renderMoreRows();
          }
          isScrolling = false;
        });
        isScrolling = true;
      }
    });

    const detailsController = createRatingDetailsController();

    const updateTypeToggleText = () => {
      if (state.typeFilters.has('all') || state.typeFilters.size === 0) {
        typeToggle.textContent = 'All types';
        return;
      }
      const labels = [];
      if (state.typeFilters.has('movie')) labels.push('Movie');
      if (state.typeFilters.has('series')) labels.push('Series');
      if (state.typeFilters.has('season')) labels.push('Season');
      if (state.typeFilters.has('episode')) labels.push('Episode');
      typeToggle.textContent = labels.join(', ');
    };

    const syncTypeCheckboxes = () => {
      for (const input of typeCheckboxes) {
        input.checked = state.typeFilters.has(input.value);
      }
      updateTypeToggleText();
    };

    const buildRowHtml = (row, rowIndex) => {
      const detailsButton = `<button type="button" class="cc-ratings-table-details-btn cc-script-link-btn" data-row-index="${rowIndex}" aria-label="Zobrazit detail">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" />
            <path d="M12 11.5V15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="12" cy="8.2" r="1" fill="currentColor" />
          </svg>
        </button>`;

      const iconLink = row.url
        ? `<a class="cc-ratings-table-link-icon cc-script-link-btn" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer" aria-label="Otevřít detail">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path d="M9 8H6.5C5.1 8 4 9.1 4 10.5V17.5C4 18.9 5.1 20 6.5 20H13.5C14.9 20 16 18.9 16 17.5V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M10 14L20 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M14 4H20V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>`
        : '';

      const escapedName = escapeHtml(row.name || 'Bez názvu');
      const nameLink = row.url
        ? `<a class="cc-ratings-table-name-link" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapedName}</a>`
        : `<span class="cc-ratings-table-name-link">${escapedName}</span>`;

      return `
      <tr>
        <td>
          <div class="cc-ratings-table-name-row">
            <span class="cc-ratings-square ${escapeHtml(row.ratingSquareClass)} ${row.isComputed ? 'is-computed' : ''}" aria-hidden="true"></span>
            ${nameLink}
            ${detailsButton}
            ${iconLink}
          </div>
        </td>
        <td class="cc-ratings-table-type">${escapeHtml(row.typeDisplay)}</td>
        <td class="cc-ratings-table-year">${Number.isFinite(row.yearValue) ? row.yearValue : '—'}</td>
        <td class="cc-ratings-table-rating ${row.ratingIsOdpad ? 'is-odpad' : ''} ${row.isComputed ? 'is-computed' : ''}">${escapeHtml(row.ratingText)}</td>
        <td class="cc-ratings-table-date">${escapeHtml(row.date || '—')}</td>
      </tr>
    `;
    };

    const render = () => {
      const scopeFiltered = state.rows.filter((r) => {
        // Show deleted only if "Smazané" scope is active
        if (state.scopeFilter === 'deleted') return r.isDeleted;

        // For other scopes, always hide deleted records
        if (r.isDeleted) return false;

        if (state.scopeFilter === 'direct') return !r.isComputed;
        if (state.scopeFilter === 'computed') return r.isComputed;
        return true;
      });

      console.log(
        `[CC Debug] Scope: ${state.scopeFilter}, Smazaných v rows: ${state.rows.filter((r) => r.isDeleted).length}, Po prvním filtru: ${scopeFiltered.length}`,
      );

      const typeFiltered = filterRowsByType(scopeFiltered, state.typeFilters);
      const filtered = filterRows(typeFiltered, state.search);
      const sorted = sortRows(filtered, state.sortKey, state.sortDir);
      state.visibleRows = sorted;

      summary.textContent = `${sorted.length} položek`;
      if (exportBtn) exportBtn.disabled = sorted.length === 0;

      // renderRowsFast(sorted, renderToken);  // Old render method
      tableWrap.scrollTop = 0;
      renderInitialRows(sorted);

      for (const button of sortButtons) {
        const key = button.dataset.sortKey;
        const active = key === state.sortKey;
        button.classList.toggle('is-active', active);
        const indicator = button.querySelector('.cc-sort-indicator');
        if (indicator) indicator.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';
      }
    };

    const scopeBtns = overlay.querySelectorAll('.cc-ratings-scope-toggle button');
    const devBtn = overlay.querySelector('.cc-ratings-scope-dev-btn');
    const allScopeBtns = [...Array.from(scopeBtns), devBtn];

    // Scope buttons event listeners
    allScopeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.scopeFilter = btn.dataset.scope;
        allScopeBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        render();
      });
    });

    overlay.openWithData = ({ rows, modalTitle, initialScope = 'all' }) => {
      const isDev = localStorage.getItem('cc_dev_mode') === 'true';
      devBtn.style.display = isDev ? 'flex' : 'none';

      if (exportBtn) exportBtn.disabled = rows.length === 0;
      state.scopeFilter = initialScope;

      // Activate the correct scope button based on initialScope
      allScopeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.scope === initialScope));

      state.rows = rows;
      state.search = '';
      state.typeFilters = new Set(['all']);
      state.sortKey = 'name';
      state.sortDir = 'asc';
      title.textContent = modalTitle;
      searchInput.value = '';
      typeMulti.dataset.open = 'false';
      typeMenu.hidden = true;
      typeToggle.setAttribute('aria-expanded', 'false');
      syncTypeCheckboxes();
      render();

      overlay.classList.add('is-open');
      document.body.classList.add('cc-ratings-modal-open');
      searchInput.focus();
    };

    overlay.closeModal = () => {
      overlay.classList.remove('is-open');
      detailsController.close();
      document.body.classList.remove('cc-ratings-modal-open');
    };

    closeBtn.addEventListener('click', () => overlay.closeModal());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.closeModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (detailsController.isOpen()) {
        detailsController.close();
        return;
      }
      if (overlay.classList.contains('is-open')) overlay.closeModal();
    });

    tbody.addEventListener('click', (event) => {
      const detailsButton = event.target.closest('.cc-ratings-table-details-btn');
      if (!detailsButton) return;
      const rowIndex = Number.parseInt(detailsButton.getAttribute('data-row-index') || '-1', 10);
      if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= state.visibleRows.length) return;
      detailsController.open(state.visibleRows[rowIndex]);
    });

    // Render debounce for search input to avoid rendering on every keystroke
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.search = searchInput.value;
        render();
      }, 200); // TODO: Move to config as constant
    });

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const csvLines = [];
        const header = ['Název', 'Typ', 'Rok', 'Hodnocení', 'Datum hodnocení', 'URL', 'movieID'];
        csvLines.push(header.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));
        state.visibleRows.forEach((row) => {
          let ratingNum = '';
          if (Number.isFinite(row.ratingValue)) ratingNum = Math.round(row.ratingValue);
          else if (row.ratingText && row.ratingText.toLowerCase().includes('odpad')) ratingNum = 0;

          const fields = [
            row.name,
            row.typeDisplay,
            row.yearValue,
            ratingNum,
            row.date,
            row.rawRecord?.fullUrl || '',
            row.rawRecord?.movieId || '',
          ];
          const escaped = fields.map((f) => `"${(f != null ? String(f) : '').replace(/"/g, '""')}"`);
          csvLines.push(escaped.join(','));
        });
        const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'cc-ratings.csv';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    typeToggle.addEventListener('click', () => {
      const isOpen = typeMulti.dataset.open === 'true';
      const nextOpen = !isOpen;
      typeMulti.dataset.open = nextOpen ? 'true' : 'false';
      typeMenu.hidden = !nextOpen;
      typeToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    });

    typeMenu.addEventListener('click', (e) => e.stopPropagation());

    for (const input of typeCheckboxes) {
      input.addEventListener('change', () => {
        const value = input.value;
        if (value === 'all' && input.checked) {
          state.typeFilters = new Set(['all']);
        } else if (value !== 'all') {
          state.typeFilters.delete('all');
          if (input.checked) state.typeFilters.add(value);
          else state.typeFilters.delete(value);
          if (state.typeFilters.size === 0) state.typeFilters = new Set(['all']);
        } else if (value === 'all' && !input.checked && state.typeFilters.size === 1 && state.typeFilters.has('all')) {
          state.typeFilters = new Set(['all']);
        }
        syncTypeCheckboxes();
        render();
      });
    }

    document.addEventListener('click', (event) => {
      if (!overlay.classList.contains('is-open')) return;
      if (!typeMulti.contains(event.target)) {
        typeMulti.dataset.open = 'false';
        typeMenu.hidden = true;
        typeToggle.setAttribute('aria-expanded', 'false');
      }
    });

    for (const button of sortButtons) {
      button.addEventListener('click', () => {
        const key = button.dataset.sortKey;
        if (!key) return;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        render();
      });
    }

    syncTypeCheckboxes();
    document.body.appendChild(overlay);
    document.body.appendChild(detailsController.overlay);
    return overlay;
  }

  function openRatingsTableView({ rows, modalTitle, initialScope = 'all' }) {
    const modal = getRatingsTableModal();
    modal.openWithData({ rows, modalTitle, initialScope });
  }

  // ============================================================================
  // 4. CACHE & ENTRY POINT (Public Exports)
  // ============================================================================

  const ratingsModalCache = {
    userSlug: '',
    userRecords: null,
    allRows: null,
  };

  async function getCachedUserRecords(userSlug) {
    if (
      ratingsModalCache.userSlug === userSlug &&
      Array.isArray(ratingsModalCache.userRecords) &&
      ratingsModalCache.userRecords.length >= 0
    ) {
      return ratingsModalCache.userRecords;
    }

    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const userRecords = reconcileUserRatingRecords(records, userSlug).normalizedRecords;
    ratingsModalCache.userSlug = userSlug;
    ratingsModalCache.userRecords = userRecords;
    ratingsModalCache.allRows = null;

    return userRecords;
  }

  async function getCachedAllRows(userSlug) {
    if (ratingsModalCache.userSlug === userSlug && Array.isArray(ratingsModalCache.allRows)) {
      return ratingsModalCache.allRows;
    }
    const userRecords = await getCachedUserRecords(userSlug);
    const rows = toModalRows(userRecords);
    ratingsModalCache.allRows = rows;
    return rows;
  }

  function invalidateRatingsModalCache() {
    ratingsModalCache.userSlug = '';
    ratingsModalCache.userRecords = null;
    ratingsModalCache.allRows = null;
  }

  async function openRatingsTableModal(rootElement, scope, callbacks) {
    const getCurrentUserSlug = callbacks?.getCurrentUserSlug;
    const getMostFrequentUserSlug = callbacks?.getMostFrequentUserSlug;

    let userSlug = getCurrentUserSlug?.();
    if (!userSlug) {
      const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
      userSlug = getMostFrequentUserSlug?.(records);
    }
    if (!userSlug) return;

    const rows = await getCachedAllRows(userSlug);
    openRatingsTableView({
      rows,
      modalTitle: 'Tabulka hodnocení',
      initialScope: scope,
    });

    const redBadge = rootElement.querySelector('#cc-badge-red');
    const blackBadge = rootElement.querySelector('#cc-badge-black');
    redBadge?.blur();
    blackBadge?.blur();
  }

  const HEADER_HOVER_STORAGE_KEY = 'headerBarHovered';
  const HOVER_TOGGLE_DELAY_MS = 200;

  let normalListeners = [];

  // OPTIMIZATION: Only modify the specific menu button, preventing CSFD native scripts
  // from freezing the browser by trying to open all native dropdowns at once.
  function setHoverState(menuButton, isHovered) {
    if (isHovered) {
      menuButton.classList.add('hovered', 'active');
      document.body.classList.add('cc-menu-open');
    } else {
      menuButton.classList.remove('hovered', 'active');
      document.body.classList.remove('cc-menu-open');
    }
  }

  function clearNormalListeners() {
    normalListeners.forEach(({ el, type, handler }) => el.removeEventListener(type, handler));
    normalListeners = [];
  }

  function clearPendingTimeouts(timeoutState) {
    clearTimeout(timeoutState.hoverTimeout);
    clearTimeout(timeoutState.hideTimeout);
  }

  function bindHoverHandlers(menuButton, timeoutState) {
    clearNormalListeners();

    // OPTIMIZATION: We only need to listen on the parent wrapper.
    // 'mouseenter' and 'mouseleave' naturally cover child elements like the dropdown.
    const onEnter = () => {
      clearTimeout(timeoutState.hideTimeout);
      timeoutState.hoverTimeout = setTimeout(() => {
        setHoverState(menuButton, true);
      }, HOVER_TOGGLE_DELAY_MS);
    };

    const onLeave = () => {
      clearTimeout(timeoutState.hoverTimeout);
      timeoutState.hideTimeout = setTimeout(() => {
        setHoverState(menuButton, false);
      }, HOVER_TOGGLE_DELAY_MS);
    };

    menuButton.addEventListener('mouseenter', onEnter);
    menuButton.addEventListener('mouseleave', onLeave);
    normalListeners.push({ el: menuButton, type: 'mouseenter', handler: onEnter });
    normalListeners.push({ el: menuButton, type: 'mouseleave', handler: onLeave });
  }

  function initializeSettingsMenuHover(menuButton) {
    if (typeof menuButton === 'string') {
      menuButton = document.querySelector(menuButton);
    }
    // Handle jQuery objects if they accidentally get passed
    if (!(menuButton instanceof Element) && menuButton && menuButton.jquery) {
      menuButton = menuButton[0];
    }

    if (!menuButton) return;

    let hoverTimeout;
    let hideTimeout;
    let pinnedOpen = false;
    let dragCleanup;
    const dropdown = menuButton.querySelector('.dropdown-content.cc-settings');
    const menuLink = menuButton.querySelector('.csfd-compare-menu');
    const originalDropdownParent = dropdown?.parentNode;
    const originalDropdownNextSibling = dropdown?.nextSibling || null;

    const timeoutState = {
      get hoverTimeout() {
        return hoverTimeout;
      },
      set hoverTimeout(value) {
        hoverTimeout = value;
      },
      get hideTimeout() {
        return hideTimeout;
      },
      set hideTimeout(value) {
        hideTimeout = value;
      },
    };

    const enableNormalHover = () => {
      if (pinnedOpen) return;
      bindHoverHandlers(menuButton, timeoutState);
    };

    const resetPinnedPosition = () => {
      if (!dropdown) return;
      dropdown.style.left = '';
      dropdown.style.right = '30px';
      dropdown.style.top = '30px';
    };

    const attachDropdownToBody = () => {
      if (!dropdown || dropdown.parentNode === document.body) return;
      document.body.appendChild(dropdown);
    };

    const restoreDropdownToMenu = () => {
      if (!dropdown || !originalDropdownParent || dropdown.parentNode === originalDropdownParent) return;

      if (originalDropdownNextSibling && originalDropdownNextSibling.parentNode === originalDropdownParent) {
        originalDropdownParent.insertBefore(dropdown, originalDropdownNextSibling);
        return;
      }

      originalDropdownParent.appendChild(dropdown);
    };

    const destroyDragBehavior = () => {
      if (typeof dragCleanup === 'function') {
        dragCleanup();
        dragCleanup = undefined;
      }
    };

    const enablePinnedDragging = () => {
      if (!dropdown) return;

      destroyDragBehavior();

      const dragHandle = dropdown.querySelector('.left-head');
      if (!dragHandle) return;

      const onMouseDown = (event) => {
        if (!pinnedOpen) return;
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, label')) return;

        event.preventDefault();
        const rect = dropdown.getBoundingClientRect();
        const startOffsetX = event.clientX - rect.left;
        const startOffsetY = event.clientY - rect.top;

        dropdown.style.right = 'auto';
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.top}px`;

        const onMouseMove = (moveEvent) => {
          const maxLeft = Math.max(0, window.innerWidth - rect.width);
          const maxTop = Math.max(0, window.innerHeight - rect.height);
          const nextLeft = Math.min(maxLeft, Math.max(0, moveEvent.clientX - startOffsetX));
          const nextTop = Math.min(maxTop, Math.max(0, moveEvent.clientY - startOffsetY));

          dropdown.style.left = `${nextLeft}px`;
          dropdown.style.top = `${nextTop}px`;
        };

        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove, true);
          window.removeEventListener('mouseup', onMouseUp, true);
        };

        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mouseup', onMouseUp, true);
      };

      dragHandle.addEventListener('mousedown', onMouseDown);
      dragCleanup = () => {
        dragHandle.removeEventListener('mousedown', onMouseDown);
      };
    };

    const openPinned = () => {
      pinnedOpen = true;
      clearPendingTimeouts(timeoutState);
      clearNormalListeners();
      attachDropdownToBody();
      dropdown?.classList.add('cc-settings-pinned-root');
      resetPinnedPosition();
      enablePinnedDragging();
      setHoverState(menuButton, true);
    };

    const closePinned = () => {
      pinnedOpen = false;
      clearPendingTimeouts(timeoutState);
      destroyDragBehavior();
      dropdown?.classList.remove('cc-settings-pinned-root');
      resetPinnedPosition();
      restoreDropdownToMenu();
      setHoverState(menuButton, false);
      enableNormalHover();
    };

    const togglePinned = () => {
      if (pinnedOpen) {
        closePinned();
        return false;
      }

      openPinned();
      return true;
    };

    menuButton.__ccSettingsMenuController = {
      openPinned,
      closePinned,
      togglePinned,
      isPinnedOpen() {
        return pinnedOpen;
      },
    };

    {
      // Place the debug toggle inside the settings menu next to the DEV button.
      // Fallback: if the settings menu isn't available yet, create a simple floating control.
      const maintActions = menuButton.querySelector('.cc-maint-actions');
      const stickLabel = 'stick';
      let checkbox;
      if (maintActions) {
        const wrapper = document.createElement('div');
        wrapper.className = 'cc-maint-dev-control cc-dev-only';
        wrapper.title = 'Při aktivaci nechá CC menu trvale otevřené.';

        const switchLabel = document.createElement('label');
        switchLabel.className = 'cc-switch';

        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'cc-debug-hover-checkbox';
        checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';

        const switchBg = document.createElement('span');
        switchBg.className = 'cc-switch-bg';

        switchLabel.appendChild(checkbox);
        switchLabel.appendChild(switchBg);

        const labelText = document.createElement('span');
        labelText.className = 'cc-setting-label';
        labelText.textContent = stickLabel;

        wrapper.appendChild(switchLabel);
        wrapper.appendChild(labelText);

        const devBtn = maintActions.querySelector('#cc-maint-dev-btn');
        if (devBtn) {
          maintActions.insertBefore(wrapper, devBtn);
        } else {
          maintActions.appendChild(wrapper);
        }
      } else {
        let controlsContainer = document.querySelector('.fancy-alert-controls');
        if (!controlsContainer) {
          controlsContainer = document.createElement('div');
          controlsContainer.className = 'fancy-alert-controls';
          Object.assign(controlsContainer.style, {
            position: 'fixed',
            top: '4px',
            right: '150px',
            zIndex: '9999',
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px 16px',
          });
          document.body.appendChild(controlsContainer);
        }

        controlsContainer.innerHTML = '';
        const checkboxLabel = document.createElement('label');
        Object.assign(checkboxLabel.style, {
          display: 'inline-flex',
          alignItems: 'center',
          marginRight: '10px',
          cursor: 'pointer',
        });
        checkboxLabel.textContent = stickLabel;

        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.style.marginRight = '5px';
        checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';
        checkboxLabel.prepend(checkbox);
        controlsContainer.appendChild(checkboxLabel);
      }

      function debugClickHandler(e) {
        e.stopPropagation();
        const isActive = menuButton.classList.contains('active');
        setHoverState(menuButton, !isActive);
      }

      function enableDebugHover() {
        clearNormalListeners();
        setHoverState(menuButton, true);
        if (menuLink) {
          menuLink.addEventListener('click', debugClickHandler);
        }
      }

      function enableDebugNormalHover() {
        if (menuLink) {
          menuLink.removeEventListener('click', debugClickHandler);
        }
        enableNormalHover();
      }

      if (checkbox && checkbox.checked) {
        enableDebugHover();
      } else if (checkbox) {
        enableDebugNormalHover();
      }

      if (checkbox) {
        checkbox.addEventListener('change', function () {
          if (checkbox.checked) {
            localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'true');
            enableDebugHover();
          } else {
            localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'false');
            enableDebugNormalHover();
          }
        });
      }
    }
  }

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

  function isHeaderProfileLink(anchor) {
    return anchor instanceof Element && anchor.matches(PROFILE_LINK_SELECTOR) && anchor.closest('.header-bar') !== null;
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

  function parseCreatorPreviewDocument(doc) {
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

  function parseUserPreviewDocument(doc) {
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

  function parseFilmPreviewDocument(doc) {
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
  function parseReviewPreviewDocument(doc, reviewUrl = location.href) {
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

  function parseFilmPosterGalleryDocument(doc) {
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
  function parseMyAnimeListCharacterPreviewDocument(doc) {
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
  function parseMyAnimeListAnimePreviewDocument(doc) {
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
  function parseAniDbCharacterPreviewDocument(doc) {
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
  function parseAniDbAnimePreviewDocument(doc) {
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

  const HOVER_PREVIEW_PROVIDERS = [
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
        if (isUserLinkInsideAccountDropdown(anchor) || isHeaderProfileLink(anchor)) {
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

  function getHoverPreviewSettingsItems() {
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

  // Export a pure data-driven MENU_CONFIG. Callback handlers are exported as
  // string names so the main module can resolve them to actual function refs.
  const MENU_CONFIG = [
    {
      category: 'Globální',
      items: [
        {
          type: 'group',
          id: 'cc-hide-home-panels',
          storageKey: 'cc_hide_home_panels',
          defaultValue: true,
          requiresLogin: false,
          label: 'Domácí stránka - skryté panely',
          tooltip: '',
          infoIcon: {
            url: 'https://i.imgur.com/HkXrw6N.png',
            text: 'Skryje nechtěné sekce na domovské stránce.\n\n👉 Klikni pro ukázku',
          },
          eventName: 'cc-hidden-panels-updated',
          groupToggleId: 'cc-hide-panels-group-toggle',
          groupBodyId: 'cc-hide-panels-group-body',
          collapsedKey: 'cc_hide_panels_collapsed',
          callback: 'updateHidePanelsUI',
          childrenHtml: `
            <div class="cc-form-field">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
                    <span title="Zde se zobrazují skryté panely. Pro jejich obnovení klikněte na křížek.">Skryté sekce:</span>
                    <button type="button" id="cc-restore-all-panels-btn" class="cc-button cc-button-black cc-button-small" style="padding: 4px 8px; font-size: 10px;" title="Obnoví zobrazení všech skrytých panelů na domovské stránce.">Obnovit vše</button>
                </div>
                <div class="cc-pill-input-container cc-hide-panels-scroll" id="cc-hide-panels-pill-container" style="min-height: 36px; max-height: 120px; overflow-y: auto; align-items: flex-start; align-content: flex-start; cursor: default; background: #fdfdfd; scrollbar-width: thin;">
                    <div class="cc-pills" id="cc-hide-panels-pills"></div>
                    <span id="cc-hide-panels-empty" style="color: #999; font-size: 11px; padding: 2px 4px;">Žádné skryté panely...</span>
                </div>
            </div>`,
        },
        {
          type: 'toggle',
          id: 'cc-enable-clickable-header-boxes',
          storageKey: CLICKABLE_HEADER_BOXES_KEY,
          defaultValue: true,
          requiresLogin: false,
          label: 'Boxy s tlačítkem "VÍCE" jsou klikatelné celé',
          infoIcon: {
            url: 'https://i.imgur.com/sV23XS2.png',
            text: 'Boxy obsahující tlačítko "více" jsou klikatelné celé, ne jen "VÍCE".\n\n👉 Klikni pro ukázku',
          },
          tooltip: '',
          eventName: 'cc-clickable-header-boxes-toggled',
        },
        {
          type: 'toggle',
          id: 'cc-enable-self-reply',
          storageKey: SELF_REPLY_IN_DISCUSSIONS_KEY,
          defaultValue: true,
          requiresLogin: true,
          label: 'Tlačítko "Reagovat" u vlastních příspěvků v diskuzi',
          infoIcon: {
            url: 'https://i.imgur.com/1U1Zz5z.jpeg',
            text: 'Možnost reagovat na vlastní příspěvky v diskuzích.',
          },
          tooltip: '',
          eventName: 'cc-self-reply-toggled',
        },
        {
          type: 'group',
          id: 'cc-enable-link-icons',
          storageKey: LINK_ICONS_ENABLED_KEY,
          defaultValue: true,
          requiresLogin: false,
          label: 'Ikony u odkazů',
          tooltip: '',
          infoIcon: {
            url: 'https://i.imgur.com/rmx1u8n.jpeg',
            text: 'Přidá ikonky před vybrané odkazy v textu recenzí, komentářů a diskuzí. Podporuje odkazy na filmy, tvůrce, uživatele, YouTube, Steam, Wikipedii, AniDB a MyAnimeList.\n\n👉 Klikni pro ukázku',
          },
          eventName: LINK_ICONS_UPDATED_EVENT,
          groupToggleId: 'cc-link-icons-group-toggle',
          groupBodyId: 'cc-link-icons-group-body',
          collapsedKey: LINK_ICONS_SECTION_COLLAPSED_KEY,
          callback: 'updateLinkIconsUI',
          childrenItems: getLinkIconSettingsItems(),
          childrenHtml: `
            <div class="cc-form-field cc-sub-inline-field">
              <div class="cc-sub-inline-control">
                <label for="cc-link-icons-position" class="cc-sub-inline-label">Pozice ikon</label>
                <select id="cc-link-icons-position" class="cc-select-compact">
                  <option value="before">Před odkazem</option>
                  <option value="after">Za odkazem</option>
                </select>
              </div>
            </div>`,
        },
      ],
    },
    {
      category: 'Filmy a seriály',
      items: [
        {
          type: 'group',
          id: 'cc-show-ratings',
          storageKey: SHOW_RATINGS_KEY,
          defaultValue: true,
          requiresLogin: true,
          label: 'Ukázat hodnocení',
          tooltip: '',
          infoIcon: {
            url: 'https://i.imgur.com/X23QwLN.png',
            text: 'Zobrazí hodnocení (hvězdičky) filmů vedle jejich názvů.\n\n👉 Klikni pro ukázku',
          },
          eventName: 'cc-ratings-updated',
          groupToggleId: 'cc-show-ratings-group-toggle',
          groupBodyId: 'cc-show-ratings-group-body',
          collapsedKey: SHOW_RATINGS_SECTION_COLLAPSED_KEY,
          callback: 'updateShowRatingsUI',
          childrenItems: [
            {
              type: 'toggle',
              id: 'cc-show-ratings-in-reviews',
              storageKey: SHOW_RATINGS_IN_REVIEWS_KEY,
              defaultValue: true,
              label: 'Ukazovat v recenzích',
              tooltip: '',
              infoIcon: {
                url: 'https://i.imgur.com/Bmisvc5.jpeg',
                text: 'Zobrazí hodnocení (hvězdičky) i u odkazů uvnitř textů recenzí a komentářů.\n\n👉 Klikni pro ukázku',
              },
              eventName: 'cc-ratings-updated',
              callback: null,
            },
            {
              type: 'toggle',
              id: 'cc-show-ratings-in-foreign-reviews',
              storageKey: SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY,
              defaultValue: true,
              label: 'Ukazovat v recenzích cizího profilu',
              tooltip: '',
              infoIcon: {
                url: 'https://i.imgur.com/GB3H0JU.png',
                text: 'Zobrazí hodnocení (hvězdičky) i u odkazů uvnitř textů a recenzí cizího profilu.\n\n👉 Klikni pro ukázku',
              },
              eventName: 'cc-ratings-updated',
              callback: null,
            },
            {
              type: 'toggle',
              id: 'cc-show-ratings-in-diaries',
              storageKey: SHOW_RATINGS_IN_DIARIES_KEY,
              defaultValue: true,
              label: 'Ukazovat v deníčcích',
              tooltip: '',
              infoIcon: {
                url: 'https://i.imgur.com/QanJiLQ.png',
                text: 'Zobrazí hodnocení (hvězdičky) i u odkazů na filmy uvnitř textů deníčků.\n\n👉 Klikni pro ukázku',
              },
              eventName: 'cc-ratings-updated',
              callback: null,
            },
          ],
        },
        {
          type: 'toggle',
          id: 'cc-enable-gallery-image-links',
          storageKey: GALLERY_IMAGE_LINKS_ENABLED_KEY,
          defaultValue: true,
          requiresLogin: false,
          label: 'Zobrazovat formáty obrázků v galerii',
          tooltip: '',
          eventName: 'cc-gallery-image-links-toggled',
          infoIcon: {
            url: 'https://i.imgur.com/2KEixfW.png',
            text: 'U obrázků v galerii filmu zobrazí tlačítka pro otevření v různých velikostech.\n\n👉 Klikni pro ukázku',
          },
        },
        {
          type: 'toggle',
          id: 'cc-ratings-estimate',
          storageKey: RATINGS_ESTIMATE_KEY,
          defaultValue: true,
          requiresLogin: true,
          label: 'Vypočtení % při počtu hodnocení pod 10',
          tooltip: '',
          eventName: 'cc-ratings-estimate-toggled',
          infoIcon: {
            url: 'https://i.imgur.com/ySdMhXt.png',
            text: 'Dopočítá a zobrazí hodnocení i u filmů s méně než 10 hodnoceními.\n\n👉 Klikni pro ukázku',
          },
        },
        {
          type: 'toggle',
          id: 'cc-ratings-from-favorites',
          storageKey: RATINGS_FROM_FAVORITES_KEY,
          defaultValue: true,
          requiresLogin: true,
          label: 'Zobrazit hodnocení z průměru oblíbených',
          tooltip: '',
          eventName: 'cc-ratings-from-favorites-toggled',
          infoIcon: {
            url: 'https://i.imgur.com/99jlBJd.png',
            text: 'Přidá doplňující průměrné hodnocení vypočítané z oblíbených uživatelů.\n\n👉 Klikni pro ukázku',
          },
        },
        {
          type: 'toggle',
          id: 'cc-add-ratings-date',
          storageKey: ADD_RATINGS_DATE_KEY,
          defaultValue: true,
          requiresLogin: true,
          label: 'Zobrazit datum hodnocení',
          tooltip: '',
          eventName: 'cc-add-ratings-date-toggled',
          infoIcon: {
            url: 'https://i.imgur.com/B5evwT4.png',
            text: 'Zobrazí datum, kdy jste film hodnotili.\n\n👉 Klikni pro ukázku',
          },
        },
        {
          type: 'toggle',
          id: 'cc-revert-star-style',
          storageKey: REVERT_STAR_STYLE_KEY,
          defaultValue: true,
          requiresLogin: false,
          label: 'Vrátit styl hvězd v hodnocení',
          tooltip: '',
          eventName: 'cc-revert-star-style-toggled',
          infoIcon: {
            url: '',
            text: 'Zobrazení hvězdiček v hodnocení bez šedého pozadí.\n\n👉 Klikni pro ukázku',
          },
        },
        {
          type: 'group',
          id: 'cc-hide-selected-reviews',
          storageKey: HIDE_SELECTED_REVIEWS_KEY,
          defaultValue: false,
          requiresLogin: false,
          label: 'Skrýt recenze lidí',
          tooltip: '',
          infoIcon: {
            url: 'https://i.imgur.com/bk53rbW.png',
            text: 'Skrýt komentáře a recenze uživatelů, které nechcete číst.\n\n👉 Klikni pro ukázku',
          },
          eventName: 'cc-hide-selected-reviews-updated',
          groupToggleId: 'cc-hide-reviews-group-toggle',
          groupBodyId: 'cc-hide-reviews-group-body',
          collapsedKey: HIDE_REVIEWS_SECTION_COLLAPSED_KEY,
          callback: 'updateHideReviewsUI',
          childrenHtml: `
            <label class="cc-form-field">
                <span title="Zadejte uživatelské jméno a potvrďte klávesou Enter.">Jmena uživatelů (oddělte mezerou)</span>
                <div class="cc-pill-input-container" id="cc-hide-reviews-pill-container" title="Zadejte jméno uživatele a stiskněte Enter nebo Mezeru">
                    <div class="cc-pills" id="cc-hide-reviews-pills"></div>
                    <input type="text" data-bwignore="true" id="cc-hide-reviews-pill-input" placeholder="Přidat jméno..." />
                </div>
            </label>
            <div class="cc-sub-actions" style="margin-top: 6px;">
                <button type="button" id="cc-hide-reviews-apply" class="cc-button cc-button-red cc-button-small" title="Okamžitě uloží seznam a skryje vybrané recenze.">Uložit jména</button>
            </div>`,
        },
      ],
    },
    {
      category: 'Náhledy po najetí',
      items: [
        {
          type: 'group',
          id: 'cc-enable-hover-previews',
          storageKey: HOVER_PREVIEW_ENABLED_KEY,
          defaultValue: true,
          requiresLogin: false,
          label: 'Náhledy odkazů po najetí myší',
          tooltip: '',
          infoIcon: {
            url: 'https://i.imgur.com/HNJ2TiA.png',
            text: 'Po najetí myší zobrazí náhled u vybraných ČSFD i externích odkazů.\n\n👉 Klikni pro ukázku',
          },
          eventName: null,
          groupToggleId: 'cc-hover-preview-group-toggle',
          groupBodyId: 'cc-hover-preview-group-body',
          collapsedKey: HOVER_PREVIEW_SECTION_COLLAPSED_KEY,
          callback: 'updateHoverPreviewUI',
          childrenItems: getHoverPreviewSettingsItems(),
          childrenHtml: `
            <div class="cc-setting-row" style="margin-top: 2px;" title="Určuje, jak dlouho si prohlížeč bude pamatovat stažené náhledy. Delší čas šetří data a zrychluje web.">
                <span class="cc-setting-label cc-grow">Délka mezipaměti (Cache)</span>
                <select id="cc-hover-preview-cache-hours" class="cc-select-compact">
                    <option value="1">1 hodina</option>
                    <option value="24">24 hodin</option>
                    <option value="168">7 dní</option>
                    <option value="720">1 měsíc</option>
                </select>
            </div>`,
        },
      ],
    },
    {
      category: 'Herci a tvůrci',
      items: [
        {
          type: 'toggle',
          id: 'cc-show-all-creator-tabs',
          storageKey: SHOW_ALL_CREATOR_TABS_KEY,
          defaultValue: true,
          requiresLogin: false,
          label: 'Zobrazit všechny záložky tvůrce',
          tooltip: '',
          eventName: 'cc-show-all-creator-tabs-toggled',
          infoIcon: {
            url: 'https://i.imgur.com/4VxTL3j.png',
            text: 'Na profilu herce automaticky zobrazí všechny záložky (Videa, Galerie, Diskuze) vedle sebe bez klikání na "další 🔻".\n\n👉 Klikni pro ukázku',
          },
        },
      ],
    },
  ];

  let infoToastTimeoutId;
  const MANAGED_LOCAL_STORAGE_PREFIXES = ['cc_', 'CSFD-Compare'];

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  /** Alias for getFeatureState — reads a boolean from localStorage. */
  const getBoolSetting = getFeatureState;

  function isUserLoggedIn() {
    return Boolean(getProfileLinkElement());
  }

  function getCurrentUserSlug() {
    return extractUserSlug(getProfileLinkElement()?.getAttribute('href'));
  }

  function getMostFrequentUserSlug(records) {
    const counts = new Map();
    for (const record of records) {
      if (!record?.userSlug || !Number.isFinite(record?.movieId)) continue;
      counts.set(record.userSlug, (counts.get(record.userSlug) || 0) + 1);
    }

    let bestSlug,
      bestCount = -1;
    for (const [slug, count] of counts.entries()) {
      if (count > bestCount) {
        bestSlug = slug;
        bestCount = count;
      }
    }
    return bestSlug;
  }

  function findMenuConfigItem(itemId) {
    for (const category of MENU_CONFIG) {
      const match = category.items.find((item) => item.id === itemId);
      if (match) return match;
    }

    return null;
  }

  function showSettingsInfoToast(message) {
    let toastEl = document.querySelector('#cc-settings-info-toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'cc-settings-info-toast';
      Object.assign(toastEl.style, {
        position: 'fixed',
        left: '50%',
        top: '70px',
        transform: 'translateX(-50%)',
        zIndex: '10020',
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'rgba(40, 40, 40, 0.94)',
        color: '#fff',
        fontSize: '12px',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.28)',
        display: 'none',
      });
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    toastEl.style.display = 'block';

    clearTimeout(infoToastTimeoutId);
    infoToastTimeoutId = window.setTimeout(() => {
      toastEl.style.display = 'none';
    }, 1800);
  }

  function getManagedLocalStorageEntries() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key === SETTINGSNAME ||
        MANAGED_LOCAL_STORAGE_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix.toLowerCase()))
      ) {
        entries.push({ key, value: localStorage.getItem(key) ?? '' });
      }
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }

  function formatLocalStorageValue(value, maxLength = 120) {
    const normalized = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
  }

  function isHoverPreviewCacheKey(key) {
    return String(key || '')
      .toLowerCase()
      .startsWith(HOVER_PREVIEW_CACHE_GROUP_PREFIX.toLowerCase());
  }

  function getLocalStorageValueDetailRows(value) {
    const rawValue = String(value ?? '');

    try {
      const parsed = JSON.parse(rawValue);
      const rows = buildStructuredDetailItems(parsed);
      if (rows.length > 0) return rows;
    } catch (error) {}

    return [{ key: 'value', value: rawValue }];
  }

  function buildManagedLocalStorageRows(entries) {
    const rows = [];
    let hoverPreviewGroupAdded = false;
    const hoverPreviewEntries = entries.filter((entry) => isHoverPreviewCacheKey(entry.key));

    entries.forEach((entry) => {
      if (isHoverPreviewCacheKey(entry.key)) {
        if (!hoverPreviewGroupAdded) {
          rows.push({
            type: 'group',
            id: 'hover-preview-cache',
            label: 'cc_hover_cache* cache',
            entries: hoverPreviewEntries,
          });
          hoverPreviewGroupAdded = true;
        }
        return;
      }

      rows.push({ type: 'entry', entry, grouped: false });
    });

    return rows;
  }

  // ==========================================
  // IMAGE MODAL LOGIC
  // ==========================================
  function getOrCreateImageModal() {
    let overlay = document.getElementById('cc-image-preview-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'cc-image-preview-overlay';
    overlay.className = 'cc-version-info-overlay';

    overlay.innerHTML = `
    <div class="cc-version-info-modal" style="width: fit-content; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="cc-version-info-head">
        <h3 id="cc-image-modal-title">Ukázka funkce</h3>
        <button type="button" class="cc-version-info-close" id="cc-image-modal-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-version-info-body" style="padding: 0; background: #242424; overflow: auto;">
        <img id="cc-image-modal-img" src="" alt="Ukázka" style="display: block; margin: 0 auto; max-width: none; max-height: none;" />
      </div>
    </div>
  `;

    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => {
        overlay.querySelector('#cc-image-modal-img').src = '';
      }, 200);
    };

    overlay.querySelector('#cc-image-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    return overlay;
  }

  function getOrCreateSettingsTooltip() {
    let tooltip = document.getElementById('cc-settings-info-tooltip');
    if (tooltip) return tooltip;

    tooltip = document.createElement('div');
    tooltip.id = 'cc-settings-info-tooltip';
    tooltip.className = 'cc-settings-info-tooltip';
    tooltip.innerHTML = '<div class="cc-settings-info-tooltip-body"></div>';
    document.body.appendChild(tooltip);

    return tooltip;
  }

  function showSettingsTooltip(anchor, text) {
    if (!(anchor instanceof Element) || !text) return;

    const tooltip = getOrCreateSettingsTooltip();
    const tooltipBody = tooltip.querySelector('.cc-settings-info-tooltip-body');
    if (!tooltipBody) return;

    tooltipBody.textContent = text;
    tooltip.classList.add('is-open');
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportPadding = 8;
    const preferredTop = anchorRect.top - tooltipRect.height - 10;
    const top = Math.max(viewportPadding, preferredTop);
    const preferredLeft = anchorRect.right - tooltipRect.width - 5;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding);
    const left = Math.min(maxLeft, Math.max(viewportPadding, preferredLeft));
    const anchorCenter = anchorRect.left + anchorRect.width / 2;
    const arrowLeft = Math.min(tooltipRect.width - 14, Math.max(14, anchorCenter - left));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.setProperty('--cc-settings-tooltip-arrow-left', `${arrowLeft}px`);
  }

  function hideSettingsTooltip() {
    const tooltip = document.getElementById('cc-settings-info-tooltip');
    tooltip?.classList.remove('is-open');
  }

  // ==========================================
  // MAIN INITIALIZATION
  // ==========================================
  async function addSettingsButton() {

    // 1. FIREFOX SHIELD: Wait for the HTML body and header to actually exist!
    if (document.readyState === 'loading') {
      await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve));
    }

    const loggedIn = isUserLoggedIn();

    const settingsButton = document.createElement('li');
    settingsButton.className = 'cc-menu-item';
    settingsButton.innerHTML = htmlContent;

    // Disable main actions if the user is not logged in
    if (!loggedIn) {
      // Buttons & Cloud Icon
      ['#cc-load-ratings-btn', '#cc-load-computed-btn', '#cc-sync-cloud-btn'].forEach((id) => {
        const btn = settingsButton.querySelector(id);
        if (btn) {
          btn.disabled = true;
          btn.title += ' (Vyžaduje přihlášení)';
        }
      });

      // Badges
      ['#cc-badge-red', '#cc-badge-black'].forEach((id) => {
        const badge = settingsButton.querySelector(id);
        if (badge) {
          badge.classList.add('is-disabled');
          badge.title += ' (Vyžaduje přihlášení)';
          badge.removeAttribute('tabindex'); // Prevent keyboard focus
          badge.removeAttribute('role');
        }
      });
    }

    const dropdown = settingsButton.querySelector('.dropdown-content');
    const queryMenu = (selector) => dropdown?.querySelector(selector) || settingsButton.querySelector(selector);
    if (dropdown) {
      const blockEvent = (e) => e.stopPropagation();
      ['pointermove', 'mousemove', 'mouseover', 'mouseenter'].forEach((evt) => {
        dropdown.addEventListener(evt, blockEvent, true);
      });
    }

    const closeSettingsShortcutMenu = () => {
      const controller = settingsButton.__ccSettingsMenuController;
      if (controller?.isPinnedOpen()) {
        controller.closePinned();
        return;
      }

      settingsButton.classList.remove('hovered', 'active');
      document.body.classList.remove('cc-menu-open');
    };

    const toggleSettingsShortcutMenu = () => {
      const controller = settingsButton.__ccSettingsMenuController;
      if (controller?.togglePinned) {
        controller.togglePinned();
        return;
      }

      const opened = !settingsButton.classList.contains('active');
      settingsButton.classList.toggle('hovered', opened);
      settingsButton.classList.toggle('active', opened);
      document.body.classList.toggle('cc-menu-open', opened);
    };

    queryMenu('#cc-settings-pinned-close-btn')?.addEventListener('click', () => {
      closeSettingsShortcutMenu();
    });

    const headerBar = document.querySelector('.header-bar');
    if (headerBar) {
      const searchItem = headerBar.querySelector('li.item-search');
      const languageItem = headerBar.querySelector('li.user-language-switch');
      if (searchItem) searchItem.after(settingsButton);
      else if (languageItem) languageItem.before(settingsButton);
      else headerBar.prepend(settingsButton);
    }

    const updateHoverPreviewUI = () => {
      const enabled = getBoolSetting(HOVER_PREVIEW_ENABLED_KEY, true);
      const groupConfig = findMenuConfigItem('cc-enable-hover-previews');
      const body = queryMenu('#cc-hover-preview-group-body');
      for (const child of groupConfig?.childrenItems || []) {
        const childToggle = queryMenu(`#${child.id}`);
        if (childToggle) childToggle.disabled = !enabled;
      }
      if (body) body.classList.toggle('is-disabled', !enabled);

      const providerStates = Object.fromEntries(
        (groupConfig?.childrenItems || []).map((child) => [
          child.id,
          getBoolSetting(child.storageKey, child.defaultValue ?? true),
        ]),
      );

      window.dispatchEvent(
        new CustomEvent(HOVER_PREVIEW_SETTINGS_CHANGED_EVENT, {
          detail: {
            enabled,
            providerStates,
          },
        }),
      );
    };

    const updateHideReviewsUI = () => {
      const enabled = getBoolSetting(HIDE_SELECTED_REVIEWS_KEY, false);
      const pillInput = queryMenu('#cc-hide-reviews-pill-input');
      const hideApplyBtn = queryMenu('#cc-hide-reviews-apply');
      const pillContainer = queryMenu('#cc-hide-reviews-pill-container');
      const body = queryMenu('#cc-hide-reviews-group-body');

      if (pillInput) pillInput.disabled = !enabled;
      if (hideApplyBtn) hideApplyBtn.disabled = !enabled;
      if (pillContainer) pillContainer.classList.toggle('is-disabled', !enabled);
      if (body) body.classList.toggle('is-disabled', !enabled);
    };

    const updateHidePanelsUI = () => {
      const enabled = getBoolSetting('cc_hide_home_panels', true);
      const body = queryMenu('#cc-hide-panels-group-body');
      if (body) body.classList.toggle('is-disabled', !enabled);
    };

    const updateShowRatingsUI = () => {
      const enabled = getBoolSetting(SHOW_RATINGS_KEY, true);
      const childToggle = queryMenu('#cc-show-ratings-in-reviews');
      const foreignChildToggle = queryMenu('#cc-show-ratings-in-foreign-reviews');
      const diariesChildToggle = queryMenu('#cc-show-ratings-in-diaries');
      const body = queryMenu('#cc-show-ratings-group-body');

      if (childToggle) childToggle.disabled = !enabled;
      if (foreignChildToggle) foreignChildToggle.disabled = !enabled;
      if (diariesChildToggle) diariesChildToggle.disabled = !enabled;
      if (body) body.classList.toggle('is-disabled', !enabled);
    };

    const updateLinkIconsUI = () => {
      const enabled = getBoolSetting(LINK_ICONS_ENABLED_KEY, true);
      const position = localStorage.getItem(LINK_ICONS_POSITION_KEY) === 'after' ? 'after' : 'before';
      const groupConfig = findMenuConfigItem('cc-enable-link-icons');
      const positionSelect = queryMenu('#cc-link-icons-position');
      const body = queryMenu('#cc-link-icons-group-body');

      for (const child of groupConfig?.childrenItems || []) {
        const childToggle = queryMenu(`#${child.id}`);
        if (childToggle) childToggle.disabled = !enabled;
      }
      if (positionSelect) positionSelect.disabled = !enabled;
      if (body) {
        body.classList.toggle('is-disabled', !enabled);
        body.classList.toggle('cc-link-icons-preview-before', position === 'before');
        body.classList.toggle('cc-link-icons-preview-after', position === 'after');
      }
    };

    const syncSelectControlsFromStorage = () => {
      if (cacheSelect) {
        cacheSelect.value = localStorage.getItem(HOVER_PREVIEW_CACHE_HOURS_KEY) || '24';
      }

      if (linkIconsPositionSelect) {
        linkIconsPositionSelect.value = localStorage.getItem(LINK_ICONS_POSITION_KEY) || 'before';
      }
    };

    // Resolve callback name strings (from settings-config) to the actual functions defined above.
    const CALLBACK_MAP = {
      updateHidePanelsUI,
      updateShowRatingsUI,
      updateLinkIconsUI,
      updateHoverPreviewUI,
      updateHideReviewsUI,
    };

    // This allows us to keep the MENU_CONFIG clean and not have to import functions into it, while still supporting callbacks for toggles/groups.
    const resolveCallbacksInConfig = (config) => {
      config.forEach((cat) => {
        cat.items.forEach((item) => {
          if (typeof item.callback === 'string' && CALLBACK_MAP[item.callback]) {
            item.callback = CALLBACK_MAP[item.callback];
          }
          if (item.childrenItems) {
            item.childrenItems.forEach((child) => {
              if (typeof child.callback === 'string' && CALLBACK_MAP[child.callback]) {
                child.callback = CALLBACK_MAP[child.callback];
              }
            });
          }
        });
      });
    };

    resolveCallbacksInConfig(MENU_CONFIG);

    const renderLeadingIconHtml = (item) => {
      if (!item.leadingIconSvg) return '';

      return `
      <span class="cc-setting-leading-icon" aria-hidden="true">
        ${item.leadingIconSvg.trim()}
      </span>`;
    };

    const buildToggleHtml = (item) => {
      const isDisabled = item.requiresLogin && !loggedIn;
      const wrapperClass = isDisabled ? 'cc-requires-login' : '';
      const titleSuffix = isDisabled ? '\n(Vyžaduje přihlášení)' : '';
      const disabledAttr = isDisabled ? 'disabled' : '';

      return `
      <div class="cc-setting-row ${wrapperClass}" title="${escapeHtml((item.tooltip || '') + titleSuffix)}">
          <label class="cc-switch">
              <input type="checkbox" id="${item.id}" ${disabledAttr} />
              <span class="cc-switch-bg"></span>
          </label>
          <span class="cc-setting-label ${item.infoIcon ? 'cc-grow' : ''}">
            <span class="cc-setting-label-content ${item.leadingIconSvg ? 'cc-setting-label-content-with-leading-icon' : ''}">
              ${renderLeadingIconHtml(item)}
              <span>${escapeHtml(item.label)}</span>
            </span>
          </span>
          ${
            item.infoIcon
              ? `
              <div class="cc-setting-icons">
                  <div class="cc-info-icon" aria-label="${escapeHtml(item.infoIcon.text)}" data-image-url="${escapeHtml(item.infoIcon.url)}">
                      <svg width="14" height="14"><use href="#cc-icon-info"></use></svg>
                  </div>
              </div>`
              : ''
          }
      </div>`;
    };

    const buildGroupHtml = (item) => {
      const isDisabled = item.requiresLogin && !loggedIn;
      const wrapperClass = isDisabled ? 'cc-requires-login' : '';
      const titleSuffix = isDisabled ? '\n(Vyžaduje přihlášení)' : '';
      const disabledAttr = isDisabled ? 'disabled' : '';

      return `
      <div class="cc-setting-group ${wrapperClass}" id="${item.id}-group" style="margin-top: 2px;">
          <div class="cc-setting-row" title="${escapeHtml((item.tooltip || '') + titleSuffix)}">
              <label class="cc-switch">
                  <input type="checkbox" id="${item.id}" ${disabledAttr} />
                  <span class="cc-switch-bg"></span>
              </label>
              <div class="cc-setting-collapse-trigger" id="${item.groupToggleId}" aria-expanded="false">
                  <span class="cc-setting-label cc-grow">${escapeHtml(item.label)}</span>
                  ${
                    item.infoIcon
                      ? `
                      <div class="cc-setting-icons" style="margin-right: 6px;">
                          <div class="cc-info-icon" aria-label="${escapeHtml(item.infoIcon.text)}" data-image-url="${escapeHtml(item.infoIcon.url)}">
                              <svg width="14" height="14"><use href="#cc-icon-info"></use></svg>
                          </div>
                      </div>`
                      : ''
                  }
                  <svg class="cc-chevron" width="14" height="14"><use href="#cc-icon-chevron"></use></svg>
              </div>
          </div>
          <div class="cc-setting-sub" id="${item.groupBodyId}" hidden>
              ${(item.childrenItems || []).map(buildToggleHtml).join('')}
              ${item.childrenHtml || ''}
          </div>
      </div>`;
    };

    const dynamicContainer = queryMenu('#cc-dynamic-settings-container');
    if (dynamicContainer) {
      let generatedHtml = '';
      MENU_CONFIG.forEach((cat, idx) => {
        generatedHtml += `<h3 class="cc-category-title ${idx === 0 ? 'cc-category-first' : ''}">${escapeHtml(cat.category)}</h3>`;
        generatedHtml += `<div class="cc-config-list">`;
        cat.items.forEach((item) => {
          if (item.type === 'toggle') generatedHtml += buildToggleHtml(item);
          else if (item.type === 'group') generatedHtml += buildGroupHtml(item);
        });
        generatedHtml += `</div>`;
      });
      dynamicContainer.innerHTML = generatedHtml;
    }

    const togglesTracker = [];
    function bindToggle(selector, storageKey, defaultValue, eventName, toastOn, toastOff, callback = null) {
      const element = queryMenu(selector);
      if (!element) return;

      element.checked = getBoolSetting(storageKey, defaultValue);
      togglesTracker.push({ element, storageKey, defaultValue });

      element.addEventListener('change', () => {
        localStorage.setItem(storageKey, String(element.checked));
        // skipSync: true so redraw triggers won't mistakenly try to push cloud updates constantly
        if (eventName)
          window.dispatchEvent(
            new CustomEvent(eventName, {
              detail: { enabled: element.checked, skipSync: true },
            }),
          );
        if (callback) callback();
      });
    }

    function bindGroupCollapse(groupId, toggleId, bodyId, storageKey) {
      const group = queryMenu(`#${groupId}`);
      const toggle = queryMenu(`#${toggleId}`);
      const body = queryMenu(`#${bodyId}`);
      if (!toggle || !body) return;

      const syncExpandedHeight = () => {
        const wasHidden = body.hidden;
        if (wasHidden) body.hidden = false;
        body.style.setProperty('--cc-setting-sub-max-height', `${body.scrollHeight}px`);
        if (wasHidden) body.hidden = true;
      };

      const setCollapsed = (collapsed) => {
        if (!collapsed) {
          syncExpandedHeight();
        }
        if (group) group.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        body.hidden = collapsed;
        localStorage.setItem(storageKey, String(collapsed));
      };

      setCollapsed(getBoolSetting(storageKey, true));
      toggle.addEventListener('click', (e) => {
        // If user click on an info icon, we don't want to toggle the group collapse
        if (e.target.closest('.cc-setting-icons')) return;

        const currently = group?.classList.contains('is-collapsed');
        setCollapsed(!currently);
      });
    }

    MENU_CONFIG.forEach((cat) => {
      cat.items.forEach((item) => {
        if (item.type === 'toggle' || item.type === 'group') {
          bindToggle(`#${item.id}`, item.storageKey, item.defaultValue, item.eventName, null, null, item.callback);
        }
        if (item.type === 'group') {
          bindGroupCollapse(`${item.id}-group`, item.groupToggleId, item.groupBodyId, item.collapsedKey);
          (item.childrenItems || []).forEach((child) => {
            bindToggle(`#${child.id}`, child.storageKey, child.defaultValue, child.eventName, null, null, child.callback);
          });
        }
      });
    });

    initializeVersionUi(settingsButton).catch(() => undefined);
    initializeRatingsLoader(settingsButton);
    initializeRatingsSync(settingsButton, getCurrentUserSlug);

    const cacheSelect = queryMenu('#cc-hover-preview-cache-hours');
    if (cacheSelect) {
      cacheSelect.value = localStorage.getItem(HOVER_PREVIEW_CACHE_HOURS_KEY) || '24';
      cacheSelect.addEventListener('change', () => {
        localStorage.setItem(HOVER_PREVIEW_CACHE_HOURS_KEY, cacheSelect.value);
        showSettingsInfoToast('Délka mezipaměti uložena.');
      });
    }

    const linkIconsPositionSelect = queryMenu('#cc-link-icons-position');
    if (linkIconsPositionSelect) {
      linkIconsPositionSelect.value = localStorage.getItem(LINK_ICONS_POSITION_KEY) || 'before';
      updateLinkIconsUI();
      linkIconsPositionSelect.addEventListener('change', () => {
        localStorage.setItem(LINK_ICONS_POSITION_KEY, linkIconsPositionSelect.value);
        updateLinkIconsUI();
        window.dispatchEvent(
          new CustomEvent(LINK_ICONS_UPDATED_EVENT, {
            detail: { position: linkIconsPositionSelect.value, skipSync: true },
          }),
        );
      });
    }

    const pillInput = queryMenu('#cc-hide-reviews-pill-input');
    const pillsWrapper = queryMenu('#cc-hide-reviews-pills');
    const pillContainer = queryMenu('#cc-hide-reviews-pill-container');
    const hideApplyBtn = queryMenu('#cc-hide-reviews-apply');

    let currentPills = [];
    try {
      const saved = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY);
      if (saved) currentPills = JSON.parse(saved);
    } catch (e) {}

    const renderPills = () => {
      if (!pillsWrapper) return;
      pillsWrapper.innerHTML = '';
      currentPills.forEach((pill, index) => {
        const pillEl = document.createElement('span');
        pillEl.className = 'cc-pill';
        pillEl.textContent = pill;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'cc-pill-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          currentPills.splice(index, 1);
          renderPills();
        };

        pillEl.appendChild(removeBtn);
        pillsWrapper.appendChild(pillEl);
      });
    };

    const addPill = (value) => {
      const trimmed = value.trim();
      if (trimmed && !currentPills.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
        currentPills.push(trimmed);
        renderPills();
      }
      if (pillInput) pillInput.value = '';
    };

    if (pillInput) {
      pillInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
          e.preventDefault();
          addPill(pillInput.value);
        } else if (e.key === 'Backspace' && pillInput.value === '' && currentPills.length > 0) {
          currentPills.pop();
          renderPills();
        }
      });
      pillInput.addEventListener('blur', () => addPill(pillInput.value));
    }

    if (pillContainer) {
      pillContainer.addEventListener('click', () => {
        if (!pillContainer.classList.contains('is-disabled')) pillInput?.focus();
      });
    }

    if (hideApplyBtn) {
      hideApplyBtn.addEventListener('click', () => {
        if (pillInput && pillInput.value.trim()) addPill(pillInput.value);
        localStorage.setItem(HIDE_SELECTED_REVIEWS_LIST_KEY, JSON.stringify(currentPills));
        window.dispatchEvent(new CustomEvent('cc-hide-selected-reviews-updated'));
        showSettingsInfoToast('Seznam skrytých uživatelů byl uložen.');
      });
    }

    renderPills();
    updateHoverPreviewUI();
    updateHideReviewsUI();
    updateHidePanelsUI();
    updateLinkIconsUI();
    updateShowRatingsUI();

    let currentPanelPills = [];
    try {
      const savedPanels = localStorage.getItem('cc_hidden_panels_list');
      if (savedPanels) currentPanelPills = JSON.parse(savedPanels);
    } catch (e) {}

    const renderPanelPills = () => {
      const wrapper = queryMenu('#cc-hide-panels-pills');
      const emptyText = queryMenu('#cc-hide-panels-empty');
      if (!wrapper || !emptyText) return;

      wrapper.innerHTML = '';

      if (currentPanelPills.length === 0) {
        emptyText.style.display = 'block';
      } else {
        emptyText.style.display = 'none';
        currentPanelPills.forEach((pill, index) => {
          const pillEl = document.createElement('span');
          pillEl.className = 'cc-pill';
          pillEl.textContent = pill;

          const removeBtn = document.createElement('span');
          removeBtn.className = 'cc-pill-remove';
          removeBtn.innerHTML = '&times;';
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            currentPanelPills.splice(index, 1);
            localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentPanelPills));
            renderPanelPills();
            window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
          };

          pillEl.appendChild(removeBtn);
          wrapper.appendChild(pillEl);
        });
      }
    };

    renderPanelPills();
    window.addEventListener('cc-hidden-panels-updated', () => {
      try {
        currentPanelPills = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
      } catch (e) {}
      renderPanelPills();
    });

    const restoreAllPanelsBtn = queryMenu('#cc-restore-all-panels-btn');
    if (restoreAllPanelsBtn) {
      restoreAllPanelsBtn.addEventListener('click', () => {
        if (currentPanelPills.length > 0) {
          currentPanelPills = [];
          localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentPanelPills));
          renderPanelPills();
          window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
          showSettingsInfoToast('Všechny panely byly obnoveny.');
        } else {
          showSettingsInfoToast('Žádné panely ke smazání.');
        }
      });
    }

    const devBtn = queryMenu('#cc-maint-dev-btn');

    const updateDevState = () => {
      // 1. Get the current state
      const isDev = localStorage.getItem('cc_dev_mode') === 'true';

      // 2. Update the button text (safe because devBtn is in memory)
      if (devBtn) {
        devBtn.textContent = isDev ? 'DEV: ON' : 'DEV: OFF';
      }

      // 3. Firefox safety check: Wait for the body to exist before touching it
      if (!document.body) {
        window.addEventListener('DOMContentLoaded', updateDevState, {
          once: true,
        });
        return;
      }

      // 4. Update the body class
      document.body.classList.toggle('cc-dev-mode-active', isDev);
    };

    updateDevState();

    if (devBtn) {
      devBtn.addEventListener('click', () => {
        const isDev = localStorage.getItem('cc_dev_mode') === 'true';
        localStorage.setItem('cc_dev_mode', String(!isDev));
        updateDevState();
        showSettingsInfoToast(`Vývojářský režim: ${!isDev ? 'ZAPNUT' : 'VYPNUT'}`);

        // If we just turned DEV off, automatically turn off the Hover lock
        if (isDev) {
          // Find the checkbox (either the main one or the floating fallback)
          const hoverCheckbox = document.querySelector(
            '#cc-debug-hover-checkbox, .fancy-alert-controls input[type="checkbox"]',
          );

          // If it exists and is checked, natively click it to trigger its own 'change' logic
          if (hoverCheckbox && hoverCheckbox.checked) {
            hoverCheckbox.click();
          }
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return;
      if (event.repeat) return;

      const controller = settingsButton.__ccSettingsMenuController;
      const isPinnedOpen = controller?.isPinnedOpen?.() === true;

      const activeTag = document.activeElement?.tagName;
      const isTypingContext =
        document.activeElement?.isContentEditable ||
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT';

      const key = (event.key || '').toLowerCase();
      if (key !== 'c') return;

      if (isTypingContext && !isPinnedOpen) return;

      event.preventDefault();
      toggleSettingsShortcutMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;

      const controller = settingsButton.__ccSettingsMenuController;
      if (!controller?.isPinnedOpen?.()) return;

      closeSettingsShortcutMenu();
    });

    // --------------------------------------------------------
    // Homepage Panels Visibility Logic
    // --------------------------------------------------------
    const updatePanelsFeatureState = () => {
      // Evaluate the setting. (Default is true, so we check if it's explicitly 'false')
      const isEnabled = localStorage.getItem('cc_hide_home_panels') !== 'false';

      // Wait for body to exist before toggling the class (Firefox safety)
      if (!document.body) {
        window.addEventListener('DOMContentLoaded', updatePanelsFeatureState, { once: true });
        return;
      }

      document.body.classList.toggle('cc-panels-feature-enabled', isEnabled);
    };

    // 1. Run immediately on load
    updatePanelsFeatureState();

    // 2. Listen for changes from the settings menu toggle
    window.addEventListener('cc-hidden-panels-updated', updatePanelsFeatureState);

    const syncControlsFromStorage = () => {
      togglesTracker.forEach((t) => (t.element.checked = getBoolSetting(t.storageKey, t.defaultValue)));
      syncSelectControlsFromStorage();
      updateHoverPreviewUI();
      updateHideReviewsUI();
      updateHidePanelsUI();
      updateLinkIconsUI();
      updateShowRatingsUI();
      updateDevState();
    };

    settingsButton.querySelector('#cc-maint-reset-btn')?.addEventListener('click', () => {
      if (!confirm('Opravdu chcete vyresetovat všechna nastavení (tlačítka a skryté uživatele) do výchozího stavu?'))
        return;

      togglesTracker.forEach((t) => localStorage.removeItem(t.storageKey));

      localStorage.removeItem(HOVER_PREVIEW_CACHE_HOURS_KEY);
      localStorage.removeItem(HOVER_PREVIEW_SECTION_COLLAPSED_KEY);
      localStorage.removeItem(HIDE_REVIEWS_SECTION_COLLAPSED_KEY);
      localStorage.removeItem(HIDE_SELECTED_REVIEWS_LIST_KEY);
      localStorage.removeItem(LINK_ICONS_POSITION_KEY);
      localStorage.removeItem(SHOW_RATINGS_IN_DIARIES_KEY);
      localStorage.removeItem(SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY);
      localStorage.removeItem(SHOW_RATINGS_IN_REVIEWS_KEY);
      localStorage.removeItem(SHOW_RATINGS_KEY);
      localStorage.removeItem(SHOW_RATINGS_SECTION_COLLAPSED_KEY);
      localStorage.removeItem('cc_hide_home_panels');
      localStorage.removeItem('cc_hidden_panels_list');
      localStorage.removeItem('cc_hide_panels_collapsed');
      localStorage.removeItem('cc_dev_mode');
      localStorage.removeItem('cc_creator_preview_cache_hours');
      localStorage.removeItem('cc_creator_preview_enabled');
      localStorage.removeItem('cc_creator_preview_show_birth');
      localStorage.removeItem('cc_creator_preview_show_photo_from');
      localStorage.removeItem('cc_creator_preview_section_collapsed');

      currentPills = [];
      renderPills();

      currentPanelPills = [];
      renderPanelPills();

      syncControlsFromStorage();

      window.dispatchEvent(
        new CustomEvent(LINK_ICONS_UPDATED_EVENT, {
          detail: { position: localStorage.getItem(LINK_ICONS_POSITION_KEY) || 'before', skipSync: true },
        }),
      );

      window.dispatchEvent(
        new CustomEvent('cc-gallery-image-links-toggled', {
          detail: { enabled: true },
        }),
      );
      window.dispatchEvent(new CustomEvent('cc-hide-selected-reviews-updated'));
      window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
      window.dispatchEvent(new CustomEvent('cc-ratings-updated', { detail: { skipSync: true } }));
      showSettingsInfoToast('Všechna nastavení byla vrácena na výchozí hodnoty.');
    });

    const dbDeleteBtn = settingsButton.querySelector('#cc-maint-clear-db-btn');
    if (dbDeleteBtn) {
      dbDeleteBtn.addEventListener('click', async () => {
        const originalText = dbDeleteBtn.textContent;

        dbDeleteBtn.textContent = 'Mažu...';
        dbDeleteBtn.style.opacity = '0.5';
        dbDeleteBtn.style.pointerEvents = 'none';

        try {
          await deleteAllDataFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
          invalidateRatingsModalCache();
          window.dispatchEvent(
            new CustomEvent('cc-ratings-updated', {
              detail: { skipSync: true },
            }),
          );
          showSettingsInfoToast('Uložená hodnocení byla smazána.');
        } catch (error) {
          console.error('[CC] Failed to clear ratings store:', error);
          showSettingsInfoToast('Smazání uložených hodnocení selhalo.');
        } finally {
          dbDeleteBtn.textContent = originalText;
          dbDeleteBtn.style.opacity = '';
          dbDeleteBtn.style.pointerEvents = '';
        }
      });
    }

    let localStorageModal;
    const ensureLocalStorageModal = () => {
      if (localStorageModal) return localStorageModal;

      const detailsController = createDetailsModalController({
        overlayClass: 'cc-generic-detail-overlay',
        defaultTitle: 'Detail',
        titleId: 'cc-generic-detail-title',
      });
      const modalState = {
        collapsedGroups: new Set(['hover-preview-cache']),
      };

      const overlay = document.createElement('div');
      overlay.className = 'cc-lc-modal-overlay';
      overlay.hidden = true;
      overlay.innerHTML = `
      <div class="cc-lc-modal" role="dialog" aria-modal="true" aria-label="Správa LocalStorage">
        <div class="cc-lc-modal-head">
          <h3>Správa LocalStorage</h3>
          <button type="button" class="cc-lc-modal-close" aria-label="Zavřít">×</button>
        </div>
        <div class="cc-lc-modal-help">Klíče používané CSFD-Compare (cc_*, CSFD-Compare*).</div>
        <div class="cc-lc-modal-body">
          <table class="cc-lc-table">
            <thead><tr><th>Klíč</th><th>Hodnota</th><th>Akce</th></tr></thead>
            <tbody id="cc-lc-table-body"></tbody>
          </table>
        </div>
        <div class="cc-lc-modal-actions">
          <button type="button" class="cc-button cc-button-red cc-button-small" id="cc-lc-delete-all-btn">Smazat vše</button>
          <button type="button" class="cc-button cc-button-black cc-button-small" id="cc-lc-close-btn">Zavřít</button>
        </div>
      </div>`;

      const closeModal = () => {
        overlay.classList.remove('is-open');
        overlay.hidden = true;
      };

      const syncAfterLocalStorageChange = () => {
        syncControlsFromStorage();
        window.dispatchEvent(
          new CustomEvent('cc-gallery-image-links-toggled', {
            detail: {
              enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true),
            },
          }),
        );
      };

      const buildEntryRowHtml = (key, value, options = {}) => {
        const isGroupedChild = options.grouped === true;
        const rowClass = isGroupedChild ? 'cc-lc-entry-row is-group-child' : 'cc-lc-entry-row';
        const keyClass = isGroupedChild ? 'cc-lc-key cc-lc-key-child' : 'cc-lc-key';

        return `
        <tr class="${rowClass}">
          <td class="${keyClass}" title="${escapeHtml(key)}">${escapeHtml(key)}</td>
          <td class="cc-lc-value" title="${escapeHtml(String(value))}">
            <div class="cc-lc-value-content">
              <span class="cc-lc-value-text">${escapeHtml(formatLocalStorageValue(value))}</span>
              <button type="button" class="cc-lc-value-info" data-key="${escapeHtml(key)}" aria-label="Zobrazit detail hodnoty">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" />
                  <path d="M12 11.5V15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <circle cx="12" cy="8.2" r="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </td>
          <td class="cc-lc-action">
             <button type="button" class="cc-button cc-button-red cc-button-small cc-lc-delete-one" data-key="${escapeHtml(key)}">Smazat</button>
          </td>
        </tr>`;
      };

      const refreshTable = () => {
        const tableBody = overlay.querySelector('#cc-lc-table-body');
        if (!tableBody) return;
        const entries = getManagedLocalStorageEntries();
        const rows = buildManagedLocalStorageRows(entries);

        if (!rows.length) {
          tableBody.innerHTML = '<tr><td colspan="3" class="cc-lc-table-empty">Žádné relevantní položky.</td></tr>';
          return;
        }

        tableBody.innerHTML = rows
          .map((row) => {
            if (row.type === 'entry') {
              return buildEntryRowHtml(row.entry.key, row.entry.value, { grouped: false });
            }

            const isCollapsed = modalState.collapsedGroups.has(row.id);
            const toggleSymbol = isCollapsed ? '▸' : '▾';
            const summaryLabel = `${row.entries.length} položek`;
            const groupRowHtml = `
            <tr class="cc-lc-group-row" data-group-id="${row.id}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
              <td class="cc-lc-key cc-lc-group-key">
                <button type="button" class="cc-lc-group-toggle" data-group-id="${row.id}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
                  <span class="cc-lc-group-chevron" aria-hidden="true">${toggleSymbol}</span>
                  <span class="cc-lc-group-label">${escapeHtml(row.label)}</span>
                </button>
              </td>
              <td class="cc-lc-value cc-lc-group-summary">${summaryLabel}</td>
              <td class="cc-lc-action">
                 <button type="button" class="cc-button cc-button-red cc-button-small cc-lc-delete-group" data-group-id="${row.id}">Smazat vše</button>
              </td>
            </tr>`;

            if (isCollapsed) return groupRowHtml;

            return `${groupRowHtml}${row.entries
            .map((entry) => buildEntryRowHtml(entry.key, entry.value, { grouped: true }))
            .join('')}`;
          })
          .join('');
      };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
      overlay.querySelector('.cc-lc-modal-close')?.addEventListener('click', closeModal);
      overlay.querySelector('#cc-lc-close-btn')?.addEventListener('click', closeModal);

      overlay.querySelector('#cc-lc-delete-all-btn')?.addEventListener('click', () => {
        getManagedLocalStorageEntries().forEach((entry) => localStorage.removeItem(entry.key));
        syncAfterLocalStorageChange();
        detailsController.close();
        refreshTable();
        showSettingsInfoToast('Relevantní LocalStorage klíče byly smazány.');
      });

      overlay.querySelector('#cc-lc-table-body')?.addEventListener('click', (e) => {
        const groupDeleteBtn = e.target.closest('.cc-lc-delete-group');
        if (groupDeleteBtn?.dataset.groupId === 'hover-preview-cache') {
          getManagedLocalStorageEntries()
            .filter((entry) => isHoverPreviewCacheKey(entry.key))
            .forEach((entry) => localStorage.removeItem(entry.key));
          syncAfterLocalStorageChange();
          detailsController.close();
          refreshTable();
          showSettingsInfoToast('Smazány všechny cache položky náhledů.');
          return;
        }

        const groupRow = e.target.closest('.cc-lc-group-row');
        if (groupRow?.dataset.groupId && !e.target.closest('.cc-lc-delete-group')) {
          const { groupId } = groupRow.dataset;
          if (modalState.collapsedGroups.has(groupId)) modalState.collapsedGroups.delete(groupId);
          else modalState.collapsedGroups.add(groupId);
          refreshTable();
          return;
        }

        const infoBtn = e.target.closest('.cc-lc-value-info');
        if (infoBtn?.dataset.key) {
          const key = infoBtn.dataset.key;
          detailsController.open(`Hodnota: ${key}`, getLocalStorageValueDetailRows(localStorage.getItem(key) ?? ''));
          return;
        }

        const deleteBtn = e.target.closest('.cc-lc-delete-one');
        if (!deleteBtn || !deleteBtn.dataset.key) return;
        localStorage.removeItem(deleteBtn.dataset.key);
        syncAfterLocalStorageChange();
        refreshTable();
        showSettingsInfoToast(`Smazán klíč: ${deleteBtn.dataset.key}`);
      });

      overlay.addEventListener('cc-lc-open', () => {
        refreshTable();
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('is-open'));
      });

      document.body.appendChild(overlay);
      document.body.appendChild(detailsController.overlay);
      return (localStorageModal = overlay);
    };

    settingsButton.querySelector('#cc-maint-clear-lc-btn')?.addEventListener('click', () => {
      ensureLocalStorageModal().dispatchEvent(new CustomEvent('cc-lc-open'));
    });

    settingsButton.querySelector('#cc-sync-cloud-btn')?.addEventListener(
      'click',
      (e) => {
        if (isUserLoggedIn()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        showSettingsInfoToast('Cloud sync je dostupný až po přihlášení.');
      },
      true,
    );

    settingsButton.querySelector('#cc-version-info-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      openVersionInfoModal(settingsButton).catch((err) => console.error('[CC] Failed to open version info modal:', err));
    });

    const ratingsModalOptions = { getCurrentUserSlug, getMostFrequentUserSlug };
    const setupBadge = (id, type) => {
      const badge = settingsButton.querySelector(id);
      if (!badge) return;
      badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');

      const handler = (e) => {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keydown') e.preventDefault();
        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, type, ratingsModalOptions).catch((err) =>
          console.error(`[CC] Failed to open ${type} ratings table:`, err),
        );
      };

      badge.addEventListener('click', handler);
      badge.addEventListener('keydown', handler);
    };

    setupBadge('#cc-badge-red', 'direct');
    setupBadge('#cc-badge-black', 'computed');

    // Setup the dedicated list button in the settings menu
    const listBtn = settingsButton.querySelector('#cc-open-ratings-btn');
    if (listBtn) {
      const handler = (e) => {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keydown') e.preventDefault();

        if (!isUserLoggedIn()) {
          showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
          return;
        }
        openRatingsTableModal(settingsButton, 'all', ratingsModalOptions).catch((err) =>
          console.error(`[CC] Failed to open ratings table via icon button:`, err),
        );
      };

      listBtn.addEventListener('click', handler);
      listBtn.addEventListener('keydown', handler);
    }

    const badgeRefreshOptions = {
      isUserLoggedIn,
      getCurrentUserSlug,
      getMostFrequentUserSlug,
    };
    const refreshBadgesSafely = () =>
      refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((err) =>
        console.error('[CC] Failed to refresh badges:', err),
      );

    refreshBadgesSafely();
    window.setTimeout(refreshBadgesSafely, 1200);

    const handleInfoIconMouseOver = (e) => {
      const infoIcon = e.target.closest('.cc-info-icon');
      if (!infoIcon || !dropdown.contains(infoIcon)) return;

      const tooltipText = infoIcon.getAttribute('aria-label') || '';
      showSettingsTooltip(infoIcon, tooltipText);
    };

    const handleInfoIconMouseOut = (e) => {
      const infoIcon = e.target.closest('.cc-info-icon');
      if (!infoIcon || !dropdown.contains(infoIcon)) return;
      if (infoIcon.contains(e.relatedTarget)) return;

      hideSettingsTooltip();
    };

    dropdown?.addEventListener('mouseover', handleInfoIconMouseOver, true);
    dropdown?.addEventListener('mouseout', handleInfoIconMouseOut, true);

    queryMenu('.cc-settings-scroll-region')?.addEventListener('scroll', () => {
      hideSettingsTooltip();
    });

    window.addEventListener('resize', hideSettingsTooltip);

    dropdown?.addEventListener('click', (e) => {
      const infoIcon = e.target.closest('.cc-info-icon[data-image-url]');
      if (!infoIcon) return;

      e.preventDefault();
      e.stopPropagation();

      hideSettingsTooltip();

      const url = infoIcon.getAttribute('data-image-url');
      const titleText =
        infoIcon.closest('.cc-setting-row')?.querySelector('.cc-setting-label')?.textContent || 'Ukázka funkce';

      if (url) {
        const modal = getOrCreateImageModal();
        modal.querySelector('#cc-image-modal-title').textContent = titleText;
        modal.querySelector('#cc-image-modal-img').src = url;
        modal.classList.add('is-open');
      }
    });

    initializeSettingsMenuHover(settingsButton);

    let autoSyncTimeout;
    window.addEventListener('cc-ratings-updated', (e) => {
      invalidateRatingsModalCache();
      refreshBadgesSafely();

      if (e && e.detail && e.detail.skipSync) {
        return;
      }

      clearTimeout(autoSyncTimeout);
      autoSyncTimeout = setTimeout(() => {
        performCloudSync();
      }, 3000);
    });

    const SYNC_COOLDOWN_MS = 1000 * 60 * 60 * 2;
    const lastAutoSync = Number.parseInt(localStorage.getItem('cc_last_startup_sync') || '0', 10);

    if (Date.now() - lastAutoSync > SYNC_COOLDOWN_MS) {
      console.log('☁️ [CC Sync] Running startup background sync...');
      localStorage.setItem('cc_last_startup_sync', String(Date.now()));
      setTimeout(() => {
        performCloudSync();
      }, 2500);
    }

    // ==========================================
    // GLOBAL KEYBOARD SHORTCUTS
    // ==========================================
    document.addEventListener('keydown', (e) => {
      // CTRL + ALT + R ==> "Zobrazit hodnocení"
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
        // Prevent default ctrl+alt+r behaviour if any
        e.preventDefault();

        const showRatingsToggle = settingsButton.querySelector('#cc-show-ratings');
        if (showRatingsToggle && !showRatingsToggle.disabled) {
          // Virtual click on the toggle like the user would.
          // This ensures all the proper event handlers run and state is consistent.
          showRatingsToggle.click();

          const isEnabled = showRatingsToggle.checked;
          showSettingsInfoToast(`Zobrazení hodnocení: ${isEnabled ? 'ZAPNUTO' : 'VYPNUTO'}`);
        }
      }
    });
  }

  let previewRoot;
  let secondaryPreviewRoot;
  let activeAnchor = null;
  let activeProvider = null;
  let hoverToken = 0;
  let secondaryHoverToken = 0;
  let mouseX = 0;
  let mouseY = 0;
  const suppressedTitles = [];
  const frozenPreviewRoots = [];
  let dragState = null;
  let loadingIndicator;
  let pendingLoadingIndicators = 0;

  const inflightRequests = new Map();

  function ensurePreviewRoot() {
    if (!previewRoot) {
      previewRoot = document.createElement('div');
      previewRoot.className = 'cc-hover-preview';
      previewRoot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(previewRoot);
    }

    return previewRoot;
  }

  function ensureSecondaryPreviewRoot() {
    if (!secondaryPreviewRoot) {
      secondaryPreviewRoot = document.createElement('div');
      secondaryPreviewRoot.className = 'cc-hover-preview cc-hover-preview-secondary';
      secondaryPreviewRoot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(secondaryPreviewRoot);
    }

    return secondaryPreviewRoot;
  }

  function ensureLoadingIndicator() {
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'cc-hover-preview-loading';
      loadingIndicator.setAttribute('aria-hidden', 'true');
      loadingIndicator.innerHTML = '<span class="cc-hover-preview-loading-dot"></span>';
      document.body.appendChild(loadingIndicator);
    }

    return loadingIndicator;
  }

  function hidePreview(root = previewRoot) {
    if (!root) return;
    root.classList.remove('is-visible');
    root.classList.remove('is-frozen');
    root.classList.remove('is-stack-leader');
    root.dataset.provider = '';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '';
    root.__ccPreviewData = null;
    root.__ccPreviewMeta = null;
    root.__ccDeferredPromise = null;
    root.style.zIndex = '';
  }

  function showLoadingIndicator() {
    pendingLoadingIndicators += 1;
    const indicator = ensureLoadingIndicator();
    indicator.classList.add('is-visible');
    indicator.setAttribute('aria-hidden', 'false');
    indicator.style.left = `${Math.max(8, mouseX + 14)}px`;
    indicator.style.top = `${Math.max(8, mouseY + 14)}px`;
  }

  function hideLoadingIndicator({ force = false } = {}) {
    pendingLoadingIndicators = force ? 0 : Math.max(0, pendingLoadingIndicators - 1);
    if (pendingLoadingIndicators > 0) return;
    if (!loadingIndicator) return;
    loadingIndicator.classList.remove('is-visible');
    loadingIndicator.setAttribute('aria-hidden', 'true');
  }

  function isFrozenRoot(root) {
    return frozenPreviewRoots.includes(root);
  }

  function getTopFrozenRoot() {
    return frozenPreviewRoots[frozenPreviewRoots.length - 1] || null;
  }

  function refreshFrozenPreviewState() {
    const showLeader = frozenPreviewRoots.length > 1;

    frozenPreviewRoots.forEach((root, index) => {
      root.classList.toggle('is-stack-leader', showLeader && index === frozenPreviewRoots.length - 1);
      root.style.zIndex = String(10030 + index);
    });

    if (secondaryPreviewRoot?.classList.contains('is-visible')) {
      secondaryPreviewRoot.style.zIndex = String(10031 + frozenPreviewRoots.length);
    }
  }

  function getPreviewRootFromTarget(target) {
    return target instanceof Element ? target.closest('.cc-hover-preview') : null;
  }

  function restoreSuppressedTitles() {
    while (suppressedTitles.length > 0) {
      const item = suppressedTitles.pop();
      if (item?.element?.isConnected) {
        item.element.setAttribute('title', item.title);
      }
    }
  }

  function suppressNativeTitles(target) {
    restoreSuppressedTitles();

    let element = target instanceof Element ? target : target?.parentElement || null;
    while (element && element !== document.body) {
      if (element.hasAttribute('title')) {
        suppressedTitles.push({ element, title: element.getAttribute('title') || '' });
        element.removeAttribute('title');
      }
      element = element.parentElement;
    }
  }

  function getAnchorFromTarget(target) {
    let element = target instanceof Element ? target : target?.parentElement || null;
    while (element) {
      if (element.matches?.('a[href]')) return element;
      if (element.hasAttribute?.('title')) {
        const titledAnchor = element.querySelector?.('a[href]');
        if (titledAnchor) return titledAnchor;
      }
      element = element.parentElement;
    }

    return null;
  }

  async function updateFrozenFilmPoster(root, direction) {
    if (!root?.__ccPreviewData) return;

    if (!root.__ccPreviewData.posters || root.__ccPreviewData.posters.length <= 1) {
      await ensureDeferredPreviewData(root);
    }

    if (!root?.__ccPreviewData?.posters?.length || root.__ccPreviewData.posters.length <= 1) return;

    const posters = root.__ccPreviewData.posters;
    const nextIndex = (Number(root.__ccPreviewData.posterIndex || 0) + direction + posters.length) % posters.length;

    root.__ccPreviewData.posterIndex = nextIndex;

    const image = root.querySelector('.cc-hover-preview-image');
    const index = root.querySelector('.cc-hover-preview-poster-index');
    if (image) {
      image.src = posters[nextIndex].imageUrl;
      image.classList.remove('empty-image');
    }
    if (index) {
      index.textContent = `${nextIndex + 1}/${posters.length}`;
    }
  }

  function getPreviewPosition(root, pointerX, pointerY, xOffset, yOffset) {
    const rect = root.getBoundingClientRect();
    const viewportMargin = 10;
    const preferredRight = pointerX + xOffset;
    const preferredLeft = pointerX - rect.width - xOffset;
    const shouldFlipLeft =
      preferredRight + rect.width + viewportMargin > window.innerWidth && preferredLeft >= viewportMargin;
    const x = shouldFlipLeft
      ? Math.max(viewportMargin, preferredLeft)
      : Math.min(window.innerWidth - rect.width - viewportMargin, Math.max(viewportMargin, preferredRight));
    const y = Math.min(window.innerHeight - rect.height - viewportMargin, Math.max(viewportMargin, pointerY + yOffset));

    return { x, y };
  }

  function positionPreview() {
    if (previewRoot?.classList.contains('is-visible')) {
      const { x, y } = getPreviewPosition(previewRoot, mouseX, mouseY, 18, 18);

      previewRoot.style.left = `${x}px`;
      previewRoot.style.top = `${y}px`;
    }

    if (secondaryPreviewRoot?.classList.contains('is-visible')) {
      const { x, y } = getPreviewPosition(secondaryPreviewRoot, mouseX, mouseY, 28, 16);

      secondaryPreviewRoot.style.left = `${x}px`;
      secondaryPreviewRoot.style.top = `${y}px`;
    }

    if (loadingIndicator?.classList.contains('is-visible')) {
      loadingIndicator.style.left = `${Math.max(8, mouseX + 14)}px`;
      loadingIndicator.style.top = `${Math.max(8, mouseY + 14)}px`;
    }
  }

  function getMaxCacheAgeMs() {
    return Number.parseInt(localStorage.getItem(HOVER_PREVIEW_CACHE_HOURS_KEY) || '24', 10) * 60 * 60 * 1000;
  }

  function cleanExpiredCache() {
    const now = Date.now();
    const maxAgeMs = getMaxCacheAgeMs();

    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (!key) continue;

      if (key.startsWith('cc_creator_')) {
        localStorage.removeItem(key);
        continue;
      }

      if (!key.startsWith(HOVER_PREVIEW_CACHE_GROUP_PREFIX)) continue;
      if (!key.startsWith(HOVER_PREVIEW_CACHE_PREFIX)) {
        localStorage.removeItem(key);
        continue;
      }

      try {
        const cachedItem = JSON.parse(localStorage.getItem(key));
        if (!cachedItem?.timestamp || now - cachedItem.timestamp > maxAgeMs) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }

  function isHoverPreviewEnabled() {
    return getFeatureState(HOVER_PREVIEW_ENABLED_KEY, true);
  }

  function isProviderEnabled(provider) {
    return isHoverPreviewEnabled() && getFeatureState(provider.storageKey, true);
  }

  function getProviderForAnchor(anchor) {
    return HOVER_PREVIEW_PROVIDERS.find((provider) => provider.matches(anchor));
  }

  function shouldIgnoreAnchor(anchor) {
    if (!(anchor instanceof Element)) return true;

    if (
      anchor.closest(
        '.tabs-review-content nav.tab-nav, .tabs-review-content .box-more-bar, .tabs-review-content .pagination',
      )
    ) {
      return true;
    }

    const reviewArticle = anchor.closest('article[data-film-review]');
    if (!reviewArticle) return false;

    if (anchor.closest('.article-header-review-action')) return true;
    if (anchor.matches('.a-edit-review, [data-open-review-form], .permanent-link')) return true;

    return false;
  }

  function getProviderById(providerId) {
    return HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === providerId) || null;
  }

  function applyPreviewLinkIcons(root) {
    if (!root) return;

    applyConfiguredLinkIcons(root, {
      iconsEnabled: getFeatureState(LINK_ICONS_ENABLED_KEY, true),
      position: localStorage.getItem(LINK_ICONS_POSITION_KEY) === 'after' ? 'after' : 'before',
      isProviderEnabled: (provider) => getFeatureState(provider.storageKey, true),
      selectors: '.cc-hover-preview-review-body a[href]',
      blockedClosestSelectors: '.cc-hover-preview-review-no-block',
    });
  }

  async function loadProviderData(provider, url) {
    if (typeof provider.fetchData === 'function') {
      return provider.fetchData({ url });
    }

    const response = await fetch(url);
    if (!response.ok) return null;

    const html = await response.text();
    const documentNode = new DOMParser().parseFromString(html, 'text/html');
    return provider.parseDocument(documentNode, { url });
  }

  async function fetchPreviewData(provider, normalizedUrl) {
    const entityKey = provider.getEntityKey(normalizedUrl);
    if (!entityKey) return null;

    const cacheKey = `${HOVER_PREVIEW_CACHE_PREFIX}${provider.id}_${entityKey}`;
    const requestKey = `${provider.id}:${entityKey}`;
    const maxAgeMs = getMaxCacheAgeMs();

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached?.timestamp && Date.now() - cached.timestamp < maxAgeMs) {
        return cached.data;
      }
    } catch {}

    if (inflightRequests.has(requestKey)) {
      return inflightRequests.get(requestKey);
    }

    const request = (async () => {
      try {
        const data = await loadProviderData(provider, normalizedUrl);
        if (!data) return null;

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
        if (Math.random() < 0.1) cleanExpiredCache();
        return data;
      } catch {
        return null;
      } finally {
        inflightRequests.delete(requestKey);
      }
    })();

    inflightRequests.set(requestKey, request);
    return request;
  }

  async function showPreviewForAnchor(anchor, provider, token) {
    return showPreviewForAnchorInRoot(anchor, provider, token, ensurePreviewRoot(), false);
  }

  async function ensureDeferredPreviewData(root) {
    const previewData = root?.__ccPreviewData;
    const previewMeta = root?.__ccPreviewMeta;
    const provider = getProviderById(previewMeta?.providerId);

    if (!root || !previewData || !provider || typeof provider.loadDeferredData !== 'function') {
      return previewData || null;
    }

    if (previewData.deferredLoaded) return previewData;
    if (root.__ccDeferredPromise) return root.__ccDeferredPromise;

    root.__ccDeferredPromise = (async () => {
      const currentData = root.__ccPreviewData;
      const deferredData = await provider.loadDeferredData({
        url: previewMeta.normalizedUrl,
        data: currentData,
      });

      const nextData = {
        ...(deferredData || currentData),
        posterIndex: Number(currentData?.posterIndex || 0),
        deferredLoaded: true,
      };

      const posters = Array.isArray(nextData.posters) ? nextData.posters : [];
      if (posters.length > 0) {
        nextData.posterIndex = Math.min(nextData.posterIndex, posters.length - 1);
      }

      if (!root.isConnected) return nextData;

      root.innerHTML = provider.render(nextData);
      root.__ccPreviewData = nextData;
      root.dataset.provider = provider.id;
      root.setAttribute('aria-hidden', root.classList.contains('is-visible') ? 'false' : 'true');
      applyPreviewLinkIcons(root);
      positionPreview();
      return nextData;
    })().finally(() => {
      if (root) root.__ccDeferredPromise = null;
    });

    return root.__ccDeferredPromise;
  }

  async function showPreviewForAnchorInRoot(anchor, provider, token, root, isSecondary) {
    if (!isProviderEnabled(provider)) return;

    const normalizedUrl = provider.normalizeUrl(anchor.href);
    if (!normalizedUrl) return;

    showLoadingIndicator();
    const data = await fetchPreviewData(provider, normalizedUrl);
    hideLoadingIndicator();
    if (!data) return;
    if (isSecondary) {
      if (token !== secondaryHoverToken) return;
    } else if (token !== hoverToken || activeAnchor !== anchor) {
      return;
    }

    root.innerHTML = provider.render(data);
    root.__ccPreviewData = {
      ...data,
      posterIndex: 0,
      deferredLoaded: typeof provider.loadDeferredData !== 'function',
    };
    root.__ccPreviewMeta = {
      providerId: provider.id,
      normalizedUrl,
    };
    root.dataset.provider = provider.id;
    root.classList.add('is-visible');
    root.setAttribute('aria-hidden', 'false');
    applyPreviewLinkIcons(root);
    positionPreview();
  }

  function clearActivePreview() {
    restoreSuppressedTitles();
    activeAnchor = null;
    activeProvider = null;
    hoverToken++;
    secondaryHoverToken++;
    hidePreview(previewRoot);
    hidePreview(secondaryPreviewRoot);
    hideLoadingIndicator({ force: true });
  }

  function clearAllPreviews() {
    clearActivePreview();
    frozenPreviewRoots.splice(0).forEach((root) => hidePreview(root));
    refreshFrozenPreviewState();
  }

  function popLastFrozenPreview() {
    const root = frozenPreviewRoots.pop();
    if (!root) return;

    hidePreview(root);
    restoreSuppressedTitles();
    secondaryHoverToken++;
    refreshFrozenPreviewState();
  }

  function toggleFreezePreview() {
    if (!previewRoot?.classList.contains('is-visible')) return;

    const frozenRoot = previewRoot;
    previewRoot.classList.add('is-frozen');
    frozenPreviewRoots.push(frozenRoot);
    refreshFrozenPreviewState();
    previewRoot = null;
    restoreSuppressedTitles();
    activeAnchor = null;
    activeProvider = null;
    hoverToken++;
    void ensureDeferredPreviewData(frozenRoot);
  }

  function refreshActivePreview() {
    if (!activeAnchor || !activeProvider) {
      if (!isHoverPreviewEnabled()) clearActivePreview();
      return;
    }

    if (!isProviderEnabled(activeProvider)) {
      clearActivePreview();
      return;
    }

    hoverToken++;
    showPreviewForAnchor(activeAnchor, activeProvider, hoverToken);
  }

  function initializeHoverPreviews() {
    document.addEventListener(
      'mousemove',
      (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        positionPreview();
      },
      true,
    );

    document.addEventListener(
      'mouseover',
      (event) => {
        const hoveredPreviewRoot = getPreviewRootFromTarget(event.target);
        const insideFrozenPreview = Boolean(hoveredPreviewRoot && hoveredPreviewRoot === getTopFrozenRoot());
        if (frozenPreviewRoots.length > 0 && !insideFrozenPreview) return;

        const anchor = getAnchorFromTarget(event.target);
        if (!anchor) return;
        if (!insideFrozenPreview && shouldIgnoreAnchor(anchor)) return;

        const provider = getProviderForAnchor(anchor);
        if (!provider || !isProviderEnabled(provider)) return;
        if (!insideFrozenPreview && activeAnchor === anchor && activeProvider?.id === provider.id) return;

        suppressNativeTitles(event.target);

        if (insideFrozenPreview) {
          secondaryHoverToken++;
          showPreviewForAnchorInRoot(anchor, provider, secondaryHoverToken, ensureSecondaryPreviewRoot(), true);
          return;
        }

        activeAnchor = anchor;
        activeProvider = provider;
        hoverToken++;
        showPreviewForAnchor(anchor, provider, hoverToken);
      },
      true,
    );

    document.addEventListener(
      'mouseout',
      (event) => {
        if (frozenPreviewRoots.length > 0) {
          if (!secondaryPreviewRoot?.classList.contains('is-visible')) return;
          const fromAnchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
          const toAnchor = event.relatedTarget instanceof Element ? event.relatedTarget.closest('a[href]') : null;
          const relatedPreviewRoot = getPreviewRootFromTarget(event.relatedTarget);

          if (fromAnchor && toAnchor && fromAnchor === toAnchor) return;
          if (secondaryPreviewRoot?.contains(event.relatedTarget)) return;
          if (relatedPreviewRoot && isFrozenRoot(relatedPreviewRoot) && toAnchor) return;

          hidePreview(secondaryPreviewRoot);
          return;
        }
        if (!activeAnchor) return;
        if (event.relatedTarget instanceof Element && activeAnchor.contains(event.relatedTarget)) return;

        clearActivePreview();
      },
      true,
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat) return;

        if (event.key === 'Control') {
          if (secondaryPreviewRoot?.classList.contains('is-visible')) {
            const frozenRoot = secondaryPreviewRoot;
            secondaryPreviewRoot.classList.add('is-frozen');
            frozenPreviewRoots.push(frozenRoot);
            refreshFrozenPreviewState();
            secondaryPreviewRoot = null;
            restoreSuppressedTitles();
            secondaryHoverToken++;
            void ensureDeferredPreviewData(frozenRoot);
          } else if (previewRoot?.classList.contains('is-visible')) {
            toggleFreezePreview();
          } else if (frozenPreviewRoots.length > 0) {
            popLastFrozenPreview();
          }
          return;
        }

        if (event.key === 'Escape') {
          clearAllPreviews();
        }
      },
      true,
    );

    document.addEventListener(
      'click',
      (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-cc-hover-poster-dir]') : null;
        const root = getPreviewRootFromTarget(button);
        if (!button || !root) return;

        event.preventDefault();
        event.stopPropagation();
        void updateFrozenFilmPoster(root, Number(button.getAttribute('data-cc-hover-poster-dir') || '0'));
      },
      true,
    );

    document.addEventListener(
      'pointerdown',
      (event) => {
        const root = getPreviewRootFromTarget(event.target);
        const handle =
          event.target instanceof Element ? event.target.closest('.cc-hover-preview-top, .cc-hover-preview-title') : null;
        if (!root || !handle || !isFrozenRoot(root)) return;
        if (event.target instanceof Element && event.target.closest('a, button')) return;

        const rect = root.getBoundingClientRect();
        dragState = {
          root,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };
        root.classList.add('is-dragging');
        event.preventDefault();
      },
      true,
    );

    document.addEventListener(
      'pointermove',
      (event) => {
        if (!dragState?.root?.isConnected) return;

        const rect = dragState.root.getBoundingClientRect();
        const nextLeft = Math.min(window.innerWidth - rect.width - 8, Math.max(8, event.clientX - dragState.offsetX));
        const nextTop = Math.min(window.innerHeight - rect.height - 8, Math.max(8, event.clientY - dragState.offsetY));

        dragState.root.style.left = `${nextLeft}px`;
        dragState.root.style.top = `${nextTop}px`;
      },
      true,
    );

    document.addEventListener(
      'pointerup',
      () => {
        if (!dragState?.root) return;
        dragState.root.classList.remove('is-dragging');
        dragState = null;
      },
      true,
    );

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (frozenPreviewRoots.length === 0) return;

        const clickedInsidePreview = [previewRoot, secondaryPreviewRoot, ...frozenPreviewRoots].some((root) =>
          root?.contains(event.target),
        );
        if (clickedInsidePreview) return;

        clearAllPreviews();
      },
      true,
    );

    window.addEventListener('scroll', positionPreview, true);
    window.addEventListener(HOVER_PREVIEW_SETTINGS_CHANGED_EVENT, refreshActivePreview);

    cleanExpiredCache();
  }

  (async () => {
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

    console.debug('🟣 Adding stars (first pass)');
    await csfd.addStars();
    await csfd.addGalleryImageFormatLinks();
    csfd.addConfiguredLinkIcons();
    initializeHoverPreviews();

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
    window.setTimeout(rerunStars, 1500);

    // Watch for content injected into the DOM after initial load (e.g. pagination
    // clicks, lazy-loaded boxes and AJAX-replies in discussions) and add stars to any new film links.
    // Debounced so that the star elements addStars() itself inserts don't trigger
    // an infinite loop of observer → addStars → insert → observer → ...
    let starObserverTimer = null;
    let forumObserverTimer = null;

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

    // Helper to detect when ČSFD injects new discussion posts
    const mutationContainsForumPost = (mutationList) => {
      for (const mutation of mutationList) {
        if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches?.('.article-forum-item, article.article-forum') ||
            node.querySelector?.('.article-forum-item, article.article-forum')
          ) {
            return true;
          }
        }
      }
      return false;
    };

    const mutationContainsLinkIconTarget = (mutationList) => {
      for (const mutation of mutationList) {
        if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (
            node.matches?.(
              'a[href*="/film/"], a[href*="/tvurce/"], a[href*="/tvorca/"], a[href*="/uzivatel/"], a[href*="youtube.com"], a[href*="youtu.be"], a[href*="store.steampowered.com"], a[href*="wikipedia.org"], a[href*="anidb.net"], a[href*="myanimelist.net"], .article-content.article-content-justify, .article-content.article-content-icons, .article-news-content.article-content-justify, span.comment',
            ) ||
            node.querySelector?.(
              'a[href*="/film/"], a[href*="/tvurce/"], a[href*="/tvorca/"], a[href*="/uzivatel/"], a[href*="youtube.com"], a[href*="youtu.be"], a[href*="store.steampowered.com"], a[href*="wikipedia.org"], a[href*="anidb.net"], a[href*="myanimelist.net"], .article-content.article-content-justify, .article-content.article-content-icons, .article-news-content.article-content-justify, span.comment',
            )
          ) {
            return true;
          }
        }
      }

      return false;
    };

    const contentObserver = new MutationObserver((mutationList) => {
      if (mutationContainsFilmLink(mutationList)) {
        if (starObserverTimer === null) {
          starObserverTimer = window.setTimeout(() => {
            starObserverTimer = null;
            rerunStars();
          }, 200);
        }
      }

      // If the DOM update contained a forum post, redraw the self-reply buttons!
      if (mutationContainsForumPost(mutationList)) {
        if (forumObserverTimer === null) {
          forumObserverTimer = window.setTimeout(() => {
            forumObserverTimer = null;
            csfd.enableSelfReplyInDiscussions();
          }, 200);
        }
      }

      if (mutationContainsLinkIconTarget(mutationList)) {
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

    // Disable Option 2 if not logged in (now using utility)
    setControlsDisabledByLoginState(csfd.getIsLoggedIn(), ['option2']);
  })();

})();
