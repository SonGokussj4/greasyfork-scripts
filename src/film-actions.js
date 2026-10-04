/*
 * Film profile action buttons (Recenze, Chci vidět, Oblíbené, Seznamy, Filmotéka).
 *
 * Hiding is done with body classes + CSS (see style.css), so it survives ČSFD
 * re-rendering the buttons through Nette snippets. No requests are made.
 */
import { FILM_ACTIONS_HIDE_KEY, FILM_ACTIONS_UPDATED_EVENT } from './config.js';
import { getFeatureState } from './utils.js';

export const FILM_ACTION_ITEMS = Object.freeze([
  { id: 'review', label: 'Recenze' },
  { id: 'watchlist', label: 'Chci vidět' },
  { id: 'fanclub', label: 'Oblíbené' },
  { id: 'lists', label: 'Seznamy' },
  { id: 'collection', label: 'Filmotéka' },
]);

export const getFilmActionStorageKey = (id) => `cc_film_action_hide_${id}`;

const bodyClass = (id) => `cc-hide-film-action-${id}`;

export function getFilmActionSettingsItems() {
  return FILM_ACTION_ITEMS.map((item) => ({
    type: 'toggle',
    id: `cc-film-action-hide-${item.id}`,
    storageKey: getFilmActionStorageKey(item.id),
    defaultValue: true,
    label: item.label,
    tooltip: '',
    eventName: FILM_ACTIONS_UPDATED_EVENT,
  }));
}

/** Sync the body classes with the stored settings. */
export function applyFilmActionVisibility() {
  const body = document.body;
  if (!body) return;

  const masterOn = getFeatureState(FILM_ACTIONS_HIDE_KEY, false);
  for (const item of FILM_ACTION_ITEMS) {
    const hide = masterOn && getFeatureState(getFilmActionStorageKey(item.id), true);
    body.classList.toggle(bodyClass(item.id), hide);
  }
}
