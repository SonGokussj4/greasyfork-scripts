const path = require('path');
const { pathToFileURL } = require('url');

let filmActions;

beforeAll(async () => {
  filmActions = await import(pathToFileURL(path.resolve(__dirname, '../src/film-actions.js')).href);
});

beforeEach(() => {
  localStorage.clear();
  document.body.className = '';
});

const hiddenClasses = () => [...document.body.classList].filter((c) => c.startsWith('cc-hide-film-action-'));

describe('film action buttons', () => {
  test('hides nothing by default (master switch off)', () => {
    filmActions.applyFilmActionVisibility();
    expect(hiddenClasses()).toEqual([]);
  });

  test('master on hides every button by default', () => {
    localStorage.setItem('cc_film_actions_hide', 'true');
    filmActions.applyFilmActionVisibility();
    expect(hiddenClasses().sort()).toEqual(
      ['review', 'watchlist', 'fanclub', 'lists', 'collection'].map((id) => `cc-hide-film-action-${id}`).sort(),
    );
  });

  test('per-button setting keeps a button visible and updates on re-apply', () => {
    localStorage.setItem('cc_film_actions_hide', 'true');
    localStorage.setItem('cc_film_action_hide_review', 'false');
    filmActions.applyFilmActionVisibility();
    expect(document.body.classList.contains('cc-hide-film-action-review')).toBe(false);
    expect(document.body.classList.contains('cc-hide-film-action-collection')).toBe(true);

    localStorage.setItem('cc_film_actions_hide', 'false');
    filmActions.applyFilmActionVisibility();
    expect(hiddenClasses()).toEqual([]);
  });

  test('settings items cover every button', () => {
    expect(filmActions.getFilmActionSettingsItems().map((i) => i.storageKey)).toHaveLength(5);
  });
});
