const path = require('path');
const { pathToFileURL } = require('url');

let buildRatingRecordId;
let reconcileUserRatingRecords;

beforeAll(async () => {
  const ratingsRecords = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-records.js')).href);
  buildRatingRecordId = ratingsRecords.buildRatingRecordId;
  reconcileUserRatingRecords = ratingsRecords.reconcileUserRatingRecords;
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
});
