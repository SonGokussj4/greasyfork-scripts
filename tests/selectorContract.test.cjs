/*
 * Selector contract: the CSS selectors the script relies on must still match real ČSFD pages,
 * for both csfd.cz and csfd.sk.
 *
 * Pages come from the newest tests/snapshots/<date> (cz) and <date>-sk (sk) folders, created by
 * `make download-pages SITE=cz|sk`, or from CC_CONTRACT_DIR_CZ / CC_CONTRACT_DIR_SK.
 * A site without a snapshot is skipped, so the suite stays green on a fresh checkout.
 * `make drift-check` downloads fresh snapshots first and then runs only this file.
 */
const fs = require('fs');
const path = require('path');

const SNAPSHOTS = path.resolve(__dirname, 'snapshots');
const STYLE = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf8');

function latestSnapshot(suffix) {
  if (!fs.existsSync(SNAPSHOTS)) return null;
  const re = suffix ? /^\d{4}-\d\d-\d\d-sk$/ : /^\d{4}-\d\d-\d\d$/;
  const dirs = fs.readdirSync(SNAPSHOTS).filter((d) => re.test(d)).sort();
  return dirs.length ? path.join(SNAPSHOTS, dirs[dirs.length - 1]) : null;
}

const SITES = [
  { site: 'cz', dir: process.env.CC_CONTRACT_DIR_CZ || latestSnapshot('') },
  { site: 'sk', dir: process.env.CC_CONTRACT_DIR_SK || latestSnapshot('-sk') },
];

/** Selectors of the "hide film buttons" rules, without the leading body class. */
function filmActionSelectors() {
  const out = [];
  for (const m of STYLE.matchAll(/body\.cc-hide-film-action-(\w+)\s+([^,{]+)/g)) {
    out.push({ id: m[1], selector: m[2].trim() });
  }
  return out;
}

const loadPage = (file) => {
  document.documentElement.innerHTML = fs.readFileSync(file, 'utf8');
};

for (const { site, dir } of SITES) {
  const suite = dir ? describe : describe.skip;

  suite(`selector contract (${site})${dir ? '' : ' - no snapshot, run: make download-pages SITE=' + site}`, () => {
    const files = dir ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')) : [];
    // A film page is the one with ČSFD's film action panel (user profiles have a different one).
    const filmPages = files.filter((f) => /id="snippet--actionLinkWatchlist"/.test(fs.readFileSync(path.join(dir, f), 'utf8')));

    test('snapshot contains at least one film page with the action panel', () => {
      expect(filmPages.length).toBeGreaterThan(0);
    });

    test('film action selectors are defined in style.css', () => {
      expect(filmActionSelectors().map((s) => s.id).sort()).toEqual(
        ['collection', 'fanclub', 'lists', 'review', 'watchlist'],
      );
    });

    // Some buttons are legitimately missing on some pages (e.g. no review button on an unrated season),
    // so each selector must match on at least one film page, not on every one.
    test('every film action selector matches on some film page', () => {
      const matches = Object.fromEntries(filmActionSelectors().map(({ id }) => [id, 0]));
      for (const file of filmPages) {
        loadPage(path.join(dir, file));
        for (const { id, selector } of filmActionSelectors()) {
          matches[id] += document.querySelectorAll(selector).length;
        }
      }
      expect(Object.entries(matches).filter(([, n]) => n === 0).map(([id]) => id)).toEqual([]);
    });
  });
}
