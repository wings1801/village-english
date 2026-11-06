import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkQuestion } from '../content/ai-checks';
import { questionHash } from '../content/hash';
import type { Question } from '../src/domain/types';
import type { Approval, Approvals } from './build-content';

/**
 * Optional "AI approval": questions that nobody has decided yet and that pass every automated check get
 * { status: "approved", hash, by: "ai" }. Parent decisions (approved or rejected) are never touched.
 * Default is a DRY RUN. This script never runs build-content.
 */
export interface Args {
  grade: '5' | '4' | 'all';
  write: boolean;
  renewStale: boolean;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { grade: 'all', write: false, renewStale: false };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--write') a.write = true;
    else if (f === '--renew-stale') a.renewStale = true;
    else if (f === '--grade') {
      const v = argv[++i];
      if (v !== '5' && v !== '4' && v !== 'all') throw new Error(`--grade must be 5, 4 or all (got ${v})`);
      a.grade = v;
    } else throw new Error(`Unknown flag: ${f} (use --grade 5|4|all, --write, --renew-stale)`);
  }
  return a;
}

export interface PlanInput {
  byGrade: Record<string, Question[]>;
  approvals: Approvals;
  exclusions: string[];
  imageExists: (imageId: string) => boolean;
  grade: Args['grade'];
  renewStale: boolean;
}

export interface Plan {
  /** New or renewed entries (all by "ai"). */
  approve: Record<string, Approval>;
  excluded: string[];
  failed: { id: string; reasons: string[] }[];
  /** Stale approved entries made by the AI / by the parent (a stale parent entry is only ever reported). */
  staleAi: string[];
  staleParent: string[];
  alreadyDecided: number;
  perGrade: Record<string, { approve: number; excluded: number; failed: number }>;
}

export function planAiApproval(input: PlanInput): Plan {
  const plan: Plan = { approve: {}, excluded: [], failed: [], staleAi: [], staleParent: [], alreadyDecided: 0, perGrade: {} };
  const excl = new Set(input.exclusions);
  for (const [grade, list] of Object.entries(input.byGrade)) {
    if (input.grade !== 'all' && input.grade !== grade) continue;
    const g = (plan.perGrade[grade] = { approve: 0, excluded: 0, failed: 0 });
    for (const q of list) {
      const entry = input.approvals[q.id];
      if (entry) {
        const stale = entry.status === 'approved' && entry.hash !== questionHash(q);
        if (!stale) {
          plan.alreadyDecided++;
          continue;
        }
        if (entry.by === 'ai') plan.staleAi.push(q.id);
        else {
          plan.staleParent.push(q.id); // a parent decision: report only
          continue;
        }
        if (!input.renewStale) continue;
      }
      if (excl.has(q.id)) {
        plan.excluded.push(q.id);
        g.excluded++;
        continue;
      }
      const reasons = checkQuestion(q, { imageExists: input.imageExists });
      if (reasons.length) {
        plan.failed.push({ id: q.id, reasons });
        g.failed++;
        continue;
      }
      plan.approve[q.id] = { status: 'approved', hash: questionHash(q), by: 'ai' };
      g.approve++;
    }
  }
  return plan;
}

/** Stable output: sorted ids, 2-space indent, trailing newline; per entry status, hash, by. */
export function formatApprovals(approvals: Approvals): string {
  const out: Record<string, Approval> = {};
  for (const id of Object.keys(approvals).sort()) {
    const e = approvals[id];
    const o: Approval = { status: e.status };
    if (e.hash !== undefined) o.hash = e.hash;
    if (e.by !== undefined) o.by = e.by;
    out[id] = o;
  }
  return JSON.stringify(out, null, 2) + '\n';
}

function topReasons(failed: Plan['failed'], n = 5): [string, number][] {
  const counts = new Map<string, number>();
  for (const f of failed) for (const r of f.reasons) counts.set(r.replace(/"[^"]*"/g, '"…"'), (counts.get(r.replace(/"[^"]*"/g, '"…"')) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const approvalsPath = resolve(root, 'content/approvals.json');
  const approvals: Approvals = existsSync(approvalsPath) ? JSON.parse(readFileSync(approvalsPath, 'utf8')) : {};
  const byGrade: Record<string, Question[]> = {};
  for (const g of ['5', '4']) byGrade[g] = JSON.parse(readFileSync(resolve(root, `content/authored/${g}.json`), 'utf8'));
  const exclusions = (JSON.parse(readFileSync(resolve(root, 'content/ai-approve-exclusions.json'), 'utf8')) as { ids: string[] }).ids;
  const plan = planAiApproval({
    byGrade,
    approvals,
    exclusions,
    imageExists: (id) => existsSync(resolve(root, `public/assets/emoji/${id}.svg`)),
    grade: args.grade,
    renewStale: args.renewStale,
  });

  console.log(`ai-approve (${args.write ? 'WRITE' : 'DRY RUN'}) grade=${args.grade} renew-stale=${args.renewStale}`);
  for (const [g, c] of Object.entries(plan.perGrade)) {
    console.log(`  grade ${g}: would approve ${c.approve}, excluded ${c.excluded}, failed checks ${c.failed}`);
  }
  console.log(`  already decided (left alone): ${plan.alreadyDecided}`);
  if (plan.staleParent.length) console.log(`  stale PARENT approvals (never auto-renewed, review again): ${plan.staleParent.join(', ')}`);
  if (plan.staleAi.length) console.log(`  stale AI approvals: ${plan.staleAi.length}${args.renewStale ? ' (renewed where checks pass)' : ' (use --renew-stale to renew)'}`);
  for (const f of plan.failed) console.log(`  FAILED ${f.id}: ${f.reasons.join('; ')}`);
  const top = topReasons(plan.failed);
  if (top.length) console.log(`  top failure reasons: ${top.map(([r, n]) => `${r} x${n}`).join(' | ')}`);

  const count = Object.keys(plan.approve).length;
  if (!args.write) {
    console.log(`Dry run: nothing written. ${count} question(s) would be AI-approved. Re-run with "-- --write" to save, then run npm run build-content.`);
    return;
  }
  writeFileSync(approvalsPath, formatApprovals({ ...approvals, ...plan.approve }));
  console.log(`Wrote content/approvals.json: ${count} AI-approved entr${count === 1 ? 'y' : 'ies'} added. Now run npm run build-content.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
