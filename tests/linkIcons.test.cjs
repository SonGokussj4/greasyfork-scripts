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
  window.history.replaceState({}, '', '/uzivatel/503990-jeoffrey/prehled/');
});

describe('link icons', () => {
  test('prepends film, creator, user, YouTube, Steam, Wikipedia, AniDB and MyAnimeList icons inside review text links', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_CREATOR_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_USER_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_YOUTUBE_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_STEAM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_WIKIPEDIA_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_ANIDB_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_MAL_ENABLED_KEY, 'true');

    document.body.innerHTML = `
      <div class="article-content article-content-justify">
        <p>
          <span class="comment" data-film-review-content>
            Odkaz na <a href="/film/9499-the-matrix/">Matrix</a>,
            tvůrce <a href="https://www.csfd.cz/tvurce/270-sean-penn/">Sean Penn</a>,
            uživatele <a href="https://www.csfd.cz/uzivatel/503990-jeoffrey/prehled/">Jeoffrey</a>,
            video <a href="https://www.youtube.com/watch?v=NVCsqGSqCF4">YouTube</a>,
            hra <a href="https://store.steampowered.com/app/1356670/Sakuna_Of_Rice_and_Ruin/">Steam</a>,
            wiki <a href="https://en.wikipedia.org/wiki/Diablo_(video_game)">Wikipedia</a>,
            Odkaz na <a href="https://anidb.net/character/130604">hlavního hrdiny</a>
            a <a href="https://myanimelist.net/character/233866/Klein_Moretti">Klein</a>.
          </span>
        </p>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    const links = Array.from(document.querySelectorAll('.article-content.article-content-justify a'));
    expect(document.querySelectorAll('.cc-link-icon')).toHaveLength(8);
    expect(links[0].closest('.cc-link-icon-inline')).not.toBeNull();
    expect(links[0].previousElementSibling?.dataset.ccLinkIconProvider).toBe('film');
    expect(links[1].previousElementSibling?.dataset.ccLinkIconProvider).toBe('creator');
    expect(links[2].previousElementSibling?.dataset.ccLinkIconProvider).toBe('user');
    expect(links[3].previousElementSibling?.dataset.ccLinkIconProvider).toBe('youtube');
    expect(links[4].previousElementSibling?.dataset.ccLinkIconProvider).toBe('steam');
    expect(links[5].previousElementSibling?.dataset.ccLinkIconProvider).toBe('wikipedia');
    expect(links[6].previousElementSibling?.dataset.ccLinkIconProvider).toBe('anidb');
    expect(links[7].previousElementSibling?.dataset.ccLinkIconProvider).toBe('myanimelist');
  });

  test('does not add icons to review title links, permalinks, or unrelated header actions', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');

    document.body.innerHTML = `
      <article class="article article-white" data-film-review>
        <div class="article-content article-content-justify article-review">
          <header class="article-header article-header-review">
            <div class="article-header-review-name">
              <h3 class="user-title"><a href="/uzivatel/95-golfista/prehled/" class="user-title-name">golfista</a></h3>
            </div>
            <div class="article-header-review-action">
              <a href="/uzivatel/95-golfista/recenze/">všechny recenze uživatele</a>
              <a href="/film/10130-navrat-do-budoucnosti-iii/recenze/?review=37279" class="permanent-link"><i class="icon icon-permalink"></i></a>
            </div>
          </header>
          <div class="article-content-spacing">
            <p>
              <span class="comment" data-film-review-content>
                Text s odkazem na <a href="/film/1608081-tu-bian-ying-xiong-x/"><em>To Be Hero X</em></a>.
              </span>
            </p>
          </div>
        </div>
      </article>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    expect(document.querySelectorAll('.cc-link-icon')).toHaveLength(1);
    expect(document.querySelector('.comment a')?.previousElementSibling?.dataset.ccLinkIconProvider).toBe('film');
    expect(document.querySelector('.film-title-name .cc-link-icon')).toBeNull();
    expect(document.querySelector('.article-header-review-action .cc-link-icon')).toBeNull();
  });

  test('does not add icons to tv tips title links or more links', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');

    document.body.innerHTML = `
      <article class="updated-article-tvtips article-poster-88">
        <div class="article-content article-content-justify">
          <div class="article-header">
            <h3 class="film-title-inline"><a href="/film/10130-navrat-do-budoucnosti-iii/" class="film-title-name">Back to the Future Part III</a></h3>
          </div>
          <div class="article-tvtips-textshort">
            <p>Text bez uživatelské zmínky.</p>
            <span class="span-more-small"><a href="/film/10130-navrat-do-budoucnosti-iii/">více</a></span>
          </div>
        </div>
      </article>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    expect(document.querySelectorAll('.cc-link-icon')).toHaveLength(0);
  });

  test('respects provider-specific toggles under the master switch', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_CREATOR_ENABLED_KEY, 'false');
    localStorage.setItem(config.LINK_ICONS_USER_ENABLED_KEY, 'false');
    localStorage.setItem(config.LINK_ICONS_YOUTUBE_ENABLED_KEY, 'false');
    localStorage.setItem(config.LINK_ICONS_STEAM_ENABLED_KEY, 'false');
    localStorage.setItem(config.LINK_ICONS_WIKIPEDIA_ENABLED_KEY, 'false');
    localStorage.setItem(config.LINK_ICONS_ANIDB_ENABLED_KEY, 'false');
    localStorage.setItem(config.LINK_ICONS_MAL_ENABLED_KEY, 'false');

    document.body.innerHTML = `
      <span class="comment" data-film-review-content>
        <a href="/film/9499-the-matrix/">Matrix</a>
        <a href="/tvurce/270-sean-penn/">Sean Penn</a>
        <a href="/uzivatel/503990-jeoffrey/prehled/">Jeoffrey</a>
        <a href="https://www.youtube.com/watch?v=NVCsqGSqCF4">YouTube</a>
        <a href="https://store.steampowered.com/app/1356670/Sakuna_Of_Rice_and_Ruin/">Steam</a>
        <a href="https://cs.wikipedia.org/wiki/Diablo_(video_game)">Wikipedia</a>
        <a href="https://anidb.net/character/130604">AniDB</a>
        <a href="https://myanimelist.net/character/233866/Klein_Moretti">MAL</a>
      </span>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    const appliedIcons = Array.from(document.querySelectorAll('.cc-link-icon'));
    expect(appliedIcons).toHaveLength(1);
    expect(appliedIcons[0].dataset.ccLinkIconProvider).toBe('film');
  });

  test('refresh remains idempotent and clears icons when the master toggle is off', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_ANIDB_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_MAL_ENABLED_KEY, 'true');

    document.body.innerHTML = `
      <div class="article-content article-content-justify">
        <p>
          <span class="comment" data-film-review-content>
            <a href="/film/9499-the-matrix/">Matrix</a>
            <a href="https://anidb.net/character/130604">AniDB</a>
            <a href="https://myanimelist.net/character/233866/Klein_Moretti">MAL</a>
          </span>
        </p>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();
    csfd.addConfiguredLinkIcons();

    expect(document.querySelectorAll('.cc-link-icon')).toHaveLength(3);

    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'false');
    csfd.refreshLinkIcons();

    expect(document.querySelectorAll('.cc-link-icon')).toHaveLength(0);
  });

  test('adds icons for discussion thread links inside article-content-icons blocks', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_CREATOR_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_USER_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_YOUTUBE_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_STEAM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_WIKIPEDIA_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_ANIDB_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_MAL_ENABLED_KEY, 'true');
    window.history.replaceState({}, '', '/diskuze/1330412-csfd-compare/?page=16');

    document.body.innerHTML = `
      <article class="article-forum">
        <div class="article-content article-content-icons">
          <p>Text</p>
          <p>Neco neco <a href="/film/9499-the-matrix/">neco</a> film</p>
          <p>Neco neco <a href="/tvurce/270-sean-penn/">neco</a> tvurce</p>
          <p>Neco neco <a href="/uzivatel/503990-jeoffrey/prehled/">neco</a> uzivatel</p>
          <p>Neco neco <a href="https://youtu.be/NVCsqGSqCF4">neco</a> youtube</p>
          <p>Neco neco <a href="https://store.steampowered.com/app/1356670/Sakuna_Of_Rice_and_Ruin/">neco</a> steam</p>
          <p>Neco neco <a href="https://jp.wikipedia.org/wiki/Diablo_(video_game)">neco</a> wikipedia</p>
          <p>Neco neco <a href="https://myanimelist.net/character/233866/Klein_Moretti">neco</a> mal</p>
          <p>Neco neco <a href="https://anidb.net/character/130604">neco</a> anidb</p>
        </div>
      </article>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    const links = Array.from(
      document.querySelectorAll(
        '.article-forum .article-content a[href^="/film/"], .article-forum .article-content a[href^="/tvurce/"], .article-forum .article-content a[href^="/uzivatel/"], .article-forum .article-content a[href^="https://"]',
      ),
    );
    expect(document.querySelectorAll('.article-forum .cc-link-icon')).toHaveLength(8);
    expect(links[0].previousElementSibling?.dataset.ccLinkIconProvider).toBe('film');
    expect(links[1].previousElementSibling?.dataset.ccLinkIconProvider).toBe('creator');
    expect(links[2].previousElementSibling?.dataset.ccLinkIconProvider).toBe('user');
    expect(links[3].previousElementSibling?.dataset.ccLinkIconProvider).toBe('youtube');
    expect(links[4].previousElementSibling?.dataset.ccLinkIconProvider).toBe('steam');
    expect(links[5].previousElementSibling?.dataset.ccLinkIconProvider).toBe('wikipedia');
    expect(links[6].previousElementSibling?.dataset.ccLinkIconProvider).toBe('myanimelist');
    expect(links[7].previousElementSibling?.dataset.ccLinkIconProvider).toBe('anidb');
  });

  test('adds icons inside diary post text', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    window.history.replaceState({}, '', '/uzivatel/503990-jeoffrey/denicek/');

    document.body.innerHTML = `
      <div class="diary-posts-list">
        <article class="diary-post">
          <header class="diary-post-header">
            <h3>Nekdy staci jen jedna kniha kouzel...</h3>
          </header>
          <div class="article-content article-content-justify">
            <p>Rychly prachy - the <a href="https://www.csfd.cz/film/1417211-soso-no-frieren/"><em>Frieren</em></a> edition!</p>
            <p><em>A jaka je vase cena?</em></p>
          </div>
        </article>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    const link = document.querySelector('.diary-post .article-content a');
    expect(document.querySelectorAll('.diary-post .cc-link-icon')).toHaveLength(1);
    expect(link?.previousElementSibling?.dataset.ccLinkIconProvider).toBe('film');
  });

  test('adds icons for direct anchor children inside forum content blocks', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_CREATOR_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_USER_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_STEAM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_ANIDB_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_MAL_ENABLED_KEY, 'true');
    window.history.replaceState({}, '', '/diskuze/1330412-csfd-compare/?page=16');

    document.body.innerHTML = `
      <article class="article-forum">
        <div class="article-content article-content-icons">
          Test<br>
          Film: <a href="/film/9499-the-matrix/">Matrix</a><br>
          Tvurce: <a href="/tvurce/270-sean-penn/">Sean Penn</a><br>
          Uzivatel: <a href="/uzivatel/503990-jeoffrey/prehled/">Jeoffrey</a><br>
          Steam: <a href="https://store.steampowered.com/app/1356670/Sakuna_Of_Rice_and_Ruin/">Sakuna</a><br>
          AniDB: <a href="https://anidb.net/character/130604">Aono Hajime</a><br>
          MAL: <a href="https://myanimelist.net/character/233866/Klein_Moretti">Klein</a>
        </div>
      </article>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    const links = Array.from(document.querySelectorAll('.article-forum .article-content a'));
    expect(document.querySelectorAll('.article-forum .cc-link-icon')).toHaveLength(6);
    expect(links[0].previousElementSibling?.dataset.ccLinkIconProvider).toBe('film');
    expect(links[1].previousElementSibling?.dataset.ccLinkIconProvider).toBe('creator');
    expect(links[2].previousElementSibling?.dataset.ccLinkIconProvider).toBe('user');
    expect(links[3].previousElementSibling?.dataset.ccLinkIconProvider).toBe('steam');
    expect(links[4].previousElementSibling?.dataset.ccLinkIconProvider).toBe('anidb');
    expect(links[5].previousElementSibling?.dataset.ccLinkIconProvider).toBe('myanimelist');
  });

  test('adds icons for the current discussion post markup from the live site', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_CREATOR_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_USER_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_STEAM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_WIKIPEDIA_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_ANIDB_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_MAL_ENABLED_KEY, 'true');
    window.history.replaceState({}, '', '/diskuze/1330412-csfd-compare/?page=16');

    document.body.innerHTML = `
      <div id="snippet-forum-post-5922850" class="article-forum-item">
        <article id="highlight-post-5922850" class="article article-forum article-user-60">
          <figure class="article-img">
            <img class="img" src="//image.pmgstatic.com/cache/resized/w60h80/files/images/user/avatars/000/291/291744_4e59b6.jpg" loading="lazy" width="60" height="80" alt="SonGokussj">
          </figure>
          <div class="article-content article-content-icons">
            <div class="article-header article-header-message">
              <h3 class="user-title"><a href="/uzivatel/78145-songokussj/prehled/" class="user-title-name">SonGokussj</a><i class="icon-dot online tooltip"></i><span class="user-title-links-nopadding">&nbsp;(<a href="/uzivatel/78145-songokussj/hodnoceni/">hodnoceni</a>, <a href="/uzivatel/78145-songokussj/recenze/">recenze</a>)</span></h3>
              <div class="header-right-info"><span class="info"><time>08.03.2026&nbsp;00:53</time></span></div>
            </div>
            <p></p><p>Test</p>
            <p>Mal: <a href="https://myanimelist.net/character/246/Gokuu_Son">Goku</a></p>
            <p>Anidb: <a href="https://anidb.net/character/2103">Goku</a></p>
            <p>en Wiki: <a href="https://en.wikipedia.org/wiki/Goku">Goku</a></p>
            <p>cs Wiki: <a href="https://cs.wikipedia.org/wiki/Dragon_Ball">DB</a></p>
            <p>Steam: <a href="https://store.steampowered.com/app/1903340/Clair_Obscur_Expedition_33/">ClaireObscure</a></p>
            <p>Csfd: <a href="https://www.csfd.cz/uzivatel/385767-autogram/prehled/">User</a></p>
            <p>Csfd: <a href="https://www.csfd.cz/tvurce/46-keanu-reeves/prehled/">Tvurce</a></p>
            <p>Csfd: <a href="https://www.csfd.cz/film/94024-dragon-ball-z/recenze/">Movie</a></p>
            <p></p>
            <div class="icon-control"><a href="#" class="button button-circle reply-add cc-self-reply" title="Odpovedet (CC)"><i class="icon icon-reply"></i></a></div>
          </div>
        </article>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    const links = Array.from(document.querySelectorAll('.article-forum .article-content a')).filter(
      (link) => !link.closest('.article-header') && !link.closest('.icon-control'),
    );

    expect(document.querySelectorAll('.article-forum .cc-link-icon')).toHaveLength(8);
    expect(links[0].previousElementSibling?.dataset.ccLinkIconProvider).toBe('myanimelist');
    expect(links[1].previousElementSibling?.dataset.ccLinkIconProvider).toBe('anidb');
    expect(links[2].previousElementSibling?.dataset.ccLinkIconProvider).toBe('wikipedia');
    expect(links[3].previousElementSibling?.dataset.ccLinkIconProvider).toBe('wikipedia');
    expect(links[4].previousElementSibling?.dataset.ccLinkIconProvider).toBe('steam');
    expect(links[5].previousElementSibling?.dataset.ccLinkIconProvider).toBe('user');
    expect(links[6].previousElementSibling?.dataset.ccLinkIconProvider).toBe('creator');
    expect(links[7].previousElementSibling?.dataset.ccLinkIconProvider).toBe('film');
  });

  test('supports placing icons after the link globally', () => {
    localStorage.setItem(config.LINK_ICONS_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_FILM_ENABLED_KEY, 'true');
    localStorage.setItem(config.LINK_ICONS_POSITION_KEY, 'after');

    document.body.innerHTML = `
      <div class="article-content article-content-justify">
        <p>
          <span class="comment" data-film-review-content>
            Odkaz na <a href="/film/9499-the-matrix/">Matrix</a>.
          </span>
        </p>
      </div>
    `;

    const csfd = new Csfd(document.body);
    csfd.addConfiguredLinkIcons();

    const link = document.querySelector('.comment a');
    expect(link?.closest('.cc-link-icon-inline')?.classList.contains('cc-link-icon-inline-after')).toBe(true);
    expect(link?.nextElementSibling?.dataset.ccLinkIconProvider).toBe('film');
    expect(link?.previousElementSibling?.classList.contains('cc-link-icon') ?? false).toBe(false);
  });
});
