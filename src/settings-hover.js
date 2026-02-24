import { DEBUG } from './env.js';

const HEADER_HOVER_STORAGE_KEY = 'headerBarHovered';
const HOVER_TOGGLE_DELAY_MS = 200;

let normalListeners = [];

// OPTIMIZATION: Only modify the specific menu button, preventing CSFD native scripts
// from freezing the browser by trying to open all native dropdowns at once.
function setHoverState(menuButton, isHovered) {
  if (isHovered) {
    menuButton.classList.add('hovered', 'active');
    document.body.classList.add('cc-menu-open');
  } else {
    menuButton.classList.remove('hovered', 'active');
    document.body.classList.remove('cc-menu-open');
  }
}

function clearNormalListeners() {
  normalListeners.forEach(({ el, type, handler }) => el.removeEventListener(type, handler));
  normalListeners = [];
}

function bindHoverHandlers(menuButton, timeoutState) {
  clearNormalListeners();

  // OPTIMIZATION: We only need to listen on the parent wrapper.
  // 'mouseenter' and 'mouseleave' naturally cover child elements like the dropdown.
  const onEnter = () => {
    clearTimeout(timeoutState.hideTimeout);
    timeoutState.hoverTimeout = setTimeout(() => {
      setHoverState(menuButton, true);
    }, HOVER_TOGGLE_DELAY_MS);
  };

  const onLeave = () => {
    clearTimeout(timeoutState.hoverTimeout);
    timeoutState.hideTimeout = setTimeout(() => {
      setHoverState(menuButton, false);
    }, HOVER_TOGGLE_DELAY_MS);
  };

  menuButton.addEventListener('mouseenter', onEnter);
  menuButton.addEventListener('mouseleave', onLeave);
  normalListeners.push({ el: menuButton, type: 'mouseenter', handler: onEnter });
  normalListeners.push({ el: menuButton, type: 'mouseleave', handler: onLeave });
}

export function initializeSettingsMenuHover(menuButton) {
  if (typeof menuButton === 'string') {
    menuButton = document.querySelector(menuButton);
  }
  // Handle jQuery objects if they accidentally get passed
  if (!(menuButton instanceof Element) && menuButton && menuButton.jquery) {
    menuButton = menuButton[0];
  }

  if (!menuButton) return;

  let hoverTimeout;
  let hideTimeout;

  console.log('🟣 DEBUG:', DEBUG);
  if (DEBUG) {
    // Place the debug toggle inside the settings menu next to the DEV button.
    // Fallback: if the settings menu isn't available yet, create a simple floating control.
    const maintActions = menuButton.querySelector('.cc-maint-actions');
    let checkbox;
    if (maintActions) {
      const wrapper = document.createElement('div');
      wrapper.className = 'cc-setting-row cc-dev-only';
      wrapper.title = 'Při aktivaci nechá CC menu trvale otevřené.';

      const switchLabel = document.createElement('label');
      switchLabel.className = 'cc-switch';

      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'cc-debug-hover-checkbox';
      checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';

      const switchBg = document.createElement('span');
      switchBg.className = 'cc-switch-bg';

      switchLabel.appendChild(checkbox);
      switchLabel.appendChild(switchBg);

      const labelText = document.createElement('span');
      labelText.className = 'cc-setting-label';
      labelText.textContent = 'Hovered';

      wrapper.appendChild(switchLabel);
      wrapper.appendChild(labelText);

      const devBtn = maintActions.querySelector('#cc-maint-dev-btn');
      if (devBtn) {
        maintActions.insertBefore(wrapper, devBtn);
      } else {
        maintActions.appendChild(wrapper);
      }
    } else {
      let controlsContainer = document.querySelector('.fancy-alert-controls');
      if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'fancy-alert-controls';
        Object.assign(controlsContainer.style, {
          position: 'fixed',
          top: '4px',
          right: '150px',
          zIndex: '9999',
          display: 'flex',
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
      Object.assign(checkboxLabel.style, {
        display: 'inline-flex',
        alignItems: 'center',
        marginRight: '10px',
        cursor: 'pointer',
      });
      checkboxLabel.textContent = 'Hovered';

      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.marginRight = '5px';
      checkbox.checked = localStorage.getItem(HEADER_HOVER_STORAGE_KEY) === 'true';
      checkboxLabel.prepend(checkbox);
      controlsContainer.appendChild(checkboxLabel);
    }

    const menuLink = menuButton.querySelector('.csfd-compare-menu');

    function debugClickHandler(e) {
      e.stopPropagation();
      const isActive = menuButton.classList.contains('active');
      setHoverState(menuButton, !isActive);
    }

    function enableDebugHover() {
      clearNormalListeners();
      setHoverState(menuButton, true);
      if (menuLink) {
        menuLink.addEventListener('click', debugClickHandler);
      }
    }

    function enableNormalHover() {
      if (menuLink) {
        menuLink.removeEventListener('click', debugClickHandler);
      }
      setHoverState(menuButton, false);
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

    if (checkbox && checkbox.checked) {
      enableDebugHover();
    } else if (checkbox) {
      enableNormalHover();
    }

    if (checkbox) {
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'true');
          enableDebugHover();
        } else {
          localStorage.setItem(HEADER_HOVER_STORAGE_KEY, 'false');
          enableNormalHover();
        }
      });
    }
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
