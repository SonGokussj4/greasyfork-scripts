// ==UserScript==
// @name         CSFD porovnání hodnocení
// @namespace    csfd.cz
// @version      0.5.12
// @description  Show your own ratings on other users ratings list
// @author       SonGokussj4
// @license      GNU GPLv3
// @match        http://csfd.cz,https://csfd.cz
// @include      *csfd.cz/*
// @include      *csfd.sk/*
// @icon         https://static.pmgstatic.com/assets/images/60b418342fe799ef59c3c6fa1c73c2ff/apple-touch-icon.png
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @run-at       document-start
// ==/UserScript==


// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @updateURL    https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @downloadURL  https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @supportURL   https://XXgithub.com/SonGokussj4/GitHub-userscripts/issues
// @run-at document-start


async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function isLoggedIn() {
    // console.log("isLoggedIn() start");

    const status = $('a[href$="/odhlasit/"]').length;
    // console.log("isLoggedIn() status: " + status);

    // If status is 0, wait 100ms and try again, max 10 tries
    if (status === 0) {
        await sleep(50);
        return isLoggedIn();
    }

    // console.log("isLoggedIn() end");
    return true;
}

async function getUsername() {
    const username = $(".dropdown-content.main-menu li:first-child a")[0].text;
    return username;
}

(async function() {
    "use strict";
    /* globals jQuery, $, waitForKeyElements */
    /* jshint -W069 */
    /* jshint -W083 */
    /* jshint -W075 */

    const DEBUG = true;
    const DEBUG_LOG = (...args) => {
        if (DEBUG) {
            console.log(...args);
        }
    }

    console.debug("CSFD porovnání hodnocení");
    console.info("CSFD porovnání hodnocení");
    console.log("VALUES: ", GM_info);
    console.log("VALUES: ", GM_listValues());
    await GM_setValue("timezoneOffset", new Date().getTimezoneOffset());
    console.log(await GM_getValue("timezoneOffset", 0));
    const loggedin = await isLoggedIn();
    console.debug("loggedin: ", loggedin);
    const username = await getUsername();
    console.debug("username: ", username);


})();
