const { onHomepage } = require("../csfd-compare.js");

test("onHomepage returns true if on the homepage", () => {
  window.location.pathname = "/";
  const res = onHomepage();
  console.log("[ DEBUG ] res: ", res);
  expect(onHomepage()).toBe(true);
});

test("onHomepage returns false if not on the homepage", () => {
  window.location.pathname = "/some-page";
  const res = onHomepage();
  expect(onHomepage()).toBe(false);
});
