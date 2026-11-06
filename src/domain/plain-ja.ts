/** Converts a child prompt (possibly with <ruby>) to the plain text to speak/read. */
export function plainJa(promptJa: string): string {
  return promptJa
    .replace(/<rp>[\s\S]*?<\/rp>/gi, '')
    .replace(/<ruby>([\s\S]*?)<\/ruby>/gi, (_m, inner: string) => {
      // Every <rt> in order (multi-pair ruby), tags inside a reading dropped.
      const readings = [...inner.matchAll(/<rt>([\s\S]*?)<\/rt>/gi)].map((m) => m[1].replace(/<[^>]*>/g, ''));
      return readings.length > 0 ? readings.join('') : inner.replace(/<[^>]*>/g, '');
    })
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
