const path = require('path');
const { pathToFileURL } = require('url');

let Csfd;
let config;

beforeAll(async () => {
  ({ Csfd } = await import(pathToFileURL(path.resolve(__dirname, '../src/csfd.js')).href));
  config = await import(pathToFileURL(path.resolve(__dirname, '../src/config.js')).href);
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/film/9499-the-matrix/recenze/');
});

describe('inline ratings', () => {
  test('keeps the injected rating attached to the tail of a review text link', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');
    localStorage.setItem(config.SHOW_RATINGS_IN_REVIEWS_KEY, 'true');

    document.body.innerHTML = `
      <div class="article-content article-content-justify">
        <p>
          <span class="comment" data-film-review-content>
            Odkaz na <a href="/film/9499-the-matrix/">Návrat Titánů</a> v textu.
          </span>
        </p>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[9499] = { rating: 4 };

    await csfd.addStars();

    const link = document.querySelector('[data-film-review-content] a');
    const ratingGroup = link?.nextSibling;
    const rating = ratingGroup?.querySelector('.cc-own-rating');

    expect(ratingGroup?.nodeType).toBe(Node.ELEMENT_NODE);
    expect(ratingGroup?.classList.contains('cc-own-rating-inline')).toBe(true);
    expect(ratingGroup?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(ratingGroup?.firstChild?.textContent).toBe('\u00A0');
    expect(rating?.querySelector('.stars')?.classList.contains('stars-4')).toBe(true);
  });

  test('treats a hyphenated final token as one unit when the inline rating is attached', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');
    localStorage.setItem(config.SHOW_RATINGS_IN_REVIEWS_KEY, 'true');

    document.body.innerHTML = `
      <div class="article-content article-content-justify">
        <p>
          <span class="comment" data-film-review-content>
            Tohle jsou <a href="/film/9499-the-matrix/">X-Meni</a>.
          </span>
        </p>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[9499] = { rating: 4 };

    await csfd.addStars();

    const link = document.querySelector('[data-film-review-content] a');
    const ratingGroup = link?.nextSibling;

    expect(link?.textContent).toBe('X‑Meni');
    expect(ratingGroup?.classList.contains('cc-own-rating-inline')).toBe(true);
    expect(ratingGroup?.querySelector('.stars')?.classList.contains('stars-4')).toBe(true);
  });
});
