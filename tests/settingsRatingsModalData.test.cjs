const path = require('path');
const { pathToFileURL } = require('url');

let createRatingsCsv;
let filterRowsBySearch;
let filterRowsByScope;
let sortRows;
let toModalRows;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/settings-ratings-modal-data.js')).href;
  const ratingsModalData = await import(moduleUrl);
  createRatingsCsv = ratingsModalData.createRatingsCsv;
  filterRowsBySearch = ratingsModalData.filterRowsBySearch;
  filterRowsByScope = ratingsModalData.filterRowsByScope;
  sortRows = ratingsModalData.sortRows;
  toModalRows = ratingsModalData.toModalRows;
});

describe('settings ratings modal data helpers', () => {
  test('toModalRows normalizes rows for filtering, sorting and display', () => {
    const rows = toModalRows(
      [
        {
          userSlug: '78145-songokussj',
          movieId: 9499,
          name: 'Život je krásný',
          url: '9499-zivot-je-krasny',
          type: 'film',
          year: '1997',
          rating: 5,
          date: '03.03.2026',
        },
      ],
      'https://www.csfd.cz',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Život je krásný',
      typeKey: 'movie',
      ratingBucket: '5',
      ratingText: '★★★★★',
      dateSortValue: 20260303,
    });
    expect(rows[0].url).toBe('https://www.csfd.cz/film/9499-zivot-je-krasny/');
    expect(rows[0].searchString).toContain('zivot je krasny');
  });

  test('filterRowsBySearch requires every normalized token', () => {
    const rows = toModalRows(
      [
        { name: 'Život je krásný', type: 'film', year: '1997', rating: 5 },
        { name: 'Matrix', type: 'film', year: '1999', rating: 4 },
      ],
      'https://www.csfd.cz',
    );

    expect(filterRowsBySearch(rows, 'zivot 1997')).toHaveLength(1);
    expect(filterRowsBySearch(rows, 'zivot 1999')).toHaveLength(0);
  });

  test('filterRowsByScope hides deleted rows outside deleted scope', () => {
    const rows = toModalRows(
      [
        { name: 'Direct', type: 'film', rating: 4, computed: false },
        { name: 'Computed', type: 'seriál', rating: 3, computed: true },
        { name: 'Deleted', type: 'film', rating: 5, deleted: true },
      ],
      'https://www.csfd.cz',
    );

    expect(filterRowsByScope(rows, 'all').map((row) => row.name)).toEqual(['Direct', 'Computed']);
    expect(filterRowsByScope(rows, 'direct').map((row) => row.name)).toEqual(['Direct']);
    expect(filterRowsByScope(rows, 'computed').map((row) => row.name)).toEqual(['Computed']);
    expect(filterRowsByScope(rows, 'deleted').map((row) => row.name)).toEqual(['Deleted']);
  });

  test('sortRows does not mutate the input array', () => {
    const rows = toModalRows(
      [
        { name: 'B', type: 'film', rating: 2 },
        { name: 'A', type: 'film', rating: 5 },
      ],
      'https://www.csfd.cz',
    );

    const sorted = sortRows(rows, 'name', 'asc');
    expect(sorted.map((row) => row.name)).toEqual(['A', 'B']);
    expect(rows.map((row) => row.name)).toEqual(['B', 'A']);
  });

  test('sortRows keeps unknown numeric values last when sorting descending', () => {
    const rows = toModalRows(
      [
        { name: 'Unknown', type: 'film', year: '', rating: 0, deleted: true },
        { name: 'Five', type: 'film', year: '2026', rating: 5 },
        { name: 'Two', type: 'film', year: '2024', rating: 2 },
      ],
      'https://www.csfd.cz',
    );

    expect(sortRows(rows, 'year', 'desc').map((row) => row.name)).toEqual(['Five', 'Two', 'Unknown']);
  });

  test('createRatingsCsv includes status and escapes fields', () => {
    const rows = toModalRows(
      [{ name: 'Movie "quoted"', type: 'film', year: '2026', rating: 0, computed: true, movieId: 123 }],
      'https://www.csfd.cz',
    );

    const csv = createRatingsCsv(rows);
    expect(csv).toContain('"Movie ""quoted"""');
    expect(csv).toContain('"computed"');
    expect(csv).toContain('"123"');
  });
});
