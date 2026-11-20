/**
 * @jest-environment-options {"url": "https://www.csfd.sk/"}
 */
// Ratings loading and the ratings check on csfd.sk: Slovak path segments and headings.
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

let loader;
let check;
let storage;

function ratingRow(id) {
  return `<tr><td class="name"><h3 class="film-title-inline"><a class="film-title-name" href="/film/${id}-film-${id}/">Film ${id}</a><span class="film-title-info"><span class="info">2020</span><span class="info">film</span></span></h3></td><td class="star-rating-only"><span class="star-rating"><span class="stars stars-4"></span></span></td><td class="date-only">01.01.2020</td></tr>`;
}

/** Serves a csfd.sk ratings list (newest first) at /uzivatel/1-me/hodnotenia/, 404 anywhere else. */
function mockCsfdSkRatings(movieIds, { reportedTotal = movieIds.length } = {}) {
  const pageCount = Math.ceil(movieIds.length / PER_PAGE);
  global.fetch = jest.fn(async (url) => {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://www.csfd.sk' || parsed.pathname !== `/uzivatel/${USER}/hodnotenia/`) {
      return { ok: false, status: 404, text: async () => '' };
    }
    const page = Number(parsed.searchParams.get('page') || '1');
    const rows = movieIds.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(ratingRow).join('');
    const pagination = Array.from({ length: pageCount - 1 }, (_, index) => index + 2)
      .map((n) => `<a href="/uzivatel/${USER}/hodnotenia/?page=${n}">${n}</a>`)
      .join('');
    const html = `<h2>Upozornenie</h2><h2>Hodnotenia (${reportedTotal})</h2><div class="pagination">${pagination}</div><table>${rows}</table>`;
    return { ok: true, text: async () => html };
  });
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

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

beforeAll(async () => {
  loader = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-loader.js')).href);
  check = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-check.js')).href);
  storage = await import(pathToFileURL(path.resolve(__dirname, '../src/storage.js')).href);
});

beforeEach(async () => {
  document.body.innerHTML = `<a class="profile" href="/uzivatel/${USER}/prehlad/">me</a>`;
  localStorage.clear();
  await storage.deleteAllDataFromIndexedDB('CC-Ratings', 'ratings');
});

afterEach(() => {
  delete global.fetch;
});

test('runs on csfd.sk', () => {
  expect(location.hostname).toBe('www.csfd.sk');
});

test.each([`/uzivatel/${USER}/prehlad/`, `/uzivatel/${USER}/`, `/uzivatel/${USER}`])(
  'profile link %s: loads the Slovak ratings list',
  async (profileHref) => {
    document.body.innerHTML = `<a class="profile" href="${profileHref}">me</a>`;
    mockCsfdSkRatings(range(1, 6).reverse());

    const result = await loader.loadRatingsForCurrentUser();

    expect(global.fetch.mock.calls[0][0]).toBe(`https://www.csfd.sk/uzivatel/${USER}/hodnotenia/`);
    expect(result).toMatchObject({ totalRatings: 6, totalMissing: false, endReason: 'in-sync', totalUpserted: 6 });
  },
);

test('a total a few above the listed rows stops at the first unchanged page on csfd.sk too', async () => {
  mockCsfdSkRatings(range(1, 12).reverse(), { reportedTotal: 13 });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await loader.loadRatingsForCurrentUser(() => {}, { sweepToEnd: true });
  warn.mockRestore();

  const result = await loader.loadRatingsForCurrentUser();

  expect(result).toMatchObject({ endReason: 'caught-up', loadedPages: 1 });
});

test('ratings check on csfd.sk: reads every Slovak page, reports the gap and fixes what is missing', async () => {
  mockCsfdSkRatings(range(1, 9).reverse(), { reportedTotal: 10 });

  const done = waitForCheck();
  check.startRatingsCheck();
  await done;

  const report = check.loadRatingsCheckReport();
  expect(report).toMatchObject({ completed: true, totalRatings: 10, listedCount: 9, unlistedCount: 1, loadedPages: 3 });
  expect(report.counts.missing).toBe(9);
  expect(report.issues[0].url).toMatch(/^https:\/\/www\.csfd\.sk\/film\//);

  await check.applyRatingsCheckFixes(report);
  const stored = await storage.getAllFromIndexedDB('CC-Ratings', 'ratings');
  expect(stored.map((record) => record.movieId).sort((a, b) => a - b)).toEqual(range(1, 9));
  expect(stored[0]).toMatchObject({ userSlug: USER, rating: 4 });
});
