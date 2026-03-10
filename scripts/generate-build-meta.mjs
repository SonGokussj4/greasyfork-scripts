import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const changelogPath = resolve(repoRoot, 'CHANGELOG.md');
const outputPath = resolve(repoRoot, 'src', 'generated-build-meta.js');
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/refs/heads';

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

const changelogMarkdown = readFileSync(changelogPath, 'utf8');
const currentBranchName = getCurrentBranchName();
const bundledChangelogBaseUrl = getBundledChangelogBaseUrl(currentBranchName);

const fileContent = `export const BUILD_BRANCH_NAME = ${JSON.stringify(currentBranchName)};
export const BUILD_CHANGELOG_BASE_URL = ${JSON.stringify(bundledChangelogBaseUrl)};
export const BUILD_CHANGELOG_MARKDOWN = ${JSON.stringify(changelogMarkdown)};
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
