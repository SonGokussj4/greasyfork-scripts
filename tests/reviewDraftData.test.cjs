const path = require('path');
const { pathToFileURL } = require('url');

let deriveDraftId;
let parseLanguageIndex;
let normalizeReviewText;
let htmlToPlainText;
let draftHasContent;
let getPrimaryLanguageIndex;
let isDraftPublished;
let buildDraftStorageKey;
let formatDraftAge;
let formatClockTime;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/review-draft-data.js')).href;
  const mod = await import(moduleUrl);
  ({
    deriveDraftId,
    parseLanguageIndex,
    normalizeReviewText,
    htmlToPlainText,
    draftHasContent,
    getPrimaryLanguageIndex,
    isDraftPublished,
    buildDraftStorageKey,
    formatDraftAge,
    formatClockTime,
  } = mod);
});

describe('deriveDraftId', () => {
  test('strips the language suffix from a TinyMCE autosave id', () => {
    expect(deriveDraftId('film-comment-953802-lang1')).toBe('film-comment-953802');
    expect(deriveDraftId('film-comment-1540221-lang3')).toBe('film-comment-1540221');
  });

  test('falls back to the film/season id from the URL path', () => {
    expect(deriveDraftId('', '/film/687415-andor/953802-season-1/recenze/')).toBe('film-comment-953802');
    expect(deriveDraftId(null, '/film/1797613-gekijoban-medalist/recenze/')).toBe('film-comment-1797613');
  });

  test('returns null when no autosave id and no numeric segment in the path', () => {
    expect(deriveDraftId('', '/podpora/')).toBeNull();
    expect(deriveDraftId()).toBeNull();
  });
});

describe('parseLanguageIndex', () => {
  test('extracts the numeric language index from the textarea name', () => {
    expect(parseLanguageIndex('languages[1][text]')).toBe('1');
    expect(parseLanguageIndex('languages[3][text]')).toBe('3');
  });

  test('returns null for non-matching names', () => {
    expect(parseLanguageIndex('frm-other')).toBeNull();
    expect(parseLanguageIndex('')).toBeNull();
  });
});

describe('normalizeReviewText', () => {
  test('strips tags, decodes entities and collapses whitespace', () => {
    expect(normalizeReviewText('<p>Hello&nbsp;<strong>World</strong>!</p>')).toBe('hello world !');
    expect(normalizeReviewText('A&amp;B')).toBe('a&b');
  });

  test('turns block/break boundaries into spaces so words do not fuse', () => {
    expect(normalizeReviewText('one<br>two')).toBe('one two');
    expect(normalizeReviewText('<p>one</p><p>two</p>')).toBe('one two');
  });

  test('handles nullish input', () => {
    expect(normalizeReviewText(null)).toBe('');
    expect(normalizeReviewText(undefined)).toBe('');
  });
});

describe('htmlToPlainText', () => {
  test('keeps line breaks from block elements and decodes entities', () => {
    expect(htmlToPlainText('<p>Line one</p><p>Line two</p>')).toBe('Line one\nLine two');
    expect(htmlToPlainText('a<br>b')).toBe('a\nb');
    expect(htmlToPlainText('R&amp;D &lt;ok&gt;')).toBe('R&D <ok>');
  });
});

describe('draftHasContent', () => {
  test('true when any language has real text', () => {
    expect(draftHasContent({ 1: '', 2: '<p></p>', 3: 'Hello' })).toBe(true);
  });

  test('false for empty / markup-only / invalid drafts', () => {
    expect(draftHasContent({ 1: '', 2: '<br>', 3: '   ' })).toBe(false);
    expect(draftHasContent({})).toBe(false);
    expect(draftHasContent(null)).toBe(false);
  });
});

describe('getPrimaryLanguageIndex', () => {
  test('prefers Czech, then Slovak, then English', () => {
    expect(getPrimaryLanguageIndex({ 1: 'cz', 2: 'sk', 3: 'en' })).toBe('1');
    expect(getPrimaryLanguageIndex({ 1: '', 2: 'sk', 3: 'en' })).toBe('2');
    expect(getPrimaryLanguageIndex({ 1: '', 2: '', 3: 'en' })).toBe('3');
  });

  test('returns null when nothing has content', () => {
    expect(getPrimaryLanguageIndex({ 1: '', 2: '' })).toBeNull();
  });
});

describe('isDraftPublished', () => {
  test('matches when the published review contains the draft text', () => {
    const langs = { 1: '<p>Wow, tady i za mě opravdu není potřeba nic vymýšlet a házet hvězdičky.</p>' };
    const published = 'Wow, tady i za mě opravdu není potřeba nic vymýšlet a házet hvězdičky. (a navíc něco)';
    expect(isDraftPublished(published, langs)).toBe(true);
  });

  test('matches across HTML wrapping and whitespace differences', () => {
    const langs = { 1: '<p>This is <strong>some</strong> long enough review text here.</p>' };
    const published = 'This is some long enough review text here.';
    expect(isDraftPublished(published, langs)).toBe(true);
  });

  test('short drafts require an exact match to avoid false positives', () => {
    expect(isDraftPublished('Great movie indeed', { 1: 'Great' })).toBe(false);
    expect(isDraftPublished('Great', { 1: 'Great' })).toBe(true);
  });

  test('no match when texts differ', () => {
    const langs = { 1: 'Completely different draft content that is long enough.' };
    expect(isDraftPublished('Some published review about another film entirely.', langs)).toBe(false);
  });

  test('false for empty published text', () => {
    expect(isDraftPublished('', { 1: 'anything long enough to compare' })).toBe(false);
  });
});

describe('buildDraftStorageKey', () => {
  test('concatenates prefix and id', () => {
    expect(buildDraftStorageKey('cc_review_draft_v1_', 'film-comment-953802')).toBe(
      'cc_review_draft_v1_film-comment-953802',
    );
  });
});

describe('formatDraftAge', () => {
  const base = 1_700_000_000_000;

  test('renders coarse relative buckets', () => {
    expect(formatDraftAge(base, base + 3_000)).toBe('právě teď');
    expect(formatDraftAge(base, base + 25_000)).toBe('před 25 s');
    expect(formatDraftAge(base, base + 5 * 60_000)).toBe('před 5 min');
    expect(formatDraftAge(base, base + 3 * 3_600_000)).toBe('před 3 h');
  });

  test('falls back to an absolute timestamp past a day', () => {
    const out = formatDraftAge(base, base + 2 * 24 * 3_600_000);
    expect(typeof out).toBe('string');
    expect(out).not.toMatch(/^před /);
  });
});

describe('formatClockTime', () => {
  test('returns a HH:MM:SS-ish string', () => {
    expect(formatClockTime(1_700_000_000_000)).toMatch(/\d{1,2}[:.]\d{2}[:.]\d{2}/);
  });
});
