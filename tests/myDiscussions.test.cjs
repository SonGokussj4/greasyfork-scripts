const path = require('path');
const { pathToFileURL } = require('url');

let mod;

beforeAll(async () => {
  mod = await import(pathToFileURL(path.resolve(__dirname, '../src/my-discussions.js')).href);
});

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/diskuze/sledovane/');
  document.body.innerHTML = `
    <section class="box box-discussion"><header><h2>Moje diskuze</h2></header>
      <table><tr><td><a href="/diskuze/111-anime-a/">Anime A</a></td><td>15 příspěvků</td></tr>
      <tr><td><a href="/diskuze/222-anime-b/">Anime B</a></td><td>2 příspěvků</td></tr></table></section>
    <section class="box box-discussion"><header><h2>Diskuze, kterých jsem se zúčastnil</h2></header>
      <table><tr><td><a href="/diskuze/333-x/">X</a></td></tr></table></section>`;
});

const visibleRows = () => [...document.querySelectorAll('tr')].filter((r) => !r.classList.contains('cc-md-hidden'));

describe('my discussions hiding', () => {
  test('adds a hide button only to rows of the "Moje diskuze" box', () => {
    mod.applyMyDiscussions();
    expect(document.querySelectorAll('.cc-md-hide')).toHaveLength(2);
    expect(document.querySelectorAll('.cc-md-toggle')).toHaveLength(0);
  });

  test('hiding stores the id, hides the row and shows a counter', () => {
    mod.applyMyDiscussions();
    document.querySelector('.cc-md-hide').click();
    expect(JSON.parse(localStorage.getItem('cc_hidden_my_discussions'))).toEqual(['111']);
    expect(visibleRows()).toHaveLength(2);
    expect(document.querySelector('.cc-md-toggle').textContent).toBe('Skryté (1)');
  });

  test('toggle previews hidden rows and restore brings one back', () => {
    localStorage.setItem('cc_hidden_my_discussions', JSON.stringify(['111']));
    mod.applyMyDiscussions();
    document.querySelector('.cc-md-toggle').click();
    expect(document.querySelectorAll('.cc-md-hidden-preview')).toHaveLength(1);
    document.querySelector('.cc-md-restore').click();
    expect(JSON.parse(localStorage.getItem('cc_hidden_my_discussions'))).toEqual([]);
    expect(document.querySelectorAll('.cc-md-toggle')).toHaveLength(0);
    expect(visibleRows()).toHaveLength(3);
  });

  test('does nothing when disabled or on another page', () => {
    localStorage.setItem('cc_hide_my_discussions', 'false');
    mod.applyMyDiscussions();
    expect(document.querySelectorAll('.cc-md-btn')).toHaveLength(0);

    localStorage.clear();
    window.history.replaceState({}, '', '/diskuze/');
    mod.applyMyDiscussions();
    expect(document.querySelectorAll('.cc-md-btn')).toHaveLength(0);
  });

  test('clear removes everything it added', () => {
    localStorage.setItem('cc_hidden_my_discussions', JSON.stringify(['111']));
    mod.applyMyDiscussions();
    mod.clearMyDiscussions();
    expect(document.querySelectorAll('.cc-md-btn, .cc-md-toggle, .cc-md-hidden')).toHaveLength(0);
  });
});

describe('my discussions hiding - edge cases', () => {
  test('applying twice does not duplicate buttons', () => {
    mod.applyMyDiscussions();
    mod.applyMyDiscussions();
    expect(document.querySelectorAll('.cc-md-btn')).toHaveLength(2);
  });

  test('survives malformed stored JSON', () => {
    localStorage.setItem('cc_hidden_my_discussions', '{not json');
    expect(() => mod.applyMyDiscussions()).not.toThrow();
    expect(document.querySelectorAll('.cc-md-hide')).toHaveLength(2);
  });

  test('works for the Slovak path and heading', () => {
    window.history.replaceState({}, '', '/diskusie/sledovane/');
    document.querySelector('h2').textContent = 'Moje diskusie';
    mod.applyMyDiscussions();
    expect(document.querySelectorAll('.cc-md-hide')).toHaveLength(2);
  });
});
