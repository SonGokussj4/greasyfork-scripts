const path = require('path');
const { pathToFileURL } = require('url');

let buildRatingRecordId;
let reconcileUserRatingRecords;
let findStaleRatingRecords;
let canReconcileDeletions;
let toDeletedRatingRecord;

beforeAll(async () => {
  const ratingsRecords = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-records.js')).href);
  buildRatingRecordId = ratingsRecords.buildRatingRecordId;
  reconcileUserRatingRecords = ratingsRecords.reconcileUserRatingRecords;
  findStaleRatingRecords = ratingsRecords.findStaleRatingRecords;
  canReconcileDeletions = ratingsRecords.canReconcileDeletions;
  toDeletedRatingRecord = ratingsRecords.toDeletedRatingRecord;
});

describe('ratings-records helpers', () => {
  test('buildRatingRecordId uses stable user and movie ids', () => {
    expect(buildRatingRecordId('78145-songokussj', 1000064)).toBe('78145-songokussj:1000064');
  });

  test('reconcileUserRatingRecords normalizes legacy ids and removes duplicates per movie', () => {
    const userSlug = '78145-songokussj';
    const records = [
      {
        id: '78145-songokussj:matrix-old-slug',
        userSlug,
        movieId: 9499,
        rating: 4,
        computed: false,
        deleted: false,
        lastUpdate: '2026-03-01T10:00:00.000Z',
      },
      {
        id: '78145-songokussj:9499',
        userSlug,
        movieId: 9499,
        rating: 5,
        computed: false,
        deleted: false,
        lastUpdate: '2026-03-03T10:00:00.000Z',
      },
      {
        id: 'another-user:9499',
        userSlug: 'another-user',
        movieId: 9499,
        rating: 2,
        computed: false,
        deleted: false,
        lastUpdate: '2026-03-04T10:00:00.000Z',
      },
    ];

    const result = reconcileUserRatingRecords(records, userSlug);

    expect(result.hasChanges).toBe(true);
    expect(result.normalizedRecords).toHaveLength(1);
    expect(result.normalizedRecords[0].id).toBe('78145-songokussj:9499');
    expect(result.normalizedRecords[0].rating).toBe(5);
    expect(result.staleRecordIds).toEqual(['78145-songokussj:matrix-old-slug']);
  });

  test('reconcileUserRatingRecords prefers newer tombstone over older active duplicate', () => {
    const userSlug = '78145-songokussj';
    const records = [
      {
        id: '78145-songokussj:9499',
        userSlug,
        movieId: 9499,
        rating: 5,
        computed: false,
        deleted: false,
        lastUpdate: '2026-03-01T10:00:00.000Z',
      },
      {
        id: '78145-songokussj:matrix-old-slug',
        userSlug,
        movieId: 9499,
        rating: null,
        computed: false,
        deleted: true,
        lastUpdate: '2026-03-05T10:00:00.000Z',
      },
    ];

    const result = reconcileUserRatingRecords(records, userSlug);

    expect(result.normalizedRecords).toHaveLength(1);
    expect(result.normalizedRecords[0].id).toBe('78145-songokussj:9499');
    expect(result.normalizedRecords[0].deleted).toBe(true);
    expect(result.staleRecordIds).toEqual(['78145-songokussj:9499', '78145-songokussj:matrix-old-slug']);
  });

  test('findStaleRatingRecords returns only unseen direct, non-deleted records', () => {
    const records = [
      { id: 'u:1', movieId: 1, computed: false },
      { id: 'u:2', movieId: 2, computed: false },
      { id: 'u:3', movieId: 3, computed: true },
      { id: 'u:4', movieId: 4, computed: false, deleted: true },
      { id: 'u:5', movieId: 5 },
    ];
    const stale = findStaleRatingRecords(records, new Set([1]));
    expect(stale.map((record) => record.movieId)).toEqual([2, 5]);
  });

  test('canReconcileDeletions requires a completed scan that saw the full ČSFD total', () => {
    expect(canReconcileDeletions({ completed: true, totalRatings: 2448, seenCount: 2448 })).toBe(true);
    expect(canReconcileDeletions({ completed: true, totalRatings: 2448, seenCount: 2447 })).toBe(false);
    expect(canReconcileDeletions({ completed: false, totalRatings: 2448, seenCount: 2448 })).toBe(false);
    expect(canReconcileDeletions({ completed: true, totalRatings: 0, seenCount: 10 })).toBe(false);
  });

  test('toDeletedRatingRecord builds a tombstone that wins reconciliation by lastUpdate', () => {
    const record = { id: 'u:9', userSlug: 'u', movieId: 9, rating: 4, lastUpdate: '2026-01-01T00:00:00.000Z' };
    const tombstone = toDeletedRatingRecord(record, '2026-09-23T00:00:00.000Z');
    expect(tombstone).toMatchObject({ id: 'u:9', movieId: 9, rating: null, deleted: true });
    const { normalizedRecords } = reconcileUserRatingRecords([record, tombstone], 'u');
    expect(normalizedRecords).toHaveLength(1);
    expect(normalizedRecords[0].deleted).toBe(true);
  });
});
