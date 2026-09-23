# Architecture Overview

This document explains how the project is structured, which module is responsible for what, and where new code should go.

## 1) High-Level Flow

Runtime flow (simplified):

1. Entry point starts in [src/main.js](src/main.js).
2. The settings/menu UI is injected via [src/settings.js](src/settings.js).
3. Core CSFD page behavior is handled by [src/csfd.js](src/csfd.js).
4. Ratings load/sync features are initialized from settings:
   - local ratings load: [src/ratings-loader.js](src/ratings-loader.js)
   - cloud sync: [src/ratings-sync.js](src/ratings-sync.js)
5. Storage and shared config are provided by:
   - [src/storage.js](src/storage.js)
   - [src/config.js](src/config.js)
6. Build output is bundled into `dist/csfd-compare.user.js` by Rollup.

---

## 2) Module Boundaries (Current)

## Entry + Bootstrapping

- [src/main.js](src/main.js)
    - Orchestrates startup.
    - Loads CSS bundles.
    - Calls `addSettingsButton()` and initializes `Csfd`.
    - Hooks gallery toggle events and basic login-dependent control state.

## Core Domain Logic

- [src/csfd.js](src/csfd.js)
    - Main class for page-level behavior.
    - User detection, star/rating-related interactions, synchronization with local data.
    - Movie/item parsing and current-page rating sync.
    - Page-type detection (own/foreign profile, ratings/reviews/creator pages) via precompiled regexes.

## Page Feature Modules (extracted from csfd.js)

- [src/home-panels.js](src/home-panels.js)
    - Homepage panel hiding: title normalization, hide buttons, group/row collapse.
    - `Csfd.initHomePanels()` delegates here.

- [src/gallery-links.js](src/gallery-links.js)
    - "Open image in size X" links under gallery pictures.
    - `Csfd.addGalleryImageFormatLinks()` delegates here.

- [src/discussions.js](src/discussions.js)
    - Self-reply ("Reagovat") button on the user's own forum posts.
    - `Csfd.enableSelfReplyInDiscussions()` delegates here.

- [src/hover-preview.js](src/hover-preview.js) + [src/hover-preview-providers.js](src/hover-preview-providers.js)
    - Hover card controller and per-link-type content fetchers.

- [src/link-icons.js](src/link-icons.js)
    - Configurable link-icon injection into page text.

## Settings/Menu Orchestration

- [src/settings.js](src/settings.js)
    - Thin orchestrator for settings menu wiring.
    - Connects buttons to specialized modules.
    - Keeps lightweight helpers like current user slug resolution and login checks.

- [src/settings-button-content.html](src/settings-button-content.html)
    - Static menu HTML template used by `settings.js`.

## Settings Submodules (Specialized)

- [src/settings-version.js](src/settings-version.js)
    - Version badge status + version info modal.
    - GreasyFork version checks + changelog fetch/cache.

- [src/settings-changelog.js](src/settings-changelog.js)
    - Pure module (no DOM/localStorage): version comparison, Markdown→HTML
      rendering for CHANGELOG.md, and "what's new" section selection.
    - `settings-version.js` re-exports its public helpers for tests.

- [src/settings-badges.js](src/settings-badges.js)
    - Red/black badge counters.
    - “loaded vs total” warning logic.
    - Login-state behavior for sync button and badges.

- [src/settings-hover.js](src/settings-hover.js)
    - Header hover/open behavior for settings menu.
    - DEBUG-only hover controls and fancy-alert test button placement.

## Ratings Table Modal (Fully Split)

- [src/settings-ratings-modal.js](src/settings-ratings-modal.js)
    - Orchestration + caching + opening logic.
    - Resolves user scope and selects data for modal.

- [src/settings-ratings-modal-view.js](src/settings-ratings-modal-view.js)
    - Modal DOM/view lifecycle.
    - Search/filter/sort UI wiring.
    - Row rendering and interactions.

- [src/settings-ratings-modal-data.js](src/settings-ratings-modal-data.js)
    - Pure data transforms and helpers.
    - Row normalization, escaping, filtering, sorting.

- [src/settings-ratings-modal-detail.js](src/settings-ratings-modal-detail.js)
    - Detail overlay for a single rating row.

## Ratings Loading/Sync

- [src/ratings-loader.js](src/ratings-loader.js)
    - Pulls ratings pages, parses rows, persists records.
    - Incremental update behavior and progress reporting.

- [src/ratings-sync.js](src/ratings-sync.js)
    - Cloud synchronization flow and state.

## Shared Infrastructure

- [src/storage.js](src/storage.js)
    - IndexedDB + settings persistence wrappers.

- [src/config.js](src/config.js)
    - Shared constants, localStorage keys, event names, and locale-aware
      path/label helpers (`getCsfdPathSegment`, `matchesCsfdTextVariant`, …).

- [src/supabase-api.js](src/supabase-api.js)
    - Thin fetch wrappers for the Supabase REST API used by cloud sync.

- [src/ratings-records.js](src/ratings-records.js)
    - Pure data helpers: record ID construction, multi-user record reconciliation.

- [src/utils.js](src/utils.js), [src/ui-utils.js](src/ui-utils.js), [src/env.js](src/env.js)
    - Generic utilities / environment and shared glue.

## Styles

- Global style entry: [src/style.css](src/style.css)

---

## 3) Where To Add New Code

Use this as the primary placement guide.

- "I need a new settings menu action/button"
    - Wire click/key handling in [src/settings.js](src/settings.js).
    - Put feature logic in a dedicated module (`settings-*.js`), not directly in `settings.js`.

- "I need new version/update behavior"
    - Add it in [src/settings-version.js](src/settings-version.js).

- "I need badge/count changes"
    - Add it in [src/settings-badges.js](src/settings-badges.js).

- "I need ratings modal UI changes (columns, toolbar, sort buttons)"
    - Add it in [src/settings-ratings-modal-view.js](src/settings-ratings-modal-view.js).

- "I need ratings modal transform/filter/sort logic"
    - Add it in [src/settings-ratings-modal-data.js](src/settings-ratings-modal-data.js).

- "I need rating detail popup field formatting"
    - Add it in [src/settings-ratings-modal-detail.js](src/settings-ratings-modal-detail.js).

- "I need rating-fetch parsing or load strategy changes"
    - Add it in [src/ratings-loader.js](src/ratings-loader.js).

- "I need data storage behavior changes"
    - Add it in [src/storage.js](src/storage.js).

- "I need CSFD page-specific business logic"
    - Add it in [src/csfd.js](src/csfd.js) — or, if it is a self-contained
      page feature, create a dedicated module (like `home-panels.js`,
      `gallery-links.js`, `discussions.js`) and delegate from `Csfd`.

- "I need changelog/markdown rendering changes"
    - Add it in [src/settings-changelog.js](src/settings-changelog.js).

---

## 4) Practical Rules For Contributors

- Keep `settings.js` as orchestrator only.
    - Avoid adding heavy business logic there.
    - Prefer extracting into a new `settings-<feature>.js` module.

- Keep data and DOM separated.
    - Pure transforms in `*-data.js`.
    - Rendering/event wiring in `*-view.js`.

- Reuse existing shared layers.
    - Constants in [src/config.js](src/config.js).
    - Persistence in [src/storage.js](src/storage.js).

- Prefer feature-scoped modules over monolith growth.
    - If a file grows beyond a focused responsibility, split it by concern (orchestration / data / view / detail).

- Emit update events for UI refresh coherence.
    - Existing UI reacts to rating updates via events like `cc-ratings-updated`.
    - If your feature mutates ratings data, trigger the expected update event.

---

## 5) Build, Bundle, and Generated Output

- Build config: [rollup.config.js](rollup.config.js)
- Version sync script: [scripts/sync-version.mjs](scripts/sync-version.mjs)
- Package scripts: [package.json](package.json)
- Generated userscript output: `dist/csfd-compare.user.js`

Rule of thumb:
- Edit source files in [src](src).
- Do not hand-edit generated `dist` output.

---

## 6) Suggested Workflow For New Features

1. Decide the owning module using section "Where To Add New Code".
2. Add/adjust constants in [src/config.js](src/config.js) if needed.
3. Implement logic in the feature module.
4. Keep wiring in orchestrator modules (`main.js`, `settings.js`) minimal.
5. Run build and targeted tests.
6. If adding UI, keep styles in [src/style.css](src/style.css) and avoid unrelated style churn.

---

## 7) Current Settings-Focused Decomposition Snapshot

Settings/menu area now follows this split:

- Orchestrator: [src/settings.js](src/settings.js)
- Version/UI status: [src/settings-version.js](src/settings-version.js)
- Badges/counters: [src/settings-badges.js](src/settings-badges.js)
- Hover/debug behavior: [src/settings-hover.js](src/settings-hover.js)
- Ratings modal orchestration: [src/settings-ratings-modal.js](src/settings-ratings-modal.js)
- Ratings modal view: [src/settings-ratings-modal-view.js](src/settings-ratings-modal-view.js)
- Ratings modal data helpers: [src/settings-ratings-modal-data.js](src/settings-ratings-modal-data.js)
- Ratings modal detail view: [src/settings-ratings-modal-detail.js](src/settings-ratings-modal-detail.js)

This is the recommended pattern for future feature additions.
