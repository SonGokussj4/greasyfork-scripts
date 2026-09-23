/*
 * Changelog rendering — version-string helpers, a small Markdown renderer
 * tuned for CHANGELOG.md, and section selection for "what's new" ranges.
 *
 * Pure module: no DOM access, no localStorage. Extracted from
 * settings-version.js, which handles fetching/caching and the modal UI.
 */
import { escapeHtml } from './utils.js';

export const GITHUB_CHANGELOG_BASE_URL =
  'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/refs/heads/master/';

const CHANGELOG_KIND_HEADINGS = new Map([
  ['added', 'is-added'],
  ['changed', 'is-changed'],
  ['development', 'is-development'],
  ['fixed', 'is-fixed'],
]);
const CHANGELOG_KIND_LABELS = new Map([
  ['is-added', 'Novinka'],
  ['is-changed', 'Uprava'],
  ['is-development', 'Vyvoj'],
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

/** Compare two semver-like versions; returns 1 / 0 / -1. */
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

/** Strip a leading "v" prefix and whitespace from a version string. */
export function parseCurrentVersionFromText(versionText) {
  return String(versionText || '')
    .replace(/^v/i, '')
    .trim();
}

/** Normalized version string for display, with an em-dash fallback. */
export function normalizeVersionLabel(version) {
  const normalized = parseCurrentVersionFromText(version);
  return normalized || '—';
}

function normalizeMarkdownAssetPath(url) {
  return String(url || '')
    .trim()
    .replace(/\\/g, '/');
}

function isRelativeMarkdownAssetPath(url) {
  const normalized = normalizeMarkdownAssetPath(url);
  if (!normalized || normalized.startsWith('#') || normalized.startsWith('/')) {
    return false;
  }

  return !/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(normalized) && !/^[a-z][a-z\d+.-]*:/i.test(normalized);
}

export function resolveMarkdownUrl(url, baseUrl, assetMap) {
  const trimmedUrl = String(url || '').trim();
  if (!trimmedUrl) {
    return '';
  }

  const normalizedAssetPath = normalizeMarkdownAssetPath(trimmedUrl);
  // Bundled dev changelog mode can serve local relative resources from the
  // generated asset map before falling back to the GitHub raw URL.
  if (isRelativeMarkdownAssetPath(normalizedAssetPath) && assetMap?.[normalizedAssetPath]) {
    return assetMap[normalizedAssetPath];
  }

  try {
    return new URL(trimmedUrl, baseUrl).href;
  } catch {
    return trimmedUrl;
  }
}

function createCodePlaceholder(index) {
  return `@@CCCODE${index}@@`;
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

function renderChangelogKindItems(kindClass, items, baseUrl, assetMap) {
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
              <span class="cc-version-markdown-kind-item-text">${renderInlineMarkdown(item, baseUrl, assetMap)}</span>
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

  if (kindClass === 'is-development') {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="14" rx="2"></rect>
        <path d="m7 9 3 3-3 3"></path>
        <path d="M13 15h4"></path>
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

function renderInlineMarkdown(text, baseUrl, assetMap) {
  const codeSegments = [];
  let output = String(text || '').replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = createCodePlaceholder(codeSegments.length);
    codeSegments.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  output = escapeHtml(output);
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, alt, url, title) => {
    const resolvedUrl = resolveMarkdownUrl(url, baseUrl, assetMap);
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img class="cc-version-markdown-image" src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy" referrerpolicy="no-referrer" />`;
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, label, url, title) => {
    const resolvedUrl = resolveMarkdownUrl(url, baseUrl, assetMap);
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

export function renderMarkdownToHtml(markdown, baseUrl = GITHUB_CHANGELOG_BASE_URL, assetMap) {
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
        `<h${level} class="cc-version-markdown-heading cc-version-markdown-heading-${level}">${renderInlineMarkdown(headingMatch[2], baseUrl, assetMap)}</h${level}>`,
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
        htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl, assetMap));
        continue;
      }

      htmlParts.push(
        `<ul class="cc-version-markdown-list">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl, assetMap)}</li>`).join('')}</ul>`,
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
        htmlParts.push(renderChangelogKindItems(currentKindClass, items, baseUrl, assetMap));
        continue;
      }

      htmlParts.push(
        `<ol class="cc-version-markdown-list cc-version-markdown-list-ordered">${items.map((item) => `<li>${renderInlineMarkdown(item, baseUrl, assetMap)}</li>`).join('')}</ol>`,
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
        `<p class="cc-version-markdown-paragraph cc-version-markdown-paragraph-image">${renderInlineMarkdown(paragraphText, baseUrl, assetMap)}</p>`,
      );
      continue;
    }

    if (currentKindClass) {
      htmlParts.push(renderChangelogKindItems(currentKindClass, paragraphLines, baseUrl, assetMap));
      continue;
    }

    htmlParts.push(
      `<p class="cc-version-markdown-paragraph">${renderInlineMarkdown(paragraphLines.join('<br />'), baseUrl, assetMap)}</p>`,
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

/** Render only the sections between fromVersion (exclusive) and toVersion (inclusive). */
export function buildChangelogHtml(markdown, baseUrl, assetMap, fromVersion, toVersion) {
  const sections = selectChangelogSectionsForRange(markdown, fromVersion, toVersion);
  if (sections.length === 0) {
    return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
  }

  return sections
    .map(
      (section) =>
        `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl, assetMap)}</section>`,
    )
    .join('');
}

/** Render the entire changelog, one section per version heading. */
export function buildFullChangelogHtml(markdown, baseUrl, assetMap) {
  if (!String(markdown || '').trim()) {
    return '<p class="cc-version-info-empty">Changelog není k dispozici.</p>';
  }

  const sections = extractVersionSectionsFromMarkdown(markdown);
  if (sections.length === 0) {
    return `<section class="cc-version-changelog-section">${renderMarkdownToHtml(markdown, baseUrl, assetMap)}</section>`;
  }

  return sections
    .map(
      (section) =>
        `<section class="cc-version-changelog-section">${renderMarkdownToHtml(section.markdown, baseUrl, assetMap)}</section>`,
    )
    .join('');
}

export function buildChangelogWarningHtml(message = 'Changelog se nepodařilo načíst.') {
  return `<p class="cc-version-info-warning">${escapeHtml(message)}</p>`;
}
