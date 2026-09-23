import { normalizeCsfdShowType } from './config.js';

const TYPE_LABELS = Object.freeze({
  episode: 'Episode',
  series: 'Series',
  season: 'Season',
  movie: 'Movie',
});

const csCollator = new Intl.Collator('cs', { sensitivity: 'base' });
const enCollator = new Intl.Collator('en', { sensitivity: 'base' });

function resolveRecordUrl(record, baseOrigin = globalThis.location?.origin || '') {
  if (record?.fullUrl) return record.fullUrl;
  if (!record?.url) return '';

  try {
    const value = String(record.url);
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return new URL(value, baseOrigin).toString();
    return new URL(`/film/${value.replace(/^\/+|\/+$/g, '')}/`, baseOrigin).toString();
  } catch {
    return '';
  }
}

function normalizeModalType(rawType) {
  const normalized = normalizeCsfdShowType(rawType, 'movie');
  if (normalized === 'episode') return { key: 'episode', label: TYPE_LABELS.episode };
  if (normalized === 'serial') return { key: 'series', label: TYPE_LABELS.series };
  if (normalized === 'season') return { key: 'season', label: TYPE_LABELS.season };
  return { key: 'movie', label: TYPE_LABELS.movie };
}

function formatRatingForModal(ratingValue, isDeleted) {
  if (isDeleted) return { text: 'SMAZÁNO', bucket: 'unknown', isOdpad: false };
  if (!Number.isFinite(ratingValue)) return { text: 'odpad!', bucket: '0', isOdpad: true };
  if (ratingValue === 0) return { text: 'odpad!', bucket: '0', isOdpad: true };

  const count = Math.min(5, Math.max(1, Math.round(ratingValue)));
  return { text: '★'.repeat(count), bucket: String(count), isOdpad: false };
}

function getRatingSquareClass(ratingValue, isDeleted) {
  if (isDeleted || !Number.isFinite(ratingValue)) return 'is-unknown';
  if (ratingValue === 0) return 'is-0';
  return `is-${Math.min(5, Math.max(1, Math.round(ratingValue)))}`;
}

function parseCzechDateToSortableValue(dateStr) {
  if (!dateStr) return 0;
  const match = String(dateStr).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return 0;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  return year * 10000 + month * 100 + day;
}

export function normalizeRatingsSearchText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildTypeDisplay(record, normalizedType) {
  if (record.seriesToken) return `${normalizedType.label} (${record.seriesToken})`;
  if (record.parentName) return `${normalizedType.label} (${record.parentName})`;
  return normalizedType.label;
}

export function toModalRows(records, baseOrigin = globalThis.location?.origin || '') {
  if (!Array.isArray(records)) return [];

  return records.map((record) => {
    const normalizedType = normalizeModalType(record.type);
    const typeDisplay = buildTypeDisplay(record, normalizedType);
    const parsedYear = Number.parseInt(record.year, 10);
    const ratingValue = Number.isFinite(record.rating) ? record.rating : NaN;
    const formattedRating = formatRatingForModal(ratingValue, record.deleted === true);

    const searchString = [
      record.name,
      record.url,
      typeDisplay,
      normalizedType.label,
      Number.isFinite(parsedYear) ? parsedYear : '',
      record.date,
      formattedRating.isOdpad ? 'odpad' : '',
      record.computed === true ? 'spoctene computed' : 'prime direct',
      record.deleted === true ? 'smazane deleted' : '',
    ]
      .map(normalizeRatingsSearchText)
      .join(' ');

    return {
      name: (record.name || '').trim(),
      url: resolveRecordUrl(record, baseOrigin),
      typeKey: normalizedType.key,
      typeLabel: normalizedType.label,
      typeDisplay,
      yearValue: parsedYear,
      ratingText: formattedRating.text,
      ratingBucket: formattedRating.bucket,
      ratingIsOdpad: formattedRating.isOdpad,
      ratingValue,
      ratingSquareClass: getRatingSquareClass(ratingValue, record.deleted === true),
      date: (record.date || '').trim(),
      dateSortValue: parseCzechDateToSortableValue(record.date),
      isComputed: record.computed === true,
      isDeleted: record.deleted === true,
      searchString,
      rawRecord: { ...record },
    };
  });
}

export function filterRowsByScope(rows, scopeFilter) {
  return rows.filter((row) => {
    if (scopeFilter === 'deleted') return row.isDeleted;
    if (row.isDeleted) return false;
    if (scopeFilter === 'direct') return !row.isComputed;
    if (scopeFilter === 'computed') return row.isComputed;
    return true;
  });
}

export function filterRowsByType(rows, typeFilters) {
  if (typeFilters.has('all') || typeFilters.size === 0) return rows;
  return rows.filter((row) => typeFilters.has(row.typeKey));
}

export function filterRowsByRating(rows, ratingFilters) {
  if (!ratingFilters || ratingFilters.has('all') || ratingFilters.size === 0) return rows;
  return rows.filter((row) => ratingFilters.has(row.ratingBucket));
}

export function filterRowsBySearch(rows, search) {
  const tokens = normalizeRatingsSearchText(search).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return rows;
  return rows.filter((row) => tokens.every((token) => row.searchString.includes(token)));
}

function compareNullableNumbers(left, right, direction) {
  const leftFinite = Number.isFinite(left);
  const rightFinite = Number.isFinite(right);
  if (leftFinite && rightFinite) return (left - right) * direction;
  if (leftFinite) return -1;
  if (rightFinite) return 1;
  return 0;
}

export function sortRows(rows, sortKey, sortDir) {
  const direction = sortDir === 'desc' ? -1 : 1;
  const sorted = [...rows].sort((a, b) => {
    let result;
    if (sortKey === 'type') result = enCollator.compare(a.typeDisplay, b.typeDisplay) * direction;
    else if (sortKey === 'year') result = compareNullableNumbers(a.yearValue, b.yearValue, direction);
    else if (sortKey === 'rating') result = compareNullableNumbers(a.ratingValue, b.ratingValue, direction);
    else if (sortKey === 'date') result = compareNullableNumbers(a.dateSortValue || NaN, b.dateSortValue || NaN, direction);
    else result = csCollator.compare(a.name, b.name) * direction;

    if (result === 0 && sortKey !== 'name') return csCollator.compare(a.name, b.name);
    return result;
  });

  return sorted;
}

export function getRatingsSummary(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      if (row.isDeleted) summary.deleted += 1;
      else if (row.isComputed) summary.computed += 1;
      else summary.direct += 1;

      summary.types[row.typeKey] = (summary.types[row.typeKey] || 0) + 1;
      summary.ratings[row.ratingBucket] = (summary.ratings[row.ratingBucket] || 0) + 1;
      return summary;
    },
    {
      total: 0,
      direct: 0,
      computed: 0,
      deleted: 0,
      types: { movie: 0, series: 0, season: 0, episode: 0 },
      ratings: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0, unknown: 0 },
    },
  );
}

function csvEscape(value) {
  return `"${(value != null ? String(value) : '').replace(/"/g, '""')}"`;
}

export function createRatingsCsv(rows) {
  const header = ['Název', 'Typ', 'Rok', 'Hodnocení', 'Datum hodnocení', 'Stav', 'URL', 'movieID'];
  const lines = [header.map(csvEscape).join(',')];

  for (const row of rows) {
    let ratingNum = '';
    if (Number.isFinite(row.ratingValue)) ratingNum = Math.round(row.ratingValue);
    else if (row.ratingBucket === '0') ratingNum = 0;

    lines.push(
      [
        row.name,
        row.typeDisplay,
        Number.isFinite(row.yearValue) ? row.yearValue : '',
        ratingNum,
        row.date,
        row.isDeleted ? 'deleted' : row.isComputed ? 'computed' : 'direct',
        row.rawRecord?.fullUrl || row.url || '',
        row.rawRecord?.movieId || '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export const __ratingsModalDataTestApi = {
  normalizeModalType,
  parseCzechDateToSortableValue,
  resolveRecordUrl,
};
