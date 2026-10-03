# CSFD-Compare

## DEVELOPMENT

> **Note**: `@require` path example -> Linux vs Windows  
> Linus: `file:///absolute/path/to/dist/csfd-compare.user.js`  
> Windows: `file:///C:/path/to/dist/csfd-compare.user.js`  

### Chrome / Opera

```js
// ==UserScript==
// @name         [DEV] ČSFD Compare
// @match        *://*.csfd.cz/*
// @match        *://*.csfd.sk/*
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @require      file:///C:/PATH/TO/YOUR/REPO/dist/csfd-compare.user.js
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
})();
```

### Firefox

There has to be more steps for Firefox

1. Navigate to the `dist` folder where the `csfd-compare.user.js` file is located.
2. Run a local server in that directory. You can use Python's built-in HTTP server for this:
   - python: `python3 -m http.server 8080`
   - node: `npx http-server -p 8080`
3. Important: Open the Tampermonkey Dashboard, go to
   - Settings -> Externals -> Update Interval and set it to Always.
   - Otherwise, Tampermonkey will cache your code and your saves won't show up on refresh.
4. Create a new script in Tampermonkey and use the following header:

```js
// ==UserScript==
// @name         [DEV] ČSFD Compare
// @match        *://*.csfd.cz/*
// @match        *://*.csfd.sk/*
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @require      http://localhost:8080/csfd-compare.user.js
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
})();
```

## Build automatically with rollup in watch mode

```bash
npm run dev
```

Then, by saving any file in the `src` directory, the build will be automatically updated and the changes will be reflected in the browser (if you have the userscript installed and enabled).
