// ==UserScript==
// @name         CSFD porovnání hodnocení
// @namespace    csfd.cz
// @version      0.5.1
// @description  Show your own ratings on other users ratings list
// @author       SonGokussj4
// @match        http://csfd.cz,https://csfd.cz
// @include      *csfd.cz/*
// @include      *csfd.sk/*
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// ==/UserScript==


// @updateURL    https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @downloadURL  https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @supportURL   https://XXgithub.com/SonGokussj4/GitHub-userscripts/issues


const VERSION_NUM = 'v0.5.1';
const SCRIPTNAME = 'CSFD-Compare';
const SETTINGSNAME = 'CSFD-Compare-settings';
const GREASYFORK_URL = 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare';
const VERSION = `<a id="script-version" href="${GREASYFORK_URL}">${VERSION_NUM}</a>`;


let Glob = {
    popupCounter: 0,

    popup: function (htmlContent, timeout = 3, width = 150, slideTime = 100) {
        var id = Glob.popupCounter++;
        if (!htmlContent) {
            return;
        }
        var yOffset = 10;
        let $popup = $(`<div>`, {
            id: `SNPopup${id}`,
            "class": "SNPopup",
            html: htmlContent,
        })
            .css({
                border: "1px solid black",
                borderRadius: "4px",
                display: "none",
                padding: "10px",
                opacity: "0.95",
                background: "#820001",
                color: "white",
                position: "absolute",
                left: "45%",
                width: `${width}px`,
                zIndex: "999",
                top: `${yOffset}px`,
                right: "10px"
            });
        $(".header-search").append($popup);
        $popup.slideDown(slideTime);
        (function ($popup) {
            setTimeout(function () {
                $popup.slideUp(slideTime);
            }, timeout * 1000);
        })($popup);
    }
};

let defaultSettings = {
    // HOME PAGE
    removeMotivationPanel: false,
    removeContestPanel: false,
    removeCsfdCinemaPanel: false,
    removeVideoPanel: false,
    removeMoviesOfferPanel: false,
    // GLOBAL
    showControlPanelOnHover: true,
    clickableHeaderBoxes: true,
    clickableMessages: true,
    // USER
    displayMessageButton: true,
    displayFavoriteButton: true,
    hideUserControlPanel: true,
    compareUserRatings: true,
    // FILM/SERIES
    addRatingsDate: true,
    addRatingsComputedCount: true,
    hideSelectedUserReviews: false,
    hideSelectedUserReviewsList: [],
};

async function delay(t) {
    return new Promise(resolve => {
        setTimeout(resolve, t);
    });
}

async function getSettings() {
    if (!localStorage[SETTINGSNAME]) {
        localStorage.setItem(SETTINGSNAME, JSON.stringify(defaultSettings));
        return defaultSettings;
    } else {
        return JSON.parse(localStorage[SETTINGSNAME]);
    }
}

async function refreshTooltips() {
    try {
        tippy('[data-tippy-content]', {
            // interactive: true,
            popperOptions: { modifiers: { computeStyle: { gpuAcceleration: false } } }
        });
    } catch (err) {
        console.log("Error: refreshTooltips():", err);
    }
}

async function mergeDict(list) {
    // Take a list of dictionaries and return merged dictionary
    const merged = list.reduce(function (r, o) {
        Object.keys(o).forEach(function (k) { r[k] = o[k]; });
        return r;
    }, {});
    return merged;
}

(async () => {
    "use strict";
    /* globals jQuery, $, waitForKeyElements */
    /* jshint -W069 */
    /* jshint -W083 */
    /* jshint -W075 */

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
            const $profile = $('.profile.initialized');
            return $profile.length > 0;
        }

        async getCurrentUser() {
            let loggedInUser = $('.profile.initialized').attr('href');
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

        async getLocalStorageRatings() {
            if (localStorage[this.storageKey]) {
                let stars = JSON.parse(localStorage[this.storageKey]);
                return stars;
            } else {
                return {};
            }
        }

        async getLocalStorageRatingsCount() {
            const ratings = await this.getLocalStorageRatings();
            return Object.keys(ratings).length;
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

        updateInLocalStorage(ratingsObject) {
            // Check if film is in LocalStorage
            let filmUrl = this.getCurrentFilmUrl();
            let myRating = this.stars[filmUrl] || undefined;

            // Item not in LocalStorage, add it then!
            if (myRating === undefined) {
                // Item not in LocalStorage, add
                this.stars[filmUrl] = ratingsObject;
                localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
                return true;
            }

            if (myRating.rating !== ratingsObject.rating) {
                // LocalStorage rating != current rating, update
                this.stars[filmUrl] = ratingsObject;
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
            if (item === undefined) {
                return null;
            }

            // Item in LocalStorage, delete it from local dc
            delete this.stars[filmUrl];

            // And resave it to LocalStorage
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));

            return true;
        }

        async getCurrentFilmRating() {
            let $activeStars = this.csfdPage.find(".star.active:not('.computed')");

            // No rating
            if ($activeStars.length === 0) { return null; }

            // Rating "odpad" or "1"
            if ($activeStars.length === 1) {
                if ($activeStars.attr('data-rating') === "0") {
                    return 0;
                }
            }

            // Rating "1" to "5"
            return $activeStars.length;
        }

        async getCurrentUserRatingsCount2() {
            return $.get(this.userRatingsUrl)
                .then(function (data) {
                    const count = $(data).find('.box-user-rating span.count').text().replace(/[\s()]/g, '');
                    if (count) {
                        return parseInt(count);
                    }
                    return 0;
                });
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
            // HOME PAGE
            $('#chkRemoveMotivationPanel').attr('checked', settings.removeMotivationPanel);
            $('#chkRemoveContestPanel').attr('checked', settings.removeContestPanel);
            $('#chkRemoveCsfdCinemaPanel').attr('checked', settings.removeCsfdCinemaPanel);
            $('#chkRemoveVideoPanel').attr('checked', settings.removeVideoPanel);
            $('#chkRemoveMoviesOfferPanel').attr('checked', settings.removeMoviesOfferPanel);

            // GLOBAL
            $('#chkControlPanelOnHover').attr('checked', settings.showControlPanelOnHover);
            $('#chkClickableHeaderBoxes').attr('checked', settings.clickableHeaderBoxes);
            $('#chkClickableMessages').attr('checked', settings.clickableMessages);

            // USER
            $('#chkDisplayMessageButton').attr('checked', settings.displayMessageButton);
            $('#chkDisplayFavoriteButton').attr('checked', settings.displayFavoriteButton);
            $('#chkHideUserControlPanel').attr('checked', settings.hideUserControlPanel);
            $('#chkCompareUserRatings').attr('checked', settings.compareUserRatings);

            // FILM/SERIES
            $('#chkAddRatingsDate').attr('checked', settings.addRatingsDate);
            $('#chkAddRatingsComputedCount').attr('checked', settings.addRatingsComputedCount);
            $('#chkHideSelectedUserReviews').attr('checked', settings.hideSelectedUserReviews);
            if (settings.hideSelectedUserReviews === false) { $('#txtHideSelectedUserReviews').parent().hide(); }
            if (settings.hideSelectedUserReviewsList !== undefined) { $('#txtHideSelectedUserReviews').val(settings.hideSelectedUserReviewsList.join(', ')); }

        }

        async addSettingsEvents() {
            // HOME PAGE
            $('#chkRemoveMotivationPanel').change(function () {
                settings.removeMotivationPanel = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

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

            // GLOBAL
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

            $('#chkCompareUserRatings').change(function () {
                settings.compareUserRatings = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            // FILM/SERIES
            $('#chkAddRatingsDate').change(function () {
                settings.addRatingsDate = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkAddRatingsComputedCount').change(function () {
                settings.addRatingsComputedCount = this.checked;
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

        async onOtherUserHodnoceniPage() {
            if ((location.href.includes('/hodnoceni') || location.href.includes('/hodnotenia')) && location.href.includes('/uzivatel/')) {
                if (!location.href.includes(this.userUrl)) {
                    return true;
                }
            }
            return false;
        }

        async onOtherUserPage() {
            if (location.href.includes('/uzivatel/')) {
                if (!location.href.includes(this.userUrl)) {
                    return true;
                }
            }
            return false;
        }

        exportRatings() {
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
        }

        importRatings() {
            if (localStorage[this.storageKey]) {
                this.stars = JSON.parse(localStorage[this.storageKey]);
            }
        }

        addStars() {
            if (location.href.includes('/zebricky/') || location.href.includes('/rebricky/')) {
                return;
            }

            let $links = $('a.film-title-name');
            for (const $link of $links) {
                let href = $($link).attr('href');
                let res = this.stars[href];
                if (res === undefined) {
                    continue;
                }
                let $sibl = $($link).closest('td').siblings('.rating,.star-rating-only');
                if ($sibl.length !== 0) {
                    continue;
                }
                let starClass = res.rating !== 0 ? `stars-${res.rating}` : `trash`;
                let starText = res.rating !== 0 ? "" : "odpad!";
                let html = $("<span>", {
                    'class': `csfd-compare-film-rating star-rating`,
                    html: `<span class="stars ${starClass}" title="${res.date}">${starText}</span>`
                }).css({
                    color: '#00D300',
                    marginLeft: "4px",
                });
                $($link).append(html);
            }
        }

        addRatingsColumn() {
            if (this.userRatingsCount === 0) { return; }

            let $page = this.csfdPage;

            let $tbl = $page.find('#snippet--ratings table tbody');
            let starsDict = this.getStars();

            $tbl.find('tr').each(function () {
                let $row = $(this);
                let url = $($row).find('.name').find('a').attr('href');
                const myRating = starsDict[url] || {};

                let $span = "";
                if (myRating.rating === 0) {
                    $span = `<span class="stars trash">odpad!</span>`;
                } else {
                    $span = `<span class="stars stars-${myRating.rating}" title="${myRating.date}"></span>`;
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

        async openControlPanelOnHover() {
            let btn = $('.button-control-panel');
            let panel = $('#dropdown-control-panel');
            $(btn).on('mouseover', () => {
                if (!panel.hasClass('active')) panel.addClass('active');
            });
            $(btn).on('mouseleave', () => {
                if (panel.hasClass('active')) panel.removeClass('active');
            });
            $(panel).on('mouseover', () => {
                if (!panel.hasClass('active')) panel.addClass('active');
            });
            $(panel).on('mouseleave', () => {
                if (panel.hasClass('active')) panel.removeClass('active');
            });

        }

        addWarningToUserProfile() {
            $(".csfd-compare-menu").append(`
                <div class='counter'>
                    <span><b>!</b></span>
                </div>
            `);
        }

        async showRefreshRatingsButton(ratingsInLS, curUserRatings) {
            let $button = $('<button>', {
                id: 'refr-ratings-button',
                "class": 'csfd-compare-reload',
                html: `
                    <center>
                        <b> >> Načíst hodnocení << </b> <br>
                        Uložené: [${ratingsInLS}] != Celkem: [${curUserRatings}]
                    </center>
                `,
            }).css({
                textTransform: "initial",
                fontSize: "0.9em",
                padding: "5px",
                border: "4px solid whitesmoke",
                width: "-moz-available",
                width: "-webkit-fill-available",
                width: "100%",
            });
            let $div = $('<div>', {
                html: $button,
            });
            $('#chkCompareUserRatings').parent().append($div);

            $($button).on("click", async function () {
                let csfd = new Csfd($('div.page-content'));
                csfd.refreshAllRatings(csfd);
            });
        }

        async refreshAllRatings(csfd) {
            await csfd.initializeClassVariables();
            csfd.stars = await csfd.getAllPages();
            csfd.exportRatings();
            Glob.popup(`Vaše hodnocení byla načtena.<br>Obnovte stránku.`, 4, 200);
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

        async displayFavoriteButton() {
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

            $(button).on('click', async function () {
                if (addRemoveIndicator == "+") {
                    $('#add-remove-indicator')[0].innerText = '-';
                    button._tippy.setContent("Odebrat z oblíbených");
                } else {
                    $('#add-remove-indicator')[0].innerText = '+';
                    button._tippy.setContent("Přidat do oblíbených");
                }
                await refreshTooltips();
            });
        }

        hideUserControlPanel() {
            let panel = $('.button-control-panel:not(.small)');
            if (panel.length !== 1) { return; }
            panel.hide();
        }

        async doSomething(idx, url) {
            // console.log(`doSomething(${idx}) START`);
            let data = await $.get(url);
            let $rows = $(data).find('#snippet--ratings tr');
            let dc = {};
            for (const $row of $rows) {
                let name = $($row).find('td.name a').attr('href');
                let $ratings = $($row).find('span.stars');
                let rating = 0;
                for (let stars = 0; stars <= 5; stars++) {
                    if ($ratings.hasClass('stars-' + stars)) {
                        rating = stars;
                    }
                }
                let date = $($row).find('td.date-only').text().replace(/[\s]/g, '');
                dc[name] = { 'rating': rating, 'date': date };
            }
            // console.log(`doSomething(${idx}) END`);
            return dc;
            // web workers - vyšší dívčí - více vláken z browseru
        }

        async getAllPages() {
            const url = location.origin.endsWith('sk') ? `${this.userUrl}hodnotenia` : `${this.userUrl}hodnoceni`;
            const $content = await $.get(url);
            const $href = $($content).find(`.pagination a:not(.page-next):not(.page-prev):last`);
            const maxPageNum = $href.text();

            const ls = [];
            for (let idx = 1; idx <= maxPageNum; idx++) {
                console.log(`Načítám hodnocení ${idx}/${maxPageNum}`);
                Glob.popup(`Načítám hodnocení ${idx}/${maxPageNum}`, 1, 200, 0);
                const url = location.origin.endsWith('sk') ? `${this.userUrl}hodnotenia/?page=${idx}` : `${this.userUrl}hodnoceni/?page=${idx}`;
                const res = await this.doSomething(idx, url);
                ls.push(res);
            }
            const dict = await mergeDict(ls);
            return dict;
        }

        removeBox_MotivationPanel() {
            $('.box--homepage-motivation-middle,.box--homepage-motivation').remove();
        }
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
                <a href="#" class="user-link initialized csfd-compare-menu">CC</a>
                <div class="dropdown-content notifications" style="${dropdownStyle}">

                    <div class="dropdown-content-head">
                        <h2>CSFD-Compare nastavení</h2>
                        <span style="float: right; font-size: 0.7rem; margin-top: 0.2rem;">${VERSION}</span>
                    </div>

                    <article class="article">
                        <h2 class="article-header">Domácí stránka</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveMotivationPanel" name="remove-motivation-panel">
                                <label for="chkRemoveMotivationPanel" style="${resetLabelStyle}">Skrýt panel: "Vítej na ČSFD"</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveContestPanel" name="remove-contest-panel">
                                <label for="chkRemoveContestPanel" style="${resetLabelStyle}">Skrýt panel: "Soutěž"</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveCsfdCinemaPanel" name="remove-csfd-cinema-panel">
                                <label for="chkRemoveCsfdCinemaPanel" style="${resetLabelStyle}">Skrýt panel: "ČSFD sál"</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveVideoPanel" name="remove-video-panel">
                                <label for="chkRemoveVideoPanel" style="${resetLabelStyle}">Skrýt panel: "Nové trailery"</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveMoviesOfferPanel" name="remove-movies-offer-panel">
                                <label for="chkRemoveMoviesOfferPanel" style="${resetLabelStyle}">Skrýt panel: "Sledujte online / DVD tipy"</label>
                            </div>
                        </section>
                    </article>
                    <article class="article">
                        <h2 class="article-header">Globální úpravy</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkControlPanelOnHover" name="control-panel-on-hover">
                                <label for="chkControlPanelOnHover" style="${resetLabelStyle}">Otevřít ovládací panel přejetím myší</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkClickableHeaderBoxes" name="clickable-header-boxes">
                                <label for="chkClickableHeaderBoxes" style="${resetLabelStyle}">Boxy s tlačítkem "VÍCE" jsou klikatelné celé</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkClickableMessages" name="clickable-messages" ${disabled}>
                                <label for="chkClickableMessages" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Klikatelné zprávy (bez tlačítko "více...")</label>
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
                                <input type="checkbox" id="chkAddRatingsDate" name="compare-user-ratings" ${disabled}>
                                <label for="chkAddRatingsDate" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Zobrazit datum hodnocení</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkAddRatingsComputedCount" name="compare-user-ratings" ${disabled}>
                                <label for="chkAddRatingsComputedCount" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Zobrazit spočteno ze sérií</label>
                            </div>
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

            await refreshTooltips();

            // Don't hide settings popup when mouse leaves within interval of 0.2s
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

        async checkAndUpdateRatings() {
            let currentFilmRating = await this.getCurrentFilmRating();
            let currentFilmDateAdded = await this.getCurrentFilmDateAdded();

            if (currentFilmRating === null) {
                // Check if record exists, if yes, remove it
                this.removeFromLocalStorage();
            } else {
                // Check if current page rating corresponds with that in LocalStorage, if not, update it
                const obj = {
                    rating: currentFilmRating,
                    date: currentFilmDateAdded
                };
                this.updateInLocalStorage(obj);
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
        async clickableHeaderBoxes() {
            // CLICKABLE HEADER BUTTONS
            $(".user-link.wantsee").on("click", function () {
                location.href = "/chci-videt/";
            });
            $(".user-link.favorites").on("click", function () {
                location.href = "/soukrome/oblibene/";  // TODO: Toto pry nefunguje
            });
            $(".user-link.messages").on("click", function () {
                location.href = "/posta/";
            });

            // CLICKABLE HEADER DIVS
            let headers = $('.dropdown-content-head,.box-header');
            for (const div of headers) {
                let btn = $(div).find('a.button');

                if (btn.length === 0) { continue; }
                if (!["více", "viac"].includes(btn[0].text.toLowerCase())) { continue; }

                $(div).wrap(`<a href="${btn.attr('href')}"></a>`);

                let h2 = $(div).find('h2');
                let spanCount = h2.find('span.count');
                $(div)
                    .mouseover(() => {
                        $(div).css({ backgroundColor: '#ba0305' });
                        $(h2[0]).css({ backgroundColor: '#ba0305', color: '#fff' });
                        if (spanCount.length == 1) { spanCount[0].style.color = '#fff'; }
                    })
                    .mouseout(() => {
                        if ($(div).hasClass('dropdown-content-head')) {
                            $(div).css({ backgroundColor: '#ececec' });
                        } else {
                            $(div).css({ backgroundColor: '#e3e3e3' });
                        }
                        $(h2[0]).css({ backgroundColor: 'initial', color: 'initial' });
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
        async getCurrentFilmDateAdded() {
            let ratingText = this.csfdPage.find('span.stars-rating.initialized').attr('title');
            if (ratingText === undefined) {
                // Grab the rating date from mobile-rating
                ratingText = this.csfdPage.find('.mobile-film-rating-detail a span').attr('title');
                if (ratingText === undefined) {
                    return;
                }
            }
            let match = ratingText.match("[0-9]{2}[.][0-9]{2}[.][0-9]{4}");
            if (match !== null) {
                let ratingDate = match[0];
                return ratingDate;
                // let $myRatingCaption = $('.my-rating h3');
                // $myRatingCaption.html(`${$myRatingCaption.text()}<br>${ratingDate}`);
            }
            return undefined;
        }

        async addRatingsDate() {
            // Grab the rating date from stars-rating
            let ratingText = $('span.stars-rating.initialized').attr('title');
            if (ratingText === undefined) {
                // Grab the rating date from mobile-rating
                ratingText = $('.mobile-film-rating-detail a span').attr('title');
                if (ratingText === undefined) {
                    return;
                }
            }
            let match = ratingText.match("[0-9]{2}[.][0-9]{2}[.][0-9]{4}");
            if (match !== null) {
                let ratingDate = match[0];
                let $myRatingCaption = $('.my-rating h3');
                $myRatingCaption.html(`${$myRatingCaption.text()}<br>${ratingDate}`);
            }
        }

        async addRatingsComputedCount() {
            let $computedStars = $('.star.active.computed');
            let isComputed = $computedStars.length != 0;
            if (!isComputed) { return; }
            let $starsRating = $($computedStars[0]).closest('.stars-rating.initialized');
            let fromRatingsText = $starsRating.attr('title');
            if (fromRatingsText === undefined) {
                return;
            }
            let $myRatingCaption = $('.my-rating h3');
            $myRatingCaption.html(`${$myRatingCaption.text()}<br>${fromRatingsText}`);
        }

        async checkForUpdate() {
            let pageHtml = await $.get(GREASYFORK_URL);
            let version = $(pageHtml).find('dd.script-show-version > span').text();
            return version;
        }

        async getChangelog() {
            let pageHtml = await $.get(`${GREASYFORK_URL}/versions`);
            let versionDateTime = $(pageHtml).find('.version-date').first().attr('datetime');
            let versionNumber = $(pageHtml).find('.version-number a').first().text()
            let versionDate = versionDateTime.substring(0, 10);
            let versionTime = versionDateTime.substring(11, 16);
            let changelogText = `
                <div style="font-size: 0.8rem; line-height: 1.5;">${versionDate} ${versionTime} (${versionNumber})<br>
                    <hr>
                    ${$(pageHtml).find('.version-changelog').html()}
                </div>
            `;
            return changelogText;
        }

        async initializeClassVariables() {
            this.userUrl = await this.getCurrentUser();
            this.storageKey = `${SCRIPTNAME}_${this.userUrl.split("/")[2].split("-")[1]}`;
            this.userRatingsUrl = location.origin.endsWith('sk') ? `${this.userUrl}/hodnotenia` : `${this.userUrl}/hodnoceni`;
            this.stars = this.getStars();
        }
    }

    // $(document).on('click', '#refr-ratings-button', function () {
    //     alert("hihi");
    // });

    // ============================================================================================
    // SCRIPT START
    // ============================================================================================
    await delay(20);  // Greasemonkey workaround, wait a little bit for page to somehow load
    let csfd = new Csfd($('div.page-content'));


    // =================================
    // LOAD SETTINGS
    // =================================
    await csfd.fillMissingSettingsKeys();

    const settings = await getSettings();
    await csfd.addSettingsPanel();
    await csfd.loadInitialSettings();
    await csfd.addSettingsEvents();


    // =================================
    // GLOBAL
    // =================================
    if (settings.clickableHeaderBoxes) { csfd.clickableHeaderBoxes(); }
    if (settings.showControlPanelOnHover) { csfd.openControlPanelOnHover(); }

    // Film/Series page
    if (location.href.includes('/film/')) {
        if (settings.hideSelectedUserReviews) { csfd.hideSelectedUserReviews(); }
    }

    if (settings.removeVideoPanel) { csfd.removeBox_VideoPanel(); }
    if (settings.removeMotivationPanel) { csfd.removeBox_MotivationPanel(); }
    if (settings.removeContestPanel) { csfd.removeBox_ContestPanel(); }
    if (settings.removeCsfdCinemaPanel) { csfd.removeBox_CsfdCinemaPanel(); }
    if (settings.removeMoviesOfferPanel) { csfd.removeBox_MoviesOfferPanel(); }


    // =================================
    // NOT LOGGED IN
    // =================================
    if (!await csfd.isLoggedIn()) {
        // User page
        if (location.href.includes('/uzivatel/')) {
            if (settings.hideUserControlPanel) { csfd.hideUserControlPanel(); }
        }
    }


    // =================================
    // LOGGED IN
    // =================================
    if (await csfd.isLoggedIn()) {

        // Global settings without category
        await csfd.initializeClassVariables();

        // Header modifications
        if (settings.clickableMessages) { csfd.clickableMessages(); }

        // Film page
        if (location.href.includes('/film/')) {
            if (settings.addRatingsDate) { csfd.addRatingsDate(); }
            if (settings.addRatingsComputedCount) { csfd.addRatingsComputedCount(); }

            // Dynamic LocalStorage update on Film/Series in case user changes ratings
            await csfd.checkAndUpdateRatings();
        }

        // Compare - check if number of ratings saved and current are the same
        if (settings.compareUserRatings) {
            let ratingsInLocalStorage = await csfd.getLocalStorageRatingsCount();
            let currentUserRatingsCount = await csfd.getCurrentUserRatingsCount2();
            if (ratingsInLocalStorage === currentUserRatingsCount) {
                csfd.userRatingsCount = currentUserRatingsCount;
                const $span = $("<span>", { html: "✔️", title: "Přenačíst všechna hodnocení" }).css({ cursor: "pointer" });
                $('#chkCompareUserRatings').parent().append($span);
                $span.on("click", async function () {
                    let csfd = new Csfd($('div.page-content'));
                    csfd.refreshAllRatings(csfd);
                });
            } else {
                $('#chkCompareUserRatings').parent().append('<span>⚠️</span>');
                csfd.showRefreshRatingsButton(ratingsInLocalStorage, currentUserRatingsCount);
                csfd.addWarningToUserProfile();
            }

            csfd.addStars();
        }

        // User page
        if (await csfd.onOtherUserPage()) {
            if (settings.displayMessageButton) { csfd.displayMessageButton(); }
            if (settings.displayFavoriteButton) { csfd.displayFavoriteButton(); }
            if (settings.hideUserControlPanel) { csfd.hideUserControlPanel(); }
            if (await csfd.onOtherUserHodnoceniPage()) {
                if (settings.compareUserRatings) { csfd.addRatingsColumn(); }
            }
        }
    }

    // let t0 = performance.now();
    // const $siteHtml = await $.get(GREASYFORK_URL);
    // let t1 = performance.now();
    // console.log("Call to 'await $.get(GREASYFORK_URL)' took " + (t1 - t0) + " ms.");

    // If not already in session storage, get new version from greasyfork and display changelog over version link
    let updateCheckJson = sessionStorage.updateChecked !== undefined ? JSON.parse(sessionStorage.updateChecked) : {};
    let $verLink = $('#script-version');
    if (Object.keys(updateCheckJson).length !== 0) {
        const difference = (Date.now() - updateCheckJson.lastCheck) / 60 / 60 / 60;
        const curVersion = VERSION_NUM.replace('v', '');
        // If more than 5 minutes, check for update
        if (difference >= 5) {
            let version = await csfd.checkForUpdate();
            let changelogText = await csfd.getChangelog();
            updateCheckJson.changelogText = changelogText;
            $verLink.attr("data-tippy-content", changelogText);
            if (version !== curVersion) {
                updateCheckJson.newVersion = true;
                updateCheckJson.newVersionNumber = version;

                let versionText = `${$verLink.text()} (Update v${version})`;
                $verLink.text(versionText);
                updateCheckJson.versionText = versionText;
            } else {
                updateCheckJson.newVersion = false;
                updateCheckJson.versionText = VERSION_NUM;
            }
            updateCheckJson.lastCheck = Date.now();
            sessionStorage.updateChecked = JSON.stringify(updateCheckJson);
        } else {
            if (updateCheckJson.newVersion === true) {
                if (updateCheckJson.newVersionNumber === curVersion) {
                    $verLink.text(`v${curVersion}`);
                } else {
                    const versionText = `${$verLink.text()} (Update v${updateCheckJson.newVersionNumber})`;
                    $verLink.text(versionText);
                }
                $verLink.attr("data-tippy-content", updateCheckJson.changelogText);
            } else {
                $verLink.attr("data-tippy-content", updateCheckJson.changelogText);
            }
            // $('#script-version')
            //     .text(updateCheckJson.versionText)
            //     .attr("data-tippy-content", updateCheckJson.changelogText);
        }

    } else {
        let version = await csfd.checkForUpdate();
        let curVersion = VERSION_NUM.replace('v', '');
        if (version !== curVersion) {
            updateCheckJson.newVersion = true;
            let $verLink = $('#script-version');
            let versionText = `${$verLink.text()} (Update v${version})`;
            updateCheckJson.versionText = versionText;
            updateCheckJson.newVersionNumber = version;
            let changelogText = await csfd.getChangelog();
            $verLink.text(versionText);
            updateCheckJson.changelogText = changelogText;
            $verLink.attr("data-tippy-content", changelogText);
        } else {
            updateCheckJson.newVersion = false;
            updateCheckJson.versionText = VERSION_NUM;
        }
        updateCheckJson.lastCheck = Date.now();
        sessionStorage.updateChecked = JSON.stringify(updateCheckJson);
    }

    // Call TippyJs constructor
    await refreshTooltips();

})();
