import { Csfd } from './csfd.js';
import { delay } from './utils.js';
import './styles/fancy-alert.css';
import './styles/alert-modal.css';
import './styles/cc-menu.css';
import './styles/general.css';
import { addSettingsButton } from './settings.js';
import { setControlsDisabledByLoginState } from './ui-utils.js';
import { fancyAlert } from './fancy-alert.js';

(async () => {
  'use strict';
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
