import { GREASYFORK_URL, SCRIPTNAME, VERSION, WHATS_NEW_VERSION_KEY } from './config.js';
import { escapeHtml } from './utils.js';

const UPDATE_CHECK_CACHE_KEY = 'cc_update_check_cache_v1';
const VERSION_DETAILS_CACHE_KEY = 'cc_version_details_cache_v1';
const CHANGELOG_CACHE_KEY = 'cc_repo_changelog_cache_v1';
const MIGRATION_REMINDER_SHOWN_KEY = 'cc_migration_reminder_shown_v1';
const PREVIOUS_WHATS_NEW_VERSION_KEY = 'CC-whats-new-version';
const LEGACY_INSTALLED_VERSION_KEY = 'cc_installed_script_version_v1';
const LEGACY_SHOWN_VERSION_KEY = 'cc_update_modal_shown_version_v1';
const UPDATE_CHECK_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const GREASYFORK_SCRIPT_API_URL = 'https://greasyfork.org/scripts/425054.json';
const GITHUB_CHANGELOG_URL = 'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/master/CHANGELOG.md';
const GITHUB_CHANGELOG_BASE_URL = 'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/master/';
const CHANGELOG_KIND_HEADINGS = new Map([
  ['added', 'is-added'],
  ['changed', 'is-changed'],
  ['fixed', 'is-fixed'],
]);
const CHANGELOG_KIND_LABELS = new Map([
  ['is-added', 'Novinka'],
  ['is-changed', 'Uprava'],
  ['is-fixed', 'Oprava'],
]);

function parseVersionParts(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

export function compareVersions(left, right) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLen = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLen; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function parseCurrentVersionFromText(versionText) {
  return String(versionText || '')
    .replace(/^v/i, '')
    .trim();
}

function normalizeVersionLabel(version) {
  const normalized = parseCurrentVersionFromText(version);
  return normalized || '—';
}

function getCurrentMenuVersion(menuRootElement) {
  const versionTextEl = menuRootElement.querySelector('#cc-version-value');
  return parseCurrentVersionFromText(versionTextEl?.textContent || VERSION);
}

function getWhatsNewStoredVersion() {
  return parseCurrentVersionFromText(localStorage.getItem(WHATS_NEW_VERSION_KEY) || '');
}

function maybeWarnAboutLegacyWhatsNewMigrationRemoval() {
  if (compareVersions(VERSION, '1.0.0') < 0) {
    return;
  }

  if (localStorage.getItem(MIGRATION_REMINDER_SHOWN_KEY) === VERSION) {
    return;
  }

  console.warn(
    `[${SCRIPTNAME}] Version ${VERSION} is >= 1.0.0. Review and remove legacy whats-new migration code in settings-version.js if it is no longer needed.`,
  );
  localStorage.setItem(MIGRATION_REMINDER_SHOWN_KEY, VERSION);
}

function migrateLegacyWhatsNewStorage() {
  // Temporary compatibility shim for pre-1.0.0 releases.
  // Once the project is stable on 1.0.0+, this migration should be removed.
  maybeWarnAboutLegacyWhatsNewMigrationRemoval();

  const currentValue = getWhatsNewStoredVersion();
  const previousKeyValue = parseCurrentVersionFromText(localStorage.getItem(PREVIOUS_WHATS_NEW_VERSION_KEY) || '');
  const legacyShownValue = parseCurrentVersionFromText(localStorage.getItem(LEGACY_SHOWN_VERSION_KEY) || '');
  const legacyInstalledValue = parseCurrentVersionFromText(localStorage.getItem(LEGACY_INSTALLED_VERSION_KEY) || '');

  if (!currentValue) {
    const migratedValue = previousKeyValue || legacyShownValue || legacyInstalledValue;
    if (migratedValue) {
      localStorage.setItem(WHATS_NEW_VERSION_KEY, migratedValue);
    }
  }

  localStorage.removeItem(PREVIOUS_WHATS_NEW_VERSION_KEY);
  localStorage.removeItem(LEGACY_SHOWN_VERSION_KEY);
  localStorage.removeItem(LEGACY_INSTALLED_VERSION_KEY);
}

function setWhatsNewStoredVersion(version) {
  const normalized = parseCurrentVersionFromText(version);
  if (!normalized) {
    localStorage.removeItem(WHATS_NEW_VERSION_KEY);
    return;
  }

  localStorage.setItem(WHATS_NEW_VERSION_KEY, normalizeVersionLabel(normalized));
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
  const response = await fetch(GREASYFORK_SCRIPT_API_URL, { method: 'GET' });
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

  return {
    latestVersion,
    datetimeRaw: doc.querySelector('.version-date')?.getAttribute('datetime') || '',
  };
}

function getCachedChangelogData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHANGELOG_CACHE_KEY) || 'null');
    if (!parsed || !parsed.checkedAt || !parsed.markdown) {
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

function setCachedChangelogData(changelogData) {
  localStorage.setItem(
    CHANGELOG_CACHE_KEY,
    JSON.stringify({
      ...changelogData,
      checkedAt: Date.now(),
    }),
  );
}

async function fetchRepoChangelogData() {
  try {
    const response = await fetch(GITHUB_CHANGELOG_URL, { method: 'GET' });
    if (response.ok) {
      const markdown = await response.text();
      if (String(markdown || '').trim()) {
        const nextData = {
          markdown,
          sourceUrl: GITHUB_CHANGELOG_URL,
          baseUrl: GITHUB_CHANGELOG_BASE_URL,
          isFallback: false,
        };
        setCachedChangelogData(nextData);
        return nextData;
      }
    }
  } catch {
    // The UI handles changelog load failures explicitly.
  }

  return {
    markdown: '',
    sourceUrl: GITHUB_CHANGELOG_URL,
    baseUrl: GITHUB_CHANGELOG_BASE_URL,
    isFallback: false,
    loadFailed: true,
  };
}

async function getRepoChangelogData() {
  const cached = getCachedChangelogData();
  if (cached) {
    return cached;
  }

  return fetchRepoChangelogData();
}

function resolveMarkdownUrl(url, baseUrl) {
  const trimmedUrl = String(url || '').trim();
  if (!trimmedUrl) {
    return '';
  }

  try {
    return new URL(trimmedUrl, baseUrl).href;
  } catch {
    return trimmedUrl;
  }
}

function createCodePlaceholder(index) {
  return `@@CC_CODE_${index}@@`;
}

function getVersionHeadingParts(headingText) {
  const match = String(headingText || '')
    .trim()
    .match(/^(v?\d+(?:\.\d+)+)(?:\s*-\s*(.+))?$/i);
  if (!match) {
    return undefined;
  }

  return {
    versionLabel: normalizeVersionLabel(match[1]),
    dateLabel: String(match[2] || '').trim(),
  };
}

function renderChangelogKindHeading(text) {
  const label = String(text || '').trim();
  return CHANGELOG_KIND_HEADINGS.get(label.toLowerCase());
}

function renderChangelogKindItems(kindClass, items, baseUrl) {
  const normalizedItems = items.map((item) => String(item || '').trim()).filter(Boolean);

  if (normalizedItems.length === 0) {
    return undefined;
  }

  const kindLabel = CHANGELOG_KIND_LABELS.get(kindClass) || '';

  return `
    <ul class="cc-version-markdown-kind-list ${kindClass}">
      ${normalizedItems
        .map(
          (item) => `
            <li class="cc-version-markdown-kind-item ${kindClass}">
              <span class="cc-version-markdown-kind-item-icon" title="${escapeHtml(kindLabel)}" aria-label="${escapeHtml(kindLabel)}">${renderChangelogKindIcon(kindClass)}</span>
              <span class="cc-version-markdown-kind-item-text">${renderInlineMarkdown(item, baseUrl)}</span>
            </li>
          `,
        )
        .join('')}
    </ul>
  `.trim();
}

function renderChangelogKindIcon(kindClass) {
  if (kindClass === 'is-added') {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 8v8"></path>
        <path d="M8 12h8"></path>
      </svg>
    `.trim();
  }

  if (kindClass === 'is-fixed') {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 20v-9"></path>
        <path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"></path>
        <path d="M14.12 3.88 16 2"></path>
        <path d="M21 21a4 4 0 0 0-3.81-4"></path>
        <path d="M21 5a4 4 0 0 1-3.55 3.97"></path>
        <path d="M22 13h-4"></path>
        <path d="M3 21a4 4 0 0 1 3.81-4"></path>
        <path d="M3 5a4 4 0 0 0 3.55 3.97"></path>
        <path d="M6 13H2"></path>
        <path d="m8 2 1.88 1.88"></path>
        <path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"></path>
      </svg>
    `.trim();
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20h9"></path>
      <path d="m16.5 3.5 4 4"></path>
      <path d="M19 3a2.12 2.12 0 1 1 3 3L7 21l-4 1 1-4Z"></path>
    </svg>
  `.trim();
}

function renderInlineMarkdown(text, baseUrl) {
  const codeSegments = [];
  let output = String(text || '').replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = createCodePlaceholder(codeSegments.length);
    codeSegments.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  output = escapeHtml(output);
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, alt, url, title) => {
    const resolvedUrl = resolveMarkdownUrl(url, baseUrl);
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img class="cc-version-markdown-image" src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy" referrerpolicy="no-referrer" />`;
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, label, url, title) => {
    const resolvedUrl = resolveMarkdownUrl(url, baseUrl);
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${label}</a>`;
  });
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/_([^_]+)_/g, '<em>$1</em>');

  codeSegments.forEach((segment, index) => {
    output = output.replaceAll(createCodePlaceholder(index), segment);
  });

  return output;
}

export function renderMarkdownToHtml(markdown, baseUrl = GITHUB_CHANGELOG_BASE_URL) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const htmlParts = [];
  let index = 0;
  let currentKindClass = '';

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      index += 1;
      const codeLines = [];
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      htmlParts.push(`<pre class="cc-version-markdown-pre"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      htmlParts.push('<hr class="cc-version-markdown-rule" />');
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1].length);
      const versionHeadingParts = level === 2 ? getVersionHeadingParts(headingMatch[2]) : undefined;
      const kindHeadingClass = level === 3 ? renderChangelogKindHeading(headingMatch[2]) : undefined;

      if (versionHeadingParts) {
        currentKindClass = '';
        htmlParts.push(
          `
            <h${level} class="cc-version-markdown-heading cc-version-markdown-heading-${level} cc-version-markdown-heading-version">
              <span class="cc-version-markdown-version">${escapeHtml(versionHeadingParts.versionLabel)}</span>
              ${versionHeadingParts.dateLabel ? `<span class="cc-version-markdown-date">${escapeHtml(versionHeadingParts.dateLabel)}</span>` : ''}
            </h${level}>
          `.trim(),
        );
        index += 1;
        continue;
      }

      if (kindHeadingClass) {
        currentKindClass = kindHeadingClass;
        index += 1;
        continue;
      }

      currentKindClass = '';
      htmlParts.push(
        `<h${level} class="cc-version-markdown-heading cc-version-markdown-heading-${level}">${renderInlineMarkdown(headingMatch[2], baseUrl)}</h${level}>`,
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
        index += 1;
      }

      if (currentKindClass) {
        htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl));
        continue;
      }

      htmlParts.push(
        `<ul class="cc-version-markdown-list">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl)}</li>`).join('')}</ul>`,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }

      if (currentKindClass) {
        htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl));
        continue;
      }

      htmlParts.push(
        `<ol class="cc-version-markdown-list cc-version-markdown-list-ordered">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl)}</li>`).join('')}</ol>`,
      );
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const candidate = lines[index];
      const candidateTrimmed = candidate.trim();
      if (!candidateTrimmed) break;
      if (/^(#{1,4})\s+/.test(candidateTrimmed)) break;
      if (/^```/.test(candidateTrimmed)) break;
      if (/^---+$/.test(candidateTrimmed)) break;
      if (/^\s*[-*+]\s+/.test(candidate)) break;
      if (/^\s*\d+\.\s+/.test(candidate)) break;
      paragraphLines.push(candidateTrimmed);
      index += 1;
    }

    const paragraphText = paragraphLines.join('\n').trim();
    if (currentKindClass && /^!\[[^\]]*\]\([^)]+\)$/.test(paragraphText)) {
      htmlParts.push(
        `<p class="cc-version-markdown-paragraph cc-version-markdown-paragraph-image">${renderInlineMarkdown(paragraphText, baseUrl)}</p>`,
      );
      continue;
    }

    if (currentKindClass) {
      htmlParts.push(renderChangelogKindItems(currentKindClass, paragraphLines, baseUrl));
      continue;
    }

    htmlParts.push(
      `<p class="cc-version-markdown-paragraph">${renderInlineMarkdown(paragraphLines.join('<br />'), baseUrl)}</p>`,
    );
  }

  return htmlParts.join('');
}

function extractVersionFromHeading(headingText) {
  const match = String(headingText || '').match(/\bv?(\d+(?:\.\d+)+)\b/);
  return match ? match[1] : '';
}

export function extractVersionSectionsFromMarkdown(markdown) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    const version = headingMatch ? extractVersionFromHeading(headingMatch[2]) : '';

    if (version) {
      if (currentSection) {
        sections.push({
          ...currentSection,
          markdown: currentSection.lines.join('\n').trim(),
        });
      }

      currentSection = {
        version,
        heading: headingMatch[2].trim(),
        lines: [line],
      };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  if (currentSection) {
    sections.push({
      ...currentSection,
      markdown: currentSection.lines.join('\n').trim(),
    });
  }

  return sections;
}

export function selectChangelogSectionsForRange(markdown, fromVersion, toVersion) {
  const sections = extractVersionSectionsFromMarkdown(markdown);
  if (sections.length === 0) {
    return [];
  }

  const normalizedFromVersion = parseCurrentVersionFromText(fromVersion);
  const normalizedToVersion = parseCurrentVersionFromText(toVersion);

  if (!normalizedFromVersion && normalizedToVersion) {
    const matchingCurrentSection = sections.find(
      (section) => compareVersions(section.version, normalizedToVersion) === 0,
    );
    return matchingCurrentSection ? [matchingCurrentSection] : sections.slice(0, 1);
  }

  const filteredSections = sections.filter((section) => {
    if (normalizedToVersion && compareVersions(section.version, normalizedToVersion) > 0) {
      return false;
    }

    if (normalizedFromVersion && compareVersions(section.version, normalizedFromVersion) <= 0) {
      return false;
    }

    return true;
  });

  if (filteredSections.length > 0) {
    return filteredSections;
  }

  if (!normalizedToVersion) {
    return sections;
  }

  const currentSection = sections.find((section) => compareVersions(section.version, normalizedToVersion) === 0);
  return currentSection ? [currentSection] : sections.slice(0, 1);
}

function buildChangelogHtml(markdown, baseUrl, fromVersion, toVersion) {
  const sections = selectChangelogSectionsForRange(markdown, fromVersion, toVersion);
  if (sections.length === 0) {
    return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
  }

  return sections
    .map(
      (section) =>
        `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl)}</section>`,
    )
    .join('');
}

function buildFullChangelogHtml(markdown, baseUrl) {
  if (!String(markdown || '').trim()) {
    return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
  }

  const sections = extractVersionSectionsFromMarkdown(markdown);
  if (sections.length === 0) {
    return `<section class="cc-version-changelog-section">${renderMarkdownToHtml(markdown, baseUrl)}</section>`;
  }

  return sections
    .map(
      (section) =>
        `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl)}</section>`,
    )
    .join('');
}

function buildChangelogWarningHtml(message = 'Changelog se nepodařilo načíst.') {
  return `<p class="cc-version-info-warning">${escapeHtml(message)}</p>`;
}

export function shouldShowWhatsNewModal(storedVersion, currentVersion) {
  const normalizedStoredVersion = parseCurrentVersionFromText(storedVersion);
  const normalizedCurrentVersion = parseCurrentVersionFromText(currentVersion);

  if (!normalizedCurrentVersion) {
    return false;
  }

  if (!normalizedStoredVersion) {
    return true;
  }

  return compareVersions(normalizedCurrentVersion, normalizedStoredVersion) > 0;
}

function buildVersionMetaHtml(currentVersion, details) {
  const latestVersion = details?.latestVersion || '';
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  const statusClass = hasUpdate ? 'is-update' : 'is-ok';
  const statusText = hasUpdate ? 'K dispozici je novější verze' : 'Používáte aktuální verzi';

  return `
    <div class="cc-version-info-meta">
      <div class="cc-version-info-meta-cards">
        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Nainstalováno</div>
          <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(currentVersion))}</div>
        </div>

        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Nejnovější</div>
          <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(latestVersion))}</div>
        </div>

        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Poslední aktualizace</div>
          <div class="cc-version-info-value">${escapeHtml(formatVersionDateTime(details?.datetimeRaw))}</div>
        </div>
      </div>

      <div class="cc-version-info-status-row">
        <span class="cc-version-info-status ${statusClass}">
          <span class="cc-version-info-status-dot" aria-hidden="true"></span>
          ${escapeHtml(statusText)}
        </span>
      </div>
    </div>
  `;
}

function buildInstalledOnlyMetaHtml(currentVersion) {
  return `
    <div class="cc-version-info-meta">
      <div class="cc-version-info-meta-cards">
        <div class="cc-version-info-card">
          <div class="cc-version-info-key">Nainstalováno</div>
          <div class="cc-version-info-value">${escapeHtml(normalizeVersionLabel(currentVersion))}</div>
        </div>
      </div>
      <div class="cc-version-info-status-row">
        <span class="cc-version-info-status">
          <span class="cc-version-info-status-dot" aria-hidden="true"></span>
          Nepodařilo se načíst informace z GreasyFork.
        </span>
      </div>
    </div>
  `;
}

function buildKeyboardShortcutsHtml() {
  return `
    <section class="cc-version-shortcuts" aria-label="Klávesové zkratky">
      <h4 class="cc-version-info-section-title">Klávesové zkratky</h4>
      <div class="cc-version-shortcuts-list">
        <div class="cc-version-shortcut-item">
          <div class="cc-version-shortcut-keys" aria-label="Ctrl plus Alt plus C">
            <kbd>Ctrl</kbd>
            <span>+</span>
            <kbd>Alt</kbd>
            <span>+</span>
            <kbd>C</kbd>
          </div>
          <div class="cc-version-shortcut-text">Otevře nebo zavře menu CSFD-Compare.</div>
        </div>

        <div class="cc-version-shortcut-item">
          <div class="cc-version-shortcut-keys" aria-label="Ctrl plus Alt plus R">
            <kbd>Ctrl</kbd>
            <span>+</span>
            <kbd>Alt</kbd>
            <span>+</span>
            <kbd>R</kbd>
          </div>
          <div class="cc-version-shortcut-text">Zapne nebo vypne zobrazení hodnocení.</div>
        </div>
      </div>
    </section>
  `;
}

function renderVersionInfoContent(currentVersion, details, changelogData) {
  const metaHtml = buildVersionMetaHtml(currentVersion, details);
  const shortcutsHtml = buildKeyboardShortcutsHtml();
  const changelogHtml = changelogData?.loadFailed
    ? buildChangelogWarningHtml()
    : buildFullChangelogHtml(changelogData?.markdown, changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL);

  return `
    ${metaHtml}
    ${shortcutsHtml}
    <h4 class="cc-version-info-section-title">Changelog</h4>
    ${changelogHtml}
  `;
}

function renderVersionInfoErrorContent(currentVersion, changelogData) {
  const shortcutsHtml = buildKeyboardShortcutsHtml();
  const changelogHtml = changelogData?.loadFailed
    ? buildChangelogWarningHtml()
    : buildFullChangelogHtml(changelogData?.markdown, changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL);
  return `
    ${buildInstalledOnlyMetaHtml(currentVersion)}
    ${shortcutsHtml}
    <h4 class="cc-version-info-section-title">Changelog</h4>
    ${changelogHtml}
  `;
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
    versionStatusEl.title = `K dispozici je nová verze: ${latestVersion}`;
    return;
  }

  versionStatusEl.classList.add('is-error');
  versionStatusEl.title = 'Aktualizaci se nepodařilo ověřit.';
}

function getVersionModal() {
  let overlay = document.querySelector('#cc-version-info-overlay');
  if (overlay) {
    return {
      overlay,
      modal: overlay.querySelector('.cc-version-info-modal'),
      head: overlay.querySelector('.cc-version-info-head'),
      titleWrap: overlay.querySelector('.cc-version-info-title-wrap'),
      title: overlay.querySelector('#cc-version-info-title'),
      body: overlay.querySelector('.cc-version-info-body'),
      actionButton: overlay.querySelector('#cc-version-info-action-btn'),
      footer: overlay.querySelector('.cc-version-info-foot'),
    };
  }

  overlay = document.createElement('div');
  overlay.id = 'cc-version-info-overlay';
  overlay.className = 'cc-version-info-overlay';
  overlay.innerHTML = `
    <div class="cc-version-info-modal" role="dialog" aria-modal="true" aria-labelledby="cc-version-info-title">
      <div class="cc-version-info-head">
        <div class="cc-version-info-title-wrap">
          <h3 id="cc-version-info-title">Informace o verzi</h3>
        </div>
        <button type="button" class="cc-version-info-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-version-info-body"></div>
      <div class="cc-version-info-foot" hidden>
        <button type="button" id="cc-version-info-action-btn" class="cc-button cc-button-red">Zavřít</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return {
    overlay,
    modal: overlay.querySelector('.cc-version-info-modal'),
    head: overlay.querySelector('.cc-version-info-head'),
    titleWrap: overlay.querySelector('.cc-version-info-title-wrap'),
    title: overlay.querySelector('#cc-version-info-title'),
    body: overlay.querySelector('.cc-version-info-body'),
    actionButton: overlay.querySelector('#cc-version-info-action-btn'),
    footer: overlay.querySelector('.cc-version-info-foot'),
  };
}

function openVersionModal({ title, html, actionLabel, onClose, hideHeaderTitle = false, modalVariant = '' } = {}) {
  const modal = getVersionModal();
  if (typeof modal.overlay.__ccVersionModalCleanup === 'function') {
    modal.overlay.__ccVersionModalCleanup();
  }

  modal.title.textContent = title || 'Informace o verzi';
  modal.body.innerHTML = html || '';
  modal.footer.hidden = !actionLabel;
  modal.modal.classList.toggle('is-whats-new-modal', modalVariant === 'whats-new');
  modal.head.classList.toggle('is-title-hidden', hideHeaderTitle);
  modal.titleWrap.hidden = hideHeaderTitle;

  if (actionLabel) {
    modal.actionButton.textContent = actionLabel;
  }

  document.body.classList.add('cc-version-info-open');
  modal.overlay.classList.add('is-open');

  const closeButton = modal.overlay.querySelector('.cc-version-info-close');
  const actionButton = modal.actionButton;

  const finalizeClose = () => {
    modal.overlay.classList.remove('is-open');
    document.body.classList.remove('cc-version-info-open');
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const closeHandler = () => {
    cleanup();
    finalizeClose();
  };
  const outsideClickHandler = (event) => {
    if (event.target === modal.overlay) {
      cleanup();
      finalizeClose();
    }
  };
  const escapeHandler = (event) => {
    if (event.key === 'Escape' && modal.overlay.classList.contains('is-open')) {
      cleanup();
      finalizeClose();
    }
  };

  function cleanup() {
    closeButton?.removeEventListener('click', closeHandler);
    actionButton?.removeEventListener('click', closeHandler);
    modal.overlay.removeEventListener('click', outsideClickHandler);
    document.removeEventListener('keydown', escapeHandler);
    delete modal.overlay.__ccVersionModalCleanup;
  }

  modal.overlay.__ccVersionModalCleanup = cleanup;
  closeButton?.addEventListener('click', closeHandler);
  actionButton?.addEventListener('click', closeHandler);
  modal.overlay.addEventListener('click', outsideClickHandler);
  document.addEventListener('keydown', escapeHandler);
}

function renderVersionInfoLoadingContent() {
  return '<p class="cc-version-info-loading">Načítám changelog a informace o verzi…</p>';
}

function renderUpdateModalContent({ fromVersion, toVersion, changelogData }) {
  const fromLabel = fromVersion ? normalizeVersionLabel(fromVersion) : 'starší verze';
  const changelogHtml = changelogData?.loadFailed
    ? buildChangelogWarningHtml('Changelog se nepodařilo načíst. Změny pro tuto verzi nejsou k dispozici.')
    : buildChangelogHtml(
        changelogData?.markdown,
        changelogData?.baseUrl || GITHUB_CHANGELOG_BASE_URL,
        fromVersion,
        toVersion,
      );

  return `
    <div class="cc-version-update-summary">
      <h4 class="cc-version-update-title">${escapeHtml(SCRIPTNAME)} byl aktualizován na ${escapeHtml(normalizeVersionLabel(toVersion))}</h4>
      <p class="cc-version-update-text">Zobrazuji změny od ${escapeHtml(fromLabel)} do ${escapeHtml(normalizeVersionLabel(toVersion))}.</p>
    </div>
    ${changelogHtml}
  `;
}

export async function openVersionInfoModal(menuRootElement) {
  const currentVersion = getCurrentMenuVersion(menuRootElement);
  openVersionModal({
    title: 'Informace o verzi',
    html: renderVersionInfoLoadingContent(),
  });

  const detailsPromise = (async () => {
    const cached = getCachedVersionDetails();
    if (cached) {
      return cached;
    }

    const details = await fetchLatestVersionDetails();
    setCachedVersionDetails(details);
    return details;
  })();

  const [detailsResult, changelogResult] = await Promise.allSettled([detailsPromise, getRepoChangelogData()]);
  const resolvedChangelog =
    changelogResult.status === 'fulfilled'
      ? changelogResult.value
      : { markdown: '', baseUrl: GITHUB_CHANGELOG_BASE_URL, loadFailed: true };

  if (detailsResult.status === 'fulfilled') {
    openVersionModal({
      title: 'Informace o verzi',
      html: renderVersionInfoContent(currentVersion, detailsResult.value, resolvedChangelog),
    });
    return;
  }

  openVersionModal({
    title: 'Informace o verzi',
    html: renderVersionInfoErrorContent(currentVersion, resolvedChangelog),
  });
}

async function maybeShowUpdatedVersionModal(menuRootElement) {
  migrateLegacyWhatsNewStorage();

  const currentVersion = getCurrentMenuVersion(menuRootElement);
  if (!currentVersion) {
    return;
  }

  const previousShownVersion = getWhatsNewStoredVersion();
  if (!shouldShowWhatsNewModal(previousShownVersion, currentVersion)) {
    return;
  }

  const changelogData = await getRepoChangelogData();
  openVersionModal({
    title: '',
    html: renderUpdateModalContent({
      fromVersion: previousShownVersion,
      toVersion: currentVersion,
      changelogData,
    }),
    actionLabel: 'Rozumím',
    hideHeaderTitle: true,
    modalVariant: 'whats-new',
    onClose: () => {
      setWhatsNewStoredVersion(currentVersion);
    },
  });
}

export async function initializeVersionUi(menuRootElement) {
  const versionStatusEl = menuRootElement.querySelector('#cc-version-status');
  const currentVersion = getCurrentMenuVersion(menuRootElement);
  if (!versionStatusEl || !currentVersion) {
    setVersionStatus(versionStatusEl, 'hidden');
    return;
  }

  maybeShowUpdatedVersionModal(menuRootElement).catch(() => undefined);

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
