export const Glob = {
  popupCounter: 0,

  popup: function (htmlContent, timeout = 3, width = 150, slideTime = 100) {
    var id = this.popupCounter++;
    if (!htmlContent) return;
    const existing = document.getElementsByClassName("SNPopup");
    if (existing.length > 0) {
      existing[0].remove();
    }
    var yOffset = 10;
    let popupDiv = document.createElement('div');
    popupDiv.id = `SNPopup${id}`;
    popupDiv.className = 'SNPopup';
    popupDiv.innerHTML = htmlContent;
    popupDiv.style.border = "1px solid black";
    popupDiv.style.borderRadius = "4px";
    popupDiv.style.display = "none";
    popupDiv.style.padding = "10px";
    popupDiv.style.opacity = "0.95";
    popupDiv.style.background = "#820001";
    popupDiv.style.color = "white";
    popupDiv.style.position = "absolute";
    popupDiv.style.left = "45%";
    popupDiv.style.width = width + "px";
    popupDiv.style.zIndex = "999";
    popupDiv.style.top = yOffset + "px";
    document.body.appendChild(popupDiv);
    popupDiv.style.display = "block";
    setTimeout(() => {
      popupDiv.style.display = "none";
      popupDiv.remove();
    }, timeout * 1000);
  }
};
