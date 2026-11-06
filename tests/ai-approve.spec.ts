import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { questionHash } from '../content/hash';
import { formatApprovals, parseArgs, planAiApproval } from '../scripts/ai-approve';
import type { Approvals } from '../scripts/build-content';
import type { Question } from '../src/domain/types';

const source = { name: 'Original', license: 'CC0' };
const mkQ = (id: string, over: Partial<Question> = {}): Question => ({
  id, grade: '5', kind: 'pick-picture', promptJa: 'えをえらぼう', imageId: 'apple',
  choices: [{ id: 'a', textEn: 'apple' }, { id: 'b', textEn: 'dog' }, { id: 'c', textEn: 'cat' }], answer: 'a', source, ...over,
});
const q1 = mkQ('q1');
const q2 = mkQ('q2');
const q3 = mkQ('q3', { grade: '4' });
const base = { exclusions: [] as string[], imageExists: () => true, grade: 'all' as const, renewStale: false };
const byGrade = () => ({ '5': [q1, q2], '4': [q3] });

describe('planAiApproval', () => {
  it('approves undecided valid questions with by:"ai"', () => {
    const p = planAiApproval({ ...base, byGrade: byGrade(), approvals: {} });
    expect(Object.keys(p.approve).sort()).toEqual(['q1', 'q2', 'q3']);
    expect(p.approve.q1).toEqual({ status: 'approved', hash: questionHash(q1), by: 'ai' });
  });

  it('never touches parent decisions, approved or rejected', () => {
    const approvals: Approvals = {
      q1: { status: 'approved', hash: questionHash(q1) },
      q2: { status: 'rejected', hash: questionHash(q2) },
    };
    const p = planAiApproval({ ...base, byGrade: byGrade(), approvals });
    expect(Object.keys(p.approve)).toEqual(['q3']);
    expect(p.alreadyDecided).toBe(2);
  });

  it('restricts to --grade', () => {
    const p = planAiApproval({ ...base, grade: '4', byGrade: byGrade(), approvals: {} });
    expect(Object.keys(p.approve)).toEqual(['q3']);
  });

  it('skips excluded ids and lists failed checks with reasons', () => {
    const bad = mkQ('bad', { answer: 'zz' });
    const p = planAiApproval({ ...base, exclusions: ['q2'], byGrade: { '5': [q1, q2, bad], '4': [] }, approvals: {} });
    expect(Object.keys(p.approve)).toEqual(['q1']);
    expect(p.excluded).toEqual(['q2']);
    expect(p.failed[0].id).toBe('bad');
    expect(p.failed[0].reasons.length).toBeGreaterThan(0);
  });

  it('reports stale entries; renews only stale AI entries with --renew-stale; never a stale parent entry', () => {
    const edited = { ...q1, promptJa: 'ちがう' };
    const approvals: Approvals = {
      q1: { status: 'approved', hash: 'old', by: 'ai' },
      q2: { status: 'approved', hash: 'old' },
    };
    const input = { ...base, byGrade: { '5': [edited, q2], '4': [] }, approvals };
    const off = planAiApproval(input);
    expect(off.approve).toEqual({});
    expect(off.staleAi).toEqual(['q1']);
    expect(off.staleParent).toEqual(['q2']);
    const on = planAiApproval({ ...input, renewStale: true });
    expect(on.approve).toEqual({ q1: { status: 'approved', hash: questionHash(edited), by: 'ai' } });
    expect(on.staleParent).toEqual(['q2']);
  });

  it('does not renew a stale AI entry that now fails checks', () => {
    const bad = mkQ('q1', { answer: 'zz' });
    const p = planAiApproval({
      ...base,
      renewStale: true,
      byGrade: { '5': [bad], '4': [] },
      approvals: { q1: { status: 'approved', hash: 'old', by: 'ai' } },
    });
    expect(p.approve).toEqual({});
    expect(p.failed.map((f) => f.id)).toEqual(['q1']);
  });
});

describe('formatApprovals / parseArgs', () => {
  it('sorts keys, 2-space indent, trailing newline', () => {
    const out = formatApprovals({ b: { status: 'approved', hash: 'h' }, a: { status: 'approved', hash: 'h', by: 'ai' } });
    expect(out).toBe(
      '{\n  "a": {\n    "status": "approved",\n    "hash": "h",\n    "by": "ai"\n  },\n  "b": {\n    "status": "approved",\n    "hash": "h"\n  }\n}\n',
    );
  });
  it('parses flags; default is a dry run', () => {
    expect(parseArgs([])).toEqual({ grade: 'all', write: false, renewStale: false });
    expect(parseArgs(['--grade', '5', '--write', '--renew-stale'])).toEqual({ grade: '5', write: true, renewStale: true });
    expect(() => parseArgs(['--grade', '3'])).toThrow(/grade/);
    expect(() => parseArgs(['--bogus'])).toThrow(/bogus/);
  });
});

describe('ai-approve-exclusions.json', () => {
  it('lists only ids that exist in the authored data and includes the known-risky ones', () => {
    const ex = JSON.parse(readFileSync('content/ai-approve-exclusions.json', 'utf8')) as { ids: string[]; note: string };
    const authored = [
      ...JSON.parse(readFileSync('content/authored/5.json', 'utf8')),
      ...JSON.parse(readFileSync('content/authored/4.json', 'utf8')),
    ] as Question[];
    const ids = new Set(authored.map((q) => q.id));
    expect(typeof ex.note).toBe('string');
    for (const id of ex.ids) expect(ids.has(id), id).toBe(true);
    expect(new Set(ex.ids).size).toBe(ex.ids.length);
    for (const id of [
      'g4-dialogue-choice-036', 'g5-listen-pick-037', 'g5-listen-pick-045', 'g5-pick-word-029',
      'g4-pick-word-029', 'g4-letter-tiles-017', 'g5-pick-picture-026',
    ]) {
      expect(ex.ids).toContain(id);
    }
  });
});
