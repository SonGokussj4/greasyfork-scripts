const path = require('path');
const { pathToFileURL } = require('url');

let log;
let modal;

beforeAll(async () => {
  log = await import(pathToFileURL(path.resolve(__dirname, '../src/activity-log.js')).href);
  modal = await import(pathToFileURL(path.resolve(__dirname, '../src/activity-log-modal.js')).href);
});

beforeEach(() => {
  localStorage.clear();
});

describe('activity log', () => {
  test('records entries in order and keeps only the newest ones', () => {
    for (let i = 0; i < log.ACTIVITY_LOG_MAX_ENTRIES + 5; i += 1) log.logActivity('test', `entry ${i}`);
    const entries = log.getActivityLog();
    expect(entries).toHaveLength(log.ACTIVITY_LOG_MAX_ENTRIES);
    expect(entries[0].msg).toBe('entry 5');
    expect(entries.at(-1).msg).toBe(`entry ${log.ACTIVITY_LOG_MAX_ENTRIES + 4}`);
  });

  test('truncates long messages and survives corrupt storage', () => {
    log.logActivity('test', 'word '.repeat(200));
    expect(log.getActivityLog()[0].msg).toHaveLength(300);

    localStorage.setItem('cc_activity_log_v1', '{broken');
    expect(log.getActivityLog()).toEqual([]);
    expect(() => log.logActivity('test', 'still works')).not.toThrow();
  });

  test('clear empties the log and text export has one line per entry', () => {
    log.logActivity('ratings', 'started');
    log.logActivity('sync', 'failed', 'error');
    const text = log.formatActivityLogText();
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('ERROR [sync] failed');

    log.clearActivityLog();
    expect(log.getActivityLog()).toEqual([]);
  });

  test('console capture mirrors only [CC-tagged warnings and errors', () => {
    const origWarn = console.warn;
    const origError = console.error;
    console.warn = jest.fn();
    console.error = jest.fn();
    try {
      log.resetConsoleCaptureForTests();
      log.installConsoleCapture();
      console.error('[CC] Ratings loader failed:', new Error('boom'));
      console.log('unrelated');
      console.error('☁️ [CC Sync] Failed:', new Error('sync boom'));
      console.warn('some unrelated warning');
      const entries = log.getActivityLog();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ level: 'error', area: 'console' });
      expect(entries[0].msg).toContain('boom');
      expect(entries[1].msg).toContain('sync boom');
    } finally {
      console.warn = origWarn;
      console.error = origError;
    }
  });
});

describe('activity log privacy and noise', () => {
  test('strips urls and token-like strings', () => {
    log.logActivity('sync', 'failed at https://x.supabase.co/rest/v1/t?key=abc with sbp_1234567890abcdefghijklmnop');
    const msg = log.getActivityLog()[0].msg;
    expect(msg).not.toContain('supabase');
    expect(msg).not.toContain('sbp_1234567890');
    expect(msg).toContain('[url]');
  });

  test('keeps long setting names readable', () => {
    log.logActivity('settings', 'cc_show_ratings_in_foreign_reviews on');
    expect(log.getActivityLog()[0].msg).toBe('cc_show_ratings_in_foreign_reviews on');
  });

  test('collapses immediate repeats of the same message', () => {
    log.logActivity('hover', 'blocked', 'warn');
    log.logActivity('hover', 'blocked', 'warn');
    log.logActivity('hover', 'other', 'warn');
    expect(log.getActivityLog()).toHaveLength(2);
  });
});

describe('activity log modal', () => {
  test('uses Czech plural forms for the entry count', () => {
    expect(modal.describeEntryCount(1)).toBe('1 záznam');
    expect(modal.describeEntryCount(3)).toBe('3 záznamy');
    expect(modal.describeEntryCount(7)).toBe('7 záznamů');
  });

  test('renders newest first and escapes HTML', () => {
    const html = modal.renderActivityLogHtml([
      { t: 1, level: 'info', area: 'a', msg: 'first' },
      { t: 2, level: 'error', area: 'b', msg: '<img src=x onerror=alert(1)>' },
    ]);
    expect(html.indexOf('&lt;img')).toBeLessThan(html.indexOf('first'));
    expect(html).not.toContain('<img');
  });

  test('empty log shows a hint; clear button reopens an empty modal', () => {
    log.logActivity('x', 'one');
    const opened = [];
    const openInfoModal = ({ html }) => {
      document.body.innerHTML = html;
      opened.push(html);
      return document.body;
    };
    modal.openActivityLogModal(openInfoModal);
    document.querySelector('[data-cc-log-clear]').click();
    expect(opened).toHaveLength(2);
    expect(opened[1]).toContain('Zatím nic nezaznamenáno');
  });
});
