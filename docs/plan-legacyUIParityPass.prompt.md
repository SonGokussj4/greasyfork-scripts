## Plan: Legacy UI Parity Pass

Restore the three requested legacy features as small, isolated additions to the current modular architecture: creator filmography one-line layout, IMDb icon decoration, and the missing small-poster image shortcut. The right fit is the existing config + settings-config + Csfd + main toggle-event flow, not a new subsystem.

**Checklist**
1. Add three independent feature flags so each behavior can be enabled, disabled, tested, and reverted separately.
2. Keep the current gallery image-links feature intact and add the small-poster shortcut as a sibling feature, not as expanded gallery logic.
3. Implement each feature in [src/csfd.js](src/csfd.js) as idempotent apply/clear methods.
4. Wire each toggle through [src/main.js](src/main.js) using the same event pattern already used for creator tabs, gallery links, and other page enhancements.
5. Prefer CSS-class-based rendering in [src/style.css](src/style.css) over inline DOM styling where possible.
6. Add focused DOM tests in [tests/Csfd.test.cjs](tests/Csfd.test.cjs) before considering the parity pass done.

**Implementation plan**
1. Add storage keys and event names in [src/config.js](src/config.js).
2. Add three toggles in the Filmy a seriály section of [src/settings-config.js](src/settings-config.js).
3. Add creator one-line methods in [src/csfd.js](src/csfd.js), scoped to creator pages using the existing creator-page detection already near [src/csfd.js](src/csfd.js#L827).
4. Base the creator feature on current DOM, not the legacy selector names. Discovery found the old .film-title-nooverflow path is outdated; the current saved structure in [pages/page-tvurce-prehled.html](pages/page-tvurce-prehled.html) should be the selector source of truth.
5. Add IMDb decorate/clear methods in [src/csfd.js](src/csfd.js), making them safe to rerun without duplicating icons.
6. Do not reuse the old external IMDb image URL if it can be avoided. Use a local inline SVG or equivalent lightweight styling so the feature has no runtime asset dependency.
7. Add small-poster image-link methods in [src/csfd.js](src/csfd.js), separate from [src/csfd.js](src/csfd.js#L1171).
8. Make the small-poster feature early-return on gallery pages so it never overlaps with the existing gallery image-links path.
9. Reuse the current overlay visual language from [src/style.css](src/style.css) so the poster shortcut feels native to the new implementation.
10. Register initial application and toggle listeners in [src/main.js](src/main.js), following the same pattern as [src/main.js](src/main.js#L31) and [src/main.js](src/main.js#L146).
11. Add regression tests in [tests/Csfd.test.cjs](tests/Csfd.test.cjs) for apply, clear, and idempotency.
12. Run focused tests first, then full repo tests.

**Feature-by-feature notes**
1. Creator one-line layout
   The modern insertion point is next to the existing creator-page enhancement flow around [src/csfd.js](src/csfd.js#L285). This should be a current-DOM class toggle plus tooltip/title normalization, not a legacy-style inline CSS rewrite.
2. IMDb icon decoration
   This is a lightweight cosmetic patch and should stay that way. It belongs in [src/csfd.js](src/csfd.js) as a guarded, one-pass decorator with a matching cleanup path.
3. Small-poster image link
   This is not the same feature as gallery image-links. It should be implemented as a detail-page poster overlay and kept separate from the existing gallery logic at [src/csfd.js](src/csfd.js#L1171).

**Relevant files**
- [src/config.js](src/config.js)
- [src/settings-config.js](src/settings-config.js)
- [src/csfd.js](src/csfd.js)
- [src/main.js](src/main.js)
- [src/style.css](src/style.css)
- [tests/Csfd.test.cjs](tests/Csfd.test.cjs)
- [pages/page-tvurce-prehled.html](pages/page-tvurce-prehled.html)
- [pages/page-movie_rated.html](pages/page-movie_rated.html)

**Verification**
1. Confirm creator selectors against [pages/page-tvurce-prehled.html](pages/page-tvurce-prehled.html) before writing the feature.
2. Verify the IMDb decorator is idempotent and no-ops on pages without an IMDb button.
3. Verify the small-poster link appears on detail pages but never on gallery pages.
4. Verify toggle-off cleanup fully removes injected classes and DOM.
5. Run the relevant Jest tests in [tests/Csfd.test.cjs](tests/Csfd.test.cjs), then run the full test suite.

I saved the detailed version into the session plan memory as plan.md. If this structure looks right, the next handoff can implement it in this exact order.
