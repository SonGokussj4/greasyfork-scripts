const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let hoverPreviewProviders;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/hover-preview-providers.js')).href;
  hoverPreviewProviders = await import(moduleUrl);
});

function loadDocument(relativePath) {
  const html = fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('hover preview parsers', () => {
  test('parses creator preview data from saved fixture', () => {
    const doc = loadDocument('pages/page-tvurce-prehled.html');
    const data = hoverPreviewProviders.parseCreatorPreviewDocument(doc);

    expect(data.name).toBe('Keanu Reeves');
    expect(data.birthText).toContain('02.09.1964');
    expect(data.photoSource).toContain('Constantine');
    expect(data.photoType).toBe('movie');
    expect(data.photoSourceHref).toContain('/film/');
    expect(data.movieCount).toBeGreaterThan(0);
    expect(data.seriesCount).toBeGreaterThan(0);
  });

  test('counts creator career rows without deduplicating repeated series titles', () => {
    const doc = new DOMParser().parseFromString(
      `
        <table class="updated-box-table">
          <thead><tr><th colspan="3">Seriály</th></tr></thead>
          <tbody>
            <tr><td class="year">2020</td><td class="name"><a class="film-title-name" href="/film/1-a/">A</a></td><td></td></tr>
            <tr><td class="year">2019</td><td class="name"><a class="film-title-name" href="/film/1-a/">A</a></td><td></td></tr>
            <tr><td class="year year-empty">&nbsp;</td><td class="name"><a class="film-title-name" href="/film/2-b/">B</a></td><td></td></tr>
            <tr><td class="year">&nbsp;</td><td class="episode"><a class="film-title-name" href="/film/2-b/1-ep/">Ep</a></td><td></td></tr>
          </tbody>
        </table>
      `,
      'text/html',
    );

    const data = hoverPreviewProviders.parseCreatorPreviewDocument(doc);

    expect(data.seriesCount).toBe(3);
  });

  test('parses user preview data from saved fixture', () => {
    const doc = loadDocument('pages/page-other_user-recenze.html');
    const data = hoverPreviewProviders.parseUserPreviewDocument(doc);

    expect(data.name).toBe('Likan7');
    expect(data.realName).toBe('Jan Haselbach');
    expect(data.fans.label).toContain('Fanoušků');
    expect(data.fans.value).toBe('13');
    expect(data.points.label).toContain('Bodů');
    expect(data.points.value).toBe('5');
    expect(data.reviewCount).toBe('5 465');
    expect(data.lastLogin).toContain('21.02.2026 15:03');
  });

  test('parses film preview data from saved fixture', () => {
    const doc = loadDocument('pages/page-movie_rated.html');
    const data = hoverPreviewProviders.parseFilmPreviewDocument(doc);

    expect(data.title).toBe('Harry Potter and the Chamber of Secrets');
    expect(data.rating).toContain('78%');
    expect(data.ratingCount).toBe(83576);
    expect(data.reviewCount).toBe(959);
    expect(data.genres).toContain('Fantasy');
    expect(data.origin).toContain('Velká Británie');
    expect(data.actors[0].name).toBe('Daniel Radcliffe');
    expect(data.actors[0].href).toContain('/tvurce/');
  });

  test('parses poster gallery links from gallery snippet', () => {
    const doc = new DOMParser().parseFromString(
      `
        <div class="gallery-item"><div class="box box-media poster">
          <figure><div class="media-img"><picture><img src="//image.test/basic.jpg"></picture>
          <div class="cc-gallery-size-links"><a href="https://image.test/full.jpg">100 %</a></div></div></figure>
          <figcaption class="figcaption-poster"><div class="figcaption-poster-title"><h3>Česko</h3></div></figcaption>
        </div></div>
      `,
      'text/html',
    );

    const posters = hoverPreviewProviders.parseFilmPosterGalleryDocument(doc);

    expect(posters).toHaveLength(1);
    expect(posters[0].imageUrl).toBe('https://image.test/full.jpg');
    expect(posters[0].label).toBe('Česko');
  });

  test('parses myanimelist character preview data from snippet', () => {
    const doc = new DOMParser().parseFromString(
      `
        <meta property="og:title" content="Klein Moretti">
        <meta property="og:image" content="https://myanimelist.net/images/characters/4/520529.jpg">
        <div id="content">
          <div class="normal_header character-anime">Animeography</div>
          <table>
            <tr>
              <td></td>
              <td><a href="https://myanimelist.net/anime/49818/Guimi_Zhi_Zhu__Xiaochou_Pian">Guimi Zhi Zhu: Xiaochou Pian</a><div><small>Main</small></div></td>
            </tr>
          </table>
          <table>
            <tr>
              <td>
                <a href="/character/233866/Klein_Moretti/pics"><img class="portrait-225x350" src="https://myanimelist.net/images/characters/4/520529.jpg" alt="Klein Moretti"></a>
              </td>
            </tr>
          </table>
        </div>
      `,
      'text/html',
    );

    const data = hoverPreviewProviders.parseMyAnimeListCharacterPreviewDocument(doc);

    expect(data.title).toBe('Klein Moretti');
    expect(data.imageUrl).toBe('https://myanimelist.net/images/characters/4/520529.jpg');
    expect(data.animeography).toHaveLength(1);
    expect(data.animeography[0].name).toBe('Guimi Zhi Zhu: Xiaochou Pian');
    expect(data.animeography[0].role).toBe('Main');
  });

  test('parses myanimelist anime preview data from snippet', () => {
    const doc = new DOMParser().parseFromString(
      `
        <meta property="og:title" content="Guimi Zhi Zhu: Xiaochou Pian">
        <meta property="og:image" content="https://myanimelist.net/images/anime/1952/149229.jpg">
        <div id="content">
          <div class="leftside">
            <img itemprop="image" src="https://myanimelist.net/images/anime/1952/149229.jpg" alt="Guimi Zhi Zhu: Xiaochou Pian">
            <div class="spaceit_pad"><span class="dark_text">Type:</span> ONA</div>
            <div class="spaceit_pad"><span class="dark_text">Episodes:</span> 13</div>
            <div class="spaceit_pad"><span class="dark_text">Aired:</span> Jun 28, 2025 to Aug 16, 2025</div>
          </div>
          <div class="score" data-user="68,743 users"><div class="score-label">8.61</div></div>
          <span itemprop="ratingCount" content="68743"></span>
        </div>
      `,
      'text/html',
    );

    const data = hoverPreviewProviders.parseMyAnimeListAnimePreviewDocument(doc);

    expect(data.title).toBe('Guimi Zhi Zhu: Xiaochou Pian');
    expect(data.imageUrl).toBe('https://myanimelist.net/images/anime/1952/149229.jpg');
    expect(data.score).toBe('8.61');
    expect(data.scoreCount).toBe('68743');
    expect(data.episodes).toBe('13');
    expect(data.type).toBe('ONA');
    expect(data.aired).toContain('Jun 28, 2025');
  });

  test('parses anidb character preview data from snippet', () => {
    const doc = new DOMParser().parseFromString(
      `
        <h1>Character: Aono Hajime</h1>
        <div class="g_section info">
          <meta property="og:image" content="https://cdn-eu.anidb.net/images/main/285744.jpg">
          <picture>
            <img itemprop="image" alt="Aono Hajime" src="https://cdn-eu.anidb.net/images/main/285744.jpg">
          </picture>
          <table>
            <tr class="mainname"><td class="value"><span itemprop="name">Aono Hajime</span></td></tr>
          </table>
        </div>
        <div id="tab_main_2_1_pane" class="pane anime_appearance">
          <table class="animelist">
            <tbody>
              <tr>
                <td class="name anime"><a href="/anime/18527">Tensui no Sakuna-hime</a></td>
                <td class="rating">4.39 <span class="count">(152)</span></td>
              </tr>
              <tr>
                <td class="name anime"><a href="/anime/18986">Tensui no Sakuna-hime: Kokorowa Inasaku Nisshi</a></td>
                <td class="rating">5.09 <span class="count">(17)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      `,
      'text/html',
    );

    const data = hoverPreviewProviders.parseAniDbCharacterPreviewDocument(doc);

    expect(data.title).toBe('Aono Hajime');
    expect(data.imageUrl).toBe('https://cdn-eu.anidb.net/images/main/285744.jpg');
    expect(data.relatedAnime).toHaveLength(2);
    expect(data.relatedAnime[0].name).toBe('Tensui no Sakuna-hime');
    expect(data.relatedAnime[0].href).toBe('https://anidb.net/anime/18527');
    expect(data.relatedAnime[0].rating).toBe('4.39');
  });

  test('parses anidb anime preview data from snippet', () => {
    const doc = new DOMParser().parseFromString(
      `
        <h1>Anime: Tensui no Sakuna-hime</h1>
        <div class="g_section info">
          <meta property="og:image" content="https://cdn-eu.anidb.net/images/main/307054.jpg">
          <picture>
            <img itemprop="image" alt="Tensui no Sakuna-hime" src="https://cdn-eu.anidb.net/images/main/307054.jpg">
          </picture>
          <table>
            <tr class="romaji"><td class="value"><span itemprop="name">Tensui no Sakuna-hime</span></td></tr>
            <tr class="type"><td class="value">TV Series, 13 episodes</td></tr>
            <tr class="year"><td class="value">2024-07-06 until 2024-09-28</td></tr>
            <tr class="rating"><td class="value"><span class="value">4.39</span> <span class="count">(152)</span></td></tr>
          </table>
        </div>
      `,
      'text/html',
    );

    const data = hoverPreviewProviders.parseAniDbAnimePreviewDocument(doc);

    expect(data.title).toBe('Tensui no Sakuna-hime');
    expect(data.imageUrl).toBe('https://cdn-eu.anidb.net/images/main/307054.jpg');
    expect(data.rating).toBe('4.39');
    expect(data.type).toContain('TV Series');
    expect(data.year).toContain('2024-07-06');
  });

  test('external parsers keep metadata even when no image is available', () => {
    const malCharacterDoc = new DOMParser().parseFromString(
      `
        <meta property="og:title" content="Klein Moretti">
        <div id="content">
          <div class="normal_header character-anime">Animeography</div>
          <table>
            <tr>
              <td></td>
              <td><a href="https://myanimelist.net/anime/49818/Guimi_Zhi_Zhu__Xiaochou_Pian">Guimi Zhi Zhu: Xiaochou Pian</a><div><small>Main</small></div></td>
            </tr>
          </table>
        </div>
      `,
      'text/html',
    );
    const malAnimeDoc = new DOMParser().parseFromString(
      `
        <meta property="og:title" content="Guimi Zhi Zhu: Xiaochou Pian">
        <div id="content">
          <div class="leftside">
            <div class="spaceit_pad"><span class="dark_text">Type:</span> ONA</div>
            <div class="spaceit_pad"><span class="dark_text">Episodes:</span> 13</div>
          </div>
          <div class="score" data-user="68,743 users"><div class="score-label">8.61</div></div>
        </div>
      `,
      'text/html',
    );
    const anidbCharacterDoc = new DOMParser().parseFromString(
      `
        <h1>Character: Aono Hajime</h1>
        <div class="g_section info">
          <table>
            <tr class="mainname"><td class="value"><span itemprop="name">Aono Hajime</span></td></tr>
          </table>
        </div>
        <div id="tab_main_2_1_pane" class="pane anime_appearance">
          <table class="animelist">
            <tbody>
              <tr>
                <td class="name anime"><a href="/anime/18527">Tensui no Sakuna-hime</a></td>
                <td class="rating">4.39 <span class="count">(152)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      `,
      'text/html',
    );
    const anidbAnimeDoc = new DOMParser().parseFromString(
      `
        <h1>Anime: Tensui no Sakuna-hime</h1>
        <div class="g_section info">
          <table>
            <tr class="romaji"><td class="value"><span itemprop="name">Tensui no Sakuna-hime</span></td></tr>
            <tr class="type"><td class="value">TV Series, 13 episodes</td></tr>
            <tr class="year"><td class="value">2024-07-06 until 2024-09-28</td></tr>
            <tr class="rating"><td class="value"><span class="value">4.39</span></td></tr>
          </table>
        </div>
      `,
      'text/html',
    );

    const malCharacterData = hoverPreviewProviders.parseMyAnimeListCharacterPreviewDocument(malCharacterDoc);
    const malAnimeData = hoverPreviewProviders.parseMyAnimeListAnimePreviewDocument(malAnimeDoc);
    const anidbCharacterData = hoverPreviewProviders.parseAniDbCharacterPreviewDocument(anidbCharacterDoc);
    const anidbAnimeData = hoverPreviewProviders.parseAniDbAnimePreviewDocument(anidbAnimeDoc);

    expect(malCharacterData).not.toBeNull();
    expect(malCharacterData.imageUrl).toBeNull();
    expect(malCharacterData.title).toBe('Klein Moretti');
    expect(malCharacterData.animeography[0].name).toBe('Guimi Zhi Zhu: Xiaochou Pian');

    expect(malAnimeData).not.toBeNull();
    expect(malAnimeData.imageUrl).toBeNull();
    expect(malAnimeData.title).toBe('Guimi Zhi Zhu: Xiaochou Pian');
    expect(malAnimeData.score).toBe('8.61');

    expect(anidbCharacterData).not.toBeNull();
    expect(anidbCharacterData.imageUrl).toBeNull();
    expect(anidbCharacterData.title).toBe('Aono Hajime');
    expect(anidbCharacterData.relatedAnime[0].name).toBe('Tensui no Sakuna-hime');

    expect(anidbAnimeData).not.toBeNull();
    expect(anidbAnimeData.imageUrl).toBeNull();
    expect(anidbAnimeData.title).toBe('Tensui no Sakuna-hime');
    expect(anidbAnimeData.rating).toBe('4.39');
  });

  test('film provider defers poster gallery loading until the deferred step', async () => {
    const filmProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === 'film');
    const originalFetch = global.fetch;

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <h1>Example Film</h1>
              <div class="film-posters"><img src="https://image.test/poster-basic.jpg"></div>
              <div class="film-rating-average">78%</div>
            </body>
          </html>
        `,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <div class="gallery-item"><div class="box box-media poster">
            <figure><div class="media-img"><picture><img src="https://image.test/poster-gallery.jpg"></picture>
            <div class="cc-gallery-size-links"><a href="https://image.test/poster-gallery-full.jpg">100 %</a></div></div></figure>
            <figcaption class="figcaption-poster"><div class="figcaption-poster-title"><h3>Poster 2</h3></div></figcaption>
          </div></div>
        `,
      });

    try {
      const url = 'https://www.csfd.cz/film/123-example/prehled/';
      const data = await filmProvider.fetchData({ url });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenNthCalledWith(1, url);
      expect(data.posters).toHaveLength(1);
      expect(data.posters[0].imageUrl).toBe('https://image.test/poster-basic.jpg');

      const deferredData = await filmProvider.loadDeferredData({ url, data });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://www.csfd.cz/film/123-example/galerie/plakaty/');
      expect(deferredData.posters).toHaveLength(1);
      expect(deferredData.posters[0].imageUrl).toBe('https://image.test/poster-gallery-full.jpg');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('user preview does not match modal or paginated profile urls', () => {
    const userProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === 'user');
    const messageLink = document.createElement('a');
    const pageLink = document.createElement('a');
    const cleanLink = document.createElement('a');

    messageLink.href = 'https://www.csfd.cz/uzivatel/503990-jeoffrey/prehled/?modal=composeMessage';
    pageLink.href = 'https://www.csfd.cz/uzivatel/503990-jeoffrey/prehled/?pageFanclub=2';
    cleanLink.href = 'https://www.csfd.cz/uzivatel/503990-jeoffrey/prehled/';

    expect(userProvider.matches(messageLink)).toBe(false);
    expect(userProvider.matches(pageLink)).toBe(false);
    expect(userProvider.matches(cleanLink)).toBe(true);
  });

  test('user preview ignores ratings and reviews subpage links but still matches favorite links', () => {
    const userProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === 'user');
    const favoriteCreatorLink = document.createElement('a');
    const ratingsLink = document.createElement('a');
    const ratingsLinkSk = document.createElement('a');
    const reviewsLink = document.createElement('a');
    const reviewsLinkSk = document.createElement('a');
    const nestedFavoriteLink = document.createElement('a');

    favoriteCreatorLink.href = 'https://www.csfd.cz/uzivatel/50912-popluh/oblibene/herci-herecky-a-tvurci/';
    ratingsLink.href = 'https://www.csfd.cz/uzivatel/964600-maxikpog/hodnoceni/';
    ratingsLinkSk.href = 'https://www.csfd.sk/uzivatel/964600-maxikpog/hodnotenia/';
    reviewsLink.href = 'https://www.csfd.cz/uzivatel/964600-maxikpog/recenze/';
    reviewsLinkSk.href = 'https://www.csfd.sk/uzivatel/964600-maxikpog/recenzie/';
    nestedFavoriteLink.href = 'https://www.csfd.cz/uzivatel/352631-anego/oblibene/herci-herecky-a-tvurci/';

    expect(userProvider.matches(favoriteCreatorLink)).toBe(true);
    expect(userProvider.matches(ratingsLink)).toBe(false);
    expect(userProvider.matches(ratingsLinkSk)).toBe(false);
    expect(userProvider.matches(reviewsLink)).toBe(false);
    expect(userProvider.matches(reviewsLinkSk)).toBe(false);
    expect(userProvider.matches(nestedFavoriteLink)).toBe(true);
  });

  test('creator preview ignores modal, section, and current-entity links', () => {
    const creatorProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === 'creator');
    const modalLink = document.createElement('a');
    const sectionLink = document.createElement('a');
    const cleanLink = document.createElement('a');
    const originalUrl = window.location.href;

    window.history.replaceState({}, '', 'https://www.csfd.cz/tvurce/298263-christian-navarro/galerie/');
    modalLink.href = 'https://www.csfd.cz/tvurce/75555-alan-ritchson/prehled/?modal=fanclub';
    sectionLink.href = 'https://www.csfd.cz/tvurce/75555-alan-ritchson/galerie/';
    cleanLink.href = 'https://www.csfd.cz/tvurce/75555-alan-ritchson/prehled/';

    expect(creatorProvider.matches(cleanLink)).toBe(true);

    expect(creatorProvider.matches(modalLink)).toBe(false);
    expect(creatorProvider.matches(sectionLink)).toBe(false);
    cleanLink.href = 'https://www.csfd.cz/tvurce/298263-christian-navarro/prehled/';
    expect(creatorProvider.matches(cleanLink)).toBe(false);

    window.history.replaceState({}, '', originalUrl);
  });

  test('user preview ignores current user entity on profile pages', () => {
    const userProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === 'user');
    const currentOverviewLink = document.createElement('a');
    const currentRatingsLink = document.createElement('a');
    const otherUserLink = document.createElement('a');
    const originalUrl = window.location.href;

    window.history.replaceState({}, '', 'https://www.csfd.cz/uzivatel/503990-jeoffrey/prehled/');

    currentOverviewLink.href = 'https://www.csfd.cz/uzivatel/503990-jeoffrey/prehled/';
    currentRatingsLink.href = 'https://www.csfd.cz/uzivatel/503990-jeoffrey/hodnoceni/';
    otherUserLink.href = 'https://www.csfd.cz/uzivatel/964600-maxikpog/prehled/';

    expect(userProvider.matches(currentOverviewLink)).toBe(false);
    expect(userProvider.matches(currentRatingsLink)).toBe(false);
    expect(userProvider.matches(otherUserLink)).toBe(true);

    window.history.replaceState({}, '', originalUrl);
  });

  test('user preview ignores links inside the logged-in account dropdown menu', () => {
    const userProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === 'user');
    const menu = document.createElement('div');
    const menuLink = document.createElement('a');
    const standaloneLink = document.createElement('a');

    menu.className = 'dropdown-content main-menu';
    menuLink.href = 'https://www.csfd.cz/uzivatel/78145-songokussj/filmoteka/';
    standaloneLink.href = 'https://www.csfd.cz/uzivatel/78145-songokussj/filmoteka/';

    menu.appendChild(menuLink);
    document.body.appendChild(menu);

    expect(userProvider.matches(menuLink)).toBe(false);
    expect(userProvider.matches(standaloneLink)).toBe(true);

    menu.remove();
  });

  test('film provider ignores links to current film entity', () => {
    const filmProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find((provider) => provider.id === 'film');
    const sameFilmLink = document.createElement('a');
    const otherFilmLink = document.createElement('a');
    const originalUrl = window.location.href;

    window.history.replaceState({}, '', 'https://www.csfd.cz/film/267980-mumie/galerie/');
    sameFilmLink.href = 'https://www.csfd.cz/film/267980-mumie/prehled/';
    otherFilmLink.href = 'https://www.csfd.cz/film/286594-avatar-ohen-a-popel/';

    expect(filmProvider.matches(sameFilmLink)).toBe(false);
    expect(filmProvider.matches(otherFilmLink)).toBe(true);

    window.history.replaceState({}, '', originalUrl);
  });

  test('external character providers match direct MAL and AniDB character links', () => {
    const malProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find(
      (provider) => provider.id === 'myanimelist-character',
    );
    const anidbProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find(
      (provider) => provider.id === 'anidb-character',
    );
    const malLink = document.createElement('a');
    const malPicsLink = document.createElement('a');
    const anidbLink = document.createElement('a');
    const anidbEditLink = document.createElement('a');

    malLink.href = 'https://myanimelist.net/character/233866/Klein_Moretti';
    malPicsLink.href = 'https://myanimelist.net/character/233866/Klein_Moretti/pics';
    anidbLink.href = 'https://anidb.net/character/130604';
    anidbEditLink.href = 'https://anidb.net/character/130604/edit';

    expect(malProvider.matches(malLink)).toBe(true);
    expect(malProvider.matches(malPicsLink)).toBe(false);
    expect(anidbProvider.matches(anidbLink)).toBe(true);
    expect(anidbProvider.matches(anidbEditLink)).toBe(false);
  });

  test('myanimelist anime provider matches direct anime links only', () => {
    const animeProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find(
      (provider) => provider.id === 'myanimelist-anime',
    );
    const animeLink = document.createElement('a');
    const picsLink = document.createElement('a');

    animeLink.href = 'https://myanimelist.net/anime/49818/Guimi_Zhi_Zhu__Xiaochou_Pian';
    picsLink.href = 'https://myanimelist.net/anime/49818/Guimi_Zhi_Zhu__Xiaochou_Pian/pics';

    expect(animeProvider.matches(animeLink)).toBe(true);
    expect(animeProvider.matches(picsLink)).toBe(false);
  });

  test('anidb anime provider matches direct anime links only', () => {
    const animeProvider = hoverPreviewProviders.HOVER_PREVIEW_PROVIDERS.find(
      (provider) => provider.id === 'anidb-anime',
    );
    const animeLink = document.createElement('a');
    const editLink = document.createElement('a');

    animeLink.href = 'https://anidb.net/anime/18527';
    editLink.href = 'https://anidb.net/anime/18527/edit';

    expect(animeProvider.matches(animeLink)).toBe(true);
    expect(animeProvider.matches(editLink)).toBe(false);
  });
});
