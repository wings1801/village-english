import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionHash } from '../content/hash';
import { validateQuestion } from '../content/schema';
import type { Question } from '../src/domain/types';

/**
 * id -> decision. `hash` is questionHash() of the question as the parent saw it; an approval whose hash no longer
 * matches (the question was edited afterwards) is stale and stops the build. Rejected entries may omit the hash.
 */
export type Approval = { status: 'approved' | 'rejected'; hash?: string; by?: 'parent' | 'ai' };
export type Approvals = Record<string, Approval>;

function checkEntry(id: string, entry: unknown): Approval {
  const e = entry as Partial<Approval> | null;
  const status = e && typeof e === 'object' ? e.status : undefined;
  if (status !== 'approved' && status !== 'rejected') {
    throw new Error(
      `Invalid approvals value for ${id}: ${JSON.stringify(entry)} (use { "status": "approved" | "rejected", "hash": "..." }; download approvals.json again from the review page)`,
    );
  }
  if (e!.by !== undefined && e!.by !== 'parent' && e!.by !== 'ai') {
    throw new Error(`Invalid approvals value for ${id}: by must be "parent" or "ai" (or absent), got ${JSON.stringify(e!.by)}`);
  }
  return e as Approval;
}

function checkFresh(q: Question, entry: Approval): void {
  if (typeof entry.hash !== 'string' || entry.hash === '') {
    throw new Error(`approval for ${q.id} has no hash: review it again with the review page (npm run build-review)`);
  }
  if (entry.hash !== questionHash(q)) {
    throw new Error(`stale approval for ${q.id}: the question changed after it was approved — review it again`);
  }
}

export function buildContent(authored: Question[], approvals: Approvals): Question[] {
  const seen = new Set<string>();
  for (const q of authored) {
    if (seen.has(q.id)) throw new Error(`Duplicate question id in authored content: ${q.id}`);
    seen.add(q.id);
  }
  for (const [id, raw] of Object.entries(approvals)) {
    const entry = checkEntry(id, raw);
    if (entry.status === 'approved' && !seen.has(id)) throw new Error(`Approved id not found in authored content: ${id}`);
  }
  const out = authored.filter((q) => approvals[q.id]?.status === 'approved');
  for (const q of out) checkFresh(q, approvals[q.id]);
  return out;
}

/** Validates and builds every grade; throws before anything is written. */
export function buildAll(byGrade: Record<string, Question[]>, approvals: Approvals): Record<string, Question[]> {
  const owner = new Map<string, string>();
  for (const [grade, list] of Object.entries(byGrade)) {
    for (const q of list) {
      if (owner.has(q.id)) throw new Error(`Duplicate question id across grade files: ${q.id}`);
      owner.set(q.id, grade);
    }
  }
  for (const [id, raw] of Object.entries(approvals)) {
    const entry = checkEntry(id, raw);
    if (entry.status === 'approved' && !owner.has(id)) throw new Error(`Approved id not found in authored content: ${id}`);
  }
  const out: Record<string, Question[]> = {};
  for (const [grade, authored] of Object.entries(byGrade)) {
    const ids = new Set(authored.map((q) => q.id));
    const own = Object.fromEntries(Object.entries(approvals).filter(([id]) => ids.has(id))) as Approvals;
    out[grade] = buildContent(authored, own);
    for (const q of out[grade]) {
      const r = validateQuestion(q);
      if (!r.ok) throw new Error(`Approved question ${q.id} is invalid: ${r.errors.join('; ')}`);
      if (q.grade !== grade) throw new Error(`Approved question ${q.id} has grade ${q.grade} but is in ${grade}.json`);
    }
  }
  return out;
}

export type ApprovalSummary = Record<string, { parent: number; ai: number; total: number }>;

/** Per grade: authored total and how many shipped (approved) questions were approved by the parent vs by the AI option. */
export function approvalSummary(
  byGrade: Record<string, Question[]>,
  built: Record<string, Question[]>,
  approvals: Approvals,
): ApprovalSummary {
  const out: ApprovalSummary = {};
  for (const [grade, authored] of Object.entries(byGrade)) {
    const shipped = built[grade] ?? [];
    const ai = shipped.filter((q) => approvals[q.id]?.by === 'ai').length;
    out[grade] = { parent: shipped.length - ai, ai, total: authored.length };
  }
  return out;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const approvalsPath = resolve(root, 'content/approvals.json');
  const approvals: Approvals = existsSync(approvalsPath) ? JSON.parse(readFileSync(approvalsPath, 'utf8')) : {};
  const byGrade: Record<string, Question[]> = {};
  for (const grade of ['5', '4']) {
    byGrade[grade] = JSON.parse(readFileSync(resolve(root, `content/authored/${grade}.json`), 'utf8'));
  }
  const built = buildAll(byGrade, approvals);
  mkdirSync(resolve(root, 'public/content'), { recursive: true });
  for (const [grade, out] of Object.entries(built)) {
    writeFileSync(resolve(root, `public/content/${grade}.json`), JSON.stringify(out, null, 2) + '\n');
    console.log(`grade ${grade}: ${out.length} approved of ${byGrade[grade].length}`);
  }
  const summary = approvalSummary(byGrade, built, approvals);
  writeFileSync(resolve(root, 'public/content/approval-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`approval summary: ${JSON.stringify(summary)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
