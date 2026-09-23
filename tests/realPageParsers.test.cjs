// Parsers checked against real ČSFD markup (tests/pages), not hand-written HTML.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let loader;
let providers;

const loadPage = (name) =>
  new DOMParser().parseFromString(fs.readFileSync(path.resolve(__dirname, 'pages', name), 'utf8'), 'text/html');

beforeAll(async () => {
  loader = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-loader.js')).href);
  providers = await import(pathToFileURL(path.resolve(__dirname, '../src/hover-preview-providers.js')).href);
});

describe('ratings list page (tests/pages/ratingsList.html)', () => {
  test('reads total, page count and pagination style', () => {
    const doc = loadPage('ratingsList.html');
    expect(loader.parseTotalRatingsFromDocument(doc)).toBe(29225);
    expect(loader.parseMaxPaginationPageFromDocument(doc)).toBe(585);
    expect(loader.detectPaginationModeFromDocument(doc)).toBe('query');
  });

  test('parses every row with a unique id and a valid rating', () => {
    const rows = loader.parseRatingsFromDocument(loadPage('ratingsList.html'), 'https://www.csfd.cz');

    expect(rows).toHaveLength(50);
    expect(new Set(rows.map((row) => row.id)).size).toBe(50);
    rows.forEach((row) => {
      expect(Number.isFinite(row.id)).toBe(true);
      expect(row.name).not.toBe('');
      expect(row.rating >= 0 && row.rating <= 5).toBe(true);
    });
  });
});

describe('review preview rating', () => {
  const reviewDoc = (starsClass) =>
    new DOMParser().parseFromString(
      `<h1>Film</h1><article data-film-review><h3 class="user-title"><a class="user-title-name" href="/uzivatel/1-a/">a</a></h3>
       <span class="star-rating"><span class="${starsClass}"></span></span><div data-film-review-content>text</div></article>`,
      'text/html',
    );

  test('reads stars and treats "odpad" (trash) as 0 instead of no rating', () => {
    expect(providers.parseReviewPreviewDocument(reviewDoc('stars stars-4'), 'https://www.csfd.cz/film/1-a/').rating).toBe(4);
    expect(providers.parseReviewPreviewDocument(reviewDoc('stars trash'), 'https://www.csfd.cz/film/1-a/').rating).toBe(0);
    expect(providers.parseReviewPreviewDocument(reviewDoc('stars'), 'https://www.csfd.cz/film/1-a/').rating).toBeNull();
  });
});
