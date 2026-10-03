const path = require('path');
const { pathToFileURL } = require('url');

let Csfd;

beforeAll(async () => {
  ({ Csfd } = await import(pathToFileURL(path.resolve(__dirname, '../src/csfd.js')).href));
});

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/film/9499-matrix/recenze/');
  delete global.fetch;
  jest.restoreAllMocks();
});

describe('ratings from favorites', () => {
  test('shows average from inline favored ratings and excludes current user', async () => {
    document.body.innerHTML = `
      <div class="box-rating-container">
        <div class="film-rating-average">90%</div>
      </div>
      <div class="user-list rating-users">
        <section class="others-rating">
          <ul>
            <li class="favored current-user-rating"><span class="star-rating"><span class="stars stars-5"></span></span></li>
            <li class="favored"><span class="star-rating"><span class="stars stars-3"></span></span></li>
            <li class="favored"><span class="star-rating"><span class="stars stars-5"></span></span></li>
            <li><span class="star-rating"><span class="stars stars-1"></span></span></li>
          </ul>
        </section>
      </div>
    `;

    const csfd = new Csfd(document.body);
    await csfd.ratingsFromFavorites();

    const avgEl = document.querySelector('.film-rating-average');
    expect(avgEl?.querySelector('.cc-fav-rating')?.textContent).toBe('oblíbení: 80%');
    expect(avgEl?.querySelector('.cc-fav-rating')?.style.display).toBe('inline-block');
    expect(avgEl?.querySelector('.cc-main-rating')?.style.position).toBe('absolute');
  });

  test('fetches and parses ratingAndFanclub modal when inline favorite ratings are unavailable', async () => {
    document.body.innerHTML = `
      <div class="box-rating-container">
        <div class="film-rating-average">90%</div>
      </div>
      <a href="/film/9499-matrix/recenze/?modal=ratingAndFanclub" class="more-modal-ratings-fanclub">Hodnocení a fanklub</a>
    `;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => `
        <div class="user-list rating-users">
          <section class="others-rating">
            <ul>
              <li class="favored current-user-rating"><span class="star-rating"><span class="stars stars-5"></span></span></li>
              <li class="favored"><span class="star-rating"><span class="stars stars-4"></span></span></li>
              <li class="favored"><span class="star-rating"><span class="stars stars-4"></span></span></li>
            </ul>
          </section>
        </div>
      `,
    });
    global.fetch = fetchMock;

    const csfd = new Csfd(document.body);
    await csfd.ratingsFromFavorites();

    const avgEl = document.querySelector('.film-rating-average');
    expect(fetchMock).toHaveBeenCalledWith('https://www.csfd.cz/film/9499-matrix/recenze/?modal=ratingAndFanclub');
    expect(avgEl?.querySelector('.cc-fav-rating')?.textContent).toBe('oblíbení: 80%');
  });

  test('shows favorite average in the new rating box markup without box-rating-container', async () => {
    document.body.innerHTML = `
      <div class="box-rating box-rating-withtabs">
        <div class="film-rating-average">90%</div>
        <div class="my-rating my-rating-csfd">
          <h3>Moje hodnocení</h3>
        </div>
        <div class="ranking-tabs-csfd">
          <div class="ratings-list">
            <section class="others-rating">
              <ul>
                <li class="favored current-user-rating"><span class="star-rating"><span class="stars stars-5"></span></span></li>
                <li class="favored"><span class="star-rating"><span class="stars stars-4"></span></span></li>
                <li class="favored"><span class="star-rating"><span class="stars stars-5"></span></span></li>
                <li class="favored"><span class="star-rating"><span class="stars stars-2"></span></span></li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    `;

    const csfd = new Csfd(document.body);
    await csfd.ratingsFromFavorites();

    const avgEl = document.querySelector('.box-rating.box-rating-withtabs .film-rating-average');
    expect(avgEl?.dataset.ccInitialized).toBe('true');
    expect(avgEl?.querySelector('.cc-fav-rating')?.textContent).toBe('oblíbení: 73%');
    expect(avgEl?.querySelector('.cc-main-rating')?.textContent).toBe('90%');
  });
});
