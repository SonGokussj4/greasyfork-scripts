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
      this.isLoggedIn = false; // New property
    }

    /**
     *
     * @returns {string|undefined} - Returns the user URL or undefined if not found
     * @description - This function retrieves the current user's URL from the CSFD page and sets isLoggedIn.
     */
    async getCurrentUser() {
      const userEl = document.querySelector('.profile.initialized');
      if (userEl) {
        this.isLoggedIn = true;
        return userEl.getAttribute('href');
      }
      this.isLoggedIn = false;
      console.debug('🟣 User not found');
      return undefined;
    }

    /**
     * @returns {string|undefined} - Returns the username or undefined if not found
     * @description - This function retrieves the current user's username from the CSFD page.
     */
    async getUsername() {
      const userHref = await this.getCurrentUser();
      if (!userHref) {
        console.debug('🟣 User URL not found');
        return undefined;
      }
      const match = userHref.match(/\/(\d+)-(.+?)\//);
      if (match && match.length >= 3) {
        this.username = match[2];
        return this.username;
      }
      console.debug('🟣 Username not found');
      return undefined;
    }

    getIsLoggedIn() {
      return this.isLoggedIn;
    }

    async initialize() {
      this.userUrl = await this.getCurrentUser();
      console.debug('🟣 User URL:', this.userUrl);
      this.username = await this.getUsername();
      console.debug('🟣 Username:', this.username);
      this.storageKey = `${'CSFD-Compare'}_${this.username}`;
      this.userRatingsUrl = this.userUrl + (location.origin.endsWith('sk') ? 'hodnotenia' : 'hodnoceni');
      console.debug('🟣 User URL:', this.userUrl);
      console.debug('🟣 Username:', this.username);
      console.debug('🟣 Storage Key:', this.storageKey);
      console.debug('🟣 User Ratings URL:', this.userRatingsUrl);
      const settings = await getSettings(SETTINGSNAME);
      if (settings) {
        this.stars = settings.stars;
      }
      if (!this.stars) {
        this.stars = {};
      }
      console.debug('🟣 Stars:', this.stars);
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

  var css_248z$3 = ".alert-content{position:relative;text-align:center}.close-btn{background:none;border:none;color:#7f8c8d;cursor:pointer;font-size:20px;position:absolute;right:10px;top:10px;-webkit-transition:color .2s;transition:color .2s}.close-btn:hover{color:#f5f5f5}.fancy-alert-button{position:fixed;right:10px;top:10px;z-index:1000}.modal-overlay{background:rgba(0,0,0,.5);display:-webkit-box;display:-ms-flexbox;display:flex;height:100%;left:0;position:fixed;top:0;width:100%;-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center;-webkit-box-align:center;-ms-flex-align:center;align-items:center;opacity:0;-webkit-transition:opacity .3s ease;transition:opacity .3s ease;z-index:10000}.modal-overlay.visible{opacity:1}";
  styleInject(css_248z$3);

  var css_248z$2 = ".fancy-alert{background:#fff;border-radius:8px;-webkit-box-shadow:0 5px 15px rgba(0,0,0,.3);box-shadow:0 5px 15px rgba(0,0,0,.3);max-width:400px;padding:25px;-webkit-transform:translateY(-20px);transform:translateY(-20px);-webkit-transition:-webkit-transform .3s ease;transition:-webkit-transform .3s ease;transition:transform .3s ease;transition:transform .3s ease,-webkit-transform .3s ease;width:90%}.modal-overlay.visible .fancy-alert{-webkit-transform:translateY(0);transform:translateY(0)}.alert-title{color:#2c3e50;font-size:1.5em;margin-bottom:15px}.alert-message{color:#34495e;line-height:1.6;margin-bottom:20px}.alert-button{background:#3498db;border:none;border-radius:4px;color:#fff;cursor:pointer;height:auto;padding:8px 20px;-webkit-transition:background .2s;transition:background .2s}.alert-button:hover{background:#2980b9}";
  styleInject(css_248z$2);

  var css_248z$1 = ".cc-settings{right:50px;top:100%;width:380px}.cc-settings-head{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.cc-badge{background-color:#2c3e50;border-radius:6px;color:#fff;cursor:help;font-size:11.2px;font-size:.7rem;font-weight:700;padding:2px 4px}.cc-badge-red{background-color:#aa2c16}.cc-badge-black{background-color:#000}.cc-button{border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:12px;height:auto;padding:6px;-webkit-transition:background .2s;transition:background .2s}.cc-button-red{background-color:#aa2c16}.cc-button-black{background-color:#242424}.cc-button-black:hover{background-color:#000}.header-bar .csfd-compare-menu{position:relative}.header-bar .csfd-compare-menu .cc-menu-icon{display:block;height:24px;inset:0;margin:auto;position:absolute;width:24px}";
  styleInject(css_248z$1);

  var css_248z = ".flex{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center}.flex,.justify-center{-webkit-box-pack:center;-ms-flex-pack:center;justify-content:center}.justify-evenly{-webkit-box-pack:space-evenly;-ms-flex-pack:space-evenly;justify-content:space-evenly}.justify-start{-webkit-box-pack:start;-ms-flex-pack:start;justify-content:flex-start}.justify-end{-webkit-box-pack:end;-ms-flex-pack:end;justify-content:flex-end}.justify-between{-webkit-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between}.justify-around{-ms-flex-pack:distribute;justify-content:space-around}.grow{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.grow-0{-webkit-box-flex:0;-ms-flex-positive:0;flex-grow:0}.grow-1{-webkit-box-flex:1;-ms-flex-positive:1;flex-grow:1}.grow-2{-webkit-box-flex:2;-ms-flex-positive:2;flex-grow:2}.grow-3{-webkit-box-flex:3;-ms-flex-positive:3;flex-grow:3}.grow-4{-webkit-box-flex:4;-ms-flex-positive:4;flex-grow:4}.grow-5{-webkit-box-flex:5;-ms-flex-positive:5;flex-grow:5}.align-center{text-align:center}.align-left{text-align:left}.align-right{text-align:right}.flex-column{-webkit-box-orient:vertical;-ms-flex-direction:column;flex-direction:column}.flex-column,.flex-row{-webkit-box-direction:normal}.flex-row{-ms-flex-direction:row;flex-direction:row}.flex-row,.flex-row-reverse{-webkit-box-orient:horizontal}.flex-row-reverse{-webkit-box-direction:reverse;-ms-flex-direction:row-reverse;flex-direction:row-reverse}.flex-column-reverse{-webkit-box-orient:vertical;-webkit-box-direction:reverse;-ms-flex-direction:column-reverse;flex-direction:column-reverse}.gap-5{gap:5px}.gap-10{gap:10px}.gap-30{gap:30px}.ml-auto{margin-left:auto}.mr-auto{margin-right:auto}.ph-5{padding-left:5px;padding-right:5px}.ph-10{padding-left:10px;padding-right:10px}.pv-5{padding-bottom:5px;padding-top:5px}.pv-10{padding-bottom:10px;padding-top:10px}.mh-5{margin-left:5px;margin-right:5px}.mh-10{margin-left:10px;margin-right:10px}.mv-5{margin-bottom:5px;margin-top:5px}.mv-10{margin-bottom:10px;margin-top:10px}";
  styleInject(css_248z);

  var htmlContent = "<a href=\"javascript:void(0)\" rel=\"dropdownContent\" class=\"user-link csfd-compare-menu initialized\">\r\n    <svg class=\"cc-menu-icon\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\r\n        aria-hidden=\"true\" focusable=\"false\">\r\n        <text x=\"12\" y=\"12\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"currentColor\" font-size=\"11\"\r\n            font-weight=\"800\" letter-spacing=\"0.2\">CC</text>\r\n    </svg>\r\n</a>\r\n<div class=\"dropdown-content cc-settings\">\r\n\r\n    <div class=\"dropdown-content-head cc-settings-head\">\r\n        <div class=\"left-head flex gap-5\">\r\n            <h2>CSFD-Compare</h2>\r\n            <a href=\"https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare\">v6.6.0</a>\r\n        </div>\r\n        <div class=\"right-head ml-auto\">\r\n            <span class=\"cc-badge cc-badge-red\">21355 / 23352</span>\r\n            <span class=\"cc-badge cc-badge-black\">0 / 1650</span>\r\n            <a href=\"https://greasyfork.org/cs/scripts/425054-%C4%8Dsfd-compare\" class=\"button\">CC</a>\r\n        </div>\r\n    </div>\r\n\r\n    <div class=\"flex justify-evenly gap-5 ph-5\">\r\n        <button class=\"cc-button cc-button-red grow\">Načíst hodnocení</button>\r\n        <button class=\"cc-button cc-button-black\">Načíst spočtená hodnocení</button>\r\n    </div>\r\n\r\n    <details style=\"margin-bottom: 16px;\">\r\n        <summary style=\"cursor: pointer; font-size: 12px; color: #444;\">🛠️ Další akce</summary>\r\n        <div\r\n            style=\"display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px solid #eee; margin-top: 6px;\">\r\n            <button\r\n                style=\"background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; padding: 4px 6px; font-size: 11px; cursor: pointer;\">Reset</button>\r\n            <button\r\n                style=\"background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; padding: 4px 6px; font-size: 11px; cursor: pointer;\">Smazat\r\n                LC</button>\r\n            <button\r\n                style=\"background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; padding: 4px 6px; font-size: 11px; cursor: pointer;\">Smazat\r\n                DB</button>\r\n        </div>\r\n    </details>\r\n\r\n    <article class=\"article\">\r\n        <div class=\"article-content\">\r\n            <form>\r\n                <label>\r\n                    <input type=\"checkbox\" name=\"option1\" /> Option 1\r\n                </label>\r\n                <br />\r\n                <label>\r\n                    <input type=\"checkbox\" name=\"option2\" /> Option 2\r\n                </label>\r\n            </form>\r\n        </div>\r\n    </article>\r\n\r\n</div>";

  const DEBUG = true;

  let isFancyAlertOpen = false;

  async function fancyAlert() {
    if (isFancyAlertOpen) {
      return;
    }
    isFancyAlertOpen = true;

    console.log('fancyAlert called');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

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

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    let isClosing = false;
    const closeModal = () => {
      if (isClosing) {
        return;
      }
      isClosing = true;
      overlay.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        isFancyAlertOpen = false;
        isClosing = false;
      }, 300);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    alert.querySelector('.close-btn').addEventListener('click', closeModal);
    alert.querySelector('.alert-button').addEventListener('click', closeModal);
  }

  function bindFancyAlertButton(alertButton) {
    if (!alertButton || alertButton.dataset.fancyAlertBound === 'true') {
      return;
    }

    alertButton.addEventListener('click', () => {
      fancyAlert();
    });
    alertButton.dataset.fancyAlertBound = 'true';
  }

  // addSettingsButton function that will create element 'li' as a 'let button'


  async function addSettingsButton() {
    const settingsButton = document.createElement('li');
    settingsButton.classList.add('cc-menu-item');
    settingsButton.innerHTML = htmlContent;
    const $button = $(settingsButton);
    $('.header-bar').prepend($button);

    let hoverTimeout;
    let hideTimeout;

    // If DEBUG is enabled, just add $('.header-bar li').addClass('hovered');
    // if not, have the code bellow
    console.log('[ CC ] DEBUG:', DEBUG);
    {
      // --- GROUP FANCY ALERT BUTTON AND CHECKBOX AT TOP RIGHT ---
      // Create or find a top-right container for controls
      let controlsContainer = document.querySelector('.fancy-alert-controls');
      if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'fancy-alert-controls';
        controlsContainer.style.position = 'fixed';
        controlsContainer.style.top = '4px';
        controlsContainer.style.right = '150px';
        controlsContainer.style.zIndex = '9999';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.alignItems = 'center';
        controlsContainer.style.background = 'rgba(255,255,255,0.95)';
        controlsContainer.style.borderRadius = '8px';
        controlsContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        controlsContainer.style.padding = '8px 16px';
        document.body.appendChild(controlsContainer);
      }

      // Remove any previous checkbox/buttons from the container to avoid duplicates
      controlsContainer.innerHTML = '';

      // Add checkbox for toggling hovered state to the left of the alert button
      const checkboxLabel = document.createElement('label');
      checkboxLabel.style.display = 'inline-flex';
      checkboxLabel.style.alignItems = 'center';
      checkboxLabel.style.marginRight = '10px';
      checkboxLabel.style.cursor = 'pointer';
      checkboxLabel.textContent = 'Hovered';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.marginRight = '5px';
      checkbox.checked = localStorage.getItem('headerBarHovered') === 'true';
      checkboxLabel.prepend(checkbox);
      controlsContainer.appendChild(checkboxLabel);

      // Create or find the fancy alert button
      let alertButton = document.querySelector('.fancy-alert-button');
      if (!alertButton) {
        alertButton = document.createElement('button');
        alertButton.textContent = 'Show Fancy Alert';
        alertButton.className = 'fancy-alert-button';
      } else {
        // Remove from previous parent if needed
        if (alertButton.parentNode && alertButton.parentNode !== controlsContainer) {
          alertButton.parentNode.removeChild(alertButton);
        }
      }
      bindFancyAlertButton(alertButton);
      controlsContainer.appendChild(alertButton);

      // If checked, use DEBUG behaviour, else use non-DEBUG behaviour
      function enableDebugHover() {
        $('.header-bar li').addClass('hovered');
        $button.addClass('active');
        $button
          .find('.csfd-compare-menu')
          .off('click.debug')
          .on('click.debug', function (e) {
            e.stopPropagation();
            if ($button.hasClass('active')) {
              $button.removeClass('active');
              $('.header-bar li').removeClass('hovered');
            } else {
              $button.addClass('active');
              $('.header-bar li').addClass('hovered');
            }
          });
        $button.add($button.find('.dropdown-content')).off('mouseenter mouseleave');
      }

      function enableNormalHover() {
        $('.header-bar li').removeClass('hovered');
        $button.removeClass('active');
        $button.find('.csfd-compare-menu').off('click.debug');
        $button
          .add($button.find('.dropdown-content'))
          .off('mouseenter mouseleave')
          .hover(
            function () {
              clearTimeout(hideTimeout);
              hoverTimeout = setTimeout(() => {
                $('.header-bar li').addClass('hovered');
                $button.addClass('active');
              }, 200);
            },
            function () {
              clearTimeout(hoverTimeout);
              hideTimeout = setTimeout(() => {
                $('.header-bar li').removeClass('hovered');
                $button.removeClass('active');
              }, 200);
            },
          );
      }

      // Set initial state from localStorage
      if (checkbox.checked) {
        enableDebugHover();
      } else {
        enableNormalHover();
      }

      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          localStorage.setItem('headerBarHovered', 'true');
          enableDebugHover();
        } else {
          localStorage.setItem('headerBarHovered', 'false');
          enableNormalHover();
        }
      });
    }
  }

  // Utility to enable/disable controls by IDs based on login state
  function setControlsDisabledByLoginState(isLoggedIn, controlIds) {
    controlIds.forEach((id) => {
      const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
      if (el) {
        el.disabled = !isLoggedIn;
        if (!isLoggedIn) {
          el.parentElement && (el.parentElement.style.color = '#aaa');
          el.parentElement && (el.parentElement.title = 'Přihlaste se pro aktivaci této volby');
        } else {
          el.parentElement && (el.parentElement.style.color = '');
          el.parentElement && (el.parentElement.title = '');
        }
      }
    });
  }

  (async () => {
    console.debug('🟣 Script started');
    await delay(20);
    console.debug('🟣 Adding main button');
    await addSettingsButton();

    const csfd = new Csfd(document.querySelector('div.page-content'));
    console.debug('🟣 Initializing CSFD-Compare');
    await csfd.initialize();
    console.debug('🟣 Adding stars');
    await csfd.addStars();

    // Disable Option 2 if not logged in (now using utility)
    setControlsDisabledByLoginState(csfd.getIsLoggedIn(), ['option2']);

    // Add fancy alert
    let alertButton = document.querySelector('.fancy-alert-button');
    if (!alertButton) {
      alertButton = document.createElement('button');
      alertButton.textContent = 'Show Fancy Alert';
      alertButton.className = 'fancy-alert-button';
      document.body.appendChild(alertButton);
    }
    alertButton.addEventListener('click', () => {
      fancyAlert();
    });
  })();

})();
