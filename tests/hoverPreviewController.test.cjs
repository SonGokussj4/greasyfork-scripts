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
});
