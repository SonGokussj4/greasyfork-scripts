/*
 * Local activity log: a small ring buffer in localStorage that records what the
 * script did (ratings loads, sync, errors), so a problem can be inspected or
 * copied into a bug report. Nothing is ever sent anywhere.
 */
import { ACTIVITY_LOG_KEY } from './config.js';

export const ACTIVITY_LOG_MAX_ENTRIES = 200;
const MAX_MESSAGE_LENGTH = 300;
const DEDUPE_WINDOW_MS = 5000;

/**
 * Single line, no URLs or token-like strings (errors can contain keys or links), length-limited.
 * Token-like = 24+ id characters containing a digit, so long setting names (cc_show_ratings_in_reviews) stay readable.
 */
export function sanitizeMessage(message) {
  return String(message ?? '')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function readEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  try {
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(entries.slice(-ACTIVITY_LOG_MAX_ENTRIES)));
  } catch {
    // Storage unavailable or full: logging must never break the script.
  }
}

/** Appends one entry. level: 'info' | 'warn' | 'error'. */
export function logActivity(area, message, level = 'info') {
  const text = sanitizeMessage(message);
  const entries = readEntries();
  const last = entries.at(-1);
  const now = Date.now();

  // Collapse bursts of the same message (e.g. repeated failed fetches).
  if (last && last.area === area && last.level === level && last.msg === text && now - last.t < DEDUPE_WINDOW_MS) {
    return;
  }

  writeEntries([...entries, { t: now, level, area, msg: text }]);
}

export function getActivityLog() {
  return readEntries();
}

export function clearActivityLog() {
  try {
    localStorage.removeItem(ACTIVITY_LOG_KEY);
  } catch {
    // Ignore.
  }
}

const pad = (value) => String(value).padStart(2, '0');

export function formatActivityTimestamp(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Plain-text version for the "Copy" button (newest last, one line per entry). */
export function formatActivityLogText(entries = readEntries()) {
  return entries
    .map((e) => `${formatActivityTimestamp(e.t)} ${String(e.level).toUpperCase().padEnd(5)} [${e.area}] ${e.msg}`)
    .join('\n');
}

let consoleCaptureInstalled = false;

/** Test helper: allows installConsoleCapture() to run again. */
export function resetConsoleCaptureForTests() {
  consoleCaptureInstalled = false;
}

/**
 * Mirrors console.warn / console.error calls that start with a "[CC" tag into the log,
 * so existing error reporting shows up without touching every call site.
 */
export function installConsoleCapture() {
  if (consoleCaptureInstalled) return;
  consoleCaptureInstalled = true;

  for (const level of ['warn', 'error']) {
    const original = console[level];
    console[level] = function (...args) {
      try {
        const first = args[0];
        if (typeof first === 'string' && /^(?:\S+\s+)?\[CC/.test(first)) {
          const detail = args
            .slice(1)
            .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : ''))
            .filter(Boolean)
            .join(' ');
          logActivity('console', `${first} ${detail}`, level);
        }
      } catch {
        // Never let logging break the original call.
      }
      return original.apply(this, args);
    };
  }
}
