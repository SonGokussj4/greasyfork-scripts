import { DEBUG } from './env.js';
import { bindFancyAlertButton } from './fancy-alert.js';

const HEADER_HOVER_STORAGE_KEY = 'headerBarHovered';
const HOVER_TOGGLE_DELAY_MS = 200;

function bindHoverHandlers($menuButton, timeoutState) {
  $menuButton.add($menuButton.find('.dropdown-content')).hover(
    function () {
      clearTimeout(timeoutState.hideTimeout);
      timeoutState.hoverTimeout = setTimeout(() => {
        $('.header-bar li').addClass('hovered');
        $menuButton.addClass('active');
      }, HOVER_TOGGLE_DELAY_MS);
    },
    function () {
      clearTimeout(timeoutState.hoverTimeout);
      timeoutState.hideTimeout = setTimeout(() => {
        $('.header-bar li').removeClass('hovered');
        $menuButton.removeClass('active');
      }, HOVER_TOGGLE_DELAY_MS);
    },
  );
}

export function initializeSettingsMenuHover($menuButton) {
  let hoverTimeout;
  let hideTimeout;

  console.log('🟣 DEBUG:', DEBUG);
  if (DEBUG) {
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

    controlsContainer.innerHTML = '';

    const checkboxLabel = document.createElement('label');
    checkboxLabel.style.display = 'inline-flex';
    checkboxLabel.style.alignItems = 'center';
    checkboxLabel.style.marginRight = '10px';
    checkboxLabel.style.cursor = 'pointer';
    checkboxLabel.textContent = 'Hovered';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.marginRight = '5px';
    checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';
    checkboxLabel.prepend(checkbox);
    controlsContainer.appendChild(checkboxLabel);

    let alertButton = document.querySelector('.fancy-alert-button');
    if (!alertButton) {
      alertButton = document.createElement('button');
      alertButton.textContent = 'Show Fancy Alert';
      alertButton.className = 'fancy-alert-button';
    } else if (alertButton.parentNode && alertButton.parentNode !== controlsContainer) {
      alertButton.parentNode.removeChild(alertButton);
    }
    bindFancyAlertButton(alertButton);
    controlsContainer.appendChild(alertButton);

    function enableDebugHover() {
      $('.header-bar li').addClass('hovered');
      $menuButton.addClass('active');
      $menuButton
        .find('.csfd-compare-menu')
        .off('click.debug')
        .on('click.debug', function (e) {
          e.stopPropagation();
          if ($menuButton.hasClass('active')) {
            $menuButton.removeClass('active');
            $('.header-bar li').removeClass('hovered');
          } else {
            $menuButton.addClass('active');
            $('.header-bar li').addClass('hovered');
          }
        });
      $menuButton.add($menuButton.find('.dropdown-content')).off('mouseenter mouseleave');
    }

    function enableNormalHover() {
      $('.header-bar li').removeClass('hovered');
      $menuButton.removeClass('active');
      $menuButton.find('.csfd-compare-menu').off('click.debug');
      $menuButton.add($menuButton.find('.dropdown-content')).off('mouseenter mouseleave');
      bindHoverHandlers($menuButton, {
        get hoverTimeout() {
          return hoverTimeout;
        },
        set hoverTimeout(value) {
          hoverTimeout = value;
        },
        get hideTimeout() {
          return hideTimeout;
        },
        set hideTimeout(value) {
          hideTimeout = value;
        },
      });
    }

    if (checkbox.checked) {
      enableDebugHover();
    } else {
      enableNormalHover();
    }

    checkbox.addEventListener('change', function () {
      if (checkbox.checked) {
        localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'true');
        enableDebugHover();
      } else {
        localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'false');
        enableNormalHover();
      }
    });
  } else {
    bindHoverHandlers($menuButton, {
      get hoverTimeout() {
        return hoverTimeout;
      },
      set hoverTimeout(value) {
        hoverTimeout = value;
      },
      get hideTimeout() {
        return hideTimeout;
      },
      set hideTimeout(value) {
        hideTimeout = value;
      },
    });
  }
}
