const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { JSDOM } = require('jsdom');
const path = require('path');
const { requireLegacyCommonJsModule } = require('./helpers/requireLegacyCommonJsModule.cjs');
const { onHomepage } = requireLegacyCommonJsModule(path.resolve(__dirname, '../csfd-compare.js'));

function createDOM(pathname = '/') {
  const dom = new JSDOM('', { url: `http://csfd.cz${pathname}` });
  return dom.window;
}

test('onHomepage returns true if on the homepage', async () => {
  const windowObj = createDOM('/');
  expect(await onHomepage(windowObj)).toBe(true);
});

test('onHomepage returns false if not on the homepage', async () => {
  const windowObj = createDOM('/some-page');
  expect(await onHomepage(windowObj)).toBe(false);
});
