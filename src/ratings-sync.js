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
  const overlay = document.createElement('div');
  overlay.className = 'cc-sync-modal-overlay visible';
  overlay.style.zIndex = '10050'; // Zaručí, že překryje i původní sync okno

  // Helper pro krásné vykreslení hodnocení nebo "odpadu"
  const formatRating = (record) => {
    if (!record || record.deleted) {
      return '<span style="color: #aa2c16; font-weight: 600;">Smazáno</span>';
    }

    let ratingDisplay = '';
    if (record.rating === 0) {
      ratingDisplay = '<strong style="color: #000;">Odpad!</strong>';
    } else if (Number.isFinite(record.rating)) {
      const r = Math.min(5, Math.max(1, Math.round(record.rating)));
      const starsOn = '★'.repeat(r);
      const starsOff = '★'.repeat(5 - r);
      ratingDisplay = `<span style="color: #b8321d; font-size: 14px; letter-spacing: 1px;">${starsOn}<span style="color: #ddd;">${starsOff}</span></span>`;
    } else {
      ratingDisplay = '<span style="color: #888;">Neznámé</span>';
    }

    const dateDisplay = record.date
      ? `<div style="color: #888; font-size: 10px; margin-top: 4px;">${record.date}</div>`
      : '';

    return `<div>${ratingDisplay}${dateDisplay}</div>`;
  };

  // Sestavení řádků do tabulky
  const rowsHtml = Object.entries(conflicts)
    .map(([id, item]) => {
      const title = item.local?.name || item.cloud?.name || id;
      return `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 10px; font-size: 12px; color: #222; font-weight: 600; line-height: 1.3;">${title}</td>
        <td style="padding: 10px; border-left: 1px solid #f0f0f0; background: #fffdfd; text-align: center; vertical-align: middle;">${formatRating(item.local)}</td>
        <td style="padding: 10px; border-left: 1px solid #f0f0f0; background: #fbfbfb; text-align: center; vertical-align: middle;">${formatRating(item.cloud)}</td>
      </tr>
    `;
    })
    .join('');

  overlay.innerHTML = `
    <div class="cc-sync-modal" style="width: 680px; max-width: 95vw; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,0.25); padding: 18px;">
      <div class="cc-sync-modal-head" style="border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="color: #aa2c16; font-size: 16px; margin: 0; display: flex; align-items: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Zjištěn konflikt v hodnoceních
        </h3>
        <button type="button" class="cc-sync-close" aria-label="Zavřít" style="font-size: 24px; border: 0; background: transparent; cursor: pointer; color: #666; line-height: 1;">&times;</button>
      </div>

      <p style="font-size: 13px; color: #444; margin-bottom: 16px; line-height: 1.5;">
        Našli jsme rozdíly mezi tímto prohlížečem a zálohou v cloudu. Může to znamenat, že jste tyto filmy hodnotili na jiném zařízení. <strong>Kterou verzi si přejete zachovat?</strong>
      </p>

      <div style="max-height: 350px; max-height: 60vh; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead style="background: #f5f5f5; position: sticky; top: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1;">
            <tr>
              <th style="padding: 10px; font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase;">Název filmu / seriálu</th>
              <th style="padding: 10px; font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; border-left: 1px solid #e0e0e0; text-align: center; width: 28%;">Tento prohlížeč</th>
              <th style="padding: 10px; font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; border-left: 1px solid #e0e0e0; text-align: center; width: 28%;">Záloha v cloudu</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="display: flex; gap: 12px;">
        <button type="button" id="cc-conflict-download" class="cc-button cc-button-black" style="flex: 1; padding: 12px 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 8px; height: auto; transition: all 0.2s;">
          <span style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Přijmout cloudovou zálohu
          </span>
          <span style="font-size: 11px; color: #aaa; font-weight: normal;">Zahodí lokální úpravy a stáhne data z cloudu</span>
        </button>

        <button type="button" id="cc-conflict-upload" class="cc-button cc-button-red" style="flex: 1; padding: 12px 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 8px; height: auto; transition: all 0.2s;">
          <span style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Ponechat lokální změny
          </span>
          <span style="font-size: 11px; color: rgba(255,255,255,0.7); font-weight: normal;">Nahraje tyto novější úpravy do cloudu</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  overlay.querySelector('.cc-sync-close')?.addEventListener('click', closeModal);

  // Manual Download Overwrite
  overlay.querySelector('#cc-conflict-download')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Stahuji...';
    try {
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
      btn.querySelector('span').textContent = 'Chyba stahování';
      btn.style.background = '#aa2c16';
    }
  });

  // Manual Upload Overwrite
  overlay.querySelector('#cc-conflict-upload')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Nahrávám...';
    try {
      const activeSlug = currentUserSlug || Object.values(localData)[0]?.userSlug;
      await uploadToCloud(accessKey, localData, activeSlug);
      onResolved('✅ Konflikt vyřešen: Cloud úspěšně přepsán lokálními daty.');
      closeModal();
    } catch (err) {
      btn.querySelector('span').textContent = 'Chyba nahrávání';
      btn.style.background = '#222';
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
