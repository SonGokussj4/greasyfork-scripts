let isFancyAlertOpen = false;

export async function fancyAlert() {
  if (isFancyAlertOpen) {
    return;
  }
  isFancyAlertOpen = true;

  console.log('fancyAlert called');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

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

  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  let isClosing = false;
  const closeModal = () => {
    if (isClosing) {
      return;
    }
    isClosing = true;
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.remove();
      isFancyAlertOpen = false;
      isClosing = false;
    }, 300);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  alert.querySelector('.close-btn').addEventListener('click', closeModal);
  alert.querySelector('.alert-button').addEventListener('click', closeModal);
}

export function bindFancyAlertButton(alertButton) {
  if (!alertButton || alertButton.dataset.fancyAlertBound === 'true') {
    return;
  }

  alertButton.addEventListener('click', () => {
    fancyAlert();
  });
  alertButton.dataset.fancyAlertBound = 'true';
}
