import { GREASYFORK_URL } from './config.js';

const UPDATE_CHECK_CACHE_KEY = 'cc_update_check_cache_v1';
const VERSION_DETAILS_CACHE_KEY = 'cc_version_details_cache_v1';
const UPDATE_CHECK_MAX_AGE_MS = 1000 * 60 * 60 * 12;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseVersionParts(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function compareVersions(left, right) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLen = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < maxLen; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}

function parseCurrentVersionFromText(versionText) {
  return String(versionText || '')
    .replace(/^v/i, '')
    .trim();
}

function getCachedUpdateInfo() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UPDATE_CHECK_CACHE_KEY) || 'null');
    if (!parsed || !parsed.checkedAt || !parsed.latestVersion) {
      return undefined;
    }

    if (Date.now() - Number(parsed.checkedAt) > UPDATE_CHECK_MAX_AGE_MS) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function setCachedUpdateInfo(latestVersion) {
  localStorage.setItem(
    UPDATE_CHECK_CACHE_KEY,
    JSON.stringify({
      latestVersion,
      checkedAt: Date.now(),
    }),
  );
}

async function fetchLatestScriptVersion() {
  const apiUrl = 'https://greasyfork.org/scripts/425054.json';
  const response = await fetch(apiUrl, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Update check failed: ${response.status}`);
  }

  const payload = await response.json();
  const latestVersion = String(payload?.version || '').trim();
  if (!latestVersion) {
    throw new Error('Update check returned empty version');
  }

  return latestVersion;
}

function getCachedVersionDetails() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VERSION_DETAILS_CACHE_KEY) || 'null');
    if (!parsed || !parsed.checkedAt || !parsed.latestVersion) {
      return undefined;
    }

    if (Date.now() - Number(parsed.checkedAt) > UPDATE_CHECK_MAX_AGE_MS) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function setCachedVersionDetails(details) {
  localStorage.setItem(
    VERSION_DETAILS_CACHE_KEY,
    JSON.stringify({
      ...details,
      checkedAt: Date.now(),
    }),
  );
}

function normalizeVersionLabel(version) {
  const normalized = parseCurrentVersionFromText(version);
  return normalized ? `v${normalized}` : '—';
}

function formatVersionDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '—';
  }

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) {
    return raw;
  }

  return parsedDate.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractChangelogItems(changelogElement) {
  if (!changelogElement) {
    return [];
  }

  const listItems = Array.from(changelogElement.querySelectorAll('li'))
    .map((item) => item.textContent?.trim())
    .filter(Boolean);

  if (listItems.length > 0) {
    return listItems.slice(0, 12);
  }

  return String(changelogElement.textContent || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function fetchLatestVersionDetails() {
  const response = await fetch(`${GREASYFORK_URL}/versions`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Version details fetch failed: ${response.status}`);
  }

  const pageHtml = await response.text();
  const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
  const versionNumberText = doc.querySelector('.version-number a, .version-number')?.textContent?.trim() || '';
  const latestVersion = parseCurrentVersionFromText(versionNumberText);
  if (!latestVersion) {
    throw new Error('Version details returned empty version number');
  }

  const datetimeRaw = doc.querySelector('.version-date')?.getAttribute('datetime') || '';
  const changelogElement = doc.querySelector('.version-changelog');
  const changelogItems = extractChangelogItems(changelogElement);

  return {
    latestVersion,
    datetimeRaw,
    changelogItems,
  };
}

function getVersionInfoModal() {
  let overlay = document.querySelector('#cc-version-info-overlay');
  if (overlay) {
    return {
      overlay,
      body: overlay.querySelector('.cc-version-info-body'),
    };
  }

  overlay = document.createElement('div');
  overlay.id = 'cc-version-info-overlay';
  overlay.className = 'cc-version-info-overlay';
  overlay.innerHTML = `
    <div class="cc-version-info-modal" role="dialog" aria-modal="true" aria-labelledby="cc-version-info-title">
      <div class="cc-version-info-head">
        <h3 id="cc-version-info-title">Informace o verzi</h3>
        <button type="button" class="cc-version-info-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-version-info-body"></div>
    </div>
  `;

  const closeButton = overlay.querySelector('.cc-version-info-close');
  closeButton?.addEventListener('click', () => {
    overlay.classList.remove('is-open');
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.classList.remove('is-open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
      overlay.classList.remove('is-open');
    }
  });

  document.body.appendChild(overlay);
  return {
    overlay,
    body: overlay.querySelector('.cc-version-info-body'),
  };
}

function renderVersionInfoContent(bodyElement, currentVersion, details, state) {
  if (!bodyElement) {
    return;
  }

  if (state === 'loading') {
    bodyElement.innerHTML = '<p class="cc-version-info-loading">Načítám informace o verzi…</p>';
    return;
  }

  if (state === 'error') {
    bodyElement.innerHTML = `
      <div class="cc-version-info-meta">
        <div class="cc-version-info-key">Nainstalováno</div>
        <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(currentVersion))}</div>
      </div>
      <p class="cc-version-info-empty">Nepodařilo se načíst informace z GreasyFork.</p>
    `;
    return;
  }

  const latestVersion = details?.latestVersion || '';
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  const statusClass = hasUpdate ? 'is-update' : 'is-ok';
  const statusText = hasUpdate ? 'K dispozici je novější verze' : 'Používáte aktuální verzi';
  const changelogItems = Array.isArray(details?.changelogItems) ? details.changelogItems : [];

  const changelogHtml = changelogItems.length
    ? `<ul class="cc-version-info-list">${changelogItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';

  bodyElement.innerHTML = `
    <div class="cc-version-info-meta">
      <div class="cc-version-info-key">Nainstalováno</div>
      <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(currentVersion))}</div>

      <div class="cc-version-info-key">Nejnovější</div>
      <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(latestVersion))}</div>

      <div class="cc-version-info-key">Poslední aktualizace</div>
      <div class="cc-version-info-value">${escapeHtml(formatVersionDateTime(details?.datetimeRaw))}</div>

      <div class="cc-version-info-key">Stav</div>
      <div class="cc-version-info-value">
        <span class="cc-version-info-status ${statusClass}">
          <span class="cc-version-info-status-dot" aria-hidden="true"></span>
          ${escapeHtml(statusText)}
        </span>
      </div>
    </div>
    <h4 class="cc-version-info-section-title">Changelog</h4>
    ${changelogHtml}
  `;
}

export async function openVersionInfoModal(rootElement) {
  const modal = getVersionInfoModal();
  const versionTextEl = rootElement.querySelector('#cc-version-value');
  const currentVersion = parseCurrentVersionFromText(versionTextEl?.textContent || '');

  renderVersionInfoContent(modal.body, currentVersion, null, 'loading');
  modal.overlay.classList.add('is-open');

  const cached = getCachedVersionDetails();
  if (cached) {
    renderVersionInfoContent(modal.body, currentVersion, cached, 'ready');
    return;
  }

  try {
    const details = await fetchLatestVersionDetails();
    setCachedVersionDetails(details);
    renderVersionInfoContent(modal.body, currentVersion, details, 'ready');
  } catch {
    renderVersionInfoContent(modal.body, currentVersion, null, 'error');
  }
}

function setVersionStatus(versionStatusEl, state, latestVersion) {
  if (!versionStatusEl) {
    return;
  }

  versionStatusEl.className = 'cc-version-status';
  versionStatusEl.textContent = '';
  versionStatusEl.removeAttribute('title');

  if (state === 'hidden') {
    return;
  }

  versionStatusEl.classList.add('is-visible');

  if (state === 'checking') {
    versionStatusEl.classList.add('is-checking');
    versionStatusEl.title = 'Kontroluji aktualizaci…';
    return;
  }

  if (state === 'ok') {
    versionStatusEl.classList.add('is-ok');
    versionStatusEl.title = 'Používáte aktuální verzi.';
    return;
  }

  if (state === 'update') {
    versionStatusEl.classList.add('is-update');
    versionStatusEl.textContent = '↑';
    versionStatusEl.title = `K dispozici je nová verze: v${latestVersion}`;
    return;
  }

  versionStatusEl.classList.add('is-error');
  versionStatusEl.title = 'Aktualizaci se nepodařilo ověřit.';
}

export async function initializeVersionUi(rootElement) {
  const versionLinkEl = rootElement.querySelector('#cc-version-value');
  const versionStatusEl = rootElement.querySelector('#cc-version-status');
  if (!versionLinkEl || !versionStatusEl) {
    return;
  }

  const currentVersion = parseCurrentVersionFromText(versionLinkEl.textContent);
  if (!currentVersion) {
    setVersionStatus(versionStatusEl, 'hidden');
    return;
  }

  setVersionStatus(versionStatusEl, 'checking');

  const cached = getCachedUpdateInfo();
  if (cached?.latestVersion) {
    const isUpdateAvailable = compareVersions(cached.latestVersion, currentVersion) > 0;
    setVersionStatus(versionStatusEl, isUpdateAvailable ? 'update' : 'ok', cached.latestVersion);
    return;
  }

  try {
    const latestVersion = await fetchLatestScriptVersion();
    setCachedUpdateInfo(latestVersion);
    const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    setVersionStatus(versionStatusEl, isUpdateAvailable ? 'update' : 'ok', latestVersion);
  } catch {
    setVersionStatus(versionStatusEl, 'error');
  }
}
