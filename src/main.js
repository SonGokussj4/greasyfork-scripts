import { Csfd } from './csfd.js';
import { delay } from './utils.js';
import './styles/fancy-alert.css';
import './styles/alert-modal.css';

(async () => {
  'use strict';
  await delay(20);
  console.debug('CSFD-Compare - Script started');
  const csfd = new Csfd(document.querySelector('div.page-content'));
  await csfd.initialize();
  await csfd.addStars();

  // Add fancy alert
  const alertButton = document.createElement('button');
  alertButton.textContent = 'Show Fancy Alert';
  alertButton.className = 'fancy-alert-button';
  document.body.appendChild(alertButton);
  alertButton.addEventListener('click', () => {
    fancyAlert();
  });
})();

async function fancyAlert() {
  'use strict';
  console.log('fancyAlert called');

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  // Create alert
  const alert = document.createElement('div');
  alert.className = 'fancy-alert';
  alert.innerHTML = `
    <div class="alert-content">
      <button class="close-btn">&times;</button>
      <h2 class="alert-title">Welcome!</h2>
      <p class="alert-message">This is a fancy modal alert with modern styling and animations.</p>
      <button class="alert-button">Got it!</button>
    </div>
  `;

  overlay.appendChild(alert);
  document.body.appendChild(overlay);

  // Trigger animation
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  // Close handlers
  const closeModal = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300); // Wait for animation
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  alert.querySelector('.close-btn').addEventListener('click', closeModal);
  alert.querySelector('.alert-button').addEventListener('click', closeModal);
}
