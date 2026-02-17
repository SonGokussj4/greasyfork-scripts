const SYNC_ENABLED_KEY = 'cc_sync_enabled';
const SYNC_ACCESS_KEY = 'cc_sync_access_key';

function getSyncSetupState() {
  return {
    enabled: localStorage.getItem(SYNC_ENABLED_KEY) === 'true',
    accessKey: localStorage.getItem(SYNC_ACCESS_KEY) || '',
  };
}

function saveSyncSetupState({ enabled, accessKey }) {
  localStorage.setItem(SYNC_ENABLED_KEY, String(Boolean(enabled)));
  localStorage.setItem(SYNC_ACCESS_KEY, (accessKey || '').trim());
}

function removeSyncModal() {
  document.querySelector('.cc-sync-modal-overlay')?.remove();
}

function createSyncSetupModal() {
  removeSyncModal();

  const { enabled, accessKey } = getSyncSetupState();

  const overlay = document.createElement('div');
  overlay.className = 'cc-sync-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'cc-sync-modal';
  modal.innerHTML = `
    <div class="cc-sync-modal-head">
      <h3>Cloud sync setup (beta)</h3>
      <button type="button" class="cc-sync-close" aria-label="Close">&times;</button>
    </div>
    <p class="cc-sync-help">
      Nastavte jeden Sync key. Funkční cloud synchronizace bude doplněna v dalším kroku.
    </p>
    <label class="cc-sync-toggle-row">
      <input id="cc-sync-enabled-input" type="checkbox" ${enabled ? 'checked' : ''}>
      <span>Povolit sync</span>
    </label>
    <label class="cc-sync-label" for="cc-sync-key-input">Sync key</label>
    <input id="cc-sync-key-input" class="cc-sync-input" type="password" placeholder="Vložte váš Sync key" value="${accessKey.replace(/"/g, '&quot;')}">
    <div class="cc-sync-actions">
      <button type="button" class="cc-sync-save cc-button cc-button-red">Uložit</button>
      <button type="button" class="cc-sync-cancel cc-button cc-button-black">Zavřít</button>
    </div>
    <div class="cc-sync-note">Tip: stejný key použijte na obou počítačích.</div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  const closeModal = () => {
    overlay.classList.remove('visible');
    setTimeout(removeSyncModal, 180);
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  modal.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);
  modal.querySelector('.cc-sync-cancel')?.addEventListener('click', closeModal);
  modal.querySelector('.cc-sync-save')?.addEventListener('click', () => {
    const enabledInput = modal.querySelector('#cc-sync-enabled-input');
    const keyInput = modal.querySelector('#cc-sync-key-input');

    saveSyncSetupState({
      enabled: Boolean(enabledInput?.checked),
      accessKey: keyInput?.value || '',
    });

    closeModal();
  });
}

function updateSyncButtonLabel(button) {
  const { enabled } = getSyncSetupState();
  button.textContent = enabled ? 'Sync ✓' : 'Sync';
}

export function initializeRatingsSync(rootElement) {
  const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');

  if (!syncButton) {
    return;
  }

  if (syncButton.dataset.ccSyncBound === 'true') {
    return;
  }

  syncButton.dataset.ccSyncBound = 'true';
  updateSyncButtonLabel(syncButton);

  syncButton.addEventListener('click', () => {
    createSyncSetupModal();
    setTimeout(() => updateSyncButtonLabel(syncButton), 220);
  });
}
