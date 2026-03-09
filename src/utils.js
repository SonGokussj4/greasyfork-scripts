export function roundTo(number, decimals) {
  return Math.floor(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function profileFunction(fn, name, profilingData) {
  return function (...args) {
    const start = performance.now();
    const result = fn.apply(this, args);
    const end = performance.now();
    if (!profilingData[name]) {
      profilingData[name] = { type: 'function', calledNumber: 0, completeTime_ms: 0 };
    }
    profilingData[name].calledNumber++;
    profilingData[name].completeTime_ms += end - start;
    profilingData[name].averagePerCall_ms = profilingData[name].completeTime_ms / profilingData[name].calledNumber;
    return result;
  };
}

export function profileAsyncFunction(fn, name, profilingData) {
  return async function (...args) {
    const start = performance.now();
    const result = await fn.apply(this, args);
    const end = performance.now();
    if (!profilingData[name]) {
      profilingData[name] = { type: 'async function', calledNumber: 0, completeTime_ms: 0 };
    }
    profilingData[name].calledNumber++;
    profilingData[name].completeTime_ms += end - start;
    profilingData[name].averagePerCall_ms = profilingData[name].completeTime_ms / profilingData[name].calledNumber;
    return result;
  };
}

export function profileMethod(obj, methodName, profilingData) {
  const originalMethod = obj[methodName];
  obj[methodName] = function (...args) {
    const start = performance.now();
    const result = originalMethod.apply(this, args);
    const end = performance.now();
    if (!profilingData[methodName]) {
      profilingData[methodName] = { type: 'method', calledNumber: 0, completeTime_ms: 0 };
    }
    profilingData[methodName].calledNumber++;
    profilingData[methodName].completeTime_ms += end - start;
    profilingData[methodName].averagePerCall_ms =
      profilingData[methodName].completeTime_ms / profilingData[methodName].calledNumber;
    return result;
  };
}

export function delay(t) {
  return new Promise((resolve) => setTimeout(resolve, t));
}

// Escape HTML to prevent XSS from weird CSFD data
export const escapeHtml = (str) =>
  String(str || '').replace(
    /[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m],
  );

/**
 * Checks if the current user is logged into ČSFD.
 * @returns {boolean}
 */
export function isUserLoggedIn() {
  return document.querySelector('.user-logged') !== null;
}

/**
 * Pure utility function for reading settings.
 * @param {string} key - The localStorage key for the setting.
 * @param {boolean} [defaultValue=true] - The default value if the setting is not set.
 * @returns {boolean} The current state of the setting.
 */
export function getFeatureState(key, defaultValue = true) {
  const value = localStorage.getItem(key);
  if (value === null) return defaultValue;
  return value === 'true';
}

/**
 * Pure utility function for parsing IDs.
 * @param {string} url - The URL to extract the movie ID from.
 * @returns {number} The extracted movie ID, or NaN if it cannot be parsed.
 */
export async function getMovieIdFromUrl(url) {
  if (!url) return NaN;
  // OPTIMIZATION: matchAll is slower. A simple regex match with global flag is faster.
  const matches = url.match(/\/(\d+)-/g);
  if (!matches || matches.length === 0) return NaN;

  // Extract numbers from the last match e.g., "/12345-" -> 12345
  const lastMatch = matches[matches.length - 1];
  return parseInt(lastMatch.replace(/\D/g, ''), 10);
}
