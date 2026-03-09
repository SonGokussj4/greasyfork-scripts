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
  const HIDE_SELECTED_REVIEWS_KEY = 'cc_hide_selected_user_reviews';
  const HIDE_SELECTED_REVIEWS_LIST_KEY = 'cc_hide_selected_user_reviews_list';
  const HIDE_REVIEWS_SECTION_COLLAPSED_KEY = 'cc_hide_reviews_section_collapsed';

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

  function matchesFilmUrl(url) {
    const host = url.hostname.toLowerCase();
    return (
      /^\/film\//i.test(url.pathname) &&
      (url.origin === location.origin || ['www.csfd.cz', 'www.csfd.sk', 'csfd.cz', 'csfd.sk'].includes(host))
    );
  }

  function matchesCreatorUrl(url) {
    const host = url.hostname.toLowerCase();
    return (
      /^\/(tvurce|tvorca)\//i.test(url.pathname) &&
      (url.origin === location.origin || ['www.csfd.cz', 'www.csfd.sk', 'csfd.cz', 'csfd.sk'].includes(host))
    );
  }

  function matchesUserUrl(url) {
    const host = url.hostname.toLowerCase();
    return (
      /^\/uzivatel\//i.test(url.pathname) &&
      (url.origin === location.origin || ['www.csfd.cz', 'www.csfd.sk', 'csfd.cz', 'csfd.sk'].includes(host))
    );
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
   * Pure utility function for parsing IDs.
   * @param {string} url - The URL to extract the movie ID from.
   * @returns {number} The extracted movie ID, or NaN if it cannot be parsed.
   */
  async function getMovieIdFromUrl(url) {
    if (!url) return NaN;
    // OPTIMIZATION: matchAll is slower. A simple regex match with global flag is faster.
    const matches = url.match(/\/(\d+)-/g);
    if (!matches || matches.length === 0) return NaN;

    // Extract numbers from the last match e.g., "/12345-" -> 12345
    const lastMatch = matches[matches.length - 1];
    return parseInt(lastMatch.replace(/\D/g, ''), 10);
  }

  const PROFILE_LINK_SELECTOR$3 =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

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
      const userEl = document.querySelector(PROFILE_LINK_SELECTOR$3);
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

      this.userSlug = this.userUrl?.match(/^\/uzivatel\/(\d+-[^/]+)\//)?.[1];
      console.debug('🟣 User Slug:', this.userSlug);

      this.userRatingsUrl = this.userUrl
        ? this.userUrl + (location.origin.endsWith('sk') ? 'hodnotenia' : 'hodnoceni')
        : undefined;
      console.debug('🟣 User Ratings URL:', this.userRatingsUrl);

      const settings = await getSettings(SETTINGSNAME);
      this.stars = settings?.stars || {};

      await this.loadStarsFromIndexedDb();
      await this.syncCurrentPageRatingWithIndexedDb();

      try {
        if (getFeatureState('cc_show_all_creator_tabs')) this.showAllCreatorTabs();
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

            let wrapper =
              headerEl.closest('.column') || headerEl.closest('.box') || headerEl.closest('.updated-box') || headerEl;

            if (wrapper.classList.contains('column') && wrapper.children.length > 1) {
              wrapper = headerEl.closest('.box') || headerEl.closest('.updated-box') || headerEl;
            }

            if (enabled && hiddenList.includes(title)) {
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
                if (!this.cachedHiddenPanelsList.includes(title)) {
                  this.cachedHiddenPanelsList.push(title);
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

      const cleanPath = path.replace(/\/(recenze|komentare|prehled|prehlad)\/?$/i, '/');

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
      if (typeText.includes('epizoda')) return 'episode';
      if (typeText.includes('seriál') || typeText.includes('serial')) return 'serial';
      if (typeText.includes('série') || typeText.includes('serie')) return 'series';
      return 'movie';
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
      if (!starElem) return NaN;
      const clazz = starElem.className || '';
      const m = clazz.match(/stars-(\d)/);
      if (m) return parseInt(m[1], 10);
      if (clazz.includes('trash')) return 0;
      return NaN;
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

      const showInReviews = getFeatureState(SHOW_RATINGS_IN_REVIEWS_KEY);
      const showInForeignReviews = getFeatureState(SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY, true);
      const showInDiaries = getFeatureState(SHOW_RATINGS_IN_DIARIES_KEY, true); // ZDE

      const isCreatorPage = this.isOnCreatorPage();
      const isUserReviewsPage = this.isOnUserReviewsPage();
      this.isOnUserOverviewPage();
      const isOtherUser = this.isOnOtherUserProfilePage();
      const isOwnProfile = this.isOnUserProfilePage() && !isOtherUser;

      // Links pointing to sections that are not actual film pages
      const ignorePathRegex = /\/(galerie|videa?|tvurci|obsahy?)\//;
      // Links containing 'page' or 'comment' query parameters (usually pagination or comment links)
      const ignoreParamRegex = /[?&](page|comment|modal|review)=/i;
      // Links missing the expected numeric ID pattern (e.g., "/12345-slug/")
      const validFilmRegex = /\/\d+-/;

      return Array.from(searchRoot.querySelectorAll('a[href*="/film/"]')).filter((link) => {
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
          // On the overview page, we want to include the title links in the main sections but exclude those in the review/rating sections to avoid duplicates and false positives
          if (this.shouldSkipProfileSectionLink(link)) return false;
        }

        if (link.closest(LINK_ICON_BLOCKED_LINK_CLOSEST_SELECTORS)) {
          return false;
        }

        return true;
      });
    }

    isOnOwnRatingsPage() {
      if (!this.userSlug) return false;
      const path = location.pathname || '';
      return (
        path.startsWith(`/uzivatel/${this.userSlug}/`) && (path.includes('/hodnoceni/') || path.includes('/hodnotenia/'))
      );
    }

    isOnCreatorPage() {
      return /^\/(tvurce|tvorca)\/\d+-[^/]+\//i.test(location.pathname || '');
    }

    isOnUserProfilePage() {
      return (location.pathname || '').match(/^\/uzivatel\/(\d+-[^/]+)\//i)?.[1];
    }

    isOnOtherUserProfilePage() {
      const pageUserSlug = this.isOnUserProfilePage();
      return Boolean(pageUserSlug && this.userSlug && pageUserSlug !== this.userSlug);
    }

    isOnUserOverviewPage() {
      return /^\/uzivatel\/\d+-[^/]+\/(prehled|prehlad)(\/|$)/i.test(location.pathname || '');
    }

    isOnUserReviewsPage() {
      return /^\/uzivatel\/\d+-[^/]+\/(recenze|recenzie)(\/|$)/i.test(location.pathname || '');
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
          ':scope > .box-header h2, :scope > .box-header h3, :scope > header h2, :scope > header h3, :scope > h2, :scope > h3',
        );
        const sectionTitle = titleEl?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

        if (sectionTitle) {
          if (sectionTitle.match(/poslední recenze|posledne recenzie|poslední hodnocení|posledné hodnotenia/))
            return true;
          if (sectionTitle.match(/poslední deníček|posledny dennik/)) return false;
        }
        sectionNode = sectionNode.parentElement;
      }
      return false;
    }

    getRatingsPageSlug() {
      return (location.pathname || '').match(/^\/uzivatel\/(\d+-[^/]+)\/(hodnoceni|hodnotenia)\/?/i)?.[1];
    }

    isOnForeignRatingsPage() {
      const ratingsPageSlug = this.getRatingsPageSlug();
      return Boolean(ratingsPageSlug && this.userSlug && ratingsPageSlug !== this.userSlug);
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

      if (this.isOnForeignRatingsPage()) {
        console.debug('🟣 Ratings not added: on foreign ratings page — adding comparison column instead');
        return this.addComparisonColumnOnForeignRatingsPage();
      }

      // Handle the header-less table on the Overview page
      if (this.isOnUserOverviewPage() && this.isOnOtherUserProfilePage()) {
        console.debug('🟣 On other user overview page — adding column to last ratings table');
        await this.addComparisonColumnOnOverviewPage();
      }

      const links = this.getCandidateFilmLinks();
      console.debug(`🔵 Found ${links.length} candidate links for adding ratings`);
      console.debug({ links });
      const outlinedOnThisPage =
        this.isOnOtherUserProfilePage() || /^\/soukrome\/oblibeni-uzivatele\/(\?|$)/i.test(location.pathname || '');

      for (const link of links) {
        if (link.dataset.ccStarAdded === 'true') continue;

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
          if (headingAncestor) {
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
      return /\/(galerie|galeria)\//i.test(location.pathname || '');
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
      if (!window.location.pathname.includes('/diskuze/')) return;
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

  var css_248z = ".dropdown-content.cc-settings{background-color:#fff!important;border:1px solid #eaeaea;border-radius:0 0 10px 10px;border-top:none;-webkit-box-shadow:0 12px 34px rgba(0,0,0,.15),0 4px 12px rgba(0,0,0,.08);box-shadow:0 12px 34px rgba(0,0,0,.15),0 4px 12px rgba(0,0,0,.08);-webkit-box-sizing:border-box;box-sizing:border-box;display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:0;overflow:hidden;padding:0;right:0;top:100%;width:360px;z-index:10000!important;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;max-height:min(65vh,calc(100vh - 48px));min-height:0}header.page-header.user-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings,header.page-header.user-not-logged .header-bar>li.cc-menu-item .dropdown-content.cc-settings{margin-top:-4px;right:8px;z-index:10000!important}.dropdown-content.cc-settings.cc-settings-pinned-root{border-radius:10px;border-top:1px solid #eaeaea;display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;left:auto;margin-top:0!important;max-height:min(65vh,calc(100vh - 60px));opacity:1!important;position:fixed!important;right:30px;top:30px;visibility:visible!important;z-index:10020!important}.cc-settings-shell{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;height:100%;min-height:0;width:100%}.cc-settings-shell-foot,.cc-settings-shell-head{-webkit-box-flex:0;background:#fff;-ms-flex:0 0 auto;flex:0 0 auto}.cc-settings-shell-head{border-bottom:1px solid #efefef}.cc-settings-shell-foot{border-top:1px solid #efefef}.cc-settings-shell-body{background:#fff;display:-webkit-box;display:-ms-flexbox;display:flex;overflow:hidden}.cc-settings-scroll-region,.cc-settings-shell-body{-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;min-height:0}.cc-settings-scroll-region{overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}.cc-head-tools .cc-settings-pin-close{display:none!important}.dropdown-content.cc-settings.cc-settings-pinned-root .cc-settings-pin-close{display:-webkit-inline-box!important;display:-ms-inline-flexbox!important;display:inline-flex!important}.dropdown-content.cc-settings.cc-settings-pinned-root .left-head{cursor:move;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.dropdown-content.cc-settings.cc-settings-pinned-root .left-head a,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head button,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head input,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head select,.dropdown-content.cc-settings.cc-settings-pinned-root .left-head textarea{cursor:pointer}.dropdown-content.cc-settings .cc-settings-section,.dropdown-content.cc-settings .dropdown-content-head{-webkit-box-sizing:border-box;box-sizing:border-box;margin:0;width:100%}.cc-settings-section .cc-settings-section-content{-webkit-box-sizing:border-box;box-sizing:border-box;padding:10px;width:100%}.cc-settings-section+.cc-settings-section .cc-settings-section-content{border-top:1px solid #efefef}.cc-settings-shell-body .cc-settings-section:first-child .cc-settings-section-content,.cc-settings-shell-foot .cc-settings-section+.cc-settings-section .cc-settings-section-content,.cc-settings-shell-head .cc-settings-section+.cc-settings-section .cc-settings-section-content{border-top:none}.dropdown-content.cc-settings .left-head{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;gap:2px}.dropdown-content.cc-settings .left-head h2{line-height:1.1;margin:0}.cc-version-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px}.cc-version-link{color:#555;font-size:11px;line-height:1;opacity:.9;text-decoration:none}.cc-version-link:hover{color:#aa2c16;text-decoration:underline}.cc-version-status{background:#b8b8b8;border-radius:999px;display:inline-block;height:8px;opacity:0;-webkit-transition:opacity .18s ease;transition:opacity .18s ease;width:8px}.cc-version-status.is-visible{opacity:1}.cc-version-status.is-checking{background:#9ca3af}.cc-version-status.is-ok{background:#8f8f8f}.cc-version-status.is-error{background:#9b9b9b}.cc-version-status.is-update{background:#aa2c16;color:#fff;font-size:10px;font-weight:700;height:auto;line-height:1.3;padding:1px 6px;width:auto}.cc-head-right,.cc-head-tools{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-version-info-btn{font-weight:700}.cc-version-info-btn svg{height:15px;width:15px}.cc-sync-icon-btn{border:1px solid #cfcfcf;border-radius:8px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:28px;width:28px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;color:#202020;cursor:pointer;justify-content:center;padding:0;text-decoration:none;-webkit-transition:background-color .15s ease,border-color .15s ease,color .15s ease;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.cc-sync-icon-btn:focus-visible,.cc-sync-icon-btn:hover{background:#f3f3f3;border-color:#bdbdbd;color:#aa2c16;outline:none}.cc-sync-icon-btn.is-enabled{background:#cae8cd!important;border-color:#6bb475!important;color:#184e21!important}.cc-badge{background-color:#2c3e50;border-radius:6px;color:#fff;cursor:help;font-size:11.2px;font-size:.7rem;font-weight:700;line-height:1.4;padding:2px 6px}.cc-badge-red{background-color:#aa2c16}.cc-badge-black{background-color:#000}.cc-button{border:none;border-radius:7px;color:#fff;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;padding:6px 8px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;cursor:pointer;font-size:12px;font-weight:600;height:auto;justify-content:center;line-height:1.2;-webkit-transition:background .2s,-webkit-transform .12s;transition:background .2s,-webkit-transform .12s;transition:background .2s,transform .12s;transition:background .2s,transform .12s,-webkit-transform .12s}.cc-button:hover{-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-button:active{-webkit-transform:translateY(0);transform:translateY(0)}.cc-button-red{background-color:#aa2c16}.cc-button-red:hover{background-color:#8b2414}.cc-button-red:active{background-color:#7a1f12}.cc-button-black{background-color:#242424!important;color:#fff!important}#cc-load-computed-btn:hover,.cc-button-black:active,.cc-button-black:focus,.cc-button-black:hover{background-color:#000!important;-webkit-box-shadow:none!important;box-shadow:none!important;color:#fff!important;outline:none!important}.cc-button-iconed{gap:5px}.cc-button-icon,.cc-button-iconed{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-button-icon{height:12px;width:12px}.cc-settings-actions{display:grid;gap:5px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.cc-settings-actions .cc-button{min-width:0;width:100%}.cc-settings-actions .cc-button-iconed span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-section-title{color:#444;font-size:12px;font-weight:700;margin:0 0 8px}.cc-category-title{border-top:1px solid #f0f0f0;color:#1f4f8f;font-size:12px;font-weight:700;margin:14px 0 6px;padding-top:10px}.cc-category-title.cc-category-first{border-top:none;margin-top:0;padding-top:0}.cc-config-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;gap:5px}.cc-config-list>.cc-setting-row{padding-left:9px;padding-right:9px}.cc-setting-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-backface-visibility:hidden;backface-visibility:hidden;background-color:#fff;border-radius:4px;contain:layout;gap:8px;padding:2px 0;position:relative;-webkit-transform:translateZ(0);transform:translateZ(0);z-index:1}.cc-setting-row:hover{background:#f8f8f8;z-index:10}.cc-setting-label{color:#444;cursor:inherit;font-size:11px;font-weight:500;line-height:1.3}.cc-setting-label-content{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:4px}.cc-link-icons-preview-after .cc-setting-label-content-with-leading-icon{-webkit-box-orient:horizontal;-webkit-box-direction:reverse;-ms-flex-direction:row-reverse;flex-direction:row-reverse}.cc-link-icons-preview-after .cc-setting-row,.cc-link-icons-preview-before .cc-setting-row{min-height:24px}.cc-setting-leading-icon{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;height:16px;justify-content:center;width:16px;-webkit-box-flex:0;-ms-flex:0 0 16px;flex:0 0 16px;line-height:1;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-setting-leading-icon svg{display:block;height:100%;width:100%}.cc-switch{display:inline-block;height:16px;position:relative;width:28px;-ms-flex-negative:0;flex-shrink:0}.cc-switch input{opacity:0;pointer-events:none;position:absolute}.cc-switch-bg{background-color:#d4d4d4;border-radius:20px;bottom:0;cursor:pointer;left:0;right:0;top:0}.cc-switch-bg,.cc-switch-bg:before{position:absolute;-webkit-transition:.25s ease;transition:.25s ease}.cc-switch-bg:before{background-color:#fff;border-radius:50%;bottom:2px;-webkit-box-shadow:0 1px 2px rgba(0,0,0,.2);box-shadow:0 1px 2px rgba(0,0,0,.2);content:\"\";height:12px;left:2px;width:12px}.cc-switch input:checked+.cc-switch-bg{background-color:#aa2c16}.cc-switch input:focus-visible+.cc-switch-bg{-webkit-box-shadow:0 0 0 2px rgba(170,44,22,.4);box-shadow:0 0 0 2px rgba(170,44,22,.4)}.cc-switch input:checked+.cc-switch-bg:before{-webkit-transform:translateX(12px);transform:translateX(12px)}.cc-setting-group{background:#fdfdfd;border:1px solid #eaeaea;border-radius:6px;border-right:2px solid #9d3b20;padding:4px 8px;position:relative;-webkit-transition:background-color .2s;transition:background-color .2s;z-index:1}.cc-setting-group:focus-within,.cc-setting-group:hover{background:#f8f8f8;z-index:10}.cc-setting-collapse-trigger{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-flex:1;-ms-flex-positive:1;cursor:pointer;flex-grow:1;padding:4px 0;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.cc-setting-collapse-trigger:hover .cc-setting-label{color:#aa2c16}.cc-chevron{color:#888;height:14px;margin-left:auto;-webkit-transition:-webkit-transform .2s ease;transition:-webkit-transform .2s ease;transition:transform .2s ease;transition:transform .2s ease,-webkit-transform .2s ease;width:14px}.cc-setting-group.is-collapsed .cc-chevron{-webkit-transform:rotate(-90deg);transform:rotate(-90deg)}.cc-setting-sub{-webkit-box-sizing:border-box;box-sizing:border-box;display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;padding:4px 8px 2px 36px;-webkit-box-orient:vertical;-webkit-box-direction:normal;border-top:1px solid transparent;-ms-flex-direction:column;flex-direction:column;gap:6px;max-height:520px;opacity:1;overflow:visible;-webkit-transform-origin:top;transform-origin:top;-webkit-transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s ease-out,padding .3s cubic-bezier(.4,0,.2,1);transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s ease-out,padding .3s cubic-bezier(.4,0,.2,1)}.cc-setting-group.is-collapsed .cc-setting-sub,.cc-setting-sub[hidden]{max-height:0;opacity:0;overflow:hidden;padding-bottom:0;padding-top:0;pointer-events:none}.cc-setting-sub.is-disabled{filter:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"filter\"><feColorMatrix type=\"matrix\" color-interpolation-filters=\"sRGB\" values=\"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0\" /></filter></svg>#filter');-webkit-filter:grayscale(100%);filter:grayscale(100%);opacity:.45;pointer-events:none}.cc-form-field{color:#444;display:grid;font-size:11px;gap:4px}.cc-sub-inline-field{border-top:1px solid #f1e4de;margin-top:2px;padding-top:6px}.cc-sub-inline-control{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;gap:8px;justify-content:space-between;min-height:24px}.cc-sub-inline-label{color:#555;font-size:11px}.cc-setting-sub .cc-form-field:last-child{padding-bottom:6px}.cc-form-field input[type=text]{border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:11px;line-height:1.2;padding:6px 8px;width:100%}.cc-sub-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:10px;margin-top:2px}.cc-button-small{font-size:11px;padding:4px 10px}.cc-setting-icons{display:-webkit-box;display:-ms-flexbox;display:flex;gap:6px;margin-left:auto}.cc-info-icon,.cc-setting-icons{-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-info-icon{color:#a0a0a0;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-pack:center;-ms-flex-pack:center;background:transparent;border:none;cursor:pointer;justify-content:center;padding:0;position:relative;-webkit-transition:color .2s ease;transition:color .2s ease}.cc-info-icon:hover{color:#aa2c16}.cc-info-icon:after,.cc-info-icon:before{content:none}.cc-settings-info-tooltip{left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:translateY(4px);transform:translateY(4px);-webkit-transition:opacity .18s ease,-webkit-transform .18s ease;transition:opacity .18s ease,-webkit-transform .18s ease;transition:opacity .18s ease,transform .18s ease;transition:opacity .18s ease,transform .18s ease,-webkit-transform .18s ease;visibility:hidden;z-index:10031}.cc-settings-info-tooltip.is-open{opacity:1;-webkit-transform:translateY(0);transform:translateY(0);visibility:visible}.cc-settings-info-tooltip-body{background-color:#242424;border-radius:6px;-webkit-box-shadow:0 4px 15px rgba(0,0,0,.2);box-shadow:0 4px 15px rgba(0,0,0,.2);color:#fff;font-size:11px;font-weight:500;line-height:1.4;max-width:240px;padding:8px 12px;position:relative;text-align:left;white-space:pre-wrap;width:-webkit-max-content;width:-moz-max-content;width:max-content}.cc-settings-info-tooltip-body:after{border-color:#242424 transparent transparent;border-style:solid;border-width:5px 5px 0;content:\"\";left:20px;position:absolute;top:100%;-webkit-transform:translateX(-50%);transform:translateX(-50%)}.cc-ratings-progress{background:#f9f9f9;border:1px solid #e4e4e4;border-radius:6px;margin:0;padding:8px}.cc-ratings-progress-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;color:#555;font-size:11px;gap:10px;margin-bottom:6px}#cc-ratings-progress-label{-webkit-box-flex:1;-ms-flex:1;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#cc-ratings-progress-count{-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;white-space:nowrap}.cc-ratings-progress-track{background:#e6e6e6;border-radius:999px;height:8px;overflow:hidden;width:100%}.cc-ratings-progress-bar{background:-webkit-gradient(linear,left top,right top,from(#aa2c16),to(#d13b1f));background:linear-gradient(90deg,#aa2c16,#d13b1f);border-radius:999px;height:100%;-webkit-transition:width .25s ease;transition:width .25s ease;width:0}.cc-ratings-progress-actions{display:-webkit-box;display:-ms-flexbox;display:flex;margin-top:6px;-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.cc-ratings-cancel-link{background:transparent;border:0;border-radius:4px;color:#7a7a7a;cursor:pointer;font-size:11px;padding:2px 6px;text-decoration:none;-webkit-transition:background-color .15s ease,color .15s ease;transition:background-color .15s ease,color .15s ease}.cc-ratings-cancel-link:hover{background:rgba(0,0,0,.06);color:#444}.cc-maint-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:6px;min-height:23px}.cc-dev-only{display:none!important}body.cc-dev-mode-active .cc-maint-actions>.cc-dev-only{display:-webkit-inline-box!important;display:-ms-inline-flexbox!important;display:inline-flex!important}body.cc-dev-mode-active .cc-maint-dev-control.cc-dev-only{display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important}.cc-maint-dev-control{-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-radius:0;gap:6px;padding:0;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-maint-dev-control,.cc-maint-dev-control:hover{background:transparent}.cc-maint-dev-control .cc-setting-label{line-height:1;white-space:nowrap}.cc-maint-dev-control .cc-switch{margin:0}#cc-maint-dev-btn,.cc-maint-dev-control .cc-switch{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}#cc-maint-dev-btn{-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;min-width:74px;text-align:center}#cc-maint-dev-btn:active,#cc-maint-dev-btn:hover{-webkit-transform:none;transform:none}.cc-version-info-overlay{background:rgba(0,0,0,.36);display:none;inset:0;position:fixed;z-index:10030;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);-webkit-box-sizing:border-box;box-sizing:border-box;justify-content:center;overscroll-behavior:contain;padding:16px}.cc-version-info-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-version-info-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 20px 45px rgba(0,0,0,.25);box-shadow:0 20px 45px rgba(0,0,0,.25);color:#222;display:grid;grid-template-rows:auto minmax(0,1fr);max-height:min(86vh,920px);overflow:hidden;width:min(750px,100%)}.cc-version-info-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-version-info-head.is-title-hidden{-webkit-box-pack:end;-ms-flex-pack:end;border-bottom:0;justify-content:flex-end;padding-bottom:0}.cc-version-info-title-wrap{min-width:0}.cc-version-info-head h3{font-size:14px;font-weight:700;margin:0}.cc-version-info-close{background:transparent;border:0;border-radius:7px;color:#666;cursor:pointer;font-size:20px;height:28px;line-height:1;width:28px}.cc-version-info-close:hover{background:#f1f1f1;color:#222}.cc-version-info-body{font-size:13px;line-height:1.7;overflow:auto;overscroll-behavior:contain;padding:18px 20px}.cc-version-info-modal.is-whats-new-modal .cc-version-info-body{padding-top:10px}.cc-version-info-foot{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;border-top:1px solid #efefef;justify-content:flex-end;margin-top:0;padding:10px 14px 14px}.cc-version-info-meta{display:grid;gap:12px;margin-bottom:22px}.cc-version-info-key{color:#666;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase}.cc-version-info-value{color:#222;font-size:14px;min-width:0}.cc-version-info-meta-cards{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:12px}.cc-version-info-card{min-width:150px;-webkit-box-flex:1;background:#fafafa;border:1px solid #ececec;border-radius:10px;-ms-flex:1 1 150px;flex:1 1 150px;padding:10px 12px}.cc-version-info-card .cc-version-info-value{font-size:19px;font-weight:700;line-height:1.2;margin-top:4px}.cc-version-info-status-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;min-height:20px}.cc-version-shortcuts{margin:0 0 22px}.cc-version-shortcuts-list{display:grid;gap:8px}.cc-version-shortcut-item{display:grid;gap:10px 14px;grid-template-columns:minmax(180px,auto) minmax(0,1fr);-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-bottom:1px solid #efefef;padding:8px 0}.cc-version-shortcut-item:last-child{border-bottom:0;padding-bottom:0}.cc-version-shortcut-keys{color:#444;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px}.cc-version-shortcut-keys,.cc-version-shortcut-keys kbd{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-version-shortcut-keys kbd{-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;border:solid #d6d6d6;border-radius:7px;border-width:1px 1px 2px;-webkit-box-shadow:inset 0 -1px 0 rgba(0,0,0,.04);box-shadow:inset 0 -1px 0 rgba(0,0,0,.04);color:#222;font-family:inherit;font-size:12px;font-weight:700;justify-content:center;line-height:1;min-width:32px;padding:3px 8px}.cc-version-shortcut-text{color:#444;line-height:1.5}.cc-version-info-section-title{color:#222;font-size:15px;font-weight:700;margin:0 0 14px}.cc-version-info-empty,.cc-version-info-loading{color:#666;margin:0 0 12px}.cc-version-info-warning{background:#fff6e8;border:1px solid #f0d2a8;border-radius:10px;color:#8a5a14;margin:0 0 12px;padding:10px 12px}.cc-version-info-status{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-weight:600;gap:6px}.cc-version-info-status-dot{background:#8f8f8f;border-radius:999px;height:8px;width:8px}.cc-version-info-status.is-update .cc-version-info-status-dot{background:#aa2c16}.cc-version-changelog-section+.cc-version-changelog-section{border-top:1px solid #e7e7e7;margin-top:28px;padding-top:28px}.cc-version-changelog-section{padding:2px 0 0}.cc-version-update-summary{margin-bottom:22px}.cc-version-update-title{color:#202020;font-size:20px;font-weight:700;line-height:1.25;margin:0 0 10px}.cc-version-update-text{color:#555;font-size:14px;margin:0}.cc-version-markdown-heading-version{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline;border-bottom:1px solid #e8e8e8;gap:10px;margin:0 0 14px;padding-bottom:10px}.cc-version-markdown-version{color:#202020;font-size:20px;font-weight:700}.cc-version-markdown-date{color:#8a8a8a;font-size:14px;font-weight:400}.cc-version-markdown-kind-item-icon{height:16px;width:16px;-webkit-box-flex:0;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-ms-flex:0 0 16px;flex:0 0 16px;margin-top:.15em;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-version-markdown-kind-item-icon svg{display:block;height:16px;width:16px}.cc-version-markdown-kind-list{list-style:none;margin:0 0 12px;padding:0}.cc-version-markdown-kind-item{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;color:#333;gap:10px}.cc-version-markdown-kind-item+.cc-version-markdown-kind-item{margin-top:8px}.cc-version-markdown-kind-item.is-added .cc-version-markdown-kind-item-icon{color:#2ba24c}.cc-version-markdown-kind-item.is-changed .cc-version-markdown-kind-item-icon{color:#3b78c2}.cc-version-markdown-kind-item.is-fixed .cc-version-markdown-kind-item-icon{color:#d98d19}.cc-version-markdown-kind-item-text{min-width:0;padding-top:1px}.cc-version-markdown-heading{color:#202020;line-height:1.3;margin:0 0 12px}.cc-version-markdown-heading-1{font-size:21px}.cc-version-markdown-heading-2{font-size:18px;margin-top:8px}.cc-version-markdown-heading-3,.cc-version-markdown-heading-4{color:#333;font-size:15px}.cc-version-markdown-paragraph{color:#333;margin:0 0 14px}.cc-version-markdown-list{margin:0 0 16px 22px;padding:0}.cc-version-markdown-list li+li{margin-top:8px}.cc-version-markdown-rule{border:0;border-top:1px solid #ececec;margin:14px 0}.cc-version-markdown-pre{background:#f6f6f6;border-radius:8px;margin:0 0 12px;overflow:auto;padding:10px 12px}.cc-version-markdown-heading code,.cc-version-markdown-list code,.cc-version-markdown-paragraph code,.cc-version-markdown-pre code{font-family:Consolas,Courier New,monospace}.cc-version-markdown-heading code,.cc-version-markdown-list code,.cc-version-markdown-paragraph code{background:#f1f1f1;border-radius:5px;color:#333;font-size:.95em;padding:1px 5px}.cc-version-info-body a{color:#1f4f8f;text-decoration:none}.cc-version-info-body a:hover{text-decoration:underline}.cc-version-markdown-image{background:#fff;border:1px solid #ececec;border-radius:8px;display:block;height:auto;margin:16px auto 6px;max-width:100%}.cc-version-markdown-paragraph-image{text-align:center}body.cc-version-info-open{overflow:hidden}@media (max-width:768px){.cc-version-info-body{font-size:12.5px;padding:16px}.cc-version-info-meta,.cc-version-info-meta-cards{gap:10px}.cc-version-info-card{min-width:0}.cc-version-shortcut-item{gap:6px;grid-template-columns:1fr}.cc-version-changelog-section{padding:2px 0 0}.cc-version-markdown-heading-version{-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:start;-ms-flex-align:start;align-items:flex-start;gap:4px}}.cc-badge[role=button]{cursor:pointer}.cc-ratings-table-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.45);justify-content:center;padding:24px;z-index:10010}.cc-ratings-table-modal,.cc-ratings-table-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-ratings-table-modal{background:#fff;border-radius:12px;-webkit-box-shadow:0 16px 42px rgba(0,0,0,.28);box-shadow:0 16px 42px rgba(0,0,0,.28);max-height:calc(100vh - 48px);overflow:hidden;width:min(1080px,calc(100vw - 40px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-ratings-table-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:14px 16px}.cc-ratings-table-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-ratings-table-close:hover{background:#f1f1f1;color:#222}.cc-ratings-table-toolbar{-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #f0f0f0;gap:10px;justify-content:space-between;padding:10px 16px}.cc-ratings-table-search{border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;height:34px;line-height:34px;margin:0!important;padding:0 10px;width:min(440px,100%)}.cc-ratings-table-summary{color:#666;font-size:12px;margin-left:auto;white-space:nowrap}.cc-ratings-type-multiselect{position:relative;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-ratings-type-toggle{background:#fff;border:1px solid #d8d8d8;border-radius:8px;-webkit-box-sizing:border-box;box-sizing:border-box;color:#333;cursor:pointer;font-size:12px;height:34px;line-height:34px;max-width:280px;min-width:186px;overflow:hidden;padding:0 32px 0 10px;position:relative;text-align:left;text-overflow:ellipsis;text-transform:none!important;white-space:nowrap}.cc-ratings-type-toggle:after{color:#777;content:\"▼\";font-size:10px;position:absolute;right:10px;top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%)}.cc-ratings-type-menu{background:#fff;border:1px solid #ddd;border-radius:8px;-webkit-box-shadow:0 8px 22px rgba(0,0,0,.12);box-shadow:0 8px 22px rgba(0,0,0,.12);left:0;max-height:220px;min-width:180px;overflow:auto;padding:6px;position:absolute;top:calc(100% + 6px);z-index:3}.cc-ratings-type-menu label{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;border-radius:6px;cursor:pointer;font-size:12px;gap:7px;padding:6px 8px}.cc-ratings-type-menu label:hover{background:#f5f5f5}.cc-ratings-table-wrap{overflow:auto;padding:0 0 4px}.cc-ratings-table{border-collapse:collapse;table-layout:fixed;width:100%}.cc-ratings-table td,.cc-ratings-table th{border-bottom:1px solid #f0f0f0;font-size:12px;padding:10px 16px;vertical-align:top}.cc-ratings-table th{background:#fafafa;position:sticky;top:0;z-index:1}.cc-ratings-table th button{background:transparent;border:0;color:#333;cursor:pointer;font:inherit;font-weight:700;gap:6px;padding:0}.cc-ratings-table th button,.cc-sort-indicator{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-sort-indicator{-webkit-box-pack:center;-ms-flex-pack:center;color:#8a8a8a;font-size:10px;justify-content:center;min-width:12px}.cc-ratings-table th button.is-active .cc-sort-indicator{color:#aa2c16}.cc-ratings-table td:first-child,.cc-ratings-table th:first-child{width:40%}.cc-ratings-table td:nth-child(2),.cc-ratings-table th:nth-child(2){width:18%}.cc-ratings-table td:nth-child(3),.cc-ratings-table th:nth-child(3){width:10%}.cc-ratings-table td:nth-child(4),.cc-ratings-table th:nth-child(4){width:12%}.cc-ratings-table td:nth-child(5),.cc-ratings-table th:nth-child(5){width:20%}.cc-ratings-table-name-row{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;contain:layout paint;gap:8px;justify-content:space-between;width:100%}.cc-ratings-table-name-link{color:#1f4f8f;font-size:13px;font-weight:600;text-decoration:none;word-break:break-word;-webkit-box-flex:1;-ms-flex:1;flex:1}.cc-ratings-table-name-link:hover{text-decoration:underline}.cc-ratings-table-details-btn,.cc-ratings-table-link-icon{border:1px solid #cfcfcf;border-radius:6px;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:22px;width:22px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:#fff;justify-content:center;text-decoration:none;-webkit-box-flex:0;-moz-appearance:none;appearance:none;-webkit-appearance:none;color:#8a8a8a;cursor:pointer;-ms-flex:0 0 auto;flex:0 0 auto;padding:0;-webkit-transition:color .15s,background-color .15s,border-color .15s;transition:color .15s,background-color .15s,border-color .15s}.cc-ratings-table-details-btn:hover,.cc-ratings-table-link-icon:hover{background:#f3f3f3;border-color:#bcbcbc;color:#aa2c16}.cc-ratings-table-date,.cc-ratings-table-rating,.cc-ratings-table-year{white-space:nowrap}.cc-ratings-table-type{color:#444;white-space:nowrap}.cc-ratings-table-rating{color:#b8321d;font-size:13px;font-weight:700;letter-spacing:.2px}.cc-ratings-table-rating.is-odpad{color:#000;font-weight:700;letter-spacing:0}.cc-ratings-square{border-radius:2px;height:11px;width:11px;-webkit-box-flex:0;-ms-flex:0 0 11px;flex:0 0 11px;margin-right:2px}.cc-ratings-square.is-1{background:#465982}.cc-ratings-square.is-2{background:#5c6f96}.cc-ratings-square.is-3{background:#9a3d2b}.cc-ratings-square.is-4,.cc-ratings-square.is-5{background:#b8321d}.cc-ratings-square.is-unknown{background:#9a9a9a}.cc-ratings-table-empty{color:#7a7a7a;padding:18px 16px;text-align:center}body.cc-ratings-modal-open{overflow:hidden}.cc-rating-detail-overlay{display:none;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.32);justify-content:center;padding:20px;z-index:10011}.cc-rating-detail-card,.cc-rating-detail-overlay.is-open{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-rating-detail-card{background:#fff;border-radius:12px;-webkit-box-shadow:0 14px 38px rgba(0,0,0,.24);box-shadow:0 14px 38px rgba(0,0,0,.24);max-height:calc(100vh - 60px);overflow:hidden;width:min(760px,calc(100vw - 32px));-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column}.cc-rating-detail-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;border-bottom:1px solid #ececec;justify-content:space-between;padding:12px 14px}.cc-rating-detail-head h4{font-size:14px;font-weight:700;margin:0}.cc-rating-detail-close{background:transparent;border:0;border-radius:8px;color:#666;cursor:pointer;font-size:24px;height:28px;line-height:1;width:28px}.cc-rating-detail-close:hover{background:#f1f1f1;color:#222}.cc-rating-detail-body{overflow:auto;padding:8px 14px 12px}.cc-rating-detail-row{border-bottom:1px solid #f1f1f1;display:grid;gap:10px;grid-template-columns:180px 1fr;padding:8px 0}.cc-rating-detail-key{color:#666;font-size:12px;font-weight:600}.cc-rating-detail-value{color:#222;font-size:12px;white-space:pre-wrap;word-break:break-word}body.cc-menu-open .box-video,body.cc-menu-open .slick-list,body.cc-menu-open .slick-slider{pointer-events:none!important}.cc-sync-modal-overlay{background:rgba(0,0,0,.45);display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;opacity:0;pointer-events:none;-webkit-transition:opacity .18s ease,visibility .18s ease;transition:opacity .18s ease,visibility .18s ease;visibility:hidden;z-index:10002}.cc-sync-modal-overlay.visible{opacity:1;pointer-events:auto;visibility:visible}.cc-sync-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 10px 30px rgba(0,0,0,.22);box-shadow:0 10px 30px rgba(0,0,0,.22);max-width:calc(100vw - 30px);padding:14px;width:340px}.cc-sync-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;margin-bottom:8px}.cc-sync-modal-head h3{font-size:14px;margin:0}.cc-sync-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-sync-help{color:#444;font-size:12px;margin:0 0 10px}.cc-sync-toggle-row{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-size:12px;gap:6px;margin-bottom:10px}.cc-sync-label{color:#333;display:block;font-size:12px;margin-bottom:4px}.cc-sync-input{border:1px solid #d9d9d9;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:12px;padding:7px 8px;width:100%}.cc-sync-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:end;-ms-flex-pack:end;gap:8px;justify-content:flex-end;margin-top:12px}.cc-sync-note{color:#666;font-size:11px;margin-top:8px}.cc-lc-modal-overlay{display:-webkit-box;display:-ms-flexbox;display:flex;inset:0;position:fixed;z-index:10032;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background:rgba(0,0,0,.42);justify-content:center;opacity:0;padding:14px;pointer-events:none;-webkit-transition:opacity .16s ease,visibility .16s ease;transition:opacity .16s ease,visibility .16s ease;visibility:hidden}.cc-lc-modal-overlay.is-open{opacity:1;pointer-events:auto;visibility:visible}.cc-lc-modal{background:#fff;border-radius:10px;-webkit-box-shadow:0 18px 42px rgba(0,0,0,.28);box-shadow:0 18px 42px rgba(0,0,0,.28);display:grid;gap:8px;grid-template-rows:auto auto minmax(0,1fr) auto;height:min(80vh,700px);max-height:min(80vh,700px);padding:12px;width:min(720px,calc(100vw - 30px))}.cc-lc-modal-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.cc-lc-modal-head h3{font-size:14px;margin:0}.cc-lc-modal-close{background:transparent;border:0;color:#666;cursor:pointer;font-size:22px;line-height:1}.cc-lc-modal-help{color:#666;font-size:11px}.cc-lc-modal-body{border:1px solid #ededed;border-radius:8px;min-height:0;overflow:auto}.cc-lc-table{border-collapse:collapse;table-layout:fixed;width:100%}.cc-lc-table td,.cc-lc-table th{border-bottom:1px solid #f1f1f1;font-size:11px;padding:7px 8px;vertical-align:middle}.cc-lc-table th{background:#fafafa;position:sticky;text-align:left;top:0}.cc-lc-table td.cc-lc-key,.cc-lc-table th:first-child{width:33%}.cc-lc-table td.cc-lc-value,.cc-lc-table th:nth-child(2){width:45%}.cc-lc-table td.cc-lc-action,.cc-lc-table th:last-child{width:22%}.cc-lc-key,.cc-lc-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-lc-value-content{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;gap:8px;min-width:0}.cc-lc-value-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;-webkit-box-flex:1;-ms-flex:1;flex:1}.cc-lc-value-info{-webkit-box-flex:0;background:#fff;border:1px solid #cfcfcf;border-radius:6px;color:#8a8a8a;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-ms-flex:0 0 auto;flex:0 0 auto;height:22px;width:22px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;cursor:pointer;justify-content:center;line-height:1;padding:0;-webkit-transition:color .15s,background-color .15s,border-color .15s;transition:color .15s,background-color .15s,border-color .15s}.cc-lc-value-info:hover{background:#f3f3f3;border-color:#bcbcbc;color:#aa2c16}.cc-lc-group-row{background:-webkit-gradient(linear,left top,left bottom,from(#fcfcfc),to(#f3f3f3));background:linear-gradient(180deg,#fcfcfc,#f3f3f3);cursor:pointer}.cc-lc-group-row td{background:transparent;border-bottom-color:#e8e8e8}.cc-lc-group-row:hover td{background:rgba(170,44,22,.05)}.cc-lc-group-key{border-left:3px solid #aa2c16;padding-left:6px!important}.cc-lc-group-toggle{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;background:transparent;border:0;color:#333;cursor:pointer;font:inherit;font-weight:700;gap:6px;margin:0;padding:0;pointer-events:none}.cc-lc-group-toggle:hover{color:#aa2c16}.cc-lc-group-chevron{color:#888;text-align:center;width:10px}.cc-lc-group-summary{color:#666;font-weight:600}.cc-lc-group-label{letter-spacing:.03em;text-transform:uppercase}.cc-lc-key-child{padding-left:26px!important}.cc-lc-entry-row.is-group-child td{background:#fff}.cc-generic-detail-overlay{z-index:10033}.cc-detail-group{background:#fcfcfc;border:1px solid #ececec;border-radius:10px;margin-bottom:12px;overflow:hidden}.cc-detail-group:last-child{margin-bottom:0}.cc-detail-group-title{background:-webkit-gradient(linear,left top,left bottom,from(#fcfcfc),to(#f3f3f3));background:linear-gradient(180deg,#fcfcfc,#f3f3f3);border-left:3px solid #aa2c16;color:#333;font-size:12px;font-weight:700;letter-spacing:.03em;padding:10px 12px;text-transform:uppercase}.cc-detail-group-body{padding:0 12px}.cc-detail-group-body .cc-rating-detail-row:last-child{border-bottom:0}.cc-lc-table-empty{color:#757575;padding:10px;text-align:center}.cc-lc-modal-actions{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;gap:6px;justify-content:flex-end}.cc-lc-modal-body::-webkit-scrollbar,.cc-ratings-table-wrap::-webkit-scrollbar,.cc-version-info-body::-webkit-scrollbar{height:8px;width:8px}.cc-lc-modal-body::-webkit-scrollbar-track,.cc-ratings-table-wrap::-webkit-scrollbar-track,.cc-version-info-body::-webkit-scrollbar-track{background:transparent}.cc-lc-modal-body::-webkit-scrollbar-thumb,.cc-ratings-table-wrap::-webkit-scrollbar-thumb,.cc-version-info-body::-webkit-scrollbar-thumb{background:#ccc;border-radius:10px}.cc-lc-modal-body::-webkit-scrollbar-thumb:hover,.cc-ratings-table-wrap::-webkit-scrollbar-thumb:hover,.cc-version-info-body::-webkit-scrollbar-thumb:hover{background:#a8a8a8}.cc-pill-input-container{background:#fff;border:1px solid #d4d4d4;border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;cursor:text;display:-webkit-box;display:-ms-flexbox;display:flex;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px;min-height:32px;padding:5px 6px;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-pill-input-container.is-disabled{background:#f5f5f5;cursor:not-allowed}.cc-pills{display:-webkit-box;display:-ms-flexbox;display:flex;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:6px}.cc-pill{background:#aa2c16;border-radius:4px;color:#fff;font-size:12px;font-weight:600;line-height:1.2;padding:4px 8px}.cc-pill,.cc-pill-remove{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-pill-remove{cursor:pointer;font-size:16px;margin-left:6px;opacity:.7;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;line-height:1;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-pill-remove:hover{opacity:1}.cc-pill-input-container input{border:none!important;margin:0!important;outline:none!important;padding:0!important;-webkit-box-flex:1;background:transparent;color:#444;-ms-flex:1;flex:1;font-size:12px;min-width:80px}.cc-pill-input-container input:disabled{cursor:not-allowed}.cc-select-compact{-moz-appearance:none;appearance:none;-webkit-appearance:none;background-color:#fff;background-image:url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%23777777\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"></polyline></svg>');background-position:right 6px center;background-repeat:no-repeat;border:1px solid #d4d4d4;border-radius:5px;color:#444;cursor:pointer;font-family:inherit;font-size:11px;height:22px;outline:none;padding:0 20px 0 6px;-webkit-transition:border-color .15s ease,-webkit-box-shadow .15s ease;transition:border-color .15s ease,-webkit-box-shadow .15s ease;transition:border-color .15s ease,box-shadow .15s ease;transition:border-color .15s ease,box-shadow .15s ease,-webkit-box-shadow .15s ease}.cc-select-compact:focus,.cc-select-compact:hover{border-color:#bcbcbc}.cc-select-compact:focus{border-color:#aa2c16;-webkit-box-shadow:0 0 0 2px rgba(170,44,22,.15);box-shadow:0 0 0 2px rgba(170,44,22,.15)}.cc-setting-sub.is-disabled .cc-select-compact{background-color:#f5f5f5;cursor:not-allowed}.cc-requires-login{cursor:not-allowed!important;filter:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"filter\"><feColorMatrix type=\"matrix\" color-interpolation-filters=\"sRGB\" values=\"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0\" /></filter></svg>#filter');-webkit-filter:grayscale(100%);filter:grayscale(100%);opacity:.5}.cc-setting-group.cc-requires-login *,.cc-setting-row.cc-requires-login *{pointer-events:none}.cc-badge.cc-requires-login,.cc-button.cc-requires-login,.cc-sync-icon-btn.cc-requires-login{pointer-events:auto}.cc-badges-pill{border-radius:6px;-webkit-box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);margin-right:4px;overflow:hidden}.cc-badges-pill,.cc-badges-pill .cc-badge{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-badges-pill .cc-badge{border-radius:0;-webkit-box-sizing:border-box;box-sizing:border-box;font-size:11.2px;font-size:.7rem;height:auto;line-height:1.4;margin:0;padding:2px 6px}.cc-badges-pill .cc-badge-black{border-left:1px solid hsla(0,0%,100%,.25)}#cc-open-ratings-btn{margin-right:2px}.cc-ratings-table-toolbar{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-ms-flex-wrap:wrap;flex-wrap:wrap;gap:12px}.cc-ratings-table-toolbar .cc-ratings-table-search{-webkit-box-flex:1;-ms-flex:1 1 200px;flex:1 1 200px;margin:0!important;max-width:300px}.cc-toolbar-right{-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:end;-ms-flex-pack:end;gap:10px;justify-content:flex-end;-webkit-box-flex:1;-ms-flex:1 1 200px;flex:1 1 200px}.cc-ratings-scope-toggle,.cc-toolbar-right{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-ratings-scope-toggle{background:#eef0f2;border-radius:8px;gap:2px;margin:0 auto;padding:4px}.cc-ratings-scope-toggle button{background:transparent;border:none;border-radius:6px;color:#666;cursor:pointer;display:-webkit-box;display:-ms-flexbox;display:flex;font-size:12px;font-weight:600;padding:6px 16px;-webkit-transition:all .2s ease;transition:all .2s ease;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.cc-ratings-scope-toggle button:hover{color:#111}.cc-ratings-scope-toggle button.is-active[data-scope=all]{background:#fff;-webkit-box-shadow:0 1px 4px rgba(0,0,0,.1);box-shadow:0 1px 4px rgba(0,0,0,.1);color:#222}.cc-ratings-scope-toggle button.is-active[data-scope=direct]{background:#aa2c16;-webkit-box-shadow:0 2px 6px rgba(170,44,22,.3);box-shadow:0 2px 6px rgba(170,44,22,.3);color:#fff}.cc-ratings-scope-toggle button.is-active[data-scope=computed]{background:#000;-webkit-box-shadow:0 2px 6px rgba(0,0,0,.3);box-shadow:0 2px 6px rgba(0,0,0,.3);color:#fff}.cc-ratings-table-rating.is-computed{color:#000!important}.cc-ratings-square.is-computed{background:#000!important}.cc-grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.cc-ml-auto{margin-left:auto}.cc-own-rating{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;margin-left:8px;vertical-align:middle;-webkit-box-align:center;-ms-flex-align:center;align-items:center;line-height:1}.cc-own-rating-inline{display:inline;white-space:nowrap}.cc-own-rating-inline>.cc-own-rating{margin-left:0}.cc-own-rating-foreign-profile,span.comment .cc-own-rating{border:1px solid rgba(53,52,52,.5);border-radius:6px;-webkit-box-sizing:border-box;box-sizing:border-box;display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;height:20px;margin-right:3px;overflow:hidden;padding:0 5px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;vertical-align:middle}.article-news-content.article-content-justify li .cc-own-rating,.article-news-content.article-content-justify li .cc-own-rating-foreign-profile,.article-news-content.article-content-justify p .cc-own-rating,.article-news-content.article-content-justify p .cc-own-rating-foreign-profile,.diary-post p .cc-own-rating,.diary-post p .cc-own-rating-foreign-profile,.favorite-users-ratings .article-content-reviewtext li .cc-own-rating,.favorite-users-ratings .article-content-reviewtext li .cc-own-rating-foreign-profile,.favorite-users-ratings .article-content-reviewtext p .cc-own-rating,.favorite-users-ratings .article-content-reviewtext p .cc-own-rating-foreign-profile,article.article-forum .article-content.article-content-icons li .cc-own-rating,article.article-forum .article-content.article-content-icons li .cc-own-rating-foreign-profile,article.article-forum .article-content.article-content-icons p .cc-own-rating,article.article-forum .article-content.article-content-icons p .cc-own-rating-foreign-profile,span.comment .cc-own-rating,span.comment .cc-own-rating-foreign-profile{margin-top:-3px}div.plot-full .cc-own-rating,div.plot-preview .cc-own-rating{margin-top:-4px}.cc-own-rating-computed .stars:before{color:#d2d2d2}.cc-own-rating-computed-count{color:#7b7b7b;font-size:9px;line-height:1;margin-left:3px;top:-.4em;vertical-align:super}h3.film-title-inline .cc-own-rating{margin-top:-10px;-webkit-transform:translateY(-1px);transform:translateY(-1px)}.cc-ratings-table-export{cursor:pointer;font-size:11px;margin-left:auto;padding:5px 7px;text-align:center}.cc-my-rating-cell,.cc-my-rating-col{text-align:center;width:64px}.cc-my-rating-cell{white-space:nowrap}.cc-my-rating-cell .cc-own-rating{margin-left:0}.cc-compare-ratings-table{width:calc(100% + 24px)}.article-header{padding-top:2px}.cc-gallery-size-host{position:relative}.cc-gallery-size-links{bottom:8px;display:none;position:absolute;right:8px;-webkit-box-orient:vertical;-webkit-box-direction:normal;-ms-flex-direction:column;flex-direction:column;-webkit-box-align:end;-ms-flex-align:end;align-items:flex-end;gap:4px;z-index:11}.cc-gallery-size-host:hover .cc-gallery-size-links,.cc-gallery-size-links.is-visible,.cc-gallery-size-links:hover{display:-webkit-box;display:-ms-flexbox;display:flex}.cc-gallery-size-link{background-color:hsla(0,100%,98%,.82);border-radius:5px;color:#222;display:inline-block;font-size:11px;font-weight:700;line-height:1.2;min-width:48px;padding:2px 6px;text-align:center;text-decoration:none}.cc-gallery-size-link:hover{text-decoration:underline}.cc-link-icon{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;height:16px;justify-content:center;line-height:1;-webkit-transform:translateY(-1px);transform:translateY(-1px);vertical-align:middle;width:16px}.cc-link-icon-italic{-webkit-transform:translateY(-1.5px);transform:translateY(-1.5px)}.cc-link-icon-inline{display:inline;vertical-align:baseline}.cc-link-icon-inline-after,.cc-link-icon-inline-before{white-space:nowrap}.cc-link-icon-inline>a.cc-link-icon-target{white-space:normal}.cc-link-icon-before{margin-right:4px}.cc-link-icon-after{margin-left:4px;margin-right:0}.cc-link-icon svg{display:block;height:100%;width:100%}.cc-hover-preview{left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:translateY(2px);transform:translateY(2px);-webkit-transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,transform .12s ease;transition:opacity .12s ease,transform .12s ease,-webkit-transform .12s ease;z-index:10030}.cc-hover-preview.is-visible{opacity:1;-webkit-transform:translateY(0);transform:translateY(0)}.cc-hover-preview-loading{height:16px;left:0;opacity:0;pointer-events:none;position:fixed;top:0;-webkit-transform:scale(.85);transform:scale(.85);-webkit-transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,-webkit-transform .12s ease;transition:opacity .12s ease,transform .12s ease;transition:opacity .12s ease,transform .12s ease,-webkit-transform .12s ease;width:16px;z-index:10040}.cc-hover-preview-loading.is-visible{opacity:1;-webkit-transform:scale(1);transform:scale(1)}.cc-hover-preview-loading-dot{-webkit-animation:cc-hover-preview-spin .7s linear infinite;animation:cc-hover-preview-spin .7s linear infinite;background:hsla(0,0%,100%,.82);border:2px solid rgba(186,3,5,.18);border-radius:50%;border-top-color:#ba0305;-webkit-box-sizing:border-box;box-sizing:border-box;display:block;height:100%;width:100%}@-webkit-keyframes cc-hover-preview-spin{0%{-webkit-transform:rotate(0deg);transform:rotate(0deg)}to{-webkit-transform:rotate(1turn);transform:rotate(1turn)}}@keyframes cc-hover-preview-spin{0%{-webkit-transform:rotate(0deg);transform:rotate(0deg)}to{-webkit-transform:rotate(1turn);transform:rotate(1turn)}}.cc-hover-preview.is-frozen{pointer-events:auto}.cc-hover-preview.is-frozen .cc-hover-preview-title,.cc-hover-preview.is-frozen .cc-hover-preview-top{cursor:-webkit-grab;cursor:grab}.cc-hover-preview.is-frozen.is-dragging .cc-hover-preview-title,.cc-hover-preview.is-frozen.is-dragging .cc-hover-preview-top{cursor:-webkit-grabbing;cursor:grabbing}.cc-hover-preview-card{background:hsla(0,0%,98%,.98);border:1px solid hsla(0,0%,50%,.35);border-radius:10px;-webkit-box-shadow:0 8px 20px rgba(0,0,0,.2);box-shadow:0 8px 20px rgba(0,0,0,.2);overflow:hidden;position:relative;width:188px}.cc-hover-preview.is-stack-leader .cc-hover-preview-card{border-color:rgba(186,3,5,.55);-webkit-box-shadow:0 10px 24px rgba(0,0,0,.24),0 0 0 2px rgba(186,3,5,.16);box-shadow:0 10px 24px rgba(0,0,0,.24),0 0 0 2px rgba(186,3,5,.16)}.cc-hover-preview.is-stack-leader .cc-hover-preview-card:after{background:#ba0305;border-radius:50%;-webkit-box-shadow:0 0 0 3px hsla(0,0%,100%,.88);box-shadow:0 0 0 3px hsla(0,0%,100%,.88);content:\"\";height:8px;position:absolute;right:10px;top:10px;width:8px}.cc-hover-preview-card.is-film{width:230px}.cc-hover-preview-top{background:hsla(0,0%,98%,.98);border-bottom:1px solid rgba(0,0,0,.06);padding:6px 8px 4px}.cc-hover-preview-image{background-color:#fafafa;display:block;height:210px;-o-object-fit:contain;object-fit:contain;-o-object-position:center center;object-position:center center;width:100%}.cc-hover-preview-card.is-film .cc-hover-preview-image{border-radius:4px;height:286px;margin:6px auto 0;width:calc(100% - 12px)}.cc-hover-preview-card.is-user .cc-hover-preview-image{border-radius:6px;height:165px;margin:4px auto 0;-o-object-fit:cover;object-fit:cover;width:124px}.cc-hover-preview-image.empty-image{background-image:url(https://static.pmgstatic.com/assets/images/39d04896278fe3eb71998df70adadd40/empty-image.svg);background-position:50%;background-repeat:no-repeat;background-size:contain}.cc-hover-preview-card.is-film .cc-hover-preview-image.empty-image{background-color:#c4c4c4}.cc-hover-preview-title{color:#303030;display:-webkit-box;display:-ms-flexbox;display:flex;font-size:12px;font-weight:600;line-height:1.2;padding:8px 8px 9px;text-align:center;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;gap:4px;justify-content:center;white-space:normal}.cc-hover-preview-card.is-film .cc-hover-preview-title{padding-inline:28px;padding-top:12px;position:relative}.cc-hover-preview-title-flag{height:auto;width:14px;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}.cc-hover-preview-meta{background:hsla(0,0%,98%,.92);border-top:1px solid rgba(0,0,0,.06);padding:0 8px 9px}.cc-hover-preview-line{color:#434343;font-size:11px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:normal}.cc-hover-preview-line+.cc-hover-preview-line{margin-top:2px}.cc-hover-preview-line.is-primary{color:#2f2f2f;font-size:12px;font-weight:600;line-height:1.4}.cc-hover-preview-inline-note{color:#666;font-size:11px;font-weight:500}.cc-hover-preview-line.is-center{text-align:center}.cc-hover-preview-line.is-rating{color:#ba0305;font-size:16px;font-weight:700;text-align:center}.cc-hover-preview-line.is-user-points{font-size:15px}.cc-hover-preview-label-strong{color:#3c3c3c;font-weight:700}.cc-hover-preview-line.is-strong{color:#303030;font-size:11px;font-weight:600}.cc-hover-preview-line.is-muted{color:#5b5b5b}.cc-hover-preview-line.is-small{font-size:10px}.cc-hover-preview-label{color:#2f2f2f;font-weight:600}.cc-hover-preview-clamp-2{display:-webkit-inline-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;max-width:100%;overflow:hidden;vertical-align:top}.cc-hover-preview-link{color:#8f1f12;text-decoration:none}.cc-hover-preview-link:hover{text-decoration:underline}.cc-hover-preview-poster-nav{background:rgba(186,3,5,.92);border:none;border-radius:50%;color:#fff;cursor:pointer;display:none;font-size:0;height:24px;line-height:1;position:absolute;top:-16px;width:24px;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;padding:0}.cc-hover-preview-poster-nav i{font-size:12px;line-height:1}.cc-hover-preview.is-frozen .cc-hover-preview-poster-nav{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex}.cc-hover-preview-poster-nav.is-prev{left:8px}.cc-hover-preview-poster-nav.is-next{right:8px}.cc-hover-preview-poster-index{background:hsla(0,0%,98%,.96);border-radius:8px;color:#707070;display:none;font-size:10px;font-weight:500;left:50%;padding:0 4px;position:absolute;top:-10px;-webkit-transform:translateX(-50%);transform:translateX(-50%)}.cc-hover-preview.is-frozen .cc-hover-preview-poster-index{display:inline-block}.cc-hover-preview-divider.is-subtle{margin-bottom:6px;margin-top:6px;width:48%}.cc-hover-preview-secondary{z-index:10031}.cc-hover-preview-divider{background:rgba(0,0,0,.09);height:1px;margin:5px auto 4px;width:58%}.cc-hover-preview-stats{-webkit-box-pack:justify;-ms-flex-pack:justify;gap:10px;justify-content:space-between}.cc-hover-preview-stat,.cc-hover-preview-stats{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline}.cc-hover-preview-stat{gap:4px;min-width:0}.cc-hover-preview-stat.is-primary{color:#ba0305;font-weight:700}.cc-hover-preview-stat.is-secondary{color:#5b5b5b}.cc-hover-preview-stat.is-wide{margin:0 auto}.cc-hover-preview-stat-value{font-size:14px;font-weight:700;line-height:1}.cc-hover-preview-stat-label{font-size:11px;line-height:1.1;white-space:nowrap}.cc-hover-preview-line.is-photo{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:baseline;-ms-flex-align:baseline;align-items:baseline;color:#505050;font-weight:600;gap:6px;min-width:0}.cc-hover-preview-line.is-photo:before{content:\"🎬\";line-height:1;margin-right:2px}.cc-hover-preview-line.is-photo.is-copyright:before{content:\"©\";font-weight:700}.cc-hover-preview-photo-source{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-hover-preview-line.is-photo.is-movie{color:#ba0305}.cc-hover-preview-line.is-photo.is-movie .cc-hover-preview-photo-source{line-height:1;white-space:nowrap}.cc-hover-preview-line.is-photo.is-copyright{color:#4c4c4c}.cc-hover-preview-line.is-photo.is-copyright .cc-hover-preview-photo-source{display:-webkit-box;overflow:hidden;text-overflow:clip;white-space:normal;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical}nav.tab-nav.cc-show-all-tabs{padding-right:0!important}nav.tab-nav.cc-show-all-tabs .tab-nav-list{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center;list-style:none;margin:0;padding:0;width:100%}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item{-webkit-box-flex:1;-ms-flex:1 1 auto;flex:1 1 auto;min-width:0;top:-4px}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-nav-item.active{top:0}nav.tab-nav.cc-show-all-tabs .tab-nav-list .tab-link{display:block;overflow:hidden;padding:0 5px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.cc-hide-panel-btn,.cc-hide-video-btn{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-ms-flex-pack:center;background-color:#ba0305;border:none;border-radius:4px;-webkit-box-sizing:border-box;box-sizing:border-box;color:#fff!important;cursor:pointer;font-size:10px;font-weight:700;justify-content:center;line-height:1;opacity:0;padding:3px 8px;text-transform:uppercase;-webkit-transition:opacity .2s ease,background-color .2s ease;transition:opacity .2s ease,background-color .2s ease}.cc-hide-panel-btn:hover,.cc-hide-video-btn:hover{background-color:#8b0204}.box-header:hover .cc-hide-panel-btn,.updated-box-banner-mobile:hover .cc-hide-panel-btn,.updated-box-banner:hover .cc-hide-panel-btn,.updated-box-header:hover .cc-hide-panel-btn,.updated-box-homepage-video:hover .cc-hide-video-btn{opacity:1}.cc-hide-panel-btn{margin-left:12px;-webkit-transform:translateY(-2px);transform:translateY(-2px);vertical-align:middle}.cc-hide-video-btn{-webkit-box-shadow:0 2px 8px rgba(0,0,0,.3);box-shadow:0 2px 8px rgba(0,0,0,.3);left:10px;position:absolute;top:10px;z-index:10000}.updated-box--homepage-csfd-cinema .updated-box-header p{display:-webkit-inline-box;display:-ms-inline-flexbox;display:inline-flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;overflow:visible!important;position:relative;z-index:10}.updated-box--homepage-csfd-cinema .cc-hide-panel-btn{-webkit-box-shadow:0 1px 4px rgba(0,0,0,.15);box-shadow:0 1px 4px rgba(0,0,0,.15);-webkit-transform:translateY(0);transform:translateY(0)}body:not(.cc-panels-feature-enabled) .cc-hide-panel-btn,body:not(.cc-panels-feature-enabled) .cc-hide-video-btn{display:none!important}.discussion-list .td-title{width:90%!important}.discussion-list .td-info{text-align:right;white-space:nowrap;width:30%!important}.film-title-ellipsis .cc-own-rating,.film-title-ellipsis .cc-own-rating-foreign-profile{margin-top:-5px}header.article-header>h3>span.cc-own-rating-foreign-profile{margin-left:15px;margin-top:-6px}.cc-compare-ratings-table .cc-own-rating-foreign-profile{margin-top:-4px}.time-rating{display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;-webkit-box-align:center!important;-ms-flex-align:center!important;align-items:center!important;white-space:nowrap!important}.time-rating .cc-own-rating{line-height:1;margin-left:6px}.box-item:has(.time-rating .cc-own-rating),:not(.program)>.program-item:has(.cc-own-rating){display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;-webkit-box-align:start!important;-ms-flex-align:start!important;align-items:flex-start!important}.box-item:has(.time-rating .cc-own-rating) .time-rating,:not(.program)>.program-item:has(.cc-own-rating)>.time-rating{float:none!important;width:auto!important;-ms-flex-negative:0!important;flex-shrink:0!important;padding-right:12px!important}.box-item:has(.time-rating .cc-own-rating) .inner,:not(.program)>.program-item:has(.cc-own-rating)>.inner{margin-left:0!important;-webkit-box-flex:1!important;-ms-flex-positive:1!important;flex-grow:1!important;min-width:0!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav{padding-right:0!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-list,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-list,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-list{display:-webkit-box!important;display:-ms-flexbox!important;display:flex!important;-ms-flex-wrap:nowrap!important;flex-wrap:nowrap!important;-webkit-box-pack:justify!important;-ms-flex-pack:justify!important;justify-content:space-between!important;overflow:hidden!important;width:100%!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-list .tab-nav-item,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-list .tab-nav-item,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-list .tab-nav-item{display:block!important;opacity:1!important;visibility:visible!important;-webkit-box-flex:1!important;-ms-flex:1 1 auto!important;flex:1 1 auto!important;min-width:0!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-list .tab-link,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-list .tab-link,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-list .tab-link{display:block!important;overflow:hidden!important;padding-left:4px!important;padding-right:4px!important;text-align:center!important;text-overflow:ellipsis!important;white-space:nowrap!important}body.cc-show-all-tabs-enabled .creator nav.tab-nav .tab-nav-more,body.cc-show-all-tabs-enabled .creator-about nav.tab-nav .tab-nav-more,body.cc-show-all-tabs-enabled .creator-profile nav.tab-nav .tab-nav-more{display:none!important}";
  styleInject(css_248z);

  var htmlContent = "<svg style=\"display: none;\" xmlns=\"http://www.w3.org/2000/svg\">\r\n    <symbol id=\"cc-icon-info\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\r\n        <line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line>\r\n        <line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-image\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>\r\n        <circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"></circle>\r\n        <polyline points=\"21 15 16 10 5 21\"></polyline>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-menu-logo\" viewBox=\"0 0 24 24\" fill=\"none\">\r\n        <text x=\"12\" y=\"12\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"currentColor\" font-size=\"11\"\r\n            font-weight=\"800\" letter-spacing=\"0.2\">CC</text>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-download\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path>\r\n        <polyline points=\"7 10 12 15 17 10\"></polyline>\r\n        <line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-star\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <polygon\r\n            points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\">\r\n        </polygon>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-cloud\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <path d=\"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z\"></path>\r\n    </symbol>\r\n    <symbol id=\"cc-icon-chevron\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\r\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <polyline points=\"6 9 12 15 18 9\"></polyline>\r\n    </symbol>\r\n</svg>\r\n\r\n<a href=\"javascript:void(0)\" rel=\"dropdownContent\" class=\"user-link csfd-compare-menu initialized\">\r\n    <svg class=\"cc-menu-icon\" width=\"24\" height=\"24\">\r\n        <use href=\"#cc-icon-menu-logo\"></use>\r\n    </svg>\r\n</a>\r\n\r\n<div id=\"dropdown-compare-menu\" class=\"dropdown-content cc-settings\">\r\n    <div class=\"cc-settings-shell\">\r\n        <div class=\"cc-settings-shell-head\">\r\n            <div class=\"dropdown-content-head\">\r\n                <div class=\"left-head\">\r\n                    <h2>CSFD-Compare</h2>\r\n                    <div class=\"cc-version-row\">\r\n                        <a class=\"cc-version-link\" id=\"cc-version-value\"\r\n                            href=\"https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare\" target=\"_blank\"\r\n                            rel=\"noopener noreferrer\">v0.9.0</a>\r\n                        <span class=\"cc-version-status\" id=\"cc-version-status\" aria-hidden=\"true\"></span>\r\n                    </div>\r\n                </div>\r\n                <div class=\"right-head cc-ml-auto cc-head-right\">\r\n                    <div class=\"cc-head-tools\">\r\n                        <div class=\"cc-badges-pill\" title=\"Tvá uložená hodnocení\">\r\n                            <span id=\"cc-badge-red\" class=\"cc-badge cc-badge-red\" tabindex=\"0\" role=\"button\"\r\n                                title=\"Uloženo / Celkem: Počet přímo načtených hodnocení\">0 / 0</span>\r\n                            <span id=\"cc-badge-black\" class=\"cc-badge cc-badge-black\" tabindex=\"0\" role=\"button\"\r\n                                title=\"Spočtená hodnocení: Počet hodnocení automaticky dopočítaných pro seriály\">0</span>\r\n                        </div>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn\" id=\"cc-open-ratings-btn\"\r\n                            aria-label=\"Tabulka hodnocení\" title=\"Zobrazit tabulku všech hodnocení\">\r\n                            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <line x1=\"8\" y1=\"6\" x2=\"21\" y2=\"6\"></line>\r\n                                <line x1=\"8\" y1=\"12\" x2=\"21\" y2=\"12\"></line>\r\n                                <line x1=\"8\" y1=\"18\" x2=\"21\" y2=\"18\"></line>\r\n                                <line x1=\"3\" y1=\"6\" x2=\"3.01\" y2=\"6\"></line>\r\n                                <line x1=\"3\" y1=\"12\" x2=\"3.01\" y2=\"12\"></line>\r\n                                <line x1=\"3\" y1=\"18\" x2=\"3.01\" y2=\"18\"></line>\r\n                            </svg>\r\n                        </button>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn\" id=\"cc-sync-cloud-btn\"\r\n                            title=\"Synchronizace s cloudem\">\r\n                            <svg width=\"14\" height=\"14\">\r\n                                <use href=\"#cc-icon-cloud\"></use>\r\n                            </svg>\r\n                        </button>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn cc-version-info-btn\" id=\"cc-version-info-btn\"\r\n                            title=\"Informace o verzi\">\r\n                            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\r\n                                <line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line>\r\n                                <line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>\r\n                            </svg>\r\n                        </button>\r\n\r\n                        <button type=\"button\" class=\"cc-sync-icon-btn cc-settings-pin-close\"\r\n                            id=\"cc-settings-pinned-close-btn\" title=\"Zavřít připnuté menu\"\r\n                            aria-label=\"Zavřít připnuté menu\">\r\n                            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n                                stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n                                <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line>\r\n                                <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line>\r\n                            </svg>\r\n                        </button>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n\r\n            <div class=\"cc-settings-section\">\r\n                <div class=\"cc-settings-section-content\">\r\n                    <div class=\"cc-settings-actions\">\r\n                        <button id=\"cc-load-ratings-btn\" class=\"cc-button cc-button-red cc-grow cc-button-iconed\"\r\n                            title=\"Projde váš profil a stáhne všechna vaše hodnocení do lokální databáze (nutné pro správné fungování ostatních funkcí).\">\r\n                            <span class=\"cc-button-icon\" aria-hidden=\"true\"><svg width=\"14\" height=\"14\">\r\n                                    <use href=\"#cc-icon-download\"></use>\r\n                                </svg></span>\r\n                            <span>Načíst hodnocení</span>\r\n                        </button>\r\n                        <button id=\"cc-load-computed-btn\" class=\"cc-button cc-button-black cc-button-iconed\"\r\n                            title=\"Z načtených hodnocení automaticky vypočítá a doplní hodnocení pro celé seriály nebo jejich série.\">\r\n                            <span class=\"cc-button-icon\" aria-hidden=\"true\"><svg width=\"14\" height=\"14\">\r\n                                    <use href=\"#cc-icon-star\"></use>\r\n                                </svg></span>\r\n                            <span>Načíst spočtené</span>\r\n                        </button>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n\r\n        <div class=\"cc-settings-shell-body\">\r\n            <div class=\"cc-settings-scroll-region\">\r\n                <div class=\"cc-settings-section\" hidden>\r\n                    <div class=\"cc-settings-section-content\">\r\n                        <div id=\"cc-ratings-progress\" class=\"cc-ratings-progress\" hidden>\r\n                            <div class=\"cc-ratings-progress-head\">\r\n                                <span id=\"cc-ratings-progress-label\">Připravuji načítání…</span>\r\n                                <span id=\"cc-ratings-progress-count\">0 / 0</span>\r\n                            </div>\r\n                            <div class=\"cc-ratings-progress-track\">\r\n                                <div id=\"cc-ratings-progress-bar\" class=\"cc-ratings-progress-bar\" style=\"width: 0%\">\r\n                                </div>\r\n                            </div>\r\n                            <div class=\"cc-ratings-progress-actions\">\r\n                                <button id=\"cc-cancel-ratings-loader-btn\" class=\"cc-ratings-cancel-link\" hidden>Zrušit\r\n                                    načítání</button>\r\n                            </div>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"cc-settings-section\">\r\n                    <div class=\"cc-settings-section-content\" style=\"padding-top: 8px;\"\r\n                        id=\"cc-dynamic-settings-container\">\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n\r\n        <div class=\"cc-settings-shell-foot\">\r\n            <div class=\"cc-settings-section\">\r\n                <div class=\"cc-settings-section-content\">\r\n                    <h3 class=\"cc-section-title\" style=\"margin-top: 0;\">Další akce</h3>\r\n                    <div class=\"cc-maint-actions\" style=\"width: 100%;\">\r\n                        <button type=\"button\" class=\"cc-button cc-button-black cc-button-small\" id=\"cc-maint-reset-btn\"\r\n                            title=\"Vrátí veškeré přepínače a nastavení tohoto doplňku (včetně skrytých uživatelů) do původního, výchozího stavu.\">\r\n                            Reset\r\n                        </button>\r\n                        <button type=\"button\" class=\"cc-button cc-button-red cc-button-small cc-dev-only\"\r\n                            id=\"cc-maint-clear-lc-btn\" title=\"Otevře okno pro manuální smazání dat z LocalStorage.\">\r\n                            LC\r\n                        </button>\r\n                        <button type=\"button\" class=\"cc-button cc-button-red cc-button-small cc-dev-only\"\r\n                            id=\"cc-maint-clear-db-btn\"\r\n                            title=\"Smaže lokální CC hodnocení (IndexedDB). CSFD.cz hodnocení zůstanou nedotčena.\">\r\n                            Smazat DB\r\n                        </button>\r\n\r\n                        <div style=\"flex-grow: 1;\"></div>\r\n\r\n                        <button type=\"button\" class=\"cc-button cc-button-black cc-button-small\" id=\"cc-maint-dev-btn\"\r\n                            title=\"Zapne/vypne vývojářský režim (skryje nebo zobrazí testovací prvky).\">DEV:\r\n                            OFF</button>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n\r\n</div>";

  const DEFAULT_MAX_PAGES = 0; // 0 means no limit, load all available pages
  const REQUEST_DELAY_MIN_MS = 250;
  const REQUEST_DELAY_MAX_MS = 550;
  const LOADER_STATE_STORAGE_KEY = 'cc_ratings_loader_state_v1';
  const COMPUTED_LOADER_STATE_STORAGE_KEY = 'cc_computed_loader_state_v1';
  const PROFILE_LINK_SELECTOR$2 =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

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
    const profileEl = document.querySelector(PROFILE_LINK_SELECTOR$2);
    if (!profileEl) {
      return undefined;
    }
    return normalizeProfilePath(profileEl.getAttribute('href'));
  }

  function getRatingsSegment() {
    return location.hostname.endsWith('.sk') ? 'hodnotenia' : 'hodnoceni';
  }

  function extractUserSlugFromProfilePath(profilePath) {
    const match = profilePath?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
  }

  function buildRatingsPageUrl(profilePath, pageNumber = 1) {
    return buildRatingsPageUrlWithMode(profilePath, pageNumber, 'path');
  }

  function buildRatingsPageUrlWithMode(profilePath, pageNumber = 1, mode = 'path') {
    const ratingsSegment = getRatingsSegment();
    const basePath = profilePath.replace(/\/(prehled|prehlad)\/?$/i, `/${ratingsSegment}/`);
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
    const normalized = (rawType || '').trim().toLowerCase();
    if (!normalized) return 'movie';
    if (normalized.includes('epizoda')) return 'episode';
    if (normalized.includes('seriál') || normalized.includes('serial')) return 'serial';
    if (normalized.startsWith('série') || normalized.startsWith('serie')) return 'series';
    if (normalized.includes('film')) return 'movie';
    return normalized;
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
    if (!starsEl) {
      return NaN;
    }

    if (starsEl.classList.contains('trash')) {
      return 0;
    }

    const starClass = Array.from(starsEl.classList).find((className) => /^stars-\d$/.test(className));
    if (!starClass) {
      return NaN;
    }

    return Number.parseInt(starClass.replace('stars-', ''), 10);
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
    if (typeText.includes('epizoda')) return 'episode';
    if (typeText.includes('seriál') || typeText.includes('serial')) return 'serial';
    if (typeText.includes('série') || typeText.includes('serie')) return 'series';
    return 'movie';
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
    return new URL(`/film/${parentSlug}/recenze/`, location.origin).toString();
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
    ['fixed', 'is-fixed'],
  ]);
  const CHANGELOG_KIND_LABELS = new Map([
    ['is-added', 'Novinka'],
    ['is-changed', 'Uprava'],
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
    const cached = getCachedChangelogData();
    if (cached) {
      return cached;
    }

    return fetchRepoChangelogData();
  }

  function resolveMarkdownUrl(url, baseUrl) {
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) {
      return '';
    }

    try {
      return new URL(trimmedUrl, baseUrl).href;
    } catch {
      return trimmedUrl;
    }
  }

  function createCodePlaceholder(index) {
    return `@@CC_CODE_${index}@@`;
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

  function renderChangelogKindItems(kindClass, items, baseUrl) {
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
              <span class="cc-version-markdown-kind-item-text">${renderInlineMarkdown(item, baseUrl)}</span>
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

  function renderInlineMarkdown(text, baseUrl) {
    const codeSegments = [];
    let output = String(text || '').replace(/`([^`]+)`/g, (_, code) => {
      const placeholder = createCodePlaceholder(codeSegments.length);
      codeSegments.push(`<code>${escapeHtml(code)}</code>`);
      return placeholder;
    });

    output = escapeHtml(output);
    output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, alt, url, title) => {
      const resolvedUrl = resolveMarkdownUrl(url, baseUrl);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img class="cc-version-markdown-image" src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy" referrerpolicy="no-referrer" />`;
    });
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, label, url, title) => {
      const resolvedUrl = resolveMarkdownUrl(url, baseUrl);
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

  function renderMarkdownToHtml(markdown, baseUrl = GITHUB_CHANGELOG_BASE_URL) {
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
          `<h${level} class="cc-version-markdown-heading cc-version-markdown-heading-${level}">${renderInlineMarkdown(headingMatch[2], baseUrl)}</h${level}>`,
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
          htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl));
          continue;
        }

        htmlParts.push(
          `<ul class="cc-version-markdown-list">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl)}</li>`).join('')}</ul>`,
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
          htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl));
          continue;
        }

        htmlParts.push(
          `<ol class="cc-version-markdown-list cc-version-markdown-list-ordered">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl)}</li>`).join('')}</ol>`,
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
          `<p class="cc-version-markdown-paragraph cc-version-markdown-paragraph-image">${renderInlineMarkdown(paragraphText, baseUrl)}</p>`,
        );
        continue;
      }

      if (currentKindClass) {
        htmlParts.push(renderChangelogKindItems(currentKindClass, paragraphLines, baseUrl));
        continue;
      }

      htmlParts.push(
        `<p class="cc-version-markdown-paragraph">${renderInlineMarkdown(paragraphLines.join('<br />'), baseUrl)}</p>`,
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

  function buildChangelogHtml(markdown, baseUrl, fromVersion, toVersion) {
    const sections = selectChangelogSectionsForRange(markdown, fromVersion, toVersion);
    if (sections.length === 0) {
      return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
    }

    return sections
      .map(
        (section) =>
          `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl)}</section>`,
      )
      .join('');
  }

  function buildFullChangelogHtml(markdown, baseUrl) {
    if (!String(markdown || '').trim()) {
      return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
    }

    const sections = extractVersionSectionsFromMarkdown(markdown);
    if (sections.length === 0) {
      return `<section class="cc-version-changelog-section">${renderMarkdownToHtml(markdown, baseUrl)}</section>`;
    }

    return sections
      .map(
        (section) =>
          `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl)}</section>`,
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
      : buildFullChangelogHtml(changelogData?.markdown, changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL);

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
      : buildFullChangelogHtml(changelogData?.markdown, changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL);
    return `
    ${buildInstalledOnlyMetaHtml(currentVersion)}
    ${shortcutsHtml}
    <h4 class="cc-version-info-section-title">Changelog</h4>
    ${changelogHtml}
  `;
  }

  function setVersionStatus(versionStatusEl, state, latestVersion) {
    if (!versionStatusEl) {
      return;
    }

    versionStatusEl.className = 'cc-version-status';
    versionStatusEl.textContent = '';
    versionStatusEl.removeAttribute('title');

    if (state === 'hidden') {
      return;
    }

    versionStatusEl.classList.add('is-visible');

    if (state === 'checking') {
      versionStatusEl.classList.add('is-checking');
      versionStatusEl.title = 'Kontroluji aktualizaci…';
      return;
    }

    if (state === 'ok') {
      versionStatusEl.classList.add('is-ok');
      versionStatusEl.title = 'Používáte aktuální verzi.';
      return;
    }

    if (state === 'update') {
      versionStatusEl.classList.add('is-update');
      versionStatusEl.textContent = '↑';
      versionStatusEl.title = `K dispozici je nová verze: ${latestVersion}`;
      return;
    }

    versionStatusEl.classList.add('is-error');
    versionStatusEl.title = 'Aktualizaci se nepodařilo ověřit.';
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
    const currentVersion = getCurrentMenuVersion(menuRootElement);
    if (!versionStatusEl || !currentVersion) {
      setVersionStatus(versionStatusEl, 'hidden');
      return;
    }

    maybeShowUpdatedVersionModal(menuRootElement).catch(() => undefined);

    setVersionStatus(versionStatusEl, 'checking');

    const cached = getCachedUpdateInfo();
    if (cached?.latestVersion) {
      const isUpdateAvailable = compareVersions(cached.latestVersion, currentVersion) > 0;
      setVersionStatus(versionStatusEl, isUpdateAvailable ? 'update' : 'ok', cached.latestVersion);
      return;
    }

    try {
      const latestVersion = await fetchLatestScriptVersion();
      setCachedUpdateInfo(latestVersion);
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      setVersionStatus(versionStatusEl, isUpdateAvailable ? 'update' : 'ok', latestVersion);
    } catch {
      setVersionStatus(versionStatusEl, 'error');
    }
  }

  const PROFILE_LINK_SELECTOR$1 =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

  function getCurrentUserSlugFromProfile() {
    const profileEl = document.querySelector(PROFILE_LINK_SELECTOR$1);
    const profileHref = profileEl?.getAttribute('href') || '';
    const match = profileHref.match(/^\/uzivatel\/(\d+-[^/]+)\//i);
    return match ? match[1] : undefined;
  }

  function getUserSlugFromPath(pathname) {
    const match = String(pathname || '').match(/^\/uzivatel\/(\d+-[^/]+)\//i);
    return match ? match[1] : undefined;
  }

  function getCurrentUserRatingsUrl() {
    const profileEl = document.querySelector(PROFILE_LINK_SELECTOR$1);
    const profileHref = profileEl?.getAttribute('href');
    if (!profileHref) {
      return undefined;
    }

    const url = new URL(profileHref, location.origin);
    const segment = location.hostname.endsWith('.sk') ? 'hodnotenia' : 'hodnoceni';
    if (/\/(prehled|prehlad)\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/(prehled|prehlad)\/?$/i, `/${segment}/`);
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
    if (!/\/uzivatel\//.test(path) || !/\/(hodnoceni|hodnotenia)\/?$/i.test(path)) {
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
    const normalized = String(rawType || '').toLowerCase();
    if (normalized.includes('epizoda') || normalized === 'episode') return { key: 'episode', label: 'Episode' };
    if (normalized.includes('seriál') || normalized.includes('serial') || normalized === 'serial')
      return { key: 'series', label: 'Series' };
    if (normalized.includes('série') || normalized.includes('serie') || normalized === 'series')
      return { key: 'season', label: 'Season' };
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

  function getOverviewSegment(url) {
    return url.hostname.endsWith('.sk') ? 'prehlad' : 'prehled';
  }

  function normalizeCreatorUrl(href) {
    const url = createUrl(href);
    const match = url?.pathname.match(/^\/(tvurce|tvorca)\/(\d+-[^/]+)/i);
    if (!url || !match) return null;

    url.search = '';
    url.hash = '';
    url.pathname = `/${match[1]}/${match[2]}/${getOverviewSegment(url)}/`;
    return url.toString();
  }

  function normalizeUserUrl(href) {
    const url = createUrl(href);
    const match = url?.pathname.match(/^\/uzivatel\/(\d+-[^/]+)/i);
    if (!url || !match) return null;

    url.search = '';
    url.hash = '';
    url.pathname = `/uzivatel/${match[1]}/${getOverviewSegment(url)}/`;
    return url.toString();
  }

  function getUserReviewsUrl(href) {
    const url = createUrl(href);
    const match = url?.pathname.match(/^\/uzivatel\/(\d+-[^/]+)/i);
    if (!url || !match) return null;

    url.search = '';
    url.hash = '';
    url.pathname = `/uzivatel/${match[1]}/recenze/`;
    return url.toString();
  }

  function normalizeFilmUrl(href) {
    const url = createUrl(href);
    const match = url?.pathname.match(/^\/film\/(\d+-[^/]+)(?:\/(\d+-[^/]+))?/i);
    if (!url || !match) return null;

    url.search = '';
    url.hash = '';
    url.pathname = `/film/${match[1]}/${match[2] ? `${match[2]}/` : ''}${getOverviewSegment(url)}/`;
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
    return createUrl(url)?.pathname.match(/^\/(?:tvurce|tvorca)\/(\d+-[^/]+)/i)?.[1] || null;
  }

  function getUserEntityKey(url) {
    return createUrl(url)?.pathname.match(/^\/uzivatel\/(\d+-[^/]+)/i)?.[1] || null;
  }

  function getFilmEntityKey(url) {
    const match = createUrl(url)?.pathname.match(/^\/film\/(\d+-[^/]+)(?:\/(\d+-[^/]+))?/i);
    if (!match) return null;
    return match[2] ? `${match[1]}__${match[2]}` : match[1];
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
    if (!/^\/(?:tvurce|tvorca)\//i.test(location.pathname || '')) return false;
    return getCreatorEntityKey(url) === getCreatorEntityKey(location.href);
  }

  function isCurrentUserEntity(url) {
    if (!/^\/uzivatel\//i.test(location.pathname || '')) return false;
    return getUserEntityKey(url) === getUserEntityKey(location.href);
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
        .find((heading) => /^Recenze\b/i.test(normalizeText(heading.textContent)))
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
    const actorsBlock = Array.from(doc.querySelectorAll('#creators > div')).find(
      (block) => normalizeText(block.querySelector('h4')?.textContent).replace(/:$/, '') === 'Hrají',
    );
    const actors = Array.from(actorsBlock?.querySelectorAll('a') || [])
      .slice(0, 18)
      .map((link) => ({
        name: normalizeText(link.textContent),
        href: resolveAssetUrl(link.getAttribute('href')),
      }))
      .filter((actor) => actor.name && actor.href);

    return {
      title,
      imageUrl,
      rating,
      ratingCount,
      reviewCount,
      genres,
      origin,
      actors,
      posters: imageUrl ? [{ imageUrl, label: title }] : [],
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
    const actorsHtml = Array.isArray(data.actors)
      ? data.actors
          .map(
            (actor) => `<a class="cc-hover-preview-link" href="${escapeHtml(actor.href)}">${escapeHtml(actor.name)}</a>`,
          )
          .join(', ')
      : '';

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
      actorsHtml ? '<div class="cc-hover-preview-divider"></div>' : '',
      actorsHtml
        ? renderLine(
            `<span class="cc-hover-preview-clamp-2"><span class="cc-hover-preview-label">Hrají:</span> ${actorsHtml}</span>`,
          )
        : '',
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
          /^\/(tvurce|tvorca)\/\d+-[^/]+(?:\/(?:prehled|prehlad))?\/?$/i.test(url.pathname || ''),
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
          /^\/uzivatel\/\d+-[^/]+(?:\/(?:prehled|prehlad|o-mne|denicek|dennik|seznamy|filmoteka|komentare|komentare-filmy|diskuze|fanclub|videa|galerie|zajimavosti|biografie|obsahy|videa-fotky)|\/oblibene(?:\/[^/]+)*)?\/?$/i.test(
            url.pathname || '',
          ),
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
  const PROFILE_LINK_SELECTOR =
    'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';
  const MANAGED_LOCAL_STORAGE_PREFIXES = ['cc_', 'CSFD-Compare'];

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function getBoolSetting(key, defaultValue = true) {
    const value = localStorage.getItem(key);
    return value === null ? defaultValue : value === 'true';
  }

  function getProfileLinkElement() {
    return document.querySelector(PROFILE_LINK_SELECTOR);
  }

  function isUserLoggedIn() {
    return Boolean(getProfileLinkElement());
  }

  function getCurrentUserSlug() {
    const match = getProfileLinkElement()
      ?.getAttribute('href')
      ?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
    return match ? match[1] : undefined;
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

  function positionPreview() {
    if (previewRoot?.classList.contains('is-visible')) {
      const rect = previewRoot.getBoundingClientRect();
      const x = Math.min(window.innerWidth - rect.width - 10, Math.max(10, mouseX + 18));
      const y = Math.min(window.innerHeight - rect.height - 10, Math.max(10, mouseY + 18));

      previewRoot.style.left = `${x}px`;
      previewRoot.style.top = `${y}px`;
    }

    if (secondaryPreviewRoot?.classList.contains('is-visible')) {
      const rect = secondaryPreviewRoot.getBoundingClientRect();
      const x = Math.min(window.innerWidth - rect.width - 10, Math.max(10, mouseX + 28));
      const y = Math.min(window.innerHeight - rect.height - 10, Math.max(10, mouseY + 16));

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

  function getProviderById(providerId) {
    return HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === providerId) || null;
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
