import { Csfd } from './csfd.js';
import { delay } from './utils.js';

(async () => {
  'use strict';
  await delay(20);
  console.debug('CSFD-Compare - Script started');
  const csfd = new Csfd(document.querySelector('div.page-content'));
  await csfd.initialize();
  await csfd.addStars();
})();
