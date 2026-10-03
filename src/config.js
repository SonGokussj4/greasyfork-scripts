/*
 * Config and constants for CSFD-Compare
 */
export const VERSION = '0.9.0';
export const SCRIPTNAME = 'CSFD-Compare';
export const SETTINGSNAME = 'CSFD-Compare-settings';
export const GREASYFORK_URL = 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare';
export const WHATS_NEW_VERSION_KEY = 'cc_whats_new_version';
export const NUM_RATINGS_PER_PAGE = 50;
export const INDEXED_DB_VERSION = 1;
export const INDEXED_DB_NAME = 'CC-Ratings';
export const RATINGS_STORE_NAME = 'ratings';

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const SUPABASE_TABLE = 'cc_ratings';
export const SUPABASE_URL_STORAGE_KEY = 'cc_supabase_url';
export const SUPABASE_ANON_KEY_STORAGE_KEY = 'cc_supabase_anon_key';
export const DEV_PANEL_ALWAYS_VISIBLE = false;
export const DEV_PERFORMANCE_METRICS = false;
export const GALLERY_IMAGE_LINKS_ENABLED_KEY = 'cc_gallery_image_links_enabled';
export const LINK_ICONS_ENABLED_KEY = 'cc_link_icons_enabled';
export const LINK_ICONS_REVIEW_ENABLED_KEY = 'cc_link_icons_review_enabled';
export const LINK_ICONS_FILM_ENABLED_KEY = 'cc_link_icons_film_enabled';
export const LINK_ICONS_CREATOR_ENABLED_KEY = 'cc_link_icons_creator_enabled';
export const LINK_ICONS_USER_ENABLED_KEY = 'cc_link_icons_user_enabled';
export const LINK_ICONS_YOUTUBE_ENABLED_KEY = 'cc_link_icons_youtube_enabled';
export const LINK_ICONS_STEAM_ENABLED_KEY = 'cc_link_icons_steam_enabled';
export const LINK_ICONS_WIKIPEDIA_ENABLED_KEY = 'cc_link_icons_wikipedia_enabled';
export const LINK_ICONS_ANIDB_ENABLED_KEY = 'cc_link_icons_anidb_enabled';
export const LINK_ICONS_MAL_ENABLED_KEY = 'cc_link_icons_myanimelist_enabled';
export const LINK_ICONS_POSITION_KEY = 'cc_link_icons_position';
export const LINK_ICONS_SECTION_COLLAPSED_KEY = 'cc_link_icons_section_collapsed';
export const LINK_ICONS_UPDATED_EVENT = 'cc-link-icons-updated';
export const HOVER_PREVIEW_CACHE_GROUP_PREFIX = 'cc_hover_cache_';
export const HOVER_PREVIEW_CACHE_PREFIX = 'cc_hover_cache_v1_';
export const HOVER_PREVIEW_CACHE_HOURS_KEY = 'cc_hover_preview_cache_hours';
export const HOVER_PREVIEW_ENABLED_KEY = 'cc_hover_preview_enabled';
export const HOVER_PREVIEW_CREATOR_ENABLED_KEY = 'cc_hover_preview_creator_enabled';
export const HOVER_PREVIEW_USER_ENABLED_KEY = 'cc_hover_preview_user_enabled';
export const HOVER_PREVIEW_REVIEW_ENABLED_KEY = 'cc_hover_preview_review_enabled';
export const HOVER_PREVIEW_FILM_ENABLED_KEY = 'cc_hover_preview_film_enabled';
export const HOVER_PREVIEW_EXTERNAL_ENABLED_KEY = 'cc_hover_preview_external_enabled';
export const HOVER_PREVIEW_SECTION_COLLAPSED_KEY = 'cc_hover_preview_section_collapsed';
export const HOVER_PREVIEW_SETTINGS_CHANGED_EVENT = 'cc-hover-preview-settings-changed';
export const SELF_REPLY_IN_DISCUSSIONS_KEY = 'cc_self_reply_discussions';
export const SHOW_ALL_CREATOR_TABS_KEY = 'cc_show_all_creator_tabs';
export const SHOW_RATINGS_KEY = 'cc_show_ratings';
export const SHOW_RATINGS_IN_REVIEWS_KEY = 'cc_show_ratings_in_reviews';
export const SHOW_RATINGS_IN_DIARIES_KEY = 'cc_show_ratings_in_diaries';
export const SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY = 'cc_show_ratings_in_foreign_reviews';
export const SHOW_RATINGS_SECTION_COLLAPSED_KEY = 'cc_show_ratings_section_collapsed';

// feature flags copied from legacy script
export const CLICKABLE_HEADER_BOXES_KEY = 'cc_clickable_header_boxes';
export const RATINGS_ESTIMATE_KEY = 'cc_ratings_estimate';
export const RATINGS_FROM_FAVORITES_KEY = 'cc_ratings_from_favorites';
export const ADD_RATINGS_DATE_KEY = 'cc_add_ratings_date';
export const REVERT_STAR_STYLE_KEY = 'cc_revert_star_style';
export const HIDE_SELECTED_REVIEWS_KEY = 'cc_hide_selected_user_reviews';
export const HIDE_SELECTED_REVIEWS_LIST_KEY = 'cc_hide_selected_user_reviews_list';
export const HIDE_REVIEWS_SECTION_COLLAPSED_KEY = 'cc_hide_reviews_section_collapsed';

/** Selector for the logged-in user's profile link in the ČSFD header. */
export const PROFILE_LINK_SELECTOR =
  'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';

/** Regex to extract user slug (e.g. "12345-username") from a ČSFD user path. */
export const USER_SLUG_REGEX = /^\/uzivatel\/(\d+-[^/]+)\//i;

export const CSFD_SITE_CONFIG = Object.freeze({
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

export const CSFD_SHOW_TYPE_KEYWORDS = Object.freeze({
  episode: Object.freeze(['epizoda', 'epizóda', 'episode']),
  serial: Object.freeze(['seriál', 'serial']),
  season: Object.freeze(['série', 'séria', 'serie', 'season', 'series']),
  'tv movie': Object.freeze(['tv film', 'tv movie']),
  movie: Object.freeze(['film', 'movie']),
});

export const CSFD_CREATOR_ROLE_KEYWORDS = Object.freeze(
  Object.fromEntries(
    Object.keys(CSFD_SITE_CONFIG.cz.creatorRoles).map((roleKey) => [
      roleKey,
      Object.freeze(
        Array.from(new Set(Object.values(CSFD_SITE_CONFIG).map((localeConfig) => localeConfig.creatorRoles[roleKey]))),
      ),
    ]),
  ),
);

export const CSFD_TEXT_VARIANTS = Object.freeze({
  reviewHeading: Object.freeze(['recenze', 'recenzie']),
  recentReviewsOrRatingsHeading: Object.freeze([
    'poslední recenze',
    'posledne recenzie',
    'poslední hodnocení',
    'posledné hodnotenia',
  ]),
  recentDiaryHeading: Object.freeze(['poslední deníček', 'posledny dennik']),
});

export const CSFD_USER_PROFILE_SUBPATHS = Object.freeze([
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

export const CSFD_PATH_ALIASES = Object.freeze({
  creator: Object.freeze(['tvurce', 'tvorca']),
  discussion: Object.freeze(['diskuze', 'diskusia', 'diskusie']),
  gallery: Object.freeze(['galerie', 'galaria']),
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getCsfdLocale(hostname = globalThis.location?.hostname || '') {
  return String(hostname).endsWith('.sk') ? 'sk' : 'cz';
}

export function getCsfdPathSegment(segmentKey, localeOrHostname = getCsfdLocale()) {
  const locale = Object.hasOwn(CSFD_SITE_CONFIG, localeOrHostname) ? localeOrHostname : getCsfdLocale(localeOrHostname);
  return CSFD_SITE_CONFIG[locale]?.pathSegments?.[segmentKey] || CSFD_SITE_CONFIG.cz.pathSegments?.[segmentKey] || '';
}

export function getCsfdPathSegmentValues(segmentKey) {
  return Object.freeze(
    Array.from(
      new Set(Object.values(CSFD_SITE_CONFIG).map((localeConfig) => localeConfig.pathSegments?.[segmentKey])),
    ).filter(Boolean),
  );
}

export function getCsfdPathSegmentPattern(segmentKey) {
  return getCsfdPathSegmentValues(segmentKey).map(escapeRegExp).join('|');
}

export function getCsfdPathAliasPattern(aliasKey) {
  return (CSFD_PATH_ALIASES[aliasKey] || []).map(escapeRegExp).join('|');
}

export function getCsfdUserProfileSubpathPattern() {
  return [getCsfdPathSegmentPattern('overview'), ...CSFD_USER_PROFILE_SUBPATHS.map(escapeRegExp)].join('|');
}

export function getCsfdCreatorRoleLabel(roleKey, localeOrHostname = getCsfdLocale()) {
  const locale = Object.hasOwn(CSFD_SITE_CONFIG, localeOrHostname) ? localeOrHostname : getCsfdLocale(localeOrHostname);
  return CSFD_SITE_CONFIG[locale]?.creatorRoles?.[roleKey] || CSFD_SITE_CONFIG.cz.creatorRoles?.[roleKey] || '';
}

export function matchesCsfdTextVariant(variantKey, text = '') {
  const normalized = String(text || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;

  return (CSFD_TEXT_VARIANTS[variantKey] || []).some((variant) => normalized.includes(variant));
}

export function normalizeCsfdShowType(rawType, defaultType = 'movie') {
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
