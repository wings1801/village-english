import { GRADES } from '../src/domain/grades';
import type { Question, QuestionKind } from '../src/domain/types';

const KINDS: readonly string[] = ['pick-picture', 'listen-pick', 'letter-tiles', 'pick-word', 'dialogue-choice'];

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const countBlanks = (s: string) => s.split('___').length - 1;

const HAN = /\p{Script=Han}/u;

/** Returns an error message, or null when promptJa is OK. Han is allowed only in ruby base text. */
function checkRuby(text: string): string | null {
  let problem: string | null = null;
  const rest = text.replace(/<ruby>([\s\S]*?)<\/ruby>/g, (_m, inner: string) => {
    const noRp = inner.replace(/<rp>[^<]*<\/rp>/g, '');
    let rtCount = 0;
    const base = noRp.replace(/<rt>([^<]*)<\/rt>/g, (_n, rt: string) => {
      rtCount++;
      if (rt.trim() === '') problem ??= 'empty <rt> in <ruby>';
      else if (HAN.test(rt)) problem ??= 'kanji inside <rt> (use kana only)';
      return '';
    });
    if (rtCount === 0) problem ??= '<ruby> needs an <rt> reading';
    if (/[<>]/.test(base)) problem ??= 'malformed <ruby> markup';
    return '';
  });
  if (problem) return problem;
  if (/<\/?(ruby|rt|rp)/.test(rest)) return 'unbalanced <ruby>/<rt>/<rp> markup';
  if (HAN.test(rest)) return 'kanji outside <ruby> markup (use hiragana/katakana or wrap in <ruby>)';
  return null;
}

type Result = { ok: true; q: Question } | { ok: false; errors: string[] };

export function validateQuestion(input: unknown): Result {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['question: must be an object'] };
  }
  const q = input as Record<string, unknown>;
  const errors: string[] = [];

  if (!isStr(q.id)) errors.push('id: must be a non-empty string');
  if (typeof q.grade !== 'string' || !(GRADES as readonly string[]).includes(q.grade)) errors.push(`grade: must be one of ${GRADES.join(', ')}`);
  const kindOk = typeof q.kind === 'string' && KINDS.includes(q.kind);
  if (!kindOk) errors.push(`kind: must be one of ${KINDS.join(', ')}`);

  if (!isStr(q.promptJa)) {
    errors.push('promptJa: must be a non-empty string');
  } else {
    const e = checkRuby(q.promptJa);
    if (e) errors.push(`promptJa: ${e}`);
  }

  const src = q.source as Record<string, unknown> | null | undefined;
  if (typeof src !== 'object' || src === null || Array.isArray(src)) {
    errors.push('source: must be an object with name and license');
  } else {
    if (!isStr(src.name)) errors.push('source.name: must be a non-empty string');
    if (!isStr(src.license)) errors.push('source.license: must be a non-empty string');
  }

  if (!isStr(q.answer)) errors.push('answer: must be a non-empty string');

  if (kindOk) {
    const answer = isStr(q.answer) ? q.answer : undefined;
    const promptEn = typeof q.promptEn === 'string' ? q.promptEn : undefined;

    const checkChoices = () => {
      const c = q.choices;
      if (!Array.isArray(c) || c.length < 3) {
        errors.push('choices: need at least 3 choices');
        return;
      }
      const ids: string[] = [];
      for (const x of c) {
        const cc = x as { textEn?: unknown; imageId?: unknown } | null;
        if (!isStr(cc?.textEn) && !isStr(cc?.imageId)) {
          errors.push('choices: every choice needs textEn or imageId');
          return;
        }
        const id = (x as { id?: unknown } | null)?.id;
        if (!isStr(id)) {
          errors.push('choices: every choice needs a non-empty id');
          return;
        }
        ids.push(id);
      }
      if (new Set(ids).size !== ids.length) errors.push('choices: ids must be unique');
      if (answer !== undefined && !ids.includes(answer)) errors.push('answer: must equal one of the choice ids');
    };

    switch (q.kind as QuestionKind) {
      case 'pick-picture':
        if (!isStr(q.imageId)) errors.push('imageId: required for pick-picture');
        checkChoices();
        break;
      case 'listen-pick':
        if (!isStr(q.speakEn)) errors.push('speakEn: required for listen-pick');
        checkChoices();
        break;
      case 'letter-tiles':
        if (answer !== undefined && !/^[a-z]{2,12}$/.test(answer)) {
          errors.push('answer: letter-tiles answer must be 2-12 lowercase letters a-z');
        }
        if (!isStr(q.imageId) && !isStr(q.promptEn)) errors.push('imageId: letter-tiles needs imageId or promptEn');
        break;
      case 'pick-word':
        if (promptEn === undefined || countBlanks(promptEn) !== 1) {
          errors.push('promptEn: pick-word needs promptEn with exactly one ___ blank');
        }
        checkChoices();
        break;
      case 'dialogue-choice':
        if (
          promptEn === undefined ||
          promptEn.split('\n').filter((l) => l.trim() !== '').length < 2 ||
          countBlanks(promptEn) !== 1
        ) {
          errors.push('promptEn: dialogue-choice needs at least two lines (\\n) and exactly one ___ blank');
        }
        checkChoices();
        break;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, q: input as Question };
}
