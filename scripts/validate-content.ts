import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestion } from '../content/schema';
import type { Question } from '../src/domain/types';
import { buildAll, type Approvals } from './build-content';

export function validateAll(grades: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const [grade, list] of Object.entries(grades)) {
    if (!Array.isArray(list)) {
      problems.push(`grade ${grade}: file must contain an array`);
      continue;
    }
    list.forEach((item, i) => {
      const id = (item as { id?: unknown } | null)?.id;
      const label = `grade ${grade} #${i}${typeof id === 'string' && id ? ` (${id})` : ''}`;
      const r = validateQuestion(item);
      if (!r.ok) {
        for (const e of r.errors) problems.push(`${label}: ${e}`);
        return;
      }
      if (r.q.grade !== grade) problems.push(`${label}: grade ${r.q.grade} does not match file ${grade}.json`);
      if (ids.has(r.q.id)) problems.push(`${label}: duplicate id ${r.q.id}`);
      ids.add(r.q.id);
    });
  }
  return problems;
}

/** Checks approvals.json against the authored content: format, unknown ids, missing hashes, stale approvals. */
export function validateApprovals(grades: Record<string, unknown>, approvals: unknown): string[] {
  if (approvals === null || typeof approvals !== 'object' || Array.isArray(approvals)) {
    return ['approvals.json must be an object { id: { status, hash } }'];
  }
  try {
    buildAll(grades as Record<string, Question[]>, approvals as Approvals);
    return [];
  } catch (e) {
    return [`approvals.json: ${(e as Error).message}`];
  }
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const grades: Record<string, unknown> = {};
  for (const g of ['5', '4']) grades[g] = JSON.parse(readFileSync(resolve(root, `content/authored/${g}.json`), 'utf8'));
  const problems = validateAll(grades);
  const approvalsPath = resolve(root, 'content/approvals.json');
  if (existsSync(approvalsPath) && problems.length === 0) {
    problems.push(...validateApprovals(grades, JSON.parse(readFileSync(approvalsPath, 'utf8'))));
  }
  for (const p of problems) console.error(p);
  console.log(`${problems.length} errors`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
