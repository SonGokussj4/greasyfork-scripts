export function createRatingDetailsController() {
  const detailsOverlay = document.createElement('div');
  detailsOverlay.className = 'cc-rating-detail-overlay';
  detailsOverlay.innerHTML = `
    <div class="cc-rating-detail-card" role="dialog" aria-modal="true" aria-labelledby="cc-rating-detail-title">
      <div class="cc-rating-detail-head">
        <h4 id="cc-rating-detail-title">Detail záznamu</h4>
        <button type="button" class="cc-rating-detail-close" aria-label="Zavřít">×</button>
      </div>
      <div class="cc-rating-detail-body"></div>
    </div>
  `;

  const detailsBody = detailsOverlay.querySelector('.cc-rating-detail-body');
  const detailsTitle = detailsOverlay.querySelector('#cc-rating-detail-title');
  const closeDetailsBtn = detailsOverlay.querySelector('.cc-rating-detail-close');

  const orderedKeys = [
    'id',
    'userSlug',
    'movieId',
    'name',
    'url',
    'fullUrl',
    'type',
    'year',
    'rating',
    'date',
    'parentId',
    'parentName',
    'computed',
    'computedCount',
    'computedFromText',
    'lastUpdate',
  ];

  const open = (row) => {
    const record = row?.rawRecord || {};
    const extraKeys = Object.keys(record)
      .filter((key) => !orderedKeys.includes(key))
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    const keys = [...orderedKeys.filter((key) => key in record), ...extraKeys];

    detailsTitle.textContent = row?.name ? `Detail: ${row.name}` : 'Detail záznamu';
    detailsBody.innerHTML = '';

    for (const key of keys) {
      const value = record[key];
      const rowEl = document.createElement('div');
      rowEl.className = 'cc-rating-detail-row';

      const keyEl = document.createElement('div');
      keyEl.className = 'cc-rating-detail-key';
      keyEl.textContent = key;

      const valueEl = document.createElement('div');
      valueEl.className = 'cc-rating-detail-value';
      if (value === null) {
        valueEl.textContent = 'null';
      } else if (typeof value === 'undefined') {
        valueEl.textContent = 'undefined';
      } else if (typeof value === 'object') {
        valueEl.textContent = JSON.stringify(value);
      } else if (typeof value === 'number' && Number.isNaN(value)) {
        valueEl.textContent = 'NaN';
      } else {
        valueEl.textContent = String(value);
      }

      rowEl.appendChild(keyEl);
      rowEl.appendChild(valueEl);
      detailsBody.appendChild(rowEl);
    }

    detailsOverlay.classList.add('is-open');
  };

  const close = () => {
    detailsOverlay.classList.remove('is-open');
  };

  closeDetailsBtn.addEventListener('click', close);
  detailsOverlay.addEventListener('click', (event) => {
    if (event.target === detailsOverlay) {
      close();
    }
  });

  return {
    overlay: detailsOverlay,
    open,
    close,
    isOpen: () => detailsOverlay.classList.contains('is-open'),
  };
}
