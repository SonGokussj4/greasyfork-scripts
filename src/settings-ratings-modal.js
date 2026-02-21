import { INDEXED_DB_NAME, RATINGS_STORE_NAME } from './config.js';
import { getAllFromIndexedDB } from './storage.js';
import { toModalRows } from './settings-ratings-modal-data.js';
import { openRatingsTableView } from './settings-ratings-modal-view.js';

const MODAL_TITLE_BY_SCOPE = {
  direct: 'Načtená hodnocení',
  computed: 'Spočtená hodnocení',
};

const ratingsModalCache = {
  userSlug: '',
  userRecords: null,
  rowsByScope: {
    direct: null,
    computed: null,
  },
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
  const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));

  ratingsModalCache.userSlug = userSlug;
  ratingsModalCache.userRecords = userRecords;
  ratingsModalCache.rowsByScope.direct = null;
  ratingsModalCache.rowsByScope.computed = null;

  return userRecords;
}

async function getCachedRowsForScope(userSlug, scope) {
  if (ratingsModalCache.userSlug === userSlug && Array.isArray(ratingsModalCache.rowsByScope[scope])) {
    return ratingsModalCache.rowsByScope[scope];
  }

  const userRecords = await getCachedUserRecords(userSlug);
  const scopedRecords =
    scope === 'computed'
      ? userRecords.filter((record) => record.computed === true)
      : userRecords.filter((record) => record.computed !== true);

  const rows = toModalRows(scopedRecords);
  ratingsModalCache.rowsByScope[scope] = rows;
  return rows;
}

export function invalidateRatingsModalCache() {
  ratingsModalCache.userSlug = '';
  ratingsModalCache.userRecords = null;
  ratingsModalCache.rowsByScope = {
    direct: null,
    computed: null,
  };
}

function getModalTitleForScope(scope) {
  return MODAL_TITLE_BY_SCOPE[scope] || MODAL_TITLE_BY_SCOPE.direct;
}

export async function openRatingsTableModal(rootElement, scope, callbacks) {
  console.debug('[CC] openRatingsTableModal called', { scope, callbacks });
  const getCurrentUserSlug = callbacks?.getCurrentUserSlug;
  const getMostFrequentUserSlug = callbacks?.getMostFrequentUserSlug;

  let userSlug = getCurrentUserSlug?.();
  console.debug('[CC] initial userSlug from callback', userSlug);
  if (!userSlug) {
    const records = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    userSlug = getMostFrequentUserSlug?.(records);
    console.debug('[CC] fallback userSlug from records', userSlug);
  }
  if (!userSlug) {
    console.warn('[CC] openRatingsTableModal aborting, no userSlug');
    return;
  }

  const rows = await getCachedRowsForScope(userSlug, scope);
  openRatingsTableView({
    rows,
    modalTitle: getModalTitleForScope(scope),
  });

  const redBadge = rootElement.querySelector('#cc-badge-red');
  const blackBadge = rootElement.querySelector('#cc-badge-black');
  redBadge?.blur();
  blackBadge?.blur();
}
