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

  test('does not inject duplicate own ratings into native-rated titles on own overview page', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');

    window.history.replaceState({}, '', '/uzivatel/78145-songokussj/prehled/');
    document.body.innerHTML = `
      <div class="last-ratings">
        <section class="updated-box">
          <a href="/uzivatel/78145-songokussj/hodnoceni/" data-cc-header-wrapper="true">
            <header class="updated-box-header updated-box-header-nowrap">
              <h2>Poslední hodnocení <span class="count">(1)</span></h2>
            </header>
          </a>
          <div class="updated-box-content updated-box-content-white">
            <table class="updated-box-table striped">
              <tbody>
                <tr>
                  <td class="name">
                    <h3 class="film-title-inline">
                      <a href="/film/1018007-spasitel/" class="film-title-name">Project Hail Mary</a>
                      <span class="film-title-info"><span class="bullet"></span><span class="info">2026</span></span>
                      <span class="star-rating"><span class="stars stars-5"></span></span>
                    </h3>
                  </td>
                  <td class="star-rating-only"><span class="star-rating"><span class="stars stars-5"></span></span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[1018007] = { rating: 5 };

    await csfd.addStars();

    expect(document.querySelectorAll('h3 .cc-own-rating').length).toBe(0);
    expect(document.querySelector('a.film-title-name')?.dataset.ccStarAdded).not.toBe('true');
  });

  test('does not inject duplicate own ratings into the recent ratings table on own overview page', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');

    window.history.replaceState({}, '', '/uzivatel/78145-songokussj/prehled/');
    document.body.innerHTML = `
      <div class="last-ratings">
        <div class="row row-300">
          <div class="column column-minus-300">
            <section class="updated-box">
              <a href="/uzivatel/78145-songokussj/hodnoceni/" data-cc-header-wrapper="true">
                <header class="updated-box-header updated-box-header-nowrap">
                  <h2>Poslední hodnocení <span class="count">(2)</span></h2>
                </header>
              </a>
              <div class="updated-box-content updated-box-content-white">
                <table class="updated-box-table striped">
                  <tbody>
                    <tr>
                      <td class="name">
                        <h3 class="film-title-inline">
                          <a href="/film/1777940-jusa-party-o-oidasareta-kijobinbo/" class="film-title-name">Jack-of-All-Trades, Party of None</a>
                          <span class="film-title-info"><span class="bullet"></span><span class="info">2026</span><span class="bullet"></span><span class="info">seriál</span></span>
                        </h3>
                      </td>
                      <td class="star-rating-only"><span class="star-rating"><span class="stars stars-2"></span></span></td>
                      <td class="date-only">22.03.2026</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.userSlug = '78145-songokussj';
    csfd.stars[1777940] = { rating: 2 };

    await csfd.addStars();

    expect(document.querySelectorAll('h3 .cc-own-rating').length).toBe(0);
    expect(document.querySelector('a.film-title-name')?.dataset.ccStarAdded).not.toBe('true');
  });

  test('injects my rating into foreign overview review titles even when the title already has the profile owners rating', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');

    window.history.replaceState({}, '', '/uzivatel/503990-jeoffrey/prehled/');
    document.body.innerHTML = `
      <a href="/uzivatel/78145-songokussj/prehled/" class="profile">SonGokussj</a>
      <div class="updated-box-content">
        <article class="article article-poster-88 updated-article-poster-88">
          <div class="article-content article-content-justify" data-film-review>
            <header class="article-header updated-article-header-date">
              <h3 class="film-title-inline">
                <a href="/film/1776952-kizoku-tensei-megumareta-umare-kara-saikjo-no-cikara-o-eru/" class="film-title-name">Noble Reincarnation</a>
                <span class="film-title-info">
                  <span class="bullet"></span><span class="info">2026</span>
                  <span class="bullet"></span><span class="info">seriál</span>
                  &nbsp;<span class="star-rating"><span class="stars stars-2"></span></span>
                </span>
              </h3>
            </header>
          </div>
        </article>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[1776952] = { rating: 1 };

    await csfd.addStars();

    const title = document.querySelector('h3.film-title-inline');
    const myRating = title?.querySelector('.cc-own-rating.cc-own-rating-foreign-profile');

    expect(document.querySelectorAll('h3 .star-rating').length).toBe(2);
    expect(myRating?.querySelector('.stars')?.classList.contains('stars-1')).toBe(true);
    expect(document.querySelector('a.film-title-name')?.dataset.ccStarAdded).toBe('true');
  });

  test('adds a comparison cell instead of injecting title ratings on foreign overview rating tables', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');

    window.history.replaceState({}, '', '/uzivatel/503990-jeoffrey/prehled/');
    document.body.innerHTML = `
      <a href="/uzivatel/78145-songokussj/prehled/" class="profile">SonGokussj</a>
      <div class="last-ratings">
        <div class="row row-300">
          <div class="column column-minus-300">
            <section class="updated-box">
              <a href="/uzivatel/503990-jeoffrey/hodnoceni/" data-cc-header-wrapper="true">
                <header class="updated-box-header updated-box-header-nowrap">
                  <h2>Poslední hodnocení <span class="count">(1)</span></h2>
                </header>
              </a>
              <div class="updated-box-content updated-box-content-white">
                <table class="updated-box-table striped">
                  <tbody>
                    <tr>
                      <td class="name">
                        <h3 class="film-title-inline">
                          <a href="/film/1776952-kizoku-tensei-megumareta-umare-kara-saikjo-no-cikara-o-eru/" class="film-title-name">Noble Reincarnation</a>
                          <span class="film-title-info"><span class="bullet"></span><span class="info">2026</span></span>
                        </h3>
                      </td>
                      <td class="star-rating-only"><span class="star-rating"><span class="stars stars-2"></span></span></td>
                      <td class="date-only">22.03.2026</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[1776952] = { rating: 1 };

    await csfd.addStars();

    const row = document.querySelector('.last-ratings tbody tr');

    expect(document.querySelector('.cc-compare-ratings-table')).not.toBeNull();
    expect(row?.querySelector('td.cc-my-rating-cell .stars')?.classList.contains('stars-1')).toBe(true);
    expect(row?.querySelector('td.name .cc-own-rating')).toBeNull();
    expect(document.querySelector('a.film-title-name')?.dataset.ccStarAdded).not.toBe('true');
  });

  test('adds a comparison cell instead of injecting title ratings on foreign ratings pages', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');

    window.history.replaceState({}, '', '/uzivatel/503990-jeoffrey/hodnoceni/');
    document.body.innerHTML = `
      <a href="/uzivatel/78145-songokussj/prehled/" class="profile">SonGokussj</a>
      <div id="snippet--ratings">
        <table class="updated-box-table striped">
          <tbody>
            <tr>
              <td class="name">
                <h3 class="film-title-inline">
                  <a href="/film/1776973-madzucusi-kunon-wa-miete-iru/" class="film-title-name">Kunon the Sorcerer Can See</a>
                  <span class="film-title-info"><span class="bullet"></span><span class="info">2026</span></span>
                </h3>
              </td>
              <td class="star-rating-only"><span class="star-rating"><span class="stars stars-2"></span></span></td>
              <td class="date-only">22.03.2026</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.stars[1776973] = { rating: 3 };

    await csfd.addStars();

    const row = document.querySelector('#snippet--ratings tbody tr');

    expect(document.querySelector('.cc-compare-ratings-table')).not.toBeNull();
    expect(row?.querySelector('td.cc-my-rating-cell .stars')?.classList.contains('stars-3')).toBe(true);
    expect(row?.querySelector('td.name .cc-own-rating')).toBeNull();
    expect(document.querySelector('a.film-title-name')?.dataset.ccStarAdded).not.toBe('true');
  });

  test('injects ratings into updated related sidebar cards outside page-content', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');

    window.history.replaceState({}, '', '/film/9499-the-matrix/prehled/');
    document.body.innerHTML = `
      <div class="page-content page-red">
        <section class="updated-box">
          <div class="updated-box-content">
            <p>Hlavní obsah filmu</p>
          </div>
        </section>
      </div>
      <aside class="aside-movie-profile">
        <section class="updated-box">
          <div class="updated-box-header"><h3>Související</h3></div>
          <div class="updated-box-content">
            <article class="article aside-films-article">
              <header class="article-header">
                <h3 class="film-title-inline">
                  <i class="icon icon-rounded-square blue"></i>
                  <a href="/film/499395-the-matrix-resurrections/" class="film-title-name">The Matrix Resurrections</a>
                  <span class="film-title-info"><span class="bullet"></span><span class="info">2021</span></span>
                </h3>
              </header>
            </article>
            <article class="article aside-films-article">
              <header class="article-header">
                <h3 class="film-title-inline">
                  <i class="icon icon-rounded-square red"></i>
                  <a href="/film/70635-the-animatrix/" class="film-title-name">Animatrix</a>
                  <span class="film-title-info"><span class="bullet"></span><span class="info">2003</span></span>
                </h3>
              </header>
            </article>
          </div>
        </section>
      </aside>
    `;

    const csfd = new Csfd(document.querySelector('div.page-content'));
    csfd.stars[499395] = { rating: 4 };
    csfd.stars[70635] = { rating: 5 };

    await csfd.addStars();

    const titles = document.querySelectorAll('aside.aside-movie-profile h3.film-title-inline');
    const firstTitleLink = titles[0]?.querySelector('a.film-title-name');
    const firstTitleInfo = titles[0]?.querySelector('.film-title-info');

    expect(titles[0]?.querySelector('.cc-own-rating .stars')?.classList.contains('stars-4')).toBe(true);
    expect(titles[1]?.querySelector('.cc-own-rating .stars')?.classList.contains('stars-5')).toBe(true);
    expect(document.querySelectorAll('aside.aside-movie-profile .cc-own-rating').length).toBe(2);
    expect(firstTitleLink?.nextElementSibling?.classList.contains('cc-own-rating')).toBe(true);
    expect(firstTitleInfo?.previousElementSibling?.classList.contains('cc-own-rating')).toBe(true);
  });

  test('ignores movie action panel and control panel links on film pages', async () => {
    localStorage.setItem(config.SHOW_RATINGS_KEY, 'true');

    window.history.replaceState({}, '', '/film/9499-matrix/recenze/');
    document.body.innerHTML = `
      <div class="page-content page-red">
        <div class="action-panel" data-onboarding-step-9="false">
          <div class="action-panel-list">
            <div class="action-panel-item">
              <a href="/film/9499-matrix/recenze/#open-review-form" class="btn-profile-action">Recenze</a>
            </div>
          </div>
          <div id="dropdown-control-panel" class="dropdown-content control-panel">
            <ul class="blue">
              <li>
                <a href="/film/9499-matrix/recenze/#open-review-form">Přidat recenzi</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const csfd = new Csfd(document.querySelector('div.page-content'));
    csfd.stars[9499] = { rating: 5 };

    await csfd.addStars();

    expect(document.querySelector('.action-panel .cc-own-rating')).toBeNull();
    expect(document.querySelector('.dropdown-content.control-panel .cc-own-rating')).toBeNull();
    expect(document.querySelectorAll('[data-cc-star-added="true"]').length).toBe(0);
  });
});
