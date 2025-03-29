// ==UserScript==
// @name         ČSFD Compare DEV
// @version      0.6.6
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @match        *://*csfd.cz/*
// @match        *://*csfd.sk/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /* 
   * Config and constants for CSFD-Compare
   */
  const SETTINGSNAME = 'CSFD-Compare-settings';

  async function getSettings(settingsName = 'CSFD-Compare-settings', defaultSettings = {}) {
    if (!localStorage.getItem(settingsName)) {
      localStorage.setItem(settingsName, JSON.stringify(defaultSettings));
      return defaultSettings;
    } else {
      return JSON.parse(localStorage.getItem(settingsName));
    }
  }

  function delay(t) {
    return new Promise((resolve) => setTimeout(resolve, t));
  }

  class Csfd {
    constructor(pageContent) {
      this.csfdPage = pageContent;
      this.stars = {};
      this.storageKey = undefined;
      this.userUrl = undefined;
      this.username = undefined;
      this.userRatingsUrl = undefined;
    }

    async getCurrentUser() {
      const userEl = document.querySelector('.profile.initialized');
      if (userEl) {
        return userEl.getAttribute('href');
      }
      throw new Error('User not logged in');
    }

    async getUsername() {
      const userHref = await this.getCurrentUser();
      const match = userHref.match(/\/(\d+)-(.+?)\//);
      if (match && match.length >= 3) {
        this.username = match[2];
        return this.username;
      }
      return undefined;
    }

    async initialize() {
      this.userUrl = await this.getCurrentUser();
      this.username = await this.getUsername();
      this.storageKey = `${'CSFD-Compare'}_${this.username}`;
      this.userRatingsUrl = this.userUrl + (location.origin.endsWith('sk') ? 'hodnotenia' : 'hodnoceni');
      console.debug('[CC] - User URL:', this.userUrl);
      console.debug('[CC] - Username:', this.username);
      console.debug('[CC] - Storage Key:', this.storageKey);
      console.debug('[CC] - User Ratings URL:', this.userRatingsUrl);
      const settings = await getSettings(SETTINGSNAME);
      if (settings) {
        this.stars = settings.stars;
      }
      if (!this.stars) {
        this.stars = {};
      }
      console.debug('[CC] - Stars:', this.stars);
    }

    async addStars() {
      const links = document.querySelectorAll('a.film-title-name');
      for (let link of links) {
        const movieId = await this.getMovieIdFromUrl(link.getAttribute('href'));
        const rating = this.stars[movieId];
        if (!rating) continue;
        const starSpan = document.createElement('span');
        starSpan.className = 'star-rating';
        starSpan.textContent = rating.rating ? rating.rating : '';
        link.parentElement.appendChild(starSpan);
      }
    }

    async getMovieIdFromUrl(url) {
      if (!url) return NaN;
      const match = url.match(/\/(\d+)-/);
      return match ? Number(match[1]) : NaN;
    }
  }

  (async () => {
    await delay(20);
    console.debug('CSFD-Compare - Script started');
    const csfd = new Csfd(document.querySelector('div.page-content'));
    await csfd.initialize();
    await csfd.addStars();
  })();

})();
