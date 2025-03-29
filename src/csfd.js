import { SETTINGSNAME, GREASYFORK_URL, INDEXED_DB_NAME, NUM_RATINGS_PER_PAGE } from './config.js';
import { getSettings } from './storage.js';
import { delay } from './utils.js';

export class Csfd {
  constructor(pageContent) {
    this.csfdPage = pageContent;
    this.stars = {};
    this.storageKey = undefined;
    this.userUrl = undefined;
    this.username = undefined;
    this.userRatingsUrl = undefined;
  }

  async getCurrentUser() {
    const userEl = document.querySelector('.profile.initialized');
    if (userEl) {
      return userEl.getAttribute('href');
    }
    throw new Error('User not logged in');
  }

  async getUsername() {
    const userHref = await this.getCurrentUser();
    const match = userHref.match(/\/(\d+)-(.+?)\//);
    if (match && match.length >= 3) {
      this.username = match[2];
      return this.username;
    }
    return undefined;
  }

  async initialize() {
    this.userUrl = await this.getCurrentUser();
    this.username = await this.getUsername();
    this.storageKey = `${'CSFD-Compare'}_${this.username}`;
    this.userRatingsUrl = this.userUrl + (location.origin.endsWith('sk') ? 'hodnotenia' : 'hodnoceni');
    console.debug('[CC] - User URL:', this.userUrl);
    console.debug('[CC] - Username:', this.username);
    console.debug('[CC] - Storage Key:', this.storageKey);
    console.debug('[CC] - User Ratings URL:', this.userRatingsUrl);
    const settings = await getSettings(SETTINGSNAME);
    if (settings) {
      this.stars = settings.stars;
    }
    if (!this.stars) {
      this.stars = {};
    }
    console.debug('[CC] - Stars:', this.stars);
  }

  async addStars() {
    const links = document.querySelectorAll('a.film-title-name');
    for (let link of links) {
      const movieId = await this.getMovieIdFromUrl(link.getAttribute('href'));
      const rating = this.stars[movieId];
      if (!rating) continue;
      const starSpan = document.createElement('span');
      starSpan.className = 'star-rating';
      starSpan.textContent = rating.rating ? rating.rating : '';
      link.parentElement.appendChild(starSpan);
    }
  }

  async getMovieIdFromUrl(url) {
    if (!url) return NaN;
    const match = url.match(/\/(\d+)-/);
    return match ? Number(match[1]) : NaN;
  }
}
