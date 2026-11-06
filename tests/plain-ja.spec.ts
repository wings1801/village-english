import { describe, expect, it } from 'vitest';
import { plainJa } from '../src/domain/plain-ja';

describe('plainJa', () => {
  it('leaves plain text unchanged', () => {
    expect(plainJa('えをえらぼう')).toBe('えをえらぼう');
  });
  it('uses the kana of ruby', () => {
    expect(plainJa('<ruby>犬<rt>いぬ</rt></ruby>をえらぼう')).toBe('いぬをえらぼう');
  });
  it('drops rp', () => {
    expect(plainJa('<ruby>犬<rp>(</rp><rt>いぬ</rt><rp>)</rp></ruby>をえらぼう')).toBe('いぬをえらぼう');
  });
  it('handles multiple ruby segments', () => {
    expect(plainJa('<ruby>猫<rt>ねこ</rt></ruby>と<ruby>犬<rt>いぬ</rt></ruby>')).toBe('ねこといぬ');
  });
  it('strips other tags and collapses whitespace', () => {
    expect(plainJa('<b>きいて</b>  \n えらぼう')).toBe('きいて えらぼう');
  });
  it('joins every reading of a multi-pair ruby', () => {
    expect(plainJa('<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>をよもう')).toBe('かんじをよもう');
  });
  it('multi-pair with rp', () => {
    expect(plainJa('<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字<rp>(</rp><rt>じ</rt><rp>)</rp></ruby>')).toBe('かんじ');
  });
  it('keeps surrounding plain text and tags inside readings are dropped', () => {
    expect(plainJa('これは<ruby>犬<rt>い<b>ぬ</b></rt></ruby>だ')).toBe('これはいぬだ');
  });
});
