const path = require('path');
const { pathToFileURL } = require('url');

let Csfd;

beforeAll(async () => {
  ({ Csfd } = await import(pathToFileURL(path.resolve(__dirname, '../src/csfd.js')).href));
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});

function renderTvTipsPanel(dayName) {
  document.body.innerHTML = `
    <div class="page-content">
      <div class="row">
        <div class="column column-half" data-tv-tips-column>
          <section class="updated-box">
            <header class="updated-box-header updated-box-header-nowrap">
              <h2>TV tipy dne - ${dayName}</h2>
              <div class="updated-box-header-action">
                <a href="/televize/" class="button">vice</a>
              </div>
            </header>
            <div class="updated-box-content">Obsah</div>
          </section>
        </div>
      </div>
    </div>
  `;
}

describe('homepage panel hiding', () => {
  test('stores a stable key when hiding TV tipy dne panels', () => {
    renderTvTipsPanel('nedele');

    const csfd = new Csfd(document.body);
    csfd.initHomePanels();

    const hideButton = document.querySelector('.cc-hide-panel-btn');
    hideButton.click();
    csfd._syncVisibility();

    expect(JSON.parse(localStorage.getItem('cc_hidden_panels_list') || '[]')).toEqual(['TV tipy dne -']);
    expect(document.querySelector('[data-tv-tips-column]').style.display).toBe('none');
  });

  test('keeps legacy day-specific TV tipy dne entries hidden on following days', () => {
    localStorage.setItem('cc_hidden_panels_list', JSON.stringify(['TV tipy dne - nedele']));
    renderTvTipsPanel('pondeli');

    const csfd = new Csfd(document.body);
    csfd.initHomePanels();

    expect(document.querySelector('[data-tv-tips-column]').style.display).toBe('none');
  });
});
