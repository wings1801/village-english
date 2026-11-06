import { backupFileName, parseBackupText, serializeBackup } from '../domain/backup-file';
import { validateBackupShape, type Store } from '../store/store';
import { vi } from './parent-strings';

export type Parsed = { ok: true; value: unknown } | { ok: false; message: string };
export type Applied = { ok: true } | { ok: false; message: string };

/** Reads a chosen file as text. Resolves null when the browser cannot read it. */
export async function readFileText(file: File): Promise<string | null> {
  try {
    if (typeof file.text === 'function') return await file.text();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  } catch {
    return null;
  }
}

/** File text to a JSON value, or a Vietnamese error message. Nothing is written here. */
export function parseForRestore(text: string | null): Parsed {
  if (text === null) return { ok: false, message: vi.backup.errRead };
  const p = parseBackupText(text);
  if (p.ok) {
    const shape = validateBackupShape(p.value); // cheap pre-check: no confirm dialog for a file that cannot be restored
    return shape.ok ? p : { ok: false, message: vi.backup.errInvalid(shape.reason) };
  }
  const message = p.error === 'empty' ? vi.backup.errEmpty : p.error === 'too-large' ? vi.backup.errTooLarge : vi.backup.errNotJson;
  return { ok: false, message };
}

/** store.importAll with errors mapped to Vietnamese. importAll validates before writing, so a failure changes nothing. */
export async function applyBackup(store: Store, value: unknown): Promise<Applied> {
  try {
    await store.importAll(value);
    return { ok: true };
  } catch (e) {
    const m = e instanceof Error ? /^invalid backup:\s*(.*)$/.exec(e.message) : null;
    return { ok: false, message: m ? vi.backup.errInvalid(m[1]) : vi.backup.errOther };
  }
}

/** Does the (already shape-checked) backup carry a PIN? */
export function backupHasPin(value: unknown): boolean {
  const settings = (value as { settings?: { pinHash?: unknown; pinSalt?: unknown } } | null)?.settings;
  return typeof settings?.pinHash === 'string' && settings.pinHash !== '' && typeof settings.pinSalt === 'string';
}

async function backupText(store: Store): Promise<string> {
  return serializeBackup(await store.exportAll());
}

/** Triggers a browser download of the full backup through a temporary link. */
export async function downloadBackup(store: Store, now: Date = new Date()): Promise<void> {
  const url = URL.createObjectURL(new Blob([await backupText(store)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(now);
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function probeFile(now: Date): File {
  return new File(['{}'], backupFileName(now), { type: 'application/json' });
}

/** True when the browser can share files (iOS share sheet: "Save to Files"). Feature-detected, never throws. */
export function canShareBackup(now: Date = new Date()): boolean {
  try {
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [probeFile(now)] }) === true;
  } catch {
    return false;
  }
}

/** Opens the share sheet with the backup file. Resolves 'cancelled' when the user dismisses it (not an error). */
export async function shareBackup(store: Store, now: Date = new Date()): Promise<'shared' | 'cancelled'> {
  const file = new File([await backupText(store)], backupFileName(now), { type: 'application/json' });
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}
