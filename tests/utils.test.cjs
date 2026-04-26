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
