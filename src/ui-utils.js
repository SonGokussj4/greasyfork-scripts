// Utility to enable/disable controls by IDs based on login state
export function setControlsDisabledByLoginState(isLoggedIn, controlIds) {
  controlIds.forEach((id) => {
    const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
    if (el) {
      el.disabled = !isLoggedIn;
      if (!isLoggedIn) {
        el.parentElement && (el.parentElement.style.color = '#aaa');
        el.parentElement && (el.parentElement.title = 'Přihlaste se pro aktivaci této volby');
      } else {
        el.parentElement && (el.parentElement.style.color = '');
        el.parentElement && (el.parentElement.title = '');
      }
    }
  });
}
