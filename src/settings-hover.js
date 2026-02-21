import { DEBUG } from './env.js';
import { bindFancyAlertButton } from './fancy-alert.js';

const HEADER_HOVER_STORAGE_KEY = 'headerBarHovered';
const HOVER_TOGGLE_DELAY_MS = 200;

let normalListeners = [];

function addHoveredClass() {
  document.querySelectorAll('.header-bar li').forEach((li) => li.classList.add('hovered'));
}

function removeHoveredClass() {
  document.querySelectorAll('.header-bar li').forEach((li) => li.classList.remove('hovered'));
}

function clearNormalListeners() {
  normalListeners.forEach(({ el, type, handler }) => el.removeEventListener(type, handler));
  normalListeners = [];
}

function bindHoverHandlers(menuButton, timeoutState) {
  clearNormalListeners();
  const dropdown = menuButton.querySelector('.dropdown-content');
  const targets = [menuButton];
  if (dropdown) targets.push(dropdown);

  targets.forEach((el) => {
    const onEnter = () => {
      clearTimeout(timeoutState.hideTimeout);
      timeoutState.hoverTimeout = setTimeout(() => {
        addHoveredClass();
        menuButton.classList.add('active');
      }, HOVER_TOGGLE_DELAY_MS);
    };
    const onLeave = () => {
      clearTimeout(timeoutState.hoverTimeout);
      timeoutState.hideTimeout = setTimeout(() => {
        removeHoveredClass();
        menuButton.classList.remove('active');
      }, HOVER_TOGGLE_DELAY_MS);
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    normalListeners.push({ el, type: 'mouseenter', handler: onEnter });
    normalListeners.push({ el, type: 'mouseleave', handler: onLeave });
  });
}

export function initializeSettingsMenuHover(menuButton) {
  if (typeof menuButton === 'string') {
    menuButton = document.querySelector(menuButton);
  }
  if (!(menuButton instanceof Element) && menuButton && menuButton.jquery) {
    menuButton = menuButton[0];
  }

  let hoverTimeout;
  let hideTimeout;

  console.log('🟣 DEBUG:', DEBUG);
  if (DEBUG) {
    let controlsContainer = document.querySelector('.fancy-alert-controls');
    if (!controlsContainer) {
      controlsContainer = document.createElement('div');
      controlsContainer.className = 'fancy-alert-controls';
      Object.assign(controlsContainer.style, {
        position: 'fixed',
        top: '4px',
        right: '150px',
        zIndex: '9999',
        display: 'cc-flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        padding: '8px 16px',
      });
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

    const menuLink = menuButton.querySelector('.csfd-compare-menu');

    function debugClickHandler(e) {
      e.stopPropagation();
      if (menuButton.classList.contains('active')) {
        menuButton.classList.remove('active');
        removeHoveredClass();
      } else {
        menuButton.classList.add('active');
        addHoveredClass();
      }
    }

    function enableDebugHover() {
      clearNormalListeners();
      addHoveredClass();
      menuButton.classList.add('active');
      if (menuLink) {
        menuLink.addEventListener('click', debugClickHandler);
      }
    }

    function enableNormalHover() {
      if (menuLink) {
        menuLink.removeEventListener('click', debugClickHandler);
      }
      removeHoveredClass();
      menuButton.classList.remove('active');
      bindHoverHandlers(menuButton, {
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
    bindHoverHandlers(menuButton, {
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
