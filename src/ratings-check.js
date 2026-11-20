/*
 * Ratings check: compares the stored ratings with the user's ČSFD ratings list, keeps a report
 * in localStorage until the user clears it, and can fix what differs.
 */
import { INDEXED_DB_NAME, RATINGS_CHECK_REPORT_KEY, RATINGS_CHECK_UPDATED_EVENT, RATINGS_STORE_NAME } from './config.js';
import { scanCsfdRatingsList } from './ratings-loader.js';
import { reconcileUserRatingRecords, toDeletedRatingRecord } from './ratings-records.js';
import { getAllFromIndexedDB, saveToIndexedDB } from './storage.js';
import { escapeHtml } from './utils.js';

/** At most this many rows are kept in the stored report (the counts stay complete). */
export const RATINGS_CHECK_MAX_ISSUES = 500;

/** Issue kinds in display order; fixable ones are written to IndexedDB by "Opravit". */
export const RATINGS_CHECK_ISSUE_KINDS = Object.freeze({
  missing: {
    label: 'Chybí v CC',
    advice: 'Na ČSFD je, v uložených hodnoceních chybí. Opraví „Opravit“.',
    fixable: true,
  },
  different: {
    label: 'Jiné hodnocení / datum',
    advice: 'Uložená verze je zastaralá. Opraví „Opravit“.',
    fixable: true,
  },
  extra: {
    label: 'Na ČSFD už není',
    advice: 'Hodnocení bylo na ČSFD smazané. „Opravit“ ho označí jako smazané.',
    fixable: true,
  },
  duplicate: {
    label: 'Na ČSFD dvakrát',
    advice: 'Seznam se během kontroly posunul (nové nebo smazané hodnocení). Spusťte kontrolu znovu.',
    fixable: false,
  },
  unreadable: {
    label: 'Nečitelný řádek',
    advice: 'Tento řádek ČSFD seznamu skript neumí přečíst. Pošlete prosím jeho text autorovi.',
    fixable: false,
  },
});

const ISSUE_KIND_ORDER = Object.keys(RATINGS_CHECK_ISSUE_KINDS);

const checkStatus = {
  running: false,
  stopRequested: false,
  page: 0,
  totalPages: 0,
  error: '',
};

function dispatchCheckUpdated() {
  window.dispatchEvent(new CustomEvent(RATINGS_CHECK_UPDATED_EVENT));
}

function ratingSnapshot(record) {
  if (!record) return null;
  return {
    rating: Number.isFinite(record.rating) ? record.rating : null,
    date: record.date || '',
    computed: record.computed === true,
    deleted: record.deleted === true,
  };
}

function sameRating(a, b) {
  return a === b || (!Number.isFinite(a) && !Number.isFinite(b));
}

function stripPage(record) {
  const { page, ...rest } = record;
  return rest;
}

/**
 * Pure: builds the check report from a ČSFD list scan and the locally stored records.
 * "extra" and the unlisted count are only trusted when the scan reached the last page.
 */
export function buildRatingsCheckReport({ scan, localRecords, checkedAt = new Date().toISOString() }) {
  const { userSlug, totalRatings, totalPages, loadedPages, completed, records, unreadableRows } = scan;
  const localByMovieId = reconcileUserRatingRecords(localRecords, userSlug).recordsByMovieId;
  const isDirect = (record) => record && record.computed !== true && record.deleted !== true;

  const issues = [];
  const csfdByMovieId = new Map();
  for (const record of records) {
    if (csfdByMovieId.has(record.movieId)) {
      issues.push({ kind: 'duplicate', movieId: record.movieId, name: record.name, url: record.fullUrl, page: record.page });
      continue;
    }
    csfdByMovieId.set(record.movieId, record);

    const local = localByMovieId.get(record.movieId);
    const base = {
      movieId: record.movieId,
      name: record.name,
      url: record.fullUrl,
      page: record.page,
      csfd: ratingSnapshot(record),
      local: ratingSnapshot(local),
    };
    if (!isDirect(local)) {
      issues.push({ kind: 'missing', ...base, record: stripPage(record) });
    } else if (!sameRating(local.rating, record.rating) || (local.date || '') !== (record.date || '')) {
      issues.push({ kind: 'different', ...base, record: stripPage(record) });
    }
  }

  if (completed) {
    for (const local of localByMovieId.values()) {
      if (!isDirect(local) || csfdByMovieId.has(local.movieId)) continue;
      issues.push({
        kind: 'extra',
        movieId: local.movieId,
        name: local.name,
        url: local.fullUrl,
        csfd: null,
        local: ratingSnapshot(local),
        record: local,
      });
    }
  }

  for (const row of unreadableRows) {
    issues.push({ kind: 'unreadable', name: row.text, page: row.page });
  }

  const counts = Object.fromEntries(ISSUE_KIND_ORDER.map((kind) => [kind, 0]));
  issues.forEach((issue) => (counts[issue.kind] += 1));
  issues.sort((a, b) => ISSUE_KIND_ORDER.indexOf(a.kind) - ISSUE_KIND_ORDER.indexOf(b.kind));

  const listedCount = csfdByMovieId.size;
  return {
    version: 1,
    userSlug,
    checkedAt,
    completed,
    totalRatings,
    totalPages,
    loadedPages,
    listedCount,
    localDirectCount: [...localByMovieId.values()].filter(isDirect).length,
    unlistedCount: completed && totalRatings > listedCount ? totalRatings - listedCount : 0,
    counts,
    totalIssues: issues.length,
    issues: issues.slice(0, RATINGS_CHECK_MAX_ISSUES),
    fixedCount: 0,
  };
}

export function hasRatingsCheckProblems(report) {
  return Boolean(report) && (report.issues.length > 0 || report.unlistedCount > 0);
}

export function loadRatingsCheckReport() {
  try {
    const report = JSON.parse(localStorage.getItem(RATINGS_CHECK_REPORT_KEY) || 'null');
    return report && Array.isArray(report.issues) ? report : null;
  } catch {
    return null;
  }
}

function saveRatingsCheckReport(report) {
  try {
    localStorage.setItem(RATINGS_CHECK_REPORT_KEY, JSON.stringify(report));
  } catch (error) {
    console.warn('[CC] Could not save the ratings check report:', error);
  }
  dispatchCheckUpdated();
}

export function clearRatingsCheckReport() {
  localStorage.removeItem(RATINGS_CHECK_REPORT_KEY);
  dispatchCheckUpdated();
}

export function getRatingsCheckStatus() {
  return { ...checkStatus };
}

/** Runs the check in the background; the report is saved and the event fired when it ends. */
export async function startRatingsCheck() {
  if (checkStatus.running) return;
  Object.assign(checkStatus, { running: true, stopRequested: false, page: 0, totalPages: 0, error: '' });
  dispatchCheckUpdated();

  try {
    const scan = await scanCsfdRatingsList({
      onProgress: ({ page, totalPages }) => {
        Object.assign(checkStatus, { page, totalPages });
        dispatchCheckUpdated();
      },
      shouldStop: () => checkStatus.stopRequested,
    });
    const localRecords = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    checkStatus.running = false;
    saveRatingsCheckReport(buildRatingsCheckReport({ scan, localRecords }));
  } catch (error) {
    console.error('[CC] Ratings check failed:', error);
    Object.assign(checkStatus, { running: false, error: error?.message || String(error) });
    dispatchCheckUpdated();
  }
}

export function stopRatingsCheck() {
  if (!checkStatus.running) return;
  checkStatus.stopRequested = true;
  dispatchCheckUpdated();
}

/**
 * Writes the fixable issues of the report to IndexedDB. A record changed locally after the
 * check (e.g. a newer load) is left alone, so an old report never overwrites newer data.
 */
export async function applyRatingsCheckFixes(report) {
  const fixable = report.issues.filter((issue) => RATINGS_CHECK_ISSUE_KINDS[issue.kind]?.fixable && issue.record);
  if (fixable.length === 0) return report;

  const localRecords = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
  const localByMovieId = reconcileUserRatingRecords(localRecords, report.userSlug).recordsByMovieId;
  const checkedAtMs = Date.parse(report.checkedAt) || 0;
  const nowIso = new Date().toISOString();

  const toSave = [];
  const skipped = [];
  for (const issue of fixable) {
    const current = localByMovieId.get(issue.movieId);
    if (current && (Date.parse(current.lastUpdate || '') || 0) > checkedAtMs) {
      skipped.push(issue);
      continue;
    }
    toSave.push(
      issue.kind === 'extra' ? toDeletedRatingRecord(issue.record, nowIso) : { ...issue.record, lastUpdate: nowIso },
    );
  }

  if (toSave.length > 0) {
    await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, toSave);
    window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
  }

  const fixedSet = new Set(fixable.filter((issue) => !skipped.includes(issue)));
  const nextReport = {
    ...report,
    issues: report.issues.filter((issue) => !fixedSet.has(issue)),
    fixedCount: (report.fixedCount || 0) + toSave.length,
    skippedFixCount: skipped.length,
  };
  saveRatingsCheckReport(nextReport);
  return nextReport;
}

/** Shows/hides every "!" alert (settings menu button and ratings table button). */
export function syncRatingsCheckAlerts(root = document) {
  const show = hasRatingsCheckProblems(loadRatingsCheckReport());
  root.querySelectorAll('.cc-ratings-check-alert').forEach((alert) => {
    alert.hidden = !show;
  });
}

// ---------------------------------------------------------------- report modal

function formatRating(snapshot) {
  if (!snapshot) return '<span class="cc-ratings-check-muted">nic</span>';
  if (snapshot.deleted) return '<span class="cc-ratings-check-muted">smazané</span>';
  let text = '—';
  if (snapshot.rating === 0) text = 'Odpad!';
  else if (Number.isFinite(snapshot.rating)) text = '★'.repeat(snapshot.rating) + '☆'.repeat(5 - snapshot.rating);
  const computed = snapshot.computed ? ' <span class="cc-ratings-check-muted">(spočtené)</span>' : '';
  const date = snapshot.date ? `<div class="cc-ratings-check-muted">${escapeHtml(snapshot.date)}</div>` : '';
  return `<span class="cc-ratings-check-stars">${text}</span>${computed}${date}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('cs-CZ');
}

function buildIssueRowHtml(issue) {
  const kind = RATINGS_CHECK_ISSUE_KINDS[issue.kind];
  const name = escapeHtml(issue.name || `#${issue.movieId}`);
  const title = issue.url ? `<a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer">${name}</a>` : name;
  const page = issue.page ? `<div class="cc-ratings-check-muted">ČSFD str. ${issue.page}</div>` : '';
  return `
    <tr>
      <td class="cc-ratings-check-name">${title}${page}</td>
      <td>${issue.kind === 'unreadable' || issue.kind === 'duplicate' ? '—' : formatRating(issue.csfd)}</td>
      <td>${issue.kind === 'unreadable' || issue.kind === 'duplicate' ? '—' : formatRating(issue.local)}</td>
      <td><strong>${escapeHtml(kind.label)}</strong><div class="cc-ratings-check-muted">${escapeHtml(kind.advice)}</div></td>
    </tr>`;
}

function buildAdviceHtml(report) {
  const notes = [];
  if (!report.completed) {
    notes.push(
      `Kontrola nedoběhla (${report.loadedPages}/${report.totalPages} str.), hodnocení smazaná na ČSFD a počet nejsou ověřené.`,
    );
  }
  if (report.unlistedCount > 0) {
    notes.push(
      `ČSFD uvádí ${report.totalRatings} hodnocení, ale v seznamu jich ukazuje jen ${report.listedCount}. ` +
        `Chybějící (${report.unlistedCount}) nejde dohledat ani opravit: ČSFD je počítá, ale nikde je nezobrazuje ` +
        '(skrytý nebo smazaný film, případně chybný počet na ČSFD). Na načítání hodnocení to už vliv nemá.' +
        (report.counts.unreadable > 0 ? ' Nejspíš jde o nečitelný řádek v tabulce níže.' : ''),
    );
  }
  if (report.totalIssues > report.issues.length + (report.fixedCount || 0)) {
    notes.push(
      `Report ukazuje prvních ${RATINGS_CHECK_MAX_ISSUES} rozdílů z ${report.totalIssues}. Po opravě spusťte kontrolu znovu.`,
    );
  }
  if (report.fixedCount > 0) notes.push(`Opraveno ${report.fixedCount} hodnocení.`);
  if (report.skippedFixCount > 0) {
    notes.push(`${report.skippedFixCount} hodnocení se od kontroly změnilo, neopraveno. Spusťte kontrolu znovu.`);
  }
  if (report.completed && !hasRatingsCheckProblems(report) && !report.fixedCount) {
    notes.push('Vše sedí: uložená hodnocení odpovídají seznamu na ČSFD.');
  }
  return notes.map((note) => `<p class="cc-ratings-check-note">${escapeHtml(note)}</p>`).join('');
}

function buildModalBodyHtml() {
  const status = getRatingsCheckStatus();
  const report = loadRatingsCheckReport();
  const parts = [];

  if (status.running) {
    const label = status.stopRequested
      ? 'Zastavuji…'
      : `Kontroluji stránku ${status.page || 1} / ${status.totalPages || '?'}… (můžete okno zavřít, kontrola běží dál)`;
    parts.push(`<p class="cc-ratings-check-status">${escapeHtml(label)}</p>`);
  } else if (status.error) {
    parts.push(`<p class="cc-ratings-check-note is-error">Kontrola selhala: ${escapeHtml(status.error)}</p>`);
  }

  if (!report) {
    if (!status.running) {
      parts.push(
        '<p class="cc-ratings-check-note">Kontrola projde celý váš seznam hodnocení na ČSFD (u velkých profilů pár minut) a porovná ho s uloženými hodnoceními. Výsledek zůstane uložený, dokud ho nesmažete.</p>',
      );
    }
    return parts.join('');
  }

  const stats = [
    ['ČSFD uvádí', report.totalRatings],
    ['V seznamu ČSFD', report.listedCount],
    ['Uloženo v CC', report.localDirectCount],
    ['Zkontrolováno', formatDateTime(report.checkedAt)],
  ];
  parts.push(
    `<div class="cc-ratings-check-stats">${stats
      .map(([label, value]) => `<span><b>${escapeHtml(String(value))}</b> ${escapeHtml(label)}</span>`)
      .join('')}</div>`,
  );
  parts.push(buildAdviceHtml(report));

  if (report.issues.length > 0) {
    parts.push(`
      <div class="cc-ratings-check-table-wrap">
        <table class="cc-ratings-check-table">
          <thead><tr><th>Název</th><th>Na ČSFD</th><th>V CC</th><th>Problém</th></tr></thead>
          <tbody>${report.issues.map(buildIssueRowHtml).join('')}</tbody>
        </table>
      </div>`);
  }
  return parts.join('');
}

function renderModal(overlay) {
  const status = getRatingsCheckStatus();
  const report = loadRatingsCheckReport();
  const fixableCount = report
    ? report.issues.filter((issue) => RATINGS_CHECK_ISSUE_KINDS[issue.kind]?.fixable && issue.record).length
    : 0;

  overlay.querySelector('.cc-ratings-check-body').innerHTML = buildModalBodyHtml();

  const runBtn = overlay.querySelector('.cc-ratings-check-run');
  runBtn.textContent = status.running ? 'Zastavit kontrolu' : report ? 'Zkontrolovat znovu' : 'Zkontrolovat';
  runBtn.disabled = status.running && status.stopRequested;

  const fixBtn = overlay.querySelector('.cc-ratings-check-fix');
  fixBtn.hidden = fixableCount === 0;
  fixBtn.disabled = status.running;
  fixBtn.textContent = `Opravit (${fixableCount})`;

  const clearBtn = overlay.querySelector('.cc-ratings-check-clear');
  clearBtn.hidden = !report;
  clearBtn.disabled = status.running;
}

function createModal() {
  const overlay = document.createElement('div');
  overlay.id = 'cc-ratings-check-overlay';
  overlay.className = 'cc-sync-modal-overlay cc-ratings-check-overlay';
  overlay.innerHTML = `
    <div class="cc-sync-modal cc-ratings-check-modal" role="dialog" aria-modal="true" aria-labelledby="cc-ratings-check-title">
      <div class="cc-ratings-check-head">
        <h3 id="cc-ratings-check-title">Kontrola hodnocení</h3>
        <button type="button" class="cc-ratings-check-close" aria-label="Zavřít">&times;</button>
      </div>
      <div class="cc-ratings-check-body"></div>
      <div class="cc-ratings-check-actions">
        <button type="button" class="cc-button cc-button-red cc-ratings-check-run">Zkontrolovat</button>
        <button type="button" class="cc-button cc-button-black cc-ratings-check-fix" hidden>Opravit</button>
        <button type="button" class="cc-button cc-button-outline cc-ratings-check-clear" hidden>Smazat report</button>
      </div>
    </div>`;

  const close = () => overlay.classList.remove('visible');
  overlay.querySelector('.cc-ratings-check-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('visible')) {
      event.stopImmediatePropagation();
      close();
    }
  }, true);

  overlay.querySelector('.cc-ratings-check-run').addEventListener('click', () => {
    if (getRatingsCheckStatus().running) stopRatingsCheck();
    else startRatingsCheck();
  });
  overlay.querySelector('.cc-ratings-check-fix').addEventListener('click', async (event) => {
    const report = loadRatingsCheckReport();
    if (!report) return;
    event.currentTarget.disabled = true;
    try {
      await applyRatingsCheckFixes(report);
    } catch (error) {
      console.error('[CC] Ratings check fix failed:', error);
    }
    renderModal(overlay);
  });
  overlay.querySelector('.cc-ratings-check-clear').addEventListener('click', () => clearRatingsCheckReport());

  window.addEventListener(RATINGS_CHECK_UPDATED_EVENT, () => {
    if (overlay.classList.contains('visible')) renderModal(overlay);
  });

  document.body.appendChild(overlay);
  return overlay;
}

export function openRatingsCheckModal() {
  const overlay = document.querySelector('#cc-ratings-check-overlay') || createModal();
  renderModal(overlay);
  overlay.classList.add('visible');
}

/** Keeps the "!" alerts in sync with the stored report (`root` may not be in the document yet). */
export function initializeRatingsCheckAlerts(root) {
  const sync = () => {
    syncRatingsCheckAlerts(document);
    if (root && !root.isConnected) syncRatingsCheckAlerts(root);
  };
  sync();
  window.addEventListener(RATINGS_CHECK_UPDATED_EVENT, sync);
}
