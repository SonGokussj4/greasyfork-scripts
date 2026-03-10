const path = require('path');
const { pathToFileURL } = require('url');

let compareVersions;
let extractVersionSectionsFromMarkdown;
let selectChangelogSectionsForRange;
let renderMarkdownToHtml;
let shouldShowWhatsNewModal;

beforeAll(async () => {
  ({
    compareVersions,
    extractVersionSectionsFromMarkdown,
    selectChangelogSectionsForRange,
    renderMarkdownToHtml,
    shouldShowWhatsNewModal,
  } = await import(pathToFileURL(path.resolve(__dirname, '../src/settings-version.js')).href));
});

describe('settings version changelog helpers', () => {
  test('compares semver-like versions correctly', () => {
    expect(compareVersions('0.8.24', '0.8.23')).toBe(1);
    expect(compareVersions('0.8.24', '0.8.24')).toBe(0);
    expect(compareVersions('0.9', '0.10')).toBe(-1);
  });

  test('extracts version sections from markdown headings', () => {
    const sections = extractVersionSectionsFromMarkdown(`
# Changelog

## 0.10.0
- New thing

## 0.9.0
- Older thing
`);

    expect(sections.map((section) => section.version)).toEqual(['0.10.0', '0.9.0']);
    expect(sections[0].markdown).toContain('New thing');
  });

  test('extracts unreleased sections with version heading suffixes', () => {
    const sections = extractVersionSectionsFromMarkdown(`
# Changelog

## 0.9.1 - unreleased
- Dev-only change

## 0.9.0 - 2026-03-09
- Released change
`);

    expect(sections.map((section) => section.version)).toEqual(['0.9.1', '0.9.0']);
    expect(sections[0].heading).toBe('0.9.1 - unreleased');
  });

  test('selects only versions inside the upgrade range', () => {
    const sections = selectChangelogSectionsForRange(
      `
# Changelog

## 0.10.0
- New thing

## 0.9.0
- Intermediate thing

## 0.8.0
- Old thing
`,
      '0.8.0',
      '0.10.0',
    );

    expect(sections.map((section) => section.version)).toEqual(['0.10.0', '0.9.0']);
  });

  test('selects current unreleased section for a dev build version', () => {
    const sections = selectChangelogSectionsForRange(
      `
# Changelog

## 0.9.1 - unreleased
- Dev-only change

## 0.9.0 - 2026-03-09
- Released change
`,
      '0.9.0',
      '0.9.1',
    );

    expect(sections.map((section) => section.heading)).toEqual(['0.9.1 - unreleased']);
  });

  test('renders markdown links and images with resolved URLs', () => {
    const html = renderMarkdownToHtml(
      `
## 0.8.24

- [GitHub](docs/guide.md)
![Preview](images/hint_ratings.png)
`,
      'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/master/',
    );

    expect(html).toContain('https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/master/docs/guide.md');
    expect(html).toContain(
      'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/master/images/hint_ratings.png',
    );
    expect(html).toContain('cc-version-markdown-image');
  });

  test('renders version/date heading and changelog kind items', () => {
    const html = renderMarkdownToHtml(`
## 0.8.24 - 2026-03-08

### Added
- Item

### Development
- Internal refactor

### Fixed
- Bug
`);

    expect(html).toContain('cc-version-markdown-heading-version');
    expect(html).toContain('cc-version-markdown-date');
    expect(html).toContain('cc-version-markdown-kind-item is-added');
    expect(html).toContain('cc-version-markdown-kind-item is-development');
    expect(html).toContain('cc-version-markdown-kind-item is-fixed');
    expect(html).toContain('title="Novinka"');
    expect(html).toContain('title="Vyvoj"');
    expect(html).toContain('title="Oprava"');
    expect(html).toContain('>0.8.24<');
  });

  test('shows whats new only when stored version is older than current', () => {
    expect(shouldShowWhatsNewModal('', '0.8.24')).toBe(true);
    expect(shouldShowWhatsNewModal('v0.8.23', '0.8.24')).toBe(true);
    expect(shouldShowWhatsNewModal('v0.8.24', '0.8.24')).toBe(false);
    expect(shouldShowWhatsNewModal('v0.8.25', '0.8.24')).toBe(false);
    expect(shouldShowWhatsNewModal('0.8.23', '0.8.24')).toBe(true);
  });
});
