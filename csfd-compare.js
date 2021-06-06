// ==UserScript==
// @name         CSFD porovnání hodnocení
// @namespace    csfd.cz
// @version      0.3.4.2
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

// Aktuality (v0.3.4.2)
// Oprava zjištění názvu série (předtím fungovalo jen pro filmy)

Glob = {
    popupCounter: 0,

    popup: function (htmlContent, timeout = 3, width = 150) {
        var id = Glob.popupCounter++;
        if (!htmlContent) {
            return;
        }
        var yOffset = 10;
        $(".header-search").append(`
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
                    width:${width}px;
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



(async () => {
    "use strict";
    /* globals jQuery, $, waitForKeyElements */
    /* jshint -W069 */

    // const delay = ms => new Promise(res => setTimeout(res, ms));
    const SCRIPTNAME = 'CSFD Compare';

    class Csfd {

        constructor(csfdPage) {
            this.csfdPage = csfdPage;
            this.stars = {};
            this.storageKey = undefined;
            this.userUrl = undefined;
            this.endPageNum = 0;
            this.userRatingsCount = 0;
            this.userRatingsUrl = undefined;
            this.localStorageRatingsCount = 0;

            // Ignore the ads... Make 'hodnoceni' table wider.
            $('.column.column-80').attr('class', '.column column-90');
        }

        getEndPageNum(data) {
            console.log("fn: getEndPageNum()");
            let $pagination = $(data).find('.box-content').find('.box-more-bar').find('.pagination')[0];
            let lastPageHref = $($pagination).find('a:nth-last-child(2)').attr('href');
                let foundMatch = lastPageHref.match(new RegExp("page=(.*)$"));

            let endPageNum = 0;
                if (foundMatch.length == 2) {
                endPageNum = parseInt(foundMatch[1]);
                }
            console.log("  return:", endPageNum);
            return endPageNum;
        }

        getCurrentUser() {
            console.log("fn getCurrentUser()");

            let loggedInUser = $('.profile.initialized').attr('href');
            if (typeof loggedInUser !== 'undefined') {
            if (loggedInUser.length == 1) {
                loggedInUser = loggedInUser[0];
            }
            }
            console.log("loggedInUser:", loggedInUser);

            if (typeof loggedInUser === 'undefined') {
                console.log("Trying again...");

                // [OLD Firefox] workaround (the first returns undefined....?)
                let profile = document.querySelectorAll('.profile');
                if (profile.length == 0) {
                    return undefined;
                }
                loggedInUser = profile[0].getAttribute('href');
                console.log(`loggedInUser: ${loggedInUser}`);

                if (typeof loggedInUser === 'undefined') {
                    console.error(`${SCRIPTNAME}: Can't find logged in username...`);
                    throw (`${SCRIPTNAME}: exit`);  // TODO: Popup informing user
                }
            }
            return loggedInUser;
        }

        getStars() {
            if (localStorage[this.storageKey]) {
                let stars = JSON.parse(localStorage[this.storageKey]);
                return stars;
            }
            else {
                return {};
            }
        }

        getCurrentFilmUrl() {
            console.log("fn: getCurrentFilmUrl()");

            // Find "Diskuze" button and from it's a href extract /film/${URL}/diskuze
            let foundMatch = $('a[href$="/diskuze/"]:first').attr('href');
            foundMatch = foundMatch.match(new RegExp("film/" + "(.*)" + "/diskuze"));
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
            console.log("fn: removeFromLocalStorage()");
            console.log("  Deleting item from LocalStorage...");

            // Check if film is in LocalStorage
            let filmUrl = this.getCurrentFilmUrl();
            let item = this.stars[filmUrl];

            // Item not in LocalStorage, everything is fine
            if (typeof item === 'undefined') {
                console.log("  Item not in LocalStorage, nothing happens");
                return null;
            }

            // Item in LocalStorage, delete it from local dc
            delete this.stars[filmUrl];

            // And resave it to LocalStorage
            console.log("  Resaving ratings into LocalStore");
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


        refresh() {
            let url = this.userUrl + "hodnoceni/";
            console.log(`REFRESHING... ${url}`);
            this.loadHodnoceniPage(url);

        }

        getCurrentUserRatingsCount() {
            console.log(`fn: getCurrentUserRatingsCount()`);
            let count = 0;
            let request = $.ajax({
                type: "GET",
                url: this.userRatingsUrl,
                async: false
            });
            request.done((data) => {
                // Get ratings: '(2 403)'
                let $countSpan = $(data).find('span.count');
                console.log(`  $countSpan: ${$countSpan}`);
                if ($countSpan.length == 1) {
                    // Strip it '(2 403)' --> '2403'
                    count = $countSpan[0].innerText.replace('(', '').replace(')', '').replace(/ +/g, '').replace(/\xA0/g, '');
                    count = parseInt(count);
                }
            });
            console.log(`  Returning count: ${count}`);
            return count;
        }

        getLocalStorageRatingsCount() {
            console.log(`fn: getLocalStorageRatingsCount()`);
            // this.storageKey = "CsfdCompare_" + this.userUrl.split("/")[2].split("-")[1];
            console.log("  this.storageKey:", this.storageKey);
            if (localStorage[this.storageKey]) {
                let stars = JSON.parse(localStorage[this.storageKey]);
                let count = Object.keys(stars).length;
                console.log("  return:", count);
                return count;
            }
            return 0;

        }

        onOtherUserHodnoceniPage() {
            if (location.href.includes('/hodnoceni') && location.href.includes('/uzivatel/')) {
                if (!location.href.includes(this.userUrl)) {
                    return true;
                }
            }
            return false;
        }

        exportRatings() {
            console.log(`fn: exportRatings()`);
            console.log("  this.storageKey:", this.storageKey);
            // console.log("JSON.stringify(this.stars):", JSON.stringify(this.stars));
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
            if (this.onOtherUserHodnoceniPage()) {
                this.addRatingsColumn();
            }
        }

        importRatings() {
            console.log(`fn: importRatings()`);
            if (localStorage[this.storageKey]) {
                this.stars = JSON.parse(localStorage[this.storageKey]);
            }
        }

        async REFRESH_RATINGS() {
            // Load user ratings...
            let $this = this;
            return new Promise((resolve, reject) => {
                console.log("fn: REFRESH_RATINGS()");
                console.log(`  Getting data from: '${$this.userRatingsUrl}'...`);
                $.ajax({
                type: "GET",
                    url: $this.userRatingsUrl,
                async: true
                }).done((data) => {
                    // Get how many pages will the script load
                    $this.endPageNum = $this.getEndPageNum(data);
                    console.log("  $this.endPageNum:", $this.endPageNum);
                    this.processRatingsPage(data);
                    resolve();
            });
            });
        }

        async processRatingsPage(dataHTML) {
            if (!dataHTML) {
                return;
            }

            var $stars = this.stars;
            $(dataHTML).find("tbody tr").each(function () {
                var $row = $(this);
                var filmURL = $("a.film-title-name", $row).attr("href");
                var $rating = $("span .stars", $row);

                let starsRating = 0;
                for (let stars = 0; stars <= 5; stars++) {
                    if ($rating.hasClass('stars-' + stars)) {
                        starsRating = stars;
                    }
                }
                // Add to dict
                $stars[filmURL] = starsRating;
            });

            // Check if there is next page
            let nextPaginationURL = $(dataHTML).find("a.page-next").attr("href");
            if (nextPaginationURL) {
                // Next page exists, fetch it and repeat this function, add new ratings to `this.stars`
                await this.loadPage(nextPaginationURL);
            } else {
                // No next page, finish...
                this.finishRefresh();
            }
        }

        async loadPage(url) {
            console.log(`fn: loadPage(${url})`);
            return new Promise((resolve, reject) => {
                let foundMatch = url.match(new RegExp("page=(.*)$"));

                let currentNum = 1;
                if (foundMatch.length == 2) {
                    currentNum = foundMatch[1];
                }

                Glob.popup(`${SCRIPTNAME} - Nacitam... ${currentNum}/${this.endPageNum}`);

                $.ajax({
                    type: "GET",
                    url: url,
                    async: true
                }).done((data) => {
                    this.processRatingsPage(data);
                    resolve();
                });
            });
        }

        finishRefresh() {
            console.log("fn: finishRefresh()");
            this.exportRatings();
            console.log("  Hotovo, hodnocení načteno");
            Glob.popup(`Vaše hodnocení byla načtena.`);
        }

        addRatingsColumn() {
            console.log("fn: addRatingsColumn()");
            let $page = this.csfdPage;

            let $tbl = $page.find('#snippet--ratings table tbody');
            let starsDict = this.getStars();

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

        createRefreshButton() {
            let button = document.createElement("button");
            button.innerHTML = `<span style="text-transform: initial;">CSFD-Compare reload<br>${this.localStorageRatingsCount}/${this.userRatingsCount}</span>`;
            button.className = "csfd-compare-reload";
            // button.setAttribute("style", "margin-top: 3px; margin-left: 20px; align: right; font-size: 0.7em;");

            // Add at the end of the user main-menu
            let menu = document.getElementsByClassName("main-menu")[0];
            menu.insertBefore(button, menu.lastChild);

            // Add event to refresh all rating into LocalStorage on click
            $(button).on("click", function () {
                let csfd = new Csfd($('div.page-content'));
                csfd.userUrl = csfd.getCurrentUser();
                csfd.userRatingsUrl = `${csfd.userUrl}/hodnoceni`;
                csfd.storageKey = `${SCRIPTNAME}_${csfd.userUrl.split("/")[2].split("-")[1]}`;
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

        hideControlPanel() {
            let btn = $('.button-control-panel');
            btn.addClass('hidden');
        }
    }


    // SCRIPT START
    let csfd = new Csfd($('div.page-content'));

    csfd.userUrl = csfd.getCurrentUser();

    // Either logged in or not, do this...


    // If not logged in, hide control panel
    if (csfd.userUrl === undefined) {
        csfd.hideControlPanel();
    }

    // If logged in, do some stuff
    if (csfd.userUrl !== undefined) {

        csfd.storageKey = `${SCRIPTNAME}_${csfd.userUrl.split("/")[2].split("-")[1]}`;
        csfd.userRatingsUrl = `${csfd.userUrl}/hodnoceni`;
        csfd.stars = csfd.getStars();

        // console.log("BEFORE:", csfd.RESULT);
        // await csfd.getAllPages();
        // console.log("AFTER:", Object.keys(csfd.RESULT).length);

        if (location.href.includes('/film/')) {
            let currentFilmRating = csfd.getCurrentFilmRating();
            console.log("currentFilmRating:", currentFilmRating);
            if (currentFilmRating == null) {
                // Check if record exists, if yes, remove it
                csfd.removeFromLocalStorage();
            } else {
                // Check if current page rating corresponds with that in LocalStorage, if not, update it
                csfd.updateInLocalStorage(csfd.getCurrentFilmRating());
            }
        }

        console.log("START... csfd.getCurrentUserRatingsCount()");
        csfd.userRatingsCount = csfd.getCurrentUserRatingsCount();
        console.log("userRatingsCount:", csfd.userRatingsCount);
        console.log("END... csfd.getCurrentUserRatingsCount()");

        console.log("START... csfd.getLocalStorageRatingsCount()");
        csfd.localStorageRatingsCount = csfd.getLocalStorageRatingsCount();
        console.log("csfd.localStorageRatingsCount:", csfd.localStorageRatingsCount);
        console.log("END... csfd.getLocalStorageRatingsCount()");

        console.log("START... csfd.openControlPanelOnHover()");
        csfd.openControlPanelOnHover();
        console.log("END... csfd.openControlPanelOnHover()");

        console.log("START... csfd.createRefreshButton()");
        csfd.createRefreshButton();
        console.log("END... csfd.createRefreshButton()");

        // Show user that his 'user ratings' and 'local storage ratings' are not the same and he should refresh
        let ratingsCountOk = csfd.userRatingsCount == csfd.localStorageRatingsCount;
        console.log("ratingsCountOk:", ratingsCountOk);

        if (!ratingsCountOk) {
            console.warn(`Current ${csfd.userRatingsCount} != LocalStorage ${csfd.localStorageRatingsCount}.`);
            Glob.popup(`
                ${SCRIPTNAME}: Je třeba obnovit hodnocení<br>
                - váš počet: ${csfd.userRatingsCount}<br>
                - uloženo v prohlížeči: ${csfd.localStorageRatingsCount}<br>
                <b>Nastavení uživatele --> CSFD-Compare reload</b>`, 8, 310);
    }

        console.log("CONTINUING AFTER REFRESH...............");

        console.log("ratingsCountOk:", ratingsCountOk);
        if (ratingsCountOk) {
            // Show user ratings on any other user but mine
            if (csfd.onOtherUserHodnoceniPage()) {
                csfd.addRatingsColumn();
            }
        }
    }

})();
