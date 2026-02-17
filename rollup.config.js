// Rollup plugins
import css from 'rollup-plugin-css-only';
import postcss from 'rollup-plugin-postcss';
import commonjs from '@rollup/plugin-commonjs';
import { string } from 'rollup-plugin-string';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PostCSS plugins
import simplevars from 'postcss-simple-vars';
import nested from 'postcss-nested';
import cssnext from 'postcss-cssnext';
import cssnano from 'cssnano';

function readScriptVersion() {
  const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  return packageJson.version || '0.0.0';
}

function injectScriptVersion() {
  const token = '__CC_VERSION__';
  const versionAnchorPattern = /(class=\\?"cc-version-link\\?"[^>]*>)v[^<"]*(<\/?a>)/g;
  const metadataVersionPattern = /(^\/\/\s*@version\s+).*/m;
  const packageJsonPath = new URL('./package.json', import.meta.url);
  const packageJsonFsPath = fileURLToPath(packageJsonPath);

  function applyVersion(content, version) {
    let nextContent = content;

    if (nextContent.includes(token)) {
      nextContent = nextContent.replaceAll(token, version);
    }

    nextContent = nextContent.replace(versionAnchorPattern, `$1v${version}$2`);
    nextContent = nextContent.replace(metadataVersionPattern, `$1${version}`);
    return nextContent;
  }

  return {
    name: 'inject-script-version',
    buildStart() {
      this.addWatchFile(packageJsonFsPath);
    },
    transform(code, id) {
      if (!id.endsWith('.html')) {
        return null;
      }

      const version = readScriptVersion();
      const nextCode = applyVersion(code, version);

      if (nextCode === code) {
        return null;
      }

      return {
        code: nextCode,
        map: null,
      };
    },
    renderChunk(code) {
      const version = readScriptVersion();
      const nextCode = applyVersion(code, version);

      if (nextCode === code) {
        return null;
      }

      return {
        code: nextCode,
        map: null,
      };
    },
  };
}

// Rollup configuration
export default {
  input: 'src/main.js',
  output: {
    file: 'dist/csfd-compare.user.js',
    format: 'iife',
    name: 'CsfdCompare',
    assetFileNames: '[name]-[hash][extname]',
    banner: () => `// ==UserScript==
// @name         ČSFD Compare V2
// @version      ${readScriptVersion()}
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @include      *csfd.cz/*
// @include      *csfd.sk/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://greasyfork.org/scripts/449554-csfd-compare-utils/code/csfd-compare-utils.js?version=1100309
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==\n`,
  },
  watch: {
    include: ['src/**', 'package.json'],
  },
  plugins: [
    // css({
    //   output: 'bundle.css', // Output CSS file
    // }),
    postcss({
      plugins: [simplevars(), nested(), cssnext({ warnForDuplicates: false }), cssnano()],
      extensions: ['.css'],
    }),
    injectScriptVersion(),
    string({
      include: '**/*.html',
    }),
    commonjs(),
  ],
};
