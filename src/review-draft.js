/*
 * Review draft autosave.
 *
 * Continuously persists a half-written film review to localStorage so it
 * survives refreshes, crashes, power loss and failed submits. When the user
 * reopens the review form a small banner offers to restore (or copy) the saved
 * draft. The draft is cleared automatically once the review is detected at the
 * top of the review list (i.e. the submit actually succeeded).
 *
 * The Csfd page logic stays untouched — this module self-gates on the reviews
 * page and wires itself to ČSFD's native (TinyMCE) review form.
 */
import {
  REVIEW_DRAFT_AUTOSAVE_ENABLED_KEY,
  REVIEW_DRAFT_STORAGE_PREFIX,
  getCsfdPathSegmentPattern,
} from './config.js';
import { getFeatureState } from './utils.js';
import {
  buildDraftStorageKey,
  deriveDraftId,
  draftHasContent,
  formatClockTime,
  formatDraftAge,
  getPrimaryLanguageIndex,
  htmlToPlainText,
  isDraftPublished,
  normalizeReviewText,
  parseLanguageIndex,
} from './review-draft-data.js';

const REVIEWS_PAGE_REGEX = new RegExp(String.raw`/(?:${getCsfdPathSegmentPattern('reviews')})/`, 'i');
const SAVE_DEBOUNCE_MS = 800;
const ATTACH_POLL_INTERVAL_MS = 300;
const ATTACH_POLL_MAX_TICKS = 40; // ~12s — TinyMCE can be slow to initialise
const PUBLISH_CHECK_DELAYS_MS = [700, 1500, 3000, 5000, 8000];

let controller = null;

function isReviewsPage() {
  return REVIEWS_PAGE_REGEX.test(globalThis.location?.pathname || '');
}

/** TinyMCE editor instance, if the page global is reachable in this userscript sandbox. */
function getEditor(textareaId) {
  const tm = globalThis.tinymce;
  if (!tm || typeof tm.get !== 'function') return null;
  const editor = tm.get(textareaId);
  if (!editor || editor.removed) return null;
  return editor;
}

function getIframeBody(textareaId) {
  const iframe = document.getElementById(`${textareaId}_ifr`);
  try {
    return iframe?.contentDocument?.body || null;
  } catch {
    return null;
  }
}

function getFilmTitle() {
  const el = document.querySelector('.film-header-name h1, h1.film-title-name, .film-header h1, h1');
  return el?.textContent?.trim() || '';
}

function createController() {
  let enabled = getFeatureState(REVIEW_DRAFT_AUTOSAVE_ENABLED_KEY, true);
  let draftId = computeDraftId();
  let attachedForm = null;
  let entries = []; // [{ lang, textareaId, textarea }]
  const attachedEditors = new Set();
  const attachedBodies = new Set();
  let attachPollTimer = null;
  let attachPollTicks = 0;
  let saveTimer = null;
  let indicatorEl = null;
  let bannerEl = null;
  let submittedSnapshot = null;
  let publishTimers = [];
  let observer = null;
  let observerDebounce = null;

  // ---- storage -----------------------------------------------------------
  function computeDraftId() {
    const autosaveId = document
      .querySelector('#review-form textarea[data-tinymce-autosave-id], textarea[data-tinymce-autosave-id]')
      ?.getAttribute('data-tinymce-autosave-id');
    return deriveDraftId(autosaveId, globalThis.location?.pathname || '');
  }

  function storageKey() {
    return draftId ? buildDraftStorageKey(REVIEW_DRAFT_STORAGE_PREFIX, draftId) : null;
  }

  function readDraft() {
    const key = storageKey();
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  function writeDraft(languages) {
    const key = storageKey();
    if (!key) return null;
    const record = {
      id: draftId,
      url: globalThis.location?.pathname || '',
      title: getFilmTitle(),
      updatedAt: Date.now(),
      languages,
    };
    try {
      localStorage.setItem(key, JSON.stringify(record));
    } catch (err) {
      console.error('[CC] Failed to persist review draft:', err);
    }
    return record;
  }

  function removeDraft() {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  // ---- editor content I/O ------------------------------------------------
  function readLangHtml(entry) {
    const editor = getEditor(entry.textareaId);
    if (editor && typeof editor.getContent === 'function') {
      try {
        return editor.getContent() || '';
      } catch {}
    }
    const body = getIframeBody(entry.textareaId);
    if (body) return body.innerHTML || '';
    return entry.textarea?.value || '';
  }

  function writeLangHtml(entry, html) {
    const value = typeof html === 'string' ? html : '';
    const editor = getEditor(entry.textareaId);
    if (editor && typeof editor.setContent === 'function') {
      try {
        editor.setContent(value);
        editor.fire?.('change');
      } catch {}
    } else {
      const body = getIframeBody(entry.textareaId);
      if (body) body.innerHTML = value;
    }
    if (entry.textarea) entry.textarea.value = value;
  }

  function collectLanguages() {
    const languages = {};
    for (const entry of entries) {
      languages[entry.lang] = readLangHtml(entry);
    }
    return languages;
  }

  // ---- save flow ---------------------------------------------------------
  function onUserEdit() {
    if (!enabled || !attachedForm) return;
    setStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(doSave, SAVE_DEBOUNCE_MS);
  }

  function doSave() {
    if (!enabled || !attachedForm) return;
    const languages = collectLanguages();
    if (!draftHasContent(languages)) {
      removeDraft();
      setStatus('empty');
      return;
    }
    const record = writeDraft(languages);
    setStatus('saved', record?.updatedAt);
  }

  // ---- status indicator --------------------------------------------------
  function ensureIndicator() {
    if (!attachedForm) return null;
    if (indicatorEl && attachedForm.contains(indicatorEl)) return indicatorEl;

    indicatorEl = document.createElement('span');
    indicatorEl.className = 'cc-review-draft-status';
    indicatorEl.setAttribute('aria-live', 'polite');

    const footer = attachedForm.querySelector('.box-footer-post') || attachedForm.querySelector('.box-footer');
    if (footer) {
      footer.classList.add('cc-review-draft-footer');
      // Append last so ČSFD's native "Zavřít / Přidat recenzi" buttons keep their
      // original left position and the save status sits on the right.
      footer.appendChild(indicatorEl);
    } else {
      attachedForm.appendChild(indicatorEl);
    }
    return indicatorEl;
  }

  function setStatus(state, time) {
    const el = ensureIndicator();
    if (!el) return;

    const map = {
      idle: { cls: 'is-idle', text: '💾 Koncept se ukládá automaticky' },
      saving: { cls: 'is-saving', text: '💾 Ukládám…' },
      saved: { cls: 'is-saved', text: `✓ Koncept uložen${time ? ` v ${formatClockTime(time)}` : ''}` },
      empty: { cls: 'is-idle', text: '💾 Koncept se ukládá automaticky' },
      submitting: { cls: 'is-saving', text: '↑ Odesílám recenzi…' },
      published: { cls: 'is-saved', text: '✓ Recenze odeslána – koncept smazán' },
      restored: { cls: 'is-saved', text: '✓ Koncept obnoven' },
      copied: { cls: 'is-saved', text: '✓ Zkopírováno do schránky' },
    };
    const conf = map[state] || map.idle;
    el.className = `cc-review-draft-status ${conf.cls}`;
    el.textContent = conf.text;
  }

  // ---- restore banner ----------------------------------------------------
  function maybeShowBanner() {
    if (!enabled || !attachedForm) return;
    const draft = readDraft();
    if (!draft || !draftHasContent(draft.languages)) {
      hideBanner();
      return;
    }
    if (bannerEl && attachedForm.contains(bannerEl)) {
      refreshBannerAge(draft);
      return;
    }
    bannerEl = buildBanner(draft);
    attachedForm.insertBefore(bannerEl, attachedForm.firstChild);
  }

  function refreshBannerAge(draft) {
    const ageEl = bannerEl?.querySelector('.cc-review-draft-banner-age');
    if (ageEl && draft?.updatedAt) ageEl.textContent = formatDraftAge(draft.updatedAt);
  }

  function buildBanner(draft) {
    const banner = document.createElement('div');
    banner.className = 'cc-review-draft-banner';
    banner.innerHTML = `
      <span class="cc-review-draft-banner-icon" aria-hidden="true">📝</span>
      <span class="cc-review-draft-banner-text">
        Máte uložený rozepsaný koncept (<span class="cc-review-draft-banner-age">${formatDraftAge(draft.updatedAt)}</span>).
      </span>
      <span class="cc-review-draft-banner-actions">
        <button type="button" class="cc-review-draft-btn cc-review-draft-btn-primary" data-cc-draft-action="restore">Obnovit</button>
        <button type="button" class="cc-review-draft-btn" data-cc-draft-action="copy">Kopírovat</button>
        <button type="button" class="cc-review-draft-btn cc-review-draft-btn-ghost" data-cc-draft-action="discard">Zahodit</button>
      </span>`;

    banner.addEventListener('click', (e) => {
      const action = e.target.closest('[data-cc-draft-action]')?.getAttribute('data-cc-draft-action');
      if (!action) return;
      e.preventDefault();
      if (action === 'restore') restoreDraft();
      else if (action === 'copy') copyDraft();
      else if (action === 'discard') discardDraft();
    });

    return banner;
  }

  function hideBanner() {
    bannerEl?.remove();
    bannerEl = null;
  }

  function restoreDraft() {
    const draft = readDraft();
    if (!draft) return;
    for (const entry of entries) {
      const html = draft.languages?.[entry.lang];
      if (typeof html === 'string') writeLangHtml(entry, html);
    }
    activatePrimaryLanguageTab(draft);
    setStatus('restored');
    if (bannerEl) {
      const textEl = bannerEl.querySelector('.cc-review-draft-banner-text');
      if (textEl) textEl.textContent = 'Koncept byl vložen do formuláře.';
      bannerEl.classList.add('is-restored');
    }
  }

  function activatePrimaryLanguageTab(draft) {
    const lang = getPrimaryLanguageIndex(draft.languages);
    if (!lang || !attachedForm) return;
    const tabLink = attachedForm.querySelector(`.tab-nav a[data-href=".language_${lang}"]`);
    if (tabLink) tabLink.click();
  }

  function copyDraft() {
    const draft = readDraft();
    if (!draft) return;
    const lang = getPrimaryLanguageIndex(draft.languages);
    const text = htmlToPlainText(draft.languages?.[lang] || '');
    if (!text) return;

    const done = () => setStatus('copied');
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else {
        fallbackCopy(text, done);
      }
    } catch {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done?.();
    } catch {}
    ta.remove();
  }

  function discardDraft() {
    removeDraft();
    hideBanner();
    setStatus('idle');
  }

  // ---- submit & publish detection ---------------------------------------
  function onSubmit() {
    if (!enabled || !attachedForm) return;
    const languages = collectLanguages();
    submittedSnapshot = { at: Date.now(), languages };
    // Persist immediately — the network may drop during submit.
    if (draftHasContent(languages)) writeDraft(languages);
    setStatus('submitting');
    schedulePublishChecks();
  }

  function schedulePublishChecks() {
    clearPublishTimers();
    for (const delay of PUBLISH_CHECK_DELAYS_MS) {
      publishTimers.push(window.setTimeout(checkPublished, delay));
    }
  }

  function clearPublishTimers() {
    publishTimers.forEach((t) => clearTimeout(t));
    publishTimers = [];
  }

  function getPublishedReviewText() {
    const myReview = document.querySelector('article.my-review[data-film-review], article.my-review');
    if (!myReview) return '';
    const contentEl = myReview.querySelector('[data-film-review-content], .comment');
    return (contentEl || myReview).textContent || '';
  }

  function checkPublished() {
    const draft = readDraft();
    if (!draft) {
      clearPublishTimers();
      return true;
    }
    const publishedText = getPublishedReviewText();
    if (!publishedText) return false;

    const languages =
      submittedSnapshot && draftHasContent(submittedSnapshot.languages)
        ? submittedSnapshot.languages
        : draft.languages;

    if (isDraftPublished(publishedText, languages)) {
      removeDraft();
      hideBanner();
      setStatus('published');
      submittedSnapshot = null;
      clearPublishTimers();
      return true;
    }
    return false;
  }

  // ---- form wiring -------------------------------------------------------
  function attachToForm(form) {
    if (!enabled || !form) return;
    if (attachedForm === form) {
      ensureIndicator();
      maybeShowBanner();
      return;
    }
    detachForm();

    attachedForm = form;
    draftId = computeDraftId();

    const textareas = form.querySelectorAll('textarea[name^="languages["]');
    entries = [];
    textareas.forEach((textarea) => {
      const lang = parseLanguageIndex(textarea.getAttribute('name'));
      if (!lang || !textarea.id) return;
      entries.push({ lang, textareaId: textarea.id, textarea });
      // Native textarea fallback (covers the pre-TinyMCE window and sandboxes
      // where the page's tinymce global is unreachable).
      textarea.addEventListener('input', onUserEdit);
    });

    form.addEventListener('submit', onSubmit);

    startAttachPolling();
    ensureIndicator();
    setStatus(readDraft() ? 'saved' : 'idle', readDraft()?.updatedAt);
    maybeShowBanner();
  }

  function detachForm() {
    clearTimeout(saveTimer);
    saveTimer = null;
    stopAttachPolling();
    clearPublishTimers();
    if (attachedForm) {
      attachedForm.removeEventListener('submit', onSubmit);
      for (const entry of entries) entry.textarea?.removeEventListener('input', onUserEdit);
    }
    indicatorEl?.remove();
    indicatorEl = null;
    hideBanner();
    attachedEditors.clear();
    attachedBodies.clear();
    entries = [];
    attachedForm = null;
    submittedSnapshot = null;
  }

  function startAttachPolling() {
    stopAttachPolling();
    attachPollTicks = 0;
    const tick = () => {
      attachPollTicks += 1;
      const allReady = tryAttachLiveEditors();
      if (allReady || attachPollTicks >= ATTACH_POLL_MAX_TICKS) stopAttachPolling();
    };
    tick();
    attachPollTimer = window.setInterval(tick, ATTACH_POLL_INTERVAL_MS);
  }

  function stopAttachPolling() {
    if (attachPollTimer) clearInterval(attachPollTimer);
    attachPollTimer = null;
  }

  /** Attach live capture to each editor; returns true when every entry is wired. */
  function tryAttachLiveEditors() {
    let allReady = true;
    for (const entry of entries) {
      let ready = false;

      const editor = getEditor(entry.textareaId);
      if (editor && !attachedEditors.has(entry.textareaId)) {
        editor.on('input keyup paste cut Undo Redo', onUserEdit);
        attachedEditors.add(entry.textareaId);
      }
      if (attachedEditors.has(entry.textareaId)) ready = true;

      const body = getIframeBody(entry.textareaId);
      if (body && !attachedBodies.has(entry.textareaId)) {
        body.addEventListener('input', onUserEdit);
        body.addEventListener('keyup', onUserEdit);
        attachedBodies.add(entry.textareaId);
      }
      if (attachedBodies.has(entry.textareaId)) ready = true;

      if (!ready) allReady = false;
    }
    return allReady;
  }

  // ---- DOM observation ---------------------------------------------------
  function handleMutations() {
    if (observerDebounce) return;
    observerDebounce = window.setTimeout(() => {
      observerDebounce = null;

      const form = document.getElementById('review-form');
      if (form) {
        if (enabled) attachToForm(form);
      } else if (attachedForm) {
        detachForm();
      }

      if (readDraft()) checkPublished();
    }, 150);
  }

  // ---- public lifecycle --------------------------------------------------
  function start() {
    // Clear a draft that was already published before this page loaded
    // (e.g. submitted, then the page reloaded).
    reconcileOnLoad();

    const form = document.getElementById('review-form');
    if (form && enabled) attachToForm(form);

    // Reopening the form (native "Přidat/Upravit recenzi" / edit pencil) should
    // re-surface the restore banner for a draft saved earlier this session.
    document.addEventListener('click', onPossibleOpenClick, true);

    const root = document.querySelector('div.page-content') || document.body;
    observer = new MutationObserver(handleMutations);
    observer.observe(root, { childList: true, subtree: true });
  }

  function onPossibleOpenClick(e) {
    if (!enabled) return;
    if (!e.target.closest('#review-add-button, [data-open-review-form]')) return;
    window.setTimeout(() => {
      const form = document.getElementById('review-form');
      if (form) {
        attachToForm(form);
        maybeShowBanner();
      }
    }, 350);
  }

  function reconcileOnLoad() {
    const draft = readDraft();
    if (!draft) return;
    const publishedText = getPublishedReviewText();
    if (publishedText && isDraftPublished(publishedText, draft.languages)) {
      removeDraft();
    }
  }

  function setEnabled(next) {
    enabled = !!next;
    if (enabled) {
      const form = document.getElementById('review-form');
      if (form) attachToForm(form);
    } else {
      clearTimeout(saveTimer);
      saveTimer = null;
      stopAttachPolling();
      clearPublishTimers();
      indicatorEl?.remove();
      indicatorEl = null;
      hideBanner();
    }
  }

  return { start, setEnabled };
}

/** Wire up review draft autosave (no-op outside the reviews page). */
export function initializeReviewDraftAutosave() {
  if (controller) return controller;
  if (!isReviewsPage()) return null;
  controller = createController();
  controller.start();
  return controller;
}

/** Toggle handler — called from main.js when the settings switch changes. */
export function setReviewDraftAutosaveEnabled(enabled) {
  controller?.setEnabled(enabled);
}
