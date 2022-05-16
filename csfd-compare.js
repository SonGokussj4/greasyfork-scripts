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
// ==/UserScript==


// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @updateURL    https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @downloadURL  https://XXraw.githubusercontent.com/SonGokussj4/GitHub-userscripts/master/gist.js
// @supportURL   https://XXgithub.com/SonGokussj4/GitHub-userscripts/issues


const VERSION = 'v0.5.12';
const SCRIPTNAME = 'CSFD-Compare';
const SETTINGSNAME = 'CSFD-Compare-settings';
const GREASYFORK_URL = 'https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare';

const SETTINGSNAME_HIDDEN_BOXES = 'CSFD-Compare-hiddenBoxes';

// const API_SERVER = 'http://localhost:5000';
const API_SERVER_HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
}


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


// const movieType = Object.freeze({
//     movie: 0,
//     series: 1,
//     season: 2,
//     episode: 3,
//     tvshow: 4,
// });


let defaultSettings = {
    // HOME PAGE
    hiddenSections: [],
    // GLOBAL
    showControlPanelOnHover: true,
    clickableHeaderBoxes: true,
    clickableMessages: true,
    addStars: true,
    addComputedStars: true,
    // USER
    displayMessageButton: true,
    displayFavoriteButton: true,
    hideUserControlPanel: true,
    compareUserRatings: true,
    // FILM/SERIES
    addRatingsDate: false,
    showLinkToImage: true,
    ratingsEstimate: true,
    ratingsFromFavorites: true,
    addRatingsComputedCount: true,
    hideSelectedUserReviews: false,
    hideSelectedUserReviewsList: [],
    // ACTORS
    showOnOneLine: false,
};


/**
 * Check if settings are valid. If not, reset them.
 * Return either unmodified or modified settings
 * @param {*} settings - LocalStorage settings current value
 * @param {string} settingsName - Settings Name
 */
async function checkSettingsValidity(settings, settingsName) {

    if (settingsName === SETTINGSNAME_HIDDEN_BOXES) {
        const isArray = Array.isArray(settings);
        let keysValid = true;
        settings.forEach(element => {
            const keys = Object.keys(element);
            if (keys.length !== 2) {
                keysValid = false;
            }
        });

        if (!isArray || !keysValid) {
            settings = defaultSettings.hiddenSections;
            localStorage.setItem(SETTINGSNAME_HIDDEN_BOXES, JSON.stringify(settings));
            return settings;
        }
    }
    return settings;
}

async function delay(t) {
    return new Promise(resolve => {
        setTimeout(resolve, t);
    });
}

async function getSettings(settingsName = SETTINGSNAME) {
    if (!localStorage[settingsName]) {
        if (settingsName === SETTINGSNAME_HIDDEN_BOXES) {
            defaultSettings = [];
        }
        console.log(`ADDDING DEFAULTS: ${defaultSettings}`);
        localStorage.setItem(settingsName, JSON.stringify(defaultSettings));
        return defaultSettings;
    } else {
        return JSON.parse(localStorage[settingsName]);
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

/**
 * Take a list of dictionaries and return merged dictionary
 * @param {*} list
 * @returns
 */
async function mergeDict(list) {
    const merged = list.reduce(function (r, o) {
        Object.keys(o).forEach(function (k) { r[k] = o[k]; });
        return r;
    }, {});
    return merged;
}

async function onHomepage() {
    let check = false;
    if (document.location.pathname === '/') {
        check = true;
    }
    return check;
}

/**
 * Get movieId from url when on season/episode page
 * @param {*} html
 * @returns {int|null} parentId
 *
 * Example:
 * - href = '/film/1058697-dev/1121972-epizoda-6/' --> '1058697'
 * - href = '/film/774319-zhoubne-zlo/' --> null
 * - href = '1058697-devadesatky' --> null
 * - href = 'nothing-here' --> null
 */
async function getParentId(html = null) {
    // POZOR: nemohu pouzit 'html' pro 'meta[property="og:url"]', protoze je v dokumentu nahore, nad mnou predanym 'html'
    const idArray = $('meta[property="og:url"]').attr('content').match(/\d+-[\w-]+/ig)
    return idArray.length === 2 ? idArray[0].split('-')[0] : null;
}

async function getDuration(html = null) {
    let result = null;
    if (!html) {
        result = $("div.origin").text().trim().replaceAll('\t', '').split(',').slice(-1,)[0].trim().replaceAll('\n', ' ');
    } else {
        result = $(html).find("div.origin").text().trim().replaceAll('\t', '').split(',').slice(-1,)[0].trim().replaceAll('\n', ' ');
    }
    return result ? result : null;
}

async function getCountry(html = null) {
    let result = null;
    if (!html) {
        result = $("div.origin").text().split(",")[0].trim().replaceAll('\t', '').split('/').map((item) => item.trim()).join("/");
    } else {
        result = $(html).find("div.origin").text().split(",")[0].trim().replaceAll('\t', '').split('/').map((item) => item.trim()).join("/");
    }
    return result ? result : null;
}

async function getGenres(html = null) {
    let result = null;
    if (!html) {
        result = $('div.genres').text().split('/').map(item => item.trim());
    } else {
        result = $(html).find('div.genres').text().split('/').map(item => item.trim());
    }
    return result ? result : null;

}
async function getSeasonsCount(html = null) {
    // const result = $('div.box-header h3').text().match(/(?<=(?:Série|Série)[(])(\d)+/ig);
    let result = null;
    if (!html) {
        result = $('div.box-header h3').text().match(/(?<=(?:Série|Série)[(])(\d)+/ig);
    } else {
        result = $(html).find('div.box-header h3').text().match(/(?<=(?:Série|Série)[(])(\d)+/ig);
    }
    return result ? parseInt(result[0]) : null;
}
async function getEpisodesCount(html = null) {
    // const result = $('div.box-header h3').text().match(/(?<=(?:Epizody|Epizódy)[(])(\d)+/ig);
    let result = null;
    if (!html) {
        result = $('div.box-header h3').text().match(/(?<=(?:Epizody|Epizódy)[(])(\d)+/ig);
    } else {
        result = $(html).find('div.box-header h3').text().match(/(?<=(?:Epizody|Epizódy)[(])(\d)+/ig);
    }
    return result ? parseInt(result[0]) : null;
}

async function getFanclubCount(html = null) {
    let result = null;
    if (!html) {
        result = $(".fans-btn a").text().match(/\([\d  \t\n]+\)/ig);
    } else {
        result = $(html).find(".fans-btn a").text().match(/\([\d  \t\n]+\)/ig);
    }
    return result ? parseInt(result[0].slice(1, -1).replace(/[  ]/g, '')) : null;

}

async function getType(html = null) {
    let typeText = null;
    if (!html) {
        typeText = $('div.film-header-name span.type').text();
    } else {
        typeText = $(html).find('div.film-header-name span.type').text();
    }

    const showType = (typeText.length > 1 ? typeText.slice(1, -1) : 'film');

    switch (showType) {
        case "epizoda": case "epizóda":
            return 'episode';

        case "série": case "séria":
            return 'season';

        case "seriál":
            return 'series';

        case "TV film":
            return 'tv movie';

        case 'film':
            return 'movie';

        default:
            return showType;
    }
}

async function getSeasonId(html = null) {
    const type = await getType(html);

    if (type === 'movie' || type === 'tv movie' || type === 'series') {
        return null;
    }

    let seasonId = null;

    if (type === 'episode') {
        const episodeHeaderArray = $('header.film-header h2 a[href]').get().map(x => $(x).attr('href'));
        if (!episodeHeaderArray) {
            return null;
        }
        const matched = episodeHeaderArray[episodeHeaderArray.length -1].match(/(\d)+-[-\w]+/ig);
        seasonId = matched[matched.length - 1].split('-')[0];
        // console.log("seasonId:", seasonId);

    } else if (type === 'season') {
        const movieUrlTitlesArray = $('meta[property="og:url"]').attr('content').match(/\d+-[\w-]+/ig);
        seasonId = movieUrlTitlesArray[movieUrlTitlesArray.length - 1].split('-')[0];
    }
    return seasonId;
}
async function getCurrentDateTime() {
    return new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ' ')
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

        /**
         *
         * @returns {str} Current movie: <MovieId>-<MovieUrlTitle>
         *
         * Example:
         * - https://www.csfd.sk/film/739784-star-trek-lower-decks/prehlad/ --> 739784-star-trek-lower-decks
         * - https://www.csfd.cz/film/1032817-naomi/1032819-don-t-believe-everything-you-think/recenze/ --> 1032819-don-t-believe-everything-you-think
         */
        getCurrentFilmUrl() {
            const foundMatch = $('meta[property="og:url"]').attr('content').match(/\d+-[\w-]+/ig);
            if (!foundMatch) {
                console.error("TODO: getCurrentFilmUrl() Film URL wasn't found...");
                throw (`${SCRIPTNAME} Exiting...`);
            }
            return foundMatch[foundMatch.length - 1];


        }

        async getFilmUrlFromHtml(html) {
            const foundMatch = $(html).find('meta[property="og:url"]').attr('content').match(/\d+-[\w-]+/ig);
            if (foundMatch.length == 1) {
                return foundMatch[0];
            } else if (foundMatch.length == 2) {
                return foundMatch[1];
            }
            console.error("TODO: getCurrentFilmUrl() Film URL wasn't found...");
            throw (`${SCRIPTNAME} Exiting...`);
        }

        async updateInLocalStorage(ratingsObject) {
            // console.log({ ratingsObject });

            // Check if film is in LocalStorage
            let filmUrl = this.getCurrentFilmUrl();
            let movieId = await csfd.getMovieIdFromHref(filmUrl);

            const ratings = await this.getLocalStorageRatings();
            let myRating = ratings[movieId] || undefined;

            // console.log({ movieId });
            // console.log({ myRating });

            // Item not in LocalStorage, add it then!
            if (myRating === undefined) {
                // Item not in LocalStorage, add
                this.stars[movieId] = ratingsObject;
                localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
                return true;
            }
            let movie = this.stars[movieId];
            movie.rating = ratingsObject.rating;

            if (myRating.rating !== ratingsObject.rating) {
                console.log(`Ratings different: LocalStorage[${myRating.rating}] --> Page[${ratingsObject.rating}]`);
                movie.date = ratingsObject.date;
                this.stars[movieId] = movie;
                localStorage.setItem(this.storageKey, JSON.stringify(this.stars));

                if (myRating.type === "episode" || myRating.type === "season") {
                    console.log(`This is ${myRating.type}... ParentId: ${myRating.parentId}`);
                    let newUrl = `/film/${myRating.parentId}/`;  // /film/957504/ //TODO: nehezke...
                    console.log({ newUrl });
                    let $content = await csfd.getRelativeUrlContent(newUrl);
                    let result = await csfd.getComputedRatings($content);
                    console.log(result);
                    if (result.movieId !== '') {
                        let episodeParent = ratings[result.movieId];  // LocalStorage
                        console.log({ episodeParent });
                        let episodeParentUrl = `/film/${result.movieId}/`;
                        console.log({ episodeParentUrl });
                        let $episodeParentContent = await csfd.getRelativeUrlContent(episodeParentUrl);
                        let episodeParentResult = await csfd.getComputedRatings($episodeParentContent);  // Web actual
                        console.log({ episodeParentResult });
                        if (episodeParent.rating !== episodeParentResult.ratingCount) {
                            console.log(`Ratings Parent different: LC[${episodeParent.rating}] != Page[${episodeParentResult.ratingCount}]`);
                            episodeParent.rating = episodeParentResult.ratingCount;
                            episodeParent.countedFromText = episodeParentResult.countedFromText;
                            console.log(`Updating movie: [${result.movieId}]`);
                            console.log(`  Rating: [${episodeParent.rating}] --> [${episodeParentResult.ratingCount}]`);
                            console.log(`  CountedFromText: [${episodeParent.countedFromText}] --> [${episodeParentResult.countedFromText}]`);
                            this.stars[result.movieId] = episodeParent;
                            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
                        }
                    }
                }

                return true;

            } else if ((myRating.counted !== ratingsObject.counted) || (myRating.countedFromText !== ratingsObject.countedFromText)) {
                console.log(`Ratings Counted different: LC[${myRating.counted}] != Page[${ratingsObject.counted}]`);
                movie.date = ratingsObject.date;  // TODO: prazdny string nebo objekt
                movie.counted = ratingsObject.counted;
                movie.countedFromText = ratingsObject.countedFromText;
                this.stars[movieId] = movie;
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
            // let $activeStars = this.csfdPage.find(".star.active:not('.computed')");
            let $activeStars = this.csfdPage.find(".star.active");

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

        async isCurrentFilmRatingComputed() {
            const $computedStars = this.csfdPage.find(".current-user-rating .star-rating.computed");

            if ($computedStars.length !== 0) { return true; }

            return false;
        }

        // async getCurrentFilmComputedRating() {
        //     const $computedStars = this.csfdPage.find(".current-user-rating .star-rating.computed");
        //     const $starsSpan = $($computedStars).find('span.stars');
        //     console.log("$starsSpan: ", $starsSpan);
        //     const starCount = await csfd.getStarCountFromSpanClass($starsSpan);
        //     console.log("starCount: ", starCount);
        //     return starCount;
        // }

        async getComputedFromText() {
            const $curUserRating = this.csfdPage.find('li.current-user-rating');
            const countedText = $($curUserRating).find('span[title]').attr('title');
            return countedText;
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

            // GLOBAL
            $('#chkControlPanelOnHover').attr('checked', settings.showControlPanelOnHover);
            $('#chkClickableHeaderBoxes').attr('checked', settings.clickableHeaderBoxes);
            $('#chkClickableMessages').attr('checked', settings.clickableMessages);
            $('#chkAddStars').attr('checked', settings.addStars);
            $('#chkAddComputedStars').attr('checked', settings.addComputedStars);

            // USER
            $('#chkDisplayMessageButton').attr('checked', settings.displayMessageButton);
            $('#chkDisplayFavoriteButton').attr('checked', settings.displayFavoriteButton);
            $('#chkHideUserControlPanel').attr('checked', settings.hideUserControlPanel);
            $('#chkCompareUserRatings').attr('checked', settings.compareUserRatings);

            // FILM/SERIES
            $('#chkAddRatingsDate').attr('checked', settings.addRatingsDate);
            $('#chkShowLinkToImage').attr('checked', settings.showLinkToImage);
            $('#chkRatingsEstimate').attr('checked', settings.ratingsEstimate);
            $('#chkRatingsFromFavorites').attr('checked', settings.ratingsFromFavorites);
            $('#chkAddRatingsComputedCount').attr('checked', settings.addRatingsComputedCount);
            $('#chkHideSelectedUserReviews').attr('checked', settings.hideSelectedUserReviews);
            settings.hideSelectedUserReviews || $('#txtHideSelectedUserReviews').parent().hide();
            // if (settings.hideSelectedUserReviews === false) { $('#txtHideSelectedUserReviews').parent().hide(); }
            if (settings.hideSelectedUserReviewsList !== undefined) { $('#txtHideSelectedUserReviews').val(settings.hideSelectedUserReviewsList.join(', ')); }

            // ACTORS
            $('#chkShowOnOneLine').attr('checked', settings.showOnOneLine);
        }

        async addSettingsEvents() {
            // HOME PAGE

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

            $('#chkAddStars').change(function () {
                settings.addStars = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkAddComputedStars').change(async function () {
                settings.addComputedStars = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));

                // TODO: WORK IN PROGRESS
                // if (this.checked === true) {
                //     // TODO: Zkontrolovat v LocalStorage, jestli tam nejsou serie, ktere nemaji parenta
                //     let allEpisodes = await csfd.checkForParentSeries();
                //     console.log({ allEpisodes });

                //     let childrenEpisodes = await csfd.getChildrenEpisodes(allEpisodes);
                //     console.log({ childrenEpisodes });

                //     let childrenWithoutParents = await csfd.getChildrenWithoutParents(childrenOnly);
                //     console.log({ childrenWithoutParents });

                //     let missingParents = await csfd.getMissingParents(childrenWithoutParents);
                //     console.log(missingParents);

                //     // TODO: Ukazat popup, ktery se uzivatele zepta "schazi nacist 12 dalsich serii. Provest?"
                //     let answer = confirm(`Schazi [${missingParents.length}] serii. Nacist ted?`);
                //     console.log({ answer });

                //     // TODO: Pokud uzivatel zada, ze ne, ukaze to cislo u textu vpravo v CC
                //     if (!answer) {
                //         console.log("pouze  ukazuji, nenacitam");
                //     } else {
                //     // TODO: Pokud uzivatel zada, ze ano, iteruje pres parenty a nacte do LS informace o serii
                //         console.log("Iteruji a nacitam do LS");
                //     }
                // }

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
            $('#chkShowLinkToImage').change(function () {
                settings.showLinkToImage = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkRatingsEstimate').change(function () {
                settings.ratingsEstimate = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

            $('#chkRatingsFromFavorites').change(function () {
                settings.ratingsFromFavorites = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });

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

            // ACTORS
            $('#chkShowOnOneLine').change(function () {
                settings.showOnOneLine = this.checked;
                localStorage.setItem(SETTINGSNAME, JSON.stringify(settings));
                Glob.popup("Nastavení uloženo (obnovte stránku)", 2);
            });
        }

        async checkForParentSeries() {
            let allEntries = JSON.parse(localStorage[this.storageKey]);

            let filterArray = Array();
            for (const [key, value] of Object.entries(allEntries)) {
                if (value.type === 'episode') {
                    filterArray.push([key, value]);
                }
            }

            return filterArray;
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

        async onPersonalFavorite() {
            if (location.href.includes('/soukromne/oblubene/') || location.href.includes('/soukrome/oblibene/')) {
                if (!location.href.includes(this.userUrl)) {
                    return true;
                }
            }
            return false;
        }

        async notOnUserPage() {
            if (location.href.includes('/uzivatel/') && location.href.includes(this.userUrl)) {
                return false;
            }
            return true;
        }

        exportRatings() {
            localStorage.setItem(this.storageKey, JSON.stringify(this.stars));
        }

        importRatings() {
            if (localStorage[this.storageKey]) {
                this.stars = JSON.parse(localStorage[this.storageKey]);
            }
        }

        /**
         *
         * @param {str} href csfd link for movie/series/episode
         * @returns {str} Movie ID number
         *
         * Example:
         * - href = '/film/774319-zhoubne-zlo/' --> '774319'
         * - href = '/film/1058697-devadesatky/1121972-epizoda-6/' --> '1121972'
         * - href = '1058697-devadesatky' --> '1058697'
         * - href = 'nothing-here' --> null
         */
        async getMovieIdFromHref(href) {
            if (!href) { return null; }
            const found_groups = href.match(/(\d)+-[-\w]+/ig);

            if (!found_groups) { return null; }
            const movieIds = found_groups.map(x => x.split("-")[0]);

            return movieIds[movieIds.length - 1];
        }

        async addStars() {
            if (location.href.includes('/zebricky/') || location.href.includes('/rebricky/')) {
                return;
            }
            let starsCss = { marginLeft: "5px" };
            if (await this.onOtherUserPage() || await this.onPersonalFavorite()) {
                starsCss = {
                    marginLeft: "5px",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderColor: "#c78888",
                    borderRadius: "5px",
                    padding: "0px 5px",
                };
            }

            let $links = $('a.film-title-name');
            let list_of_hrefs = [];
            for (var i = 0; i < $links.length; i++) {
                list_of_hrefs.push($links[i].href);
            }

            // let csfddb = await $.ajax({
            //     url: `${API_SERVER}/api/user-ratings/load/songokussj`,
            //     dataType: 'json',
            //     type: 'post',
            //     contentType: 'application/json',
            //     data: JSON.stringify({
            //         'movies': list_of_hrefs
            //     }),
            // });
            // console.log({ csfddb });

            for (const $link of $links) {
                let href = $($link).attr('href');

                // Clean href with 'recenze' or 'diskuze'
                // /film/774319-zhoubne-zlo/recenze/etcetc --> /film/774319-zhoubne-zlo
                href = href.split("recenze")[0];
                href = href.split("recenzie")[0];
                href = href.split("diskuze")[0];
                href = href.split("diskusie")[0];

                // console.log({ href });
                let movieId = await csfd.getMovieIdFromHref(href);
                // console.log({ movieId });

                // let res = this.stars[href];
                let res = this.stars[movieId];
                if (res === undefined) {
                    continue;
                }

                // console.log(res);

                let $sibl = $($link).closest('td').siblings('.rating,.star-rating-only');
                if ($sibl.length !== 0) {
                    continue;
                }
                // Don't show computed ratings when settings are off and res.counted == true
                if (!settings.addComputedStars && res.counted === true) {
                    continue;
                }

                let starClass = res.rating !== 0 ? `stars-${res.rating}` : `trash`;
                let starText = res.rating !== 0 ? "" : "odpad!";
                let $starSpan = $("<span>", {
                    'class': `star-rating`,
                    html: `<span class="stars ${starClass}" title="${res.date}">${starText}</span>`
                }).css(starsCss);

                // console.log({ href });
                // console.log({ res });

                if (settings.addComputedStars) {
                    // If the record has counted === true,
                    //  add 'computed' class that will color the starts to black
                    //  and "counted from X episodes" text to the title attr
                    if (res.counted === true) {
                        $starSpan.addClass("computed");
                        $starSpan.find('span').attr("title", res.countedFromText);

                        // "spočteno z epizod: 1" --> "['spočteno', 'z', 'epizod:', '1']"
                        let splitted = res.countedFromText.split(' ');
                        if (splitted.length === 4) {
                            let num = splitted.pop();
                            // Add <sup> of the episodes the count was computed from
                            let $numSpan = $("<span>", { 'html': `<sup> (${num})</sup>` }).css({ 'font-size': '13px', 'color': '#7b7b7b' });
                            $starSpan.find('span').after($numSpan);
                        }
                    }
                }

                $($link).after($starSpan);
            }
        }

        /**
         * On other then logged-in user add column to 'hodnoceni' page for comparing both users ratings
         */
        async addRatingsColumn() {
            const [ratingsInLocalStorage, currentUserRatingsCount] = await Promise.all([
                csfd.getLocalStorageRatingsCount(),
                csfd.getCurrentUserRatingsCount2()
            ]);

            if (ratingsInLocalStorage === 0) { return; }

            // Add warning "span" if localstorage ratings count is not the same as real count
            if (ratingsInLocalStorage !== currentUserRatingsCount) {
                $('.box-header h2').append($('<span>').css({
                    'font-size': '12px',
                    'font-weight': 'normal',
                    'color': '#7b7b7b',
                    'margin-left': '10px',
                    'vertical-align': 'bottom'
                }).text(
                    `⚠️ Načteno pouze ${ratingsInLocalStorage}/${currentUserRatingsCount}`
                ));
            }

            let $page = this.csfdPage;
            let $tbl = $page.find('#snippet--ratings table tbody');
            let starsDict = this.getStars();

            $tbl.find('tr').each(async function () {
                let $row = $(this);
                let url = $($row).find('.name').find('a').attr('href');
                const movieId = await csfd.getMovieIdFromHref(url);
                console.log(`Url[${url}]  movieId[${movieId}]`);
                const myRating = starsDict[movieId] || {};

                let $span = "";
                if (myRating.rating === 0) {
                    $span = `<span class="stars trash" title="${myRating.date}>odpad!</span>`;
                } else {
                    if (myRating.counted === true) {
                        const splitted = myRating.countedFromText.split(' ');
                        let num = splitted.length === 4 ? splitted.pop() : 0;
                        $span = (`
                            <span class="star-rating computed">
                                <span class="stars stars-${myRating.rating}" title="${myRating.countedFromText}"></span>
                                <span style="font-size: 13px; color: #7b7b7b; position: absolute; margin-left: 2px;"><sup> (${num})</sup></span>
                            </span>
                        `);
                    } else {
                        $span = (`
                            <span class="star-rating">
                                <span class="stars stars-${myRating.rating}" title="${myRating.date}"></span>
                            </span>
                        `);
                    }
                }

                $row.find('td:nth-child(2)').after(`
                    <td class="star-rating-only" style="width: 80px;">
                        ${$span}
                    </td>
                `);
            });
        }

        async openControlPanelOnHover() {
            let btn = $('.button-control-panel');
            let panel = $('#dropdown-control-panel');
            $(btn).on('mouseover', () => {
                if (!panel.hasClass('active')) {
                    panel.addClass('active');
                    let windowWidth = $(window).width();
                    if (windowWidth <= 635) {
                        panel.appendTo(document.body);
                        panel.css("top", "133px");
                        panel.css("right", "15px");
                    }
                }
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
                        Uložené: ${ratingsInLS} / ${curUserRatings}
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
            $('.csfd-compare-settings').after($div);

            let forceUpdate = ratingsInLS > curUserRatings ? true : false;

            $($button).on("click", async function () {
                let csfd = new Csfd($('div.page-content'));
                csfd.refreshAllRatings(csfd, forceUpdate);
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

        async showLinkToImageOnSmallMoviePoster() {
            let $film = this.csfdPage.find('.film-posters');
            let $img = $film.find('img');
            let src = $img.attr('src');
            let width = $img.attr('width');

            let $div = $(`<div>`, { "class": 'link-to-image' })
                .css({
                    position: 'absolute',
                    right: '0px',
                    bottom: '0px',
                    display: 'none',
                    'z-index': '999',
                    'padding-left': '0.5em',
                    'padding-right': '0.5em',
                    'margin-bottom': '0.5em',
                    'margin-right': '0.5em',
                    'background-color': 'rgba(255, 245, 245, 0.85)',
                    'border-radius': '5px 0px',
                    'font-weight': 'bold'
                })
                .html(`<a href="${src}">w${width}</a>`);

            $film.find('a').after($div);

            $film.on('mouseover', () => {
                $div.show("fast");
            });
            $film.on('mouseleave', () => {
                $div.hide("fast");
            });
        }

        /**
         * Show link for all possible picture sizes
         */
        async showLinkToImageOnOtherGalleryImages() {

            let $pictures = this.csfdPage.find('.gallery-item picture');

            let pictureIdx = 0;
            for (const $picture of $pictures) {
                let obj = {};

                let src = $($picture).find('img').attr('src').replace(/cache[/]resized[/]w\d+[/]/g, '');

                obj['100 %'] = src;

                let $sources = $($picture).find('source');
                for (const $source of $sources) {

                    let attributeText = $($source).attr('srcset').replace(/\dx/g, '').replace(/\s/g, '');
                    let links = attributeText.split(',');

                    for (const link of links) {

                        const match = link.match(/[/]w(\d+)/);

                        if (match !== null) {
                            if (match.length === 2) {
                                const width = match[1];
                                obj[width] = link;
                            }
                        }
                    }
                }

                let idx = 0;
                for (const item in obj) {

                    let $div = $(`<div>`, { "class": `link-to-image-gallery picture-idx-${pictureIdx}` })
                        .css({
                            position: 'absolute',
                            right: '0px',
                            bottom: '0px',
                            display: 'none',
                            'z-index': '999',
                            'padding-left': '0.5em',
                            'padding-right': '0.5em',
                            'margin-bottom': `${0.5 + (idx * 2)}em`,
                            'margin-right': '0.5em',
                            'background-color': 'rgba(255, 245, 245, 0.75)',
                            'border-radius': '5px 0px',
                            'font-weight': 'bold'
                        })
                        .html(`<a href="${obj[item]}">${item}</a>`);

                    $($picture).find('img').after($div);
                    $($picture).attr('data-idx', pictureIdx);
                    $($picture).parent().css({ position: 'relative' });  // need to have this for absolute position to work

                    idx += 1;
                }

                pictureIdx += 1;

                $($picture).on('mouseover', () => {
                    const pictureIdx = $($picture).attr('data-idx');
                    $(`.link-to-image-gallery.picture-idx-${pictureIdx}`).show("fast");
                });
                $($picture).on('mouseleave', () => {
                    const pictureIdx = $($picture).attr('data-idx');
                    $(`.link-to-image-gallery.picture-idx-${pictureIdx}`).hide("fast");
                });
            }
        }

        /**
         * If film has been rated by user favorite people, make an averate and display it
         * under the normal rating as: oblíbení: X %
         *
         * @returns null
         */
        async ratingsFromFavorites() {
            let $ratingSpans = this.csfdPage.find('li.favored:not(.current-user-rating) .star-rating .stars');

            // No favorite people ratings found
            if ($ratingSpans.length === 0) { return; }

            let ratingNumbers = [];
            for (let $span of $ratingSpans) {
                let num = this.getNumberFromRatingSpan($($span));
                num = num * 20;
                ratingNumbers.push(num);
            }
            let average = (array) => array.reduce((a, b) => a + b) / array.length;
            const ratingAverage = Math.round(average(ratingNumbers));

            let $ratingAverage = this.csfdPage.find('.box-rating-container div.film-rating-average');
            $ratingAverage.html(`
                <span style="position: absolute;">${$ratingAverage.text()}</span>
                <span style="position: relative; top: 25px; font-size: 0.3em; font-weight: 600;">oblíbení: ${ratingAverage} %</span>
            `);

        }
        /**
         * When there is less than 10 ratings on a movie, csfd waits with the rating.
         * This computes the rating from those less than 10 and shows it.
         *
         * @returns null
         */
        async ratingsEstimate() {

            // Find rating-average element
            let $ratingAverage = this.csfdPage.find('.box-rating-container .film-rating-average');

            // Not found, exit fn()
            if ($ratingAverage.length !== 1) { return; }

            // Get the text
            let curRating = $ratingAverage.text().replace(/\s/g, '');

            // If the text if anything than '?%', exit fn()
            if (!curRating.includes('?%')) { return; }

            // Get all other users ratings
            let $userRatings = this.csfdPage.find('section.others-rating .star-rating');

            // If no ratings in other ratings, exit fn()
            if ($userRatings.length === 0) { return; }

            // Fill the list with ratings as numbers
            let ratingNumbers = [];
            for (const $userRating of $userRatings) {
                let $ratingSpan = $($userRating).find('.stars');
                let num = this.getNumberFromRatingSpan($ratingSpan);
                // Transform number to percentage (0 -> 0 %, 1 -> 20 %, 2 -> 40 %...)
                num = num * 20;
                ratingNumbers.push(num);
            }

            // Compute the average
            let average = (array) => array.reduce((a, b) => a + b) / array.length;
            const ratingAverage = Math.round(average(ratingNumbers));

            // Rewrite the displayed rating
            const bgcolor = this.getRatingColor(ratingAverage);
            $ratingAverage
                .text(`${ratingAverage} %`)
                .css({ color: '#fff', backgroundColor: bgcolor })
                .attr('title', `spočteno z hodnocení: ${$userRatings.length}`);
        }
        /**
         * Depending on the percent number, return a color as a string representation
         * 0-29 black; 30-69 blue; 70-100 red
         *
         * @param {int} ratingPercent
         * @returns {string} representation of colour
         */
        getRatingColor(ratingPercent) {
            switch (true) {
                case (ratingPercent < 29):
                    return "#535353";
                case (ratingPercent >= 30 && ratingPercent < 69):
                    return "#658db4";
                case (ratingPercent >= 70):
                    return "#ba0305";
                default:
                    return "#d2d2d2";
            }
        }
        /**
         * From jquery! $span csfd element class (.stars stars-4) return the ratings number (4)
         *
         * @param {jquery} $span
         * @returns int in range 0-5
         */
        getNumberFromRatingSpan($span) {
            // if ($span instanceof jQuery === false) {
            //     $span = $($span)
            // }

            // TODO: využít tuto funkci i při načítání hodnocení do LS
            let rating = 0;
            for (let stars = 0; stars <= 5; stars++) {
                if ($span.hasClass('stars-' + stars)) {
                    rating = stars;
                }
            }
            return rating;
        }
        /**
         * Show clickable link to the absolute url of the image mouse is hovering above.
         *
         * Works with:
         * - Small Movie Poster
         * - Movie Gallery Images
         */
        async showLinkToImage() {
            this.showLinkToImageOnSmallMoviePoster();
            this.showLinkToImageOnOtherGalleryImages();
        }

        /**
         * @param {<span>} filmInfo Combination of 0-3 `<span>` elements
         * @returns {int} `YYYY` (year) if it exists in filmInfo[0], `????` otherwise
         *
         * Example:
         * - (2007)(série)(S02) --> 2007
         * - (2021) --> 2021
         * - --> ????
         */
        async getShowYear(filmInfo) {
            let showYear = (filmInfo.length >= 1 ? $(filmInfo[0]).text().slice(1, -1) : '????');
            return showYear;
        }

        /**
         * Return show type in 'english' language. Works for SK an CZ.
         *
         * @param {<span>} filmInfo Combination of 0-3 `<span>` elements
         * @returns {str} `showType` if it exists in filmInfo[1], `movie` otherwise
         *
         * Posible values: `movie`, `tv movie`, `serial`, `series`, `episode`
         *
         * Example:
         * - (2007)(série)(S02) --> series
         * - (2021)(epizoda)(S02E01) --> episode
         * - (2019) --> movie
         */
        async getShowType(filmInfo) {
            let showType = (filmInfo.length > 1 ? $(filmInfo[1]).text().slice(1, -1) : 'film');

            switch (showType) {
                case "epizoda": case "epizóda":
                    return 'episode';

                case "série": case "séria":
                    return 'season';

                case "seriál":
                    return 'series';

                case "TV film":
                    return 'tv movie';

                case 'film':
                    return 'movie';

                default:
                    return showType;
            }
        }

        /**
         *
         * @param {?} idx Don't know
         * @param {string} url Page url for scraping ratings
         * @returns {dict} {url: {rating:, date:, counted:, countedFromText: }}
         */
        async doSomething(idx, url) {
            let data = await $.get(url);
            let $rows = $(data).find('#snippet--ratings tr');
            let dc = {};
            for (const $row of $rows) {
                let name = $($row).find('td.name a').attr('href');  // /film/697624-love-death-robots/800484-zakazane-ovoce/
                console.log(`$row name = ${name}`);

                let filmInfo = $($row).find('td.name > h3 > span > span');  // (2007)(série)(S02) // (2021)(epizoda)(S02E05)
                // console.log(`FilmInfo text: ${filmInfo.text()}`);
                let [showType, showYear, parentName, [movieId, parentId]] = await Promise.all([
                    csfd.getShowType(filmInfo),
                    csfd.getShowYear(filmInfo),
                    csfd.getParentNameFromEpisodeName(name),
                    csfd.getMovieIdParentIdFromUrl(name),
                ]);

                console.log(`movieId[${movieId}], parentId[${parentId}], parentName[${parentName}]`);

                // If it's an episode, check for parent series and if it's not in the dict yet, add it as 'rated' or 'counted rated'
                if (settings.addComputedStars && showType === 'episode') {
                    // let parentName = await csfd.getParentNameFromEpisodeName(name);  // /film/697624-love-death-robots/
                    // console.log({ parentName });
                    // Not in dict yet, adding as 'counted': true
                    // let year = await showYear;
                    // let parentMovieId = await csfd.getMovieIdFromHref(parentName);
                    console.log({ parentId });

                    if (dc[parentId] === undefined) {
                        const $content = await csfd.getRelativeUrlContent(parentName);
                        const result = await csfd.getComputedRatings($content);
                        console.log(`Adding computed: ${parentId}, url[${parentName}]: showType[${showType}], rating[${result.ratingCount}], title[${result.countedFromText}]`);
                        dc[parentId] = {
                            'url': parentName,
                            'rating': result.ratingCount,
                            'date': '',
                            'counted': true,
                            'countedFromText': result.countedFromText,
                            'type': showType,
                            'year': showYear,
                            'parentId': 0
                        };
                    }
                }

                let $ratings = $($row).find('span.stars');
                let rating = await csfd.getStarCountFromSpanClass($ratings);
                let date = $($row).find('td.date-only').text().replace(/[\s]/g, '');

                // let movieId = await csfd.getMovieIdFromHref(name);
                // let parentId = await csfd.getMovieIdFromHref(parentName);
                console.log(`DEBUG: name[${name}] ... movieId[${movieId}] ... parentId[${parentId}]`);

                dc[movieId] = {
                    'url': name,
                    'rating': rating,
                    'date': date,
                    'counted': false,
                    'countedFromText': '',
                    'type': showType,
                    'year': showYear,
                    'parentId': parentId
                };
            }
            return dc;
            // web workers - vyšší dívčí - více vláken z browseru
        }

        /**
         * Return **relative** parent name from episode name
         *
         * @param {string} episodeName relative URL of episode name
         * @returns relative URL of parent name
         *
         * Example: \
         * `/film/697624-love-death-robots/800484-zakazane-ovoce/` --> `/film/697624-love-death-robots/`
         */
        async getParentNameFromEpisodeName(episodeName) {
            let splitted = episodeName.slice(0, -1).split("/");
            splitted.pop();
            let parentName = splitted.join("/") + "/";
            return parentName;
        }

        /**
         * Extract MovieId, possibly ParentId from csfd URL address
         *
         * @param {str} url csfd movie URL
         * @returns {{MovieId: str, ParentId: str}}
         *
         * Example: \
         * - `/film/697624-love-death-robots/800484-zakazane-ovoce/` --> `{'MovieId': '800484', 'ParentId': '697624'}`
         * - `/film/697624-love-death-robots` --> `{'MovieId': '697624', 'ParentId': ''}`
         * - `/film/` --> `{'MovieId': '', 'ParentId': ''}`
         * - `/uzivatel/78145-songokussj/prehled/` --> `{'MovieId': '', 'ParentId': ''}`
         */
        async getMovieIdParentIdFromUrl(url) {
            if (!url.includes('/film/')) {
                // return { 'movieId': '', 'parentId': '' };
                return ['', ''];
            }
            let [firstResult, secondResult] = url.matchAll(/\/(\d+)-/g);
            if (firstResult === undefined && secondResult === undefined) {
                // return { 'movieId': '', 'parentId': '' };
                return ['', ''];
            }
            if (secondResult === undefined) {
                // return { 'movieId': firstResult[1], 'parentId': '' };
                return [firstResult[1], ''];
            }
            return [secondResult[1], firstResult[1]];
        }

        /**
         * Return URL html content
         *
         * @param {string} url **Relative** movie/series address: `/film/957504-the-book-of-boba-fett/`
         * @returns Whole HTML content of the url
         */
        async getRelativeUrlContent(url) {
            // TODO: 'prehled' by mel byt OK i pro SK verzi. Ale chce to prozkouset. Jinak doplnit 'prehlad'.
            // Construct full URL: /film/957504-the-book-of-boba-fett/ --> http[s]://csfd.(cs|sk)/film/957504-the-book-of-boba-fett/prehled/
            const newUrl = window.location.protocol + "//" + window.location.host + url + 'prehled/';
            const $content = await $.get(newUrl);
            return $content;
        }

        /**
         * $content should be URL with counted star ratings. Not manualy rated. \
         * Then, it will return dict with `counted stars` and text `"counted from episodes: X"`
         *
         * @param {string} $content HTML content of a page
         * @returns {{'ratingCount': int, 'countedFromText': str, 'movieId': 'str', 'parentId': 'str'}}
         *
         * Example: \
         * `{ ratingCount: 4, countedFromText: 'spocteno z episod': 2, movieId: '465535', parentId = '' }`
         */
        async getComputedRatings($content) {
            // Get current user rating
            const $curUserRating = $($content).find('li.current-user-rating');
            const $starsSpan = $($curUserRating).find('span.stars');
            const starCount = await csfd.getStarCountFromSpanClass($starsSpan);

            // Get 'Spocteno z episod' text
            const $countedText = $($curUserRating).find('span[title]').attr('title');

            // Get this movieId and possible parentId
            const filmUrl = await csfd.getFilmUrlFromHtml($content);
            let [movieId, parentId] = await csfd.getMovieIdParentIdFromUrl(filmUrl);

            // Resulting dictionary
            const result = {
                'ratingCount': starCount,
                'countedFromText': $countedText,
                'movieId': movieId,
                'parentId': parentId
            };
            return result;
        }

        /**
         * Get star count from span with stars class
         *
         * @param {"<span>"} $starsSpan $span with class of 'stars-X' or 'trash' type.
         * @returns {int} `0` if trash; `1-5` if stars-X
         *
         * Example: \
         *    `<span class="stars stars-4">` --> `4`\
         *    `<span class='stars trash'>` --> `0`
         */
        async getStarCountFromSpanClass($starsSpan) {
            let rating = 0;
            for (let stars = 0; stars <= 5; stars++) {
                if ($starsSpan.hasClass('stars-' + stars)) {
                    rating = stars;
                }
            }
            return rating;
        }

        async getAllPages(force = false) {
            const url = location.origin.endsWith('sk') ? `${this.userUrl}hodnotenia` : `${this.userUrl}hodnoceni`;
            const $content = await $.get(url);
            const $href = $($content).find(`.pagination a:not(.page-next):not(.page-prev):last`);
            const maxPageNum = $href.text();
            this.userRatingsCount = await this.getCurrentUserRatingsCount2();
            let dict = this.stars;
            let ls = force ? [] : [dict];
            for (let idx = 1; idx <= 1; idx++) {
                // for (let idx = 1; idx <= maxPageNum; idx++) { // TODO: RELEASE CHANGE
                if (!force) if (Object.keys(dict).length === this.userRatingsCount) break;
                console.log(`Načítám hodnocení ${idx}/${maxPageNum}`);
                Glob.popup(`Načítám hodnocení ${idx}/${maxPageNum}`, 1, 200, 0);
                const url = location.origin.endsWith('sk') ? `${this.userUrl}hodnotenia/?page=${idx}` : `${this.userUrl}hodnoceni/?page=${idx}`;
                const res = await this.doSomething(idx, url);
                ls.push(res);
                if (!force) dict = await mergeDict(ls);
            }
            if (force) dict = await mergeDict(ls);
            return dict;
        }

        async refreshAllRatings(csfd, force = false) {
            await csfd.initializeClassVariables();
            csfd.stars = await csfd.getAllPages(force);
            csfd.exportRatings();
            Glob.popup(`Vaše hodnocení byla načtena.<br>Obnovte stránku.`, 4, 200);
        }

        async removableHomeBoxes() {
            const boxSettingsName = 'CSFD-Compare-hiddenBoxes';
            let settings = await getSettings(boxSettingsName);

            $('.box-header').each(async function (index, value) {
                let $section = $(this).closest('section');
                $section.attr('data-box-id', index);

                if (settings.some(x => x.boxId == index)) {
                    $section.hide();
                }

                let $btnHideBox = $('<a>', {
                    'class': 'hide-me button',
                    href: 'javascript:void(0)',
                    html: `Skrýt`
                }).css({
                    margin: 'auto',
                    marginLeft: '10px',
                    backgroundColor: '#7b0203',
                    display: 'none',
                });

                // $btnHideBox.wrap(`<div class="box-header-action"></div>`);  // TODO: important?

                let $h2 = $(this).find('h2');
                if ($h2.length === 0) {
                    $h2 = $(this).find('p');
                    // if ($h2.text().includes('Partnerem')) {
                    $(this).css({ 'padding-right': '0px' });
                    $h2.after($btnHideBox[0]);
                    return;
                    // }
                }

                $h2.append($btnHideBox[0]);
            });

            $('.box-header').on('mouseover', async function () {
                $(this).find('.hide-me').show();
            }).on('mouseout', async function () {
                $(this).find('.hide-me').hide();
            });

            $('.hide-me').on('click', async function (event) {
                let $section = $(event.target).closest('section');
                let boxId = $section.data('box-id');
                let boxName = $section.find('h2').first().text().replace(/\n|\t|Skrýt/g, "");  // clean from '\t', '\n'
                if (boxName === '') {
                    boxName = $section.find('p').first().text().replace(/\n|\t|Skrýt/g, "");
                }
                let dict = { boxId: boxId, boxName: boxName };
                let settings = await getSettings(SETTINGSNAME_HIDDEN_BOXES);
                if (!settings.includes(dict)) {
                    settings.push(dict);
                    localStorage.setItem(boxSettingsName, JSON.stringify(settings));
                    csfd.addHideSectionButton(boxId, boxName);
                }
                $section.hide();
            });
        }

        showOnOneLine() {
            const $sections = $(`div.creator-filmography`).find(`section`);
            let $nooverflowH3 = $sections.find(`h3.film-title-nooverflow`);
            $nooverflowH3.css({
                "display": "inline-block",
                "white-space": "nowrap",
                "text-overflow": "ellipsis",
                "overflow": "hidden",
                "max-width": "230px",
            });
            const $filmTitleNameA = $nooverflowH3.find(`a.film-title-name`);
            $filmTitleNameA.css({
                "white-space": "nowrap",
            });
            $filmTitleNameA.each(function () {
                const $this = $(this);
                $this.attr("title", $this.text());
            });
        }

        addHideSectionButton(boxId, boxName) {
            let $button = `
                <button class="restore-hidden-section" data-box-id="${boxId}" title="${boxName}"
                    style="border-radius: 4px;
                           margin: 1px;
                           max-width: 60px;
                           text-transform: capitalize;
                           overflow: hidden;
                           text-overflow: ellipsis;"
                >${boxName}</button>
            `;
            let $div = $(`div.hidden-sections`);
            $div.append($button);
        }

        helpImageComponent(url, description) {
            // create span
            let $span = $(`
                <span class="help-hover-image"
                      data-description="${description}"
                      data-img-url="${url}">❔</span>
            `).css({
                "cursor": "help",
                "color": "rgba(255, 255, 255, 0.3)",
            })
            return $span.get(0).outerHTML;
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

            // Add box-id attribute to .box-header(s)
            $('.box-header').each(async function (index, value) {
                let $section = $(this).closest('section');
                $section.attr('data-box-id', index);
            });

            // Build array of buttons for un-hiding sections
            let resultDisplayArray = [];
            let hiddenBoxesArray = await getSettings(SETTINGSNAME_HIDDEN_BOXES);
            hiddenBoxesArray = await checkSettingsValidity(hiddenBoxesArray, SETTINGSNAME_HIDDEN_BOXES);
            hiddenBoxesArray.sort((a, b) => a - b);  // sort by numbers
            hiddenBoxesArray.forEach(element => {
                let boxId = element.boxId;
                let boxName = element.boxName.replace(/\n|\t/g, "");  // clean text of '\n' and '\t';
                resultDisplayArray.push(`
                    <button class="restore-hidden-section" data-box-id="${boxId}" title="${boxName}"
                            style="border-radius: 4px;
                                   margin: 1px;
                                   max-width: 60px;
                                   text-transform: capitalize;
                                   overflow: hidden;
                                   text-overflow: ellipsis;"
                    >
                        ${boxName}
                    </button>
                `);
            });

            button.innerHTML = `
                <a href="javascript:void()" class="user-link initialized csfd-compare-menu">CC</a>
                <div class="dropdown-content notifications" style="${dropdownStyle}">

                    <div class="dropdown-content-head csfd-compare-settings">
                        <h2>CSFD-Compare nastavení</h2>
                        <span style="float: right; font-size: 0.7rem; margin-top: 0.2rem;">
                            <a id="script-version" href="${GREASYFORK_URL}">${VERSION}</a>
                        </span>
                    </div>

                    <article class="article">
                        <h2 class="article-header">Domácí stránka - skryté panely</h2>
                        <section>
                            <div class="article-content">
                                <div class="hidden-sections" style="max-width: fit-content;">${resultDisplayArray.join("")}</div>
                            </div>
                        </section>
                    </article>
                    <article class="article">
                        <h2 class="article-header">Globální</h2>
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
                                <label for="chkClickableMessages" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Klikatelné zprávy (bez tlačítka "více...")</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/DOgHeZj.png", "Odstraní tlačítko 'více' a umožní kliknout na celou zprávu.")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkAddStars" name="add-stars" ${disabled}>
                                <label for="chkAddStars" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Přidat hvězdičky hodnocení u viděných filmů/seriálů</label>
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkAddComputedStars" name="add-computed-stars" ${disabled}>
                                <label for="chkAddComputedStars" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Přidat hvězdičky dopočítaného hodnocení u seriálů</label>
                            </div>
                        </section>
                    </article>

                    <article class="article">
                        <h2 class="article-header">Uživatelé</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideUserControlPanel" name="chide-user-control-panel">
                                <label for="chkHideUserControlPanel" style="${resetLabelStyle}">Skrýt ovládací panel</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/mLznpn6.png", "Skryje ovládací panel, doporučeno pouze pokud aktivujete položky níže")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkDisplayMessageButton" name="display-message-button" ${disabled}>
                                <label for="chkDisplayMessageButton" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}> ↳ Přidat tlačítko odeslání zprávy</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/Di8EofG.png", "Přidá tlačítko pro odeslání soukromé zprávy na profil uživatele")}
                                </div>
                                <div class="article-content">
                                <input type="checkbox" id="chkDisplayFavoriteButton" name="display-favorite-button" ${disabled}>
                                <label for="chkDisplayFavoriteButton" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}> ↳ Přidat tlačítko přidat/odebrat z oblíbených</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/zBINBmc.png", "Přidá tlačítko pro přidání/odebrání uživatele z oblíbených")}
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
                                <input type="checkbox" id="chkShowLinkToImage" name="show-link-to-image" ${disabled}>
                                <label for="chkShowLinkToImage" style="${resetLabelStyle}"}>Zobrazit odkazy na obrázcích</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/a2Av3AK.png", "Přidá vpravo odkazy na všechny možné velikosti, které jsou k dispozici")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkRatingsEstimate" name="ratings-estimate" ${disabled}>
                                <label for="chkRatingsEstimate" style="${resetLabelStyle}">Vypočtení % při počtu hodnocení pod 10</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/qGAhXog.png", "Ukáže % hodnocení i u filmů s méně než 10 hodnoceními")}
                                </div>
                                <div class="article-content">
                                <input type="checkbox" id="chkRatingsFromFavorites" name="ratings-from-favorites" ${disabled}>
                                <label for="chkRatingsFromFavorites" style="${resetLabelStyle}">Zobrazit hodnocení z průměru oblíbených</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/ol88F6z.png", "Zobrazí % hodnocení od přidaných oblíbených uživatelů")}
                                </div>
                                <div class="article-content">
                                <input type="checkbox" id="chkAddRatingsComputedCount" name="compare-user-ratings" ${disabled}>
                                <label for="chkAddRatingsComputedCount" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Zobrazit spočteno ze sérií</label>
                            </div>
                            <div class="article-content">
                            <input type="checkbox" id="chkAddRatingsDate" name="add-ratings" ${disabled}>
                            <label for="chkAddRatingsDate" style="${resetLabelStyle} ${needToLoginStyle}" ${needToLoginTooltip}>Zobrazit datum hodnocení</label>
                            ${csfd.helpImageComponent("https://i.imgur.com/CHpBDxK.png", "Zobrazí datum hodnocení <br>!!! Pozor !!! pere se s pluginem ČSFD Extended - v tomto případě ponechte vypnuté")}
                            </div>
                            <div class="article-content">
                                <input type="checkbox" id="chkHideSelectedUserReviews" name="hide-selected-user-reviews">
                                <label for="chkHideSelectedUserReviews" style="${resetLabelStyle}">Skrýt recenze lidí</label>
                                ${csfd.helpImageComponent("https://i.imgur.com/k6GGE9K.png", "Skryje recenze zvolených uživatelů oddělených čárkou: POMO, kOCOUR")}
                                <div>
                                    <input type="textbox" id="txtHideSelectedUserReviews" name="hide-selected-user-reviews-list">
                                    <label style="${resetLabelStyle}">(např: POMO, golfista)</label>
                                </div>
                            </div>
                        </section>
                    </article>

                    <article class="article">
                        <h2 class="article-header">Herci</h2>
                        <section>
                            <div class="article-content">
                                <input type="checkbox" id="chkShowOnOneLine" name="show-on-one-line" ${disabled}>
                                <label for="chkShowOnOneLine" style="${resetLabelStyle}"}>Filmy na jednom řádku (experimental)</label>
                            </div>
                        </section>
                    </article>

                </div>
            `;
            $('.header-bar').prepend(button);

            await refreshTooltips();

            // Show help image on hover
            $(".help-hover-image").hover(function (e) {
                const url = $(this).attr("data-img-url");
                const description = $(this).attr("data-description");
                $("body").append(`<p id='image-when-hovering-text'><img src='${url}'/><br>${description}</p>`);
                $("#image-when-hovering-text")
                    .css("position", "absolute")
                    .css("top", (e.pageY + 5) + "px")
                    .css("left", (e.pageX + 25) + "px")
                    .css("z-index", "9999")
                    .css("background-color", "white")
                    .css("padding", "5px")
                    .css("border", "1px solid #6a6a6a")
                    .css("border-radius", "5px")
                    .fadeIn("fast");
            }, function () {
                $("#image-when-hovering-text").remove();
            });

            $(".help-hover-image").mousemove(function (e) {
                $("#image-when-hovering-text")
                    .css("top", (e.pageY + 5) + "px")
                    .css("left", (e.pageX + 25) + "px");
            });

            // Show() the section and remove the number from localStorage
            $(".hidden-sections").on("click", ".restore-hidden-section", async function () {
                let $element = $(this);
                let sectionId = $element.attr("data-box-id");

                // Remove from localStorage
                let hiddenBoxesArray = await getSettings(SETTINGSNAME_HIDDEN_BOXES);
                hiddenBoxesArray = hiddenBoxesArray.filter(item => item.boxId !== parseInt(sectionId));
                let settingsName = "CSFD-Compare-hiddenBoxes";
                localStorage.setItem(settingsName, JSON.stringify(hiddenBoxesArray));

                // Show section
                let $section = $(`section[data-box-id="${sectionId}"`);
                $section.show();

                // Remove button
                $element.remove();
            });

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
            let isRatingComputed = await this.isCurrentFilmRatingComputed();
            let computedText = "";
            if (isRatingComputed === true) {
                computedText = await this.getComputedFromText();
            }

            let currentFilmDateAdded = await this.getCurrentFilmDateAdded();

            if (currentFilmRating === null) {
                // Check if record exists, if yes, remove it
                this.removeFromLocalStorage();
            } else {
                // Check if current page rating corresponds with that in LocalStorage, if not, update it
                const ratingsObject = {
                    rating: currentFilmRating,
                    date: currentFilmDateAdded,
                    counted: isRatingComputed,
                    countedFromText: computedText,
                };
                await this.updateInLocalStorage(ratingsObject);
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

        /**
         * From the title of .current-user-rating span get 'spocteno ze serii: x'
         * and add it bellow the 'Moje hodnoceni' text
         */
        async addRatingsComputedCount() {
            let $computedStars = $('.star.active.computed');
            let isComputed = $computedStars.length != 0;
            if (!isComputed) { return; }
            let fromRatingsText = this.csfdPage.find('.current-user-rating > span').attr('title');
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
            let versionNumber = $(pageHtml).find('.version-number a').first().text();
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

        // ========================================
        // ----------   API CALLS TO DB -----------
        // ========================================
        /**
         * Call API to add a user
         * @returns OK
         */
        async apiAddCurrentUser() {
            let userId = location.href.match(/\d+/)[0];
            const userExists = await fetch(`${API_SERVER}/api/v1/users/${userId}`);
            // User exists in DB already, do nothing
            if (userExists.ok) {
                return;
            }
            console.debug(`User '${userId}' not in DB, adding...`);
            let url = location.href.match(/(\d+(-\w+)+)/)[0];
            let username = $(".user-profile-content h1").text().trim().split("\n")[0];
            let realname = $(".user-profile-content > p > strong").text().trim();
            let avatarUrl = $(".user-profile-content > figure > img").attr("src");
            avatarUrl = avatarUrl.replace("//image", "https://image");
            const body = {
                "Id": userId,
                "Url": url,
                "Username": username,
                "Realname": realname,
                "AvatarUrl": avatarUrl
            }

            // Add user to the DB
            let response = await fetch(`${API_SERVER}/api/v1/users/`, {
                method: 'POST',
                headers: API_SERVER_HEADERS,
                body: JSON.stringify(body),
            });
            if (response.ok) {
                console.log(`User '${userId}' added successfully`);
            } else {
                console.error(`User '${userId}' not added`);
            }
            return await response.json();
        }

        /**
         * Call API to add a movie
         * @returns OK
         */
        async apiAddCurrentMovie() {
            const movieId = await csfd.getMovieIdFromHref(location.href);

            const movieExists = await fetch(`${API_SERVER}/api/v1/movies/${movieId}`)

            if (movieExists.status === 200) {
                console.log(`Movie '${movieId}' already exists in DB`);
                return;
            }
            console.debug(`Movie '${movieId}' not in DB, adding...`);

            // const movieRating = await csfd.getCurrentFilmRating();
            // const movieRatingIsComputed = await csfd.isCurrentFilmRatingComputed();
            // const computedText = movieRatingIsComputed ? await this.getComputedFromText() : "";
            // if (movieRatingIsComputed) {
            //     console.log("movieRatingIsComputed:", movieRatingIsComputed);
            //     const movieComputedRating = await csfd.getCurrentFilmComputedRating();
            //     console.log("movieComputedRating:", movieComputedRating);
            // }
            // const dateAdded = await this.getCurrentFilmDateAdded();
            const csfdJson = jQuery.parseJSON($('#page-wrapper > div > div.main-movie > script').text());
            const duration = await getDuration(this.csfdPage);
            const country = await getCountry(this.csfdPage);
            const fanclubCount = await getFanclubCount(this.csfdPage);
            const genres = await getGenres(this.csfdPage);
            const parentId = await getParentId();
            // const childrenHrefArray = $('div.film-episodes-list').find('a').map(function () { return $(this).attr('href') }).get();
            // const childrenIdArray = childrenHrefArray.map(item => item.match(/\d+-[\w-]+/ig)[1].split('-')[0]);  // TODO: Mam se timto vubec zabyvat?
            const type = await getType(this.csfdPage);
            const seasonsCount = await getSeasonsCount(this.csfdPage);
            const episodesCount = await getEpisodesCount(this.csfdPage);
            const seasonId = await getSeasonId(this.csfdPage);
            const lastUpdate = await getCurrentDateTime();

            // console.log("duration:", duration);
            // console.log("country:", country);
            // console.log("fanclubCount:", fanclubCount);
            // console.log("genres:", genres);
            // console.log("idArray:", idArray);
            // console.log("parentId:", parentId);
            // console.log("childrenHrefArray:", childrenHrefArray);
            // console.log("childrenIdArray:", childrenIdArray);
            // console.log("seasonCount:", seasonCount);
            // console.log("episodeCount:", episodeCount);
            // console.log("lastUpdate:", lastUpdate);
            // console.log("type:", type);
            // console.log("seasonId:", seasonId);

            const body = {
                "Id": movieId,
                "Url": $('meta[property="og:url"]').attr('content').match(/\d+-[\w-]+/ig).join('/'),
                // "Title": $('meta[property="og:title"]').attr('content'),
                "Title": csfdJson.name,
                // "Type": $('.film-header-name').find('span').length === 0 ? 'film' : $('.film-header-name').find('span')[0].innerHTML.slice(1, -1),
                // "Type": $('.film-header-name span.type').text().slice(1, -1),
                // "Type": csfdJson['@type'],  // get key with @ as key
                "Type": type,
                // "GenresJson": genres,
                "Genres": JSON.stringify(genres),
                // "Year": $('div.origin').text().trim().replaceAll('\t', '').split('\n')[1].split(',')[0],
                "Year": csfdJson.dateCreated,
                // "Rating": $('.mobile-film-rating .box-rating .film-rating-average').text().replaceAll('\t', '').replaceAll('\n', '').replaceAll('%', ''),
                "Rating": csfdJson.aggregateRating ? Math.round(csfdJson.aggregateRating.ratingValue) : undefined,
                "FanclubCount": fanclubCount,
                // "RatingCount": $('li.tab-nav-item.ratings-btn.active > a > span').text().slice(1, -1).replaceAll(' ', '').replaceAll(' ', ''),
                "RatingCount": csfdJson.aggregateRating ? Math.round(csfdJson.aggregateRating.ratingCount) : undefined,
                "PosterUrl": csfdJson.image,
                "parentid": parentId,
                // "ChildrenIds": JSON.stringify(childrenIdArray),
                "Country": country,
                "Duration": duration,
                "SeasonId": seasonId,
                "SeasonsCount": seasonsCount,
                "EpisodesCount": episodesCount,
                "LastUpdate": lastUpdate,
                // "GenresJson": genres,  // tohle se mi nedari odeslat na api
            }
            console.log("body:", body);

            // return;

            // Add movie to the DB
            let response = await fetch(`${API_SERVER}/api/v1/movies/`, {
                method: 'POST',
                headers: API_SERVER_HEADERS,
                body: JSON.stringify(body),
            });
            if (response.ok) {
                console.log(`Movie '${movieId}' added successfully`);
            } else {
                console.error(`Movie '${movieId}' not added`);
            }

        }

        // async apiCheckAndUpdateUserRatings(userId, filmId, rating) {
        async apiCheckAndUpdateCurrentUserRatings() {
            console.log("Checking and updating user ratings...");
            const currentFilmRating = await this.getCurrentFilmRating();
            console.log(" ├── currentFilmRating:", currentFilmRating);
            const currentFilmId = await csfd.getMovieIdFromHref(location.href);
            console.log(" ├── currentFilmId:", currentFilmId);
            const isRatingComputed = await this.isCurrentFilmRatingComputed();
            console.log(" ├── isRatingComputed:", isRatingComputed);
            const computedText = isRatingComputed ? await this.getComputedFromText() : "";
            console.log(" ├── computedText:", computedText);
            const currentDateTime = await getCurrentDateTime()
            console.log(" ├── currentDateTime:", currentDateTime);
            const currentFilmDateAddedAsText = await this.getCurrentFilmDateAdded();  // TODO: zbytecne ve formatu dd.mm.yyyy
            console.log(" ├── currentFilmDateAddedAsText:", currentFilmDateAddedAsText);
            let currentFilmDateAdded = currentFilmDateAddedAsText ? new Date(currentFilmDateAddedAsText.split('.').reverse().join('-')) : undefined;
            currentFilmDateAdded = currentFilmDateAdded ? currentFilmDateAdded.toISOString().slice(0, 19).replace('T', ' ') : undefined;
            console.log(" ├── currentFilmDateAdded:", currentFilmDateAdded);
            const currentUser = await this.getCurrentUser();
            console.log(" ├── currentUser:", currentUser);
            const currentUserId = currentUser.match(/(\d+)-[-\w]+/ig)[0].split('-')[0];
            console.log(" ├── currentUserId:", currentUserId);
            const currentUsername = currentUser.match(/(\d+)-[-\w]+/ig)[0].split('-')[1];
            console.log(" └── currentUsername:", currentUsername);

            console.log("Checking if UserRatings exist in DB...");
            const reponse = await fetch(`${API_SERVER}/api/v1/users/${currentUserId}/ratings/`);
            const allUserRatingsInDB = await reponse.json();
            console.log(` ├── allUserRatingsInDB of user '${currentUserId}':`, allUserRatingsInDB);
            const userRatingsInDB = allUserRatingsInDB.results.find(item => item.MovieId === parseInt(currentFilmId));
            console.log(` ├── userRatingsInDB of movie '${currentFilmId}':`, userRatingsInDB);

            // Cases:
            // 1. User has rated this film but it's not in the DB --> add it
            // 2. User has rated this film, it's in DB but the rating is different --> patch it
            // 3. User has not rated this film --> do nothing
            // 4. User has unrated this film, it's in DB --> remove it

            // 1. User has rated this film but it's not in the DB --> add it
            // UserRating rated
            // UserRating in DB missing
            if (!userRatingsInDB && currentFilmRating) {
                console.log(" --> Adding rating to DB...");
                const body = {
                    "UserId": parseInt(currentUserId),
                    "MovieId": parseInt(currentFilmId),
                    "Rating": currentFilmRating,
                    "Computed": isRatingComputed,
                    "LastUpdate": currentDateTime,
                    "Date": currentFilmDateAdded,
                }
                console.log(" --> body:", body);
                // const response = await fetch(`${API_SERVER}/api/v1/users/${currentUserId}/ratings/`, {
                const response = await fetch(`${API_SERVER}/api/v1/ratings/`, {
                    method: 'POST',
                    headers: API_SERVER_HEADERS,
                    body: JSON.stringify(body),
                });
                if (response.ok) {
                    console.log(`Rating of movie '${currentFilmId}' added successfully`);
                }
                else {
                    console.error(`Rating of movie '${currentFilmId}' not added`);
                }

            // 2. User has rated this film, it's in DB but the rating is different --> patch it
            } else if (currentFilmRating && userRatingsInDB && userRatingsInDB.Rating !== currentFilmRating) {
                console.log(" --> Updating user rating...");
                const body = {
                    "Rating": currentFilmRating,
                    "Computed": isRatingComputed,
                    "LastUpdate": currentDateTime,
                    "Date": currentFilmDateAdded,
                }
                console.log(" --> body:", body);
                const response = await fetch(`${API_SERVER}/api/v1/users/${currentUserId}/ratings/${currentFilmId}`, {
                    method: 'PATCH',
                    headers: API_SERVER_HEADERS,
                    body: JSON.stringify(body),
                });
                if (response.ok) {
                    console.log(` --> User rating '${currentFilmId}' updated successfully`);
                } else {
                    console.error(` --> User rating '${currentFilmId}' not updated`);
                }
            // 3. User has rated this film, but the Movie is not in DB --> Add the film to DB, add the rating to DB
            }

            // 4. User has unrated this film (film has no rating but UserRating is in DB), it's in DB --> remove it
            else if (userRatingsInDB && !currentFilmRating) {
                console.log(" --> Removing user rating...");
                // const response = await fetch(`${API_SERVER}/api/v1/users/${currentUserId}/ratings/${currentFilmId}`, {
                //     method: 'DELETE',
                //     headers: API_SERVER_HEADERS,
                // });
                // if (response.ok) {
                //     console.log(` --> User rating '${currentFilmId}' removed successfully`);
                // } else {
                //     console.error(` --> User rating '${currentFilmId}' not removed`);
                // }
            }


            // if (currentFilmRating === null) {
            //     // Check if record exists, if yes, remove it
            //     this.removeFromLocalStorage();
            // } else {
            //     // Check if current page rating corresponds with that in LocalStorage, if not, update it
            //     const ratingsObject = {
            //         rating: currentFilmRating,
            //         date: currentFilmDateAdded,
            //         counted: isRatingComputed,
            //         countedFromText: computedText,
            //     };
            //     await this.updateInLocalStorage(ratingsObject);
            // }
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
    if (location.href.includes('/film/') || location.href.includes('/tvurce/') || location.href.includes('/tvorca/')) {
        if (settings.hideSelectedUserReviews) { csfd.hideSelectedUserReviews(); }
        // csfd.showLinkToImageOnSmallMoviePoster();
        if (settings.showLinkToImage) { csfd.showLinkToImage(); }
        if (settings.ratingsEstimate) { csfd.ratingsEstimate(); }
        if (settings.ratingsFromFavorites) { csfd.ratingsFromFavorites(); }
    }

    // Actor page
    if (location.href.includes('/tvurce/') || location.href.includes('/tvorca/')) {
        if (settings.showOnOneLine) { csfd.showOnOneLine(); }
    }
    // // Any Gallery page
    // if (location.href.includes('/galerie/') || location.href.includes('/galeria/')) {
    //     csfd.showLinkToImageOnOtherGalleryImages();
    // }

    if (await onHomepage()) { csfd.removableHomeBoxes(); }

    // if (settings.removeVideoPanel) { csfd.removeBox_VideoPanel(); }
    // if (settings.removeMotivationPanel) { csfd.removeBox_MotivationPanel(); }
    // if (settings.removeContestPanel) { csfd.removeBox_ContestPanel(); }
    // if (settings.removeCsfdCinemaPanel) { csfd.removeBox_CsfdCinemaPanel(); }
    // if (settings.removeMoviesOfferPanel) { csfd.removeBox_MoviesOfferPanel(); }


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

        if (settings.addStars && await csfd.notOnUserPage()) { csfd.addStars(); }

        let ratingsInLocalStorage = 0;
        let currentUserRatingsCount = 0;
        if (settings.addStars || settings.compareUserRatings) {
            ratingsInLocalStorage = await csfd.getLocalStorageRatingsCount();
            currentUserRatingsCount = await csfd.getCurrentUserRatingsCount2();
            if (ratingsInLocalStorage !== currentUserRatingsCount) {
                csfd.showRefreshRatingsButton(ratingsInLocalStorage, currentUserRatingsCount);
                csfd.addWarningToUserProfile();
            } else {
                csfd.userRatingsCount = currentUserRatingsCount;
            }
        }

        // Header modifications
        if (settings.clickableMessages) { csfd.clickableMessages(); }

        // Film page
        if (location.href.includes('/film/')) {
            if (settings.addRatingsDate) { csfd.addRatingsDate(); }
            if (settings.addRatingsComputedCount) { csfd.addRatingsComputedCount(); }

            // Dynamic LocalStorage update on Film/Series in case user changes ratings
            await csfd.checkAndUpdateRatings();
            await csfd.apiAddCurrentMovie();
            csfd.apiCheckAndUpdateCurrentUserRatings();
        }

        // Ratings DB - check if number of ratings saved and current are the same
        if (settings.compareUserRatings || settings.addStars) {

            let spanContent = { html: "✔️", title: "Přenačíst všechna hodnocení" };
            if (ratingsInLocalStorage !== currentUserRatingsCount) {
                spanContent = { html: "⚠️", title: "Nejsou načtena všechna hodnocení! \nPřenačíst VŠECHNA hodnocení" };
            }

            const $span = $("<span>", spanContent).css({ cursor: "pointer" });
            $span.on("click", async function () {
                let csfd = new Csfd($('div.page-content'));
                csfd.refreshAllRatings(csfd, true);
            });
            // OK or WARN icon for compareUserRatings
            if (settings.compareUserRatings) {
                $('#chkCompareUserRatings').parent().append($span.clone(true));
            }
            // OK or WARN icon for addStars
            if (settings.addStars) {
                $('#chkAddStars').parent().append($span.clone(true));
            }
            // OK or WARN icon for addComputedStars
            if (settings.addComputedStars) {
                $('#chkAddComputedStars').parent().append($span.clone(true));
            }
        }

        // User page
        if (await csfd.onOtherUserPage()) {
            if (settings.displayMessageButton) { csfd.displayMessageButton(); }
            if (settings.displayFavoriteButton) { csfd.displayFavoriteButton(); }
            if (settings.hideUserControlPanel) { csfd.hideUserControlPanel(); }
            if (await csfd.onOtherUserHodnoceniPage()) {
                if (settings.compareUserRatings) { csfd.addRatingsColumn(); }
            }

            // Add current page profile to api db if it's not there already
            csfd.apiAddCurrentUser();
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
        const curVersion = VERSION.replace('v', '');
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
                updateCheckJson.versionText = VERSION;
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
        let curVersion = VERSION.replace('v', '');
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
            updateCheckJson.changelogText = await csfd.getChangelog();
            updateCheckJson.newVersion = false;
            updateCheckJson.versionText = VERSION;
            $('#script-version').attr("data-tippy-content", updateCheckJson.changelogText);
        }
        updateCheckJson.lastCheck = Date.now();
        sessionStorage.updateChecked = JSON.stringify(updateCheckJson);
    }

    // Call TippyJs constructor
    await refreshTooltips();

})();
