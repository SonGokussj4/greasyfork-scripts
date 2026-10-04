// jsdom lacks structuredClone, which fake-indexeddb needs.
const v8 = require('v8');
global.structuredClone ??= (value) => v8.deserialize(v8.serialize(value));
require('fake-indexeddb/auto');
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const path = require('path');
const { pathToFileURL } = require('url');

const USER = '1-me';
const PER_PAGE = 4;

let loadRatingsForCurrentUser;
let isSweepInSync;
let storage;

function ratingRow(id) {
  return `<tr><td class="name"><h3 class="film-title-inline"><a class="film-title-name" href="/film/${id}-film-${id}/">Film ${id}</a><span class="film-title-info"><span class="info">2020</span></span></h3></td><td class="star-rating-only"><span class="star-rating"><span class="stars stars-3"></span></span></td><td class="date-only">01.01.2020</td></tr>`;
}

/** Serves a fake ČSFD ratings list (newest first) and records which pages were fetched. */
function mockCsfdRatings(movieIds) {
  const pageCount = Math.ceil(movieIds.length / PER_PAGE);
  const fetchedPages = [];
  global.fetch = jest.fn(async (url) => {
    const page = Number(new URL(url).searchParams.get('page') || '1');
    fetchedPages.push(page);
    const rows = movieIds.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(ratingRow).join('');
    const pagination = Array.from({ length: pageCount - 1 }, (_, index) => index + 2)
      .map((n) => `<a href="/uzivatel/${USER}/hodnoceni/?page=${n}">${n}</a>`)
      .join('');
    const html = `<h2>Upozornění</h2><h2>Hodnocení (${movieIds.length})</h2><div class="pagination">${pagination}</div><table>${rows}</table>`;
    return { ok: true, text: async () => html };
  });
  return fetchedPages;
}

function localRecord(movieId) {
  return {
    id: `${USER}:${movieId}`,
    userSlug: USER,
    movieId,
    rating: 3,
    date: '01.01.2020',
    computed: false,
    lastUpdate: '2026-01-01T00:00:00.000Z',
  };
}

async function seedLocal(movieIds) {
  await storage.saveToIndexedDB('CC-Ratings', 'ratings', movieIds.map(localRecord));
}

async function localDirectIds() {
  const records = await storage.getAllFromIndexedDB('CC-Ratings', 'ratings');
  return records
    .filter((record) => record.deleted !== true)
    .map((record) => record.movieId)
    .sort((a, b) => a - b);
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

beforeAll(async () => {
  const loader = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-loader.js')).href);
  ({ loadRatingsForCurrentUser, isSweepInSync } = loader);
  storage = await import(pathToFileURL(path.resolve(__dirname, '../src/storage.js')).href);
});

beforeEach(async () => {
  document.body.innerHTML = `<a class="profile initialized" href="/uzivatel/${USER}/prehled/">me</a>`;
  await storage.deleteAllDataFromIndexedDB('CC-Ratings', 'ratings');
});

afterEach(() => {
  delete global.fetch;
});

describe('isSweepInSync', () => {
  test('is in sync only when the local count equals a known ČSFD total', () => {
    expect(isSweepInSync({ totalRatings: 12, directRatingsCount: 12 })).toBe(true);
    expect(isSweepInSync({ totalRatings: 12, directRatingsCount: 11 })).toBe(false);
    expect(isSweepInSync({ totalRatings: 12, directRatingsCount: 13 })).toBe(false);
    expect(isSweepInSync({ totalRatings: 0, directRatingsCount: 0 })).toBe(false);
  });
});

describe('ratings sweep', () => {
  test('new ratings on the first page: loads them and stops as soon as the count matches', async () => {
    // ČSFD lists newest first: 11 and 12 are the new ones.
    const fetchedPages = mockCsfdRatings([12, 11, ...range(1, 10).reverse()]);
    await seedLocal(range(1, 10));

    const result = await loadRatingsForCurrentUser();

    expect(result).toMatchObject({ endReason: 'in-sync', loadedPages: 1, totalPages: 3, totalUpserted: 2 });
    expect(fetchedPages).toEqual([1]);
    expect(await localDirectIds()).toEqual(range(1, 12));
  });

  test('more local ratings than ČSFD: sweeps to the last page and marks the extra one deleted', async () => {
    const fetchedPages = mockCsfdRatings(range(1, 12).reverse());
    await seedLocal([...range(1, 12), 99]);

    const result = await loadRatingsForCurrentUser();

    expect(result).toMatchObject({ endReason: 'completed', loadedPages: 3, totalMarkedDeleted: 1 });
    expect(fetchedPages).toEqual([1, 2, 3]);
    expect(await localDirectIds()).toEqual(range(1, 12));
  });

  test('Stop keeps what was loaded and never marks deletions', async () => {
    mockCsfdRatings(range(1, 12).reverse());
    await seedLocal([99]);
    let pagesDone = 0;

    const result = await loadRatingsForCurrentUser(() => (pagesDone += 1), { shouldStop: () => pagesDone >= 1 });

    expect(result).toMatchObject({ endReason: 'stopped', loadedPages: 1, totalUpserted: 4, totalMarkedDeleted: 0 });
    expect(await localDirectIds()).toEqual([9, 10, 11, 12, 99]);
  });

  test('sweepToEnd (Shift+click) reads every page even when already in sync', async () => {
    const fetchedPages = mockCsfdRatings(range(1, 12).reverse());
    await seedLocal(range(1, 12));

    const result = await loadRatingsForCurrentUser(() => {}, { sweepToEnd: true });

    expect(result).toMatchObject({ endReason: 'completed', loadedPages: 3, totalUpserted: 0, totalMarkedDeleted: 0 });
    expect(fetchedPages).toEqual([1, 2, 3]);
  });

  test('rows without a readable total are flagged instead of silently skipping auto-stop', async () => {
    mockCsfdRatings(range(1, 4).reverse());
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url) => {
      const response = await realFetch(url);
      const html = (await response.text()).replace(/<h2>Hodnocení \(\d+\)<\/h2>/, '<h2>Hodnocení</h2>');
      return { ok: true, text: async () => html };
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await loadRatingsForCurrentUser();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    expect(result).toMatchObject({ totalRatings: 0, totalMissing: true, endReason: 'completed', totalMarkedDeleted: 0 });
  });
});
