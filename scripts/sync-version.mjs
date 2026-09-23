import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = process.cwd();
const packageJsonPath = resolve(rootDir, 'package.json');
const settingsHtmlPath = resolve(rootDir, 'src/settings-button-content.html');
const configJsPath = resolve(rootDir, 'src/config.js');
const changelogPath = resolve(rootDir, 'CHANGELOG.md');

function getVersionFromPackageJson() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = String(packageJson.version || '').trim();
  if (!version) {
    throw new Error('package.json version is empty');
  }
  return version;
}

function syncSettingsVersion(version) {
  const source = readFileSync(settingsHtmlPath, 'utf8');

  const byToken = source.replace(/v__CC_VERSION__/g, `v${version}`);
  const byId = byToken.replace(/(id="cc-version-value"[^>]*>)v[^<]*(<\/[^>]+>)/g, `$1v${version}$2`);

  if (byId !== source) {
    writeFileSync(settingsHtmlPath, byId, 'utf8');
    return true;
  }

  return false;
}

function syncConfigVersion(version) {
  const source = readFileSync(configJsPath, 'utf8');

  const updated = source.replace(/(export const VERSION = ')[^']*(';)/, `$1${version}$2`);

  if (updated !== source) {
    writeFileSync(configJsPath, updated, 'utf8');
    return true;
  }
  return false;
}

// The unreleased CHANGELOG section always carries the current version, so the in-app
// changelog and the "what's new" modal can match it to the installed version.
function syncUnreleasedChangelogVersion(version) {
  const source = readFileSync(changelogPath, 'utf8');
  const updated = source.replace(/^(##\s+)v?\d+(?:\.\d+)+(\s+-\s+unreleased)(?=\r?$)/im, `$1${version}$2`);

  if (updated !== source) {
    writeFileSync(changelogPath, updated, 'utf8');
    return true;
  }
  return false;
}

function main() {
  const version = getVersionFromPackageJson();
  const htmlUpdated = syncSettingsVersion(version);
  const configUpdated = syncConfigVersion(version);
  const changelogUpdated = syncUnreleasedChangelogVersion(version);

  if (htmlUpdated) {
    console.log(`Synced settings version to v${version}`);
  } else {
    console.log('Settings version not updated (already in sync).');
  }

  if (configUpdated) {
    console.log(`Synced config version to v${version}`);
  } else {
    console.log('Config version not updated (already in sync).');
  }

  if (changelogUpdated) {
    console.log(`Synced unreleased CHANGELOG heading to ${version}`);
  }
}

main();
