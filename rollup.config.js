export default {
  input: 'src/main.js',
  output: {
    file: 'dist/csfd-compare.user.js',
    format: 'iife', // no module syntax here
    name: 'CsfdCompare', // global variable name
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
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==
`,
  },
};

// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://greasyfork.org/scripts/449554-csfd-compare-utils/code/csfd-compare-utils.js?version=1100309
