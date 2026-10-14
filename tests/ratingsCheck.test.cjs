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

let check;
let storage;

function ratingRow(id, stars = 3) {
  return `<tr><td class="name"><h3 class="film-title-inline"><a class="film-title-name" href="/film/${id}-film-${id}/">Film ${id}</a><span class="film-title-info"><span class="info">2020</span></span></h3></td><td class="star-rating-only"><span class="star-rating"><span class="stars stars-${stars}"></span></span></td><td class="date-only">01.01.2020</td></tr>`;
}

const UNREADABLE_ROW =
  '<tr><td class="name"><h3 class="film-title-inline">Skrytý film</h3></td><td class="date-only">02.02.2020</td></tr>';

/** Fake ČSFD ratings list, newest first. `rows` items are movie ids or raw <tr> strings. */
function mockCsfdRatings(rows, { reportedTotal, stars = {} } = {}) {
  const pageCount = Math.ceil(rows.length / PER_PAGE);
  global.fetch = jest.fn(async (url) => {
    const page = Number(new URL(url).searchParams.get('page') || '1');
    const html = rows
      .slice((page - 1) * PER_PAGE, page * PER_PAGE)
      .map((row) => (typeof row === 'number' ? ratingRow(row, stars[row]) : row))
      .join('');
    const pagination = Array.from({ length: pageCount - 1 }, (_, index) => index + 2)
      .map((n) => `<a href="/uzivatel/${USER}/hodnoceni/?page=${n}">${n}</a>`)
      .join('');
    const total = reportedTotal ?? rows.length;
    return {
      ok: true,
      text: async () => `<h2>Hodnocení (${total})</h2><div class="pagination">${pagination}</div><table>${html}</table>`,
    };
  });
}

function localRecord(movieId, extra = {}) {
  return {
    id: `${USER}:${movieId}`,
    userSlug: USER,
    movieId,
    name: `Film ${movieId}`,
    rating: 3,
    date: '01.01.2020',
    computed: false,
    lastUpdate: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

async function localById() {
  const records = await storage.getAllFromIndexedDB('CC-Ratings', 'ratings');
  return new Map(records.map((record) => [record.movieId, record]));
}

function waitForCheck() {
  return new Promise((resolve) => {
    const onUpdate = () => {
      if (!check.getRatingsCheckStatus().running) {
        window.removeEventListener('cc-ratings-check-updated', onUpdate);
        resolve();
      }
    };
    window.addEventListener('cc-ratings-check-updated', onUpdate);
  });
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

beforeAll(async () => {
  check = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-check.js')).href);
  storage = await import(pathToFileURL(path.resolve(__dirname, '../src/storage.js')).href);
});

beforeEach(async () => {
  document.body.innerHTML = `<a class="profile initialized" href="/uzivatel/${USER}/prehled/">me</a>`;
  localStorage.clear();
  await storage.deleteAllDataFromIndexedDB('CC-Ratings', 'ratings');
});

afterEach(() => {
  delete global.fetch;
});

describe('buildRatingsCheckReport', () => {
  const csfd = (movieId, extra = {}) => ({ ...localRecord(movieId), fullUrl: `https://www.csfd.cz/film/${movieId}/`, page: 1, ...extra });

  test('finds missing, different, extra, duplicate and unreadable rows', () => {
    const report = check.buildRatingsCheckReport({
      scan: {
        userSlug: USER,
        totalRatings: 6,
        totalPages: 1,
        loadedPages: 1,
        completed: true,
        records: [csfd(1), csfd(2, { rating: 5 }), csfd(3), csfd(3)],
        unreadableRows: [{ page: 1, text: 'Skrytý film' }],
      },
      localRecords: [localRecord(1), localRecord(2), localRecord(9), localRecord(3, { computed: true })],
    });

    expect(report.counts).toEqual({ missing: 1, different: 1, extra: 1, duplicate: 1, unreadable: 1 });
    expect(report.issues.map((issue) => issue.kind)).toEqual(['missing', 'different', 'extra', 'duplicate', 'unreadable']);
    expect(report).toMatchObject({ listedCount: 3, localDirectCount: 3, unlistedCount: 3 });
    expect(check.hasRatingsCheckProblems(report)).toBe(true);
  });

  test('a stopped scan never reports extra ratings or an unlisted count', () => {
    const report = check.buildRatingsCheckReport({
      scan: { userSlug: USER, totalRatings: 9, totalPages: 3, loadedPages: 1, completed: false, records: [csfd(1)], unreadableRows: [] },
      localRecords: [localRecord(1), localRecord(9)],
    });

    expect(report.counts.extra).toBe(0);
    expect(report.unlistedCount).toBe(0);
    expect(check.hasRatingsCheckProblems(report)).toBe(false);
  });
});

describe('ratings check', () => {
  test('Likan case: ČSFD counts one rating it does not list, the report says so and the "!" shows', async () => {
    mockCsfdRatings([...range(1, 6).reverse(), UNREADABLE_ROW], { reportedTotal: 7 });
    await storage.saveToIndexedDB('CC-Ratings', 'ratings', range(1, 6).map((id) => localRecord(id)));
    document.body.insertAdjacentHTML('beforeend', '<span class="cc-ratings-check-alert" hidden>!</span>');
    check.initializeRatingsCheckAlerts();

    const done = waitForCheck();
    check.startRatingsCheck();
    await done;

    const report = check.loadRatingsCheckReport();
    expect(report).toMatchObject({ completed: true, totalRatings: 7, listedCount: 6, unlistedCount: 1 });
    expect(report.issues).toEqual([expect.objectContaining({ kind: 'unreadable', name: expect.stringContaining('Skrytý film') })]);
    expect(document.querySelector('.cc-ratings-check-alert').hidden).toBe(false);

    check.clearRatingsCheckReport();
    expect(check.loadRatingsCheckReport()).toBeNull();
    expect(document.querySelector('.cc-ratings-check-alert').hidden).toBe(true);
  });

  test('Opravit writes missing and changed ratings and marks ratings gone from ČSFD as deleted', async () => {
    mockCsfdRatings([7, ...range(1, 5).reverse()], { stars: { 2: 5 } });
    await storage.saveToIndexedDB('CC-Ratings', 'ratings', [...range(1, 5), 99].map((id) => localRecord(id)));

    const done = waitForCheck();
    check.startRatingsCheck();
    await done;

    const report = check.loadRatingsCheckReport();
    expect(report.counts).toMatchObject({ missing: 1, different: 1, extra: 1 });

    const fixed = await check.applyRatingsCheckFixes(report);
    expect(fixed).toMatchObject({ fixedCount: 3, issues: [] });
    expect(check.hasRatingsCheckProblems(check.loadRatingsCheckReport())).toBe(false);

    const local = await localById();
    expect(local.get(7)).toMatchObject({ rating: 3, name: 'Film 7' });
    expect(local.get(7).deleted).toBeUndefined();
    expect(local.get(2).rating).toBe(5);
    expect(local.get(99)).toMatchObject({ deleted: true, rating: null });
  });

  test('Opravit leaves alone a rating changed locally after the check', async () => {
    mockCsfdRatings([1], { stars: { 1: 5 } });
    await storage.saveToIndexedDB('CC-Ratings', 'ratings', [localRecord(1)]);

    const done = waitForCheck();
    check.startRatingsCheck();
    await done;
    const report = check.loadRatingsCheckReport();

    const newer = new Date(Date.parse(report.checkedAt) + 60_000).toISOString();
    await storage.saveToIndexedDB('CC-Ratings', 'ratings', [localRecord(1, { rating: 4, lastUpdate: newer })]);

    const fixed = await check.applyRatingsCheckFixes(report);
    expect(fixed).toMatchObject({ fixedCount: 0, skippedFixCount: 1 });
    expect((await localById()).get(1).rating).toBe(4);
  });
});
