import { createHash } from 'node:crypto';
import type { Question } from '../src/domain/types';

/** JSON with object keys sorted recursively, so the same content always serialises to the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Short deterministic fingerprint (SHA-256 hex, first 16 chars) of a question's content at review time. */
export function questionHash(q: Question): string {
  return createHash('sha256').update(canonicalJson(q)).digest('hex').slice(0, 16);
}
