import { getOrCreateToken, downloadFromCloud, uploadToCloud } from './supabase-api.js';
import { getAllFromIndexedDB, saveToIndexedDB, deleteItemFromIndexedDB } from './storage.js';
import { INDEXED_DB_NAME, RATINGS_STORE_NAME } from './config.js';

const SYNC_ENABLED_KEY = 'cc_sync_enabled';
const SYNC_ACCESS_KEY = 'cc_sync_access_key';

let isSyncing = false; // Lock to prevent overlapping sync loops

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

function getActiveUserSlugFallback() {
  const match = document
    .querySelector('a.profile.initialized, a.profile[href*="/uzivatel/"], .profile.initialized[href*="/uzivatel/"]')
    ?.getAttribute('href')
    ?.match(/^\/uzivatel\/(\d+-[^/]+)\//);
  return match ? match[1] : undefined;
}

/**
 * Creates the Conflict Modal to display differences and allow manual overrides.
 */
function openConflictModal(conflicts, localData, cloudData, accessKey, currentUserSlug, onResolved) {
  // Map the raw conflict data into a clean, human-readable JSON object
  const localDiff = {};
  const cloudDiff = {};

  for (const [id, item] of Object.entries(conflicts)) {
    const title = item.local?.name || item.cloud?.name || id;

    localDiff[title] =
      item.local && !item.local.deleted ? { hodnoceni: item.local.rating, datum: item.local.date } : '--- SMAZÁNO ---';

    cloudDiff[title] =
      item.cloud && !item.cloud.deleted ? { hodnoceni: item.cloud.rating, datum: item.cloud.date } : '--- SMAZÁNO ---';
  }

  const overlay = document.createElement('div');
  overlay.className = 'cc-sync-modal-overlay visible';
  overlay.style.zIndex = '10050'; // Ensure it sits above the main sync modal

  overlay.innerHTML = `
    <div class="cc-sync-modal" style="width: 680px; max-width: 95vw;">
      <div class="cc-sync-modal-head" style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px;">
        <h3 style="color: #aa2c16;">Zjištěn konflikt v datech</h3>
        <button type="button" class="cc-sync-close" aria-label="Zavřít">&times;</button>
      </div>
      <p style="font-size: 12px; color: #444; margin-bottom: 12px; line-height: 1.4;">
        U následujících filmů se liší hodnocení mezi vaším prohlížečem a cloudem. Vyberte, která verze má přepsat tu druhou.
      </p>

      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <div style="flex: 1; display: flex; flex-direction: column;">
          <strong style="font-size: 11px; margin-bottom: 4px; color: #222;">Lokální data (Tento prohlížeč)</strong>
          <textarea readonly style="width: 100%; height: 220px; font-family: monospace; font-size: 11px; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; background: #f5f5f5; resize: none; white-space: pre;">${JSON.stringify(localDiff, null, 2)}</textarea>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column;">
          <strong style="font-size: 11px; margin-bottom: 4px; color: #222;">Cloud data (Záloha na serveru)</strong>
          <textarea readonly style="width: 100%; height: 220px; font-family: monospace; font-size: 11px; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; background: #f5f5f5; resize: none; white-space: pre;">${JSON.stringify(cloudDiff, null, 2)}</textarea>
        </div>
      </div>

      <div style="display: flex; gap: 8px;">
        <button type="button" id="cc-conflict-download" class="cc-button cc-button-black" style="flex: 1; font-size: 11px; padding: 8px;">
          ↓ PŘEPSAT Z CLOUDU (Zrušit lokální změny)
        </button>
        <button type="button" id="cc-conflict-upload" class="cc-button cc-button-black" style="flex: 1; font-size: 11px; padding: 8px;">
          ↑ PŘEPSAT DO CLOUDU (Potvrdit lokální změny)
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  overlay.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);

  // Manual Download Overwrite (Mirrors cloud exactly)
  overlay.querySelector('#cc-conflict-download')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Stahuji...';
    try {
      // For any item in cloud, if it's a tombstone, delete locally. Otherwise save it.
      for (const record of Object.values(cloudData)) {
        if (record.deleted) {
          await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record.id);
        } else {
          await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, record);
        }
      }
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
      onResolved('✅ Konflikt vyřešen: Data úspěšně přepsána z cloudu.');
      closeModal();
    } catch (err) {
      btn.textContent = 'Chyba stahování';
      btn.style.background = '#aa2c16';
    }
  });

  // Manual Upload Overwrite
  overlay.querySelector('#cc-conflict-upload')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Nahrávám...';
    try {
      const activeSlug = currentUserSlug || Object.values(localData)[0]?.userSlug;
      await uploadToCloud(accessKey, localData, activeSlug);
      onResolved('✅ Konflikt vyřešen: Cloud úspěšně přepsán lokálními daty.');
      closeModal();
    } catch (err) {
      btn.textContent = 'Chyba nahrávání';
      btn.style.background = '#aa2c16';
    }
  });
}

/**
 * Creates and displays the primary Sync Setup modal.
 */
function createSyncSetupModal(onSaveCallback, currentUserSlug) {
  removeSyncModal();

  const { enabled, accessKey } = getSyncSetupState();

  const overlay = document.createElement('div');
  overlay.className = 'cc-sync-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'cc-sync-modal';

  modal.innerHTML = `
    <div class="cc-sync-modal-head">
      <h3>Nastavení Cloud Sync <span style="color: #aa2c16; font-size: 11px; vertical-align: middle;">(BETA)</span></h3>
      <button type="button" class="cc-sync-close" aria-label="Zavřít">&times;</button>
    </div>

    <div style="font-size: 12px; color: #444; margin-bottom: 14px; line-height: 1.4;">
      <p style="margin-top: 0;">
        Zálohujte svá hodnocení a synchronizujte je napříč zařízeními.
        Pro spárování vložte svůj osobní <strong>Sync Token</strong>.
      </p>
    </div>

    <div style="background: #f9f9f9; border: 1px solid #eee; padding: 10px; border-radius: 8px; margin-bottom: 14px;">
      <label class="cc-sync-toggle-row" style="margin-bottom: 8px; display: flex; cursor: pointer;">
        <input id="cc-sync-enabled-input" type="checkbox" ${enabled ? 'checked' : ''} style="margin-right: 8px; accent-color: #aa2c16;">
        <span style="font-weight: 600; color: #222;">Povolit synchronizaci</span>
      </label>

      <div id="cc-sync-inputs-container" style="transition: opacity 0.2s ease;">
        <label class="cc-sync-label" for="cc-sync-key-input" style="font-weight: 600; margin-top: 8px; display: block;">Váš Sync Token</label>

        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <input id="cc-sync-key-input" class="cc-sync-input" type="password" placeholder="Např. a1b2c3d4-e5f6..." value="${accessKey.replace(/"/g, '&quot;')}" style="flex: 1; border: 1px solid #ccc; margin: 0;">
          <button type="button" id="cc-generate-token-btn" class="cc-button cc-button-black" style="white-space: nowrap;" ${!currentUserSlug ? 'title="Musíte být přihlášeni"' : ''}>
            Získat Token
          </button>
        </div>
        <div id="cc-sync-error" style="color: #aa2c16; font-size: 11px; margin-top: 4px; display: none;">Došlo k chybě při komunikaci se serverem.</div>

        <div id="cc-smart-sync-section" style="margin-top: 16px; transition: opacity 0.2s ease;">
          <button type="button" id="cc-smart-sync-btn" class="cc-button cc-button-red" style="width: 100%; padding: 8px; font-size: 13px; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Synchronizovat Nyní
          </button>
          <div id="cc-smart-sync-status" style="color: #184e21; font-size: 11px; margin-top: 8px; text-align: center; font-weight: 600; min-height: 14px; white-space: pre-wrap;"></div>
        </div>
      </div>
    </div>

    <div class="cc-sync-actions">
      <button type="button" class="cc-sync-save cc-button cc-button-red">Zavřít</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('visible'));

  const closeModal = () => {
    overlay.classList.remove('visible');
    setTimeout(removeSyncModal, 180);
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  modal.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);
  modal.querySelector('.cc-sync-save')?.addEventListener('click', closeModal);

  // --- UI Elements ---
  const generateBtn = modal.querySelector('#cc-generate-token-btn');
  const keyInput = modal.querySelector('#cc-sync-key-input');
  const enabledInput = modal.querySelector('#cc-sync-enabled-input');
  const inputsContainer = modal.querySelector('#cc-sync-inputs-container');
  const errorText = modal.querySelector('#cc-sync-error');
  const smartSyncBtn = modal.querySelector('#cc-smart-sync-btn');
  const smartSyncStatus = modal.querySelector('#cc-smart-sync-status');

  const setStatus = (msg, isError = false) => {
    smartSyncStatus.textContent = msg;
    smartSyncStatus.style.color = isError ? '#aa2c16' : '#184e21';
  };

  // --- Toggle & Auto-Save Logic ---
  const handleInputChange = () => {
    const isChecked = enabledInput.checked;
    const hasKey = keyInput.value.length > 0;

    keyInput.disabled = !isChecked;
    if (generateBtn) generateBtn.disabled = !isChecked || !currentUserSlug;

    inputsContainer.style.opacity = isChecked ? '1' : '0.5';
    inputsContainer.style.pointerEvents = isChecked ? 'auto' : 'none';

    const sectionsEnabled = isChecked && hasKey;
    smartSyncBtn.parentElement.style.opacity = sectionsEnabled ? '1' : '0.3';
    smartSyncBtn.parentElement.style.pointerEvents = sectionsEnabled ? 'auto' : 'none';

    saveSyncSetupState({
      enabled: Boolean(enabledInput.checked),
      accessKey: keyInput.value || '',
    });
    if (onSaveCallback) onSaveCallback();
  };

  handleInputChange();
  enabledInput.addEventListener('change', handleInputChange);
  keyInput.addEventListener('input', handleInputChange);

  // --- Token Generation ---
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      if (!currentUserSlug) return;

      generateBtn.disabled = true;
      generateBtn.textContent = 'Načítám...';
      errorText.style.display = 'none';

      const token = await getOrCreateToken(currentUserSlug);

      if (token) {
        keyInput.type = 'text';
        keyInput.value = token;
        enabledInput.checked = true;
        generateBtn.textContent = 'Hotovo ✓';
        handleInputChange();
      } else {
        errorText.style.display = 'block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Zkusit znovu';
      }
    });
  }

  // --- SMART SYNC NOW ---
  if (smartSyncBtn) {
    smartSyncBtn.addEventListener('click', async () => {
      smartSyncBtn.disabled = true;
      const originalText = smartSyncBtn.innerHTML;
      smartSyncBtn.textContent = 'Prověřuji data...';
      smartSyncStatus.textContent = '';

      // true = we are running manually, so it checks for conflicts!
      const result = await performCloudSync(true);

      if (result.status === 'conflict') {
        setStatus('Zjištěny nesrovnalosti.', true);
        openConflictModal(
          result.conflicts,
          result.localData,
          result.cloudData,
          keyInput.value,
          currentUserSlug,
          (resolutionMsg) => {
            setStatus(resolutionMsg);
          },
        );
      } else if (result.status === 'success') {
        const { addedToLocal, updatedInLocal, addedToCloud, updatedInCloud } = result.stats;

        if (addedToLocal === 0 && updatedInLocal === 0 && addedToCloud === 0 && updatedInCloud === 0) {
          setStatus('✅ Všechna data jsou již aktuální.');
        } else {
          let msg = '✅ Synchronizace úspěšná.\n';
          if (addedToLocal > 0) msg += `Staženo nových: ${addedToLocal}. `;
          if (updatedInLocal > 0) msg += `Aktualizováno lokálně: ${updatedInLocal}. `;
          if (addedToCloud > 0) msg += `Nahráno do cloudu: ${addedToCloud}. `;
          if (updatedInCloud > 0) msg += `Aktualizováno v cloudu: ${updatedInCloud}.`;
          setStatus(msg);
        }
      } else {
        setStatus('Nastala chyba při synchronizaci.', true);
      }

      smartSyncBtn.disabled = false;
      smartSyncBtn.innerHTML = originalText;
    });
  }
}

function updateSyncButtonLabel(button) {
  const { enabled, accessKey } = getSyncSetupState();
  const isFullyEnabled = enabled && accessKey.length > 0;

  button.classList.toggle('is-enabled', isFullyEnabled);
  button.setAttribute('title', isFullyEnabled ? 'Cloud sync je aktivní' : 'Nastavit Cloud sync');
  button.setAttribute('aria-label', isFullyEnabled ? 'Cloud sync zapnutý' : 'Nastavit Cloud sync');
}

export function initializeRatingsSync(rootElement, getCurrentUserSlug) {
  const syncButton = rootElement.querySelector('#cc-sync-cloud-btn');

  if (!syncButton || syncButton.dataset.ccSyncBound === 'true') return;

  syncButton.dataset.ccSyncBound = 'true';
  updateSyncButtonLabel(syncButton);

  syncButton.addEventListener('click', () => {
    const userSlug = getCurrentUserSlug();
    createSyncSetupModal(() => {
      updateSyncButtonLabel(syncButton);
    }, userSlug);
  });
}

/**
 * The main synchronization engine.
 * If isManualCheck is true, it strictly detects conflicts and pauses. Otherwise, it autosyncs.
 */
export async function performCloudSync(isManualCheck = false) {
  if (isSyncing) return { status: 'error' };

  const { enabled, accessKey } = getSyncSetupState();
  if (!enabled || !accessKey) return { status: 'error' };

  isSyncing = true;
  console.log('☁️ [CC Sync] Starting sync...');

  try {
    const localArray = await getAllFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME);
    const localData = {};
    localArray.forEach((record) => {
      if (record && record.movieId) localData[record.movieId] = record;
    });

    const cloudData = (await downloadFromCloud(accessKey)) || {};

    let hasLocalChanges = false;
    let hasCloudChanges = false;
    const mergedData = { ...localData };
    const stats = { addedToLocal: 0, updatedInLocal: 0, addedToCloud: 0, updatedInCloud: 0 };

    // ==========================================
    // 1. CONFLICT DETECTION (Manual Mode Only)
    // ==========================================
    if (isManualCheck) {
      const conflicts = {};
      let hasConflicts = false;

      for (const [movieId, cloudRecord] of Object.entries(cloudData)) {
        const localRecord = localData[movieId];

        if (!localRecord && !cloudRecord.deleted) {
          // It's a real record in the cloud, but totally missing here.
          hasConflicts = true;
          conflicts[movieId] = { local: null, cloud: cloudRecord };
        } else if (localRecord && cloudRecord.deleted && !localRecord.deleted) {
          // We have it, but cloud says it's deleted
          hasConflicts = true;
          conflicts[movieId] = { local: localRecord, cloud: cloudRecord };
        } else if (localRecord && !cloudRecord.deleted && localRecord.rating !== cloudRecord.rating) {
          // Ratings are just different
          hasConflicts = true;
          conflicts[movieId] = { local: localRecord, cloud: cloudRecord };
        }
      }

      if (hasConflicts) {
        return { status: 'conflict', conflicts, localData, cloudData };
      }
    }

    // ==========================================
    // 2. STANDARD MERGE (Timestamp Based with Tombstones)
    // ==========================================
    for (const [movieId, cloudRecord] of Object.entries(cloudData)) {
      const localRecord = mergedData[movieId];

      if (!localRecord) {
        // We don't have it locally.
        if (cloudRecord.deleted) {
          // It's a tombstone. Ignore it, we already don't have it.
        } else {
          // It's a real new movie from the cloud. Download it.
          mergedData[movieId] = cloudRecord;
          await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord);
          hasLocalChanges = true;
          stats.addedToLocal++;
        }
      } else {
        const localTime = new Date(localRecord.lastUpdate || 0).getTime();
        const cloudTime = new Date(cloudRecord.lastUpdate || 0).getTime();

        if (cloudTime > localTime) {
          // Cloud is newer!
          mergedData[movieId] = cloudRecord;

          if (cloudRecord.deleted) {
            // Cloud says it was deleted on another device! Remove it here.
            await deleteItemFromIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord.id);
            stats.updatedInLocal++;
            hasLocalChanges = true;
          } else {
            await saveToIndexedDB(INDEXED_DB_NAME, RATINGS_STORE_NAME, cloudRecord);
            stats.updatedInLocal++;
            hasLocalChanges = true;
          }
        } else if (localTime > cloudTime) {
          // Local is newer! (Could be a local edit, OR a local tombstone)
          hasCloudChanges = true;
          stats.updatedInCloud++;
        }
      }
    }

    // Add entirely new local items to the cloud list
    for (const movieId of Object.keys(localData)) {
      if (!cloudData[movieId]) {
        hasCloudChanges = true;
        stats.addedToCloud++;
      }
    }

    // ==========================================
    // 3. UPLOAD & REFRESH
    // ==========================================
    if (hasCloudChanges || Object.keys(cloudData).length === 0) {
      console.log('☁️ [CC Sync] Uploading updated data to cloud...');
      const activeSlug = getActiveUserSlugFallback() || Object.values(localData)[0]?.userSlug;
      await uploadToCloud(accessKey, mergedData, activeSlug);
    }

    if (hasLocalChanges) {
      console.log('☁️ [CC Sync] Local DB updated. Refreshing UI.');
      window.dispatchEvent(new CustomEvent('cc-ratings-updated'));
    }

    console.log('☁️ [CC Sync] Sync complete!', stats);
    return { status: 'success', stats, hasLocalChanges, hasCloudChanges };
  } catch (error) {
    console.error('☁️ [CC Sync] Failed:', error);
    return { status: 'error' };
  } finally {
    isSyncing = false;
  }
}
