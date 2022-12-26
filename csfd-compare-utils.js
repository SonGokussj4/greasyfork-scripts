let Glob = {
  popupCounter: 0,

  popup: function (htmlContent, timeout = 3, width = 150, slideTime = 100) {
    var id = Glob.popupCounter++;
    if (!htmlContent) {
      return;
    }

    // Destroy the current popup by classname
    var popup = document.getElementsByClassName("SNPopup");
    if (popup.length > 0) {
      popup[0].remove();
    }

    var yOffset = 10;
    let $popup = $(`<div>`, {
      id: `SNPopup${id}`,
      "class": "SNPopup",
      html: htmlContent,
    })
      .css({
        border: "1px solid black",
        borderRadius: "4px",
        display: "none",
        padding: "10px",
        opacity: "0.95",
        background: "#820001",
        color: "white",
        position: "absolute",
        left: "45%",
        width: `${width}px`,
        zIndex: "999",
        top: `${yOffset}px`,
        right: "10px"
      });
    $(".header-search").append($popup);
    $popup.slideDown(slideTime);
    (function ($popup) {
      setTimeout(function () {
        $popup.slideUp(slideTime);
      }, timeout * 1000);
    })($popup);
  }
};