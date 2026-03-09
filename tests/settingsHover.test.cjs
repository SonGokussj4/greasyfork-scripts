const path = require('path');
const { pathToFileURL } = require('url');

let initializeSettingsMenuHover;

beforeAll(async () => {
  ({ initializeSettingsMenuHover } = await import(
    pathToFileURL(path.resolve(__dirname, '../src/settings-hover.js')).href
  ));
});

beforeEach(() => {
  localStorage.clear();
  document.body.className = '';
  document.body.innerHTML = '';
});

function renderSettingsMenuButton() {
  document.body.innerHTML = `
    <ul class="header-bar">
      <li class="cc-menu-item">
        <a href="javascript:void(0)" class="user-link csfd-compare-menu">CC</a>
        <div class="dropdown-content cc-settings">
          <div class="dropdown-content-head">
            <div class="left-head"><h2>CSFD-Compare</h2></div>
            <div class="right-head"></div>
          </div>
          <div class="cc-settings-shell-body"><div>Body</div></div>
        </div>
      </li>
    </ul>
  `;

  return document.querySelector('.cc-menu-item');
}

describe('settings hover controller', () => {
  test('pins the dropdown to the document body and restores it back to the menu item', () => {
    const menuButton = renderSettingsMenuButton();
    const dropdown = menuButton.querySelector('.dropdown-content.cc-settings');

    initializeSettingsMenuHover(menuButton);

    const controller = menuButton.__ccSettingsMenuController;
    expect(controller).toBeTruthy();

    controller.openPinned();

    expect(controller.isPinnedOpen()).toBe(true);
    expect(dropdown.parentNode).toBe(document.body);
    expect(dropdown.classList.contains('cc-settings-pinned-root')).toBe(true);
    expect(document.body.classList.contains('cc-menu-open')).toBe(true);

    controller.closePinned();

    expect(controller.isPinnedOpen()).toBe(false);
    expect(menuButton.querySelector('.dropdown-content.cc-settings')).toBe(dropdown);
    expect(dropdown.classList.contains('cc-settings-pinned-root')).toBe(false);
    expect(document.body.classList.contains('cc-menu-open')).toBe(false);
  });

  test('togglePinned reports whether the menu ended up pinned', () => {
    const menuButton = renderSettingsMenuButton();

    initializeSettingsMenuHover(menuButton);

    const controller = menuButton.__ccSettingsMenuController;

    expect(controller.togglePinned()).toBe(true);
    expect(controller.isPinnedOpen()).toBe(true);

    expect(controller.togglePinned()).toBe(false);
    expect(controller.isPinnedOpen()).toBe(false);
  });
});
