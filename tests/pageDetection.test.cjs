const path = require('path');
const { pathToFileURL } = require('url');

let Csfd;

beforeAll(async () => {
  ({ Csfd } = await import(pathToFileURL(path.resolve(__dirname, '../src/csfd.js')).href));
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div class="page-content"></div>';
});

function csfdAt(pathname) {
  window.history.replaceState({}, '', pathname);
  return new Csfd(document.querySelector('.page-content'));
}

// Regression guard: these regexes were once built from plain template literals
// where `\d` silently cooked to `d`, so none of them ever matched a real path.
describe('page detection', () => {
  test('detects user overview pages in both locales', () => {
    expect(csfdAt('/uzivatel/12345-test-user/prehled/').isOnUserOverviewPage()).toBe(true);
    expect(csfdAt('/uzivatel/12345-test-user/prehlad/').isOnUserOverviewPage()).toBe(true);
    expect(csfdAt('/uzivatel/12345-test-user/recenze/').isOnUserOverviewPage()).toBe(false);
    expect(csfdAt('/film/9499-the-matrix/prehled/').isOnUserOverviewPage()).toBe(false);
  });

  test('detects user reviews pages in both locales', () => {
    expect(csfdAt('/uzivatel/12345-test-user/recenze/').isOnUserReviewsPage()).toBe(true);
    expect(csfdAt('/uzivatel/12345-test-user/recenzie/').isOnUserReviewsPage()).toBe(true);
    expect(csfdAt('/uzivatel/12345-test-user/prehled/').isOnUserReviewsPage()).toBe(false);
  });

  test('extracts the slug from ratings pages', () => {
    expect(csfdAt('/uzivatel/12345-test-user/hodnoceni/').getRatingsPageSlug()).toBe('12345-test-user');
    expect(csfdAt('/uzivatel/12345-test-user/hodnotenia/').getRatingsPageSlug()).toBe('12345-test-user');
    expect(csfdAt('/uzivatel/12345-test-user/prehled/').getRatingsPageSlug()).toBeUndefined();
  });

  test('detects creator pages for both path aliases', () => {
    expect(csfdAt('/tvurce/123-jan-novak/prehled/').isOnCreatorPage()).toBe(true);
    expect(csfdAt('/tvorca/123-jan-novak/prehlad/').isOnCreatorPage()).toBe(true);
    expect(csfdAt('/film/123-jan-novak/').isOnCreatorPage()).toBe(false);
  });

  test('detects foreign vs own ratings pages', () => {
    const csfd = csfdAt('/uzivatel/99999-someone-else/hodnoceni/');
    csfd.userSlug = '12345-test-user';
    expect(csfd.isOnForeignRatingsPage()).toBe(true);
    expect(csfd.isOnOwnRatingsPage()).toBe(false);

    const own = csfdAt('/uzivatel/12345-test-user/hodnoceni/');
    own.userSlug = '12345-test-user';
    expect(own.isOnForeignRatingsPage()).toBe(false);
    expect(own.isOnOwnRatingsPage()).toBe(true);
  });

  test('detects gallery pages for both locales', () => {
    expect(csfdAt('/film/9499-the-matrix/galerie/').isOnGalleryPage()).toBe(true);
    expect(csfdAt('/film/9499-the-matrix/galaria/').isOnGalleryPage()).toBe(true);
    expect(csfdAt('/film/9499-the-matrix/prehled/').isOnGalleryPage()).toBe(false);
  });
});
