import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackupText, serializeBackup, stripPin } from '../src/domain/backup-file';
import type { BackupV1 } from '../src/domain/types';

const backup: BackupV1 = {
  version: 1, exportedAt: 'x', progress: [], bells: 3, owned: [], placed: [],
  day: { dateKey: '2026-11-07', playSeconds: 1 }, daysLog: [],
  settings: { dailyLimitSeconds: 600, pinHash: 'h', pinSalt: 's', currentGrade: '4' },
};

describe('backupFileName', () => {
  it('uses the LOCAL date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('village-english-backup-2026-01-05.json');
    expect(backupFileName(new Date(2026, 10, 7, 0, 1))).toBe('village-english-backup-2026-11-07.json');
  });
});

describe('serializeBackup', () => {
  it('is 2-space JSON with a trailing newline that round-trips', () => {
    const t = serializeBackup(backup);
    expect(t.endsWith('}\n')).toBe(true);
    expect(t).toContain('\n  "version": 1');
    expect(JSON.parse(t)).toEqual(backup);
  });
});

describe('parseBackupText', () => {
  it('parses JSON', () => {
    expect(parseBackupText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseBackupText(' null ')).toEqual({ ok: true, value: null });
  });
  it('rejects empty / whitespace', () => {
    expect(parseBackupText('')).toEqual({ ok: false, error: 'empty' });
    expect(parseBackupText(' \n\t ')).toEqual({ ok: false, error: 'empty' });
  });
  it('rejects non-JSON without throwing', () => {
    expect(parseBackupText('{nope')).toEqual({ ok: false, error: 'not-json' });
  });
  it('rejects text over 5 MB', () => {
    expect(parseBackupText('1' + ' '.repeat(5 * 1024 * 1024))).toEqual({ ok: false, error: 'too-large' });
    expect(parseBackupText('"' + 'a'.repeat(5 * 1024 * 1024) + '"')).toEqual({ ok: false, error: 'too-large' });
  });
  it('accepts exactly 5 MB', () => {
    const t = '"' + 'a'.repeat(5 * 1024 * 1024 - 2) + '"';
    expect(parseBackupText(t).ok).toBe(true);
  });
});

describe('stripPin', () => {
  it('removes pinHash and pinSalt only, without mutating', () => {
    const out = stripPin(backup) as BackupV1;
    expect(out.settings).toEqual({ dailyLimitSeconds: 600, currentGrade: '4' });
    expect('pinHash' in out.settings).toBe(false);
    expect(out.bells).toBe(3);
    expect(backup.settings.pinHash).toBe('h');
  });
  it('returns non-backups unchanged', () => {
    for (const v of [null, 5, 'x', [1], {}, { settings: 3 }, { settings: null }, { settings: [1] }]) {
      expect(stripPin(v)).toBe(v);
    }
  });
});

describe('BOM', () => {
  it('strips a leading BOM before the empty check and parse', () => {
    expect(parseBackupText('﻿{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseBackupText('﻿')).toEqual({ ok: false, error: 'empty' });
    expect(parseBackupText('﻿  \n')).toEqual({ ok: false, error: 'empty' });
  });
});
