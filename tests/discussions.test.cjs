const path = require('path');
const { pathToFileURL } = require('url');

let discussions;

beforeAll(async () => {
  discussions = await import(pathToFileURL(path.resolve(__dirname, '../src/discussions.js')).href);
});

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/diskuze/1330412-csfd-compare/?page=17');
  document.body.innerHTML = `
    <article class="article-forum" id="highlight-post-111"><div class="icon-control"></div></article>
    <article class="article-forum" id="highlight-post-222"><div class="icon-control"></div></article>`;
});

describe('post permalinks', () => {
  test('adds one link per post pointing at the post anchor, keeping the page', () => {
    discussions.addPostPermalinks();
    const links = [...document.querySelectorAll('.cc-post-permalink')];
    expect(links.map((a) => new URL(a.href).hash)).toEqual(['#highlight-post-111', '#highlight-post-222']);
    expect(new URL(links[0].href).search).toBe('?page=17');
  });

  test('is idempotent', () => {
    discussions.addPostPermalinks();
    discussions.addPostPermalinks();
    expect(document.querySelectorAll('.cc-post-permalink')).toHaveLength(2);
  });

  test('does nothing when the setting is off', () => {
    localStorage.setItem('cc_discussion_post_permalink', 'false');
    discussions.addPostPermalinks();
    expect(document.querySelectorAll('.cc-post-permalink')).toHaveLength(0);
  });

  test('does nothing outside discussions', () => {
    window.history.replaceState({}, '', '/film/9499-matrix/');
    discussions.addPostPermalinks();
    expect(document.querySelectorAll('.cc-post-permalink')).toHaveLength(0);
  });

  test('clear removes them', () => {
    discussions.addPostPermalinks();
    discussions.clearPostPermalinks();
    expect(document.querySelectorAll('.cc-post-permalink')).toHaveLength(0);
  });
});
