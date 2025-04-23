// Rollup plugins
import css from 'rollup-plugin-css-only';
import postcss from 'rollup-plugin-postcss';
import commonjs from '@rollup/plugin-commonjs';
import { string } from 'rollup-plugin-string';

// PostCSS plugins
import simplevars from 'postcss-simple-vars';
import nested from 'postcss-nested';
import cssnext from 'postcss-cssnext';
import cssnano from 'cssnano';

// Rollup configuration
export default {
  input: 'src/main.js',
  output: {
    file: 'dist/csfd-compare.user.js',
    format: 'iife',
    name: 'CsfdCompare',
    assetFileNames: '[name]-[hash][extname]',
    banner: `// ==UserScript==
// @name         ČSFD Compare DEV
// @version      0.7.0
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @match        *://*csfd.cz/*
// @match        *://*csfd.sk/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://greasyfork.org/scripts/449554-csfd-compare-utils/code/csfd-compare-utils.js?version=1100309
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==\n`,
  },
  plugins: [
    // css({
    //   output: 'bundle.css', // Output CSS file
    // }),
    postcss({
      plugins: [simplevars(), nested(), cssnext({ warnForDuplicates: false }), cssnano()],
      extensions: ['.css'],
    }),
    string({
      include: '**/*.html',
    }),
    commonjs(),
  ],
};
