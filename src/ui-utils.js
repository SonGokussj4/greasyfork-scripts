// Utility to enable/disable controls by IDs based on login state
export function setControlsDisabledByLoginState(isLoggedIn, controlIds) {
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

export function formatDetailValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return typeof value === 'string' ? value : String(value);
}

function createDetailGroup(label, value) {
  return {
    type: 'group',
    label,
    rows: buildStructuredDetailItems(value),
  };
}

export function buildStructuredDetailItems(value, label = 'value') {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ key: label, value: '[]' }];
    return value.map((item, index) =>
      item && typeof item === 'object'
        ? createDetailGroup(`${label}[${index}]`, item)
        : { key: `[${index}]`, value: formatDetailValue(item) },
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return [{ key: label, value: '{}' }];
    return entries.map(([key, nestedValue]) =>
      nestedValue && typeof nestedValue === 'object'
        ? createDetailGroup(key, nestedValue)
        : { key, value: formatDetailValue(nestedValue) },
    );
  }

  return [{ key: label, value: formatDetailValue(value) }];
}

function appendDetailsRows(container, items) {
  items.forEach((item) => {
    if (item?.type === 'group') {
      const groupEl = document.createElement('div');
      groupEl.className = 'cc-detail-group';

      const groupTitleEl = document.createElement('div');
      groupTitleEl.className = 'cc-detail-group-title';
      groupTitleEl.textContent = item.label;

      const groupBodyEl = document.createElement('div');
      groupBodyEl.className = 'cc-detail-group-body';
      appendDetailsRows(groupBodyEl, item.rows || []);

      groupEl.appendChild(groupTitleEl);
      groupEl.appendChild(groupBodyEl);
      container.appendChild(groupEl);
      return;
    }

    const rowEl = document.createElement('div');
    rowEl.className = 'cc-rating-detail-row';

    const keyEl = document.createElement('div');
    keyEl.className = 'cc-rating-detail-key';
    keyEl.textContent = item?.key ?? '';

    const valueEl = document.createElement('div');
    valueEl.className = 'cc-rating-detail-value';
    valueEl.textContent = item?.value ?? '';

    rowEl.appendChild(keyEl);
    rowEl.appendChild(valueEl);
    container.appendChild(rowEl);
  });
}

/**
 * Creates a modal that shows extra details.
 * It displas simple values or grouped/nested detail items.
 * The returned object lets you open and close the popup.
 *
 * @param {Object} options Settings for the popup
 * @param {string} options.overlayClass Extra CSS class added to the popup overlay
 * @param {string} options.defaultTitle Default heading shown at the top of the popup
 * @param {string} options.titleId ID used for the popup title element
 * @returns {Object} An object with methods to control the popup
 */
export function createDetailsModalController({
  overlayClass = '',
  defaultTitle = 'Detail',
  titleId = 'cc-detail-title',
} = {}) {
  const detailsOverlay = document.createElement('div');
  detailsOverlay.className = ['cc-rating-detail-overlay', overlayClass].filter(Boolean).join(' ');
  detailsOverlay.innerHTML = `
    <div class="cc-rating-detail-card" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="cc-rating-detail-head">
        <h4 id="${titleId}">${defaultTitle}</h4>
        <button type="button" class="cc-rating-detail-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-rating-detail-body"></div>
    </div>
  `;

  const detailsBody = detailsOverlay.querySelector('.cc-rating-detail-body');
  const detailsTitle = detailsOverlay.querySelector(`#${titleId}`);
  const closeDetailsBtn = detailsOverlay.querySelector('.cc-rating-detail-close');

  const open = (title, rows = []) => {
    detailsTitle.textContent = title || defaultTitle;
    detailsBody.innerHTML = '';
    appendDetailsRows(detailsBody, rows);
    detailsOverlay.classList.add('is-open');
  };

  const close = () => detailsOverlay.classList.remove('is-open');

  // Use an AbortController to manage event listeners and ensure they are cleaned up when the modal is destroyed
  const abortController = new AbortController();
  const { signal } = abortController;

  closeDetailsBtn.addEventListener('click', close);
  detailsOverlay.addEventListener('click', (event) => {
    if (event.target === detailsOverlay) close();
  });

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && detailsOverlay.classList.contains('is-open')) close();
    },
    { signal },
  );

  const destroy = () => {
    abortController.abort();
    detailsOverlay.remove();
  };

  return {
    overlay: detailsOverlay,
    open,
    close,
    destroy,
    isOpen: () => detailsOverlay.classList.contains('is-open'),
  };
}
