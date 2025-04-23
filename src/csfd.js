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
    this.isLoggedIn = false; // New property
  }

  /**
   *
   * @returns {string|undefined} - Returns the user URL or undefined if not found
   * @description - This function retrieves the current user's URL from the CSFD page and sets isLoggedIn.
   */
  async getCurrentUser() {
    const userEl = document.querySelector('.profile.initialized');
    if (userEl) {
      this.isLoggedIn = true;
      return userEl.getAttribute('href');
    }
    this.isLoggedIn = false;
    console.debug('[CC] - User not found');
    return undefined;
  }

  /**
   * @returns {string|undefined} - Returns the username or undefined if not found
   * @description - This function retrieves the current user's username from the CSFD page.
   */
  async getUsername() {
    const userHref = await this.getCurrentUser();
    if (!userHref) {
      console.debug('[CC] - User URL not found');
      return undefined;
    }
    const match = userHref.match(/\/(\d+)-(.+?)\//);
    if (match && match.length >= 3) {
      this.username = match[2];
      return this.username;
    }
    console.debug('[CC] - Username not found');
    return undefined;
  }

  getIsLoggedIn() {
    return this.isLoggedIn;
  }

  async initialize() {
    this.userUrl = await this.getCurrentUser();
    console.debug('[CC] - User URL:', this.userUrl);
    this.username = await this.getUsername();
    console.debug('[CC] - Username:', this.username);
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
