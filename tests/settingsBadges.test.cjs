const path = require('path');
const { pathToFileURL } = require('url');

let fetchTotalRatingsForCurrentUser;
let invalidateRatingsTotalCache;

const RATINGS_PAGE_HTML = '<div id="snippet--ratings"><h2>Hodnocení (2 448)</h2></div>';

beforeAll(async () => {
  ({ fetchTotalRatingsForCurrentUser, invalidateRatingsTotalCache } = await import(
    pathToFileURL(path.resolve(__dirname, '../src/settings-badges.js')).href
  ));
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<a class="profile initialized" href="/uzivatel/78145-songokussj/prehled/">me</a>';
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => RATINGS_PAGE_HTML }));
});

afterEach(() => {
  delete global.fetch;
});

describe('ratings total cache', () => {
  test('downloads the ratings page once and serves later page views from cache', async () => {
    const [first, second] = await Promise.all([fetchTotalRatingsForCurrentUser(), fetchTotalRatingsForCurrentUser()]);
    const third = await fetchTotalRatingsForCurrentUser();

    expect([first, second, third]).toEqual([2448, 2448, 2448]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/uzivatel\/78145-songokussj\/hodnoceni\/$/);
  });

  test('invalidation forces a fresh download', async () => {
    await fetchTotalRatingsForCurrentUser();
    invalidateRatingsTotalCache();
    await fetchTotalRatingsForCurrentUser();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('an expired cache entry is ignored', async () => {
    await fetchTotalRatingsForCurrentUser();
    const cached = JSON.parse(localStorage.getItem('cc_ratings_total_cache_v1'));
    cached.timestamp -= 31 * 60 * 1000;
    localStorage.setItem('cc_ratings_total_cache_v1', JSON.stringify(cached));

    await fetchTotalRatingsForCurrentUser();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
