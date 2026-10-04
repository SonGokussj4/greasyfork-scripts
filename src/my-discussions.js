/*
 * "Moje diskuze" on the discussions overview page (/diskuze/sledovane/):
 * lets the user hide discussions they do not want to see there, and bring
 * them back later. Hidden ids are only stored locally; no requests are made.
 */
import {
  MY_DISCUSSIONS_HIDE_KEY,
  MY_DISCUSSIONS_HIDDEN_LIST_KEY,
  getCsfdPathAliasPattern,
} from './config.js';
import { getFeatureState } from './utils.js';

const WATCHED_PAGE_REGEX = new RegExp(String.raw`/(?:${getCsfdPathAliasPattern('discussion')})/sledovan[eé]/`, 'i');
const BOX_TITLES = ['moje diskuze', 'moje diskusie'];
const DISCUSSION_ID_REGEX = /\/(\d+)-[^/]+\/?/;

let showHidden = false;

export function readHiddenDiscussionIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MY_DISCUSSIONS_HIDDEN_LIST_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeHiddenDiscussionIds(ids) {
  try {
    localStorage.setItem(MY_DISCUSSIONS_HIDDEN_LIST_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Storage unavailable or full: the hide simply does not persist.
  }
}

function findMyDiscussionsBox() {
  return [...document.querySelectorAll('section.box-discussion')].find((box) =>
    BOX_TITLES.includes((box.querySelector('h2')?.textContent || '').trim().toLowerCase()),
  );
}

function getRowDiscussionId(row) {
  const href = row.querySelector('a[href*="/diskuze/"], a[href*="/diskusie/"]')?.getAttribute('href') || '';
  return href.match(DISCUSSION_ID_REGEX)?.[1] || null;
}

function makeButton(className, text, title, onClick, ariaLabel = title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

/** (Re)builds the buttons and the hidden state of the "Moje diskuze" box. Safe to call repeatedly. */
export function applyMyDiscussions() {
  clearMyDiscussions();
  if (!WATCHED_PAGE_REGEX.test(window.location.pathname || '')) return;
  if (!getFeatureState(MY_DISCUSSIONS_HIDE_KEY, true)) return;

  const box = findMyDiscussionsBox();
  if (!box) return;

  const hidden = new Set(readHiddenDiscussionIds());
  let hiddenCount = 0;

  box.querySelectorAll('tr').forEach((row) => {
    const id = getRowDiscussionId(row);
    if (!id) return;

    const isHidden = hidden.has(id);
    row.classList.toggle('cc-md-hidden', isHidden && !showHidden);
    row.classList.toggle('cc-md-hidden-preview', isHidden && showHidden);
    if (isHidden) hiddenCount += 1;

    const cell = row.querySelector('td');
    const name = (row.querySelector('a')?.textContent || '').trim();
    cell?.append(
      isHidden
        ? makeButton('cc-md-btn cc-md-restore', '↺', 'Obnovit diskuzi (CC)', () => {
            writeHiddenDiscussionIds(readHiddenDiscussionIds().filter((x) => x !== id));
            applyMyDiscussions();
          }, `Obnovit diskuzi ${name}`)
        : makeButton('cc-md-btn cc-md-hide', '×', 'Skrýt diskuzi (CC)', () => {
            writeHiddenDiscussionIds([...readHiddenDiscussionIds(), id]);
            applyMyDiscussions();
          }, `Skrýt diskuzi ${name}`),
    );
  });

  if (hiddenCount === 0) showHidden = false;

  if (hiddenCount > 0) {
    const label = showHidden ? `Zavřít skryté (${hiddenCount})` : `Skryté (${hiddenCount})`;
    box.querySelector('h2')?.after(
      makeButton('cc-md-toggle', label, 'Zobrazit nebo skrýt vámi skryté diskuze (CC)', () => {
        showHidden = !showHidden;
        applyMyDiscussions();
      }),
    );
  }
}

/** Removes everything this module added and shows all rows again. */
export function clearMyDiscussions() {
  document.querySelectorAll('.cc-md-btn, .cc-md-toggle').forEach((el) => el.remove());
  document.querySelectorAll('.cc-md-hidden, .cc-md-hidden-preview').forEach((row) => {
    row.classList.remove('cc-md-hidden', 'cc-md-hidden-preview');
  });
}
