/*
 * Config and constants for CSFD-Compare
 */
export const VERSION = '0.8.14';
export const SCRIPTNAME = 'CSFD-Compare';
export const SETTINGSNAME = 'CSFD-Compare-settings';
export const GREASYFORK_URL = 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare';
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
export const CREATOR_PREVIEW_CACHE_HOURS_KEY = 'cc_creator_preview_cache_hours';
export const CREATOR_PREVIEW_ENABLED_KEY = 'cc_creator_preview_enabled';
export const CREATOR_PREVIEW_SHOW_BIRTH_KEY = 'cc_creator_preview_show_birth';
export const CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY = 'cc_creator_preview_show_photo_from';
export const CREATOR_PREVIEW_SECTION_COLLAPSED_KEY = 'cc_creator_preview_section_collapsed';
export const SHOW_ALL_CREATOR_TABS_KEY = 'cc_show_all_creator_tabs';
export const SHOW_RATINGS_KEY = 'cc_show_ratings';
export const SHOW_RATINGS_IN_REVIEWS_KEY = 'cc_show_ratings_in_reviews';
export const SHOW_RATINGS_SECTION_COLLAPSED_KEY = 'cc_show_ratings_section_collapsed';

// feature flags copied from legacy script
export const CLICKABLE_HEADER_BOXES_KEY = 'cc_clickable_header_boxes';
export const RATINGS_ESTIMATE_KEY = 'cc_ratings_estimate';
export const RATINGS_FROM_FAVORITES_KEY = 'cc_ratings_from_favorites';
export const ADD_RATINGS_DATE_KEY = 'cc_add_ratings_date';
export const HIDE_SELECTED_REVIEWS_KEY = 'cc_hide_selected_user_reviews';
export const HIDE_SELECTED_REVIEWS_LIST_KEY = 'cc_hide_selected_user_reviews_list';
export const HIDE_REVIEWS_SECTION_COLLAPSED_KEY = 'cc_hide_reviews_section_collapsed';
