const path = require('path');
const { pathToFileURL } = require('url');

let utils;
let Csfd;

beforeAll(async () => {
  utils = await import(pathToFileURL(path.resolve(__dirname, '../src/utils.js')).href);
  ({ Csfd } = await import(pathToFileURL(path.resolve(__dirname, '../src/csfd.js')).href));
});

describe('user parsing helpers', () => {
  test('extracts user slug from relative and absolute CSFD profile URLs', () => {
    expect(utils.extractUserSlug('/uzivatel/12345-test-user/hodnoceni/')).toBe('12345-test-user');
    expect(utils.extractUserSlug('/uzivatel/12345-test-user')).toBe('12345-test-user');
    expect(utils.extractUserSlug('https://www.csfd.cz/uzivatel/12345-test-user/prehled/')).toBe('12345-test-user');
  });

  test('extracts readable username from a user slug', () => {
    expect(utils.extractUsernameFromUserSlug('12345-test-user')).toBe('test-user');
    expect(utils.extractUsernameFromUserSlug('67890-jmeno-s-pomlckou')).toBe('jmeno-s-pomlckou');
    expect(utils.extractUsernameFromUserSlug('missing-separator')).toBeUndefined();
  });

  test('extracts readable username directly from a profile href', () => {
    expect(utils.extractUsernameFromHref('/uzivatel/12345-test-user/')).toBe('test-user');
    expect(utils.extractUsernameFromHref('/uzivatel/12345-test-user')).toBe('test-user');
    expect(utils.extractUsernameFromHref('/film/9499-the-matrix/')).toBeUndefined();
  });

  test('csfd class resolves username through shared helpers', () => {
    const csfd = new Csfd(document.body);
    csfd.userUrl = '/uzivatel/12345-test-user/prehled/';

    expect(csfd.getUsername()).toBe('test-user');
    expect(csfd.username).toBe('test-user');
  });
});

describe('film path parsing (films with and without a slug)', () => {
  test('reads ids from slugged, slug-less, episode and absolute film URLs', () => {
    expect(utils.parseFilmPath('/film/9499-matrix/')).toEqual({ ids: [9499], segments: ['9499-matrix'] });
    expect(utils.parseFilmPath('/film/410649/recenze/')).toEqual({ ids: [410649], segments: ['410649'] });
    expect(utils.parseFilmPath('/film/410649')).toEqual({ ids: [410649], segments: ['410649'] });
    expect(utils.parseFilmPath('https://www.csfd.cz/film/508444-velka-sestka/765973-hardlight/prehled/')).toEqual({
      ids: [508444, 765973],
      segments: ['508444-velka-sestka', '765973-hardlight'],
    });
    expect(utils.parseFilmPath('/film/410649/?page=2')).toEqual({ ids: [410649], segments: ['410649'] });
    expect(utils.parseFilmPath('/uzivatel/123-me/hodnoceni/')).toBeNull();
    expect(utils.parseFilmPath('/film/abc/')).toBeNull();
  });

  test('getMovieIdFromUrl handles a film without a slug', () => {
    expect(utils.getMovieIdFromUrl('/film/410649/recenze/')).toBe(410649);
    expect(utils.getMovieIdFromUrl('/film/508444-velka-sestka/765973-hardlight/')).toBe(765973);
    expect(utils.getMovieIdFromUrl('/film/9499-matrix/')).toBe(9499);
  });

  test('the current film page id is read from a slug-less URL', () => {
    window.history.pushState({}, '', '/film/410649/recenze/');
    const info = Csfd.prototype.getCurrentItemUrlAndIds.call({});
    window.history.pushState({}, '', '/');

    expect(info).toMatchObject({ movieId: 410649, urlSlug: '410649', parentId: NaN, parentName: '' });
    expect(info.fullUrl).toBe(`${location.origin}/film/410649/`);
  });
});
