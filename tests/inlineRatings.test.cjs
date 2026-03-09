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

  test('does not inject inline ratings into favorites activity review text when review toggle is disabled', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');
    localStorage.setItem(config.SHOW_RATINGS_IN_REVIEWS_KEY, 'false');

    window.history.replaceState({}, '', '/soukrome/oblibeni-uzivatele/');
    document.body.innerHTML = `
      <div class="tab-content favorite-users-ratings">
        <article class="article article-user-60">
          <div class="article-content article-content-justify">
            <div class="article-content-reviewtext">
              <p>recenzoval</p>
              <h3 class="film-title-ellipsis">
                <a href="/film/1665599-lord-of-mysteries/1665600-season-1/recenze/?review=13968617" class="film-title-name">Lord of Mysteries - Season 1</a>
              </h3>
              <p>
                V textu zmiňuje <a href="/film/1608081-tu-bian-ying-xiong-x/">To Be Hero X</a>.
              </p>
            </div>
          </div>
        </article>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[1608081] = { rating: 5 };

    await csfd.addStars();

    const inlineLink = document.querySelector('.article-content-reviewtext p a[href*="/film/1608081-"]');
    expect(inlineLink?.dataset.ccStarAdded).not.toBe('true');
    expect(document.querySelector('.cc-own-rating-inline')).toBeNull();
  });

  test('injects outlined inline ratings into favorites activity review text when review toggle is enabled', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');
    localStorage.setItem(config.SHOW_RATINGS_IN_REVIEWS_KEY, 'true');

    window.history.replaceState({}, '', '/soukrome/oblibeni-uzivatele/');
    document.body.innerHTML = `
      <div class="tab-content favorite-users-ratings">
        <article class="article article-user-60">
          <div class="article-content article-content-justify">
            <div class="article-content-reviewtext">
              <p>recenzoval</p>
              <h3 class="film-title-ellipsis">
                <a href="/film/1665599-lord-of-mysteries/1665600-season-1/recenze/?review=13968617" class="film-title-name">Lord of Mysteries - Season 1</a>
              </h3>
              <p>
                V textu zmiňuje <a href="/film/1608081-tu-bian-ying-xiong-x/">To Be Hero X</a>.
              </p>
            </div>
          </div>
        </article>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[1608081] = { rating: 5 };

    await csfd.addStars();

    const inlineLink = document.querySelector('.article-content-reviewtext p a[href*="/film/1608081-"]');
    const ratingGroup = inlineLink?.nextSibling;
    const rating = ratingGroup?.querySelector('.cc-own-rating');

    expect(inlineLink?.dataset.ccStarAdded).toBe('true');
    expect(ratingGroup?.classList.contains('cc-own-rating-inline')).toBe(true);
    expect(rating?.classList.contains('cc-own-rating-foreign-profile')).toBe(true);
    expect(rating?.querySelector('.stars')?.classList.contains('stars-5')).toBe(true);
  });
});
