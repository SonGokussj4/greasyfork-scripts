// ==UserScript==
// @name         CSFD porovnání hodnocení
// @namespace    csfd.cz
// @version      0.3.5
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
    showControlPanelOnHover: true,
    removeRegistrationPanel: true,
    clickableHeaderBoxes: true,
    hideSelectedUserReviews: false,
    hideSelectedUserReviewsList: [],
};

function getSettings() {
    if (!localStorage[SETTINGSNAME]) {
        localStorage.setItem(SETTINGSNAME, JSON.stringify(defaultSettings));
        return defaultSettings;
    } else {
        return JSON.parse(localStorage[SETTINGSNAME]);
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

    // const delay = ms => new Promise(res => setTimeout(res, ms));
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

        isLoggedIn() {
            return $('.profile.initialized').length > 0;
        }

        getCurrentUser() {
            let loggedInUser = $('.profile.initialized').attr('href');
            if (typeof loggedInUser !== 'undefined') {
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

        refresh() {
            let url = this.userUrl + "hodnoceni/";
            this.loadHodnoceniPage(url);
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
                    // Strip it '(2 403)' --> '2403'
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

        loadInitialSettings() {
            // GLOBAL
            $('#chkRemoveRegistrationPanel').attr('checked', settings.removeRegistrationPanel);
            $('#chkControlPanelOnHover').attr('checked', settings.showControlPanelOnHover);
            $('#chkClickableHeaderBoxes').attr('checked', settings.clickableHeaderBoxes);

            // USER
            $('#chkDisplayMessageButton').attr('checked', settings.displayMessageButton);
            $('#chkDisplayFavoriteButton').attr('checked', settings.displayFavoriteButton);

            // FILM/SERIES
            $('#chkHideSelectedUserReviews').attr('checked', settings.hideSelectedUserReviews);
            if (settings.hideSelectedUserReviews === false) { $('#txtHideSelectedUserReviews').parent().hide(); }
            $('#txtHideSelectedUserReviews').val(settings.hideSelectedUserReviewsList.join(', '));
        }

        addSettingsEvents() {
            // GLOBAL
            $('#chkRemoveRegistrationPanel').change(function () {
                settings.removeRegistrationPanel = this.checked;
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

            $('#chkHideSelectedUserReviews').change(function () {
                settings.hideSelectedUserReviews = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
                $('#txtHideSelectedUserReviews').parent().toggle();
            });

            // FILM/SERIES
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
            if (location.href.includes('/hodnoceni') && location.href.includes('/uzivatel/')) {
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
                csfd.storageKey = `${SCRIPTNAME}_${csfd.userUrl.split("/")[2].split("-")[1]}`;
                csfd.REFRESH_RATINGS();
            });
        }

        createSendMessageButton() {
            let userHref = $('#dropdown-control-panel li a.ajax').attr('href');
            if (userHref === undefined) {
                console.log("fn createSendMessageButton(): can't find user href, exiting function...");
                return;
            }
            let button = document.createElement("button");
            button.setAttribute("style", "float: right; border-radius: 5px;");
            button.setAttribute("title", "Poslat zprávu");
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
            let href = favoriteButton.attr('href');
            let text = favoriteButton[0].text;
            let button = document.createElement("button");
            button.setAttribute("style", "float: right; border-radius: 5px; margin: 0px 5px;");
            button.setAttribute("title", text);
            button.innerHTML = `
                <a class="ajax"
                    rel="contentModal"
                    data-mfp-src="#panelModal"
                    href="${href}"><i class="icon icon-favorites"></i></a>
            `;
            $(".user-profile-content > h1").append(button);
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

        removeBox_RegistrujSe() {
            $('.box--homepage-motivation-middle').remove();
            // $('section.box--homepage-video').parent().toggleClass('column-70 column-100');
        }

        addSettingsPanel() {
            let button = document.createElement('li');
            let resetLabelStyle = "-webkit-transition: initial; transition: initial; font-weight: initial; display: initial !important;";
            button.innerHTML = `
                <a href="#show-search" class="user-link initialized">CC</a>
                <div class="dropdown-content notifications" style="right: 150px; width: max-content;">

                    <div class="dropdown-content-head">
                        <h2>CSFD-Compare nastavení</h2>
                    </div>

                    <article class="article">
                        <h2 class="article-header">Globální úpravy</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkRemoveRegistrationPanel" name="remove-registration-panel">
                                <label for="chkRemoveRegistrationPanel" style="${resetLabelStyle}">Skrýt panel "Registruj se" (dom. stránka)</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkControlPanelOnHover" name="control-panel-on-hover">
                                <label for="chkControlPanelOnHover" style="${resetLabelStyle}">Otevřít ovládací panel přejetím myší (netřeba klikat)</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkClickableHeaderBoxes" name="control-panel-on-hover">
                                <label for="chkClickableHeaderBoxes" style="${resetLabelStyle}">Klikatelný celý box, ne jen tlačítko "VÍCE"</label>
                            </div>
                        </section>
                    </article>

                    <article class="article">
                        <h2 class="article-header">Uživatelé</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkDisplayMessageButton" name="messages">
                                <label for="chkDisplayMessageButton" style="${resetLabelStyle}">Tlačítko odeslání zprávy</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkDisplayFavoriteButton" name="display-favorite-button">
                                <label for="chkDisplayFavoriteButton" style="${resetLabelStyle}">Tlačítko přidat/odebrat z oblíbených</label>
                            </div>
                        </section>
                    </article>

                    <article class="article">
                        <h2 class="article-header">Film/Seriál</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideSelectedUserReviews" name="ignore-people">
                                <label for="chkHideSelectedUserReviews" style="${resetLabelStyle}">Skrýt recenze lidí</label>
                                <div>
                                    <input type="textbox" id="txtHideSelectedUserReviews" name="ignore-people-list">
                                    <label style="${resetLabelStyle}">(např: POMO, golfista)</label>
                                </div>
                            </div>
                        </section>
                    </article>

                </div>
            `;
            $('.header-bar').prepend(button);

            $(button).on("hover mouseover", function () {
                if (!$(button).hasClass("active")) {
                    $(button).addClass("active");
                }
            });

            $(button).on("mouseleave", function () {
                if ($(button).hasClass("active")) {
                    $(button).removeClass("active");
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

        clickableHeaderBoxes() {
            // // Does not work, the hell...
            // let userLinks = $('.user-link');
            // for (const element of userLinks) {
            //     let href = window.location.origin + $(element).attr('href');
            //     $(element).unbind();
            //     $(element).wrap(`<a href="${href}"></a>`);
            // }

            let headers = $('.dropdown-content-head');
            console.log(headers);
            for (const div of headers) {
                let btn = $(div).find('a.button');
                if (btn.length === 0) { continue; }
                if (btn[0].text !== "více") { continue; }

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

            let boxHeaders = $('.box-header');
            console.log("boxHeaders:", boxHeaders);
            for (const headerBox of boxHeaders) {
                let btn = $(headerBox).find('a.button');
                if (btn.length === 0) { continue; }
                if (btn[0].text !== "více") { continue; }

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
    }

    // SCRIPT START
    // ============================================================================================
    let csfd = new Csfd($('div.page-content'));

    // =================================
    // EVERY TIME
    // =================================
    let settings = getSettings();
    csfd.addSettingsPanel();
    csfd.loadInitialSettings();
    csfd.addSettingsEvents();


    // =================================
    // NOT LOGGED IN
    // =================================
    if (!csfd.isLoggedIn()) {
        csfd.hideControlPanel();
    }


    // =================================
    // LOGGED IN
    // =================================
    if (csfd.isLoggedIn()) {

        // User pleasure
        if (settings.removeRegistrationPanel == true) { csfd.removeBox_RegistrujSe(); }
        if (settings.showControlPanelOnHover == true) { csfd.openControlPanelOnHover(); }
        if (settings.clickableHeaderBoxes == true) { csfd.clickableHeaderBoxes(); }

        // Load initial class properties
        csfd.userUrl = csfd.getCurrentUser();
        csfd.storageKey = `${SCRIPTNAME}_${csfd.userUrl.split("/")[2].split("-")[1]}`;
        csfd.userRatingsUrl = `${csfd.userUrl}/hodnoceni`;
        csfd.stars = csfd.getStars();

        // console.log("BEFORE:", csfd.RESULT);
        // await csfd.getAllPages();
        // console.log("AFTER:", Object.keys(csfd.RESULT).length);

        // Dynamic LocalStorage update on Film/Series in case user changes ratings
        if (location.href.includes('/film/')) {
            csfd.checkAndUpdateRatings();
            if (settings.hideSelectedUserReviews == true) { csfd.hideSelectedUserReviews(); }
        }

        if (location.href.includes('/uzivatel/')) {
            if (settings.displayMessageButton == true) { csfd.createSendMessageButton(); }
            if (settings.displayFavoriteButton == true) { csfd.displayFavoriteButton(); }
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

})();
