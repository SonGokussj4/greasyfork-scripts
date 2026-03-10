import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const changelogPath = resolve(repoRoot, 'CHANGELOG.md');
const outputPath = resolve(repoRoot, 'src', 'generated-build-meta.js');
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/refs/heads';
const CHANGELOG_ASSET_URL_REGEX = /!??\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const MIME_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function getCurrentBranchName() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function shouldPreferBundledChangelog(branchName) {
  return Boolean(branchName) && branchName !== 'master';
}

function encodeBranchName(branchName) {
  return String(branchName || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function getBundledChangelogBaseUrl(branchName) {
  const normalizedBranchName = String(branchName || '').trim() || 'master';
  return `${GITHUB_RAW_BASE}/${encodeBranchName(normalizedBranchName)}/`;
}

function normalizeMarkdownAssetPath(assetPath) {
  return String(assetPath || '')
    .trim()
    .replace(/\\/g, '/');
}

function isRelativeMarkdownAssetPath(assetPath) {
  const normalized = normalizeMarkdownAssetPath(assetPath);
  if (!normalized || normalized.startsWith('#') || normalized.startsWith('/')) {
    return false;
  }

  return !/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(normalized) && !/^[a-z][a-z\d+.-]*:/i.test(normalized);
}

function isInsideRepoRoot(filePath) {
  const relPath = relative(repoRoot, filePath);
  return relPath && !relPath.startsWith('..') && !relPath.includes(':');
}

function getMimeType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function encodeFileAsDataUrl(filePath) {
  const mimeType = getMimeType(filePath);
  const fileContent = readFileSync(filePath);
  return `data:${mimeType};base64,${fileContent.toString('base64')}`;
}

function collectBundledChangelogAssets(markdown) {
  const assetMap = {};

  for (const match of String(markdown || '').matchAll(CHANGELOG_ASSET_URL_REGEX)) {
    const assetPath = normalizeMarkdownAssetPath(match[1]);
    if (!isRelativeMarkdownAssetPath(assetPath) || assetMap[assetPath]) {
      continue;
    }

    const resolvedAssetPath = resolve(repoRoot, assetPath);
    if (!isInsideRepoRoot(resolvedAssetPath) || !existsSync(resolvedAssetPath)) {
      continue;
    }

    assetMap[assetPath] = encodeFileAsDataUrl(resolvedAssetPath);
  }

  return assetMap;
}

const changelogMarkdown = readFileSync(changelogPath, 'utf8');
const currentBranchName = getCurrentBranchName();
const bundledChangelogBaseUrl = getBundledChangelogBaseUrl(currentBranchName);
const bundledChangelogAssetMap = shouldPreferBundledChangelog(currentBranchName)
  ? collectBundledChangelogAssets(changelogMarkdown)
  : {};

const fileContent = `export const BUILD_BRANCH_NAME = ${JSON.stringify(currentBranchName)};
export const BUILD_CHANGELOG_BASE_URL = ${JSON.stringify(bundledChangelogBaseUrl)};
export const BUILD_CHANGELOG_MARKDOWN = ${JSON.stringify(changelogMarkdown)};
export const BUILD_CHANGELOG_ASSET_MAP = ${JSON.stringify(bundledChangelogAssetMap)};
export const BUILD_PREFERS_BUNDLED_CHANGELOG = ${shouldPreferBundledChangelog(currentBranchName)};
`;

let existingFileContent = '';

try {
  existingFileContent = readFileSync(outputPath, 'utf8');
} catch {
  existingFileContent = '';
}

if (existingFileContent !== fileContent) {
  writeFileSync(outputPath, fileContent, 'utf8');
}
