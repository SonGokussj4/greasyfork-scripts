// ==UserScript==
// @name         CSFD porovnání hodnocení
// @namespace    csfd.cz
// @version      0.3.1
// @description  Show your own ratings on other users ratings list
// @author       SonGokussj4
// @match        http://csfd.cz,https://csfd.cz
// @include      *csfd.cz/*
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// ==/UserScript==


// @updateURL   https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @downloadURL https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @supportURL  https://XXgithub.com/SonGokussj4/GitHub-userscripts/issues

// Aktuality (v0.3.4)
// Refresh button přemístěn do uživ. menu dolů
// Ovládací panel se otevírá po najetí myší, není třeba klikat

Glob = {
    popupCounter: 0,

    popup: function (htmlContent, timeout) {
        var id = Glob.popupCounter++;
        if (!timeout) {
            timeout = 3;
        }
        if (!htmlContent) {
            return;
        }
        var yOffset = 10;
        $("body").append(`
            <div class='SNPopup' id='SNPopup${id}'
                style='
                    border: 1px solid black;
                    border-radius:4px;
                    display:none;
                    padding:10px;
                    opacity:0.95;
                    background:#820001;
                    color:white;
                    position:absolute;
                    left:45%;
                    width:150px;
                    z-index:999;
                    top:${yOffset}px;
                    right:10px'
            >${htmlContent}</div>`);
        var $me = $(`#SNPopup${id}`);
        $me.slideDown(100);
        (function (id) {
            setTimeout(function () {
                $(`#SNPopup${id}`).slideUp(100);
            }, timeout * 1000);
        })(id);
    }
};


(() => {
    "use strict";
    /* globals jQuery, $, waitForKeyElements */

    // const delay = ms => new Promise(res => setTimeout(res, ms));
    const SCRIPTNAME = 'CSFD Compare';

    class Csfd {

        constructor(csfdPage) {
            this.csfdPage = csfdPage;
            this.stars = {};
            this.storageKey = undefined;
            this.userUrl = undefined;
            this.endPageNum = 0;

            // Ignore the ads... Make 'hodnoceni' table wider.
            $('.column.column-80').attr('class', '.column column-90');
        }

        REFRESH_RATINGS() {
            let hodnoceniUrl = `${this.userUrl}/hodnoceni`;
            console.log(`Going to page ${hodnoceniUrl} and loading ratings...`);
            // Empty LocalStorage
            this.stars = {};
            this.storageKey = "CsfdCompare_" + this.userUrl.split("/")[2].split("-")[1];
            console.log(`Accessing LC: ${this.storageKey}`);

            // Load user ratings...
            this.currentRequest = $.ajax({
                type: "GET",
                url: hodnoceniUrl,
                async: false
            });

            this.currentRequest.done((data) => {
                // Get how many pages will the script load
                let lastPageUrl = $(data).find('.box-content').find('.box-more-bar').find('.pagination')[0];
                console.log("lastPageUrl", lastPageUrl);
                let lastPageHref = $(lastPageUrl).find('a:nth-last-child(2)').attr('href');
                let foundMatch = lastPageHref.match(new RegExp("page=(.*)$"));
                if (foundMatch.length == 2) {
                    this.endPageNum = parseInt(foundMatch[1]);
                }
                console.log("this.endPageNum", this.endPageNum);
                this.loadPageDone(data);
            });

        }

        getCurrentUser() {
            console.log("fn getCurrentUser()");

            let loggedInUser = $('.profile.initialized').attr('href');
            if (loggedInUser.length == 1) {
                loggedInUser = loggedInUser[0];
            }
            console.log("loggedInUser:", loggedInUser);

            if (typeof loggedInUser === 'undefined') {
                console.log("Trying again...");

                // [OLD Firefox] workaround (the first returns undefined....?)
                loggedInUser = document.querySelectorAll('.profile')[0].getAttribute('href');
                console.log(`loggedInUser: ${loggedInUser}`);

                if (typeof loggedInUser === 'undefined') {
                    console.error(`${SCRIPTNAME}: Can't find logged in username...`);
                    throw (`${SCRIPTNAME}: exit`);  // TODO: Popup informing user
                }
            }
            return loggedInUser;
        }

        forceRefreshCurrentUserRatings() {
            this.refreshCurrentUserRatings();
        }

        getCurrentFilmUrl() {
            console.log("fn: getCurrentFilmUrl()");

            // Find "Diskuze" button and from it's a href extract /film/${URL}/diskuze
            let navItemHref = this.csfdPage.find('.tab-nav-item-9 > a').attr('href');
            // console.log("navItemHref:", navItemHref);

            let foundMatch = navItemHref.match(new RegExp("film/" + "(.*)" + "/diskuze"));
            // console.log("foundMatch:", foundMatch);
            if (foundMatch == null) {
                console.error("TODO: nenaslo to... vyhledat jinym zpusobem!");
                throw (`${SCRIPTNAME} Exiting...`);
            }

            let filmUrl = `/film/${foundMatch[1]}/`;
            return filmUrl;
        }

        updateInLocalStorage(ratingNum) {
            console.log("Checking if in LocalStorage...");

            // Check if film is in LocalStorage
            let filmUrl = this.getCurrentFilmUrl();
            console.log("filmUrl:", filmUrl);
            let item = this.stars[filmUrl];

            // Item not in LocalStorage, add it then!
            if (typeof item === 'undefined') {
                console.log(`Item not in LocalStorage, adding... ${filmUrl}: ${ratingNum}`);
                this.stars[filmUrl] = ratingNum;
                localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
                return true;
            }

            if (item != ratingNum) {
                console.log(`LocalStorage rating [${item}] != current rating [${ratingNum}], updating...`);
                this.stars[filmUrl] = ratingNum;
                localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
                return true;
            }

            console.log(`Rating same in LocalStorage, everything ok`);
            return true;
        }

        removeFromLocalStorage() {
            console.log("Deleting item from LocalStorage...");

            // Check if film is in LocalStorage
            let filmUrl = this.getCurrentFilmUrl();
            console.log("filmUrl:", filmUrl);
            let item = this.stars[filmUrl];

            // Item not in LocalStorage, everything is fine
            if (typeof item === 'undefined') {
                console.log("Item not in LocalStorage, nothing happens");
                return null;
            }

            // Item in LocalStorage, delete it from local dc
            delete this.stars[filmUrl];

            // And resave it to LocalStorage
            console.log("Resaving ratings into LocalStore");
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));

            return true;
        }

        checkLocalStorageRatings() {
            console.log("fun: checkLocalStorageRatings()");
            //TODO: Duplicitni, nejak to sloucit...
            console.log("LOADING RATINGS...");

            this.userUrl = this.getCurrentUser();
            console.log("this.userUrl:", this.userUrl);

            this.storageKey = "CsfdCompare_" + this.userUrl.split("/")[2].split("-")[1];
            console.log("this.storageKey", this.storageKey);

            // Try cache
            if (localStorage[this.storageKey]) {
                this.stars = JSON.parse(localStorage[this.storageKey]);
            }

            if (this.stars != {}) {
                return true;
            }

            return false;
            // // Cache does not exists...
            // if (Object.keys(this.stars).length == 0) {
            //     Glob.popup("Načítam hodnocení...");
            //     // TODO: Add floating pregress notification {loading... 354/2049}
            //     this.refresh();
            // }

        }

        getCurrentFilmRating() {
            let $currentUserRating = this.csfdPage.find('.current-user-rating .stars');

            // Exit if no user rating found
            if ($currentUserRating.length == 0) {
                return null;
            }

            // Ignore 'computed' ratings (exit)
            if ($currentUserRating.parent().hasClass('computed')) {
                console.log("Smula, computed....");
                return null;
            }

            // Find the rating
            for (let num = 0; num <= 5; num++) {
                if ($currentUserRating.hasClass(`stars-${num}`)) {
                    return num;
                }
            }

            // If not numeric rating, return 0 (Odpad!)
            if ($currentUserRating.find('.trash').length > 0) {
                return 0;
            }
        }

        refreshCurrentUserRatings() {
            console.log("fun: refreshCurrentUserRating()");
            console.log("LOADING RATINGS...");

            this.userUrl = this.getCurrentUser();
            console.log("this.userUrl:", this.userUrl);

            this.storageKey = "CsfdCompare_" + this.userUrl.split("/")[2].split("-")[1];
            console.log("this.storageKey", this.storageKey);

            // Try cache
            if (localStorage[this.storageKey]) {
                this.stars = JSON.parse(localStorage[this.storageKey]);
            }

            // Cache does not exists...
            if (Object.keys(this.stars).length == 0) {
                // TODO: vyresit, pridat tlacitko, upozorneni float
                Glob.popup("Načítam hodnocení. Bude trvat déle... Vyčkejte (trpělivě) na další informace....", 5);
                console.log("CACHE NOT EXISTING MAN.... LOAD???");

                // TODO: Add floating pregress notification {loading... 354/2049}
                this.refresh();
            }
            // Cache exists
            else {
                if (!location.href.includes(this.userUrl)) {

                    // TODO: Check if {goto users hodnoceni, see MAX page * 50, check length, if less, propose update}
                    this.addRatingsColumn();
                }
            }
        }

        refresh() {
            let url = this.userUrl + "hodnoceni/";
            console.log(`REFRESHING... ${url}`);
            this.loadHodnoceniPage(url);

        }

        exportRatings() {
            console.log("Settings this.stars --> localStorage");
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
        }

        importRatings() {
            if (localStorage[this.storageKey]) {
                this.stars = JSON.parse(localStorage[this.storageKey]);
            }
        }

        loadHodnoceniPage(url) {
            console.log(`LOADING URL... ${url}`);
            let foundMatch = url.match(new RegExp("page=(.*)$"));
            let currentNum;
            if (foundMatch.length == 2) {
                currentNum = foundMatch[1];
            }
            else {
                currentNum = 1;
            }
            // let currentNum = foundMatch[1];
            Glob.popup(`${SCRIPTNAME} - Nacitam stranku... ${currentNum}/${this.endPageNum}`);
            this.currentRequest = $.ajax({
                type: "GET",
                url: url,
                async: true
            });

            this.currentRequest.done((data) => {
                this.loadPageDone(data);
            });
        }

        loadPageDone(hodnoceniHTML) {
            if (!hodnoceniHTML) {
                return;
            }

            var $stars = this.stars;
            $(hodnoceniHTML).find("tbody tr").each(function () {
                var $row = $(this);
                var filmURL = $("a.film-title-name", $row).attr("href");
                var $rating = $("span .stars", $row);

                let starsRating = 0;
                for (let stars = 0; stars <= 5; stars++) {
                    if ($rating.hasClass('stars-' + stars)) {
                        starsRating = stars;
                    }
                }

                $stars[filmURL] = starsRating;
            });

            let nextPaginationURL = $(hodnoceniHTML).find("a.page-next").attr("href");

            if (nextPaginationURL) {
                // Next page exists, get it and repeat this function, add new ratins to `this.stars`
                this.loadHodnoceniPage(nextPaginationURL);
            } else {
                // No next page, finish...
                this.finishRefresh();
            }
        }

        addRatingsColumn() {
            let $page = this.csfdPage;

            let $tbl = $page.find('#snippet--ratings table tbody');
            let starsDict = this.stars;

            $tbl.find('tr').each(function () {
                let $row = $(this);
                let url = $($row).find('.name').find('a').attr('href');
                let ratingNum = starsDict[url];

                let $span = "";
                if (ratingNum == 0) {
                    $span = `<span class="stars trash">odpad!</span>`;
                }
                else {
                    $span = `<span class="stars stars-${ratingNum}"></span>`;
                }

                $row.find('td:nth-child(2)').after(`
                    <td class="star-rating-only">
                        <span class="star-rating">
                            ${$span}
                        </span>
                    </td>
                `);
            });
        }

        finishRefresh() {
            this.exportRatings();
            console.log("Hotovo, hodnocení načteno");
            Glob.popup(`Vaše hodnocení byla načtena.`);

            if (!location.href.includes(this.userUrl)) {
                this.addRatingsColumn();
            }
        }

        finishRefresh2() {
            this.exportRatings();
            Glob.popup(`Vaše hodnocení byla načtena.`);
        }

        createRefreshButton() {
            // TODO: CSS style to fix it to middle right and with ... icon?
            console.log("fn: createRefreshButton()");

            let button = document.createElement("button");
            button.innerHTML = `<span style="text-transform: initial;">CSFD-Compare reload</span>`;
            button.className = "csfd-compare-reload";
            // button.setAttribute("style", "margin-top: 3px; margin-left: 20px; align: right; font-size: 0.7em;");

            let menu = document.getElementsByClassName("main-menu")[0];
            menu.insertBefore(button, menu.lastChild);

            $(button).on("click", function () {
                let csfd = new Csfd($('div.page-content'));
                csfd.userUrl = csfd.getCurrentUser();
                csfd.REFRESH_RATINGS();
            });
        }

        openControlPanelOnHover() {
            let btn = $('.button-control-panel');
            let panel = $('#dropdown-control-panel');

            $(btn).on('hover mouseover', function () {
                if (!panel.hasClass('active')) {
                    panel.addClass('active');
                }
            });

            $(panel).on('hover mouseover', function () {
                if (!panel.hasClass('active')) {
                    panel.addClass('active');
                }
            });

            $(panel).on('mouseleave', function () {
                if (panel.hasClass('active')) {
                    // setTimeout(function () {
                    panel.removeClass('active');
                    // }, 500);
                }
            });

            $(btn).on('mouseleave', function () {
                if (panel.hasClass('active')) {
                    // setTimeout(function () {
                    panel.removeClass('active');
                    // }, 500);
                }
            });
        }

    }

    // SCRIPT START
    let csfd = new Csfd($('div.page-content'));

    csfd.userUrl = csfd.getCurrentUser();
    if (csfd.userUrl !== undefined) {

        csfd.openControlPanelOnHover();
        csfd.createRefreshButton();

        let ratingsLoaded = csfd.checkLocalStorageRatings();
        if (ratingsLoaded != true) {
            csfd.REFRESH_RATINGS();
        }
        // csfd.SHOW_COLUMN();
        // csfd.addRatingsColumn();
    }

    if (location.href.includes('/film/')) {
        // console.log("Jsem na filmu...");
        csfd.checkLocalStorageRatings();
        let currentRatingNum = csfd.getCurrentFilmRating();
        if (currentRatingNum == null) {
            // Check if record exists, if yes, remove it
            csfd.removeFromLocalStorage();
            return;
        }
        // Check if current page rating corresponds with that in LocalStorage, if not, update it
        csfd.updateInLocalStorage(currentRatingNum);
    }
    else if (location.href.includes('/uzivatel/')) {
        // csfd.forceRefreshCurrentUserRatings();
        csfd.refreshCurrentUserRatings();
    }

})();
