# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # One-time build → dist/csfd-compare.user.js
npm run dev            # Watch mode (rebuilds on src changes)
npm test               # Run all Jest tests
npm run test:hover-preview  # Run a single test file (pattern: tests/<name>.test.cjs)
```

To run a single test file directly:
```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js tests/inlineRatings.test.cjs --runInBand
```

The `prebuild`/`predev`/`prewatch` hooks run `sync-version` then `generate-build-meta.mjs` (which embeds `CHANGELOG.md` into the bundle) before Rollup. `sync-version` keeps `src/config.js`, `src/settings-button-content.html` and the `## x.y.z - unreleased` heading in `CHANGELOG.md` in sync with the version in `package.json` — bumping the version in `package.json` is the single source of truth.

**Never hand-edit `dist/csfd-compare.user.js`** — it is fully generated.

A version-bump commit message is exactly `chore: bump version to x.y.z` with nothing else (see `.github/SKILLS/commit-message/SKILL.md`).

`make setup` / `make login` / `make download-pages` (Python + Playwright under `scripts/`) re-download the ČSFD page fixtures used by tests. Login needs `CSFD_USERNAME` and `CSFD_PASSWORD`.

## Architecture

This is a Greasyfork userscript for csfd.cz / csfd.sk bundled with Rollup into a single IIFE file. There are no runtime dependencies; all code is vanilla JS + CSS.

### Startup sequence (`src/main.js`)

1. `addSettingsButton()` — injects the settings gear button into the ČSFD header bar.
2. `new Csfd(pageContent).initialize()` — detects login state, loads ratings from IndexedDB, determines current page type.
3. `csfd.addStars()` — first-pass star injection into visible film links.
4. `initializeHoverPreviews()` — attaches hover card logic.
5. `initializeReviewDraftAutosave()` — wires the review draft autosave (no-op outside the reviews page).
6. A `MutationObserver` re-runs `addStars()` / link-icon injection debounced at 200 ms whenever new film links appear (AJAX pagination, Nette snippets).

Feature toggles fire as `CustomEvent` on `window` (e.g. `cc-show-all-creator-tabs-toggled`) — `main.js` listens and either delegates to a `csfd.*` method (older inline features) or to a standalone feature module (newer extracted features like `home-panels.js`, `gallery-links.js`, `discussions.js`, `review-draft.js`). New self-contained features should be their own module with an `initialize*()` entry point called from `main.js`, not new methods on the `Csfd` class.

### Module map

| Module | Responsibility |
|---|---|
| `src/csfd.js` | `Csfd` class — page-specific DOM logic, star injection, ratings parsing, creator tabs, page-type detection; delegates extracted page features below |
| `src/home-panels.js` | Homepage panel hiding (hide buttons, title normalization, group/row collapse) |
| `src/gallery-links.js` | "Open image in size X" links under gallery pictures |
| `src/discussions.js` | Self-reply ("Reagovat") button on the user's own forum posts |
| `src/review-draft.js` | Review draft autosave controller — wires to ČSFD's TinyMCE review form, debounced save to `localStorage`, restore banner, submit/publish detection, clear-on-success |
| `src/review-draft-data.js` | Pure helpers for review drafts: draft-id derivation, text normalization, publish-match, age/time formatting |
| `src/config.js` | All constants, localStorage keys, locale-aware helpers (`getCsfdPathSegment`, `matchesCsfdTextVariant`, etc.) |
| `src/settings-config.js` | Data-driven `MENU_CONFIG` — the source of truth for settings-menu categories, toggles and groups (rendered by `settings.js`) |
| `src/storage.js` | IndexedDB singleton wrapper + `localStorage` settings helpers |
| `src/ratings-loader.js` | One newest-first sweep over the user's ČSFD ratings pages (50–500 ms jitter per page): stops by itself when the local count equals the ČSFD total, Stop keeps what was loaded, only a sweep that reaches the last page marks ratings missing on ČSFD as deleted. Also the resumable computed-ratings loader. |
| `src/ratings-sync.js` | Cloud sync modal UI + merge/conflict logic |
| `src/supabase-api.js` | Thin fetch wrappers for the Supabase REST API (token CRUD, upload, download) with 503-retry logic |
| `src/ratings-records.js` | Pure data helpers: record ID construction, multi-user record reconciliation |
| `src/hover-preview.js` | Hover card controller (attaches to links, shows/hides the overlay) |
| `src/hover-preview-providers.js` | Per-link-type content fetchers (film, creator, user, review, external) |
| `src/settings.js` | Thin orchestrator — wires settings menu buttons to submodules |
| `src/settings-ratings-modal.js` | Opens the "My Ratings" modal; caching layer |
| `src/settings-ratings-modal-data.js` | Pure transforms: row normalization, filtering, sorting |
| `src/settings-ratings-modal-view.js` | Modal DOM lifecycle, search/filter/sort UI event wiring |
| `src/settings-ratings-modal-detail.js` | Single-rating detail overlay |
| `src/settings-version.js` | Version badge, GreasyFork update check, changelog fetch/cache + modal UI |
| `src/settings-changelog.js` | Pure: version comparison, CHANGELOG.md Markdown→HTML rendering, "what's new" section selection |
| `src/settings-hover.js` | Header-bar settings menu hover open/close (touches only our menu button so ČSFD's own dropdowns don't all fire) |
| `src/settings-badges.js` | Red/black badge counters, loaded-vs-total warning |
| `src/link-icons.js` | Configurable link-icon injection into page text |
| `src/ui-utils.js` | Shared DOM helpers |
| `src/utils.js` | Generic pure utilities |
| `src/env.js` | Runtime environment detection |

### Data flow for ratings

- Ratings are stored in IndexedDB (`CC-Ratings` / `ratings` store) as records keyed by a composite ID (`{movieId}-{userSlug}`).
- `ratings-loader.js` scrapes ČSFD pages → saves to IndexedDB → fires `cc-ratings-updated`.
- `csfd.js` reads from IndexedDB on init and merges into `this.stars` (keyed by numeric movieId).
- Cloud sync (`ratings-sync.js` + `supabase-api.js`) uses a token-per-user model; conflicts surface a modal before any overwrite.

### Gotchas

- When building a `RegExp` from a template literal, use `String.raw` — in a plain template literal `\d` cooks to `d` and the regex silently never matches. This bug shipped four times before being caught; prefer the precompiled module-level regex constants in `csfd.js` as the pattern to follow.

### Locale

Both csfd.**cz** and csfd.**sk** are supported. Path segments and UI labels differ between locales. Always use `getCsfdPathSegment()`, `getCsfdPathSegmentPattern()`, and related helpers from `src/config.js` instead of hardcoding Czech strings. The `CSFD_SITE_CONFIG` object in `config.js` is the canonical locale map.

### Reference HTML pages

`pages/*.html` are saved snapshots of real ČSFD pages for the current site version. Use them as selector references when targeting page elements. `tests/pages/*.html` are the fixtures the Jest tests load (movie/series/season/episode, rated and unrated).

### Legacy script

The root `csfd-compare.js` is the old jQuery-based script that `src/` replaced. Use it as a reference for how a feature used to behave, but not for selectors: it targeted an older ČSFD layout. The published bundle is `dist/csfd-compare.user.js` (GreasyFork and the local `[DEV]` userscript `@require` it).

### Settings

Feature flags are toggled via `localStorage` keys defined in `config.js`. The pattern is: setting key → `window` CustomEvent → listener in `main.js` or `settings.js` → delegate to a `csfd.*` method or a feature module's handler.

**Adding a menu toggle** (the data-driven path — no DOM code needed):

1. Declare the `localStorage` key and the `CustomEvent` name in `src/config.js`.
2. Add an entry to `MENU_CONFIG` in `src/settings-config.js`. A simple switch is `type: 'toggle'` with `id`, `storageKey`, `defaultValue`, `requiresLogin`, `label`, `eventName`, and an optional `infoIcon` (`{ url, text }` — `url` shows a screenshot modal, omit/empty for tooltip only). `type: 'group'` adds a collapsible section with `childrenItems` (nested toggles) and/or `childrenHtml`.
3. `settings.js` auto-renders every entry and binds it via `bindToggle()`, which persists the value and dispatches `eventName` with `detail: { enabled, skipSync: true }`. Listen for that event in `main.js`.
4. Group-level UI callbacks are referenced **by string name** in `MENU_CONFIG` and resolved against `CALLBACK_MAP` inside `settings.js` (keeps `settings-config.js` free of function imports).

The `cc-maint-reset-btn` handler in `settings.js` removes a fixed list of keys; new persisted keys that should be cleared on "reset to defaults" need adding there too. Toggle keys registered through `bindToggle` are reset automatically via `togglesTracker`.

### Review draft autosave

`review-draft.js` is the reference example of a self-contained page feature. Notes for editing it:

- Gated to the reviews page via `REVIEWS_PAGE_REGEX` (locale-aware, built from `getCsfdPathSegmentPattern('reviews')`).
- ČSFD's review form is `#review-form` (id `review-form`), loaded eagerly (hidden) when editing or lazily via AJAX when clicking `#review-add-button`. A `MutationObserver` on `div.page-content` (re)attaches when the form appears and detaches when it's removed.
- Three language `<textarea>`s, `name="languages[N][text]"` (N: 1=cz, 2=sk, 3=en), each backed by a TinyMCE editor in an iframe `#<textareaId>_ifr`.
- **Drafts are keyed by ČSFD's own `data-tinymce-autosave-id`** (e.g. `film-comment-953802`, language suffix stripped); the URL film/season id is the fallback and resolves to the same number. Stored under `REVIEW_DRAFT_STORAGE_PREFIX` in `localStorage`.
- **Input is captured three ways** — TinyMCE editor events, the contenteditable iframe `body`, and the raw `<textarea>` — because the page's `tinymce` global is unreachable in some userscript sandboxes (e.g. Firefox/Greasemonkey). Reading/writing the iframe body + textarea always works; the editor path is a nicety. Editors initialise late, so attachment polls (`ATTACH_POLL_*`).
- **Clear-on-success** is detected, not assumed: after submit the user's published review (`article.my-review` → `[data-film-review-content]`/`.comment`) is matched against the saved draft text (`isDraftPublished`, normalized-containment with a min-length guard). The draft is **never** cleared on the submit click alone, so a failed send keeps the text. `reconcileOnLoad()` handles the submit-then-refresh path.

### Tests

Tests live in `tests/*.test.cjs` and use Jest with `jest-environment-jsdom`. They import source ES modules via `pathToFileURL`. Each test file sets up `document.body.innerHTML` and `localStorage` in `beforeEach`. There is also `tests/onHomepage.spec.cjs` for homepage-specific behavior.
