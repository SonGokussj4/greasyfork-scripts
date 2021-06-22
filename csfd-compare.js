// ==UserScript==
// @name         CSFD porovnání hodnocení
// @namespace    csfd.cz
// @version      0.4.3
// @description  Show your own ratings on other users ratings list
// @author       SonGokussj4
// @match        http://csfd.cz,https://csfd.cz
// @include      *csfd.cz/*
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// ==/UserScript==


// @include      *csfd.cz/uzivatel/*/hodnoceni*
// @updateURL    https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @downloadURL  https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @supportURL   https://XXgithub.com/SonGokussj4/GitHub-userscripts/issues


const SETTINGSNAME = 'CSFD-Compare-settings';
const VERSION = '<a id="script-version" href="https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare">v0.4.3</a>';

let Glob = {
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

let defaultSettings = {
    displayMessageButton: true,
    displayFavoriteButton: true,
    hideUserControlPanel: true,
    showControlPanelOnHover: true,
    // removeRegistrationPanel: true,
    removeContestPanel: false,
    removeCsfdCinemaPanel: false,
    removeVideoPanel: false,
    removeMoviesOfferPanel: false,
    clickableHeaderBoxes: true,
    clickableMessages: true,
    compareUserRatings: true,
    hideSelectedUserReviews: false,
    hideSelectedUserReviewsList: [],
};

async function getSettings() {
    if (!localStorage[SETTINGSNAME]) {
        localStorage.setItem(SETTINGSNAME, JSON.stringify(defaultSettings));
        return defaultSettings;
    } else {
        return JSON.parse(localStorage[SETTINGSNAME]);
    }
}

function refreshTooltips() {
    try {
        tippy('[data-tippy-content]', {
            // interactive: true,
            popperOptions: { modifiers: { computeStyle: { gpuAcceleration: false } } }
        });
    } catch (err) {
        console.log("Error: refreshTooltips():", err);
    }
}

// new MutationObserver(function (mutations) {
//     // check at least two H1 exist using the extremely fast getElementsByTagName
//     // which is faster than enumerating all the added nodes in mutations
//     let btn = $('.button-control-panel');
//     btn.addClass('hidden');
//     // if (document.getElementsByTagName('h1')[1]) {
//     //     var ibmlogo = document.querySelectorAll('h1.logo.floatLeft')[1];
//     //     if (ibmlogo) {
//     //         ibmlogo.remove();
//     //         this.disconnect(); // disconnect the observer
//     //     }
//     // }
// }).observe(document, { childList: true, subtree: true });
// // the above observes added/removed nodes on all descendants recursively


(async () => {
    "use strict";
    /* globals jQuery, $, waitForKeyElements */
    /* jshint -W069 */
    /* jshint -W083 */

    const SCRIPTNAME = 'CSFD-Compare';


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
            this.settings = undefined;

            this.RESULT = {};

            // Ignore the ads... Make 'hodnoceni' table wider.
            // TODO: Toto do hodnoceni!
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
            return endPageNum;
        }

        async isLoggedIn() {
            return $('.profile.initialized').length > 0;
        }

        getCurrentUser() {
            let loggedInUser = $('.profile.initialized').attr('href');
            console.log(loggedInUser.length);
            if (loggedInUser !== undefined) {
                if (loggedInUser.length == 1) {
                    loggedInUser = loggedInUser[0];
                }
            }

            if (typeof loggedInUser === 'undefined') {
                console.log("Trying again...");

                // [OLD Firefox] workaround (the first returns undefined....?)
                let profile = document.querySelectorAll('.profile');
                if (profile.length == 0) {
                    return undefined;
                }
                loggedInUser = profile[0].getAttribute('href');

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
            } else {
                return {};
            }
        }

        getCurrentFilmUrl() {
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
            // Check if film is in LocalStorage
            let filmUrl = this.getCurrentFilmUrl();
            let item = this.stars[filmUrl];

            // Item not in LocalStorage, add it then!
            if (typeof item === 'undefined') {
                // Item not in LocalStorage, add
                this.stars[filmUrl] = ratingNum;
                localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
                return true;
            }

            if (item !== ratingNum) {
                // LocalStorage rating != current rating, update
                this.stars[filmUrl] = ratingNum;
                localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
                return true;
            }

            return true;
        }

        removeFromLocalStorage() {

            // Check if film is in LocalStorage
            let filmUrl = this.getCurrentFilmUrl();
            let item = this.stars[filmUrl];

            // Item not in LocalStorage, everything is fine
            if (typeof item === 'undefined') {
                return null;
            }

            // Item in LocalStorage, delete it from local dc
            delete this.stars[filmUrl];

            // And resave it to LocalStorage
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));

            return true;
        }

        getCurrentFilmRating() {
            let $currentUserRating = this.csfdPage.find('.current-user-rating .stars');

            // Exit if no user rating found
            if ($currentUserRating.length == 0) {
                return null;
            }

            // Ignore 'computed' ratings - black stars (exit)
            if ($currentUserRating.parent().hasClass('computed')) {
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

        getCurrentUserRatingsCount() {
            let count = 0;
            let request = $.ajax({
                type: "GET",
                url: this.userRatingsUrl,
                async: false
            }).done((data) => {
                // Get ratings: '(2 403)'
                let $countSpan = $(data).find('span.count');
                if ($countSpan.length == 1) {
                    // Strip it '(2 403)' --> '2403'  // TODO: new Regex(/\s/g)?
                    count = $countSpan[0].innerText
                        .replace('(', '')
                        .replace(')', '')
                        .replace(/ +/g, '')  // any number of spaces
                        .replace(/\xA0/g, '');  // weird space thingie...
                    count = parseInt(count);
                }
            });
            return count;
        }

        async fillMissingSettingsKeys() {
            let settings = await getSettings();

            let currentKeys = Object.keys(settings);
            let defaultKeys = Object.keys(defaultSettings);
            for (const defaultKey of defaultKeys) {
                let exists = currentKeys.includes(defaultKey);
                if (!exists) {
                    settings[defaultKey] = defaultSettings[defaultKey];
                }
            }
            localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
        }

        async loadInitialSettings() {
            // GLOBAL
            // $('#chkRemoveRegistrationPanel').attr('checked', settings.removeRegistrationPanel);
            $('#chkRemoveContestPanel').attr('checked', settings.removeContestPanel);
            $('#chkRemoveCsfdCinemaPanel').attr('checked', settings.removeCsfdCinemaPanel);
            $('#chkRemoveVideoPanel').attr('checked', settings.removeVideoPanel);
            $('#chkRemoveMoviesOfferPanel').attr('checked', settings.removeMoviesOfferPanel);
            $('#chkControlPanelOnHover').attr('checked', settings.showControlPanelOnHover);
            $('#chkClickableHeaderBoxes').attr('checked', settings.clickableHeaderBoxes);
            $('#chkClickableMessages').attr('checked', settings.clickableMessages);

            // USER
            $('#chkDisplayMessageButton').attr('checked', settings.displayMessageButton);
            $('#chkDisplayFavoriteButton').attr('checked', settings.displayFavoriteButton);
            $('#chkHideUserControlPanel').attr('checked', settings.hideUserControlPanel);

            // FILM/SERIES
            $('#chkCompareUserRatings').attr('checked', settings.compareUserRatings);
            $('#chkHideSelectedUserReviews').attr('checked', settings.hideSelectedUserReviews);
            if (settings.hideSelectedUserReviews === false) { $('#txtHideSelectedUserReviews').parent().hide(); }
            if (settings.hideSelectedUserReviewsList !== undefined) { $('#txtHideSelectedUserReviews').val(settings.hideSelectedUserReviewsList.join(', ')); }

        }

        async addSettingsEvents() {
            // GLOBAL
            // $('#chkRemoveRegistrationPanel').change(function () {
            //     settings.removeRegistrationPanel = this.checked;
            //     localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
            //     Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            // });
            $('#chkRemoveContestPanel').change(function () {
                settings.removeContestPanel = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkRemoveCsfdCinemaPanel').change(function () {
                settings.removeCsfdCinemaPanel = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkRemoveVideoPanel').change(function () {
                settings.removeVideoPanel = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkRemoveMoviesOfferPanel').change(function () {
                settings.removeMoviesOfferPanel = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkControlPanelOnHover').change(function () {
                settings.showControlPanelOnHover = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkClickableHeaderBoxes').change(function () {
                settings.clickableHeaderBoxes = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkClickableMessages').change(function () {
                settings.clickableMessages = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            // USER
            $('#chkDisplayMessageButton').change(function () {
                settings.displayMessageButton = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkDisplayFavoriteButton').change(function () {
                settings.displayFavoriteButton = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkHideUserControlPanel').change(function () {
                settings.hideUserControlPanel = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            // FILM/SERIES
            $('#chkCompareUserRatings').change(function () {
                settings.compareUserRatings = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkHideSelectedUserReviews').change(function () {
                settings.hideSelectedUserReviews = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
                $('#txtHideSelectedUserReviews').parent().toggle();
            });

            $('#txtHideSelectedUserReviews').change(function () {
                let ignoredUsers = this.value.replace(/\s/g, '').split(",");
                settings.hideSelectedUserReviewsList = ignoredUsers;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup(`Ignorovaní uživatelé:\n${ignoredUsers.join(', ')}`, 4);
            });
        }

        getLocalStorageRatingsCount() {
            if (localStorage[this.storageKey]) {
                let stars = JSON.parse(localStorage[this.storageKey]);
                let count = Object.keys(stars).length;
                return count;
            }
            return 0;

        }

        onOtherUserHodnoceniPage() {
            if ((location.href.includes('/hodnoceni') || location.href.includes('/hodnotenia')) && location.href.includes('/uzivatel/')) {
                if (!location.href.includes(this.userUrl)) {
                    return true;
                }
            }
            return false;
        }

        exportRatings() {
            // console.log("JSON.stringify(this.stars):", JSON.stringify(this.stars));
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
            if (this.onOtherUserHodnoceniPage()) {
                this.addRatingsColumn();
            }
        }

        importRatings() {
            if (localStorage[this.storageKey]) {
                this.stars = JSON.parse(localStorage[this.storageKey]);
            }
        }

        async REFRESH_RATINGS() {
            // Load user ratings...
            let $this = this;
            return new Promise((resolve, reject) => {
                $.ajax({
                    type: "GET",
                    url: $this.userRatingsUrl,
                    async: true
                }).done((data) => {
                    // Get how many pages will the script load
                    $this.endPageNum = $this.getEndPageNum(data);
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
            this.exportRatings();
            Glob.popup(`Vaše hodnocení byla načtena.`);
        }

        addRatingsColumn() {
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
                } else {
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
                    panel.removeClass('active');
                }
            });

            $(btn).on('mouseleave', function () {
                if (panel.hasClass('active')) {
                    panel.removeClass('active');
                }
            });
        }

        addWarningToUserProfile() {
            $(".profile.initialized").append(`
                <div class='counter'>
                    <span><b>!</b></span>
                </div>
            `);
            this.createRefreshButton();
        }

        createRefreshButton() {
            let button = document.createElement("button");
            button.setAttribute("style", "text-transform: initial; font-size: 0.9em; padding: 5px; border: 4px solid whitesmoke;");
            button.className = "csfd-compare-reload";
            button.innerHTML = `
                        <center>
                                CSFD-Compare<br>
                                Uložené: [${csfd.localStorageRatingsCount}] != Celkem: [${csfd.userRatingsCount}]</br>
                                <hr>
                    <b> >>> Načíst hodnocení <<< </b>
                                <hr>
                        </center>
            `;
            $(".dropdown-content.main-menu > ul:first").prepend(button);

            $(button).on("click", function () {
                let csfd = new Csfd($('div.page-content'));
                csfd.userUrl = csfd.getCurrentUser();
                csfd.userRatingsUrl = `${csfd.userUrl}/hodnoceni`;
                if (location.origin.endsWith('sk')) { csfd.userRatingsUrl = `${csfd.userUrl}/hodnotenia`; }
                csfd.storageKey = `${SCRIPTNAME}_${csfd.userUrl.split("/")[2].split("-")[1]}`;
                csfd.REFRESH_RATINGS();
            });
        }

        displayMessageButton() {
            let userHref = $('#dropdown-control-panel li a.ajax').attr('href');
            if (userHref === undefined) {
                console.log("fn displayMessageButton(): can't find user href, exiting function...");
                return;
            }

            let button = document.createElement("button");
            button.setAttribute("data-tippy-content", $('#dropdown-control-panel li a.ajax')[0].text);
            button.setAttribute("style", "float: right; border-radius: 5px;");
            button.innerHTML = `
                <a class="ajax"
                    rel="contentModal"
                    data-mfp-src="#panelModal"
                    href="${userHref}"><i class="icon icon-messages"></i></a>
            `;
            $(".user-profile-content > h1").append(button);
        }

        displayFavoriteButton() {
            let favoriteButton = $('#snippet--menuFavorite > a');
            if (favoriteButton.length !== 1) {
                console.log("fn displayFavoriteButton(): can't find user href, exiting function...");
                return;
            }
            let tooltipText = favoriteButton[0].text;
            let addRemoveIndicator = "+";
            if (tooltipText.includes("Odebrat") || tooltipText.includes("Odobrať")) {
                addRemoveIndicator = "-";
            }

            let button = document.createElement("button");
            button.setAttribute("style", "float: right; border-radius: 5px; margin: 0px 5px;");
            button.setAttribute("data-tippy-content", tooltipText);
            button.innerHTML = `
                <a class="ajax"
                    rel="contentModal"
                    data-mfp-src="#panelModal"
                    href="${favoriteButton.attr('href')}">
                        <span id="add-remove-indicator" style="font-size: 1.5em; color: white;">${addRemoveIndicator}</span>
                        <i class="icon icon-favorites"></i>
                </a>
            `;
            $(".user-profile-content > h1").append(button);

            $(button).on('click', function () {
                if (addRemoveIndicator == "+") {
                    $('#add-remove-indicator')[0].innerText = '-';
                    button._tippy.setContent("Odebrat z oblíbených");
                } else {
                    $('#add-remove-indicator')[0].innerText = '+';
                    button._tippy.setContent("Přidat do oblíbených");
                }
                refreshTooltips();
            });
        }

        hideUserControlPanel() {
            let panel = $('.button-control-panel:not(.small)');
            if (panel.length !== 1) { return; }
            panel.hide();
        }

        // async getAllPages() {
        //     this.RESULT['one'] = 1;
        //     var $stars = this.RESULT;
        //     try {
        //         var data = await Promise.all([
        //             fetch('/uzivatel/78145-songokussj/hodnoceni/?page=2').then((response) => response.text()),
        //             fetch('/uzivatel/78145-songokussj/hodnoceni/?page=3').then((response) => response.text()),
        //             fetch('/uzivatel/78145-songokussj/hodnoceni/?page=4').then((response) => response.text()),
        //         ]);

        //         for (var dataHTML of data) {

        //             $(dataHTML).find("tbody tr").each(function () {
        //                 var $row = $(this);
        //                 var filmURL = $("a.film-title-name", $row).attr("href");
        //                 var $rating = $("span .stars", $row);

        //                 let starsRating = 0;
        //                 for (let stars = 0; stars <= 5; stars++) {
        //                     if ($rating.hasClass('stars-' + stars)) {
        //                         starsRating = stars;
        //                     }
        //                 }
        //                 // Add to dict
        //                 $stars[filmURL] = starsRating;
        //             });
        //         }
        //     } catch (error) {
        //         console.log(error);
        //     }
        // }

        // removeBox_RegistrujSe() {
        //     $('.box--homepage-motivation-middle').remove();
        //     // $('section.box--homepage-video').parent().toggleClass('column-70 column-100');
        // }

        removeBox_ContestPanel() {
            $('.box--homepage-contest').remove();
        }

        removeBox_CsfdCinemaPanel() {
            $('.box--homepage-csfd-cinema').remove();
        }

        removeBox_VideoPanel() {
            $('.box--homepage-video').remove();
        }

        removeBox_MoviesOfferPanel() {
            $('.box--movies-offer').remove();
        }

        async addSettingsPanel() {
            let dropdownStyle = 'right: 150px; width: max-content;';
            let disabled = '';
            let needToLoginTooltip = '';
            let needToLoginStyle = '';

            if (!await this.isLoggedIn()) {
                dropdownStyle = 'right: 50px; width: max-content;';
                disabled = 'disabled';
                needToLoginTooltip = `data-tippy-content="Funguje jen po přihlášení"`;
                needToLoginStyle = 'color: grey;';
            }

            let button = document.createElement('li');
            let resetLabelStyle = "-webkit-transition: initial; transition: initial; font-weight: initial; display: initial !important;";
            button.innerHTML = `
                <a href="#show-search" class="user-link initialized">CC</a>
                <div class="dropdown-content notifications" style="${dropdownStyle}">

                    <div class="dropdown-content-head">
                        <h2>CSFD-Compare nastavení</h2>
                        <span style="float: right; font-size: 0.7rem; margin-top: 0.2rem;">${VERSION}</span>
                    </div>

                    <article class="article">
                        <h2 class="article-header">Globální úpravy</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkControlPanelOnHover" name="control-panel-on-hover">
                                <label for="chkControlPanelOnHover" style="${resetLabelStyle}">Otevřít ovládací panel přejetím myší (netřeba klikat)</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkClickableHeaderBoxes" name="clickable-header-boxes">
                                <label for="chkClickableHeaderBoxes" style="${resetLabelStyle}">Klikatelný celý box, ne jen tlačítko "VÍCE"</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkClickableMessages" name="clickable-messages" ${disabled}>
                                <label for="chkClickableMessages" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Klikatelné zprávy (bez tlačítko "více...")</label>
                            </div>
                            <!--
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveRegistrationPanel" name="remove-registration-panel" ${disabled}>
                                <label for="chkRemoveRegistrationPanel" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Skrýt panel "Registruj se" (dom. stránka)</label>
                            </div>
                            -->
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveContestPanel" name="remove-contest-panel" ${disabled}>
                                <label for="chkRemoveContestPanel" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Skrýt panel: "Soutěž" (dom. stránka)</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveCsfdCinemaPanel" name="remove-contest-panel" ${disabled}>
                                <label for="chkRemoveCsfdCinemaPanel" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Skrýt panel: "ČSFD sál" (dom. stránka)</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveVideoPanel" name="remove-video-panel" ${disabled}>
                                <label for="chkRemoveVideoPanel" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Skrýt panel: "Nové trailery" (dom. stránka)</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveMoviesOfferPanel" name="remove-movies-offer-panel" ${disabled}>
                                <label for="chkRemoveMoviesOfferPanel" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Skrýt panel: "Sledujte online / DVD tipy" (dom. stránka)</label>
                            </div>
                        </section>
                    </article>

                    <article class="article">
                        <h2 class="article-header">Uživatelé</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideUserControlPanel" name="chide-user-control-panel">
                                <label for="chkHideUserControlPanel" style="${resetLabelStyle}">Skrýt ovládací panel</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkDisplayMessageButton" name="display-message-button" ${disabled}>
                                <label for="chkDisplayMessageButton" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}> ↳ Přidat tlačítko odeslání zprávy</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkDisplayFavoriteButton" name="display-favorite-button" ${disabled}>
                                <label for="chkDisplayFavoriteButton" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}> ↳ Přidat tlačítko přidat/odebrat z oblíbených</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkCompareUserRatings" name="compare-user-ratings" ${disabled}>
                                <label for="chkCompareUserRatings" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Porovnat uživatelská hodnocení s mými</label>
                            </div>
                        </section>
                    </article>

                    <article class="article">
                        <h2 class="article-header">Film/Seriál</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideSelectedUserReviews" name="hide-selected-user-reviews">
                                <label for="chkHideSelectedUserReviews" style="${resetLabelStyle}">Skrýt recenze lidí</label>
                                <div>
                                    <input type="textbox" id="txtHideSelectedUserReviews" name="hide-selected-user-reviews-list">
                                    <label style="${resetLabelStyle}">(např: POMO, golfista)</label>
                                </div>
                            </div>
                        </section>
                    </article>

                </div>
            `;
            $('.header-bar').prepend(button);

            refreshTooltips();

            let timer;
            $(button).on("mouseover", function () {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (!$(button).hasClass("active")) {
                    $(button).addClass("active");
                }
            });

            $(button).on("mouseleave", function () {
                if ($(button).hasClass("active")) {
                    timer = setTimeout(() => {
                        $(button).removeClass("active");
                    }, 200);
                }
            });
        }

        checkAndUpdateRatings() {
            let currentFilmRating = this.getCurrentFilmRating();

            if (currentFilmRating == null) {
                // Check if record exists, if yes, remove it
                this.removeFromLocalStorage();
            } else {
                // Check if current page rating corresponds with that in LocalStorage, if not, update it
                this.updateInLocalStorage(this.getCurrentFilmRating());
            }
        }

        clickableMessages() {
            let $messagesBox = $('.dropdown-content.messages');
            let $more = $messagesBox.find('.span-more-small');
            if ($more.length < 1) { return; }

            for (const $span of $more) {

                // Hide "... více" button
                $($span).hide();

                let $content = $($span).closest('.article-content');
                let $article = $content.closest('article');
                $content.hover(function () {
                    // $(this).css('background-color', '#e1e0e0');
                    $article.css('background-color', '#e1e0e0');
                }, function () {
                    // $(this).css('background-color', 'initial');
                    $article.css('background-color', 'initial');
                });

                let href = $($span).find('a').attr('href');
                $content.wrap(`<a href="${href}"></a>`);
            }
        }
        clickableHeaderBoxes() {
            // // Does not work, the hell...
            // let userLinks = $('.user-link');
            // for (const element of userLinks) {
            //     let href = window.location.origin + $(element).attr('href');
            //     $(element).unbind();
            //     $(element).wrap(`<a href="${href}"></a>`);
            // }

            let headers = $('.dropdown-content-head');
            for (const div of headers) {
                let btn = $(div).find('a.button');
                if (btn.length === 0) { continue; }
                if (!["více", "viac"].includes(btn[0].text.toLowerCase())) { continue; }

                $(div).wrap(`<a href="${btn.attr('href')}"></a>`);

                btn[0].innerHTML = "Otevřít";
                btn[0].style.visibility = 'hidden';

                let h2 = $(div).find('h2');
                $(div)
                    .mouseover(() => {
                        div.style.backgroundColor = '#ba0305';
                        h2[0].style.backgroundColor = '#ba0305';
                        h2[0].style.color = '#fff';
                        btn[0].style.visibility = 'visible';
                    })
                    .mouseout(() => {
                        div.style.backgroundColor = '#ececec';
                        h2[0].style.backgroundColor = 'initial';
                        h2[0].style.color = 'initial';
                        btn[0].style.visibility = 'hidden';
                    });
            }

            // TODO: Zaimplementovat do Headers, sjednotit styl
            let boxHeaders = $('.box-header');
            for (const headerBox of boxHeaders) {
                let btn = $(headerBox).find('a.button');
                if (btn.length === 0) { continue; }
                if (!["více", "viac"].includes(btn[0].text.toLowerCase())) { continue; }

                $(headerBox).wrap(`<a href="${btn.attr('href')}"></a>`);

                let h2 = $(headerBox).find('h2');
                let spanCount = h2.find('span.count');
                $(headerBox)
                    .mouseover(() => {
                        headerBox.style.backgroundColor = '#ba0305';
                        h2[0].style.backgroundColor = '#ba0305';
                        h2[0].style.color = '#fff';
                        // btn[0].style.visibility = 'visible';
                        if (spanCount.length == 1) { spanCount[0].style.color = '#fff'; }
                    })
                    .mouseout(() => {
                        headerBox.style.backgroundColor = '#e3e3e3';
                        h2[0].style.backgroundColor = 'initial';
                        h2[0].style.color = 'initial';
                        // btn[0].style.visibility = 'hidden';
                        if (spanCount.length == 1) { spanCount[0].style.color = 'initial'; }
                    });
            }
        }

        hideSelectedUserReviews() {
            let articleHeaders = $('.article-header-review-name');
            for (const element of articleHeaders) {
                let userTitle = $(element).find('.user-title-name');
                if (userTitle.length != 1) { continue; }
                let ignoredUser = settings.hideSelectedUserReviewsList.includes(userTitle[0].text);
                if (!ignoredUser) { continue; }
                $(element).closest('article').hide();
            }
        }

        async checkForUpdate() {
            return $.ajax({
                type: "GET",
                url: 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare',
            });
        }

        async getChangelog() {
            return $.ajax({
                type: "GET",
                url: 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare/versions',
            });
        }
    }

    // SCRIPT START
    // ============================================================================================
    let csfd = new Csfd($('div.page-content'));

    // =================================
    // LOAD SETTINGS
    // =================================
    await csfd.fillMissingSettingsKeys();

    let settings = await getSettings();
    await csfd.addSettingsPanel();
    await csfd.loadInitialSettings();
    await csfd.addSettingsEvents();


    // =================================
    // GLOBAL
    // =================================
    if (settings.clickableHeaderBoxes == true) { csfd.clickableHeaderBoxes(); }
    if (settings.showControlPanelOnHover == true) { csfd.openControlPanelOnHover(); }
    // Film/Series page
    if (location.href.includes('/film/')) {
        if (settings.hideSelectedUserReviews == true) { csfd.hideSelectedUserReviews(); }
    }

    if (settings.removeContestPanel == true) { csfd.removeBox_ContestPanel(); }
    if (settings.removeCsfdCinemaPanel == true) { csfd.removeBox_CsfdCinemaPanel(); }
    if (settings.removeVideoPanel == true) { csfd.removeBox_VideoPanel(); }
    if (settings.removeMoviesOfferPanel == true) { csfd.removeBox_MoviesOfferPanel(); }


    // =================================
    // NOT LOGGED IN
    // =================================
    if (!await csfd.isLoggedIn()) {
        // Use page
        if (location.href.includes('/uzivatel/')) {
            if (settings.hideUserControlPanel == true) { csfd.hideUserControlPanel(); }
        }
    }


    // =================================
    // LOGGED IN
    // =================================
    if (await csfd.isLoggedIn()) {

        // Global settings without category
        // if (settings.removeRegistrationPanel == true) { csfd.removeBox_RegistrujSe(); }

        // Header modifications
        if (settings.clickableMessages == true) { csfd.clickableMessages(); }

        // User page
        if (location.href.includes('/uzivatel/')) {
            if (settings.displayMessageButton == true) { csfd.displayMessageButton(); }
            if (settings.displayFavoriteButton == true) { csfd.displayFavoriteButton(); }
            if (settings.hideUserControlPanel == true) { csfd.hideUserControlPanel(); }

            if (settings.compareUserRatings == true) {

                // Load initial class properties
                csfd.userUrl = csfd.getCurrentUser();
                csfd.storageKey = `${SCRIPTNAME}_${csfd.userUrl.split("/")[2].split("-")[1]}`;
                csfd.userRatingsUrl = `${csfd.userUrl}/hodnoceni`;
                if (location.origin.endsWith('sk')) { csfd.userRatingsUrl = `${csfd.userUrl}/hodnotenia`; }
                csfd.stars = csfd.getStars();

                // console.log("BEFORE:", csfd.RESULT);
                // await csfd.getAllPages();
                // console.log("AFTER:", Object.keys(csfd.RESULT).length);

                // Dynamic LocalStorage update on Film/Series in case user changes ratings
                if (location.href.includes('/film/')) {
                    csfd.checkAndUpdateRatings();
                }

                // Load UserRatings from /uzivatel/xxx/hodnoceni and LocalStorageRatings
                csfd.userRatingsCount = csfd.getCurrentUserRatingsCount();
                csfd.localStorageRatingsCount = csfd.getLocalStorageRatingsCount();

                if (csfd.userRatingsCount == csfd.localStorageRatingsCount) {
                    // Show user ratings on any other user page but mine
                    if (csfd.onOtherUserHodnoceniPage()) {
                        csfd.addRatingsColumn();
                    }
                } else {
                    // Show user that his 'user ratings' and 'local storage ratings' are not the same and he should refresh
                    csfd.addWarningToUserProfile();
                }
            }
        }
    }

    // If not already in session storage, get new version from greasyfork and display changelog over version link
    if (!sessionStorage.updateChecked) {
        await csfd.checkForUpdate().then(async function (data) {
            let version = $(data).find('dd.script-show-version > span').text();
            let curVersion = $(VERSION).text().replace('v', '');
            if (version !== curVersion) {
                let $verLink = $('#script-version');
                let versionText = `${$verLink.text()} (Nová v${version})`;
                $verLink.text(versionText);
                sessionStorage.versionText = versionText;

                await csfd.getChangelog().then(function (data) {
                    let changelogText = $(data).find('.version-date').first().text() + "<br>";
                    changelogText += $(data).find('.version-changelog').html();
                    $verLink.attr("data-tippy-content", changelogText);
                    sessionStorage.changelogText = changelogText;
                });
            }
        });
        sessionStorage.updateChecked = "true";
    } else {
        $('#script-version')
            .text(sessionStorage.versionText)
            .attr("data-tippy-content", sessionStorage.changelogText);
    }

    // Call TippyJs constructor
    refreshTooltips();

})();
