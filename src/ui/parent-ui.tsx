import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { vi } from './parent-strings';

export function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="p-section" aria-labelledby={`sec-${id}`} data-testid={`sec-${id}`}>
      <h2 class="p-h2" id={`sec-${id}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Marks everything outside `el` inert (siblings of it and of each ancestor); returns the undo. */
function inertOthers(el: HTMLElement): () => void {
  const changed: Element[] = [];
  let node: HTMLElement = el;
  while (node.parentElement && node !== document.body) {
    for (const sib of Array.from(node.parentElement.children)) {
      if (sib !== node && !sib.hasAttribute('inert')) {
        sib.setAttribute('inert', '');
        changed.push(sib);
      }
    }
    node = node.parentElement;
  }
  return () => changed.forEach((c) => c.removeAttribute('inert'));
}

/**
 * In-app confirm dialog (never window.confirm). Modal: Escape cancels, Tab is trapped, the background is
 * inert, focus moves in on open and returns to the opener on close.
 */
export function Dialog({
  id,
  title,
  body,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  id: string;
  title: string;
  body?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
  children?: ComponentChildren;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const undo = root.current ? inertOthers(root.current) : () => {};
    first.current?.focus();
    return () => {
      undo();
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (e.key !== 'Tab' || !root.current) return;
    const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === firstEl || !root.current.contains(active))) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && (active === lastEl || !root.current.contains(active))) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  return (
    <div class="p-overlay" ref={root} onKeyDown={onKeyDown}>
      <div class="p-dialog" role="dialog" aria-modal="true" aria-labelledby={`dlg-${id}`} data-testid={`dialog-${id}`}>
        <h2 class="p-h2" id={`dlg-${id}`}>
          {title}
        </h2>
        {body && <p class="p-text">{body}</p>}
        {children}
        <div class="p-row">
          <button type="button" ref={first} class="p-btn p-btn-soft" data-testid="dialog-cancel" disabled={busy} onClick={onCancel}>
            {vi.cancel}
          </button>
          {onConfirm && (
            <button type="button" class="p-btn p-btn-primary" data-testid="dialog-confirm" disabled={busy} onClick={onConfirm}>
              {confirmLabel ?? vi.confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Meter({ label, value, max, extra }: { label: string; value: number; max: number; extra?: number }) {
  const pct = (n: number) => `${max > 0 ? Math.min(100, (n / max) * 100) : 0}%`;
  return (
    <div class="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      {extra !== undefined && <div class="meter-extra" style={{ width: pct(extra) }} />}
      <div class="meter-fill" style={{ width: pct(value) }} />
    </div>
  );
}
