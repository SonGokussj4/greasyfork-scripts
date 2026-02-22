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

/**
 * Creates and displays the Sync Setup modal.
 * @param {Function} onSaveCallback - Function to run after the user clicks "Uložit" (Save).
 */
function createSyncSetupModal(onSaveCallback) {
  removeSyncModal();

  const { enabled, accessKey } = getSyncSetupState();

  const overlay = document.createElement('div');
  overlay.className = 'cc-sync-modal-overlay';

  const modal = document.createElement('form');
  modal.className = 'cc-sync-modal';
  modal.onsubmit = (e) => e.preventDefault(); // Stops the page from refreshing if the user hits "Enter"

  // Updated HTML for a much better User Experience
  modal.innerHTML = `
    <div class="cc-sync-modal-head">
      <h3>Nastavení Cloud Sync <span style="color: #aa2c16; font-size: 11px; vertical-align: middle;">(BETA)</span></h3>
      <button type="button" class="cc-sync-close" aria-label="Zavřít">&times;</button>
    </div>

    <div style="font-size: 12px; color: #444; margin-bottom: 14px; line-height: 1.4;">
      <p style="margin-top: 0;">
        Zálohujte svá hodnocení a synchronizujte je napříč zařízeními (např. mezi stolním PC a notebookem).
      </p>
      <p style="margin-bottom: 0;">
        Pro spárování zařízení vložte svůj osobní <strong>Sync Token</strong>.
        <br>
        <a href="#" target="_blank" style="color: #aa2c16; text-decoration: none; font-weight: 600;">Jak získám svůj Token?</a> </p>
    </div>

    <div style="background: #f9f9f9; border: 1px solid #eee; padding: 10px; border-radius: 8px; margin-bottom: 14px;">
      <label class="cc-sync-toggle-row" style="margin-bottom: 8px; display: flex; cursor: pointer;">
        <input id="cc-sync-enabled-input" type="checkbox" ${enabled ? 'checked' : ''} style="margin-right: 8px; accent-color: #aa2c16;">
        <span style="font-weight: 600; color: #222;">Povolit synchronizaci</span>
      </label>

      <label class="cc-sync-label" for="cc-sync-key-input" style="font-weight: 600; margin-top: 8px;">Váš Sync Token</label>
      <input id="cc-sync-key-input" class="cc-sync-input" type="password" placeholder="Např. a1b2c3d4-e5f6..." value="${accessKey.replace(/"/g, '&quot;')}" style="margin-top: 4px; border: 1px solid #ccc;">
    </div>

    <div class="cc-sync-actions">
      <button type="button" class="cc-sync-save cc-button cc-button-red">Uložit nastavení</button>
      <button type="button" class="cc-sync-cancel cc-button cc-button-black">Zrušit</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Trigger CSS transition
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  const closeModal = () => {
    overlay.classList.remove('visible');
    setTimeout(removeSyncModal, 180);
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
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

    // Execute the callback to instantly update the button UI
    if (onSaveCallback) {
      onSaveCallback();
    }

    closeModal();
  });
}

function updateSyncButtonLabel(button) {
  const { enabled, accessKey } = getSyncSetupState();

  // Only show as fully enabled if the checkbox is checked AND they actually provided a key
  const isFullyEnabled = enabled && accessKey.length > 0;

  button.classList.toggle('is-enabled', isFullyEnabled);
  button.setAttribute('title', isFullyEnabled ? 'Cloud sync je aktivní' : 'Nastavit Cloud sync');
  button.setAttribute('aria-label', isFullyEnabled ? 'Cloud sync zapnutý' : 'Nastavit Cloud sync');
}

export function initializeRatingsSync(rootElement) {
  const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');

  if (!syncButton || syncButton.dataset.ccSyncBound === 'true') {
    return;
  }

  syncButton.dataset.ccSyncBound = 'true';
  updateSyncButtonLabel(syncButton);

  syncButton.addEventListener('click', () => {
    // We pass the update logic as a callback so it fires ONLY when the user clicks "Save"
    createSyncSetupModal(() => {
      updateSyncButtonLabel(syncButton);
    });
  });
}
