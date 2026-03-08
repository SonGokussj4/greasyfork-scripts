import htmlContent from './settings-button-content.html';
import { initializeRatingsLoader } from './ratings-loader.js';
import { initializeRatingsSync, performCloudSync } from './ratings-sync.js';
import { deleteAllDataFromIndexedDB } from './storage.js';
import {
  ADD_RATINGS_DATE_KEY,
  CLICKABLE_HEADER_BOXES_KEY,
  GALLERY_IMAGE_LINKS_ENABLED_KEY,
  HIDE_REVIEWS_SECTION_COLLAPSED_KEY,
  HIDE_SELECTED_REVIEWS_KEY,
  HIDE_SELECTED_REVIEWS_LIST_KEY,
  HOVER_PREVIEW_CACHE_HOURS_KEY,
  HOVER_PREVIEW_CACHE_GROUP_PREFIX,
  HOVER_PREVIEW_ENABLED_KEY,
  HOVER_PREVIEW_SECTION_COLLAPSED_KEY,
  HOVER_PREVIEW_SETTINGS_CHANGED_EVENT,
  INDEXED_DB_NAME,
  RATINGS_STORE_NAME,
  LINK_ICONS_ENABLED_KEY,
  LINK_ICONS_UPDATED_EVENT,
  LINK_ICONS_POSITION_KEY,
  RATINGS_ESTIMATE_KEY,
  RATINGS_FROM_FAVORITES_KEY,
  SETTINGSNAME,
  SHOW_ALL_CREATOR_TABS_KEY,
  SHOW_RATINGS_IN_DIARIES_KEY,
  SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY,
  SHOW_RATINGS_IN_REVIEWS_KEY,
  SHOW_RATINGS_KEY,
  SHOW_RATINGS_SECTION_COLLAPSED_KEY,
} from './config.js';
import { initializeVersionUi, openVersionInfoModal } from './settings-version.js';
import { refreshRatingsBadges } from './settings-badges.js';
import { invalidateRatingsModalCache, openRatingsTableModal } from './settings-ratings-modal.js';
import { initializeSettingsMenuHover } from './settings-hover.js';
import { buildStructuredDetailItems, createDetailsModalController } from './ui-utils.js';
import { escapeHtml } from './utils.js';
import MENU_CONFIG from './settings-config.js';

let infoToastTimeoutId;
const PROFILE_LINK_SELECTOR =
  'a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]';
const MANAGED_LOCAL_STORAGE_PREFIXES = ['cc_', 'CSFD-Compare'];

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getBoolSetting(key, defaultValue = true) {
  const value = localStorage.getItem(key);
  return value === null ? defaultValue : value === 'true';
}

function getProfileLinkElement() {
  return document.querySelector(PROFILE_LINK_SELECTOR);
}

function isUserLoggedIn() {
  return Boolean(getProfileLinkElement());
}

function getCurrentUserSlug() {
  const match = getProfileLinkElement()
    ?.getAttribute('href')
    ?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
  return match ? match[1] : undefined;
}

function getMostFrequentUserSlug(records) {
  const counts = new Map();
  for (const record of records) {
    if (!record?.userSlug || !Number.isFinite(record?.movieId)) continue;
    counts.set(record.userSlug, (counts.get(record.userSlug) || 0) + 1);
  }

  let bestSlug,
    bestCount = -1;
  for (const [slug, count] of counts.entries()) {
    if (count > bestCount) {
      bestSlug = slug;
      bestCount = count;
    }
  }
  return bestSlug;
}

function findMenuConfigItem(itemId) {
  for (const category of MENU_CONFIG) {
    const match = category.items.find((item) => item.id === itemId);
    if (match) return match;
  }

  return null;
}

function showSettingsInfoToast(message) {
  let toastEl = document.querySelector('#cc-settings-info-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'cc-settings-info-toast';
    Object.assign(toastEl.style, {
      position: 'fixed',
      left: '50%',
      top: '70px',
      transform: 'translateX(-50%)',
      zIndex: '10020',
      padding: '8px 12px',
      borderRadius: '8px',
      background: 'rgba(40, 40, 40, 0.94)',
      color: '#fff',
      fontSize: '12px',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.28)',
      display: 'none',
    });
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.style.display = 'block';

  clearTimeout(infoToastTimeoutId);
  infoToastTimeoutId = window.setTimeout(() => {
    toastEl.style.display = 'none';
  }, 1800);
}

function getManagedLocalStorageEntries() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key === SETTINGSNAME ||
      MANAGED_LOCAL_STORAGE_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix.toLowerCase()))
    ) {
      entries.push({ key, value: localStorage.getItem(key) ?? '' });
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

function formatLocalStorageValue(value, maxLength = 120) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function isHoverPreviewCacheKey(key) {
  return String(key || '')
    .toLowerCase()
    .startsWith(HOVER_PREVIEW_CACHE_GROUP_PREFIX.toLowerCase());
}

function getLocalStorageValueDetailRows(value) {
  const rawValue = String(value ?? '');

  try {
    const parsed = JSON.parse(rawValue);
    const rows = buildStructuredDetailItems(parsed);
    if (rows.length > 0) return rows;
  } catch (error) {}

  return [{ key: 'value', value: rawValue }];
}

function buildManagedLocalStorageRows(entries) {
  const rows = [];
  let hoverPreviewGroupAdded = false;
  const hoverPreviewEntries = entries.filter((entry) => isHoverPreviewCacheKey(entry.key));

  entries.forEach((entry) => {
    if (isHoverPreviewCacheKey(entry.key)) {
      if (!hoverPreviewGroupAdded) {
        rows.push({
          type: 'group',
          id: 'hover-preview-cache',
          label: 'cc_hover_cache* cache',
          entries: hoverPreviewEntries,
        });
        hoverPreviewGroupAdded = true;
      }
      return;
    }

    rows.push({ type: 'entry', entry, grouped: false });
  });

  return rows;
}

// ==========================================
// IMAGE MODAL LOGIC
// ==========================================
function getOrCreateImageModal() {
  let overlay = document.getElementById('cc-image-preview-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'cc-image-preview-overlay';
  overlay.className = 'cc-version-info-overlay';

  overlay.innerHTML = `
    <div class="cc-version-info-modal" style="width: fit-content; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="cc-version-info-head">
        <h3 id="cc-image-modal-title">Ukázka funkce</h3>
        <button type="button" class="cc-version-info-close" id="cc-image-modal-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-version-info-body" style="padding: 0; background: #242424; overflow: auto;">
        <img id="cc-image-modal-img" src="" alt="Ukázka" style="display: block; margin: 0 auto; max-width: none; max-height: none;" />
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.remove('is-open');
    setTimeout(() => {
      overlay.querySelector('#cc-image-modal-img').src = '';
    }, 200);
  };

  overlay.querySelector('#cc-image-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return overlay;
}

// ==========================================
// MAIN INITIALIZATION
// ==========================================
async function addSettingsButton() {
  ('use strict');

  // 1. FIREFOX SHIELD: Wait for the HTML body and header to actually exist!
  if (document.readyState === 'loading') {
    await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve));
  }

  const loggedIn = isUserLoggedIn();

  const settingsButton = document.createElement('li');
  settingsButton.className = 'cc-menu-item';
  settingsButton.innerHTML = htmlContent;

  // Disable main actions if the user is not logged in
  if (!loggedIn) {
    // Buttons & Cloud Icon
    ['#cc-load-ratings-btn', '#cc-load-computed-btn', '#cc-sync-cloud-btn'].forEach((id) => {
      const btn = settingsButton.querySelector(id);
      if (btn) {
        btn.disabled = true;
        btn.title += ' (Vyžaduje přihlášení)';
      }
    });

    // Badges
    ['#cc-badge-red', '#cc-badge-black'].forEach((id) => {
      const badge = settingsButton.querySelector(id);
      if (badge) {
        badge.classList.add('is-disabled');
        badge.title += ' (Vyžaduje přihlášení)';
        badge.removeAttribute('tabindex'); // Prevent keyboard focus
        badge.removeAttribute('role');
      }
    });
  }

  const dropdown = settingsButton.querySelector('.dropdown-content');
  const queryMenu = (selector) => dropdown?.querySelector(selector) || settingsButton.querySelector(selector);
  if (dropdown) {
    const blockEvent = (e) => e.stopPropagation();
    ['pointermove', 'mousemove', 'mouseover', 'mouseenter'].forEach((evt) => {
      dropdown.addEventListener(evt, blockEvent, true);
    });
  }

  const closeSettingsShortcutMenu = () => {
    const controller = settingsButton.__ccSettingsMenuController;
    if (controller?.isPinnedOpen()) {
      controller.closePinned();
      return;
    }

    settingsButton.classList.remove('hovered', 'active');
    document.body.classList.remove('cc-menu-open');
  };

  const toggleSettingsShortcutMenu = () => {
    const controller = settingsButton.__ccSettingsMenuController;
    if (controller?.togglePinned) {
      controller.togglePinned();
      return;
    }

    const opened = !settingsButton.classList.contains('active');
    settingsButton.classList.toggle('hovered', opened);
    settingsButton.classList.toggle('active', opened);
    document.body.classList.toggle('cc-menu-open', opened);
  };

  queryMenu('#cc-settings-pinned-close-btn')?.addEventListener('click', () => {
    closeSettingsShortcutMenu();
  });

  const headerBar = document.querySelector('.header-bar');
  if (headerBar) {
    const searchItem = headerBar.querySelector('li.item-search');
    const languageItem = headerBar.querySelector('li.user-language-switch');
    if (searchItem) searchItem.after(settingsButton);
    else if (languageItem) languageItem.before(settingsButton);
    else headerBar.prepend(settingsButton);
  }

  const updateHoverPreviewUI = () => {
    const enabled = getBoolSetting(HOVER_PREVIEW_ENABLED_KEY, true);
    const groupConfig = findMenuConfigItem('cc-enable-hover-previews');
    const body = queryMenu('#cc-hover-preview-group-body');
    for (const child of groupConfig?.childrenItems || []) {
      const childToggle = queryMenu(`#${child.id}`);
      if (childToggle) childToggle.disabled = !enabled;
    }
    if (body) body.classList.toggle('is-disabled', !enabled);

    const providerStates = Object.fromEntries(
      (groupConfig?.childrenItems || []).map((child) => [
        child.id,
        getBoolSetting(child.storageKey, child.defaultValue ?? true),
      ]),
    );

    window.dispatchEvent(
      new CustomEvent(HOVER_PREVIEW_SETTINGS_CHANGED_EVENT, {
        detail: {
          enabled,
          providerStates,
        },
      }),
    );
  };

  const updateHideReviewsUI = () => {
    const enabled = getBoolSetting(HIDE_SELECTED_REVIEWS_KEY, false);
    const pillInput = queryMenu('#cc-hide-reviews-pill-input');
    const hideApplyBtn = queryMenu('#cc-hide-reviews-apply');
    const pillContainer = queryMenu('#cc-hide-reviews-pill-container');
    const body = queryMenu('#cc-hide-reviews-group-body');

    if (pillInput) pillInput.disabled = !enabled;
    if (hideApplyBtn) hideApplyBtn.disabled = !enabled;
    if (pillContainer) pillContainer.classList.toggle('is-disabled', !enabled);
    if (body) body.classList.toggle('is-disabled', !enabled);
  };

  const updateHidePanelsUI = () => {
    const enabled = getBoolSetting('cc_hide_home_panels', true);
    const body = queryMenu('#cc-hide-panels-group-body');
    if (body) body.classList.toggle('is-disabled', !enabled);
  };

  const updateShowRatingsUI = () => {
    const enabled = getBoolSetting(SHOW_RATINGS_KEY, true);
    const childToggle = queryMenu('#cc-show-ratings-in-reviews');
    const foreignChildToggle = queryMenu('#cc-show-ratings-in-foreign-reviews');
    const diariesChildToggle = queryMenu('#cc-show-ratings-in-diaries');
    const body = queryMenu('#cc-show-ratings-group-body');

    if (childToggle) childToggle.disabled = !enabled;
    if (foreignChildToggle) foreignChildToggle.disabled = !enabled;
    if (diariesChildToggle) diariesChildToggle.disabled = !enabled;
    if (body) body.classList.toggle('is-disabled', !enabled);
  };

  const updateLinkIconsUI = () => {
    const enabled = getBoolSetting(LINK_ICONS_ENABLED_KEY, true);
    const position = localStorage.getItem(LINK_ICONS_POSITION_KEY) === 'after' ? 'after' : 'before';
    const groupConfig = findMenuConfigItem('cc-enable-link-icons');
    const positionSelect = queryMenu('#cc-link-icons-position');
    const body = queryMenu('#cc-link-icons-group-body');

    for (const child of groupConfig?.childrenItems || []) {
      const childToggle = queryMenu(`#${child.id}`);
      if (childToggle) childToggle.disabled = !enabled;
    }
    if (positionSelect) positionSelect.disabled = !enabled;
    if (body) {
      body.classList.toggle('is-disabled', !enabled);
      body.classList.toggle('cc-link-icons-preview-before', position === 'before');
      body.classList.toggle('cc-link-icons-preview-after', position === 'after');
    }
  };

  const syncSelectControlsFromStorage = () => {
    if (cacheSelect) {
      cacheSelect.value = localStorage.getItem(HOVER_PREVIEW_CACHE_HOURS_KEY) || '24';
    }

    if (linkIconsPositionSelect) {
      linkIconsPositionSelect.value = localStorage.getItem(LINK_ICONS_POSITION_KEY) || 'before';
    }
  };

  // Resolve callback name strings (from settings-config) to the actual functions defined above.
  const CALLBACK_MAP = {
    updateHidePanelsUI,
    updateShowRatingsUI,
    updateLinkIconsUI,
    updateHoverPreviewUI,
    updateHideReviewsUI,
  };

  // This allows us to keep the MENU_CONFIG clean and not have to import functions into it, while still supporting callbacks for toggles/groups.
  const resolveCallbacksInConfig = (config) => {
    config.forEach((cat) => {
      cat.items.forEach((item) => {
        if (typeof item.callback === 'string' && CALLBACK_MAP[item.callback]) {
          item.callback = CALLBACK_MAP[item.callback];
        }
        if (item.childrenItems) {
          item.childrenItems.forEach((child) => {
            if (typeof child.callback === 'string' && CALLBACK_MAP[child.callback]) {
              child.callback = CALLBACK_MAP[child.callback];
            }
          });
        }
      });
    });
  };

  resolveCallbacksInConfig(MENU_CONFIG);

  const renderLeadingIconHtml = (item) => {
    if (!item.leadingIconSvg) return '';

    return `
      <span class="cc-setting-leading-icon" aria-hidden="true">
        ${item.leadingIconSvg.trim()}
      </span>`;
  };

  const buildToggleHtml = (item) => {
    const isDisabled = item.requiresLogin && !loggedIn;
    const wrapperClass = isDisabled ? 'cc-requires-login' : '';
    const titleSuffix = isDisabled ? '\n(Vyžaduje přihlášení)' : '';
    const disabledAttr = isDisabled ? 'disabled' : '';

    return `
      <div class="cc-setting-row ${wrapperClass}" title="${escapeHtml((item.tooltip || '') + titleSuffix)}">
          <label class="cc-switch">
              <input type="checkbox" id="${item.id}" ${disabledAttr} />
              <span class="cc-switch-bg"></span>
          </label>
          <span class="cc-setting-label ${item.infoIcon ? 'cc-grow' : ''}">
            <span class="cc-setting-label-content ${item.leadingIconSvg ? 'cc-setting-label-content-with-leading-icon' : ''}">
              ${renderLeadingIconHtml(item)}
              <span>${escapeHtml(item.label)}</span>
            </span>
          </span>
          ${
            item.infoIcon
              ? `
              <div class="cc-setting-icons">
                  <div class="cc-info-icon" aria-label="${escapeHtml(item.infoIcon.text)}" data-image-url="${escapeHtml(item.infoIcon.url)}">
                      <svg width="14" height="14"><use href="#cc-icon-info"></use></svg>
                  </div>
              </div>`
              : ''
          }
      </div>`;
  };

  const buildGroupHtml = (item) => {
    const isDisabled = item.requiresLogin && !loggedIn;
    const wrapperClass = isDisabled ? 'cc-requires-login' : '';
    const titleSuffix = isDisabled ? '\n(Vyžaduje přihlášení)' : '';
    const disabledAttr = isDisabled ? 'disabled' : '';

    return `
      <div class="cc-setting-group ${wrapperClass}" id="${item.id}-group" style="margin-top: 2px;">
          <div class="cc-setting-row" title="${escapeHtml((item.tooltip || '') + titleSuffix)}">
              <label class="cc-switch">
                  <input type="checkbox" id="${item.id}" ${disabledAttr} />
                  <span class="cc-switch-bg"></span>
              </label>
              <div class="cc-setting-collapse-trigger" id="${item.groupToggleId}" aria-expanded="false">
                  <span class="cc-setting-label cc-grow">${escapeHtml(item.label)}</span>
                  ${
                    item.infoIcon
                      ? `
                      <div class="cc-setting-icons" style="margin-right: 6px;">
                          <div class="cc-info-icon" aria-label="${escapeHtml(item.infoIcon.text)}" data-image-url="${escapeHtml(item.infoIcon.url)}">
                              <svg width="14" height="14"><use href="#cc-icon-info"></use></svg>
                          </div>
                      </div>`
                      : ''
                  }
                  <svg class="cc-chevron" width="14" height="14"><use href="#cc-icon-chevron"></use></svg>
              </div>
          </div>
          <div class="cc-setting-sub" id="${item.groupBodyId}" hidden>
              ${(item.childrenItems || []).map(buildToggleHtml).join('')}
              ${item.childrenHtml || ''}
          </div>
      </div>`;
  };

  const dynamicContainer = queryMenu('#cc-dynamic-settings-container');
  if (dynamicContainer) {
    let generatedHtml = '';
    MENU_CONFIG.forEach((cat, idx) => {
      generatedHtml += `<h3 class="cc-category-title ${idx === 0 ? 'cc-category-first' : ''}">${escapeHtml(cat.category)}</h3>`;
      generatedHtml += `<div class="cc-config-list">`;
      cat.items.forEach((item) => {
        if (item.type === 'toggle') generatedHtml += buildToggleHtml(item);
        else if (item.type === 'group') generatedHtml += buildGroupHtml(item);
      });
      generatedHtml += `</div>`;
    });
    dynamicContainer.innerHTML = generatedHtml;
  }

  const togglesTracker = [];
  function bindToggle(selector, storageKey, defaultValue, eventName, toastOn, toastOff, callback = null) {
    const element = queryMenu(selector);
    if (!element) return;

    element.checked = getBoolSetting(storageKey, defaultValue);
    togglesTracker.push({ element, storageKey, defaultValue });

    element.addEventListener('change', () => {
      localStorage.setItem(storageKey, String(element.checked));
      // skipSync: true so redraw triggers won't mistakenly try to push cloud updates constantly
      if (eventName)
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: { enabled: element.checked, skipSync: true },
          }),
        );
      if (toastOn && toastOff) showSettingsInfoToast(element.checked ? toastOn : toastOff);
      if (callback) callback();
    });
  }

  function bindGroupCollapse(groupId, toggleId, bodyId, storageKey) {
    const group = queryMenu(`#${groupId}`);
    const toggle = queryMenu(`#${toggleId}`);
    const body = queryMenu(`#${bodyId}`);
    if (!toggle || !body) return;

    const syncExpandedHeight = () => {
      const wasHidden = body.hidden;
      if (wasHidden) body.hidden = false;
      body.style.setProperty('--cc-setting-sub-max-height', `${body.scrollHeight}px`);
      if (wasHidden) body.hidden = true;
    };

    const setCollapsed = (collapsed) => {
      if (!collapsed) {
        syncExpandedHeight();
      }
      if (group) group.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      body.hidden = collapsed;
      localStorage.setItem(storageKey, String(collapsed));
    };

    setCollapsed(getBoolSetting(storageKey, true));
    toggle.addEventListener('click', (e) => {
      // If user click on an info icon, we don't want to toggle the group collapse
      if (e.target.closest('.cc-setting-icons')) return;

      const currently = group?.classList.contains('is-collapsed');
      setCollapsed(!currently);
    });
  }

  MENU_CONFIG.forEach((cat) => {
    cat.items.forEach((item) => {
      if (item.type === 'toggle' || item.type === 'group') {
        bindToggle(`#${item.id}`, item.storageKey, item.defaultValue, item.eventName, null, null, item.callback);
      }
      if (item.type === 'group') {
        bindGroupCollapse(`${item.id}-group`, item.groupToggleId, item.groupBodyId, item.collapsedKey);
        (item.childrenItems || []).forEach((child) => {
          bindToggle(`#${child.id}`, child.storageKey, child.defaultValue, child.eventName, null, null, child.callback);
        });
      }
    });
  });

  initializeVersionUi(settingsButton).catch(() => undefined);
  initializeRatingsLoader(settingsButton);
  initializeRatingsSync(settingsButton, getCurrentUserSlug);

  const cacheSelect = queryMenu('#cc-hover-preview-cache-hours');
  if (cacheSelect) {
    cacheSelect.value = localStorage.getItem(HOVER_PREVIEW_CACHE_HOURS_KEY) || '24';
    cacheSelect.addEventListener('change', () => {
      localStorage.setItem(HOVER_PREVIEW_CACHE_HOURS_KEY, cacheSelect.value);
      showSettingsInfoToast('Délka mezipaměti uložena.');
    });
  }

  const linkIconsPositionSelect = queryMenu('#cc-link-icons-position');
  if (linkIconsPositionSelect) {
    linkIconsPositionSelect.value = localStorage.getItem(LINK_ICONS_POSITION_KEY) || 'before';
    updateLinkIconsUI();
    linkIconsPositionSelect.addEventListener('change', () => {
      localStorage.setItem(LINK_ICONS_POSITION_KEY, linkIconsPositionSelect.value);
      updateLinkIconsUI();
      window.dispatchEvent(
        new CustomEvent(LINK_ICONS_UPDATED_EVENT, {
          detail: { position: linkIconsPositionSelect.value, skipSync: true },
        }),
      );
    });
  }

  const pillInput = queryMenu('#cc-hide-reviews-pill-input');
  const pillsWrapper = queryMenu('#cc-hide-reviews-pills');
  const pillContainer = queryMenu('#cc-hide-reviews-pill-container');
  const hideApplyBtn = queryMenu('#cc-hide-reviews-apply');

  let currentPills = [];
  try {
    const saved = localStorage.getItem(HIDE_SELECTED_REVIEWS_LIST_KEY);
    if (saved) currentPills = JSON.parse(saved);
  } catch (e) {}

  const renderPills = () => {
    if (!pillsWrapper) return;
    pillsWrapper.innerHTML = '';
    currentPills.forEach((pill, index) => {
      const pillEl = document.createElement('span');
      pillEl.className = 'cc-pill';
      pillEl.textContent = pill;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'cc-pill-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        currentPills.splice(index, 1);
        renderPills();
      };

      pillEl.appendChild(removeBtn);
      pillsWrapper.appendChild(pillEl);
    });
  };

  const addPill = (value) => {
    const trimmed = value.trim();
    if (trimmed && !currentPills.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      currentPills.push(trimmed);
      renderPills();
    }
    if (pillInput) pillInput.value = '';
  };

  if (pillInput) {
    pillInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
        e.preventDefault();
        addPill(pillInput.value);
      } else if (e.key === 'Backspace' && pillInput.value === '' && currentPills.length > 0) {
        currentPills.pop();
        renderPills();
      }
    });
    pillInput.addEventListener('blur', () => addPill(pillInput.value));
  }

  if (pillContainer) {
    pillContainer.addEventListener('click', () => {
      if (!pillContainer.classList.contains('is-disabled')) pillInput?.focus();
    });
  }

  if (hideApplyBtn) {
    hideApplyBtn.addEventListener('click', () => {
      if (pillInput && pillInput.value.trim()) addPill(pillInput.value);
      localStorage.setItem(HIDE_SELECTED_REVIEWS_LIST_KEY, JSON.stringify(currentPills));
      window.dispatchEvent(new CustomEvent('cc-hide-selected-reviews-updated'));
      showSettingsInfoToast('Seznam skrytých uživatelů byl uložen.');
    });
  }

  renderPills();
  updateHoverPreviewUI();
  updateHideReviewsUI();
  updateHidePanelsUI();
  updateLinkIconsUI();
  updateShowRatingsUI();

  let currentPanelPills = [];
  try {
    const savedPanels = localStorage.getItem('cc_hidden_panels_list');
    if (savedPanels) currentPanelPills = JSON.parse(savedPanels);
  } catch (e) {}

  const renderPanelPills = () => {
    const wrapper = queryMenu('#cc-hide-panels-pills');
    const emptyText = queryMenu('#cc-hide-panels-empty');
    if (!wrapper || !emptyText) return;

    wrapper.innerHTML = '';

    if (currentPanelPills.length === 0) {
      emptyText.style.display = 'block';
    } else {
      emptyText.style.display = 'none';
      currentPanelPills.forEach((pill, index) => {
        const pillEl = document.createElement('span');
        pillEl.className = 'cc-pill';
        pillEl.textContent = pill;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'cc-pill-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          currentPanelPills.splice(index, 1);
          localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentPanelPills));
          renderPanelPills();
          window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
        };

        pillEl.appendChild(removeBtn);
        wrapper.appendChild(pillEl);
      });
    }
  };

  renderPanelPills();
  window.addEventListener('cc-hidden-panels-updated', () => {
    try {
      currentPanelPills = JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]');
    } catch (e) {}
    renderPanelPills();
  });

  const restoreAllPanelsBtn = queryMenu('#cc-restore-all-panels-btn');
  if (restoreAllPanelsBtn) {
    restoreAllPanelsBtn.addEventListener('click', () => {
      if (currentPanelPills.length > 0) {
        currentPanelPills = [];
        localStorage.setItem('cc_hidden_panels_list', JSON.stringify(currentPanelPills));
        renderPanelPills();
        window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
        showSettingsInfoToast('Všechny panely byly obnoveny.');
      } else {
        showSettingsInfoToast('Žádné panely ke smazání.');
      }
    });
  }

  const devBtn = queryMenu('#cc-maint-dev-btn');

  const updateDevState = () => {
    // 1. Get the current state
    const isDev = localStorage.getItem('cc_dev_mode') === 'true';

    // 2. Update the button text (safe because devBtn is in memory)
    if (devBtn) {
      devBtn.textContent = isDev ? 'DEV: ON' : 'DEV: OFF';
    }

    // 3. Firefox safety check: Wait for the body to exist before touching it
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', updateDevState, {
        once: true,
      });
      return;
    }

    // 4. Update the body class
    document.body.classList.toggle('cc-dev-mode-active', isDev);
  };

  updateDevState();

  if (devBtn) {
    devBtn.addEventListener('click', () => {
      const isDev = localStorage.getItem('cc_dev_mode') === 'true';
      localStorage.setItem('cc_dev_mode', String(!isDev));
      updateDevState();
      showSettingsInfoToast(`Vývojářský režim: ${!isDev ? 'ZAPNUT' : 'VYPNUT'}`);

      // If we just turned DEV off, automatically turn off the Hover lock
      if (isDev) {
        // Find the checkbox (either the main one or the floating fallback)
        const hoverCheckbox = document.querySelector(
          '#cc-debug-hover-checkbox, .fancy-alert-controls input[type="checkbox"]',
        );

        // If it exists and is checked, natively click it to trigger its own 'change' logic
        if (hoverCheckbox && hoverCheckbox.checked) {
          hoverCheckbox.click();
        }
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return;
    if (event.repeat) return;

    const controller = settingsButton.__ccSettingsMenuController;
    const isPinnedOpen = controller?.isPinnedOpen?.() === true;

    const activeTag = document.activeElement?.tagName;
    const isTypingContext =
      document.activeElement?.isContentEditable ||
      activeTag === 'INPUT' ||
      activeTag === 'TEXTAREA' ||
      activeTag === 'SELECT';

    const key = (event.key || '').toLowerCase();
    if (key !== 'c') return;

    if (isTypingContext && !isPinnedOpen) return;

    event.preventDefault();
    toggleSettingsShortcutMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    const controller = settingsButton.__ccSettingsMenuController;
    if (!controller?.isPinnedOpen?.()) return;

    closeSettingsShortcutMenu();
  });

  // --------------------------------------------------------
  // Homepage Panels Visibility Logic
  // --------------------------------------------------------
  const updatePanelsFeatureState = () => {
    // Evaluate the setting. (Default is true, so we check if it's explicitly 'false')
    const isEnabled = localStorage.getItem('cc_hide_home_panels') !== 'false';

    // Wait for body to exist before toggling the class (Firefox safety)
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', updatePanelsFeatureState, { once: true });
      return;
    }

    document.body.classList.toggle('cc-panels-feature-enabled', isEnabled);
  };

  // 1. Run immediately on load
  updatePanelsFeatureState();

  // 2. Listen for changes from the settings menu toggle
  window.addEventListener('cc-hidden-panels-updated', updatePanelsFeatureState);

  const syncControlsFromStorage = () => {
    togglesTracker.forEach((t) => (t.element.checked = getBoolSetting(t.storageKey, t.defaultValue)));
    syncSelectControlsFromStorage();
    updateHoverPreviewUI();
    updateHideReviewsUI();
    updateHidePanelsUI();
    updateLinkIconsUI();
    updateShowRatingsUI();
    updateDevState();
  };

  settingsButton.querySelector('#cc-maint-reset-btn')?.addEventListener('click', () => {
    if (!confirm('Opravdu chcete vyresetovat všechna nastavení (tlačítka a skryté uživatele) do výchozího stavu?'))
      return;

    togglesTracker.forEach((t) => localStorage.removeItem(t.storageKey));

    localStorage.removeItem(HOVER_PREVIEW_CACHE_HOURS_KEY);
    localStorage.removeItem(HOVER_PREVIEW_SECTION_COLLAPSED_KEY);
    localStorage.removeItem(HIDE_REVIEWS_SECTION_COLLAPSED_KEY);
    localStorage.removeItem(HIDE_SELECTED_REVIEWS_LIST_KEY);
    localStorage.removeItem(LINK_ICONS_POSITION_KEY);
    localStorage.removeItem(SHOW_RATINGS_IN_DIARIES_KEY);
    localStorage.removeItem(SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY);
    localStorage.removeItem(SHOW_RATINGS_IN_REVIEWS_KEY);
    localStorage.removeItem(SHOW_RATINGS_KEY);
    localStorage.removeItem(SHOW_RATINGS_SECTION_COLLAPSED_KEY);
    localStorage.removeItem('cc_hide_home_panels');
    localStorage.removeItem('cc_hidden_panels_list');
    localStorage.removeItem('cc_hide_panels_collapsed');
    localStorage.removeItem('cc_dev_mode');
    localStorage.removeItem('cc_creator_preview_cache_hours');
    localStorage.removeItem('cc_creator_preview_enabled');
    localStorage.removeItem('cc_creator_preview_show_birth');
    localStorage.removeItem('cc_creator_preview_show_photo_from');
    localStorage.removeItem('cc_creator_preview_section_collapsed');

    currentPills = [];
    renderPills();

    currentPanelPills = [];
    renderPanelPills();

    syncControlsFromStorage();

    window.dispatchEvent(
      new CustomEvent(LINK_ICONS_UPDATED_EVENT, {
        detail: { position: localStorage.getItem(LINK_ICONS_POSITION_KEY) || 'before', skipSync: true },
      }),
    );

    window.dispatchEvent(
      new CustomEvent('cc-gallery-image-links-toggled', {
        detail: { enabled: true },
      }),
    );
    window.dispatchEvent(new CustomEvent('cc-hide-selected-reviews-updated'));
    window.dispatchEvent(new CustomEvent('cc-hidden-panels-updated'));
    window.dispatchEvent(new CustomEvent('cc-ratings-updated', { detail: { skipSync: true } }));
    showSettingsInfoToast('Všechna nastavení byla vrácena na výchozí hodnoty.');
  });

  const dbDeleteBtn = settingsButton.querySelector('#cc-maint-clear-db-btn');
  if (dbDeleteBtn) {
    dbDeleteBtn.addEventListener('click', async () => {
      const originalText = dbDeleteBtn.textContent;

      dbDeleteBtn.textContent = 'Mažu...';
      dbDeleteBtn.style.opacity = '0.5';
      dbDeleteBtn.style.pointerEvents = 'none';

      try {
        await deleteAllDataFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
        invalidateRatingsModalCache();
        window.dispatchEvent(
          new CustomEvent('cc-ratings-updated', {
            detail: { skipSync: true },
          }),
        );
        showSettingsInfoToast('Uložená hodnocení byla smazána.');
      } catch (error) {
        console.error('[CC] Failed to clear ratings store:', error);
        showSettingsInfoToast('Smazání uložených hodnocení selhalo.');
      } finally {
        dbDeleteBtn.textContent = originalText;
        dbDeleteBtn.style.opacity = '';
        dbDeleteBtn.style.pointerEvents = '';
      }
    });
  }

  let localStorageModal;
  const ensureLocalStorageModal = () => {
    if (localStorageModal) return localStorageModal;

    const detailsController = createDetailsModalController({
      overlayClass: 'cc-generic-detail-overlay',
      defaultTitle: 'Detail',
      titleId: 'cc-generic-detail-title',
    });
    const modalState = {
      collapsedGroups: new Set(['hover-preview-cache']),
    };

    const overlay = document.createElement('div');
    overlay.className = 'cc-lc-modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="cc-lc-modal" role="dialog" aria-modal="true" aria-label="Správa LocalStorage">
        <div class="cc-lc-modal-head">
          <h3>Správa LocalStorage</h3>
          <button type="button" class="cc-lc-modal-close" aria-label="Zavřít">×</button>
        </div>
        <div class="cc-lc-modal-help">Klíče používané CSFD-Compare (cc_*, CSFD-Compare*).</div>
        <div class="cc-lc-modal-body">
          <table class="cc-lc-table">
            <thead><tr><th>Klíč</th><th>Hodnota</th><th>Akce</th></tr></thead>
            <tbody id="cc-lc-table-body"></tbody>
          </table>
        </div>
        <div class="cc-lc-modal-actions">
          <button type="button" class="cc-button cc-button-red cc-button-small" id="cc-lc-delete-all-btn">Smazat vše</button>
          <button type="button" class="cc-button cc-button-black cc-button-small" id="cc-lc-close-btn">Zavřít</button>
        </div>
      </div>`;

    const closeModal = () => {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
    };

    const syncAfterLocalStorageChange = () => {
      syncControlsFromStorage();
      window.dispatchEvent(
        new CustomEvent('cc-gallery-image-links-toggled', {
          detail: {
            enabled: getBoolSetting(GALLERY_IMAGE_LINKS_ENABLED_KEY, true),
          },
        }),
      );
    };

    const buildEntryRowHtml = (key, value, options = {}) => {
      const isGroupedChild = options.grouped === true;
      const rowClass = isGroupedChild ? 'cc-lc-entry-row is-group-child' : 'cc-lc-entry-row';
      const keyClass = isGroupedChild ? 'cc-lc-key cc-lc-key-child' : 'cc-lc-key';

      return `
        <tr class="${rowClass}">
          <td class="${keyClass}" title="${escapeHtml(key)}">${escapeHtml(key)}</td>
          <td class="cc-lc-value" title="${escapeHtml(String(value))}">
            <div class="cc-lc-value-content">
              <span class="cc-lc-value-text">${escapeHtml(formatLocalStorageValue(value))}</span>
              <button type="button" class="cc-lc-value-info" data-key="${escapeHtml(key)}" aria-label="Zobrazit detail hodnoty">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" />
                  <path d="M12 11.5V15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <circle cx="12" cy="8.2" r="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </td>
          <td class="cc-lc-action">
             <button type="button" class="cc-button cc-button-red cc-button-small cc-lc-delete-one" data-key="${escapeHtml(key)}">Smazat</button>
          </td>
        </tr>`;
    };

    const refreshTable = () => {
      const tableBody = overlay.querySelector('#cc-lc-table-body');
      if (!tableBody) return;
      const entries = getManagedLocalStorageEntries();
      const rows = buildManagedLocalStorageRows(entries);

      if (!rows.length) {
        tableBody.innerHTML = '<tr><td colspan="3" class="cc-lc-table-empty">Žádné relevantní položky.</td></tr>';
        return;
      }

      tableBody.innerHTML = rows
        .map((row) => {
          if (row.type === 'entry') {
            return buildEntryRowHtml(row.entry.key, row.entry.value, { grouped: false });
          }

          const isCollapsed = modalState.collapsedGroups.has(row.id);
          const toggleSymbol = isCollapsed ? '▸' : '▾';
          const summaryLabel = `${row.entries.length} položek`;
          const groupRowHtml = `
            <tr class="cc-lc-group-row" data-group-id="${row.id}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
              <td class="cc-lc-key cc-lc-group-key">
                <button type="button" class="cc-lc-group-toggle" data-group-id="${row.id}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
                  <span class="cc-lc-group-chevron" aria-hidden="true">${toggleSymbol}</span>
                  <span class="cc-lc-group-label">${escapeHtml(row.label)}</span>
                </button>
              </td>
              <td class="cc-lc-value cc-lc-group-summary">${summaryLabel}</td>
              <td class="cc-lc-action">
                 <button type="button" class="cc-button cc-button-red cc-button-small cc-lc-delete-group" data-group-id="${row.id}">Smazat vše</button>
              </td>
            </tr>`;

          if (isCollapsed) return groupRowHtml;

          return `${groupRowHtml}${row.entries
            .map((entry) => buildEntryRowHtml(entry.key, entry.value, { grouped: true }))
            .join('')}`;
        })
        .join('');
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    overlay.querySelector('.cc-lc-modal-close')?.addEventListener('click', closeModal);
    overlay.querySelector('#cc-lc-close-btn')?.addEventListener('click', closeModal);

    overlay.querySelector('#cc-lc-delete-all-btn')?.addEventListener('click', () => {
      getManagedLocalStorageEntries().forEach((entry) => localStorage.removeItem(entry.key));
      syncAfterLocalStorageChange();
      detailsController.close();
      refreshTable();
      showSettingsInfoToast('Relevantní LocalStorage klíče byly smazány.');
    });

    overlay.querySelector('#cc-lc-table-body')?.addEventListener('click', (e) => {
      const groupDeleteBtn = e.target.closest('.cc-lc-delete-group');
      if (groupDeleteBtn?.dataset.groupId === 'hover-preview-cache') {
        getManagedLocalStorageEntries()
          .filter((entry) => isHoverPreviewCacheKey(entry.key))
          .forEach((entry) => localStorage.removeItem(entry.key));
        syncAfterLocalStorageChange();
        detailsController.close();
        refreshTable();
        showSettingsInfoToast('Smazány všechny cache položky náhledů.');
        return;
      }

      const groupRow = e.target.closest('.cc-lc-group-row');
      if (groupRow?.dataset.groupId && !e.target.closest('.cc-lc-delete-group')) {
        const { groupId } = groupRow.dataset;
        if (modalState.collapsedGroups.has(groupId)) modalState.collapsedGroups.delete(groupId);
        else modalState.collapsedGroups.add(groupId);
        refreshTable();
        return;
      }

      const infoBtn = e.target.closest('.cc-lc-value-info');
      if (infoBtn?.dataset.key) {
        const key = infoBtn.dataset.key;
        detailsController.open(`Hodnota: ${key}`, getLocalStorageValueDetailRows(localStorage.getItem(key) ?? ''));
        return;
      }

      const deleteBtn = e.target.closest('.cc-lc-delete-one');
      if (!deleteBtn || !deleteBtn.dataset.key) return;
      localStorage.removeItem(deleteBtn.dataset.key);
      syncAfterLocalStorageChange();
      refreshTable();
      showSettingsInfoToast(`Smazán klíč: ${deleteBtn.dataset.key}`);
    });

    overlay.addEventListener('cc-lc-open', () => {
      refreshTable();
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add('is-open'));
    });

    document.body.appendChild(overlay);
    document.body.appendChild(detailsController.overlay);
    return (localStorageModal = overlay);
  };

  settingsButton.querySelector('#cc-maint-clear-lc-btn')?.addEventListener('click', () => {
    ensureLocalStorageModal().dispatchEvent(new CustomEvent('cc-lc-open'));
  });

  settingsButton.querySelector('#cc-sync-cloud-btn')?.addEventListener(
    'click',
    (e) => {
      if (isUserLoggedIn()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      showSettingsInfoToast('Cloud sync je dostupný až po přihlášení.');
    },
    true,
  );

  settingsButton.querySelector('#cc-version-info-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openVersionInfoModal(settingsButton).catch((err) => console.error('[CC] Failed to open version info modal:', err));
  });

  const ratingsModalOptions = { getCurrentUserSlug, getMostFrequentUserSlug };
  const setupBadge = (id, type) => {
    const badge = settingsButton.querySelector(id);
    if (!badge) return;
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');

    const handler = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();
      if (!isUserLoggedIn()) {
        showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
        return;
      }
      openRatingsTableModal(settingsButton, type, ratingsModalOptions).catch((err) =>
        console.error(`[CC] Failed to open ${type} ratings table:`, err),
      );
    };

    badge.addEventListener('click', handler);
    badge.addEventListener('keydown', handler);
  };

  setupBadge('#cc-badge-red', 'direct');
  setupBadge('#cc-badge-black', 'computed');

  // Setup the dedicated list button in the settings menu
  const listBtn = settingsButton.querySelector('#cc-open-ratings-btn');
  if (listBtn) {
    const handler = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();

      if (!isUserLoggedIn()) {
        showSettingsInfoToast('Pro zobrazení hodnocení se prosím přihlaste.');
        return;
      }
      openRatingsTableModal(settingsButton, 'all', ratingsModalOptions).catch((err) =>
        console.error(`[CC] Failed to open ratings table via icon button:`, err),
      );
    };

    listBtn.addEventListener('click', handler);
    listBtn.addEventListener('keydown', handler);
  }

  const badgeRefreshOptions = {
    isUserLoggedIn,
    getCurrentUserSlug,
    getMostFrequentUserSlug,
  };
  const refreshBadgesSafely = () =>
    refreshRatingsBadges(settingsButton, badgeRefreshOptions).catch((err) =>
      console.error('[CC] Failed to refresh badges:', err),
    );

  refreshBadgesSafely();
  window.setTimeout(refreshBadgesSafely, 1200);

  settingsButton.addEventListener('click', (e) => {
    const infoIcon = e.target.closest('.cc-info-icon[data-image-url]');
    if (!infoIcon) return;

    e.preventDefault();
    e.stopPropagation();

    const url = infoIcon.getAttribute('data-image-url');
    const titleText =
      infoIcon.closest('.cc-setting-row')?.querySelector('.cc-setting-label')?.textContent || 'Ukázka funkce';

    if (url) {
      const modal = getOrCreateImageModal();
      modal.querySelector('#cc-image-modal-title').textContent = titleText;
      modal.querySelector('#cc-image-modal-img').src = url;
      modal.classList.add('is-open');
    }
  });

  initializeSettingsMenuHover(settingsButton);

  let autoSyncTimeout;
  window.addEventListener('cc-ratings-updated', (e) => {
    invalidateRatingsModalCache();
    refreshBadgesSafely();

    if (e && e.detail && e.detail.skipSync) {
      return;
    }

    clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      performCloudSync();
    }, 3000);
  });

  const SYNC_COOLDOWN_MS = 1000 * 60 * 60 * 2;
  const lastAutoSync = Number.parseInt(localStorage.getItem('cc_last_startup_sync') || '0', 10);

  if (Date.now() - lastAutoSync > SYNC_COOLDOWN_MS) {
    console.log('☁️ [CC Sync] Running startup background sync...');
    localStorage.setItem('cc_last_startup_sync', String(Date.now()));
    setTimeout(() => {
      performCloudSync();
    }, 2500);
  }

  // ==========================================
  // GLOBAL KEYBOARD SHORTCUTS
  // ==========================================
  document.addEventListener('keydown', (e) => {
    // CTRL + ALT + R ==> "Zobrazit hodnocení"
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
      // Prevent default ctrl+alt+r behaviour if any
      e.preventDefault();

      const showRatingsToggle = settingsButton.querySelector('#cc-show-ratings');
      if (showRatingsToggle && !showRatingsToggle.disabled) {
        // Virtual click on the toggle like the user would.
        // This ensures all the proper event handlers run and state is consistent.
        showRatingsToggle.click();

        const isEnabled = showRatingsToggle.checked;
        showSettingsInfoToast(`Zobrazení hodnocení: ${isEnabled ? 'ZAPNUTO' : 'VYPNUTO'}`);
      }
    }
  });
}

export { addSettingsButton };
