const path = require('path');
const { pathToFileURL } = require('url');

let config;

beforeAll(async () => {
  config = await import(pathToFileURL(path.resolve(__dirname, '../src/config.js')).href);
});

describe('config helpers', () => {
  test('detects CZ and SK locales from hostname', () => {
    expect(config.getCsfdLocale('www.csfd.cz')).toBe('cz');
    expect(config.getCsfdLocale('www.csfd.sk')).toBe('sk');
    expect(config.getCsfdLocale('csfd.cz')).toBe('cz');
  });

  test('returns locale-specific path segments', () => {
    expect(config.getCsfdPathSegment('overview', 'cz')).toBe('prehled');
    expect(config.getCsfdPathSegment('overview', 'sk')).toBe('prehlad');
    expect(config.getCsfdPathSegment('ratings', 'www.csfd.sk')).toBe('hodnotenia');
    expect(config.getCsfdPathSegment('reviews', 'www.csfd.cz')).toBe('recenze');
    expect(config.getCsfdPathSegment('reviews', 'www.csfd.sk')).toBe('recenzie');
  });

  test('returns unique path segment values and regex patterns', () => {
    expect(config.getCsfdPathSegmentValues('overview')).toEqual(['prehled', 'prehlad']);
    expect(config.getCsfdPathSegmentValues('reviews')).toEqual(['recenze', 'recenzie']);
    expect(config.getCsfdPathSegmentPattern('reviews')).toBe('recenze|recenzie');
  });

  test('returns shared alias patterns for creator and gallery paths', () => {
    expect(config.getCsfdPathAliasPattern('creator')).toBe('tvurce|tvorca');
    expect(config.getCsfdPathAliasPattern('discussion')).toBe('diskuze|diskusia|diskusie');
    expect(config.getCsfdPathAliasPattern('gallery')).toBe('galerie|galaria');
  });

  test('returns locale-specific creator role labels', () => {
    expect(config.getCsfdCreatorRoleLabel('actors', 'cz')).toBe('Hrají');
    expect(config.getCsfdCreatorRoleLabel('actors', 'sk')).toBe('Hrajú');
    expect(config.getCsfdCreatorRoleLabel('directors', 'www.csfd.sk')).toBe('Réžia');
  });

  test('matches localized text variants for review-related headings', () => {
    expect(config.matchesCsfdTextVariant('reviewHeading', 'Recenze (12)')).toBe(true);
    expect(config.matchesCsfdTextVariant('reviewHeading', 'Recenzie (7)')).toBe(true);
    expect(config.matchesCsfdTextVariant('recentReviewsOrRatingsHeading', 'Poslední recenze')).toBe(true);
    expect(config.matchesCsfdTextVariant('recentReviewsOrRatingsHeading', 'Posledné hodnotenia')).toBe(true);
    expect(config.matchesCsfdTextVariant('recentDiaryHeading', 'Poslední deníček')).toBe(true);
    expect(config.matchesCsfdTextVariant('recentDiaryHeading', 'Posledny dennik')).toBe(true);
    expect(config.matchesCsfdTextVariant('recentReviewsOrRatingsHeading', 'Poslední deníček')).toBe(false);
  });

  test('builds a shared user profile subpath pattern', () => {
    const pattern = new RegExp(`^(${config.getCsfdUserProfileSubpathPattern()})$`, 'i');

    expect(pattern.test('prehled')).toBe(true);
    expect(pattern.test('prehlad')).toBe(true);
    expect(pattern.test('denicek')).toBe(true);
    expect(pattern.test('dennik')).toBe(true);
    expect(pattern.test('filmoteka')).toBe(true);
    expect(pattern.test('biografia')).toBe(true);
    expect(pattern.test('zaujimavosti')).toBe(true);
    expect(pattern.test('galaria')).toBe(true);
    expect(pattern.test('diskusia')).toBe(true);
    expect(pattern.test('hodnoceni')).toBe(false);
  });

  test('normalizes CZ and SK show type aliases to shared canonical values', () => {
    expect(config.normalizeCsfdShowType('epizoda')).toBe('episode');
    expect(config.normalizeCsfdShowType('epizóda')).toBe('episode');
    expect(config.normalizeCsfdShowType('seriál')).toBe('serial');
    expect(config.normalizeCsfdShowType('série')).toBe('season');
    expect(config.normalizeCsfdShowType('séria')).toBe('season');
    expect(config.normalizeCsfdShowType('TV film')).toBe('tv movie');
    expect(config.normalizeCsfdShowType('film')).toBe('movie');
    expect(config.normalizeCsfdShowType('')).toBe('movie');
  });
});
