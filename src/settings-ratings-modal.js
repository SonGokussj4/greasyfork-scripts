import { INDEXED_DB_NAME, RATINGS_STORE_NAME } from './config.js';
import { getAllFromIndexedDB } from './storage.js';
import { toModalRows } from './settings-ratings-modal-data.js';
import { openRatingsTableView } from './settings-ratings-modal-view.js';

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
  const userRecords = records.filter((record) => record.userSlug === userSlug && Number.isFinite(record.movieId));

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

export function invalidateRatingsModalCache() {
  ratingsModalCache.userSlug = '';
  ratingsModalCache.userRecords = null;
  ratingsModalCache.allRows = null;
}

function getModalTitleForScope(scope) {
  return MODAL_TITLE_BY_SCOPE[scope] || MODAL_TITLE_BY_SCOPE.direct;
}

export async function openRatingsTableModal(rootElement, scope, callbacks) {
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
