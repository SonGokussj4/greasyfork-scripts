const fs = require('fs');
const Module = require('module');
const path = require('path');
const { performance: nodePerformance } = require('perf_hooks');
const vm = require('vm');

function createLegacyBrowserEnv() {
  const legacyWindow = {
    indexedDB: global.indexedDB,
    webkitIndexedDB: global.webkitIndexedDB,
    mozIndexedDB: global.mozIndexedDB,
    OIndexedDB: global.OIndexedDB,
    msIndexedDB: global.msIndexedDB,
    IDBTransaction: global.IDBTransaction,
    webkitIDBTransaction: global.webkitIDBTransaction,
    OIDBTransaction: global.OIDBTransaction,
    msIDBTransaction: global.msIDBTransaction,
    document: global.document,
    navigator: global.navigator,
    location: global.location,
  };

  return {
    window: legacyWindow,
    document: global.document,
    navigator: global.navigator,
    location: global.location,
    localStorage: global.localStorage,
    sessionStorage: global.sessionStorage,
    indexedDB: global.indexedDB,
    IDBTransaction: global.IDBTransaction,
    DOMParser: global.DOMParser,
    CustomEvent: global.CustomEvent,
    MutationObserver: global.MutationObserver,
    Node: global.Node,
    Element: global.Element,
    fetch: global.fetch,
    performance: global.performance || nodePerformance,
    $: global.$,
    jQuery: global.jQuery,
  };
}

function requireLegacyCommonJsModule(filePath) {
  const resolvedPath = path.resolve(filePath);
  const env = createLegacyBrowserEnv();
  const source = fs.readFileSync(resolvedPath, 'utf8');
  const moduleInstance = { exports: {} };
  const sandbox = {
    module: moduleInstance,
    exports: moduleInstance.exports,
    require: Module.createRequire(resolvedPath),
    __filename: resolvedPath,
    __dirname: path.dirname(resolvedPath),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    window: env.window,
    document: env.document,
    navigator: env.navigator,
    location: env.location,
    localStorage: env.localStorage,
    sessionStorage: env.sessionStorage,
    indexedDB: env.indexedDB,
    IDBTransaction: env.IDBTransaction,
    DOMParser: env.DOMParser,
    CustomEvent: env.CustomEvent,
    MutationObserver: env.MutationObserver,
    Node: env.Node,
    Element: env.Element,
    fetch: env.fetch,
    performance: env.performance,
    $: env.$,
    jQuery: env.jQuery,
  };

  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  const wrappedSource = Module.wrap(source);
  const script = new vm.Script(wrappedSource, { filename: resolvedPath });
  const compiledWrapper = script.runInNewContext(sandbox);
  compiledWrapper.call(
    moduleInstance.exports,
    moduleInstance.exports,
    sandbox.require,
    moduleInstance,
    resolvedPath,
    path.dirname(resolvedPath),
  );

  return moduleInstance.exports;
}

module.exports = {
  requireLegacyCommonJsModule,
};
