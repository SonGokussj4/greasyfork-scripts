const path = require('path');
const { pathToFileURL } = require('url');

let hoverPreviewTestApi;

beforeAll(async () => {
  ({ __hoverPreviewTestApi: hoverPreviewTestApi } = await import(
    pathToFileURL(path.resolve(__dirname, '../src/hover-preview.js')).href
  ));
});

beforeEach(() => {
  document.body.innerHTML = '';
  hoverPreviewTestApi.resetHoverPreviewStateForTests();
});

afterEach(() => {
  hoverPreviewTestApi.resetHoverPreviewStateForTests();
});

describe('hover preview controller', () => {
  test('flips preview to the left when right-side placement would overflow the viewport', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.getBoundingClientRect = () => ({ width: 320, height: 180, top: 0, left: 0, right: 320, bottom: 180 });

    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });

    try {
      const position = hoverPreviewTestApi.getPreviewPosition(root, 430, 100, 18, 18);

      expect(position.x).toBe(92);
      expect(position.y).toBe(118);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  test('keeps preview on the right when there is enough room', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.getBoundingClientRect = () => ({ width: 320, height: 180, top: 0, left: 0, right: 320, bottom: 180 });

    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });

    try {
      const position = hoverPreviewTestApi.getPreviewPosition(root, 430, 100, 18, 18);

      expect(position.x).toBe(448);
      expect(position.y).toBe(118);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  test('keeps the loading indicator visible until all pending loads finish', () => {
    hoverPreviewTestApi.showLoadingIndicator();
    hoverPreviewTestApi.showLoadingIndicator();

    const indicator = document.querySelector('.cc-hover-preview-loading');

    expect(indicator).not.toBeNull();
    expect(indicator.classList.contains('is-visible')).toBe(true);
    expect(hoverPreviewTestApi.getPendingLoadingIndicators()).toBe(2);

    hoverPreviewTestApi.hideLoadingIndicator();

    expect(indicator.classList.contains('is-visible')).toBe(true);
    expect(indicator.getAttribute('aria-hidden')).toBe('false');
    expect(hoverPreviewTestApi.getPendingLoadingIndicators()).toBe(1);

    hoverPreviewTestApi.hideLoadingIndicator();

    expect(indicator.classList.contains('is-visible')).toBe(false);
    expect(indicator.getAttribute('aria-hidden')).toBe('true');
    expect(hoverPreviewTestApi.getPendingLoadingIndicators()).toBe(0);
  });

  test('clearActivePreview force-resets the loading indicator state', () => {
    hoverPreviewTestApi.showLoadingIndicator();
    hoverPreviewTestApi.showLoadingIndicator();

    const indicator = document.querySelector('.cc-hover-preview-loading');
    expect(indicator.classList.contains('is-visible')).toBe(true);

    hoverPreviewTestApi.clearActivePreview();

    expect(indicator.classList.contains('is-visible')).toBe(false);
    expect(indicator.getAttribute('aria-hidden')).toBe('true');
    expect(hoverPreviewTestApi.getPendingLoadingIndicators()).toBe(0);
  });

  test('ignores review self-navigation links but keeps useful review links hoverable', () => {
    document.body.innerHTML = `
      <div class="tabs tabs-review-content">
        <nav class="tab-nav tab-nav-count-2">
          <ul class="tab-nav-list">
            <li class="tab-nav-item active">
              <a class="tab-link" href="/film/1476388-jedna-bitva-za-druhou/recenze/">Uživatelské recenze</a>
            </li>
          </ul>
        </nav>

        <article id="review-13727081" data-film-review>
          <header class="article-header article-header-review">
            <div class="article-header-review-name">
              <h3 class="user-title">
                <a class="user-title-name" href="/uzivatel/78145-songokussj/prehled/">SonGokussj</a>
              </h3>
            </div>
            <div class="article-header-review-action">
              <a href="/uzivatel/78145-songokussj/recenze/">všechny recenze uživatele</a>
              <a href="/film/1476388-jedna-bitva-za-druhou/recenze/?review=13727081" class="permanent-link">perm</a>
            </div>
          </header>

          <p>
            <span class="comment" data-film-review-content>
              <a href="https://www.csfd.cz/film/1476388-jedna-bitva-za-druhou/recenze/?review=13725984">TheEvilTwin</a>
            </span>
            <a href="/film/1476388-jedna-bitva-za-druhou/recenze/#open-review-form" class="a-edit-review" data-open-review-form>edit</a>
          </p>
        </article>

        <div class="box-more-bar">
          <div class="pagination">
            <a href="/film/1476388-jedna-bitva-za-druhou/recenze/?page=2" class="page-next">další</a>
          </div>
        </div>
      </div>
    `;

    const tabsLink = document.querySelector('.tab-link');
    const authorLink = document.querySelector('.user-title-name');
    const allReviewsLink = document.querySelector('.article-header-review-action a');
    const permalink = document.querySelector('.permanent-link');
    const reviewMentionLink = document.querySelector('[data-film-review-content] a');
    const editLink = document.querySelector('.a-edit-review');
    const paginationLink = document.querySelector('.page-next');

    expect(hoverPreviewTestApi.shouldIgnoreAnchor(tabsLink)).toBe(true);
    expect(hoverPreviewTestApi.shouldIgnoreAnchor(authorLink)).toBe(false);
    expect(hoverPreviewTestApi.shouldIgnoreAnchor(allReviewsLink)).toBe(true);
    expect(hoverPreviewTestApi.shouldIgnoreAnchor(permalink)).toBe(true);
    expect(hoverPreviewTestApi.shouldIgnoreAnchor(reviewMentionLink)).toBe(false);
    expect(hoverPreviewTestApi.shouldIgnoreAnchor(editLink)).toBe(true);
    expect(hoverPreviewTestApi.shouldIgnoreAnchor(paginationLink)).toBe(true);
  });
});
