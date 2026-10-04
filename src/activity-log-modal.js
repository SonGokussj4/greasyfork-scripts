/*
 * Modal for the activity log (see activity-log.js). Uses the shared CC modal
 * opened through `openInfoModal`, which is passed in to keep this file free of
 * a dependency on the (large) settings-version module.
 */
import {
  clearActivityLog,
  formatActivityLogText,
  formatActivityTimestamp,
  getActivityLog,
} from './activity-log.js';
import { escapeHtml } from './utils.js';

const LEVEL_LABELS = { info: 'info', warn: 'varování', error: 'chyba' };

export function renderActivityLogHtml(entries) {
  if (entries.length === 0) {
    return '<p class="cc-activity-log-empty">Zatím nic nezaznamenáno.</p>';
  }

  const rows = [...entries]
    .reverse()
    .map(
      (e) => `<li class="cc-activity-log-row is-${escapeHtml(e.level)}">
        <span class="cc-activity-log-time">${escapeHtml(formatActivityTimestamp(e.t))}</span>
        <span class="cc-activity-log-level">${escapeHtml(LEVEL_LABELS[e.level] || e.level)}</span>
        <span class="cc-activity-log-area">${escapeHtml(e.area)}</span>
        <span class="cc-activity-log-msg">${escapeHtml(e.msg)}</span>
      </li>`,
    )
    .join('');

  return `<ul class="cc-activity-log-list">${rows}</ul>`;
}

export function describeEntryCount(count) {
  if (count === 1) return '1 záznam';
  if (count >= 2 && count <= 4) return `${count} záznamy`;
  return `${count} záznamů`;
}

function buildModalHtml(entries) {
  return `
    <div class="cc-activity-log">
      <div class="cc-activity-log-actions">
        <button type="button" class="cc-button cc-button-black cc-button-small" data-cc-log-copy>Kopírovat</button>
        <button type="button" class="cc-button cc-button-red cc-button-small" data-cc-log-clear aria-label="Smazat log aktivity">Vymazat</button>
        <span class="cc-activity-log-note">${escapeHtml(describeEntryCount(entries.length))}, uloženo jen v tomto prohlížeči.</span>
      </div>
      ${renderActivityLogHtml(entries)}
    </div>`;
}

export function openActivityLogModal(openInfoModal) {
  const entries = getActivityLog();
  const body = openInfoModal({ title: 'Log aktivity', html: buildModalHtml(entries) });

  body.querySelector('[data-cc-log-copy]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(formatActivityLogText(getActivityLog()));
      button.textContent = 'Zkopírováno';
    } catch {
      button.textContent = 'Kopírování selhalo';
    }
    window.setTimeout(() => {
      button.textContent = 'Kopírovat';
    }, 1500);
  });

  body.querySelector('[data-cc-log-clear]')?.addEventListener('click', () => {
    clearActivityLog();
    openActivityLogModal(openInfoModal);
  });
}
