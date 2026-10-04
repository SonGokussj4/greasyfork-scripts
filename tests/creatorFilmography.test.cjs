const path = require('path');
const { pathToFileURL } = require('url');

let mod;

beforeAll(async () => {
  mod = await import(pathToFileURL(path.resolve(__dirname, '../src/creator-filmography.js')).href);
});

beforeEach(() => {
  localStorage.clear();
  document.body.className = '';
  window.history.replaceState({}, '', '/tvurce/2411-scarlett-johansson/prehled/');
  document.body.innerHTML = `<a class="film-title-name" href="/film/1-a/">Long title</a>
    <a class="film-title-name" title="Own" href="/film/2-b/">Other</a>`;
});

describe('creator one-line filmography', () => {
  test('is off by default', () => {
    mod.applyCreatorOneLine();
    expect(document.body.classList.contains('cc-creator-one-line')).toBe(false);
  });

  test('on: adds the class and a tooltip on hover, without overriding existing titles', () => {
    localStorage.setItem('cc_creator_one_line', 'true');
    mod.applyCreatorOneLine();
    const [a, b] = document.querySelectorAll('a.film-title-name');
    expect(document.body.classList.contains('cc-creator-one-line')).toBe(true);

    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(a.title).toBe('Long title');
    expect(b.title).toBe('Own');
  });

  test('rows added after apply also get a tooltip on hover', () => {
    localStorage.setItem('cc_creator_one_line', 'true');
    mod.applyCreatorOneLine();
    document.body.insertAdjacentHTML('beforeend', '<a class="film-title-name" href="/film/3-c/">Late row</a>');
    const late = document.body.lastElementChild;
    late.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(late.title).toBe('Late row');
  });

  test('turning it off removes the class and only the tooltips it added', () => {
    localStorage.setItem('cc_creator_one_line', 'true');
    mod.applyCreatorOneLine();
    const [a, b] = document.querySelectorAll('a.film-title-name');
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    localStorage.setItem('cc_creator_one_line', 'false');
    mod.applyCreatorOneLine();
    expect(document.body.classList.contains('cc-creator-one-line')).toBe(false);
    expect(a.hasAttribute('title')).toBe(false);
    expect(b.title).toBe('Own');
  });

  test('ignores non-creator pages', () => {
    localStorage.setItem('cc_creator_one_line', 'true');
    window.history.replaceState({}, '', '/film/9499-matrix/');
    mod.applyCreatorOneLine();
    expect(document.body.classList.contains('cc-creator-one-line')).toBe(false);
  });
});
