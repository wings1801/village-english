/**
 * In-memory record of "the app is running without reliable storage", for the
 * parent screen (Task 13) to show. Not persisted: it only describes this page
 * load. The first reason wins; later calls are ignored.
 */
let reason: string | null = null;

export function markDegraded(why: string): void {
  if (reason === null) reason = why;
}

export function getDegraded(): string | null {
  return reason;
}

/** Test seam. */
export function resetDegraded(): void {
  reason = null;
}
