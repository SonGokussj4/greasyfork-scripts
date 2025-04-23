// addSettingsButton function that will create element 'li' as a 'let button'

// Import html content from settings-button-content.html
import htmlContent from './settings-button-content.html';
// Load DEBUG variable from env file
import { DEBUG } from './env.js';

async function addSettingsButton() {
  ('use strict');
  const settingsButton = document.createElement('li');
  settingsButton.innerHTML = htmlContent;
  const $button = $(settingsButton);
  $('.header-bar').prepend($button);

  let hoverTimeout;
  let hideTimeout;

  // If DEBUG is enabled, just add $('.header-bar li').addClass('hovered');
  // if not, have the code bellow
  console.log('[ CC ] DEBUG:', DEBUG);
  if (DEBUG) {
    $('.header-bar li').addClass('hovered');
    $button.addClass('active');

    $button.find('.csfd-compare-menu').click(function (e) {
      e.stopPropagation();
      if ($button.hasClass('active')) {
        $button.removeClass('active');
        $('.header-bar li').removeClass('hovered');
      } else {
        $button.addClass('active');
        $('.header-bar li').addClass('hovered');
      }
    });
  } else {
    $button.add($button.find('.dropdown-content')).hover(
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
      }
    );
  }
}

export { addSettingsButton };
