import {
  CREATOR_PREVIEW_ENABLED_KEY,
  CREATOR_PREVIEW_SECTION_COLLAPSED_KEY,
  CREATOR_PREVIEW_SHOW_BIRTH_KEY,
  CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
  GALLERY_IMAGE_LINKS_ENABLED_KEY,
  SHOW_ALL_CREATOR_TABS_KEY,
  CLICKABLE_HEADER_BOXES_KEY,
  RATINGS_ESTIMATE_KEY,
  RATINGS_FROM_FAVORITES_KEY,
  ADD_RATINGS_DATE_KEY,
  HIDE_SELECTED_REVIEWS_KEY,
  HIDE_REVIEWS_SECTION_COLLAPSED_KEY,
  CREATOR_PREVIEW_CACHE_HOURS_KEY,
  SHOW_RATINGS_KEY,
  SHOW_RATINGS_IN_REVIEWS_KEY,
  SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY,
  SHOW_RATINGS_SECTION_COLLAPSED_KEY,
} from './config.js';

// Export a pure data-driven MENU_CONFIG. Callback handlers are exported as
// string names so the main module can resolve them to actual function refs.
export const MENU_CONFIG = [
  {
    category: 'Globální',
    items: [
      {
        type: 'group',
        id: 'cc-hide-home-panels',
        storageKey: 'cc_hide_home_panels',
        defaultValue: true,
        label: 'Domácí stránka - skryté panely',
        tooltip: '',
        infoIcon: {
          url: 'https://i.imgur.com/HkXrw6N.png',
          text: 'Skryje nechtěné sekce na domovské stránce.\n\n👉 Klikni pro ukázku',
        },
        eventName: 'cc-hidden-panels-updated',
        groupToggleId: 'cc-hide-panels-group-toggle',
        groupBodyId: 'cc-hide-panels-group-body',
        collapsedKey: 'cc_hide_panels_collapsed',
        callback: 'updateHidePanelsUI',
        childrenHtml: `
            <div class="cc-form-field">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
                    <span title="Zde se zobrazují skryté panely. Pro jejich obnovení klikněte na křížek.">Skryté sekce:</span>
                    <button type="button" id="cc-restore-all-panels-btn" class="cc-button cc-button-black cc-button-small" style="padding: 4px 8px; font-size: 10px;" title="Obnoví zobrazení všech skrytých panelů na domovské stránce.">Obnovit vše</button>
                </div>
                <div class="cc-pill-input-container cc-hide-panels-scroll" id="cc-hide-panels-pill-container" style="min-height: 36px; max-height: 120px; overflow-y: auto; align-items: flex-start; align-content: flex-start; cursor: default; background: #fdfdfd; scrollbar-width: thin;">
                    <div class="cc-pills" id="cc-hide-panels-pills"></div>
                    <span id="cc-hide-panels-empty" style="color: #999; font-size: 11px; padding: 2px 4px;">Žádné skryté panely...</span>
                </div>
            </div>`,
      },
      {
        type: 'toggle',
        id: 'cc-enable-clickable-header-boxes',
        storageKey: CLICKABLE_HEADER_BOXES_KEY,
        defaultValue: true,
        label: 'Boxy s tlačítkem "VÍCE" jsou klikatelné celé',
        infoIcon: {
          url: 'https://i.imgur.com/sV23XS2.png',
          text: 'Boxy obsahující tlačítko "více" jsou klikatelné celé. Není potřeba mířit přesně na tlačítko.\n\n👉 Klikni pro ukázku',
        },
        tooltip: '',
        eventName: 'cc-clickable-header-boxes-toggled',
      },
    ],
  },
  {
    category: 'Filmy a seriály',
    items: [
      {
        type: 'group',
        id: 'cc-show-ratings',
        storageKey: SHOW_RATINGS_KEY,
        defaultValue: true,
        label: 'Ukázat hodnocení',
        tooltip: '',
        infoIcon: {
          url: 'https://i.imgur.com/aTrSU2X.png',
          text: 'Zobrazí hodnocení (hvězdičky) filmů vedle jejich názvů.\n\n👉 Klikni pro ukázku',
        },
        eventName: 'cc-ratings-updated',
        groupToggleId: 'cc-show-ratings-group-toggle',
        groupBodyId: 'cc-show-ratings-group-body',
        collapsedKey: SHOW_RATINGS_SECTION_COLLAPSED_KEY,
        callback: 'updateShowRatingsUI',
        childrenItems: [
          {
            type: 'toggle',
            id: 'cc-show-ratings-in-reviews',
            storageKey: SHOW_RATINGS_IN_REVIEWS_KEY,
            defaultValue: true,
            label: 'Ukazovat v recenzích',
            tooltip: '',
            infoIcon: {
              url: 'https://i.imgur.com/Bmisvc5.jpeg',
              text: 'Zobrazí hodnocení (hvězdičky) i u odkazů uvnitř textů recenzí a komentářů.\n\n👉 Klikni pro ukázku',
            },
            eventName: 'cc-ratings-updated',
            callback: null,
          },
          {
            type: 'toggle',
            id: 'cc-show-ratings-in-foreign-reviews',
            storageKey: SHOW_RATINGS_IN_FOREIGN_REVIEWS_KEY,
            defaultValue: true,
            label: 'Ukazovat v recenzích cizího profilu',
            tooltip: '',
            infoIcon: {
              url: 'https://i.imgur.com/GB3H0JU.png',
              text: 'Zobrazí hodnocení (hvězdičky) i u odkazů uvnitř textů a recenzí cizího profilu.\n\n👉 Klikni pro ukázku',
            },
            eventName: 'cc-ratings-updated',
            callback: null,
          },
        ],
      },
      {
        type: 'toggle',
        id: 'cc-enable-gallery-image-links',
        storageKey: GALLERY_IMAGE_LINKS_ENABLED_KEY,
        defaultValue: true,
        label: 'Zobrazovat formáty obrázků v galerii',
        tooltip: '',
        eventName: 'cc-gallery-image-links-toggled',
        infoIcon: {
          url: 'https://i.imgur.com/2KEixfW.png',
          text: 'U obrázků v galerii filmu zobrazí tlačítka pro otevření v různých velikostech.\n\n👉 Klikni pro ukázku',
        },
      },
      {
        type: 'toggle',
        id: 'cc-ratings-estimate',
        storageKey: RATINGS_ESTIMATE_KEY,
        defaultValue: true,
        label: 'Vypočtení % při počtu hodnocení pod 10',
        tooltip: '',
        eventName: 'cc-ratings-estimate-toggled',
        infoIcon: {
          url: 'https://i.imgur.com/ySdMhXt.png',
          text: 'Dopočítá a zobrazí hodnocení i u filmů s méně než 10 hodnoceními.\n\n👉 Klikni pro ukázku',
        },
      },
      {
        type: 'toggle',
        id: 'cc-ratings-from-favorites',
        storageKey: RATINGS_FROM_FAVORITES_KEY,
        defaultValue: true,
        requiresLogin: true,
        label: 'Zobrazit hodnocení z průměru oblíbených',
        tooltip: '',
        eventName: 'cc-ratings-from-favorites-toggled',
        infoIcon: {
          url: 'https://i.imgur.com/sN9Aq4Y.jpeg',
          text: 'Přidá doplňující průměrné hodnocení vypočítané z oblíbených uživatelů.\n\n👉 Klikni pro ukázku',
        },
      },
      {
        type: 'toggle',
        id: 'cc-add-ratings-date',
        storageKey: ADD_RATINGS_DATE_KEY,
        defaultValue: true,
        requiresLogin: true,
        label: 'Zobrazit datum hodnocení',
        tooltip: '',
        eventName: 'cc-add-ratings-date-toggled',
        infoIcon: {
          url: 'https://i.imgur.com/sN9Aq4Y.jpeg',
          text: 'Zobrazí datum, kdy jste film hodnotili.\n\n👉 Klikni pro ukázku',
        },
      },
      {
        type: 'group',
        id: 'cc-hide-selected-reviews',
        storageKey: HIDE_SELECTED_REVIEWS_KEY,
        defaultValue: false,
        label: 'Skrýt recenze lidí',
        tooltip: '',
        infoIcon: {
          url: 'https://i.imgur.com/sN9Aq4Y.jpeg',
          text: 'Skrýt komentáře a recenze uživatelů, které nechcete číst.\n\n👉 Klikni pro ukázku',
        },
        eventName: 'cc-hide-selected-reviews-updated',
        groupToggleId: 'cc-hide-reviews-group-toggle',
        groupBodyId: 'cc-hide-reviews-group-body',
        collapsedKey: HIDE_REVIEWS_SECTION_COLLAPSED_KEY,
        callback: 'updateHideReviewsUI',
        childrenHtml: `
            <label class="cc-form-field">
                <span title="Zadejte uživatelské jméno a potvrďte klávesou Enter.">Jmena uživatelů (oddělte mezerou)</span>
                <div class="cc-pill-input-container" id="cc-hide-reviews-pill-container" title="Zadejte jméno uživatele a stiskněte Enter nebo Mezeru">
                    <div class="cc-pills" id="cc-hide-reviews-pills"></div>
                    <input type="text" data-bwignore="true" id="cc-hide-reviews-pill-input" placeholder="Přidat jméno..." />
                </div>
            </label>
            <div class="cc-sub-actions" style="margin-top: 6px;">
                <button type="button" id="cc-hide-reviews-apply" class="cc-button cc-button-red cc-button-small" title="Okamžitě uloží seznam a skryje vybrané recenze.">Uložit jména</button>
            </div>`,
      },
    ],
  },
  {
    category: 'Herci a tvůrci',
    items: [
      {
        type: 'toggle',
        id: 'cc-show-all-creator-tabs',
        storageKey: SHOW_ALL_CREATOR_TABS_KEY,
        defaultValue: true,
        label: 'Zobrazit všechny záložky tvůrce',
        tooltip: '',
        eventName: 'cc-show-all-creator-tabs-toggled',
        infoIcon: {
          url: 'https://i.imgur.com/sN9Aq4Y.jpeg',
          text: 'Na profilu herce automaticky zobrazí všechny záložky (Videa, Galerie, Diskuze) vedle sebe bez klikání na "další 🔻".\n\n👉 Klikni pro ukázku',
        },
      },
      {
        type: 'group',
        id: 'cc-enable-creator-preview',
        storageKey: CREATOR_PREVIEW_ENABLED_KEY,
        defaultValue: true,
        label: 'Náhledy fotek tvůrců',
        tooltip: '',
        infoIcon: {
          url: 'https://i.imgur.com/sN9Aq4Y.jpeg',
          text: 'Po najetí myší na jméno herce/tvůrce se objeví panel s jeho fotografií a detaily.\n\n👉 Klikni pro ukázku',
        },
        eventName: null,
        groupToggleId: 'cc-creator-preview-group-toggle',
        groupBodyId: 'cc-creator-preview-group-body',
        collapsedKey: CREATOR_PREVIEW_SECTION_COLLAPSED_KEY,
        callback: 'updateCreatorPreviewUI',
        childrenItems: [
          {
            type: 'toggle',
            id: 'cc-creator-preview-show-birth',
            storageKey: CREATOR_PREVIEW_SHOW_BIRTH_KEY,
            defaultValue: true,
            label: 'Zobrazovat datum narození',
            tooltip: '',
            infoIcon: {
              url: 'https://i.imgur.com/sN9Aq4Y.jpeg',
              text: 'Zobrazí datum narození/úmrtí a věk tvůrce.\n\n👉 Klikni pro ukázku',
            },
            callback: 'updateCreatorPreviewUI',
          },
          {
            type: 'toggle',
            id: 'cc-creator-preview-show-photo-from',
            storageKey: CREATOR_PREVIEW_SHOW_PHOTO_FROM_KEY,
            defaultValue: true,
            label: 'Zobrazovat zdroj fotky',
            tooltip: '',
            infoIcon: {
              url: 'https://i.imgur.com/sN9Aq4Y.jpeg',
              text: 'Zobrazovat, z jakého filmu pochází fotka.\n\n👉 Klikni pro ukázku',
            },
            callback: 'updateCreatorPreviewUI',
          },
        ],
        childrenHtml: `
            <div class="cc-setting-row" style="margin-top: 2px;" title="Určuje, jak dlouho si prohlížeč bude pamatovat stažené fotky tvůrců. Delší čas šetří data a zrychluje web.">
                <span class="cc-setting-label cc-grow">Délka mezipaměti (Cache)</span>
                <select id="cc-creator-preview-cache-hours" class="cc-select-compact">
                    <option value="1">1 hodina</option>
                    <option value="24">24 hodin</option>
                    <option value="168">7 dní</option>
                    <option value="720">1 měsíc</option>
                </select>
            </div>`,
      },
    ],
  },
];

export default MENU_CONFIG;
