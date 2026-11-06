import type { BackupV1 } from './types';

const MAX_BYTES = 5 * 1024 * 1024;

const pad = (n: number) => String(n).padStart(2, '0');

/** `village-english-backup-YYYY-MM-DD.json` using the LOCAL date. */
export function backupFileName(now: Date): string {
  return `village-english-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function serializeBackup(b: BackupV1): string {
  return JSON.stringify(b, null, 2) + '\n';
}

/** Parses backup file text. Never throws; shape validation is store.importAll's job. */
export function parseBackupText(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: 'empty' | 'too-large' | 'not-json' } {
  if (typeof text === 'string' && text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'empty' };
  // length is UTF-16 units; use the byte size only when it could matter (non-ASCII)
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).length > MAX_BYTES)
    return { ok: false, error: 'too-large' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'not-json' };
  }
}

/** Shallow clone of a backup without settings.pinHash / settings.pinSalt (forgotten-PIN recovery). */
export function stripPin(b: unknown): unknown {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return b;
  const o = b as Record<string, unknown>;
  const s = o.settings;
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return b;
  const { pinHash: _h, pinSalt: _s, ...rest } = s as Record<string, unknown>;
  return { ...o, settings: rest };
}
