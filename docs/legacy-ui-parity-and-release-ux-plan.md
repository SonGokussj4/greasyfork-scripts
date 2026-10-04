## Legacy UI Parity And Release UX Plan

Restore the three requested legacy features as small, isolated additions to the current modular architecture: creator filmography one-line layout, IMDb icon decoration, and the missing small-poster image shortcut. Add one release-UX improvement as well: after a user updates to a newer script version, show a one-time modal with the changes for that version, ideally sourced from a repository `CHANGELOG.md` entry rather than the GreasyFork page.

The right fit is the existing config + settings-config + Csfd + main toggle-event flow for the UI features, plus a small version-tracking layer near the existing version UI for the post-update modal. This does not need a new subsystem.

**Checklist**
1. Add three independent feature flags so each UI behavior can be enabled, disabled, tested, and reverted separately.
2. Keep the current gallery image-links feature intact and add the small-poster shortcut as a sibling feature, not as expanded gallery logic.
3. Implement each UI feature in `src/csfd.js` as idempotent apply/clear methods.
4. Wire each toggle through `src/main.js` using the same event pattern already used for creator tabs, gallery links, and other page enhancements.
5. Prefer CSS-class-based rendering in `src/style.css` over inline DOM styling where possible.
6. Add focused DOM tests in `tests/Csfd.test.cjs` before considering the parity pass done.
7. Add a one-time post-update changelog modal that appears only once per installed version.
8. Source changelog content from a repository `CHANGELOG.md` per-version section if possible, with a fallback if GitHub content cannot be fetched or parsed.
9. Persist the last version for which the modal was already shown, so users do not get repeated prompts on every page load.

**Implementation plan**

### 1. Creator one-line layout
1. Add a storage key and event name in `src/config.js` for the creator filmography one-line feature.
2. Add a toggle in the Filmy a seriály section of `src/settings-config.js`.
3. Add creator one-line apply/clear methods in `src/csfd.js`, scoped to creator pages using the existing creator-page detection.
4. Base the selector work on the current DOM in `pages/page-tvurce-prehled.html`, not on the old `film-title-nooverflow` selector from the legacy script.
5. Implement the visual behavior mainly through CSS classes in `src/style.css` and only use JS to add classes and full-title tooltips where needed.
6. Register initial application and a toggle listener in `src/main.js`.

### 2. IMDb icon decoration
1. Add a storage key and event name in `src/config.js` for IMDb icon decoration.
2. Add a toggle in `src/settings-config.js`.
3. Add decorate/clear methods in `src/csfd.js` that are safe to rerun without duplicating icons.
4. Avoid the old external image URL if possible. Prefer an inline SVG, a bundled asset, or a lightweight CSS-first approach so the feature has no runtime third-party asset dependency.
5. Wire initial application and toggle handling in `src/main.js`.

### 3. Small-poster image link
1. Add a storage key and event name in `src/config.js` for the detail-page small-poster image link.
2. Add a toggle in `src/settings-config.js` near the current gallery image-links toggle.
3. Add small-poster apply/clear methods in `src/csfd.js`, separate from the existing gallery-image-links implementation.
4. Make the feature early-return on gallery pages so it never overlaps with the existing gallery logic.
5. Reuse the current overlay visual language from `src/style.css` so the poster shortcut feels native to the new implementation.
6. Wire initial application and toggle handling in `src/main.js`.

### 4. One-time post-update changelog modal
1. Create a repository `CHANGELOG.md` as the source of truth for release notes, with clear per-version sections such as `## v0.8.24`.
2. Extend the existing version area around `src/settings-version.js` so it can also detect first run after an update, not only check for newer versions online.
3. Persist the currently installed version in localStorage under a dedicated key such as `cc_last_seen_version`.
4. On startup, compare the installed script version from `src/config.js` with the last seen version.
5. If the version changed and the modal has not yet been shown for the new version, open a one-time modal and then store the new version as seen.
6. Fetch or load changelog content for the current version from `CHANGELOG.md`.
7. Prefer a GitHub-hosted raw or repository fetch path only if it is reliable in the userscript environment and acceptable for cross-origin rules.
8. If remote GitHub parsing is too fragile, generate or ship a local lightweight changelog index during build from `CHANGELOG.md` and read that at runtime instead.
9. Keep the existing GreasyFork-based version check for update availability if it is useful, but do not rely on GreasyFork as the main source of release-note detail.
10. Add a safe fallback message when the changelog entry for a version is missing, for example: "Script updated to vX.Y.Z. Detailed notes are not available yet.".
11. Make sure the modal is shown once per version only, not once per page load and not once per tab.
12. Place the modal implementation either in `src/settings-version.js` if it stays tightly related to release/version UI, or in a small adjacent module if that file becomes too dense.

**Recommended shape for `CHANGELOG.md`**
1. Keep one top-level section per released version.
2. Use stable headings like `## v0.8.24` so parsing is trivial.
3. Keep bullets concise and user-facing.
4. If you want nicer grouping later, use flat subheadings like `### Added`, `### Changed`, `### Fixed`, but do not make the parser depend on them.

Example:

```md
# Changelog

## v0.8.24
### Added
- Hover previews for AniDB and MyAnimeList links.
- One-time post-update release notes modal.

### Changed
- Film poster gallery data now loads lazily for frozen previews.

### Fixed
- External previews now render even when no image is available.
```

**Design decisions for the release modal**
1. The modal should trigger automatically only after an actual version change.
2. The modal should use the same visual language as the existing version/settings UI.
3. The modal should always be dismissible and should never block script functionality.
4. The modal should degrade gracefully if changelog content is unavailable.
5. Parsing should be intentionally simple and heading-based to avoid brittle markdown processing.
6. If fetching GitHub changelog data adds too much runtime complexity or permission overhead, prefer a build-time extraction approach.

**Suggested implementation order**
1. Add `CHANGELOG.md` and decide the canonical version-heading format.
2. Implement the three legacy UI parity features first, since they are already scoped and understood.
3. Then extend `src/settings-version.js` with version-persistence and modal behavior.
4. If runtime GitHub fetch proves awkward, switch immediately to a build-generated local changelog payload instead of over-engineering the fetch/parser path.

**Relevant files**
- `src/config.js`
- `src/settings-config.js`
- `src/csfd.js`
- `src/main.js`
- `src/style.css`
- `src/settings-version.js`
- `tests/Csfd.test.cjs`
- `pages/page-tvurce-prehled.html`
- `pages/page-movie_rated.html`
- `CHANGELOG.md`
- Optionally a generated changelog artifact under `src/` or `scripts/` if build-time extraction is used.

**Verification**
1. Confirm creator selectors against `pages/page-tvurce-prehled.html` before writing the feature.
2. Verify the IMDb decorator is idempotent and no-ops on pages without an IMDb button.
3. Verify the small-poster link appears on detail pages but never on gallery pages.
4. Verify toggle-off cleanup fully removes injected classes and DOM.
5. Verify first run after update shows the changelog modal exactly once for that version.
6. Verify subsequent page loads on the same version do not reopen the modal.
7. Verify the modal still opens with a fallback message if changelog content cannot be loaded.
8. Run the relevant Jest tests in `tests/Csfd.test.cjs`, then run the full test suite.

**Pragmatic recommendation**
For the changelog modal, my recommendation is to treat `CHANGELOG.md` in GitHub as the editorial source of truth, but not necessarily the runtime source. The cleanest long-term approach is usually:
1. Maintain `CHANGELOG.md` in the repo.
2. During build, extract the latest version sections into a tiny JSON or JS payload.
3. At runtime, compare installed version to last seen version and render the matching entry locally.

That gives you better changelog quality than GreasyFork, avoids fragile markdown scraping at runtime, and keeps the one-time modal behavior deterministic.
