import { useRef, useState } from 'preact/hooks';
import type { Store } from '../store/store';
import { applyBackup, backupHasPin, canShareBackup, downloadBackup, parseForRestore, readFileText, shareBackup } from './parent-backup-io';
import type { DashData } from './parent-data';
import { vi } from './parent-strings';
import { Dialog, Section } from './parent-ui';

/** Shared by the Backup section and the storage warning. */
function useDownload(store: Store, say: (m: string) => void) {
  return async () => {
    try {
      await downloadBackup(store);
      say(vi.backup.downloaded);
    } catch {
      say(vi.backup.exportFailed);
    }
  };
}

export function BackupSection({ store, say, reloadApp }: { store: Store; say: (m: string) => void; reloadApp: () => void }) {
  const [pending, setPending] = useState<{ value: unknown; hasPin: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const download = useDownload(store, say);
  const canShare = canShareBackup();
  const share = async () => {
    try {
      if ((await shareBackup(store)) === 'shared') say(vi.backup.shared);
    } catch {
      say(vi.backup.shareFailed);
    }
  };

  const onFile = async (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    setError(null);
    const parsed = parseForRestore(await readFileText(file));
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setPending({ value: parsed.value, hasPin: backupHasPin(parsed.value) });
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    const r = await applyBackup(store, pending.value);
    setBusy(false);
    setPending(null);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setDone(true);
    say(vi.backup.restored);
    setTimeout(reloadApp, 1500);
  };

  return (
    <Section id="backup" title={vi.backup.title}>
      <p class="p-text">{vi.backup.explain}</p>
      <div class="p-row">
        <button type="button" class="p-btn p-btn-primary" data-testid="export" disabled={done} onClick={() => void download()}>
          {vi.backup.download}
        </button>
        {canShare && (
          <button type="button" class="p-btn p-btn-soft" data-testid="share" disabled={done} onClick={() => void share()}>
            {vi.backup.share}
          </button>
        )}
        <button type="button" class="p-btn p-btn-soft" data-testid="import" disabled={done || busy} onClick={() => input.current?.click()}>
          {vi.backup.restore}
        </button>
        <input ref={input} type="file" accept="application/json,.json" class="visually-hidden" tabIndex={-1} data-testid="import-file" onChange={(e) => void onFile(e)} />
      </div>
      <p class="p-error" role="alert" data-testid="import-error">
        {error ?? ''}
      </p>
      {done && (
        <p class="p-text" role="status">
          {vi.backup.restored}
        </p>
      )}
      {pending && (
        <Dialog
          id="restore"
          title={vi.backup.restoreTitle}
          body={vi.backup.restoreBody}
          confirmLabel={vi.backup.restoreYes}
          busy={busy}
          onConfirm={() => void restore()}
          onCancel={() => setPending(null)}
        >
          <p class="p-text">{vi.backup.restoreAll}</p>
          <p class="p-text" data-testid="restore-pin-note">
            {pending.hasPin ? vi.backup.pinFromFile : vi.backup.pinNone}
          </p>
        </Dialog>
      )}
    </Section>
  );
}

export function StorageSection({ store, data, say }: { store: Store; data: DashData; say: (m: string) => void }) {
  const download = useDownload(store, say);
  const bad = !data.health.ok || data.degradedReason !== null;
  const reason = data.health.reason ?? data.degradedReason;
  return (
    <Section id="storage" title={vi.storage.title}>
      {bad ? (
        <div class="p-warn" role="alert" data-testid="storage-warning">
          <p class="p-text">{vi.storage.problem}</p>
          {reason && <p class="p-text p-small">{vi.storage.reason(reason)}</p>}
          <p class="p-text">{vi.storage.advice}</p>
          <button type="button" class="p-btn p-btn-primary" data-testid="export-warning" onClick={() => void download()}>
            {vi.backup.download}
          </button>
        </div>
      ) : (
        <p class="p-text" data-testid="storage-ok">
          {vi.storage.ok}
        </p>
      )}
      {data.persisted !== null && (
        <p class="p-text" data-testid="storage-persisted">
          {data.persisted ? vi.storage.persisted : vi.storage.notPersisted}
        </p>
      )}
    </Section>
  );
}
