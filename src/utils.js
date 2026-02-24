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
