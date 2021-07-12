// ==UserScript==
// @name         InstaMax
// @namespace    instagram.com
// @version      0.1
// @description  Hmm
// @author       SonGokussj4
// @match        https://www.instagram.com/*
// @grant        none
// ==/UserScript==


// @updateURL   https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @downloadURL https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @supportURL  https://XXgithub.com/SonGokussj4/GitHub-userscripts/issues


// @require      http://code.jquery.com/jquery-3.4.1.min.js
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @include      *csfd.cz/uzivatel/*


(function () {
    'use strict';
    setTimeout(() => {
        var elems = getImageElements();
        console.log("Hmm", elems);
        for (const element of elems) {
            var tag = document.createElement("a");
            tag.href = element.querySelector("a[href^='/p']").href + 'media?size=l';
            var text = document.createTextNode("MAX");
            tag.appendChild(text);
            element.prepend(tag);
        }

    }, 1000);

    // var links = document.querySelectorAll("a[href^='/p/']");
    // var links = document.getElementsByClassName("KL4Bh");

    function getImageElements() {
        // var links = document.getElementsByClassName("KL4Bh");  // image
        var links = document.getElementsByClassName("kIKUG");
        // console.log("links", links);
        return links;
    }
})();



