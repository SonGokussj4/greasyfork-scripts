# Plan: project risks

Five risks found during the 0.9.1-0.9.4 work (September 2026), ordered by priority. Each has the evidence, the steps, and a "done when" check.

## 1. Cloud sync: the per-user token may be readable by anyone

**Why.** `src/supabase-api.js` ships the Supabase publishable key in the script (unavoidable for a userscript). The only per-user secret is the `token` column, but `getOrCreateToken(userSlug)` fetches it with `GET /cloud_sync?user_slug=eq.<slug>&select=token`. ČSFD user slugs are public (`/uzivatel/78145-songokussj/`). Unless Supabase row-level security (RLS) forbids that select for the anon role, anyone can fetch any user's token and then read (`downloadFromCloud`) or overwrite (`uploadToCloud`, upsert with `merge-duplicates`) that user's ratings. Not verified against the live database; it depends on policies that are not in this repo.

**Plan.**
1. In the Supabase dashboard, check the RLS policies on `cloud_sync` for the `anon` role: can it `SELECT token` filtered by `user_slug`? Can it upsert a row it didn't create?
2. If yes: stop returning `token` by slug. Options, simplest first:
   - Generate the token client-side (random 128-bit), store it locally, and only ever query by `token`. Recovery on a new device = user copies the token (the sync modal already has a token field).
   - Or move token creation into a Supabase RPC / Edge Function that returns the token only once, at creation.
3. Make RLS allow `SELECT`/`UPDATE` only where `token = <request token>` (e.g. via a request header checked in the policy or an RPC), never by `user_slug` alone.
4. Rotate existing tokens after the fix (old ones may have been exposed).
5. Commit the table schema + RLS policies as SQL under `docs/` or `supabase/` so they're reviewable.

**Done when.** With only the public key and a known user slug, neither the token nor that user's `ratings_data` can be read or written.

## 2. Everything depends on scraping ČSFD HTML, and breakage is silent

**Why.** Ratings, totals, computed ratings and previews are all parsed from ČSFD markup. When ČSFD changes a page, parsers return `0`/empty and features quietly degrade. Proof: the loader read the ratings total from the first `<h2>` on the page, which is the notifications header, so `totalRatings` was always `0`. That disabled deleted-ratings reconciliation and the Shift+click early stop, unnoticed, until 0.9.4. The loader and the badge each had their own copy of that parser, and the two copies had diverged.

**Plan.**
1. One parser per fact. Grep for duplicated parsing (`parseTotalRatingsFromDocument` was one; look for star-rating and id parsing in `csfd.js`, `ratings-loader.js`, `hover-preview-providers.js`) and keep a single exported version.
2. Fixture tests from real pages: every parser gets a test against a snapshot in `tests/pages/` (refresh with `make download-pages`). A parser that only has a hand-written HTML test doesn't count.
3. Sanity checks with a visible signal: when a parser returns an impossible value (total `0` on a ratings page with rows, page with 0 parsed rows but a pagination bar), log `[CC]` with the URL and show a small warning in the CC menu instead of carrying on.
4. Periodically (e.g. before each release) run `make download-pages` + `npm test` to catch ČSFD markup changes.

**Done when.** Each parsed fact has exactly one parser, each parser has a real-page fixture test, and a markup change produces a visible warning rather than wrong numbers.

## 3. The ratings loader's modes are confusing

**Why.** In `src/ratings-loader.js` a normal click runs "incremental" mode, which actually reads every page with no delay and never stops early. Shift+click runs "full" mode, which adds random delays and stops early once local count >= ČSFD total. The names say the opposite of what they do. Only a normal click reconciles deletions (Shift+click can stop early). Paused state, resume and the computed-ratings loader add more branches. This is why the `2449 / 2448` bug was hard to see.

**Plan.**
1. Write down the intended behaviour: what does the user want from "Načíst"? (Probably: bring local data exactly in line with ČSFD, as fast as politeness allows.)
2. Collapse to one mode that always reads every page, with the polite delay, and reconciles at the end. If a fast "just new ratings" check is still wanted, make it a separate, clearly named action that reads page 1 only (ČSFD lists newest first).
3. Rename `incremental` / `evaluateShouldStopEarly` accordingly; drop the early stop if the single mode is fast enough.
4. Tests for `loadRatingsForCurrentUser` with a mocked `fetch` across multiple pages: new rating, changed rating, rating deleted on ČSFD, pause/resume mid-scan.

**Done when.** There's one obvious button behaviour, its label says what it does, and the loader's main loop is covered by multi-page tests.

## 4. localStorage can fill up, and hover previews fail when it does

**Why.** Hover-preview cache (`cc_hover_cache_v1_*`), review drafts, the ratings total cache and all settings share one localStorage origin (~5 MB). In `fetchPreviewData` (`src/hover-preview.js`) the `localStorage.setItem` for the cache sits inside the same `try` as the fetch, so a `QuotaExceededError` makes it return `null` and the preview doesn't show at all. Cleanup runs randomly on ~10% of fetches and only drops expired entries, so a heavy user can fill storage within the cache TTL. `review-draft.js` also writes drafts to localStorage; a full storage there means lost review text, the very thing the feature exists to prevent.

**Plan.**
1. Immediate: wrap the cache `setItem` in its own `try`, so a full cache never blocks showing a preview; on quota error, evict the oldest `cc_hover_cache_` entries and retry once.
2. Move the hover-preview cache to IndexedDB (a second store in `CC-Ratings` or its own DB). It's cache, not settings; IndexedDB has far more room and doesn't compete with drafts.
3. Give review drafts priority: on a failed draft save, evict hover cache first and retry; if it still fails, tell the user in the draft banner.
4. Show localStorage usage per `cc_` prefix in the settings maintenance section (the managed-entries list already exists).

**Done when.** Filling localStorage to quota in a test does not stop previews from showing or drafts from saving.

## 5. Repo hygiene slows every change

**Why.**
- Line endings are mixed: some files CRLF, some LF, some mixed within one file (`tests/ratingsLoader.test.cjs`). Editing tools normalise them and produce whole-file diffs.
- No formatter or linter config, and existing code isn't Prettier-clean, so style can't be enforced or auto-fixed.
- `dist/csfd-compare.user.js` is committed and rebuilt in every change, so every branch touches it and merges conflict on it.
- 7 old stashes and several stale branches (`NEW`, `next`, `temp`, `movie-preview`, `feature/class-rework`).

**Plan.**
1. Add `.gitattributes` (`* text=auto eol=lf`, or `crlf` if preferred) and do one renormalisation commit (`git add --renormalize .`).
2. Add a Prettier config matching the current style (single quotes, width 120, trailing commas), run it once in its own commit, and list that commit in `.git-blame-ignore-revs`.
3. `dist/csfd-compare.user.js` is the published bundle (GreasyFork and the local `[DEV]` userscript `@require` it). Build it only in the release commit (or in a GitHub Action on `master`) instead of in every feature commit. Local development then relies on `npm run dev` keeping the uncommitted `dist` fresh.
4. Review the stashes and stale branches; delete or rescue each one.
5. Optional: a GitHub Action running `npm test` on pull requests.

**Done when.** A one-line change produces a one-line diff, and merging two feature branches never conflicts on `dist`.
