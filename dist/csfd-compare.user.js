// ==UserScript==
// @name         ČSFD Compare DEV
// @version      0.7.0
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author       Jan Verner <SonGokussj4@centrum.cz>
// @license      GNU GPLv3
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @match        *://*csfd.cz/*
// @match        *://*csfd.sk/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://greasyfork.org/scripts/449554-csfd-compare-utils/code/csfd-compare-utils.js?version=1100309
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

  function styleInject(css, ref) {
    if ( ref === void 0 ) ref = {};
    var insertAt = ref.insertAt;

    if (!css || typeof document === 'undefined') { return; }

    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';

    if (insertAt === 'top') {
      if (head.firstChild) {
        head.insertBefore(style, head.firstChild);
      } else {
        head.appendChild(style);
      }
    } else {
      head.appendChild(style);
    }

    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
  }

  var css_248z$1 = ".alert-content{position:relative;text-align:center}.close-btn{background:none;border:none;color:#7f8c8d;cursor:pointer;font-size:20px;position:absolute;right:10px;top:10px;-webkit-transition:color .2s;transition:color .2s}.close-btn:hover{color:#f5f5f5}.fancy-alert-button{position:fixed;right:10px;top:10px;z-index:1000}.modal-overlay{background:rgba(0,0,0,.5);display:-webkit-box;display:-ms-flexbox;display:flex;height:100%;left:0;position:fixed;top:0;width:100%;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;-webkit-box-align:center;-ms-flex-align:center;align-items:center;opacity:0;-webkit-transition:opacity .3s ease;transition:opacity .3s ease;z-index:1001}.modal-overlay.visible{opacity:1}";
  styleInject(css_248z$1);

  var css_248z = ".fancy-alert{background:#fff;border-radius:8px;-webkit-box-shadow:0 5px 15px rgba(0,0,0,.3);box-shadow:0 5px 15px rgba(0,0,0,.3);max-width:400px;padding:25px;-webkit-transform:translateY(-20px);transform:translateY(-20px);-webkit-transition:-webkit-transform .3s ease;transition:-webkit-transform .3s ease;transition:transform .3s ease;transition:transform .3s ease,-webkit-transform .3s ease;width:90%}.modal-overlay.visible .fancy-alert{-webkit-transform:translateY(0);transform:translateY(0)}.alert-title{color:#2c3e50;font-size:1.5em;margin-bottom:15px}.alert-message{color:#34495e;line-height:1.6;margin-bottom:20px}.alert-button{background:#3498db;border:none;border-radius:4px;color:#fff;cursor:pointer;height:auto;padding:8px 20px;-webkit-transition:background .2s;transition:background .2s}.alert-button:hover{background:#2980b9}";
  styleInject(css_248z);

  (async () => {
    await delay(20);
    console.debug('CSFD-Compare - Script started');
    const csfd = new Csfd(document.querySelector('div.page-content'));
    await csfd.initialize();
    await csfd.addStars();

    // Add fancy alert
    const alertButton = document.createElement('button');
    alertButton.textContent = 'Show Fancy Alert';
    alertButton.className = 'fancy-alert-button';
    document.body.appendChild(alertButton);
    alertButton.addEventListener('click', () => {
      fancyAlert();
    });
  })();

  async function fancyAlert() {
    console.log('fancyAlert called');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // Create alert
    const alert = document.createElement('div');
    alert.className = 'fancy-alert';
    alert.innerHTML = `
    <div class="alert-content">
      <button class="close-btn">&times;</button>
      <h2 class="alert-title">Welcome!</h2>
      <p class="alert-message">This is a fancy modal alert with modern styling and animations.</p>
      <button class="alert-button">Got it!</button>
    </div>
  `;

    overlay.appendChild(alert);
    document.body.appendChild(overlay);

    // Trigger animation
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    // Close handlers
    const closeModal = () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300); // Wait for animation
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    alert.querySelector('.close-btn').addEventListener('click', closeModal);
    alert.querySelector('.alert-button').addEventListener('click', closeModal);
  }

})();
