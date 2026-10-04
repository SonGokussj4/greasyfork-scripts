import { createDetailsModalController, formatDetailValue } from './ui-utils.js';

const DETAIL_FIELD_ORDER = Object.freeze([
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
]);

function formatRecordValue(value) {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : formatDetailValue(value);
}

function compactRows(rows) {
  return rows.filter((row) => row.value !== '' && row.value !== 'undefined' && row.value !== 'null');
}

function createDetailGroup(label, rows) {
  const visibleRows = compactRows(rows);
  if (visibleRows.length === 0) return null;
  return {
    type: 'group',
    label,
    rows: visibleRows,
  };
}

function createStatusValue(row, record) {
  if (row?.isDeleted) return 'Smazané hodnocení';
  if (row?.isComputed) return 'Spočtené hodnocení';
  if (record?.computed === true) return 'Spočtené hodnocení';
  return 'Přímo hodnocené';
}

function buildGroupedDetailItems(row) {
  const record = row?.rawRecord || {};
  const groupedKeys = new Set([
    'name',
    'type',
    'year',
    'rating',
    'date',
    'url',
    'fullUrl',
    'parentId',
    'parentName',
    'computed',
    'computedCount',
    'computedFromText',
    'movieId',
    'id',
    'userSlug',
    'lastUpdate',
  ]);

  const groups = [
    createDetailGroup('Přehled', [
      { key: 'Název', value: row?.name || record.name || '' },
      { key: 'Typ', value: row?.typeDisplay || record.type || '' },
      { key: 'Rok', value: Number.isFinite(row?.yearValue) ? row.yearValue : record.year },
      { key: 'Hodnocení', value: row?.ratingText || formatRecordValue(record.rating) },
      { key: 'Datum hodnocení', value: row?.date || record.date || '' },
      { key: 'Stav', value: createStatusValue(row, record) },
    ]),
    createDetailGroup('Odkazy a vazby', [
      { key: 'ČSFD URL', value: row?.url || record.fullUrl || record.url || '' },
      { key: 'Původní URL', value: record.url },
      { key: 'Nadřazený titul', value: record.parentName },
      { key: 'Nadřazené ID', value: record.parentId },
      { key: 'Token série/epizody', value: record.seriesToken },
    ]),
    createDetailGroup('Spočtené hodnocení', [
      { key: 'Spočtené', value: record.computed },
      { key: 'Počet položek', value: record.computedCount },
      { key: 'Zdroj výpočtu', value: record.computedFromText },
    ]),
    createDetailGroup('Technické údaje', [
      { key: 'Record ID', value: record.id },
      { key: 'Movie ID', value: record.movieId },
      { key: 'Uživatel', value: record.userSlug },
      { key: 'Poslední změna', value: record.lastUpdate },
    ]),
  ].filter(Boolean);

  const extraRows = Array.from(new Set([...DETAIL_FIELD_ORDER, ...Object.keys(record)]))
    .filter((key) => !groupedKeys.has(key))
    .map((key) => ({ key, value: formatRecordValue(record[key]) }));

  const extraGroup = createDetailGroup('Ostatní pole', extraRows);
  if (extraGroup) groups.push(extraGroup);

  return groups;
}

export function createRatingDetailsController() {
  const controller = createDetailsModalController({
    defaultTitle: 'Detail záznamu',
    titleId: 'cc-rating-detail-title',
  });

  const open = (row) => {
    controller.open(
      row?.name ? `Detail: ${row.name}` : 'Detail záznamu',
      buildGroupedDetailItems(row),
    );
  };

  return {
    ...controller,
    open,
  };
}
